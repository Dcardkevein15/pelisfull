/* main.mjs — arranque: rutas, navegación y manejo global de errores. */

import { bootApp, app } from './core/app.mjs';
import * as Library from './ui/view-library.mjs';
import * as Wizard from './ui/view-wizard.mjs';
import * as Forge from './ui/view-forge.mjs';
import * as Reader from './ui/view-reader.mjs';
import * as Studio from './ui/view-studio.mjs';
import * as Settings from './ui/view-settings.mjs';
import { el, icon, toast } from './ui/components.mjs';

bootApp();

/* Marca de versión: confirma de un vistazo qué build corre el navegador (pie de página). */
const VERSION = 'v3.0 · Solo texto + PDF + Taller de Ilustración';
(() => {
  const foot = document.querySelector('.foot');
  if (foot) foot.append(' · ' + VERSION);
  window.HISTORIETAS_VERSION = VERSION;
})();

/* Configuración por enlace: http://localhost:9130/?nvkey=nvapi-… deja la clave guardada
   (patrón del ecosistema, como el ?k= de objetivos) y limpia la URL tras guardarla. */
(() => {
  try {
    const nvkey = new URLSearchParams(location.search).get('nvkey');
    if (nvkey && nvkey.startsWith('nvapi-')) {
      app.store.set('nvApiKey', nvkey.trim());
      const u = new URL(location);
      u.search = '';
      history.replaceState({}, '', u);
      toast('Clave NVIDIA configurada desde el enlace — todo listo.', 'ok');
    }
  } catch { /* sin URLSearchParams o sin history: seguimos igual */ }
})();

const root = document.getElementById('app');

function renderView(fn, params = {}) {
  window.scrollTo(0, 0);
  Promise.resolve(fn(root, params)).catch((e) => {
    console.error('[historietas]', e);
    root.innerHTML = '';
    root.append(el('div', { class: 'empty' },
      el('h3', {}, 'Algo se rompió en el estudio'),
      el('p', { class: 'hint' }, e.message || String(e)),
      el('button', { class: 'btn', onClick: () => location.hash = '/' }, 'Volver a la biblioteca')));
  });
  markNav();
}

function markNav() {
  const h = (location.hash || '#/').replace('#', '');
  for (const a of document.querySelectorAll('.topnav a')) {
    const target = a.getAttribute('href').replace('#', '');
    a.classList.toggle('is-active', h === target || (target !== '/ajustes' && h.startsWith('/libro') === false && h === target));
  }
}

app.router.add('/', (p) => renderView(Library.render, p));
app.router.add('/nuevo', (p) => renderView(Wizard.render, p));
app.router.add('/forja/:id', (p) => renderView(Forge.render, p));
app.router.add('/libro/:id', (p) => renderView(Reader.render, p));
app.router.add('/taller/:id', (p) => renderView(Studio.render, p));
app.router.add('/ajustes', (p) => renderView(Settings.render, p));
app.router.start();

window.addEventListener('error', (e) => console.error('[historietas:global]', e.message));
window.addEventListener('unhandledrejection', (e) => console.error('[historietas:rejection]', e.reason));

window.Historietas = app;
