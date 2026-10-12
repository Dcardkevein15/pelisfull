/* view-studio.mjs — el TALLER DE ILUSTRACIÓN (Parte 2 del sistema).
   ASPECTO VISUAL primero (pedido del autor); las funciones internas de
   ilustración se construyen y sincronizan en la próxima sesión contra el
   modelo puro de js/studio/state.mjs.
   Filosofía de la vista: UN CAPÍTULO POR SESIÓN — raíl de capítulos con
   estado, mesa de trabajo del capítulo actual (una tarjeta por párrafo
   con su hueco de ilustración), puerta de calidad: confirmar → siguiente. */

import { el, icon, toast } from './components.mjs';
import { app } from '../core/app.mjs';
import { computeStats, STATUS_LABEL } from '../domain/book.mjs';
import { normalizeStudio, capituloActual, puedeIlustrar, progreso, ESTADO_LABEL } from '../studio/state.mjs';

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
  const prog = progreso(studio);

  const shell = el('div', { class: 'taller' });
  root.append(shell);

  /* ---------- cabecera del taller ---------- */
  shell.append(el('div', { class: 'taller__head' },
    el('button', { class: 'btn btn--ghost btn--small', onClick: () => app.router.go('/libro/' + book.id) }, icon('chevronLeft', 14), 'Volver al libro'),
    el('span', { class: 'badge badge--' + book.status }, STATUS_LABEL[book.status] || book.status),
    el('div', { class: 'taller__titulo-wrap' },
      el('h2', { class: 'taller__titulo' }, 'Taller de Ilustración'),
      el('p', { class: 'taller__sub' }, book.meta.titulo || '(sin título)' + ' — ' + book.stats.chapters + ' capítulos · ' + book.stats.paragraphs + ' párrafos para ilustrar')),
    el('div', { class: 'taller__prog' },
      el('span', { class: 'taller__prog-num' }, prog.confirmados + '/' + prog.total + ' confirmados'),
      el('div', { class: 'taller__prog-bar' }, el('i', { style: 'width:' + prog.pct + '%' })))));

  /* ---------- raíl de capítulos ---------- */
  const rail = el('aside', { class: 'taller__rail' },
    el('h3', { class: 'taller__rail-title' }, icon('list', 15), 'Capítulos'));
  const mesa = el('section', { class: 'taller__mesa', id: 'taller-mesa' });

  studio.capitulos.forEach((c, i) => {
    const esActual = i === actual;
    const desbloqueado = puedeIlustrar(studio, i);
    rail.append(el('button', {
      class: 'taller__cap' + (esActual ? ' is-actual' : '') + (c.estado === 'confirmado' ? ' is-ok' : ''),
      onClick: () => { if (esActual) return dibujarMesa(i); if (desbloqueado) { studio.actual = i; dibujarMesa(i); } else toast('La sesión es capítulo a capítulo: confirma el actual para avanzar', 'info'); },
    },
      el('span', { class: 'taller__cap-num' }, String(i + 1).padStart(2, '0')),
      el('span', { class: 'taller__cap-titulo' }, (book.chapters[i]?.titulo || 'Capítulo ' + (i + 1)).slice(0, 42)),
      el('span', { class: 'taller__cap-estado taller__cap-estado--' + c.estado }, ESTADO_LABEL[c.estado])));
  });

  function dibujarMesa(idx) {
    studio.actual = idx;
    mesa.innerHTML = '';
    const c = book.chapters[idx];
    const cs = studio.capitulos[idx];
    if (!c) return;

    // encabezado de la sesión
    mesa.append(el('div', { class: 'taller__sesion-head' },
      el('div', {},
        el('span', { class: 'taller__sesion-kicker' }, 'Sesión de ilustración'),
        el('h3', { class: 'taller__sesion-titulo' }, 'Capítulo ' + c.numero + ' — ' + (c.titulo || '')),
        el('p', { class: 'hint' }, (c.paragraphs || []).length + ' párrafos · un hueco de ilustración por párrafo · la calidad se confirma antes de avanzar')),
      el('div', { class: 'taller__sesion-actions' },
        el('button', {
          class: 'btn btn--primary',
          onClick: () => toast('Las funciones internas de ilustración se construyen en la próxima sesión — el aspecto visual está listo', 'info', 6000),
        }, icon('wand', 15), 'Ilustrar capítulo ' + c.numero),
        el('button', {
          class: 'btn btn--ghost',
          title: cs.estado === 'ilustrado' ? 'Confirma la calidad y desbloquea el siguiente capítulo' : 'Primero ilustra el capítulo',
          disabled: cs.estado !== 'ilustrado',
          onClick: () => toast('La puerta de calidad se activa cuando el capítulo esté ilustrado', 'info'),
        }, icon('check', 15), 'Confirmar calidad'))));

    // tarjetas de párrafos: hueco de ilustración + extracto del texto
    const grid = el('div', { class: 'taller__grid' });
    (c.paragraphs || []).forEach((p, pi) => {
      const ps = cs.parrafos[pi] || { estado: 'pendiente' };
      grid.append(el('div', { class: 'taller__carta' },
        el('div', { class: 'taller__hueco taller__hueco--' + ps.estado },
          icon('palette', 22),
          el('span', { class: 'taller__hueco-txt' }, ps.estado === 'ok' ? 'Ilustración lista (se conecta en la próxima sesión)' : 'Hueco de ilustración · párrafo ' + (pi + 1)),
          el('div', { class: 'taller__hueco-actions' },
            el('span', { class: 'taller__mini' }, icon('wand', 12), 'Generar'),
            el('span', { class: 'taller__mini' }, icon('refresh', 12), 'Reintentar'),
            el('span', { class: 'taller__mini' }, icon('eye', 13), 'Ver'))),
        el('p', { class: 'taller__extracto' }, (p.texto || '').slice(0, 150) + ((p.texto || '').length > 150 ? '…' : ''))));
    });
    mesa.append(grid);

    if (!book.chapters[idx].escrito) {
      mesa.append(el('p', { class: 'hint' }, 'Este capítulo aún no está escrito: la forja de texto va primero.'));
    }
  }

  dibujarMesa(actual);
  shell.append(el('div', { class: 'taller__cuerpo' }, rail, mesa));
}
