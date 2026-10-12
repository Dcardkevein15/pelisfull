/* view-library.mjs — biblioteca v3.0 (solo texto): portadas tipográficas,
   estado de la prosa y puerta al Taller de Ilustración (Parte 2). */

import { el, icon, toast, confirmar } from './components.mjs';
import { app } from '../core/app.mjs';
import { CATEGORIES, getCategory } from '../specialists/registry.mjs';
import { createBook, STATUS_LABEL, computeStats } from '../domain/book.mjs';
import { buildPremiseIdeasPrompt } from '../prompts/writers.mjs';
import { randomPick, fmtDate } from '../core/utils.mjs';
import { normalizeStudio, progreso as progresoTaller } from '../studio/state.mjs';

export async function render(root) {
  root.innerHTML = '';
  const hasKey = !!app.store.get('nvApiKey');
  const books = (await app.db.listBooks()).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  const hero = el('section', { class: 'hero' },
    el('div', { class: 'hero__brand' }, icon('feather', 34)),
    el('h1', { class: 'hero__title' }, 'Fábrica de Historias'),
    el('p', { class: 'hero__sub' },
      'Doce salas de especialistas literarios forjan tu libro completo: título, mapa de capítulos y prosa magistral. ' +
      'Cuando el texto está terminado, el Taller lo ilustra capítulo a capítulo.'),
    el('div', { class: 'hero__actions' },
      el('button', { class: 'btn btn--primary btn--lg', onClick: () => app.router.go('/nuevo') },
        icon('plus', 18), 'Nueva historia'),
      el('button', { class: 'btn btn--ghost btn--lg', id: 'rayo', onClick: modoRayo },
        icon('bolt', 18), 'Modo rayo'),
      el('button', { class: 'btn btn--ghost', onClick: () => app.router.go('/ajustes') },
        icon('gear', 18), 'Ajustes'),
    ),
    !hasKey
      ? el('div', { class: 'hero__warn' },
          icon('alert', 16),
          el('span', {},
            'Falta tu clave NVIDIA (gratuita): consíguela en ',
            el('a', { href: 'https://build.nvidia.com', target: '_blank', rel: 'noopener' }, 'build.nvidia.com'),
            ' y pégala en Ajustes. Sin ella la forja no puede encender.'),
        )
      : null,
  );

  const grid = el('div', { class: 'books-grid', id: 'books-grid' });
  if (!books.length) {
    grid.append(el('div', { class: 'empty' },
      el('div', { class: 'empty__ico' }, icon('book', 44)),
      el('h3', {}, 'Tu biblioteca está vacía'),
      el('p', {}, 'Elige un género y deja que su sala de escritores trabaje: premisa, biblia, elenco y capítulos listos para leer, narrar y descargar en PDF.'),
      el('button', { class: 'btn btn--primary', onClick: () => app.router.go('/nuevo') }, icon('wand', 18), 'Forjar la primera historia'),
    ));
  } else {
    for (const b of books) grid.append(bookCard(b));
  }

  root.append(hero, el('h2', { class: 'section-title' }, 'Tu biblioteca'), grid);
}

function bookCard(b) {
  computeStats(b);
  const cat = getCategory(b.brief.categoryId);
  const st = b.status;
  const escritos = (b.chapters || []).filter((c) => c.escrito).length;
  const total = b.chapters.length || 0;
  const taller = b.studio ? progresoTaller(normalizeStudio(b, b.studio)) : null;

  const portada = b.meta.portada || {};
  const cover = el('div', { class: 'card__cover card__cover--tipografica' },
    el('span', { class: 'card__cover-kicker' }, (cat?.nombre || 'Novela').toUpperCase()),
    el('span', { class: 'card__cover-titulo' }, b.meta.titulo || '(Forjando concepto…)'),
    portada.autor ? el('span', { class: 'card__cover-autor' }, 'de ' + portada.autor) : null);
  const meta = el('div', { class: 'card__meta' },
    el('div', { class: 'card__cat' }, icon(cat?.icono || 'book', 13), cat?.nombre || b.brief.categoryId),
    el('span', { class: 'card__date' }, fmtDate(b.updatedAt)));
  const title = el('h3', { class: 'card__title' }, b.meta.titulo || '(Forjando concepto…)');
  const sub = el('p', { class: 'card__sub' }, b.meta.logline || b.brief.premisa || '');
  const stats = el('div', { class: 'card__stats' },
    el('span', {}, icon('map', 13), (b.stats.chapters || total) + ' caps'),
    el('span', {}, icon('pen', 13), (b.stats.words || 0).toLocaleString('es') + ' pal.'),
    taller && taller.confirmados
      ? el('span', { class: 'ok' }, icon('palette', 13), taller.confirmados + '/' + taller.total + ' ilustrados')
      : el('span', { class: escritos && escritos >= total && total ? 'ok' : '' }, icon('feather', 13), escritos + '/' + total + ' escritos'));

  const badge = el('span', { class: 'badge badge--' + st }, STATUS_LABEL[st] || st);
  const actions = el('div', { class: 'card__actions' });
  if (st === 'listo' || (b.chapters || []).some((c) => c.paragraphs?.length)) {
    actions.append(el('button', { class: 'btn btn--small btn--primary', onClick: () => app.router.go('/libro/' + b.id) }, icon('book', 14), 'Leer'));
  }
  if (st === 'listo') {
    actions.append(el('button', { class: 'btn btn--small btn--ghost', onClick: () => app.router.go('/taller/' + b.id), title: 'Ilustración capítulo a capítulo (Parte 2)' }, icon('palette', 14), 'Ilustrar'));
  }
  if (st === 'cola' || st === 'generando' || st === 'pausado' || st === 'fallido') {
    actions.append(el('button', { class: 'btn btn--small', onClick: () => app.router.go('/forja/' + b.id) },
      icon(st === 'pausado' || st === 'fallido' ? 'play' : 'eye', 14),
      st === 'pausado' || st === 'fallido' ? 'Reanudar' : 'Ver forja'));
  }
  actions.append(el('button', {
    class: 'btn btn--small btn--ghost btn--danger-ghost', title: 'Eliminar',
    onClick: async () => {
      if (await confirmar('Se borrará "' + (b.meta.titulo || 'esta historia') + '" por completo. No hay vuelta atrás.', { danger: true, okTxt: 'Eliminar' })) {
        await app.db.deleteBook(b.id);
        toast('Historia eliminada', 'ok');
        render(document.getElementById('app'));
      }
    },
  }, icon('trash', 14)));

  return el('div', { class: 'card', dataset: { id: b.id } },
    cover, meta, title, sub, stats,
    el('div', { class: 'card__footer' }, badge, actions));
}

async function modoRayo() {
  const btn = document.getElementById('rayo');
  if (!app.store.get('nvApiKey')) { toast('Configura primero tu clave NVIDIA en Ajustes', 'error'); return app.router.go('/ajustes'); }
  btn.disabled = true;
  const old = btn.innerHTML;
  btn.innerHTML = '';
  btn.append(icon('bolt', 18), 'Buscando premisa…');
  try {
    const cat = randomPick(CATEGORIES);
    const { system, user } = buildPremiseIdeasPrompt(cat, 1);
    const raw = await app.client.chatJSON([{ role: 'system', content: system }, { role: 'user', content: user }], { maxTokens: 800 });
    const premisa = Array.isArray(raw?.premisas) && raw.premisas[0] ? String(raw.premisas[0]) : '';
    const book = createBook({
      categoryId: cat.id, premisa,
      intensidad: cat.defaults.intensidad, tono: cat.defaults.tono, final: cat.defaults.final,
      capitulos: { modo: 'auto' }, parrafosPorCapitulo: app.store.get('parrafosPorCapitulo') || 10,
      notas: 'Modo rayo: sorpréndeme con la ejecución más audaz y coherente.',
    });
    await app.db.putBook(book);
    app.router.go('/forja/' + book.id);
  } catch (e) {
    toast('Modo rayo falló: ' + e.message, 'error');
    btn.disabled = false;
    btn.innerHTML = old;
  }
}
