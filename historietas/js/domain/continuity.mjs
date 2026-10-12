/* continuity.mjs — coherencia narrativa del libro: ADN canónico de personajes
   y biblia comprimida. v3.0: solo texto — las semillas, cámaras, pesos y
   referencias visuales viven en el Taller de Ilustración (Parte 2). */

import { truncate } from '../core/utils.mjs';

/* ---------- ADN y biblia ---------- */

/** Línea de ADN canónica EN de un personaje interno.
    El ADN visual del elenco se conserva en la biblia: es el canon que usará
    el Taller de Ilustración (Parte 2) para dibujar cada capítulo. */
export function dnaLine(character) {
  const parts = [
    character.edad ? character.edad + ' years old' : '',
    character.aparienciaEn || character.apariencia_en || '',
    character.vestuarioEn || character.vestuario_en || '',
    character.rasgoDistintivoEn || character.rasgo_distintivo_en || '',
  ].filter(Boolean);
  return character.nombre + ' — ' + parts.join('; ') + '. Same face, same outfit in every panel.';
}

/** Contexto comprimido de la biblia para las llamadas de escritura. */
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
  if (cron.length) {
    lines.push('CRONOLOGÍA:');
    for (const e of cron) lines.push('- cap ' + (e.capitulo ?? e.cap ?? '?') + ': ' + truncate(e.evento || e.descripcion || '', 140));
  }
  return lines.join('\n');
}

/** Últimos párrafos del capítulo anterior + cliffhanger (para continuidad). */
export function lastParagraphs(book, chapterIdx) {
  if (chapterIdx <= 0) return '(Este es el primer capítulo.)';
  const prev = book.chapters[chapterIdx - 1];
  if (!prev || !prev.paragraphs?.length) return '(Capítulo anterior no disponible.)';
  const last = prev.paragraphs.slice(-2).map((p) => p.texto).join('\n');
  return 'FIN DEL CAPÍTULO ANTERIOR:\n' + truncate(last, 900) + (prev.cliffhanger ? '\nCLIFFHANGER ABIERTO: ' + truncate(prev.cliffhanger, 200) : '');
}

/** Lista compacta del esquema completo (títulos + sinopsis en una línea). */
export function outlineDigest(book) {
  return (book.chapters || [])
    .map((c) => 'Cap ' + c.numero + ' — ' + c.titulo + ': ' + truncate(c.sinopsis, 180))
    .join('\n');
}
