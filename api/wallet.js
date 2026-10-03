/* ═══════════════════════════════════════════════════════════
   🪙 WALLET X·STREAM — monedas por IP (anti-abuso incógnito)
   1 IP = 1 monedero por día. Almacén: GitHub rama chat-data.
   El cliente usa GET con query params (el POST body no llega
   parseado en este runtime de Vercel). POST también soportado. */
'use strict';

const GH_API = 'https://api.github.com';
const REPO = process.env.GH_REPO || 'Dcardkevein15/pelisfull';
const WALLET_PATH = 'wallet.json';
const DATA_BRANCH = 'chat-data';
const MAX_ADS_DAY = 30;
const DEF_CFG = { dailyCoins: 500, priceAnime: 100, priceMovie: 200, adReward: 100, unlockDays: 7 };

module.exports.config = { maxDuration: 10 };

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-wallet-key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const rawIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip']
      || (req.socket && req.socket.remoteAddress) || 'unknown';
    const ipKey = String(rawIp).split(',')[0].trim() || 'unknown';

    /* params: query (GET) + body (POST) — el body tiene prioridad.
       LA VERSIÓN ANTERIOR IGNORABA EL QUERY EN GET (sid/epN/kind
       nunca llegaban) — este merge arregla unlock/check por GET  */
    const b = Object.assign({}, req.query || {});
    if (req.body && typeof req.body === 'object') Object.assign(b, req.body);
    else if (typeof req.body === 'string' && req.body) {
      try { Object.assign(b, JSON.parse(req.body)); } catch (e) { }
    }

    const op = String(b.op || (req.method === 'GET' ? 'state' : ''));
    const walletKey = String(req.headers['x-wallet-key'] || b.walletKey || '');

    const db = await readWallet();
    const cfg = Object.assign({}, DEF_CFG, db.cfg || {});
    const today = new Date().toISOString().slice(0, 10);

    /* monedero de esta IP + reset diario (SOLO 1 asignación por IP/día) */
    if (!db.wallets[ipKey]) {
      db.wallets[ipKey] = { coins: 0, day: '', unlocked: {}, adsWatched: 0, totalSpent: 0, totalEarned: 0, createdAt: Date.now() };
    }
    const w = db.wallets[ipKey];
    if (w.day !== today) { w.day = today; w.coins = cfg.dailyCoins; }

    const priceOf = (kind) => kind === 'pelicula' ? cfg.priceMovie : cfg.priceAnime;
    const isUnlockedSrv = (key) => {
      const ts = (w.unlocked || {})[key] || 0;
      return ts > 0 && (Date.now() - ts) < cfg.unlockDays * 86400000;
    };

    let changed = false;
    let resp = { ok: true, coins: w.coins, cfg };

    if (op === 'state' || op === '') {
      const now = Date.now(); const unlockLeft = {};
      for (const [k, ts] of Object.entries(w.unlocked || {})) {
        const left = Math.ceil((cfg.unlockDays * 86400000 - (now - ts)) / 86400000);
        if (left > 0) unlockLeft[k] = left;
      }
      resp = { ok: true, coins: w.coins, cfg, day: w.day, unlockedCount: Object.keys(unlockLeft).length, unlockLeft };
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
        w.coins -= price;
        w.totalSpent = (w.totalSpent || 0) + price;
        w.unlocked[key] = Date.now();
        changed = true;
        resp = { ok: true, unlocked: true, coins: w.coins, price };
      }
    }

    else if (op === 'earn') {
      /* límite anti-farm: MAX_ADS_DAY anuncios pagados por IP/día */
      const adsToday = (w.adsDay === today) ? (w.adsToday || 0) : 0;
      if (adsToday >= MAX_ADS_DAY) {
        resp = { ok: false, reason: 'ads-limit', coins: w.coins };
      } else {
        w.adsDay = today; w.adsToday = adsToday + 1;
        w.coins += cfg.adReward;
        w.adsWatched = (w.adsWatched || 0) + 1;
        w.totalEarned = (w.totalEarned || 0) + cfg.adReward;
        changed = true;
        resp = { ok: true, coins: w.coins, earned: cfg.adReward };
      }
    }

    else if (op === 'gift') {
      if (!walletKey || walletKey !== process.env.WALLET_ADMIN_KEY) {
        return res.status(403).json({ ok: false, error: 'solo el admin puede regalar' });
      }
      const amount = Math.max(1, +b.amount || 100);
      const msg = String(b.msg || '🎁 ¡Regalo del administrador!').slice(0, 200);
      const giftAt = Date.now();
      let gifted = 0;
      for (const [, wl] of Object.entries(db.wallets)) {
        if (!wl.lastGiftAt || wl.lastGiftAt < giftAt) {
          wl.coins += amount;
          wl.totalEarned = (wl.totalEarned || 0) + amount;
          wl.lastGiftAt = giftAt;
          gifted++;
        }
      }
      changed = true;
      resp = { ok: true, gifted, amount, msg };
    }

    else if (op === 'adminCfg') {
      if (!walletKey || walletKey !== process.env.WALLET_ADMIN_KEY) {
        return res.status(403).json({ ok: false, error: 'solo el admin' });
      }
      for (const k of ['dailyCoins', 'priceAnime', 'priceMovie', 'adReward', 'unlockDays']) {
        if (b[k] !== undefined) cfg[k] = Math.max(1, +b[k]);
      }
      db.cfg = cfg;
      changed = true;
      resp = { ok: true, cfg };
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
   Mismo patrón que api/chat.js (que SÍ persiste en producción):
   cache-buster en GET, Content-Type en PUT, reintentos con sha */
async function ghGet(path) {
  const r = await fetch(`${GH_API}/repos/${REPO}/contents/${path}?ref=${DATA_BRANCH}&t=${Date.now()}`, {
    headers: { Authorization: `token ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' },
  });
  if (r.status === 404) return null;
  if (!r.ok) { console.error('wallet ghGet ' + r.status); return null; }
  const j = await r.json();
  return { sha: j.sha, content: Buffer.from(j.content, 'base64').toString('utf8') };
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
  return { wallets: {}, cfg: null };
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
