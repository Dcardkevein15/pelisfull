/* manuscript.mjs — ingesta y análisis de manuscritos del autor (PDF/TXT/MD/DOCX/RTF).
   Extrae el texto (pdf.js/mammoth por CDN, carga perezosa), lo trocea si es largo
   y produce el ANÁLISIS que rellena automáticamente todo el encargo de la wizard. */

import {
  buildManuscriptAnalysisPrompt, buildChunkDigestPrompt, buildManuscriptSynthesisPrompt,
} from '../prompts/writers.mjs';
import { CATEGORIES } from '../specialists/registry.mjs';
import { truncate, wordCount, sleep } from '../core/utils.mjs';

/* ---------- carga perezosa de librerías CDN (patrón probado de public/director) ---------- */

const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const MAMMOTH_URL = 'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js';
const loaded = new Map();

function loadScript(url) {
  if (loaded.has(url)) return loaded.get(url);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar la librería CDN ' + url + ' (¿sin internet?)'));
    document.head.append(s);
  });
  loaded.set(url, p);
  return p;
}

async function ensurePdfJs() {
  await loadScript(PDFJS_URL);
  if (!window.pdfjsLib) throw new Error('pdf.js no quedó disponible tras cargarse.');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  return window.pdfjsLib;
}

async function ensureMammoth() {
  await loadScript(MAMMOTH_URL);
  if (!window.mammoth) throw new Error('mammoth.js no quedó disponible tras cargarse.');
  return window.mammoth;
}

/* ---------- extracción ---------- */

const MAX_CHARS = 600000; // ~150k palabras: novelas amateur entran; el resto se recorta
const HEAD = 480000, TAIL = 120000;

function clean(t) {
  return String(t || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** TXT/MD con detección de encoding: UTF-8 y, si sale corrupto, Windows-1252. */
async function readFileSmart(file) {
  const buf = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buf);
  const bad = (text.match(/\uFFFD/g) || []).length;
  if (bad > text.length * 0.001) {
    try { text = new TextDecoder('windows-1252').decode(buf); } catch { /* nos quedamos con utf-8 */ }
  }
  return text;
}

async function fromPDF(file, onStage) {
  const pdfjsLib = await ensurePdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const maxPages = Math.min(pdf.numPages, 400);
  let out = '';
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    out += tc.items.map((it) => it.str).join(' ') + '\n\n';
    if (onStage && i % 10 === 0) onStage('Extrayendo PDF — página ' + i + ' de ' + maxPages);
    if (out.length > MAX_CHARS * 1.2) break;
  }
  if (!out.trim()) throw new Error('El PDF no contiene texto extraíble (parece un escaneo de imágenes): usa un PDF de texto o pega el texto directamente.');
  return out;
}

async function fromDOCX(file) {
  const mammoth = await ensureMammoth();
  const buf = await file.arrayBuffer();
  const res = await mammoth.extractRawText({ arrayBuffer: buf });
  if (!res.value.trim()) throw new Error('El DOCX está vacío.');
  return res.value;
}

/** Extrae el texto de cualquier formato soportado, con tope de longitud. */
export async function extractText(file, onStage) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  let raw;
  if (ext === 'pdf') raw = await fromPDF(file, onStage);
  else if (ext === 'docx' || ext === 'doc') raw = await fromDOCX(file);
  else if (ext === 'txt' || ext === 'md' || ext === 'markdown' || ext === 'rtf' || ext === '') raw = await readFileSmart(file);
  else throw new Error('Formato no soportado: .' + ext + ' (usa .pdf, .docx, .txt o .md)');
  let texto = clean(raw);
  let recortado = false;
  if (texto.length > MAX_CHARS) {
    recortado = true;
    texto = texto.slice(0, HEAD) + '\n\n[…extenso central del manuscrito omitido por longitud…]\n\n' + texto.slice(-TAIL);
  }
  if (!texto) throw new Error('El archivo no contiene texto.');
  return { texto, recortado, palabras: wordCount(texto) };
}

/* ---------- troceo para manuscritos largos ---------- */

/* 40k caracteres ≈ 10k tokens de entrada: medido contra la API, un trozo de 90k agotaba
   la puerta de enlace (504 a los 300 s) y uno de 40k responde en ~40 s. */
const CHUNK_CHARS = 40000;

export function chunkText(texto, max = CHUNK_CHARS) {
  const chunks = [];
  let rest = String(texto || '');
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n\n', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = max;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.trim()) chunks.push(rest.trim());
  return chunks;
}

/* ---------- análisis ---------- */

const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

const clampI = (n, dflt) => {
  if (n === null || n === undefined || n === '') return dflt;
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(10, Math.round(v))) : dflt;
};
const s = (v, n = 300) => String(v ?? '').trim().slice(0, n);
const arr = (v, n, map = String) => (Array.isArray(v) ? v.map(map).filter(Boolean).slice(0, n) : []);

/** Normaliza el JSON del análisis: valida categoría, acota intensidades y secciones. */
export function normalizeAnalysis(raw) {
  const categoria = CATEGORY_IDS.has(raw?.categoria) ? raw.categoria : 'drama';
  const secciones = arr(raw?.secciones, 36, (x) => ({
    i: 0, // se renumera abajo
    titulo: s(x?.titulo, 120) || 'Sección',
    resumen: s(x?.resumen, 700),
    textoClave: s(x?.textoClave ?? x?.texto_clave, 500),
    personajes: arr(x?.personajes, 8),
    lugares: arr(x?.lugares, 5),
  }));
  secciones.forEach((x, i) => { x.i = i + 1; });
  return {
    categoria,
    premisa: s(raw?.premisa, 600),
    titulo: s(raw?.titulo, 140),
    tono: s(raw?.tono, 200),
    pov: s(raw?.pov, 80) || 'tercera persona limitada',
    publico: s(raw?.publico, 120) || 'adulto general',
    era: s(raw?.era, 200),
    final: s(raw?.final, 300),
    intensidad: {
      emocion: clampI(raw?.intensidad?.emocion, 8),
      psicologia: clampI(raw?.intensidad?.psicologia, 8),
      accion: clampI(raw?.intensidad?.accion, 5),
      romance: clampI(raw?.intensidad?.romance, 3),
      oscuridad: clampI(raw?.intensidad?.oscuridad, 5),
    },
    temas: arr(raw?.temas, 8),
    personajesCanon: arr(raw?.personajesCanon ?? raw?.personajes_canon, 8, (c) => ({
      nombre: s(c?.nombre, 80) || 'Personaje',
      descripcion: s(c?.descripcion, 1200),
      aparienciaEn: s(c?.aparienciaEn ?? c?.apariencia_en, 1200),
    })),
    fortalezas: arr(raw?.fortalezas, 6),
    debilidades: arr(raw?.debilidades, 8),
    secciones,
  };
}

/**
 * Analiza un manuscrito completo y devuelve todo lo necesario para rellenar
 * automáticamente el encargo (wizard) de una reescritura fiel.
 * CON PUNTOS DE CONTROL: cada parte digerida se entrega por onDigests para que
 * el llamador la persista; con `prev` (mismo archivo y longitud) se REANUDA sin
 * repetir las partes ya analizadas — un fallo o recarga ya no tira el trabajo.
 * @param {object} p { client, archivo, texto, onStage?, signal?, model?, prev?, onDigests? }
 */
export async function analyzeManuscript({ client, archivo, texto, onStage, signal, model, prev, onDigests }) {
  const call = (system, user, maxTokens) =>
    client.chatJSON([{ role: 'system', content: system }, { role: 'user', content: user }], { signal, model, maxTokens });

  const emitirDigests = (partes) => {
    try { onDigests?.({ archivo: String(archivo || 'manuscrito').slice(0, 120), chars: texto.length, partes }); } catch { /* nada */ }
  };

  // ¿Podemos reanudar? Solo si el punto de control es de ESTE archivo exacto.
  const reanudable = prev && prev.archivo === String(archivo || 'manuscrito').slice(0, 120) &&
    Number(prev.chars) === texto.length && Array.isArray(prev.partes);

  const chunks = chunkText(texto);
  let raw;
  if (chunks.length <= 1) {
    onStage?.('Analizando tu manuscrito…');
    const { system, user } = buildManuscriptAnalysisPrompt(archivo, texto);
    raw = await call(system, user, 8000);
  } else {
    let partes = reanudable ? prev.partes.slice(0, chunks.length) : [];
    const yaHechas = partes.length;
    for (let i = yaHechas; i < chunks.length; i++) {
      if (signal?.aborted) throw new Error('Cancelado');
      onStage?.('Analizando tu manuscrito — parte ' + (i + 1) + ' de ' + chunks.length + '…');
      const { system, user } = buildChunkDigestPrompt(i + 1, chunks.length, chunks[i]);
      partes.push(await call(system, user, 5000));
      emitirDigests(partes); // punto de control: esta parte ya nunca se repite
      if (i < chunks.length - 1) await sleep(1500); // pausa: no rozar el límite de peticiones
    }
    if (signal?.aborted) throw new Error('Cancelado');
    onStage?.(yaHechas >= chunks.length
      ? 'Reanudando: las ' + yaHechas + ' partes ya estaban analizadas — sintetizando…'
      : 'Sintetizando el análisis completo…');
    const { system, user } = buildManuscriptSynthesisPrompt(archivo, partes);
    raw = await call(system, user, 12000);
  }
  const analisis = normalizeAnalysis(raw);
  onStage?.('Análisis listo');
  return {
    archivo: String(archivo || 'manuscrito').slice(0, 120),
    palabras: wordCount(texto),
    analisis,
    secciones: analisis.secciones,
    personajesCanon: analisis.personajesCanon,
  };
}
