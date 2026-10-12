/* book.mjs — modelo de datos del libro: creación, normalización y estadísticas.
   v3.0: la app es SOLO TEXTO. El libro termina cuando la prosa está escrita;
   las ilustraciones viven en el Taller (Parte 2) — js/studio/. */

import { uid, nowISO, wordCount } from '../core/utils.mjs';

export const PHASES = [
  { id: 'concepto', nombre: 'Concepto', icono: 'spark' },
  { id: 'biblia', nombre: 'Biblia narrativa', icono: 'globe' },
  { id: 'personajes', nombre: 'Personajes', icono: 'mask' },
  { id: 'esquema', nombre: 'Esquema', icono: 'map' },
  { id: 'escritura', nombre: 'Escritura', icono: 'pen' },
  { id: 'impacto', nombre: 'Pase de impacto', icono: 'bolt' },
  { id: 'terminado', nombre: 'Libro terminado', icono: 'book' },
];

export const STATUS_LABEL = {
  cola: 'En cola',
  generando: 'Forjando…',
  pausado: 'Pausado',
  listo: 'Listo',
  fallido: 'Con errores',
};

/** Normaliza el bloque "fuente" (manuscrito propio del autor). */
export function normalizeFuente(f) {
  if (!f || typeof f !== 'object') return null;
  const secs = (Array.isArray(f.canon?.secciones) ? f.canon.secciones : [])
    .slice(0, 36)
    .map((x, i) => ({
      i: i + 1,
      titulo: String(x?.titulo || 'Sección ' + (i + 1)).slice(0, 120),
      resumen: String(x?.resumen || '').slice(0, 700),
      textoClave: String(x?.textoClave || '').slice(0, 500),
      personajes: Array.isArray(x?.personajes) ? x.personajes.map(String).slice(0, 8) : [],
      lugares: Array.isArray(x?.lugares) ? x.lugares.map(String).slice(0, 5) : [],
    }));
  return {
    archivo: String(f.archivo || 'manuscrito').slice(0, 120),
    nivelFidelidad: ['fieles', 'equilibrada', 'audaz'].includes(f.nivelFidelidad) ? f.nivelFidelidad : 'equilibrada',
    nivelProsa: ['pulir', 'editorial', 'reinventar'].includes(f.nivelProsa) ? f.nivelProsa : 'editorial',
    preservar: {
      nombres: f.preservar?.nombres !== false,
      final: f.preservar?.final !== false,
      escenas: f.preservar?.escenas !== false,
    },
    indicaciones: String(f.indicaciones || '').slice(0, 2000),
    canon: {
      tituloOriginal: String(f.canon?.tituloOriginal || '').slice(0, 140),
      premisaOriginal: String(f.canon?.premisaOriginal || '').slice(0, 600),
      secciones: secs,
    },
  };
}

/** Portada editable del libro: autor, año y dedicatoria para adornar la obra. */
export function normalizePortada(p) {
  return {
    autor: String(p?.autor || '').slice(0, 80),
    anio: String(p?.anio || '').slice(0, 12),
    dedicatoria: String(p?.dedicatoria || '').slice(0, 400),
  };
}

export function createBook(brief) {
  const now = nowISO();
  return {
    id: uid('libro'),
    createdAt: now,
    updatedAt: now,
    status: 'cola',
    brief: {
      categoryId: brief.categoryId,
      premisa: brief.premisa || '',
      titulo: brief.titulo || '',
      idioma: brief.idioma || 'es',
      extensionParrafo: ['compacta', 'normal', 'amplia'].includes(brief.extensionParrafo) ? brief.extensionParrafo : 'normal',
      publico: brief.publico || 'adulto general',
      tono: brief.tono || '',
      pov: brief.pov || 'tercera persona',
      era: brief.era || '',
      intensidad: {
        emocion: brief.intensidad?.emocion ?? 8,
        psicologia: brief.intensidad?.psicologia ?? 8,
        accion: brief.intensidad?.accion ?? 5,
        romance: brief.intensidad?.romance ?? 3,
        oscuridad: brief.intensidad?.oscuridad ?? 5,
      },
      capitulos: {
        modo: brief.capitulos?.modo || 'auto',
        cantidad: brief.capitulos?.modo === 'fijo' ? Math.max(2, Math.min(40, brief.capitulos.cantidad | 0)) : null,
      },
      parrafosPorCapitulo: Math.max(3, Math.min(16, brief.parrafosPorCapitulo || 10)),
      final: brief.final || '',
      notas: brief.notas || '',
      assetIds: [...(brief.assetIds || [])],
      pases: {
        impacto: brief.pases?.impacto !== false,
      },
      preview: !!brief.preview, // previsualización: escribir solo el capítulo 1 primero
      fuente: normalizeFuente(brief.fuente),
    },
    meta: {
      titulo: '', subtitulo: '', logline: '', temas: [], categoria: brief.categoryId,
      portada: normalizePortada(brief.portada),
    },
    biblia: { mundo: '', era: '', reglas: [], tonoVisualEn: '', paletaEn: '', cronologia: [] },
    personajes: [],
    chapters: [],
    credits: [],
    progress: { phaseIdx: 0, chaptersDone: 0, log: [] },
    stats: {},
    studio: null, // estado del Taller de Ilustración (Parte 2) — se crea al entrar
  };
}

export function touch(book) {
  book.updatedAt = nowISO();
}

/** Normaliza el JSON de esquema devuelto por el modelo a capítulos internos. */
export function normalizeOutline(raw) {
  const arr = Array.isArray(raw?.capitulos) ? raw.capitulos : Array.isArray(raw) ? raw : [];
  return arr.map((c, i) => ({
    id: uid('cap'),
    numero: Number(c.numero) || i + 1,
    titulo: String(c.titulo || 'Capítulo ' + (i + 1)).slice(0, 120),
    proposito: String(c.proposito || ''),
    sinopsis: String(c.sinopsis || ''),
    latidoEmocional: String(c.latido_emocional || c.latidoEmocional || ''),
    cliffhanger: String(c.cliffhanger || ''),
    escenarios: Array.isArray(c.escenarios) ? c.escenarios.map(String) : [],
    personajesClave: Array.isArray(c.personajes_clave) ? c.personajes_clave.map(String) : (Array.isArray(c.personajesClave) ? c.personajesClave.map(String) : []),
    seccionesFuente: (Array.isArray(c.secciones_fuente) ? c.secciones_fuente : (Array.isArray(c.seccionesFuente) ? c.seccionesFuente : []))
      .map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0).slice(0, 36),
    esPuntoMedio: !!c.es_punto_medio,
    esClimax: !!c.es_climax,
    paragraphs: [],
    escrito: false,
    impacto: { aplicado: false },
  }));
}

/** Normaliza el JSON de un capítulo escrito a párrafos internos. */
export function normalizeChapter(raw, chapter, K) {
  const parrafos = Array.isArray(raw?.parrafos) ? raw.parrafos : [];
  const capped = typeof K === 'number' ? parrafos.slice(0, K) : parrafos;
  const paragraphs = capped.map((p, i) => ({
    id: uid('par'),
    idx: i,
    texto: String(p.texto || '').trim(),
    rol: String(p.rol || 'narracion'),
    personajesPresentes: Array.isArray(p.personajes_presentes) ? p.personajes_presentes.map(String) : [],
    lugar: String(p.lugar || ''),
    momentoDia: String(p.momento_dia || p.momentoDia || ''),
  }));
  const titulo = String(raw?.titulo_capitulo || raw?.titulo || chapter.titulo).slice(0, 120);
  const cliffhanger = String(raw?.cliffhanger || chapter.cliffhanger || '');
  const notas = String(raw?.notas_continuidad || '');
  return { titulo, paragraphs, cliffhanger, notas };
}

export function computeStats(book) {
  let paragraphs = 0, words = 0;
  for (const ch of book.chapters || []) {
    for (const p of ch.paragraphs || []) {
      paragraphs++;
      words += wordCount(p.texto);
    }
  }
  book.stats = {
    chapters: (book.chapters || []).length,
    paragraphs,
    words,
  };
  return book.stats;
}

export function addCredits(book, specialists, phase) {
  for (const s of specialists || []) {
    book.credits.push({ id: s.id, nombre: s.nombre, rol: s.rol, fase: phase, at: nowISO() });
  }
}

/** Capítulos clave para el pase de impacto: apertura, punto medio, clímax y final. */
export function keyChapterIndexes(total) {
  if (total <= 0) return [];
  const set = new Set([0, total - 1]);
  set.add(Math.floor(total / 2));
  if (total >= 3) set.add(total - 2);
  return [...set].filter((i) => i >= 0 && i < total).sort((a, b) => a - b);
}
