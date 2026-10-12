/* client.test.mjs — NvidiaClient con fetch simulado: transportes, payloads de
   TEXTO, reintentos, JSON. v3.0: sin payloads de imagen. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { NvidiaClient, extractJSON, rescueJSON } from '../js/api/client.mjs';
import { fakeFetch, jsonResponse, rejects } from './helpers.mjs';

const CFG = {
  nvApiKey: 'nvapi-test',
  textModel: 'moonshotai/kimi-k3',
  transport: 'auto',
  customProxyBase: '',
  parrafosPorCapitulo: 10,
  paseImpacto: true,
};

function mk(settings, handler) {
  return new NvidiaClient({ settings, fetchImpl: fakeFetch(handler) });
}

test('en auto termina usando el transporte directo cuando los locales no existen', async () => {
  const calls = [];
  const c = mk({ ...CFG }, async (url) => {
    calls.push(String(url));
    if (!String(url).startsWith('http')) throw new TypeError('Failed to parse URL');
    if (String(url).includes('integrate.api.nvidia.com')) {
      return jsonResponse(200, { choices: [{ message: { content: 'LISTO' } }] });
    }
    throw new TypeError('Failed to parse URL');
  });
  const out = await c.chat([{ role: 'user', content: 'hola' }]);
  assert.equal(out, 'LISTO');
  assert.ok(calls.some((u) => u.includes('integrate.api.nvidia.com/v1/chat/completions')));
});

test('el puente integrado (Next) se usa cuando responde', async () => {
  const c = mk({ ...CFG }, async (url) => {
    const u = String(url);
    if (u.startsWith('/historietas/api/nv/chat/completions')) {
      return jsonResponse(200, { choices: [{ message: { content: 'PUENTE' } }] });
    }
    throw new TypeError('Failed to parse URL');
  });
  const out = await c.chat([{ role: 'user', content: 'hola' }]);
  assert.equal(out, 'PUENTE');
});

test('reintenta 429 con backoff y acaba funcionando', async () => {
  let n = 0;
  const c = mk({ ...CFG, transport: 'direct' }, async () => {
    n++;
    if (n < 3) return jsonResponse(429, { error: { message: 'rate limited' } });
    return jsonResponse(200, { choices: [{ message: { content: 'OK' } }] });
  });
  const out = await c.chat([{ role: 'user', content: 'x' }]);
  assert.equal(out, 'OK');
  assert.equal(n, 3);
});

test('un 429 persistente agota los reintentos y queda registrado en el diagnóstico', async () => {
  let n = 0;
  const c = mk({ ...CFG, transport: 'direct' }, async () => {
    n++;
    return jsonResponse(429, { error: { message: 'Too Many Requests' } });
  });
  const err = await rejects(c.chat([{ role: 'user', content: 'x' }]));
  assert.ok(err.message.includes('API de NVIDIA'), 'diagnóstico orientado a la API');
  assert.ok(err.message.includes('429'), 'el detalle registra el 429');
  assert.ok(n >= 4, 'reintentó antes de rendirse (' + n + ' intentos)');
});

test('caída de servicio del modelo principal → respaldo automático con otro modelo', async () => {
  const modelos = [];
  const c = mk({ ...CFG, transport: 'direct' }, async (url, opts) => {
    const body = JSON.parse(opts.body);
    modelos.push(body.model);
    if (body.model === 'moonshotai/kimi-k3') return jsonResponse(504, { detail: 'gateway timeout' });
    return jsonResponse(200, { choices: [{ message: { content: 'OK DESDE RESPALDO' } }] });
  });
  const out = await c.chat([{ role: 'user', content: 'x' }]);
  assert.equal(out, 'OK DESDE RESPALDO');
  assert.ok(modelos.includes('moonshotai/kimi-k3'), 'se probó primero el principal');
  assert.ok(modelos.includes('nvidia/nemotron-3.5-lightning-30b-a3b'), 'el respaldo tomó el relevo');
  assert.ok(modelos[0] === 'moonshotai/kimi-k3', 'el principal fue primero');
});

test('errores de clave o créditos NO se disfrazan con otro modelo', async () => {
  const modelos = [];
  const c = mk({ ...CFG, transport: 'direct' }, async (url, opts) => {
    const body = JSON.parse(opts.body);
    modelos.push(body.model);
    return jsonResponse(401, { error: { message: 'Invalid API key' } });
  });
  const err = await rejects(c.chat([{ role: 'user', content: 'x' }]));
  assert.ok(err.message.includes('401'));
  assert.equal(modelos.length, 1, 'solo se probó el modelo principal');
});

test('healthCheck y resolveTextModel eligen un modelo vivo', async () => {
  const c = mk({ ...CFG, transport: 'direct' }, async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.model === 'moonshotai/kimi-k3') return jsonResponse(502, { detail: 'bad gateway' });
    return jsonResponse(200, { choices: [{ message: { content: 'LISTO' } }] });
  });
  assert.equal((await c.healthCheck('moonshotai/kimi-k3')).ok, false, 'kimi caído');
  assert.equal((await c.healthCheck('nvidia/nemotron-3.5-lightning-30b-a3b')).ok, true, 'respaldo vivo');
  const r = await c.resolveTextModel('moonshotai/kimi-k3');
  assert.equal(r.model, 'nvidia/nemotron-3.5-lightning-30b-a3b');
  assert.equal(r.switched, true, 'avisa del cambio');
  // si el principal está vivo, no se toca
  const c2 = mk({ ...CFG, transport: 'direct' }, async () =>
    jsonResponse(200, { choices: [{ message: { content: 'LISTO' } }] }));
  const r2 = await c2.resolveTextModel('moonshotai/kimi-k3');
  assert.equal(r2.model, 'moonshotai/kimi-k3');
  assert.equal(r2.switched, false);
});

test('no reintenta 401 (clave inválida) y el mensaje es claro', async () => {
  let n = 0;
  const c = mk({ ...CFG, transport: 'direct' }, async () => {
    n++;
    return jsonResponse(401, { error: { message: 'Invalid API key' } });
  });
  const err = await rejects(c.chat([{ role: 'user', content: 'x' }]));
  assert.ok(err.message.includes('401'));
  assert.ok(err.message.includes('Invalid API key'));
  assert.equal(n, 1);
});

test('chatJSON repara un JSON irrecuperable en el segundo intento', async () => {
  let n = 0;
  const c = mk({ ...CFG, transport: 'direct' }, async () => {
    n++;
    return jsonResponse(200, { choices: [{ message: { content: n === 1 ? 'lo siento, no entiendo lo de los corchetes' : '{"a": 2}' } }] });
  });
  const parsed = await c.chatJSON([{ role: 'user', content: 'dame json' }]);
  assert.equal(parsed.a, 2);
  assert.equal(n, 2);
});

test('chatJSON rescata un JSON truncado sin gastar otra llamada', async () => {
  let n = 0;
  const c = mk({ ...CFG, transport: 'direct' }, async () => {
    n++;
    return jsonResponse(200, { choices: [{ message: { content: 'Respuesta: {"titulo": "Casa", "temas": ["a", "b' } }] });
  });
  const parsed = await c.chatJSON([{ role: 'user', content: 'dame json' }]);
  assert.equal(parsed.titulo, 'Casa');
  assert.deepEqual(parsed.temas, ['a', 'b']);
  assert.equal(n, 1, 'el rescate no dispara el reintento correctivo');
});

test('content vacío con presupuesto alto (kimi pensando) → reintenta acotado y devuelve el texto', async () => {
  const budgets = [];
  const c = mk({ ...CFG, transport: 'direct' }, async (url, opts) => {
    const body = JSON.parse(opts.body);
    budgets.push(body.max_tokens);
    if (body.max_tokens > 4096) {
      return jsonResponse(200, { choices: [{ message: { content: '', reasoning_content: 'pienso, luego existo' } }] });
    }
    return jsonResponse(200, { choices: [{ message: { content: 'LISTO AL FIN' } }] });
  });
  const out = await c.chat([{ role: 'user', content: 'x' }]);
  assert.equal(out, 'LISTO AL FIN');
  assert.deepEqual(budgets, [8000, 4096]);
});

test('si solo hay traza de razonamiento, se usa como último recurso y el JSON se rescata de ahí', async () => {
  const c = mk({ ...CFG, transport: 'direct' }, async () =>
    jsonResponse(200, { choices: [{ message: { content: '', reasoning_content: 'boceto mental: {"x": 7}' } }] }));
  const parsed = await c.chatJSON([{ role: 'user', content: 'dame json' }]);
  assert.equal(parsed.x, 7);
});

test('rescueJSON cierra lo truncado y no toca lo completo', () => {
  assert.deepEqual(rescueJSON('{"titulo": "Casa", "temas": ["a", "b'), { titulo: 'Casa', temas: ['a', 'b'] });
  assert.deepEqual(rescueJSON('{"a": {"b": [1, 2'), { a: { b: [1, 2] } });
  assert.deepEqual(rescueJSON('antes {"t": "hola mun'), { t: 'hola mun' });
  assert.deepEqual(rescueJSON('{"lista": [ {"x": 1}, {"y": 2'), { lista: [{ x: 1 }, { y: 2 }] });
  assert.equal(rescueJSON('{"a": 1}'), null);
  assert.equal(rescueJSON('aqui nada'), null);
  assert.equal(rescueJSON(''), null);
});

test('chatJSON parsea el primero si ya es válido y no repite', async () => {
  let n = 0;
  const c = mk({ ...CFG, transport: 'direct' }, async () => {
    n++;
    return jsonResponse(200, { choices: [{ message: { content: '{"ok": true}' } }] });
  });
  const parsed = await c.chatJSON([{ role: 'user', content: 'json' }]);
  assert.deepEqual(parsed, { ok: true });
  assert.equal(n, 1);
});

test('sin clave lanza antes de llamar', async () => {
  const c = mk({ ...CFG, nvApiKey: '', transport: 'direct' }, async () => { throw new Error('no debería llamarse'); });
  const err = await rejects(c.chat([{ role: 'user', content: 'x' }]));
  assert.ok(err.message.includes('clave NVIDIA'));
});

test('fallo total de red → diagnóstico claro, sin prefijos internos', async () => {
  const c = mk({ ...CFG, transport: 'auto' }, async () => { throw new TypeError('Failed to fetch'); });
  const err = await rejects(c.chat([{ role: 'user', content: 'x' }]));
  assert.ok(!err.message.includes('__network__'), 'no debe filtrarse el prefijo interno');
  assert.ok(err.message.includes('no responde') && err.message.includes('servidor'), 'diagnostica servidor caído');
  assert.ok(err.message.includes('historietas/api'), 'detalla los transportes intentados');
});

test('servidor vivo pero API inalcanzable → diagnóstico orientado a la API', async () => {
  const c = mk({ ...CFG, transport: 'auto' }, async (url, opts) => {
    if (String(opts?.method || '').toUpperCase() === 'GET') return jsonResponse(401, {});
    throw new TypeError('Failed to fetch');
  });
  const err = await rejects(c.chat([{ role: 'user', content: 'x' }]));
  assert.ok(err.message.includes('API de NVIDIA'));
  assert.ok(err.message.includes('Detalle:'));
});

test('un 422 de validación muestra el detalle del campo que falla, no [object Object]', async () => {
  const c = mk({ ...CFG, transport: 'direct' }, async () =>
    jsonResponse(422, { detail: [{ loc: ['body', 'max_tokens'], msg: 'value too large', type: 'value_error' }] }));
  const err = await rejects(c.chat([{ role: 'user', content: 'x' }]));
  assert.ok(err.message.includes('422'));
  assert.ok(err.message.includes('max_tokens: value too large'));
  assert.ok(!err.message.includes('[object Object]'));
});

test('el transporte personalizado construye la URL del proxy al estilo server.js', async () => {
  const urls = [];
  const c = mk({ ...CFG, transport: 'custom', customProxyBase: 'http://localhost:9130/proxy' }, async (url) => {
    urls.push(String(url));
    if (String(url).includes('chat/completions')) return jsonResponse(200, { choices: [{ message: { content: 'X' } }] });
    throw new Error('no debería pedir imágenes: v3.0 es solo texto');
  });
  await c.chat([{ role: 'user', content: 'x' }]);
  assert.ok(urls[0].startsWith('http://localhost:9130/proxy/integrate.api.nvidia.com/v1/'));
  assert.equal(urls.length, 1, 'solo transporte de texto');
});

test('el diagnóstico test() valida el servicio de escritura (sin imágenes)', async () => {
  let n = 0;
  const c = mk({ ...CFG, transport: 'direct' }, async () => {
    n++;
    return jsonResponse(200, { choices: [{ message: { content: 'LISTO' } }] });
  });
  const res = await c.test();
  assert.deepEqual(Object.keys(res), ['text'], 'v3.0: diagnóstico solo de texto');
  assert.equal(res.text.ok, true);
  assert.equal(n, 1, 'una sola llamada de texto');
});

test('extractJSON como parte del contrato público', () => {
  assert.deepEqual(extractJSON('```json\n{"x": 1}\n```'), { x: 1 });
});
