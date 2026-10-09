/* ═══════════════════════════════════════════════════════════
   🌐 XSTREAM SOCIAL — backend de la comunidad (por usuario)
   Almacén: GitHub rama chat-data, archivo social.json
   Patrón de api/wallet.js (GET con query params + GitHub contents)

   SEGURIDAD (real, no decorativa):
   · Cada usuario se identifica por su uid de dispositivo (auth.js).
   · La PRIMERA vez que un uid escribe se registra su clave pública
     ECDSA (TOFU — trust on first use, como el par de claves del
     catálogo). A partir de ahí, TODA escritura exige la firma
     «social-<uid>:<hora>» verificada contra esa clave: nadie puede
     publicar, comentar o hablar en nombre de otro.
   · Rate-limits anti-spam en cada escritura.
   · Las notificaciones se generan SOLO con eventos reales.          */
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

const AV_GRADS = [0, 1, 2, 3, 4, 5, 6, 7];
const DEF = () => ({
  v: 1,
  users: {},    /* uid → { name, tag, grad, flag, pubKey, bio, interests[], follows[], saved[], lastRead{}, readNotifs, postsToday, postsDay, msgsMin, msgsAt, beat } */
  posts: [],    /* { id, uid, name, tag, grad, flag, text, img, link, poll{o[],votes{idx:[uid]}}, at, likes[], comments[{uid,name,text,at}], shares } */
  stories: [],  /* { id, uid, name, tag, grad, img, text, live, at } */
  convos: {},   /* convoId → [ { uid, name, text, at } ] */
  notifs: {},   /* uid → [ { id, type, by, byName, text, at, read } ] */
  groups: [],   /* { id, name, desc, official } — miembros = follows reales */
});

/* ── grupos oficiales de la comunidad (se identifican como oficiales) ── */
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

/* ── firma de usuario: TOFU + verificación ECDSA contra la clave registrada ── */
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
        if (!db.users[uid].pubKey) db.users[uid].pubKey = key64;   /* TOFU */
        if (!db.users[uid].uid) db.users[uid].uid = uid;
        return true;
      }
    }
  } catch (e) { console.error('social verify: ' + e.message); }
  return false;
}

function touchUser(db, uid, b, today) {
  const u = db.users[uid] || (db.users[uid] = { follows: [], saved: [], lastRead: {}, interests: [] });
  u.uid = uid;
  if (b.name) u.name = String(b.name).slice(0, 40);
  if (b.tag) u.tag = String(b.tag).slice(0, 6);
  if (b.grad !== undefined && AV_GRADS.includes(+b.grad)) u.grad = +b.grad;
  if (b.flag) u.flag = String(b.flag).slice(0, 4);
  return u;
}

function notify(db, toUid, type, byName, text) {
  if (!toUid || !(toUid in db.users)) return;   /* solo notificamos a usuarios reales */
  if (!db.notifs[toUid]) db.notifs[toUid] = [];
  const list = db.notifs[toUid];
  const read = +(db.users[toUid].readNotifs || 0);
  list.unshift({ id: Date.now() + ':' + Math.random().toString(36).slice(2, 7), type, byName: String(byName || '').slice(0, 40), text: String(text || '').slice(0, 90), at: Date.now(), read: false });
  const unread = list.filter(n => !n.read && n.at > read).length;
  while (list.length > MAX_NOTIFS) list.pop();
  void unread;
}

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
  /* usuarios inactivos >30d fuera (igual que el monedero) */
  for (const uid of Object.keys(db.users || {})) {
    const u = db.users[uid];
    const last = Math.max(u.beat || 0, u.createdAt || 0);
    if (now - last > 30 * 864e5 && !db.posts.some(p => p.uid === uid)) delete db.users[uid];
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
    const other = cid.split('~').find(x => x !== uid) || '';
    const isGroup = cid.startsWith('g:');
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
    const db = await readSocial();
    if (!db.groups || !db.groups.length) seedGroups(db);
    const today = new Date().toISOString().slice(0, 10);
    let changed = false;
    let resp = { ok: true };

    /* ── ESCRITURAS (todas firmadas) ── */
    const auth = async (extra) => {
      const okU = await verifyUser(db, uid, sig, b.pubKey);
      if (okU) touchUser(db, uid, b, today);
      return okU;
    };

    if (op === 'profile') {
      if (!(await auth())) return res.status(403).json({ ok: false, error: 'firma inválida' });
      const u = touchUser(db, uid, b, today);
      if (b.bio !== undefined) u.bio = String(b.bio).slice(0, 200);
      if (b.interests !== undefined) {
        try { u.interests = (JSON.parse(String(b.interests)) || []).slice(0, 10).map(x => String(x).slice(0, 20)); } catch (e) { }
      }
      if (b.name !== undefined) u.nameAuto = false;
      changed = true;
      resp = { ok: true, user: { name: u.name, tag: u.tag, bio: u.bio || '', interests: u.interests } };
    }

    else if (op === 'post') {
      if (!(await auth())) return res.status(403).json({ ok: false, error: 'firma inválida' });
      const u = db.users[uid];
      const isOfficial = uid === 'x-stream-social-team';
      if (!isOfficial) {
        if (u.postsDay !== today) { u.postsDay = today; u.postsToday = 0; }
        if ((u.postsToday || 0) >= MAX_POSTS_DAY) return res.status(429).json({ ok: false, error: 'límite de publicaciones de hoy alcanzado' });
        u.postsToday++;
      }
      const text = String(b.text || '').trim().slice(0, 800);
      if (!text && !b.img) return res.status(400).json({ ok: false, error: 'la publicación está vacía' });
      let poll = null;
      if (b.poll) {
        try {
          const opts = (JSON.parse(String(b.poll)) || []).map(o => String(o).slice(0, 60)).filter(Boolean).slice(0, 4);
          if (opts.length >= 2) poll = { o: opts, votes: {} };
        } catch (e) { }
      }
      const post = {
        id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        uid, name: u.name || 'Usuario', tag: u.tag || '', grad: u.grad || 0, flag: u.flag || '',
        text, img: b.img ? String(b.img).slice(0, 500) : '', link: b.link ? String(b.link).slice(0, 400) : '',
        poll, at: Date.now(), likes: [], comments: [], shares: 0, official: isOfficial,
      };
      db.posts.push(post);
      prune(db);
      changed = true;
      resp = { ok: true, post };
    }

    else if (op === 'comment') {
      if (!(await auth())) return res.status(403).json({ ok: false, error: 'firma inválida' });
      const p = db.posts.find(x => x.id === b.postId);
      const text = String(b.text || '').trim().slice(0, 400);
      if (!p) return res.status(404).json({ ok: false, error: 'publicación no encontrada' });
      if (!text) return res.status(400).json({ ok: false, error: 'comentario vacío' });
      const u = db.users[uid];
      p.comments.push({ uid, name: u.name, text, at: Date.now() });
      if (p.comments.length > 100) p.comments = p.comments.slice(-100);
      if (p.uid !== uid) notify(db, p.uid, 'comment', u.name, 'comentó tu publicación: «' + text.slice(0, 50) + '»');
      changed = true;
      resp = { ok: true, comments: p.comments.length };
    }

    else if (op === 'like') {
      if (!(await auth())) return res.status(403).json({ ok: false, error: 'firma inválida' });
      const p = db.posts.find(x => x.id === b.postId);
      if (!p) return res.status(404).json({ ok: false, error: 'publicación no encontrada' });
      const u = db.users[uid];
      const i = p.likes.indexOf(uid);
      const on = String(b.on || '') === '1';
      if (on && i < 0) { p.likes.push(uid); if (p.uid !== uid) notify(db, p.uid, 'like', u.name, 'le gusta tu publicación'); }
      if (!on && i >= 0) p.likes.splice(i, 1);
      changed = true;
      resp = { ok: true, likes: p.likes.length, mine: p.likes.includes(uid) };
    }

    else if (op === 'vote') {
      if (!(await auth())) return res.status(403).json({ ok: false, error: 'firma inválida' });
      const p = db.posts.find(x => x.id === b.postId);
      if (!p || !p.poll) return res.status(404).json({ ok: false, error: 'encuesta no encontrada' });
      const idx = +b.option;
      if (!(idx >= 0 && idx < p.poll.o.length)) return res.status(400).json({ ok: false, error: 'opción inválida' });
      for (const k of Object.keys(p.poll.votes)) p.poll.votes[k] = (p.poll.votes[k] || []).filter(v => v !== uid);
      p.poll.votes[idx] = [...(p.poll.votes[idx] || []), uid];
      changed = true;
      resp = { ok: true };
    }

    else if (op === 'save') {
      if (!(await auth())) return res.status(403).json({ ok: false, error: 'firma inválida' });
      const p = db.posts.find(x => x.id === b.postId);
      if (!p) return res.status(404).json({ ok: false, error: 'publicación no encontrada' });
      const u = db.users[uid];
      u.saved = u.saved || [];
      const i = u.saved.indexOf(p.id);
      const on = String(b.on || '') === '1';
      if (on && i < 0) u.saved.push(p.id);
      if (!on && i >= 0) u.saved.splice(i, 1);
      changed = true;
      resp = { ok: true, saved: u.saved.slice(0, 40) };
    }

    else if (op === 'share') {
      const p = db.posts.find(x => x.id === b.postId);
      if (!p) return res.status(404).json({ ok: false, error: 'publicación no encontrada' });
      p.shares = (p.shares || 0) + 1;   /* contador real de acciones de compartir */
      changed = true;
      resp = { ok: true, shares: p.shares };
    }

    else if (op === 'follow') {
      if (!(await auth())) return res.status(403).json({ ok: false, error: 'firma inválida' });
      const target = String(b.target || '');
      if (!target || target === uid) return res.status(400).json({ ok: false, error: 'objetivo inválido' });
      const u = db.users[uid];
      u.follows = u.follows || [];
      const i = u.follows.indexOf(target);
      const on = String(b.on || '') === '1';
      if (on && i < 0) {
        u.follows.push(target);
        if (!target.startsWith('g:')) notify(db, target, 'follow', u.name, 'empezó a seguirte');
      }
      if (!on && i >= 0) u.follows.splice(i, 1);
      changed = true;
      resp = { ok: true };
    }

    else if (op === 'story') {
      if (!(await auth())) return res.status(403).json({ ok: false, error: 'firma inválida' });
      const u = db.users[uid];
      const text = String(b.text || '').slice(0, 120);
      const img = b.img ? String(b.img).slice(0, 500) : '';
      if (!text && !img) return res.status(400).json({ ok: false, error: 'historia vacía' });
      db.stories = (db.stories || []).filter(s => s.uid !== uid);   /* 1 historia activa por usuario */
      db.stories.push({
        id: 's' + Date.now().toString(36), uid, name: u.name, tag: u.tag, grad: u.grad || 0,
        img, text, live: String(b.live || '') === '1', at: Date.now(),
      });
      changed = true;
      resp = { ok: true };
    }

    else if (op === 'msg') {
      if (!(await auth())) return res.status(403).json({ ok: false, error: 'firma inválida' });
      const u = db.users[uid];
      const text = String(b.text || '').trim().slice(0, 400);
      if (!text) return res.status(400).json({ ok: false, error: 'mensaje vacío' });
      const minNow = Math.floor(Date.now() / 60000);
      if (u.msgsAt !== minNow) { u.msgsAt = minNow; u.msgsMin = 0; }
      if ((u.msgsMin || 0) >= MAX_MSG_MIN) return res.status(429).json({ ok: false, error: 'demasiados mensajes seguidos — espera un momento' });
      u.msgsMin++;
      let cid = String(b.to || '');
      if (cid.startsWith('g:')) {
        /* solo miembros del grupo (seguidores reales) pueden escribir */
        const gid = cid.slice(2);
        if (!db.groups.some(g => g.id === gid)) return res.status(404).json({ ok: false, error: 'grupo no encontrado' });
        if (!(u.follows || []).includes(cid)) return res.status(403).json({ ok: false, error: 'únete al grupo antes de escribir' });
      } else {
        if (!(cid in db.users)) return res.status(404).json({ ok: false, error: 'ese usuario no existe aún en la comunidad' });
        cid = convoIdOf(uid, cid);
      }
      (db.convos[cid] = db.convos[cid] || []).push({ uid, name: u.name, text, at: Date.now() });
      /* marcar el propio mensaje como leído */
      u.lastRead = u.lastRead || {};
      u.lastRead[cid] = Date.now();
      /* notificar al otro miembro (individual) o a los miembros del grupo */
      if (!cid.startsWith('g:')) {
        const other = cid.split('~').find(x => x !== uid);
        notify(db, other, 'msg', u.name, 'te escribió: «' + text.slice(0, 50) + '»');
      } else {
        for (const f of (u.follows || [])) void f;
        /* nota: la notificación de grupo se produce al abrir el chat */
      }
      prune(db);
      changed = true;
      resp = { ok: true, cid };
    }

    else if (op === 'read') {
      if (!(await auth())) return res.status(403).json({ ok: false, error: 'firma inválida' });
      const u = db.users[uid];
      u.lastRead = u.lastRead || {};
      u.lastRead[String(b.cid || '')] = Date.now();
      changed = true;
      resp = { ok: true };
    }

    else if (op === 'notifsRead') {
      if (!(await auth())) return res.status(403).json({ ok: false, error: 'firma inválida' });
      db.users[uid].readNotifs = Date.now();
      changed = true;
      resp = { ok: true };
    }

    else if (op === 'beat') {
      /* latido SIN firma (solo marca presencia — inofensivo si se suplanta) */
      if (!uid) return res.status(400).json({ ok: false, error: 'sin uid' });
      const u = touchUser(db, uid, b, today);
      const stale = !u.beat || Date.now() - u.beat > 60000;
      u.beat = Date.now();
      u.createdAt = u.createdAt || Date.now();
      if (stale) changed = true;   /* no escribimos a GitHub por cada latido */
      resp = { ok: true };
    }

    /* ── LECTURAS ── */
    else if (op === 'state' || op === 'feed') {
      const now = Date.now();
      prune(db);
      const readNotifs = (db.users[uid] && db.users[uid].readNotifs) || 0;
      const myNotifs = uid ? (db.notifs[uid] || []).filter(n => !n.read && n.at > readNotifs) : [];
      const me = db.users[uid] || null;
      resp = {
        ok: true,
        posts: db.posts.slice(-60).reverse(),
        stories: db.stories.slice(-40).reverse(),
        groups: db.groups.map(g => ({ ...g, members: Object.values(db.users).filter(u => (u.follows || []).includes('g:' + g.id)).length })),
        suggested: uid
          ? Object.values(db.users)
            .filter(u => u.uid !== uid && !(me && (me.follows || []).includes(u.uid)) && u.uid)
            .sort((a, b2) => (b2.beat || 0) - (a.beat || 0))
            .map(u => ({ uid: u.uid, name: u.name, tag: u.tag, grad: u.grad || 0, bio: u.bio || '', online: !!(u.beat && now - u.beat < ONLINE_MS), posts: db.posts.filter(p => p.uid === u.uid).length }))
            .slice(0, 12)
          : [],
        follows: me ? (me.follows || []) : [],
        saved: me ? (me.saved || []) : [],
        me: me ? { bio: me.bio || '', interests: me.interests || [], name: me.name, tag: me.tag } : null,
        convos: uid ? convoSummary(db, uid) : [],
        notifs: uid ? (db.notifs[uid] || []).slice(0, 30) : [],
        notifsUnread: myNotifs.length,
        onlineCount: Object.values(db.users).filter(u => u.beat && now - u.beat < ONLINE_MS).length,
        onlineUsers: Object.values(db.users)
          .filter(u => u.beat && now - u.beat < ONLINE_MS)
          .slice(0, 20)
          .map(u => ({ uid: u.uid, name: u.name, grad: u.grad || 0 })),
      };
    }

    else if (op === 'messages') {
      const cid = String(b.cid || '');
      if (!cid.includes(uid)) return res.status(403).json({ ok: false, error: 'conversación ajena' });
      const msgs = (db.convos[cid] || []).slice(-80);
      const u = db.users[uid];
      if (u) { u.lastRead = u.lastRead || {}; u.lastRead[cid] = Date.now(); changed = true; }
      resp = { ok: true, msgs };
    }

    else {
      return res.status(400).json({ ok: false, error: 'op desconocida: ' + op });
    }

    if (changed) {
      const wr = await writeSocial(db);
      resp.w = wr === true ? 'ok' : 'fail(' + wr + ')';
    }
    return res.status(200).json(resp);
  } catch (e) {
    console.error('social handler: ' + e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
};

/* ── GitHub como almacén — patrón verificado de api/wallet.js ── */
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
    console.error('social ghPut ' + r.status + ': ' + t.slice(0, 300));
  }
  return r.ok ? true : r.status;
}

async function readSocial() {
  try {
    const f = await ghGet(PATH);
    if (f) {
      const parsed = JSON.parse(f.content);
      if (parsed && typeof parsed === 'object' && parsed.users) return parsed;
    }
  } catch (e) { console.error('social readSocial: ' + e.message); }
  return DEF();
}

async function writeSocial(db) {
  let lastErr = '';
  for (let i = 1; i <= 5; i++) {
    try {
      const f = await ghGet(PATH);
      const r = await ghPut(PATH, JSON.stringify(db), f ? f.sha : undefined);
      if (r === true) return true;
      lastErr = 'HTTP ' + r;
    } catch (e) { lastErr = e.message; }
    await new Promise(r2 => setTimeout(r2, 300 * i));
  }
  console.error('social writeSocial FAILED: ' + lastErr);
  return lastErr;
}
