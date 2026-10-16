// BL-SCAN-01A+B: immutable originals and scan sessions only. No receiving/OCR API.
const MAX_BYTES = 1800000;
const fail = (message, status) => Object.assign(new Error(message), {status});
const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'}});
const scanJson = row => ({id: row.id, orderId: row.order_id, documentId: row.document_id, checksumSha256: row.checksum_sha256, status: row.status, createdAt: row.created_at, originalName: row.original_name, contentType: row.content_type, byteSize: Number(row.byte_size)});
const scanQuery = 'SELECT s.*,d.original_name,d.content_type,d.byte_size FROM field_delivery_scans s JOIN secure_documents d ON d.organization_id=s.organization_id AND d.id=s.document_id';

async function orderAccess(env, ctx, orderId, hooks, upload = false) {
  if (ctx.roleCode === 'WORKER') throw fail('Accès aux bons de livraison refusé.', 403);
  await hooks.requirePermission(env, ctx, 'purchase_orders.view');
  if (upload) await hooks.requirePermission(env, ctx, 'deliveries.receive');
  const state = await hooks.organizationWorkspaceState(env, ctx.organizationId);
  const order = (state?.purchaseOrders || []).find(item => String(item.id) === String(orderId));
  if (!order) throw fail('Commande fournisseur introuvable.', 404);
  const projectId = order.job && String(order.job) !== '0' ? String(order.job) : null;
  if (projectId) {
    if (!(state.jobs || []).some(item => String(item.id) === projectId)) throw fail('Chantier introuvable.', 404);
    await (upload ? hooks.requireProjectScope : hooks.requireFinanceProjectScope)(env, ctx, projectId);
  }
  if (upload && ['annulée', 'cancelled'].includes(String(order.status))) throw fail('Commande annulée.', 409);
  return {order, projectId};
}

// Used by every generic document read path so broad Documents rights cannot
// bypass the narrower purchase-order scope. null means an unrelated document.
export async function deliveryScanDocumentAccess(env, ctx, documentId, hooks) {
  const scan = await env.DB.prepare('SELECT order_id FROM field_delivery_scans WHERE organization_id=? AND document_id=?').bind(ctx.organizationId, documentId).first();
  if (!scan) return null;
  try {await orderAccess(env, ctx, scan.order_id, hooks); return true;}
  catch (error) {if ([403, 404].includes(error.status)) return false; throw error;}
}

async function uploadForm(request) {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) throw fail('Format attendu : multipart/form-data.', 415);
  if (Number(request.headers.get('content-length') || 0) > MAX_BYTES + 100000) throw fail('Fichier trop volumineux.', 413);
  // Bound streamed bodies too: Content-Length is optional and untrusted.
  const chunks = []; let length = 0;
  const reader = request.body?.getReader();
  if (!reader) throw fail('Fichier obligatoire.', 400);
  while (true) {
    const {done, value} = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > MAX_BYTES + 100000) {await reader.cancel(); throw fail('Fichier trop volumineux.', 413);}
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
  let form;
  try {form = await new Response(bytes, {headers: {'content-type': request.headers.get('content-type')}}).formData();}
  catch {throw fail('Import de fichier illisible.', 400);}
  for (const key of form.keys()) if (!['file', 'operationKey'].includes(key) || form.getAll(key).length !== 1) throw fail('Champ d’upload non autorisé.', 400);
  return form;
}

export async function deliveryScanRoute(request, env, ctx, orderId, scanId, original, hooks) {
  if (!['GET', 'POST'].includes(request.method) || request.method === 'POST' && scanId) return json({error: 'Méthode non autorisée.'}, 405);
  const upload = request.method === 'POST';
  const {order, projectId} = await orderAccess(env, ctx, orderId, hooks, upload);
  const findScan = () => env.DB.prepare(scanQuery + ' WHERE s.organization_id=? AND s.order_id=? AND s.id=?').bind(ctx.organizationId, orderId, scanId).first();
  if (!upload) {
    if (!scanId) {
      const result = await env.DB.prepare(scanQuery + ' WHERE s.organization_id=? AND s.order_id=? ORDER BY s.created_at DESC,s.id LIMIT 100').bind(ctx.organizationId, orderId).all();
      const canUpload = await hooks.allowed(env, ctx, 'deliveries.receive') && !['annulée', 'cancelled'].includes(String(order.status)) && (!projectId || await hooks.hasProjectScope(env, ctx, projectId));
      return json({scans: (result.results || result).map(scanJson), capabilities: {upload: canUpload}, maxBytes: MAX_BYTES});
    }
    const scan = await findScan(); if (!scan) return json({error: 'Scan introuvable.'}, 404);
    if (!original) return json({scan: scanJson(scan)});
    const blob = await env.DB.prepare('SELECT content FROM secure_document_blobs WHERE organization_id=? AND document_id=?').bind(ctx.organizationId, scan.document_id).first();
    if (!blob?.content) return json({error: 'Original indisponible.'}, 404);
    await env.DB.prepare("INSERT INTO document_access_logs(id,organization_id,document_id,user_id,action,created_at) VALUES(?,?,?,?,'downloaded',?)").bind(hooks.id('document-access'), ctx.organizationId, scan.document_id, ctx.uid, hooks.now()).run();
    return new Response(blob.content, {headers: {'content-type': scan.content_type, 'content-length': String(scan.byte_size), 'content-disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(scan.original_name), 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox", 'referrer-policy': 'no-referrer'}});
  }
  const form = await uploadForm(request), file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function' || !file.size) throw fail('Fichier obligatoire.', 400);
  if (file.size > MAX_BYTES) throw fail('L’original doit faire au maximum 1,8 Mo.', 413);
  const operationKey = hooks.operationKey({operationKey: form.get('operationKey')});
  const bytes = await file.arrayBuffer(), mime = hooks.detectedDocumentMime(bytes);
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mime) || file.type && file.type.toLowerCase() !== mime || !hooks.documentExtensionMatches(file.name, mime)) throw fail('Type ou extension de fichier refusé.', 415);
  const checksum = await hooks.sha256Hex(bytes);
  const replay = async () => {
    const keyed = await env.DB.prepare(scanQuery + ' WHERE s.organization_id=? AND s.operation_key=?').bind(ctx.organizationId, operationKey).first();
    if (keyed && (keyed.order_id !== orderId || keyed.checksum_sha256 !== checksum)) throw fail('Clé d’opération déjà utilisée pour un autre scan.', 409);
    return keyed || await env.DB.prepare(scanQuery + ' WHERE s.organization_id=? AND s.order_id=? AND s.checksum_sha256=?').bind(ctx.organizationId, orderId, checksum).first();
  };
  const existing = await replay(); if (existing) return json({scan: scanJson(existing), replayed: true});
  const documentId = hooks.id('document'), newScanId = hooks.id('delivery-scan'), stamp = hooks.now();
  const folderId = 'delivery-scan-originals-' + ctx.organizationId, name = hooks.safeOriginalName(file.name);
  const statements = [
    env.DB.prepare("INSERT OR IGNORE INTO document_folders(id,organization_id,parent_id,name,context_type,context_id,sensitivity,created_by,created_at,updated_at) VALUES(?,?,NULL,'Bons de livraison originaux','company',?,'standard',?,?,?)").bind(folderId, ctx.organizationId, ctx.organizationId, ctx.uid, stamp, stamp),
    env.DB.prepare("INSERT INTO secure_documents(id,organization_id,folder_id,storage_key,original_name,content_type,byte_size,checksum_sha256,sensitivity,status,uploaded_by,created_at,updated_at,title,category,document_type,origin,business_owner_type,business_owner_id,ocr_status) VALUES(?,?,?,?,?,?,?,?,'standard','available',?,?,?,?, 'delivery_note','delivery_note','scanner','purchase_order',?,'not_requested')").bind(documentId, ctx.organizationId, folderId, 'private/' + ctx.organizationId + '/' + documentId, name, mime, file.size, checksum, ctx.uid, stamp, stamp, name, orderId),
    env.DB.prepare('INSERT INTO secure_document_blobs(document_id,organization_id,content,created_at) VALUES(?,?,?,?)').bind(documentId, ctx.organizationId, new Uint8Array(bytes), stamp),
    env.DB.prepare("INSERT INTO document_relations(id,organization_id,document_id,relation_type,relation_id,created_by,created_at) VALUES(?,?,?,'purchase_order',?,?,?)").bind(hooks.id('document-relation'), ctx.organizationId, documentId, orderId, ctx.uid, stamp)
  ];
  if (projectId) statements.push(env.DB.prepare("INSERT INTO document_relations(id,organization_id,document_id,relation_type,relation_id,created_by,created_at) VALUES(?,?,?,'project',?,?,?)").bind(hooks.id('document-relation'), ctx.organizationId, documentId, projectId, ctx.uid, stamp));
  statements.push(env.DB.prepare("INSERT INTO field_delivery_scans(id,organization_id,order_id,document_id,checksum_sha256,operation_key,status,created_by,created_at) VALUES(?,?,?,?,?,?,'uploaded',?,?)").bind(newScanId, ctx.organizationId, orderId, documentId, checksum, operationKey, ctx.uid, stamp), hooks.auditStatement(env, ctx, 'delivery_scan.uploaded', 'delivery_scan', newScanId, {order_id: orderId, document_id: documentId, checksum_sha256: checksum, byte_size: file.size}));
  try {await hooks.dbBatch(env, statements);}
  catch (error) {
    // Another request may have won either unique constraint. The entire losing
    // transaction rolls back, including its document/blob/relation/audit.
    if (/UNIQUE/i.test(String(error.message))) {const winner = await replay(); if (winner) return json({scan: scanJson(winner), replayed: true});}
    throw error;
  }
  const created = await env.DB.prepare(scanQuery + ' WHERE s.organization_id=? AND s.id=?').bind(ctx.organizationId, newScanId).first();
  return json({scan: scanJson(created), replayed: false}, 201);
}
