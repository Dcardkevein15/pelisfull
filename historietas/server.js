/* Servidor estático + puente CORS para Historietas (uso standalone, sin dependencias).
   Uso: doble clic en ABRIR-HISTORIETAS.bat, o `node server.js` → http://localhost:9130/
   NVIDIA no envía cabeceras CORS al navegador: /proxy/<host>/<ruta> hace de puente. */
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = 9130;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8',
};

const PROXY_HOSTS = new Set(['integrate.api.nvidia.com', 'ai.api.nvidia.com']);
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,Accept',
  // Los módulos .mjs cambian con cada mejora: nada de caché del navegador.
  'Cache-Control': 'no-store',
};

function proxy(req, res, host, rest) {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const headers = {};
    for (const h of ['content-type', 'authorization', 'accept']) {
      if (req.headers[h]) headers[h] = req.headers[h];
    }
    if (body.length) headers['content-length'] = body.length;
    const r = https.request({ host, path: rest, method: req.method, headers }, (pres) => {
      const out = { ...CORS };
      for (const [k, v] of Object.entries(pres.headers)) {
        if (!['transfer-encoding', 'connection', 'content-encoding', 'keep-alive'].includes(k)) out[k] = v;
      }
      res.writeHead(pres.statusCode || 502, out);
      pres.pipe(res);
    });
    r.on('error', (e) => { res.writeHead(502, CORS); res.end('Error del puente: ' + e.message); });
    r.write(body);
    r.end();
  });
}

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);

  if (url === '/__bridge') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
    return res.end(JSON.stringify({ ok: true, historietas: 1, port: PORT }));
  }

  if (url.startsWith('/proxy/')) {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    const rest = url.slice('/proxy/'.length);
    const host = rest.split('/')[0];
    if (PROXY_HOSTS.has(host)) return proxy(req, res, host, rest.slice(host.length) || '/');
    res.writeHead(403, CORS);
    return res.end('Host no permitido');
  }

  let file = path.normalize(path.join(ROOT, url));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch {}
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, CORS); return res.end('404'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      ...CORS,
    });
    res.end(data);
  });
}).listen(PORT, () => console.log(`\n  HISTORIETAS — abierto en http://localhost:${PORT}/\n  (cierra esta ventana para apagar el estudio)\n`));
