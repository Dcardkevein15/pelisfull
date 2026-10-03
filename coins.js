/* ═══════════════════════════════════════════════════════════════
   🪙 SISTEMA DE MONEDAS X·STREAM — 1 monedero por IP
   · 500 monedas al día (el SERVIDOR asigna 1 por IP, no por navegador)
   · Anime/Hentai: 100 monedas · Películas: 200 monedas
   · Anuncio (15s + clic + 10s) = +100 monedas
   · Desbloqueos duran 7 días (viven en el servidor)
   · VIP $1/mes: sin límites (per-dispositivo)
   · EL MONEDERO VIVE EN api/wallet.js (Vercel Functions)
   · localStorage solo como caché offline                         */
const COINS = (function () {
  const LS_KEY = 'xstream-coins';
  const LS_UNLOCKED = 'xstream-unlocked';
  const LS_VIP = 'xstream-vip';
  const WALLET_API = '/api/wallet';

  const DEFAULTS = {
    dailyCoins: 500,
    priceAnime: 100,
    priceMovie: 200,
    adReward: 100,
    adDuration: 15,
    adClickExtra: 10,
    adRequireClick: true,
    unlockDays: 7,
  };
  let cfg = { ...DEFAULTS };
  try { const c = JSON.parse(localStorage.getItem(LS_KEY + '-cfg') || 'null'); if (c) cfg = { ...cfg, ...c }; } catch (e) { }
  const saveCfg = () => { try { localStorage.setItem(LS_KEY + '-cfg', JSON.stringify(cfg)); } catch (e) { } };

  let S = { coins: 0, day: '', totalSpent: 0, totalEarned: 0, adsWatched: 0 };
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const load = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (raw) S = { ...S, ...raw };
    } catch (e) { }
    /* 🚫 NO asignar monedas localmente aquí — el SERVIDOR es quien
       decide si esta IP ya recibió su asignación del día. Localmente
       empezamos en 0 y el servidor asigna (o dice "ya recibiste").
       Si asignáramos aquí, un usuario en incógnito vería 500 falsas. */
  };
  const persist = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { } };

  let unlocked = {};
  try { unlocked = JSON.parse(localStorage.getItem(LS_UNLOCKED) || '{}'); } catch (e) { }
  const persistUnlocked = () => { try { localStorage.setItem(LS_UNLOCKED, JSON.stringify(unlocked)); } catch (e) { } };
  const uk = (sid, epN) => `${sid}:${epN}`;
  const unlockMs = () => (cfg.unlockDays || 7) * 86400000;
  const isUnlocked = (sid, epN) => {
    const at = unlocked[uk(sid, epN)];
    if (!at) return false;
    if (Date.now() - at > unlockMs()) { delete unlocked[uk(sid, epN)]; persistUnlocked(); return false; }
    return true;
  };
  const unlockTimeLeft = (sid, epN) => {
    const at = unlocked[uk(sid, epN)];
    if (!at) return 0;
    const left = unlockMs() - (Date.now() - at);
    return left > 0 ? Math.ceil(left / 86400000) : 0;
  };

  let vip = null;
  try { vip = JSON.parse(localStorage.getItem(LS_VIP) || 'null'); } catch (e) { }
  const isVip = () => !!(vip && vip.until > Date.now());
  const setVip = (d) => {
    vip = { until: Date.now() + (d || 30) * 86400e3, at: Date.now() };
    try { localStorage.setItem(LS_VIP, JSON.stringify(vip)); } catch (e) { }
  };

  const priceOf = (s) => s.kind === 'pelicula' ? cfg.priceMovie : cfg.priceAnime;

  /* ── SERVIDOR: la fuente de verdad (1 por IP) ── */
  async function callWallet(op, extra = {}) {
    try {
      const r = await fetch(WALLET_API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op, ...extra }),
      });
      const j = await r.json();
      if (j.cfg) { cfg = { ...cfg, ...j.cfg }; saveCfg(); }
      if (j.coins !== undefined) { S.coins = j.coins; S.day = todayKey(); persist(); }
      /* 🚫 NO sincronizar desbloqueos desde el servidor:
         localStorage local es la ÚNICA fuente de verdad para los
         desbloqueos. El servidor solo gestiona el SALDO de monedas.
         Esto elimina TODA posibilidad de que el servidor borre o
         corrompa un desbloqueo que el usuario ya pagó.          */
      return j;
    } catch (e) { return null; }
  }

  function check(sid, epN, s) {
    if (isVip()) return { ok: true, reason: 'vip' };
    if (isUnlocked(sid, epN)) return { ok: true, reason: 'unlocked' };
    const price = priceOf(s);
    return { ok: false, reason: S.coins >= price ? 'confirm' : 'no-coins', coins: S.coins, price };
  }
  /* alias async — para loadEpisode (si el servidor confirma, mejor; si no, caché) */
  async function checkAsync(sid, epN, s) {
    /* si la caché local dice desbloqueado, confiar */
    if (isUnlocked(sid, epN)) return { ok: true, reason: 'unlocked' };
    /* consultar al servidor */
    const r = await callWallet('check', { sid, epN, kind: s.kind });
    if (r && r.ok && r.unlocked) {
      unlocked[uk(sid, epN)] = Date.now();
      persistUnlocked();
      return { ok: true, reason: 'unlocked' };
    }
    return check(sid, epN, s);
  }

  async function confirmUnlock(sid, epN, s) {
    if (isVip()) return { ok: true, reason: 'vip' };
    if (isUnlocked(sid, epN)) return { ok: true, reason: 'unlocked' };
    const price = priceOf(s);
    if (S.coins < price) return { ok: false, reason: 'no-coins', coins: S.coins, price };
    const r = await callWallet('unlock', { sid, epN, kind: s.kind });
    if (r === null) {
      S.coins -= price; S.totalSpent += price;
      unlocked[uk(sid, epN)] = Date.now();
      persist(); persistUnlocked();
      return { ok: true, reason: 'paid', coins: S.coins, price };
    }
    if (r.ok) {
      S.coins = r.coins !== undefined ? r.coins : S.coins - price;
      S.totalSpent += price;
      unlocked[uk(sid, epN)] = Date.now();
      persist(); persistUnlocked();
      return { ok: true, reason: 'paid', coins: S.coins, price };
    }
    S.coins = r.coins !== undefined ? r.coins : S.coins;
    persist();
    return r;
  }

  function pay(sid, epN, s) { return check(sid, epN, s); }

  async function earn() {
    const r = await callWallet('earn');
    if (r === null) { S.coins += cfg.adReward; S.totalEarned += cfg.adReward; S.adsWatched++; persist(); }
    else { S.coins = r.coins !== undefined ? r.coins : S.coins + cfg.adReward; S.totalEarned += cfg.adReward; S.adsWatched++; persist(); }
    return S.coins;
  }

  async function initWallet() { return callWallet('init'); }
  async function syncFromServer() { return callWallet('state'); }

  function setConfig(p) { cfg = { ...cfg, ...p }; saveCfg(); return cfg; }
  function getConfig() { return { ...cfg }; }
  function getState() { return { ...S, vip: isVip(), unlockedCount: Object.keys(unlocked).length }; }
  function grantCoins(n) { S.coins += n; S.totalEarned += n; persist(); return S.coins; }
  function resetToday() { S.day = ''; load(); return S.coins; }
  function applyRemoteCfg(remote) {
    if (!remote || typeof remote !== 'object') return false;
    let ch = false;
    for (const k of ['dailyCoins','priceAnime','priceMovie','adReward','adDuration','adClickExtra','adRequireClick','unlockDays']) {
      if (remote[k] !== undefined && cfg[k] !== remote[k]) { cfg[k] = remote[k]; ch = true; }
    }
    if (ch) saveCfg();
    return ch;
  }

  let lastGiftAt = 0;
  try { lastGiftAt = +(localStorage.getItem(LS_KEY + '-gift-at') || 0); } catch (e) { }
  function applyGift(gift) {
    if (!gift || !gift.amount || !gift.at || gift.at <= lastGiftAt) return false;
    lastGiftAt = gift.at;
    try { localStorage.setItem(LS_KEY + '-gift-at', String(gift.at)); } catch (e) { }
    S.coins += gift.amount; S.totalEarned += gift.amount; persist();
    coinRain(gift.amount, gift.msg || '🎁 ¡El administrador te ha obsequiado monedas!');
    return true;
  }

  function coinRain(amount, msg) {
    const layer = document.createElement('div');
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:300;overflow:hidden';
    document.body.appendChild(layer);
    for (let i = 0; i < Math.min(20, amount / 25); i++) {
      const c = document.createElement('div');
      c.textContent = '🪙';
      c.style.cssText = `position:absolute;font-size:${18+Math.random()*14}px;left:${Math.random()*90+2}%;top:-5%;animation:coinFall ${1.4+Math.random()*1.2}s cubic-bezier(.3,.7,.4,1) ${i*.06}s forwards`;
      layer.appendChild(c);
    }
    const note = document.createElement('div');
    note.style.cssText = 'position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);text-align:center;background:rgba(8,8,14,.88);border:1.5px solid rgba(216,255,62,.4);border-radius:18px;padding:18px 26px;backdrop-filter:blur(8px);box-shadow:0 20px 60px rgba(0,0,0,.6);animation:giftPop .4s cubic-bezier(.2,1.4,.4,1)';
    note.innerHTML = `<div style="font-size:42px;margin-bottom:6px">🪙</div><div style="font-family:'Archivo Black';font-size:22px;color:var(--acid);margin-bottom:4px">+${amount} monedas</div><div style="font-size:12px;color:var(--dim);max-width:220px">${msg}</div>`;
    layer.appendChild(note);
    setTimeout(() => { layer.style.opacity = '0'; layer.style.transition = 'opacity .6s'; }, 2600);
    setTimeout(() => layer.remove(), 3400);
  }
  if (!document.getElementById('coin-rain-styles')) {
    const st = document.createElement('style');
    st.id = 'coin-rain-styles';
    st.textContent = '@keyframes coinFall{to{transform:translateY(110vh) rotate(720deg);opacity:.3}}@keyframes giftPop{from{opacity:0;transform:translate(-50%,-50%) scale(.6)}}';
    document.head.appendChild(st);
  }

  let testMode = false;
  try { testMode = localStorage.getItem(LS_KEY + '-test') === '1'; } catch (e) { }
  function setTestMode(on) {
    testMode = !!on;
    try { localStorage.setItem(LS_KEY + '-test', on ? '1' : '0'); } catch (e) { }
    return testMode;
  }
  function inTestMode() { return testMode; }

  load();
  if (typeof fetch === 'function') setTimeout(() => { initWallet().catch(() => { }); }, 2000);

  return { pay, earn, check, checkAsync, confirmUnlock, isVip, setVip, isUnlocked, unlockTimeLeft, priceOf,
    getConfig, setConfig, getState, grantCoins, resetToday,
    applyRemoteCfg, applyGift, setTestMode, inTestMode,
    initWallet, syncFromServer, cfg };
})();
