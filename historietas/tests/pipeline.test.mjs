/* pipeline.test.mjs — forja completa end-to-end con cliente simulado (SOLO TEXTO):
   generación, conteo exacto, cancelación, reanudación, tolerancia a fallos. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Pipeline } from '../js/engine/pipeline.mjs';
import { createBook, normalizeFuente } from '../js/domain/book.mjs';
import { MockClient, MemStorage, rejects } from './helpers.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mkBook(extra = {}) {
  const book = createBook({
    categoryId: 'thriller',
    premisa: 'Una arquitecta hereda una casa imposible.',
    capitulos: { modo: 'fijo', cantidad: 2 },
    parrafosPorCapitulo: 3,
    ...extra,
  });
  book.brief.modelos = { texto: undefined };
  return book;
}

function mkEnv() {
  const client = new MockClient();
  const storage = new MemStorage();
  const bus = { emit() {} };
  return { client, storage, bus };
}

test('forja completa de TEXTO: 2 capítulos, 3 párrafos c/u, créditos y persistencia', async () => {
  const { client, storage, bus } = mkEnv();
  const book = mkBook();
  const pipeline = new Pipeline({ client, storage, bus });
  const done = await pipeline.generate(book);

  assert.equal(done.status, 'listo');
  assert.equal(done.chapters.length, 2);
  assert.equal(done.chapters[0].titulo, 'Puerta 1');
  for (const ch of done.chapters) {
    assert.equal(ch.paragraphs.length, 3);
    assert.ok(ch.escrito);
    for (const p of ch.paragraphs) {
      assert.ok(p.texto, 'párrafo con texto');
      assert.ok(p.id, 'párrafo con id');
    }
    assert.equal(ch.impacto.aplicado, true); // apertura y final son capítulos clave
  }
  assert.equal(done.stats.chapters, 2);
  assert.equal(done.stats.paragraphs, 6);
  assert.ok(done.stats.words > 10);
  assert.equal(storage.images.size, 0, 'v3.0 SOLO TEXTO: cero imágenes');
  assert.ok(done.credits.some((c) => c.nombre === 'Vera Kaminsky'));
  // persistido
  const saved = await storage.getBook(book.id);
  assert.equal(saved.status, 'listo');
  assert.equal(saved.chapters[1].paragraphs[2].texto, done.chapters[1].paragraphs[2].texto);
});

test('el conteo fijo se corrige: reintenta y ajusta deterministamente', async () => {
  const { client, storage, bus } = mkEnv();
  client.outlineFirstCount = 5; // primera respuesta trae 5 capítulos en vez de 2
  const book = mkBook();
  const pipeline = new Pipeline({ client, storage, bus });
  const done = await pipeline.generate(book);
  assert.equal(done.chapters.length, 2, 'debe terminar en exactamente 2');
  assert.equal(client._outlineCalls, 2, 'debe reintentar el esquema');
  assert.equal(done.chapters[1].titulo, 'Puerta 2');
});

test('cancelar a mitad deja el libro pausado y se puede reanudar sin repetir trabajo', async () => {
  const { storage, bus } = mkEnv();
  const slow = new MockClient({ textDelayMs: 150 });
  const book = mkBook();
  const p1 = new Pipeline({ client: slow, storage, bus });
  const p = p1.generate(book);
  // ping (0-150ms) → concepto (150-300ms, se persiste) → biblia (300-450ms): abortamos dentro de la biblia
  await sleep(390);
  p1.cancel(book.id);
  await rejects(p);

  const savedPause = await storage.getBook(book.id);
  assert.ok(['pausado'].includes(savedPause.status));
  assert.ok(savedPause.meta.titulo, 'el concepto debió completarse y persistirse antes de la pausa');

  const fast = new MockClient();
  const p2 = new Pipeline({ client: fast, storage, bus });
  const reloaded = await storage.getBook(book.id);
  const done = await p2.generate(reloaded);
  assert.equal(done.status, 'listo');
  // las fases ya hechas no se repiten: el cliente rápido no debió volver a escribir el concepto
  const conceptCalls = fast.textCalls.filter((c) => c.messages.some((m) => String(m.content).includes('"titulo": "título principal')));
  assert.equal(conceptCalls.length, 0, 'el concepto no se recalcula');
  assert.equal(done.stats.paragraphs, 6);
});

test('un JSON inválido puntual no mata la forja: la fase reintenta y sigue', async () => {
  const { client, storage, bus } = mkEnv();
  client.jsonFailures.add(5); // la primera escritura de capítulo (llamada JSON n.º 5) falla una vez
  const book = mkBook();
  const pipeline = new Pipeline({ client, storage, bus });
  const done = await pipeline.generate(book);
  assert.equal(done.status, 'listo');
  assert.equal(done.stats.paragraphs, 6);
  const warn = done.progress.log.find((l) => l.tipo === 'warn' && l.msg.includes('intento 1 falló'));
  assert.ok(warn, 'el reintento queda anotado en el diario de la sala');
  assert.ok(warn.msg.includes('Capítulo 1'));
});

test('reescritura end-to-end: el manuscrito propio atraviesa esquema y escritura', async () => {
  const { client, storage, bus } = mkEnv();
  const book = mkBook();
  book.brief.fuente = normalizeFuente({
    archivo: 'mi-libro.pdf',
    nivelFidelidad: 'fieles',
    nivelProsa: 'editorial',
    preservar: { nombres: true, final: true, escenas: true },
    indicaciones: 'Corregir: final apurado',
    canon: {
      tituloOriginal: 'La Casa que Susurra',
      premisaOriginal: 'Una arquitecta hereda una casa imposible.',
      secciones: [
        { titulo: 'La herencia', resumen: 'Ana recibe la casa.', textoClave: 'La casa respiraba.', personajes: ['Ana'], lugares: ['la casa'] },
        { titulo: 'La primera puerta', resumen: 'Ana abre la puerta uno.', textoClave: 'La puerta ya estaba abierta.', personajes: ['Ana'], lugares: ['la casa'] },
      ],
    },
  });

  const pipeline = new Pipeline({ client, storage, bus });
  const done = await pipeline.generate(book);
  assert.equal(done.status, 'listo');

  const outlineCall = client.textCalls.find((c) => c.messages.some((m) => String(m.content).includes('"capitulos": [{')));
  const outlineUser = String(outlineCall.messages.map((m) => typeof m.content === 'string' ? m.content : '').join('\n'));
  assert.ok(outlineUser.includes('CANON DE LA FUENTE'));
  assert.ok(outlineUser.includes('FIDELIDAD ALTA'));
  assert.ok(outlineUser.includes('Corregir: final apurado'));

  assert.deepEqual(done.chapters[0].seccionesFuente, [1]);
  assert.deepEqual(done.chapters[1].seccionesFuente, [2]);

  const ch1Call = client.textCalls.find((c) => c.messages.some((m) => String(m.content).includes('ESCRIBE EXACTAMENTE 3 PÁRRAFOS') && String(m.content).includes('La casa respiraba.')));
  const ch2Call = client.textCalls.find((c) => c.messages.some((m) => String(m.content).includes('ESCRIBE EXACTAMENTE 3 PÁRRAFOS') && String(m.content).includes('La puerta ya estaba abierta.')));
  assert.ok(ch1Call, 'cap 1 con su sección');
  assert.ok(ch2Call, 'cap 2 con su sección');
});

test('preflight: sin conexión la forja no arranca y el error dice exactamente qué hacer', async () => {
  const { client, storage, bus } = mkEnv();
  const orig = client.chat.bind(client);
  client.chat = async () => { throw new Error('El servidor de la app no responde (escritura): arranca el servidor. Detalle: Failed to fetch'); };
  const book = mkBook();
  const pipeline = new Pipeline({ client, storage, bus });
  const err = await rejects(pipeline.generate(book));
  assert.ok(err.message.includes('servidor de la app no responde'));
  const saved = await storage.getBook(book.id);
  assert.equal(saved.status, 'fallido');
  assert.equal(saved.chapters.length, 0, 'no se genera nada sin conexión');
  const logErr = saved.progress.log.filter((l) => l.tipo === 'error').pop();
  assert.ok(logErr && logErr.msg.includes('servidor de la app no responde'), 'el diario registra el diagnóstico');
  client.chat = orig;
});

test('reforgeChapter reescribe un capítulo concreto', async () => {
  const { client, storage, bus } = mkEnv();
  const book = mkBook();
  const pipeline = new Pipeline({ client, storage, bus });
  await pipeline.generate(book);
  const before = book.chapters[1].paragraphs.map((p) => p.texto).join('|');
  await pipeline.reforgeChapter(book, 1);
  const after = book.chapters[1].paragraphs.map((p) => p.texto).join('|');
  assert.ok(before.length > 0);
  assert.equal(after, before); // el mock devuelve lo mismo, pero el ciclo completo se ejecuta
  assert.equal(book.chapters[1].paragraphs.every((p) => p.texto), true);
});

test('previsualización: solo el capítulo 1 y continuación sin repetir trabajo', async () => {
  const { client, storage, bus } = mkEnv();
  const book = mkBook({ preview: true });
  const pipeline = new Pipeline({ client, storage, bus });
  await pipeline.generate(book);
  assert.equal(book.status, 'listo');
  assert.equal(book.brief.preview, true, 'el modo sigue activo hasta que el autor continúe');
  assert.equal(book.chapters[0].escrito, true);
  assert.equal(book.chapters[1].escrito, false, 'el capítulo 2 espera al visto bueno');
  assert.equal(book.stats.paragraphs, 3, 'prosa solo del capítulo 1');

  book.brief.preview = false;
  const client2 = new MockClient();
  const done = await new Pipeline({ client: client2, storage, bus }).generate(book);
  assert.equal(done.status, 'listo');
  assert.equal(done.stats.paragraphs, 6);
  const escriturasPost = client2.textCalls.filter((c) => c.messages.some((m) => String(m.content).includes('ESCRIBE EXACTAMENTE 3 PÁRRAFOS'))).length;
  assert.equal(escriturasPost, 1, 'al continuar solo se escribe el cap 2');
});

test('portada del libro: autor, año y dedicatoria viajan en el brief y sobreviven a la forja', async () => {
  const { client, storage, bus } = mkEnv();
  const book = mkBook({ portada: { autor: 'D. Cardona', anio: '2026', dedicatoria: 'Para la familia' } });
  const done = await new Pipeline({ client, storage, bus }).generate(book);
  assert.equal(done.meta.portada.autor, 'D. Cardona');
  assert.equal(done.meta.portada.anio, '2026');
  assert.equal(done.meta.portada.dedicatoria, 'Para la familia');
  const saved = await storage.getBook(book.id);
  assert.equal(saved.meta.portada.dedicatoria, 'Para la familia');
});
