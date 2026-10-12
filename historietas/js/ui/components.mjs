/* components.mjs — kit de UI: el(), iconos SVG, toasts, modales, barras de progreso. */

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') node.value = v;
    else if (k === 'checked') node.checked = !!v;
    else if (k === 'disabled') node.disabled = !!v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(9)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

/* Iconos: stroke 24x24, heredan currentColor. */
const ICON_PATHS = {
  spark: 'M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.8 2.8M16.2 16.2 19 19M19 5l-2.8 2.8M7.8 16.2 5 19M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2c3 3.5 3 16.5 0 20M12 2c-3 3.5-3 16.5 0 20',
  mask: 'M4 6c0 8 3 12 8 14 5-2 8-6 8-14-2.5 1-5.5 1-8 1s-5.5 0-8-1zM9 11h.01M15 11h.01M9.5 16c1.5 1 2.5 1 5 0',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  pen: 'M14.5 4.5 19.5 9.5 8 21H3v-5L14.5 4.5zM12 7l5 5',
  bolt: 'M13 2 4 14h6l-1 8 9-12h-6l1-8z',
  palette: 'M12 2a10 10 0 0 0 0 20c1.5 0 2-1 2-2s-.5-2 1-2h3a4 4 0 0 0 4-4c0-5-4-12-10-12zM7 9h.01M11 6h.01M15 8h.01M7.5 13h.01',
  book: 'M4 4h9a3 3 0 0 1 3 3v13H7a3 3 0 0 0-3 3V4zM20 4v16M4 20a3 3 0 0 1 3-3h9',
  pulse: 'M2 12h4l2-7 4 14 3-9 2 2h5',
  search: 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.5-4.5',
  heart: 'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z',
  atom: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2c5 0 9 4.5 9 10s-4 10-9 10S3 17.5 3 12 7 2 12 2zM12 2c-5 5-5 15 0 20M12 2c5 5 5 15 0 20',
  crown: 'M3 8l4 4 5-7 5 7 4-4v9H3V8zM3 20h18',
  skull: 'M12 2a8 8 0 0 0-8 8c0 3 1.5 5 3 6v3h10v-3c1.5-1 3-3 3-6a8 8 0 0 0-8-8zM9 11h.01M15 11h.01M10.5 16h3',
  compass: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM16 8l-2.5 5.5L8 16l2.5-5.5L16 8zM12 11h.01',
  scroll: 'M6 3h12v14l-4 4H6V3zM6 21h8M10 8h4M10 12h4',
  laugh: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8 9l2 1-2 1-1-1 1-1zM16 9l-2 1 2 1 1-1-1-1zM7 14c1.5 2 3 3 5 3s3.5-1 5-3',
  star: 'M12 2l2.9 6.3 6.6.7-5 4.5 1.4 6.5L12 16.6 6.1 20l1.4-6.5-5-4.5 6.6-.7L12 2z',
  fedora: 'M3 14c3 1 6 1.5 9 1.5S18 15 21 14v3c-3 1-6 1.5-9 1.5S6 18 3 17v-3zM8 15c1-6 1-9 4-9s3 3 4 9M12 6V4',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4V8zM12 11a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  check: 'M4 12l5 5L20 6',
  wand: 'M4 20 16 8M14 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3zM19 9l.7 2.1L22 12l-2.3.9L19 15l-.7-2.1L16 12l2.3-.9L19 9zM6 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z',
  gear: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2l1 3 3 1 2.5-2 2 2-2 2.5 1 3 3 1v3l-3 1-1 3 2 2.5-2 2-2.5-2-3 1-1 3h-3l-1-3-3-1-2.5 2-2-2 2-2.5-1-3-3-1v-3l3-1 1-3-2-2.5 2-2L9 5l3-1 1-3h3z',
  download: 'M12 3v12M6 11l6 6 6-6M4 20h16',
  refresh: 'M20 12a8 8 0 1 1-3-6.2M20 3v5h-5',
  pencil: 'M14.5 4.5 19.5 9.5 8 21H3v-5L14.5 4.5z',
  trash: 'M4 6h16M9 6V4h6v2M6 6l1 15h10l1-15M10 10v7M14 10v7',
  play: 'M6 4l14 8-14 8V4z',
  pause: 'M7 4v16M17 4v16',
  stop: 'M7 7h10v10H7z',
  x: 'M5 5l14 14M19 5 5 19',
  chevronLeft: 'M14 5l-7 7 7 7',
  chevronRight: 'M10 5l7 7-7 7',
  alert: 'M12 3 2 21h20L12 3zM12 10v5M12 18h.01',
  upload: 'M12 20V8M6 12l6-6 6 6M4 4h16',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  list: 'M4 6h16M4 12h16M4 18h10',
  plus: 'M12 5v14M5 12h14',
  copy: 'M9 9h11v11H9zM4 15V4h11',
  external: 'M14 4h6v6M20 4 10 14M18 13v7H4V6h7',
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  feather: 'M20 4c-6 0-11 3-13 9l-3 7 1 1 7-3c6-2 9-7 9-13V4h-1zM8 16l6-6',
};

export function icon(name, size = 20) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const d = ICON_PATHS[name] || ICON_PATHS.spark;
  const parts = d.match(/[MmLlHhVvAaCcSsQqZz][^MmLlHhVvAaCcSsQqZz]*/g) || [d];
  for (const p of parts) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', p.trim());
    svg.append(path);
  }
  svg.style.flexShrink = '0';
  return svg;
}

/* ---------------- toasts ---------------- */

export function toast(msg, tipo = 'info', ms = 4200) {
  const root = document.getElementById('toasts');
  if (!root) return console.log('[toast]', tipo, msg);
  const t = el('div', { class: 'toast toast--' + tipo },
    el('span', { class: 'toast__ico' }, icon(tipo === 'error' ? 'alert' : tipo === 'ok' ? 'check' : 'spark', 16)),
    el('span', { class: 'toast__msg' }, String(msg)));
  root.append(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => {
    t.classList.remove('in');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

/* ---------------- modal de confirmación ---------------- */

export function confirmar(mensaje, { titulo = '¿Seguro?', okTxt = 'Confirmar', cancelTxt = 'Cancelar', danger = false } = {}) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const close = (val) => { wrap.remove(); resolve(val); };
    const wrap = el('div', { class: 'modal-wrap' },
      el('div', { class: 'modal' + (danger ? ' modal--danger' : '') },
        el('h3', {}, titulo),
        el('p', { class: 'modal__msg' }, mensaje),
        el('div', { class: 'modal__actions' },
          el('button', { class: 'btn btn--ghost', onClick: () => close(false) }, cancelTxt),
          el('button', { class: 'btn ' + (danger ? 'btn--danger' : 'btn--primary'), onClick: () => close(true) }, okTxt),
        )));
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(false); });
    root.append(wrap);
  });
}

/* ---------------- barra de progreso ---------------- */

export function progress(pct, cls = '') {
  const bar = el('div', { class: 'progress ' + cls },
    el('div', { class: 'progress__fill', style: 'width:' + Math.max(0, Math.min(100, pct)) + '%' }));
  return bar;
}

export function spinner(size = 18) {
  const s = el('span', { class: 'spinner' });
  s.style.width = s.style.height = size + 'px';
  return s;
}
