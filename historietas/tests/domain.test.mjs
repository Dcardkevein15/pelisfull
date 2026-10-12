/* domain.test.mjs — modelo de libro, continuidad y assets. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createBook, normalizeChapter, normalizeOutline, computeStats, keyChapterIndexes, PHASES, normalizeFuente } from '../js/domain/book.mjs';
import { seedForPanel, cameraFor, nextCamera, compressBible, dnaLine, styleLockFor, refsForParagraph, CAMERA_SHOTS } from '../js/domain/continuity.mjs';
import { createAsset, assetDnaLine, generateAssetPortrait } from '../js/domain/assets.mjs';
import { getCategory } from '../js/specialists/registry.mjs';
import { hashString } from '../js/core/utils.mjs';
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
  assert.deepEqual(b.brief.pases, { impacto: true, visual: true });
  assert.equal(b.chapters.length, 0);
  assert.equal(PHASES.length, 8);
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
  assert.equal(norm.paragraphs[0].panel.status, 'pendiente');
  assert.ok(norm.paragraphs.every((p) => p.id));
});

test('computeStats suma capítulos, palabras y paneles', () => {
  const b = createBook(BRIEF);
  b.chapters = [
    { titulo: 'a', paragraphs: [{ texto: 'uno dos tres cuatro', panel: { status: 'ok' } }, { texto: 'cinco', panel: { status: 'error' } }] },
    { titulo: 'b', paragraphs: [{ texto: 'seis', panel: { status: 'pendiente' } }] },
  ];
  computeStats(b);
  assert.equal(b.stats.chapters, 2);
  assert.equal(b.stats.paragraphs, 3);
  assert.equal(b.stats.words, 6);
  assert.equal(b.stats.panels, 3);
  assert.equal(b.stats.panelsOk, 1);
  assert.equal(b.stats.panelsFail, 1);
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

test('las semillas son deterministas y varían por párrafo', () => {
  const s1 = seedForPanel('libro', 0, 0, 0);
  assert.equal(s1, seedForPanel('libro', 0, 0, 0));
  assert.notEqual(s1, seedForPanel('libro', 0, 1, 0));
  assert.notEqual(s1, seedForPanel('otro', 0, 0, 0));
  assert.notEqual(s1, seedForPanel('libro', 0, 0, 1));
});

test('la rotación de cámaras abre con establishing y no repite consecutivos', () => {
  const K = 8;
  const shots = Array.from({ length: K }, (_, i) => cameraFor(0, i, K, '').id);
  assert.equal(shots[0], 'establishing_wide');
  for (let i = 1; i < K; i++) assert.notEqual(shots[i], shots[i - 1], 'repetido en ' + i);
  const sugerido = cameraFor(2, 3, 8, 'contrapicado');
  assert.equal(sugerido.id, 'low_angle');
  assert.equal(nextCamera('establishing_wide').id, CAMERA_SHOTS[4].id);
});

test('compressBible y dnaLine contienen el canon', () => {
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
});

test('styleLockFor inyecta estilo y disciplina de continuidad', () => {
  const cat = getCategory('noir');
  const lock = styleLockFor(cat);
  assert.ok(lock.includes('noir'));
  assert.ok(lock.includes('identical faces'));
});

test('refsForParagraph devuelve las referencias de personajes presentes con imagen', () => {
  const assetAna = createAsset({ nombre: 'Ana', tipo: 'personaje', descripcion: 'x' });
  assetAna.dataURL = 'data:image/png;base64,AAA';
  const assetsById = { [assetAna.id]: assetAna };
  const b = createBook(BRIEF);
  b.personajes = [{ nombre: 'Ana', assetId: assetAna.id }, { nombre: 'Bruno', assetId: 'no-existe' }];
  const refs = refsForParagraph(b, { personajesPresentes: ['ana', 'Bruno'] }, assetsById);
  assert.equal(refs.length, 1);
  assert.equal(refs[0], assetAna.dataURL);
});

test('assets: createAsset y assetDnaLine', () => {
  const a = createAsset({ nombre: 'Llave de sal', tipo: 'objeto', descripcion: 'Abre la puerta 12', dnaEn: 'an iron key with salt crust' });
  assert.equal(a.tipo, 'objeto');
  assert.ok(assetDnaLine(a).includes('Llave de sal'));
  assert.ok(assetDnaLine(a).includes('iron key'));
});

test('generateAssetPortrait dibuja retratos 1:1 (flujo v1.4) con ADN, estilo y semilla determinista', async () => {
  const client = new MockClient();
  const a = createAsset({ nombre: 'Ana', tipo: 'personaje', descripcion: 'la heredera' });
  a.aparienciaEn = 'short black hair, olive skin';
  a.vestuarioEn = 'red wool coat';
  a.rasgoDistintivoEn = 'scar over left eyebrow';

  const blob = await generateAssetPortrait(client, a, { styleEn: 'misty gothic comic' });
  assert.ok(blob.size > 0);
  const call = client.imageCalls[0];
  assert.ok(call.prompt.includes('Character reference portrait of Ana'));
  assert.ok(call.prompt.includes('head and shoulders'), 'retrato clásico del flujo v1.4');
  assert.ok(call.prompt.includes('red wool coat'), 'inyecta el vestuario bloqueado');
  assert.ok(call.prompt.includes('misty gothic comic'), 'inyecta el estilo de la categoría');
  assert.ok(call.prompt.includes('no text'));
  assert.equal(call.aspect, '1:1', '1:1 — la configuración probada con la clave del autor');
  assert.equal(call.seed, hashString(a.id) % 2147483647, 'semilla determinista por asset');

  const client2 = new MockClient();
  await generateAssetPortrait(client2, a, { styleEn: 'misty gothic comic' });
  assert.equal(client2.imageCalls[0].seed, call.seed, 'misma semilla en otra sesión');

  const v2 = new MockClient();
  await generateAssetPortrait(v2, a, { version: 1 });
  assert.notEqual(v2.imageCalls[0].seed, call.seed, 'regenerar cambia la semilla');
});

test('generateAssetPortrait: paisajes y objetos con prompts específicos; ADN ausente usa la descripción', async () => {
  const client = new MockClient();
  const paisaje = createAsset({ nombre: 'La Casa Vela', tipo: 'paisaje', descripcion: 'una casa con hambre entre la niebla' });
  await generateAssetPortrait(client, paisaje, {});
  assert.ok(client.imageCalls[0].prompt.includes('Establishing concept art of La Casa Vela'));
  assert.ok(client.imageCalls[0].prompt.includes('niebla'), 'usa la descripción si no hay ADN');
  assert.equal(client.imageCalls[0].aspect, '1:1');

  const objeto = createAsset({ nombre: 'Llave de sal', tipo: 'objeto', descripcion: 'herrumbre blanca' });
  await generateAssetPortrait(client, objeto, {});
  assert.ok(client.imageCalls[1].prompt.includes('Hero prop concept render of Llave de sal'));
});

test('createBook normaliza idioma y extensión de párrafo', () => {
  const b = createBook({ ...BRIEF, idioma: 'en', extensionParrafo: 'amplia' });
  assert.equal(b.brief.idioma, 'en');
  assert.equal(b.brief.extensionParrafo, 'amplia');
  const d = createBook({ ...BRIEF, extensionParrafo: 'cualquier cosa' });
  assert.equal(d.brief.extensionParrafo, 'normal');
  assert.equal(d.brief.idioma, 'es');
});
