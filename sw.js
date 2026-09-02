/* FlorCWR · service worker
   Estrategia:
   - HTML de la app: NETWORK-FIRST (si hay red, trae la versión nueva; si no, usa caché).
     Así las actualizaciones se detectan solas al abrir con conexión.
   - Iconos y manifest: cache-first (no cambian casi nunca).
   - Teselas del mapa (OpenStreetMap): stale-while-revalidate (zonas ya vistas quedan offline).
   IMPORTANTE: incrementar SW_VERSION en cada publicación para forzar la actualización.
*/
const SW_VERSION  = 'v10-dev';                       // <-- subir este número en cada cambio
const SHELL_CACHE = 'florcwr-dev-shell-' + SW_VERSION;
const TILE_CACHE  = 'florcwr-dev-tiles-v1';     // las teselas se conservan entre versiones
const SHELL = [
  './FlorCWR.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  // NO hacemos skipWaiting automático: esperamos a que el usuario acepte recargar.
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== SHELL_CACHE && k !== TILE_CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// permitir que la página pida activar la versión nueva ya
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

function isHTML(req, url) {
  return req.mode === 'navigate' ||
         req.destination === 'document' ||
         url.pathname.endsWith('.html') ||
         url.pathname.endsWith('/');
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Teselas: cache + refresco en segundo plano
  if (/tile\.openstreetmap\.org/.test(url.hostname) || /\.tile\./.test(url.hostname)) {
    e.respondWith(
      caches.open(TILE_CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        const network = fetch(e.request).then(resp => {
          if (resp && resp.status === 200) cache.put(e.request, resp.clone());
          return resp;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // HTML: NETWORK-FIRST (trae versión nueva si hay red; si no, caché)
  if (url.origin === self.location.origin && isHTML(e.request, url)) {
    e.respondWith(
      fetch(e.request).then(resp => {
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(SHELL_CACHE).then(c => c.put('./FlorCWR.html', copy));
        }
        return resp;
      }).catch(() => caches.match('./FlorCWR.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Resto (iconos, manifest): cache-first con respaldo a red
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
      if (resp && resp.status === 200 && url.origin === self.location.origin) {
        const copy = resp.clone();
        caches.open(SHELL_CACHE).then(c => c.put(e.request, copy));
      }
      return resp;
    }))
  );
});
