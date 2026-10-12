/* ═══════════════════════════════════════════════════════════
   🌐 XSTREAM SOCIAL — backend de la comunidad (v3)
   Almacén: GitHub rama chat-data, ARCHIVOS SEPARADOS por dominio
   (v2 guardaba TODO en social.json: cada latido reescribía el
   archivo completo y el chat lo pisaba cada 6 segundos → bajo
   carga todo eran 409 y rate-limit. v3 divide para que cada
   dominio conflictúe solo consigo mismo):

     social/posts.json        usuarios, publicaciones, historias,
                              grupos, lápidas (tomb) y reportes
     social/presence.json     latidos, notificaciones, leídos
     social/convos-index.json índice de conversaciones (resumen)
     social/convos/<cid>.json mensajes de cada conversación
     social/archive-<mes>.json historia preservada al podar

   LECTURAS con ETag/If-None-Match: GitHub responde 304 y las
   peticiones condicionales NO consumen rate-limit. El cliente
   manda sus etags → «same:true» sin re-descargar nada.

   MIGRACIÓN: la primera petición tras desplegar detecta el
   social.json viejo (o su ausencia) y lo reparte entre los
   archivos nuevos automáticamente.

   SEGURIDAD v3 (todo lo de v2 + parámetros firmados):
   · la firma ahora cubre op + TODOS los parámetros
     «soc3|<uid>|<hora>|<op>|<canon>» — una firma capturada ya
     NO sirve para otra operación ni otro contenido (v2 firmaba
     un texto fijo por hora);
   · hora con frescura ±1h (anti-replay lejano);
   · TOFU de la clave del dispositivo (igual que siempre);
   · uids RESERVADOS: el registro nuevo solo acepta el formato
     real de dispositivo (x-<20hex>); «x-stream-*» y similares
     requieren SOCIAL_TEAM_SECRET (var de entorno) → nadie puede
     robar la cuenta oficial;
   · URLs validadas en el SERVIDOR (http/https + host con punto):
     ni javascript: ni data: en enlaces/imágenes;
   · moderación: borrar la propia publicación, reportar, panel
     de administración con la misma clave ECDSA que firma el
     catálogo (header x-social-admin);
   · rotación de clave firmada con la clave vieja.

   ESCRITURAS CAS por archivo (leer → aplicar → PUT con el sha
   de ESA lectura; 409 → releer y reaplicar) + guardas de
   idempotencia (ids deterministas, dedupe 60s).            */
'use strict';

const GH_API = 'https://api.github.com';
const REPO = process.env.GH_REPO || 'Dcardkevein15/pelisfull';
const DATA_BRANCH = process.env.GH_BRANCH_DATA || 'chat-data';
const MAX_POSTS_DAY = 30;
const MAX_MSG_MIN = 20;
const STORY_TTL = 24 * 3600e3;
const ONLINE_MS = 6 * 60e3;
const BEAT_WRITE_MS = 150e3;      /* el latido solo escribe si pasó esto del último */
const MAX_POSTS = 400;
const MAX_NOTIFS = 50;
const MAX_CONV_MSGS = 250;
const MAX_TOMB = 200;
const MAX_REPORTS = 300;
const MAX_USERS = 2500;
const DEDUPE_MS = 60000;
const AV_GRADS = [0, 1, 2, 3, 4, 5, 6, 7];
const CAS_ATTEMPTS = 6;

/* 🔑 clave pública del admin (la misma que firma catalog.json y
   api/chat.js). Se puede sobreescribir con SOCIAL_ADMIN_PUB sin
   tocar código.                                              */
const ADMIN_PUB_B64 = process.env.SOCIAL_ADMIN_PUB ||
  'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEkO2b+Vm4MNlm+97FaZdXilRkF8KCr0XfqjhtQ00wc8SCsUAz6zA60rxYqnHuRIY7fNJCL6rCYDP5W5DOaNnorA==';

/* uids que nadie puede reclamar por TOFU */
const RESERVED_UIDS = ['x-stream-social-team', 'admin', 'administrador', 'xstream', 'equipo', 'staff', 'moderador', 'soporte'];
const UID_DEVICE_RE = /^x-[0-9a-f]{20}$/;

/* ── rutas de los archivos ── */
const P_POSTS = 'social/posts.json';
const P_PRESENCE = 'social/presence.json';
const P_INDEX = 'social/convos-index.json';
const P_LEGACY = 'social.json';
const fileOfCid = cid => 'social/convos/' + String(cid).replace(/[^a-zA-Z0-9~-]/g, '-') + '.json';
const archivePath = ms => 'social/archive-' + new Date(ms).toISOString().slice(0, 7) + '.json';

const POSTS_SEED = () => ({ v: 3, users: {}, posts: [], stories: [], groups: [], tomb: [], reports: [] });
const PRESENCE_SEED = () => ({ v: 3, beats: {}, notifs: {}, readNotifs: {} });
const INDEX_SEED = () => ({ v: 3, convos: {}, rl: {} });
const CONVO_SEED = () => ({ v: 3, msgs: [] });

function seedGroups(db) {
  db.groups = [
    { id: 'animelove', name: 'AnimeLove', desc: 'Grupo oficial · Todo el anime, capítulo a capítulo', official: true },
    { id: 'cinetotal', name: 'CineTotal', desc: 'Grupo oficial · Cine de estreno y clásicos', official: true },
    { id: 'seriesfans', name: 'SeriesFans', desc: 'Grupo oficial · Maratones y teorías de series', official: true },
    { id: 'mundoanime', name: 'MundoAnime', desc: 'Grupo oficial · Recomendaciones y rankings', official: true },
    { id: 'gamingzone', name: 'Gaming Zone', desc: 'Grupo oficial · Videojuegos y streams', official: true },
    { id: 'amigosdelstream', name: 'Amigos del Stream', desc: 'Grupo oficial · Quédense, esto se pone bueno', official: true },
  ];
}

module.exports.config = { maxDuration: 60 };

/* ═══════════ ALMACÉN — GitHub contents API con ETags ═══════════
   Los 304 de GitHub no consumen rate-limit: el cliente guarda los
   etags que le devolvemos y los devuelve en la siguiente petición. */
const GH_HEADERS = () => ({
  Authorization: `token ${process.env.GH_TOKEN}`,
  Accept: 'application/vnd.github+json',
});

/* lee UN archivo: { content, sha, etag } | { same:true, etag }
   | { missing:true } | null (error de red/almacén)            */
async function ghReadFile(path, etag) {
  try {
    const headers = GH_HEADERS();
    if (etag) headers['If-None-Match'] = String(etag);
    const r = await fetch(`${GH_API}/repos/${REPO}/contents/${path}?ref=${DATA_BRANCH}`, { headers, cache: 'no-store' });
    if (r.status === 304) return { same: true, etag: String(etag) };
    if (r.status === 404) return { missing: true };
    if (!r.ok) {
      /* >1MB: contents devuelve 403 con el sha en el cuerpo → git blobs */
      const t = await r.text().catch(() => '');
      try {
        const j = JSON.parse(t);
        if (j && j.sha && (r.status === 403 || r.status === 422)) return await ghReadBlob(j.sha, r.headers.get('etag'));
      } catch (e) { }
      console.error('social ghReadFile ' + path + ' ' + r.status);
      return null;
    }
    const j = await r.json();
    if (j && j.type === 'file' && typeof j.content === 'string') {
      return { content: Buffer.from(j.content, 'base64').toString('utf8'), sha: j.sha, etag: r.headers.get('etag') };
    }
    if (j && j.type === 'file' && j.encoding === 'none' && j.sha) {
      return await ghReadBlob(j.sha, r.headers.get('etag'));
    }
    return null;
  } catch (e) {
    console.error('social ghReadFile: ' + e.message);
    return null;
  }
}

async function ghReadBlob(sha, etag) {
  try {
    const r = await fetch(`${GH_API}/repos/${REPO}/git/blobs/${sha}`, { headers: GH_HEADERS(), cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || typeof j.content !== 'string') return null;
    return { content: Buffer.from(j.content, 'base64').toString('utf8'), sha, etag };
  } catch (e) { return null; }
}

async function ghPutFile(path, content, sha) {
  try {
    const body = {
      message: `social ${path} ${new Date().toISOString()} [skip ci]`,
      content: Buffer.from(content).toString('base64'),
      branch: DATA_BRANCH,
    };
    if (sha) body.sha = sha;
    const r = await fetch(`${GH_API}/repos/${REPO}/contents/${path}`, {
      method: 'PUT', cache: 'no-store',
      headers: {
        Authorization: `token ${process.env.GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (r.ok) return true;
    const t = await r.text().catch(() => '');
    console.error('social ghPutFile ' + path + ' ' + r.status + ': ' + t.slice(0, 160));
    return r.status;
  } catch (e) {
    console.error('social ghPutFile: ' + e.message);
    return null;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const parseOr = (txt, seed) => {
  try {
    const j = JSON.parse(String(txt));
    if (j && typeof j === 'object') return j;
  } catch (e) { }
  return seed();
};

/* ═══════════ MIGRACIÓN social.json → archivos v3 ═══════════ */
async function ensureFiles() {
  try {
    const postsSnap = await ghReadFile(P_POSTS);
    if (postsSnap && postsSnap.content != null) return true;   /* ya está todo */
    /* ¿hay datos viejos que repartir? */
    let legacy = null;
    const leg = await ghReadFile(P_LEGACY);
    if (leg && leg.content != null) {
      try { legacy = JSON.parse(leg.content); } catch (e) { legacy = null; }
    }
    const posts = POSTS_SEED();
    const presence = PRESENCE_SEED();
    const index = INDEX_SEED();
    seedGroups(posts);
    if (legacy && typeof legacy === 'object') {
      posts.users = legacy.users || {};
      posts.posts = legacy.posts || [];
      posts.stories = legacy.stories || [];
      posts.groups = (legacy.groups && legacy.groups.length) ? legacy.groups : posts.groups;
      posts.tomb = [];
      presence.notifs = legacy.notifs || {};
      const reads = {};
      for (const uid of Object.keys(posts.users)) {
        const u = posts.users[uid];
        if (u && u.lastRead) reads[uid] = u.lastRead;
        if (u && u.readNotifs) presence.readNotifs[uid] = u.readNotifs;
        if (u && (u.beat || u.createdAt)) presence.beats[uid] = { beat: u.beat || u.createdAt, name: u.name || '', tag: u.tag || '', grad: u.grad || 0 };
      }
      const convos = legacy.convos || {};
      for (const cid of Object.keys(convos)) {
        const msgs = Array.isArray(convos[cid]) ? convos[cid] : [];
        if (!msgs.length) continue;
        const last = msgs[msgs.length - 1];
        index.convos[cid] = {
          at: last.at, last: String(last.text || '').slice(0, 80), lastUid: last.uid,
          uids: cid.startsWith('g:') ? [] : cid.split('~'),
          unread: {},
        };
        /* el últimoRead migrado marca como leído hasta donde estaba */
        for (const uid of index.convos[cid].uids) {
          const lr = (reads[uid] || {})[cid] || 0;
          index.convos[cid].unread[uid] = msgs.filter(m => m.at > lr && m.uid !== uid).length;
        }
        const wr = await ghPutFile(fileOfCid(cid), JSON.stringify({ v: 3, msgs: msgs.slice(-MAX_CONV_MSGS) }), null);
        if (wr !== true && wr !== 422 && wr !== 409) return false;
      }
    }
    for (const [path, data] of [[P_POSTS, posts], [P_PRESENCE, presence], [P_INDEX, index]]) {
      const snap = await ghReadFile(path);
      if (snap && snap.content != null) continue;              /* otro lo hizo */
      if (snap && snap.same) continue;
      const wr = await ghPutFile(path, JSON.stringify(data), null);
      if (wr !== true && wr !== 422 && wr !== 409) return false;
    }
    return true;
  } catch (e) {
    console.error('social ensureFiles: ' + e.message);
    return false;
  }
}

/* ═══════════ DOMINIOS — lectura + CAS por archivo ═══════════ */
async function readDomain(path, seed, etag, allowMissing) {
  let snap = await ghReadFile(path, etag);
  if (snap && snap.missing) {
    if (allowMissing) return { db: seed(), same: false, etag: null, sha: null, missing: true };
    const ok = await ensureFiles();
    if (!ok) return null;
    snap = await ghReadFile(path);
    if (snap && snap.missing) return null;
  }
  if (!snap || snap.content == null) {
    if (snap && snap.same) return { db: null, same: true, etag: snap.etag, sha: null };
    return null;
  }
  return { db: parseOr(snap.content, seed), same: false, etag: snap.etag, sha: snap.sha };
}

async function casWrite(path, seed, mutate, allowMissing) {
  for (let attempt = 1; attempt <= CAS_ATTEMPTS; attempt++) {
    const dom = await readDomain(path, seed, null, allowMissing);
    if (!dom) return { fail: { status: 503, error: 'el almacén no responde — reintenta en unos segundos' } };
    if (dom.same) { await ensureFiles(); continue; }
    const db = dom.db;
    const out = await mutate(db);
    if (out && out.fail) return out;
    if (out && out.nowrite) return out;
    const wr = await ghPutFile(path, JSON.stringify(db), dom.sha);
    if (wr === true) return out;
    await sleep(300 * attempt);                                /* 409/congestión: releer y RE-APLICAR */
  }
  return { fail: { status: 503, error: 'la comunidad está muy activa ahora mismo — reintenta en unos segundos' } };
}

/* ═══════════ SEGURIDAD ═══════════ */

/* URL válida para enlaces/imágenes: http(s) + host con punto,
   sin caracteres de control. Nada de javascript:/data:/vbscript: */
function safeHttpUrl(u, max) {
  try {
    const s = String(u || '').trim();
    if (!s || s.length > (max || 500)) return '';
    if (/[^\x20-\x7E]/.test(s)) return '';
    const url = new URL(s);
    if (!/^https?:$/.test(url.protocol)) return '';
    if (!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(url.hostname)) return '';
    if (url.username || url.password) return '';
    return s;
  } catch (e) { return ''; }
}

/* imagen: SIEMPRE https (evita mixed-content y píxeles http) */
function safeImgUrl(u) { return safeHttpUrl(u, 500).startsWith('https://') ? safeHttpUrl(u, 500) : ''; }

function canonOf(b) {
  return Object.keys(b)
    .filter(k => !['hora', 'pubKey', 'sig'].includes(k))
    .sort()
    .map(k => `${k}=${String(b[k])}`)
    .join('&');
}

/* firma que cubre op + TODOS los parámetros (v3) */
async function verifyUser(db, uid, sigB64, b, op) {
  try {
    if (!uid || !/^(x-)?[a-z0-9-]{6,40}$/i.test(uid)) return false;
    const u = db.users[uid];
    const key64 = (u && u.pubKey) ? u.pubKey : (String(b.pubKey || '').slice(0, 200) || '');
    if (!key64) return false;
    const isNew = !u || !u.pubKey;
    if (isNew) {
      /* registro nuevo: solo uids de dispositivo reales, o equipo
         oficial con el secreto de aprovisionamiento                */
      const teamOk = process.env.SOCIAL_TEAM_SECRET && String(b.teamSecret || '') === process.env.SOCIAL_TEAM_SECRET;
      if (RESERVED_UIDS.includes(uid) || /^x-stream/i.test(uid)) {
        if (!teamOk) return false;
      } else if (!UID_DEVICE_RE.test(uid)) {
        return false;
      }
    }
    const hora = parseInt(b.hora, 10);
    const nowH = Math.floor(Date.now() / 3600000);
    if (!isFinite(hora) || hora > nowH || nowH - hora > 1) return false;   /* frescura ±1h */
    const msg = new TextEncoder().encode(`soc3|${uid}|${hora}|${op}|${canonOf(b)}`);
    const key = await crypto.subtle.importKey('spki', Buffer.from(key64, 'base64'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const sig = Buffer.from(String(sigB64 || ''), 'base64');
    if (!sig.length) return false;
    if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, msg))) return false;
    if (isNew) {
      const nu = db.users[uid] || (db.users[uid] = { uid, follows: [], saved: [], interests: [] });
      nu.uid = uid;
      nu.pubKey = key64;
    }
    return true;
  } catch (e) {
    console.error('social verify: ' + e.message);
    return false;
  }
}

/* admin: firma con la clave que firma el catálogo (como api/chat.js) */
async function isAdminSig(sigB64) {
  try {
    if (!sigB64 || !ADMIN_PUB_B64) return false;
    const key = await crypto.subtle.importKey('spki', Buffer.from(ADMIN_PUB_B64, 'base64'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const sig = Buffer.from(String(sigB64), 'base64');
    if (!sig.length) return false;
    const h = Math.floor(Date.now() / 3600000);
    for (const hora of [h, h - 1]) {
      const data = new TextEncoder().encode('xstream-social-admin:' + hora);
      if (await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, data)) return true;
    }
    return false;
  } catch (e) { return false; }
}

/* ═══════════ utilidades de dominio ═══════════ */
function touchUser(db, uid, b) {
  const u = db.users[uid] || (db.users[uid] = { uid, follows: [], saved: [], interests: [] });
  u.uid = uid;
  let changed = false;
  if (b.name && u.name !== String(b.name).slice(0, 40)) { u.name = String(b.name).slice(0, 40); changed = true; }
  if (b.tag && u.tag !== String(b.tag).slice(0, 6)) { u.tag = String(b.tag).slice(0, 6); changed = true; }
  if (b.grad !== undefined && AV_GRADS.includes(+b.grad) && u.grad !== +b.grad) { u.grad = +b.grad; changed = true; }
  if (b.flag && u.flag !== String(b.flag).slice(0, 4)) { u.flag = String(b.flag).slice(0, 4); changed = true; }
  u.lastActive = Date.now();
  return { u, changed };
}

function userSummary(db, uid) {
  const u = db.users[uid] || {};
  return { uid, name: u.name || 'Usuario', tag: u.tag || '', grad: u.grad || 0 };
}

function stableId(prefix, uid, text) {
  const h = require('crypto').createHash('sha256')
    .update(prefix + '|' + uid + '|' + String(text || '') + '|' + Math.floor(Date.now() / 3600000))
    .digest('base64url').slice(0, 10);
  return prefix + h;
}
const deduped = (arr, uid, text) =>
  arr.some(x => x.uid === uid && x.text === String(text) && Date.now() - (x.at || 0) < DEDUPE_MS);

/* notificación — dominio presence, best-effort con dedupe 60s.
   `known`: el llamador ya verificó que el destinatario existe
   (autor del post, objetivo del DM…) — evita notificar a uids basura.
   `bySender`: para mensajes — 1 timbre por remitente en 60s aunque
   mande varios textos distintos (no martillar el timbre en ráfagas) */
async function notifyBestEffort(toUid, type, byName, text, known, bySender) {
  if (!toUid) return;
  await casWrite(P_PRESENCE, PRESENCE_SEED, db => {
    if (!known && !(toUid in db.beats)) return { resp: { ok: true }, nowrite: true };
    const list = db.notifs[toUid] || (db.notifs[toUid] = []);
    const last = list[0];
    const sameSender = last && last.type === type && last.byName === String(byName).slice(0, 40);
    const sameEvt = sameSender && (bySender || last.text === String(text).slice(0, 90));
    if (sameEvt && Date.now() - last.at < DEDUPE_MS) {
      return { resp: { ok: true }, nowrite: true };
    }
    list.unshift({ id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type, byName: String(byName || '').slice(0, 40), text: String(text || '').slice(0, 90), at: Date.now(), read: false });
    if (list.length > MAX_NOTIFS) db.notifs[toUid] = list.slice(0, MAX_NOTIFS);
    return { resp: { ok: true } };
  });
}

/* poda + ARCHIVO de la historia antes de tirar nada */
async function prune(db) {
  const now = Date.now();
  db.stories = (db.stories || []).filter(s => now - s.at < STORY_TTL);
  db.tomb = (db.tomb || []).slice(0, MAX_TOMB);
  db.reports = (db.reports || []).slice(0, MAX_REPORTS);
  const overflow = (db.posts || []).length - MAX_POSTS;
  if (overflow > 0) {
    const dropped = db.posts.splice(0, overflow);
    const byMonth = {};
    for (const p of dropped) (byMonth[new Date(p.at).toISOString().slice(0, 7)] || (byMonth[new Date(p.at).toISOString().slice(0, 7)] = [])).push(p);
    let archived = true;
    for (const month of Object.keys(byMonth)) {
      const path = 'social/archive-' + month + '.json';
      const snap = await ghReadFile(path);
      if (!snap || (snap.content == null && !snap.missing)) { archived = false; break; }
      const arc = snap.missing ? { v: 3, posts: [] } : parseOr(snap.content, () => ({ v: 3, posts: [] }));
      const have = new Set((arc.posts || []).map(p => p.id));
      for (const p of byMonth[month]) if (!have.has(p.id)) (arc.posts || (arc.posts = [])).push(p);
      const wr = await ghPutFile(path, JSON.stringify(arc), snap.missing ? null : snap.sha);
      if (wr !== true && wr !== 422 && wr !== 409) { archived = false; break; }
    }
    /* si el archivo falló, restauramos: se volverá a intentar en la
       próxima poda — nunca se pierde historia sin archivarla        */
    if (!archived) db.posts = dropped.concat(db.posts);
  }
  const uids = Object.keys(db.users || {});
  if (uids.length > MAX_USERS) {
    for (const uid of uids) {
      const u = db.users[uid];
      if (now - (u.lastActive || u.createdAt || 0) > 30 * 864e5 && !(db.posts || []).some(p => p.uid === uid)) delete db.users[uid];
      if (Object.keys(db.users).length <= MAX_USERS - 500) break;
    }
  }
}

function convoIdOf(a, b) { return [a, b].sort().join('~'); }

/* ═══════════ OPS ═══════════ */
const OPS = {
  async profile({ db, b, uid }) {
    const { u } = touchUser(db, uid, b);
    if (b.bio !== undefined) u.bio = String(b.bio).slice(0, 200);
    if (b.interests !== undefined) {
      try { u.interests = (JSON.parse(String(b.interests)) || []).slice(0, 10).map(x => String(x).slice(0, 20)); } catch (e) { }
    }
    await prune(db);
    return { resp: { ok: true, user: { name: u.name, tag: u.tag, bio: u.bio || '', interests: u.interests } } };
  },

  async post({ db, b, uid }) {
    const { u } = touchUser(db, uid, b);
    const isOfficial = uid === 'x-stream-social-team';
    if (!isOfficial) {
      const today = new Date().toISOString().slice(0, 10);
      if (u.postsDay !== today) { u.postsDay = today; u.postsToday = 0; }
      if ((u.postsToday || 0) >= MAX_POSTS_DAY) return { fail: { status: 429, error: 'límite de publicaciones de hoy alcanzado' } };
      u.postsToday++;
    }
    const text = String(b.text || '').trim().slice(0, 800);
    const img = safeImgUrl(b.img);
    const link = safeHttpUrl(b.link, 400);
    if (!text && !img && !b.vid) return { fail: { status: 400, error: 'la publicación está vacía' } };
    let poll = null;
    if (b.poll) {
      try {
        const opts = (JSON.parse(String(b.poll)) || []).map(o => String(o).slice(0, 60)).filter(Boolean).slice(0, 4);
        if (opts.length >= 2) poll = { o: opts, votes: {} };
      } catch (e) { }
    }
    const id = stableId('p', uid, text + '|' + img + '|' + (b.vid || '') + '|' + link + '|' + (b.poll || ''));
    const post = {
      id, uid, name: u.name || 'Usuario', tag: u.tag || '', grad: u.grad || 0, flag: u.flag || '',
      text, img, vid: b.vid && /^[A-Za-z0-9_-]{6,20}$/.test(String(b.vid)) ? String(b.vid) : '',
      link, poll, at: Date.now(), likes: [], comments: [], shares: 0, official: isOfficial,
    };
    const i = db.posts.findIndex(p => p.id === id);
    if (i >= 0) db.posts[i] = post; else db.posts.push(post);
    await prune(db);
    return { resp: { ok: true, post } };
  },

  async comment({ db, b, uid }) {
    const { u } = touchUser(db, uid, b);
    const p = db.posts.find(x => x.id === b.postId);
    const text = String(b.text || '').trim().slice(0, 400);
    if (!p) return { fail: { status: 404, error: 'publicación no encontrada' } };
    if (!text) return { fail: { status: 400, error: 'comentario vacío' } };
    if (deduped(p.comments, uid, text)) return { resp: { ok: true, comments: p.comments.length, deduped: true } };
    p.comments.push({ uid, name: u.name, text, likes: [], at: Date.now() });
    if (p.comments.length > 100) p.comments = p.comments.slice(-100);
    await prune(db);
    if (p.uid !== uid) await notifyBestEffort(p.uid, 'comment', u.name, 'comentó tu publicación: «' + text.slice(0, 50) + '»', true);
    return { resp: { ok: true, comments: p.comments.length } };
  },

  /* ❤️ like en un comentario (por índice — estable: solo se añaden) */
  async clike({ db, b, uid }) {
    touchUser(db, uid, b);
    const p = db.posts.find(x => x.id === b.postId);
    if (!p) return { fail: { status: 404, error: 'publicación no encontrada' } };
    const ci = parseInt(b.ci, 10);
    if (!isFinite(ci) || ci < 0 || ci >= (p.comments || []).length) return { fail: { status: 400, error: 'comentario no encontrado' } };
    const c = p.comments[ci];
    c.likes = c.likes || [];
    const on = String(b.on || '') === '1';
    const i = c.likes.indexOf(uid);
    let mine;
    if (on && i < 0) { if (c.likes.length < 100) c.likes.push(uid); mine = true; }
    else if (!on && i >= 0) { c.likes.splice(i, 1); mine = false; }
    else mine = c.likes.includes(uid);
    return { resp: { ok: true, likes: c.likes.length, mine } };
  },

  async like({ db, b, uid }) {
    const { u } = touchUser(db, uid, b);
    const p = db.posts.find(x => x.id === b.postId);
    if (!p) return { fail: { status: 404, error: 'publicación no encontrada' } };
    const on = String(b.on || '') === '1';
    const i = p.likes.indexOf(uid);
    if (on && i < 0) { p.likes.push(uid); if (p.uid !== uid) await notifyBestEffort(p.uid, 'like', u.name, 'le gusta tu publicación', true); }
    if (!on && i >= 0) p.likes.splice(i, 1);
    await prune(db);
    return { resp: { ok: true, likes: p.likes.length, mine: p.likes.includes(uid) } };
  },

  async vote({ db, b, uid }) {
    touchUser(db, uid, b);
    const p = db.posts.find(x => x.id === b.postId);
    if (!p || !p.poll) return { fail: { status: 404, error: 'encuesta no encontrada' } };
    const idx = +b.option;
    if (!(idx >= 0 && idx < p.poll.o.length)) return { fail: { status: 400, error: 'opción inválida' } };
    for (const k of Object.keys(p.poll.votes)) p.poll.votes[k] = (p.poll.votes[k] || []).filter(v => v !== uid);
    p.poll.votes[idx] = [...(p.poll.votes[idx] || []), uid];
    return { resp: { ok: true } };
  },

  async save({ db, b, uid }) {
    const { u } = touchUser(db, uid, b);
    const p = db.posts.find(x => x.id === b.postId);
    if (!p) return { fail: { status: 404, error: 'publicación no encontrada' } };
    u.saved = u.saved || [];
    const i = u.saved.indexOf(p.id);
    const on = String(b.on || '') === '1';
    if (on && i < 0) u.saved.push(p.id);
    if (!on && i >= 0) u.saved.splice(i, 1);
    return { resp: { ok: true, saved: u.saved.slice(0, 40) } };
  },

  async share({ db, b }) {
    const p = db.posts.find(x => x.id === b.postId);
    if (!p) return { fail: { status: 404, error: 'publicación no encontrada' } };
    p.shares = (p.shares || 0) + 1;
    return { resp: { ok: true, shares: p.shares } };
  },

  async follow({ db, b, uid }) {
    const { u } = touchUser(db, uid, b);
    const target = String(b.target || '');
    if (!target || target === uid) return { fail: { status: 400, error: 'objetivo inválido' } };
    u.follows = u.follows || [];
    const on = String(b.on || '') === '1';
    const i = u.follows.indexOf(target);
    if (on && i < 0) {
      u.follows.push(target);
      if (!target.startsWith('g:')) await notifyBestEffort(target, 'follow', u.name, 'empezó a seguirte', target in db.users);
    }
    if (!on && i >= 0) u.follows.splice(i, 1);
    return { resp: { ok: true } };
  },

  async story({ db, b, uid }) {
    const { u } = touchUser(db, uid, b);
    const text = String(b.text || '').slice(0, 120);
    const img = safeImgUrl(b.img);
    if (!text && !img) return { fail: { status: 400, error: 'historia vacía' } };
    db.stories = (db.stories || []).filter(s => s.uid !== uid);
    db.stories.push({ id: stableId('s', uid, text + img), uid, name: u.name, tag: u.tag, grad: u.grad || 0, img, text, live: String(b.live || '') === '1', views: [], at: Date.now() });
    await prune(db);
    return { resp: { ok: true } };
  },

  /* 👀 apertura de historia: cuenta espectadores reales (1 por persona) */
  async storyView({ db, b, uid }) {
    touchUser(db, uid, b);
    const s = (db.stories || []).find(x => x.id === b.sid);
    if (!s) return { resp: { ok: true, views: 0 }, nowrite: true };
    s.views = s.views || [];
    if (s.views.includes(uid)) return { resp: { ok: true, views: s.views.length }, nowrite: true };
    if (s.views.length < 100) s.views.push(uid);
    return { resp: { ok: true, views: s.views.length } };
  },

  /* 🗑 borrar la PROPIA publicación (o cualquiera siendo admin) */
  async delPost({ db, b, uid, adminOk }) {
    touchUser(db, uid, b);
    const p = db.posts.find(x => x.id === b.postId);
    if (!p) return { fail: { status: 404, error: 'publicación no encontrada' } };
    if (p.uid !== uid && !adminOk) return { fail: { status: 403, error: 'solo el autor o un moderador puede borrarla' } };
    db.posts = db.posts.filter(x => x.id !== p.id);
    db.tomb = db.tomb || [];
    db.tomb.unshift({ id: p.id, at: Date.now() });
    db.reports = (db.reports || []).filter(r => r.postId !== p.id);
    await prune(db);
    return { resp: { ok: true } };
  },

  /* 🚩 reportar contenido (1 reporte por persona y publicación) */
  async report({ db, b, uid }) {
    const { u } = touchUser(db, uid, b);
    const p = db.posts.find(x => x.id === b.postId);
    if (!p) return { fail: { status: 404, error: 'publicación no encontrada' } };
    db.reports = db.reports || [];
    if (db.reports.some(r => r.postId === p.id && r.uid === uid)) return { resp: { ok: true, dup: true }, nowrite: true };
    const reason = String(b.reason || 'otro').slice(0, 80);
    db.reports.unshift({ id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), postId: p.id, postBy: p.name, snippet: String(p.text || '').slice(0, 90), uid, name: u.name || '', reason, at: Date.now() });
    if (db.reports.length > MAX_REPORTS) db.reports = db.reports.slice(0, MAX_REPORTS);
    return { resp: { ok: true } };
  },

  async dismissReport({ db, b, adminOk }) {
    if (!adminOk) return { fail: { status: 403, error: 'solo el administrador' } };
    db.reports = (db.reports || []).filter(r => r.id !== String(b.reportId || ''));
    return { resp: { ok: true } };
  },

  async msg({ db, b, uid, postsDb }) {
    const u = postsDb.users[uid] || {};
    const text = String(b.text || '').trim().slice(0, 400);
    if (!text) return { fail: { status: 400, error: 'mensaje vacío' } };
    const minNow = Math.floor(Date.now() / 60000);
    let cid = String(b.to || '');
    if (cid.startsWith('g:')) {
      const gid = cid.slice(2);
      if (!(postsDb.groups || []).some(g => g.id === gid)) return { fail: { status: 404, error: 'grupo no encontrado' } };
      if (!(u.follows || []).includes(cid)) return { fail: { status: 403, error: 'únete al grupo antes de escribir' } };
    } else {
      if (!(cid in postsDb.users)) return { fail: { status: 404, error: 'ese usuario no existe aún en la comunidad' } };
      cid = convoIdOf(uid, cid);
    }
    /* límite de ritmo + índice de la conversación (dominio convos) */
    const idxOut = await casWrite(P_INDEX, INDEX_SEED, ix => {
      if (ix.rl[uid] && ix.rl[uid].min === minNow) {
        if (ix.rl[uid].n >= MAX_MSG_MIN) return { fail: { status: 429, error: 'demasiados mensajes seguidos — espera un momento' } };
        ix.rl[uid].n++;
      } else {
        ix.rl[uid] = { min: minNow, n: 1 };
      }
      const e = ix.convos[cid] || (ix.convos[cid] = { uids: cid.startsWith('g:') ? [] : cid.split('~'), unread: {} });
      e.at = Date.now();
      e.last = text.slice(0, 80);
      e.lastUid = uid;
      if (!cid.startsWith('g:') && e.unread) {
        const other = cid.split('~').find(x => x !== uid);
        if (other) e.unread[other] = (e.unread[other] || 0) + 1;
      }
      return { resp: { ok: true, cid } };
    });
    if (idxOut.fail) return idxOut;
    /* el mensaje en su propio archivo (sin conflictos con otros chats) */
    const cOut = await casWrite(fileOfCid(cid), CONVO_SEED, cv => {
      if (deduped(cv.msgs, uid, text)) return { resp: { ok: true, cid, deduped: true } };
      cv.msgs.push({ uid, name: u.name, text, at: Date.now() });
      if (cv.msgs.length > MAX_CONV_MSGS) cv.msgs = cv.msgs.slice(-MAX_CONV_MSGS);
      return { resp: { ok: true, cid } };
    }, true);
    if (cOut.fail) return cOut;
    /* notificación del mensaje — solo para chats individuales */
    if (!cid.startsWith('g:')) {
      const other = cid.split('~').find(x => x !== uid);
      await notifyBestEffort(other, 'msg', u.name, 'te escribió: «' + text.slice(0, 50) + '»', true, true);
    }
    return { resp: { ok: true, cid } };
  },

  /* 🔁 rotación de clave: firmada con la VIEJA, instala la nueva */
  async rotate({ db, b, uid }) {
    const u = db.users[uid];
    if (!u || !u.pubKey) return { fail: { status: 404, error: 'aún no has participado — no hay clave registrada que rotar' } };
    const npk = String(b.newPubKey || '');
    if (!/^[A-Za-z0-9+/=]{80,200}$/.test(npk)) return { fail: { status: 400, error: 'clave nueva inválida' } };
    u.pubKey = npk;
    u.lastActive = Date.now();
    return { resp: { ok: true } };
  },
};

/* ═══════════ ESTADO — delta por archivo con ETags ═══════════
   El cliente manda sus etags y recibe SOLO lo que cambió:
   · los 3 archivos sin cambios  → { same:true }  (cero payload)
   · posts.json cambió           → posts+stories+groups+me+tomb…
   · presence.json cambió        → notifs+online…
   · índice cambió               → resumen de conversaciones
   …y `postsSame/presenceSame/indexSame` indica qué conservar.   */
async function opState(b, uid, sig) {
  const etagsIn = (() => {
    try { return JSON.parse(String(b.etags || '{}')) || {}; } catch (e) { return {}; }
  })();
  const beatDue = String(b.beat || '') === '1';
  /* latido pendiente → lectura autoritativa de posts+presence
     (hace falta el contenido para verificar la firma)             */
  const postsDom = await readDomain(P_POSTS, POSTS_SEED, beatDue ? null : etagsIn.posts);
  if (!postsDom) return { status: 503, json: { ok: false, error: 'el almacén no responde — reintenta' } };
  const presDom = await readDomain(P_PRESENCE, PRESENCE_SEED, beatDue ? null : etagsIn.presence);
  if (!presDom) return { status: 503, json: { ok: false, error: 'el almacén no responde — reintenta' } };
  const idxDom = await readDomain(P_INDEX, INDEX_SEED, etagsIn.index);
  if (!idxDom) return { status: 503, json: { ok: false, error: 'el almacén no responde — reintenta' } };

  const postsSame = !!postsDom.same;
  const presSame = !!presDom.same;
  const idxSame = !!idxDom.same;
  const etags = {
    posts: postsSame ? (etagsIn.posts || '') : (postsDom.etag || ''),
    presence: presSame ? (etagsIn.presence || '') : (presDom.etag || ''),
    index: idxSame ? (etagsIn.index || '') : (idxDom.etag || ''),
  };
  if (postsSame && presSame && idxSame) return { status: 200, json: { ok: true, same: true, etags } };

  const postsDb = postsSame ? POSTS_SEED() : postsDom.db;
  const presDb = presSame ? PRESENCE_SEED() : presDom.db;
  const idxDb = idxSame ? INDEX_SEED() : idxDom.db;

  if (!postsSame) {
    if (!postsDb.groups || !postsDb.groups.length) seedGroups(postsDb);
    await prune(postsDb);
  }

  const now = Date.now();
  const me = uid ? (postsDb.users[uid] || null) : null;

  /* ── latido + registro/actualización del perfil (solo si toca) ── */
  let beatAt = null;
  if (beatDue && sig) {
    const registeredBefore = !!(postsSame ? null : postsDb.users[uid]?.pubKey);
    const ok = await verifyUser(postsDb, uid, sig, b, 'state');
    if (ok) {
      const { changed } = touchUser(postsDb, uid, b);
      const u = postsDb.users[uid];
      const postsDirty = !registeredBefore || changed || !u.createdAt;
      if (!u.createdAt) u.createdAt = now;
      /* presence: escribir SOLO si mi latido pasó de BEAT_WRITE_MS
         o cambió mi perfil visible — y con el sha de ESTA lectura   */
      const mine = presDb.beats[uid];
      const stale = !mine || !mine.beat || now - mine.beat > BEAT_WRITE_MS;
      const fieldsChanged = mine && (mine.name !== (u.name || '') || mine.tag !== (u.tag || '') || (mine.grad || 0) !== (u.grad || 0));
      if (stale || fieldsChanged) {
        presDb.beats[uid] = { beat: now, name: u.name || '', tag: u.tag || '', grad: u.grad || 0, at: now };
        const wr = await ghPutFile(P_PRESENCE, JSON.stringify(presDb), presSame ? null : presDom.sha);
        if (wr !== true) {
          /* 409: otro latido ganó — releer y decidir de nuevo */
          await casWrite(P_PRESENCE, PRESENCE_SEED, db2 => {
            const m2 = db2.beats[uid];
            const st2 = !m2 || !m2.beat || now - m2.beat > BEAT_WRITE_MS;
            if (!st2) return { resp: { ok: true }, nowrite: true };
            db2.beats[uid] = { beat: now, name: u.name || '', tag: u.tag || '', grad: u.grad || 0, at: now };
            return { resp: { ok: true } };
          }).catch(() => { });
        }
      }
      if (postsDirty) {
        const wr = await ghPutFile(P_POSTS, JSON.stringify(postsDb), postsSame ? null : postsDom.sha);
        if (wr !== true) {
          await casWrite(P_POSTS, POSTS_SEED, db2 => {
            if (!db2.users[uid]) return { resp: { ok: true }, nowrite: true };
            const u2 = touchUser(db2, uid, b).u;
            u2.createdAt = u2.createdAt || now;
            return { resp: { ok: true } };
          }).catch(() => { });
        }
      }
      beatAt = now;
    }
  }

  const resp = { ok: true, etags };
  if (postsSame) resp.postsSame = true;
  if (presSame) resp.presenceSame = true;
  if (idxSame) resp.indexSame = true;

  /* ── dominio POSTS ── */
  if (!postsSame) {
    resp.posts = postsDb.posts.slice(-60).reverse();
    resp.stories = postsDb.stories.slice(-40).reverse();
    resp.groups = (postsDb.groups || []).map(g => ({ ...g, members: Object.values(postsDb.users).filter(u2 => (u2.follows || []).includes('g:' + g.id)).length }));
    resp.follows = me ? (me.follows || []) : [];
    resp.saved = me ? (me.saved || []) : [];
    resp.me = me ? { bio: me.bio || '', interests: me.interests || [], name: me.name, tag: me.tag } : null;
    resp.tomb = (postsDb.tomb || []).slice(0, MAX_TOMB);
    resp.suggested = uid
      ? Object.values(postsDb.users)
        .filter(u2 => u2.uid && u2.uid !== uid && !(me && (me.follows || []).includes(u2.uid)))
        .sort((a, z) => ((presDb.beats[z.uid] || {}).beat || z.lastActive || 0) - ((presDb.beats[a.uid] || {}).beat || a.lastActive || 0))
        .map(u2 => ({ uid: u2.uid, name: u2.name, tag: u2.tag, grad: u2.grad || 0, bio: u2.bio || '', online: !!(presDb.beats[u2.uid] && now - presDb.beats[u2.uid].beat < ONLINE_MS), posts: postsDb.posts.filter(p => p.uid === u2.uid).length, followsMe: !!(me && (u2.follows || []).includes(uid)) }))
        .slice(0, 12)
      : [];
  }

  /* ── dominio PRESENCE ── */
  if (!presSame) {
    const readNotifs = presDb.readNotifs?.[uid] || 0;
    let notifsUnread = 0;
    const myNotifs = uid ? (presDb.notifs[uid] || []).slice(0, 30).map(n => {
      const read = (n.at || 0) <= readNotifs;
      if (!read) notifsUnread++;
      return { ...n, read };
    }) : [];
    resp.notifs = myNotifs;
    resp.notifsUnread = notifsUnread;
    resp.onlineCount = Object.values(presDb.beats || {}).filter(m => m && m.beat && now - m.beat < ONLINE_MS).length;
    resp.onlineUsers = Object.entries(presDb.beats || {})
      .filter(([, m]) => m && m.beat && now - m.beat < ONLINE_MS)
      .slice(0, 20)
      .map(([u2, m]) => ({ uid: u2, name: m.name, grad: m.grad || 0 }));
  }

  /* ── dominio ÍNDICE — resumen de conversaciones ── */
  if (!idxSame) {
    const convos = [];
    if (uid) {
      for (const cid of Object.keys(idxDb.convos || {})) {
        const e = idxDb.convos[cid];
        const isGroup = cid.startsWith('g:');
        if (!isGroup && !cid.includes(uid)) continue;
        const other = !isGroup ? cid.split('~').find(x => x !== uid) : '';
        const otherU = !isGroup ? postsDb.users[other] : null;
        convos.push({
          id: cid, last: e.last || '', at: e.at || 0,
          unread: isGroup ? 0 : ((e.unread || {})[uid] || 0),
          lastIsMine: e.lastUid === uid,
          peerName: isGroup ? ((postsDb.groups || []).find(g => 'g:' + g.id === cid) || {}).name || 'Grupo' : (otherU ? otherU.name + ' ' + (otherU.tag || '') : 'Usuario'),
          peerGrad: isGroup ? 2 : (otherU ? otherU.grad || 0 : 0),
          peerOnline: !!(otherU && presDb.beats[other] && now - presDb.beats[other].beat < ONLINE_MS),
        });
      }
      convos.sort((a, b2) => b2.at - a.at);
    }
    resp.convos = convos.slice(0, 30);
  }

  if (beatAt) resp.beatAt = beatAt;
  return { status: 200, json: resp };
}

/* ═══════════ HANDLER ═══════════ */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-social-sig,x-social-admin');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const b = Object.assign({}, req.query || {});
    if (req.body && typeof req.body === 'object') Object.assign(b, req.body);
    else if (typeof req.body === 'string' && req.body) { try { Object.assign(b, JSON.parse(req.body)); } catch (e) { } }
    const op = String(b.op || 'state');
    const uid = String(b.uid || '');
    const sig = String(req.headers['x-social-sig'] || '');
    const adminSig = String(req.headers['x-social-admin'] || '');
    const adminOk = adminSig ? await isAdminSig(adminSig) : false;

    /* ── estado global (con delta ETag + latido) ── */
    if (op === 'state') {
      const out = await opState(b, uid, sig);
      return res.status(out.status).json(out.json);
    }

    /* ── búsqueda de personas en TODA la comunidad (no solo 60 posts) ── */
    if (op === 'search') {
      const q = String(b.q || '').trim().toLowerCase();
      if (q.length < 2) return res.status(200).json({ ok: true, users: [] });
      const dom = await readDomain(P_POSTS, POSTS_SEED);
      if (!dom || dom.same || !dom.db) return res.status(200).json({ ok: true, users: [] });
      const users = Object.values(dom.db.users || {})
        .filter(u => u && u.uid && u.name && String(u.name).toLowerCase().includes(q))
        .slice(0, 12)
        .map(u => ({ uid: u.uid, name: u.name, tag: u.tag || '', grad: u.grad || 0, posts: (dom.db.posts || []).filter(p => p.uid === u.uid).length }));
      return res.status(200).json({ ok: true, users });
    }

    /* ── mensajes de una conversación (poll liviano con ETag) ── */
    if (op === 'messages') {
      const cid = String(b.cid || '');
      if (!cid) return res.status(400).json({ ok: false, error: 'falta cid' });
      if (!cid.startsWith('g:') && uid && !cid.includes(uid)) return res.status(403).json({ ok: false, error: 'conversación ajena' });
      const etagsIn = (() => { try { return JSON.parse(String(b.etags || '{}')) || {}; } catch (e) { return {}; } })();
      const [convoDom, idxDom] = await Promise.all([
        readDomain(fileOfCid(cid), CONVO_SEED, etagsIn.convo, true),
        readDomain(P_INDEX, INDEX_SEED, etagsIn.index),
      ]);
      if (!convoDom || !idxDom) return res.status(503).json({ ok: false, error: 'el almacén no responde — reintenta' });
      const etags = {
        convo: convoDom.same ? (convoDom.etag || etagsIn.convo || '') : (convoDom.etag || ''),
        index: idxDom.same ? (idxDom.etag || etagsIn.index || '') : (idxDom.etag || ''),
      };
      /* limpiar MI contador de no-leídos del índice (solo si hay) —
         la limpieza NO amplifica: solo escribe si de verdad había   */
      let cleared = false;
      if (uid && !idxDom.same && idxDom.db.convos?.[cid]?.unread?.[uid] > 0) {
        const out = await casWrite(P_INDEX, INDEX_SEED, ix => {
          const e = ix.convos[cid];
          if (e && e.unread && (e.unread[uid] || 0) > 0) { e.unread[uid] = 0; return { resp: { ok: true } }; }
          return { resp: { ok: true }, nowrite: true };
        });
        cleared = !out.fail;
      }
      if (convoDom.same && !cleared) return res.status(200).json({ ok: true, same: true, etags });
      const msgs = (convoDom.same ? [] : (convoDom.db.msgs || [])).slice(-80);
      return res.status(200).json({ ok: true, msgs, etags, cleared });
    }

    /* ── panel de moderación (solo admin) ── */
    if (op === 'adminState') {
      if (!adminOk) return res.status(403).json({ ok: false, error: 'solo el administrador' });
      const dom = await readDomain(P_POSTS, POSTS_SEED);
      if (!dom || dom.same || !dom.db) return res.status(200).json({ ok: true, reports: [] });
      return res.status(200).json({ ok: true, reports: (dom.db.reports || []).slice(0, 60) });
    }

    /* ── escrituras: CAS por dominio con firma v3 ── */
    if (!OPS[op] && op !== 'notifsRead') return res.status(400).json({ ok: false, error: 'op desconocida: ' + op });

    /* notifsRead: dominio PRESENCE (el timbre vive ahí) */
    if (op === 'notifsRead') {
      const out = await casWrite(P_PRESENCE, PRESENCE_SEED, db => {
        if (!(uid in db.beats) && !(uid in db.notifs)) return { resp: { ok: true }, nowrite: true };
        if (!(db.notifs[uid] || []).length) return { resp: { ok: true }, nowrite: true };
        db.readNotifs = db.readNotifs || {};
        db.readNotifs[uid] = Date.now();
        return { resp: { ok: true } };
      });
      if (out.fail) return res.status(out.fail.status).json({ ok: false, error: out.fail.error });
      return res.status(200).json(out.resp || { ok: true });
    }

    /* msg: lee posts (usuarios/grupos/membresía) pero SOLO lo
       escribe si el registro del usuario cambió (registro/TOFU)  */
    if (op === 'msg') {
      const postsDom = await readDomain(P_POSTS, POSTS_SEED);
      if (!postsDom || postsDom.same || !postsDom.db) return res.status(503).json({ ok: false, error: 'el almacén no responde — reintenta' });
      const postsDb = postsDom.db;
      if (!postsDb.groups || !postsDb.groups.length) seedGroups(postsDb);
      const registeredBefore = !!postsDb.users[uid]?.pubKey;
      if (!(await verifyUser(postsDb, uid, sig, b, op))) {
        return res.status(403).json({ ok: false, error: 'firma inválida — cada acción se firma con la clave de tu dispositivo' });
      }
      const { changed } = touchUser(postsDb, uid, b);
      const out = await OPS.msg({ db: null, b, uid, postsDb });
      if (out.fail) return res.status(out.fail.status).json({ ok: false, error: out.fail.error });
      if (!registeredBefore || changed) {
        const wr = await ghPutFile(P_POSTS, JSON.stringify(postsDb), postsDom.sha);
        if (wr !== true) {
          await casWrite(P_POSTS, POSTS_SEED, db2 => {
            if (!db2.users[uid]) return { resp: { ok: true }, nowrite: true };
            touchUser(db2, uid, b);
            return { resp: { ok: true } };
          }).catch(() => { });
        }
      }
      return res.status(200).json(out.resp);
    }

    /* el resto: un solo dominio (posts) con reintentos CAS */
    let lastFail = null;
    for (let attempt = 1; attempt <= CAS_ATTEMPTS; attempt++) {
      const postsDom = await readDomain(P_POSTS, POSTS_SEED);
      if (!postsDom || postsDom.same || !postsDom.db) {
        if (postsDom && postsDom.same) { await ensureFiles(); continue; }
        return res.status(503).json({ ok: false, error: 'el almacén no responde — reintenta en unos segundos' });
      }
      const db = postsDom.db;
      if (!db.groups || !db.groups.length) seedGroups(db);
      if (!(await verifyUser(db, uid, sig, b, op))) {
        return res.status(403).json({ ok: false, error: 'firma inválida — cada acción se firma con la clave de tu dispositivo' });
      }
      const out = await OPS[op]({ db, b, uid, adminOk });
      if (out.fail) return res.status(out.fail.status).json({ ok: false, error: out.fail.error });
      if (out.nowrite) { out.resp.w = 'skip'; return res.status(200).json(out.resp); }
      const wr = await ghPutFile(P_POSTS, JSON.stringify(db), postsDom.sha);
      if (wr === true) { out.resp.w = 'ok'; return res.status(200).json(out.resp); }
      lastFail = wr;
      await sleep(300 * attempt);
    }
    return res.status(503).json({ ok: false, error: 'la comunidad está muy activa ahora mismo — reintenta en unos segundos (' + lastFail + ')' });
  } catch (e) {
    console.error('social handler: ' + e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
