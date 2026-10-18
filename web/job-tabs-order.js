/* Onglets du chantier deplacables — comme les services d'un projet Railway :
   on choisit l'ordre, et il est retenu pour cette personne.

   Choix d'implementation, apres deux echecs :
   - pas de bouton dans un bouton : c'est invalide en HTML et le navigateur ne
     le cree pas ;
   - pas de glisser : sur un telephone avec des gants, un glissement
     horizontal se confond avec le defilement, et il ne se verifie pas dans un
     navigateur sans interface ;
   - une seule ecoute de clic sur le document, deleguee. Rien a relier apres
     chaque rendu, donc rien a perdre.

   Deux fleches par onglet, l'ordre enregistre cote serveur, et un retour en
   arriere si le serveur refuse. */

(function () {
  'use strict';

  var SCOPE = 'dashboard';
  var KEY = 'job-tabs';
  var order = null;
  var loading = null;

  function nav() { return document.querySelector('.job-workspace-tabs'); }

  function tabButtons() {
    var bar = nav();
    if (!bar) return [];
    return Array.prototype.slice.call(bar.querySelectorAll('button')).filter(function (node) {
      return !node.dataset.move;
    });
  }

  function keyOf(button) {
    if (button.dataset.jobTabKey) return button.dataset.jobTabKey;
    var match = /jobWorkspaceTab\s*=\s*'([A-Za-z_]+)'/.exec(button.getAttribute('onclick') || '');
    if (match) button.dataset.jobTabKey = match[1];
    return button.dataset.jobTabKey || null;
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
    var bar = nav();
    if (!bar || !order || !order.length) return;
    var list = tabButtons();
    if (list.length < 2) return;
    var parent = list[0].parentNode;
    var byKey = {};
    list.forEach(function (button) { byKey[keyOf(button)] = button; });
    var ordered = order.map(function (key) { return byKey[key]; }).filter(Boolean);
    if (ordered.length !== list.length) return;
    var actuel = list.map(keyOf).join(',');
    if (actuel === ordered.map(keyOf).join(',')) return;
    silent = true;
    ordered.forEach(function (button) {
      parent.append(button);
      var arrows = button.nextElementSibling;
      if (arrows && arrows.classList && arrows.classList.contains('job-tab-move')) parent.append(arrows);
    });
    refresh();
    silent = false;
  }

  function ensureArrows() {
    tabButtons().forEach(function (button) {
      keyOf(button);
      var next = button.nextElementSibling;
      if (next && next.classList && next.classList.contains('job-tab-move')) return;
      var wrap = document.createElement('span');
      wrap.className = 'job-tab-move';
      wrap.innerHTML = '<span role="button" tabindex="0" data-move="left" aria-label="Déplacer cet onglet vers la gauche">◀</span>' +
        '<span role="button" tabindex="0" data-move="right" aria-label="Déplacer cet onglet vers la droite">▶</span>';
      button.after(wrap);
    });
    refresh();
  }

  function refresh() {
    var list = tabButtons();
    list.forEach(function (button, index) {
      var wrap = button.nextElementSibling;
      if (!wrap || !wrap.classList || !wrap.classList.contains('job-tab-move')) return;
      var left = wrap.querySelector('[data-move="left"]');
      var right = wrap.querySelector('[data-move="right"]');
      if (left) left.setAttribute('aria-disabled', String(index === 0));
      if (right) right.setAttribute('aria-disabled', String(index === list.length - 1));
    });
  }

  function orderList() {
    return tabButtons().map(function (button) { return keyOf(button); });
  }

  function announce(text) {
    var node = document.querySelector('[data-job-tabs-status]');
    if (!node) {
      node = document.createElement('p');
      node.setAttribute('data-job-tabs-status', '');
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      node.className = 'sr-only';
      document.body.append(node);
    }
    node.textContent = text;
  }

  function persist() {
    var next = orderList();
    order = next.slice();
    if (typeof serverJson !== 'function') return Promise.resolve();
    return serverJson('/api/me/preferences/' + SCOPE + '/' + KEY, {
      method: 'PUT',
      body: JSON.stringify({ schemaVersion: 1, value: { order: next } })
    }).then(function () {
      announce('Ordre des onglets enregistré.');
    }).catch(function () {
      announce('L’ordre n’a pas pu être enregistré.');
      order = null;
      return readOrder().then(applyOrder);
    });
  }

  function move(button, direction) {
    var bar = nav();
    if (!bar || !button) return;
    var list = tabButtons();
    var index = list.indexOf(button);
    if (index < 0) return;
    var target = direction === 'left' ? index - 1 : index + 1;
    if (target < 0 || target >= list.length) return;
    var voisin = list[target];
    var parent = button.parentNode;
    var arrows = button.nextElementSibling;
    var hasArrows = arrows && arrows.classList && arrows.classList.contains('job-tab-move');
    if (direction === 'left') parent.insertBefore(button, voisin);
    else parent.insertBefore(button, voisin.nextSibling);
    if (hasArrows) {
      if (direction === 'left') parent.insertBefore(arrows, voisin);
      else parent.insertBefore(arrows, button.nextSibling);
    }
    button.focus();
    refresh();
    persist();
  }

  /* Une seule ecoute, sur le document : elle survit a tous les rendus. */
  document.addEventListener('click', function (event) {
    var trigger = event.target.closest ? event.target.closest('[data-move]') : null;
    if (!trigger || !trigger.closest('.job-workspace-tabs')) return;
    event.preventDefault();
    event.stopPropagation();
    var wrap = trigger.parentElement;
    var button = wrap && wrap.previousElementSibling;
    if (!button || button.tagName !== 'BUTTON') return;
    move(button, trigger.dataset.move);
  }, true);

  document.addEventListener('keydown', function (event) {
    if (!event.ctrlKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    var button = event.target.closest ? event.target.closest('.job-workspace-tabs > button') : null;
    if (!button) return;
    event.preventDefault();
    move(button, event.key === 'ArrowLeft' ? 'left' : 'right');
  }, true);

  var silent = false;
  var observer = new MutationObserver(function () {
    if (silent) return;
    if (!nav()) return;
    ensureArrows();
    /* L'ordre n'est peut-etre pas encore lu : on le lit ici, sinon un
       rechargement afficherait les onglets dans l'ordre par defaut. */
    if (order) applyOrder();
    else readOrder().then(applyOrder);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  function enhance() {
    if (!nav()) return;
    tabButtons().forEach(keyOf);
    ensureArrows();
    readOrder().then(applyOrder);
  }

  document.addEventListener('DOMContentLoaded', enhance);
  enhance();

  globalThis.socleJobTabs = {
    order: function () { return order ? order.slice() : null; },
    move: move,
    reset: function () { order = null; }
  };
})();
