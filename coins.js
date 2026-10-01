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
    dailyCoins: 50,          /* monedas gratis por día */
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

  /* ─── PAGAR un capítulo ─── */
  /* devuelve: { ok:true } | { ok:false, reason:'no-coins'|'vip'|'unlocked', coins } */
  function pay(sid, epN, s) {
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

  /* ─── INICIALIZAR ─── */
  load();

  return { pay, earn, isVip, setVip, isUnlocked, priceOf, getConfig, setConfig, getState, grantCoins, resetToday, cfg };
})();
