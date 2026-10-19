import {createHash} from 'node:crypto';
import {gzipSync, brotliCompressSync, constants} from 'node:zlib';

// Only authenticated, successful static responses are reusable. Never cache API data.
const encodedAssets = new Map();
export async function compressTextResponse(request, response) {
  if (!['GET', 'HEAD'].includes(request.method) || response.status !== 200) return response;
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!/^(?:application\/json|text\/html|text\/plain|image\/svg\+xml)\b/.test(type)) return response;
  if (response.headers.get('content-encoding')) return response;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1024) return new Response(request.method === 'HEAD' ? null : bytes, {status: response.status, headers: response.headers});
  const accepted = String(request.headers['accept-encoding'] || '');
  const qualities = new Map(accepted.split(',').map(part => {const [name, ...params] = part.trim().split(';'); const q = params.find(p => p.trim().startsWith('q=')); return [name, q ? Number(q.trim().slice(2)) : 1];}));
  const quality = name => qualities.get(name) ?? qualities.get('*') ?? 0;
  const encoding = quality('br') > 0 ? 'br' : quality('gzip') > 0 ? 'gzip' : '';
  if (!encoding) return new Response(request.method === 'HEAD' ? null : bytes, {status: response.status, headers: response.headers});
  const body = encoding === 'br' ? brotliCompressSync(bytes, {params: {[constants.BROTLI_PARAM_QUALITY]: 4}}) : gzipSync(bytes);
  const headers = new Headers(response.headers);
  headers.set('vary', 'Accept-Encoding');
  headers.set('content-encoding', encoding);
  headers.set('content-length', String(body.length));
  return new Response(request.method === 'HEAD' ? null : body, {status: response.status, headers});
}
export async function prepareAssetResponse(request, response) {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (!['GET', 'HEAD'].includes(request.method) || response.status !== 200 || path.startsWith('/api/') || path.startsWith('/auth/') || !/\.(?:js|mjs|css)$/.test(path) || !/^(?:application\/(?:java|ecma)script|text\/(?:css|javascript))\b/.test(response.headers.get('content-type') || '')) return response;
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash('sha256').update(bytes).digest('hex');
  let asset = encodedAssets.get(digest);
  if (!asset) {
    asset = {bytes, gzip: gzipSync(bytes), br: brotliCompressSync(bytes, {params: {[constants.BROTLI_PARAM_QUALITY]: 4}})};
    encodedAssets.set(digest, asset);
    if (encodedAssets.size > 96) encodedAssets.delete(encodedAssets.keys().next().value);
  }
  const accepted = String(request.headers['accept-encoding'] || '');
  const qualities = new Map(accepted.split(',').map(part => {const [name, ...params] = part.trim().split(';'); const q = params.find(p => p.trim().startsWith('q=')); return [name, q ? Number(q.trim().slice(2)) : 1];}));
  const quality = name => qualities.get(name) ?? qualities.get('*') ?? 0;
  const encoding = quality('br') > 0 ? 'br' : quality('gzip') > 0 ? 'gzip' : '';
  const etag = '"' + digest + '-' + (encoding || 'identity') + '"';
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'private, max-age=0, must-revalidate');
  headers.set('vary', 'Accept-Encoding');
  headers.set('etag', etag);
  if (String(request.headers['if-none-match'] || '').split(',').map(s => s.trim()).some(s => s === etag || s === 'W/' + etag || s === '*')) {
    headers.delete('content-length');
    return new Response(null, {status: 304, headers});
  }
  if (encoding) headers.set('content-encoding', encoding);
  const body = asset[encoding || 'bytes'];
  headers.set('content-length', String(body.length));
  return new Response(request.method === 'HEAD' ? null : body, {status: 200, headers});
}
