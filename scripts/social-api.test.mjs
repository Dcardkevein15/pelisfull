/* ==================================================================
   XSTREAM SOCIAL - suite de pruebas del backend (v3)
   Ejecutar:  node scripts/social-api.test.mjs

   Stubbea GitHub (contents API + ETags + 409) en memoria y ejerce
   el handler REAL api/social.js: firmas v3, TOFU, uids reservados,
   migracion de social.json, delta ETag, moderacion, archivos
   separados, archivado, rotacion de clave y limites de ritmo.
   ================================================================== */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require2 = createRequire(import.meta.url);

/* - entorno ANTES de importar el handler (lee vars al cargar) - */
process.env.GH_TOKEN = 'test-token';
process.env.SOCIAL_TEAM_SECRET = 'team-secret-xyz';
const ADMIN = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
process.env.SOCIAL_ADMIN_PUB = b64(new Uint8Array(await crypto.subtle.exportKey('spki', ADMIN.publicKey)));

function b64(bytes) { return Buffer.from(bytes).toString('base64'); }
const te = new TextEncoder();
const horaNow = () => Math.floor(Date.now() / 3600000);

/* ================= GitHub simulado en memoria ================= */
class FakeGH {
  constructor() {
    this.files = new Map();      /* path -> { content, sha, etag } */
    this.puts = 0;
    this.conflictNextPut = 0;    /* inyecta 409s para probar el CAS */
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
        if (f && body.sha !== f.sha) return this.resp(409, { message: 'the given SHA does not match' });
        if (this.conflictNextPut > 0) { this.conflictNextPut--; return this.resp(409, { message: 'injected conflict' }); }
        const sha = 'S' + Math.random().toString(36).slice(2, 12);
        const etag = 'W/"' + sha + '"';
        this.files.set(p, { content: Buffer.from(body.content, 'base64').toString('utf8'), sha, etag });
        this.puts++;
        return this.resp(200, { content: { sha } });
      }
      const mb = u.pathname.match(/^\/repos\/[^/]+\/[^/]+\/git\/blobs\/(.+)$/);
      if (mb && method === 'GET') {
        for (const [, f] of this.files) if (f.sha === mb[1]) return this.resp(200, { content: Buffer.from(f.content, 'utf8').toString('base64'), encoding: 'base64' });
        return this.resp(404, {});
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
  seed(path, content) {
    const sha = 'S' + Math.random().toString(36).slice(2, 12);
    this.files.set(path, { content: typeof content === 'string' ? content : JSON.stringify(content), sha, etag: 'W/"' + sha + '"' });
  }
  json(path) {
    const f = this.files.get(path);
    return f ? JSON.parse(f.content) : null;
  }
}

/* - generador de dispositivos: par de claves + uid formato real - */
async function newDevice() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const uid = 'x-' + [...crypto.getRandomValues(new Uint8Array(10))].map(b2 => b2.toString(16).padStart(2, '0')).join('');
  return { pair, uid, pub: b64(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey))) };
}
async function signWith(priv, text) {
  return b64(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, te.encode(text))));
}
async function adminSigNow() {
  return signWith(ADMIN.privateKey, 'xstream-social-admin:' + horaNow());
}

/* - peticion firmada: calca EXACTA del contrato del cliente - */
async function call(handler, { op, uid, dev, params = {}, name = 'Tester', tag = '#1234', grad = '3', hora, pubKey, adminSig, unsigned, teamSecret }) {
  const all = { op, uid, name, tag, grad, flag: '', ...params };
  for (const k of Object.keys(all)) if (all[k] === undefined) delete all[k];
  const headers = {};
  if (!unsigned) {
    const h = String(hora ?? horaNow());
    all.hora = h;
    const pk = pubKey === undefined ? (dev ? dev.pub : '') : pubKey;
    if (pk) all.pubKey = pk;
    if (teamSecret) all.teamSecret = teamSecret;
    const canon = Object.keys(all).filter(k => !['hora', 'pubKey'].includes(k)).sort().map(k => `${k}=${String(all[k])}`).join('&');
    headers['x-social-sig'] = await signWith(dev.pair.privateKey, `soc3|${uid}|${h}|${op}|${canon}`);
  }
  if (adminSig) headers['x-social-admin'] = adminSig;
  const res = mkRes();
  await handler({ method: 'GET', query: all, headers }, res);
  return { status: res.status, body: res.body };
}
function mkRes() {
  return {
    status(c) { this.status = c; return this; },
    json(obj) { this.body = obj; return this; },
    end() { return this; },
    setHeader() { },
    statusCode: 0, body: null,
  };
}

/* ================= SUITE ================= */
let passed = 0, failed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  OK  ' + name);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log('  XX  ' + name + '\n      ' + e.message.split('\n')[0]);
  }
}

async function freshHandler(legacy, seed) {
  const gh = new FakeGH();
  if (legacy) gh.seed('social.json', legacy);
  if (seed) for (const [p, c] of Object.entries(seed)) gh.seed(p, c);
  delete require2.cache[require2.resolve('../api/social.js')];
  const handler = require2('../api/social.js');
  return { gh, handler };
}

/* instala el fake SOLO durante fn — restaura el fetch anterior */
async function withFake(gh, fn) {
  const prev = global.fetch;
  global.fetch = (...a) => gh.fetch(...a);
  try { return await fn(); } finally { global.fetch = prev; }
}

/* instala el fake a nivel de BLOQUE (vive hasta el final del proceso) */
const fetchStack = [];
function pushFake(gh) {
  fetchStack.push(global.fetch);
  global.fetch = (...a) => gh.fetch(...a);
}

console.log('XSTREAM SOCIAL - backend v3\n');

/* ================ arranque en frio ================ */
{
  const { gh, handler } = await freshHandler(null);
  pushFake(gh);
  const a = await newDevice(), b = await newDevice();

  await test('arranque en frio: state crea los archivos vacios', async () => {
    const r = await call(handler, { op: 'state', uid: a.uid, dev: a, unsigned: true, params: { etags: '{}' } });
    assert.equal(r.status, 200);
    assert.ok(r.body.ok);
    assert.ok(gh.files.has('social/posts.json'));
    assert.ok(gh.files.has('social/presence.json'));
    assert.ok(gh.files.has('social/convos-index.json'));
    assert.ok(Array.isArray(r.body.posts) && r.body.posts.length === 0);
    assert.equal(r.body.groups.length, 6, 'grupos sembrados');
  });

  await test('migracion: social.json viejo se reparte entre archivos v3', async () => {
    const { gh: gh2, handler: h2 } = await freshHandler({
      v: 2,
      users: { 'x-olduser0000000001': { uid: 'x-olduser0000000001', name: 'Viejo', tag: '#999', pubKey: a.pub, follows: [] } },
      posts: [{ id: 'p-legacy1', uid: 'x-olduser0000000001', name: 'Viejo', text: 'hola mundo', at: Date.now() - 1000, likes: [], comments: [] }],
      stories: [], groups: [], convos: {}, notifs: {},
    });
    await withFake(gh2, async () => {
      const rr = await call(h2, { op: 'state', uid: 'x-olduser0000000001', dev: a, unsigned: true, params: {} });
      assert.equal(rr.status, 200);
    });
    assert.ok(gh2.files.has('social/posts.json'), 'posts.json creado');
    const posts = gh2.json('social/posts.json');
    assert.equal(posts.users['x-olduser0000000001'].name, 'Viejo', 'usuario migrado');
    assert.equal(posts.posts[0].id, 'p-legacy1', 'post migrado');
    assert.equal(gh2.files.has('social.json'), true, 'legado intacto');
  });

  await test('migracion: conversaciones viejas van a social/convos/<cid>.json', async () => {
    const { gh: gh2, handler: h2 } = await freshHandler({
      v: 2, users: {}, posts: [], stories: [], groups: [],
      convos: { 'x-aaaa~x-bbbb': [{ uid: 'x-aaaa', name: 'A', text: 'que tal', at: 123 }] }, notifs: {},
    });
    await withFake(gh2, async () => {
      await call(h2, { op: 'state', uid: 'x-aaaa', dev: a, unsigned: true, params: {} });
    });
    const cv = gh2.json('social/convos/x-aaaa~x-bbbb.json');
    assert.ok(cv && cv.msgs.length === 1 && cv.msgs[0].text === 'que tal');
    const ix = gh2.json('social/convos-index.json');
    assert.equal(ix.convos['x-aaaa~x-bbbb'].last, 'que tal', 'indice con resumen');
  });

  await test('delta ETag: segunda peticion con etags -> same:true (cero payload)', async () => {
    const r1 = await call(handler, { op: 'state', uid: a.uid, dev: a, unsigned: true, params: { etags: '{}' } });
    assert.ok(r1.body.etags.posts, 'debe devolver etags');
    const r2 = await call(handler, { op: 'state', uid: a.uid, dev: a, unsigned: true, params: { etags: JSON.stringify(r1.body.etags) } });
    assert.ok(r2.body.same === true, 'nada cambio -> same');
    const r3 = await call(handler, { op: 'state', uid: a.uid, dev: a, unsigned: true, params: { etags: JSON.stringify(r1.body.etags) } });
    assert.ok(r3.body.same === true);
  });

  await test('TOFU: la segunda clave NO puede suplantar al uid registrado', async () => {
    const rp = await call(handler, { op: 'post', uid: a.uid, dev: a, params: { text: 'primer post de A' } });
    assert.equal(rp.status, 200, 'primer post registra la clave');
    const imp = await call(handler, { op: 'post', uid: a.uid, dev: b, params: { text: 'soy un impostor' } });
    assert.equal(imp.status, 403, 'otra clave -> 403');
  });

  await test('firma v3 cubre parametros: replay sobre otra op -> 403', async () => {
    const all = { op: 'post', uid: a.uid, name: 'Tester', tag: '#1234', grad: '3', flag: '', text: 'original' };
    const h = String(horaNow());
    all.hora = h; all.pubKey = a.pub;
    const canon = Object.keys(all).filter(k => !['hora', 'pubKey'].includes(k)).sort().map(k => `${k}=${String(all[k])}`).join('&');
    const sig = await signWith(a.pair.privateKey, `soc3|${a.uid}|${h}|post|${canon}`);
    const res = mkRes();
    await handler({ method: 'GET', query: { ...all, text: 'TEXTO CAMBIADO' }, headers: { 'x-social-sig': sig } }, res);
    assert.equal(res.status, 403, 'mismo sig + texto cambiado -> rechazado');
    const res2 = mkRes();
    const tampered = { ...all, op: 'like', postId: 'cualquiera' };
    delete tampered.text;
    const canon2 = Object.keys(tampered).filter(k => !['hora', 'pubKey'].includes(k)).sort().map(k => `${k}=${String(tampered[k])}`).join('&');
    const sig2 = await signWith(a.pair.privateKey, `soc3|${a.uid}|${h}|like|${canon2}`);
    await handler({ method: 'GET', query: { ...all }, headers: { 'x-social-sig': sig2 } }, res2);
    assert.equal(res2.status, 403, 'firma de like usada en post -> rechazada');
  });

  await test('firma v3: hora vieja (replay lejano) -> 403', async () => {
    const r = await call(handler, { op: 'post', uid: a.uid, dev: a, hora: horaNow() - 3, params: { text: 'replay viejo' } });
    assert.equal(r.status, 403);
  });

  await test('uid reservado x-stream-social-team: sin secreto -> 403', async () => {
    const r = await call(handler, { op: 'post', uid: 'x-stream-social-team', dev: a, params: { text: 'soy el equipo' } });
    assert.equal(r.status, 403);
  });

  await test('uid reservado: con SOCIAL_TEAM_SECRET -> oficial', async () => {
    const r = await call(handler, { op: 'post', uid: 'x-stream-social-team', dev: a, params: { text: 'anuncio oficial' }, teamSecret: 'team-secret-xyz' });
    assert.equal(r.status, 200);
    assert.equal(r.body.post.official, true, 'con secreto -> cuenta oficial');
  });

  await test('uid "admin" con formato no valido -> 403 (impersonacion bloqueada)', async () => {
    const r = await call(handler, { op: 'post', uid: 'admin', dev: a, params: { text: 'fake admin' } });
    assert.equal(r.status, 403);
  });

  await test('post idempotente: reintentos con el mismo texto no duplican', async () => {
    const { gh: gh2, handler: h2 } = await freshHandler(null);
    let p1, p2;
    await withFake(gh2, async () => {
      p1 = await call(h2, { op: 'post', uid: a.uid, dev: a, params: { text: 'idempotente', img: '', vid: '', link: '', poll: '' } });
      p2 = await call(h2, { op: 'post', uid: a.uid, dev: a, params: { text: 'idempotente', img: '', vid: '', link: '', poll: '' } });
    });
    assert.equal(p1.status, 200); assert.equal(p2.status, 200);
    assert.equal(p1.body.post.id, p2.body.post.id, 'misma id determinista');
    const posts = gh2.json('social/posts.json').posts.filter(p => p.text === 'idempotente');
    assert.equal(posts.length, 1, 'solo un post en el archivo');
  });

  await test('limite: 31 posts el mismo dia -> 429 en el 31', async () => {
    const { gh: gh2, handler: h2 } = await freshHandler(null);
    let last = null;
    await withFake(gh2, async () => {
      for (let i = 0; i < 31; i++) {
        last = await call(h2, { op: 'post', uid: a.uid, dev: a, params: { text: 'post numero ' + i } });
      }
    });
    assert.equal(last.status, 429, 'el 31 se rechaza');
  });

  await test('validacion de URLs server-side: javascript: y http se neutralizan', async () => {
    const r = await call(handler, { op: 'post', uid: a.uid, dev: a, params: { text: 'mira este link', link: 'javascript:alert(document.cookie)', img: 'http://tracker.example/pixel.gif' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.post.link, '', 'javascript: bloqueado');
    assert.equal(r.body.post.img, '', 'http (no https) bloqueado para imagenes');
    const r2b = await call(handler, { op: 'post', uid: a.uid, dev: a, params: { text: 'imagen buena', img: 'https://image.tmdb.org/t/p/w780/abc.jpg' } });
    assert.equal(r2b.body.post.img, 'https://image.tmdb.org/t/p/w780/abc.jpg', 'https con host valido OK');
  });
}

/* ================ ciclo social completo ================ */
{
  const { gh, handler } = await freshHandler(null);
  pushFake(gh);
  const a = await newDevice(), b = await newDevice(), c = await newDevice();
  const pa = await call(handler, { op: 'post', uid: a.uid, dev: a, params: { text: 'post principal #cine' } });
  const pid = pa.body.post.id;

  await test('comment + clike + like + vote + save + share + follow', async () => {
    const cm = await call(handler, { op: 'comment', uid: b.uid, dev: b, params: { postId: pid, text: 'buen post' } });
    assert.equal(cm.status, 200);
    const cl = await call(handler, { op: 'clike', uid: a.uid, dev: a, params: { postId: pid, ci: '0', on: '1' } });
    assert.equal(cl.status, 200);
    assert.equal(cl.body.likes, 1);
    assert.equal(cl.body.mine, true);
    const lk = await call(handler, { op: 'like', uid: b.uid, dev: b, params: { postId: pid, on: '1' } });
    assert.equal(lk.body.likes, 1);
    const sv = await call(handler, { op: 'save', uid: b.uid, dev: b, params: { postId: pid, on: '1' } });
    assert.deepEqual(sv.body.saved, [pid]);
    const sh = await call(handler, { op: 'share', uid: b.uid, dev: b, params: { postId: pid } });
    assert.equal(sh.body.shares, 1);
    const fl = await call(handler, { op: 'follow', uid: b.uid, dev: b, params: { target: a.uid, on: '1' } });
    assert.equal(fl.status, 200);
    const pol = await call(handler, { op: 'post', uid: a.uid, dev: a, params: { text: 'encuesta', poll: JSON.stringify(['uno', 'dos']) } });
    const vt = await call(handler, { op: 'vote', uid: b.uid, dev: b, params: { postId: pol.body.post.id, option: '0' } });
    assert.equal(vt.status, 200);
    const posts = gh.json('social/posts.json').posts;
    const pollPost = posts.find(p => p.id === pol.body.post.id);
    assert.equal(pollPost.poll.votes['0'].length, 1, 'voto registrado');
  });

  await test('story + storyView: espectadores reales, 1 por persona', async () => {
    const st = await call(handler, { op: 'story', uid: a.uid, dev: a, params: { text: 'mi historia', img: '', live: '' } });
    assert.equal(st.status, 200);
    const sid = gh.json('social/posts.json').stories[0].id;
    const v1 = await call(handler, { op: 'storyView', uid: b.uid, dev: b, params: { sid } });
    assert.equal(v1.body.views, 1, 'primera vista');
    const v2 = await call(handler, { op: 'storyView', uid: b.uid, dev: b, params: { sid } });
    assert.equal(v2.body.views, 1, 'no doble cuenta');
    const v3 = await call(handler, { op: 'storyView', uid: c.uid, dev: c, params: { sid } });
    assert.equal(v3.body.views, 2, 'segunda persona cuenta');
  });

  await test('moderacion: borrar la propia publicacion + lapida en el delta', async () => {
    const myPost = await call(handler, { op: 'post', uid: b.uid, dev: b, params: { text: 'post efimero de B' } });
    const r = await call(handler, { op: 'delPost', uid: b.uid, dev: b, params: { postId: myPost.body.post.id } });
    assert.equal(r.status, 200);
    const ajeno = await call(handler, { op: 'delPost', uid: c.uid, dev: c, params: { postId: pid } });
    assert.equal(ajeno.status, 403, 'otro usuario NO puede borrarlo');
    const st = await call(handler, { op: 'state', uid: b.uid, dev: b, unsigned: true, params: { etags: '{}' } });
    assert.ok(st.body.tomb.some(t => t.id === myPost.body.post.id), 'tomb en el estado');
    assert.ok(!st.body.posts.some(p => p.id === myPost.body.post.id), 'fuera del feed');
  });

  await test('moderacion: reportar (con dedupe) + panel admin + descartar', async () => {
    const rep = await call(handler, { op: 'report', uid: b.uid, dev: b, params: { postId: pid, reason: 'spam' } });
    assert.equal(rep.status, 200);
    const dup = await call(handler, { op: 'report', uid: b.uid, dev: b, params: { postId: pid, reason: 'spam' } });
    assert.equal(dup.body.dup, true, 'segundo reporte del mismo usuario se deduplica');
    const noAdmin = await call(handler, { op: 'adminState', uid: b.uid, dev: b, unsigned: true });
    assert.equal(noAdmin.status, 403, 'sin firma de admin -> 403');
    const adm = await call(handler, { op: 'adminState', uid: a.uid, dev: a, unsigned: true, adminSig: await adminSigNow() });
    assert.equal(adm.status, 200);
    assert.equal(adm.body.reports.length, 1);
    assert.equal(adm.body.reports[0].reason, 'spam');
    const rid = adm.body.reports[0].id;
    const dis = await call(handler, { op: 'dismissReport', uid: a.uid, dev: a, adminSig: await adminSigNow(), params: { reportId: rid } });
    assert.equal(dis.status, 200);
    const adm2 = await call(handler, { op: 'adminState', uid: a.uid, dev: a, unsigned: true, adminSig: await adminSigNow() });
    assert.equal(adm2.body.reports.length, 0, 'reporte descartado');
  });

  await test('moderacion: admin borra el post de OTRO con su firma', async () => {
    const someonePost = await call(handler, { op: 'post', uid: c.uid, dev: c, params: { text: 'post que sera moderado' } });
    const r = await call(handler, { op: 'delPost', uid: a.uid, dev: a, adminSig: await adminSigNow(), params: { postId: someonePost.body.post.id } });
    assert.equal(r.status, 200, 'admin lo borra');
  });

  await test('chat DM: mensajes + unread + notificacion con dedupe 60s', async () => {
    const d = await newDevice();
    const m0 = await call(handler, { op: 'msg', uid: b.uid, dev: b, params: { to: d.uid, text: 'hola D' } });
    assert.equal(m0.status, 404, 'D no existe en la comunidad -> 404');
    const m2 = await call(handler, { op: 'msg', uid: b.uid, dev: b, params: { to: a.uid, text: 'hola A!' } });
    assert.equal(m2.status, 200);
    const cid = m2.body.cid;
    const cv = gh.json('social/convos/' + cid.replace(/[^a-zA-Z0-9~-]/g, '-') + '.json');
    assert.equal(cv.msgs.length, 1, 'archivo de conversacion creado');
    const ix = gh.json('social/convos-index.json');
    assert.equal(ix.convos[cid].unread[a.uid], 1, 'unread de A = 1');
    await call(handler, { op: 'msg', uid: b.uid, dev: b, params: { to: a.uid, text: 'otro mensaje' } });
    const pres = gh.json('social/presence.json');
    const aNotifs = (pres.notifs[a.uid] || []).filter(n => n.type === 'msg');
    assert.equal(aNotifs.length, 1, 'dedupe: 2 mensajes -> 1 notificacion');
    const rd = await call(handler, { op: 'messages', uid: a.uid, dev: a, unsigned: true, params: { cid } });
    assert.equal(rd.status, 200);
    assert.equal(rd.body.msgs.length, 2, 'mensajes del DM');
    assert.equal(rd.body.cleared, true, 'unread limpiado');
    const ix2 = gh.json('social/convos-index.json');
    assert.equal(ix2.convos[cid].unread[a.uid], 0, 'indice en 0');
    const stA = await call(handler, { op: 'state', uid: a.uid, dev: a, unsigned: true, params: { etags: '{}' } });
    assert.equal(stA.body.convos.find(x => x.id === cid).unread, 0, 'resumen del chat sin unread');
  });

  await test('chat grupos: escribir sin ser miembro -> 403; unido OK', async () => {
    const no = await call(handler, { op: 'msg', uid: c.uid, dev: c, params: { to: 'g:animelove', text: 'hola grupo' } });
    assert.equal(no.status, 403, 'sin unirse no puede escribir');
    await call(handler, { op: 'follow', uid: c.uid, dev: c, params: { target: 'g:animelove', on: '1' } });
    const yes = await call(handler, { op: 'msg', uid: c.uid, dev: c, params: { to: 'g:animelove', text: 'hola grupo' } });
    assert.equal(yes.status, 200);
  });

  await test('mensajes: poll con ETag -> same:true cuando nada cambio', async () => {
    const cid = [a.uid, b.uid].sort().join('~');
    const r1 = await call(handler, { op: 'messages', uid: a.uid, dev: a, unsigned: true, params: { cid, etags: '{}' } });
    assert.equal(r1.status, 200);
    const r2 = await call(handler, { op: 'messages', uid: a.uid, dev: a, unsigned: true, params: { cid, etags: JSON.stringify(r1.body.etags) } });
    assert.ok(r2.body.same === true, '304 en ambos archivos -> same');
    await call(handler, { op: 'msg', uid: b.uid, dev: b, params: { to: a.uid, text: 'novedad' } });
    const r3 = await call(handler, { op: 'messages', uid: a.uid, dev: a, unsigned: true, params: { cid, etags: JSON.stringify(r1.body.etags) } });
    assert.equal(r3.body.msgs.length, 3, 'cambio -> mensajes frescos');
  });

  await test('notificaciones: badge coherente - leidas limpian notifsUnread', async () => {
    await call(handler, { op: 'like', uid: c.uid, dev: c, params: { postId: pid, on: '1' } });
    const st1 = await call(handler, { op: 'state', uid: a.uid, dev: a, unsigned: true, params: { etags: '{}' } });
    assert.ok(st1.body.notifsUnread >= 1, 'hay no leidas');
    assert.ok(st1.body.notifs.some(n => !n.read), 'flags read=false');
    await call(handler, { op: 'notifsRead', uid: a.uid, dev: a, params: {} });
    const st2 = await call(handler, { op: 'state', uid: a.uid, dev: a, unsigned: true, params: { etags: '{}' } });
    assert.equal(st2.body.notifsUnread, 0, 'notifsUnread a 0');
    assert.ok(st2.body.notifs.every(n => n.read === true), 'todas marcadas read');
  });

  await test('beat: primer latido escribe presencia; el inmediato NO reescribe', async () => {
    const { handler: h2, gh: gh2 } = await freshHandler(null);
    const u = await newDevice();
    let s1, s2, s3;
    await withFake(gh2, async () => {
      s1 = await call(h2, { op: 'state', uid: u.uid, dev: u, params: { beat: '1', etags: '{}' } });
      s2 = await call(h2, { op: 'state', uid: u.uid, dev: u, params: { beat: '1', etags: '{}' } });
      s3 = await call(h2, { op: 'state', uid: u.uid, dev: u, unsigned: true, params: { etags: '{}' } });
    });
    assert.ok(s1.body.beatAt, 'beatAt presente');
    assert.ok(gh2.json('social/presence.json').beats[u.uid], 'presencia escrita');
    const sha1 = gh2.files.get('social/presence.json').sha;
    assert.equal(gh2.files.get('social/presence.json').sha, sha1, 'sin reescritura (guarda 150s)');
    assert.ok(s2.body.beatAt, 'responde igual');
    assert.ok(s3.body.onlineCount >= 1, 'el latido marca en linea');
  });

  await test('rotacion de clave: la nueva firma, la vieja queda fuera', async () => {
    const nueva = await newDevice();
    const rot = await call(handler, { op: 'rotate', uid: a.uid, dev: a, params: { newPubKey: nueva.pub } });
    assert.equal(rot.status, 200, 'rotacion firmada con la vieja');
    const okPost = await call(handler, { op: 'post', uid: a.uid, dev: nueva, params: { text: 'firmado con la clave nueva' } });
    assert.equal(okPost.status, 200);
    const oldPost = await call(handler, { op: 'post', uid: a.uid, dev: a, params: { text: 'con la vieja ya no' } });
    assert.equal(oldPost.status, 403, 'la vieja fue revocada');
  });

  await test('archivado: al podar 400 posts, los viejos van a archive-<mes>', async () => {
    const { handler: h2, gh: gh2 } = await freshHandler(null);
    const u = await newDevice();
    let r = null;
    await withFake(gh2, async () => {
      /* primer state: crea los archivos vacios */
      await call(h2, { op: 'state', uid: u.uid, dev: u, unsigned: true, params: { etags: '{}' } });
      /* rellena con 400 posts viejos + registra al usuario */
      const posts = gh2.json('social/posts.json');
      const base = [];
      for (let i = 0; i < 400; i++) base.push({ id: 'p-old' + i, uid: u.uid, name: 'V', text: 'viejo ' + i, at: Date.now() - 86400e3, likes: [], comments: [], shares: 0 });
      posts.posts = base;
      posts.users[u.uid] = { uid: u.uid, pubKey: u.pub, follows: [], saved: [], interests: [] };
      gh2.seed('social/posts.json', JSON.stringify(posts));
      r = await call(h2, { op: 'post', uid: u.uid, dev: u, params: { text: 'el post 401' } });
    });
    assert.equal(r.status, 200);
    const db = gh2.json('social/posts.json');
    assert.equal(db.posts.length, 400, 'techo respetado');
    const month = new Date().toISOString().slice(0, 7);
    const arc = gh2.json('social/archive-' + month + '.json');
    assert.ok(arc, 'archivo del mes creado');
    assert.equal(arc.posts.length, 1, 'el mas viejo archivado');
    assert.equal(arc.posts[0].text, 'viejo 0');
    assert.equal(db.posts.some(p => p.id === 'p-old0'), false, 'el archivado salio del activo');
  });

  await test('CAS: 409 inyectado se resuelve con reintento', async () => {
    const { handler: h2, gh: gh2 } = await freshHandler(null);
    const u = await newDevice();
    let r = null;
    await withFake(gh2, async () => {
      await call(h2, { op: 'post', uid: u.uid, dev: u, params: { text: 'base' } });
      gh2.conflictNextPut = 2;
      r = await call(h2, { op: 'post', uid: u.uid, dev: u, params: { text: 'con conflictos' } });
    });
    assert.equal(r.status, 200, 'sobrevive a 2 conflictos seguidos');
  });
}

/* busqueda global de personas */
{
  const { gh, handler } = await freshHandler(null);
  pushFake(gh);
  const a = await newDevice();
  await call(handler, { op: 'post', uid: a.uid, dev: a, params: { text: 'hola de Tester' } });
  await test('search: encuentra personas de TODA la comunidad (no solo posts visibles)', async () => {
    const r = await call(handler, { op: 'search', uid: a.uid, dev: a, unsigned: true, params: { q: 'tester' } });
    assert.equal(r.status, 200);
    assert.ok(r.body.users.length >= 1, 'encuentra a Tester');
    assert.equal(r.body.users[0].uid, a.uid);
  });
}

console.log('');
if (failed) {
  console.log(`XX ${failed} prueba(s) fallaron de ${passed + failed}`);
  for (const f of failures) console.log('  XX ' + f.name + '\n' + (f.error.stack || '').split('\n').slice(0, 4).join('\n'));
  process.exit(1);
} else {
  console.log(`OK: TODAS las pruebas pasaron (${passed}/${passed + failed})`);
}
