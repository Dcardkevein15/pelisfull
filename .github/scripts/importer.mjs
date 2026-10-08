/* ══════════════════════════════════════════════════════════════════════
   ☁ X·STREAM — IMPORTADOR EN LA NUBE (GitHub Actions)
   ══════════════════════════════════════════════════════════════════════
   Lee la cola `import-queue.json` (rama chat-data) e importa los enlaces
   DIRECTO desde los servidores de GitHub: sin proxies CORS, sin navegador,
   sin límites de "opción gratuita ocupada". Reintenta los fallidos con
   backoff (2m→5m→15m→1h→4h→24h, máx 6 intentos) y escribe explicaciones
   claras de POR QUÉ falló cada uno y CÓMO arreglarlo.

   Los esquemas de ID son IDÉNTICOS a los del cliente (app.js) para que la
   adopción en la web sea idempotente:
     · serie de carpeta → «imp-drv-<folderId>»
     · película de carpeta → «mp-drv-<folderId>-<fileKey|título>»
     · archivo suelto → «file-<url saneada>»
   ══════════════════════════════════════════════════════════════════════ */

const REPO = process.env.GH_REPO || 'Dcardkevein15/pelisfull';
const BRANCH = 'chat-data';
const TOKEN = process.env.GH_TOKEN;
const TMDB_KEY = '03e66e3a69ab27b33648570df1c843df';
const IQ_BACKOFF = [2 * 60e3, 5 * 60e3, 15 * 60e3, 60 * 60e3, 4 * 3600e3, 24 * 3600e3];
const IQ_MAX_ATTEMPTS = 6;
const MAX_ITEMS_PER_RUN = 25;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ═══════════ utilidades compartidas con app.js (puerto fiel) ═══════════ */
const VIDEO_EXT = /\.(mp4|m4v|webm|ogv|ogg|mkv|avi|mov|wmv|ts)$/i;
const FOLDER_RE = /drive\.google\.com\/(?:drive\/)?(?:u\/\d+\/)?folders\/([\w-]{15,})/i;
const STAPE_LINK_RE = /streamtape\.(?:com|to)\/([ev])\/([\w-]+)(?:\/([^?#]+))?/i;
const driveThumbUrl = (id, w = 600) => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
const stapeEmbedUrl = id => `https://streamtape.com/e/${id}`;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function decodeHTMLEntities(s) {
  return String(s).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&([a-z0-9]+);/gi, (m, k) => ENTITIES[k.toLowerCase()] || m);
}
function cleanEpTitle(name, fallback) {
  let t = String(name || '').replace(VIDEO_EXT, '');
  t = t.replace(/\b(1080p|720p|480p|x264|x265|h\.?264|hevc|bluray|brrip|web[- ]?dl|webrip|hdrip|subtitulado|latino|castellano|dual|audio latino)\b/gi, '');
  t = t.replace(/[._]+/g, ' ').replace(/\s{2,}/g, ' ').replace(/^\s*[-–—|]+\s*/, '').replace(/[-–—|]+\s*$/, '').trim();
  return t || fallback;
}
function hasEpPattern(name) {
  return /s\d{1,2}\s?[ex]\d{1,4}/i.test(name)
    || /(?:episodio|ep|cap[ií]tulo|cap|e)[.\s_-]*\d{1,4}(?!\d)/i.test(name)
    || /[\s._\-]\d{1,3}(?!\d)(?:[\s._\-\)]|v\d|$)/i.test(name)
    || /^\d{1,3}[\s._\-]/.test(name);
}
function looksLikeSeries(files) {
  if (files.length < 2) return false;
  const withPat = files.filter(f => hasEpPattern(f.name));
  if (withPat.length >= 2) return true;
  const names = files.map(f => f.name.replace(VIDEO_EXT, '').toLowerCase());
  let prefix = names[0];
  for (const n of names.slice(1)) {
    while (prefix && !n.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) break;
  }
  prefix = prefix.replace(/[\s._\-]+$/, '');
  const shortest = Math.min(...names.map(n => n.length));
  return prefix.length >= 5 && prefix.length >= shortest * 0.4;
}

/* géneros (puerto de MOVIE_GENRES — solo keywords) */
const GENRES = [
  ['scifi', ['ciencia ficcion', 'sci fi', 'sci-fi', 'scifi', 'espacial', 'espacio', 'futurista', 'robot', 'androide', 'alien', 'galaxia', 'interestelar', 'cyberpunk', 'distopia', 'dystopia', 'maquina del tiempo', 'star wars', 'star trek']],
  ['terror', ['terror', 'horror', 'miedo', 'slasher', 'zombi', 'zombie', 'monstruo', 'pesadilla', 'dracula', 'exorcista', 'posesion', 'maldicion', 'paranormal', 'sobrenatural', 'diabolica', 'infernal', 'casa embrujada']],
  ['suspenso', ['suspenso', 'suspense', 'thriller', 'misterio', 'asesino', 'asesinato', 'detective', 'investigacion', 'psicologica', 'enigma']],
  ['crimen', ['crimen', 'criminal', 'mafia', 'golpe', 'robo', 'ladron', 'policial', 'gangster', 'cartel', 'narcos', 'secuestro', 'atraco']],
  ['romance', ['romance', 'romantica', 'romantico', 'comedia romantica', 'historia de amor', 'love story']],
  ['comedia', ['comedia', 'comedy', 'humor', 'risa', 'parodia', 'comica', 'stand up']],
  ['drama', ['drama', 'dramatica', 'melodrama', 'tragedia']],
  ['aventura', ['aventura', 'adventure', 'expedicion', 'tesoro', 'jungla', 'pirata', 'safari', 'busqueda']],
  ['fantasia', ['fantasia', 'fantasy', 'magia', 'dragon', 'mago', 'hechizo', 'mitologica', 'reino', 'epica', 'espada']],
  ['infantil', ['infantil', 'ninos', 'kids', 'familia', 'familiar', 'animada', 'dibujos', 'pixar', 'disney', 'cuento', 'cartoon']],
  ['documental', ['documental', 'documentary', 'docu', 'naturaleza', 'biografia', 'wildlife']],
  ['deportes', ['deporte', 'futbol', 'soccer', 'basquet', 'boxeo', 'beisbol', 'competencia', 'olimpica']],
  ['musical', ['musical', 'concierto', 'cantando', 'opera', 'bailar', 'banda sonora']],
  ['western', ['western', 'vaquero', 'cowboy', 'lejano oeste']],
  ['guerra', ['guerra', 'war', 'militar', 'soldado', 'ejercito', 'batalla', 'combate', 'trench']],
  ['hentai', ['hentai']],
  ['accion', ['accion', 'action', 'pelea', 'peleas', 'artes marciales', 'marcial', 'destruccion', 'persecucion', 'explosiones', 'adrenalina']],
];
const normTxt = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function detectMovieGenre(text) {
  const s = normTxt(text);
  if (!s) return null;
  for (const [id, kws] of GENRES) if (kws.some(k => s.includes(k))) return id;
  return null;
}
function isGenreFolder(name) {
  const id = detectMovieGenre(name);
  return id && normTxt(name).trim().length < 26 ? id : null;
}
function applyMovieGenre(s, genreId) {
  if (!s || !genreId) return;
  s.genre = genreId;
  s.tags = s.tags || [];
  const label = ({ scifi: 'Ciencia Ficción', terror: 'Terror', suspenso: 'Suspenso', crimen: 'Crimen', romance: 'Romance', comedia: 'Comedia', drama: 'Drama', aventura: 'Aventura', fantasia: 'Fantasía', infantil: 'Infantil', documental: 'Documental', deportes: 'Deportes', musical: 'Musical', western: 'Western', guerra: 'Guerra', hentai: 'Hentai', accion: 'Acción' })[genreId];
  if (label && !s.tags.includes(label)) s.tags.push(label);
  if (genreId === 'hentai') s.hentai = true;
}
function importedIdFor(it, srcId) {
  return it.kind === 'serie'
    ? `imp-${srcId}`
    : `mp-${srcId}-${(it.fileKey || it.t).replace(/[^\w]+/g, '-').slice(0, 40)}`;
}

/* ═══════════ lectura de Drive DIRECTA (sin proxies — server side) ═══════════ */
async function fetchText(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36' } });
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.code = r.status; throw e; }
    return await r.text();
  } finally { clearTimeout(to); }
}
function parseFolderHtml(html) {
  const files = [], subfolders = [], seen = new Set();
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
  if (!files.length && !subfolders.length) {
    const looseRe = /\/file\/d\/([\w-]{15,})[\s\S]{0,400}?flip-entry-title[^>]*>([^<]+)</gi;
    while ((m = looseRe.exec(html))) {
      if (!seen.has(m[1])) { files.push({ id: m[1], name: decodeHTMLEntities(m[2]).trim() }); seen.add(m[1]); }
    }
  }
  const tm = html.match(/<title>([\s\S]*?)<\/title>/i);
  let folderName = tm ? decodeHTMLEntities(tm[1]).replace(/\s*[-–—]\s*Google (Drive|Docs)\s*$/i, '').trim() : null;
  if (!folderName || /^google drive$/i.test(folderName)) folderName = null;
  return { folderName, files, subfolders };
}
async function collectDriveDeep(folderId, depth = 0, seen = new Set(), budget = { n: 0 }) {
  if (seen.has(folderId) || depth > 3 || budget.n > 2000) return [];
  seen.add(folderId);
  let result;
  try {
    result = parseFolderHtml(await fetchText(`https://drive.google.com/embeddedfolderview?id=${folderId}#list`));
  } catch (e) {
    if (depth === 0) throw e;   /* la raíz fallando = item fallido; subcarpetas fallidas se saltan */
    return [];
  }
  budget.n += result.files.length;
  const groups = [{ name: result.folderName, files: result.files, folderId }];
  for (const sub of result.subfolders || []) {
    await sleep(700);   /* cortesía con Drive entre carpetas */
    groups.push(...await collectDriveDeep(sub.id, depth + 1, seen, budget));
  }
  return groups;
}
async function getDriveFileName(fileId) {
  try {
    const html = await fetchText(`https://drive.google.com/file/d/${fileId}/view`);
    const tm = html.match(/<title>([\s\S]*?)<\/title>/i);
    let t = tm ? decodeHTMLEntities(tm[1]).replace(/\s*[-–—]\s*Google (Drive|Docs)\s*$/i, '').trim() : '';
    if (t && !/^google drive$/i.test(t)) return t;
  } catch (e) { }
  return null;
}

/* ═══════════ TMDB: carátula + género reales para cada película ═══════════ */
let tmdbCalls = 0;
async function enrichFromTmdb(s) {
  if (!s || s.kind !== 'pelicula' || tmdbCalls > 300 || s.genreTmdbDone) return;
  try {
    tmdbCalls++;
    const q = encodeURIComponent(String(s.t).trim());
    const r = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&language=es-ES&query=${q}&page=1`);
    if (!r.ok) return;
    const j = await r.json();
    const hit = (j.results || [])[0];
    if (!hit) return;
    if (hit.poster_path && !s.poster) s.poster = 'https://image.tmdb.org/t/p/w500' + hit.poster_path;
    const d = await fetch(`https://api.themoviedb.org/3/movie/${hit.id}?api_key=${TMDB_KEY}&language=es-ES`).then(x => x.json()).catch(() => null);
    if (d && d.genres) for (const g of d.genres) { const gid = detectMovieGenre(g.name); if (gid) { applyMovieGenre(s, gid); break; } }
    s.genreTmdbDone = true;
    await sleep(120);
  } catch (e) { /* TMDB caído no rompe la importación */ }
}

/* ═══════════ construcción de items (puerto de buildImportedItems) ═══════════ */
function buildImportedItems(folderName, files, mode = 'auto') {
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const asSeries = mode === 'serie' || (mode !== 'peliculas' && looksLikeSeries(files));
  if (asSeries) {
    return [{
      kind: 'serie',
      t: (folderName || 'Serie importada').slice(0, 80),
      episodes: files.map((f, i) => ({ n: i + 1, t: cleanEpTitle(f.name, `Capítulo ${i + 1}`).slice(0, 60), url: f.url })),
    }];
  }
  return files.map(f => {
    const t = cleanEpTitle(f.name, 'Película').slice(0, 80);
    return { kind: 'pelicula', t, episodes: [{ n: 1, t: t.slice(0, 60), url: f.url }], fileKey: f.key, poster: f.thumb || null };
  });
}
function toSeriesObj(it, srcId, srcTag, g = 4) {
  const s = {
    id: importedIdFor(it, srcId),
    t: it.t, jp: it.kind === 'pelicula' ? '🎬' : '📁',
    tag: srcTag, g, kind: it.kind,
    episodes: it.episodes, poster: it.poster || null,
  };
  if (it.genre) applyMovieGenre(s, it.genre);
  return s;
}

/* ═══════════ procesamiento de cada enlace de la cola ═══════════ */
function detectLinkType(url) {
  if (!url) return null;
  const folder = url.match(FOLDER_RE) || url.match(/[?&]id=([\w-]{15,})/);
  if (folder && /folders|id=/.test(url) && /drive\.google/.test(url)) {
    if (url.match(FOLDER_RE)) return { type: 'drive-folder', id: url.match(FOLDER_RE)[1] };
  }
  const fileId = url.match(/drive\.google\.com\/file\/d\/([\w-]{15,})/) || (url.match(/[?&]id=([\w-]{15,})/) && /docs\.google/.test(url) ? [null, url.match(/[?&]id=([\w-]{15,})/)[1]] : null);
  if (fileId) return { type: 'drive-file', id: fileId[1] };
  const st = url.match(STAPE_LINK_RE);
  if (st) return { type: 'stape-file', id: st[2], name: st[3] ? decodeURIComponent(st[3]) : null };
  if (/mega\.(nz|io)\/folder\//i.test(url)) return { type: 'mega-folder', url };
  if (/mega\.(nz|io)\//i.test(url)) return { type: 'mega-file', url };
  if (/^https?:\/\/.+\.(mp4|m4v|webm|ogv|ogg|mkv|avi|mov|wmv|ts)(\?|$)/i.test(url)) return { type: 'direct', url };
  if (/^https?:\/\//i.test(url)) return { type: 'direct', url };
  return null;
}

async function processItem(item) {
  const link = detectLinkType(item.url);
  if (!link) throw new Error('enlace no reconocido');
  const created = [];

  if (link.type === 'drive-folder') {
    const groups = await collectDriveDeep(link.id);
    const rootName = groups[0] && groups[0].name;
    let any = false;
    for (const grp of groups) {
      if (!grp.files.length) continue;
      any = true;
      let gName = grp.name;
      if (gName && rootName && /^(temporada|season|temp|t)?\s*\d{1,2}$/i.test(gName.trim())) {
        gName = `${rootName} · Temporada ${(gName.match(/\d+/) || [''])[0]}`;
      }
      const gFolder = isGenreFolder(gName);
      const items = buildImportedItems(
        gName,
        grp.files.map(f => ({ name: f.name, key: f.id, url: `https://drive.google.com/file/d/${f.id}/view`, thumb: driveThumbUrl(f.id, 1000) })),
        gFolder ? 'peliculas' : (item.mode || 'auto')
      );
      if (gFolder || (item.mode || 'auto') === 'peliculas') {
        for (const it of items) {
          if (it.kind !== 'pelicula') continue;
          it.genre = gFolder || detectMovieGenre(it.t) || detectMovieGenre(gName) || null;
        }
      }
      for (const it of items) created.push(toSeriesObj(it, 'drv-' + grp.folderId, 'Google Drive'));
    }
    if (!any) throw new Error('no se encontraron videos — la carpeta está vacía o no es pública (Compartir → Cualquiera con el enlace)');
  } else if (link.type === 'drive-file') {
    const name = await getDriveFileName(link.id);
    if (!name) throw new Error('no se pudo leer el nombre del archivo — ¿es público? (Compartir → Cualquiera con el enlace)');
    const videoUrl = `https://drive.google.com/file/d/${link.id}/view`;
    const id = 'file-' + videoUrl.replace(/[^\w]+/g, '-').slice(0, 60);
    const s = { id, t: cleanEpTitle(name, 'Video importado').slice(0, 80), jp: '🎬', tag: 'Google Drive · Archivo', g: 6, kind: 'pelicula', poster: driveThumbUrl(link.id, 1000), episodes: [{ n: 1, t: '▶ Ver', url: videoUrl }] };
    const gen = detectMovieGenre(s.t); if (gen) applyMovieGenre(s, gen);
    created.push(s);
  } else if (link.type === 'stape-file') {
    const videoUrl = stapeEmbedUrl(link.id);
    const id = 'file-' + videoUrl.replace(/[^\w]+/g, '-').slice(0, 60);
    let t = link.name ? cleanEpTitle(link.name, 'Video Streamtape').slice(0, 80) : null;
    if (t && !/\s/.test(t) && !t.endsWith(')') && /^[\w-]{6,}$/.test(t)) t = null;
    if (!t) t = 'Video externo (renómbrame ✎)';
    const s = { id, t, jp: '🎬', tag: 'Streamtape · Enlace', g: 6, kind: 'pelicula', poster: null, episodes: [{ n: 1, t: '▶ Ver', url: videoUrl }] };
    const gen = detectMovieGenre(s.t); if (gen) applyMovieGenre(s, gen);
    created.push(s);
  } else if (link.type === 'mega-file' || link.type === 'direct') {
    const id = 'file-' + item.url.replace(/[^\w]+/g, '-').slice(0, 60);
    let t = null;
    try { t = decodeURIComponent(item.url.split('#')[0].split('/').pop().split('?')[0]).replace(VIDEO_EXT, '').replace(/[._]+/g, ' ').trim(); } catch (e) { }
    if (t && !/\s/.test(t) && !t.endsWith(')') && /^[\w-]{6,}$/.test(t)) t = null;
    if (!t) t = 'Video externo (renómbrame ✎)';
    const s = { id, t: t.slice(0, 80), jp: '🎬', tag: link.type === 'mega-file' ? 'Mega · Enlace' : 'Enlace directo', g: 6, kind: 'pelicula', poster: null, episodes: [{ n: 1, t: '▶ Ver', url: item.url }] };
    const gen = detectMovieGenre(s.t); if (gen) applyMovieGenre(s, gen);
    created.push(s);
  } else if (link.type === 'mega-folder') {
    throw new Error('carpetas de Mega no se pueden leer (Mega las cifra dentro del enlace) — pega los archivos uno a uno o usa Drive');
  }

  if (!created.length) throw new Error('no se construyó ninguna entrada');
  /* 🗑 dedup DENTRO de la tanda (mismo título creado 2 veces) */
  const iqTitle = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const uniq = [];
  for (const s of created) {
    if (uniq.some(u => u.id !== s.id && iqTitle(u.t) === iqTitle(s.t))) continue;
    uniq.push(s);
  }
  /* 🎬 TMDB: carátula + género para las películas */
  for (const s of uniq) await enrichFromTmdb(s);
  return uniq;
}

/* ═══════════ GitHub: leer y escribir la cola ═══════════ */
async function ghFetchQueue() {
  const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/import-queue.json?t=${Date.now()}`);
  if (r.status === 404) return [];
  if (!r.ok) throw new Error('leer cola: HTTP ' + r.status);
  const j = await r.json();
  return (j && j.queue) || [];
}
async function ghWriteQueue(queue) {
  const base = `https://api.github.com/repos/${REPO}/contents/import-queue.json`;
  const headers = { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json' };
  const content = Buffer.from(JSON.stringify({ v: 1, at: Date.now(), queue }, null, 1)).toString('base64');
  for (let intento = 0; intento < 3; intento++) {
    const get = await fetch(`${base}?ref=${BRANCH}`, { headers });
    let sha = null;
    if (get.ok) sha = (await get.json()).sha;
    const res = await fetch(base, {
      method: 'PUT', headers,
      body: JSON.stringify({ message: '☁ importador nube: ' + new Date().toISOString(), content, branch: BRANCH, ...(sha ? { sha } : {}) }),
    });
    if (res.ok) return true;
    if (res.status === 409) { await sleep(1500); continue; }   /* otro escritor ganó: releer sha y reintentar */
    const err = await res.json().catch(() => ({}));
    throw new Error('escribir cola: ' + (err.message || 'HTTP ' + res.status));
  }
  return false;
}

/* ═══════════ main ═══════════ */
async function main() {
  if (!TOKEN) { console.log('sin GITHUB_TOKEN — nada que hacer'); return; }
  const queue = await ghFetchQueue();
  const now = Date.now();
  const due = queue.filter(q => q.status === 'queued' && (q.nextRetryAt || 0) <= now).slice(0, MAX_ITEMS_PER_RUN);
  if (!due.length) { console.log('☁ nada pendiente — cola al día'); return; }
  console.log(`☁ procesando ${due.length} enlace(s)…`);
  let nDone = 0, nFail = 0;
  for (const item of due) {
    try {
      const created = await processItem(item);
      item.status = 'done';
      item.name = created.map(s => s.t).join(' · ');
      item.payload = created;
      item.error = '';
      item.processedBy = 'cloud';
      nDone++;
      console.log(`  ✅ ${String(item.name).slice(0, 60)}`);
    } catch (e) {
      item.attempts = (item.attempts || 0) + 1;
      item.error = String(e.message || e);
      if (item.attempts >= IQ_MAX_ATTEMPTS) {
        item.status = 'failed-final';
        nFail++;
        console.log(`  ⛔ ${item.url.slice(0, 50)} → ${item.error}`);
      } else {
        item.status = 'queued';
        item.nextRetryAt = Date.now() + IQ_BACKOFF[Math.min(item.attempts - 1, IQ_BACKOFF.length - 1)];
        nFail++;
        console.log(`  ⏳ ${item.url.slice(0, 50)} → reintento ${item.attempts}/${IQ_MAX_ATTEMPTS} (${item.error})`);
      }
    }
    await sleep(500);
  }
  const wrote = await ghWriteQueue(queue);
  console.log(`☁ resultado: ${nDone} importado(s), ${nFail} pendiente(s) — ${wrote ? 'cola actualizada en GitHub' : '⚠ no se pudo escribir la cola'}`);
}
main().catch(e => { console.error('☁ error fatal:', e); process.exit(1); });
