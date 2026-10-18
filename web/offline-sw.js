/* Service worker du socle : garde l'application utilisable sans reseau.
   Strategie volontairement simple, et c'est un choix :
   - navigation : reseau d'abord, cache ensuite (on veut la version fraiche) ;
   - fichiers statiques : cache d'abord, puis mise a jour silencieuse ;
   - /api/ : jamais mis en cache. Les donnees passent par le module hors
     connexion, qui sait quoi garder et quand le rendre. Un cache HTTP de
     reponses API melangerait deux entreprises et deux roles. */

const CACHE = 'socle-shell-v1';
const SHELL = '/';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.add(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(SHELL, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(SHELL).then(cached => cached || Response.error()))
    );
    return;
  }

  /* Reseau d'abord, cache seulement en secours. Un cache d'abord servirait
     l'ancienne feuille de style apres un deploiement, et l'utilisateur verrait
     une version differente de celle qui vient d'etre publiee. */
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    })
  );
});
