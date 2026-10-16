// Contextual originals for supplier orders. The server alone decides access.
(function () {
  let generation = 0;
  const organization = () => String(activeSocleOrganizationId || '');
  const path = orderId => '/api/purchase-orders/' + encodeURIComponent(orderId) + '/delivery-scans';
  const previousSetOrganization = setActiveSocleOrganizationId;
  setActiveSocleOrganizationId = function (value) {
    const before = organization(); previousSetOrganization(value);
    if (before !== organization()) {generation++; document.querySelector('[data-delivery-scans]')?.remove();}
  };
  const previousShowOrder = iaAShowPurchaseOrder;
  iaAShowPurchaseOrder = function (orderId) {
    previousShowOrder(orderId);
    const host = document.querySelector('#modalbody');
    if (!host || !document.querySelector('#modal')?.open) return;
    const root = document.createElement('section'); root.dataset.deliveryScans = '';
    root.innerHTML = '<h3>Bons de livraison originaux</h3><p role="status">Chargement…</p>';
    host.appendChild(root);
    const token = ++generation, org = organization();
    const current = () => generation === token && org === organization() && root.isConnected;
    const request = (url, options = {}) => serverJson(url, {...options, socleOrganizationId: org});
    const status = root.querySelector('[role="status"]');
    async function load() {
      try {
        const data = await request(path(orderId)); if (!current()) return;
        root.querySelector('[data-scan-list]')?.remove();
        const list = document.createElement('div'); list.dataset.scanList = '';
        if (!data.scans.length) {const empty = document.createElement('p'); empty.textContent = 'Aucun original ajouté à cette commande.'; list.appendChild(empty);}
        for (const scan of data.scans) {
          const row = document.createElement('p'), button = document.createElement('button');
          button.type = 'button'; button.className = 'btn'; button.textContent = scan.originalName + ' · Télécharger l’original';
          button.addEventListener('click', async () => {
            button.disabled = true;
            try {
              const response = await fetch(path(orderId) + '/' + encodeURIComponent(scan.id) + '/original', {cache: 'no-store', headers: org ? {'x-socle-organization-id': org} : {}});
              if (!response.ok) throw Error((await response.json().catch(() => ({}))).error || 'Original indisponible.');
              const blob = await response.blob(); if (!current()) return;
              const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = scan.originalName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
            } catch (error) {if (current()) status.textContent = error.message;}
            finally {button.disabled = false;}
          });
          row.appendChild(button); const label = document.createElement('small'); label.textContent = ' Original conservé — réception à traiter'; row.appendChild(label); list.appendChild(row);
        }
        root.appendChild(list); status.textContent = '';
        if (!data.capabilities.upload || root.querySelector('form')) return;
        const form = document.createElement('form'); form.className = 'stack';
        form.innerHTML = '<label>Ajouter une photo ou un PDF<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label="Bon de livraison original"></label><button type="button" class="btn" data-scan-camera>Prendre une photo</button><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden data-scan-camera-input><p>JPEG, PNG, WebP ou PDF · 1,8 Mo maximum. L’ajout conserve le document sans enregistrer de réception.</p><p data-scan-selection></p><button type="submit" class="btn primary" disabled>Conserver l’original</button>';
        let selected = null, operationKey = '';
        const submit = form.querySelector('[type="submit"]');
        const choose = event => {
          selected = event.target.files[0] || null; operationKey = 'delivery-scan-' + crypto.randomUUID();
          form.querySelector('[data-scan-selection]').textContent = selected?.name || '';
          submit.disabled = !selected; status.textContent = '';
          if (selected?.size > data.maxBytes) {submit.disabled = true; status.textContent = 'L’original doit faire au maximum 1,8 Mo.';}
        };
        for (const input of form.querySelectorAll('[type="file"]')) input.addEventListener('change', choose);
        form.querySelector('[data-scan-camera]').addEventListener('click', () => form.querySelector('[data-scan-camera-input]').click());
        form.addEventListener('submit', async event => {
          event.preventDefault(); if (!selected || submit.disabled || !current()) return;
          submit.disabled = true; status.textContent = 'Enregistrement de l’original…';
          const body = new FormData(); body.append('file', selected); body.append('operationKey', operationKey);
          try {
            const result = await request(path(orderId), {method: 'POST', body}); if (!current()) return;
            selected = null; form.reset(); form.querySelector('[data-scan-selection]').textContent = '';
            await load(); if (current()) status.textContent = result.replayed ? 'Cet original est déjà conservé pour cette commande.' : 'Original conservé. La commande reste inchangée.';
          } catch (error) {if (current()) {status.textContent = error.message; submit.disabled = false;}}
        });
        root.insertBefore(form, list);
      } catch (error) {if (current()) status.textContent = error.message;}
    }
    void load();
  };
})();
