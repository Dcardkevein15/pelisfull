/* assets.mjs — elenco, objetos, paisajes y situaciones que el usuario aporta
   como canon de la historia. Incluye generación de retratos con presupuesto 800
   y anti-filtro automático. */

import { uid, nowISO, truncate, hashString } from '../core/utils.mjs';
import { ensamblarHoja } from '../prompts/budget.mjs';
import { extractJSON } from '../api/client.mjs';

export const ASSET_TYPES = [
  { id: 'personaje', nombre: 'Personaje', icono: '🧑', desc: 'Protagonistas, secundarios, criaturas…' },
  { id: 'objeto', nombre: 'Objeto', icono: '🗝️', desc: 'Artefactos, reliquias, armas, cartas…' },
  { id: 'paisaje', nombre: 'Paisaje', icono: '🏞️', desc: 'Lugares, escenarios, ciudades…' },
  { id: 'situacion', nombre: 'Situación', icono: '🌀', desc: 'Eventos, giros, conflictos obligatorios…' },
];

export const assetTypeLabel = (t) => ASSET_TYPES.find((x) => x.id === t)?.nombre || 'Elemento';

export function createAsset({ bookId, nombre, tipo, descripcion, dnaEn }) {
  return {
    id: uid('asset'),
    bookId: bookId || null,
    nombre: String(nombre || 'Sin nombre').slice(0, 80),
    tipo: ASSET_TYPES.some((t) => t.id === tipo) ? tipo : 'personaje',
    descripcion: String(descripcion || '').slice(0, 4000),
    dnaEn: String(dnaEn || '').slice(0, 2000),
    aparienciaEn: '',
    vestuarioEn: '',
    rasgoDistintivoEn: '',
    createdAt: nowISO(),
  };
}

/** Convierte una descripción textual en ADN visual EN (para assets sin retrato).
    Texto puro: prepara el canon visual que usará el Taller de Ilustración. */
export async function craftAssetDNA(client, { nombre, tipo, descripcion }, { signal } = {}) {
  return client.chat(
    [{ role: 'system', content: 'Eres un director de arte obsesionado con la coherencia visual. Respondes SOLO JSON.' },
      { role: 'user', content: [
        'Convierte esta definición en ADN visual para futuras ilustraciones.',
        'Nombre: ' + nombre, 'Tipo: ' + assetTypeLabel(tipo), 'Definición del autor: ' + descripcion,
        'Devuelve ÚNICAMENTE JSON: {"resumen_es":"…","apariencia_en":"…","vestuario_en":"…","rasgo_distintivo_en":"…"}',
        'apariencia_en, vestuario_en y rasgo_distintivo_en van EN INGLÉS, con colores y materiales exactos.',
      ].join('\n') },
    ],
    { temperature: 0.4, maxTokens: 900, signal },
  );
}

/** Línea de ADN textual del asset para el canon de la historia. */
export function assetDnaLine(asset) {
  const parts = [asset.aparienciaEn || asset.dnaEn || '', asset.vestuarioEn || '', asset.rasgoDistintivoEn || '']
    .filter(Boolean);
  const base = parts.join('. ') || asset.descripcion || '';
  return (asset.nombre + ': ' + truncate(base, 420)).trim();
}

/** Genera el retrato con presupuesto 800 + anti-filtro. */
export async function generateAssetPortrait(client, asset, { aspect = '1:1', styleEn = '', version = 0, signal } = {}) {
  const dna = [asset.aparienciaEn || asset.dnaEn || '', asset.vestuarioEn || '', asset.rasgoDistintivoEn || ''].filter(Boolean).join('; ');
  const base = dna || asset.descripcion || '';
  const head = asset.tipo === 'paisaje' ? 'Establishing concept art of ' + asset.nombre : asset.tipo === 'objeto' ? 'Hero prop concept render of ' + asset.nombre : 'Character reference portrait of ' + asset.nombre;
  const tail = asset.tipo === 'paisaje' ? 'evocative atmosphere, rich environmental detail' : asset.tipo === 'objeto' ? 'on a neutral pedestal, studio lighting, rich material detail' : 'head and shoulders, facing viewer, neutral background, this exact face and wardrobe will be reused in every panel';
  const prompt = ensamblarHoja({ style: styleEn ? styleEn.replace(/,\s*$/, '') : '', head, base, tail, quality: 'high detail, no text, no letters, no watermark, no speech bubbles' });
  let blob;
  try {
    blob = await client.generateImage({ prompt, aspect, seed: (hashString(asset.id) + version * 104729) % 2147483647, signal });
  } catch (e) {
    if (!/CONTENT_FILTERED/i.test(String(e?.message || e))) throw e;
    const baseSuave = await softenPortraitBase(client, asset, base, signal);
    const promptSuave = ensamblarHoja({ style: styleEn ? styleEn.replace(/,\s*$/, '') : '', head, base: baseSuave, tail, quality: 'high detail, no text, no letters, no watermark, no speech bubbles' });
    blob = await client.generateImage({ prompt: promptSuave, aspect, seed: (hashString(asset.id) + 104729 + version * 104729) % 2147483647, signal });
  }
  return blob;
}

async function softenPortraitBase(client, asset, base, signal) {
  const raw = await client.chat([
    { role: 'system', content: 'Eres director de arte de una editorial. Respondes ÚNICAMENTE JSON válido.' },
    { role: 'user', content: [
      'El retrato fue rechazado por el filtro de seguridad.',
      'REESCRIBE la descripción EN INGLÉS manteniendo IDENTIDAD (edad, pelo, piel, complexión, vestuario, rasgo) SIN gore, desnudez o violencia.',
      'Nombre: ' + asset.nombre, 'Original: ' + truncate(base, 600),
      'Devuelve ÚNICAMENTE JSON: {"base_en": "la descripción segura en inglés"}',
    ].join('\n') },
  ], { temperature: 0.3, maxTokens: 500, signal });
  const parsed = extractJSON(raw);
  if (!parsed?.base_en) throw new Error('reescritura anti-filtro sin JSON');
  return String(parsed.base_en).slice(0, 600);
}
