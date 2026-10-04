/* X·STREAM service worker — cachea el app shell para carga instantánea/offline */
/* ⚠ IMPORTANTE: cualquier cambio visible en la app requiere subir esta versión
   (v24 → v25…) para que los usuarios reciban los archivos nuevos.            */
const CACHE = 'xstream-v147';
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'auth.js', 'chat.js', 'coins.js', 'icon.svg', 'manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== 'xstream-auth-v1').map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  /* 🚫 cross-origin (wallet proxy, Adsterra, fuentes, APIs): JAMÁS
     interceptar — el SW devolvía index.html como respuesta del wallet
     si el fetch fallaba → el cliente no parseaba el JSON → no cobraba  */
  if (!url.startsWith(self.location.origin)) return;
  /* catalog.json SIEMPRE de la red: es el catálogo que el admin publica para todos */
  if (url.includes('catalog.json')) return;
  /* videos y APIs: siempre de la red (nunca cachear streams) */
  if (url.includes('googleapis') || url.includes('drive.google') || url.includes('archive.org')
    || url.includes('gtv-videos-bucket') || /\.(mp4|webm|mkv|m4v|ts)(\?|$)/i.test(url)) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (e.request.method === 'GET' && res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
