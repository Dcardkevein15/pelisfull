/* ═══════════════════════════════════════════════════════════
   🪙 WALLET X·STREAM — monedas por IP (anti-abuso incógnito)
   1 IP = 1 monedero por día. Almacén: GitHub rama chat-data.

   CONFIG (precios, recompensas, etc.):
   1. db.cfg  — la que el ADMIN publica desde el Panel de Monedas
                (op adminCfg, firmada con su clave ECDSA = canal
                INSTANTÁNEO para todos los usuarios)
   2. coinsCfg del catálogo publicado (respaldo histórico)
   3. defaults del código
   El servidor NO tiene valores propios: SOLO el admin los cambia. */
'use strict';

const GH_API = 'https://api.github.com';
const REPO = process.env.GH_REPO || 'Dcardkevein15/pelisfull';
const WALLET_PATH = 'wallet.json';
const DATA_BRANCH = 'chat-data';
const MAX_ADS_DAY = 30;
const CFG_TTL_MS = 10 * 60 * 1000;
const DEF_CFG = { dailyCoins: 500, priceAnime: 100, priceMovie: 200, adReward: 100, adDuration: 15, adClickExtra: 10, adRequireClick: true, unlockDays: 7 };
const RAW_CATALOG = 'https://raw.githubusercontent.com/Dcardkevein15/pelisfull/main/catalog.json';
/* la MISMA clave pública pinneada que CONFIG.catalogPubKey (auth.js) */
const ADMIN_PUB_B64 = process.env.ADMIN_PUB_B64
  || 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEkO2b+Vm4MNlm+97FaZdXilRkF8KCr0XfqjhtQ00wc8SCsUAz6zA60rxYqnHuRIY7fNJCL6rCYDP5W5DOaNnorA==';

module.exports.config = { maxDuration: 10 };

/* ── firma ECDSA del admin — patrón de api/chat.js (isAdminSig) ──
   el cliente firma "xstream-wallet-admin:<hora-epoch>" con la MISMA
   clave privada con la que publica el catálogo (XAUTH.signText)     */
async function isAdminSig(sigB64) {
  try {
    const key = await crypto.subtle.importKey('spki', Buffer.from(ADMIN_PUB_B64, 'base64'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const sig = Buffer.from(String(sigB64 || ''), 'base64');
    if (!sig.length) return false;
    const hora = Math.floor(Date.now() / 3600000);
    for (const h of [hora, hora - 1]) {
      const data = new TextEncoder().encode('xstream-wallet-admin:' + h);
      if (await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, data)) return true;
    }
  } catch (e) { }
  return false;
}

/* ── respaldo: coinsCfg del catálogo (cacheado 10 min) ── */
let _catCfg = { at: 0, cfg: null };

async function fetchCatalogCfg() {
  if (_catCfg.cfg && (Date.now() - _catCfg.at) < CFG_TTL_MS) return _catCfg.cfg;
  let ok = false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    /* cache:'no-store' — el runtime de Vercel (Fluid) cachea los fetch()
       según los headers de la API de GitHub e IGNORA el query string:
       sin esto el monedero leía copias viejas de wallet.json            */
    const r = await fetch(RAW_CATALOG + '?t=' + Date.now(), { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const cat = await r.json();
      const cc = cat && cat.coinsCfg;
      if (cc && typeof cc === 'object' && !Array.isArray(cc)) {
        const merged = { ...DEF_CFG };
        for (const k of ['dailyCoins', 'priceAnime', 'priceMovie', 'adReward', 'adDuration', 'adClickExtra', 'unlockDays']) {
          const n = +cc[k];
          if (!isNaN(n) && n >= 0) merged[k] = n;
        }
        if (cc.adRequireClick !== undefined) merged.adRequireClick = !!cc.adRequireClick;
        _catCfg = { at: Date.now(), cfg: merged };
        ok = true;
        return merged;
      }
    }
  } catch (e) { }
  if (!ok) _catCfg = { at: Date.now() - CFG_TTL_MS + 60000, cfg: _catCfg.cfg || DEF_CFG };
  return _catCfg.cfg;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-wallet-sig');
  /* ⚠️ SIN ESTO el edge de Vercel congela las respuestas GET del
     monedero: el saldo y los desbloqueos quedaban congelados aunque
     el archivo en GitHub ya hubiera cambiado.                        */
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const rawIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip']
      || (req.socket && req.socket.remoteAddress) || 'unknown';
    const ipKey = String(rawIp).split(',')[0].trim() || 'unknown';

    /* params: query (GET) + body (POST) — el body tiene prioridad */
    const b = Object.assign({}, req.query || {});
    if (req.body && typeof req.body === 'object') Object.assign(b, req.body);
    else if (typeof req.body === 'string' && req.body) {
      try { Object.assign(b, JSON.parse(req.body)); } catch (e) { }
    }

    const op = String(b.op || (req.method === 'GET' ? 'state' : ''));

    /* cfg efectiva: lo que el admin publicó (db.cfg) > catálogo > defaults */
    const db = await readWallet();
    let cfg;
    if (db.cfg && typeof db.cfg === 'object' && Object.keys(db.cfg).length) {
      cfg = { ...DEF_CFG, ...db.cfg };
    } else {
      cfg = await fetchCatalogCfg();
    }
    const today = new Date().toISOString().slice(0, 10);
    let changed = false;

    /* monedero de esta IP + reset diario (SOLO 1 asignación por IP/día) */
    if (!db.wallets[ipKey]) {
      db.wallets[ipKey] = { coins: 0, day: '', grant: 0, earned: 0, unlocked: {}, adsWatched: 0, totalSpent: 0, totalEarned: 0, createdAt: Date.now() };
    }
    const w = db.wallets[ipKey];

    /* 🧳 MIGRACIÓN de monederos viejos (todo mezclado en coins):
       🪙 DOS BOLSILLOS — «grant» = la beca diaria (500) que se repone cada
       día y NO acumula sobras; «earned» = lo ganado con anuncios/regalos,
       PERMANENTE y jamás tocado por el reset.
       Para separar retroactivamente: si el monedero tuvo actividad (gastó
       o ganó), lo que tiene se considera EARNED (regla de oro: NUNCA se
       quitan monedas ganadas); si nunca se usó, todo es grant sin gastar. */
    if (w.grant === undefined || w.earned === undefined) {
      const had = (w.totalSpent || 0) > 0 || (w.totalEarned || 0) > 0 || (w.adsWatched || 0) > 0;
      w.earned = had ? Math.max(0, w.coins || 0) : 0;
      w.grant = Math.max(0, (w.coins || 0) - w.earned);
    }

    if (w.day !== today) {
      w.day = today;
      /* la beca se REPONE a su valor (la sobra de ayer NO se acumula) y
         lo ganado se conserva SIEMPRE:
         · tenía 200 (beca sin gastar)      → 500  (se completa la beca)
         · tenía 600 (beca 500 + 100 ganados) → 600  (beca nueva 500 + 100)
         · tenía 1000 ganados (beca gastada)  → 1500 (beca nueva + lo ganado) */
      w.grant = cfg.dailyCoins;
      w.coins = (w.grant || 0) + (w.earned || 0);
      changed = true;   /* persistir la asignación del día */
    }

    const priceOf = (kind) => kind === 'pelicula' ? cfg.priceMovie : cfg.priceAnime;
    const isUnlockedSrv = (key) => {
      const ts = (w.unlocked || {})[key] || 0;
      return ts > 0 && (Date.now() - ts) < cfg.unlockDays * 86400000;
    };

    let resp = { ok: true, coins: w.coins, cfg, grant: w.grant, earned: w.earned };

    if (op === 'state' || op === '') {
      const now = Date.now(); const unlockLeft = {};
      for (const [k, ts] of Object.entries(w.unlocked || {})) {
        const left = Math.ceil((cfg.unlockDays * 86400000 - (now - ts)) / 86400000);
        if (left > 0) unlockLeft[k] = left;
      }
      resp = { ok: true, coins: w.coins, cfg, day: w.day, grant: w.grant, earned: w.earned, unlockedCount: Object.keys(unlockLeft).length, unlockLeft };
    }

    else if (op === 'init') {
      /* registra el monedero y PERSISTE la asignación del día —
         ninguna sesión nueva (incógnito) puede repetirla          */
      const isNew = !w.initAt;
      const stale = Date.now() - (w.lastSeen || 0) > 3600000;
      if (isNew || stale) { w.initAt = w.initAt || Date.now(); w.lastSeen = Date.now(); changed = true; }
      resp = { ok: true, alreadyAssigned: !isNew, coins: w.coins, cfg };
    }

    else if (op === 'check') {
      const key = String(b.sid || '') + ':' + (+b.epN || 0);
      const price = priceOf(b.kind);
      resp = { ok: true, unlocked: isUnlockedSrv(key), coins: w.coins, price, enough: w.coins >= price };
    }

    else if (op === 'unlock') {
      const key = String(b.sid || '') + ':' + (+b.epN || 0);
      const price = priceOf(b.kind);
      if (isUnlockedSrv(key)) {
        resp = { ok: true, alreadyUnlocked: true, coins: w.coins };
      } else if (w.coins < price) {
        resp = { ok: false, reason: 'no-coins', coins: w.coins, price };
      } else {
        /* se gasta PRIMERO la beca del día; las ganadas solo si la beca
           no alcanza — así el dinero gratis se consume antes que el
           que el usuario se ganó viendo anuncios                      */
        const fromGrant = Math.min(price, w.grant || 0);
        const fromEarned = price - fromGrant;
        w.grant = (w.grant || 0) - fromGrant;
        if (fromEarned > 0) w.earned = Math.max(0, (w.earned || 0) - fromEarned);
        w.coins = (w.grant || 0) + (w.earned || 0);
        w.totalSpent = (w.totalSpent || 0) + price;
        w.unlocked[key] = Date.now();
        changed = true;
        resp = { ok: true, unlocked: true, coins: w.coins, price, fromGrant, fromEarned };
      }
    }

    else if (op === 'earn') {
      /* límite anti-farm: MAX_ADS_DAY anuncios pagados por IP/día */
      const adsToday = (w.adsDay === today) ? (w.adsToday || 0) : 0;
      if (adsToday >= MAX_ADS_DAY) {
        resp = { ok: false, reason: 'ads-limit', coins: w.coins };
      } else {
        w.adsDay = today; w.adsToday = adsToday + 1;
        /* lo ganado con anuncios va al bolsillo PERMANENTE — el reset
           diario jamás lo toca                                             */
        w.earned = (w.earned || 0) + cfg.adReward;
        w.coins = (w.grant || 0) + (w.earned || 0);
        w.adsWatched = (w.adsWatched || 0) + 1;
        w.totalEarned = (w.totalEarned || 0) + cfg.adReward;
        changed = true;
        resp = { ok: true, coins: w.coins, earned: cfg.adReward };
      }
    }

    else if (op === 'adminCfg') {
      /* 🚀 CANAL DEL ADMIN: solo la firma ECDSA del admin (la misma
         clave del catálogo) puede cambiar la configuración           */
      const sig = String(req.headers['x-wallet-sig'] || b.sig || '');
      if (!(await isAdminSig(sig))) {
        return res.status(403).json({ ok: false, error: 'solo el admin puede cambiar la configuración' });
      }
      const next = { ...cfg };
      for (const k of ['dailyCoins', 'priceAnime', 'priceMovie', 'adReward', 'adDuration', 'adClickExtra', 'unlockDays']) {
        if (b[k] !== undefined && b[k] !== '') {
          const n = +b[k];
          if (isNaN(n) || n < 0) return res.status(400).json({ ok: false, error: 'valor inválido: ' + k });
          next[k] = n;
        }
      }
      if (b.adRequireClick !== undefined && b.adRequireClick !== '') next.adRequireClick = !!+b.adRequireClick;
      db.cfg = next;
      changed = true;
      resp = { ok: true, cfg: next, coins: w.coins };
    }

    else {
      return res.status(400).json({ ok: false, error: 'op desconocida: ' + op });
    }

    if (changed) {
      prune(db);
      /* debug: 'ok' o el error HTTP de GitHub (diagnóstico de persistencia) */
      const wr = await writeWallet(db);
      resp.w = wr === true ? 'ok' : 'fail(' + wr + ')';
    }
    return res.status(200).json(resp);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};

/* ── GitHub como almacén (rama chat-data, no redespliega) ──
   ⚠️ HALLAZGO CRÍTICO: la API de GitHub (contents, raw e incluso
   git/blobs INMUTABLES) le servía a Vercel copias VIEJAS del archivo
   (blob-sha correcto, contenido equivocado) — por eso los desbloqueos
   "se perdían" y los reembolsos no aparecían.
   LECTURA A PRUEBA DE VENENO (solo endpoints verificados en vivo):
   1. commits API → SHA del último commit del archivo (SÍ responde fresco)
   2. detalle del commit → sha del blob (para el PUT)
   3. jsDelivr @commit-sha → contenido INMUTABLE desde un CDN externo
      (no comparte capa de caché con GitHub↔Vercel)                     */
async function ghGet(path) {
  const GHH = { Authorization: `token ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' };
  /* 1. último commit que tocó este archivo (endpoint VIVO) */
  const cs = await fetch(`${GH_API}/repos/${REPO}/commits?path=${path}&sha=${DATA_BRANCH}&per_page=1&t=${Date.now()}`, {
    cache: 'no-store', headers: GHH,
  });
  if (!cs.ok) { console.error('wallet ghGet commits ' + cs.status); return null; }
  const cl = await cs.json();
  if (!cl || !cl[0] || !cl[0].sha) return null;
  const commitSha = cl[0].sha;
  /* 2. sha del BLOB (para el PUT) vía el detalle del commit (endpoint VIVO) */
  let sha = null;
  try {
    const cc = await fetch(`${GH_API}/repos/${REPO}/commits/${commitSha}?t=${Date.now()}`, {
      cache: 'no-store', headers: GHH,
    });
    if (cc.ok) {
      const det = await cc.json();
      const f = (det.files || []).find(x => x.filename === path);
      if (f) sha = f.sha;
    }
  } catch (e) { console.error('wallet ghGet blobsha: ' + e.message); }
  /* 3. contenido INMUTABLE vía jsDelivr @commit (CDN externo — el
      mismo blob-sha de GitHub aquí devuelve el contenido correcto)   */
  let content = null;
  try {
    const jz = await fetch(`https://cdn.jsdelivr.net/gh/${REPO}@${commitSha}/${path}?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (jz.ok) {
      content = await jz.text();
      /* verificación del contenido: si jsDelivr no reconoce el commit
         (demasiado reciente), cae a GitHub raw @commit (inmutable)   */
      if (content && content.length < 10) content = null;
    }
  } catch (e) { console.error('wallet ghGet jsdelivr: ' + e.message); }
  if (content == null) {
    try {
      const rr = await fetch(`https://raw.githubusercontent.com/${REPO}/${commitSha}/${path}?t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (rr.ok) content = await rr.text();
      else console.error('wallet ghGet raw@' + commitSha.slice(0, 8) + ' ' + rr.status);
    } catch (e) { console.error('wallet ghGet raw: ' + e.message); }
  }
  if (content == null) return null;
  return { sha, content };
}

async function ghPut(path, content, sha) {
  const body = {
    message: `wallet ${new Date().toISOString()} [skip ci]`,
    content: Buffer.from(content).toString('base64'),
    branch: DATA_BRANCH,
  };
  if (sha) body.sha = sha;
  const r = await fetch(`${GH_API}/repos/${REPO}/contents/${path}`, {
    method: 'PUT',
    cache: 'no-store',
    headers: {
      Authorization: `token ${process.env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    console.error('wallet ghPut ' + r.status + ': ' + t.slice(0, 300));
  }
  return r.ok ? true : r.status;
}

async function readWallet() {
  try {
    const f = await ghGet(WALLET_PATH);
    if (f) {
      const parsed = JSON.parse(f.content);
      if (parsed && typeof parsed === 'object' && parsed.wallets) return parsed;
    }
  } catch (e) { console.error('wallet readWallet: ' + e.message); }
  return { wallets: {} };
}

async function writeWallet(db) {
  /* 5 intentos con sha fresco + backoff (patrón dbWrite de chat.js) */
  let lastErr = '';
  for (let i = 1; i <= 5; i++) {
    try {
      const f = await ghGet(WALLET_PATH);
      const r = await ghPut(WALLET_PATH, JSON.stringify(db), f ? f.sha : undefined);
      if (r === true) return true;
      lastErr = 'HTTP ' + r;
    } catch (e) { lastErr = e.message; }
    await new Promise(r2 => setTimeout(r2, 300 * i));
  }
  console.error('wallet writeWallet FAILED: ' + lastErr);
  return lastErr;
}

/* elimina monederos abandonados (>30d sin actividad) para que
   wallet.json no crezca infinitamente                              */
function prune(db) {
  const now = Date.now();
  const cut = 30 * 86400000;
  for (const [ip, wl] of Object.entries(db.wallets || {})) {
    let last = Math.max(wl.lastSeen || 0, wl.createdAt || 0);
    for (const ts of Object.values(wl.unlocked || {})) last = Math.max(last, ts || 0);
    if (now - last > cut) delete db.wallets[ip];
  }
}
