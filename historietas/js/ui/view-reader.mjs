/* view-reader.mjs — el LECTOR v3.0: el libro como prosa.
   Solo texto: cada párrafo es un bloque de lectura con su botón de voz.
   Narración con karaoke en tiempo real + memoria de lectura (sin cambios),
   portada editable (autor, año, dedicatoria), descarga PDF arriba a la
   derecha y puerta al Taller de Ilustración (Parte 2). */

import { el, icon, toast, confirmar } from './components.mjs';
import { app, startRun } from '../core/app.mjs';
import { computeStats, STATUS_LABEL, normalizePortada } from '../domain/book.mjs';
import { getCategory, creditsFor } from '../specialists/registry.mjs';
import { Pipeline } from '../engine/pipeline.mjs';
import { buildPDF, pdfBlob } from '../export/pdf.mjs';
import {
  Narrador, ttsSupported, listNarratorVoices, pickBestVoice, findVoiceByName, waitForVoices,
  getTtsPrefs, setTtsPrefs, loadReadingProgress, saveReadingProgress, splitNarration,
} from '../engine/tts.mjs';
import { blobToDataURL, downloadBlob, escapeHtml } from '../core/utils.mjs';

/* Narrador vivo a nivel de módulo: cambiar de ruta o re-render detiene la voz. */
let narradorVivo = null;
function detenerVoz() {
  try { narradorVivo?.stop(); } catch { /* nada */ }
  narradorVivo = null;
}

export async function render(root, params) {
  detenerVoz();
  const book = await app.db.getBook(params.id);
  root.innerHTML = '';
  if (!book) {
    root.append(el('div', { class: 'empty' }, el('h3', {}, 'Historia no encontrada'),
      el('button', { class: 'btn', onClick: () => app.router.go('/') }, 'Volver a la biblioteca')));
    return;
  }
  computeStats(book);
  const cat = getCategory(book.brief.categoryId);
  const urlCache = new Map();

  /* ---------- narración: plan, preferencias y memoria ---------- */
  const vozOn = ttsSupported();
  const langLibro = book.brief?.idioma || 'es';
  const prefsVoz = getTtsPrefs();
  const plan = [];
  book.chapters.forEach((ch, ci) => (ch.paragraphs || []).forEach((p, pi) => plan.push({ ch, p, ci, pi })));
  const posGuardada = vozOn ? loadReadingProgress(book.id) : null;
  const tts = {
    actual: null, paused: false, voice: null, rate: prefsVoz.rate || 1,
    lastChar: 0, spans: [], marcado: 0, palabraEl: null, lastSave: 0,
    chunks: [], chunkIdx: 0, tramo: null, tickTimer: null, pauseAt: 0,
    ultimoScroll: null,
  };

  /* ---------- cabecera tipográfica (sin imágenes) ---------- */
  const portada = book.meta.portada || normalizePortada({});
  const themes = (book.meta.temas || []).map((t) => el('span', { class: 'theme-chip' }, t));
  const head = el('section', { class: 'book-head' },
    el('div', { class: 'book-cover book-cover--tipografica' },
      el('div', { class: 'book-cover__marco' },
        el('span', { class: 'book-cover__kicker' }, (cat?.nombre || 'Novela').toUpperCase()),
        el('h2', { class: 'book-cover__titulo' }, book.meta.titulo || '(sin título)'),
        book.meta.subtitulo ? el('p', { class: 'book-cover__sub' }, book.meta.subtitulo) : null,
        portada.autor ? el('p', { class: 'book-cover__autor' }, 'de ' + portada.autor) : null,
        portada.anio ? el('p', { class: 'book-cover__anio' }, portada.anio) : null)),
    el('div', { class: 'book-head__info' },
      el('button', { class: 'btn btn--ghost btn--small', onClick: () => app.router.go('/') }, icon('chevronLeft', 14), 'Biblioteca'),
      el('span', { class: 'badge badge--' + book.status }, STATUS_LABEL[book.status] || book.status),
      el('div', { class: 'book-head__cat' }, icon(cat?.icono || 'book', 15), cat?.nombre || ''),
      el('h1', { class: 'book-head__title' }, book.meta.titulo || '(sin título)'),
      el('h2', { class: 'book-head__subtitle' }, book.meta.subtitulo || ''),
      el('p', { class: 'book-head__logline' }, book.meta.logline || ''),
      themes.length ? el('div', { class: 'book-head__themes' }, themes) : null,
      el('div', { class: 'book-head__stats' },
        el('span', {}, icon('map', 13), book.stats.chapters + ' capítulos'),
        el('span', {}, icon('pen', 13), book.stats.paragraphs + ' párrafos'),
        el('span', {}, icon('feather', 13), (book.stats.words || 0).toLocaleString('es') + ' palabras')),
      toolbar()));

  function toolbar() {
    return el('div', { class: 'book-head__toolbar' },
      // PDF: arriba a la derecha, lo primero
      el('button', { class: 'btn btn--primary', id: 'btn-pdf', title: 'Descarga el libro completo en PDF', onClick: exportarPDF },
        icon('download', 15), 'Descargar PDF'),
      el('button', { class: 'btn btn--ghost', id: 'btn-portada', title: 'Autor, año y dedicatoria del libro', onClick: editarPortada },
        icon('pencil', 15), 'Portada'),
      el('button', { class: 'btn btn--ghost', id: 'btn-taller', title: 'Ilustración capítulo a capítulo (Parte 2)', onClick: () => app.router.go('/taller/' + book.id) },
        icon('palette', 15), 'Ir al Taller'),
      el('button', { class: 'btn btn--ghost', onClick: exportJSON }, icon('download', 15), 'JSON'),
      el('button', { class: 'btn btn--ghost', onClick: exportHTML }, icon('external', 15), 'HTML'),
      el('button', { class: 'btn btn--ghost', onClick: () => window.print() }, icon('book', 15), 'Imprimir'));
  }

  /* ---------- portada editable: autor, año, dedicatoria ---------- */
  function editarPortada() {
    const p = book.meta.portada || normalizePortada({});
    const inpAutor = el('input', { class: 'input', value: p.autor || '', placeholder: 'Tu nombre o seudónimo' });
    const inpAnio = el('input', { class: 'input', value: p.anio || '', placeholder: 'Año de la obra' });
    const taDedicatoria = el('textarea', { class: 'input', rows: 3, placeholder: 'Para…, con cariño / una línea que adorne la portada interior' });
    taDedicatoria.value = p.dedicatoria || '';
    const guardar = el('button', {
      class: 'btn btn--primary', onClick: async () => {
        book.meta.portada = normalizePortada({
          autor: inpAutor.value.trim(), anio: inpAnio.value.trim(), dedicatoria: taDedicatoria.value.trim(),
        });
        await app.db.putBook(book);
        wrap.remove();
        toast('Portada guardada — aparece en el PDF y en la cabecera', 'ok');
        render(document.getElementById('app'), { id: book.id });
      },
    }, icon('check', 14), 'Guardar portada');
    const wrap = el('div', { class: 'modal-wrap' },
      el('div', { class: 'modal' },
        el('h3', {}, 'Portada del libro'),
        el('p', { class: 'modal__msg hint' }, 'Adorna tu obra: estos datos viven en la portada del PDF.'),
        el('div', { class: 'wizard__grid2' },
          el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Autor'), inpAutor),
          el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Año'), inpAnio)),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Dedicatoria'), taDedicatoria),
        el('div', { class: 'modal__actions' },
          el('button', { class: 'btn btn--ghost', onClick: () => wrap.remove() }, 'Cancelar'), guardar)));
    wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.remove(); });
    document.getElementById('modal-root').append(wrap);
  }

  /* ---------- narración: barra de voz, player, karaoke ---------- */
  const ttsBar = construirBarraVoz();
  const player = construirPlayer();

  function construirBarraVoz() {
    if (!vozOn) {
      return el('div', { class: 'tts-bar tts-bar--off' },
        icon('alert', 15),
        el('span', { class: 'tts-bar__estado' }, 'Tu navegador no puede narrar en voz (prueba Edge o Chrome para las voces naturales).'));
    }
    const selVoz = el('select', { class: 'input input--mini tts-bar__voz', id: 'tts-voz', title: 'Voz narradora' },
      el('option', { value: '' }, 'Voz automática (la mejor disponible)'));
    const selRate = el('select', { class: 'input input--mini tts-bar__rate', id: 'tts-rate', title: 'Velocidad de lectura' },
      [[0.8, '0.8× lenta'], [0.9, '0.9×'], [1, '1× normal'], [1.1, '1.1×'], [1.25, '1.25×'], [1.5, '1.5× rápida']]
        .map(([v, t]) => el('option', { value: String(v) }, t)));
    selRate.value = String(tts.rate);
    const btnEscuchar = el('button', { class: 'tts-cta', id: 'btn-escuchar', onClick: alternarEscucha },
      icon('play', 17), el('span', {}, 'Escuchar el libro'));
    const estado = el('span', { class: 'tts-bar__estado', id: 'tts-estado' },
      posGuardada
        ? 'Quedaste por el cap ' + String((posGuardada.chapterIdx || 0) + 1).padStart(2, '0') + ' · ' + Math.round(posGuardada.pct || 0) + '% del libro'
        : 'Pulsa Escuchar: el libro se narra solo, párrafo a párrafo, resaltando lo leído.');
    const chip = posGuardada
      ? el('button', { class: 'tts-chip', id: 'tts-chip', title: 'Volver exactamente por donde ibas y seguir escuchando', onClick: narrarDesdeGuardado },
          icon('play', 13), 'Continuar · ' + Math.round(posGuardada.pct || 0) + '% · cap ' + String((posGuardada.chapterIdx || 0) + 1).padStart(2, '0'))
      : null;
    const bar = el('div', { class: 'tts-bar' },
      btnEscuchar, estado, chip,
      el('span', { class: 'tts-bar__sep' }),
      el('label', { class: 'tts-bar__lbl' }, 'Voz ', selVoz),
      el('label', { class: 'tts-bar__lbl' }, 'Velocidad ', selRate));
    waitForVoices().then(() => {
      const lista = listNarratorVoices(langLibro);
      for (const v of lista) {
        selVoz.append(el('option', { value: v.name }, v.name.replace(/^Microsoft |^Google /, '').slice(0, 42)));
      }
      tts.voice = findVoiceByName(prefsVoz.voiceName, langLibro) || pickBestVoice(langLibro);
      if (tts.voice) selVoz.value = tts.voice.name;
      else if (prefsVoz.voiceName) selVoz.value = prefsVoz.voiceName;
      if (!tts.voice && !lista.length) {
        estado.textContent = 'Sin voces en "' + langLibro + '" instaladas: se usará la voz por defecto del sistema.';
      }
    });
    selVoz.addEventListener('change', () => {
      tts.voice = selVoz.value ? findVoiceByName(selVoz.value, langLibro) : pickBestVoice(langLibro);
      setTtsPrefs({ voiceName: selVoz.value, rate: tts.rate });
      siNarrandoReiniciar();
    });
    selRate.addEventListener('change', () => {
      tts.rate = Number(selRate.value) || 1;
      setTtsPrefs({ voiceName: selVoz.value, rate: tts.rate });
      siNarrandoReiniciar();
    });
    return bar;
  }

  /** Reproductor flotante: SIEMPRE visible dentro del libro. */
  function construirPlayer() {
    if (!vozOn) return null;
    const eq = el('div', { class: 'eq' }, el('span'), el('span'), el('span'), el('span'));
    const btnPlay = el('button', {
      class: 'player__btn player__btn--main', id: 'player-play',
      title: 'Escuchar / pausar la narración', 'aria-label': 'Escuchar o pausar',
      onClick: () => (tts.actual ? narrarOAlternar(tts.actual) : alternarEscucha()),
    }, icon('play', 20));
    const btnStop = el('button', {
      class: 'player__btn player__btn--ghost', id: 'player-stop',
      title: 'Detener (guarda por dónde vas)', 'aria-label': 'Detener narración',
      onClick: detenerNarracionLocal,
    }, icon('stop', 15));
    const info = el('div', { class: 'player__info' },
      el('span', { class: 'player__cap', id: 'player-cap' }, 'Voz del libro lista'),
      el('div', { class: 'player__bar' }, el('i', { id: 'player-bar', style: 'width:0%' })),
      el('span', { class: 'player__sub', id: 'player-sub' }, 'Pulsa ▶ o el botón de cualquier párrafo'));
    return el('div', { class: 'player', id: 'tts-player' }, eq, btnPlay, info, btnStop);
  }

  function siNarrandoReiniciar() {
    if (!tts.actual) return;
    const item = tts.actual;
    const desde = tts.lastChar;
    narrar(item, desde);
  }

  function puntoGuardado() {
    if (!posGuardada) return null;
    let item = plan.find((x) => x.p.id === posGuardada.paraId);
    if (!item) item = plan.find((x) => x.ci === posGuardada.chapterIdx && x.pi === posGuardada.paraIdx);
    if (!item) {
      const aprox = Math.min(plan.length - 1, Math.max(0, Math.floor(((posGuardada.pct || 0) / 100) * plan.length)));
      item = plan[aprox];
    }
    if (!item) return null;
    const desde = Math.max(0, Math.min(item.p.texto?.length || 0, Number(posGuardada.charIndex) || 0));
    return { item, desde };
  }

  function narrarDesdeGuardado() {
    const punto = puntoGuardado();
    if (!punto) return narrar(plan[0], 0);
    if ((posGuardada.pct || 0) >= 99.5) {
      toast('Ya escuchaste este libro entero: empiezo desde el principio', 'info');
      return narrar(plan[0], 0);
    }
    narrar(punto.item, punto.desde);
  }

  function alternarEscucha() {
    if (tts.actual) return narrarOAlternar(tts.actual);
    if (!plan.length) return toast('Este libro aún no tiene párrafos escritos', 'error');
    narrarDesdeGuardado();
  }

  function narrarOAlternar(item) {
    if (!item) return;
    if (tts.actual === item) {
      if (narradorVivo?.hablando) return pausarVoz();
      if (tts.paused) return reanudarVoz();
    }
    narrar(item, 0);
  }

  function pausarVoz() {
    try { narradorVivo?.pause(); } catch { /* nada */ }
    tts.paused = true;
    tts.pauseAt = performance.now();
    refrescarUIVoz();
  }

  async function reanudarVoz() {
    if (!tts.actual || !narradorVivo) return;
    const viva = await narradorVivo.resume();
    if (!viva) {
      const item = tts.actual;
      const desde = tts.lastChar;
      return narrar(item, desde);
    }
    tts.paused = false;
    if (tts.tramo) tts.tramo.t0 += performance.now() - tts.pauseAt;
    refrescarUIVoz();
  }

  function detenerNarracionLocal() {
    if (tts.actual) guardarPosicion();
    pararTicker();
    detenerVoz();
    if (tts.palabraEl) tts.palabraEl.classList.remove('is-reading');
    tts.actual = null;
    tts.paused = false;
    refrescarUIVoz();
  }

  async function narrar(item, desde = 0) {
    detenerVoz();
    pararTicker();
    if (!item) return;
    const n = new Narrador({ lang: langLibro, voice: tts.voice, rate: tts.rate });
    narradorVivo = n;
    tts.actual = item;
    tts.paused = false;
    tts.lastChar = desde;
    tts.marcado = 0;
    tts.palabraEl = null;
    tts.spans = [];

    const fig = cardDe(item);
    if (fig) {
      fig.classList.add('is-narrando');
      montarKaraoke(fig, item.p, desde);
      if (tts.ultimoScroll !== item) {
        tts.ultimoScroll = item;
        try { fig.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* nada */ }
      }
    }

    const texto = item.p.texto || '';
    tts.chunks = splitNarration(texto.slice(desde)).map((c) => ({ abs: desde + c.offset }));
    tts.chunkIdx = 0;
    iniciarTramo(desde, texto.length, 0);

    n.onchunkstart = (c) => {
      const idx = Math.min(tts.chunkIdx, tts.chunks.length - 1);
      tts.chunkIdx = idx + 1;
      const hasta = tts.chunks[tts.chunkIdx]?.abs ?? texto.length;
      iniciarTramo(Math.max(c.charIndex, tts.chunks[idx]?.abs ?? c.charIndex), hasta, 0.08);
    };
    n.onboundary = (b) => {
      tts.lastChar = b.charIndex;
      pintarKaraoke(b.charIndex);
      guardarPosicion(true);
    };
    n.onend = () => {
      pararTicker();
      pintarKaraoke(Infinity);
      if (tts.palabraEl) { tts.palabraEl.classList.remove('is-reading'); tts.palabraEl = null; }
      const idx = plan.indexOf(tts.actual);
      const siguiente = idx >= 0 ? plan[idx + 1] : undefined;
      if (siguiente) {
        guardarPosicionDe(siguiente, 0);
        narrar(siguiente, 0);
      } else {
        guardarPosicionFinal();
        detenerVoz();
        tts.actual = null;
        tts.ultimoScroll = null;
        refrescarUIVoz();
        toast('Fin del libro — ' + (book.meta.titulo || 'historia') + ' completa en voz', 'ok');
      }
    };
    n.onerror = () => {
      pararTicker();
      detenerVoz();
      tts.actual = null;
      refrescarUIVoz();
      toast('La narración se interrumpió (la voz falló): vuelve a pulsar Escuchar', 'error');
    };

    refrescarUIVoz();
    const ok = await n.speak(texto, { fromChar: desde });
    if (!ok) {
      tts.actual = null;
      refrescarUIVoz();
    }
  }

  function cardDe(item) {
    return root.querySelector('[data-para="' + (item.p.id || '') + '"]');
  }

  function montarKaraoke(fig, p, desde) {
    const cap = fig.querySelector('.lectura__texto');
    if (!cap) return;
    const text = p.texto || '';
    if (!cap.dataset.karaoke) {
      cap.dataset.karaoke = '1';
      const html = [];
      let last = 0;
      for (const m of String(text).matchAll(/\S+/g)) {
        html.push(escapeHtml(text.slice(last, m.index)), '<span class="kw" data-s="' + m.index + '">' + escapeHtml(m[0]) + '</span>');
        last = m.index + m[0].length;
      }
      html.push(escapeHtml(text.slice(last)));
      cap.innerHTML = html.join('');
    }
    tts.spans = [...cap.querySelectorAll('.kw')];
    for (const s of tts.spans) s.classList.remove('is-read', 'is-reading');
    tts.marcado = 0;
    pintarKaraoke(desde);
  }

  function pintarKaraoke(absChar) {
    const spans = tts.spans;
    if (!spans?.length) return;
    let i = tts.marcado;
    while (i < spans.length && Number(spans[i].dataset.s) <= absChar) {
      spans[i].classList.add('is-read');
      i++;
    }
    tts.marcado = i;
    if (tts.palabraEl) tts.palabraEl.classList.remove('is-reading');
    const actual = spans[Math.max(0, i - 1)];
    if (actual && i > 0 && Number(actual.dataset.s) <= absChar) {
      actual.classList.add('is-reading');
      tts.palabraEl = actual;
    } else {
      tts.palabraEl = null;
    }
  }

  function iniciarTramo(desdeChar, hastaChar, margen) {
    if (hastaChar <= desdeChar) return;
    const durEst = Math.max(600, ((hastaChar - desdeChar) * 55) / Math.max(0.5, tts.rate));
    tts.tramo = { desde: desdeChar, hasta: hastaChar, t0: performance.now() - (margen || 0) * durEst, durEst };
    if (!tts.tickTimer) {
      tts.tickTimer = setInterval(() => {
        if (!tts.tramo || tts.paused || !narradorVivo) return;
        const { desde, hasta, t0, durEst } = tts.tramo;
        const avance = Math.min(0.985, (performance.now() - t0) / durEst);
        pintarKaraoke(desde + (hasta - desde) * avance);
      }, 120);
    }
  }

  function pararTicker() {
    clearInterval(tts.tickTimer);
    tts.tickTimer = null;
    tts.tramo = null;
  }

  function guardarPosicion(throttled = false) {
    if (!tts.actual) return;
    const ahora = Date.now();
    if (throttled && ahora - tts.lastSave < 1500) return;
    tts.lastSave = ahora;
    const item = tts.actual;
    const total = Math.max(1, (item.p.texto || '').length);
    guardarPosicionDe(item, Math.min(tts.lastChar, total));
  }

  function guardarPosicionDe(item, charIndex) {
    if (!item || !plan.length) return;
    const idx = plan.indexOf(item);
    const frac = Math.min(1, charIndex / Math.max(1, (item.p.texto || '').length));
    const pct = ((idx + frac) / plan.length) * 100;
    saveReadingProgress(book.id, { paraId: item.p.id, chapterIdx: item.ci, paraIdx: item.pi, charIndex, pct });
    refrescarEstadoVoz(pct, item);
  }

  function guardarPosicionFinal() {
    if (!plan.length) return;
    const ult = plan[plan.length - 1];
    saveReadingProgress(book.id, { paraId: ult.p.id, chapterIdx: ult.ci, paraIdx: ult.pi, charIndex: 0, pct: 100 });
    refrescarEstadoVoz(100, null);
  }

  function refrescarEstadoVoz(pct, item) {
    const est = document.getElementById('tts-estado');
    if (est) {
      est.textContent = item
        ? 'Escuchando cap ' + String(item.ci + 1).padStart(2, '0') + ' · ' + Math.round(pct) + '% del libro'
        : 'Libro completo escuchado · 100%';
    }
    const chip = document.getElementById('tts-chip');
    if (chip) {
      chip.textContent = '';
      chip.append(icon('play', 13), 'Continuar · ' + Math.round(pct) + '% · cap ' + String((item?.ci ?? 0) + 1).padStart(2, '0'));
    }
    const cap = document.getElementById('player-cap');
    const sub = document.getElementById('player-sub');
    const bar = document.getElementById('player-bar');
    if (cap) cap.textContent = item ? 'Cap ' + String(item.ci + 1).padStart(2, '0') + ' — ' + (item.ch.titulo || '') : 'Libro completo';
    if (sub) sub.textContent = Math.round(pct) + '% del libro' + (tts.paused ? ' · en pausa' : '');
    if (bar) bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
  }

  function refrescarUIVoz() {
    const btn = document.getElementById('btn-escuchar');
    if (btn) {
      btn.innerHTML = '';
      if (tts.actual && narradorVivo?.hablando) btn.append(icon('pause', 15), el('span', {}, 'Pausar la escucha'));
      else if (tts.actual && tts.paused) btn.append(icon('play', 15), el('span', {}, 'Continuar'));
      else btn.append(icon('play', 15), el('span', {}, 'Escuchar el libro'));
    }
    const pl = document.getElementById('tts-player');
    if (pl) {
      pl.classList.toggle('is-playing', !!tts.actual && !tts.paused);
      pl.classList.toggle('is-paused', !!tts.paused);
      const main = document.getElementById('player-play');
      if (main) {
        main.innerHTML = '';
        main.append(icon(tts.actual && !tts.paused ? 'pause' : 'play', 20));
      }
    }
    for (const b of root.querySelectorAll('[data-tts]')) {
      const esActivo = tts.actual && tts.actual.p.id === b.dataset.tts;
      const sonando = esActivo && !tts.paused && !!narradorVivo?.hablando;
      b.innerHTML = '';
      b.append(icon(sonando ? 'pause' : 'play', 14));
      b.classList.toggle('is-on', !!esActivo);
      b.title = sonando ? 'Pausar este párrafo' : esActivo ? 'Continuar' : 'Escuchar este párrafo';
    }
    for (const f of root.querySelectorAll('.lectura__p.is-narrando')) {
      if (!tts.actual || f.dataset.para !== tts.actual.p.id) f.classList.remove('is-narrando');
    }
  }

  /* ---------- TOC con progreso de escucha ---------- */
  const toc = el('aside', { class: 'toc', id: 'toc' },
    el('h3', { class: 'toc__title' }, icon('list', 15), 'Contenido'),
    el('ol', { class: 'toc__list' }, book.chapters.map((c, i) =>
      el('li', {},
        el('a', {
          href: '#cap-' + c.id, class: 'toc__link' + (c.impacto?.aplicado ? ' toc__link--key' : ''),
          onClick: (e) => {
            e.preventDefault();
            document.getElementById('cap-' + c.id)?.scrollIntoView({ behavior: 'smooth' });
          },
        }, String(c.numero).padStart(2, '0') + ' · ' + (c.titulo || 'Capítulo')),
        el('div', { class: 'toc__pct', title: 'Progreso de escucha del capítulo' },
          el('i', { style: 'width:' + pctCapitulo(i) + '%' }))))));

  function pctCapitulo(ci) {
    if (!posGuardada) return 0;
    const cGuardado = posGuardada.chapterIdx || 0;
    if (ci < cGuardado) return 100;
    if (ci > cGuardado) return 0;
    const ch = book.chapters[ci];
    const n = ch?.paragraphs?.length || 1;
    return Math.min(100, (((posGuardada.paraIdx || 0) + 1) / n) * 100);
  }

  /* ---------- banner de previsualización ---------- */
  if (book.brief.preview && book.status === 'listo' && book.chapters.length > 1) {
    root.append(el('div', { class: 'preview-banner' },
      el('span', { class: 'preview-banner__ico' }, icon('eye', 20)),
      el('div', { class: 'preview-banner__body' },
        el('strong', {}, 'Previsualización: solo el capítulo 1 de ' + book.chapters.length + ' está forjado'),
        el('p', { class: 'hint' }, 'Revisa tono y prosa. Si te convence, continúa con el libro completo; si no, Reforja el capítulo o vuelve al asistente.')),
      el('button', { class: 'btn btn--primary', onClick: async () => {
        book.brief.preview = false;
        await app.db.putBook(book);
        startRun(book);
        app.router.go('/forja/' + book.id);
      } }, icon('play', 15), 'Continuar forja completa')));
  }

  /* ---------- capítulos: prosa pura ---------- */
  const chaptersBox = el('div', { class: 'reader-body' });
  const chaptersWrap = el('div', { class: 'reader-chapters', id: 'reader-chapters' });
  chaptersBox.append(toc, chaptersWrap);

  function drawChapters(container) {
    for (const [ci, ch] of book.chapters.entries()) container.append(chapterEl(ch, ci));
  }

  function chapterEl(ch, ci) {
    const paras = ch.paragraphs || [];
    const sec = el('section', { class: 'chapter', id: 'cap-' + ch.id },
      el('div', { class: 'chapter__head' },
        el('span', { class: 'chapter__num' }, String(ch.numero).padStart(2, '0')),
        el('div', {},
          el('h2', { class: 'chapter__title' }, ch.titulo || 'Capítulo ' + ch.numero),
          el('p', { class: 'chapter__syn' }, ch.sinopsis || '')),
        el('button', {
          class: 'btn btn--ghost btn--small ch-reforge', title: 'Reescribir este capítulo con su sala de especialistas',
          onClick: async (e) => {
            const btn = e.currentTarget;
            if (!(await confirmar('El capítulo se reescribirá de cero. La versión actual se pierde.', { okTxt: 'Reforjar', danger: true }))) return;
            btn.disabled = true; btn.innerHTML = ''; btn.append(icon('refresh', 13), ' Forjando…');
            try {
              const pipeline = new Pipeline({ client: app.client, storage: app.db, bus: app.bus });
              await pipeline.reforgeChapter(book, ci);
              toast('Capítulo ' + ch.numero + ' reforjado', 'ok');
              render(document.getElementById('app'), { id: book.id });
            } catch (err) {
              toast('Reforja fallida: ' + err.message, 'error');
              btn.disabled = false; btn.innerHTML = ''; btn.append(icon('refresh', 13), ' Reforjar');
            }
          },
        }, icon('refresh', 13), ' Reforjar')));

    const list = el('div', { class: 'lectura' });
    for (const p of paras) list.append(parrafoEl(ch, p, ci));
    if (ch.cliffhanger) list.append(el('p', { class: 'cliffhanger' }, icon('bolt', 13), ch.cliffhanger));
    sec.append(list);
    return sec;
  }

  function parrafoEl(ch, p, ci) {
    const fig = el('figure', { class: 'lectura__p', dataset: { para: p.id } });
    fig.append(el('p', { class: 'lectura__texto' }, p.texto || ''));
    const actions = el('div', { class: 'lectura__acciones' },
      vozOn && (p.texto || '').trim() ? el('button', {
        class: 'tts-play', 'data-tts': p.id,
        'aria-label': 'Escuchar este párrafo', title: 'Escuchar este párrafo — sigue sola con el resto del libro',
        onClick: () => narrarOAlternar(plan.find((x) => x.p === p)),
      }, icon('play', 14)) : null,
      el('button', {
        class: 'panel-act', title: 'Editar el texto del párrafo', onClick: () => editTexto(fig, p),
      }, icon('pencil', 13), 'Editar'));
    fig.append(actions);
    return fig;
  }

  function editTexto(fig, p) {
    const txtEl = fig.querySelector('.lectura__texto');
    if (!txtEl) return;
    if (tts.actual?.p === p) detenerNarracionLocal();
    const ta = el('textarea', { class: 'input' });
    ta.value = p.texto;
    const guardar = async () => {
      p.texto = ta.value.trim();
      computeStats(book);
      await app.db.putBook(book);
      render(root, { id: book.id });
      toast('Párrafo actualizado', 'ok');
    };
    const save = el('div', { class: 'panel-card__edit' },
      ta,
      el('div', { class: 'wizard__row' },
        el('button', { class: 'btn btn--small btn--primary', onClick: guardar }, icon('check', 13), 'Guardar'),
        el('button', { class: 'btn btn--small btn--ghost', onClick: () => render(root, { id: book.id }) }, 'Cancelar')));
    fig.replaceWith(save);
  }

  drawChapters(chaptersWrap);

  /* ---------- créditos ---------- */
  const credits = el('section', { class: 'credits' },
    el('h3', { class: 'section-title' }, icon('feather', 20), 'Firmado por la sala'),
    el('div', { class: 'credits__grid' }, creditsFor(cat || {}).map((s) =>
      el('div', { class: 'credit' },
        el('strong', {}, s.nombre),
        el('span', {}, s.rol)))));

  root.append(head, ttsBar, chaptersBox, credits, player || '');

  /* ---------- exportaciones ---------- */
  async function exportJSON() {
    const data = JSON.stringify(book, null, 2);
    downloadBlob(new Blob([data], { type: 'application/json' }), (book.meta.titulo || 'historia').slice(0, 40) + '.json');
  }

  function exportarPDF() {
    if (!book.stats.paragraphs) return toast('El libro aún no tiene párrafos escritos', 'error');
    try {
      const bytes = buildPDF(book);
      const nombre = (book.meta.titulo || 'historia').slice(0, 40) + (portada.autor ? ' — ' + portada.autor.slice(0, 30) : '') + '.pdf';
      downloadBlob(pdfBlob(bytes), nombre);
      toast('PDF descargado — ' + Math.round(bytes.length / 1024) + ' KB', 'ok');
    } catch (e) {
      toast('El PDF falló: ' + e.message, 'error');
    }
  }

  async function exportHTML() {
    toast('Preparando HTML autocontenido…', 'info');
    const css = [
      'body{background:#0d0e12;color:#f2ede4;font-family:Georgia,serif;margin:0;padding:32px;max-width:880px;margin:0 auto}',
      'h1{font-size:42px;margin:12px 0 4px} h2{font-size:26px;margin:0 0 4px} .sub{color:#f0a83c;font-style:italic} .log{opacity:.85;font-family:system-ui}',
      '.toc{background:#16171d;border:1px solid #2a2c35;border-radius:12px;padding:18px 24px;margin:24px 0} .toc a{color:#f0a83c;text-decoration:none} .toc li{margin:6px 0}',
      '.chapter{border-top:2px solid #2a2c35;margin-top:44px;padding-top:18px} .ch-num{color:#f0a83c;font-size:13px;letter-spacing:2px}',
      '.parrafo{margin:20px 0;line-height:1.8;font-size:17px} .cliff{color:#f0a83c;font-style:italic}',
    ].join('\n');
    const portadaHtml = (book.meta.portada || {});
    const toc = book.chapters.map((c) => '<li><a href="#cap-' + c.id + '">' + escapeHtml(c.titulo) + '</a></li>').join('');
    const chaptersHTML = book.chapters.map((ch) => {
      const pars = (ch.paragraphs || []).map((p) => '<p class="parrafo">' + escapeHtml(p.texto || '') + '</p>').join('');
      return '<section class="chapter" id="cap-' + ch.id + '"><div class="ch-num">CAPÍTULO ' + ch.numero + '</div>' +
        '<h2>' + escapeHtml(ch.titulo) + '</h2>' + pars +
        (ch.cliffhanger ? '<p class="cliff">' + escapeHtml(ch.cliffhanger) + '</p>' : '') + '</section>';
    }).join('');
    const html = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>' +
      escapeHtml(book.meta.titulo) + '</title><style>' + css + '</style></head><body>' +
      '<h1>' + escapeHtml(book.meta.titulo) + '</h1><div class="sub">' + escapeHtml(book.meta.subtitulo) + '</div>' +
      (portadaHtml.autor ? '<p class="log">de ' + escapeHtml(portadaHtml.autor) + (portadaHtml.anio ? ' · ' + escapeHtml(portadaHtml.anio) : '') + '</p>' : '') +
      (portadaHtml.dedicatoria ? '<p class="cliff">' + escapeHtml(portadaHtml.dedicatoria) + '</p>' : '') +
      '<p class="log">' + escapeHtml(book.meta.logline) + '</p>' +
      '<nav class="toc"><strong>Contenido</strong><ol>' + toc + '</ol></nav>' +
      chaptersHTML + '</body></html>';
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), (book.meta.titulo || 'historia').slice(0, 40) + '.html');
    toast('HTML exportado', 'ok');
  }
}
