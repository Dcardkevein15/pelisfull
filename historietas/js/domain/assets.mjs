/* assets.mjs — elenco, objetos, paisajes y situaciones que el usuario aporta
   como canon de la historia (SOLO TEXTO). El ADN visual textual se conserva
   como puente para el Taller de Ilustración (Parte 2); los retratos generados
   y el análisis de imágenes subidas se retiraron con la fase de paneles. */

import { uid, nowISO, truncate } from '../core/utils.mjs';

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
