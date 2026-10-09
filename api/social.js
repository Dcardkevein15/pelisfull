/* ═══════════════════════════════════════════════════════════
   🌐 XSTREAM SOCIAL — backend de la comunidad (v2, CAS)
   Almacén: GitHub rama chat-data, archivo social.json

   v2 — ARQUITECTURA COMPARE-AND-SWAP (lo que aprendieron las
   pruebas): escribir el archivo completo con una foto vieja PIERDE
   eventos y DUPLICA publicaciones bajo ráfagas. Ahora:
   · cada op es una función pura que se RE-APLICA sobre una base
     FRESCA dentro del bucle de escritura (leer → aplicar → PUT con
     el sha de ESA lectura → 409 = releer y reaplicar);
   · PUT usa el blob-sha del mismo intento (nunca reutiliza shas);
   · guardas de idempotencia: posts con id determinista por
     (usuario+texto+hora) y dedupe de 60s en comentarios/mensajes,
     así un reintento nunca duplica lo que sí llegó a aterrizar.

   SEGURIDAD (igual que v1, verificada con pruebas reales):
   · uid + clave ECDSA del dispositivo (TOFU al primer uso);
   · TODA escritura firmada «social-<uid>:<hora>»;
   · tras el registro, la clave de otro → 403 (anti-suplantación);
   · rate-limits: 30 posts/día, 20 msg/min, 1 historia activa;
   · notificaciones SOLO por eventos reales.                   */
'use strict';

const GH_API = 'https://api.github.com';
const REPO = process.env.GH_REPO || 'Dcardkevein15/pelisfull';
const PATH = 'social.json';
const DATA_BRANCH = 'chat-data';
const MAX_POSTS_DAY = 30;
const MAX_MSG_MIN = 20;
const STORY_TTL = 24 * 3600e3;
const ONLINE_MS = 5 * 60e3;
const MAX_POSTS = 400;
const MAX_NOTIFS = 50;
const MAX_CONV_MSGS = 250;
const DEDUPE_MS = 60000;
const AV_GRADS = [0, 1, 2, 3, 4, 5, 6, 7];

const DEF = () => ({
  v: 2,
  users: {},
  posts: [],
  stories: [],
  convos: {},
  notifs: {},
  groups: [],
});

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

module.exports.config = { maxDuration: 10 };

/* ── firma de usuario: TOFU + verificación ECDSA ── */
async function verifyUser(db, uid, sigB64, pubB64) {
  try {
    if (!uid || !/^(x-)?[a-z0-9-]{6,40}$/i.test(uid)) return false;
    const u = db.users[uid];
    const key64 = (u && u.pubKey) ? u.pubKey : (pubB64 || '');
    if (!key64) return false;
    const key = await crypto.subtle.importKey('spki', Buffer.from(key64, 'base64'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const sig = Buffer.from(String(sigB64 || ''), 'base64');
    if (!sig.length) return false;
    const hora = Math.floor(Date.now() / 3600000);
    for (const h of [hora, hora - 1]) {
      const data = new TextEncoder().encode('social-' + uid + ':' + h);
      if (await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, data)) {
        if (!u) db.users[uid] = { uid, follows: [], saved: [], lastRead: {}, interests: [] };
        if (!db.users[uid].pubKey) db.users[uid].pubKey = key64;
        if (!db.users[uid].uid) db.users[uid].uid = uid;
        return true;
      }
    }
  } catch (e) { console.error('social verify: ' + e.message); }
  return false;
}

function touchUser(db, uid, b) {
  const u = db.users[uid] || (db.users[uid] = { uid, follows: [], saved: [], lastRead: {}, interests: [] });
  u.uid = uid;
  if (b.name) u.name = String(b.name).slice(0, 40);
  if (b.tag) u.tag = String(b.tag).slice(0, 6);
  if (b.grad !== undefined && AV_GRADS.includes(+b.grad)) u.grad = +b.grad;
  if (b.flag) u.flag = String(b.flag).slice(0, 4);
  return u;
}

function notify(db, toUid, type, byName, text) {
  if (!toUid || !(toUid in db.users)) return;
  const list = db.notifs[toUid] || (db.notifs[toUid] = []);
  list.unshift({ id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type, byName: String(byName || '').slice(0, 40), text: String(text || '').slice(0, 90), at: Date.now(), read: false });
  if (list.length > MAX_NOTIFS) db.notifs[toUid] = list.slice(0, MAX_NOTIFS);
}

/* id determinista: reintentos con el mismo texto en la misma hora → misma id */
function stableId(prefix, uid, text) {
  const h = require('crypto').createHash('sha256').update(prefix + '|' + uid + '|' + String(text || '') + '|' + Math.floor(Date.now() / 3600000)).digest('base64url').slice(0, 10);
  return prefix + h;
}
const deduped = (arr, uid, text) =>
  arr.some(x => x.uid === uid && x.text === String(text) && Date.now() - (x.at || 0) < DEDUPE_MS);

function prune(db) {
  const now = Date.now();
  db.stories = (db.stories || []).filter(s => now - s.at < STORY_TTL);
  db.posts = (db.posts || []).slice(-MAX_POSTS);
  for (const uid of Object.keys(db.notifs || {})) {
    if (db.notifs[uid].length > MAX_NOTIFS) db.notifs[uid] = db.notifs[uid].slice(0, MAX_NOTIFS);
  }
  for (const cid of Object.keys(db.convos || {})) {
    if (db.convos[cid].length > MAX_CONV_MSGS) db.convos[cid] = db.convos[cid].slice(-MAX_CONV_MSGS);
  }
  /* techo de usuarios: si crece demasiado, fuera los sin actividad
     >30d que nunca publicaron (los activos y con posts se quedan)   */
  const uids = Object.keys(db.users || {});
  if (uids.length > 4000) {
    for (const uid of uids) {
      const u = db.users[uid];
      const last = u.beat || u.createdAt || 0;
      if (now - last > 30 * 864e5 && !db.posts.some(p => p.uid === uid)) delete db.users[uid];
      if (Object.keys(db.users).length <= 3000) break;
    }
  }
}

function convoIdOf(a, b) { return [a, b].sort().join('~'); }

function convoSummary(db, uid) {
  const out = [];
  for (const cid of Object.keys(db.convos || {})) {
    if (!cid.includes(uid)) continue;
    const msgs = db.convos[cid];
    const last = msgs[msgs.length - 1];
    if (!last) continue;
    const lastRead = (db.users[uid] && db.users[uid].lastRead && db.users[uid].lastRead[cid]) || 0;
    const unread = msgs.filter(m => m.at > lastRead && m.uid !== uid).length;
    const isGroup = cid.startsWith('g:');
    const other = cid.split('~').find(x => x !== uid) || '';
    const otherU = !isGroup && db.users[other];
    out.push({
      id: cid, last: last.text.slice(0, 80), at: last.at, unread,
      peerName: isGroup ? (db.groups.find(g => 'g:' + g.id === cid) || {}).name || 'Grupo' : (otherU ? otherU.name + ' ' + (otherU.tag || '') : 'Usuario'),
      peerOnline: !!(otherU && otherU.beat && Date.now() - otherU.beat < ONLINE_MS),
    });
  }
  out.sort((a, b) => b.at - a.at);
  return out.slice(0, 30);
}

/* ═══════════ OPS — funciones puras sobre la base fresca ═══════════
   Cada op recibe ctx = { db, b, uid } y devuelve { resp } | { fail: { status, error } }.
   Se RE-APLICAN sobre base fresca en cada intento del bucle CAS.   */
const OPS = {
  async profile({ db, b, uid }) {
    const u = touchUser(db, uid, b);
    if (b.bio !== undefined) u.bio = String(b.bio).slice(0, 200);
    if (b.interests !== undefined) {
      try { u.interests = (JSON.parse(String(b.interests)) || []).slice(0, 10).map(x => String(x).slice(0, 20)); } catch (e) { }
    }
    return { resp: { ok: true, user: { name: u.name, tag: u.tag, bio: u.bio || '', interests: u.interests } } };
  },

  async post({ db, b, uid }) {
    const u = touchUser(db, uid, b);
    const isOfficial = uid === 'x-stream-social-team';
    if (!isOfficial) {
      const today = new Date().toISOString().slice(0, 10);
      if (u.postsDay !== today) { u.postsDay = today; u.postsToday = 0; }
      if ((u.postsToday || 0) >= MAX_POSTS_DAY) return { fail: { status: 429, error: 'límite de publicaciones de hoy alcanzado' } };
      u.postsToday++;
    }
    const text = String(b.text || '').trim().slice(0, 800);
    if (!text && !b.img) return { fail: { status: 400, error: 'la publicación está vacía' } };
    let poll = null;
    if (b.poll) {
      try {
        const opts = (JSON.parse(String(b.poll)) || []).map(o => String(o).slice(0, 60)).filter(Boolean).slice(0, 4);
        if (opts.length >= 2) poll = { o: opts, votes: {} };
      } catch (e) { }
    }
    const id = stableId('p', uid, text + '|' + (b.img || '') + '|' + (b.poll || ''));
    /* id determinista → un reintento ACTUALIZA la misma publicación, jamás la duplica */
    const post = {
      id, uid, name: u.name || 'Usuario', tag: u.tag || '', grad: u.grad || 0, flag: u.flag || '',
      text, img: b.img ? String(b.img).slice(0, 500) : '', link: b.link ? String(b.link).slice(0, 400) : '',
      poll, at: Date.now(), likes: [], comments: [], shares: 0, official: isOfficial,
    };
    const i = db.posts.findIndex(p => p.id === id);
    if (i >= 0) db.posts[i] = post; else db.posts.push(post);
    prune(db);
    return { resp: { ok: true, post } };
  },

  async comment({ db, b, uid }) {
    const u = touchUser(db, uid, b);
    const p = db.posts.find(x => x.id === b.postId);
    const text = String(b.text || '').trim().slice(0, 400);
    if (!p) return { fail: { status: 404, error: 'publicación no encontrada' } };
    if (!text) return { fail: { status: 400, error: 'comentario vacío' } };
    if (deduped(p.comments, uid, text)) return { resp: { ok: true, comments: p.comments.length, deduped: true } };
    p.comments.push({ uid, name: u.name, text, at: Date.now() });
    if (p.comments.length > 100) p.comments = p.comments.slice(-100);
    if (p.uid !== uid) notify(db, p.uid, 'comment', u.name, 'comentó tu publicación: «' + text.slice(0, 50) + '»');
    return { resp: { ok: true, comments: p.comments.length } };
  },

  async like({ db, b, uid }) {
    const u = touchUser(db, uid, b);
    const p = db.posts.find(x => x.id === b.postId);
    if (!p) return { fail: { status: 404, error: 'publicación no encontrada' } };
    const on = String(b.on || '') === '1';
    const i = p.likes.indexOf(uid);
    if (on && i < 0) { p.likes.push(uid); if (p.uid !== uid) notify(db, p.uid, 'like', u.name, 'le gusta tu publicación'); }
    if (!on && i >= 0) p.likes.splice(i, 1);
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
    const u = touchUser(db, uid, b);
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
    const u = touchUser(db, uid, b);
    const target = String(b.target || '');
    if (!target || target === uid) return { fail: { status: 400, error: 'objetivo inválido' } };
    u.follows = u.follows || [];
    const on = String(b.on || '') === '1';
    const i = u.follows.indexOf(target);
    if (on && i < 0) {
      u.follows.push(target);
      if (!target.startsWith('g:')) notify(db, target, 'follow', u.name, 'empezó a seguirte');
    }
    if (!on && i >= 0) u.follows.splice(i, 1);
    return { resp: { ok: true } };
  },

  async story({ db, b, uid }) {
    const u = touchUser(db, uid, b);
    const text = String(b.text || '').slice(0, 120);
    const img = b.img ? String(b.img).slice(0, 500) : '';
    if (!text && !img) return { fail: { status: 400, error: 'historia vacía' } };
    db.stories = (db.stories || []).filter(s => s.uid !== uid);
    db.stories.push({ id: stableId('s', uid, text + img), uid, name: u.name, tag: u.tag, grad: u.grad || 0, img, text, live: String(b.live || '') === '1', at: Date.now() });
    return { resp: { ok: true } };
  },

  async msg({ db, b, uid }) {
    const u = touchUser(db, uid, b);
    const text = String(b.text || '').trim().slice(0, 400);
    if (!text) return { fail: { status: 400, error: 'mensaje vacío' } };
    const minNow = Math.floor(Date.now() / 60000);
    if (u.msgsAt !== minNow) { u.msgsAt = minNow; u.msgsMin = 0; }
    if ((u.msgsMin || 0) >= MAX_MSG_MIN) return { fail: { status: 429, error: 'demasiados mensajes seguidos — espera un momento' } };
    u.msgsMin++;
    let cid = String(b.to || '');
    if (cid.startsWith('g:')) {
      const gid = cid.slice(2);
      if (!db.groups.some(g => g.id === gid)) return { fail: { status: 404, error: 'grupo no encontrado' } };
      if (!(u.follows || []).includes(cid)) return { fail: { status: 403, error: 'únete al grupo antes de escribir' } };
    } else {
      if (!(cid in db.users)) return { fail: { status: 404, error: 'ese usuario no existe aún en la comunidad' } };
      cid = convoIdOf(uid, cid);
    }
    const list = db.convos[cid] || (db.convos[cid] = []);
    if (deduped(list, uid, text)) return { resp: { ok: true, cid, deduped: true } };
    list.push({ uid, name: u.name, text, at: Date.now() });
    u.lastRead = u.lastRead || {};
    u.lastRead[cid] = Date.now();
    if (!cid.startsWith('g:')) {
      const other = cid.split('~').find(x => x !== uid);
      notify(db, other, 'msg', u.name, 'te escribió: «' + text.slice(0, 50) + '»');
    }
    prune(db);
    return { resp: { ok: true, cid } };
  },

  async read({ db, b, uid }) {
    const u = touchUser(db, uid, b);
    u.lastRead = u.lastRead || {};
    u.lastRead[String(b.cid || '')] = Date.now();
    return { resp: { ok: true } };
  },

  async notifsRead({ db, uid }) {
    if (!db.users[uid]) return { fail: { status: 404, error: 'usuario sin registro' } };
    db.users[uid].readNotifs = Date.now();
    return { resp: { ok: true } };
  },

  async beat({ db, b, uid }) {
    /* latido de presencia — solo escribe si el último fue hace >60s (y
       ahora con reintentos CAS: ya no se pierde contra otra escritura)  */
    if (!uid) return { fail: { status: 400, error: 'sin uid' } };
    const u = touchUser(db, uid, b);
    const stale = !u.beat || Date.now() - u.beat > 60000;
    u.beat = Date.now();
    u.createdAt = u.createdAt || Date.now();
    return stale ? { resp: { ok: true } } : { resp: { ok: true }, nowrite: true };
  },
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-social-sig');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const b = Object.assign({}, req.query || {});
    if (req.body && typeof req.body === 'object') Object.assign(b, req.body);
    else if (typeof req.body === 'string' && req.body) { try { Object.assign(b, JSON.parse(req.body)); } catch (e) { } }
    const op = String(b.op || 'state');
    const uid = String(b.uid || '');
    const sig = String(req.headers['x-social-sig'] || b.sig || '');

    /* ── lecturas (una sola pasada, sin CAS) ── */
    if (op === 'state' || op === 'feed' || op === 'messages') {
      const snap = await readSocial();
      const db = snap.db;
      if (!db.groups || !db.groups.length) seedGroups(db);
      const today = new Date().toISOString().slice(0, 10);
      if (op === 'messages') {
        const cid = String(b.cid || '');
        if (!cid.includes(uid)) return res.status(403).json({ ok: false, error: 'conversación ajena' });
        const msgs = (db.convos[cid] || []).slice(-80);
        const u = db.users[uid];
        if (u) { u.lastRead = u.lastRead || {}; u.lastRead[cid] = Date.now(); await writeSocial(db, snap.sha); }
        return res.status(200).json({ ok: true, msgs });
      }
      /* op === state/feed */
      prune(db);
      const now = Date.now();
      const readNotifs = (db.users[uid] && db.users[uid].readNotifs) || 0;
      const me = db.users[uid] || null;
      const myNotifs = uid ? (db.notifs[uid] || []).slice(0, 30) : [];
      return res.status(200).json({
        ok: true,
        posts: db.posts.slice(-60).reverse(),
        stories: db.stories.slice(-40).reverse(),
        groups: db.groups.map(g => ({ ...g, members: Object.values(db.users).filter(u => (u.follows || []).includes('g:' + g.id)).length })),
        suggested: uid
          ? Object.values(db.users)
            .filter(u => u.uid && u.uid !== uid && !(me && (me.follows || []).includes(u.uid)))
            .sort((a, z) => (z.beat || 0) - (a.beat || 0))
            .map(u => ({ uid: u.uid, name: u.name, tag: u.tag, grad: u.grad || 0, bio: u.bio || '', online: !!(u.beat && now - u.beat < ONLINE_MS), posts: db.posts.filter(p => p.uid === u.uid).length }))
            .slice(0, 12)
          : [],
        follows: me ? (me.follows || []) : [],
        saved: me ? (me.saved || []) : [],
        me: me ? { bio: me.bio || '', interests: me.interests || [], name: me.name, tag: me.tag } : null,
        convos: uid ? convoSummary(db, uid) : [],
        notifs: myNotifs,
        notifsUnread: myNotifs.filter(n => n.at > readNotifs).length,
        onlineCount: Object.values(db.users).filter(u => u.beat && now - u.beat < ONLINE_MS).length,
        onlineUsers: Object.values(db.users)
          .filter(u => u.beat && now - u.beat < ONLINE_MS)
          .slice(0, 20)
          .map(u => ({ uid: u.uid, name: u.name, grad: u.grad || 0 })),
        _today: today,
      });
    }

    /* ── escrituras: CAS — re-aplicar sobre base fresca hasta 6 intentos ── */
    const opFn = OPS[op];
    if (!opFn) return res.status(400).json({ ok: false, error: 'op desconocida: ' + op });
    let lastFail = null;
    for (let attempt = 1; attempt <= 6; attempt++) {
      const snap = await readSocial();
      const db = snap.db;
      if (!db.groups || !db.groups.length) seedGroups(db);
      if (!(await verifyUser(db, uid, sig, b.pubKey))) {
        return res.status(403).json({ ok: false, error: 'firma inválida — cada acción se firma con la clave de tu dispositivo' });
      }
      const out = await opFn({ db, b, uid });
      if (out.fail) return res.status(out.fail.status).json({ ok: false, error: out.fail.error });
      if (out.nowrite) { out.resp.w = 'skip'; return res.status(200).json(out.resp); }
      const wr = await writeSocial(db, snap.sha);
      if (wr === true) {
        out.resp.w = 'ok';
        return res.status(200).json(out.resp);
      }
      lastFail = wr;
      await new Promise(r2 => setTimeout(r2, 350 * attempt));   /* 409/congestión: releer y RE-APLICAR */
    }
    return res.status(503).json({ ok: false, error: 'la comunidad está muy activa ahora mismo — reintenta en unos segundos (' + lastFail + ')' });
  } catch (e) {
    console.error('social handler: ' + e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
};

/* ── GitHub como almacén — lectura viva + PUT con el sha del MISMO intento ── */
async function ghGet(path) {
  const GHH = { Authorization: `token ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' };
  const cs = await fetch(`${GH_API}/repos/${REPO}/commits?path=${path}&sha=${DATA_BRANCH}&per_page=1&t=${Date.now()}`, { cache: 'no-store', headers: GHH });
  if (!cs.ok) { console.error('social ghGet commits ' + cs.status); return null; }
  const cl = await cs.json();
  if (!cl || !cl[0] || !cl[0].sha) return null;
  const commitSha = cl[0].sha;
  let sha = null;
  try {
    const cc = await fetch(`${GH_API}/repos/${REPO}/commits/${commitSha}?t=${Date.now()}`, { cache: 'no-store', headers: GHH });
    if (cc.ok) {
      const det = await cc.json();
      const f = (det.files || []).find(x => x.filename === path);
      if (f) sha = f.sha;
    }
  } catch (e) { console.error('social ghGet blobsha: ' + e.message); }
  let content = null;
  try {
    const jz = await fetch(`https://cdn.jsdelivr.net/gh/${REPO}@${commitSha}/${path}?t=${Date.now()}`, { cache: 'no-store' });
    if (jz.ok) {
      content = await jz.text();
      if (content && content.length < 10) content = null;
    }
  } catch (e) { console.error('social ghGet jsdelivr: ' + e.message); }
  if (content == null) {
    try {
      const rr = await fetch(`https://raw.githubusercontent.com/${REPO}/${commitSha}/${path}?t=${Date.now()}`, { cache: 'no-store' });
      if (rr.ok) content = await rr.text();
      else console.error('social ghGet raw@' + commitSha.slice(0, 8) + ' ' + rr.status);
    } catch (e) { console.error('social ghGet raw: ' + e.message); }
  }
  if (content == null) return null;
  return { sha, content };
}

async function readSocial() {
  try {
    const f = await ghGet(PATH);
    if (f) {
      const parsed = JSON.parse(f.content);
      if (parsed && typeof parsed === 'object' && parsed.users) return { db: parsed, sha: f.sha };
    }
  } catch (e) { console.error('social readSocial: ' + e.message); }
  return { db: DEF(), sha: null };
}

async function writeSocial(db, sha) {
  const r = await ghPut(PATH, JSON.stringify(db), sha);
  return r === true ? true : r;
}

async function ghPut(path, content, sha) {
  const body = {
    message: `social ${new Date().toISOString()} [skip ci]`,
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
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    console.error('social ghPut ' + r.status + ': ' + t.slice(0, 200));
  }
  return r.ok ? true : r.status;
}
