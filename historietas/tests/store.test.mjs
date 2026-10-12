/* store.test.mjs — ajustes por defecto y auto-reparación de configuraciones caídas. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, migrateSettings } from '../js/core/store.mjs';

test('migrateSettings recoloca el schnell caído sobre el klein verificado', () => {
  const s = migrateSettings({ imageModel: 'black-forest-labs/flux.1-schnell' });
  assert.equal(s.imageModel, 'black-forest-labs/flux.2-klein-4b');
  assert.equal(s.imageModel, DEFAULT_SETTINGS.imageModel);
});

test('migrateSettings respeta otras elecciones y datos nulos', () => {
  assert.equal(migrateSettings({ imageModel: 'black-forest-labs/flux.1-kontext-dev' }).imageModel, 'black-forest-labs/flux.1-kontext-dev');
  assert.equal(migrateSettings({ imageModel: 'black-forest-labs/flux.2-klein-4b' }).imageModel, 'black-forest-labs/flux.2-klein-4b');
  assert.equal(migrateSettings({}).imageModel, undefined);
  assert.deepEqual(migrateSettings(null), null);
});

test('el resto de ajustes sobrevive a la migración', () => {
  const s = migrateSettings({ imageModel: 'black-forest-labs/flux.1-schnell', nvApiKey: 'nvapi-x', imageConcurrency: 5 });
  assert.equal(s.imageModel, 'black-forest-labs/flux.2-klein-4b');
  assert.equal(s.nvApiKey, 'nvapi-x');
  assert.equal(s.imageConcurrency, 5);
});
