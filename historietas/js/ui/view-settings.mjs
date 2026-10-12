/* view-settings.mjs — clave NVIDIA, modelo de texto, transporte y diagnóstico.
   v3.0: sin ajustes de imagen — la ilustración vive en el Taller (Parte 2). */

import { el, icon, toast, spinner } from './components.mjs';
import { app } from '../core/app.mjs';
import { TEXT_MODELS } from '../api/models.mjs';
import { CATEGORIES } from '../specialists/registry.mjs';

export function render(root) {
  const s = app.store;
  root.innerHTML = '';
  const wrap = el('div', { class: 'settings' });

  /* ---------- clave ---------- */
  const keyGuardada = String(s.get('nvApiKey') || '');
  const mascara = keyGuardada
    ? 'nvapi-…' + keyGuardada.slice(-4) + ' (guardada en este navegador)'
    : '(sin clave guardada todavía)';
  wrap.append(section('Clave NVIDIA NIM', 'key',
    el('p', { class: 'hint' },
      'Gratuita con créditos de prueba: créala en ',
      el('a', { href: 'https://build.nvidia.com', target: '_blank', rel: 'noopener' }, 'build.nvidia.com'),
      ' → "Get API Key". Empieza por "nvapi-…". Se guarda solo en este navegador.'),
    el('p', { class: 'hint hint--dna' }, 'Clave activa: ' + mascara),
    fieldRow('Clave de API', el('input', {
      type: 'password', class: 'input', id: 'f-key', value: s.get('nvApiKey'),
      placeholder: 'nvapi-…', autocomplete: 'off', spellcheck: 'false',
    }), el('button', { class: 'btn btn--ghost btn--small', onClick: () => {
      const inp = document.getElementById('f-key');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    } }, icon('eye', 14), 'Ver'))));

  /* ---------- modelo ---------- */
  const selText = el('select', { class: 'input', id: 'f-text' },
    TEXT_MODELS.map((m) => el('option', {
      value: m.id, selected: s.get('textModel') === m.id,
    }, (m.recomendado ? '★ ' : '') + m.nombre + ' — ' + m.desc)));
  selText.value = s.get('textModel');

  wrap.append(section('Modelo de escritura (los más inteligentes del catálogo gratuito)', 'atom',
    fieldRow('Modelo de texto/razonamiento', selText),
    el('p', { class: 'hint' }, 'Recomendado: Kimi K3, 2.8T de parámetros — escribe con matiz literario y razona siempre.')));

  /* ---------- transporte ---------- */
  const selTr = el('select', { class: 'input', id: 'f-transport' },
    el('option', { value: 'auto' }, 'Automático (detecta el mejor camino)'),
    el('option', { value: 'bridge' }, 'Puente integrado (/historietas/api — servidor Next)'),
    el('option', { value: 'proxy' }, 'Puente local (server.js — /proxy)'),
    el('option', { value: 'direct' }, 'Directo a nvidia.com (solo si tu red lo permite)'),
    el('option', { value: 'custom' }, 'Personalizado'));
  selTr.value = s.get('transport');
  wrap.append(section('Conexión con la API', 'globe',
    fieldRow('Transporte', selTr),
    fieldRow('URL del puente personalizado (opcional)', el('input', {
      class: 'input', id: 'f-proxy', value: s.get('customProxyBase'), placeholder: 'http://localhost:9130/proxy',
    })),
    el('p', { class: 'hint' },
      'NVIDIA no envía cabeceras CORS al navegador. Esta app usa el puente del propio servidor Next (/historietas/api/…). ' +
      'Si abres la app standalone con ABRIR-HISTORIETAS.bat, el server.js local hace de puente. El modo automático los prueba en orden.'),
    el('button', { class: 'btn', id: 'btn-diag', onClick: diagnostico }, icon('pulse', 16), 'Ejecutar diagnóstico'),
    el('div', { id: 'diag-out', class: 'diag-out' })));

  /* ---------- generación ---------- */
  const selParas = el('select', { class: 'input', id: 'f-paras' },
    [6, 7, 8, 9, 10, 11, 12, 13, 14].map((n) =>
      el('option', { value: String(n), selected: s.get('parrafosPorCapitulo') === n }, n + ' párrafos' + (n === 10 ? ' (recomendado)' : ''))));
  wrap.append(section('Valores por defecto de la forja', 'gear',
    fieldRow('Párrafos por capítulo', selParas),
    el('label', { class: 'check' },
      el('input', { type: 'checkbox', id: 'f-impacto', checked: s.get('paseImpacto') }),
      'Pase de impacto en capítulos clave (apertura, punto medio, clímax y final)')));

  /* ---------- peligro ---------- */
  wrap.append(section('Zona peligrosa', 'alert',
    el('button', {
      class: 'btn btn--danger', onClick: async () => {
        const books = await app.db.listBooks();
        for (const b of books) await app.db.deleteBook(b.id);
        toast('Biblioteca borrada por completo', 'ok');
      },
    }, icon('trash', 16), 'Borrar TODA la biblioteca local')));

  /* ---------- guardar ---------- */
  wrap.append(el('div', { class: 'settings__save' },
    el('button', {
      class: 'btn btn--primary btn--lg', onClick: () => {
        s.update({
          nvApiKey: document.getElementById('f-key').value.trim(),
          textModel: document.getElementById('f-text').value,
          transport: document.getElementById('f-transport').value,
          customProxyBase: document.getElementById('f-proxy').value.trim(),
          parrafosPorCapitulo: Number(document.getElementById('f-paras').value),
          paseImpacto: document.getElementById('f-impacto').checked,
        });
        toast('Ajustes guardados', 'ok');
      },
    }, icon('check', 18), 'Guardar ajustes')));

  root.append(
    el('h2', { class: 'section-title' }, el('span', { class: 'section-title__ico' }, icon('gear', 22)), 'Ajustes del estudio'),
    wrap,
    el('p', { class: 'credits-note' },
      CATEGORIES.length + ' salas de especialistas · ' + TEXT_MODELS.length + ' modelos de texto · todos gratuitos con tu clave de build.nvidia.com'));
}

/* ---------------- helpers locales ---------------- */

function section(titulo, ico, ...children) {
  return el('section', { class: 'settings__section' },
    el('h3', {}, el('span', { class: 'section-title__ico' }, icon(ico, 18)), titulo),
    ...children);
}

function fieldRow(label, control, extra) {
  return el('div', { class: 'field' },
    el('label', { class: 'field__label' }, label),
    el('div', { class: 'field__row' }, control, extra || null));
}

async function diagnostico() {
  const out = document.getElementById('diag-out');
  const btn = document.getElementById('btn-diag');
  if (!app.store.get('nvApiKey')) { toast('Pega primero tu clave NVIDIA', 'error'); return; }
  btn.disabled = true;
  out.innerHTML = '';
  out.append(el('div', { class: 'diag-running' }, spinner(16), 'Probando el servicio de escritura contra la API…'));
  try {
    const res = await app.client.test();
    out.innerHTML = '';
    out.append(
      diagRow('Texto', res.text),
      res.text.ok
        ? el('p', { class: 'diag-ok' }, icon('check', 14), 'Forja lista. Todo funciona.')
        : el('p', { class: 'hint' }, 'Revisa tu conexión, la clave y los créditos de tu cuenta.'));
  } catch (e) {
    out.innerHTML = '';
    out.append(diagRow('Diagnóstico', { ok: false, msg: e.message }));
  } finally {
    btn.disabled = false;
  }
}

function diagRow(nombre, r) {
  if (!r) return el('div', { class: 'diag-row' }, nombre + ': sin datos');
  return el('div', { class: 'diag-row ' + (r.ok ? 'diag-row--ok' : 'diag-row--err') },
    el('strong', {}, nombre + ': ' + (r.ok ? 'OK' : 'FALLO') + (r.ms ? ' (' + r.ms + ' ms)' : '')),
    el('span', {}, r.msg || ''));
}
