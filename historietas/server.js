/* Servidor estático + puente CORS + TALLER DE ILUSTRACIÓN para Historietas.
   Uso: doble clic en ABRIR-HISTORIETAS.bat, o `node server.js` → http://localhost:9130/
   - Estático: sirve la app (index.html, js/, css/).
   - Puente: /proxy/<host>/<ruta> para NVIDIA (la clave la aporta el cliente).
   - Taller (Parte 2): /historietas/api/studio/* → motor REAL compartido con
     la API route de Vercel (lib/historietas-studio/), con driver LOCAL
     persistente en la carpeta data/ de esta máquina (gitignored).
     Sin Firebase: el token del propietario se genera/imprime en el arranque
     si no existe HISTORIETAS_STUDIO_TOKEN. */
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = __dirname;
const PORT = process.env.HISTORIETAS_PORT || 9130;
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
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,Accept',
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

/* ---------------- Taller de Ilustración (motor compartido) ---------------- */

const LIB_CANDIDATOS = [
  path.join(ROOT, '..', '..', '..', 'lib', 'historietas-studio', 'engine.mjs'), // public/x/historietas
  path.join(ROOT, '..', '..', 'lib', 'historietas-studio', 'engine.mjs'),      // public/historietas
];

async function iniciarTaller() {
  const lib = LIB_CANDIDATOS.find((p) => fs.existsSync(p));
  if (!lib) {
    console.log('\n  [taller] Motor no encontrado (lib/historietas-studio/): la API del Taller queda desactivada.\n           Usa la copia dentro del monorepo (public/historietas o public/x/historietas).\n');
    return null;
  }
  try {
    // import() de ESM exige file:// URL en Windows (lección real del arranque)
    const { createEngine } = await import(pathToFileURL(lib).href);
    const dataDir = path.join(ROOT, 'data');
    // Comodidad local: si no hay NVIDIA_API_KEY de entorno, se puede pegar la
    // clave en data/nvidia-key.txt (gitignored) y el Taller genera de verdad.
    const env = { ...process.env };
    if (!env.NVIDIA_API_KEY) {
      try {
        const keyFile = path.join(dataDir, 'nvidia-key.txt');
        if (fs.existsSync(keyFile)) {
          const k = fs.readFileSync(keyFile, 'utf8').trim();
          if (k.startsWith('nvapi-')) {
            env.NVIDIA_API_KEY = k;
            console.log('  [taller] Clave NVIDIA leída de data/nvidia-key.txt');
          }
        }
      } catch { /* nada */ }
    }
    const engine = await createEngine({
      env,
      localRoot: dataDir,
    });
    if (engine.tokenInfo?.token) {
      const origen = engine.tokenInfo.origen;
      console.log('\n  [taller] API del Taller ACTIVA (driver: ' + engine.storage.driver + ', almacenamiento persistente en ' + dataDir + ')');
      if (origen === 'generado') {
        console.log('  [taller] Token del propietario GENERADO para desarrollo local:');
        console.log('           ' + engine.tokenInfo.token);
        console.log('           (cópielo en el Taller → "Iniciar sesión"; guardado en data/studio-token.txt)');
      } else if (origen === 'archivo') {
        console.log('  [taller] Token del propietario: data/studio-token.txt');
      } else {
        console.log('  [taller] Token del propietario: variable HISTORIETAS_STUDIO_TOKEN');
      }
      console.log('  [taller] Proveedor de imágenes: ' + engine.providerId + (engine.providerId === 'nvidia' ? ' (requiere NVIDIA_API_KEY en el servidor; HISTORIETAS_PROVIDER=mock para pruebas sin créditos)' : '') + '\n');
    }
    return engine;
  } catch (e) {
    console.log('\n  [taller] No se pudo iniciar el motor del Taller: ' + (e.message || e) + '\n');
    return null;
  }
}

function parsearCookies(header) {
  const out = {};
  for (const parte of String(header || '').split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k && v.length) out[k] = v.join('=');
  }
  return out;
}

function enviarRespuesta(res, resultado) {
  const headers = { ...CORS };
  if (resultado.setCookie) headers['Set-Cookie'] = resultado.setCookie;
  if (resultado.binary) {
    headers['Content-Type'] = resultado.binary.contentType;
    headers['Cache-Control'] = 'private, max-age=3600';
    res.writeHead(resultado.status, headers);
    res.end(resultado.binary.buf);
    return;
  }
  headers['Content-Type'] = 'application/json; charset=utf-8';
  res.writeHead(resultado.status, headers);
  res.end(JSON.stringify(resultado.json ?? { ok: true }));
}

async function manejarTaller(engine, req, res, rutaStudio) {
  // rutaStudio: 'login/…' (sin el prefijo /historietas/api/studio/)
  const chunks = [];
  for await (const c of req) chunks.push(c);
  let body = null;
  if (chunks.length) {
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { body = null; }
  }
  const query = {};
  const qIdx = req.url.indexOf('?');
  if (qIdx !== -1) {
    for (const [k, v] of new URLSearchParams(req.url.slice(qIdx + 1))) query[k] = v;
  }
  const resultado = await engine.handle({
    method: req.method,
    path: rutaStudio.split('/').filter(Boolean),
    query, body,
    cookies: parsearCookies(req.headers.cookie),
    ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'local',
  });
  enviarRespuesta(res, resultado);
}

/* ---------------- arranque ---------------- */

iniciarTaller().then((engine) => {
  const server = http.createServer(async (req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);

    if (url === '/__bridge') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
      return res.end(JSON.stringify({ ok: true, historietas: 1, port: PORT, taller: !!engine }));
    }

    const PREFIJOS_TALLER = ['/historietas/api/studio/', '/api/historietas-studio/'];
    if (engine && req.method === 'OPTIONS' && PREFIJOS_TALLER.some((p) => url.startsWith(p))) {
      return res.writeHead(204, CORS).end();
    }
    if (engine) {
      for (const pref of PREFIJOS_TALLER) {
        if (url.startsWith(pref)) {
          return manejarTaller(engine, req, res, url.slice(pref.length));
        }
      }
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
    if (file.startsWith(path.join(ROOT, 'data'))) { res.writeHead(403); return res.end('El almacenamiento del Taller es privado'); }
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
  process.on('SIGINT', () => { server.close(); process.exit(0); });
});
