/* domain.test.mjs — modelo de libro, continuidad textual y elenco (v3.0).
   Las semillas, cámaras y pesos visuales viven en el Taller (Parte 2). */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createBook, normalizeChapter, normalizeOutline, computeStats, keyChapterIndexes, PHASES, normalizeFuente, normalizePortada } from '../js/domain/book.mjs';
import { compressBible, dnaLine, lastParagraphs, outlineDigest } from '../js/domain/continuity.mjs';
import { createAsset, assetDnaLine, craftAssetDNA } from '../js/domain/assets.mjs';
import { getCategory } from '../js/specialists/registry.mjs';
import { MockClient } from './helpers.mjs';

const BRIEF = {
  categoryId: 'thriller',
  premisa: 'Una arquitecta hereda una casa imposible.',
  capitulos: { modo: 'fijo', cantidad: 2 },
  parrafosPorCapitulo: 3,
};

test('createBook crea el esqueleto con defaults coherentes', () => {
  const b = createBook(BRIEF);
  assert.equal(b.status, 'cola');
  assert.equal(b.brief.categoryId, 'thriller');
  assert.equal(b.brief.capitulos.cantidad, 2);
  assert.equal(b.brief.parrafosPorCapitulo, 3);
  assert.deepEqual(b.brief.pases, { impacto: true });
  assert.equal(b.studio, null, 'el Taller se abre al entrar (Parte 2)');
  assert.deepEqual(b.meta.portada, { autor: '', anio: '', dedicatoria: '' });
  assert.equal(b.chapters.length, 0);
  assert.equal(PHASES.length, 7, 'v3.0: sin fase visual');
  assert.ok(PHASES.every((p) => p.id !== 'visual'));
});

test('createBook acota los parámetros extremos', () => {
  const b = createBook({ ...BRIEF, capitulos: { modo: 'fijo', cantidad: 99 }, parrafosPorCapitulo: 200, intensidad: { emocion: 50 } });
  assert.equal(b.brief.capitulos.cantidad, 40);
  assert.equal(b.brief.parrafosPorCapitulo, 16);
  assert.equal(b.brief.intensidad.emocion, 50); // el dosificador se conserva, el prompt lo traduce
});

test('normalizeOutline e normalizeChapter rellenan ids y recortan al tope', () => {
  const raw = { capitulos: [{ numero: 1, titulo: 'Uno' }, { titulo: 'Dos' }] };
  const out = normalizeOutline(raw);
  assert.equal(out.length, 2);
  assert.ok(out[0].id && out[1].id);
  assert.equal(out[1].numero, 2);

  const chapter = normalizeOutline(raw)[0];
  const rawCh = { titulo_capitulo: 'T', parrafos: [
    { texto: 'a', rol: 'narracion', personajes_presentes: ['Ana'] },
    { texto: 'b' },
    { texto: 'c' }, { texto: 'd' }, // sobra uno
  ] };
  const norm = normalizeChapter(rawCh, chapter, 3);
  assert.equal(norm.paragraphs.length, 3);
  assert.equal(norm.paragraphs[0].personajesPresentes[0], 'Ana');
  assert.ok(norm.paragraphs.every((p) => p.id), 'todo párrafo con id');
  assert.ok(norm.paragraphs.every((p) => p.panel === undefined), 'v3.0: sin estado de panel en los párrafos');
});

test('computeStats suma capítulos y palabras (sin paneles)', () => {
  const b = createBook(BRIEF);
  b.chapters = [
    { titulo: 'a', paragraphs: [{ texto: 'uno dos tres cuatro' }, { texto: 'cinco' }] },
    { titulo: 'b', paragraphs: [{ texto: 'seis' }] },
  ];
  computeStats(b);
  assert.equal(b.stats.chapters, 2);
  assert.equal(b.stats.paragraphs, 3);
  assert.equal(b.stats.words, 6);
  assert.equal(b.stats.panels, undefined, 'v3.0: la prosa no tiene paneles');
});

test('keyChapterIndexes marca apertura, medio, penúltimo y final', () => {
  assert.deepEqual(keyChapterIndexes(2), [0, 1]);
  assert.deepEqual(keyChapterIndexes(5), [0, 2, 3, 4]);
  assert.deepEqual(keyChapterIndexes(0), []);
});

test('normalizeFuente acota y corrige el bloque de manuscrito propio', () => {
  assert.equal(normalizeFuente(null), null);
  const f = normalizeFuente({
    archivo: 'x'.repeat(300),
    nivelFidelidad: 'inventado', nivelProsa: 'pulir',
    preservar: { nombres: false, final: false, escenas: true },
    indicaciones: 'mejorar el ritmo',
    canon: {
      secciones: Array.from({ length: 50 }, (_, i) => ({ titulo: 'S' + i, resumen: 'r', textoClave: 'k' })),
      tituloOriginal: 'T', premisaOriginal: 'P',
    },
  });
  assert.equal(f.archivo.length, 120);
  assert.equal(f.nivelFidelidad, 'equilibrada', 'nivel inválido cae a equilibrada');
  assert.equal(f.nivelProsa, 'pulir');
  assert.deepEqual(f.preservar, { nombres: false, final: false, escenas: true });
  assert.equal(f.canon.secciones.length, 36);
  assert.ok(f.canon.secciones.every((s, i) => s.i === i + 1));
  assert.equal(f.canon.tituloOriginal, 'T');
  // por defecto (sin preservar) todo se preserva
  const d = normalizeFuente({ archivo: 'a', canon: { secciones: [] } });
  assert.deepEqual(d.preservar, { nombres: true, final: true, escenas: true });
});

test('createBook lleva la fuente del manuscrito y normalizeOutline recoge las secciones asignadas', () => {
  const b = createBook({ ...BRIEF, fuente: { archivo: 'mi-libro.pdf', canon: { secciones: [{ titulo: 'S', resumen: 'r', textoClave: 'k' }] } } });
  assert.equal(b.brief.fuente.archivo, 'mi-libro.pdf');
  assert.equal(b.brief.fuente.canon.secciones.length, 1);
  const sinFuente = createBook(BRIEF);
  assert.equal(sinFuente.brief.fuente, null);

  const out = normalizeOutline({ capitulos: [
    { numero: 1, titulo: 'A', secciones_fuente: [1, 2, 'x', 0] },
    { numero: 2, titulo: 'B' },
    { numero: 3, titulo: 'C', seccionesFuente: ['3'] },
  ] });
  assert.deepEqual(out[0].seccionesFuente, [1, 2], 'filtra no válidos');
  assert.deepEqual(out[1].seccionesFuente, []);
  assert.deepEqual(out[2].seccionesFuente, [3]);
});

test('normalizePortada acota autor, año y dedicatoria', () => {
  const p = normalizePortada({ autor: 'a'.repeat(300), anio: '2026', dedicatoria: 'd'.repeat(900) });
  assert.ok(p.autor.length <= 80);
  assert.equal(p.anio, '2026');
  assert.ok(p.dedicatoria.length <= 400);
  assert.deepEqual(normalizePortada(undefined), { autor: '', anio: '', dedicatoria: '' });
});

test('compressBible, dnaLine y continuidad textual contienen el canon', () => {
  const b = createBook(BRIEF);
  b.meta.titulo = 'La Casa';
  b.biblia.mundo = 'Mundo X';
  b.biblia.reglas = ['r1'];
  b.personajes = [{ nombre: 'Ana', rol: 'protagonista', edad: '34', aparienciaEn: 'short black hair', vestuarioEn: 'red coat', rasgoDistintivoEn: 'scar' }];
  const txt = compressBible(b);
  assert.ok(txt.includes('La Casa'));
  assert.ok(txt.includes('Ana'));
  assert.ok(txt.includes('red coat'));
  const dna = dnaLine(b.personajes[0]);
  assert.ok(dna.startsWith('Ana —'));
  assert.ok(dna.includes('Same face, same outfit'));
  // el ADN canónico queda en la biblia: el Taller (Parte 2) lo usará para dibujar
});

test('lastParagraphs y outlineDigest sirven la continuidad entre capítulos', () => {
  const b = createBook(BRIEF);
  b.chapters = normalizeOutline({ capitulos: [
    { numero: 1, titulo: 'Uno', sinopsis: 'Ana abre la puerta.', cliffhanger: 'algo la mira' },
    { numero: 2, titulo: 'Dos', sinopsis: 'Ana cierra la puerta.', cliffhanger: '' },
  ] });
  b.chapters[0].paragraphs = [{ texto: 'Primera línea.' }, { texto: 'La última del capítulo uno.' }];
  const prev = lastParagraphs(b, 1);
  assert.ok(prev.includes('La última del capítulo uno.'));
  assert.ok(prev.includes('CLIFFHANGER ABIERTO'));
  assert.equal(lastParagraphs(b, 0), '(Este es el primer capítulo.)');
  const digest = outlineDigest(b);
  assert.ok(digest.includes('Cap 2 — Dos'));
  assert.ok(digest.includes('Ana cierra la puerta.'));
});

test('assets: createAsset y assetDnaLine (canon textual)', () => {
  const a = createAsset({ nombre: 'Llave de sal', tipo: 'objeto', descripcion: 'Abre la puerta 12', dnaEn: 'an iron key with salt crust' });
  assert.equal(a.tipo, 'objeto');
  assert.ok(assetDnaLine(a).includes('Llave de sal'));
  assert.ok(assetDnaLine(a).includes('iron key'));
});

test('craftAssetDNA convierte descripción textual en ADN visual (puente al Taller)', async () => {
  const client = new MockClient();
  client.chat = async () => JSON.stringify({
    resumen_es: 'una llave antigua',
    apariencia_en: 'an ancient iron key crusted with white salt',
    vestuario_en: '',
    rasgo_distintivo_en: 'teeth worn smooth',
  });
  const raw = await craftAssetDNA(client, { nombre: 'Llave de sal', tipo: 'objeto', descripcion: 'llave de la puerta 12' });
  assert.ok(raw.includes('ancient iron key'));
});
