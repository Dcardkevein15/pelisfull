/* store.test.mjs — ajustes por defecto y auto-reparación v3.0 (solo texto). */

import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, migrateSettings } from '../js/core/store.mjs';

test('v3.0: los ajustes por defecto no tienen claves de imagen', () => {
  assert.equal(DEFAULT_SETTINGS.textModel, 'moonshotai/kimi-k3');
  assert.equal(DEFAULT_SETTINGS.imageModel, undefined);
  assert.equal(DEFAULT_SETTINGS.imageAspect, undefined);
  assert.equal(DEFAULT_SETTINGS.imageConcurrency, undefined);
  assert.equal(DEFAULT_SETTINGS.panelQa, undefined);
  assert.equal(DEFAULT_SETTINGS.hojasPersonaje, undefined);
  assert.equal(DEFAULT_SETTINGS.guionVisual, undefined);
  assert.equal(DEFAULT_SETTINGS.paseImpacto, true);
});

test('migrateSettings retira las claves de imagen heredadas de la v2.x', () => {
  const s = migrateSettings({
    imageModel: 'black-forest-labs/flux.2-klein-4b',
    imageAspect: '16:9',
    imageConcurrency: 3,
    panelQa: true,
    hojasPersonaje: true,
    guionVisual: true,
    nvApiKey: 'nvapi-x',
    textModel: 'z-ai/glm-5.3',
  });
  assert.equal(s.imageModel, undefined, 'la clave heredada se retira');
  assert.equal(s.imageAspect, undefined);
  assert.equal(s.imageConcurrency, undefined);
  assert.equal(s.panelQa, undefined);
  assert.equal(s.hojasPersonaje, undefined);
  assert.equal(s.guionVisual, undefined);
  assert.equal(s.nvApiKey, 'nvapi-x', 'lo demás sobrevive');
  assert.equal(s.textModel, 'z-ai/glm-5.3');
});

test('migrateSettings tolera datos nulos y basura', () => {
  assert.deepEqual(migrateSettings(null), null);
  assert.deepEqual(migrateSettings({}), {});
  assert.deepEqual(migrateSettings('no-objeto'), 'no-objeto');
});
