/* Servidor local para X·STREAM — http://localhost:9131/
   Los Service Workers (descargas offline, biblioteca local) necesitan
   http:// o https://: abriendo el index.html por file:// el navegador
   los desactiva. Este servidor levanta la app en localhost para que
   TODO funcione (descargas con reloj, ver sin internet, etc.).
   Uso: doble clic en ABRIR-XSTREAM.bat — o `node server.js`.        */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.XSTREAM_PORT || 9131;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.webm': 'video/webm',
  '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.xml': 'application/xml', '.m3u8': 'application/vnd.apple.mpegurl',
};

http.createServer((req, res) => {
  try {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    let p = path.join(ROOT, path.normalize(u.pathname));
    if (p.endsWith('/') || p.endsWith('\\')) p = path.join(p, 'index.html');
    if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.readFile(p, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('no encontrado: ' + u.pathname);
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  } catch (e) {
    res.writeHead(500); res.end('error');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  ╔════════════════════════════════════════════════╗');
  console.log('  ║  X·STREAM local:  http://localhost:' + PORT + '        ║');
  console.log('  ║  Descargas offline + biblioteca local ACTIVAS  ║');
  console.log('  ║  (deja esta ventana abierta mientras usas la   ║');
  console.log('  ║   app; Ctrl+C para cerrar)                     ║');
  console.log('  ╚════════════════════════════════════════════════╝');
  console.log('');
});
