/* draft.test.mjs — persistencia del borrador del asistente: a prueba de refrescos. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { saveWizardDraft, loadWizardDraft, clearWizardDraft, draftHasContent, DRAFT_FIELDS } from '../js/core/draft.mjs';

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test('round-trip: lo que se guarda es lo que se restaura tras un refresco', () => {
  const s = memStorage();
  const state = {
    step: 3, categoryId: 'thriller', premisa: 'una casa imposible',
    origen: { archivo: 'a.pdf', analisis: { titulo: 'T' }, secciones: [{ i: 1, titulo: 'S' }] },
    capitulos: { modo: 'fijo', cantidad: 15 },
    fuente: { nivelFidelidad: 'fieles', preservar: { nombres: true, final: true, escenas: true }, indicaciones: 'x' },
  };
  assert.equal(saveWizardDraft(state, s), true);
  const loaded = loadWizardDraft(s);
  assert.equal(loaded.step, 3, 'vuelve al paso donde estaba');
  assert.equal(loaded.categoryId, 'thriller');
  assert.equal(loaded.origen.archivo, 'a.pdf');
  assert.equal(loaded.origen.secciones[0].titulo, 'S');
  assert.deepEqual(loaded.capitulos, { modo: 'fijo', cantidad: 15 });
  assert.equal(loaded.fuente.nivelFidelidad, 'fieles');
});

test('borrador ausente o corrupto → null sin romper el asistente', () => {
  const s = memStorage();
  assert.equal(loadWizardDraft(s), null);
  s.setItem('historietas.wizard-draft.v1', '{esto no es json');
  assert.equal(loadWizardDraft(s), null);
  s.setItem('historietas.wizard-draft.v1', '"un string plano"');
  assert.equal(loadWizardDraft(s), null);
});

test('clearWizardDraft borra y draftHasContent filtra lo que no tiene sustancia', () => {
  const s = memStorage();
  saveWizardDraft({ step: 2, premisa: 'p' }, s);
  assert.ok(draftHasContent(loadWizardDraft(s)));
  clearWizardDraft(s);
  assert.equal(loadWizardDraft(s), null);
  assert.equal(draftHasContent(null), false);
  assert.equal(draftHasContent({ step: 1 }), false);
  assert.equal(draftHasContent({ step: 4 }), true);
  assert.equal(draftHasContent({ origen: {} }), true);
  assert.equal(draftHasContent({ categoryId: 'noir' }), true);
});

test('storage roto o sin espacio no rompe la app', () => {
  const s = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => { throw new Error('nope'); },
  };
  assert.equal(saveWizardDraft({ step: 2 }, s), false);
  assert.equal(loadWizardDraft(s), null);
  clearWizardDraft(s); // no lanza
});

test('DRAFT_FIELDS cubre todo el encargo y el elenco queda en IndexedDB', () => {
  for (const k of ['step', 'categoryId', 'premisa', 'titulo', 'publico', 'tono', 'pov', 'era', 'notas',
    'final', 'idioma', 'extensionParrafo', 'intensidad', 'capitulos', 'parrafosPorCapitulo', 'pases', 'modelos', 'fuente', 'origen', 'digests']) {
    assert.ok(DRAFT_FIELDS.includes(k), 'falta ' + k);
  }
  assert.ok(!DRAFT_FIELDS.includes('assets'), 'el elenco (con sus retratos) persiste en IndexedDB');
});
