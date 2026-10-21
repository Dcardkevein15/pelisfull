/* XÂ·STREAM service worker â cachea el app shell para carga instantÃ¡nea/offline */
/* â  IMPORTANTE: cualquier cambio visible en la app requiere subir esta versiÃ³n
   (v246 â v247â¦) para que los usuarios reciban los archivos nuevos.            */
const CACHE = 'xstream-v247';
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'auth.js', 'chat.js', 'coins.js', 'icon.svg', 'manifest.json', 'social/index.html', 'social.html', 'fondo/premium.mp4'];

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
  /* Ã°Â« cross-origin (wallet proxy, Adsterra, fuentes, APIs): JAMÃS
     interceptar â el SW devolvÃa index.html como respuesta del wallet
     si el fetch fallaba â el cliente no parseaba el JSON â no cobraba  */
  if (!url.startsWith(self.location.origin)) return;
  /* catalog.json SIEMPRE de la red: es el catÃ¡logo que el admin publica para todos */
  if (url.includes('catalog.json')) return;
  /* videos y APIs: siempre de la red (nunca cachear streams) */
  if (url.includes('googleapis') || url.includes('drive.google') || url.includes('archive.org')
    || url.includes('gtv-videos-bucket') || (/\.(mp4|webm|mkv|m4v|ts)(\?|$)/i.test(url) && !/fondo\/premium\.mp4/.test(url))) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (e.request.method === 'GET' && res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => {
      /* 🧭 offline: cada superficie cae a SU propio shell — nunca abrir la
         pÃ¡gina principal cuando el usuario pedÃa el foro social          */
      if (/\/social/.test(new URL(url).pathname)) return caches.match('social/index.html');
      return caches.match('index.html');
    }))
  );
});
