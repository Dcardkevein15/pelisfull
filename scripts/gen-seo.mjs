#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   🗺 GENERADOR SEO v2 — X·STREAM
   Páginas RICAS por título (anti "thin content"):
     · sinopsis propia única por URL (redactada, no copiada)
     · ficha técnica: dirección, año, géneros, duración…
     · reparto con fotos en miniatura (vía TMDB)
     · sinopsis plegable: visible el principio, botón "ver más"
     · schema.org enriquecido (Movie / TVSeries + migas de pan)
     · PUBLICACIÓN ESCALONADA: máx N títulos nuevos por día
       (env SEO_DAILY_LIMIT, por defecto 8) — nunca de golpe
   Persistencia entre ejecuciones:
     · seo-state.json    → qué está publicado y desde qué fecha
     · seo-cache.json    → caché TMDB (30 días ⇢ no castiga la API)
     · seo-new-urls.json → URLs publicadas en la última ejecución
   TMDB opcional (env TMDB_API_KEY): sin clave compone textos
   solo con datos propios del catálogo (también únicos por URL).
   ═══════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')), '..');
const SITE = 'https://x.yapido.click';
const TMDB_KEY = process.env.TMDB_API_KEY || '';
const DAILY_LIMIT = Math.max(1, parseInt(process.env.SEO_DAILY_LIMIT || '8', 10) || 8);
const FORCE = process.env.SEO_FORCE === '1';   /* ignora el cupo diario */

const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog.json'), 'utf8'));

/* ── utilidades ── */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* ⚠ idéntico a app.js: de él dependen los enlaces #/anime/<slug> */
const slugify = t => String(t || '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const hash = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const joinEs = xs => xs.length <= 1 ? (xs[0] || '') : xs.length === 2 ? `${xs[0]} y ${xs[1]}` : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`;
const clip = (t, n = 155) => t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t;
const normT = x => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── caché TMDB en disco (evita repetir llamadas entre ejecuciones) ── */
const cacheFile = path.join(ROOT, 'seo-cache.json');
let cache = {};
try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch {}
const TTL_HIT = 30 * 86400e3;   /* 30 días si hubo datos  */
const TTL_MISS = 5 * 86400e3;   /* 5 días si no se halló  */

/* ── estado de publicación (qué está online y desde cuándo) ── */
const stateFile = path.join(ROOT, 'seo-state.json');
let state = { items: {}, lastRun: '' };
try { state = { ...state, ...JSON.parse(fs.readFileSync(stateFile, 'utf8')) }; } catch {}
state.items = state.items || {};

/* ── capa TMDB ───────────────────────────────────────────────
   Los títulos del catálogo llegan "sucios" («…latino hd 720p»):
   se limpian antes de buscar y se comprueba que la coincidencia
   sea razonable para no rellenar fichas con datos ajenos.      */
const JUNK = new Set(('pelicula peliculas completa completas completo completos online gratis latino latina castellano castellana espanol español esp sub subs subtitulada subtitulado subtitulos vose dual audio hd full 1080p 720p 480p 2160p 4k uhd brrip bdrip bluray dvdrip webrip hdrip hdtv xvid x264 h264 h265 mega 1link rip ver descargar capitulos episodios temporada temporadas temp dub doblada doblado movie film netflix hbo amazon prime tvn tv').split(' '));
function cleanTitle(t) {
  let x = ' ' + String(t).toLowerCase() + ' ';
  x = x.replace(/[([][^)\]]*[)\]]/g, ' ');
  x = x.replace(/\b(19|20)\d{2}\b/g, ' ');
  x = x.replace(/[^a-z0-9áéíóúñü ]+/gi, ' ');
  return x.split(/\s+/).filter(w => w && !JUNK.has(w)).join(' ').trim();
}
function matchesClean(clean, top) {
  const words = normT(clean).split(' ').filter(w => w.length >= 4);
  if (!words.length) return true;
  const a = normT(top.title || top.name);
  const b = normT(top.original_title || top.original_name);
  return words.some(w => a.includes(w) || b.includes(w));
}

const img = (p, size) => p ? `https://image.tmdb.org/t/p/${size}${p}` : null;
async function tmdbJson(u) { const r = await fetch(u); if (!r.ok) throw new Error('TMDB ' + r.status); return r.json(); }

async function tmdbFor(s) {
  if (!TMDB_KEY) return null;
  const key = slugify(s.t);
  const hit = cache[key];
  const now = Date.now();
  if (hit && now - hit.at < (hit.data ? TTL_HIT : TTL_MISS)) return hit.data;
  let data = null;
  const isPeli = s.kind === 'pelicula';
  const type = isPeli ? 'movie' : 'tv';
  const clean = cleanTitle(s.t);
  try {
    const queries = [...new Set([clean, s.t].filter(Boolean))];
    for (const q of queries) {
      const r = await tmdbJson(`https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_KEY}&language=es-ES&query=${encodeURIComponent(q)}&page=1`);
      await sleep(90);
      const top = (r.results || [])[0];
      if (!top || !matchesClean(clean || q, top)) continue;
      const det = await tmdbJson(`https://api.themoviedb.org/3/${type}/${top.id}?api_key=${TMDB_KEY}&language=es-ES&append_to_response=credits`);
      await sleep(90);
      const crew = (det.credits && det.credits.crew) || [];
      const cast = ((det.credits && det.credits.cast) || []).slice(0, 8)
        .map(c => ({ name: c.name, char: c.character || '', img: img(c.profile_path, 'w185') }));
      let director = null;
      if (isPeli) director = (crew.find(c => c.job === 'Director') || {}).name || null;
      else {
        director = (det.created_by || []).map(p => p.name).filter(Boolean).join(', ') || null;
        if (!director) { const f = crew.find(c => ['Series Director', 'Executive Producer', 'Producer'].includes(c.job)); if (f) director = f.name; }
      }
      data = {
        overview: det.overview || '',
        poster: img(det.poster_path, 'w500'),
        year: (det.release_date || det.first_air_date || '').slice(0, 4) || null,
        original: det.original_title || det.original_name || null,
        genres: (det.genres || []).map(g => g.name),
        runtime: det.runtime || (det.episode_run_time || [])[0] || null,
        rating: det.vote_average ? Math.round(det.vote_average * 10) / 10 : null,
        votes: det.vote_count || 0,
        seasons: det.number_of_seasons || null,
        director, cast,
      };
      break;
    }
  } catch (e) { /* sin red / límite de API → se usan plantillas propias */ }
  cache[key] = { at: now, data };
  return data;
}

/* ── copy único por título ───────────────────────────────────
   Varias familias de frases rotadas por hash del slug + datos
   que solo son ciertos para ESE título (año, géneros, dirección,
   reparto, nº de capítulos) ⇒ cada URL tiene texto propio.     */
function composeCopy(s, d) {
  const h = hash(slugify(s.t));
  const isPeli = s.kind === 'pelicula';
  const eps = s.episodes || [];
  const total = eps.length;
  const tps = [...new Set(eps.map(e => e.season || 1))].length;
  const year = d && d.year;
  const genresTxt = d && d.genres.length ? joinEs(d.genres.map(g => g.toLowerCase())) : null;
  const dir = d && d.director;
  const starsTxt = d && d.cast.length ? joinEs(d.cast.slice(0, 2).map(c => c.name)) : null;

  const openers = [];
  if (year && genresTxt) {
    openers.push(
      `${s.t} (${year}) es ${isPeli ? 'una película' : 'una serie'} de ${genresTxt}${dir ? (isPeli ? ` dirigida por ${dir}` : ` creada por ${dir}`) : ''}${starsTxt ? `, con ${starsTxt} en los papeles principales` : ''}.`,
      `${dir ? (isPeli ? `Dirigida por ${dir}` : `De la mano de ${dir}`) : `Estrenada en ${year}`}${starsTxt ? ` y con ${starsTxt} al frente del reparto` : ''}, ${s.t} es ${isPeli ? 'un filme' : 'una serie'} de ${genresTxt} que sigue entre lo más buscado del catálogo.`,
      `Estrenada en ${year}, ${s.t} combina ${genresTxt}${starsTxt ? ` con el trabajo de ${starsTxt}` : ''}${dir ? ` bajo la dirección de ${dir}` : ''}, y aquí puedes verla completa en español.`
    );
  } else if (year) {
    openers.push(
      `${s.t} se estrenó en ${year} y hoy sigue entre lo más buscado para ver online en español.`,
      `${s.t} (${year}) está disponible en X·STREAM, completa y en español.`
    );
  }
  if (!isPeli && total > 1) {
    openers.push(`${s.t} ya forma parte del catálogo de X·STREAM con ${total} capítulos${tps > 1 ? ` repartidos en ${tps} etapas` : ''} disponibles en español.`);
  }
  openers.push(
    `${s.t} está disponible en X·STREAM para ver online, completa y en español.`,
    `En X·STREAM ya puedes ver ${s.t} completa y en español, sin registro y sin cortes.`
  );
  const intro = openers[h % openers.length];

  const overview = d && d.overview && d.overview.length > 40 ? d.overview : null;

  const closers = isPeli ? [
    `Aquí la tienes completa, en español y en buena calidad: pulsa el botón de ver ahora y empieza en segundos, sin registrarte.`,
    `Puedes verla entera en esta misma página: en español, gratis y sin crear ninguna cuenta.`,
    `La película completa te espera con un solo clic: español, HD y sin publicidad intrusiva.`,
  ] : (total ? [
    `Reúne ${total} capítulos${tps > 1 ? ` en ${tps} temporadas` : ''}, todos disponibles aquí en español: elige episodio y dale al play.`,
    `En X·STREAM encuentras sus ${total} episodios${tps > 1 ? ` de ${tps} temporadas` : ''} en español, gratis y sin registro.`,
    `Maratón completo: ${total} capítulos${tps > 1 ? ` en ${tps} temporadas` : ''} en español, gratis y en buena calidad.`,
  ] : [
    `Está completa aquí, en español: entra y dale al play.`,
    `Disponible completa y en español, gratis y sin registro.`,
    `Gratis, en español y en buena calidad: empieza cuando quieras.`,
  ]);
  const cierre = closers[(h >> 4) % closers.length];

  return { intro, overview, cierre };
}

/* ── ficha técnica (dirección, año, géneros, duración…) ── */
function fichaHtml(s, d) {
  const isPeli = s.kind === 'pelicula';
  const eps = s.episodes || [];
  const tps = [...new Set(eps.map(e => e.season || 1))].length;
  const rows = [];
  if (d && d.original && normT(d.original) !== normT(s.t)) rows.push(['Título original', d.original]);
  if (d && d.director) rows.push([isPeli ? 'Dirección' : 'Creada por', d.director]);
  if (d && d.year) rows.push([isPeli ? 'Estreno' : 'Primera emisión', d.year]);
  if (d && d.genres.length) rows.push(['Géneros', joinEs(d.genres)]);
  if (isPeli && d && d.runtime) rows.push(['Duración', `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}min`]);
  if (!isPeli) rows.push(['Disponible aquí', `${eps.length} capítulo${eps.length === 1 ? '' : 's'}${tps > 1 ? ` en ${tps} temporadas` : ''}`]);
  if (d && d.rating && d.votes >= 50) rows.push(['Puntuación TMDB', `★ ${d.rating}/10 (${d.votes.toLocaleString('es-ES')} valoraciones)`]);
  rows.push(['Idioma', isPeli ? 'Español (latino o castellano según la fuente)' : 'Español latino, castellano o subtitulado según el episodio']);
  return `<dl class="ficha">${rows.map(([k, v]) => `<div class="fr"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

/* ── reparto con fotos en miniatura ── */
function castHtml(d) {
  if (!d || !d.cast || !d.cast.length) return '';
  return `<div class="sec"><h2>Reparto principal</h2><div class="cast">${d.cast.map(c => `
    <figure>${c.img ? `<img src="${esc(c.img)}" alt="${esc(c.name)}" loading="lazy" width="185" height="278">` : `<div class="noimg" aria-hidden="true">${esc(String(c.name || '?').trim().charAt(0).toUpperCase())}</div>`}
    <figcaption><b>${esc(c.name)}</b>${c.char ? `<span>${esc(c.char)}</span>` : ''}</figcaption></figure>`).join('')}</div></div>`;
}

/* ── preguntas frecuentes (con datos reales cuando existen) ── */
function faqHtml(s, d) {
  const isPeli = s.kind === 'pelicula';
  const eps = s.episodes || [];
  const tps = [...new Set(eps.map(e => e.season || 1))].length;
  const items = [
    { q: `¿Dónde puedo ver ${s.t} completa y gratis?`, a: `En X·STREAM (${SITE}) la tienes ${isPeli ? 'completa' : `con ${eps.length} capítulos disponibles`} y en español, gratis, sin registro y sin publicidad molesta.` },
  ];
  if (d && d.director) items.push({ q: `¿Quién está detrás de ${s.t}?`, a: `${isPeli ? 'La dirige' : 'Es una creación de'} ${d.director}${d.year ? ` y se estrenó en ${d.year}` : ''}${d.cast && d.cast.length ? `, con ${joinEs(d.cast.slice(0, 2).map(c => c.name))} en el reparto principal` : ''}.` });
  if (!isPeli && eps.length > 1) items.push({ q: `¿Cuántos capítulos tiene ${s.t}?`, a: `Actualmente ${eps.length} capítulos${tps > 1 ? ` en ${tps} temporadas` : ''}, todos disponibles en X·STREAM.` });
  items.push({ q: `¿${s.t} está doblada al español?`, a: 'Sí, en español latino o castellano según la fuente, con subtítulos cuando el audio es original.' });
  return items.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n    ');
}

/* ── relacionados (interlinking interno, determinista) ── */
let ALL = [];
let slugOf = new Map();           /* id de catálogo → slug publicado */
function relHtml(s) {
  if (!ALL.length) return '';
  const pool = ALL.filter(x => x.id !== s.id && x.kind === s.kind);
  const pick = pool.length >= 4 ? pool : ALL.filter(x => x.id !== s.id);
  const h = hash(slugify(s.t));
  const rel = [];
  for (let i = 0; i < 4 && pick.length; i++) rel.push(pick[(h + i * 7) % pick.length]);
  return `<div class="sec"><h2>También te puede gustar</h2><div class="rel">${rel.map(x =>
    `<a href="${SITE}/ver/${slugOf.get(x.id) || slugify(x.t)}/">${esc(x.t)}<small>${x.kind === 'pelicula' ? '🎬 película' : '📺 anime/serie'}</small></a>`).join('')}</div></div>`;
}

/* ── CSS de la plantilla (tokens de la v1 + bloques nuevos) ── */
const PAGE_CSS = `
:root{--bg:#07070d;--card:#101018;--line:#20202f;--ink:#f4f4fb;--dim:#9a9ab2;--acid:#d8ff3e;--hot:#ff2e63}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,sans-serif;line-height:1.55}
.wrap{max-width:760px;margin:0 auto;padding:22px 16px 60px}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:22px;font-weight:900;letter-spacing:2px;font-size:13px}
.brand .x{background:var(--acid);color:#111;border-radius:10px;width:34px;height:34px;display:grid;place-items:center;font-size:20px}
.hero{display:flex;gap:18px;align-items:flex-start;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:18px;flex-wrap:wrap}
.hero img{width:150px;border-radius:12px;display:block}
.hero .hbody{flex:1;min-width:220px}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}
.chip{background:#181826;border:1px solid var(--line);border-radius:999px;padding:4px 10px;font-size:11px;color:var(--dim);font-weight:600;letter-spacing:1px;text-transform:uppercase}
.chip.rate{color:var(--acid);border-color:#3a3a1a}
h1{font-size:clamp(24px,5vw,34px);line-height:1.1;letter-spacing:-.5px}
.cta{display:inline-block;margin-top:16px;background:var(--acid);color:#0a0a0a;font-weight:900;padding:14px 22px;border-radius:14px;text-decoration:none;letter-spacing:.3px;box-shadow:0 12px 30px rgba(216,255,62,.28)}
.cta:hover{filter:brightness(1.06)}
.syn{margin-top:22px}
.syn .intro{color:#c9c9db}
.more{margin-top:12px}
.more>summary{cursor:pointer;list-style:none;display:inline-flex;align-items:center;gap:8px;color:var(--acid);font-weight:700;font-size:13.5px;border:1px solid var(--line);border-radius:999px;padding:9px 16px;background:#12121c;transition:.15s}
.more>summary:hover{border-color:var(--acid)}
.more>summary::-webkit-details-marker{display:none}
.more .t-close{display:none}
.more[open] .t-open{display:none}
.more[open] .t-close{display:inline}
.more-body{margin-top:14px;display:grid;gap:14px}
.more-body p{color:#c9c9db}
.more-body .cierre{color:var(--dim);font-size:14.5px}
.ficha{display:block;border:1px solid var(--line);border-radius:14px;overflow:hidden}
.ficha .fr{display:grid;grid-template-columns:150px 1fr;gap:12px;padding:10px 14px;background:var(--card)}
.ficha .fr:nth-child(even){background:#0c0c14}
.ficha dt{color:var(--dim);font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding-top:2px}
.ficha dd{font-size:14px}
.sec{margin-top:34px;border-top:1px solid var(--line);padding-top:20px}
.sec h2{font-size:17px;margin-bottom:12px}
.cast{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:12px}
.cast figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.cast img{width:100%;aspect-ratio:2/3;object-fit:cover;display:block}
.cast .noimg{width:100%;aspect-ratio:2/3;display:grid;place-items:center;font-size:34px;font-weight:900;color:var(--dim);background:#15151f}
.cast figcaption{padding:8px 9px 10px}
.cast b{display:block;font-size:12.5px;line-height:1.25}
.cast span{display:block;color:var(--dim);font-size:11px;margin-top:2px;line-height:1.3}
details{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:8px}
summary{cursor:pointer;font-weight:700;font-size:14px}
.faq p{color:var(--dim);font-size:13.5px;margin-top:8px}
.faq details{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:8px}
.faq summary{cursor:pointer;font-weight:700;font-size:14px}
.more{border:none;background:none;padding:0;margin:12px 0 0}
.rel{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
.rel a{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px;font-size:12px;font-weight:600;color:var(--ink);text-decoration:none;display:block;transition:.15s}
.rel a:hover{border-color:var(--acid);transform:translateY(-2px)}
.rel small{color:var(--dim);display:block;margin-top:3px;font-weight:400}
@media (max-width:560px){.ficha .fr{grid-template-columns:1fr;gap:2px}}
footer{margin-top:44px;color:#55556e;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;text-align:center}`;

/* ── plantilla de página de título ── */
function pageHtml(s, d, slug) {
  const isPeli = s.kind === 'pelicula';
  const eps = s.episodes || [];
  const tps = [...new Set(eps.map(e => e.season || 1))].length;
  const linked = eps.filter(e => e.url).length;
  const poster = (d && d.poster) || s.poster || '';
  const year = d && d.year;
  const { intro, overview, cierre } = composeCopy(s, d);
  const metaDesc = clip(intro);
  const verUrl = `${SITE}/#/${isPeli ? 'pelicula' : 'anime'}/${slug}`;
  const ficha = fichaHtml(s, d);
  const tipoChip = isPeli ? '🎬 Película' : (s.anime ? '🎌 Anime' : '📺 Serie');

  const ldMain = {
    '@context': 'https://schema.org',
    '@type': isPeli ? 'Movie' : 'TVSeries',
    name: s.t,
    alternateName: d && d.original && normT(d.original) !== normT(s.t) ? d.original : undefined,
    description: overview || intro,
    image: poster || undefined,
    datePublished: year ? `${year}-01-01` : undefined,
    genre: d && d.genres.length ? d.genres : undefined,
    director: isPeli && d && d.director ? { '@type': 'Person', name: d.director } : undefined,
    creator: !isPeli && d && d.director ? { '@type': 'Person', name: d.director } : undefined,
    actor: d && d.cast && d.cast.length ? d.cast.slice(0, 6).map(c => ({ '@type': 'Person', name: c.name, image: c.img || undefined })) : undefined,
    duration: isPeli && d && d.runtime ? `PT${Math.floor(d.runtime / 60)}H${d.runtime % 60}M` : undefined,
    numberOfEpisodes: !isPeli && eps.length ? eps.length : undefined,
    numberOfSeasons: !isPeli ? (tps > 1 ? tps : ((d && d.seasons) || undefined)) : undefined,
    aggregateRating: d && d.votes >= 50 && d.rating ? { '@type': 'AggregateRating', ratingValue: d.rating, bestRating: 10, ratingCount: d.votes } : undefined,
    potentialAction: { '@type': 'WatchAction', target: verUrl },
  };
  const ldCrumbs = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'X·STREAM', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: s.t },
    ],
  };

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ver ${esc(s.t)} online gratis en español${year ? ' (' + year + ')' : ''} — X·STREAM</title>
<meta name="description" content="${esc(metaDesc)}">
<link rel="canonical" href="${SITE}/ver/${slug}/">
<meta property="og:type" content="${isPeli ? 'video.movie' : 'video.tv_show'}">
<meta property="og:title" content="Ver ${esc(s.t)} online gratis en español">
<meta property="og:description" content="${esc(metaDesc)}">
<meta property="og:url" content="${SITE}/ver/${slug}/">
<meta property="og:image" content="${esc(poster || SITE + '/icon.svg')}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(ldMain)}</script>
<script type="application/ld+json">${JSON.stringify(ldCrumbs)}</script>
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="wrap">
  <div class="brand"><span class="x">X</span> <span>STREAM <em style="color:var(--dim);font-weight:600">· cine &amp; anime gratis</em></span></div>
  <div class="hero">
    ${poster ? `<img src="${esc(poster)}" alt="Póster de ${esc(s.t)}" loading="lazy">` : ''}
    <div class="hbody">
      <h1>Ver ${esc(s.t)} online gratis en español</h1>
      <div class="chips">
        <span class="chip">${tipoChip}</span>
        ${year ? `<span class="chip">${year}</span>` : ''}
        ${d && d.votes >= 50 && d.rating ? `<span class="chip rate">★ ${d.rating}/10</span>` : ''}
        ${!isPeli && tps > 1 ? `<span class="chip">${tps} temporadas</span>` : ''}
        ${!isPeli && linked ? `<span class="chip">${linked} capítulos</span>` : ''}
      </div>
      <a class="cta" href="${verUrl}">▶ Ver ahora — gratis</a>
    </div>
  </div>
  <div class="syn">
    <p class="intro">${esc(intro)}</p>
    <details class="more">
      <summary><span class="t-open">＋ Ver sinopsis completa y ficha técnica</span><span class="t-close">－ Ocultar información</span></summary>
      <div class="more-body">
        ${overview ? `<p>${esc(overview)}</p>` : ''}
        <p class="cierre">${esc(cierre)}</p>
        ${ficha}
      </div>
    </details>
  </div>
  ${castHtml(d)}
  <div class="sec faq">
    <h2>Preguntas frecuentes</h2>
    ${faqHtml(s, d)}
  </div>
  ${relHtml(s, slug)}
  <footer>X·STREAM · ${SITE.replace('https://', '')} — tu cine libre en español</footer>
</div>
</body>
</html>`;
}

/* ── páginas por CAPÍTULO (long-tail: "ver X capítulo N") ── */
function epPageHtml(s, ep, prev, next, slug, d) {
  const poster = (d && d.poster) || s.poster || '';
  const title = `Ver ${esc(s.t)} capítulo ${ep.n} online gratis en español — X·STREAM`;
  const desc = `Mira ${s.t} capítulo ${ep.n}${ep.t ? ` ("${ep.t}")` : ''} online gratis en español y HD en X·STREAM. Sin registro.`;
  const verUrl = `${SITE}/#/anime/${slug}/${ep.n}`;
  const serieUrl = `${SITE}/ver/${slug}/`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'TVEpisode',
    name: ep.t || `${s.t} — capítulo ${ep.n}`,
    episodeNumber: ep.n,
    partOfSeries: { '@type': 'TVSeries', name: s.t },
  };
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}/ver/${slug}/capitulo-${ep.n}/">
<meta property="og:type" content="video.episode">
<meta property="og:title" content="${esc(`Ver ${s.t} capítulo ${ep.n} — X·STREAM`)}">
<meta property="og:description" content="${esc(desc)}">
${poster ? `<meta property="og:image" content="${esc(poster)}">` : ''}
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
body{margin:0;background:#07070d;color:#f4f4fb;font-family:system-ui,sans-serif;line-height:1.6}
.wrap{max-width:640px;margin:0 auto;padding:40px 20px 60px}
nav{font-size:12px;color:#9a9ab2;letter-spacing:1px;text-transform:uppercase;margin-bottom:16px}
nav a{color:#d8ff3e;text-decoration:none}
h1{font-size:clamp(22px,5vw,30px);letter-spacing:-.4px;line-height:1.15}
.chips{margin:10px 0}
.chip{display:inline-block;background:#181826;border:1px solid #20202f;border-radius:999px;padding:4px 10px;font-size:11px;color:#9a9ab2;font-weight:600;letter-spacing:1px;text-transform:uppercase}
.cta{display:inline-block;margin-top:18px;background:#d8ff3e;color:#0a0a0a;font-weight:900;padding:14px 22px;border-radius:14px;text-decoration:none;box-shadow:0 12px 30px rgba(216,255,62,.28)}
.pn{display:flex;gap:10px;margin-top:22px}
.pn a{flex:1;background:#101018;border:1px solid #20202f;border-radius:12px;padding:12px;color:#f4f4fb;text-decoration:none;font-size:13px;text-align:center}
.pn a:hover{border-color:#d8ff3e}
footer{margin-top:44px;color:#55556e;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;text-align:center}
</style>
</head>
<body>
<div class="wrap">
  <nav><a href="${SITE}/">X·STREAM</a> › <a href="${serieUrl}">${esc(s.t)}</a> › Capítulo ${ep.n}</nav>
  <h1>Ver ${esc(s.t)} capítulo ${ep.n} online gratis</h1>
  <div class="chips"><span class="chip">📺 Capítulo ${ep.n}</span>${ep.t ? `<span class="chip">${esc(String(ep.t).slice(0, 40))}</span>` : ''}</div>
  <a class="cta" href="${verUrl}">▶ Ver ahora — gratis y sin registro</a>
  <div class="pn">
    ${prev ? `<a href="${SITE}/ver/${slug}/capitulo-${prev.n}/">← Capítulo ${prev.n}</a>` : ''}
    ${next ? `<a href="${SITE}/ver/${slug}/capitulo-${next.n}/">Capítulo ${next.n} →</a>` : ''}
  </div>
  <footer>X·STREAM · ${SITE.replace('https://', '')}</footer>
</div>
</body>
</html>`;
}

/* ── orquestador ── */
(async () => {
  const series = (cat.series || []).filter(s => s && s.t && slugify(s.t));
  ALL = series;
  const outRoot = path.join(ROOT, 'ver');
  fs.mkdirSync(outRoot, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);

  /* siembra: las páginas que ya existen cuentan como publicadas */
  if (!Object.keys(state.items).length) {
    const bySlug = new Map();
    for (const s of series) { const k = slugify(s.t); if (!bySlug.has(k)) bySlug.set(k, s); }
    const fechaCat = String(cat.at || '').slice(0, 10) || today;
    for (const d of fs.readdirSync(outRoot)) {
      if (!fs.existsSync(path.join(outRoot, d, 'index.html'))) continue;
      const item = bySlug.get(d);
      if (item) state.items[item.id] = { slug: d, at: fechaCat };
    }
  }

  /* cola priorizada: primero títulos con más capítulos enlazados */
  const pubSlugs = new Set(Object.values(state.items).map(v => v.slug));
  const score = s => (s.episodes || []).filter(e => e.url).length * 4 + Math.min((s.episodes || []).length, 120) + (s.poster ? 20 : 0);
  const pendientes = series.filter(s => !state.items[s.id]).sort((a, b) => score(b) - score(a));

  /* cupo diario: una tanda por día salvo SEO_FORCE=1 */
  const slots = FORCE ? DAILY_LIMIT : (state.lastRun === today ? 0 : DAILY_LIMIT);
  const nuevos = [];
  if (slots > 0) {
    for (const s of pendientes.slice(0, slots)) {
      let slug = slugify(s.t);
      if (pubSlugs.has(slug)) slug = (slug + '-' + String(s.id).replace(/\D+/g, '').slice(-4)).slice(0, 72);
      pubSlugs.add(slug);
      state.items[s.id] = { slug, at: today };
      nuevos.push(s);
    }
  }
  if (nuevos.length) state.lastRun = today;

  slugOf = new Map(Object.entries(state.items).map(([id, v]) => [id, v.slug]));
  const publicados = series.filter(s => state.items[s.id]);
  const esNuevo = new Set(nuevos.map(s => s.id));

  const urls = [];
  const newUrls = [];
  let nEpis = 0;
  for (const s of publicados) {
    const { slug, at } = state.items[s.id];
    const d = await tmdbFor(s);
    const dir = path.join(outRoot, slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), pageHtml(s, d, slug), 'utf8');
    const u = `${SITE}/ver/${slug}/`;
    urls.push([u, at]);
    if (esNuevo.has(s.id)) newUrls.push(u);
    if (s.kind !== 'pelicula') {
      const eps = (s.episodes || []).filter(e => e.url);
      for (let i = 0; i < eps.length; i++) {
        const ep = eps[i];
        const epDir = path.join(dir, 'capitulo-' + ep.n);
        fs.mkdirSync(epDir, { recursive: true });
        fs.writeFileSync(path.join(epDir, 'index.html'), epPageHtml(s, ep, eps[i - 1] || null, eps[i + 1] || null, slug, d), 'utf8');
        const eu = `${SITE}/ver/${slug}/capitulo-${ep.n}/`;
        urls.push([eu, at]);
        if (esNuevo.has(s.id)) newUrls.push(eu);
        nEpis++;
      }
    }
  }

  const sm = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod><priority>1.0</priority></url>
${urls.map(([u, at]) => `  <url><loc>${u}</loc><lastmod>${at || today}</lastmod><priority>0.7</priority></url>`).join('\n')}
</urlset>
`;
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sm, 'utf8');
  fs.writeFileSync(path.join(ROOT, 'sitemap-urls.json'), JSON.stringify(urls.map(x => x[0])), 'utf8');
  fs.writeFileSync(path.join(ROOT, 'seo-new-urls.json'), JSON.stringify(newUrls), 'utf8');
  fs.writeFileSync(stateFile, JSON.stringify(state), 'utf8');
  fs.writeFileSync(cacheFile, JSON.stringify(cache), 'utf8');

  const quedan = pendientes.length - nuevos.length;
  console.log(`✅ SEO v2: +${nuevos.length} títulos hoy (cupo ${DAILY_LIMIT}/día${FORCE ? ', forzado' : ''}) · publicados ${publicados.length}/${series.length} · ${nEpis} páginas de capítulo · sitemap ${urls.length + 1} urls · en cola: ${quedan}`);
})().catch(e => { console.error(e); process.exit(1); });
