#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   📌 PINTEREST — generador de CSV para "Bulk create Pins"
   Lee catalog.json + seo-cache.json + seo-state.json y produce
   pinterest-pins.csv listo para subir en Pinterest Business:
   Business Hub → Crear → Creación masiva (bulk upload).
   · Solo títulos PUBLICADOS (los que ya existen en /ver/…)
   · Solo los que tienen imagen (póster TMDB w500 — vertical 2:3)
   · Pinterest admite hasta 200 pines por archivo
   ═══════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')), '..');
const SITE = 'https://x.yapido.click';

const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog.json'), 'utf8'));
let state = { items: {} }, cache = {};
try { state = JSON.parse(fs.readFileSync(path.join(ROOT, 'seo-state.json'), 'utf8')); } catch {}
try { cache = JSON.parse(fs.readFileSync(path.join(ROOT, 'seo-cache.json'), 'utf8')); } catch {}
const slugOf = new Map(Object.entries(state.items || {}).map(([id, v]) => [id, v.slug]));

const slugify = t => String(t || '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const csvEsc = v => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const rows = [['Title', 'Media URL', 'Pinterest board', 'Thumbnail', 'Description', 'Link', 'Publish date', 'Keywords'].join(',')];
let omitidos = 0;

for (const s of cat.series || []) {
  const slug = slugOf.get(s.id);
  if (!slug) { omitidos++; continue; }                      /* no publicado aún */
  const data = (cache[slugify(s.t)] && cache[slugify(s.t)].data) || null;
  const img = (data && data.poster) || s.poster;
  if (!img) { omitidos++; continue; }                       /* pin sin imagen = no existe */

  const isPeli = s.kind === 'pelicula';
  const board = isPeli ? 'Películas en español' : (s.anime ? 'Anime en español' : 'Series y maratones');
  const year = data && data.year ? ` (${data.year})` : '';
  const title = `Ver ${s.t}${year} online en español`;
  const base = data && data.overview && data.overview.length > 60
    ? data.overview.replace(/\s+/g, ' ').trim().slice(0, 280)
    : `${s.t} completa y en español`;
  const desc = `${base} ▶ Disponible en X·STREAM, gratis y sin registro.`;
  const kw = [s.t, 'ver online', 'en español', isPeli ? 'película' : (s.anime ? 'anime' : 'serie'),
    ...((data && data.genres) || [])].join(', ');
  rows.push([title, img, board, '', desc, `${SITE}/ver/${slug}/`, '', kw].map(csvEsc).join(','));
}

fs.writeFileSync(path.join(ROOT, 'pinterest-pins.csv'), '﻿' + rows.join('\r\n'));
console.log(`📌 pinterest-pins.csv generado: ${rows.length - 1} pines (${omitidos} omitidos por no publicados o sin imagen)`);
