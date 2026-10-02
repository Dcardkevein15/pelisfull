/* ═══════════════════════════════════════════════════════════════
   🪙 SISTEMA DE MONEDAS X·STREAM — monetización con anuncios
   · 50 monedas gratis al día (no acumulables, reset cada 24h)
   · Anime/Hentai: 100 monedas · Películas: 200 monedas
   · Al gastarlas: mira un anuncio (15s + clic + 10s) = +50 monedas
   · Membresía $1/mes: sin límites, sin anuncios, sin candados
   · Capítulo desbloqueado = permanente (nunca se vuelve a cobrar)
   · Panel admin: control total de tiempos, precios y visualización  */
const COINS = (function () {
  const LS_KEY = 'xstream-coins';
  const LS_UNLOCKED = 'xstream-unlocked';
  const LS_VIP = 'xstream-vip';
  const LS_ADSTATE = 'xstream-ad-state';

  /* ─── CONFIG (el admin la cambia en vivo desde el panel) ─── */
  const DEFAULTS = {
    dailyCoins: 500,         /* monedas gratis por día */
    priceAnime: 100,         /* coste de un capítulo de anime/hentai */
    priceMovie: 200,         /* coste de una película */
    adReward: 50,            /* monedas por ver un anuncio completo */
    adDuration: 15,          /* segundos mínimos del anuncio */
    adClickExtra: 10,         /* segundos extra tras hacer clic */
    adRequireClick: true,    /* ¿exigir clic en el anuncio? */
  };
  let cfg = { ...DEFAULTS };
  try { const c = JSON.parse(localStorage.getItem(LS_KEY + '-cfg') || 'null'); if (c) cfg = { ...cfg, ...c }; } catch (e) { }
  const saveCfg = () => { try { localStorage.setItem(LS_KEY + '-cfg', JSON.stringify(cfg)); } catch (e) { } };

  /* ─── ESTADO del usuario ─── */
  let S = { coins: 0, day: '', totalSpent: 0, totalEarned: 0, adsWatched: 0 };
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const load = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (raw) S = { ...S, ...raw };
    } catch (e) { }
    /* reset diario: si cambió el día, 50 monedas nuevas (no acumulables) */
    const today = todayKey();
    if (S.day !== today) {
      S.day = today;
      S.coins = cfg.dailyCoins;
      persist();
    }
  };
  const persist = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { } };

  /* ─── DESBLOQUEOS PERMANENTES ─── */
  let unlocked = {};
  try { unlocked = JSON.parse(localStorage.getItem(LS_UNLOCKED) || '{}'); } catch (e) { }
  const persistUnlocked = () => { try { localStorage.setItem(LS_UNLOCKED, JSON.stringify(unlocked)); } catch (e) { } };
  const unlockKey = (sid, epN) => `${sid}:${epN}`;
  const isUnlocked = (sid, epN) => !!unlocked[unlockKey(sid, epN)];

  /* ─── MEMBRESÍA VIP ─── */
  let vip = null;
  try { vip = JSON.parse(localStorage.getItem(LS_VIP) || 'null'); } catch (e) { }
  const isVip = () => !!(vip && vip.until > Date.now());
  const setVip = (days) => {
    vip = { until: Date.now() + (days || 30) * 86400e3, at: Date.now() };
    try { localStorage.setItem(LS_VIP, JSON.stringify(vip)); } catch (e) { }
  };

  /* ─── PRECIOS ─── */
  const priceOf = (s) => s.kind === 'pelicula' ? cfg.priceMovie : cfg.priceAnime;

  /* ─── VERIFICAR sin consumir (la bóveda lo llama) ─── */
  function check(sid, epN, s) {
    if (isVip()) return { ok: true, reason: 'vip' };
    if (isUnlocked(sid, epN)) return { ok: true, reason: 'unlocked' };
    const price = priceOf(s);
    const st = COINS.getState();
    return { ok: false, reason: st.coins >= price ? 'confirm' : 'no-coins', coins: st.coins, price };
  }

  /* ─── CONSUMIR (solo tras la confirmación del usuario) ─── */
  function confirmUnlock(sid, epN, s) {
    if (isVip()) return { ok: true, reason: 'vip' };
    if (isUnlocked(sid, epN)) return { ok: true, reason: 'unlocked' };
    const price = priceOf(s);
    if (S.coins < price) return { ok: false, reason: 'no-coins', coins: S.coins, price };
    S.coins -= price;
    S.totalSpent += price;
    unlocked[unlockKey(sid, epN)] = Date.now();
    persist(); persistUnlocked();
    return { ok: true, reason: 'paid', coins: S.coins, price };
  }

  /* alias de compatibilidad — showVault usa check; solo confirmUnlock consume */
  function pay(sid, epN, s) { return check(sid, epN, s); }

  /* ─── GANAR monedas viendo un anuncio ─── */
  function earn() {
    S.coins += cfg.adReward;
    S.totalEarned += cfg.adReward;
    S.adsWatched++;
    persist();
    return S.coins;
  }

  /* ─── API para el panel admin ─── */
  function setConfig(partial) {
    cfg = { ...cfg, ...partial };
    saveCfg();
    return cfg;
  }
  function getConfig() { return { ...cfg }; }
  function getState() { return { ...S, vip: isVip(), unlockedCount: Object.keys(unlocked).length }; }
  function grantCoins(n) { S.coins += n; S.totalEarned += n; persist(); return S.coins; }
  function resetToday() { S.day = ''; load(); return S.coins; }

  /* ─── SINCRONIZACIÓN REMOTA: el admin cambia la config y TODOS la reciben ───
     La config viaja dentro del catálogo firmado (campo "coinsCfg") →
     cada usuario la lee al sincronizar y su sistema se actualiza solo. */
  function applyRemoteCfg(remote) {
    if (!remote || typeof remote !== 'object') return false;
    let changed = false;
    for (const k of ['dailyCoins', 'priceAnime', 'priceMovie', 'adReward', 'adDuration', 'adClickExtra', 'adRequireClick']) {
      if (remote[k] !== undefined && cfg[k] !== remote[k]) { cfg[k] = remote[k]; changed = true; }
    }
    if (changed) saveCfg();
    return changed;
  }

  /* ─── REGALO DEL ADMIN a todos los usuarios (broadcast) ───
     El admin emite "coinGift": { amount, msg, at } → cada dispositivo
     que sincroniza lo ve UNA SOLA vez (por timestamp) y suma monedas
     con una animación de lluvia de monedas.                            */
  let lastGiftAt = 0;
  try { lastGiftAt = +(localStorage.getItem(LS_KEY + '-gift-at') || 0); } catch (e) { }
  function applyGift(gift) {
    if (!gift || !gift.amount || !gift.at || gift.at <= lastGiftAt) return false;
    lastGiftAt = gift.at;
    try { localStorage.setItem(LS_KEY + '-gift-at', String(gift.at)); } catch (e) { }
    S.coins += gift.amount;
    S.totalEarned += gift.amount;
    persist();
    /* animación de lluvia de monedas */
    coinRain(gift.amount, gift.msg || '🎁 ¡El administrador te ha obsequiado monedas!');
    return true;
  }

  /* ─── ANIMACIÓN: lluvia de monedas ─── */
  function coinRain(amount, msg) {
    const layer = document.createElement('div');
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:300;overflow:hidden';
    document.body.appendChild(layer);
    /* monedas cayendo */
    for (let i = 0; i < Math.min(20, amount / 25); i++) {
      const c = document.createElement('div');
      c.textContent = '🪙';
      c.style.cssText = `position:absolute;font-size:${18 + Math.random() * 14}px;left:${Math.random() * 90 + 2}%;top:-5%;animation:coinFall ${1.4 + Math.random() * 1.2}s cubic-bezier(.3,.7,.4,1) ${i * 0.06}s forwards`;
      layer.appendChild(c);
    }
    /* mensaje central */
    const note = document.createElement('div');
    note.style.cssText = 'position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);text-align:center;background:rgba(8,8,14,.88);border:1.5px solid rgba(216,255,62,.4);border-radius:18px;padding:18px 26px;backdrop-filter:blur(8px);box-shadow:0 20px 60px rgba(0,0,0,.6);animation:giftPop .4s cubic-bezier(.2,1.4,.4,1)';
    note.innerHTML = `<div style="font-size:42px;margin-bottom:6px">🪙</div>
      <div style="font-family:'Archivo Black';font-size:22px;color:var(--acid);margin-bottom:4px">+${amount} monedas</div>
      <div style="font-size:12px;color:var(--dim);max-width:220px">${msg}</div>`;
    layer.appendChild(note);
    setTimeout(() => { layer.style.opacity = '0'; layer.style.transition = 'opacity .6s'; }, 2600);
    setTimeout(() => layer.remove(), 3400);
  }
  /* keyframes para la lluvia (se inyectan al DOM para no tocar styles.css) */
  if (!document.getElementById('coin-rain-styles')) {
    const st = document.createElement('style');
    st.id = 'coin-rain-styles';
    st.textContent = `
      @keyframes coinFall{to{transform:translateY(110vh) rotate(720deg);opacity:.3}}
      @keyframes giftPop{from{opacity:0;transform:translate(-50%,-50%) scale(.6)}}
    `;
    document.head.appendChild(st);
  }

  /* ─── MODO PRUEBA: el admin ve el candado sin salir ─── */
  let testMode = false;
  try { testMode = localStorage.getItem(LS_KEY + '-test') === '1'; } catch (e) { }
  function setTestMode(on) {
    testMode = !!on;
    try { localStorage.setItem(LS_KEY + '-test', on ? '1' : '0'); } catch (e) { }
    return testMode;
  }
  function inTestMode() { return testMode; }

  /* ─── INICIALIZAR ─── */
  load();

  return { pay, earn, check, confirmUnlock, isVip, setVip, isUnlocked, priceOf, getConfig, setConfig,
    getState, grantCoins, resetToday,
    applyRemoteCfg, applyGift, setTestMode, inTestMode, cfg };
})();
