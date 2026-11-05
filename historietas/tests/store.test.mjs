/* store.test.mjs — ajustes por defecto v4.0 (con imágenes restauradas). */

import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, migrateSettings } from '../js/core/store.mjs';

test('DEFAULT_SETTINGS tiene imagen y texto', () => {
  assert.equal(DEFAULT_SETTINGS.textModel, 'nvidia/nemotron-3.5-lightning-30b-a3b');
  assert.equal(DEFAULT_SETTINGS.imageModel, 'black-forest-labs/flux.2-klein-4b');
  assert.equal(DEFAULT_SETTINGS.imageAspect, '16:9');
  assert.equal(DEFAULT_SETTINGS.imageConcurrency, 3);
  assert.equal(DEFAULT_SETTINGS.panelQa, true);
  assert.equal(DEFAULT_SETTINGS.paseImpacto, true);
  assert.equal(DEFAULT_SETTINGS.guionVisual, true);
});

test('migrateSettings retira claves heredadas y migra modelos deprecados', () => {
  const s = migrateSettings({
    textModel: 'moonshotai/kimi-k3',
    nvApiKey: 'nvapi-x',
    customProxyBase: '',
  });
  assert.equal(s.textModel, 'nvidia/nemotron-3.5-lightning-30b-a3b', 'kimi-k3 → lightning');
  assert.equal(s.nvApiKey, 'nvapi-x');
  assert.equal(s.customProxyBase, '');
});

test('migrateSettings tolera datos nulos y basura', () => {
  assert.deepEqual(migrateSettings(null), null);
  assert.deepEqual(migrateSettings({}), {});
  assert.deepEqual(migrateSettings('no-objeto'), 'no-objeto');
});

test('migrateSettings respeta modelos que funcionan', () => {
  const s = migrateSettings({ textModel: 'z-ai/glm-5.3', nvApiKey: 'nvapi-x' });
  assert.equal(s.textModel, 'z-ai/glm-5.3', 'glm-5.3 funciona, no se migra');
});
