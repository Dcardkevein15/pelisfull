/* ═══════════════════════════════════════════════════════════
   X·STREAM — Reproductor instantáneo de anime por enlaces directos
   Vanilla JS · localStorage · sin backend
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ─────────── Paletas de portada (gradientes) ─────────── */
const GRADS = [
  ['#7c3aed', '#312e81'], ['#ff2e63', '#4a0e2e'], ['#f59e0b', '#7c2d12'],
  ['#10b981', '#064e3b'], ['#3b82f6', '#1e3a8a'], ['#ef4444', '#7f1d1d'],
  ['#ec4899', '#831843'], ['#14b8a6', '#134e4a'], ['#8b5cf6', '#4c1d95'],
  ['#f97316', '#7c2d12'], ['#06b6d4', '#164e63'], ['#d8ff3e', '#3f6212'],
];

/* ─────────── Videos demo (MP4 directos verificados · Internet Archive) ─────────── */
const DEMO = [
  'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4',
  'https://archive.org/download/ElephantsDream/ed_1024_512kb.mp4',
  'https://archive.org/download/Sita_Sings_the_Blues/Sita_Sings_the_Blues_512kb.mp4',
  'https://archive.org/download/Popeye_forPresident/Popeye_forPresident_512kb.mp4',
  'https://archive.org/download/superman_the_mechanical_monsters/superman_the_mechanical_monsters_512kb.mp4',
  'https://archive.org/download/DuckandC1951/DuckandC1951_512kb.mp4',
];

/* ─────────── 30 series anime precargadas ───────────
   demo:true  → el cap 1 trae un MP4 de prueba para reproducir al instante. */
const SEED = [
  { t: 'Attack on Titan',      jp: '進撃',  eps: 87,   tag: 'Acción · Oscuro',  g: 1, demo: true },
  { t: 'Demon Slayer',         jp: '鬼滅',  eps: 63,   tag: 'Shonen · Fantasía', g: 0, demo: true },
  { t: 'Naruto',               jp: 'ナルト', eps: 220,  tag: 'Shonen · Ninjas',   g: 9, demo: true },
  { t: 'One Piece',            jp: 'ワンピ', eps: 220,  tag: 'Aventura · Piratas', g: 4, demo: true },
  { t: 'Jujutsu Kaisen',       jp: '呪術',  eps: 47,   tag: 'Shonen · Maldiciones', g: 8, demo: true },
  { t: 'Death Note',           jp: 'デスノ', eps: 37,   tag: 'Thriller · Psicológico', g: 3, demo: true },
  { t: 'Fullmetal Alchemist: Brotherhood', jp: '鋼の錬', eps: 64, tag: 'Acción · Alquimia', g: 5, demo: true },
  { t: 'My Hero Academia',     jp: 'ヒロアカ', eps: 159, tag: 'Shonen · Héroes',   g: 2, demo: true },
  { t: 'Dragon Ball Z',        jp: 'ドラゴン', eps: 291, tag: 'Clásico · Peleas',  g: 10, demo: true },
  { t: 'One Punch Man',        jp: 'ワンパン', eps: 24,  tag: 'Comedia · Acción',  g: 11, demo: true },
  { t: 'Spy x Family',         jp: 'スパイ', eps: 37,   tag: 'Comedia · Familia', g: 6 },
  { t: 'Chainsaw Man',         jp: 'チェンソ', eps: 12,  tag: 'Acción · Gore',    g: 1 },
  { t: 'Hunter x Hunter',      jp: 'ハンター', eps: 148, tag: 'Aventura · Nen',   g: 3 },
  { t: 'Tokyo Ghoul',          jp: '喰種',  eps: 48,   tag: 'Oscuro · Ghoul',    g: 5 },
  { t: 'Sword Art Online',     jp: 'SAO',   eps: 96,   tag: 'Isekai · VRMMO',    g: 4 },
  { t: 'Bleach',               jp: 'ブリーチ', eps: 366, tag: 'Shonen · Shinigami', g: 0 },
  { t: 'Black Clover',         jp: 'ブラクロ', eps: 170, tag: 'Shonen · Magia',   g: 8 },
  { t: 'Vinland Saga',         jp: 'ヴィンラ', eps: 48,  tag: 'Histórico · Vikingos', g: 7 },
  { t: 'Mob Psycho 100',       jp: 'モブサイコ', eps: 37, tag: 'Psíquicos · Comedia', g: 6 },
  { t: 'Cowboy Bebop',         jp: 'ビバップ', eps: 26,  tag: 'Sci-Fi · Jazz',    g: 3 },
  { t: 'Neon Genesis Evangelion', jp: 'エヴァ', eps: 26,  tag: 'Mecha · Filosófico', g: 0 },
  { t: 'Code Geass',           jp: 'コードギアス', eps: 50, tag: 'Mecha · Estrategia', g: 5 },
  { t: 'Haikyuu!!',            jp: 'ハイキュー', eps: 85, tag: 'Deportes · Voley', g: 9 },
  { t: 'Dr. Stone',            jp: 'ドクター', eps: 57,  tag: 'Ciencia · Supervivencia', g: 3 },
  { t: 'Fairy Tail',           jp: 'フェアリー', eps: 328, tag: 'Magia · Gremio', g: 4 },
  { t: 'JoJo\'s Bizarre Adventure', jp: 'ジョジョ', eps: 152, tag: 'Bizarro · Stands', g: 11 },
  { t: 'Re:Zero',              jp: 'リゼロ', eps: 50,   tag: 'Isekai · Drama',   g: 7 },
  { t: 'Overlord',             jp: 'オーバーロード', eps: 52, tag: 'Isekai · Villano', g: 8 },
  { t: 'Blue Lock',            jp: 'ブルーロック', eps: 24, tag: 'Deportes · Fútbol', g: 4 },
  { t: 'Kaiju No. 8',          jp: '怪獣8号', eps: 12,  tag: 'Kaiju · Acción',   g: 2 },
];

/* ─────────── Estado ─────────── */
const LS_KEY = 'xstream-v1';
let state = { series: [], autoplay: true };
let current = { seriesId: null, ep: null };
let editing = false;

function seed() {
  state.series = SEED.map((s, i) => {
    const episodes = [];
    for (let n = 1; n <= Math.min(s.eps, 220); n++) {
      episodes.push({ n, t: `Capítulo ${n}`, url: s.demo && n === 1 ? DEMO[i % DEMO.length] : '' });
    }
    return {
      id: 's' + i + '-' + s.t.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      t: s.t, jp: s.jp, tag: s.tag, g: s.g, kind: 'serie',
      episodes,
    };
  });
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.series && parsed.series.length) {
        state = parsed;
        /* migraciones de versiones anteriores */
        state.trash = Array.isArray(state.trash) ? state.trash : [];
        state.progress = state.progress || {};
        state.lastPlayed = state.lastPlayed || {};
        state.stats = state.stats || { totalSec: 0, days: {} };
        state.sortMode = state.sortMode || 'manual';
        state.tab = state.tab || 'anime';
        state.series.forEach(s => { s.kind = s.kind || 'serie'; s.tags = s.tags || []; });
        state.broken = Array.isArray(state.broken) ? state.broken : [];
        state.thumbs = state.thumbs || {}; /* miniaturas reales de capítulos (frame capturado / splash) */
        state.channels = Array.isArray(state.channels) ? state.channels : [];       /* 📡 TV en vivo */
        state.tvSources = state.tvSources || {};                                   /* listas M3U guardadas */
        state.iptvPacks = Array.isArray(state.iptvPacks) ? state.iptvPacks : null; /* paquetes iptv-org suscritos */
        state.epg = state.epg && typeof state.epg === 'object' && state.epg.map ? state.epg : { url: state.epgUrl || '', map: {}, at: 0 };
        /* migraciones categoría anime vs película (las OVAs son anime) */
        state.tab = state.tab || 'anime';
        if (state.tab === 'ovas') state.tab = 'peliculas'; /* pestaña OVAs retirada: ahora se integran en su serie */
        state.series.forEach(s => { if (typeof s.anime !== 'boolean') s.anime = s.kind !== 'pelicula'; });
        return;
      }
    }
  } catch (e) { /* corrupto → reseed */ }
  seed();
  state.trash = [];
  state.broken = [];
  state.progress = {};
  state.lastPlayed = {};
  state.stats = { totalSec: 0, days: {} };
  state.sortMode = 'manual';
  state.tab = 'anime';
  state.channels = [];
  state.tvSources = {};
  state.iptvPacks = null;
  state.epg = { url: '', map: {}, at: 0 };
}
function save() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch (e) {
    /* cuota llena (miniaturas): purga la mitad más antigua y reintenta una vez */
    if (state.thumbs) {
      const ks = Object.keys(state.thumbs);
      ks.slice(0, Math.ceil(ks.length / 2)).forEach(k => delete state.thumbs[k]);
      try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e2) { }
    }
  }
}

const $ = id => document.getElementById(id);
const els = {
  video: $('video'), driveFrame: $('driveFrame'), playerArea: $('playerArea'), empty: $('playerEmpty'), noUrl: $('playerNoUrl'),
  spinner: $('spinner'), bigPlay: $('bigPlay'), controls: $('controls'),
  seekWrap: $('seekWrap'), seekFill: $('seekFill'), seekBuffer: $('seekBuffer'), seekThumb: $('seekThumb'),
  playBtn: $('playBtn'), playIcon: $('playIcon'), prevEp: $('prevEp'), nextEp: $('nextEp'),
  muteBtn: $('muteBtn'), volume: $('volume'), tCur: $('tCur'), tDur: $('tDur'),
  speed: $('speed'), pipBtn: $('pipBtn'), fsBtn: $('fsBtn'), autoplayBtn: $('autoplayBtn'),
  nowPlaying: $('nowPlaying'), stageTitle: $('stageTitle'), stageSub: $('stageSub'),
  stageBadges: $('stageBadges'), seriesList: $('seriesList'),
  countAnime: $('countAnime'), countPelis: $('countPelis'), gearBtn: $('gearBtn'), sidePanel: $('sidePanel'),
  ccBtn: $('ccBtn'), brokenBtn: $('brokenBtn'), brokenCount: $('brokenCount'),
  brokenList: $('brokenList'), flagBtn: $('flagBtn'),
  episodesGrid: $('episodesGrid'), episodesTitle: $('episodesTitle'), searchInput: $('searchInput'),
  sidebar: $('sidebar'),
  editModeBtn: $('editModeBtn'), addSeriesBtn: $('addSeriesBtn'), addEpBtn: $('addEpBtn'),
  delSeriesBtn: $('delSeriesBtn'), goEditBtn: $('goEditBtn'),
  insertEpBtn: $('insertEpBtn'), undoBtn: $('undoBtn'), themeBtn: $('themeBtn'),
  shareBtn: $('shareBtn'), downloadBtn: $('downloadBtn'), downloadLbl: $('downloadLbl'), modalShare: $('modalShare'), shareTitle: $('shareTitle'),
  shareGrid: $('shareGrid'), shareUrl: $('shareUrl'), copyShareUrl: $('copyShareUrl'),
  closeShare: $('closeShare'),
  driveFolderBtn: $('driveFolderBtn'), modalDrive: $('modalDrive'),
  driveFolderUrl: $('driveFolderUrl'), driveStatus: $('driveStatus'),
  driveApiKey: $('driveApiKey'), cancelDrive: $('cancelDrive'), confirmDrive: $('confirmDrive'),
  stLogin: $('stLogin'), stKey: $('stKey'), stImportBtn: $('stImportBtn'),
  trashBtn: $('trashBtn'), trashCount: $('trashCount'), modalTrash: $('modalTrash'),
  trashList: $('trashList'), closeTrash: $('closeTrash'),
  playerExt: $('playerExt'), extTitle: $('extTitle'), extHost: $('extHost'), extOpen: $('extOpen'),
  renameBtn: $('renameBtn'),
  cineBtn: $('cineBtn'), modalCine: $('modalCine'), cineQuery: $('cineQuery'), cineGo: $('cineGo'),
  cineLang: $('cineLang'), cineMinDur: $('cineMinDur'), cineChips: $('cineChips'), cineStatus: $('cineStatus'),
  cineResults: $('cineResults'), closeCine: $('closeCine'),
  sortMode: $('sortMode'), favFilter: $('favFilter'), tagChips: $('tagChips'),
  exportBtn: $('exportBtn'), importBtn: $('importBtn'), importFile: $('importFile'), syncBtn: $('syncBtn'),
  statsBtn: $('statsBtn'), modalStats: $('modalStats'), statsBody: $('statsBody'), closeStats: $('closeStats'),
  modalSync: $('modalSync'), fbConfig: $('fbConfig'), syncStatus: $('syncStatus'),
  syncConnect: $('syncConnect'), syncUp: $('syncUp'), syncDown: $('syncDown'), closeSync: $('closeSync'),
  miniPlayer: null, playerAnchor: $('playerAnchor'), miniX: $('miniX'), miniGrip: $('miniGrip'),
  continueRow: $('continueRow'), accentPick: $('accentPick'), accentMini: $('accentMini'),
  searchBox: $('searchBox'), searchToggle: $('searchToggle'),
  favBtn: $('favBtn'),   tagBtn: $('tagBtn'), remindBtn: $('remindBtn'), castBtn: $('castBtn'),
  tabAnime: $('tabAnime'), tabPeliculas: $('tabPeliculas'),
  tabTv: $('tabTv'), countTv: $('countTv'), tvTools: $('tvTools'),
  tvScanBtn: $('tvScanBtn'), tvRescanBtn: $('tvRescanBtn'), moveCatBtn: $('moveCatBtn'),
  tvIptvBtn: $('tvIptvBtn'), tvEpgBtn: $('tvEpgBtn'), tvCats: $('tvCats'),
  modalFlag: $('modalFlag'), flagText: $('flagText'), flagCancel: $('flagCancel'), flagConfirm: $('flagConfirm'),
  modalAdd: $('modalAdd'), newTitle: $('newTitle'), newJp: $('newJp'), newEps: $('newEps'),
  gradPicker: $('gradPicker'), cancelAdd: $('cancelAdd'), confirmAdd: $('confirmAdd'),
  toast: $('toast'), gestL: $('gestL'), gestR: $('gestR'),
};

/* ═══════════ Google Drive ═══════════
   Convierte cualquier formato de enlace de Drive al ID del archivo
   y genera la URL reproducible (preview embebible).                 */
function parseDriveId(url) {
  if (!url || typeof url !== 'string') return null;
  if (!/drive\.google|docs\.google\.com\/.*drive/i.test(url)) return null;
  const m = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/i)        // /file/d/ID/view…
        || url.match(/[?&]id=([\w-]+)/)                                 // ?id=ID (uc?export=…&id=…, open?id=…)
        || url.match(/\/d\/([\w-]+)/i);                                 // docs.google.com/…/d/ID/…
  const id = m && m[1];
  return id && id.length >= 6 ? id : null;
}
const drivePreviewUrl = id => `https://drive.google.com/file/d/${id}/preview`;
/* miniatura oficial del archivo (funciona sin clave si el recurso es público) */
const driveThumbUrl = (id, w = 600) => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
const isDriveMode = () => els.playerArea.classList.contains('drive-mode');
/* intento de reproducción directa de un Drive en curso (tiene fallback al iframe) */
let driveDirectTry = false;

function exitDriveMode() {
  stopDriveTracking();
  els.playerArea.classList.remove('drive-direct');
  if (!isDriveMode()) return;
  els.playerArea.classList.remove('drive-mode');
  els.driveFrame.src = 'about:blank'; // detiene la reproducción del iframe
}

/* ── Seguimiento de capítulos de Google Drive ──
   El iframe de Drive no expone el tiempo de reproducción; llevamos un
   cronómetro aproximado mientras la pestaña está activa para alimentar
   «Sigue viendo», las estadísticas y el número de capítulo actual.   */
let driveTimer = null;
let driveSeconds = 0;
function startDriveTracking(sid, epN) {
  stopDriveTracking();
  driveSeconds = ((state.progress || {})[sid] || {})[epN]?.t || 0;
  driveTimer = setInterval(() => {
    if (document.hidden) return; // no cuenta si la app no está visible
    driveSeconds += 5;
    /* estadísticas */
    state.stats.totalSec += 5;
    const k = todayKey();
    state.stats.days[k] = (state.stats.days[k] || 0) + 5;
    /* progreso aproximado del capítulo */
    state.progress[sid] = state.progress[sid] || {};
    const prev = state.progress[sid][epN] || {};
    state.progress[sid][epN] = { t: driveSeconds, d: prev.d || 0, done: prev.done || false, at: Date.now() };
    save();
    renderContinue();
  }, 5000);
}
function stopDriveTracking() {
  if (driveTimer) { clearInterval(driveTimer); driveTimer = null; }
}

/* ── Fuentes externas (megaup y similares): no se pueden incrustar ── */
const VIDEO_URL_RE = /\.(mp4|m4v|webm|ogv|ogg|mov|mkv|ts)(\?|#|$)/i;
const isDirectVideoUrl = u => VIDEO_URL_RE.test(u || '');
function exitExtMode() { els.playerArea.classList.remove('ext-mode'); }
function openExternalMode(s, ep) {
  const v = els.video;
  v.pause(); v.removeAttribute('src'); v.load();
  els.spinner.classList.add('hidden');
  els.playerArea.classList.add('ext-mode');
  els.extTitle.textContent = `${s.t} — ${ep.t || 'Capítulo ' + ep.n}`;
  let host = 'fuente externa';
  try { host = new URL(ep.url).hostname; } catch (e) { }
  els.extHost.textContent = `${host} no permite incrustar el video aquí — ábrelo en pestaña nueva.`;
  els.extOpen.onclick = () => window.open(ep.url, '_blank', 'noopener');
}

/* ═══════════ Papelera de capítulos (sesión) ═══════════ */
const trash = []; // { seriesId, index, ep }
function syncUndoBtn() { els.undoBtn.classList.toggle('hidden', trash.length === 0); }

/* ═══════════ Papelera de series/películas — retención 7 días ═══════════ */
const TRASH_DAYS = 7;
const TRASH_MS = TRASH_DAYS * 24 * 60 * 60 * 1000;

function purgeTrash() {
  const now = Date.now();
  const before = state.trash.length;
  state.trash = (state.trash || []).filter(t => now - t.deletedAt < TRASH_MS);
  if (state.trash.length !== before) save();
  syncTrashBtn();
}
function syncTrashBtn() {
  const n = (state.trash || []).length;
  els.trashCount.textContent = n;
  els.trashCount.style.display = n ? '' : 'none';
  els.trashBtn.classList.toggle('has', n > 0);
}

function resetStage() {
  els.video.removeAttribute('src'); els.video.load();
  destroyHls();
  state.currentChannel = null;
  exitDriveMode(); exitExtMode();
  els.empty.classList.remove('hidden');
  els.noUrl.classList.add('hidden');
  els.shareBtn.classList.add('hidden');
  els.downloadBtn.classList.add('hidden');
  els.flagBtn.classList.add('hidden');
  els.stageTitle.textContent = 'X·STREAM Anime';
  els.stageSub.textContent = 'Tu reproductor instantáneo de enlaces directos';
  els.stageBadges.innerHTML = '';
  els.nowPlaying.textContent = '';
  document.title = 'X·STREAM — Reproductor';
}

/* elimina una serie → va a la papelera (restaurable 7 días) */
async function confirmDeleteSeries(s) {
  if (!needAdmin()) return;
  const r = await uiModal({
    icon: '🗑', title: '¿Enviar a la papelera?', danger: true, okLabel: 'Sí, a la papelera',
    sub: `«<b>${escapeHtml(s.t)}</b>» — ${s.episodes.length} ${s.kind === 'pelicula' ? 'video' : 'caps'}.<br>Podrás restaurarla durante <b>7 días</b> desde el icono 🗑 del panel.`,
  });
  if (!r) return;
  state.trash.push({ deletedAt: Date.now(), series: s });
  state.series.splice(state.series.indexOf(s), 1);
  state.broken = (state.broken || []).filter(b => b.sid !== s.id); // limpia su historial de rotos
  if (current.seriesId === s.id) {
    current.seriesId = null; current.ep = null;
    clearAddressHash();   /* evita que la URL compartida la resucite al recargar */
    resetStage();
  }
  save();
  renderSeries(els.searchInput.value);
  renderEpisodes();
  syncTrashBtn();
  toast(`🗑 «${s.t}» enviada a la papelera — restaura desde 🗑`);
}

function renderTrash() {
  purgeTrash();
  els.trashList.innerHTML = '';
  if (!state.trash.length) {
    els.trashList.innerHTML = '<div class="episodes-hint">La papelera está vacía</div>';
    return;
  }
  const items = [...state.trash].sort((a, b) => b.deletedAt - a.deletedAt);
  for (const item of items) {
    const i = state.trash.indexOf(item);
    const daysLeft = Math.max(0, TRASH_DAYS - Math.floor((Date.now() - item.deletedAt) / 86400000));
    const s = item.series;
    const row = document.createElement('div');
    row.className = 'trash-item';
    row.innerHTML = `
      <div class="trash-meta">
        <b>${escapeHtml(s.t)}</b>
        <span>${s.kind === 'pelicula' ? '🎬 Película' : '📺 Serie'} · ${s.episodes.length} ${s.kind === 'pelicula' ? 'video' : 'caps'} · quedan <b style="color:${daysLeft <= 2 ? 'var(--hot)' : 'var(--acid)'}">${daysLeft} día${daysLeft === 1 ? '' : 's'}</b></span>
      </div>
      <button class="btn btn-mini restore">↩ Restaurar</button>
      <button class="btn btn-mini peril">✕ Borrar ya</button>`;
    row.querySelector('.restore').addEventListener('click', () => {
      if (!needAdmin()) return;
      state.trash.splice(i, 1);
      state.series.push(s);
      save(); renderTrash(); renderSeries(els.searchInput.value); syncTrashBtn();
      toast(`↩ «${s.t}» restaurada`);
    });
    row.querySelector('.peril').addEventListener('click', () => {
      if (!needAdmin()) return;
      if (!confirm(`¿Eliminar «${s.t}» PERMANENTEMENTE ahora?`)) return;
      state.trash.splice(i, 1);
      save(); renderTrash(); syncTrashBtn();
      toast('Eliminada permanentemente');
    });
    els.trashList.appendChild(row);
  }
}

els.trashBtn.addEventListener('click', () => { renderTrash(); els.modalTrash.classList.remove('hidden'); });
els.closeTrash.addEventListener('click', () => els.modalTrash.classList.add('hidden'));
els.modalTrash.addEventListener('click', ev => { if (ev.target === els.modalTrash) els.modalTrash.classList.add('hidden'); });

/* ═══════════ 🚩 Historial de enlaces rotos ═══════════
   Detección automática (MP4 que falla) + reporte manual con 🚩
   (Drive y fuentes externas no se pueden autodetectar).          */

function syncBrokenBtn() {
  const n = (state.broken || []).length;
  els.brokenCount.textContent = n;
  els.brokenBtn.classList.toggle('has', n > 0);
}

function markBroken(via) {
  const s = getSeries(current.seriesId);
  const ep = current.ep != null && getEp(current.ep);
  if (!s || !ep || !ep.url) return;
  const key = s.id + '::' + ep.n;
  if ((state.broken || []).some(b => b.key === key)) return; // ya estaba reportado
  state.broken = state.broken || [];
  state.broken.unshift({
    key, sid: s.id, ep: ep.n, serie: s.t, titulo: ep.t, url: ep.url,
    grad: s.g, poster: s.poster || null, via, at: Date.now(),
  });
  save(); syncBrokenBtn(); renderBroken();
  toast('🚩 Registrado como roto — revisa ⚙ → ⚠ Rotos', true);
}
function unmarkBroken(sid, epN, silent) {
  const key = sid + '::' + epN;
  const i = (state.broken || []).findIndex(b => b.key === key);
  if (i === -1) return;
  state.broken.splice(i, 1);
  save(); syncBrokenBtn(); renderBroken();
  if (!silent) toast('✔ Enlace reparado');
}

function renderBroken() {
  const list = state.broken || [];
  els.brokenList.innerHTML = `<div class="episodes-head" style="margin:0 0 6px"><h2 style="font-size:15px">⚠ Enlaces rotos <span class="pill">${list.length}</span></h2></div>`;
  if (!list.length) {
    els.brokenList.innerHTML += '<div class="broken-empty">🎉 <b>Todo funciona</b><br>Cuando un video falle o lo marques con 🚩, aparecerá aquí para repararlo.</div>';
    return;
  }
  for (const b of list) {
    const row = document.createElement('div');
    row.className = 'broken-item';
    row.innerHTML = `
      <div class="broken-cover" style="background:${GRADS[(b.grad || 0) % GRADS.length][0]}">
        ${b.poster ? `<img src="${b.poster}" alt="" loading="lazy">` : '⚠'}
      </div>
      <div class="broken-info">
        <div class="broken-t">${escapeHtml(b.serie)}</div>
        <div class="broken-sub">E${b.ep} · ${escapeHtml(b.titulo || '')} · <span class="r">${b.via}</span></div>
        <div class="broken-url" title="${escapeHtml(b.url)}">${escapeHtml(b.url.slice(0, 64))}…</div>
      </div>
      <div class="broken-actions">
        <button class="fix">🔧 Ir a arreglar</button>
        <button class="rm">✕ quitar</button>
      </div>`;
    row.querySelector('.fix').addEventListener('click', () => {
      /* navegar a la serie, abrir modo edición y enfocar el campo del capítulo */
      els.sidebar.classList.remove('show-broken');
      selectSeries(b.sid);
      setEditing(true);
      renderEpisodes();
      setTimeout(() => {
        const s = getSeries(b.sid);
        const idx = s ? s.episodes.findIndex(e => e.n === b.ep) : -1;
        const rows = els.episodesGrid.querySelectorAll('.ep');
        if (rows[idx]) {
          rows[idx].classList.add('flash');
          const input = rows[idx].querySelector('.ep-url');
          if (input) { input.focus(); input.select(); }
          rows[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => rows[idx] && rows[idx].classList.remove('flash'), 2600);
        }
      }, 350);
      toast(`🔧 Arregla «${b.serie}» E${b.ep}`);
    });
    row.querySelector('.rm').addEventListener('click', () => unmarkBroken(b.sid, b.ep, true));
    els.brokenList.appendChild(row);
  }
}

els.brokenBtn.addEventListener('click', () => {
  const open = els.sidebar.classList.toggle('show-broken');
  if (open) renderBroken();
});
/* reporte de enlace roto: pide confirmación con modal bonito */
let flagCtx = null;
els.flagBtn.addEventListener('click', () => {
  const s = getSeries(current.seriesId);
  const ep = current.ep != null && getEp(current.ep);
  if (!s || !ep || !ep.url) return toast('No hay ningún video activo para reportar', true);
  flagCtx = { s, ep };
  els.flagText.innerHTML = `Se marcará en el historial de rotos:<br><b>${escapeHtml(s.t)}</b> · E${ep.n} — <span style="color:var(--dim)">${escapeHtml(ep.t || '')}</span><br><span class="broken-url" style="direction:ltr">${escapeHtml(ep.url.slice(0, 90))}…</span><br><br>Luego podrás corregirlo o borrarlo desde ⚙ → ⚠ Rotos.`;
  els.modalFlag.classList.remove('hidden');
});
els.flagCancel.addEventListener('click', () => els.modalFlag.classList.add('hidden'));
els.modalFlag.addEventListener('click', ev => { if (ev.target === els.modalFlag) els.modalFlag.classList.add('hidden'); });
els.flagConfirm.addEventListener('click', () => {
  els.modalFlag.classList.add('hidden');
  if (flagCtx) markBroken('reportado por ti');
  flagCtx = null;
});

/* AUTO: MP4 directo que falla al cargar */
els.video.addEventListener('error', () => {
  if (isDriveMode() || els.playerArea.classList.contains('ext-mode')) return;
  if (driveDirectTry) return; /* intento directo de Drive: tiene su propio fallback al iframe */
  if (els.video.src) markBroken('falló al cargar');
});

/* AUTO: al reproducir bien → sale del registro solo */
els.video.addEventListener('playing', () => {
  unmarkBroken(current.seriesId, current.ep, true);
});

/* ═══════════ Helpers ═══════════ */
const grad = s => { const [a, b] = GRADS[s.g % GRADS.length]; return `linear-gradient(135deg,${a},${b})`; };
const getSeries = id => state.series.find(s => s.id === id);
const getEp = epN => { const s = getSeries(current.seriesId); return s && s.episodes.find(e => e.n === epN); };

function fmt(sec) {
  if (!isFinite(sec)) return '00:00';
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = n => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

let toastTimer;
function toast(msg, err = false) {
  els.toast.textContent = msg;
  els.toast.classList.toggle('err', err);
  els.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 2400);
}

/* ═══════════ 🔐 Roles (auth.js) ═══════════
   El administrador edita; el lector solo mira.
   Si auth.js no cargó (no debería pasar), todo funciona como antes. */
const canAdmin = () => !window.XAUTH || window.XAUTH.isAdmin();
function needAdmin() {
  if (canAdmin()) return true;
  toast('🔒 Solo el administrador puede hacer eso', true);
  return false;
}

/* ═══════════ Render: lista de series (filtros + orden + drag + favs) ═══════════ */
let favOnly = false;
let tagFilter = null;
let dragId = null;

function renderTagChips() {
  const tags = [...new Set(state.series.flatMap(s => s.tags || []))].sort();
  els.tagChips.innerHTML = '';
  for (const tag of tags) {
    const c = document.createElement('button');
    c.className = 'tag-chip' + (tagFilter === tag ? ' on' : '');
    c.textContent = '🏷 ' + tag;
    c.addEventListener('click', () => {
      tagFilter = tagFilter === tag ? null : tag;
      renderTagChips(); renderSeries(els.searchInput.value);
    });
    els.tagChips.appendChild(c);
  }
}

function watchedCount(s) {
  const p = (state.progress || {})[s.id];
  return p ? Object.values(p).filter(x => x.done).length : 0;
}

function coverHtml(s) {
  return s.poster
    ? `<img src="${s.poster}" alt="" loading="lazy" onerror="this.remove()">`
    : escapeHtml(s.jp || s.t.slice(0, 2).toUpperCase());
}

/* ═══════════ pestañas Anime / Películas ═══════════
   Ya no hay pestaña OVAs: una OVA suelta se detecta por su título y,
   en cuanto existe una serie de anime cuyo nombre encaje, se integra
   sola como capítulo «🎌 OVA» al final de esa serie.                */
const isOvaEntry = s => s.kind === 'pelicula' && /ova/i.test(s.t || '');

/* normaliza títulos para comparar (minúsculas, sin acentos, sin relleno) */
function normTitle(t) {
  return (t || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(ova|ovas|pelicula|movie|the|la|el|los|las|de|del|en|no)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/* encuentra (si existe) la serie de anime a la que pertenece una OVA */
function ovaMatchSeries(ova) {
  const ot = normTitle(ova.t);
  if (!ot) return null;
  let best = null, bestScore = 0;
  for (const s of state.series) {
    if (s.kind === 'pelicula' || s.id === ova.id) continue;
    const st = normTitle(s.t);
    if (!st) continue;
    let sc = 0;
    if (ot.includes(st) || st.includes(ot)) {
      sc = 0.75 + Math.min(ot.length, st.length) / 200; // «Evangelion Death» ⊃ «Evangelion»
    } else {
      const a = new Set(ot.split(' ')), b = new Set(st.split(' '));
      const inter = [...a].filter(x => b.has(x));
      sc = inter.length / Math.max(a.size, b.size); // solape de palabras
      /* una palabra distintiva larga compartida («evangelion», «mazinger»…) basta para enlazar:
         cubre casos como «Evangelion Death(True)²» ↔ «Neon Genesis Evangelion» */
      if (inter.some(w => w.length >= 6)) sc = Math.max(sc, 0.62);
    }
    if (sc > bestScore) { bestScore = sc; best = s; }
  }
  return bestScore >= 0.6 ? best : null;
}

/* mueve la OVA suelta → capítulos 🎌 OVA dentro de su serie */
function mergeOvaInto(ova, serie) {
  if (serie.episodes.some(e => e.srcOva === ova.id)) return false; // ya está integrada
  let maxN = serie.episodes.reduce((m, e) => Math.max(m, e.n || 0), 0);
  ova.episodes.forEach(ep => {
    serie.episodes.push({
      n: ++maxN,
      t: (ova.episodes.length > 1 ? '🎌 OVA — ' + (ep.t || ova.t) : '🎌 OVA — ' + ova.t).slice(0, 60),
      url: ep.url || '', sub: ep.sub || null, ova: true, srcOva: ova.id,
    });
  });
  state.series.splice(state.series.findIndex(x => x.id === ova.id), 1);
  return true;
}

/* pasa revista: integra todas las OVAs que ya tienen serie disponible */
function syncOvasToSeries(silent) {
  let moved = 0;
  for (const ova of state.series.filter(isOvaEntry).slice()) {
    const match = ovaMatchSeries(ova);
    if (match && mergeOvaInto(ova, match)) moved++;
  }
  if (moved) {
    save();
    renderSeries(els.searchInput.value);
    renderEpisodes();
    if (!silent) toast(`🎌 ${moved} OVA${moved > 1 ? 's' : ''} integrada${moved > 1 ? 's' : ''} en su serie`);
  }
  return moved;
}

function syncTabs() {
  els.tabAnime.classList.toggle('on', state.tab === 'anime');
  els.tabPeliculas.classList.toggle('on', state.tab === 'peliculas');
  els.tabTv.classList.toggle('on', state.tab === 'tv');
  els.tvTools.classList.toggle('hidden', state.tab !== 'tv' || !canAdmin());
  els.tvCats.classList.toggle('hidden', state.tab !== 'tv');
  document.body.classList.toggle('tab-tv', state.tab === 'tv');
  if (state.tab !== 'tv') tvCatFilter = null;
}
function setTab(tab) {
  state.tab = tab;
  syncTabs();
  save();
  renderSeries(els.searchInput.value);
}
els.tabAnime.addEventListener('click', () => setTab('anime'));
els.tabPeliculas.addEventListener('click', () => setTab('peliculas'));
els.tabTv.addEventListener('click', () => setTab('tv'));

/* ═══════════════════════════════════════════════════════════
   📡 TV EN VIVO — canales con sincronización inteligente
   ───────────────────────────────────────────────────────────
   · Un clic escanea una lista M3U (URL o contenido pegado).
   · En cada actualización: los canales nuevos SE AÑADEN, los
     que siguen SE ACTUALIZAN (logo, grupo, enlace nuevo) y los
     que el dueño de la lista retiró DESAPARECEN solos.
   · Los canales añadidos a mano (src 'manual') NUNCA se podan.
   · (state.channels / state.tvSources se inicializan en load())
   ═══════════════════════════════════════════════════════════ */

const tvId = str => 'tv-' + String(str).toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

/* ── Enriquecimiento automático iptv-org ──
   El tvg-id oficial es «Nombre.pais@Calidad»: sacamos país (cc ISO),
   y del nombre la calidad (1080p) y etiquetas ([Not 24/7], [Geo-blocked]). */
const flagOf = cc => cc ? String.fromCodePoint(...cc.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0))) : '';
const CC_NAME = (() => { try { return new Intl.DisplayNames(['es'], { type: 'region' }); } catch (e) { return { of: c => c }; } })();

/* etiquetas raras de la lista se traducen a español para las chips */
const TV_CAT_ES = {
  animation: 'Animación', auto: 'Motor', business: 'Negocios', classic: 'Clásicos',
  comedy: 'Comedia', cooking: 'Cocina', culture: 'Cultura', documentary: 'Documentales',
  education: 'Educación', entertainment: 'Entretenimiento', family: 'Familia',
  general: 'General', kids: 'Infantil', legislative: 'Legislativo', lifestyle: 'Estilo',
  movies: 'Películas', music: 'Música', news: 'Noticias', outdoor: 'Aire libre',
  public: 'Público', relax: 'Relax', religious: 'Religioso', science: 'Ciencia',
  series: 'Series', shop: 'Tienda', sports: 'Deportes', travel: 'Viajes',
  weather: 'Clima', undefined: 'Otros', other: 'Otros',
};
const tvCatEs = g => (TV_CAT_ES[String(g || '').toLowerCase()] || g || 'Otros');
const isAdultChannel = (name, group) => /xxx|porn|adults?|hustler|playboy/i.test((name || '') + ' ' + (group || ''));

/* ── Parser M3U (formato estándar #EXTINF de iptv-org) ── */
function parseM3U(text) {
  const out = [];
  let meta = null;
  let filtered = 0;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#EXTINF/i.test(line)) {
      const tvgId = (line.match(/tvg-id="([^"]*)"/i) || [])[1] || '';
      meta = {
        name: (line.split(',').pop() || 'Canal').trim(),
        logo: (line.match(/tvg-logo="([^"]*)"/i) || [])[1] || '',
        group: (line.match(/group-title="([^"]*)"/i) || [])[1] || '',
        epg: tvgId.split('@')[0] || '',                    /* «13C.cl@SD» → «13C.cl» para el XMLTV */
        cc: (tvgId.match(/\.([a-z]{2})@/i) || [])[1] || '', /* «13C.cl@SD» → «cl» */
      };
    } else if (!line.startsWith('#') && /^https?:\/\//i.test(line)) {
      const m = meta || { name: line.split('/').pop().slice(0, 40), logo: '', group: '', epg: '', cc: '' };
      if (isAdultChannel(m.name, m.group)) { filtered++; meta = null; continue; } /* sin contenido adulto */
      const quality = (m.name.match(/\((\d{3,4}p)\)/) || [])[1] || '';
      const flags = m.name.match(/\[[^\]]+\]/g) || [];
      out.push({
        name: m.name.replace(/\s*\(\d{3,4}p\)/g, '').replace(/\s*\[[^\]]*\]/g, '').trim() || 'Canal',
        logo: m.logo, group: m.group, url: line,
        epg: m.epg, cc: m.cc, quality, flags,
      });
      meta = null;
    }
  }
  out.filtered = filtered;
  return out;
}

/* ── Sincronización inteligente: añade nuevos, actualiza existentes, poda caídos ── */
function syncChannels(list, srcKey) {
  const llegan = new Set();
  let added = 0, updated = 0;
  for (const ch of list) {
    const id = tvId(ch.epg || ch.name || ch.url);
    llegan.add(id);
    const old = state.channels.find(c => c.id === id);
    if (!old) {
      state.channels.push({
        id, name: ch.name, logo: ch.logo, group: tvCatEs(ch.group), url: ch.url,
        epg: ch.epg || '', cc: ch.cc || '', quality: ch.quality || '', flags: ch.flags || [],
        src: srcKey, at: Date.now(),
      });
      added++;
    } else {
      old.name = ch.name;                       /* por si el nombre mejoró */
      old.url = ch.url;                          /* SIEMPRE el enlace más fresco */
      if (ch.logo) old.logo = ch.logo;
      if (ch.group) old.group = tvCatEs(ch.group);
      if (ch.epg) old.epg = ch.epg;
      if (ch.cc) old.cc = ch.cc;
      if (ch.quality) old.quality = ch.quality;
      if (ch.flags && ch.flags.length) old.flags = ch.flags;
      old.src = srcKey; old.at = Date.now();
      updated++;
    }
  }
  /* poda: los que venían de ESTA fuente y ya no aparecen → se consideran caídos */
  let removed = 0;
  if (srcKey && srcKey !== 'manual') {
    const antes = state.channels.length;
    state.channels = state.channels.filter(c => c.src !== srcKey || llegan.has(c.id));
    removed = antes - state.channels.length;
  }
  save();
  renderSeries(els.searchInput.value);
  return { added, updated, removed, total: state.channels.length };
}

/* ── Escaneo: una URL de lista O contenido M3U pegado directamente ── */
async function scanTvList() {
  if (!needAdmin()) return;
  const r = await uiModal({
    icon: '📡', title: 'Escanear lista de canales', okLabel: '⚡ Escanear y actualizar',
    sub: `Tienes <b>${state.channels.length}</b> canales guardados.<br>
      Pega la <b>URL de una lista M3U</b> (se vuelve a descargar en cada «🔄 Actualizar») o pega el <b>contenido</b> de la lista.<br>
      <span style="color:var(--dim)">Los canales nuevos se integran solos, los caídos se retiran y los demás quedan intactos.</span>`,
    fields: [
      { key: 'url', label: 'URL de la lista .m3u / .m3u8', value: '', placeholder: 'https://ejemplo.com/lista.m3u' },
      { key: 'name', label: 'Nombre de la fuente (opcional)', placeholder: 'Ej: Lista principal' },
      { key: 'm3u', label: '…o pega aquí el contenido de la lista', type: 'textarea', rows: 6, placeholder: '#EXTM3U\n#EXTINF:-1 tvg-logo="…" group-title="…",Mi Canal\nhttp://…/stream.m3u8' },
    ],
  });
  if (!r) return;
  const url = r.url.trim();
  const nombre = (r.name || '').trim() || new URL(url || 'https://lista').hostname || 'Lista';
  try {
    let text, srcKey;
    if (url) {
      toast('📡 Descargando la lista…');
      srcKey = 'src-' + tvId(url);
      text = await fetchText(url);
      state.tvSources[srcKey] = { url, name: nombre, at: Date.now() };
    } else if (r.m3u.trim()) {
      srcKey = 'src-' + tvId(r.m3u.trim().slice(0, 60));
      text = r.m3u;
    } else {
      return toast('⚠ Pega una URL o el contenido de la lista', true);
    }
    const list = parseM3U(text);
    if (!list.length) return toast('⚠ No encontré canales en esa lista', true);
    const res = syncChannels(list, srcKey);
    toast(`📡 ${res.added} nuevos · ${res.updated} actualizados · ${res.removed} retirados → ${res.total} canales`);
    setTab('tv');
  } catch (e) {
    toast('⚠ No se pudo leer la lista: ' + (e.message || e), true);
  }
}

/* ── Re-descargar TODAS las fuentes guardadas con un solo clic ── */
async function rescanAllTv() {
  if (!needAdmin()) return;
  const keys = Object.keys(state.tvSources || {});
  if (!keys.length) return scanTvList();
  els.tvRescanBtn.disabled = true;
  toast(`🔄 Actualizando ${keys.length} fuente${keys.length > 1 ? 's' : ''}…`);
  let added = 0, updated = 0, removed = 0, fallidas = 0;
  for (const k of keys) {
    try {
      const text = await fetchText(state.tvSources[k].url);
      const list = parseM3U(text);
      const res = syncChannels(list, k);
      added += res.added; updated += res.updated; removed += res.removed;
      state.tvSources[k].at = Date.now();
    } catch (e) {
      fallidas++; /* la fuente está caída: SUS canales se conservan por si vuelve */
    }
  }
  save();
  els.tvRescanBtn.disabled = false;
  toast(`📡 TV actualizada: +${added} nuevos · ${updated} al día · ${removed} retirados${fallidas ? ` · ⚠ ${fallidas} fuente(s) caída(s)` : ''}`);
}

/* fetch con respaldo por proxies CORS (las listas suelen servir sin cabeceras CORS) */
async function fetchText(url) {
  try {
    const r = await fetch(url);
    if (r.ok) { const t = await r.text(); if (t.length > 10) return t; }
    throw new Error('HTTP ' + r.status);
  } catch (e) {
    return await fetchTextViaProxies(url); /* reutiliza los proxies del modo Drive */
  }
}

els.tvScanBtn.addEventListener('click', scanTvList);
els.tvRescanBtn.addEventListener('click', rescanAllTv);

/* ── render de la lista de canales (pestaña 📡 TV) ── */
let tvCatFilter = null;
/* icono por categoría para chips y separadores de grupo */
const TV_CAT_ICON = {
  'General': '📡', 'Noticias': '📰', 'Deportes': '⚽', 'Películas': '🎬', 'Series': '📺',
  'Infantil': '🧒', 'Música': '🎵', 'Documentales': '🎥', 'Animación': '🎌', 'Comedia': '😂',
  'Cultura': '🏛️', 'Educación': '🎓', 'Entretenimiento': '🎉', 'Familia': '👨‍👩‍👧',
  'Religioso': '⛪', 'Cocina': '🍳', 'Viajes': '✈️', 'Estilo': '✨', 'Ciencia': '🔬',
  'Negocios': '💼', 'Clásicos': '🎞️', 'Motor': '🏎️', 'Aire libre': '🏞️', 'Tienda': '🛍️',
  'Legislativo': '🏛️', 'Público': '🏛️', 'Relax': '🧘', 'Clima': '🌦️', 'Otros': '📺',
};
const tvCatIcon = g => TV_CAT_ICON[g] || '📺';
/* orden de prioridad para que lo más útil quede primero, el resto por nº de canales */
const TV_CAT_PRIOR = ['General', 'Noticias', 'Deportes', 'Películas', 'Series', 'Infantil', 'Animación', 'Entretenimiento', 'Música', 'Documentales'];
function tvCatSort(a, b) {
  const ia = TV_CAT_PRIOR.indexOf(a[0]), ib = TV_CAT_PRIOR.indexOf(b[0]);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  return b[1] - a[1];
}
function renderTvCats() {
  const cats = {};
  (state.channels || []).forEach(c => { const g = c.group || 'Otros'; cats[g] = (cats[g] || 0) + 1; });
  const entries = Object.entries(cats).sort(tvCatSort);
  if (!entries.length) { els.tvCats.innerHTML = ''; els.tvCats.classList.add('hidden'); return; }
  els.tvCats.classList.remove('hidden');
  let html = `<button class="tag-chip${tvCatFilter === null ? ' on' : ''}" data-cat="" title="Ver todos los canales">🌐 Todo <b class="tab-count">${state.channels.length}</b></button>`;
  for (const [g, n] of entries) {
    html += `<button class="tag-chip${tvCatFilter === g ? ' on' : ''}" data-cat="${escapeHtml(g)}" title="${n} canal${n > 1 ? 'es' : ''} de ${escapeHtml(g)}">${tvCatIcon(g)} ${escapeHtml(g)} <b class="tab-count">${n}</b></button>`;
  }
  els.tvCats.innerHTML = html;
  /* tras re-render, hace scroll del chip activo a la vista */
  const on = els.tvCats.querySelector('.tag-chip.on');
  if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  els.tvCats.querySelectorAll('[data-cat]').forEach(b => {
    b.addEventListener('click', () => {
      tvCatFilter = b.dataset.cat || null;
      renderSeries(els.searchInput.value);
      /* 📱 móvil: tocar una categoría reproduce el primer canal que responda */
      if (window.innerWidth <= 900) playFirstOfCategory(tvCatFilter);
    });
  });
}

/* móvil: al tocar una categoría → reproduce el 1er canal que cargue;
   si cae, intenta con el siguiente de esa categoría (máx 4 intentos) */
let tvAutoQueue = [];
function playFirstOfCategory(cat) {
  const pool = (state.channels || []).filter(c =>
    !cat || (c.group || 'Otros') === cat
  );
  if (!pool.length) return;
  tvAutoQueue = pool.slice(1, 5);   /* los siguientes 4 como reserva */
  playChannel(pool[0]);
}

function renderChannels(q) {
  /* chips de categorías, auto-organizadas desde los datos iptv-org */
  renderTvCats();
  let list = (state.channels || []).slice();
  if (tvCatFilter) list = list.filter(c => (c.group || 'Otros') === tvCatFilter);
  list.sort((a, b) => (a.group || '').localeCompare(b.group || '') || a.name.localeCompare(b.name));
  if (q) list = list.filter(c =>
    c.name.toLowerCase().includes(q) || (c.group || '').toLowerCase().includes(q));

  /* cabecera con acceso rápido a las herramientas dentro del listado */
  const head = document.createElement('div');
  head.className = 'ch-head';
  if (!state.channels.length) {
    els.seriesList.innerHTML = `
      <div class="episodes-hint" style="margin:10px">
        📡 <b>TV en vivo</b><br><br>
        Aún no hay canales.${canAdmin()
          ? '<br><br>Pulsa <b>📡 Escanear lista M3U</b> (arriba) y pega la URL de una lista o su contenido.<br>Los canales se actualizan solos con <b>🔄 Actualizar</b>: entran los nuevos y salen los caídos.'
          : '<br><br>El administrador publicará los canales aquí.'}
      </div>`;
    return;
  }
  if (!list.length) {
    els.seriesList.innerHTML = `<div class="episodes-hint" style="margin:10px">Sin canales para «${escapeHtml(q)}»</div>`;
    return;
  }
  let lastGroup = null;
  for (const ch of list) {
    /* cuando se filtra por categoría los separadores de grupo sobran; si no, se conservan */
    if (!tvCatFilter && ch.group && ch.group !== lastGroup) {
      lastGroup = ch.group;
      const gh = document.createElement('div');
      gh.className = 'ch-group';
      gh.textContent = `${tvCatIcon(ch.group)} ${ch.group}`;
      els.seriesList.appendChild(gh);
    }
    const btn = document.createElement('button');
    btn.className = 's-item ch-item' + (state.currentChannel === ch.id ? ' active' : '');
    /* badges iptv-org: país (banderita), calidad, etiquetas, y guía EPG */
    const badges = [];
    if (ch.cc) badges.push(flagOf(ch.cc));
    if (ch.quality) badges.push(ch.quality);
    if (ch.flags && ch.flags.some(f => /not 24/i.test(f))) badges.push('⏸');
    const nowProg = ch.epg ? epgNow(ch.epg) : null;
    btn.innerHTML = `
      <span class="s-cover ch-cover" style="background:${GRADS[(ch.name.length) % GRADS.length][0]}22">
        ${ch.logo ? `<img class="ch-logo" src="${escapeHtml(ch.logo)}" alt="" loading="lazy" onerror="this.remove();this.parentNode.textContent='📡'">` : '📡'}
      </span>
      <span class="s-meta">
        <span class="s-title">${escapeHtml(ch.name)}</span>
        <span class="s-sub">
          <span class="ch-live">EN VIVO</span>
          ${badges.length ? `<span class="ch-badges">${badges.join(' ')}</span>` : ''}
          ${nowProg ? `<span class="ch-now" title="${escapeHtml(nowProg.t)}">📅 ${escapeHtml(nowProg.t.slice(0, 32))}</span>` : ''}
        </span>
      </span>
      ${canAdmin() ? `<span class="s-del ch-del" title="Quitar este canal">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>
      </span>` : ''}`;
    btn.addEventListener('click', ev => {
      if (ev.target.closest('.ch-del')) return;
      tvAutoQueue = [];    /* selección manual: cancela la cola de auto-intentos */
      playChannel(ch);
    });
    if (canAdmin()) {
      btn.querySelector('.ch-del').addEventListener('click', async ev => {
        ev.stopPropagation();
        const r = await uiModal({
          icon: '🗑', title: 'Quitar canal', okLabel: 'Quitar', danger: true,
          sub: `«<b>${escapeHtml(ch.name)}</b>» se eliminará de la lista de TV.`,
        });
        if (!r) return;
        state.channels = state.channels.filter(c => c.id !== ch.id);
        if (state.currentChannel === ch.id) { state.currentChannel = null; resetStage(); }
        save(); renderSeries(els.searchInput.value);
        toast(`🗑 Canal «${ch.name}» eliminado`);
      });
    }
    els.seriesList.appendChild(btn);
  }
}

/* ═══════════ Reproductor de canales en vivo ═══════════
   · .m3u8 (HLS) → hls.js bajo demanda (CDN) con respaldo nativo
   · .mp4/.webm directo → <video> normal
   · otros (YouTube, iframes…) → overlay de fuente externa        */
let hlsInst = null;
function destroyHls() {
  if (hlsInst) { try { hlsInst.destroy(); } catch (e) { } hlsInst = null; }
}
async function ensureHlsLib() {
  if (window.Hls) return true;
  try {
    await loadScript('https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js');
    return !!window.Hls;
  } catch (e) { return false; }
}

/* ═══ Proxy CORS para streams bloqueados ═══
   Muchos canales no envían cabeceras CORS y el navegador los rechaza;
   y si tu web es https://, los streams http:// se bloquean como
   "contenido mixto". El proxy enruta el manifiesto Y los segmentos
   de video, sorteando ambos bloqueos. El navegador solo ve URLs https
   del propio proxy, así que todo pasa.                                  */
const HLS_PROXIES = [
  u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
  u => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
];
let hlsProxyIdx = 0;
function makeProxyLoader() {
  const Base = Hls.DefaultConfig.loader;
  const wrap = u => HLS_PROXIES[hlsProxyIdx](u);
  return class extends Base {
    load(context, config, callbacks) {
      /* context.url SIEMPRE es la URL original ya resuelta por hls.js
         (manifiesto, playlist o segmento); solo la envolvemos al hacer
         fetch, PERO restauramos response.url para que los segmentos
         relativos sigan resolviéndose contra el servidor del canal   */
      const originalUrl = context.url;
      const wrapped = Object.assign({}, context, { url: wrap(originalUrl) });
      const patched = Object.assign({}, callbacks, {
        onSuccess: (response, stats, ctx, networkDetails) => {
          if (response && response.url) response.url = originalUrl;
          callbacks.onSuccess && callbacks.onSuccess(response, stats, ctx, networkDetails);
        },
      });
      super.load(wrapped, config, patched);
    }
  };
}

function startHls(ch, viaProxy) {
  destroyHls();
  const v = els.video;
  /* página https + stream http => el navegador lo bloqueará: proxy directo */
  const mixto = location.protocol === 'https:' && /^http:\/\//i.test(ch.url);
  const useProxy = !!(viaProxy || mixto);
  const cfg = {
    enableWorker: true,
    lowLatencyMode: false,
    backBufferLength: 60,
    liveDurationInfinity: true,
    manifestLoadingTimeOut: 15000, manifestLoadingMaxRetry: 2,
    levelLoadingTimeOut: 15000, levelLoadingMaxRetry: 3,
    fragLoadingTimeOut: 20000, fragLoadingMaxRetry: 4,
  };
  if (useProxy) cfg.loader = makeProxyLoader();
  const h = hlsInst = new Hls(cfg);
  h.loadSource(ch.url);
  h.attachMedia(v);
  let retriedDirect = false;
  h.on(Hls.Events.MANIFEST_PARSED, () => {
    els.spinner.classList.add('hidden');
    v.play().catch(() => toast('Pulsa play para iniciar el directo'));
    if (useProxy) toast('🛰 Ruta alternativa activa (el canal bloqueaba la directa)');
  });
  h.on(Hls.Events.ERROR, (_, data) => {
    if (!data || !data.fatal) return;
    /* error de MEDIOS: casi siempre se puede recuperar sin molestar */
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
      try { h.recoverMediaError(); } catch (e) { }
      return;
    }
    /* error de RED fatal: primero reintenta vía proxy CORS */
    if (!useProxy && !retriedDirect) {
      retriedDirect = true;
      toast('🔁 Bloqueo de CORS detectado — probando ruta alternativa…');
      setTimeout(() => startHls(ch, true), 700);
      return;
    }
    /* con proxy y aun así falla: siguiente proxy de la lista */
    if (useProxy && hlsProxyIdx < HLS_PROXIES.length - 1) {
      hlsProxyIdx++;
      toast('🔁 Probando otra ruta…');
      setTimeout(() => startHls(ch, true), 700);
      return;
    }
    /* agotado: si venimos de auto-categoría, probamos el siguiente canal */
    hlsProxyIdx = 0;
    els.spinner.classList.add('hidden');
    const nxt = tvAutoQueue && tvAutoQueue.length ? tvAutoQueue.shift() : null;
    if (nxt && nxt.id !== ch.id) {
      toast(`🔁 «${ch.name}» no respondió — probando «${nxt.name}»…`);
      setTimeout(() => playChannel(nxt), 600);
      return;
    }
    tvAutoQueue = [];
    /* agotado: en VLC seguro que funciona */
    hlsProxyIdx = 0;
    showChannelFallback(ch);
  });
}

/* cuando ni directo ni proxies funcionan: opciones para el usuario */
function showChannelFallback(ch) {
  destroyHls();
  openExternalMode({ t: ch.name }, { n: 1, t: 'Señal en vivo', url: ch.url });
  els.extTitle.textContent = '⚠ Este canal bloquea la reproducción web';
  els.extHost.textContent = 'Usa HTTP inseguro o no permite CORS ni proxy. En VLC (gratis) suena seguro: copia el enlace y pégalo en Medio → Abrir ubicación de red.';
  els.extOpen.innerHTML = '📋 Copiar enlace para VLC';
  els.extOpen.onclick = () => {
    navigator.clipboard.writeText(ch.url)
      .then(() => toast('✔ Enlace copiado — en VLC: Medio → Abrir ubicación de red (Ctrl+N)'))
      .catch(() => toast('No se pudo copiar', true));
  };
}

async function playChannel(ch) {
  state.currentChannel = ch.id;
  current.seriesId = null;   /* el panel de abajo pasa a ser "canales relacionados", no capítulos */
  current.ep = null;
  save();
  renderSeries(els.searchInput.value);

  /* cabecera del escenario */
  els.empty.classList.add('hidden');
  els.noUrl.classList.add('hidden');
  els.stageTitle.textContent = ch.name;
  els.stageSub.textContent = [ch.group || 'TV en vivo', '🔴 En directo'].join(' · ');
  els.stageBadges.innerHTML = `<span class="badge acid">📡 TV EN VIVO</span>` + (ch.group ? `<span class="badge">${escapeHtml(ch.group)}</span>` : '')
    + (ch.cc ? `<span class="badge">${flagOf(ch.cc)} ${escapeHtml((CC_NAME.of(ch.cc.toUpperCase()) || ch.cc))}</span>` : '')
    + (ch.quality ? `<span class="badge">${escapeHtml(ch.quality)}</span>` : '');
  /* 📅 guía: qué echan ahora y a continuación */
  const epNow = ch.epg ? epgNow(ch.epg) : null;
  const epNext = ch.epg ? epgNext(ch.epg) : null;
  if (epNow || epNext) {
    els.stageBadges.innerHTML += `<span class="badge" style="border-color:rgba(216,255,62,.5)">📅 Ahora: ${escapeHtml((epNow && epNow.t) || '—')}</span>`
      + (epNext ? `<span class="badge">luego: ${escapeHtml(epNext.t)}</span>` : '');
  }
  document.title = `📡 ${ch.name} — X·STREAM`;
  els.nowPlaying.textContent = `📡 ${ch.name}`;
  els.shareBtn.classList.add('hidden');    /* un canal no es un capítulo compartible */
  els.downloadBtn.classList.add('hidden');
  els.flagBtn.classList.add('hidden');

  /* 🔗 URL limpia y dinámica del canal: #/tv/nombre-del-canal */
  try { history.replaceState(null, '', buildChannelUrl(ch)); } catch (e) { }

  /* 📺 abajo: canales relacionados de la MISMA categoría */
  els.episodesTitle.textContent = `📡 ${ch.group || 'General'} — canales relacionados`;
  els.delSeriesBtn.classList.add('hidden');
  els.addEpBtn.classList.add('hidden');
  els.insertEpBtn.classList.add('hidden');
  renderRelatedChannels(ch);

  exitDriveMode(); exitExtMode();
  destroyHls();
  attachSpanishSubs(null);
  stopDriveTracking();
  const v = els.video;
  v.pause(); v.removeAttribute('src'); v.load();

  const isHls = /\.m3u8($|\?)/i.test(ch.url);
  if (isHls) {
    els.spinner.classList.remove('hidden');
    const ok = await ensureHlsLib();
    if (ok && window.Hls && Hls.isSupported()) {
      startHls(ch, false);        /* intento directo; si CORS lo bloquea, reintenta proxy */
    } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = ch.url;   /* Safari/iOS: HLS nativo (ahí no aplica CORS en video) */
      v.play().catch(() => { });
      els.spinner.classList.add('hidden');
    } else {
      els.spinner.classList.add('hidden');
      showChannelFallback(ch);
    }
    return;
  }
  if (isDirectVideoUrl(ch.url)) {
    v.src = ch.url;
    v.load();
    v.play().catch(() => toast('Pulsa play para iniciar el directo'));
    return;
  }
  /* YouTube, Dailymotion, iframes… → fuente externa */
  openExternalMode({ t: ch.name }, { n: 1, t: 'Señal en vivo', url: ch.url });
}

/* ── Canales relacionados bajo el player (misma categoría) ── */
function renderRelatedChannels(ch) {
  els.episodesGrid.classList.add('rel-movies');
  els.episodesGrid.innerHTML = '';
  /* mismo grupo, excluyendo el canal actual */
  const pool = (state.channels || []).filter(c =>
    c.id !== ch.id && (c.group || 'Otros') === (ch.group || 'Otros')
  );
  if (!pool.length) {
    els.episodesGrid.innerHTML = `<div class="episodes-hint">No hay más canales en «${escapeHtml(ch.group || 'General')}» — prueba otra categoría arriba</div>`;
    return;
  }
  /* los que tienen logo van primero, y dentro de eso orden alfabético */
  pool.sort((a, b) => ((b.logo ? 1 : 0) - (a.logo ? 1 : 0)) || a.name.localeCompare(b.name));
  for (const c of pool) {
    const cell = document.createElement('div');
    cell.className = 'ep movie-rel has-url' + (c.id === ch.id ? ' playing' : '');
    const nowProg = c.epg ? epgNow(c.epg) : null;
    cell.innerHTML = `
      ${c.logo ? `<img class="rel-bg ch-rel-bg" src="${escapeHtml(c.logo)}" alt="" loading="lazy" onerror="this.remove()">` : `<span class="rel-emoji">📡</span>`}
      <div class="rel-body">
        <div class="rel-t">${escapeHtml(c.name)}</div>
        <div class="rel-c">${c.cc ? flagOf(c.cc) + ' ' : ''}${c.quality ? c.quality + ' · ' : ''}🔴 EN VIVO${nowProg ? ` · 📅 ${escapeHtml(nowProg.t.slice(0, 22))}` : ''}</div>
      </div>`;
    cell.addEventListener('click', () => playChannel(c));
    els.episodesGrid.appendChild(cell);
  }
}

/* (al renombrar una serie, syncAddressBar refresca el slug al instante — ver listener renombrar) */


/* ═══════════════════════════════════════════════════════════
   🌐 INTEGRACIÓN IPTV-ORG — listas oficiales con auto-update
   ───────────────────────────────────────────────────────────
   El ecosistema iptv-org (github.com/iptv-org) publica listas
   M3U organizadas por idioma, país y categoría en GitHub Pages,
   reconstruidas a diario por sus bots. La app se suscribe a
   ellas y las re-descarga SOLA (máx. 1 vez al día): los canales
   nuevos entran, los caídos salen, los demás se refrescan.

   Fuentes verificadas en vivo:
     iptv-org.github.io/iptv/languages/spa.m3u      (español)
     iptv-org.github.io/iptv/countries/{cc}.m3u     (por país)
     iptv-org.github.io/iptv/categories/{cat}.m3u   (por tema)
   ═══════════════════════════════════════════════════════════ */
const IPTV_BASE = 'https://iptv-org.github.io/iptv';
/* paquetes disponibles en el selector «🌐 iptv-org» */
const IPTV_PACKS = [
  { id: 'spa',      icon: '🇪🇸', name: 'Español (todo)',        url: `${IPTV_BASE}/languages/spa.m3u`,      desc: 'Todos los canales en español' },
  { id: 'c-es',     icon: '🇪🇸', name: 'España',                url: `${IPTV_BASE}/countries/es.m3u` },
  { id: 'c-mx',     icon: '🇲🇽', name: 'México',                url: `${IPTV_BASE}/countries/mx.m3u` },
  { id: 'c-ar',     icon: '🇦🇷', name: 'Argentina',             url: `${IPTV_BASE}/countries/ar.m3u` },
  { id: 'c-co',     icon: '🇨🇴', name: 'Colombia',              url: `${IPTV_BASE}/countries/co.m3u` },
  { id: 'c-cl',     icon: '🇨🇱', name: 'Chile',                 url: `${IPTV_BASE}/countries/cl.m3u` },
  { id: 'c-pe',     icon: '🇵🇪', name: 'Perú',                  url: `${IPTV_BASE}/countries/pe.m3u` },
  { id: 'c-ve',     icon: '🇻🇪', name: 'Venezuela',             url: `${IPTV_BASE}/countries/ve.m3u` },
  { id: 'c-do',     icon: '🇩🇴', name: 'Rep. Dominicana',       url: `${IPTV_BASE}/countries/do.m3u` },
  { id: 'c-us',     icon: '🇺🇸', name: 'Estados Unidos',        url: `${IPTV_BASE}/countries/us.m3u` },
  { id: 'g-news',   icon: '📰', name: 'Noticias',              url: `${IPTV_BASE}/categories/news.m3u` },
  { id: 'g-sports', icon: '⚽', name: 'Deportes',              url: `${IPTV_BASE}/categories/sports.m3u` },
  { id: 'g-movies', icon: '🎬', name: 'Películas',             url: `${IPTV_BASE}/categories/movies.m3u` },
  { id: 'g-series', icon: '📺', name: 'Series',                url: `${IPTV_BASE}/categories/series.m3u` },
  { id: 'g-kids',   icon: '🧒', name: 'Infantil',              url: `${IPTV_BASE}/categories/kids.m3u` },
  { id: 'g-music',  icon: '🎵', name: 'Música',                url: `${IPTV_BASE}/categories/music.m3u` },
  { id: 'g-doc',    icon: '🎥', name: 'Documentales',          url: `${IPTV_BASE}/categories/documentary.m3u` },
  { id: 'g-anime',  icon: '🎌', name: 'Animación',             url: `${IPTV_BASE}/categories/animation.m3u` },
];
const iptvSrcKey = pack => 'iptv-org/' + pack.id;
const IPTV_AUTO_KEY = 'tvAutoUpdateAt';
const iptvEnabled = () => state.iptvPacks || null;

/* ── Selector de paquetes iptv-org ── */
async function iptvPicker() {
  if (!needAdmin()) return;
  const on = iptvEnabled() || [];
  const onSet = new Set(on);
  const listHtml = IPTV_PACKS.map(p => {
    const chk = onSet.has(p.id) ? 'checked' : '';
    return `<label style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid var(--line);cursor:pointer">
      <input type="checkbox" data-iptv="${p.id}" ${chk}>
      <span style="font-size:13px">${p.icon} <b>${escapeHtml(p.name)}</b></span>
    </label>`;
  }).join('');
  const r = await uiModal({
    icon: '🌐', title: 'Fuentes iptv-org oficiales', okLabel: '⚡ Guardar y actualizar',
    sub: `Ecosistema verificado de <b>iptv-org</b> (actualizado a diario por sus bots).<br>
      Marca los paquetes que quieras: la app los re-descargará <b>sola cada día</b> y mantendrá los canales frescos.<br>
      <div style="max-height:240px;overflow-y:auto;margin-top:10px;border:1px solid var(--line);border-radius:10px;padding:4px 8px">${listHtml}</div>`,
  });
  if (r === null) return;
  /* recolectar marcados */
  const marcados = [...document.querySelectorAll('[data-iptv]:checked')].map(i => i.dataset.iptv);
  state.iptvPacks = marcados;
  save();
  /* actualizar todo de una vez */
  let totalAdded = 0, totalUpd = 0, totalRem = 0, fallidas = 0;
  for (const id of marcados) {
    const pack = IPTV_PACKS.find(p => p.id === id);
    if (!pack) continue;
    try {
      toast(`🌐 Descargando ${pack.icon} ${pack.name}…`);
      const text = await fetchText(pack.url);
      const res = syncChannels(parseM3U(text), iptvSrcKey(pack));
      totalAdded += res.added; totalUpd += res.updated; totalRem += res.removed;
      state.tvSources[iptvSrcKey(pack)] = { url: pack.url, name: 'iptv-org: ' + pack.name, at: Date.now() };
    } catch (e) { fallidas++; }
  }
  /* limpiar fuentes iptv-org desmarcadas — sus canales se retiran */
  const yaNo = Object.keys(state.tvSources).filter(k => k.startsWith('iptv-org/') && !marcados.includes(k.replace('iptv-org/', '')));
  for (const k of yaNo) {
    delete state.tvSources[k];
    state.channels = state.channels.filter(c => c.src !== k);
  }
  state[IPTV_AUTO_KEY] = Date.now();
  save();
  setTab('tv');
  toast(`🌐 iptv-org: +${totalAdded} nuevos · ${totalUpd} al día · ${totalRem} retirados${fallidas ? ` · ⚠ ${fallidas} fallidas` : ''}`);
}

/* ── AUTO-UPDATE: se dispara solo al entrar, máx. 1 vez al día ──
   Corre para TODOS (admin y lectores): las listas oficiales iptv-org
   son públicas, y cada dispositivo las mantiene frescas por su cuenta.  */
async function iptvAutoUpdate() {
  if (!/^https?:$/.test(location.protocol)) return;
  const last = state[IPTV_AUTO_KEY] || 0;
  if (Date.now() - last < 23 * 3600 * 1000) return;   /* 1 vez al día */
  state[IPTV_AUTO_KEY] = Date.now(); save();
  const keys = Object.keys(state.tvSources || {});
  if (!keys.length) return;
  let added = 0, updated = 0, removed = 0;
  for (const k of keys) {
    try {
      const text = await fetchText(state.tvSources[k].url);
      const res = syncChannels(parseM3U(text), k);
      added += res.added; updated += res.updated; removed += res.removed;
    } catch (e) { /* fuente temporalmente caída: sus canales se conservan */ }
  }
  if (added || removed) {
    toast(`🌐 Auto-update: +${added} canales nuevos · ${removed} retirados${updated ? ` · ${updated} refrescados` : ''}`);
  }
}

/* ═══════════════════════════════════════════════════════════
   📅 GUÍA EPG — «qué echan ahora» por canal (datos iptv-org)
   ───────────────────────────────────────────────────────────
   El EPG oficial de iptv-org pesa ~24 MB (inmanejable en
   navegador). Solución: se descarga UNA guía ligera por fuente
   o se pega la URL de una guía XMLTV reducida y se indexan solo
   los canales que tienes en tu lista. Se guarda en caché local
   y se refresca solo si tiene más de 6 horas.                  */
state.epg = state.epg || { url: '', map: {}, at: 0 };

function epgNow(id) {
  const progs = (state.epg.map || {})[id];
  if (!progs || !progs.length) return null;
  const now = Date.now();
  return progs.find(p => sToMs(p.start) <= now && now < sToMs(p.stop)) || null;
}
function epgNext(id) {
  const progs = (state.epg.map || {})[id];
  if (!progs) return null;
  const now = Date.now();
  return progs.filter(p => sToMs(p.start) > now).sort((a, b) => sToMs(a.start) - sToMs(b.start))[0] || null;
}
function sToMs(s) {
  /* XMLTV: 20240101093000 +0000 */
  const m = String(s).match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/);
  if (!m) return 0;
  const [, Y, M, D, h, i, sec, tz] = m;
  const utc = Date.UTC(+Y, +M - 1, +D, +h, +i, +sec);
  if (tz) {
    const off = (parseInt(tz.slice(1, 3)) * 60 + parseInt(tz.slice(3, 5))) * 60000;
    return tz[0] === '+' ? utc - off : utc + off;
  }
  return utc;
}

async function epgDownload(url) {
  toast('📅 Descargando guía de programación… (puede tardar)');
  const text = await fetchText(url);
  /* parseo ligero: solo canales que tenemos en la lista */
  const ids = new Set(state.channels.map(c => c.epg).filter(Boolean));
  if (!ids.size) throw new Error('no hay canales con tvg-id');
  const map = {};
  const re = /<programme[^>]+channel="([^"]+)"[^>]*start="([^"]+)"[^>]*stop="([^"]+)"[^>]*>([\s\S]*?)<\/programme>/g;
  let m, total = 0;
  while ((m = re.exec(text))) {
    const chId = m[1];
    if (!ids.has(chId)) continue;
    const title = (m[4].match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '';
    if (!map[chId]) map[chId] = [];
    map[chId].push({ start: m[2], stop: m[3], t: decodeHTMLEntities(title) });
    total++;
  }
  /* recortar guardado: solo de hoy en adelante, máx 3000 entradas por canal */
  const now = Date.now();
  for (const k of Object.keys(map)) {
    map[k] = map[k].filter(p => sToMs(p.stop) > now - 3600e3).slice(0, 200);
    if (!map[k].length) delete map[k];
  }
  state.epg = { url, map, at: Date.now() };
  save();
  return { channels: Object.keys(map).length, programs: total };
}

async function epgSetup() {
  if (!canAdmin()) return;
  const r = await uiModal({
    icon: '📅', title: 'Guía de programación (EPG)', okLabel: '⚡ Descargar guía',
    sub: `Pega la URL de una guía <b>XMLTV</b> que cubra tus canales (las del ecosistema iptv-org funcionan de maravilla).<br>
      El sistema indexa <b>solo tus canales</b> (${state.channels.length}) y recuerda la guía 6 horas antes de refrescarla.<br>
      Estado actual: <b>${state.epg.at ? '✔ ' + Object.keys(state.epg.map).length + ' canales con datos · ' + new Date(state.epg.at).toLocaleString() : 'sin guía'}</b>`,
    fields: [{ key: 'url', label: 'URL de la guía XMLTV (.xml)', value: state.epg.url || '', placeholder: 'https://…/guide.xml' }],
  });
  if (!r) return;
  const url = r.url.trim();
  if (!url) { state.epg = { url: '', map: {}, at: 0 }; save(); toast('📅 Guía desactivada'); return; }
  try {
    const res = await epgDownload(url);
    toast(`📅 Guía lista: ${res.channels} canales con programación (${res.programs} entradas)`);
    const chNow = state.currentChannel && state.channels.find(c => c.id === state.currentChannel);
    if (chNow) playChannel(chNow);
    renderSeries(els.searchInput.value);
  } catch (e) {
    toast('⚠ No se pudo leer la guía: ' + (e.message || e), true);
  }
}

els.tvIptvBtn.addEventListener('click', iptvPicker);
els.tvEpgBtn.addEventListener('click', epgSetup);

/* ids recién importados → entran con animación shimmer escalonada */
const freshIds = new Set();

function renderSeries(filter = '') {
  const q = filter.trim().toLowerCase();
  els.seriesList.innerHTML = '';
  /* contadores por pestaña (siempre actualizados) */
  els.countAnime.textContent = state.series.filter(s => s.kind !== 'pelicula').length;
  els.countPelis.textContent = state.series.filter(s => s.kind === 'pelicula').length;
  els.countTv.textContent = (state.channels || []).length;
  /* 📡 pestaña TV: lista de canales, no series */
  if (state.tab === 'tv') return renderChannels(q);
  let list = state.series.slice();
  /* pestaña activa: Anime(series) · Películas (las OVAs sueltas viven aquí hasta integrarse en su serie) */
  if (state.tab === 'peliculas') list = list.filter(s => s.kind === 'pelicula');
  else list = list.filter(s => s.kind !== 'pelicula');

  /* orden */
  const m = state.sortMode || 'manual';
  if (m === 'alpha') list.sort((a, b) => a.t.localeCompare(b.t, undefined, { sensitivity: 'base' }));
  else if (m === 'recent') list.sort((a, b) => ((state.lastPlayed || {})[b.id] || 0) - ((state.lastPlayed || {})[a.id] || 0));
  else list.sort((a, b) => (a.order ?? state.series.indexOf(a)) - (b.order ?? state.series.indexOf(b)));

  /* filtros */
  if (favOnly) list = list.filter(s => s.fav);
  if (tagFilter) list = list.filter(s => (s.tags || []).includes(tagFilter));
  /* búsqueda: también encuentra por título de capítulo o etiqueta */
  if (q) list = list.filter(s =>
    s.t.toLowerCase().includes(q)
    || s.episodes.some(e => (e.t || '').toLowerCase().includes(q))
    || (s.tags || []).some(t => t.toLowerCase().includes(q))
  );

  if (!list.length) {
    els.seriesList.innerHTML = `<div class="episodes-hint" style="margin:10px">Sin resultados${q ? ` para «${escapeHtml(filter)}»` : ''}</div>`;
    return;
  }

  let cardIdx = 0;
  for (const s of list) {
    const idx = cardIdx++;
    const linked = s.episodes.filter(e => e.url).length;
    const isMovie = s.kind === 'pelicula';
    const seen = watchedCount(s);
    const chip = isMovie
      ? (isOvaEntry(s)
          ? '<span class="s-kind pelicula">OVA</span>'
          : (s.anime ? '<span class="s-kind pelicula">PELÍCULA ANIME</span>' : '<span class="s-kind pelicula">PELÍCULA</span>'))
      : '<span class="s-kind serie">ANIME</span>';
    const sub = isMovie
      ? `${chip}${linked ? '<span class="s-linked">con enlace</span>' : 'sin enlace'}`
      : `${chip}${s.episodes.length} caps${seen ? ` · <span class="s-linked">${seen} vistos</span>` : ''}`;
    const btn = document.createElement('button');
    btn.className = 's-item' + (s.id === current.seriesId ? ' active' : '');
    btn.dataset.sid = s.id;
    btn.draggable = canAdmin();       /* el lector no puede arrastrar para fusionar/reordenar */
    const esAdmin = canAdmin();
    btn.innerHTML = `
      <span class="s-cover" style="background:${grad(s)}">
        ${coverHtml(s)}
        ${esAdmin ? '<span class="s-refresh" title="Forzar actualización de carátula con el nombre actual">✎</span>' : ''}
        <span class="s-fav${s.fav ? ' is-fav' : ''}" title="${s.fav ? 'Quitar de favoritos' : 'Añadir a favoritos'}">${s.fav ? '♥' : '♡'}</span>
      </span>
      <span class="s-meta">
        <span class="s-title">${escapeHtml(s.t)}</span>
        <span class="s-sub">${sub}</span>
      </span>
      ${esAdmin ? `<span class="s-del" title="Enviar a la papelera (restaurable 7 días)">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>
      </span>` : ''}`;
    const delBtn = btn.querySelector('.s-del');
    if (delBtn) delBtn.addEventListener('click', ev => { ev.stopPropagation(); confirmDeleteSeries(s); });
    btn.querySelector('.s-fav').addEventListener('click', ev => { ev.stopPropagation(); s.fav = !s.fav; save(); renderSeries(els.searchInput.value); if (s.id === current.seriesId) syncFavBtn(); });
    const refBtn = btn.querySelector('.s-refresh');
    if (refBtn) refBtn.addEventListener('click', ev => { ev.stopPropagation(); refetchPoster(s); });
    btn.addEventListener('click', ev => { if (!ev.target.closest('.s-del,.s-fav,.s-refresh')) selectSeries(s.id); });

    /* entrada con shimmer escalonado para lo recién importado */
    if (freshIds.has(s.id)) {
      freshIds.delete(s.id);
      btn.classList.add('fresh');
      btn.style.animationDelay = (Math.min(idx, 14) * 50) + 'ms';
      const d = Math.min(idx, 14) * 50;
      setTimeout(() => { btn.classList.remove('fresh'); btn.style.animationDelay = ''; }, 1500 + d);
    }

    /* drag & drop → orden manual · o UNIR como temporada al soltar sobre otra serie */
    btn.addEventListener('dragstart', () => { dragId = s.id; btn.classList.add('dragging'); });
    btn.addEventListener('dragend', () => { btn.classList.remove('dragging'); });
    btn.addEventListener('dragover', ev => ev.preventDefault());
    btn.addEventListener('drop', ev => {
      ev.preventDefault();
      if (!needAdmin()) return;
      if (!dragId || dragId === s.id) return;
      const dragged = getSeries(dragId);
      if (dragged && dragged.kind !== 'pelicula' && s.kind !== 'pelicula') {
        showDropChooser(btn, dragged, s); // serie sobre serie → elegir: mover o fundir
      } else {
        reorderSeries(dragId, s.id);
      }
    });
    els.seriesList.appendChild(btn);

    /* portada automática (anime) en segundo plano */
    queuePoster(s);
  }
}

/* ═══════════ Reordenar / fundir series como temporadas ═══════════ */
function reorderSeries(dragId, targetId) {
  const from = state.series.findIndex(x => x.id === dragId);
  const to = state.series.findIndex(x => x.id === targetId);
  const [moved] = state.series.splice(from, 1);
  state.series.splice(to, 0, moved);
  state.series.forEach((x, i) => x.order = i + 1);
  state.sortMode = 'manual';
  els.sortMode.value = 'manual';
  save(); renderSeries(els.searchInput.value);
  toast('⇅ Orden guardado');
}

/* convierte «dragged» en una nueva TEMPORADA dentro de «target»:
   los capítulos se numeran en continuación (N+1…) y su progreso migra */
function mergeSeason(dragged, target) {
  target.seasons = target.seasons || {};
  if (!target.seasons[1]) target.seasons[1] = target.t;
  target.episodes.forEach(e => { if (!e.season) e.season = 1; });
  const nextSeason = 1 + Math.max(...target.episodes.map(e => e.season || 1), 1);
  let offset = target.episodes.reduce((m, e) => Math.max(m, e.n || 0), 0);
  dragged.episodes.forEach((e, i) => {
    const nn = ++offset;
    target.episodes.push({
      n: nn, t: e.t || `Capítulo ${i + 1}`, url: e.url || '', sub: e.sub || null,
      note: e.note, season: nextSeason, srcSeason: dragged.id,
    });
    /* migra el progreso/vistos del capítulo antiguo a su nuevo número */
    const pr = ((state.progress || {})[dragged.id] || {})[e.n];
    if (pr) {
      state.progress[target.id] = state.progress[target.id] || {};
      state.progress[target.id][nn] = pr;
    }
  });
  /* nombre legible para la cabecera de la temporada */
  let nombreT = dragged.t.replace(/^.*?[·\-:]\s*/, '').trim();
  if (!/temporada|season/i.test(nombreT)) nombreT = `Temporada ${nextSeason} — ${nombreT}`.slice(0, 44);
  target.seasons[nextSeason] = nombreT.slice(0, 44);

  state.series.splice(state.series.indexOf(dragged), 1);
  delete state.progress[dragged.id];
  state.broken = (state.broken || []).filter(b => b.sid !== dragged.id);
  if (!target.poster) refetchPoster(target);
  save();
  renderSeries(els.searchInput.value);
  renderEpisodes();
  selectSeries(target.id);
  toast(`🧩 «${dragged.t}» ahora es la Temporada ${nextSeason} de «${target.t}»`);
}

/* panelito flotante al soltar una serie sobre otra: Mover o Unir como temporada */
function showDropChooser(anchor, dragged, target) {
  document.querySelectorAll('.drop-chooser').forEach(el => el.remove());
  const r = anchor.getBoundingClientRect();
  const box = document.createElement('div');
  box.className = 'drop-chooser';
  box.style.left = Math.min(r.left, window.innerWidth - 240) + 'px';
  box.style.top = Math.min(r.bottom + 6, window.innerHeight - 120) + 'px';
  box.innerHTML = `
    <div class="dc-hint">Soltaste «${escapeHtml(dragged.t.slice(0, 24))}» sobre «${escapeHtml(target.t.slice(0, 24))}»</div>
    <button class="dc-btn" data-a="season">🧩 Unir como temporada de «${escapeHtml(target.t.slice(0, 18))}»</button>
    <button class="dc-btn" data-a="move">⇅ Solo reordenar la lista</button>`;
  box.querySelector('[data-a="season"]').addEventListener('click', () => { box.remove(); mergeSeason(dragged, target); });
  box.querySelector('[data-a="move"]').addEventListener('click', () => { box.remove(); reorderSeries(dragged.id, target.id); });
  document.body.appendChild(box);
  const close = ev => { if (!box.contains(ev.target)) { box.remove(); document.removeEventListener('pointerdown', close, true); } };
  setTimeout(() => document.addEventListener('pointerdown', close, true), 10);
}

/* ⤺ restaurar una temporada a serie independiente (deshace mergeSeason) */
function unmergeSeason(s, se, epsS, label) {
  const epActual = s.episodes.find(e => e.n === current.ep);
  const progViejo = (state.progress || {})[s.id] || {};
  /* id original si sigue libre (cadena limpia), si no uno nuevo */
  const srcId = epsS[0] && epsS[0].srcSeason;
  const newId = (srcId && !getSeries(srcId)) ? srcId : 'ext-' + Date.now();
  const nueva = {
    id: newId,
    t: (label || `Temporada ${se}`).slice(0, 80),
    jp: '📺',
    tag: 'Serie restaurada',
    g: s.g, kind: 'serie', anime: s.anime, poster: s.poster || null,
    episodes: epsS.map(e => ({ n: 0, t: e.t, url: e.url, sub: e.sub || null, note: e.note })),
  };
  /* progreso: migra del número viejo (dentro de s) al nuevo 1..N */
  state.progress[newId] = {};
  nueva.episodes.forEach((ne, i) => {
    if (progViejo[epsS[i].n]) state.progress[newId][i + 1] = progViejo[epsS[i].n];
    ne.n = i + 1;
  });
  /* quita los caps de la serie madre y renumera lo que queda */
  s.episodes = s.episodes.filter(e => (e.season || 1) !== se);
  const progResto = {};
  s.episodes.forEach((e, i) => { if (progViejo[e.n]) progResto[i + 1] = progViejo[e.n]; e.n = i + 1; });
  state.progress[s.id] = progResto;
  if (s.seasons) delete s.seasons[se];
  if (current.seriesId === s.id && current.ep != null) {
    current.ep = epActual && s.episodes.includes(epActual) ? epActual.n : null;
  }
  state.series.push(nueva);
  if (nueva.anime && !nueva.poster) queuePoster(nueva, true);
  save();
  renderSeries(els.searchInput.value);
  renderEpisodes();
  selectSeries(newId);
  toast(`⤺ «${nueva.t}» vuelve a ser una serie independiente`);
}

/* ═══════════ Detección de fuente por capítulo (para el riel de color + icono) ═══════════ */
function epSourceClass(url) {
  if (!url) return 'src-none';
  if (parseDriveId(url)) return 'src-drive';
  if (parseStape(url)) return 'src-stape';
  if (isDirectVideoUrl(url)) return 'src-direct';
  return 'src-ext';
}
function epSourceIcon(url) {
  switch (epSourceClass(url)) {
    case 'src-drive': return { g: '▣', t: 'Google Drive' };
    case 'src-stape': return { g: '☁', t: 'Streamtape' };
    case 'src-direct': return { g: '⚡', t: 'Enlace directo' };
    case 'src-ext': return { g: '🔗', t: 'Fuente externa' };
    default: return { g: '○', t: 'Sin enlace todavía' };
  }
}

/* sello de calidad (HD/SD…) leyendo el título o el nombre del archivo del enlace */
function epQuality(ep) {
  let raw = '';
  try { raw = decodeURIComponent(ep.url || ''); } catch (e) { raw = ep.url || ''; }
  const m = ((ep.t || '') + ' ' + raw).match(/(?:^|[^\d])(2160|1440|1080|720|540|480|360)p\b/i);
  if (!m) return null;
  const p = +m[1];
  return { txt: m[1] + 'P', cls: p >= 1080 ? 'uhd' : p >= 720 ? 'hd' : 'sd' };
}

/* ═══════════ Miniaturas REALES de capítulo ═══════════
   · Drive     → thumbnail oficial de la API de Drive (al instante)
   · Streamtape→ splash oficial de su API (con tu key guardada)
   · Directo   → frame real capturado con canvas (video oculto, t≈3s)
   Se generan SOLO cuando la tarjeta es visible (IntersectionObserver),
   máx. 2 a la vez, y se guardan en localStorage con purga automática.     */
const getEpThumb = (s, ep) => (state.thumbs || {})[s.id + ':' + ep.n] || null;

function storeThumb(key, data) {
  state.thumbs = state.thumbs || {};
  state.thumbs[key] = data;
  const ks = Object.keys(state.thumbs);
  if (ks.length > 140) ks.slice(0, ks.length - 140).forEach(k => delete state.thumbs[k]);
  save(); // save() ya gestiona la cuota si se llena
}

let thumbVideo = null;
function captureFrame(url) {
  return new Promise((resolve, reject) => {
    if (!thumbVideo) {
      thumbVideo = document.createElement('video');
      thumbVideo.muted = true;
      thumbVideo.crossOrigin = 'anonymous'; // si la fuente es CORS-friendly, sale
      thumbVideo.preload = 'metadata';
    }
    const v = thumbVideo;
    const to = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, 12000);
    const cleanup = () => { clearTimeout(to); v.onloadeddata = v.onseeked = v.onerror = null; };
    v.onerror = () => { cleanup(); reject(new Error('video')); };
    v.onloadeddata = () => { try { v.currentTime = Math.min(3, (v.duration || 6) * 0.08); } catch (e) { cleanup(); reject(e); } };
    v.onseeked = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 224;
        c.height = Math.max(96, Math.round(224 * (v.videoHeight / v.videoWidth || 9 / 16)));
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        const data = c.toDataURL('image/jpeg', 0.62);
        cleanup();
        resolve(data);
      } catch (e) { cleanup(); reject(e); } // canvas contaminado (sin CORS) → sin miniatura, sin drama
    };
    v.src = url;
  });
}

const thumbQueue = [];
let thumbActive = 0;
function enqueueThumb(s, ep) {
  const key = s.id + ':' + ep.n;
  if (getEpThumb(s, ep) || thumbQueue.some(j => j.key === key)) return;
  thumbQueue.push({ s, ep, key });
  pumpThumbs();
}
async function pumpThumbs() {
  if (thumbActive >= 2 || !thumbQueue.length) return;
  thumbActive++;
  const job = thumbQueue.shift();
  try {
    let data = null;
    if (epSourceClass(job.ep.url) === 'src-stape') {
      const st = parseStape(job.ep.url);
      if (st) {
        /* vía 1: API oficial (si hay clave guardada) */
        if (state.stapeKey) {
          try { data = await stapeApi('file/getsplash', { file: st.id }); } catch (e) { data = null; }
        }
        /* vía 2 (sin clave): leer el og:image de la página del embed vía proxy CORS.
           Así funciona igual en PC y en móvil, sin depender de localStorage. */
        if (!data) data = await stapeThumbScrape(st.id);
      }
    } else {
      data = await captureFrame(job.ep.url);
    }
    if (data && typeof data === 'string') {
      storeThumb(job.key, data);
      /* pegarla en la tarjeta si sigue en pantalla */
      const cell = els.episodesGrid.querySelector(`[data-epn="${job.ep.n}"]`);
      if (cell && !cell.querySelector('.ep-thumb')) {
        const img = document.createElement('img');
        img.className = 'ep-thumb'; img.alt = ''; img.loading = 'lazy';
        img.onerror = () => img.remove();
        img.src = data;
        cell.prepend(img);
        cell.classList.add('has-thumb');
      }
    }
  } catch (e) { /* sin miniatura: la tarjeta sigue igual de bonita */ }
  thumbActive--;
  pumpThumbs();
}

/* solo se genera cuando la tarjeta entra en pantalla */
const thumbObserver = new IntersectionObserver(entries => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    thumbObserver.unobserve(en.target);
    if (en.target._thumbJob) en.target._thumbJob();
  }
}, { rootMargin: '200px' });

function deferThumb(s, ep, cell) {
  if (getEpThumb(s, ep)) return;
  if (parseDriveId(ep.url)) return;   // Drive se pinta directo, sin cola
  const cls = epSourceClass(ep.url);
  /* antes solo entraba Streamtape CON clave API; ahora también sin ella (og:image del embed) */
  if (cls === 'src-direct' || cls === 'src-stape') {
    cell._thumbJob = () => enqueueThumb(s, ep);
    thumbObserver.observe(cell);
  }
}

/* ☁ miniatura de Streamtape SIN API key: leemos el HTML del embed y extraemos
   su og:image / poster. CARRERA de proxies en paralelo: el primero que
   responde gana (los demás se ignoran) — mucho más rápido que en cadena. */
const _stapeCache = new Map(); /* id → url o null, para no repetir peticiones */
async function stapeThumbScrape(stId) {
  if (_stapeCache.has(stId)) return _stapeCache.get(stId);
  const embed = `https://streamtape.com/e/${stId}`;
  const proxies = [
    u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
    u => `https://api.cors.lol/?url=${encodeURIComponent(u)}`,
  ];
  const tryOne = async wrap => {
    const r = await fetch(wrap(embed), { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const html = await r.text();
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)/i)
           || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
           || html.match(/(?:poster|image|thumb)['"]?\s*[:=]\s*['"]([^'"]+)['"]/i)
           || html.match(/(https?:\/\/[^"'\s]*(?:thumb|poster|splash)[^"'\s]*\.(?:jpg|jpeg|png|webp))/i);
    if (m && m[1] && /^https?:\/\//i.test(m[1])) return m[1];
    throw new Error('sin imagen en el HTML');
  };
  /* carrera: todos en paralelo, el primero que resuelva con URL gana */
  try {
    const url = await Promise.any(proxies.map(tryOne));
    _stapeCache.set(stId, url);
    return url;
  } catch (e) { _stapeCache.set(stId, null); return null; }
}

/* ═══════════ Render: episodios ═══════════ */
function renderEpisodes() {
  const s = getSeries(current.seriesId);
  els.episodesGrid.innerHTML = '';
  if (!s) {
    els.episodesTitle.textContent = 'Capítulos';
    els.episodesGrid.innerHTML = '<div class="episodes-hint">← Selecciona una serie o película para empezar</div>';
    els.delSeriesBtn.classList.add('hidden');
    els.addEpBtn.classList.add('hidden');
    els.insertEpBtn.classList.add('hidden');
    return;
  }
  /* ── Vista PELÍCULA: en lugar de capítulos, relacionadas de la misma categoría ── */
  els.episodesGrid.classList.remove('rel-movies');
  if (s.kind === 'pelicula') {
    const esOva = isOvaEntry(s);
    els.episodesTitle.textContent = esOva ? '🎌 OVAs relacionadas' : '🎬 Películas relacionadas';
    els.delSeriesBtn.classList.remove('hidden');
    els.addEpBtn.classList.add('hidden');
    els.insertEpBtn.classList.add('hidden');
    els.episodesGrid.classList.add('rel-movies');
    const pool = state.series.filter(x => x.kind === 'pelicula' && isOvaEntry(x) === esOva);
    if (pool.length <= 1) {
      els.episodesGrid.innerHTML = `<div class="episodes-hint">No hay más ${esOva ? 'OVAs' : 'películas'} todavía — impórtalas con 🎬 Buscar cine o 📁 Drive</div>`;
      return;
    }
    for (const m of pool) {
      /* miniatura sin red: poster guardada, miniatura de Drive, o la de archive.org */
      let img = m.poster;
      if (!img) {
        const u = m.episodes[0] && m.episodes[0].url || '';
        const dId = parseDriveId(u);
        if (dId) img = driveThumbUrl(dId);
        else {
          const mm = u.match(/archive\.org\/download\/([^/]+)\//);
          if (mm) img = `https://archive.org/services/img/${mm[1]}`; // ~miniatura ligera
        }
      }
      const cell = document.createElement('div');
      cell.className = 'ep movie-rel has-url' + (img ? '' : ' fallback') + (m.id === s.id ? ' playing' : '');
      const chipTxt = isOvaEntry(m) ? '🎌 OVA' : (m.anime ? '🎬 ANIME' : '🎬 PELÍCULA');
      cell.innerHTML = `
        ${img ? `<img class="rel-bg" src="${img}" alt="" loading="lazy">` : `<span class="rel-emoji">${isOvaEntry(m) ? '🎌' : '🎬'}</span>`}
        <div class="rel-body">
          <div class="rel-t">${escapeHtml(m.t)}</div>
          <div class="rel-c">${chipTxt}</div>
        </div>`;
      cell.addEventListener('click', () => selectSeries(m.id));
      els.episodesGrid.appendChild(cell);
    }
    return;
  }

  els.episodesTitle.textContent = `${s.t} — ${s.episodes.length} capítulos`;
  els.delSeriesBtn.classList.remove('hidden');
  els.addEpBtn.classList.remove('hidden');
  els.insertEpBtn.classList.remove('hidden');

  /* cabeceras divisorias si la serie tiene varias temporadas (merge por arrastre) */
  const hasSeasons = s.episodes.some(e => (e.season || 1) > 1);
  let lastSeason = 0;
  for (const ep of s.episodes) {
    if (hasSeasons) {
      const se = ep.season || 1;
      if (se !== lastSeason) {
        lastSeason = se;
        const epsS = s.episodes.filter(e => (e.season || 1) === se);
        const nConLinks = epsS.filter(e => e.url).length;
        const label = (s.seasons && s.seasons[se]) || 'Temporada ' + se;
        const head = document.createElement('div');
        head.className = 'season-head' + (nConLinks ? '' : ' sh-empty');
        head.innerHTML = `
          <b class="sh-name" title="✎ Clic para renombrar esta temporada">🍿 ${escapeHtml(label)}</b>
          <span>${epsS.length} cap${epsS.length > 1 ? 's' : ''}${nConLinks ? '' : ' · sin enlaces'}</span>
          <span class="sh-rename" title="Renombrar esta temporada">✎</span>
          <span class="sh-extract" title="Sacar de aquí: vuelve a ser una serie independiente">⤺</span>
          <span class="sh-del" title="Eliminar esta temporada completa">🗑</span>`;
        /* ✎ renombrar la temporada (también con clic en el nombre) */
        const renameSeason = async () => {
          const r = await uiModal({
            icon: '🍿', title: 'Renombrar temporada', okLabel: 'Guardar',
            sub: `En «<b>${escapeHtml(s.t)}</b>» · ${epsS.length} cap${epsS.length > 1 ? 's' : ''}.`,
            fields: [{ key: 't', label: 'Nombre de la temporada', value: label, maxlength: 44, placeholder: 'Ej: Temporada 2 — La invasión' }],
          });
          if (!r || !r.t.trim() || r.t.trim() === label) return;
          s.seasons = s.seasons || {};
          s.seasons[se] = r.t.trim().slice(0, 44);
          save(); renderEpisodes();
          toast(`✎ Temporada renombrada → ${s.seasons[se]}`);
        };
        head.querySelector('.sh-name').addEventListener('click', renameSeason);
        head.querySelector('.sh-rename').addEventListener('click', renameSeason);
        /* ⤺ EXTRAER: vuelve a ser una serie independiente (deshacer un merge equivocado) */
        head.querySelector('.sh-extract').addEventListener('click', async () => {
          if (s.episodes.length === epsS.length) {
            return toast('Es la única temporada — ya es una serie por sí sola', true);
          }
          const r = await uiModal({
            icon: '⤺', title: 'Sacar temporada', okLabel: 'Sí, separarla',
            sub: `«<b>${escapeHtml(label)}</b>» (${epsS.length} caps) vuelve a aparecer como <b>serie independiente</b> en la columna, con sus enlaces y progreso intactos.<br>«${escapeHtml(s.t)}» se queda con el resto.`,
          });
          if (!r) return;
          unmergeSeason(s, se, epsS, label);
        });
        /* 🗑 eliminar TODA la temporada (ideal para grupos fantasma sin enlaces) */
        head.querySelector('.sh-del').addEventListener('click', async () => {
          const r = await uiModal({
            icon: '🗑', title: 'Eliminar temporada', okLabel: 'Eliminar temporada', danger: true,
            sub: `«<b>${escapeHtml(label)}</b>» — ${epsS.length} capítulo${epsS.length > 1 ? 's' : ''}.<br>${nConLinks ? `⚠ <b>${nConLinks} con enlace se perderán</b>.` : 'Todos están <b>sin enlace</b> — ideal para limpiar.'}`,
          });
          if (!r) return;
          const epActual = s.episodes.find(e => e.n === current.ep); // objeto, no número
          const prog = (state.progress || {})[s.id] || {};
          s.episodes = s.episodes.filter(e => (e.season || 1) !== se);
          /* renumerar 1..N conservando el progreso de los que quedan */
          const nuevoProg = {};
          s.episodes.forEach((e, i) => { if (prog[e.n]) nuevoProg[i + 1] = prog[e.n]; e.n = i + 1; });
          state.progress[s.id] = nuevoProg;
          if (s.seasons) delete s.seasons[se];
          if (current.seriesId === s.id) {
            current.ep = epActual && s.episodes.includes(epActual) ? epActual.n : null;
            if (current.ep == null) { els.nowPlaying.textContent = ''; clearAddressHash(); }
          }
          save(); renderEpisodes(); renderSeries(els.searchInput.value);
          toast(`🗑 «${label}» eliminada — quedan ${s.episodes.length} capítulos`);
        });
        els.episodesGrid.appendChild(head);
      }
    }
    const pr = ((state.progress || {})[s.id] || {})[ep.n];
    pendingResume = (pr && !pr.done && pr.t > 15) ? { sid: s.id, ep: ep.n, t: pr.t } : null;
    const cell = document.createElement('div');
    cell.dataset.epn = ep.n;
    cell.className = 'ep' + ' ' + epSourceClass(ep.url) + (current.ep === ep.n ? ' playing' : '')
      + (pr && pr.done ? ' watched' : '') + (ep.note ? ' has-note' : '') + (ep.ova ? ' is-ova' : '');
    if (ep.note) cell.title = '📝 ' + ep.note;
    const srcIcon = epSourceIcon(ep.url);
    /* capas premium: miniatura real + sello de calidad + indicador de retomar */
    const driveId = parseDriveId(ep.url || '');
    const thumbSrc = getEpThumb(s, ep) || (driveId ? driveThumbUrl(driveId, 320) : null);
    if (thumbSrc) cell.classList.add('has-thumb');
    const q = epQuality(ep);
    const resume = pr && !pr.done && pr.t > 20
      ? `<span class="ep-resume" title="Continuar donde lo dejaste">▶ ${fmt(pr.t)}</span>` : '';
    cell.innerHTML = (thumbSrc ? `<img class="ep-thumb" src="${thumbSrc}" alt="" loading="lazy" onerror="this.remove()">` : '')
      + `<span class="ep-src" title="${srcIcon.t}">${srcIcon.g}</span>`
      + `<span class="num">${ep.n}</span><span class="lbl">${escapeHtml(ep.t)}</span>`
      + resume
      + (q ? `<span class="ep-q ${q.cls}" title="Calidad detectada">${q.txt}</span>` : '')
      + (pr && !pr.done && pr.d ? `<div class="ep-progress"><i style="width:${Math.round(pr.t / pr.d * 100)}%"></i></div>` : '');

    if (editing) {
      cell.style.cursor = 'default';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'ep-url' + (ep.url ? ' has' : '');
      input.placeholder = 'URL directa (.mp4/.webm) o enlace de Google Drive…';
      input.value = ep.url;
      input.addEventListener('change', () => {
        ep.url = input.value.trim();
        save();
        if (ep.url) unmarkBroken(s.id, ep.n, true); // al reparar sale del historial
        input.classList.toggle('has', !!ep.url);
        toast(ep.url ? `✔ Enlace guardado — ${s.t} ep ${ep.n}` : 'Enlace eliminado');
        renderSeries(els.searchInput.value);
        if (current.ep === ep.n) loadEpisode(ep.n, false);
      });
      const del = document.createElement('button');
      del.className = 'ep-del';
      del.textContent = '×';
      del.title = 'Eliminar capítulo';
      del.addEventListener('click', ev => {
        ev.stopPropagation();
        if (s.episodes.length <= 1) return toast('La serie necesita al menos 1 capítulo', true);
        const idx = s.episodes.indexOf(ep);
        trash.push({ seriesId: s.id, index: idx, ep: { n: ep.n, t: ep.t, url: ep.url } });
        syncUndoBtn();
        s.episodes.splice(idx, 1);
        s.episodes.forEach((e, i) => e.n = i + 1);
        if (current.ep === ep.n) {
          current.ep = null;
          clearAddressHash();   /* la URL ya no debe apuntar al capítulo eliminado */
          els.nowPlaying.textContent = '';
          els.flagBtn.classList.add('hidden');
        }
        state.broken = (state.broken || []).filter(b => !(b.sid === s.id && b.ep === ep.n));
        save(); renderEpisodes(); renderSeries(els.searchInput.value);
        toast('Capítulo eliminado — pulsa «↩ Deshacer» para recuperarlo');
      });
      /* nota del capítulo */
      const noteBtn = document.createElement('button');
      noteBtn.className = 'ep-note' + (ep.note ? ' has' : '');
      noteBtn.textContent = '📝';
      noteBtn.title = ep.note ? 'Nota: ' + ep.note : 'Añadir nota';
      noteBtn.addEventListener('click', ev => {
        ev.stopPropagation();
        const nueva = prompt(`Nota para ${s.t} E${ep.n}:`, ep.note || '');
        if (nueva === null) return;
        ep.note = nueva.trim() || undefined;
        if (!ep.note) delete ep.note;
        save(); renderEpisodes();
        toast(ep.note ? '📝 Nota guardada' : 'Nota eliminada');
      });
      cell.append(input, noteBtn, del);
    } else {
      cell.addEventListener('click', () => loadEpisode(ep.n, true));
      /* doble clic → reproducir + fijar el mini-player para seguir navegando */
      cell.addEventListener('dblclick', ev => {
        ev.preventDefault();
        loadEpisode(ep.n, true);
        miniPinned = true;
        setMini(true);
        toast('📺 Mini-player fijado — navega libre, tu capítulo te sigue');
      });
      deferThumb(s, ep, cell);
      /* botón marcar visto / no visto */
      const wc = document.createElement('span');
      wc.className = 'ep-check' + (pr && pr.done ? ' done' : '');
      wc.title = pr && pr.done ? 'Marcar como NO visto' : 'Marcar como visto';
      wc.textContent = '✓';
      wc.addEventListener('click', ev => {
        ev.stopPropagation();
        state.progress[s.id] = state.progress[s.id] || {};
        const cur = state.progress[s.id][ep.n] || { t: 0, d: 0 };
        cur.done = !(cur.done === true);
        cur.at = Date.now();
        state.progress[s.id][ep.n] = cur;
        save(); renderEpisodes(); renderSeries(els.searchInput.value);
        toast(cur.done ? `✓ ${s.t} E${ep.n} visto` : `↺ E${ep.n} marcado no visto`);
      });
      cell.appendChild(wc);
      /* botón compartir por capítulo */
      const sh = document.createElement('span');
      sh.className = 'ep-share';
      sh.title = 'Compartir este capítulo';
      sh.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14"/></svg>';
      sh.addEventListener('click', ev => { ev.stopPropagation(); openShare(s.id, ep.n); });
      cell.appendChild(sh);
    }
    els.episodesGrid.appendChild(cell);
  }
}

/* ═══════════ Selección de serie ═══════════ */
function selectSeries(id) {
  current.seriesId = id;
  const s = getSeries(id);
  els.stageTitle.textContent = s.t;
  els.stageSub.textContent = [s.tag, s.jp].filter(Boolean).join(' · ');
  els.stageBadges.innerHTML = s.kind === 'pelicula'
    ? (`<span class="badge acid">${isOvaEntry(s) ? '🎌 OVA' : (s.anime ? '🎬 PELÍCULA ANIME' : '🎬 PELÍCULA')}</span>`)
    : `<span class="badge">📺 ANIME</span><span class="badge">${s.episodes.length} episodios</span>`
      + `<span class="badge acid">${s.episodes.filter(e => e.url).length} con enlace</span>`;
  /* texto del botón compartir adaptado al tipo */
  const shareLbl = els.shareBtn.querySelector('span');
  if (shareLbl) shareLbl.textContent = s.kind === 'pelicula'
    ? (isOvaEntry(s) ? 'Compartir OVA' : 'Compartir película')
    : 'Compartir anime';
  if (s.reminder) {
    els.stageBadges.innerHTML += `<span class="badge acid">🔔 ${escapeHtml(s.reminder.date)} — ${escapeHtml(s.reminder.note)}</span>`;
  }
  /* salir del modo canal si veníamos de TV */
  if (state.currentChannel) { state.currentChannel = null; save(); }
  destroyHls();
  if (s.tags && s.tags.length) {
    els.stageBadges.innerHTML += s.tags.map(t => `<span class="badge">🏷 ${escapeHtml(t)}</span>`).join('');
  }
  syncFavBtn();
  syncRemindBtn();
  renderSeries(els.searchInput.value);
  renderEpisodes();
  // auto-reproduce el primer episodio con enlace (o el 1)
  const first = s.episodes.find(e => e.url) || s.episodes[0];
  if (first) loadEpisode(first.n, true);
  document.querySelector('.stage').scrollTo({ top: 0, behavior: 'smooth' });
}

/* ═══════════ Carga instantánea de un capítulo ═══════════ */
function loadEpisode(epN, autoplayNow = true) {
  const s = getSeries(current.seriesId);
  if (!s) return;
  const ep = s.episodes.find(e => e.n === epN);
  if (!ep) return;
  current.ep = epN;
  /* salir de cualquier directo 📡 o flujo HLS anterior */
  if (state.currentChannel) { state.currentChannel = null; save(); }
  destroyHls();

  els.empty.classList.add('hidden');
  els.nowPlaying.textContent = `${s.t} · E${ep.n}`;
  document.title = `E${ep.n} · ${s.t} — X·STREAM`;
  els.shareBtn.classList.remove('hidden');
  syncDownloadBtn();
  els.flagBtn.classList.toggle('hidden', !ep.url);
  syncAddressBar();

  if (!ep.url) {
    attachSpanishSubs(null);
    exitDriveMode(); exitExtMode();
    els.video.removeAttribute('src');
    els.video.load();
    els.noUrl.classList.remove('hidden');
    els.bigPlay.classList.add('hidden');
    renderEpisodes();
    return;
  }
  els.noUrl.classList.add('hidden');

  /* ── Enlace de Google Drive → REPRODUCTOR PROPIO ──
     Intentamos leer el archivo directo (uc?export=download) en nuestro
     player nativo: mismos controles, PiP, Cast, velocidad, logo al pausar.
     Si Drive no lo deja (archivo grande con antivirus, cuota, etc.),
     caemos al iframe embebido de siempre.                            */
  /* ── Enlace de Google Drive → REPRODUCTOR PROPIO con reintentos ──
     Probamos en orden 3 formas del enlace directo:
       1) uc?export=download (clásico)
       2) drive.usercontent.google.com (evita la página del antivirus)
       3) el iframe embebido de siempre (último recurso)
     Mientras el directo funcione, tienes TODOS los controles + PiP
     + Cast a Smart TV + velocidad + logo de pausa.                */
  const driveId = parseDriveId(ep.url);
  if (driveId) {
    attachSpanishSubs(null);
    exitExtMode();
    const v = els.video;
    els.spinner.classList.remove('hidden');
    driveDirectTry = true;

    const CANDIDATE_URLS = [
      `https://drive.google.com/uc?export=download&confirm=1&id=${driveId}`,
      `https://drive.usercontent.google.com/download?id=${driveId}&export=download&confirm=t`,
      `https://drive.google.com/uc?export=download&id=${driveId}`,
    ];
    let urlIdx = 0, directOk = false, killTimer = null;

    const cleanupListeners = () => {
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('error', onErr);
      if (killTimer) { clearTimeout(killTimer); killTimer = null; }
    };
    const armKillTimer = () => {
      if (killTimer) clearTimeout(killTimer);
      killTimer = setTimeout(() => { if (!directOk) onErr(); }, 12000);
    };
    const tryNext = () => {
      if (urlIdx >= CANDIDATE_URLS.length) { fallbackToIframe(); return; }
      const u = CANDIDATE_URLS[urlIdx++];
      v.src = u;
      v.load();
      armKillTimer();
    };
    const onMeta = () => {
      cleanupListeners();
      directOk = true;
      driveDirectTry = false;
      els.spinner.classList.add('hidden');
      els.playerArea.classList.add('drive-direct');
      startDriveTracking(s.id, ep.n);
      els.nowPlaying.textContent += ' · DRIVE ▶';
      renderEpisodes();
      v.play().catch(() => toast('Pulsa play para iniciar (Drive directo)'));
    };
    const onErr = () => {
      if (directOk) return;
      if (killTimer) { clearTimeout(killTimer); killTimer = null; }
      toast(`🔁 Drive opción ${Math.min(urlIdx, CANDIDATE_URLS.length)} no respondió — probando la siguiente…`);
      tryNext();
    };
    const fallbackToIframe = () => {
      if (directOk) return;
      driveDirectTry = false;
      exitDriveMode();
      const vv = els.video;
      vv.pause(); vv.removeAttribute('src'); vv.load();
      startDriveTracking(s.id, ep.n);
      els.spinner.classList.add('hidden');
      els.playerArea.classList.add('drive-mode');
      els.driveFrame.src = drivePreviewUrl(driveId);
      els.nowPlaying.textContent += ' · DRIVE (integrado)';
      renderEpisodes();
    };

    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('error', onErr);
    tryNext();
    return;
  }

  /* ── Enlace de Streamtape → reproductor embebido oficial (iframe) ── */
  const stape = parseStape(ep.url);
  if (stape) {
    attachSpanishSubs(null); // Streamtape soporta subtítulos propios en su embed
    exitExtMode();
    startDriveTracking(s.id, ep.n); // cronómetro aproximado para progreso/stats
    const v = els.video;
    v.pause();
    v.removeAttribute('src');
    v.load();
    els.spinner.classList.add('hidden');
    els.playerArea.classList.add('drive-mode');
    const src = stapeEmbedUrl(stape.id);
    if (!els.driveFrame.src.startsWith(src)) els.driveFrame.src = src;
    els.nowPlaying.textContent += ' · STREAMTAPE';
    renderEpisodes();
    return;
  }
  exitDriveMode();

  /* ── Enlace externo no incrustable (megaup, mixdrop…) → overlay ── */
  if (!isDirectVideoUrl(ep.url)) {
    attachSpanishSubs(null);
    openExternalMode(s, ep);
    renderEpisodes();
    return;
  }
  exitExtMode();

  const v = els.video;
  /* reanudar donde te quedaste */
  const pr = ((state.progress || {})[s.id] || {})[ep.n];
  state.lastPlayed[s.id] = Date.now();
  save();
  if (!v.src.endsWith(ep.url)) {
    v.src = ep.url;
    v.load(); // carga inmediata
  }
  attachSpanishSubs(ep.sub); // 🇪🇸 subtítulos automáticos si la fuente los trae
  if (autoplayNow) {
    v.play().catch(() => toast('Pulsa play para iniciar (autoplay bloqueado)'));
  }
  renderEpisodes();
}

/* ═══════════ Player: UI de controles ═══════════ */
const ICON_PLAY = '<path d="M7 4.5v15l13-7.5z"/>';
const ICON_PAUSE = '<path d="M6 4h4v16H6zm8 0h4v16h-4z"/>';

function setPlayIcon() {
  const paused = els.video.paused || els.video.ended;
  els.playIcon.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
  els.playerArea.classList.toggle('paused', paused);
  // big-play visible solo si hay fuente cargada, pausada y sin overlays
  const overlayVisible = !els.empty.classList.contains('hidden') || !els.noUrl.classList.contains('hidden');
  const showBigPlay = paused && !!els.video.src && !overlayVisible;
  els.bigPlay.classList.toggle('hidden', !showBigPlay);
  /* 🏷 logo de la marca flotando en medio cuando está en pausa */
  const brand = els.pauseBrand;
  if (brand) {
    brand.classList.toggle('hidden', !(paused && !!els.video.src && !overlayVisible
      && !isDriveMode() && !els.playerArea.classList.contains('ext-mode')));
  }
  /* ⏱ al pausar: la UI aparece ~3.5s y luego se desvanece, dejando solo el logo */
  if (paused && els.video.src) flashUiControls(3500);
}

function togglePlay() {
  if (isDriveMode()) return; // en modo Drive el video se controla dentro del iframe
  if (!els.video.src) return toast('Elige un capítulo con enlace', true);
  els.video.paused ? els.video.play() : els.video.pause();
}

els.video.addEventListener('play', setPlayIcon);
els.video.addEventListener('pause', setPlayIcon);
els.video.addEventListener('ended', () => {
  setPlayIcon();
  if (state.autoplay && !isDriveMode()) {
    const s = getSeries(current.seriesId);
    const next = s && s.episodes.find(e => e.n === current.ep + 1);
    if (next && next.url) { toast(`▶ Siguiente: E${next.n}`); loadEpisode(next.n, true); }
  }
});
els.video.addEventListener('waiting', () => els.spinner.classList.remove('hidden'));
els.video.addEventListener('canplay', () => els.spinner.classList.add('hidden'));
els.video.addEventListener('playing', () => els.spinner.classList.add('hidden'));
els.video.addEventListener('error', () => {
  els.spinner.classList.add('hidden');
  if (driveDirectTry) return; /* intento Drive directo: su propio fallback gestiona el error */
  if (els.video.src) toast('⚠ El enlace no se pudo cargar. Verifica que sea una URL directa.', true);
});

els.video.addEventListener('timeupdate', () => { updateSeek(); trackPlayback(); });
els.video.addEventListener('loadedmetadata', () => {
  els.tDur.textContent = fmt(els.video.duration);
  updateSeek();
  /* reanudación pendiente */
  if (pendingResume && pendingResume.sid === current.seriesId && pendingResume.ep === current.ep && isFinite(els.video.duration)) {
    els.video.currentTime = Math.min(pendingResume.t, els.video.duration * 0.97);
    toast('▶ Retomando en ' + fmt(pendingResume.t));
  }
  pendingResume = null;
});
function updateSeek() {
  const v = els.video, d = v.duration;
  if (!isFinite(d) || !d) return;
  const p = (v.currentTime / d) * 100;
  els.seekFill.style.width = p + '%';
  els.seekThumb.style.left = p + '%';
  els.tCur.textContent = fmt(v.currentTime);
  try {
    if (v.buffered.length) {
      els.seekBuffer.style.width = (v.buffered.end(v.buffered.length - 1) / d) * 100 + '%';
    }
  } catch (e) {}
}

/* seek: click + drag (funciona en móvil: touch-action:none + preventDefault + pointercancel) */
let dragging = false;
function seekFromEvent(ev) {
  const rect = els.seekWrap.getBoundingClientRect();
  const x = Math.min(Math.max((ev.clientX - rect.left) / rect.width, 0), 1);
  const v = els.video;
  if (isFinite(v.duration)) v.currentTime = x * v.duration;
  if (!dragging) updateSeek();
}
els.seekWrap.addEventListener('pointerdown', ev => {
  ev.preventDefault();   /* evita que el navegador robe el gesto como scroll */
  try { els.seekWrap.setPointerCapture(ev.pointerId); } catch (e) { }
  dragging = true;
  els.seekWrap.classList.add('dragging');
  seekFromEvent(ev);
});
els.seekWrap.addEventListener('pointermove', ev => { if (dragging) seekFromEvent(ev); });
els.seekWrap.addEventListener('pointerup', () => { dragging = false; els.seekWrap.classList.remove('dragging'); });
els.seekWrap.addEventListener('pointercancel', () => { dragging = false; els.seekWrap.classList.remove('dragging'); });

/* doble-toque: −10s a la izquierda / +10s a la derecha (estilo YouTube) */
let lastTapAt = 0, lastTapX = 0;
els.playerArea.addEventListener('pointerup', ev => {
  if (ev.target.closest('.controls') || ev.target.closest('.big-play') || ev.target.closest('.mini-x') || ev.target.closest('.mini-grip')) return;
  if (isDriveMode()) return;
  const now = Date.now();
  const rect = els.playerArea.getBoundingClientRect();
  const fx = (ev.clientX - rect.left) / rect.width;
  if (now - lastTapAt < 320 && Math.abs(fx - lastTapX) < 0.3) {
    if (fx < 0.4 && els.video.src) { els.video.currentTime = Math.max(0, els.video.currentTime - 10); popGesture(els.gestL); }
    else if (fx > 0.6 && els.video.src) { els.video.currentTime = Math.min(els.video.duration || 0, els.video.currentTime + 10); popGesture(els.gestR); }
    lastTapAt = 0;
    return;
  }
  lastTapAt = now; lastTapX = fx;
});

els.playBtn.addEventListener('click', togglePlay);
els.bigPlay.addEventListener('click', togglePlay);
els.video.addEventListener('click', togglePlay);
/* tocar el logo de pausa también reanuda */
els.pauseBrand = els.pauseBrand || $('pauseBrand');
if (els.pauseBrand) {
  els.pauseBrand.style.pointerEvents = 'auto';
  els.pauseBrand.style.cursor = 'pointer';
  els.pauseBrand.addEventListener('click', togglePlay);
}

/* prev/next */
els.prevEp.addEventListener('click', () => { if (current.ep > 1) loadEpisode(current.ep - 1, true); });
els.nextEp.addEventListener('click', () => {
  const s = getSeries(current.seriesId);
  if (s && current.ep < s.episodes.length) loadEpisode(current.ep + 1, true);
});

/* volumen */
els.volume.addEventListener('input', () => {
  els.video.volume = +els.volume.value;
  els.video.muted = +els.volume.value === 0;
  updateVolIcon();
});
els.muteBtn.addEventListener('click', () => { els.video.muted = !els.video.muted; updateVolIcon(); });
els.video.addEventListener('volumechange', updateVolIcon);
function updateVolIcon() {
  const v = els.video;
  document.getElementById('volIcon').innerHTML = (v.muted || v.volume === 0)
    ? '<path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.7-2.7 1.4 1.4-2.7 2.7 2.7 2.7-1.4 1.4-2.7-2.7-2.7 2.7-1.4-1.4 2.7-2.7-2.7-2.7 1.4-1.4z"/>'
    : '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/>';
}

/* velocidad */
els.speed.addEventListener('change', () => { els.video.playbackRate = +els.speed.value; toast(`Velocidad ${els.speed.value}×`); });

/* autoplay toggle */
function syncAutoplayBtn() { els.autoplayBtn.classList.toggle('on', state.autoplay); }
els.autoplayBtn.addEventListener('click', () => {
  state.autoplay = !state.autoplay; save(); syncAutoplayBtn();
  toast('Autoplay ' + (state.autoplay ? 'activado' : 'desactivado'));
});

/* PiP */
els.pipBtn.addEventListener('click', async () => {
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else if (els.video.src) await els.video.requestPictureInPicture();
  } catch (e) { toast('PiP no disponible', true); }
});

/* fullscreen */
els.fsBtn.addEventListener('click', toggleFullscreen);
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else els.playerArea.requestFullscreen?.();
}
document.addEventListener('fullscreenchange', () => {
  els.playerArea.classList.toggle('fullscreen', !!document.fullscreenElement);
});

/* doble click / tap zonal: rewind-forward + fullscreen */
els.playerArea.addEventListener('dblclick', ev => {
  if (ev.target.closest('.controls') || ev.target.closest('.big-play')) return;
  const rect = els.playerArea.getBoundingClientRect();
  const x = (ev.clientX - rect.left) / rect.width;
  if (x < 0.35) { els.video.currentTime = Math.max(0, els.video.currentTime - 10); popGesture(els.gestL); }
  else if (x > 0.65) { els.video.currentTime = Math.min(els.video.duration || 0, els.video.currentTime + 10); popGesture(els.gestR); }
  else toggleFullscreen();
});
function popGesture(el) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }

/* ocultar controles con tiempo en fullscreen */
let hideTimer;
function flashUiControls(ms = 2600) {
  els.playerArea.classList.add('show-ui');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => els.playerArea.classList.remove('show-ui'), ms);
}
els.playerArea.addEventListener('mousemove', () => flashUiControls());
els.playerArea.addEventListener('pointerdown', () => flashUiControls()); /* móvil: tocar la pantalla muestra la UI un momento */

/* ═══════════ Teclado ═══════════ */
document.addEventListener('keydown', ev => {
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
    if (ev.key === 'Escape') document.activeElement.blur();
    return;
  }
  const v = els.video;
  switch (ev.key.toLowerCase()) {
    case ' ': case 'k': ev.preventDefault(); togglePlay(); break;
    case 'arrowright': case 'l': v.currentTime += 10; popGesture(els.gestR); break;
    case 'arrowleft': case 'j': v.currentTime -= 10; popGesture(els.gestL); break;
    case 'arrowup': ev.preventDefault(); v.volume = Math.min(1, v.volume + 0.1); els.volume.value = v.volume; break;
    case 'arrowdown': ev.preventDefault(); v.volume = Math.max(0, v.volume - 0.1); els.volume.value = v.volume; break;
    case 'f': toggleFullscreen(); break;
    case 'm': v.muted = !v.muted; break;
    case 'n': els.nextEp.click(); break;
    case 'p': els.prevEp.click(); break;
    case '/': ev.preventDefault(); expandSearch(); break;
  }
});

/* ═══════════ Búsqueda ═══════════ */
els.searchInput.addEventListener('input', () => renderSeries(els.searchInput.value));

/* ═══════════ Compartir capítulos ═══════════
   Cada capítulo tiene un enlace único: index.html#s=<serie>&e=<n>
   El enlace incrusta el título y la URL del video, de modo que abre
   el capítulo exacto aunque la otra persona nunca haya usado la app. */

/* ═══════════ URLs limpias y amigables ═══════════
   En lugar de #s=id&e=5&t=Título&u=http://video-largo.mp4
   ahora:  #/anime/naruto/5   #/pelicula/akira   #/tv/espn
   Si renombras el título, la URL se reemplaza al instante.   */
const slugify = t => String(t || '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'video';

function buildShareUrl(s, ep) {
  const base = location.href.split('#')[0];
  const slug = slugify(s.t);
  if (s.kind === 'pelicula') return `${base}#/pelicula/${slug}`;
  return `${base}#/anime/${slug}/${ep.n}`;
}
function buildChannelUrl(ch) {
  return `${location.href.split('#')[0]}#/tv/${slugify(ch.name)}`;
}

/* redes sociales destino */
const SHARE_NETS = [
  { id: 'whatsapp', name: 'WhatsApp', c: '#25D366',
    url: (txt, u) => `https://wa.me/?text=${encodeURIComponent(txt + '\n' + u)}` },
  { id: 'telegram', name: 'Telegram', c: '#229ED9',
    url: (txt, u) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(txt)}` },
  { id: 'facebook', name: 'Facebook', c: '#1877F2',
    url: (txt, u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { id: 'x',        name: 'X / Twitter', c: '#111111',
    url: (txt, u) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(txt + '\n' + u)}` },
  { id: 'email',    name: 'Email', c: '#7c3aed',
    url: (txt, u) => `mailto:?subject=${encodeURIComponent(txt)}&body=${encodeURIComponent(u)}` },
];

let shareCtx = null; // { s, ep, url, msg }

function openShare(seriesId, epN) {
  const s = getSeries(seriesId);
  const ep = s && s.episodes.find(e => e.n === epN);
  if (!s || !ep) return;
  const url = buildShareUrl(s, ep);
  shareCtx = { s, ep, url, msg: `▶ ${s.t} — Capítulo ${ep.n} · míralo en X·STREAM` };

  els.shareTitle.textContent = `${s.t} · Capítulo ${ep.n}`;
  els.shareUrl.value = url;

  /* botones de redes */
  els.shareGrid.innerHTML = '';
  for (const net of SHARE_NETS) {
    const b = document.createElement('button');
    b.className = 'share-net';
    b.style.background = net.c;
    b.textContent = net.name;
    b.addEventListener('click', () => {
      window.open(net.url(shareCtx.msg, shareCtx.url), '_blank', 'noopener,width=640,height=520');
    });
    els.shareGrid.appendChild(b);
  }
  /* botón "más apps" con Web Share API (abre el menú nativo del teléfono) */
  const more = document.createElement('button');
  more.className = 'share-net';
  more.style.background = 'var(--panel2)';
  more.style.color = 'var(--ink)';
  more.style.border = '1px solid var(--line)';
  more.textContent = navigator.share ? '＋ Más apps' : '＋ Copiar';
  more.addEventListener('click', async () => {
    if (navigator.share) {
      try { await navigator.share({ title: shareCtx.msg, text: shareCtx.msg, url: shareCtx.url }); }
      catch (e) { /* cancelado */ }
    } else {
      copyShareLink();
    }
  });
  els.shareGrid.appendChild(more);

  els.modalShare.classList.remove('hidden');
}

function copyShareLink() {
  if (!shareCtx) return;
  navigator.clipboard.writeText(shareCtx.url)
    .then(() => toast('🔗 Enlace copiado — pégalo donde quieras'))
    .catch(() => { els.shareUrl.select(); document.execCommand('copy'); toast('🔗 Enlace copiado'); });
}

els.copyShareUrl.addEventListener('click', copyShareLink);
els.closeShare.addEventListener('click', () => els.modalShare.classList.add('hidden'));
els.modalShare.addEventListener('click', ev => { if (ev.target === els.modalShare) els.modalShare.classList.add('hidden'); });
els.shareBtn.addEventListener('click', () => {
  if (current.seriesId && current.ep) openShare(current.seriesId, current.ep);
});

/* ═══════════ ⬇ Descarga directa del video original ═══════════
   💰 MONETIZACIÓN: todos los enlaces de descarga pasan por ShrtFly
   (tu cuenta acorta y genera ingresos por cada redirección).
   La petición es 1 sola vez por URL gracias al caché en
   localStorage — el usuario no nota nada tras el primer clic.    */
const SHRTFLY_API = '3051314a9f62cb2caeca8b7ec9c60f1b';
const SHRTFLY_EP = 'https://shrtfly.com/api';
const _shortCache = (() => {
  try { return JSON.parse(localStorage.getItem('xstream-shorturls') || '{}'); } catch (e) { return {}; }
})();
function _saveShortCache() {
  try { localStorage.setItem('xstream-shorturls', JSON.stringify(_shortCache)); } catch (e) { }
}
async function monetizeUrl(u) {
  /* si ya la tenemos cortada, la devolvemos al instante (0 red) */
  if (_shortCache[u]) return _shortCache[u];
  try {
    const url = `${SHRTFLY_EP}?api=${SHRTFLY_API}&url=${encodeURIComponent(u)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    const short = (j && j.result && j.result.shorten_url) || null;
    if (short && /^https?:\/\//i.test(short)) {
      /* guardo en memoria y en localStorage para siempre */
      _shortCache[u] = short;
      _saveShortCache();
      return short;
    }
  } catch (e) { /* falló ShrtFly: caemos al enlace original sin cortar */ }
  return u;
}

function syncDownloadBtn() {
  const s = getSeries(current.seriesId);
  const ep = s && current.ep != null && s.episodes.find(e => e.n === current.ep);
  const ok = !!(s && ep && ep.url);
  els.downloadBtn.classList.toggle('hidden', !ok);
  if (ok) els.downloadLbl.textContent = s.kind === 'pelicula'
    ? (isOvaEntry(s) ? 'Descargar OVA' : 'Descargar película')
    : 'Descargar capítulo';
}

/* ═══════════ ⬇ Descarga con pestaña de espera ═══════════
   Los navegadores BLOQUEAN las pestañas que se abren "tarde" (varios
   segundos después del clic, como pasaba con el ticket de Streamtape).
   Por eso la pestaña se abre EN EL MOMENTO del clic con una página de
   espera de marca; cuando el enlace real está listo, ESA misma pestaña
   navega sola a la descarga — eso nunca se bloquea.
   La página de espera es también el hogar natural de la publicidad.   */

/* 💰 PEGA AQUÍ TU CÓDIGO DE PUBLICIDAD cuando lo tengas (banner/script
   de tu ad network). Aparecerá dentro de la pestaña de espera durante
   la cuenta atrás; al terminar, desaparece y la descarga se abre sola. */
const AD_SNIPPET = '';

function buildWaitPage(title, secs) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>X·STREAM — Preparando descarga</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;background:#0a0a0f;color:#f2f2f7;font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:92vh;text-align:center;padding:20px}
  .logo{width:64px;height:64px;border-radius:18px;background:#d8ff3e;color:#111;font-size:38px;font-weight:900;display:flex;align-items:center;justify-content:center;margin-bottom:18px}
  h1{font-size:20px;margin:0 0 6px}
  p{color:#8a8aa3;font-size:14px;margin:4px 0}
  .spin{width:42px;height:42px;border:4px solid #23233a;border-top-color:#d8ff3e;border-radius:50%;animation:sp 1s linear infinite;margin:20px auto}
  @keyframes sp{to{transform:rotate(360deg)}}
  .cd{font-size:36px;font-weight:900;color:#d8ff3e;margin-top:8px;font-family:'Courier New',monospace}
  .ad{margin:26px auto 0;max-width:728px;min-height:90px;width:92%;border:1px dashed #23233a;border-radius:12px;overflow:hidden${AD_SNIPPET ? '' : ';display:none'}}
</style></head><body>
<div class="logo">X</div>
<h1>⏳ Preparando tu descarga…</h1>
<p>${String(title || '').replace(/[<>&"]/g, '')}</p>
<div class="spin"></div>
<div class="cd" id="cd">${secs || ''}</div>
<p>El enlace se abrirá automáticamente en esta misma pestaña — no la cierres.</p>
<div class="ad">${AD_SNIPPET}</div>
</body></html>`;
}

/* abre la pestaña DENTRO del clic (el navegador no la bloquea) */
function openWaitTab(title, secs) {
  const w = window.open('', '_blank');
  if (!w) return null;
  try { w.document.write(buildWaitPage(title, secs)); w.document.close(); } catch (e) { }
  return w;
}
function waitTabTick(w, i) {
  try { const cd = w && w.document.getElementById('cd'); if (cd) cd.textContent = i; } catch (e) { }
}

/* si ni siquiera la pestaña inmediata pudo abrirse, entrega el enlace a mano */
async function handLinkToUser(u, label) {
  try { navigator.clipboard.writeText(u).catch(() => { }); } catch (e) { }
  await uiModal({
    icon: '⬇', title: 'Tu enlace de descarga está listo', okLabel: 'Entendido',
    sub: `El navegador bloqueó la ventana automática, así que aquí lo tienes:<br>está <b>copiado en tu portapapeles</b> — también puedes mantener pulsado el enlace y elegir «Abrir».`,
    fields: [{ key: 'u', label: label || 'Enlace de descarga', value: u }],
  });
}

/* cierre del flujo: redirige la pestaña de espera o entrega el enlace */
async function finishDownload(w, u, label) {
  const finalUrl = await monetizeUrl(u);
  if (w && !w.closed) { try { w.location.href = finalUrl; return true; } catch (e) { } }
  handLinkToUser(finalUrl, label);
  return false;
}

async function openDownload(u) {
  const a = document.createElement('a');
  a.href = await monetizeUrl(u);
  a.target = '_blank';
  a.rel = 'noopener';
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

let dlBusy = false;
els.downloadBtn.addEventListener('click', async () => {
  const s = getSeries(current.seriesId);
  const ep = s && s.episodes.find(e => e.n === current.ep);
  if (!s || !ep || !ep.url) return toast('Este capítulo no tiene enlace', true);
  if (dlBusy) return;
  const url = ep.url;

  /* Google Drive → su URL oficial de descarga (instantánea, sin espera) */
  const dId = parseDriveId(url);
  if (dId) return openDownload(`https://drive.google.com/uc?export=download&id=${dId}`);

  /* Streamtape → ticket oficial de la API (la API obliga a esperar ~5s) */
  const st = parseStape(url);
  if (st) {
    const pub = `https://streamtape.com/v/${st.id}`;
    if (!state.stapeKey) return openDownload(pub);
    dlBusy = true;
    /* pestaña abierta YA, con el clic fresco: imposible que la bloqueen */
    const w = openWaitTab(`${s.t} · ${ep.t || 'E' + ep.n}`, null);
    try {
      toast('⏳ Generando enlace de descarga…');
      const tk = await stapeApi('file/dlticket', { file: st.id });
      const espera = Math.max(3, Math.min(15, tk.wait_time || 5));
      for (let i = espera; i > 0; i--) {
        toast(`⏳ Enlace listo en ${i}s…`);
        waitTabTick(w, i);
        await new Promise(r => setTimeout(r, 1000));
      }
      const dl = await stapeApi('file/dl', { file: st.id, ticket: tk.ticket });
      if (dl && dl.url) {
        finishDownload(w, dl.url, 'Descarga directa de Streamtape');
        toast('⬇ Descarga abierta en la pestaña nueva');
        return;
      }
      throw new Error('la API no devolvió enlace');
    } catch (e) {
      /* la API falló → la pestaña de espera te lleva a la página oficial */
      if (w && !w.closed) { try { w.location.href = pub; } catch (e2) { } }
      else openDownload(pub);
      toast('⚠ Descarga directa no disponible — abro la página oficial del video', true);
    }
    finally { dlBusy = false; }
    return;
  }

  /* directo (archive.org, mp4, webm…): el archivo tal cual */
  openDownload(url);
});

/* limpia la URL (hash) cuando ya no corresponde al contenido activo */
function clearAddressHash() {
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { }
}

/* ── Abrir un enlace compartido (soporta formato nuevo limpio y clásico) ── */
function openFromHash() {
  const h = location.hash.replace(/^#\/?/, '');
  if (!h) return false;
  let p = null;
  try { p = new URLSearchParams(h); } catch (e) { }
  const esClasico = p && p.has('s') && p.has('e');
  /* ── Formato limpio:  #/anime/<slug>/<n> · #/pelicula/<slug> · #/tv/<slug> ── */
  if (!esClasico) {
    const parts = h.split('/').filter(Boolean).map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } });
    if (!parts.length) return false;

    /* 📡 canal de TV */
    if (parts[0] === 'tv') {
      const slug = parts[1] || '';
      const ch = (state.channels || []).find(c => slugify(c.name) === slug || c.id === slug);
      if (!ch) { clearAddressHash(); return false; }
      setTab('tv');
      playChannel(ch);
      toast('📡 Canal cargado desde enlace');
      return true;
    }

    const kind = parts[0] === 'pelicula' ? 'pelicula' : 'anime';
    const slug = kind === 'pelicula' ? parts[1] : parts[1];
    const epN = kind === 'pelicula' ? 1 : parseInt(parts[2] || '1', 10) || 1;
    if (!slug) return false;

    let s = state.series.find(x => slugify(x.t) === slug);
    if (!s) {
      /* si la tenías en la papelera, no resucitarla */
      if ((state.trash || []).some(t => slugify(t.series.t) === slug)) {
        clearAddressHash();
        return false;
      }
      /* crearla al vuelo como antes (por si el otro usuario no la tiene aún) */
      s = {
        id: 'shared-' + slug,
        t: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        jp: '▶', tag: 'Compartida contigo', g: 5, kind: kind === 'pelicula' ? 'pelicula' : 'serie', via: 'shared',
        episodes: [{ n: epN, t: kind === 'pelicula' ? 'Ver' : `Capítulo ${epN}`, url: '' }],
      };
      state.series.push(s);
      save();
    }
    selectSeries(s.id);
    loadEpisode(epN, true);
    renderSeries(els.searchInput.value);
    toast('▶ Enlace compartido cargado');
    return true;
  }

  /* ── Formato clásico s/e/t/u (el que usaba la app antes) ── */
  const sid = p.get('s'), epN = parseInt(p.get('e'), 10);
  if (!sid || !epN) return false;

  /* si está en la papelera, el usuario la eliminó deliberadamente: no resucitarla */
  if ((state.trash || []).some(t => t.series.id === sid)) {
    clearAddressHash();
    return false;
  }

  let s = getSeries(sid);
  if (!s) {
    /* serie no existe localmente → se crea al vuelo con el capítulo compartido */
    s = {
      id: sid,
      t: p.get('t') || 'Serie compartida',
      jp: '▶', tag: 'Compartida contigo', g: 5, via: 'shared',
      episodes: [{ n: epN, t: `Capítulo ${epN}`, url: p.get('u') || '' }],
    };
    state.series.push(s);
    save();
  }
  selectSeries(sid);
  loadEpisode(epN, true);
  renderSeries(els.searchInput.value);
  toast('▶ Capítulo compartido cargado');
  return true;
}
window.addEventListener('hashchange', openFromHash);

/* mantiene la URL del navegador siempre compartible */
function syncAddressBar() {
  const s = getSeries(current.seriesId);
  const ep = s && s.episodes.find(e => e.n === current.ep);
  if (!s || !ep) return;
  try { history.replaceState(null, '', buildShareUrl(s, ep)); } catch (e) { /* file:// antiguo */ }
}

/* ═══════════ Importador de carpetas de Google Drive ═══════════
   Pega el enlace de una carpeta pública → se crea la serie
   automáticamente con el nombre de la carpeta y cada video
   queda asignado a su número de capítulo.                        */

const FOLDER_RE = /drive\.google\.com\/(?:drive\/)?(?:u\/\d+\/)?folders\/([\w-]{15,})/i;
function parseDriveFolderId(url) {
  if (!url) return null;
  const m = url.match(FOLDER_RE) || url.match(/[?&]id=([\w-]{15,})/);
  return m ? m[1] : null;
}

const VIDEO_EXT = /\.(mp4|m4v|webm|ogv|ogg|mkv|avi|mov|wmv|ts)$/i;

/* nombre legible del capítulo a partir del nombre del archivo */
function cleanEpTitle(name, fallback) {
  let t = name.replace(VIDEO_EXT, '');
  t = t.replace(/\b(1080p|720p|480p|x264|x265|h\.?264|hevc|bluray|brrip|web[- ]?dl|webrip|hdrip|subtitulado|latino|castellano|dual|audio latino)\b/gi, '');
  t = t.replace(/[\._]+/g, ' ').replace(/\s{2,}/g, ' ').replace(/^\s*[-–—|]+\s*/, '').replace(/[-–—|]+\s*$/, '').trim();
  return t || fallback;
}

function decodeHTMLEntities(s) {
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ── Vía 1 (sin clave): leer la vista embebida de la carpeta mediante proxies CORS ──
   Los proxies gratuitos se saturan a veces (502/429) → 2 intentos por cada uno.     */
const DRIVE_PROXIES = [
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  u => `https://api.cors.lol/?url=${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, // envuelve en JSON
];
async function fetchTextViaProxies(url) {
  const problemas = [];
  for (const wrap of DRIVE_PROXIES) {
    for (let intento = 1; intento <= 2; intento++) {
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 20000);
        const r = await fetch(wrap(url), { signal: ctrl.signal });
        clearTimeout(to);
        if (!r.ok) {
          problemas.push('HTTP ' + r.status);
          await new Promise(s => setTimeout(s, 1500)); // respiro entre reintentos
          continue;
        }
        let txt = await r.text();
        /* allorigins /get devuelve JSON {contents:"…"} */
        if (txt.trim().startsWith('{')) {
          try { const j = JSON.parse(txt); if (j && j.contents) txt = j.contents; } catch (e) { }
        }
        if (txt && txt.length > 200) return txt;
        problemas.push('respuesta vacía');
      } catch (e) {
        problemas.push(e.name === 'AbortError' ? 'timeout' : 'sin red');
      }
    }
  }
  throw new Error(
    'Los lectores públicos están saturados ahora mismo ('
    + [...new Set(problemas)].join(', ')
    + ').\n\nInténtalo de nuevo en un minuto — suele pasar.\n'
    + 'Para que NUNCA falle: usa la API key gratuita\nen «⚙ Avanzado» (Drive API de Google Cloud).'
  );
}

function parseFolderHtml(html) {
  const files = [], subfolders = [], seen = new Set();
  /* entradas tipo embeddedfolderview: id="entry-ID" … flip-entry-title>NOMBRE<
     las subcarpetas enlazan a /drive/folders/ID o embeddedfolderview?id=ID   */
  const blockRe = /id="entry-([\w-]{10,})"([\s\S]{0,900}?)(?=id="entry-|$)/g;
  let m;
  while ((m = blockRe.exec(html))) {
    const id = m[1];
    const t = m[2].match(/flip-entry-title[^>]*>([^<]+)</i);
    if (!t || seen.has(id)) continue;
    seen.add(id);
    const name = decodeHTMLEntities(t[1]).trim();
    const sub = m[2].match(/\/drive\/folders\/([\w-]{15,})/) || m[2].match(/embeddedfolderview\?id=([\w-]{15,})/);
    if (sub) subfolders.push({ id: sub[1], name });
    else files.push({ id, name });
  }
  /* respaldo: cualquier /file/d/ID con título cercano */
  if (!files.length && !subfolders.length) {
    const looseRe = /\/file\/d\/([\w-]{15,})[\s\S]{0,400}?flip-entry-title[^>]*>([^<]+)</gi;
    while ((m = looseRe.exec(html))) {
      if (!seen.has(m[1])) { seen.add(m[1]); files.push({ id: m[1], name: decodeHTMLEntities(m[2]).trim() }); }
    }
  }
  const tm = html.match(/<title>([\s\S]*?)<\/title>/i);
  let folderName = tm ? decodeHTMLEntities(tm[1]).replace(/\s*[-–—]\s*Google (Drive|Docs)\s*$/i, '').trim() : null;
  if (!folderName || /^google drive$/i.test(folderName)) folderName = null;
  return { folderName, files, subfolders };
}

/* ── Vía 2 (con API key, 100% fiable): Drive API v3 ── */
const FOLDER_MIME = 'application/vnd.google-apps.folder';
async function listFolderViaApi(folderId, key) {
  const nameRes = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=name&key=${encodeURIComponent(key)}`);
  if (!nameRes.ok) throw new Error('API: ' + nameRes.status + ' (revisa la clave y que Drive API esté habilitada)');
  const folderName = (await nameRes.json()).name;
  const q = `'${folderId}' in parents and trashed = false`;
  const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&pageSize=1000&orderBy=name&key=${encodeURIComponent(key)}`);
  if (!listRes.ok) throw new Error('API: ' + listRes.status);
  const data = await listRes.json();
  const files = [], subfolders = [];
  for (const f of data.files || []) {
    if (f.mimeType === FOLDER_MIME) subfolders.push({ id: f.id, name: f.name });
    else files.push({ id: f.id, name: f.name });
  }
  return { folderName, files, subfolders };
}

/* nombre de un archivo suelto de Drive (con API key, o leyendo el <title> de su página) */
async function getDriveFileName(fileId, key) {
  if (key) {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name&key=${encodeURIComponent(key)}`);
    if (r.ok) { const j = await r.json(); if (j.name) return j.name; }
  }
  const html = await fetchTextViaProxies(`https://drive.google.com/file/d/${fileId}/view`);
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (m) {
    const name = decodeHTMLEntities(m[1]).replace(/\s*[-–—]\s*Google (Drive|Docs)\s*$/i, '').trim();
    if (name && !/^google drive$/i.test(name)) return name;
  }
  return null;
}

/* recorrido RECURSIVO de carpetas (raíz + subcarpetas, máx 3 niveles) */
async function collectDriveDeep(folderId, key, depth = 0, seen = new Set()) {
  if (seen.has(folderId) || depth > 3) return [];
  seen.add(folderId);
  const result = key
    ? await listFolderViaApi(folderId, key)
    : parseFolderHtml(await fetchTextViaProxies(`https://drive.google.com/embeddedfolderview?id=${folderId}#list`));
  const groups = [{ name: result.folderName, files: result.files, folderId }];
  for (const sub of result.subfolders || []) {
    setDriveStatus(`🔍 Subcarpeta ${depth + 1}: «${sub.name}»…`);
    groups.push(...await collectDriveDeep(sub.id, key, depth + 1, seen));
  }
  return groups;
}

/* ═══════════ ☁ Streamtape — tu cuenta completa vía API ═══════════
   listfolder recursivo → cada carpeta con videos = SERIE (nombre de la carpeta);
   cada video suelto = PELÍCULA. La reproducción usa el embed oficial
   (streamtape.com/e/ID) dentro del iframe del reproductor.              */
const STAPE_BASE = 'https://api.streamtape.com';
const STAPE_LOGIN_DEFAULT = '144642b260f55c49be41';
const STAPE_LINK_RE = /streamtape\.(?:com|to)\/([ev])\/([\w-]+)(?:\/([^?#]+))?/i;
const stapeEmbedUrl = id => `https://streamtape.com/e/${id}`;

function parseStape(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(STAPE_LINK_RE);
  if (!m) return null;
  let name = null;
  try { name = m[3] ? decodeURIComponent(m[3]) : null; } catch (e) { }
  return { kind: m[1].toLowerCase(), id: m[2], name };
}

/* cliente de la API oficial: JSON {status, msg, result}
   — si el navegador bloquea por CORS, cae a los proxies CORS de la app */
async function stapeApi(endpoint, params = {}) {
  const login = (state.stapeLogin || STAPE_LOGIN_DEFAULT).trim();
  const key = (state.stapeKey || els.stKey.value || '').trim();
  if (!key) throw new Error('Falta tu API Key de Streamtape.\nLa encuentras en streamtape.com → Panel → Account Settings.');
  const qs = new URLSearchParams({ login, key, ...params });
  const url = `${STAPE_BASE}/${endpoint}?${qs}`;
  let data = null;
  try {
    const r = await fetch(url);
    data = await r.json();
  } catch (e) {
    const txt = await fetchTextViaProxies(url); // respaldo: proxies CORS (ya desenvuelven la respuesta)
    data = JSON.parse(txt);
  }
  if (!data || typeof data.status === 'undefined') throw new Error('Streamtape no respondió JSON válido');
  if (data.status !== 200) throw new Error(`Streamtape (${data.status}): ${data.msg || 'error'}`);
  return data.result;
}

/* escaneo recursivo de carpetas (raíz incluida, máx 3 niveles, tope 800 videos) */
async function collectStapeDeep(folderId, depth = 0, seen = new Set(), budget = { n: 0 }) {
  const seenKey = folderId || '__root__';
  if (seen.has(seenKey) || depth > 3 || budget.n >= 800) return [];
  seen.add(seenKey);
  const result = await stapeApi('file/listfolder', folderId ? { folder: folderId } : {});
  const files = (result.files || [])
    .filter(f => VIDEO_EXT.test(f.name || '') && f.linkid)
    .map(f => ({ name: f.name, key: f.linkid, url: stapeEmbedUrl(f.linkid) }));
  budget.n += files.length;
  const groups = [{ name: null, files, folderId: folderId || 'root' }];
  for (const sub of result.folders || []) {
    setDriveStatus(`🔍 Streamtape · carpeta: «${sub.name}»…`);
    const subGroups = await collectStapeDeep(sub.id, depth + 1, seen, budget);
    if (subGroups.length && subGroups[0].folderId === sub.id) subGroups[0].name = sub.name;
    groups.push(...subGroups);
  }
  return groups;
}

/* ☁ un clic → verifica la cuenta, escanea todas las carpetas y crea todo */
async function importStreamtapeAll() {
  if (!needAdmin()) return;
  const login = els.stLogin.value.trim() || STAPE_LOGIN_DEFAULT;
  const key = els.stKey.value.trim();
  if (!key) {
    setDriveStatus('⚠ Pega tu API Key de Streamtape.\nEstá en streamtape.com → Panel → Account Settings.', 'err');
    els.stKey.focus();
    return;
  }
  state.stapeLogin = login;
  state.stapeKey = key;
  els.stImportBtn.disabled = true;
  try {
    setDriveStatus('☁ Conectando con tu cuenta de Streamtape…');
    const info = await stapeApi('account/info');
    save(); // login+key ya válidos → se guardan
    setDriveStatus(`✔ Cuenta: ${info.email || login}\n📂 Explorando todas tus carpetas…`, 'ok');

    const budget = { n: 0 };
    const groups = await collectStapeDeep('', 0, new Set(), budget);
    if (!groups.some(g => g.files.length)) {
      throw new Error('No encontré videos en tu cuenta\n(o están a más de 3 niveles de profundidad).');
    }

    let nSeries = 0, nMovies = 0, nFolders = 0, firstId = null;
    const keepIds = new Set(); // todo lo que SÍ existe ahora en tu cuenta
    for (const g of groups) {
      if (!g.files.length) continue;
      nFolders++;
      /* la raíz (sin nombre de carpeta) se trata como películas sueltas;
         una carpeta con nombre se auto-detecta: serie si sus archivos lo parecen */
      const { items } = buildImportedItems(g.name, g.files, g.name ? 'auto' : 'peliculas');
      const r = addImportedItems(items, 'stape-' + g.folderId, 'Streamtape', 3);
      r.ids.forEach(id => keepIds.add(id));
      if (!firstId) firstId = r.firstId;
      nSeries += r.nSeries; nMovies += r.nMovies;
    }

    /* 🔁 Sincronización real: lo que YA NO existe en tu cuenta de Streamtape
       también desaparece de la app (series y películas importadas por la API).
       Los enlaces pegados a mano o de Drive/Mega nunca se tocan.           */
    const scanCompleto = budget.n < 800; // si el escaneo se cortó por el tope, no se poda nada
    const podados = scanCompleto
      ? state.series.filter(s => /^(imp|mp)-stape-/.test(s.id) && !keepIds.has(s.id))
      : [];
    if (podados.length) {
      const idsBorrar = new Set(podados.map(s => s.id));
      state.series = state.series.filter(s => !idsBorrar.has(s.id));
      state.broken = (state.broken || []).filter(b => !idsBorrar.has(b.sid));
      podados.forEach(s => { delete state.progress[s.id]; delete state.lastPlayed[s.id]; });
      if (current.seriesId && idsBorrar.has(current.seriesId)) {
        current.seriesId = null; current.ep = null;
        resetStage();
      }
      console.log('Streamtape: retirados por no existir ya →', podados.map(s => s.t));
    }

    /* acabado: marca el anime por nombre y busca sus carátulas en AniList */
    for (const s of state.series.filter(x => x.tag === 'Streamtape')) {
      if (ANIME_RE.test(s.t)) { s.anime = true; if (!s.poster) queuePoster(s, true); }
    }
    save();
    renderSeries(els.searchInput.value);
    renderBroken();
    syncBrokenBtn();
    syncOvasToSeries(); // las OVAs importadas que tengan serie → se integran solas

    els.modalDrive.classList.add('hidden');
    const parts = [];
    if (nSeries) parts.push(`${nSeries} serie${nSeries > 1 ? 's' : ''}`);
    if (nMovies) parts.push(`${nMovies} película${nMovies > 1 ? 's' : ''}`);
    if (podados.length) parts.push(`🧹 ${podados.length} retirado${podados.length > 1 ? 's' : ''} (ya borrados en Streamtape)`);
    if (!scanCompleto) parts.push('⚠ escaneo parcial: no se retiró nada');
    toast(`☁ Streamtape: ${parts.join(' + ') || 'todo al día ✓'} · ${nFolders} carpeta${nFolders !== 1 ? 's' : ''}`);
    if (firstId) selectSeries(firstId);
  } catch (e) {
    setDriveStatus('⚠ ' + (e.message || e), 'err');
  } finally {
    els.stImportBtn.disabled = false;
  }
}
els.stImportBtn.addEventListener('click', importStreamtapeAll);

/* ══ Detección del tipo de enlace ══ */
function detectLinkType(url) {
  if (!url) return null;
  const folder = parseDriveFolderId(url);
  if (folder) return { type: 'drive-folder', id: folder };
  const fileId = parseDriveId(url);
  if (fileId) return { type: 'drive-file', id: fileId };
  const stape = parseStape(url);
  if (stape) return { type: 'stape-file', id: stape.id, name: stape.name };
  if (/mega\.(nz|io)\/folder\//i.test(url)) return { type: 'mega-folder', url };
  if (/mega\.(nz|io)\//i.test(url)) return { type: 'mega-file', url };
  if (/^https?:\/\//i.test(url)) return { type: 'direct', url };
  return null;
}

/* importa un archivo suelto (película) y lo abre al instante */
function importSingleFile(videoUrl, name, tag) {
  let t = name ? cleanEpTitle(name, 'Video').slice(0, 80) : null;
  if (!t) {
    try {
      t = decodeURIComponent(videoUrl.split('#')[0].split('/').pop().split('?')[0])
        .replace(VIDEO_EXT, '').replace(/[\._]+/g, ' ').trim();
    } catch (e) { }
  }
  /* IDs opacos (mega, hosts sin nombre de archivo) → título genérico renombrable */
  if (t && !/\s/.test(t) && !t.endsWith(')') && /^[\w-]{6,}$/.test(t)) t = null;
  if (!t) t = 'Video externo (renómbrame ✎)';
  const id = 'file-' + videoUrl.replace(/[^\w]+/g, '-').slice(0, 60);
  const dId = parseDriveId(videoUrl);
  let s = getSeries(id);
  if (!s) {
    s = { id, t, jp: '🎬', tag: tag || 'Archivo externo', g: 6, kind: 'pelicula', poster: dId ? driveThumbUrl(dId, 1000) : null, episodes: [{ n: 1, t: '▶ Ver', url: videoUrl }] };
    state.series.push(s);
    freshIds.add(id);
  } else {
    s.t = t; s.episodes[0].url = videoUrl;
    if (!s.poster && dId) s.poster = driveThumbUrl(dId, 1000);
  }
  save();
  renderSeries(els.searchInput.value);
  selectSeries(id);
  toast(`🎬 «${t}» añadido`);
}

function setDriveStatus(msg, kind = '') {
  els.driveStatus.classList.remove('hidden', 'ok', 'err');
  if (kind) els.driveStatus.classList.add(kind);
  els.driveStatus.innerHTML = msg;
}

/* ¿El nombre del archivo parece un capítulo numerado de serie? */
function hasEpPattern(name) {
  return /s\d{1,2}\s?[ex]\d{1,4}/i.test(name)
    || /(?:episodio|ep|cap[ií]tulo|cap|e)[.\s_-]*\d{1,4}(?!\d)/i.test(name)
    || /[\s._\-]\d{1,3}(?!\d)(?:[\s._\-\)]|v\d|$)/i.test(name)
    || /^\d{1,3}[\s._\-]/.test(name);
}

/* ══ Detección Película vs Serie — triple capa anti-errores ══
   1) Patrones de episodio en los nombres (S01E01, "Cap 5", "- 03"…)
   2) Prefijo común fuerte entre archivos ("Death Note latino…" → serie)
   3) Override manual del usuario en el modal (siempre gana)        */
function looksLikeSeries(files) {
  if (files.length < 2) return { yes: false, reason: 'un solo video' };

  /* capa 1: patrones de episodio */
  const withPat = files.filter(f => hasEpPattern(f.name));
  if (withPat.length >= 2) return { yes: true, reason: `${withPat.length} archivos numerados` };

  /* capa 2: prefijo común entre TODOS los nombres */
  const names = files.map(f => f.name.replace(VIDEO_EXT, '').toLowerCase());
  let prefix = names[0];
  for (const n of names.slice(1)) {
    while (prefix && !n.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) break;
  }
  prefix = prefix.replace(/[\s._\-]+$/, '');
  const shortest = Math.min(...names.map(n => n.length));
  if (prefix.length >= 5 && prefix.length >= shortest * 0.4) {
    return { yes: true, reason: `todos empiezan por «${prefix.slice(0, 30)}»` };
  }
  return { yes: false, reason: `${files.length} videos sin relación aparente` };
}

function buildImportedItems(folderName, files, mode = 'auto') {
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const det = looksLikeSeries(files);
  const asSeries = mode === 'serie' || (mode !== 'peliculas' && det.yes);

  if (asSeries) {
    return {
      detected: det,
      items: [{
        kind: 'serie',
        t: (folderName || 'Serie importada').slice(0, 80),
        episodes: files.map((f, i) => ({ n: i + 1, t: cleanEpTitle(f.name, `Capítulo ${i + 1}`).slice(0, 60), url: f.url })),
      }],
    };
  }
  return {
    detected: det,
    items: files.map(f => {
      const t = cleanEpTitle(f.name, 'Película').slice(0, 80);
      return { kind: 'pelicula', t, episodes: [{ n: 1, t: t.slice(0, 60), url: f.url }], fileKey: f.key, poster: f.thumb || null };
    }),
  };
}

/* id que tendrá un item importado desde una carpeta (estable: depende del linkid, no del orden) */
function importedIdFor(it, srcId) {
  return it.kind === 'serie'
    ? `imp-${srcId}`
    : `mp-${srcId}-${(it.fileKey || it.t).replace(/[^\w]+/g, '-').slice(0, 40)}`;
}

/* inserta los items (o actualiza si ya existen) y LIMPIA el tipo contrario
   de la misma carpeta: si ahora es serie, borra las películas sueltas que
   se hubieran importado antes por error, y viceversa. */
function addImportedItems(items, srcId, srcTag, g) {
  const hasSerie = items.some(i => i.kind === 'serie');
  const hasMovies = items.some(i => i.kind === 'pelicula');
  if (hasSerie) state.series = state.series.filter(s => !s.id.startsWith(`mp-${srcId}-`));
  if (hasMovies) state.series = state.series.filter(s => s.id !== `imp-${srcId}`);

  let firstId = null, nSeries = 0, nMovies = 0;
  const ids = [];
  for (const it of items) {
    const id = importedIdFor(it, srcId);
    ids.push(id);
    let s = getSeries(id);
    if (s) {
      s.t = it.t; s.episodes = it.episodes; s.tag = srcTag; s.kind = it.kind;
      if (!s.poster && it.poster) s.poster = it.poster; // miniatura nueva si no tenía
    } else {
      s = { id, t: it.t, jp: it.kind === 'pelicula' ? '🎬' : '📁', tag: srcTag, g, kind: it.kind, episodes: it.episodes, poster: it.poster || null };
      state.series.push(s);
      freshIds.add(id); // entra con shimmer
    }
    if (it.kind === 'serie') nSeries++; else nMovies++;
    if (!firstId) firstId = id;
  }
  save();
  renderSeries(els.searchInput.value);
  return { firstId, nSeries, nMovies, ids };
}

/* ══ Importación universal: archivos sueltos, carpetas y subcarpetas ══ */
async function importFromUrl() {
  if (!needAdmin()) return;
  const url = els.driveFolderUrl.value.trim();
  const link = detectLinkType(url);
  const mode = (document.querySelector('input[name="importMode"]:checked') || {}).value || 'auto';
  if (!link) {
    setDriveStatus('⚠ Enlace no reconocido.\nSoportados: Google Drive, Streamtape (/e/ o /v/),\nMega / enlaces directos de video (se catalogan).', 'err');
    return;
  }
  els.confirmDrive.disabled = true;
  const key = els.driveApiKey.value.trim();
  try {
    /* ── Archivo suelto de Drive ── */
    if (link.type === 'drive-file') {
      setDriveStatus('🔍 Leyendo el archivo de Drive…');
      const name = await getDriveFileName(link.id, key);
      if (key) { state.apikey = key; save(); }
      importSingleFile(`https://drive.google.com/file/d/${link.id}/view`, name, 'Google Drive · Archivo');
      els.modalDrive.classList.add('hidden');
      return;
    }
    /* ── Video suelto de Streamtape → se reproduce con su embed oficial ── */
    if (link.type === 'stape-file') {
      importSingleFile(stapeEmbedUrl(link.id), link.name, 'Streamtape · Enlace');
      els.modalDrive.classList.add('hidden');
      return;
    }
    /* ── Mega archivo / cualquier URL: se cataloga (reproducción vía fuente) ── */
    if (link.type === 'mega-file' || link.type === 'direct') {
      importSingleFile(link.url, null, link.type === 'mega-file' ? 'Mega · Enlace' : 'Enlace directo');
      els.modalDrive.classList.add('hidden');
      return;
    }
    /* ── Mega carpeta: imposible leerla sin su clave interna ── */
    if (link.type === 'mega-folder') {
      throw new Error('Mega cifra las carpetas dentro del propio enlace:\nninguna app web puede leerlas automáticamente.\n\nSí puedes pegar archivos sueltos de Mega (se catalogan)\no usar Google Drive para carpetas completas.');
    }

    /* ── Carpeta de Drive (con subcarpetas recursivas) ── */
    setDriveStatus('🔍 Leyendo la carpeta de Google Drive…');
    if (key) { state.apikey = key; save(); }
    const groups = await collectDriveDeep(link.id, key);

    let firstId = null, nSeries = 0, nMovies = 0, nEmpty = 0;
    const resumen = [];
    const rootName = groups[0] && groups[0].name; // nombre de la carpeta MADRE (el anime de verdad)
    for (const g of groups) {
      if (!g.files.length) { nEmpty++; continue; }
      /* subcarpeta tipo «Temporada 2» sin nombre propio → hereda el de la madre:
         «Dragon Ball Súper · Temporada 2» → título correcto, carátula correcta */
      let gName = g.name;
      if (gName && rootName && /^(temporada|season|temp|t)?\s*\d{1,2}$/i.test(gName.trim())) {
        gName = `${rootName} · Temporada ${(gName.match(/\d+/) || [''])[0]}`;
      }
      const { detected, items } = buildImportedItems(
        gName,
        g.files.map(f => ({ name: f.name, key: f.id, url: `https://drive.google.com/file/d/${f.id}/view`, thumb: driveThumbUrl(f.id, 1000) })),
        mode
      );
      const r = addImportedItems(items, 'drv-' + g.folderId, 'Google Drive', 4);
      if (!firstId) firstId = r.firstId;
      nSeries += r.nSeries; nMovies += r.nMovies;
      resumen.push(`«${(gName || '?').slice(0, 30)}» → ${items[0].kind === 'serie' ? '📺' : '🎬'} (${g.files.length})`);
    }
    if (!firstId) throw new Error('No se encontraron videos.\nVerifica que la carpeta sea PÚBLICA\n(Compartir → Cualquiera con el enlace).');

    els.modalDrive.classList.add('hidden');
    selectSeries(firstId);
    const s = getSeries(firstId);
    if (s && s.episodes.length) loadEpisode(s.episodes[0].n, true);
    const parts = [];
    if (nSeries) parts.push(`${nSeries} serie${nSeries > 1 ? 's' : ''}`);
    if (nMovies) parts.push(`${nMovies} película${nMovies > 1 ? 's' : ''}`);
    toast(`📁 Importado: ${parts.join(' + ')}${groups.length > 1 ? ` · ${groups.length - nEmpty} carpetas` : ''}`);
    console.log('Importación:', resumen);
  } catch (e) {
    setDriveStatus('⚠ ' + (e.message || e), 'err');
  } finally {
    els.confirmDrive.disabled = false;
  }
}

/* preview en vivo al pegar el enlace */
els.driveFolderUrl.addEventListener('input', () => {
  const v = els.driveFolderUrl.value.trim();
  const link = detectLinkType(v);
  if (!link) { els.driveStatus.classList.add('hidden'); return; }
  const msgs = {
    'drive-folder': `✔ CARPETA de Google Drive\nID: ${link.id}\nLas subcarpetas se importan también.\nPulsa «⚡ Importar»`,
    'drive-file': `✔ ARCHIVO de Google Drive\nID: ${link.id}\nSe añadirá como película. Pulsa «⚡ Importar»`,
    'mega-folder': `⚠ Carpeta de Mega — no se puede leer automática.\nPega archivos sueltos de Mega o usa Drive para carpetas.`,
    'mega-file': `✔ Archivo de Mega\nSe cataloga y se abre desde la fuente. Pulsa «⚡ Importar»`,
    'stape-file': `✔ Video de Streamtape\nSe reproduce aquí con su reproductor oficial. Pulsa «⚡ Importar»`,
    'direct': `✔ Enlace directo detectado\nSe cataloga como película. Pulsa «⚡ Importar»`,
  };
  setDriveStatus(msgs[link.type], link.type === 'mega-folder' ? 'err' : 'ok');
});

els.driveFolderBtn.addEventListener('click', () => {
  els.modalDrive.classList.remove('hidden');
  els.driveApiKey.value = state.apikey || '';
  els.stLogin.value = state.stapeLogin || STAPE_LOGIN_DEFAULT; // login de tu cuenta
  els.stKey.value = state.stapeKey || '';
  setTimeout(() => els.driveFolderUrl.focus(), 60);
});
els.cancelDrive.addEventListener('click', () => els.modalDrive.classList.add('hidden'));
els.modalDrive.addEventListener('click', ev => { if (ev.target === els.modalDrive) els.modalDrive.classList.add('hidden'); });
els.confirmDrive.addEventListener('click', importFromUrl);
els.driveFolderUrl.addEventListener('keydown', ev => { if (ev.key === 'Enter') importFromUrl(); });

/* ═══════════ Tema claro / oscuro ═══════════ */
const ICON_MOON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const ICON_SUN  = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

function applyTheme(theme) {
  const light = theme === 'light';
  document.body.classList.toggle('light', light);
  els.themeBtn.innerHTML = light ? ICON_MOON : ICON_SUN;
  els.themeBtn.title = light ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro';
}
els.themeBtn.addEventListener('click', () => {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  save();
  applyTheme(state.theme);
  toast(state.theme === 'light' ? '☀ Tema claro' : '🌙 Tema oscuro');
});

/* ═══════════ Modo edición ═══════════ */
function setEditing(on) {
  if (on && !needAdmin()) return;
  editing = on;
  document.body.classList.toggle('editing', on);
  els.editModeBtn.classList.toggle('active', on);
  els.editModeBtn.querySelector('span').textContent = on ? 'Salir de edición' : 'Editar enlaces';
  renderEpisodes();
}
els.editModeBtn.addEventListener('click', () => setEditing(!editing));
els.goEditBtn.addEventListener('click', () => {
  setEditing(true);
  els.episodesPanel.scrollIntoView({ behavior: 'smooth' });
});

/* ═══════════ UI modal genérico — sustituye a los prompt/confirm nativos ═══════════
   uiModal({icon,title,sub,okLabel,danger,fields:[{key,label,type,value,placeholder,min,max,maxlength}]})
   → Promise<valores>  (null si cancela; objeto {key:valor} si acepta)          */
function uiModal({ icon = '✨', title = '', sub = '', okLabel = 'Aceptar', danger = false, fields = [] }) {
  return new Promise(resolve => {
    const bd = $('modalUi'), box = $('uiModalBox');
    $('uiIcon').textContent = icon;
    $('uiTitle').textContent = title;
    $('uiSub').innerHTML = sub;
    $('uiOk').textContent = okLabel;
    box.classList.toggle('danger', danger);
    const wrap = $('uiFields');
    wrap.innerHTML = '';
    const inputs = {};
    for (const f of fields) {
      const d = document.createElement('div');
      d.className = 'ui-field';
      if (f.type === 'textarea') {
        d.innerHTML = `<label>${escapeHtml(f.label)}</label><textarea rows="${f.rows || 5}"
          ${f.maxlength ? `maxlength="${f.maxlength}"` : ''}
          placeholder="${escapeHtml(f.placeholder || '')}" spellcheck="false"
          style="background:var(--bg);border:1.5px solid var(--line);border-radius:12px;padding:11px 13px;color:var(--ink);font-size:12px;font-family:'JetBrains Mono';outline:none;resize:vertical;width:100%"></textarea>`;
      } else {
        d.innerHTML = `<label>${escapeHtml(f.label)}</label><input type="${f.type || 'text'}"
          ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''}
          ${f.maxlength ? `maxlength="${f.maxlength}"` : ''}
          placeholder="${escapeHtml(f.placeholder || '')}">`;
      }
      const inp = d.querySelector('input,textarea');
      if (f.value != null) inp.value = f.value;
      inputs[f.key] = inp;
      wrap.appendChild(d);
    }
    bd.classList.remove('hidden');
    setTimeout(() => {
      const first = fields.length ? inputs[fields[0].key] : $('uiOk');
      first.focus();
      if (first.select) first.select();
    }, 60);
    const done = val => {
      bd.classList.add('hidden');
      document.removeEventListener('keydown', onKey, true);
      resolve(val);
    };
    const ok = () => {
      const out = {};
      for (const k in inputs) out[k] = inputs[k].value;
      done(out);
    };
    const onKey = ev => {
      if (ev.key === 'Escape') { ev.preventDefault(); done(null); }
      else if (ev.key === 'Enter') { ev.preventDefault(); ok(); }
    };
    document.addEventListener('keydown', onKey, true);
    $('uiOk').onclick = ok;
    $('uiCancel').onclick = () => done(null);
    bd.onclick = ev => { if (ev.target === bd) done(null); };
  });
}

/* ═══════════ Añadir / eliminar ═══════════ */
els.addEpBtn.addEventListener('click', () => {
  if (!needAdmin()) return;
  const s = getSeries(current.seriesId);
  if (!s) return toast('Primero selecciona una serie', true);
  const n = s.episodes.length + 1;
  const lastSeason = Math.max(1, ...s.episodes.map(e => e.season || 1));
  s.episodes.push({ n, t: `Capítulo ${n}`, url: '', season: lastSeason });
  save(); renderEpisodes(); renderSeries(els.searchInput.value);
  toast(`+ Capítulo ${n} añadido a ${s.t}`);
});

/* ── Deshacer: recupera el último capítulo borrado (con su enlace) ── */
els.undoBtn.addEventListener('click', () => {
  if (!needAdmin()) return;
  const item = trash.pop();
  if (!item) { syncUndoBtn(); return; }
  const s = getSeries(item.seriesId);
  if (!s) { toast('Esa serie ya no existe', true); syncUndoBtn(); return; }
  const idx = Math.min(item.index, s.episodes.length);
  s.episodes.splice(idx, 0, { n: idx + 1, t: item.ep.t, url: item.ep.url });
  s.episodes.forEach((e, i) => e.n = i + 1);
  save(); renderEpisodes(); renderSeries(els.searchInput.value);
  syncUndoBtn();
  toast(`↩ Capítulo ${item.ep.n} recuperado en ${s.t}`);
});

/* ── Insertar capítulo en una posición concreta ── */
els.insertEpBtn.addEventListener('click', async () => {
  if (!needAdmin()) return;
  const s = getSeries(current.seriesId);
  if (!s) return toast('Primero selecciona una serie', true);
  const total = s.episodes.length;
  const r = await uiModal({
    icon: '⇂', title: 'Insertar capítulo', okLabel: 'Insertar aquí',
    sub: `En «<b>${escapeHtml(s.t)}</b>» (${total} caps).<br>Los siguientes se reenumeran y conservan sus enlaces.`,
    fields: [{ key: 'pos', label: `Posición (1 = al principio · ${total + 1} = al final)`, type: 'number', value: String(Math.min(total + 1, (current.ep || total) + 1)), min: 1, max: total + 1 }],
  });
  if (!r) return;
  const pos = Math.max(1, Math.min(total + 1, parseInt(r.pos, 10) || 1));
  s.episodes.splice(pos - 1, 0, { n: pos, t: `Capítulo ${pos}`, url: '' });
  s.episodes.forEach((e, i) => e.n = i + 1);
  save(); renderEpisodes(); renderSeries(els.searchInput.value);
  setEditing(true); // listo para pegar el enlace del nuevo capítulo
  toast(`⇂ Capítulo insertado en la posición ${pos}`);
});

els.delSeriesBtn.addEventListener('click', () => {
  const s = getSeries(current.seriesId);
  if (s) confirmDeleteSeries(s); // → papelera con restauración de 7 días
});

/* ═══════════ ⇄ Mover entre categorías (Anime ↔ Película) ═══════════
   Por si una entrada quedó mal clasificada: convierte la entrada al
   formato de la categoría destino conservando enlaces y progreso.     */
els.moveCatBtn.addEventListener('click', async () => {
  if (!needAdmin()) return;
  const s = getSeries(current.seriesId);
  if (!s) return toast('Selecciona primero una serie o película', true);
  const esPeli = s.kind === 'pelicula';
  const destino = esPeli ? 'Anime (serie)' : 'Película';
  const r = await uiModal({
    icon: '⇄', title: 'Mover de categoría', okLabel: `Mover a ${destino}`,
    sub: `«<b>${escapeHtml(s.t)}</b>» está en <b>${esPeli ? '🎬 Películas' : '📺 Anime'}</b>.<br>
      Al moverla a <b>${destino}</b>, ${esPeli
        ? 'sus videos sueltos pasan a ser capítulos numerados.'
        : 'se muestra con vista de película (sus capítulos se conservan por dentro).'}`,
  });
  if (!r) return;
  if (esPeli) {
    /* 🎬 → 📺 : los videos se convierten en capítulos E1, E2… */
    s.kind = 'serie';
    s.anime = true;
    if (!s.episodes || !s.episodes.length) s.episodes = [{ n: 1, t: 'Capítulo 1', url: '' }];
    s.episodes.forEach((e, i) => { e.n = i + 1; if (!e.t) e.t = `Capítulo ${i + 1}`; });
    toast(`🎬➡📺 «${s.t}» ahora es una serie de Anime`);
  } else {
    /* 📺 → 🎬 : pasa a película (los capítulos quedan guardados) */
    s.kind = 'pelicula';
    s.anime = true; /* sigue siendo contenido anime */
    toast(`📺➡🎬 «${s.t}» movida a Películas`);
  }
  save();
  renderSeries(els.searchInput.value);
  renderEpisodes();
  selectSeries(s.id);
});

/* ── Renombrar serie/película → SIEMPRE re-lanza la carátula con el nombre nuevo ── */
els.renameBtn.addEventListener('click', async () => {
  if (!needAdmin()) return;
  const s = getSeries(current.seriesId);
  if (!s) return toast('Selecciona primero una serie o película', true);
  const viejo = s.t;
  const r = await uiModal({
    icon: '✎', title: 'Renombrar', okLabel: 'Guardar nombre',
    sub: `Título actual: «<b>${escapeHtml(s.t)}</b>»<br>Al guardar, la carátula se busca de nuevo con el nombre nuevo.`,
    fields: [{ key: 't', label: 'Nuevo título', value: s.t, maxlength: 80, placeholder: 'Ej: Tokyo Ghoul' }],
  });
  if (!r || !r.t.trim() || r.t.trim() === viejo) return;
  s.t = r.t.trim().slice(0, 80);
  save();
  renderSeries(els.searchInput.value);
  els.stageTitle.textContent = s.t;
  document.title = `${s.t} — X·STREAM`;
  syncAddressBar();   /* 🔗 el slug de la URL se actualiza al instante */
  if (s.kind !== 'pelicula') syncOvasToSeries(); // quizá alguna OVA suelta pertenece a este nombre
  refetchPoster(s); // el nombre YA es el bueno → carátula garantizada (conserva la vieja si falla)
  toast(`✎ «${viejo}» → «${s.t}» · 🎨 buscando carátula…`);
});

/* ═══════════ Carátula garantizada ═══════════
   Prueba varias variantes del título (completo → sin «Temporada N» →
   sin paréntesis) hasta encontrar imagen. Si ninguna funciona, conserva
   la carátula anterior: nunca te deja a ciegas.                        */
function posterTitleCandidates(t) {
  const list = [t];
  const sinTemporada = t.replace(/[·\-–—|,:]*\s*(temporada|season|t)\s*\d{1,2}\s*$/i, '').trim();
  if (sinTemporada && !list.includes(sinTemporada)) list.push(sinTemporada);
  const sinParentesis = t.replace(/\s*[\(\[](?:[^\)\]])*[\)\]]/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (sinParentesis && !list.includes(sinParentesis)) list.push(sinParentesis);
  return list.filter(x => x && x.length >= 2);
}

async function refetchPoster(s) {
  const old = s.poster || null;
  s.posterTried = false;
  for (const q of posterTitleCandidates(s.t)) {
    try {
      const p = await fetchAniListPoster(q);
      if (p) {
        s.poster = p; s.posterTried = true;
        save();
        renderSeries(els.searchInput.value);
        renderContinue();
        toast(`🎨 Carátula de «${s.t}» actualizada ✓`);
        return true;
      }
    } catch (e) { /* sin red: siguiente candidato */ }
    await new Promise(r => setTimeout(r, 350));
  }
  s.posterTried = true;
  s.poster = old; // fallback seguro
  save();
  renderSeries(els.searchInput.value);
  toast(`Sin carátula automática para «${s.t}» — ajusta el nombre y pulsa ✎ en la portada`, true);
  return false;
}

/* ═══════════ Modal nueva serie ═══════════ */
let pickedGrad = 0;
function renderGradPicker() {
  els.gradPicker.innerHTML = '';
  GRADS.forEach((g, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'grad-swatch' + (i === pickedGrad ? ' sel' : '');
    b.style.background = `linear-gradient(135deg,${g[0]},${g[1]})`;
    b.addEventListener('click', () => { pickedGrad = i; renderGradPicker(); });
    els.gradPicker.appendChild(b);
  });
}
els.addSeriesBtn.addEventListener('click', () => {
  els.modalAdd.classList.remove('hidden');
  els.newTitle.value = ''; els.newJp.value = ''; els.newEps.value = 12;
  pickedGrad = Math.floor(Math.random() * GRADS.length);
  renderGradPicker();
  setTimeout(() => els.newTitle.focus(), 60);
});
els.cancelAdd.addEventListener('click', () => els.modalAdd.classList.add('hidden'));
els.modalAdd.addEventListener('click', ev => { if (ev.target === els.modalAdd) els.modalAdd.classList.add('hidden'); });

els.confirmAdd.addEventListener('click', () => {
  if (!needAdmin()) return;
  const title = els.newTitle.value.trim();
  const count = Math.max(1, Math.min(1200, parseInt(els.newEps.value, 10) || 12));
  if (!title) return toast('Ponle un nombre a la serie', true);
  const id = 'custom-' + Date.now();
  const episodes = [];
  for (let n = 1; n <= count; n++) episodes.push({ n, t: `Capítulo ${n}`, url: '' });
  state.series.push({
    id, t: title, jp: els.newJp.value.trim() || title.slice(0, 2).toUpperCase(),
    tag: 'Personalizada', g: pickedGrad, episodes,
  });
  freshIds.add(id);
  save();
  els.modalAdd.classList.add('hidden');
  renderSeries(els.searchInput.value);
  selectSeries(id);
  toast(`⚡ «${title}» creada con ${count} capítulos`);
  syncOvasToSeries(); // si hay OVAs sueltas de esta serie, se integran ahora
  setEditing(true); // pega los enlaces de una vez
});
els.newTitle.addEventListener('keydown', ev => { if (ev.key === 'Enter') els.confirmAdd.click(); });

/* ═══════════════════════════════════════════════════════════
   BLOQUE V2 — progreso, favoritos, tags, stats, sync, y más
   ═══════════════════════════════════════════════════════════ */

/* ── Progreso de reproducción + estadísticas ── */
let pendingResume = null;
let lastProgSave = 0;
let lastTick = 0;
const todayKey = () => new Date().toISOString().slice(0, 10);

function trackPlayback() {
  const v = els.video;
  if (!current.seriesId || !current.ep || !isFinite(v.duration) || !v.duration) return;
  const now = Date.now();

  /* estadísticas: tiempo real de reproducción */
  if (!v.paused && lastTick && now - lastTick < 10000) {
    const delta = (now - lastTick) / 1000;
    state.stats.totalSec += delta;
    const k = todayKey();
    state.stats.days[k] = (state.stats.days[k] || 0) + delta;
  }
  lastTick = now;

  /* progreso por capítulo (guardado máx. cada 5 s) */
  if (now - lastProgSave < 5000) return;
  lastProgSave = now;
  state.progress[current.seriesId] = state.progress[current.seriesId] || {};
  const prev = state.progress[current.seriesId][current.ep] || {};
  const done = v.currentTime / v.duration > 0.92 ? true : (prev.done || false);
  state.progress[current.seriesId][current.ep] = {
    t: Math.floor(v.currentTime), d: Math.floor(v.duration), done, at: now,
  };
  save();
  if (done && !prev.done) { renderEpisodes(); renderSeries(els.searchInput.value); }
  renderContinue();
}

/* marca como visto al terminar */
els.video.addEventListener('ended', () => {
  if (current.seriesId && current.ep) {
    state.progress[current.seriesId] = state.progress[current.seriesId] || {};
    state.progress[current.seriesId][current.ep] = { ...(state.progress[current.seriesId][current.ep] || {}), done: true, at: Date.now() };
    save(); renderEpisodes(); renderSeries(els.searchInput.value);
  }
});

/* ── Sigue viendo ── */
function renderContinue() {
  const items = [];
  for (const s of state.series) {
    const prog = (state.progress || {})[s.id];
    if (!prog) continue;
    let best = null;
    for (const [epN, p] of Object.entries(prog)) {
      /* incluye capítulos de Drive (d=0 → duración desconocida) */
      if (!p.done && p.t > 10 && (!best || p.at > best.at)) best = { ep: +epN, ...p };
    }
    if (best) items.push({ s, best });
  }
  items.sort((a, b) => b.best.at - a.best.at);
  if (!items.length) { els.continueRow.classList.add('hidden'); return; }
  els.continueRow.classList.remove('hidden');
  els.continueRow.innerHTML = '<span class="cont-title">SIGUE VIENDO</span>';
  for (const { s, best } of items.slice(0, 10)) {
    const pct = best.d ? Math.round(best.t / best.d * 100) : 0;
    const card = document.createElement('button');
    card.className = 'cont-card';
    card.innerHTML = `
      <span class="cont-cover" style="background:${grad(s)}">${s.poster ? `<img src="${s.poster}" alt="" loading="lazy">` : escapeHtml(s.jp || s.t.slice(0, 2).toUpperCase())}</span>
      <span class="cont-meta">
        <div class="cont-t">${escapeHtml(s.t)}</div>
        <div class="cont-p">${s.kind === 'pelicula' ? '🎬' : `E${best.ep}`} · ${fmt(best.t)}</div>
        <div class="cont-bar"><i style="width:${pct}%"></i></div>
      </span>`;
    card.addEventListener('click', () => { selectSeries(s.id); loadEpisode(best.ep, true); });
    els.continueRow.appendChild(card);
  }
}

/* ── Favoritos ── */
function syncFavBtn() {
  const s = getSeries(current.seriesId);
  const on = !!(s && s.fav);
  els.favBtn.classList.toggle('fav-on', on);
  els.favBtn.textContent = on ? '♥ Favorito' : '🤍 Favorito';
}
els.favBtn.addEventListener('click', () => {
  const s = getSeries(current.seriesId);
  if (!s) return toast('Selecciona una serie o película', true);
  s.fav = !s.fav;
  save(); syncFavBtn(); renderSeries(els.searchInput.value);
  toast(s.fav ? `♥ «${s.t}» en favoritos` : `♡ «${s.t}» fuera de favoritos`);
});
els.favFilter.addEventListener('click', () => {
  favOnly = !favOnly;
  els.favFilter.classList.toggle('on', favOnly);
  renderSeries(els.searchInput.value);
});

/* ── Etiquetas / colecciones ── */
els.tagBtn.addEventListener('click', async () => {
  if (!needAdmin()) return;
  const s = getSeries(current.seriesId);
  if (!s) return toast('Selecciona una serie o película', true);
  const r = await uiModal({
    icon: '🏷', title: 'Etiquetas', okLabel: 'Guardar etiquetas',
    sub: `Colecciones para «<b>${escapeHtml(s.t)}</b>».<br>Sepáralas con comas: <i>shonen, clásicos, con ella</i>`,
    fields: [{ key: 'tags', label: 'Etiquetas', value: (s.tags || []).join(', '), placeholder: 'shonen, clásicos…' }],
  });
  if (!r) return;
  s.tags = r.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  save(); renderTagChips(); renderSeries(els.searchInput.value);
  toast(s.tags.length ? `🏷 ${s.tags.join(', ')}` : 'Etiquetas eliminadas');
});

/* ── Recordatorios ── */
function syncRemindBtn() {
  const s = getSeries(current.seriesId);
  els.remindBtn.classList.toggle('bell-on', !!(s && s.reminder));
}
els.remindBtn.addEventListener('click', async () => {
  const s = getSeries(current.seriesId);
  if (!s) return toast('Selecciona una serie o película', true);
  if (s.reminder) {
    const quitar = await uiModal({
      icon: '🔔', title: 'Recordatorio activo', okLabel: 'Quitar recordatorio', danger: true,
      sub: `«<b>${escapeHtml(s.t)}</b>»<br>📅 <b>${s.reminder.date}</b> — ${escapeHtml(s.reminder.note || 'Sin nota')}`,
    });
    if (quitar) {
      delete s.reminder; save(); syncRemindBtn(); renderSeries(els.searchInput.value);
      toast('🔕 Recordatorio quitado');
    }
    return;
  }
  const semanaProx = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const r = await uiModal({
    icon: '🔔', title: 'Programar recordatorio', okLabel: 'Programar',
    sub: `Para «<b>${escapeHtml(s.t)}</b>» — te avisará al abrir la app ese día.`,
    fields: [
      { key: 'date', label: 'Fecha', type: 'date', value: semanaProx },
      { key: 'note', label: 'Motivo', value: `Nuevo capítulo de ${s.t}`, maxlength: 60 },
    ],
  });
  if (!r || !r.date) return;
  s.reminder = { date: r.date, note: r.note.trim() };
  save(); syncRemindBtn(); renderSeries(els.searchInput.value);
  toast(`🔔 Recordatorio: ${r.date}`);
});
function checkReminders() {
  const today = todayKey();
  const due = state.series.filter(s => s.reminder && s.reminder.date <= today);
  if (due.length) toast(`🔔 ${due[0].reminder.note || 'Recordatorio'} — «${due[0].t}»${due.length > 1 ? ` (+${due.length - 1} más)` : ''}`);
}

/* ── Panel ⚙ herramientas (expandir/contraer) ── */
els.gearBtn.addEventListener('click', () => {
  els.sidePanel.classList.toggle('collapsed');
  els.gearBtn.classList.toggle('on', !els.sidePanel.classList.contains('collapsed'));
});

/* ── Subtítulos automáticos en español (cuando la fuente los trae) ── */
function srtToVtt(s) {
  return 'WEBVTT\n\n' + s.replace(/\r/g, '').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
}
let curSubUrl = null;
function setSubsState(on) {
  for (const tt of els.video.textTracks) tt.mode = on ? 'showing' : 'disabled';
  els.ccBtn.classList.toggle('cc-on', on);
}
async function attachSpanishSubs(subUrl) {
  els.video.querySelectorAll('track').forEach(t => t.remove());
  if (curSubUrl) { URL.revokeObjectURL(curSubUrl); curSubUrl = null; }
  els.ccBtn.classList.add('hidden');
  if (!subUrl) return;
  try {
    let text = await (await fetch(subUrl)).text();
    if (!/^\s*WEBVTT/i.test(text)) text = srtToVtt(text);
    curSubUrl = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }));
    const track = document.createElement('track');
    track.kind = 'subtitles'; track.srclang = 'es'; track.label = 'Español';
    track.src = curSubUrl; track.default = true;
    els.video.appendChild(track);
    els.ccBtn.classList.remove('hidden');
    setTimeout(() => setSubsState(true), 400);
    toast('🇪🇸 Subtítulos en español activados');
  } catch (e) { /* sin subs accesibles: sin CC */ }
}
els.ccBtn.addEventListener('click', () => {
  const on = !els.ccBtn.classList.contains('cc-on');
  setSubsState(on);
  toast(on ? '🇪🇸 Subtítulos en español ON' : 'Subtítulos OFF');
});

/* ── Orden de la lista ── */
els.sortMode.addEventListener('change', () => {
  state.sortMode = els.sortMode.value;
  if (state.sortMode === 'manual' && !state.series.some(s => s.order != null)) {
    state.series.forEach((s, i) => s.order = i + 1);
  }
  save(); renderSeries(els.searchInput.value);
});

/* ── Acento de color ── */
const ACCENTS = ['#d8ff3e', '#a78bfa', '#ff2e63', '#38bdf8', '#f59e0b', '#22c55e'];
function applyAccent(c) {
  if (c) document.documentElement.style.setProperty('--acid', c);
  [...els.accentPick.children].forEach(d => d.classList.toggle('sel', d.dataset.c === (c || ACCENTS[0])));
}
function buildAccentPicker() {
  els.accentPick.querySelectorAll('.accent-dot').forEach(d => d.remove());
  for (const c of ACCENTS) {
    const b = document.createElement('button');
    b.className = 'accent-dot';
    b.style.background = c;
    b.dataset.c = c;
    b.title = 'Acento ' + c;
    b.addEventListener('click', () => {
      state.accent = c === ACCENTS[0] ? null : c;
      if (!state.accent) document.documentElement.style.removeProperty('--acid');
      save(); applyAccent(state.accent);
      els.accentPick.classList.add('collapsed'); // se repliega tras elegir
      toast('🎨 Acento cambiado');
    });
    els.accentPick.appendChild(b);
  }
}
/* expandir/contraer el selector */
els.accentMini.addEventListener('click', ev => {
  ev.stopPropagation();
  els.accentPick.classList.toggle('collapsed');
});
document.addEventListener('click', ev => {
  if (!els.accentPick.contains(ev.target)) els.accentPick.classList.add('collapsed');
});
/* búsqueda plegable */
function expandSearch() {
  els.searchBox.classList.add('expanded');
  setTimeout(() => els.searchInput.focus(), 60);
}
els.searchToggle.addEventListener('click', ev => { ev.stopPropagation(); expandSearch(); });
els.searchBox.addEventListener('click', () => { if (!els.searchBox.classList.contains('expanded')) expandSearch(); });
els.searchInput.addEventListener('blur', () => {
  if (!els.searchInput.value.trim()) els.searchBox.classList.remove('expanded');
});
document.addEventListener('click', ev => {
  /* clic fuera de la búsqueda + vacía → replegar */
  if (!els.searchBox.contains(ev.target) && !els.searchInput.value.trim()) {
    els.searchBox.classList.remove('expanded');
  }
});

/* ── Exportar / Importar biblioteca completa ── */
els.exportBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `xstream-backup-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('⬇ Respaldo descargado (incluye progreso y papelera)');
});
els.importBtn.addEventListener('click', () => els.importFile.click());
els.importFile.addEventListener('change', () => {
  const f = els.importFile.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      if (!needAdmin()) return;
      const data = JSON.parse(reader.result);
      if (!data.series || !Array.isArray(data.series)) throw new Error('formato inválido');
      const replace = confirm(`«${f.name}» contiene ${data.series.length} entradas.\n\nAceptar = REEMPLAZAR tu biblioteca actual\nCancelar = COMBINAR (se añaden/actualizan sin borrar)`);
      if (replace) {
        state = data;
      } else {
        for (const s of data.series) {
          const existing = getSeries(s.id);
          if (existing) Object.assign(existing, s); else state.series.push(s);
        }
        state.progress = { ...(data.progress || {}), ...(state.progress || {}) };
        if (data.trash) state.trash.push(...data.trash);
      }
      save();
      location.reload();
    } catch (e) { toast('⚠ Archivo no válido: ' + e.message, true); }
  };
  reader.readAsText(f);
  els.importFile.value = '';
});

/* ── Estadísticas ── */
function calcStreak() {
  let streak = 0;
  const d = new Date();
  if (!state.stats.days[todayKey()]) d.setDate(d.getDate() - 1); // permite seguir la racha de ayer
  while (state.stats.days[d.toISOString().slice(0, 10)]) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}
els.statsBtn.addEventListener('click', () => {
  const totalSeries = state.series.filter(s => s.kind !== 'pelicula').length;
  const totalMovies = state.series.filter(s => s.kind === 'pelicula').length;
  const completadas = state.series.filter(s => s.kind !== 'pelicula' && s.episodes.length && watchedCount(s) >= s.episodes.length).length;
  const favs = state.series.filter(s => s.fav).length;
  els.statsBody.innerHTML = `
    <div class="stat-row"><span>⏱ Tiempo total viendo</span><b>${fmt(Math.floor(state.stats.totalSec))}</b></div>
    <div class="stat-row"><span>📅 Hoy</span><b>${fmt(Math.floor(state.stats.days[todayKey()] || 0))}</b></div>
    <div class="stat-row"><span>🔥 Racha de días</span><b>${calcStreak()} días</b></div>
    <div class="stat-row"><span>📺 Series en la biblioteca</span><b>${totalSeries}</b></div>
    <div class="stat-row"><span>🏆 Series completadas</span><b>${completadas}</b></div>
    <div class="stat-row"><span>🎬 Películas</span><b>${totalMovies}</b></div>
    <div class="stat-row"><span>♥ Favoritos</span><b>${favs}</b></div>
    <div class="stat-row"><span>🗑 En papelera</span><b>${state.trash.length}</b></div>`;
  els.modalStats.classList.remove('hidden');
});
els.closeStats.addEventListener('click', () => els.modalStats.classList.add('hidden'));
els.modalStats.addEventListener('click', ev => { if (ev.target === els.modalStats) els.modalStats.classList.add('hidden'); });

/* ── Gestos táctiles: deslizar vertical en el video = volumen ── */
let touchStart = null;
els.playerArea.addEventListener('touchstart', ev => {
  if (ev.touches.length === 1) touchStart = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
}, { passive: true });
els.playerArea.addEventListener('touchend', ev => {
  if (!touchStart || isDriveMode()) { touchStart = null; return; }
  const dx = ev.changedTouches[0].clientX - touchStart.x;
  const dy = ev.changedTouches[0].clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.5 && els.video.src) {
    const v = els.video;
    v.volume = Math.min(1, Math.max(0, v.volume + (dy < 0 ? 0.15 : -0.15)));
    els.volume.value = v.volume;
    v.muted = false;
    toast('🔊 ' + Math.round(v.volume * 100) + '%');
  }
}, { passive: true });

/* ── Mini player flotante SIN mover el video del DOM ──
   Mover un <video> entre nodos fuerza su recarga y borra el progreso.
   Solución: el reproductor entero pasa a position:fixed y un ancla
   invisible reserva su lugar en el layout. Reproducción 100% continua. */
function setMini(on) {
  els.playerAnchor.classList.toggle('mini', on);
  if (!on) { els.playerArea.classList.remove('free', 'dragging'); els.playerArea.style.left = ''; els.playerArea.style.top = ''; }
}

/* arrastrable a cualquier punto (mouse + táctil) */
(function () {
  const grip = els.miniGrip;
  let dragging = false, offX = 0, offY = 0;
  grip.addEventListener('pointerdown', ev => {
    ev.preventDefault();
    const r = els.playerArea.getBoundingClientRect();
    dragging = true;
    offX = ev.clientX - r.left;
    offY = ev.clientY - r.top;
    grip.setPointerCapture(ev.pointerId);
    els.playerArea.classList.add('free', 'dragging');
  });
  grip.addEventListener('pointermove', ev => {
    if (!dragging) return;
    const r = els.playerArea.getBoundingClientRect();
    const x = Math.max(4, Math.min(window.innerWidth - r.width - 4, ev.clientX - offX));
    const y = Math.max(4, Math.min(window.innerHeight - r.height - 4, ev.clientY - offY));
    els.playerArea.style.left = x + 'px';
    els.playerArea.style.top = y + 'px';
  });
  grip.addEventListener('pointerup', () => { dragging = false; els.playerArea.classList.remove('dragging'); });
  grip.addEventListener('pointercancel', () => { dragging = false; els.playerArea.classList.remove('dragging'); });
})();
let miniPinned = false; // fijado con doble clic: sobrevive aunque el ancla sea visible
new IntersectionObserver(entries => {
  const anchorVisible = entries[0].isIntersecting;
  const playing = isDriveMode() || (els.video.src && !els.video.paused && !els.video.ended);
  if (!anchorVisible && playing) setMini(true);
  else if (anchorVisible && !miniPinned) setMini(false);
}, { threshold: 0.15 }).observe(els.playerAnchor);
els.miniX.addEventListener('click', () => {
  miniPinned = false;
  setMini(false);
  if (isDriveMode()) els.driveFrame.src = 'about:blank';
  else if (els.video.src) els.video.pause();
});

/* ── Portadas automáticas de anime (AniList) ── */
const posterQueue = [];
let posterBusy = false;
function queuePoster(s, force = false) {
  if (s.poster) return;
  if (!force && (s.posterTried || s.kind === 'pelicula' || s.id.startsWith('file-'))) return;
  if (posterQueue.includes(s)) return;
  s.posterTried = true;
  if (force) posterQueue.unshift(s);   // los forzados (renombrados por ti) van primero
  else posterQueue.push(s);
  processPosterQueue();
}
async function fetchAniListPoster(title) {
  const q = title.replace(/[:\-–—·]/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 60);
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'query($s:String){Media(search:$s,type:ANIME){coverImage{large}}}',
      variables: { s: q },
    }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  return (j.data && j.data.Media && j.data.Media.coverImage && j.data.Media.coverImage.large) || null;
}
async function processPosterQueue() {
  if (posterBusy) return;
  posterBusy = true;
  while (posterQueue.length) {
    const s = posterQueue.shift();
    try {
      const p = await fetchAniListPoster(s.t);
      if (p) {
        s.poster = p;
        save();
        /* insertar SIN borrar el corazón de favoritos */
        const el = els.seriesList.querySelector(`[data-sid="${s.id}"] .s-cover`);
        if (el) el.insertAdjacentHTML('afterbegin', `<img src="${p}" alt="" loading="lazy" onerror="this.remove()">`);
      }
    } catch (e) { /* sin red: next */ }
    await new Promise(r => setTimeout(r, 450)); // respeta rate limit
  }
  posterBusy = false;
}

/* ── Cast / Chromecast (solo disponible con HTTPS/hosting) ── */
function initCast() {
  if (!location.protocol.startsWith('http')) return;
  window.__onGCastApiAvailable = ok => {
    if (!ok) return;
    try {
      cast.framework.CastContext.getInstance().setOptions({
        receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      });
      els.castBtn.classList.remove('hidden');
    } catch (e) { }
  };
  const sc = document.createElement('script');
  sc.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
  document.head.appendChild(sc);
}
els.castBtn.addEventListener('click', () => {
  try {
    const s = getSeries(current.seriesId);
    const ep = s && s.episodes.find(e => e.n === current.ep);
    const ch = state.currentChannel && (state.channels || []).find(c => c.id === state.currentChannel);
    const driveDirect = els.playerArea.classList.contains('drive-direct') && els.video.currentSrc;
    /* en modo Drive DIRECTO nuestro player ya carga una URL real reproducible → esa misma se envía al TV */
    const castUrl = driveDirect ? els.video.currentSrc : (ch ? ch.url : (ep && ep.url));
    if (!castUrl || (!driveDirect && parseDriveId(castUrl))) {
      return toast('Cast funciona con MP4 directos — en Drive iframe toca el icono ▶⧉ del reproductor embebido', true);
    }
    const ctx = cast.framework.CastContext.getInstance();
    ctx.requestSession().then(() => {
      const sess = ctx.getCurrentSession();
      /* canales en vivo (m3u8) → tipo HLS; mp4/drive-directo → video/mp4 */
      const mime = /\.m3u8($|\?)/i.test(castUrl) ? 'application/x-mpegURL' : 'video/mp4';
      const mi = new chrome.cast.media.MediaInfo(castUrl, mime);
      mi.metadata = new chrome.cast.media.GenericMediaMetadata();
      mi.metadata.title = s ? `${s.t} — E${ep ? ep.n : ''}` : (state.currentChannel ? `📡 ${(state.channels.find(c => c.id === state.currentChannel) || {}).name || 'TV'}` : 'X·STREAM TV');
      sess.loadMedia(new chrome.cast.media.LoadRequest(mi));
      toast('📺 Enviando a tu Smart TV…');
    }).catch(() => { });
  } catch (e) { toast('Cast no disponible aún', true); }
});

/* ── Sync en la nube (Firebase del ecosistema) ── */
const FB_DEFAULT = {
  projectId: 'studio-4796645076-6f375',
  appId: '1:294212274372:web:57e201d54dc62a72152191',
  apiKey: 'AIzaSyB3UPA2BTY-BT6YripgFmf5VX_BT9XIwGo',
  authDomain: 'studio-4796645076-6f375.firebaseapp.com',
  messagingSenderId: '294212274372',
};
let fbDb = null, fbUid = null;
function setSyncStatus(msg, kind = '') {
  els.syncStatus.textContent = msg;
  els.syncStatus.className = 'sync-status' + (kind ? ' ' + kind : '');
}
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('no carga ' + src));
    document.head.appendChild(s);
  });
}
async function connectFirebase() {
  setSyncStatus('Cargando Firebase…');
  if (!window.firebase) {
    await loadScript('https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js');
    await loadScript('https://www.gstatic.com/firebasejs/10.12.4/firebase-auth-compat.js');
    await loadScript('https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore-compat.js');
  }
  const cfg = Object.assign({}, FB_DEFAULT, JSON.parse(els.fbConfig.value || '{}'));
  state.fbConfig = cfg; save();
  if (!firebase.apps.length) firebase.initializeApp(cfg);
  setSyncStatus('Autenticando…');
  await firebase.auth().signInAnonymously();
  fbUid = firebase.auth().currentUser.uid;
  fbDb = firebase.firestore();
  setSyncStatus(`✔ Conectado (anónimo · uid ${fbUid.slice(0, 8)}…) — usa ⬆ / ⬇`, 'ok');
}
els.syncBtn.addEventListener('click', () => {
  els.fbConfig.value = JSON.stringify(state.fbConfig || FB_DEFAULT, null, 2);
  setSyncStatus(fbDb ? '✔ Conectado' : 'Sin conectar — pulsa Conectar', fbDb ? 'ok' : '');
  els.modalSync.classList.remove('hidden');
});
els.closeSync.addEventListener('click', () => els.modalSync.classList.add('hidden'));
els.modalSync.addEventListener('click', ev => { if (ev.target === els.modalSync) els.modalSync.classList.add('hidden'); });
els.syncConnect.addEventListener('click', () => {
  connectFirebase().catch(e => setSyncStatus('⚠ ' + (e.message || e), 'err'));
});
els.syncUp.addEventListener('click', async () => {
  try {
    if (!fbDb) await connectFirebase();
    setSyncStatus('Subiendo…');
    await fbDb.collection('xstream_sync').doc(fbUid).set({ state: JSON.stringify(state), updatedAt: Date.now() });
    setSyncStatus('✔ Subido a la nube ' + new Date().toLocaleTimeString(), 'ok');
    toast('☁ Biblioteca subida');
  } catch (e) { setSyncStatus('⚠ ' + (e.message || e), 'err'); }
});
els.syncDown.addEventListener('click', async () => {
  try {
    if (!fbDb) await connectFirebase();
    setSyncStatus('Descargando…');
    const doc = await fbDb.collection('xstream_sync').doc(fbUid).get();
    if (!doc.exists) return setSyncStatus('⚠ No hay nada subido aún', 'err');
    const remote = JSON.parse(doc.data().state);
    if (!remote.series) throw new Error('datos inválidos');
    if (!confirm(`La nube tiene ${remote.series.length} entradas (guardado: ${new Date(doc.data().updatedAt).toLocaleString()}).\n\n¿Reemplazar tu biblioteca local?`)) return;
    state = remote;
    save();
    location.reload();
  } catch (e) { setSyncStatus('⚠ ' + (e.message || e), 'err'); }
});

/* ── PWA: service worker (solo con hosting HTTPS) ── */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}

/* splash */
setTimeout(() => { const sp = document.getElementById('splash'); if (sp) sp.remove(); }, 1700);

/* ═══════════ 🎬 CINE — buscador de películas/anime/OVAs en español (Internet Archive) ═══════════ */
const CINE_CHIPS = [
  { label: '👘 Anime', q: 'anime' },
  { label: '🎞 OVAs', q: 'anime ova' },
  { label: '🎌 Películas anime', q: 'anime movie' },
  { label: '🇪🇸 Cine español', q: 'cine español' },
  { label: '😱 Terror', q: 'terror español' },
  { label: '😂 Comedia', q: 'comedia española' },
  { label: '🤠 Western', q: 'western español' },
  { label: '🎩 Clásicos', q: 'chaplin español' },
];
let cineChipActivo = null;

const ANIME_RE = /anime|\bovas?\b|japo|pok[ée]mon|dragon.?ball|naruto|bleach|one.?piece|ghibli|totoro|jojo|mazinger|saiyan|gundam|evangelion|sailor|saint.?seiya|jujutsu|demon.?slayer|chainsaw|spy.?x|death.?note|manga|mecha|shonen|hentai/i;

/* runtime de archive.org puede ser "01:32:45", "92:15", segundos sueltos o un array de esos */
function parseRuntime(raw) {
  if (Array.isArray(raw)) return Math.max(0, ...raw.map(parseRuntime));
  if (raw == null) return 0;
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const parts = s.split(':').map(Number);
  if (parts.some(n => !isFinite(n))) return 0;
  return parts.reduce((acc, v) => acc * 60 + v, 0);
}
const fmtDur = sec => {
  if (!sec) return '';
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m} min`;
};

/* ═══ Detección inteligente del tipo de contenido ═══
   Combina título, etiquetas (subject) y nº real de archivos de video */
function cineDetectType(doc, vidCount = 0) {
  const t = Array.isArray(doc.title) ? doc.title[0] : String(doc.title || '');
  const subj = Array.isArray(doc.subject) ? doc.subject.join(' ') : String(doc.subject || '');
  const txt = `${t} ${subj}`;
  if (/\bovas?\b/i.test(txt)) return { key: 'ova', label: '🎌 OVA' };
  if (/documental|documentary/i.test(txt)) return { key: 'documental', label: '🎥 Documental' };
  if (vidCount >= 4 || /temporada|season|serie completa|cap[ií]tulos|episodios|\bt\d{1,2}\b|\bs\d{1,2}\b/i.test(txt))
    return { key: 'temporada', label: '📺 Temporada' };
  if (ANIME_RE.test(txt)) return { key: 'anime', label: '🎬 Película anime' };
  return { key: 'pelicula', label: '🎬 Película' };
}

function cineSearchUrl(q, onlyEs) {
  /* filtro de idioma español: metadatos + título/descripción en español */
  const es = '(language:(Spanish OR spa) OR title:(español OR latino OR castellano OR español) OR description:(español OR latino OR castellano))';
  const p = new URLSearchParams({
    q: `(${q}) AND mediatype:movies` + (onlyEs ? ` AND ${es}` : ''),
    rows: '40', page: '1', output: 'json',
    sort: 'downloads desc',
  });
  /* runtime + subject: permiten filtrar por duración y detectar el tipo SIN peticiones extra */
  ['identifier', 'title', 'year', 'downloads', 'language', 'runtime', 'subject'].forEach(f => p.append('fl[]', f));
  return `https://archive.org/advancedsearch.php?${p.toString()}`;
}

async function cineSearch() {
  const q = els.cineQuery.value.trim() || 'película';
  els.cineResults.innerHTML = '';
  els.cineStatus.classList.remove('hidden');
  els.cineStatus.textContent = '🔍 Buscando películas…';
  try {
    const res = await fetch(cineSearchUrl(q, els.cineLang.checked));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    let docs = ((data.response && data.response.docs) || []).filter(d => d.identifier && d.title);
    /* ⏱ filtro +60 min: descarta lo que YA sabemos que es corto (runtime en los metadatos);
       a lo que no declara duración se le hace una verificación perezosa tras pintarlo */
    if (els.cineMinDur.checked) {
      docs = docs.filter(d => { const sec = parseRuntime(d.runtime); return !sec || sec >= 3600; });
    }
    /* refuerzo: si el filtro ES está activo, priorizamos los que tengan language español */
    if (els.cineLang.checked) {
      docs = [...docs].sort((a, b) => {
        const esA = /spanish|spa|español|castellano/i.test(String(a.language || '') + ' ' + String(a.title || '')) ? 0 : 1;
        const esB = /spanish|spa|español|castellano/i.test(String(b.language || '') + ' ' + String(b.title || '')) ? 0 : 1;
        return esA - esB || (b.downloads || 0) - (a.downloads || 0);
      });
    }
    els.cineStatus.classList.add('hidden');
    if (!docs.length) {
      els.cineResults.innerHTML = `<div class="net-empty">Sin resultados ${els.cineMinDur.checked ? 'de más de 60 min ' : ''}en español. Prueba: «anime», «ovas», nombres de películas en inglés, o desmarca los filtros.</div>`;
      return;
    }
    renderCineResults(docs);
  } catch (e) {
    els.cineStatus.textContent = '⚠ No se pudo conectar con archive.org — inténtalo de nuevo en un momento.';
  }
}

/* cola de verificación perezosa: consulta los metadatos de cada resultado
   (máx. 3 a la vez) para leer su duración REAL y su nº de archivos de video */
const cineVerifyQueue = [];
let cineVerifyActive = 0;
function enqueueCineVerify(job) { cineVerifyQueue.push(job); pumpCineVerify(); }
async function pumpCineVerify() {
  if (cineVerifyActive >= 3 || !cineVerifyQueue.length) return;
  cineVerifyActive++;
  try { await cineVerifyQueue.shift()(); } catch (e) { /* sin metadatos: se queda como está */ }
  cineVerifyActive--;
  pumpCineVerify();
}

function renderCineResults(docs) {
  cineVerifyQueue.length = 0; // descarta verificaciones de búsquedas anteriores
  els.cineResults.innerHTML = '';
  for (const d of docs) {
    const year = String(d.year || '').slice(0, 4);
    const title = Array.isArray(d.title) ? d.title[0] : String(d.title);
    const sec = parseRuntime(d.runtime);
    const tipo = cineDetectType(d);
    const card = document.createElement('div');
    card.className = 'cine-card';
    card.innerHTML = `
      <img class="cine-thumb" loading="lazy" src="https://archive.org/services/img/${d.identifier}" alt="" onerror="this.style.opacity=.12">
      <div class="cine-meta">
        <div class="cine-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
        <div class="cine-year">${year ? year + ' · ' : ''}${sec ? `<span class="cine-dur">${fmtDur(sec)} · </span>` : '<span class="cine-dur"></span>'}${(d.downloads || 0).toLocaleString()} desc.</div>
        <span class="cine-type ${tipo.key}">${tipo.label}</span>
      </div>
      <div class="cine-actions">
        <button class="cine-play">▶ Ver ya</button>
        <button class="cine-add" title="Añadir a tu lista sin reproducir">＋</button>
      </div>`;
    const btnPlay = card.querySelector('.cine-play');
    const btnAdd = card.querySelector('.cine-add');
    let busy = false;

    async function importAndPlay(playNow) {
      if (busy) return;
      busy = true;
      btnPlay.disabled = btnAdd.disabled = true;
      const ov = document.createElement('div');
      ov.className = 'cine-loading';
      ov.textContent = '⏳ Buscando video…';
      card.appendChild(ov);
      try {
        const media = await cineFetchMedia(d.identifier);
        if (!media) {
          toast('Sin video reproducible — tarjeta descartada', true);
          card.style.opacity = '.35';
          setTimeout(() => card.remove(), 900);
          return;
        }
        if (els.cineMinDur.checked && media.runtime && media.runtime < 3600) {
          toast(`⏱ «${title.slice(0, 30)}» dura ${fmtDur(media.runtime)} — menos de 60 min`, true);
          card.style.opacity = '.35';
          setTimeout(() => card.remove(), 900);
          return;
        }
        cineImport(d, title, media, year);
        if (playNow) els.modalCine.classList.add('hidden');
        else toast(`＋ «${title.slice(0, 30)}» en tu lista`);
      } catch (e) {
        toast('No se pudo obtener el video', true);
      } finally {
        busy = false;
        ov.remove();
      }
    }
    card.addEventListener('click', () => importAndPlay(true));
    btnPlay.addEventListener('click', ev => { ev.stopPropagation(); importAndPlay(true); });
    btnAdd.addEventListener('click', ev => { ev.stopPropagation(); importAndPlay(false); });
    els.cineResults.appendChild(card);

    /* verificación perezosa: duración real + refinar el tipo con el nº de videos */
    enqueueCineVerify(async () => {
      if (!card.isConnected) return;
      const media = await cineFetchMedia(d.identifier);
      if (!media) return;
      const durEl = card.querySelector('.cine-dur');
      if (media.runtime) {
        if (durEl) durEl.textContent = fmtDur(media.runtime) + ' · ';
        if (els.cineMinDur.checked && media.runtime < 3600) {
          card.style.opacity = '.3';            // demasiado corto → se retira solo
          setTimeout(() => card.remove(), 700);
          return;
        }
      }
      const t2 = cineDetectType(d, media.vids.length);
      const badge = card.querySelector('.cine-type');
      if (badge) { badge.textContent = t2.label; badge.className = 'cine-type ' + t2.key; }
    });
  }
}

/* metadatos reales de un item: todos sus videos, subtítulo en español y duración */
async function cineFetchMedia(id) {
  const res = await fetch(`https://archive.org/metadata/${id}`);
  if (!res.ok) throw new Error('meta');
  const meta = await res.json();
  const all = meta.files || [];
  const files = all.filter(f => /\.(mp4|m4v|webm|ogv)$/i.test(f.name || ''));
  if (!files.length) return null;
  const mk = f => `https://archive.org/download/${id}/${f.name.split('/').map(encodeURIComponent).join('/')}`;
  const subs = all.filter(f => /\.(srt|vtt)$/i.test(f.name || '')
    && /(español|espanol|spanish|latino|castellano|\bes\b|\[es\]|_es[._-]|\.es\.)/i.test(f.name));
  const vids = files.map(f => ({ name: f.name, url: mk(f), len: parseFloat(f.length) || 0 }));
  const runtime = parseRuntime(meta.metadata && meta.metadata.runtime) || Math.max(0, ...vids.map(v => v.len));
  return { vids, sub: subs.length ? mk(subs[0]) : null, runtime };
}

/* el mejor video suelto para reproducir ya (calidad razonable, formato cómodo) */
function cinePickBest(vids) {
  const score = v => {
    const n = v.name.toLowerCase();
    if (/_512kb\.mp4$/.test(n)) return 2;
    if (/\.ia\.mp4$/.test(n)) return 20;
    if (/\.mp4$|\.m4v$/.test(n)) return 12;
    if (/\.webm$/.test(n)) return 8;
    return 3;
  };
  return vids.slice().sort((a, b) => score(b) - score(a))[0];
}

/* importar con cabeza:
   · 📺 Temporada/serie detectada → entra como SERIE con un capítulo por video
   · 🎌 OVA → película anime; si su serie ya existe, se integra sola como capítulo OVA
   · resto → película normal                                                          */
function cineImport(doc, title, media, year) {
  if (!needAdmin()) return;
  const id = 'ia-' + doc.identifier.replace(/[^\w-]+/g, '-');
  const tipo = cineDetectType(doc, media.vids.length);
  const esAnime = ANIME_RE.test(`${cineChipActivo || ''} ${els.cineQuery.value} ${title}`)
    || tipo.key === 'ova' || tipo.key === 'anime';
  const cleanEpName = name => name.replace(/\.(mp4|m4v|webm|ogv)$/i, '').replace(/[._]+/g, ' ').trim().slice(0, 60);
  let s = getSeries(id);
  if (!s) {
    if (tipo.key === 'temporada') {
      /* orden natural por nombre de archivo para numerar los capítulos */
      const orden = media.vids.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      s = {
        id,
        t: String(title).slice(0, 80),
        jp: esAnime ? '🎌' : '📺',
        tag: (esAnime ? 'Cine IA · Anime · Temporada' : 'Cine IA · Temporada') + (year ? ' · ' + year : ''),
        g: esAnime ? 4 : 5,
        kind: 'serie',
        anime: esAnime,
        poster: `https://archive.org/services/img/${doc.identifier}`,
        episodes: orden.map((v, i) => ({ n: i + 1, t: cleanEpName(v.name) || `Capítulo ${i + 1}`, url: v.url, sub: media.sub })),
      };
      state.series.push(s);
      freshIds.add(id);
      if (esAnime) queuePoster(s); // carátula anime en AniList
    } else {
      const best = cinePickBest(media.vids);
      s = {
        id,
        t: String(title).slice(0, 80),
        jp: esAnime ? '🎌' : '🎬',
        tag: `Cine IA · ${tipo.label.replace(/^\S+\s/, '')}` + (year ? ' · ' + year : ''),
        g: esAnime ? 4 : 1,
        kind: 'pelicula',
        anime: esAnime,
        poster: `https://archive.org/services/img/${doc.identifier}`,
        episodes: [{ n: 1, t: String(title).slice(0, 60), url: best.url, sub: media.sub }],
      };
      state.series.push(s);
      freshIds.add(id);
      if (esAnime) queuePoster(s);
    }
  } else if (s.kind === 'pelicula') {
    s.episodes[0].url = cinePickBest(media.vids).url;
    if (media.sub) s.episodes[0].sub = media.sub;
  }
  save();
  renderSeries(els.searchInput.value);
  renderTagChips();
  /* si lo importado es una OVA y su serie ya existe → se integra al instante */
  if (isOvaEntry(s)) {
    const match = ovaMatchSeries(s);
    if (match && mergeOvaInto(s, match)) {
      save();
      renderSeries(els.searchInput.value);
      renderEpisodes();
      toast(`🎌 OVA integrada en «${match.t}»`);
      selectSeries(match.id);
      return;
    }
  }
  selectSeries(id);
}

/* chips de búsqueda rápida */
function buildCineChips() {
  els.cineChips.innerHTML = '';
  for (const c of CINE_CHIPS) {
    const b = document.createElement('button');
    b.className = 'cine-chip';
    b.textContent = c.label;
    b.addEventListener('click', () => {
      cineChipActivo = cineChipActivo === c.q ? null : c.q;
      [...els.cineChips.children].forEach(el => el.classList.remove('on'));
      if (cineChipActivo) b.classList.add('on');
      els.cineQuery.value = cineChipActivo || '';
      cineSearch();
    });
    els.cineChips.appendChild(b);
  }
}

els.cineBtn.addEventListener('click', () => {
  buildCineChips();
  els.modalCine.classList.remove('hidden');
  setTimeout(() => els.cineQuery.focus(), 60);
  if (!els.cineResults.children.length) cineSearch();
});
els.closeCine.addEventListener('click', () => els.modalCine.classList.add('hidden'));
els.modalCine.addEventListener('click', ev => { if (ev.target === els.modalCine) els.modalCine.classList.add('hidden'); });
els.cineGo.addEventListener('click', cineSearch);
els.cineQuery.addEventListener('keydown', ev => { if (ev.key === 'Enter') cineSearch(); });
els.cineLang.addEventListener('change', cineSearch);
els.cineMinDur.addEventListener('change', cineSearch);

/* ═══════════ Init ═══════════ */
load();
purgeTrash();          /* elimina lo que lleva +7 días en papelera */
syncTrashBtn();
syncBrokenBtn();
renderBroken();
applyTheme(state.theme || 'dark');
syncAutoplayBtn();
els.sortMode.value = state.sortMode || 'manual';
syncTabs();
buildAccentPicker();
applyAccent(state.accent);
renderTagChips();
renderSeries();
renderEpisodes();
renderContinue();
syncOvasToSeries(true); // OVAs sueltas que ya tienen serie → se integran en silencio al arrancar
checkReminders();
setPlayIcon();
syncUndoBtn();
initCast();
/* si la URL trae un capítulo compartido (#s=…&e=…), lo abre directo */
if (openFromHash()) {
  document.querySelector('.stage').scrollTo({ top: 0 });
}

/* registro global por si se quiere depurar */
window.XSTREAM = { state, save };

/* ═══════════ 🔌 Conexión con auth.js (identidad, roles y catálogo) ═══════════ */
if (window.XAUTH) {
  window.XAUTH.attach({
    getState: () => state,
    save,
    renderSeries: () => renderSeries(els.searchInput.value),
    renderEpisodes,
    renderContinue,
    renderTagChips,
    /* cuando cambia el rol (lector ⇄ admin) hay que repintar pestañas y herramientas */
    onRoleChange: () => { syncTabs(); renderSeries(els.searchInput.value); },
  });
  /* el lector arranca sin modo edición aunque lo toque en consola */
  if (!canAdmin() && editing) setEditing(false);
  syncTabs(); /* asegura la visibilidad correcta de las herramientas TV según el rol */
  /* 📡 la lista oficial en español de iptv-org queda FIJA y siempre conectada */
  state.tvSources = state.tvSources || {};
  if (!state.tvSources['iptv-org/spa']) {
    state.tvSources['iptv-org/spa'] = { url: 'https://iptv-org.github.io/iptv/languages/spa.m3u', name: 'iptv-org: Español', at: 0 };
    save();
  }
  /* 🌐 auto-update iptv-org: al entrar, refresca las fuentes si toca (máx. 1/día) */
  if (typeof iptvAutoUpdate === 'function') setTimeout(iptvAutoUpdate, 3500);
  /* 📅 auto-refresh de la guía EPG si ya estaba configurada y lleva >6h */
  if (state.epg && state.epg.url && Date.now() - (state.epg.at || 0) > 6 * 3600e3 && canAdmin()) {
    epgDownload(state.epg.url).catch(() => { });
  }
}
