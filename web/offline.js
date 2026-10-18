/* Hors connexion — la couche qui permet de consulter un chantier et d'ecrire
   une note sans reseau.

   Trois responsabilites, et rien d'autre :
   1. garder la derniere photographie de l'entreprise (l'etat complet) ;
   2. servir cette photographie quand /api/state ne repond pas ;
   3. mettre les notes ecrites hors connexion dans une file, et les envoyer
      quand le reseau revient, avec une cle d'idempotence pour qu'un envoi
      rejoue ne cree pas de doublon.

   Aucune donnee n'est ecrite en clair sur le disque au-dela de ce qui est
   necessaire : tout est efface a la deconnexion. */

(function () {
  'use strict';

  var DB_NAME = 'socle-offline';
  var DB_VERSION = 1;
  var STORE_SNAPSHOT = 'snapshot';
  var STORE_QUEUE = 'queue';
  var CATEGORIES = ['Avancement', 'Problème', 'Livraison', 'Sécurité'];
  var queueListeners = [];
  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) { reject(Error('Stockage local indisponible.')); return; }
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(STORE_SNAPSHOT)) db.createObjectStore(STORE_SNAPSHOT);
        if (!db.objectStoreNames.contains(STORE_QUEUE)) db.createObjectStore(STORE_QUEUE, { keyPath: 'operationKey' });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || Error('Stockage local indisponible.')); };
    });
    return dbPromise;
  }

  function tx(store, mode, work) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var transaction = db.transaction(store, mode);
        var target = transaction.objectStore(store);
        var result;
        try { result = work(target); } catch (error) { reject(error); return; }
        transaction.oncomplete = function () { resolve(result && result.result !== undefined ? result.result : result); };
        transaction.onerror = function () { reject(transaction.error); };
        transaction.onabort = function () { reject(transaction.error); };
      });
    });
  }

  function saveSnapshot(state) {
    return tx(STORE_SNAPSHOT, 'readwrite', function (store) {
      store.put({ payload: state, state: (state && state.state) || state, savedAt: new Date().toISOString() }, 'state');
      return true;
    });
  }

  function readSnapshot() {
    return tx(STORE_SNAPSHOT, 'readonly', function (store) { return store.get('state'); });
  }

  function clearAll() {
    return Promise.all([
      tx(STORE_SNAPSHOT, 'readwrite', function (store) { return store.clear(); }),
      tx(STORE_QUEUE, 'readwrite', function (store) { return store.clear(); })
    ]);
  }

  function listQueue() {
    return tx(STORE_QUEUE, 'readonly', function (store) { return store.getAll(); })
      .then(function (items) { return (items || []).sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); }); });
  }

  function queueNote(note) {
    var entry = {
      operationKey: 'note-' + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)),
      projectId: String(note.projectId),
      projectName: String(note.projectName || ''),
      category: CATEGORIES.indexOf(note.category) >= 0 ? note.category : 'Avancement',
      text: String(note.text || '').slice(0, 250),
      createdAt: new Date().toISOString()
    };
    return tx(STORE_QUEUE, 'readwrite', function (store) { store.put(entry); return entry; })
      .then(function () { notify(); return entry; });
  }

  function removeFromQueue(operationKey) {
    return tx(STORE_QUEUE, 'readwrite', function (store) { store.delete(operationKey); })
      .then(function () { notify(); });
  }

  function notify() {
    listQueue().then(function (items) {
      queueListeners.forEach(function (listener) { try { listener(items); } catch (_) {} });
      renderBanner(items);
    }).catch(function () {});
  }

  function onQueueChange(listener) { queueListeners.push(listener); return listener; }

  /* ---------- envoi ---------- */

  function postNote(entry) {
    return fetch('/api/projects/' + encodeURIComponent(entry.projectId) + '/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        category: entry.category,
        visibility: 'Équipe et patron',
        text: entry.text,
        operationKey: entry.operationKey
      })
    }).then(function (response) {
      if (response.ok) return response.json().catch(function () { return {}; });
      return response.json().catch(function () { return {}; }).then(function (body) {
        throw Error(body && body.error ? body.error : 'Envoi refusé (' + response.status + ').');
      });
    });
  }

  var flushing = false;

  function flushQueue() {
    if (flushing) return Promise.resolve({ sent: 0, failed: 0 });
    /* navigator.onLine arrive en retard apres le retour du reseau : on tente
       l'envoi, et c'est l'echec de la requete qui tranche. */
    flushing = true;
    var sent = 0, failed = 0;
    return listQueue().then(function (items) {
      return items.reduce(function (chain, entry) {
        return chain.then(function () {
          return postNote(entry)
            .then(function () { sent++; return removeFromQueue(entry.operationKey); })
            .catch(function (error) {
              failed++;
              if (error && /refus|invalide|400|403|404/i.test(String(error.message || ''))) {
                return removeFromQueue(entry.operationKey);
              }
            });
        });
      }, Promise.resolve());
    }).then(function () {
      flushing = false;
      notify();
      return { sent: sent, failed: failed };
    }).catch(function () { flushing = false; return { sent: 0, failed: 0 }; });
  }

  /* ---------- interception de /api/state ---------- */

  var originalFetch = window.fetch ? window.fetch.bind(window) : null;

  function isStateRequest(url, method) {
    if (method !== 'GET') return false;
    return String(url).split('?')[0].replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '') === '/api/state';
  }

  function requestUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    return '';
  }

  if (originalFetch) {
    window.fetch = function (input, init) {
      var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      var url = requestUrl(input);
      var isState = isStateRequest(url, method);
      var started = originalFetch.apply(window, arguments);
      if (!isState) return started;
      return started.then(function (response) {
        if (response && response.ok) {
          response.clone().json().then(function (body) { saveSnapshot(body).catch(function () {}); }).catch(function () {});
        }
        return response;
      }).catch(function (error) {
        return readSnapshot().then(function (record) {
          if (!record || !record.state) throw error;
          lastServedAt = record.savedAt;
          var body = Object.assign({}, record.payload || record.state, { offlineSnapshot: record.savedAt });
          return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
        });
      });
    };
  }

  /* ---------- bandeau ---------- */

  var lastServedAt = null;

  function banner() {
    if (!document.body) return null;
    var node = document.querySelector('[data-offline-banner]');
    if (!node) {
      node = document.createElement('div');
      node.className = 'sx-offline-banner';
      node.dataset.offlineBanner = '';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      document.body.append(node);
      node.addEventListener('click', function (event) {
        if (event.target.closest('[data-offline-send]')) { flushQueue(); return; }
        if (event.target.closest('[data-offline-refresh]')) { location.reload(); }
      });
    }
    return node;
  }

  function formatDate(value) {
    try { return new Date(value).toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' }); }
    catch (_) { return String(value || ''); }
  }

  function renderBanner(items) {
    var pending = items || [];
    var node = banner();
    if (!node) return;
    var online = navigator.onLine;
    var parts = [];
    if (!online) {
      parts.push('<strong>Hors connexion</strong>');
      if (lastServedAt) parts.push('données du ' + escapeHtml(formatDate(lastServedAt)));
      else parts.push('aucune donnée enregistrée sur ce téléphone');
    }
    if (pending.length) {
      parts.push(pending.length + (pending.length === 1 ? ' note en attente' : ' notes en attente'));
      if (online) parts.push('<button type="button" class="btn" data-offline-send>Envoyer</button>');
    } else if (online && node.dataset.wasOffline === 'true') {
      parts.push('<button type="button" class="btn" data-offline-refresh>Actualiser</button>');
    }
    node.dataset.wasOffline = online ? 'false' : 'true';
    if (!parts.length) { node.hidden = true; node.innerHTML = ''; return; }
    node.hidden = false;
    node.innerHTML = parts.join(' · ');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- formulaire de note ---------- */

  function injectNotePanel() {
    if (typeof view === 'undefined' || view !== 'jobWorkspace') return;
    if (typeof currentJobId === 'undefined' || !currentJobId) return;
    if (document.querySelector('[data-offline-note-panel]')) return;
    var main = document.querySelector('#main');
    if (!main) return;
    var projectId = String(currentJobId);
    var job = (typeof jobs !== 'undefined' && Array.isArray(jobs) ? jobs : []).find(function (item) { return String(item.id) === projectId; });
    var section = document.createElement('section');
    section.className = 'panel sx-offline-note';
    section.dataset.offlineNotePanel = '';
    section.innerHTML =
      '<div class="panel-head"><h2>Note de chantier</h2></div>' +
      '<form data-offline-note-form>' +
      '<div class="sx-offline-note-categories" role="group" aria-label="Type de note">' +
      CATEGORIES.map(function (label) {
        return '<button type="button" class="sx-journal-chip" aria-pressed="' + (label === 'Avancement' ? 'true' : 'false') + '" data-offline-category="' + escapeHtml(label) + '">' + escapeHtml(label) + '</button>';
      }).join('') +
      '</div>' +
      '<label>Note<textarea name="text" rows="3" maxlength="250" placeholder="Ce qui a été fait, ce qui bloque, ce qui a été livré…"></textarea></label>' +
      '<p data-offline-note-status role="status" aria-live="polite">La note part dès que le réseau le permet.</p>' +
      '<div class="modal-actions"><button class="btn primary" type="submit">Enregistrer la note</button></div>' +
      '</form>';
    main.append(section);
    var form = section.querySelector('[data-offline-note-form]');
    var status = section.querySelector('[data-offline-note-status]');
    var chosen = 'Avancement';
    section.querySelectorAll('[data-offline-category]').forEach(function (button) {
      button.addEventListener('click', function () {
        chosen = button.dataset.offlineCategory;
        section.querySelectorAll('[data-offline-category]').forEach(function (other) {
          other.setAttribute('aria-pressed', String(other === button));
        });
      });
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var text = String(form.querySelector('[name="text"]').value || '').trim();
      if (!text) { status.textContent = 'Écrivez une note avant d’enregistrer.'; return; }
      queueNote({ projectId: projectId, projectName: job ? job.name : '', category: chosen, text: text })
        .then(function () {
          form.querySelector('[name="text"]').value = '';
          status.textContent = navigator.onLine ? 'Note enregistrée, envoi en cours…' : 'Note gardée sur ce téléphone, elle partira au retour du réseau.';
          if (navigator.onLine) flushQueue();
        })
        .catch(function (error) { status.textContent = error.message || 'La note n’a pas pu être gardée.'; });
    });
  }

  /* ---------- cycle de vie ---------- */

  function enhance() {
    installRenderHook();
    try { injectNotePanel(); } catch (_) {}
    notify();
  }

  /* Le module est charge avant les scripts de l'application : render n'existe
     pas encore. On pose le crochet plus tard, et on le repose si render a ete
     remplace entre-temps par un autre module. */
  function installRenderHook() {
    var current = globalThis.render;
    if (typeof current !== 'function' || current.__offlineWrapped) return;
    var wrapped = function () {
      var result = current.apply(this, arguments);
      enhance();
      return result;
    };
    wrapped.__offlineWrapped = true;
    globalThis.render = wrapped;
  }

  window.addEventListener('online', function () { notify(); flushQueue(); });
  window.addEventListener('offline', function () { notify(); });
  document.addEventListener('DOMContentLoaded', function () { enhance(); if (navigator.onLine) flushQueue(); });
  enhance();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/offline-sw.js', { scope: '/' }).catch(function () {});
    });
  }

  globalThis.socleOffline = {
    saveSnapshot: saveSnapshot,
    readSnapshot: readSnapshot,
    queueNote: queueNote,
    listQueue: listQueue,
    flushQueue: flushQueue,
    clearAll: clearAll,
    onQueueChange: onQueueChange
  };
})();
