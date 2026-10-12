/* ═══════════════════════════════════════════════════════════════
   🧪 XSTREAM SOCIAL — E2E en navegador real (Edge/Chrome headless)
   Ejecutar:  node scripts/social-e2e.mjs
   Opcional:  E2E_NODE_MODULES=<dir con playwright-core> node scripts/social-e2e.mjs

   Levanta un servidor local que sirve la app REAL (/social) y
   ejerce el handler REAL api/social.js sobre un GitHub simulado
   en memoria. El navegador carga social.js + auth.js de verdad:
   identidad IndexedDB, firmas ECDSA del dispositivo, ETags, feed
   incremental, moderación, chat, respaldo cifrado y recuperación.
   ═══════════════════════════════════════════════════════════════ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const XROOT = path.resolve(__dirname, '..');
const PORT = 8879;
const BASE = 'http://127.0.0.1:' + PORT;
const SHOTS = process.env.E2E_SHOTS || path.join(process.env.TEMP || '.', 'xsocial-shots');
fs.mkdirSync(SHOTS, { recursive: true });

/* ── GitHub simulado (igual que en social-api.test.mjs) ── */
class FakeGH {
  constructor() {
    this.files = new Map();
    this.puts = 0;
  }
  headers(obj) {
    const low = {};
    for (const k of Object.keys(obj || {})) low[String(k).toLowerCase()] = obj[k];
    return { get: k => low[String(k).toLowerCase()] ?? null, has: k => k in low };
  }
  async fetch(url, init = {}) {
    const u = new URL(url);
    if (u.hostname === 'api.github.com') {
      const method = (init.method || 'GET').toUpperCase();
      const mh = u.pathname.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/);
      if (mh && method === 'GET') {
        const p = mh[1];
        const inm = this.headers(init.headers).get('if-none-match');
        const f = this.files.get(p);
        if (!f) return this.resp(404, { message: 'Not Found' });
        if (inm && inm === f.etag) return this.resp(304, '', {});
        return this.resp(200, {
          type: 'file', encoding: 'base64', sha: f.sha,
          content: Buffer.from(f.content, 'utf8').toString('base64'),
        }, { ETag: f.etag });
      }
      if (mh && method === 'PUT') {
        const p = mh[1];
        const body = JSON.parse(init.body);
        const f = this.files.get(p);
        if (f && body.sha !== f.sha) return this.resp(409, { message: 'sha mismatch' });
        const sha = 'S' + Math.random().toString(36).slice(2, 12);
        const etag = 'W/"' + sha + '"';
        this.files.set(p, { content: Buffer.from(body.content, 'base64').toString('utf8'), sha, etag });
        this.puts++;
        return this.resp(200, { content: { sha } });
      }
    }
    return this.resp(404, {});
  }
  resp(status, body, extraHeaders = {}) {
    return {
      status, ok: status >= 200 && status < 300,
      headers: this.headers(extraHeaders),
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  }
  json(p) { const f = this.files.get(p); return f ? JSON.parse(f.content) : null; }
}

/* ── entorno del handler (ANTES de importarlo) ── */
process.env.GH_TOKEN = 'e2e-token';
process.env.SOCIAL_TEAM_SECRET = 'e2e-team-secret';
const ADMIN = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
process.env.SOCIAL_ADMIN_PUB = Buffer.from(await crypto.subtle.exportKey('spki', ADMIN.publicKey)).toString('base64');

const gh = new FakeGH();
const realFetch = global.fetch.bind(global);   /* para aserciones del propio arnés */
global.fetch = (...a) => gh.fetch(...a);
const req0 = createRequire(import.meta.url);
const handler = req0('../api/social.js');

/* ── servidor: estáticos + /api/social + inspección del almacén ── */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer(async (rq, rs) => {
  const u = new URL(rq.url, BASE);
  try {
    if (u.pathname === '/api/social') {
      const res2 = {
        _h: {}, statusCode: 200,
        setHeader(k, v) { this._h[k] = v; },
        status(c) { this.statusCode = c; return this; },
        json(obj) {
          const body = JSON.stringify(obj);
          rs.writeHead(this.statusCode, { ...this._h, 'Content-Type': 'application/json; charset=utf-8' });
          rs.end(body);
        },
        end() { rs.writeHead(this.statusCode, this._h); rs.end(); },
      };
      const query = {};
      for (const [k, v] of u.searchParams) query[k] = v;
      await handler({ method: rq.method, query, headers: rq.headers }, res2);
      return;
    }
    if (u.pathname === '/__test/gh') {
      const p = u.searchParams.get('p');
      const j = gh.json(p);
      rs.writeHead(j ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' });
      rs.end(JSON.stringify(j ?? { error: 'missing' }));
      return;
    }
    /* estáticos con guardas de path traversal */
    let rel = decodeURIComponent(u.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    if (rel === '/social' || rel === '/social/') rel = '/social/index.html';
    const file = path.normalize(path.join(XROOT, rel));
    if (!file.startsWith(XROOT)) { rs.writeHead(403); rs.end(); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { rs.writeHead(404); rs.end('404'); return; }
    rs.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    rs.end(fs.readFileSync(file));
  } catch (e) {
    console.error('SERVER ERR', e.message);
    rs.writeHead(500); rs.end('err');
  }
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

/* ── playwright-core desde node_modules propio o E2E_NODE_MODULES ── */
let chromium;
try {
  ({ chromium } = (await import('playwright-core')).default ?? await import('playwright-core'));
} catch (e) {
  const dir = process.env.E2E_NODE_MODULES;
  if (!dir) { console.error('Falta playwright-core. Instálalo o pasa E2E_NODE_MODULES=<dir>.'); process.exit(2); }
  ({ chromium } = createRequire(path.join(dir, 'noop.js'))('playwright-core'));
}

async function launchBrowser() {
  for (const channel of ['msedge', 'chrome']) {
    try { return await chromium.launch({ channel, headless: true }); }
    catch (e) { }
  }
  return await chromium.launch({ headless: true });   /* Chromium bundled, si existiera */
}

/* ═══════════ SUITE ═══════════ */
let passed = 0, failed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log('  OK  ' + name); }
  catch (e) { failed++; failures.push({ name, e }); console.log('  XX  ' + name + '\n      ' + (e.message || '').split('\n')[0]); }
}
const ok = (cond, msg) => { if (!cond) throw new Error(msg || 'aserción fallida'); };

/* interceptores comunes: API → servidor local; catálogo → 404 silencioso */
async function wirePage(page) {
  await page.route('**/api/social**', async route => {
    const local = BASE + '/api/social' + new URL(route.request().url()).search;
    try {
      const resp = await route.fetch({ url: local });
      await route.fulfill({ response: resp });
    } catch (e) {
      await route.abort();
    }
  });
  for (const pat of ['**api.github.com/**', '**cdn.jsdelivr.net/**', '**api.themoviedb.org/**', '**pipedapi.*/**']) {
    await page.route(pat, route => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  }
}
const forceRefresh = page => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
const feedCount = page => page.locator('#socFeed article.soc-post').count();
/* cierra cualquier hoja abierta (limpieza defensiva entre pruebas) */
const dismissSheets = page => page.evaluate(() => {
  const o = document.getElementById('socOverlay');
  if (o && !o.classList.contains('hidden')) {
    o.classList.add('hidden');
    const s = document.getElementById('socSheet');
    if (s) s.innerHTML = '';
  }
});

console.log('XSTREAM SOCIAL — E2E navegador\n');
const browser = await launchBrowser();
const shots = [];
try {
  /* ── usuarios A y B: contextos separados = dispositivos distintos ── */
  const ctxA = await browser.newContext({ viewport: { width: 1360, height: 860 } });
  const ctxB = await browser.newContext({ viewport: { width: 1360, height: 860 } });
  const A = await ctxA.newPage(), B = await ctxB.newPage();
  for (const p of [A, B]) { p.on('dialog', d => d.accept().catch(() => { })); await wirePage(p); }

  let nameA = '', nameB = '';
  await test('carga: identidad automática + interfaz lista', async () => {
    await A.goto(BASE + '/social/');
    await A.waitForSelector('#socMeName', { timeout: 15000 });
    await A.waitForFunction(() => !document.getElementById('socMeName').textContent.includes('Cargando'), null, { timeout: 15000 });
    nameA = await A.locator('#socMeName').textContent();
    ok(nameA && nameA.length > 1, 'nombre de identidad vacío');
    await B.goto(BASE + '/social/');
    await B.waitForFunction(() => !document.getElementById('socMeName').textContent.includes('Cargando'), null, { timeout: 15000 });
    nameB = await B.locator('#socMeName').textContent();
    ok(nameB.length > 1, 'nombre de B vacío');
  });

  let pidA = '';
  await test('publicar: aparece al instante (optimista) y persiste', async () => {
    await A.fill('#socPostText', 'Mi primera publicación en la comunidad #e2e 🎬');
    await A.click('#socPublish');
    await A.waitForSelector('#socFeed article.soc-post', { timeout: 15000 });
    pidA = await A.locator('#socFeed article.soc-post').first().getAttribute('data-pid');
    ok(pidA && pidA.startsWith('p'), 'pid de publicación inválido: ' + pidA);
  });

  let pidB = '';
  await test('feed en vivo: B publica y A lo ve sin recargar la página', async () => {
    await B.fill('#socPostText', 'Hola comunidad, soy B — spoilers de nada #e2e');
    await B.click('#socPublish');
    await B.waitForFunction(() => document.querySelectorAll('#socFeed article.soc-post').length >= 1, null, { timeout: 15000 });
    pidB = await B.locator('#socFeed article.soc-post').first().getAttribute('data-pid');
    await forceRefresh(A);
    await A.waitForFunction(() => document.querySelectorAll('#socFeed article.soc-post').length >= 2, null, { timeout: 15000 });
  });

  await test('borradores: el comentario a medias SOBREVIVE al refresco', async () => {
    const input = A.locator(`#socFeed article[data-pid="${pidB}"] .soc-comment-new input`);
    await input.fill('estaba escribiendo esto cuando llegó el refre');
    await forceRefresh(A);
    await A.waitForTimeout(1200);
    const val = await input.inputValue();
    ok(val.includes('estaba escribiendo esto'), 'el borrador se perdió: "' + val + '"');
  });

  await test('comentarios + ❤ en comentarios (clike)', async () => {
    const card = A.locator(`#socFeed article[data-pid="${pidB}"]`);
    await card.locator('.soc-comment-new input').fill('Gran aporte, B');
    await card.locator('.soc-comment-send').click();
    await card.locator('.soc-clike').first().waitFor({ timeout: 15000 });
    /* B refresca, ve el comentario de A y le da ❤ */
    await forceRefresh(B);
    const cardB = B.locator(`#socFeed article[data-pid="${pidB}"]`);
    await cardB.locator('.soc-clike').first().waitFor({ timeout: 15000 });
    await cardB.locator('.soc-clike').first().click();
    await B.waitForFunction(sel => {
      const b = document.querySelector(sel);
      return b && b.textContent.includes('1');
    }, `#socFeed article[data-pid="${pidB}"] .soc-clike`, { timeout: 15000 });
    ok(true);
  });

  await test('badge de notificaciones: like → badge 1 → abrir campana → badge 0', async () => {
    const likeBtn = B.locator(`#socFeed article[data-pid="${pidA}"] .lk`).first();
    await likeBtn.click();
    await forceRefresh(A);
    await A.waitForFunction(() => {
      const b = document.getElementById('socBellCount');
      return b && !b.hidden && b.textContent === '1';
    }, null, { timeout: 20000 });
    await A.click('#socBell');
    await A.waitForTimeout(600);
    const hidden = await A.locator('#socBellCount').evaluate ? await A.evaluate(() => document.getElementById('socBellCount').hidden) : true;
    ok(hidden, 'el badge no se limpió tras abrir la campana');
    const rows = await A.locator('#socNotifDrop .soc-nrow').count();
    ok(rows >= 1, 'la notificación no aparece en el desplegable');
  });

  await test('menú ⋯: borrar la propia publicación (con confirmación)', async () => {
    await A.fill('#socPostText', 'Post efímero que voy a borrar');
    await A.click('#socPublish');
    await A.waitForFunction(() => document.querySelectorAll('#socFeed article.soc-post').length >= 3, null, { timeout: 15000 });
    const target = A.locator('#socFeed article.soc-post', { hasText: 'Post efímero' }).first();
    const pid = await target.getAttribute('data-pid');
    await target.locator('.soc-post-menu').click();
    await A.locator('.soc-menu button[data-m="del"]').click();
    await A.waitForFunction(pid2 => !document.querySelector(`#socFeed article[data-pid="${pid2}"]`), pid, { timeout: 15000 });
    /* el borrado viaja a B por la lápida del delta */
    await forceRefresh(B);
    await B.waitForFunction(pid2 => !document.querySelector(`#socFeed article[data-pid="${pid2}"]`), pid, { timeout: 15000 });
    ok(true);
  });

  await test('menú ⋯: reportar la publicación de otro', async () => {
    const card = B.locator(`#socFeed article[data-pid="${pidA}"]`);
    await card.locator('.soc-post-menu').click();
    await B.locator('.soc-menu button[data-m="report"]').click();
    await B.waitForSelector('#ssRepGo', { timeout: 10000 });
    await B.click('#ssRepGo');
    await B.waitForTimeout(900);
    const posts = await (await realFetch(BASE + '/__test/gh?p=social/posts.json')).json();
    ok(posts.reports && posts.reports.length === 1, 'el reporte no llegó al almacén');
    ok(posts.reports[0].postId === pidA, 'el reporte apunta a otra publicación');
  });

  await test('historias: crear → ver desde B → espectadores reales en el servidor', async () => {
    /* A crea una historia de texto */
    const mineStory = A.locator('.soc-story', { hasText: 'Tu historia' }).first();
    await mineStory.click();
    await A.waitForSelector('#ssGo', { timeout: 10000 });
    await A.fill('#ssText', 'Historia de prueba E2E');
    await A.click('#ssGo');
    await A.waitForTimeout(900);
    /* B la ve y la abre → cuenta la vista */
    await forceRefresh(B);
    await dismissSheets(B);
    const bubble = B.locator('.soc-story', { hasText: nameA.trim().split(' ')[0] }).first();
    await bubble.waitFor({ timeout: 15000 });
    await bubble.click();
    await B.waitForTimeout(1300);
    const posts = await (await realFetch(BASE + '/__test/gh?p=social/posts.json')).json();
    const st = posts.stories.find(s => s.text === 'Historia de prueba E2E');
    ok(st, 'la historia no llegó al almacén');
    ok((st.views || []).length === 1, 'la vista de B no se contó: ' + JSON.stringify(st.views));
  });

  await test('chat DM: mensaje de A→B, no leído, respuesta y limpieza', async () => {
    await dismissSheets(A);
    /* A: pestaña Descubre del dock → fila de sugeridos (abre perfil) → Mensaje */
    await forceRefresh(A);
    await A.click('#socDockTabs button[data-t="descubre"]');
    const suggA = A.locator('#socSuggest .soc-suggest-it').first();
    await suggA.waitFor({ timeout: 15000 });
    await suggA.click();
    await A.locator('#socSheet .soc-btn', { hasText: 'Mensaje' }).first().waitFor({ timeout: 10000 });
    await A.locator('#socSheet .soc-btn', { hasText: 'Mensaje' }).first().click();
    await A.waitForSelector('#ssMsgIn', { timeout: 10000 });
    await A.fill('#ssMsgIn', 'hola B, saludos de A');
    /* envío con verificación: si el input retiene el texto, reintenta */
    for (let attempt = 0; attempt < 3; attempt++) {
      await A.press('#ssMsgIn', 'Enter');
      try {
        await A.waitForFunction(() => document.getElementById('ssMsgs') && document.getElementById('ssMsgs').textContent.includes('hola B'), null, { timeout: 8000 });
        break;
      } catch (e) {
        if (attempt === 2) throw e;
        const diag = await A.evaluate(() => document.querySelector('.soc-toast') ? document.querySelector('.soc-toast').textContent : '');
        console.log('      reintento de envío (' + (attempt + 1) + ') — toast: "' + diag + '"');
      }
    }
    /* B recibe: badge de mensajes y abre el chat */
    await dismissSheets(B);
    await forceRefresh(B);
    await B.waitForFunction(() => {
      const m = document.getElementById('socMsgCount');
      return m && !m.hidden;
    }, null, { timeout: 20000 });
    await B.click('#socDockTabs button[data-t="descubre"]');
    const suggB = B.locator('#socSuggest .soc-suggest-it').first();
    await suggB.waitFor({ timeout: 15000 });
    await suggB.click();
    await B.locator('#socSheet .soc-btn', { hasText: 'Mensaje' }).first().waitFor({ timeout: 10000 });
    await B.locator('#socSheet .soc-btn', { hasText: 'Mensaje' }).first().click();
    await B.waitForFunction(() => document.getElementById('ssMsgs') && document.getElementById('ssMsgs').textContent.includes('hola B'), null, { timeout: 15000 });
    await B.fill('#ssMsgIn', '¡hola A! todo bien');
    await B.press('#ssMsgIn', 'Enter');
    /* A recibe la respuesta por el poll de 6 s */
    await A.waitForFunction(() => document.getElementById('ssMsgs') && document.getElementById('ssMsgs').textContent.includes('hola A'), null, { timeout: 15000 });
    ok(true);
  });
  /* B ya no hace falta: su silencio hace el delta ETag determinista */
  await ctxB.close();

  let backupBlob = '';
  await test('seguridad: exportar respaldo cifrado de la cuenta', async () => {
    await dismissSheets(A);
    await A.click('#socMe');
    await A.locator('#socMeDrop button[data-me="seguridad"]').click();
    await A.waitForSelector('#ssSecExp', { timeout: 10000 });
    await A.fill('#ssSecPass1', 'frase-secreta-e2e');
    await A.click('#ssSecExp');
    await A.waitForFunction(() => document.getElementById('ssSecBlob').value.startsWith('XBAK1.'), null, { timeout: 15000 });
    backupBlob = await A.locator('#ssSecBlob').inputValue();
    ok(backupBlob.length > 100, 'respaldo sospechosamente corto');
    const p = path.join(SHOTS, '04-seguridad.png');
    await A.screenshot({ path: p }); shots.push(p);
  });

  await test('recuperación: un dispositivo NUEVO restaura la cuenta (uid + clave)', async () => {
    const ctxC = await browser.newContext({ viewport: { width: 1360, height: 860 } });
    const C = await ctxC.newPage();
    C.on('dialog', d => d.accept().catch(() => { }));
    await wirePage(C);
    try {
      await C.goto(BASE + '/social/');
      await C.waitForFunction(() => !document.getElementById('socMeName').textContent.includes('Cargando'), null, { timeout: 15000 });
      const nameC0 = await C.locator('#socMeName').textContent();
      ok(nameC0 !== nameA, 'el dispositivo nuevo no debería ser la misma cuenta aún');
      await C.click('#socMe');
      await C.locator('#socMeDrop button[data-me="seguridad"]').click();
      await C.waitForSelector('#ssSecImp', { timeout: 10000 });
      await C.fill('#ssSecBlob', backupBlob);
      await C.fill('#ssSecPass2', 'frase-secreta-e2e');
      await C.click('#ssSecImp');
      await C.waitForFunction(n => document.getElementById('socMeName').textContent === n, nameA, { timeout: 20000 });
      /* la restauración programa un reload (900 ms): dejarlo pasar y esperar al compositor */
      await C.waitForTimeout(1800);
      await C.waitForSelector('#socPostText', { timeout: 20000 });
      await C.waitForFunction(() => !document.getElementById('socMeName').textContent.includes('Cargando'), null, { timeout: 15000 });
      /* y la cuenta restaurada puede publicar con la MISMA uid (TOFU acepta) */
      await C.fill('#socPostText', 'Publicado desde el dispositivo recuperado');
      await C.click('#socPublish');
      /* esperar EL artículo concreto (solo existe tras la respuesta del servidor) */
      await C.waitForFunction(() => [...document.querySelectorAll('#socFeed article.soc-post')]
        .some(a => a.textContent.includes('dispositivo recuperado')), null, { timeout: 20000 });
      await C.waitForTimeout(400);
      const posts = await (await realFetch(BASE + '/__test/gh?p=social/posts.json')).json();
      ok(posts.posts.some(p => p.text === 'Publicado desde el dispositivo recuperado'), 'la publicación del dispositivo recuperado no llegó');
    } finally {
      await ctxC.close();   /* SIEMPRE: un contexto vivo latiendo rompería el delta ETag */
    }
  });

  await test('delta ETag: refrescos en reposo responden same:true (cero payload)', async () => {
    const sameBodies = [];
    const onResp = async resp => {
      try {
        if (resp.url().includes('/api/social') && resp.request().method() === 'GET') {
          const t = await resp.text();
          if (t.includes('"same"')) sameBodies.push(t);
        }
      } catch (e) { }
    };
    A.on('response', onResp);
    await dismissSheets(A);
    for (let i = 0; i < 3; i++) {
      await forceRefresh(A);
      await A.waitForTimeout(1100);
    }
    A.off('response', onResp);
    ok(sameBodies.length >= 1, 'ningún refresco respondió same:true — el delta ETag no funciona');
  });

  await test('búsqueda de personas: el servidor encuentra a TODA la comunidad', async () => {
    await A.fill('#socSearch', nameB.trim().split(' ')[0]);
    await A.waitForTimeout(1400);
    await A.waitForSelector('#socSearchDrop:not(.hidden)', { timeout: 8000 });
    const hasPerson = await A.locator('#socSearchDrop .soc-sr[data-usr]').count();
    ok(hasPerson >= 1, 'la búsqueda no encontró a B por su nombre');
  });

  await test('móvil: nav inferior con Amigos y Grupos', async () => {
    const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const M = await ctxM.newPage();
    M.on('dialog', d => d.accept().catch(() => { }));
    await wirePage(M);
    await M.goto(BASE + '/social/');
    await M.waitForFunction(() => !document.getElementById('socMeName').textContent.includes('Cargando'), null, { timeout: 15000 });
    const navs = await M.locator('#socMob a').count();
    ok(navs === 7, 'la nav móvil debería tener 7 destinos, tiene ' + navs);
    ok(await M.locator('#socMob a[data-nav="amigos"]').count() === 1, 'falta Amigos en la nav móvil');
    ok(await M.locator('#socMob a[data-nav="grupos"]').count() === 1, 'falta Grupos en la nav móvil');
    /* los nuevos destinos navegan de verdad */
    await M.locator('#socMob a[data-nav="amigos"]').click();
    await M.waitForSelector('#socSheet .soc-card-h', { timeout: 8000 });
    ok((await M.locator('#socSheet').textContent()).includes('Amigos'), 'Amigos no abrió su hoja');
    const p = path.join(SHOTS, '03-movil.png');
    await M.screenshot({ path: p }); shots.push(p);
    await ctxM.close();
  });

  await test('enlace Comunidad desde el sitio principal → /social/', async () => {
    await A.goto(BASE + '/index.html');
    await A.waitForSelector('#comunidadLink', { timeout: 20000 });
    const href = await A.locator('#comunidadLink').getAttribute('href');
    ok(/social\/(index\.html)?$/i.test(href || ''), 'href inesperado: ' + href);
    await A.click('#comunidadLink');
    await A.waitForFunction(() => location.pathname.startsWith('/social'), null, { timeout: 20000 });
    ok(true);
  });

  /* captura de escritorio del feed para revisión visual */
  {
    await A.goto(BASE + '/social/');
    await A.waitForSelector('#socFeed article.soc-post', { timeout: 20000 });
    await A.waitForTimeout(1500);
    const p = path.join(SHOTS, '01-feed-escritorio.png');
    await A.screenshot({ path: p, fullPage: false }); shots.push(p);
  }
} finally {
  await browser.close().catch(() => { });
  server.close();
}

console.log('');
if (failed) {
  console.log(`XX ${failed} prueba(s) fallaron de ${passed + failed}`);
  for (const f of failures) console.log('  XX ' + f.name + '\n' + (f.e && f.e.stack || '').split('\n').slice(0, 3).join('\n'));
  process.exit(1);
} else {
  console.log(`OK: TODAS las pruebas E2E pasaron (${passed}/${passed + failed})`);
  console.log('Capturas: ' + shots.join('  '));
}
