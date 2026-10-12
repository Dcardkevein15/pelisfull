/* utils.test.mjs — utilidades puras y extractor de JSON. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { uid, hashString, wordCount, escapeHtml, truncate, blobToDataURL } from '../js/core/utils.mjs';
import { extractJSON } from '../js/api/client.mjs';

test('uid genera identificadores únicos', () => {
  const set = new Set(Array.from({ length: 500 }, () => uid('x')));
  assert.equal(set.size, 500);
  assert.ok(uid('a').startsWith('a_'));
});

test('hashString es determinista y distinto por entrada', () => {
  assert.equal(hashString('libro-1'), hashString('libro-1'));
  assert.notEqual(hashString('libro-1'), hashString('libro-2'));
  assert.ok(Number.isInteger(hashString('x')));
  assert.ok(hashString('x') >= 0 && hashString('x') <= 0xffffffff);
});

test('wordCount y truncate', () => {
  assert.equal(wordCount('uno dos   tres'), 3);
  assert.equal(wordCount('  '), 0);
  assert.equal(truncate('abcdefghij', 5), 'abcd…');
  assert.equal(truncate('abc', 5), 'abc');
});

test('escapeHtml neutraliza etiquetas', () => {
  const out = escapeHtml('<img src=x onerror=alert(1)>A&B"\'');
  assert.ok(!out.includes('<img'));
  assert.ok(!out.includes('"onerror'));
  assert.ok(out.includes('\u0026amp;'));
});

test('extractJSON parsea JSON limpio, con fences y con texto alrededor', () => {
  assert.deepEqual(extractJSON('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJSON('```json\n{"a":2}\n```'), { a: 2 });
  assert.deepEqual(extractJSON('Antes {"a":[1,2,{"b":3}]} después'), { a: [1, 2, { b: 3 }] });
  assert.deepEqual(extractJSON('[{"x":"y"}]'), [{ x: 'y' }]);
  assert.equal(extractJSON('esto no es json'), null);
  assert.equal(extractJSON('{"a": sin cerrar'), null);
  assert.equal(extractJSON(''), null);
});

test('extractJSON tolera cadenas con llaves internas', () => {
  const obj = extractJSON('{"texto":"llamó a la {puerta} y dijo \\"hola\\""}');
  assert.equal(obj.texto, 'llamó a la {puerta} y dijo "hola"');
});

test('blobToDataURL funciona en Node', async () => {
  const blob = new Blob(['hola'], { type: 'text/plain' });
  const url = await blobToDataURL(blob);
  assert.ok(url.startsWith('data:text/plain;base64,'));
});
