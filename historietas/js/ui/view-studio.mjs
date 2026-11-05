/* view-studio.mjs — el TALLER DE ILUSTRACIÓN.
   v4.0: SIN LOGIN — funciona directamente con el libro local (IndexedDB).
   El Taller muestra el estado de las ilustraciones del libro: un capítulo por
   sesión, la puerta de calidad, y los huecos con sus imágenes reales.
   La API del servidor (Parte 2) es OPCIONAL: si responde, se usa; si no,
   todo funciona en local sin pedir NADA al usuario. */

import { el, icon, toast, confirmar } from './components.mjs';
import { app } from '../core/app.mjs';
import { computeStats, STATUS_LABEL } from '../domain/book.mjs';
import { normalizeStudio, capituloActual, progreso as progresoTaller, ESTADO_LABEL, confirmarCapitulo } from '../studio/state.mjs';

export async function render(root, params) {
  const book = await app.db.getBook(params.id);
  root.innerHTML = '';
  if (!book) {
    root.append(el('div', { class: 'empty' }, el('h3', {}, 'Historia no encontrada'),
      el('button', { class: 'btn', onClick: () => app.router.go('/') }, 'Volver a la biblioteca')));
    return;
  }
  computeStats(book);
  const studio = normalizeStudio(book, book.studio);
  const actual = capituloActual(studio);
  const prog = progresoTaller(studio);

  const shell = el('div', { class: 'taller' });
  root.append(shell);

  /* ---------- cabecera ---------- */
  const headEl = el('div', { class: 'taller__head' },
    el('button', { class: 'btn btn--ghost btn--small', onClick: () => app.router.go('/libro/' + book.id) }, icon('chevronLeft', 14), 'Volver al libro'),
    el('span', { class: 'badge badge--' + book.status }, STATUS_LABEL[book.status] || book.status),
    el('div', { class: 'taller__titulo-wrap' },
      el('h2', { class: 'taller__titulo' }, 'Taller de Ilustración'),
      el('p', { class: 'taller__sub' }, (book.meta.titulo || '(sin título)') + ' — ' + book.stats.panelsOk + '/' + book.stats.panels + ' paneles listos')),
    el('div', { class: 'taller__prog' },
      el('span', { class: 'taller__prog-num' }, prog.confirmados + '/' + prog.total + ' confirmados'),
      el('div', { class: 'taller__prog-bar' }, el('i', { style: 'width:' + prog.pct + '%' }))));
  shell.append(headEl);

  /* ---------- raíl de capítulos + mesa ---------- */
  const rail = el('aside', { class: 'taller__rail' },
    el('h3', { class: 'taller__rail-title' }, icon('list', 15), 'Capítulos'));
  const mesa = el('section', { class: 'taller__mesa' });

  studio.capitulos.forEach((c, i) => {
    const esActual = i === actual;
    const confirmado = c.estado === 'confirmado';
    rail.append(el('button', {
      class: 'taller__cap' + (esActual ? ' is-actual' : '') + (confirmado ? ' is-ok' : ''),
      onClick: () => { dibujarMesa(i); },
    },
      el('span', { class: 'taller__cap-num' }, String(i + 1).padStart(2, '0')),
      el('span', { class: 'taller__cap-titulo' }, (book.chapters[i]?.titulo || 'Capítulo ' + (i + 1)).slice(0, 42)),
      el('span', { class: 'taller__cap-estado taller__cap-estado--' + c.estado }, confirmado ? '✓' : ESTADO_LABEL[c.estado])));
  });

  function dibujarMesa(idx) {
    mesa.innerHTML = '';
    const c = book.chapters[idx];
    if (!c) return;

    const ok = c.paragraphs.filter((p) => p.panel?.status === 'ok').length;
    const errs = c.paragraphs.filter((p) => p.panel?.status === 'error').length;
    const cs = studio.capitulos[idx];

    mesa.append(el('div', { class: 'taller__sesion-head' },
      el('div', {},
        el('span', { class: 'taller__sesion-kicker' }, 'Sesión de ilustración'),
        el('h3', { class: 'taller__sesion-titulo' }, 'Capítulo ' + c.numero + ' — ' + (c.titulo || '')),
        el('p', { class: 'hint' }, (c.paragraphs || []).length + ' párrafos · ' + ok + ' ilustrados' + (errs ? ' · ' + errs + ' con error' : '') + ' · la calidad se confirma antes de avanzar')),
      el('div', { class: 'taller__sesion-actions' },
        el('button', {
          class: 'btn btn--ghost',
          title: 'Reanudar la forja (escribe + ilustra lo que falta)',
          onClick: () => app.router.go('/forja/' + book.id),
        }, icon('play', 15), 'Reanudar forja'),
        el('button', {
          class: 'btn btn--ghost', disabled: cs.estado !== 'ilustrado',
          title: 'Confirma la calidad y desbloquea el siguiente capítulo',
          onClick: async () => {
            if (!(await confirmar('Confirmas la calidad de este capítulo y desbloqueas el siguiente?', { okTxt: 'Confirmar calidad' }))) return;
            cs.estado = 'confirmado';
            book.studio = studio;
            await app.db.putBook(book);
            toast('Capítulo confirmado — el siguiente está desbloqueado', 'ok');
            render(document.getElementById('app'), { id: book.id });
          },
        }, icon('check', 15), 'Confirmar calidad y avanzar'))));

    const grid = el('div', { class: 'taller__grid' });
    (c.paragraphs || []).forEach((p) => {
      const estado = p.panel?.status || 'pendiente';
      const evaluacion = p.panel?.qa;
      const imgKey = p.panel?.imageKey;
      grid.append(el('div', { class: 'taller__carta' },
        el('div', {
          class: 'taller__hueco taller__hueco--' + (estado === 'ok' ? 'ok' : estado === 'error' ? 'error' : 'pendiente'),
          title: estado === 'error' ? 'Error: ' + (p.panel?.error || '') : '',
        },
          imgKey && estado === 'ok'
            ? (() => {
                const img = el('img', { alt: 'Panel ' + (p.idx + 1), loading: 'lazy' });
                app.db.getImage(imgKey).then((blob) => { if (blob) img.src = URL.createObjectURL(blob); });
                img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit;';
                return img;
              })()
            : icon('palette', 22),
          el('span', { class: 'taller__estado-chip taller__estado-chip--' + estado },
            estado === 'ok' ? '✓ listo' : estado === 'error' ? 'error' : estado === 'generando' ? 'generando…' : 'pendiente'),
          evaluacion && evaluacion.ok === false
            ? (() => {
                const aviso = el('span', { class: 'taller__qa-notas' }, 'QA: ' + (evaluacion.issues?.[0] || '').slice(0, 60));
                aviso.style.cssText = 'position:absolute;left:8px;bottom:8px;right:8px;z-index:2;font-size:10.5px;background:rgba(226,99,92,.85);color:#fff;border-radius:6px;padding:4px 7px;';
                return aviso;
              })() : null),
        el('p', { class: 'taller__extracto' }, (p.texto || '').slice(0, 150) + ((p.texto || '').length > 150 ? '…' : ''))));
    });
    mesa.append(grid);
  }

  dibujarMesa(actual);
  shell.append(el('div', { class: 'taller__cuerpo' }, rail, mesa));
}
