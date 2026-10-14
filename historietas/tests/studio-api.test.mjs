/* studio-api.test.mjs — el SERVIDOR del Taller de Ilustración (Parte 2),
   probado end-to-end con el driver LOCAL real (archivos temporales) y el
   proveedor de pruebas etiquetado. Sin red: el modelo de texto se inyecta.
   Verifica: almacenamiento persistente, autenticación de servidor real,
   fichas permanentes, referencias con aprobación, memoria narrativa,
   trabajos paso a paso (reanudables), versionado de ilustraciones y el
   control de calidad fail-open. */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createEngine, createStorage, createAuth, resolveOwnerToken,
  proveedorNvidia, proveedorMock, buildIllustrationPrompt, seedDe, evaluarIlustracion,
} from './studio-lib.mjs';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'taller-'));

function libroDePrueba() {
  return {
    id: 'libro_demo_1',
    meta: { titulo: 'La Casa que Susurra', logline: 'Una arquitecta hereda una casa imposible.', portada: { autor: 'Autor', anio: '2026', dedicatoria: '' } },
    personajes: [
      { nombre: 'Ana', rol: 'protagonista', edad: '34', aparienciaEn: 'short black hair, olive skin', vestuarioEn: 'red wool coat', rasgoDistintivoEn: 'scar over left eyebrow' },
      { nombre: 'Bruno', rol: 'aliado', edad: '60', aparienciaEn: 'white beard, round glasses', vestuarioEn: 'brown corduroy jacket', rasgoDistintivoEn: 'chewed pencil behind ear' },
    ],
    chapters: [
      {
        numero: 1, titulo: 'La herencia', cliffhanger: 'la puerta ya está abierta',
        paragraphs: [
          { id: 'par_1', texto: 'La niebla entraba como si la casa respirara. «La puerta ya está abierta», dijo Ana.', rol: 'narracion', personajesPresentes: ['Ana'], lugar: 'la casa', momentoDia: 'noche' },
          { id: 'par_2', texto: 'Bruno encendió la linterna y el haz cortó la oscuridad del pasillo.', rol: 'accion', personajesPresentes: ['Ana', 'Bruno'], lugar: 'el pasillo', momentoDia: 'noche' },
        ],
      },
      { numero: 2, titulo: 'La primera puerta', cliffhanger: '', paragraphs: [{ id: 'par_3', texto: 'Amanecía.', rol: 'narracion', personajesPresentes: ['Ana'], lugar: 'el jardín', momentoDia: 'amanecer' }] },
    ],
  };
}

async function crearServidorDePrueba({ token = 'tok-secreto-1', textCall } = {}) {
  const dataDir = fs.mkdtempSync(path.join(TMP, 'case-'));
  const env = {
    HISTORIETAS_STORAGE: 'local',
    HISTORIETAS_STUDIO_TOKEN: token,
    HISTORIETAS_PROVIDER: 'mock',
  };
  const engine = await createEngine({ env, localRoot: dataDir, textCallOverride: textCall });
  return { engine, dataDir };
}

/** Sesión real: hace login y extrae la cookie. */
async function iniciarSesion(engine, token) {
  const r = await engine.handle({ method: 'POST', path: ['login'], body: { token } });
  assert.equal(r.status, 200, 'login ok');
  const cookie = String(r.setCookie || '').split(';')[0];
  const cookies = {};
  const [nombre, valor] = cookie.split('=');
  cookies[nombre] = valor;
  return { cookies };
}

/* ---------------- almacenamiento (driver local real) ---------------- */

test('storage local: JSON + binarios persisten de verdad en disco y sobreviven', async () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'st-'));
  const st = await createStorage({ driver: 'local', localRoot: dir });
  assert.equal(st.driver, 'local');
  await st.putJson('projects/p1/book.json', { titulo: 'X' });
  const buf = Buffer.from([1, 2, 3, 4]);
  await st.putBinary('projects/p1/illustrations/par_1/v1.png', buf, 'image/png');
  // una NUEVA instancia lee lo mismo (persistencia real, no memoria)
  const st2 = await createStorage({ driver: 'local', localRoot: dir });
  assert.deepEqual((await st2.getJson('projects/p1/book.json')), { titulo: 'X' });
  const bin = await st2.getBinary('projects/p1/illustrations/par_1/v1.png');
  assert.deepEqual([...bin.buf], [1, 2, 3, 4]);
  const keys = await st2.list('projects/p1/');
  assert.ok(keys.includes('projects/p1/book.json'));
  assert.ok(keys.includes('projects/p1/illustrations/par_1/v1.png'));
  await st2.del('projects/p1/book.json');
  assert.equal(await st2.getJson('projects/p1/book.json'), null);
});

test('storage: claves ilegales (traversal) se rechazan SIEMPRE', async () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'st-'));
  const st = await createStorage({ driver: 'local', localRoot: dir });
  await assert.rejects(() => st.putJson('../escape.json', { x: 1 }), /ilegal|raíz/);
  await assert.rejects(() => st.putJson('jobs/..\\x.json', { x: 1 }), /ilegal|raíz/);
});

test('storage auto en Vercel sin BLOB_READ_WRITE_TOKEN explica exactamente qué hacer', async () => {
  await assert.rejects(
    () => createStorage({ driver: 'auto', vercel: true }),
    /BLOB_READ_WRITE_TOKEN/,
  );
});

/* ---------------- autenticación de servidor real ---------------- */

test('auth: la cookie firmada verifica, expira y no se falsifica', () => {
  const auth = createAuth({ token: 'tok' });
  const cookie = auth.issueCookie(Date.now());
  const valor = cookie.split(';')[0].split('=')[1];
  assert.ok(auth.verifyCookie(valor, Date.now()));
  // falsificada
  assert.equal(auth.verifyCookie(valor.slice(0, -4) + 'AAAA'), false);
  // con otro secreto
  const otra = createAuth({ token: 'otro' });
  assert.equal(otra.verifyCookie(valor), false);
  // expirada
  const vieja = auth.issueCookie(Date.now() - 8 * 864e5);
  assert.equal(auth.verifyCookie(vieja.split(';')[0].split('=')[1]), false);
  // token de login
  assert.ok(auth.tokenValido('tok'));
  assert.equal(auth.tokenValido('no-es'), false);
});

test('resolveOwnerToken: genera token persistente en local, exige env en Vercel', () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'tok-'));
  const r1 = resolveOwnerToken({ envToken: undefined, dataDir: dir, vercel: false });
  assert.ok(r1.token && r1.token.startsWith('hist-'));
  const r2 = resolveOwnerToken({ envToken: undefined, dataDir: dir, vercel: false });
  assert.equal(r2.token, r1.token, 'el token generado persiste en disco');
  const r3 = resolveOwnerToken({ envToken: 'de-entorno', dataDir: dir, vercel: false });
  assert.equal(r3.token, 'de-entorno');
  const r4 = resolveOwnerToken({ envToken: undefined, dataDir: dir, vercel: true });
  assert.equal(r4.token, null);
  assert.equal(r4.origen, 'env-faltante');
});

/* ---------------- E2E del motor ---------------- */

test('E2E: sin sesión todo está bloqueado; con sesión el ciclo completo funciona', async () => {
  const TOKEN = 'tok-e2e';
  const { engine, dataDir } = await crearServidorDePrueba({ token: TOKEN });

  // ping público
  const ping = await engine.handle({ method: 'GET', path: ['ping'] });
  assert.equal(ping.status, 200);
  assert.equal(ping.json.driver, 'local');
  assert.equal(ping.json.authConfigurado, true);
  assert.equal(ping.json.autenticado, false);
  assert.equal(ping.json.proveedor.id, 'mock');

  // login malo
  const mal = await engine.handle({ method: 'POST', path: ['login'], body: { token: 'no' } });
  assert.equal(mal.status, 401);
  // login bueno
  const sesion = await iniciarSesion(engine, TOKEN);

  // SIN cookie: 401 en todo lo demás
  const sinSesion = await engine.handle({ method: 'GET', path: ['project', 'libro_demo_1'] });
  assert.equal(sinSesion.status, 401, 'autorización real del servidor, no de la UI');

  // sincronizar el libro
  const sync = await engine.handle({ method: 'PUT', path: ['project', 'libro_demo_1'], body: libroDePrueba(), cookies: sesion.cookies });
  assert.equal(sync.status, 200);
  assert.equal(sync.json.capitulos, 2);

  // importar elenco → fichas permanentes
  const imp = await engine.handle({ method: 'POST', path: ['project', 'libro_demo_1', 'characters', 'import'], body: { personajes: libroDePrueba().personajes }, cookies: sesion.cookies });
  assert.equal(imp.status, 200);
  assert.equal(imp.json.creados, 2);
  const imp2 = await engine.handle({ method: 'POST', path: ['project', 'libro_demo_1', 'characters', 'import'], body: { personajes: libroDePrueba().personajes }, cookies: sesion.cookies });
  assert.equal(imp2.json.creados, 0, 'no duplica fichas');
  assert.equal(imp2.json.existentes, 2);

  const fichasR = await engine.handle({ method: 'GET', path: ['project', 'libro_demo_1', 'characters'], cookies: sesion.cookies });
  const fichas = fichasR.json.fichas;
  assert.equal(fichas.length, 2);
  const ana = fichas.find((f) => f.nombre === 'Ana');
  assert.ok(ana.descripcionFisica.includes('short black hair'), 'la ficha nace con el ADN del libro');

  // subir una referencia y aprobarla
  const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const subida = await engine.handle({ method: 'POST', path: ['project', 'libro_demo_1', 'character', ana.id, 'references'], body: { dataUrl: 'data:image/png;base64,' + png1x1, tipo: 'frontal' }, cookies: sesion.cookies });
  assert.equal(subida.status, 201);
  const refId = subida.json.referencia.id;
  const aprobada = await engine.handle({ method: 'POST', path: ['project', 'libro_demo_1', 'reference', ana.id, refId, 'approve'], cookies: sesion.cookies });
  assert.equal(aprobada.json.referencia.estado, 'aprobada');

  // la referencia se puede leer SOLO con sesión (asset autorizado)
  const assetKey = 'projects/libro_demo_1/characters/' + ana.id + '/references/' + refId + '/v1.png';
  const assetSinSesion = await engine.handle({ method: 'GET', path: ['asset'], query: { key: assetKey } });
  assert.equal(assetSinSesion.status, 401, 'las imágenes privadas no son URLs públicas');
  const asset = await engine.handle({ method: 'GET', path: ['asset'], query: { key: assetKey }, cookies: sesion.cookies });
  assert.equal(asset.status, 200);
  assert.ok(asset.binary.buf.length > 10);
  const assetIlegal = await engine.handle({ method: 'GET', path: ['asset'], query: { key: '../escape.png' }, cookies: sesion.cookies });
  assert.equal(assetIlegal.status, 400, 'asset con clave ilegal se rechaza');

  // memoria narrativa (con modelo de texto inyectado)
  const textCall = async () => JSON.stringify({
    escenas: [
      { paraId: 'par_1', ubicacion: 'el vestíbulo de la casa', tiempo: 'noche cerrada', personajesPresentes: ['Ana'], posicionesRelativas: 'Ana al centro', acciones: 'Ana mira la puerta abierta', objetos: [], vestuario: 'abrigo de lana roja', ambiente: 'niebla interior', tipo: 'continua', hechosExplicitos: ['la puerta está abierta'], interpretacionesIA: [] },
      { paraId: 'par_2', ubicacion: 'el pasillo', tiempo: 'noche', personajesPresentes: ['Ana', 'Bruno'], acciones: 'Bruno enciende la linterna', objetos: ['linterna'], vestuario: '', ambiente: 'oscuridad', tipo: 'continua', hechosExplicitos: ['la linterna corta la oscuridad'], interpretacionesIA: [] },
    ],
    notasContinuidad: 'La linterna de Bruno importa en la escena siguiente.',
  });
  const { engine: engineText } = await crearServidorDePrueba({ token: TOKEN, textCall });
  await engineText.handle({ method: 'PUT', path: ['project', 'libro_demo_1'], body: libroDePrueba(), cookies: sesion.cookies });
  await engineText.handle({ method: 'POST', path: ['project', 'libro_demo_1', 'characters', 'import'], body: { personajes: libroDePrueba().personajes }, cookies: sesion.cookies });
  const analisis = await engineText.handle({ method: 'POST', path: ['project', 'libro_demo_1', 'analyze'], body: { chapterIdx: 0 }, cookies: sesion.cookies });
  assert.equal(analisis.status, 200);
  assert.equal(analisis.json.continuity.escenas.length, 2);
  // memoria corregible a mano
  const corregida = await engineText.handle({ method: 'PATCH', path: ['project', 'libro_demo_1', 'continuity', '0'], body: { notasContinuidad: 'Corregido por el autor' }, cookies: sesion.cookies });
  assert.equal(corregida.json.continuity.notasContinuidad, 'Corregido por el autor');
  assert.ok(corregida.json.continuity.editedByAuthorAt);

  // trabajo de ilustración: crear + pasos hasta completar
  const jobCreado = await engineText.handle({ method: 'POST', path: ['project', 'libro_demo_1', 'jobs'], body: { chapterIdx: 0 }, cookies: sesion.cookies });
  assert.equal(jobCreado.status, 201);
  const jobId = jobCreado.json.job.id;
  assert.equal(jobCreado.json.job.total, 2);
  // sin duplicados: crear de nuevo devuelve el MISMO trabajo activo
  const jobDup = await engineText.handle({ method: 'POST', path: ['project', 'libro_demo_1', 'jobs'], body: { chapterIdx: 0 }, cookies: sesion.cookies });
  assert.equal(jobDup.json.job.id, jobId);
  assert.ok(jobDup.json.yaExistente);

  let job = jobCreado.json.job;
  let vueltas = 0;
  while (job.state === 'en_curso' && vueltas++ < 10) {
    const paso = await engineText.handle({ method: 'POST', path: ['job', jobId, 'step'], cookies: sesion.cookies, ip: 'test' });
    assert.equal(paso.status, 200);
    job = paso.json.job;
  }
  assert.equal(job.state, 'completado');
  assert.equal(job.done, 2);
  assert.ok(job.items.every((i) => i.state === 'hecho'));

  // las ilustraciones existen, con versiones y QA automático
  const ilustraciones = await engineText.handle({ method: 'GET', path: ['project', 'libro_demo_1', 'illustrations', '0'], cookies: sesion.cookies });
  assert.equal(ilustraciones.json.ilustraciones.length, 2);
  const par1 = ilustraciones.json.ilustraciones.find((m) => m.paraId === 'par_1');
  assert.ok(par1.versions.length >= 1);
  assert.ok(par1.versions[0].key.startsWith('projects/libro_demo_1/illustrations/par_1/v1.'));
  assert.ok(par1.versions[0].evaluacion, 'el QA automático viaja con la versión');
  // el binario persistió de verdad
  const bin = await engineText.storage.getBinary(par1.versions[0].key);
  assert.ok(bin.buf.length > 20);
  // el prompt respetó el presupuesto de 800
  assert.ok(par1.versions[0].prompt.length <= 800);

  // aprobar una ilustración (la decisión final es del autor)
  const ap = await engineText.handle({ method: 'POST', path: ['project', 'libro_demo_1', 'illustration', 'par_1', 'approve'], cookies: sesion.cookies });
  assert.equal(ap.json.ilustracion.estado, 'aprobada');
  // rechazar otra
  const re = await engineText.handle({ method: 'POST', path: ['project', 'libro_demo_1', 'illustration', 'par_2', 'reject'], body: { notas: 'más oscuridad' }, cookies: sesion.cookies });
  assert.equal(re.json.ilustracion.estado, 'requiere_correccion');

  // el trabajo de un capítulo completado puede re-crearse para regenerar
  const jobNuevo = await engineText.handle({ method: 'POST', path: ['project', 'libro_demo_1', 'jobs'], body: { chapterIdx: 0 }, cookies: sesion.cookies });
  assert.equal(jobNuevo.status, 201, 'al terminar el anterior se puede abrir uno nuevo');
  let job2 = jobNuevo.json.job;
  let v2 = 0;
  while (job2.state === 'en_curso' && v2++ < 10) {
    job2 = (await engineText.handle({ method: 'POST', path: ['job', job2.id, 'step'], cookies: sesion.cookies, ip: 'test' })).json.job;
  }
  const par1v2 = (await engineText.handle({ method: 'GET', path: ['project', 'libro_demo_1', 'illustration', 'par_1'], cookies: sesion.cookies })).json.ilustracion;
  assert.ok(par1v2.versions.length >= 2, 'la regeneración crea una versión NUEVA sin borrar la anterior');
  const binV1 = await engineText.storage.getBinary(par1v2.versions[0].key);
  assert.ok(binV1, 'la versión anterior sigue ahí (requisito: nunca se pierde lo aprobado)');

  // 404 correctos
  const inexistente = await engineText.handle({ method: 'GET', path: ['project', 'libro_demo_1', 'illustration', 'no-existe'], cookies: sesion.cookies });
  assert.equal(inexistente.status, 404);
  const rutaRara = await engineText.handle({ method: 'DELETE', path: ['nada'], cookies: sesion.cookies });
  assert.equal(rutaRara.status, 404);
});

/* ---------------- proveedores ---------------- */

test('proveedor mock: PNG real y determinista por semilla', async () => {
  const mock = proveedorMock({ delayMs: 0 });
  const r1 = await mock.generate({ prompt: 'x', seed: 42 });
  const r2 = await mock.generate({ prompt: 'x', seed: 42 });
  assert.equal(r1.buf.toString('hex'), r2.buf.toString('hex'), 'determinista');
  assert.equal(r1.buf[1], 0x50); assert.equal(r1.buf[2], 0x4e); assert.equal(r1.buf[3], 0x47); // firma PNG
  const r3 = await mock.generate({ prompt: 'x', seed: 300 });
  assert.notEqual(r1.buf.toString('hex'), r3.buf.toString('hex'), 'la semilla cambia el color');
});

test('proveedor nvidia: payload correcto por modelo y referencia solo donde el modelo la admite', async () => {
  const llamadas = [];
  const fetchImpl = async (url, opts) => {
    llamadas.push({ url: String(url), body: JSON.parse(opts.body) });
    return { ok: true, status: 200, json: async () => ({ image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' }) };
  };
  const p = proveedorNvidia({ apiKey: 'nvapi-test', fetchImpl });
  assert.equal(p.disponible, true);
  // klein: sin image, steps 4, dimensiones del esquema
  await p.generate({ prompt: 'x', model: 'black-forest-labs/flux.2-klein-4b', aspect: '16:9', seed: 7 });
  assert.equal(llamadas[0].body.image, undefined);
  assert.equal(llamadas[0].body.steps, 4);
  assert.deepEqual([llamadas[0].body.width, llamadas[0].body.height], [1344, 768]);
  assert.ok(llamadas[0].url.endsWith('/black-forest-labs/flux.2-klein-4b'));
  assert.equal(llamadas[0].body.seed, 7);
  // kontext CON referencia: image + match_input_image
  await p.generate({ prompt: 'x', model: 'black-forest-labs/flux.1-kontext-dev', seed: 3, referenceDataUrl: 'data:image/png;base64,REF' });
  assert.equal(llamadas[1].body.image, 'data:image/png;base64,REF');
  assert.equal(llamadas[1].body.aspect_ratio, 'match_input_image');
  // sd35 con negative_prompt nativo
  await p.generate({ prompt: 'x', negative: 'no text', model: 'stabilityai/stable-diffusion-3.5-large', aspect: '1:1', seed: 1 });
  assert.equal(llamadas[2].body.negative_prompt, 'no text');
  assert.equal(llamadas[2].body.steps, 30);
  // el adaptador rechaza modelos desconocidos
  await assert.rejects(() => p.generate({ prompt: 'x', model: 'desconocido/x' }), /desconocido/);
});

test('proveedor nvidia sin clave: mensaje claro, nunca simula', () => {
  const p = proveedorNvidia({ apiKey: '' });
  assert.equal(p.disponible, false);
  assert.ok(p.razon.includes('NVIDIA_API_KEY'));
});

/* ---------------- prompts y QA ---------------- */

test('buildIllustrationPrompt: ADN prioritario, presupuesto 800, continuidad solo cuando toca', () => {
  const fichas = [
    { nombre: 'Ana', descripcionFisica: 'short black hair, olive skin', vestuario: 'red wool coat, grey jeans', cabello: '', ojos: '', complexion: '', rasgosInvariables: ['scar over left eyebrow'] },
    { nombre: 'Bruno', descripcionFisica: 'white beard, round glasses', vestuario: 'brown corduroy jacket', cabello: '', ojos: '', complexion: '', rasgosInvariables: [] },
  ];
  const escena = { ubicacion: 'el pasillo de la casa', tiempo: 'noche', personajesPresentes: ['Ana', 'Bruno'], acciones: 'Bruno enciende la linterna', ambiente: 'oscuridad cortada por el haz', tipo: 'continua' };
  const previa = { ubicacion: 'el vestíbulo', tiempo: 'noche' };
  const prompt = buildIllustrationPrompt({ fichas, escena, previa, config: {} });
  assert.ok(prompt.length <= 800, 'presupuesto');
  assert.ok(prompt.includes('Ana'));
  assert.ok(prompt.includes('scar over left eyebrow'), 'el rasgo invariable viaja');
  assert.ok(prompt.includes('Direct continuation'), 'la continuidad explícita solo cuando la escena es continua');
  // salto temporal: SIN continuidad forzada
  const salto = buildIllustrationPrompt({ fichas, escena: { ...escena, tipo: 'salto_temporal' }, previa, config: {} });
  assert.ok(!salto.includes('Direct continuation'), 'no impone continuidad en saltos (requisito #7)');
  // ADN kilométrico: sigue dentro de 800 y los DOS personajes viajan
  const gordos = fichas.map((f) => ({ ...f, descripcionFisica: f.descripcionFisica + ' ' + 'detalle visual muy concreto '.repeat(40) }));
  const gordo = buildIllustrationPrompt({ fichas: gordos, escena, previa, config: {} });
  assert.ok(gordo.length <= 800);
  assert.ok(gordo.includes('Ana'));
  assert.ok(gordo.includes('Bruno'));
});

test('seedDe: determinista por párrafo y versión', () => {
  assert.equal(seedDe('par_1', 1), seedDe('par_1', 1));
  assert.notEqual(seedDe('par_1', 1), seedDe('par_1', 2));
  assert.notEqual(seedDe('par_1', 1), seedDe('par_2', 1));
});

test('evaluarIlustracion: fail-open ante QA ilegible o sin modelo', async () => {
  const sinModelo = await evaluarIlustracion({ textCall: null, parrafo: { texto: 'x' } });
  assert.equal(sinModelo.veredicto, 'en_revision');
  assert.ok(sinModelo.failOpen);
  const ilegible = await evaluarIlustracion({ textCall: async () => 'no entiendo', parrafo: { texto: 'x' }, dataUrlIlustracion: 'data:image/png;base64,x' });
  assert.equal(ilegible.veredicto, 'en_revision');
  const aprobada = await evaluarIlustracion({ textCall: async () => JSON.stringify({ veredicto: 'aprobada', checks: { identidad: 'ok' }, issues: [] }), parrafo: { texto: 'x' }, dataUrlIlustracion: 'data:image/png;base64,x' });
  assert.equal(aprobada.veredicto, 'aprobada');
  assert.equal(aprobada.checks.identidad, 'ok');
});
