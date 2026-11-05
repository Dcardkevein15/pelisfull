/* continuity.mjs — coherencia visual del libro: semillas, cámaras por beat,
   ADN canónico, dedup de estilo, peso splash, aspecto por encuadre y refs. */

import { hashString, truncate } from '../core/utils.mjs';

/* ---------- semillas ---------- */
export const baseSeed = (bookId) => hashString(bookId) % 2147483647;
export function seedForPanel(bookId, chapterIdx, paraIdx, version = 0) {
  return (baseSeed(bookId) + chapterIdx * 7919 + paraIdx * 131 + version * 104729) % 2147483647;
}

/* ---------- cámaras ---------- */
export const CAMERA_SHOTS = [
  { id: 'establishing_wide', en: 'wide establishing shot of the location', es: 'Plano general' },
  { id: 'full_shot', en: 'full shot showing the entire body and environment', es: 'Plano entero' },
  { id: 'medium_two_shot', en: 'medium two-shot framing both characters', es: 'Plano medio de dos' },
  { id: 'close_up', en: 'emotional close-up on the face', es: 'Primer plano' },
  { id: 'extreme_close_up', en: 'extreme close-up on a telling detail', es: 'Detallísimo' },
  { id: 'over_shoulder', en: 'over-the-shoulder shot', es: 'Sobre el hombro' },
  { id: 'low_angle', en: 'low angle shot looking up, imposing', es: 'Contrapicado' },
  { id: 'high_angle', en: 'high angle shot looking down, vulnerable', es: 'Picado' },
  { id: 'dutch_angle', en: 'dutch tilted angle, unease', es: 'Cámara inclinada' },
  { id: 'pov', en: 'first-person POV shot', es: 'Plano subjetivo' },
  { id: 'birds_eye', en: "bird's-eye view", es: 'Vista cenital' },
  { id: 'profile_medium', en: 'medium profile shot from the side', es: 'Plano medio de perfil' },
  { id: 'tracking', en: 'dynamic tracking shot with motion feel', es: 'Plano en movimiento' },
];

const SUGERIDO_MAP = {
  'plano general': 'establishing_wide', 'general': 'establishing_wide', 'wide': 'establishing_wide',
  'plano entero': 'full_shot', 'entero': 'full_shot',
  'plano medio': 'profile_medium', 'medio': 'profile_medium', 'two shot': 'medium_two_shot',
  'primer plano': 'close_up', 'close up': 'close_up', 'close-up': 'close_up',
  'detalle': 'extreme_close_up', 'extreme close-up': 'extreme_close_up',
  'sobre el hombro': 'over_shoulder', 'over the shoulder': 'over_shoulder',
  'contrapicado': 'low_angle', 'low angle': 'low_angle',
  'picado': 'high_angle', 'high angle': 'high_angle',
  'incluida': 'dutch_angle', 'dutch': 'dutch_angle',
  'subjetivo': 'pov', 'pov': 'pov',
  'cenital': 'birds_eye', "bird's eye": 'birds_eye', 'birds eye': 'birds_eye',
  'perfil': 'profile_medium',
  'seguimiento': 'tracking', 'tracking': 'tracking', 'movimiento': 'tracking',
};

export const ROL_SHOTS = {
  dialogo: ['medium_two_shot', 'over_shoulder', 'profile_medium', 'close_up'],
  accion: ['tracking', 'low_angle', 'full_shot', 'dutch_angle'],
  revelacion: ['extreme_close_up', 'close_up', 'dutch_angle', 'low_angle'],
  climax: ['low_angle', 'dutch_angle', 'close_up', 'pov'],
};

export function cameraFor(chapterIdx, paraIdx, totalParas, sugerido, rol) {
  const norm = String(sugerido || '').toLowerCase().trim();
  const byId = CAMERA_SHOTS.some((s) => s.id === norm) ? norm : null;
  const mapped = byId || SUGERIDO_MAP[norm] || (norm && Object.entries(SUGERIDO_MAP).find(([k]) => norm.includes(k))?.[1]) || null;
  if (paraIdx === 0) return shot('establishing_wide');
  if (paraIdx === totalParas - 1 && totalParas > 2) return shot(chapterIdx % 2 ? 'close_up' : 'establishing_wide');
  if (mapped && mapped !== 'establishing_wide') return shot(mapped);
  const pool = ROL_SHOTS[String(rol || '').toLowerCase()];
  if (pool) return shot(pool[(chapterIdx * 3 + paraIdx * 2) % pool.length]);
  let idx = (chapterIdx * 3 + paraIdx * 2) % CAMERA_SHOTS.length;
  if (idx === 0) idx = 2;
  return CAMERA_SHOTS[idx];
}

export function shot(id) { return CAMERA_SHOTS.find((s) => s.id === id) || CAMERA_SHOTS[0]; }
export const nextCamera = (currentId) => { const i = CAMERA_SHOTS.findIndex((s) => s.id === currentId); return CAMERA_SHOTS[(i + 4) % CAMERA_SHOTS.length]; };

/* ---------- peso splash ---------- */
export function panelPeso(para, totalParas) {
  if (Number(para?.panelVisual?.peso) === 2) return 2;
  if (para?.rol === 'climax' && Number(para?.idx) === Number(totalParas) - 1) return 2;
  return 1;
}

/* ---------- aspecto por encuadre ---------- */
const INTIMATES = new Set(['close_up', 'extreme_close_up', 'over_shoulder', 'profile_medium']);
export function panelsAspectFor(baseAspect, peso, cameraId) {
  if (Number(peso) === 2 && ['16:9', '4:3', '1:1'].includes(baseAspect)) return '16:9';
  if (baseAspect === '16:9' && INTIMATES.has(cameraId)) return '4:3';
  return baseAspect;
}

/* ---------- ADN y biblia ---------- */
export function dnaLine(character) {
  const parts = [character.edad ? character.edad + ' years old' : '', character.aparienciaEn || '', character.vestuarioEn || '', character.rasgoDistintivoEn || ''].filter(Boolean);
  return character.nombre + ' — ' + parts.join('; ') + '. Same face, same outfit in every panel.';
}

export function dnaLineCore(character) {
  const parts = [character.edad ? character.edad + ' years old' : '', character.aparienciaEn || '', character.vestuarioEn || '', character.rasgoDistintivoEn || ''].filter(Boolean);
  return character.nombre + ' — ' + parts.join('; ') + '.';
}

export function compressBible(book) {
  const b = book.biblia || {};
  const lines = [];
  lines.push('TÍTULO: ' + (book.meta.titulo || '(en concepto)'));
  lines.push('LOGLINE: ' + (book.meta.logline || ''));
  if (b.mundo) lines.push('MUNDO: ' + truncate(b.mundo, 500));
  if (b.era) lines.push('ÉPOCA: ' + b.era);
  for (const r of (b.reglas || []).slice(0, 6)) lines.push('REGLA: ' + r);
  lines.push('PERSONAJES (canon inmutable):');
  for (const c of book.personajes || []) {
    lines.push('- ' + dnaLine(c));
    if (c.voz) lines.push('  voz: ' + truncate(c.voz, 160));
    if (c.herida || c.deseo) lines.push('  núcleo: herida=' + truncate(c.herida || '', 120) + ' · deseo=' + truncate(c.deseo || '', 120));
  }
  const cron = (b.cronologia || []).slice(-4);
  if (cron.length) { lines.push('CRONOLOGÍA:'); for (const e of cron) lines.push('- cap ' + (e.capitulo ?? e.cap ?? '?') + ': ' + truncate(e.evento || '', 140)); }
  return lines.join('\n');
}

export function lastParagraphs(book, chapterIdx) {
  if (chapterIdx <= 0) return '(Este es el primer capítulo.)';
  const prev = book.chapters[chapterIdx - 1];
  if (!prev || !prev.paragraphs?.length) return '(Capítulo anterior no disponible.)';
  const last = prev.paragraphs.slice(-2).map((p) => p.texto).join('\n');
  return 'FIN DEL CAPÍTULO ANTERIOR:\n' + truncate(last, 900) + (prev.cliffhanger ? '\nCLIFFHANGER ABIERTO: ' + truncate(prev.cliffhanger, 200) : '');
}

export function outlineDigest(book) {
  return (book.chapters || []).map((c) => 'Cap ' + c.numero + ' — ' + c.titulo + ': ' + truncate(c.sinopsis, 180)).join('\n');
}

/* ---------- estilo dedup ---------- */
export function styleCoreFor(category) {
  const v = category.visual || {};
  return [v.styleEn || 'cinematic graphic-novel panel, rich detail, dramatic composition', v.lighting ? 'lighting: ' + v.lighting : '', 'consistent character design across all panels: identical faces, identical wardrobe, coherent environment continuity'].filter(Boolean).join(', ');
}

export function paletteFor(category, biblia) {
  if (biblia?.paletaEn) return 'color palette: ' + biblia.paletaEn;
  const v = category?.visual || {};
  return v.palette ? 'palette: ' + v.palette : '';
}

export function styleLockFor(category) {
  const v = category.visual || {};
  return [styleCoreFor(category), v.palette ? 'palette: ' + v.palette : ''].filter(Boolean).join(', ');
}

/* ---------- normalizador del guion visual ---------- */
export const CAP_ESTADOS = ['pendiente', 'en_curso', 'ilustrado', 'confirmado'];

export function normalizeVisualPanel(pv) {
  if (!pv || typeof pv !== 'object') return null;
  const dialogo = (Array.isArray(pv.dialogo) ? pv.dialogo : []).map((d) => ({ personaje: String(d?.personaje || '').trim().slice(0, 80), linea: String(d?.linea || '').trim().slice(0, 220) })).filter((d) => d.linea).slice(0, 2);
  return {
    escena_en: String(pv.escena_en || ''), accion_en: String(pv.accion_en || ''),
    lugar_en: String(pv.lugar_en || ''), momento_dia: String(pv.momento_dia || ''),
    clima_luz: String(pv.clima_luz || ''), encuadre: String(pv.encuadre || ''),
    mood: String(pv.mood || ''), peso: Number(pv.peso) === 2 ? 2 : 1, dialogo,
  };
}

/* ---------- referencias ---------- */
export function refsForParagraph(book, paragraph, assetsById, retratosByCharId) {
  const refs = [];
  for (const nombre of paragraph.personajesPresentes || []) {
    const ch = (book.personajes || []).find((c) => c.nombre.toLowerCase() === String(nombre).toLowerCase());
    if (!ch) continue;
    const asset = ch.assetId ? assetsById[ch.assetId] : null;
    if (asset?.dataURL) refs.push(asset.dataURL);
    else if (retratosByCharId?.[ch.id]) refs.push(retratosByCharId[ch.id]);
    if (refs.length >= 3) break;
  }
  return refs;
}
