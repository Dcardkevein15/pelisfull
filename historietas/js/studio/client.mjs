/* client.mjs — cliente del navegador para la API del Taller de Ilustración.
   La cookie de sesión la emite el servidor (httpOnly) y viaja sola en cada
   fetch same-origin. Las claves de API NUNCA pasan por aquí: viven en el
   servidor (Vercel) o en el proceso local. */

const BASE = '/historietas/api/studio';

async function llamada(ruta, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + ruta, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  return { status: res.status, ok: res.ok, data: data || {} };
}

export const studioApi = {
  ping: () => llamada('/ping'),

  login: (token) => llamada('/login', { method: 'POST', body: { token } }),
  logout: () => llamada('/logout', { method: 'POST' }),

  sincronizarLibro: (book) => llamada('/project/' + encodeURIComponent(book.id), { method: 'PUT', body: book }),
  proyecto: (pid) => llamada('/project/' + encodeURIComponent(pid)),

  config: (pid) => llamada('/project/' + pid + '/config'),
  guardarConfig: (pid, parche) => llamada('/project/' + pid + '/config', { method: 'PATCH', body: parche }),

  fichas: (pid) => llamada('/project/' + pid + '/characters'),
  importarElenco: (pid, personajes) => llamada('/project/' + pid + '/characters/import', { method: 'POST', body: { personajes } }),
  crearFicha: (pid, ficha) => llamada('/project/' + pid + '/characters', { method: 'POST', body: ficha }),
  editarFicha: (pid, cid, parche) => llamada('/project/' + pid + '/character/' + cid, { method: 'PATCH', body: parche }),
  borrarFicha: (pid, cid) => llamada('/project/' + pid + '/character/' + cid, { method: 'DELETE' }),

  subirReferencia: (pid, cid, dataUrl, tipo) => llamada('/project/' + pid + '/character/' + cid + '/references', { method: 'POST', body: { dataUrl, tipo } }),
  aprobarReferencia: (pid, cid, rid) => llamada('/project/' + pid + '/reference/' + cid + '/' + rid + '/approve', { method: 'POST' }),
  descartarReferencia: (pid, cid, rid) => llamada('/project/' + pid + '/reference/' + cid + '/' + rid + '/discard', { method: 'POST' }),

  analizarCapitulo: (pid, chapterIdx) => llamada('/project/' + pid + '/analyze', { method: 'POST', body: { chapterIdx } }),
  continuidad: (pid, chapterIdx) => llamada('/project/' + pid + '/continuity/' + chapterIdx),
  corregirMemoria: (pid, chapterIdx, body) => llamada('/project/' + pid + '/continuity/' + chapterIdx, { method: 'PATCH', body }),

  crearTrabajo: (pid, chapterIdx) => llamada('/project/' + pid + '/jobs', { method: 'POST', body: { chapterIdx } }),
  trabajo: (jobId) => llamada('/job/' + jobId),
  pasoTrabajo: (jobId) => llamada('/job/' + jobId + '/step', { method: 'POST' }),

  ilustraciones: (pid, chapterIdx) => llamada('/project/' + pid + '/illustrations/' + chapterIdx),
  ilustracion: (pid, paraId) => llamada('/project/' + pid + '/illustration/' + paraId),
  aprobarIlustracion: (pid, paraId) => llamada('/project/' + pid + '/illustration/' + paraId + '/approve', { method: 'POST' }),
  rechazarIlustracion: (pid, paraId, notas) => llamada('/project/' + pid + '/illustration/' + paraId + '/reject', { method: 'POST', body: { notas } }),

  /** URL de un asset autorizado (la cookie viaja sola en el GET del <img>). */
  urlAsset: (key) => BASE + '/asset?key=' + encodeURIComponent(key),

  /** Lee un File del autor como dataURL (para subir referencias). */
  archivoADataUrl: (file) => new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('No se pudo leer la imagen'));
    fr.readAsDataURL(file);
  }),
};
