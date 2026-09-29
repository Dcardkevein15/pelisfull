#!/usr/bin/env node
/* ═══════════ 🎵 LISTAS DE MÚSICA PRE-COCINADAS ═══════════
   Corre a diario (workflow seo). Por cada género:
     1. UNA búsqueda a archive.org (100-200 canciones, por descargas)
     2. Resuelve la URL directa del MP3 de las primeras 60
     3. Deja assets/music/<genero>.json servido por CDN
   Con esto, miles de usuarios cargan las listas desde x.yapido.click
   en <50ms sin tocar archive.org, y las canciones suenan instantáneo.  */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'assets', 'music');
fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const LATINO_MIX = '(latin OR salsa OR cumbia OR vallenato OR reggaeton OR bachata OR merengue) AND mediatype:audio';

/* ⚠ mismas queries que chat.js (musicDock) — mantener en sincronía */
const CATS = [
  { id: 'reggaeton', q: '(reggaeton OR perreo OR dembow) AND mediatype:audio', alt: 'reggaeton AND mediatype:(audio)' },
  { id: 'pop', q: 'title:(pop) AND mediatype:audio', alt: '(pop hits OR pop music OR "pop latino") AND mediatype:audio' },
  { id: 'salsa', q: '(salsa OR "salsa dura") AND mediatype:audio', alt: 'salsa AND mediatype:(audio)' },
  { id: 'vallenato', q: 'vallenato AND mediatype:audio', alt: '(vallenatos OR "vallenato moderno") AND mediatype:audio' },
  { id: 'merengue', q: 'merengue AND mediatype:audio', alt: '(merengue dominicano OR "merengues") AND mediatype:audio' },
  { id: 'corridos', q: '(corridos OR corrido OR norteno OR "norteño" OR ranchera) AND mediatype:audio', alt: '(corridos OR "musica norteña") AND mediatype:audio' },
  { id: 'mexicana', q: '(mariachi OR ranchera OR "banda sinaloense" OR jarocha) AND mediatype:audio', alt: '(mexican music OR "musica mexicana") AND mediatype:audio' },
  { id: 'bachata', q: 'bachata AND mediatype:audio', alt: '(bachatas OR "bachata romantica") AND mediatype:audio' },
  { id: 'cumbia', q: 'cumbia AND mediatype:audio', alt: '(cumbias OR "cumbia sonidera") AND mediatype:audio' },
  { id: 'electronica', q: '(techno OR house OR electro OR EDM OR trance) AND mediatype:audio', alt: 'collection:netlabels AND mediatype:audio' },
  { id: 'rock', q: '(rock OR "rock en español" OR "rock latino") AND mediatype:audio', alt: 'collection:(netlabels OR etree) AND rock AND mediatype:audio' },
  { id: 'lofi', q: '(lofi OR "lo-fi" OR chillhop OR "study beats") AND mediatype:audio', alt: 'lofi AND mediatype:audio' },
  { id: 'jazz', q: '(jazz OR "jazz latino" OR bossa) AND mediatype:audio', alt: 'collection:(netlabels OR opensource_audio) AND jazz AND mediatype:audio' },
  { id: 'clasica', q: '(classical OR "piano solo" OR orquesta OR sinfonia) AND mediatype:audio', alt: 'collection:(opensource_audio OR librivoxaudio OR "78rpm") AND mediatype:audio' },
];

async function search(q, rows) {
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&fl[]=creator&rows=${rows}&page=1&output=json&sort[]=downloads desc`;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      const j = await r.json();
      return ((j.response || {}).docs || []).filter(d => d.identifier)
        .map(d => ({ id: d.identifier, title: d.title || d.identifier, artist: d.creator || 'archive.org' }));
    } catch (e) { }
    await sleep(1200);
  }
  return [];
}

async function resolveMp3(id) {
  try {
    const r = await fetch(`https://archive.org/metadata/${id}`, { cache: 'no-store' });
    const j = await r.json();
    const files = j.files || [];
    const cand = files.find(x => /MP3/i.test(x.format || '') && x.name && /\.mp3$/i.test(x.name))
      || files.find(x => /\.mp3$/i.test(x.name || ''));
    if (!cand) return null;
    return { url: `https://archive.org/download/${id}/${encodeURIComponent(cand.name).replace(/\+/g, '%20')}`, dur: cand.length || '' };
  } catch (e) { return null; }
}

let total = 0;
for (const cat of CATS) {
  const file = path.join(OUT, cat.id + '.json');
  /* resumable: si ya existe de hace menos de 20h, se salta (para correr
     en tandas sin repetir trabajo)                                */
  if (process.env.RESUME === '1' && fs.existsSync(file)) {
    try {
      const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Date.now() - new Date(prev.at).getTime() < 20 * 3600e3) {
        total += prev.n || 0;
        console.log(`⏭ ${cat.id}: ya fresco (${prev.n || 0} canciones)`);
        continue;
      }
    } catch (e) { }
  }
  let docs = await search(cat.q, 120);
  if (docs.length < 12) docs = docs.concat(await search(cat.alt, 120));
  if (docs.length < 12) docs = docs.concat(await search(LATINO_MIX, 120));
  const seen = new Set(); docs = docs.filter(d => !seen.has(d.id) && seen.add(d.id));
  /* resuelve MP3 de las primeras 60 (las más descargadas) — el resto queda
     para que el infinite scroll del chat lo resuelta al vuelo            */
  const withUrl = [];
  for (const d of docs.slice(0, 60)) {
    const mp3 = await resolveMp3(d.id);
    if (mp3) withUrl.push({ id: d.id, title: d.title, artist: d.artist, url: mp3.url, dur: mp3.dur });
    await sleep(280);                     /* amable con archive.org */
  }
  const rest = docs.slice(60).map(d => ({ id: d.id, title: d.title, artist: d.artist, url: '', dur: '' }));
  const payload = { at: new Date().toISOString(), n: withUrl.length + rest.length, tracks: withUrl.concat(rest) };
  fs.writeFileSync(path.join(OUT, cat.id + '.json'), JSON.stringify(payload), 'utf8');
  total += payload.n;
  console.log(`🎵 ${cat.id}: ${payload.n} canciones (${withUrl.length} con MP3 resuelto)`);
}
console.log(`✅ MÚSICA: ${total} canciones listas en assets/music/ — servidas por CDN, cero llamadas de usuarios a la búsqueda`);
