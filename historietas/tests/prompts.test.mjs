/* prompts.test.mjs — contratos de los builders de prompts de TEXTO (v3.0).
   El guion visual y los paneles viven en el Taller (Parte 2): aquí solo
   se contrata la prosa. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createBook, normalizeChapter, normalizeOutline, normalizeFuente, normalizePortada } from '../js/domain/book.mjs';
import {
  buildConceptPrompt, buildBiblePrompt, buildCharactersPrompt, buildOutlinePrompt,
  buildChapterPrompt, buildImpactPrompt, buildPremiseIdeasPrompt,
  buildManuscriptAnalysisPrompt, buildChunkDigestPrompt, buildManuscriptSynthesisPrompt,
  fuenteReglas, fuenteSeccionesBlock, fuenteCapituloBlock,
} from '../js/prompts/writers.mjs';
import { createAsset } from '../js/domain/assets.mjs';
import { getCategory } from '../js/specialists/registry.mjs';
import { TEXT_MODELS } from '../js/api/models.mjs';

const FUENTE = normalizeFuente({
  archivo: 'mi-libro.pdf',
  nivelFidelidad: 'fieles', nivelProsa: 'editorial',
  preservar: { nombres: true, final: true, escenas: false },
  indicaciones: 'Corregir: final apurado',
  canon: {
    tituloOriginal: 'La Casa que Susurra', premisaOriginal: 'Una arquitecta hereda una casa.',
    secciones: [
      { titulo: 'La herencia', resumen: 'Ana recibe la casa.', textoClave: 'La casa respiraba.', personajes: ['Ana'], lugares: ['la casa'] },
      { titulo: 'La primera puerta', resumen: 'Ana abre la puerta.', textoClave: 'La puerta ya estaba abierta.', personajes: ['Ana'], lugares: ['la casa'] },
    ],
  },
});

const BRIEF = {
  categoryId: 'horror', premisa: 'Una casa con hambre', idioma: 'es',
  capitulos: { modo: 'fijo', cantidad: 15 }, parrafosPorCapitulo: 10,
  intensidad: { emocion: 8, psicologia: 9, accion: 4, romance: 1, oscuridad: 9 },
};

test('todos los builders devuelven system + user no vacíos', () => {
  const cat = getCategory('horror');
  const assets = [createAsset({ nombre: 'Casa Vela', tipo: 'paisaje', descripcion: 'Se come huéspedes' })];
  for (const b of [
    buildConceptPrompt(BRIEF, assets),
    buildBiblePrompt(BRIEF, { titulo: 'X', logline: 'Y' }, assets),
    buildCharactersPrompt(BRIEF, { titulo: 'X', logline: 'Y' }, { mundo: 'M' }, assets),
    buildOutlinePrompt(BRIEF, { titulo: 'X', logline: 'Y' }, { mundo: 'M', reglas: ['r'] }, [{ nombre: 'Ana', rol: 'protagonista' }], assets),
    buildPremiseIdeasPrompt(cat, 3),
  ]) {
    assert.ok(b.system.length > 300, 'system corto');
    assert.ok(b.user.length > 100, 'user corto');
    assert.ok(b.system.includes('DOCTRINA'));
  }
});

test('el prompt de esquema exige la cifra exacta en modo fijo', () => {
  const { user } = buildOutlinePrompt(BRIEF, { titulo: 'X', logline: 'Y' }, { mundo: 'M', reglas: [] }, [], []);
  assert.ok(user.includes('EXACTAMENTE 15 capítulos'));
});

test('los assets del autor entran como canon en todos los prompts de diseño', () => {
  const assets = [createAsset({ nombre: 'Perla Negra', tipo: 'objeto', descripcion: 'Un dije que chista sangre' })];
  const { user } = buildCharactersPrompt(BRIEF, { titulo: 'X', logline: 'Y' }, { mundo: 'M' }, assets);
  assert.ok(user.includes('Perla Negra'));
  assert.ok(user.includes('CANON SAGRADO'));
  const { user: u2 } = buildConceptPrompt(BRIEF, assets);
  assert.ok(u2.includes('Perla Negra'));
});

test('el prompt de capítulo pide el número exacto de párrafos con el contrato de PROSA', async () => {
  const book = createBook(BRIEF);
  book.meta.titulo = 'Casa';
  book.meta.logline = 'log';
  book.personajes = [{ nombre: 'Ana', rol: 'protagonista', aparienciaEn: 'x', vestuarioEn: 'y' }];
  book.biblia.mundo = 'M';
  const outline = normalizeOutline({ capitulos: [
    { numero: 1, titulo: 'Uno', sinopsis: 's', cliffhanger: 'c' },
    { numero: 2, titulo: 'Dos', sinopsis: 's2', cliffhanger: 'c2' },
  ] });
  book.chapters = outline;
  const { user, system } = buildChapterPrompt(book, 1);
  assert.ok(user.includes('ESCRIBE EXACTAMENTE 10 PÁRRAFOS'));
  assert.ok(user.includes('55-120 palabras'), 'extensión normal por defecto');
  assert.ok(user.includes('personajes_presentes'));
  assert.ok(!user.includes('encuadre_sugerido'), 'v3.0: sin campos visuales en el contrato de prosa');
  assert.ok(!user.includes('escena_en'), 'v3.0: sin descripción de escena pintable');
  assert.ok(user.includes('CAPÍTULO A ESCRIBIR — 2'));
  assert.ok(system.includes('Escribes el capítulo 2 de 2'));
});

test('la extensión de párrafo y el idioma del encargo cambian el contrato de escritura', () => {
  const compacta = createBook({ ...BRIEF, extensionParrafo: 'compacta' });
  const { user: uCompacta } = buildChapterPrompt({ ...compacta, meta: { titulo: 'T', logline: 'l' }, biblia: { mundo: '', reglas: [] }, personajes: [], chapters: [{ numero: 1, titulo: 'X', sinopsis: '', proposito: '', latidoEmocional: '', cliffhanger: '', paragraphs: [] }] }, 0);
  assert.ok(uCompacta.includes('45-80'), 'compacta');

  const amplia = createBook({ ...BRIEF, extensionParrafo: 'amplia' });
  const { user: uAmplia } = buildChapterPrompt({ ...amplia, meta: { titulo: 'T', logline: 'l' }, biblia: { mundo: '', reglas: [] }, personajes: [], chapters: [{ numero: 1, titulo: 'X', sinopsis: '', proposito: '', latidoEmocional: '', cliffhanger: '', paragraphs: [] }] }, 0);
  assert.ok(uAmplia.includes('110-180'), 'amplia');

  const ingles = createBook({ ...BRIEF, idioma: 'en' });
  const { user: uEn } = buildChapterPrompt({ ...ingles, meta: { titulo: 'T', logline: 'l' }, biblia: { mundo: '', reglas: [] }, personajes: [], chapters: [{ numero: 1, titulo: 'X', sinopsis: '', proposito: '', latidoEmocional: '', cliffhanger: '', paragraphs: [] }] }, 0);
  assert.ok(uEn.includes('inglés'), 'el idioma del encargo llega al contrato');
});

test('el registro de modelos es SOLO texto (v3.0)', () => {
  assert.equal(TEXT_MODELS.filter((m) => m.recomendado).length, 1);
  assert.ok(TEXT_MODELS.every((m) => m.id && m.nombre && m.desc));
});

/* ============ reescritura de manuscrito propio (fuente) ============ */

test('buildManuscriptAnalysisPrompt trae el contrato completo y la lista de categorías', () => {
  const { system, user } = buildManuscriptAnalysisPrompt('mi-libro.pdf', 'EL TEXTO DEL AUTOR');
  assert.ok(system.includes('EDITOR LITERARIO'));
  assert.ok(user.includes('EL TEXTO DEL AUTOR'));
  assert.ok(user.includes('"personajesCanon"'));
  assert.ok(user.includes('"debilidades"'));
  for (const id of ['thriller', 'misterio', 'romantica', 'noir', 'infantil']) assert.ok(user.includes(id));
});

test('digest de trozos y síntesis cubren novelas largas', () => {
  const d = buildChunkDigestPrompt(2, 5, 'TROZO DOS');
  assert.ok(d.user.includes('PARTE 2 DE 5'));
  assert.ok(d.user.includes('"resumenTrozo"'));
  const s = buildManuscriptSynthesisPrompt('novela.md', [{ resumenTrozo: 'r', secciones: [{ titulo: 'S', resumen: 'x', textoClave: 'k' }], personajes: [{ nombre: 'Ana' }] }]);
  assert.ok(s.user.includes('SÍNTESIS'));
  assert.ok(s.user.includes('PARTE 1'));
  assert.ok(s.user.includes('"personajesCanon"'));
});

test('fuenteReglas compone fidelidad, prosa, preservación e indicaciones', () => {
  const r = fuenteReglas(FUENTE);
  assert.ok(r.includes('FIDELIDAD ALTA'));
  assert.ok(r.includes('EDITORIAL'));
  assert.ok(r.includes('NOMBRES'));
  assert.ok(r.includes('FINAL del original'));
  assert.ok(!r.includes('escenas clave'), 'escenas no preservadas no se exigen');
  assert.ok(r.includes('Corregir: final apurado'));
  assert.equal(fuenteReglas(null), '');
});

test('fuenteSeccionesBlock lista el canon numerado', () => {
  const b = fuenteSeccionesBlock(FUENTE);
  assert.ok(b.includes('1. La herencia'));
  assert.ok(b.includes('2. La primera puerta'));
  assert.equal(fuenteSeccionesBlock(null), '');
});

test('fuenteCapituloBlock asigna secciones explícitas o por reparto proporcional', () => {
  const ch1 = { numero: 1, seccionesFuente: [1] };
  const b1 = fuenteCapituloBlock(FUENTE, ch1, 2);
  assert.ok(b1.includes('La herencia'));
  assert.ok(b1.includes('La casa respiraba.'));
  assert.ok(!b1.includes('La primera puerta'));
  const ch2 = { numero: 2, seccionesFuente: [] };
  const b2 = fuenteCapituloBlock(FUENTE, ch2, 2);
  assert.ok(b2.includes('La primera puerta'));
  assert.ok(b2.includes('La puerta ya estaba abierta.'));
  assert.equal(fuenteCapituloBlock(null, ch1, 2), '');
});

test('las fases de forja solo hablan de reescritura cuando hay fuente', () => {
  const briefCon = { ...BRIEF, fuente: FUENTE };
  const briefSin = { ...BRIEF };

  const bibliaCon = buildBiblePrompt(briefCon, { titulo: 'X', logline: 'Y' }, []);
  assert.ok(bibliaCon.user.includes('CANON DE LA FUENTE'));
  assert.ok(bibliaCon.user.includes('FIDELIDAD ALTA'));
  const bibliaSin = buildBiblePrompt(briefSin, { titulo: 'X', logline: 'Y' }, []);
  assert.ok(!bibliaSin.user.includes('CANON DE LA FUENTE'));

  const esquemaCon = buildOutlinePrompt(briefCon, { titulo: 'X', logline: 'Y' }, { mundo: 'M', reglas: [] }, [], []);
  assert.ok(esquemaCon.user.includes('secciones_fuente'));
  assert.ok(esquemaCon.user.includes('CUBRIR TODAS las secciones'));

  const conceptoCon = buildConceptPrompt(briefCon, []);
  assert.ok(conceptoCon.user.includes('REESCRIBE EL MANUSCRITO'));
  const conceptoSin = buildConceptPrompt(briefSin, []);
  assert.ok(!conceptoSin.user.includes('REESCRIBE'));
});

test('el prompt de capítulo de una reescritura recibe sus secciones del original', () => {
  const book = createBook(BRIEF);
  book.brief.fuente = FUENTE;
  book.meta.titulo = 'Casa';
  book.personajes = [{ nombre: 'Ana', rol: 'protagonista', aparienciaEn: 'x', vestuarioEn: 'y' }];
  book.biblia.mundo = 'M';
  book.chapters = normalizeOutline({ capitulos: [
    { numero: 1, titulo: 'Uno', sinopsis: 's', secciones_fuente: [1] },
    { numero: 2, titulo: 'Dos', sinopsis: 's2', secciones_fuente: [2] },
  ] });
  const { user } = buildChapterPrompt(book, 0);
  assert.ok(user.includes('SECCIONES DEL ORIGINAL'));
  assert.ok(user.includes('La casa respiraba.'));
  assert.ok(!user.includes('La puerta ya estaba abierta.'), 'el cap 1 solo ve su sección asignada');
  const { user: u2 } = buildChapterPrompt(book, 1);
  assert.ok(u2.includes('La puerta ya estaba abierta.'));
});

test('portada: el autor, año y dedicatoria se normalizan y acotan', () => {
  const p = normalizePortada({ autor: 'Nombre Muy Largo '.repeat(20), anio: '2026', dedicatoria: 'Para todos'.repeat(200) });
  assert.ok(p.autor.length <= 80, 'autor acotado');
  assert.equal(p.anio, '2026');
  assert.ok(p.dedicatoria.length <= 400, 'dedicatoria acotada');
  const vacio = normalizePortada(null);
  assert.deepEqual(vacio, { autor: '', anio: '', dedicatoria: '' });
});
