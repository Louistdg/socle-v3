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
      var jobId = idOf(row) || '';
      wrap.innerHTML = '<span class="ia-job-order-grip" draggable="true" data-job-drag="' + jobId + '" role="button" tabindex="0" aria-label="Glisser pour déplacer ce chantier" title="Glisser pour déplacer"><svg class="ia-job-order-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="5" cy="3.5" r="1.3"/><circle cx="11" cy="3.5" r="1.3"/><circle cx="5" cy="8" r="1.3"/><circle cx="11" cy="8" r="1.3"/><circle cx="5" cy="12.5" r="1.3"/><circle cx="11" cy="12.5" r="1.3"/></svg></span>' +
        '<span role="button" tabindex="0" data-job-move="up" aria-label="Monter ce chantier"><svg class="ia-job-order-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 3 13 9H3z"/></svg></span>' +
        '<span role="button" tabindex="0" data-job-move="down" aria-label="Descendre ce chantier"><svg class="ia-job-order-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 13 3 7h10z"/></svg></span>';
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

  var draggedJobRow = null;
  var draggedJobOrderBefore = null;
  var draggedJobId = null;
  globalThis.iaBSetJobPhase = function (jobId, status) {
    var list = (typeof jobs !== 'undefined' && Array.isArray(jobs)) ? jobs : [];
    var job = list.find(function (item) { return String(item.id) === String(jobId); });
    if (!job) return false;
    var labels = { preparation: 'Préparation', planned: 'Planifié', in_progress: 'En cours', blocked: 'Bloqué', completed: 'Terminé' };
    var next = labels[status];
    if (!next) return false;
    var current = typeof iaBJobStatus === 'function' ? iaBJobStatus(job) : '';
    if (current === status) return false;
    var previous = job.phase;
    job.phase = next;
    if (typeof scheduleSave === 'function') scheduleSave();
    if (typeof render === 'function') render();
    if (typeof toast === 'function') toast('Chantier déplacé · ' + next, 'Annuler', function () {
      job.phase = previous;
      if (typeof scheduleSave === 'function') scheduleSave();
      if (typeof render === 'function') render();
    });
    return true;
  };

  function clearJobDrag() {
    draggedJobRow = null;
    draggedJobId = null;
    Array.prototype.forEach.call(document.querySelectorAll('.ia-jobs-table tr.is-job-dragging,.ia-jobs-table tr.is-job-drop-target,.ia-jobs-phase-targets .is-job-phase-target'), function (row) {
      row.classList.remove('is-job-dragging', 'is-job-drop-target', 'is-job-phase-target');
    });
  }
  document.addEventListener('dragstart', function (event) {
    var grip = event.target.closest ? event.target.closest('[data-job-drag]') : null;
    if (!grip || !table() || !table().contains(grip)) return;
    draggedJobRow = grip.closest('tr');
    if (!draggedJobRow) return;
    draggedJobId = grip.dataset.jobDrag || '';
    draggedJobOrderBefore = ids();
    draggedJobRow.classList.add('is-job-dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      try { event.dataTransfer.setData('text/plain', 'job-order:' + grip.dataset.jobDrag); } catch (error) {}
    }
  });
  document.addEventListener('dragover', function (event) {
    if (!draggedJobRow) return;
    var phaseTarget = event.target.closest ? event.target.closest('[data-job-phase-target]') : null;
    if (phaseTarget) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      Array.prototype.forEach.call(document.querySelectorAll('.ia-jobs-phase-targets .is-job-phase-target'), function (item) {
        item.classList.remove('is-job-phase-target');
      });
      phaseTarget.classList.add('is-job-phase-target');
      return;
    }
    var row = event.target.closest ? event.target.closest('tr') : null;
    if (!row || row === draggedJobRow || row.parentNode !== draggedJobRow.parentNode) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    Array.prototype.forEach.call(document.querySelectorAll('.ia-jobs-table tr.is-job-drop-target'), function (item) {
      item.classList.remove('is-job-drop-target');
    });
    row.classList.add('is-job-drop-target');
  });
  document.addEventListener('drop', function (event) {
    if (!draggedJobRow) return;
    var phaseTarget = event.target.closest ? event.target.closest('[data-job-phase-target]') : null;
    if (phaseTarget) {
      event.preventDefault();
      var jobId = draggedJobId;
      var phase = phaseTarget.dataset.jobPhaseTarget;
      clearJobDrag();
      globalThis.iaBSetJobPhase(jobId, phase);
      return;
    }
    var row = event.target.closest ? event.target.closest('tr') : null;
    if (!row || row === draggedJobRow || row.parentNode !== draggedJobRow.parentNode) return;
    event.preventDefault();
    var box = row.getBoundingClientRect();
    var after = event.clientY > box.top + box.height / 2;
    row.parentNode.insertBefore(draggedJobRow, after ? row.nextSibling : row);
    var beforeOrder = draggedJobOrderBefore;
    clearJobDrag();
    refresh();
    persist();
    if (typeof toast === 'function') toast('Ordre des chantiers enregistré.', 'Annuler', function () {
      if (beforeOrder && globalThis.socleJobsOrder) globalThis.socleJobsOrder.setOrder(beforeOrder);
    });
  });
  document.addEventListener('dragend', clearJobDrag);

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

  var jobContextMenu = null;
  function closeJobContext() {
    if (jobContextMenu) { jobContextMenu.remove(); jobContextMenu = null; }
  }
  function jobForId(jobId) {
    var list = (typeof jobs !== 'undefined' && Array.isArray(jobs)) ? jobs : [];
    return list.find(function (item) { return String(item.id) === String(jobId); }) || null;
  }
  function contextItem(label, action, phase) {
    var button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.textContent = label;
    button.dataset.jobContextAction = action;
    if (phase) button.dataset.jobContextPhase = phase;
    return button;
  }
  function openJobContext(row, x, y) {
    closeJobContext();
    if (!row || !row.dataset.jobId) return;
    var job = jobForId(row.dataset.jobId);
    if (!job) return;
    var menu = document.createElement('div');
    menu.className = 'ia-job-context';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Actions du chantier');
    var title = document.createElement('div');
    title.className = 'ia-job-context-title';
    title.textContent = job.name || 'Chantier';
    var reference = document.createElement('small');
    reference.textContent = job.reference || job.ref || String(job.id);
    title.append(reference);
    menu.append(title, contextItem('Ouvrir le dossier', 'open'));
    var phaseLabel = document.createElement('div');
    phaseLabel.className = 'ia-job-context-label';
    phaseLabel.textContent = 'Déplacer vers';
    menu.append(phaseLabel);
    var phases = document.createElement('div');
    phases.className = 'ia-job-context-phases';
    [['preparation', 'Préparation'], ['planned', 'Planifié'], ['in_progress', 'En cours'], ['blocked', 'Bloqué'], ['completed', 'Terminé']].forEach(function (item) {
      phases.append(contextItem(item[1], 'phase', item[0]));
    });
    menu.append(phases);
    menu.append(contextItem('Archiver', 'archive'), contextItem('Copier la référence', 'copy'));
    menu.style.visibility = 'hidden';
    document.body.append(menu);
    var left = Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8));
    var top = Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8));
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.visibility = 'visible';
    jobContextMenu = menu;
    menu.addEventListener('click', function (event) {
      var button = event.target.closest('[data-job-context-action]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      var action = button.dataset.jobContextAction;
      closeJobContext();
      if (action === 'open' && typeof globalThis.iaBOpenJobDetails === 'function') globalThis.iaBOpenJobDetails(job.id);
      if (action === 'phase') globalThis.iaBSetJobPhase(job.id, button.dataset.jobContextPhase);
      if (action === 'copy') {
        var value = String(job.reference || job.ref || job.id);
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(function () { if (typeof toast === 'function') toast('Référence copiée.'); }).catch(function () {});
      }
      if (action === 'archive') {
        var previous = job.phase;
        job.phase = 'Archivé';
        if (typeof scheduleSave === 'function') scheduleSave();
        if (typeof render === 'function') render();
        if (typeof toast === 'function') toast('Chantier archivé.', 'Annuler', function () {
          job.phase = previous;
          if (typeof scheduleSave === 'function') scheduleSave();
          if (typeof render === 'function') render();
        });
      }
    });
  }
  document.addEventListener('contextmenu', function (event) {
    if (window.matchMedia && window.matchMedia('(pointer:coarse)').matches) return;
    var row = event.target.closest ? event.target.closest('#main .ia-jobs-table tbody tr[data-job-id]') : null;
    if (!row) return;
    event.preventDefault();
    openJobContext(row, event.clientX, event.clientY);
  });
  document.addEventListener('pointerdown', function (event) {
    if (jobContextMenu && !jobContextMenu.contains(event.target)) closeJobContext();
  }, true);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeJobContext();
    if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
      var row = event.target.closest ? event.target.closest('#main .ia-jobs-table tbody tr[data-job-id]') : null;
      if (!row) return;
      event.preventDefault();
      var box = row.getBoundingClientRect();
      openJobContext(row, box.left + 40, box.top + 24);
    }
  });
  window.addEventListener('scroll', closeJobContext, true);

  globalThis.socleJobsOrder = {
    order: function () { return order ? order.slice() : null; },
    ids: ids,
    setOrder: function (next) { if (!Array.isArray(next) || !next.length) return; order = next.map(String).slice(); applyOrder(); refresh(); return persist(); },
    reset: function () { order = null; }
  };
})();
