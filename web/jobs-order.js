/* Ordre des chantiers choisi par la personne.

   Meme mecanique que les onglets du chantier, qui est prouvee : une seule
   ecoute deleguee, des fleches a cote de chaque ligne, et l'ordre garde dans
   une preference utilisateur. Rien n'est impose aux autres : l'ordre par
   defaut reste celui de l'application tant que personne n'a rien deplace.

   Les fleches sont dans une cellule ajoutee en fin de ligne, pas dans une
   cellule existante : on ne perturbe pas la mise en page d'origine. */

(function () {
  'use strict';

  var SCOPE = 'dashboard';
  var KEY = 'jobs-order';
  var order = null;
  var loading = null;
  var silent = false;

  function table() { return document.querySelector('#main .ia-jobs-table'); }

  function rows() {
    var body = table() && table().querySelector('tbody');
    return body ? Array.prototype.slice.call(body.querySelectorAll('tr')) : [];
  }

  function idOf(row) {
    if (row.dataset.jobOrderId) return row.dataset.jobOrderId;
    var cell = row.querySelector('.ia-job-identity');
    var text = cell ? String(cell.textContent || '') : '';
    var match = /(BATXL-[A-Z]+-\d+)/.exec(text) || /([A-Z]{2,}-[A-Z]+-\d+)/.exec(text);
    if (match) row.dataset.jobOrderId = match[1];
    return row.dataset.jobOrderId || null;
  }

  function readOrder() {
    if (order) return Promise.resolve(order);
    if (loading) return loading;
    if (typeof serverJson !== 'function') return Promise.resolve(null);
    loading = serverJson('/api/me/preferences/' + SCOPE + '/' + KEY).then(function (data) {
      var value = data && data.preference && data.preference.value;
      order = value && Array.isArray(value.order) && value.order.length ? value.order.slice() : null;
      loading = null;
      return order;
    }).catch(function () { loading = null; return null; });
    return loading;
  }

  function applyOrder() {
    var body = table() && table().querySelector('tbody');
    if (!body || !order || !order.length) return;
    var list = rows();
    if (list.length < 2) return;
    var byId = {};
    list.forEach(function (row) { var id = idOf(row); if (id) byId[id] = row; });
    var ordered = order.map(function (id) { return byId[id]; }).filter(Boolean);
    var rest = list.filter(function (row) { return ordered.indexOf(row) === -1; });
    var cible = ordered.concat(rest);
    var actuel = list.map(function (row) { return idOf(row) || ''; }).join(',');
    if (actuel === cible.map(function (row) { return idOf(row) || ''; }).join(',')) return;
    silent = true;
    cible.forEach(function (row) { body.append(row); });
    silent = false;
    ensureArrows();
  }

  function ensureArrows() {
    rows().forEach(function (row) {
      idOf(row);
      /* La colonne d'action porte un style en ligne que la feuille ne peut
         pas annuler : on la retire ici, comme la maquette le veut sur
         telephone. */
      var action = row.querySelector('.ia-job-action');
      if (action) action.style.display = 'none';
      if (row.querySelector('[data-job-move]')) return;
      /* Les fleches vivent DANS la cellule d'identite, pas dans une cellule de
         plus : une cellule ajoutee a un tableau deja compresse se placait mal
         sous 900 px. */
      var cible = row.querySelector('.ia-job-identity') || row;
      var wrap = document.createElement('span');
      wrap.className = 'ia-job-order-inline';
      wrap.innerHTML = '<span role="button" tabindex="0" data-job-move="up" aria-label="Monter ce chantier">▲</span>' +
        '<span role="button" tabindex="0" data-job-move="down" aria-label="Descendre ce chantier">▼</span>';
      cible.append(wrap);
    });
    refresh();
  }

  function refresh() {
    var list = rows();
    list.forEach(function (row, index) {
      var up = row.querySelector('[data-job-move="up"]');
      var down = row.querySelector('[data-job-move="down"]');
      if (up) up.setAttribute('aria-disabled', String(index === 0));
      if (down) down.setAttribute('aria-disabled', String(index === list.length - 1));
    });
  }

  function ids() { return rows().map(function (row) { return idOf(row); }).filter(Boolean); }

  function persist() {
    var next = ids();
    order = next.slice();
    if (typeof serverJson !== 'function') return Promise.resolve();
    return serverJson('/api/me/preferences/' + SCOPE + '/' + KEY, {
      method: 'PUT',
      body: JSON.stringify({ schemaVersion: 1, value: { order: next } })
    }).then(function () {
      if (typeof globalThis.iaCanvasOrderChanged === 'function') globalThis.iaCanvasOrderChanged();
    }).catch(function () {
      order = null;
      return readOrder().then(applyOrder);
    });
  }

  function move(row, direction) {
    var body = row && row.parentNode;
    if (!body) return;
    var list = rows();
    var index = list.indexOf(row);
    if (index < 0) return;
    var target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= list.length) return;
    if (direction === 'up') body.insertBefore(row, list[target]);
    else body.insertBefore(row, list[target].nextSibling);
    refresh();
    persist();
  }

  document.addEventListener('click', function (event) {
    var trigger = event.target.closest ? event.target.closest('[data-job-move]') : null;
    if (!trigger) return;
    var row = trigger.closest('tr');
    if (!row) return;
    event.preventDefault();
    event.stopPropagation();
    move(row, trigger.dataset.jobMove);
  }, true);

  var observer = new MutationObserver(function () {
    if (silent) return;
    var body = table();
    if (!body) return;
    ensureArrows();
    if (order) applyOrder();
    else readOrder().then(applyOrder);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  function enhance() {
    if (!table()) {
      readOrder().then(function () { if (typeof globalThis.iaCanvasOrderChanged === 'function') globalThis.iaCanvasOrderChanged(); });
      return;
    }
    var actionHead = table().querySelector('th.ia-job-col-actions');
    if (actionHead) actionHead.textContent = 'Ordre';
    rows().forEach(idOf);
    ensureArrows();
    readOrder().then(applyOrder);
  }

  document.addEventListener('DOMContentLoaded', enhance);
  enhance();

  globalThis.socleJobsOrder = {
    order: function () { return order ? order.slice() : null; },
    ids: ids,
    setOrder: function (next) { if (!Array.isArray(next) || !next.length) return; order = next.map(String).slice(); applyOrder(); refresh(); return persist(); },
    reset: function () { order = null; }
  };
})();
