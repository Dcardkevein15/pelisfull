/* XÂ·STREAM service worker â cachea el app shell para carga instantÃ¡nea/offline */
/* â IMPORTANTE: cualquier cambio visible en la app requiere subir esta versiÃ³n
   (v248 â v249â¦) para que los usuarios reciban los archivos nuevos.            */
const CACHE = 'xstream-v248';
const OFF_CACHE = 'xstream-offline-v1';   /* ð vÃ­deos descargados âSIEMPRE vivosâ: NUNCA se purge */
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'auth.js', 'chat.js', 'coins.js', 'icon.svg', 'manifest.json', 'social/index.html', 'social.html', 'fondo/premium.mp4'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== 'xstream-auth-v1' && k !== OFF_CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

/* ð DESCARGA OFFLINE: la pÃ¡gina pide guardar un video (archive.org NO manda
   CORS, pero el SW sÃ­ puede traerlo en modo no-cors y guardarlo opaco en
   Cache API). Se guarda bajo una clave SAME-ORIGIN (/__off/â¦) que el SW
   sirve despuÃ©s â funciona SIN INTERNET, para siempre.                    */
self.addEventListener('message', e => {
  const d = e.data;
  if (!d || d.type !== 'x-dl') return;
  (async () => {
    try {
      const res = await fetch(d.url, { mode: 'no-cors', redirect: 'follow' });
      if (!res) throw new Error('sin respuesta');
      const c = await caches.open(OFF_CACHE);
      await c.put(new Request(d.key), res);
      try { e.source.postMessage({ type: 'x-dl-done', key: d.key, ok: true }); } catch (er) { }
    } catch (err) {
      try { e.source.postMessage({ type: 'x-dl-done', key: d.key, ok: false }); } catch (er) { }
    }
  })();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  /* ï¸ cross-origin (wallet proxy, Adsterra, fuentes, APIs): JAMÃS
     interceptar â el SW devolvÃ­a index.html como respuesta del wallet
     si el fetch fallaba â el cliente no parseaba el JSON â no cobraba  */
  if (!url.startsWith(self.location.origin)) return;
  /* catalog.json SIEMPRE de la red: es el catÃ¡logo que el admin publica para todos */
  if (url.includes('catalog.json')) return;
  /* ð BIBLIOTECA OFFLINE: /__off/â¦ se sirve SOLO desde el cachÃ© de
     descargas â nunca de la red (si no estÃ¡ ahÃ­, es que no se descargÃ³).
     Debe ir ANTES de la exclusiÃ³n de .mp4 (las claves terminan en .mp4). */
  if (new URL(url).pathname.startsWith('/__off/')) {
    e.respondWith(
      caches.open(OFF_CACHE).then(c => c.match(e.request, { ignoreSearch: true })).then(hit =>
        hit || new Response('sin copia local', { status: 503, headers: { 'Content-Type': 'text/plain' } }))
    );
    return;
  }
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
      /* ï offline: cada superficie cae a SU propio shell - nunca abrir la
         pÃ¡gina principal cuando el usuario pedÃ­a el foro social          */
      if (/\/social/.test(new URL(url).pathname)) return caches.match('social/index.html');
      return caches.match('index.html');
    }))
  );
});
