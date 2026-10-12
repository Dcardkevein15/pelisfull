/* writers.mjs — constructores de prompts para cada fase de escritura.
   Cada builder devuelve { system, user }. El JSON de salida está contratado aquí
   y se consume en domain/book.mjs (normalizadores). */

import { phaseSystemPrompt } from '../specialists/registry.mjs';
import { getCategory, CATEGORIES } from '../specialists/registry.mjs';
import { compressBible, lastParagraphs, outlineDigest } from '../domain/continuity.mjs';
import { assetTypeLabel } from '../domain/assets.mjs';

const JSON_ONLY = 'Responde ÚNICAMENTE con JSON válido. Sin markdown, sin explicaciones, sin texto fuera del JSON.';

function idiomaTxt(brief) {
  const map = { es: 'español', en: 'inglés', fr: 'francés', pt: 'portugués', de: 'alemán', it: 'italiano' };
  return map[brief.idioma] || 'español';
}

/** Rango de palabras por párrafo según la extensión pedida. */
function rangoParrafos(brief) {
  const map = {
    compacta: '45-80 palabras, frases secas, ritmo de página pasada',
    normal: '55-120 palabras',
    amplia: '110-180 palabras, prosa que respira y detalla',
  };
  return map[brief.extensionParrafo] || map.normal;
}

function briefBlock(brief, category) {
  const i = brief.intensidad;
  return [
    'ENCARGO DEL AUTOR:',
    '- Género: ' + category.nombre + '. ' + category.tagline,
    brief.premisa ? '- Premisa: ' + brief.premisa : '- Premisa: libre (sorprenónonos).',
    brief.titulo ? '- Título deseado por el autor: "' + brief.titulo + '" (respétalo o mejóralo levemente).' : '',
    '- Idioma de la obra: ' + idiomaTxt(brief) + '.',
    '- Público: ' + (brief.publico || 'adulto general') + '.',
    brief.tono ? '- Tono buscado: ' + brief.tono : '',
    '- Punto de vista: ' + (brief.pov || 'tercera persona') + '.',
    brief.era ? '- Época/escenario: ' + brief.era : '',
    brief.final ? '- Tipo de final deseado: ' + brief.final : '',
    '- Intensidades (0-10): emoción=' + i.emocion + ', psicología=' + i.psicologia + ', acción=' + i.accion + ', romance=' + i.romance + ', oscuridad=' + i.oscuridad + '.',
    brief.notas ? '- Indicaciones adicionales del autor: ' + brief.notas : '',
  ].filter(Boolean).join('\n');
}

function assetsBlock(assets) {
  if (!assets?.length) return '';
  const lines = ['ELEMENTOS APORTADOS POR EL AUTOR (CANON SAGRADO — usa sus nombres exactos tal cual):'];
  for (const a of assets) {
    lines.push('- [' + assetTypeLabel(a.tipo) + '] ' + a.nombre + ': ' + (a.descripcion || a.dnaEn || '(sin descripción)'));
  }
  lines.push('Intégralos orgánicamente en el mundo, la trama y el elenco. Son obligatorios.');
  return lines.join('\n');
}

/* ---------------- FASE 1: CONCEPTO ---------------- */

export function buildConceptPrompt(brief, assets = []) {
  const category = getCategory(brief.categoryId);
  return {
    system: phaseSystemPrompt(category, 'concepto', 'Tu trabajo ahora: concebir la promesa del libro.'),
    user: [
      brief.fuente
        ? 'ESTA OBRA REESCRIBE EL MANUSCRITO DEL AUTOR ("' + brief.fuente.archivo + '"): el título y la premisa vienen del original — respétalos (mejora mínima, sin traicionar).'
        : '',
      briefBlock(brief, category),
      assetsBlock(assets),
      '',
      'Concibe el concepto de este libro y devuelve JSON con estas claves exactas:',
      '{"titulo": "título principal, breve y magnético",',
      ' "subtitulo": "subtítulo que promete el conflicto",',
      ' "logline": "una frase de 25-45 palabras que condensa protagonista + conflicto + gancho",',
      ' "temas": ["tema 1", "tema 2", "tema 3", "tema 4", "tema 5"]}',
      JSON_ONLY,
    ].filter(Boolean).join('\n'),
  };
}

/* ---------------- FASE 2: BIBLIA ---------------- */

export function buildBiblePrompt(brief, concept, assets = []) {
  const category = getCategory(brief.categoryId);
  return {
    system: phaseSystemPrompt(category, 'biblia', 'Tu trabajo ahora: construir la biblia del mundo.'),
    user: [
      'TÍTULO: ' + concept.titulo,
      'LOGLINE: ' + concept.logline,
      '',
      briefBlock(brief, category),
      brief.fuente ? fuenteReglas(brief.fuente) : '',
      brief.fuente ? fuenteSeccionesBlock(brief.fuente) : '',
      brief.fuente ? 'El MUNDO de la biblia se deriva del original (sus lugares, su atmósfera, sus reglas): no inventes un mundo distinto.' : '',
      assetsBlock(assets),
      '',
      'Construye la biblia narrativa y devuelve JSON con estas claves exactas:',
      '{"mundo": "3-6 párrafos: geografía, sociedad, atmósfera, conflicto de fondo — en ' + idiomaTxt(brief) + '",',
      ' "era": "época y calendario de la historia (concreta)",',
      ' "reglas": ["regla del mundo o de la trama 1", "...", "mínimo 5 reglas duras que la trama respetará"],',
      ' "tono_visual_en": "one line in ENGLISH describing the visual style of all illustrations",',
      ' "paleta_en": "one line in ENGLISH with 4-6 exact colors of the palette",',
      ' "cronologia": [{"capitulo": 1, "evento": "qué ocurre en el mundo en ese punto"}]  (esqueleto de 4-6 hitos)}',
      JSON_ONLY,
    ].join('\n'),
  };
}

/* ---------------- FASE 3: PERSONAJES ---------------- */

export function buildCharactersPrompt(brief, concept, bible, assets = []) {
  const category = getCategory(brief.categoryId);
  const assetChars = (assets || []).filter((a) => a.tipo === 'personaje');
  const otros = (assets || []).filter((a) => a.tipo !== 'personaje');
  return {
    system: phaseSystemPrompt(category, 'personajes', 'Tu trabajo ahora: diseñar elenco y psicología.'),
    user: [
      'TÍTULO: ' + concept.titulo,
      'LOGLINE: ' + concept.logline,
      'MUNDO: ' + (bible.mundo || ''),
      '',
      briefBlock(brief, category),
      brief.fuente ? fuenteReglas(brief.fuente) : '',
      brief.fuente ? 'El ELENCO PROVIENE DEL ORIGINAL: usa sus personajes con nombre, rol, herida y voz extraídos del manuscrito (los que aparecen como canon del autor son obligatorios).' : '',
      assetChars.length ? assetsBlock(assetChars) : '',
      otros.length ? assetsBlock(otros) : '',
      '',
      'Diseña 4-6 personajes canónicos' + (assetChars.length ? ' — los personajes del autor son OBLIGATORIOS y deben aparecer en la lista con sus nombres exactos, enriquecidos por ti:' : ':'),
      'devuelve JSON con estas claves exactas:',
      '{"personajes": [{',
      '  "nombre": "nombre propio memorable",',
      '  "rol": "protagonista | antagonista | aliado | Mentor | secundario",',
      '  "edad": "aproximada",',
      '  "apariencia_en": "physical description IN ENGLISH: face, hair color and style, eyes, skin, build — repeat exactly in every panel",',
      '  "vestuario_en": "full wardrobe IN ENGLISH with exact colors and materials (locked for the whole book)",',
      '  "rasgo_distintivo_en": "one unique visual signature IN ENGLISH (scar, tattoo, pendant...)",',
      '  "personalidad": "3-4 rasgos concretos en ' + idiomaTxt(brief) + '",',
      '  "voz": "cómo habla: ritmo, muletillas, nivel de lengua",',
      '  "herida": "la herida psicológica que lo gobierna",',
      '  "deseo": "lo que cree querer",',
      '  "necesita": "lo que realmente necesita",',
      '  "arco": "transformación de inicio a fin en una frase"}]}',
      JSON_ONLY,
    ].join('\n'),
  };
}

/* ---------------- FASE 4: ESQUEMA ---------------- */

export function buildOutlinePrompt(brief, concept, bible, characters, assets = []) {
  const category = getCategory(brief.categoryId);
  const count = brief.capitulos.modo === 'fijo' ? brief.capitulos.cantidad : null;
  const elenco = (characters || []).map((c) => c.nombre + ' (' + c.rol + ')').join(', ');
  return {
    system: phaseSystemPrompt(category, 'esquema', count
      ? 'El autor exige EXACTAMENTE ' + count + ' capítulos. La estructura se reparte con precisión quirúrgica.'
      : 'El autor te da libertad: elige entre 12 y 22 capítulos según lo que la historia pida.'),
    user: [
      'TÍTULO: ' + concept.titulo,
      'LOGLINE: ' + concept.logline,
      'MUNDO: ' + (bible.mundo || '').slice(0, 900),
      'REGLAS:\n' + (bible.reglas || []).map((r) => '- ' + r).join('\n'),
      'ELENCO: ' + elenco,
      '',
      briefBlock(brief, category),
      brief.fuente ? fuenteReglas(brief.fuente) : '',
      brief.fuente ? fuenteSeccionesBlock(brief.fuente) : '',
      '',
      count
        ? 'Debes proponer EXACTAMENTE ' + count + ' capítulos. Ni uno más, ni uno menos.'
        : 'Propón entre 12 y 22 capítulos (tú decides la cifra exacta que la historia necesite).',
      brief.fuente
        ? 'Esquema de REESCRITURA: los capítulos deben CUBRIR TODAS las secciones del canon en su orden. En cada capítulo indica qué secciones cubre (índices de la lista del canon).'
        : '',
      'Reparte la estructura con precisión: arranque, complication, punto medio que lo cambie todo, complicación creciente, clímax y resolución.',
      'Devuelve JSON con estas claves exactas:',
      '{"capitulos": [{',
      '  "numero": 1,',
      '  "titulo": "título del capítulo, evocador",',
      '  "proposito": "para qué existe este capítulo en el arco",',
      '  "sinopsis": "2-3 frases de lo que ocurre",',
      '  "latido_emocional": "qué siente el lector aquí",',
      '  "cliffhanger": "cómo termina con la herida abierta",',
      '  "escenarios": ["lugar 1", "lugar 2"],',
      '  "personajes_clave": ["nombres del elenco"],',
      '  "secciones_fuente": ' + (brief.fuente ? '[1, 2]' : '[índices del canon que cubre, solo en reescrituras]') + ',',
      '  "es_punto_medio": false,',
      '  "es_climax": false}]}',
      JSON_ONLY,
    ].filter(Boolean).join('\n'),
  };
}

/* ---------------- FASE 5: ESCRITURA DE CAPÍTULO ---------------- */

export function buildChapterPrompt(book, chapterIdx) {
  const category = getCategory(book.brief.categoryId);
  const K = book.brief.parrafosPorCapitulo;
  const chapter = book.chapters[chapterIdx];
  return {
    system: phaseSystemPrompt(category, 'escritura',
      'Escribes el capítulo ' + chapter.numero + ' de ' + book.chapters.length + ': "' + chapter.titulo + '".'),
    user: [
      compressBible(book),
      '',
      book.brief.fuente ? fuenteReglas(book.brief.fuente) : '',
      book.brief.fuente ? fuenteCapituloBlock(book.brief.fuente, chapter, book.chapters.length) : '',
      book.brief.fuente
        ? 'Escribe este capítulo VERSIONANDO las secciones del original asignadas: mismos sucesos y nombres (según la fidelidad pactada), prosa de nivel editorial. No resumas: dramatiza.'
        : '',
      '',
      'ESQUEMA COMPLETO DEL LIBRO (contexto, no lo repitas):',
      outlineDigest(book),
      '',
      'CAPÍTULO A ESCRIBIR — ' + chapter.numero + '. ' + chapter.titulo + ':',
      'Sinopsis: ' + chapter.sinopsis,
      'Propósito: ' + chapter.proposito,
      'Latido emocional: ' + chapter.latidoEmocional,
      'Cliffhanger previsto: ' + chapter.cliffhanger,
      '',
      'CONTINUIDAD OBLIGATORIA:',
      lastParagraphs(book, chapterIdx),
      '',
      'ESCRIBE EXACTAMENTE ' + K + ' PÁRRAFOS. Cada párrafo: ' + rangoParrafos(book.brief) + ', nivel literario máximo.',
      'Roles válidos por párrafo: narracion | dialogo | accion | revelacion | climax.',
      'Los diálogos van integrados en el párrafo con su línea hablada entrecomillada, con la voz exacta de cada personaje.',
      'Devuelve JSON con estas claves exactas:',
      '{"titulo_capitulo": "título final",',
      ' "parrafos": [{"texto": "el párrafo en ' + idiomaTxt(book.brief) + '",',
      '   "rol": "narracion",',
      '   "personajes_presentes": ["nombres canónicos exactos"],',
      '   "lugar": "dónde ocurre", "momento_dia": "hora y luz"}],',
      ' "cliffhanger": "la herida abierta final",',
      ' "notas_continuidad": "qué debe recordarse en el próximo capítulo"}',
      JSON_ONLY,
    ].join('\n'),
  };
}

/* ---------------- FASE 6: PASE DE IMPACTO ---------------- */

export function buildImpactPrompt(book, chapterIdx) {
  const category = getCategory(book.brief.categoryId);
  const chapter = book.chapters[chapterIdx];
  const current = chapter.paragraphs.map((p, i) => 'Párrafo ' + (i + 1) + ' (' + p.rol + '): ' + p.texto).join('\n\n');
  return {
    system: phaseSystemPrompt(category, 'impacto',
      'Este capítulo es estructuralmente clave (' + (chapter.esPuntoMedio ? 'punto medio' : chapter.esClimax ? 'clímax' : chapter.numero === 1 ? 'apertura' : chapter.numero === book.chapters.length ? 'final' : 'bisagra') + '). Tu segunda pasada debe elevarlo a memorable sin cambiar la trama.'),
    user: [
      'TÍTULO DEL LIBRO: ' + book.meta.titulo,
      'CAPÍTULO ' + chapter.numero + ' — ' + chapter.titulo,
      'CLIFFHANGER PREVISTO: ' + chapter.cliffhanger,
      '',
      'VERSIÓN ACTUAL:',
      current,
      '',
      'Reescribe ELEVANDO: subtexto más afilado, imágenes más viscerales, ritmo más exacto, diálogo con más filo.',
      'Conserva: la trama, los personajes presentes, los lugares y el cliffhanger (mejorarlo está permitido; cambiarlo de raíz, no).',
      'Devuelve EXACTAMENTE ' + chapter.paragraphs.length + ' párrafos con el MISMO contrato JSON que la versión actual:',
      '{"titulo_capitulo":"…","parrafos":[{"texto":"…","rol":"…","personajes_presentes":[…],"lugar":"…","momento_dia":"…"}],"cliffhanger":"…","notas_continuidad":"…"}',
      JSON_ONLY,
    ].join('\n'),
  };
}

/* ---------------- EXTRAS: PREMISAS E IDEAS ---------------- */

export function buildPremiseIdeasPrompt(category, n = 3) {
  return {
    system: phaseSystemPrompt(category, 'concepto', 'Mode turbo: propón premisas irresistibles.'),
    user: [
      'Propón ' + n + ' premisas originales para una historia de ' + category.nombre + '.',
      'Cada una: protagonista con nombre, conflicto concreto, gancho único en una sola frase de 25-45 palabras.',
      'Devuelve JSON: {"premisas": ["…", "…", "…"]}',
      JSON_ONLY,
    ].join('\n'),
  };
}

/* ================= MANUSCRITO DEL AUTOR (perfeccionar libro propio) ================= */

const CATEGORY_IDS_TXT = CATEGORIES.map((c) => c.id).join(', ');

const ANALYSIS_SYSTEM = `Eres un EDITOR LITERARIO FORENSE de una editorial de prestigio.
Tu oficio: leer manuscritos amateur completos y extraer su ADN exacto — lo que son, lo que prometen y lo que fallan —
para que una sala de especialistas los reescriba con oficio manteniendo su alma.
Lees con respeto y criticas con precisión quirúrgica. Respondes ÚNICAMENTE con JSON válido.`;

const ANALYSIS_CONTRACT = [
  '{"categoria": "género dominante — uno de: ' + CATEGORY_IDS_TXT + '",',
  ' "titulo": "título del libro (el del autor, o el mejorado si el original es flojo)",',
  ' "tono": "tono dominante del manuscrito",',
  ' "pov": "punto de vista — uno de: primera persona | tercera persona limitada | tercera omnisciente | múltiples puntos de vista",',
  ' "publico": "público ideal",',
  ' "era": "época y escenario (concretos)",',
  ' "final": "cómo termina (1 frase, para orientar la reescritura sin traicionarlo)",',
  ' "premisa": "logline FIEL al libro, 25-45 palabras",',
  ' "intensidad": {"emocion": 0-10, "psicologia": 0-10, "accion": 0-10, "romance": 0-10, "oscuridad": 0-10},',
  ' "temas": ["3-6 temas nucleares"],',
  ' "personajesCanon": [{"nombre": "exacto del original", "descripcion": "quién es, su papel y su arco en 2-3 frases", "aparienciaEn": "visual DNA IN ENGLISH: age, hair, eyes, skin, build, exact wardrobe with colors — used to draw them identically"}]  (3-8, en orden de importancia),',
  ' "fortalezas": ["2-5 virtudes reales del manuscrito"],',
  ' "debilidades": ["2-6 flaquezas concretas y accionables: ritmo, clichés, estructura, diálogos planos, final apurado…"],',
  ' "secciones": [{"titulo": "nombre de la sección", "resumen": "2-4 frases de lo que ocurre", "textoClave": "cita literal breve (≤500 caracteres) que capture la voz y la escena clave", "personajes": ["nombres presentes"], "lugares": ["lugares"]}]  (6-24, EN ORDEN CRONOLÓGICO, cubriendo el libro completo de principio a fin)}',
].join('\n');

export function buildManuscriptAnalysisPrompt(archivo, texto) {
  return {
    system: ANALYSIS_SYSTEM,
    user: ['MANUSCRITO COMPLETO DEL AUTOR (archivo: ' + archivo + '):', '', texto, '',
      'Analízalo y devuelve ÚNICAMENTE JSON con este contrato exacto:', ANALYSIS_CONTRACT, JSON_ONLY].join('\n'),
  };
}

export function buildChunkDigestPrompt(idx, total, chunkTextBody) {
  return {
    system: ANALYSIS_SYSTEM,
    user: [
      'PARTE ' + idx + ' DE ' + total + ' del manuscrito del autor:',
      '', chunkTextBody, '',
      'Devuelve el análisis PARCIAL de esta parte (el global se sintetiza después). ÚNICAMENTE JSON:',
      '{"resumenTrozo": "3-5 frases de lo que ocurre en esta parte",',
      ' "personajes": [{"nombre":"exacto","descripcion":"su papel aquí","aparienciaEn":"visual DNA EN si se describe físicamente, si no vacío"}],',
      ' "secciones": [{"titulo":"…","resumen":"2-3 frases","textoClave":"cita literal <=300 caracteres","personajes":[],"lugares":[]}]}',
      'Máximo 6 secciones por parte. Sé concreto y breve: el detalle llega en el análisis global.',
      JSON_ONLY,
    ].join('\n'),
  };
}

export function buildManuscriptSynthesisPrompt(archivo, digests) {
  const parts = digests.map((d, i) =>
    '— PARTE ' + (i + 1) + ': ' + String(d?.resumenTrozo || '') + '\n' +
    ((d?.secciones || []).map((s2) => '  · ' + String(s2?.titulo || '') + ': ' + String(s2?.resumen || '') + (s2?.textoClave ? ' | "' + String(s2.textoClave).slice(0, 300) + '"' : '')).join('\n')) +
    '\n  personajes: ' + (d?.personajes || []).map((p) => String(p?.nombre || '')).join(', ')
  ).join('\n\n');
  return {
    system: ANALYSIS_SYSTEM,
    user: [
      'SÍNTESIS: estos son los análisis parciales de un mismo manuscrito (archivo: ' + archivo + '):',
      '', parts, '',
      'Fusiona todo en el ANÁLISIS GLOBAL del libro (deduplica personajes, respeta el orden cronológico).',
      'Devuelve ÚNICAMENTE JSON con este contrato exacto:', ANALYSIS_CONTRACT, JSON_ONLY,
    ].join('\n'),
  };
}

/* ---------------- bloques de reescritura (se inyectan solo si brief.fuente existe) ---------------- */

export const FIDELIDADES = {
  fieles: 'FIDELIDAD ALTA: la trama, el orden de las escenas, los personajes y el final del original SON INAMOVIBLES. Tu trabajo es ELEVAR la prosa, el ritmo, las imágenes y los diálogos sin cambiar la sustancia.',
  equilibrada: 'FIDELIDAD EQUILIBRADA: conserva el arco, los personajes nucleares y el final. Puedes fusionar escenas menores, añadir tensión, mejorar cliffhangers y reordenar detalles al servicio del ritmo.',
  audaz: 'FIDELIDAD AUDAZ: el original es semilla. Puedes reimaginar escenas, subtramas e incluso el final, preservando el alma: temas y protagonistas.',
};

export const PROSAS = {
  pulir: 'NIVEL DE PROSA — PULIR: respeta la voz del autor; corrige clichés, repeticiones y desequilibrios con toques mínimos.',
  editorial: 'NIVEL DE PROSA — EDITORIAL: reescritura editorial plena dentro de la fidelidad pactada: ritmo, subtexto, imágenes.',
  reinventar: 'NIVEL DE PROSA — PLENA VOZ DE LA SALA: máximo brillo literario con el estilo de los especialistas del género.',
};

/** Reglas de reescritura: fidelidad + prosa + qué preservar + indicaciones del autor. */
export function fuenteReglas(fuente) {
  if (!fuente) return '';
  const lines = [
    'ESTA OBRA ES LA REESCRITURA PROFESIONAL DEL MANUSCRITO PROPIO DEL AUTOR ("' + (fuente.archivo || 'manuscrito') + '").',
    FIDELIDADES[fuente.nivelFidelidad] || FIDELIDADES.equilibrada,
    PROSAS[fuente.nivelProsa] || PROSAS.editorial,
  ];
  if (fuente.preservar?.nombres) lines.push('Los NOMBRES de los personajes del original se respetan EXACTAMENTE.');
  if (fuente.preservar?.final) lines.push('El FINAL del original se mantiene tal cual: mejorado en forma, jamás en fondo.');
  if (fuente.preservar?.escenas) lines.push('Las escenas clave del canon de la fuente deben aparecer reconocibles.');
  if (fuente.indicaciones) lines.push('INDICACIONES DE MEJORA DEL AUTOR: ' + fuente.indicaciones);
  lines.push('El original es amateur: el objetivo es entregarlo EDITORIALMENTE PERFECTO sin traicionar su identidad.');
  return lines.join('\n');
}

/** Canon compacto de secciones (para biblia/esquema). */
export function fuenteSeccionesBlock(fuente) {
  const secs = fuente?.canon?.secciones || [];
  if (!secs.length) return '';
  return ['CANON DE LA FUENTE (secciones en orden cronológico — la reescritura debe cubrirlas TODAS):']
    .concat(secs.map((x) => x.i + '. ' + x.titulo + ': ' + x.resumen))
    .join('\n');
}

/** Secciones asignadas a un capítulo concreto (para la escritura). */
export function fuenteCapituloBlock(fuente, chapter, totalChapters) {
  if (!fuente) return '';
  const secs = fuente.canon?.secciones || [];
  if (!secs.length) return '';
  let idxs = Array.isArray(chapter.seccionesFuente) && chapter.seccionesFuente.length
    ? chapter.seccionesFuente
    : null;
  if (!idxs) {
    // reparto proporcional si el esquema no asignó explícitamente
    const from = Math.floor(((chapter.numero - 1) / Math.max(1, totalChapters)) * secs.length);
    const to = Math.max(from + 1, Math.ceil((chapter.numero / Math.max(1, totalChapters)) * secs.length));
    idxs = secs.slice(from, to).map((x) => x.i);
  }
  const asignadas = secs.filter((x) => idxs.includes(x.i));
  if (!asignadas.length) return '';
  return ['SECCIONES DEL ORIGINAL QUE ESTE CAPÍTULO DEBE CUBRIR (respeta su contenido y su orden):']
    .concat(asignadas.map((x) =>
      '— ' + x.titulo + '\n  resumen: ' + x.resumen +
      (x.textoClave ? '\n  voz literal del original: "' + x.textoClave + '"' : '') +
      (x.personajes?.length ? '\n  presentes: ' + x.personajes.join(', ') : '')
    ))
    .join('\n');
}
