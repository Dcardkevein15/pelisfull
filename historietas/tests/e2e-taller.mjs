/* e2e-taller.mjs — prueba end-to-end contra el SERVIDOR REAL corriendo en
   localhost:9130 con proveedor de pruebas (HISTORIETAS_PROVIDER=mock).
   Verifica por HTTP: sesión con cookie, sincronización de libro, fichas,
   referencias, trabajo completo de ilustración paso a paso, versiones y
   assets privados. Uso: node tests/e2e-taller.mjs */

import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:9130/historietas/api/studio';
const TOKEN = fs.readFileSync(path.join(process.cwd(), 'data', 'studio-token.txt'), 'utf8').trim();

let cookie = '';

async function api(ruta, { method = 'GET', body } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + ruta, {
    method, headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const setC = res.headers.get('set-cookie');
  if (setC) cookie = setC.split(';')[0];
  let data = null;
  try { data = await res.json(); } catch { /* binary */ }
  return { status: res.status, data: data || {} };
}

const ok = (nombre, cond, detalle = '') => {
  console.log((cond ? '  ✓ ' : '  ✗ FALLO ') + nombre + (detalle ? ' — ' + detalle : ''));
  if (!cond) process.exitCode = 1;
};

const LIBRO = {
  id: 'libro_e2e_http',
  meta: { titulo: 'El Faro de la Niebla', logline: 'Un farero escucha su propia voz en la radio.', portada: { autor: 'E2E', anio: '2026', dedicatoria: '' } },
  personajes: [
    { nombre: 'Mara', rol: 'protagonista', edad: '40', aparienciaEn: 'tall sailor with grey-streaked braid', vestuarioEn: 'yellow oilskin slicker', rasgoDistintivoEn: 'rope burn scar on left palm' },
  ],
  chapters: [{
    numero: 1, titulo: 'La señal', cliffhanger: 'la radio responde',
    paragraphs: [
      { id: 'p_e2e_1', texto: 'Mara subió los escalones del faro mientras la niebla tragaba el mar.', rol: 'narracion', personajesPresentes: ['Mara'], lugar: 'el faro', momentoDia: 'amanecer' },
      { id: 'p_e2e_2', texto: '«¿Alguien ahí?», preguntó a la radio muerta. Y la radio respondió.', rol: 'dialogo', personajesPresentes: ['Mara'], lugar: 'la garita', momentoDia: 'amanecer' },
    ],
  }],
};

console.log('\nE2E del Taller contra http://localhost:9130 (proveedor de pruebas)\n');

// 1) sin sesión → 401 real del servidor
const sinSesion = await api('/project/libro_e2e_http');
ok('sin sesión el servidor deniega (401)', sinSesion.status === 401);

// 2) login con token del archivo persistente
const login = await api('/login', { method: 'POST', body: { token: TOKEN } });
ok('login con token persistente (200, cookie httpOnly)', login.status === 200 && cookie.startsWith('hist_studio='));

// 3) ping autenticado
const ping = await api('/ping');
ok('ping autenticado', ping.data.autenticado === true);

// 4) sincronizar el libro
const sync = await api('/project/' + LIBRO.id, { method: 'PUT', body: LIBRO });
ok('libro sincronizado (2 párrafos)', sync.status === 200 && sync.data.capitulos === 1);

// 5) fichas permanentes
const imp = await api('/project/' + LIBRO.id + '/characters/import', { method: 'POST', body: { personajes: LIBRO.personajes } });
ok('ficha permanente creada desde el elenco', imp.status === 200 && imp.data.creados === 1);
const fichas = await api('/project/' + LIBRO.id + '/characters');
const mara = (fichas.data.fichas || [])[0];
ok('la ficha nace con ADN del libro', !!mara && mara.descripcionFisica.includes('grey-streaked braid'));

// 6) referencia visual subida y aprobada
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const subida = await api('/project/' + LIBRO.id + '/character/' + mara.id + '/references', { method: 'POST', body: { dataUrl: 'data:image/png;base64,' + PNG, tipo: 'frontal' } });
ok('referencia subida al almacenamiento persistente', subida.status === 201);
const aprobarRef = await api('/project/' + LIBRO.id + '/reference/' + mara.id + '/' + subida.data.referencia.id + '/approve', { method: 'POST' });
ok('referencia aprobada como maestra', aprobarRef.status === 200 && aprobarRef.data.referencia.estado === 'aprobada');

// 7) trabajo de ilustración completo (paso a paso, patrón serverless)
const crear = await api('/project/' + LIBRO.id + '/jobs', { method: 'POST', body: { chapterIdx: 0 } });
ok('trabajo creado (2 párrafos en cola)', crear.status === 201 && crear.data.job.total === 2);
let job = crear.data.job;
let vueltas = 0;
while (job.state === 'en_curso' && vueltas++ < 10) {
  const paso = await api('/job/' + job.id + '/step', { method: 'POST' });
  job = paso.data.job;
}
ok('trabajo COMPLETADO (2/2, sin errores)', job.state === 'completado' && job.done === 2);

// 8) ilustraciones con versiones y assets privados
const ilus = await api('/project/' + LIBRO.id + '/illustrations/0');
const p1 = (ilus.data.ilustraciones || []).find((m) => m.paraId === 'p_e2e_1');
ok('ilustración con versión y QA automático', !!p1 && p1.versions.length === 1 && !!p1.versions[0].evaluacion);
ok('prompt dentro del presupuesto real de 800', p1.versions[0].prompt.length <= 800);

const assetKey = p1.versions[0].key;
const resImg = await fetch(BASE + '/asset?key=' + encodeURIComponent(assetKey), { headers: { Cookie: cookie } });
const buf = Buffer.from(await resImg.arrayBuffer());
ok('asset binario servido con sesión', resImg.status === 200 && buf.length > 20 && buf[1] === 0x50);
const sinSesionImg = await fetch(BASE + '/asset?key=' + encodeURIComponent(assetKey));
ok('asset PRIVADO sin sesión (401)', sinSesionImg.status === 401);

// 9) aprobación del autor + regeneración (versión nueva, la anterior se conserva)
const aprobar = await api('/project/' + LIBRO.id + '/illustration/p_e2e_1/approve', { method: 'POST' });
ok('ilustración aprobada por el autor', aprobar.data.ilustracion.estado === 'aprobada');
const jobNuevo = await api('/project/' + LIBRO.id + '/jobs', { method: 'POST', body: { chapterIdx: 0 } });
let job2 = jobNuevo.data.job;
let v = 0;
while (job2.state === 'en_curso' && v++ < 10) {
  job2 = (await api('/job/' + job2.id + '/step', { method: 'POST' })).data.job;
}
const p1v2 = (await api('/project/' + LIBRO.id + '/illustration/p_e2e_1')).data.ilustracion;
ok('regeneración crea v2 SIN borrar v1', p1v2.versions.length === 2 && !!p1v2.versions[0].key);
const binV1 = await fetch(BASE + '/asset?key=' + encodeURIComponent(p1v2.versions[0].key), { headers: { Cookie: cookie } });
ok('la versión anterior sigue accesible', binV1.status === 200);

// 10) persistencia real en disco
const enDisco = fs.existsSync(path.join(process.cwd(), 'data', ...assetKey.split('/')));
ok('la imagen existe FÍSICAMENTE en data/ (persistencia real)', enDisco);

// 11) logout cierra la sesión de verdad
const out = await api('/logout', { method: 'POST' });
const despues = await api('/project/' + LIBRO.id);
ok('logout invalida la sesión (401)', out.status === 200 && despues.status === 401);

console.log(process.exitCode ? '\nE2E: HAY FALLOS\n' : '\nE2E: TODO VERIFICADO CONTRA EL SERVIDOR REAL\n');
