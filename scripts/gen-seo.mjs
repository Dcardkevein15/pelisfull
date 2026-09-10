#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   🗺 GENERADOR SEO — X·STREAM
   Lee catalog.json y genera:
     · ver/<slug>/index.html  (una página estática por serie/película)
     · sitemap.xml            (todas las rutas, con fechas reales)
   TMDB opcional (env TMDB_API_KEY): enriquece con sinopsis/póster.
   Se reejecuta tras cada publicación del catálogo (GitHub Action).
   ═══════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')), '..');
const SITE = 'https://x.yapido.click';
const TMDB_KEY = process.env.TMDB_API_KEY || '';

const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog.json'), 'utf8'));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slugify = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/* sinopsis con TMDB si hay clave (si no, plantilla con datos reales) */
const tmdbCache = new Map();
async function tmdbInfo(t, kind) {
  if (!TMDB_KEY) return null;
  if (tmdbCache.has(t)) return tmdbCache.get(t);
  const tipo = kind === 'pelicula' ? 'movie' : 'tv';
  try {
    const r = await fetch(`https://api.themoviedb.org/3/search/${tipo}?api_key=${TMDB_KEY}&language=es-ES&query=${encodeURIComponent(t)}&page=1`);
    const j = await r.json();
    const top = (j.results || [])[0];
    const out = top ? { overview: top.overview || '', poster: top.poster_path ? `https://image.tmdb.org/t/p/w500${top.poster_path}` : null, year: (top.release_date || top.first_air_date || '').slice(0, 4) } : null;
    tmdbCache.set(t, out);
    await new Promise(r => setTimeout(r, 120)); /* respeto al rate limit */
    return out;
  } catch (e) { return null; }
}

/* textos ricos según tipo — contenido real, no relleno */
function sinopsisDe(s, tmdb) {
  if (tmdb && tmdb.overview && tmdb.overview.length > 40) return tmdb.overview;
  const linked = (s.episodes || []).filter(e => e.url).length;
  const tps = [...new Set((s.episodes || []).map(e => e.season || 1))].length;
  if (s.kind === 'pelicula') {
    return `${s.t} está disponible completa y en español en X·STREAM. Disfrútala gratis, en HD, sin registro y sin cortes. ${linked ? 'Dale al botón de ver ahora y empieza en segundos.' : ''}`;
  }
  return `${s.t} completa en español en X·STREAM: ${linked || (s.episodes || []).length} capítulo${(s.episodes || []).length === 1 ? '' : 's'}${tps > 1 ? ` repartidos en ${tps} temporadas` : ''}. Gratis, sin registro y en HD, lista para maratonear.`;
}

const faqDe = (s) => {
  const tps = [...new Set((s.episodes || []).map(e => e.season || 1))].length;
  const total = (s.episodes || []).length;
  const items = [
    { q: `¿Dónde puedo ver ${s.t} completa y gratis?`, a: `En X·STREAM (${SITE}) la tienes completa y en español, gratis, sin registro y sin publicidad molesta.` },
  ];
  if (s.kind !== 'pelicula' && total > 1) items.push({ q: `¿Cuántos capítulos tiene ${s.t}?`, a: `Actualmente ${total} capítulos${tps > 1 ? ` en ${tps} temporadas` : ''}, todos disponibles en X·STREAM.` });
  items.push({ q: `¿${s.t} está doblada al español?`, a: 'Sí, en español latino o castellano según la fuente, con subtítulos cuando el audio es original.' });
  return items;
};

function pageHtml(s, tmdb) {
  const slug = slugify(s.t);
  const isPeli = s.kind === 'pelicula';
  const linked = (s.episodes || []).filter(e => e.url).length;
  const tps = [...new Set((s.episodes || []).map(e => e.season || 1))].length;
  const poster = (tmdb && tmdb.poster) || s.poster || '';
  const sinopsis = sinopsisDe(s, tmdb);
  const year = tmdb && tmdb.year ? tmdb.year : '';
  const verUrl = `${SITE}/#/${isPeli ? 'pelicula' : 'anime'}/${slug}`;
  const faqs = faqDe(s);
  const jsonLd = isPeli ? {
    '@context': 'https://schema.org', '@type': 'Movie', name: s.t, description: sinopsis,
    image: poster || undefined, datePublished: year ? year + '-01-01' : undefined,
    potentialAction: { '@type': 'WatchAction', target: verUrl },
  } : {
    '@context': 'https://schema.org', '@type': 'TVSeries', name: s.t, description: sinopsis,
    numberOfEpisodes: (s.episodes || []).length || undefined,
    numberOfSeasons: tps > 1 ? tps : undefined,
    image: poster || undefined,
    potentialAction: { '@type': 'WatchAction', target: verUrl },
  };

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ver ${esc(s.t)} online gratis en español${year ? ' (' + year + ')' : ''} — X·STREAM</title>
<meta name="description" content="${esc(synLength(sinopsis))}">
<link rel="canonical" href="${SITE}/ver/${slug}/">
<meta property="og:type" content="${isPeli ? 'video.movie' : 'video.tv_show'}">
<meta property="og:title" content="Ver ${esc(s.t)} online gratis en español">
<meta property="og:description" content="${esc(synLength(sinopsis))}">
<meta property="og:url" content="${SITE}/ver/${slug}/">
${poster ? `<meta property="og:image" content="${esc(poster)}">` : `<meta property="og:image" content="${SITE}/icon.svg">`}
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
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
h1{font-size:clamp(24px,5vw,34px);line-height:1.1;letter-spacing:-.5px}
.cta{display:inline-block;margin-top:16px;background:var(--acid);color:#0a0a0a;font-weight:900;padding:14px 22px;border-radius:14px;text-decoration:none;letter-spacing:.3px;box-shadow:0 12px 30px rgba(216,255,62,.28)}
.cta:hover{filter:brightness(1.06)}
.synopsis{margin-top:22px;color:#c9c9db}
.sec{margin-top:34px;border-top:1px solid var(--line);padding-top:20px}
.sec h2{font-size:17px;margin-bottom:12px}
.faq details{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:8px}
.faq summary{cursor:pointer;font-weight:700;font-size:14px}
.faq p{color:var(--dim);font-size:13.5px;margin-top:8px}
.rel{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
.rel a{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px;font-size:12px;font-weight:600;color:var(--ink);text-decoration:none;display:block;transition:.15s}
.rel a:hover{border-color:var(--acid);transform:translateY(-2px)}
.rel small{color:var(--dim);display:block;margin-top:3px;font-weight:400}
footer{margin-top:44px;color:#55556e;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;text-align:center}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand"><span class="x">X</span> <span>STREAM <em style="color:var(--dim);font-weight:600">· cine &amp; anime gratis</em></span></div>
  <div class="hero">
    ${poster ? `<img src="${esc(poster)}" alt="Póster de ${esc(s.t)}" loading="lazy">` : ''}
    <div class="hbody">
      <h1>Ver ${esc(s.t)} online gratis en español</h1>
      <div class="chips">
        <span class="chip">${isPeli ? '🎬 Película' : '📺 Serie/Anime'}</span>
        ${year ? `<span class="chip">${year}</span>` : ''}
        ${!isPeli && tps > 1 ? `<span class="chip">${tps} temporadas</span>` : ''}
        ${linked ? `<span class="chip">${linked} con enlace</span>` : ''}
      </div>
      <a class="cta" href="${verUrl}">▶ Ver ahora — gratis</a>
    </div>
  </div>
  <p class="synopsis">${esc(sinopsis)}</p>

  <div class="sec faq">
    <h2>Preguntas frecuentes</h2>
    ${faqs.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n    ')}
  </div>

  ${relHtml(s)}
  <footer>X·STREAM · ${SITE.replace('https://', '')} — tu cine libre en español</footer>
</div>
</body>
</html>`;
}

function synLength(t) { let o = t.length > 158 ? t.slice(0, 155).replace(/\s+\S*$/, '') + '…' : t; return o; }

let ALL = [];
function relHtml(s) {
  if (!ALL.length) return '';
  const pool = ALL.filter(x => x.id !== s.id).filter(x => x.kind === s.kind);
  const pick = pool.length >= 4 ? pool : ALL.filter(x => x.id !== s.id);
  /* determinista: cuatro seguidas a partir del hash del slug */
  let h = 0; for (const ch of slugify(s.t)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rel = [];
  for (let i = 0; i < 4 && pick.length; i++) rel.push(pick[(h + i * 7) % pick.length]);
  return `<div class="sec"><h2>También te puede gustar</h2><div class="rel">${rel.map(x =>
    `<a href="${SITE}/ver/${slugify(x.t)}/">${esc(x.t)}<small>${x.kind === 'pelicula' ? '🎬 película' : '📺 anime/serie'}</small></a>`).join('')}</div></div>`;
}

/* ── main ── */
(async () => {
  const series = cat.series || [];
  ALL = series;
  const outDir = path.join(ROOT, 'ver');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const urls = [];
  const vFecha = new Date(cat.v || Date.now()).toISOString().slice(0, 10);
  let n = 0;
  for (const s of series) {
    let slug = slugify(s.t);
    if (!slug) continue;
    if (urls.some(u => u.endsWith('/' + slug + '/'))) slug += '-' + String(s.id).slice(-4);
    const tmdb = await tmdbInfo(s.t, s.kind);
    const dir = path.join(outDir, slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), pageHtml(s, tmdb), 'utf8');
    urls.push(`${SITE}/ver/${slug}/`);
    n++;
  }

  /* sitemap.xml */
  const sm = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${vFecha}</lastmod><priority>1.0</priority></url>
${urls.map(u => `  <url><loc>${u}</loc><lastmod>${vFecha}</lastmod><priority>0.7</priority></url>`).join('\n')}
</urlset>
`;
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sm, 'utf8');
  console.log(`✅ SEO generado: ${n} páginas en ver/ + sitemap.xml (${urls.length + 1} urls)`);
  fs.writeFileSync(path.join(ROOT, 'sitemap-urls.json'), JSON.stringify(urls), 'utf8');
})().catch(e => { console.error(e); process.exit(1); });
