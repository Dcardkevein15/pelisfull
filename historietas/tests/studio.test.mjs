/* studio.test.mjs — el modelo del Taller de Ilustración (Parte 2):
   un capítulo por sesión, puerta de calidad y avance bloqueado. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioState, normalizeStudio, capituloActual, puedeIlustrar, marcarIlustrado, confirmarCapitulo, progreso, ESTADO_LABEL } from '../js/studio/state.mjs';
import { createBook, normalizeOutline, normalizeChapter } from '../js/domain/book.mjs';

function libroEscrito(nCaps = 3) {
  const book = createBook({ categoryId: 'thriller', capitulos: { modo: 'fijo', cantidad: nCaps }, parrafosPorCapitulo: 2 });
  book.chapters = normalizeOutline({ capitulos: Array.from({ length: nCaps }, (_, i) => ({ numero: i + 1, titulo: 'Cap ' + (i + 1), sinopsis: 's' })) });
  for (const ch of book.chapters) {
    ch.paragraphs = normalizeChapter({ titulo_capitulo: ch.titulo, parrafos: [
      { texto: 'uno', rol: 'narracion', personajes_presentes: ['Ana'] },
      { texto: 'dos', rol: 'dialogo', personajes_presentes: ['Ana'] },
    ] }, ch, 2).paragraphs;
    ch.escrito = true;
  }
  return book;
}

test('createStudioState: un párrafo-hueco por párrafo del capítulo, todo pendiente', () => {
  const book = libroEscrito(3);
  const st = createStudioState(book);
  assert.equal(st.capitulos.length, 3);
  assert.ok(st.capitulos.every((c) => c.escrito && c.estado === 'pendiente'));
  for (const c of st.capitulos) {
    assert.equal(c.parrafos.length, book.chapters[c.idx].paragraphs.length);
    assert.ok(c.parrafos.every((p) => p.estado === 'pendiente'));
    assert.deepEqual(book.chapters[c.idx].paragraphs.map((p) => p.id), c.parrafos.map((p) => p.paraId));
  }
});

test('UNA SESIÓN POR CAPÍTULO: solo el actual se puede ilustrar', () => {
  const book = libroEscrito(3);
  const st = createStudioState(book);
  assert.equal(capituloActual(st), 0);
  assert.equal(puedeIlustrar(st, 0), true);
  assert.equal(puedeIlustrar(st, 1), false, 'no se salta por delante');
  assert.equal(puedeIlustrar(st, 2), false);
  // confirmado el 1 → se desbloquea el 2, el 3 sigue bloqueado
  marcarIlustrado(st, 0);
  confirmarCapitulo(st, 0);
  assert.equal(capituloActual(st), 1);
  assert.equal(puedeIlustrar(st, 1), true);
  assert.equal(puedeIlustrar(st, 2), false, 'aún no se salta al 3');
  assert.equal(puedeIlustrar(st, 0), false, 'lo confirmado no se retoca');
});

test('la puerta de calidad: solo se confirma lo ILUSTRADO (no lo pendiente)', () => {
  const book = libroEscrito(2);
  const st = createStudioState(book);
  confirmarCapitulo(st, 0); // pendiente → se ignora
  assert.equal(st.capitulos[0].estado, 'pendiente');
  marcarIlustrado(st, 0);
  assert.equal(st.capitulos[0].estado, 'ilustrado');
  confirmarCapitulo(st, 0);
  assert.equal(st.capitulos[0].estado, 'confirmado');
  assert.equal(capituloActual(st), 1);
});

test('marcarIlustrado rellena los huecos pendientes y no toca lo confirmado', () => {
  const book = libroEscrito(2);
  const st = createStudioState(book);
  st.capitulos[0].parrafos[0].estado = 'ok';
  marcarIlustrado(st, 0);
  assert.equal(st.capitulos[0].parrafos[0].estado, 'ok');
  assert.equal(st.capitulos[0].parrafos[1].estado, 'ok', 'el pendiente pasa a ok');
  confirmarCapitulo(st, 0);
  marcarIlustrado(st, 0); // ya confirmado → no-op
  assert.equal(st.capitulos[0].estado, 'confirmado');
});

test('progreso cuenta confirmados y porcentaje', () => {
  const book = libroEscrito(4);
  const st = createStudioState(book);
  assert.deepEqual(progreso(st), { confirmados: 0, total: 4, pct: 0 });
  marcarIlustrado(st, 0); confirmarCapitulo(st, 0);
  marcarIlustrado(st, 1); confirmarCapitulo(st, 1);
  assert.deepEqual(progreso(st), { confirmados: 2, total: 4, pct: 50 });
});

test('normalizeStudio: libros viejos y estados corruptos caen a lo seguro', () => {
  const book = libroEscrito(2);
  const base = createStudioState(book);
  const heredado = normalizeStudio(book, { actual: 1, capitulos: [{ estado: 'confirmado', parrafos: [{ paraId: 'x', estado: 'ok' }] }] });
  assert.equal(heredado.capitulos[0].estado, 'confirmado', 'estado válido se conserva');
  assert.equal(heredado.capitulos[0].parrafos[0].estado, 'pendiente', 'párrafo con id que no casa → pendiente');
  const roto = normalizeStudio(book, null);
  assert.equal(roto.capitulos.length, 2, 'sin estado previo se crea desde cero');
  const corrupto = normalizeStudio(book, 'no-soy-un-objeto');
  assert.equal(corrupto.capitulos.length, 2, 'basura → desde cero sin romper');
});

test('capítulo no escrito: no se puede ilustrar aunque sea el actual', () => {
  const book = libroEscrito(2);
  book.chapters[0].escrito = false;
  const st = createStudioState(book);
  st.capitulos[0].escrito = false;
  assert.equal(puedeIlustrar(st, 0), false, 'sin escribir no hay sesión');
  assert.equal(ESTADO_LABEL.pendiente, 'Pendiente');
});
