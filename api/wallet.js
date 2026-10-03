/* ═══════════════════════════════════════════════════════════
   🪙 WALLET X·STREAM — monedas por IP (anti-abuso)
   Un usuario = una IP = un monedero. Sin importar cuántos
   navegadores o incógnito use, recibe SOLO 1 asignación diaria.

   El almacén vive en la rama "chat-data" del repo (igual que el
   chat — no redespliega la web). Los desbloqueos también viven
   aquí para que no se pierdan entre navegadores del mismo usuario.

   Rutas:
   GET  /api/wallet                          → estado del monedero
   POST /api/wallet { op:'init' }            → asignar 500 del día (1 por IP)
   POST /api/wallet { op:'unlock', sid, epN, kind }  → desbloquear capítulo (7 días)
   POST /api/wallet { op:'earn' }            → +100 por anuncio
   POST /api/wallet { op:'gift', amount, msg }  → regalo del admin
   POST /api/wallet { op:'adminCfg', ..., adminKey }  → admin cambia config
   ═══════════════════════════════════════════════════════════ */
'use strict';

const GH_API = 'https://api.github.com';
const REPO = process.env.GH_REPO || 'Dcardkevein15/pelisfull';
const WALLET_PATH = 'wallet.json';
const DATA_BRANCH = 'chat-data';
const SKIP_CI = ' [skip ci]';

module.exports.config = { maxDuration: 10 };

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-wallet-key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.headers['x-real-ip'] || 'unknown';
    const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})) : {};
    const op = req.query?.op || body.op || (req.method === 'GET' ? 'state' : '');
    const walletKey = req.headers['x-wallet-key'] || body.walletKey || '';

    const db = await readWallet();
    const cfg = db.cfg || { dailyCoins: 500, priceAnime: 100, priceMovie: 200, adReward: 100, unlockDays: 7 };
    const today = new Date().toISOString().slice(0, 10);

    /* ── obtener o crear el monedero de esta IP ── */
    const getWallet = () => {
      if (!db.wallets[ip]) {
        db.wallets[ip] = { coins: 0, day: '', unlocked: {}, adsWatched: 0, totalSpent: 0, totalEarned: 0, createdAt: Date.now() };
      }
      const w = db.wallets[ip];
      /* reset diario: solo 1 asignación por IP por día */
      if (w.day !== today) {
        w.day = today;
        w.coins = cfg.dailyCoins;
      }
      return w;
    };

    const w = getWallet();
    let changed = false;
    let resp = { ok: true };

    switch (op) {
      case 'state': {
        resp = { ok: true, coins: w.coins, day: w.day, cfg,
          unlockedCount: Object.keys(w.unlocked).length,
          unlockLeft: {} };
        for (const [k, at] of Object.entries(w.unlocked)) {
          const left = cfg.unlockDays * 86400000 - (Date.now() - at);
          if (left > 0) resp.unlockLeft[k] = Math.ceil(left / 86400000);
          else { delete w.unlocked[k]; changed = true; }
        }
        break;
      }

      case 'init': {
        /* si ya se le asignó hoy, NO dar de nuevo */
        if (w.day === today) {
          resp = { ok: true, alreadyAssigned: true, coins: w.coins, cfg };
        } else {
          w.day = today;
          w.coins = cfg.dailyCoins;
          changed = true;
          resp = { ok: true, assigned: true, coins: w.coins, cfg };
        }
        break;
      }

      case 'unlock': {
        const sid = String(body.sid || '');
        const epN = +body.epN || 0;
        const kind = body.kind === 'pelicula' ? 'pelicula' : 'serie';
        const price = kind === 'pelicula' ? cfg.priceMovie : cfg.priceAnime;
        const key = `${sid}:${epN}`;
        if (w.unlocked[key] && Date.now() - w.unlocked[key] < cfg.unlockDays * 86400000) {
          resp = { ok: true, alreadyUnlocked: true, coins: w.coins };
        } else if (w.coins < price) {
          resp = { ok: false, reason: 'no-coins', coins: w.coins, price };
        } else {
          w.coins -= price;
          w.totalSpent += price;
          w.unlocked[key] = Date.now();
          changed = true;
          resp = { ok: true, unlocked: true, coins: w.coins, price };
        }
        break;
      }

      case 'earn': {
        w.coins += cfg.adReward;
        w.totalEarned += cfg.adReward;
        w.adsWatched++;
        changed = true;
        resp = { ok: true, coins: w.coins, earned: cfg.adReward };
        break;
      }

      case 'check': {
        const sid = String(body.sid || '');
        const epN = +body.epN || 0;
        const kind = body.kind === 'pelicula' ? 'pelicula' : 'serie';
        const price = kind === 'pelicula' ? cfg.priceMovie : cfg.priceAnime;
        const key = `${sid}:${epN}`;
        const isUnlocked = w.unlocked[key] && (Date.now() - w.unlocked[key]) < cfg.unlockDays * 86400000;
        resp = { ok: true, unlocked: isUnlocked, coins: w.coins, price, enough: w.coins >= price };
        if (w.unlocked[key] && !isUnlocked) { delete w.unlocked[key]; changed = true; }
        break;
      }

      case 'gift': {
        /* regalo del admin a TODOS los monederos */
        if (!walletKey || walletKey !== process.env.WALLET_ADMIN_KEY) {
          return res.status(403).json({ ok: false, error: 'solo el admin puede regalar' });
        }
        const amount = Math.max(1, +body.amount || 100);
        const msg = String(body.msg || '🎁 ¡Regalo del administrador!').slice(0, 200);
        const giftAt = Date.now();
        for (const [ipKey, wl] of Object.entries(db.wallets)) {
          if (!wl.lastGiftAt || wl.lastGiftAt < giftAt) {
            wl.coins += amount;
            wl.totalEarned += amount;
            wl.lastGiftAt = giftAt;
          }
        }
        changed = true;
        resp = { ok: true, gifted: Object.keys(db.wallets).length, amount };
        break;
      }

      case 'adminCfg': {
        if (!walletKey || walletKey !== process.env.WALLET_ADMIN_KEY) {
          return res.status(403).json({ ok: false, error: 'solo el admin' });
        }
        for (const k of ['dailyCoins', 'priceAnime', 'priceMovie', 'adReward', 'unlockDays']) {
          if (body[k] !== undefined) cfg[k] = Math.max(1, +body[k]);
        }
        db.cfg = cfg;
        changed = true;
        resp = { ok: true, cfg };
        break;
      }

      default:
        return res.status(400).json({ ok: false, error: 'op desconocida' });
    }

    if (changed) {
      db.lastWrite = Date.now();
      await writeWallet(db);
    }
    return res.status(200).json(resp);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};

/* ── GitHub como almacén (rama chat-data, no redespliega) ── */
async function ghGet(path) {
  const r = await fetch(`${GH_API}/repos/${REPO}/contents/${path}?ref=${DATA_BRANCH}`, {
    headers: { Authorization: `token ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' },
  });
  if (!r.ok) return null;
  const j = await r.json();
  return { sha: j.sha, content: Buffer.from(j.content, 'base64').toString('utf8') };
}

async function ghPut(path, content, sha) {
  const body = { message: `🪙 wallet ${new Date().toISOString()}${SKIP_CI}`, content: Buffer.from(content).toString('base64'), branch: DATA_BRANCH };
  if (sha) body.sha = sha;
  const r = await fetch(`${GH_API}/repos/${REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `token ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify(body),
  });
  return r.ok;
}

async function readWallet() {
  try {
    const f = await ghGet(WALLET_PATH);
    if (f) return JSON.parse(f.content);
  } catch (e) { }
  return { wallets: {}, cfg: null };
}

async function writeWallet(db) {
  try {
    const f = await ghGet(WALLET_PATH);
    await ghPut(WALLET_PATH, JSON.stringify(db), f?.sha);
  } catch (e) { }
}
