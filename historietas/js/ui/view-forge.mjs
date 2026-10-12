/* view-forge.mjs — la forja: monitor en vivo de la generación con fases, logs y control. */

import { el, icon, toast, spinner } from './components.mjs';
import { app, startRun, getRun, cancelRun } from '../core/app.mjs';
import { PHASES, STATUS_LABEL, computeStats } from '../domain/book.mjs';
import { getCategory, teamForPhase } from '../specialists/registry.mjs';

let unsubs = [];

export async function render(root, params) {
  cleanupSubs();
  const bookId = params.id;
  let book = await app.db.getBook(bookId);
  if (!book) {
    root.innerHTML = '';
    root.append(el('div', { class: 'empty' }, el('h3', {}, 'Historia no encontrada'),
      el('button', { class: 'btn', onClick: () => app.router.go('/') }, 'Volver a la biblioteca')));
    return;
  }

  const run = getRun(bookId);
  if (run) book = run.book; // referencia viva de la forja activa

  root.innerHTML = '';
  const shell = el('div', { class: 'forge' });
  root.append(shell);

  if (book.status === 'cola' && !run) startRun(book);

  /* ---------- eventos en vivo ---------- */
  const onLog = (e) => { if (e.bookId === bookId) { book.progress.log.push(e); drawLog(); } };
  const onPhase = (e) => { if (e.bookId === bookId) drawAll(); };
  const onChapter = (e) => { if (e.bookId === bookId) drawChapters(); };
  const onBook = (e) => { if (e.bookId === bookId) { drawAll(); } };
  const onDone = (e) => { if (e.bookId === bookId) { toast('Libro terminado: "' + (book.meta.titulo || 'sin título') + '"', 'ok'); drawAll(); } };
  const onPaused = (e) => { if (e.bookId === bookId) { toast('Forja pausada. Puedes reanudarla cuando quieras.', 'info'); drawAll(); } };
  const onFailed = (e) => { if (e.bookId === bookId) { toast('La forja falló: ' + (e.error || 'error'), 'error'); drawAll(); } };
  unsubs = [
    app.bus.on('log', onLog),
    app.bus.on('phase', onPhase),
    app.bus.on('chapter', onChapter),
    app.bus.on('book', onBook),
    app.bus.on('done', onDone),
    app.bus.on('paused', onPaused),
    app.bus.on('failed', onFailed),
  ];

  /* ---------- layout ---------- */
  const head = el('div', { class: 'forge__head' });
  const banner = el('div', { class: 'forge__banner' });
  const phaseTrack = el('div', { class: 'phase-track' });
  const statsRow = el('div', { class: 'forge__stats', id: 'forge-stats' });
  const chaptersGrid = el('div', { class: 'chapters-grid', id: 'forge-chapters' });
  const logBox = el('div', { class: 'logbox', id: 'forge-log' });

  function drawAll() { drawHead(); drawBanner(); drawPhases(); drawStats(); drawChapters(); drawLog(); }

  function drawBanner() {
    banner.innerHTML = '';
    if (book.status !== 'fallido') return;
    const lastErr = [...book.progress.log].reverse().find((l) => l.tipo === 'error' || l.tipo === 'warn');
    banner.append(
      el('div', { class: 'forge__error' },
        el('span', { class: 'forge__error-ico' }, icon('alert', 18)),
        el('div', {},
          el('strong', {}, 'La forja se detuvo con un error'),
          el('p', {}, lastErr ? lastErr.msg : 'Revisa el diario de la sala.'),
          el('p', { class: 'hint' }, 'Nada se pierde: pulsa "Reanudar forja" y continuará exactamente por donde se quedó (fases y capítulos ya hechos no se repiten).')),
      ),
    );
  }
  function drawHead() {
    head.innerHTML = '';
    const active = !!getRun(bookId);
    const cat = getCategory(book.brief.categoryId);
    head.append(
      el('div', { class: 'forge__title-wrap' },
        el('button', { class: 'btn btn--ghost btn--small', onClick: () => app.router.go('/') }, icon('chevronLeft', 14), 'Biblioteca'),
        el('h2', { class: 'forge__title' }, book.meta.titulo || 'La sala está concibiendo el título…'),
        el('p', { class: 'forge__sub' }, book.meta.logline || 'Forja en curso · ' + (cat?.nombre || '')),
      ),
      el('div', { class: 'forge__controls' },
        el('span', { class: 'badge badge--' + book.status }, STATUS_LABEL[book.status] || book.status),
        active || book.status === 'generando'
          ? el('button', { class: 'btn btn--danger-ghost', onClick: () => cancelRun(bookId) }, icon('pause', 15), 'Pausar')
          : null,
        (book.status === 'pausado' || book.status === 'fallido' || (book.status === 'generando' && !getRun(bookId)))
          ? el('button', { class: 'btn btn--primary', onClick: async () => { const fresh = await app.db.getBook(bookId); startRun(fresh); render(document.getElementById('app'), { id: bookId }); } },
              icon('play', 15), 'Reanudar forja')
          : null,
        book.status === 'listo' ? el('div', { class: 'forge__controls--done' },
          el('button', { class: 'btn btn--primary', onClick: () => app.router.go('/libro/' + bookId) }, icon('book', 15), 'Leer el libro'),
          el('button', { class: 'btn btn--ghost', onClick: () => app.router.go('/taller/' + bookId), title: 'Ilustración capítulo a capítulo (Parte 2)' }, icon('palette', 15), 'Ir al Taller')) : null,
      ));
  }
  function drawPhases() {
    phaseTrack.innerHTML = '';
    PHASES.forEach((p, i) => {
      const cls = i < book.progress.phaseIdx ? 'is-done' : i === book.progress.phaseIdx && book.status === 'generando' ? 'is-now' : '';
      phaseTrack.append(el('div', { class: 'phase ' + cls }, el('span', { class: 'phase__ico' }, icon(p.icono, 16)), el('span', {}, p.nombre)));
    });
  }
  function drawStats() {
    computeStats(book);
    statsRow.innerHTML = '';
    const running = !!getRun(bookId); // spinner solo si la forja corre en vivo
    statsRow.append(
      el('div', { class: 'stat' }, el('strong', {}, String(book.stats.chapters)), 'capítulos'),
      el('div', { class: 'stat' }, el('strong', {}, String(book.stats.paragraphs)), 'párrafos'),
      el('div', { class: 'stat' }, el('strong', {}, (book.stats.words || 0).toLocaleString('es')), 'palabras'),
      running ? el('div', { class: 'stat stat--live' }, spinner(14), 'forjando') : null,
    );
  }
  function drawChapters() {
    chaptersGrid.innerHTML = '';
    if (!book.chapters.length) {
      chaptersGrid.append(el('p', { class: 'hint' }, 'El esquema de capítulos aparecerá cuando la sala lo cierre.'));
      return;
    }
    for (const ch of book.chapters) {
      chaptersGrid.append(el('div', { class: 'ch-card ' + (ch.escrito ? 'is-writing' : '') },
        el('div', { class: 'ch-card__num' }, String(ch.numero).padStart(2, '0')),
        el('div', { class: 'ch-card__body' },
          el('strong', {}, ch.titulo || '…'),
          el('span', { class: 'ch-card__meta' },
            (ch.escrito ? ch.paragraphs.length + ' párrafos' : 'esperando') + (ch.impacto?.aplicado ? ' · impacto' : '')),
        )));
    }
  }
  function drawLog() {
    const entries = book.progress.log.slice(-90);
    logBox.innerHTML = '';
    for (const l of entries) {
      logBox.append(el('div', { class: 'logline logline--' + (l.tipo || 'info') },
        el('span', { class: 'logline__time' }, (l.at || '').slice(11, 19)),
        String(l.msg)));
    }
    logBox.scrollTop = logBox.scrollHeight;
  }

  shell.append(head, banner, phaseTrack, statsRow, chaptersGrid,
    el('h3', { class: 'logbox__title' }, 'Diario de la sala de escritores'), logBox);
  drawAll();

  // refresco de seguridad cuando la vista se abandona
  window.addEventListener('hashchange', cleanupSubs, { once: true });
}

function cleanupSubs() {
  for (const off of unsubs) { try { off(); } catch {} }
  unsubs = [];
}
