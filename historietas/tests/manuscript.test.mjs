/* manuscript.test.mjs — ingesta lógica, troceo, análisis y normalización del manuscrito propio. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, normalizeAnalysis, analyzeManuscript } from '../js/domain/manuscript.mjs';
import { MockClient } from './helpers.mjs';

test('chunkText trocea respetando párrafos y cubre todo el texto', () => {
  const parrafo = 'Un párrafo de relleno con contenido significativo para la prueba. '.repeat(4).trim();
  const largo = Array.from({ length: 1400 }, (_, i) => parrafo + ' #' + i).join('\n\n'); // ~230k chars
  const chunks = chunkText(largo); // límite por defecto: 40k (medido contra la API: 90k agotaba la puerta de enlace)
  assert.ok(chunks.length >= 2, 'debe trocear (' + chunks.length + ')');
  for (const c of chunks) assert.ok(c.length <= 41000, 'trozo demasiado grande: ' + c.length);
  const joined = chunks.join('\n\n').replace(/\n+/g, ' ');
  for (const probe of ['#0', '#700', '#1399']) assert.ok(joined.includes(probe), 'pierde contenido ' + probe);
  // texto corto: un solo trozo
  assert.equal(chunkText('hola mundo').length, 1);
});

test('normalizeAnalysis valida y acota todo lo que el modelo devuelva', () => {
  const raw = {
    categoria: 'no-existe', intensidad: { emocion: 99, psicologia: -3, accion: 'x', romance: 2.7, oscuridad: null },
    secciones: Array.from({ length: 50 }, (_, i) => ({ titulo: 'S' + i, resumen: 'r', texto_clave: 'k', personajes: ['Ana'], lugares: [] })),
    personajesCanon: [{ nombre: 'Ana' }, { nombre: 'B' }, { nombre: 'C' }, { nombre: 'D' }, { nombre: 'E' }, { nombre: 'F' }, { nombre: 'G' }, { nombre: 'H' }, { nombre: 'I' }],
    temas: 'no-array', tono: 'oscuro', premisa: 'p', titulo: 'T', pov: 'primera persona', publico: '', era: '', final: 'f',
  };
  const n = normalizeAnalysis(raw);
  assert.equal(n.categoria, 'drama', 'categoría inválida cae a drama');
  assert.deepEqual(n.intensidad, { emocion: 10, psicologia: 0, accion: 5, romance: 3, oscuridad: 5 });
  assert.equal(n.secciones.length, 36);
  assert.ok(n.secciones.every((s, i) => s.i === i + 1), 'secciones renumeradas');
  assert.equal(n.personajesCanon.length, 8);
  assert.equal(n.publico, 'adulto general');
});

test('normalizeAnalysis respeta el análisis bueno tal cual', () => {
  const n = normalizeAnalysis({
    categoria: 'thriller', premisa: 'p', titulo: 'T', tono: 't', pov: 'primera persona', publico: 'adulto general',
    era: '1999', final: 'f', intensidad: { emocion: 3, psicologia: 4, accion: 5, romance: 6, oscuridad: 7 },
    temas: ['a'], personajesCanon: [{ nombre: 'Ana', descripcion: 'd', aparienciaEn: 'hair' }],
    fortalezas: ['F'], debilidades: ['D'], secciones: [{ titulo: 'S', resumen: 'r', textoClave: 'k', personajes: ['Ana'], lugares: [] }],
  });
  assert.equal(n.categoria, 'thriller');
  assert.equal(n.intensidad.oscuridad, 7);
  assert.equal(n.secciones[0].textoClave, 'k');
  assert.equal(n.personajesCanon[0].aparienciaEn, 'hair');
});

test('analyzeManuscript con texto corto: una sola llamada y análisis normalizado', async () => {
  const client = new MockClient();
  const stages = [];
  const res = await analyzeManuscript({
    client, archivo: 'mi-libro.txt',
    texto: 'La casa respiraba.\n\nAna abrió la puerta uno.',
    onStage: (st) => stages.push(st),
  });
  assert.equal(client._jsonCalls, 1, 'un único análisis');
  assert.equal(res.archivo, 'mi-libro.txt');
  assert.equal(res.analisis.categoria, 'thriller');
  assert.equal(res.analisis.titulo, 'La Casa que Susurra');
  assert.equal(res.secciones.length, 2);
  assert.equal(res.personajesCanon[0].nombre, 'Ana');
  assert.ok(res.palabras >= 6);
  assert.ok(stages.some((s) => s.includes('Analizando')));
});

test('analyzeManuscript con novela larga: digiere por partes y sintetiza', async () => {
  const client = new MockClient();
  const parrafo = 'Ana recorría los pasillos de la casa impossible con la linterna de latón. '.repeat(3).trim();
  const largo = Array.from({ length: 700 }, (_, i) => parrafo + ' P' + i).join('\n\n'); // ~150k chars → 4 trozos de 40k
  const stages = [];
  const checkpoints = [];
  const res = await analyzeManuscript({
    client, archivo: 'novela.md', texto: largo,
    onStage: (st) => stages.push(st),
    onDigests: (cp) => checkpoints.push(cp.partes.length),
  });
  // 4 digests + 1 síntesis
  assert.equal(client._jsonCalls, 5);
  assert.ok(stages.some((s) => s.includes('parte 1 de 4')));
  assert.ok(stages.some((s) => s.includes('Sintetizando')));
  assert.deepEqual(checkpoints, [1, 2, 3, 4], 'cada parte digerida queda a salvo al instante');
  assert.equal(res.analisis.categoria, 'thriller');
  assert.ok(res.secciones.length >= 1);
  assert.ok(res.palabras > 100);
});

test('un punto de control válido REANUDA sin repetir las partes ya analizadas', async () => {
  const client = new MockClient();
  const parrafo = 'Ana recorría los pasillos de la casa impossible con la linterna de latón. '.repeat(3).trim();
  const largo = Array.from({ length: 700 }, (_, i) => parrafo + ' P' + i).join('\n\n'); // 4 trozos
  const stages = [];
  const prev = { archivo: 'novela.md', chars: largo.length, partes: [
    { resumenTrozo: 'p1' }, { resumenTrozo: 'p2' }, { resumenTrocho: 'p3', resumenTrozo: 'p3' }, { resumenTrozo: 'p4' },
  ] };
  await analyzeManuscript({ client, archivo: 'novela.md', texto: largo, prev, onStage: (st) => stages.push(st) });
  // sin digests: SOLO la síntesis
  assert.equal(client._jsonCalls, 1, 'las 4 partes conservadas no se repiten');
  assert.ok(stages.some((s) => s.includes('Reanudando: las 4 partes ya estaban analizadas')));
});

test('un punto de control de OTRO archivo se ignora (arranque limpio)', async () => {
  const client = new MockClient();
  const parrafo = 'Ana recorría los pasillos de la casa impossible con la linterna de latón. '.repeat(3).trim();
  const largo = Array.from({ length: 700 }, (_, i) => parrafo + ' P' + i).join('\n\n');
  const prev = { archivo: 'OTRO-libro.pdf', chars: largo.length, partes: [{ resumenTrozo: 'x' }] };
  const res = await analyzeManuscript({ client, archivo: 'novela.md', texto: largo, prev });
  assert.equal(client._jsonCalls, 5, 'archivo distinto → análisis completo desde cero');
  assert.equal(res.analisis.categoria, 'thriller');
});

test('analyzeManuscript propagar señal de cancelación entre trozos', async () => {
  const client = new MockClient();
  const parrafo = 'x'.repeat(200);
  const largo = Array.from({ length: 600 }, (_, i) => parrafo + ' P' + i).join('\n\n'); // 2+ trozos
  const ctl = new AbortController();
  const p = analyzeManuscript({ client, archivo: 'x.txt', texto: largo, signal: ctl.signal });
  ctl.abort(new Error('Cancelado'));
  await assert.rejects(p, (e) => /Cancelado/.test(e.message));
});
