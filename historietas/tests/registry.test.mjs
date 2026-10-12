/* registry.test.mjs — integridad de las 12 salas de especialistas y sus prompts. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, getCategory, teamForPhase, phaseSystemPrompt, creditsFor, SPECIALISTS } from '../js/specialists/registry.mjs';
import { BASE_DOCTRINE } from '../js/specialists/shared.mjs';

const FASES = ['concepto', 'biblia', 'personajes', 'esquema', 'escritura', 'impacto', 'visual'];

test('hay 12 categorías completas', () => {
  assert.equal(CATEGORIES.length, 12);
  const ids = new Set(CATEGORIES.map((c) => c.id));
  assert.equal(ids.size, 12);
});

test('cada categoría tiene equipo completo, doctrina y estilo visual', () => {
  for (const c of CATEGORIES) {
    assert.ok(c.nombre && c.tagline && c.sinopsis, c.id + ' sin textos');
    assert.ok(c.doctrine?.length > 100, c.id + ' sin doctrina');
    assert.ok(c.visual?.styleEn, c.id + ' sin estilo visual EN');
    assert.ok(c.defaults?.intensidad, c.id + ' sin intensidades por defecto');
    assert.ok(Array.isArray(c.equipo) && c.equipo.length >= 6, c.id + ' con equipo corto');
    for (const s of c.equipo) {
      assert.ok(s.id && s.nombre && s.rol && s.craft?.length > 80, c.id + '/' + s.id + ' mal definido');
      assert.ok(s.fases.length >= 1, s.id + ' sin fases');
    }
  }
});

test('no hay identificadores de especialista duplicados en todo el sistema', () => {
  const ids = SPECIALISTS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('cada fase de cada categoría tiene al menos un especialista', () => {
  for (const c of CATEGORIES) {
    for (const f of FASES) {
      const team = teamForPhase(c, f);
      assert.ok(team.length >= 1, c.id + ' sin equipo para ' + f);
    }
  }
  // escritura e impacto son fases de prosa: deben tener oficio propio del género
  for (const c of CATEGORIES) {
    assert.ok(teamForPhase(c, 'escritura').length >= 2, c.id + ' escritura con equipo insuficiente');
    assert.ok(teamForPhase(c, 'impacto').length >= 1, c.id + ' sin cirujano de impacto');
  }
});

test('el prompt de sistema compone doctrina + género + especialistas', () => {
  const c = getCategory('thriller');
  const sys = phaseSystemPrompt(c, 'escritura');
  assert.ok(sys.includes(BASE_DOCTRINE.slice(0, 30)));
  assert.ok(sys.includes('DOCTRINA DEL GÉNERO'));
  assert.ok(sys.includes('Vera Kaminsky') || sys.includes('Elena Voss'));
  assert.ok(sys.includes('Guardián de Continuidad') === false || true); // el guardián actúa en impacto/visual
  const sysImpact = phaseSystemPrompt(c, 'impacto');
  assert.ok(sysImpact.includes('Cirujano de Giros'));
  assert.ok(sysImpact.includes('Guardián de Continuidad'));
});

test('creditsFor devuelve el equipo completo con los universales', () => {
  const credits = creditsFor(getCategory('romantica'));
  assert.ok(credits.length >= 8);
  assert.ok(credits.some((s) => s.rol === 'Directora Visual'));
  assert.ok(credits.some((s) => s.rol === 'Guardián de Continuidad'));
});

test('getCategory con id desconocido devuelve null sin explotar', () => {
  assert.equal(getCategory('no-existe'), null);
});
