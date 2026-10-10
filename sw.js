/* XÃ‚Â·STREAM service worker Ã¢â‚¬â€ cachea el app shell para carga instantÃƒÂ¡nea/offline */
/* Ã¢Å¡Â  IMPORTANTE: cualquier cambio visible en la app requiere subir esta versiÃƒÂ³n
   (v24 Ã¢â€ â€™ v25Ã¢â‚¬Â¦) para que los usuarios reciban los archivos nuevos.            */
const CACHE = 'xstream-v187';
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
  /* Ã°Å¸Å¡Â« cross-origin (wallet proxy, Adsterra, fuentes, APIs): JAMÃƒÂS
     interceptar Ã¢â‚¬â€ el SW devolvÃƒÂ­a index.html como respuesta del wallet
     si el fetch fallaba Ã¢â€ â€™ el cliente no parseaba el JSON Ã¢â€ â€™ no cobraba  */
  if (!url.startsWith(self.location.origin)) return;
  /* catalog.json SIEMPRE de la red: es el catÃƒÂ¡logo que el admin publica para todos */
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
