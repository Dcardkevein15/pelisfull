/* view-studio.mjs — el TALLER DE ILUSTRACIÓN (Parte 2), versión completa.
   Integra la API persistente (Vercel Blob en producción, archivos locales en
   dev) SIN destruir nada de lo que ya existía: raíl de capítulos, mesa de
   sesión, tarjetas de párrafos, huecos de ilustración, botones de generar y
   reintentar, puerta de calidad "Confirmar y avanzar", progreso.
   NUEVO: sesión con token del propietario, fichas de personajes y referencias
   visuales, memoria narrativa analizada y corregible, trabajos reales de
   ilustración capítulo a capítulo con versiones y QA automático. */

import { el, icon, toast, confirmar } from './components.mjs';
import { app } from '../core/app.mjs';
import { computeStats, STATUS_LABEL } from '../domain/book.mjs';
import { normalizeStudio, capituloActual, progreso as progresoTaller, ESTADO_LABEL } from '../studio/state.mjs';
import { studioApi } from '../studio/client.mjs';

const ESTADOS_ILUSTRACION = {
  pendiente: 'Pendiente',
  generando: 'Generando…',
  en_revision: 'En revisión',
  aprobada: 'Aprobada',
  requiere_correccion: 'Corrección',
  error: 'Error',
};

export async function render(root, params) {
  const book = await app.db.getBook(params.id);
  root.innerHTML = '';
  if (!book) {
    root.append(el('div', { class: 'empty' }, el('h3', {}, 'Historia no encontrada'),
      el('button', { class: 'btn', onClick: () => app.router.go('/') }, 'Volver a la biblioteca')));
    return;
  }
  computeStats(book);
  const shell = el('div', { class: 'taller' });
  root.append(shell);

  /* ---------- disponibilidad del servidor del Taller ---------- */
  let ping = null;
  try { ping = await studioApi.ping(); } catch { ping = { status: 0, ok: false, data: {} }; }

  if (!ping.ok) {
    shell.append(panelNoDisponible(ping));
    return;
  }
  const info = ping.data || {};
  if (!info.authConfigurado) {
    shell.append(panelTokenFaltante());
    return;
  }
  if (!info.autenticado) {
    shell.append(panelLogin());
    return;
  }

  /* ---------- sesión iniciada: sincronizar y montar ---------- */
  const pid = book.id;
  const sinc = await studioApi.sincronizarLibro(book);
  if (!sinc.ok) {
    shell.append(el('div', { class: 'empty' },
      el('h3', {}, 'No se pudo sincronizar el libro'),
      el('p', { class: 'hint' }, sinc.data?.error || 'Error de conexión con la API del Taller.')));
    return;
  }
  if (info.proveedor && info.proveedor.disponible === false) {
    toast('Proveedor de imágenes: ' + (info.proveedor.razon || 'no disponible'), 'info', 9000);
  }

  const studio = normalizeStudio(book, book.studio);
  const cfg = (await studioApi.config(pid)).data?.config || {};
  let fichas = [];
  let capituloEnMesa = capituloActual(studio);
  let enCurso = false;

  const recargarFichas = async () => {
    const r = await studioApi.fichas(pid);
    fichas = r.ok ? (r.data.fichas || []) : [];
  };
  await recargarFichas();

  /* ---------- cabecera (conservada del diseño original) ---------- */
  const prog = progresoTaller(studio);
  const headEl = el('div', { class: 'taller__head' },
    el('button', { class: 'btn btn--ghost btn--small', onClick: () => app.router.go('/libro/' + book.id) }, icon('chevronLeft', 14), 'Volver al libro'),
    el('span', { class: 'badge badge--' + book.status }, STATUS_LABEL[book.status] || book.status),
    el('div', { class: 'taller__titulo-wrap' },
      el('h2', { class: 'taller__titulo' }, 'Taller de Ilustración'),
      el('p', { class: 'taller__sub' }, (book.meta.titulo || '(sin título)') + ' — ' + book.stats.chapters + ' capítulos · almacenamiento: ' + (info.driver === 'blob' ? 'Vercel Blob (persistente)' : 'local persistente'))),
    el('div', { class: 'taller__prog' },
      el('span', { class: 'taller__prog-num', id: 'taller-prog' }, prog.confirmados + '/' + prog.total + ' confirmados'),
      el('div', { class: 'taller__prog-bar' }, el('i', { id: 'taller-prog-bar', style: 'width:' + prog.pct + '%' }))),
    el('div', { class: 'taller__tabs' },
      el('button', { class: 'taller__tab is-sel', 'data-tab': 'sesion', onClick: tabClick }, icon('camera', 14), 'Sesión'),
      el('button', { class: 'taller__tab', 'data-tab': 'personajes', onClick: tabClick }, icon('mask', 14), 'Personajes'),
      el('button', { class: 'taller__tab', 'data-tab': 'memoria', onClick: tabClick }, icon('scroll', 14), 'Memoria')));
  shell.append(headEl);

  const cuerpo = el('div', { class: 'taller__cuerpo', id: 'taller-cuerpo' });
  shell.append(cuerpo);

  function tabClick(e) {
    const tab = e.currentTarget.dataset.tab;
    for (const b of root.querySelectorAll('.taller__tab')) b.classList.toggle('is-sel', b.dataset.tab === tab);
    dibujarTab(tab);
  }

  function dibujarTab(tab) {
    cuerpo.innerHTML = '';
    if (tab === 'personajes') return dibujarPersonajes();
    if (tab === 'memoria') return dibujarMemoria();
    return dibujarSesion();
  }

  /* ================= TAB: SESIÓN (diseño original + real) ================= */

  function dibujarSesion() {
    cuerpo.innerHTML = '';
    const rail = el('aside', { class: 'taller__rail' },
      el('h3', { class: 'taller__rail-title' }, icon('list', 15), 'Capítulos'));
    const mesa = el('section', { class: 'taller__mesa' });

    studio.capitulos.forEach((c, i) => {
      const esActual = i === capituloEnMesa;
      const confirmado = c.estado === 'confirmado';
      rail.append(el('button', {
        class: 'taller__cap' + (esActual ? ' is-actual' : '') + (confirmado ? ' is-ok' : ''),
        onClick: () => { capituloEnMesa = i; dibujarSesion(); },
      },
        el('span', { class: 'taller__cap-num' }, String(i + 1).padStart(2, '0')),
        el('span', { class: 'taller__cap-titulo' }, (book.chapters[i]?.titulo || 'Capítulo ' + (i + 1)).slice(0, 42)),
        el('span', { class: 'taller__cap-estado taller__cap-estado--' + c.estado }, confirmado ? '✓' : ESTADO_LABEL[c.estado])));
    });

    const c = book.chapters[capituloEnMesa];
    if (!c) { cuerpo.append(rail, mesa); return; }
    const cs = studio.capitulos[capituloEnMesa];

    mesa.append(el('div', { class: 'taller__sesion-head' },
      el('div', {},
        el('span', { class: 'taller__sesion-kicker' }, 'Sesión de ilustración'),
        el('h3', { class: 'taller__sesion-titulo' }, 'Capítulo ' + c.numero + ' — ' + (c.titulo || '')),
        el('p', { class: 'hint' }, (c.paragraphs || []).length + ' párrafos · una ilustración por párrafo · se confirma la calidad antes de avanzar')),
      el('div', { class: 'taller__sesion-actions' },
        el('button', {
          class: 'btn', title: 'Lee el capítulo completo y extrae la memoria narrativa (escenas, presentes, vestuario, saltos)',
          onClick: async (e) => {
            const btn = e.currentTarget; btn.disabled = true;
            btn.innerHTML = ''; btn.append(icon('pulse', 14), ' Analizando…');
            try {
              const r = await studioApi.analizarCapitulo(pid, capituloEnMesa);
              if (r.ok) toast('Memoria narrativa lista para el capítulo ' + c.numero, 'ok');
              else toast(r.data?.error || 'Análisis falló', 'error', 8000);
            } finally { btn.disabled = false; btn.innerHTML = ''; btn.append(icon('scroll', 14), ' Analizar capítulo'); }
          },
        }, icon('scroll', 14), ' Analizar capítulo'),
        el('button', {
          class: 'btn btn--primary', id: 'btn-ilustrar', disabled: enCurso,
          onClick: () => ilustrarCapitulo(),
        }, icon('wand', 15), cs.estado === 'pendiente' ? 'Ilustrar capítulo ' + c.numero : 'Continuar ilustración'),
        el('button', {
          class: 'btn btn--ghost',
          disabled: cs.estado === 'confirmado',
          title: 'Confirma la calidad y desbloquea el siguiente capítulo',
          onClick: async () => {
            const r = await studioApi.ilustraciones(pid, capituloEnMesa);
            const ilus = (r.data?.ilustraciones || []);
            const sinAprobar = ilus.filter((x) => x.estado !== 'aprobada').length;
            if (sinAprobar > 0) {
              return toast(sinAprobar + ' ilustración(es) esperan tu aprobación en este capítulo', 'info', 8000);
            }
            if (!ilus.length) return toast('Ilustra el capítulo antes de confirmar', 'info');
            if (!(await confirmar('Confirmas la calidad de este capítulo y desbloqueas el siguiente?', { okTxt: 'Confirmar calidad' }))) return;
            cs.estado = 'confirmado';
            studio.actual = Math.min(studio.capitulos.length - 1, capituloEnMesa + 1);
            book.studio = studio;
            await app.db.putBook(book);
            capituloEnMesa = studio.actual;
            toast('Capítulo confirmado — el siguiente está desbloqueado', 'ok');
            refrescarProgreso();
            dibujarSesion();
          },
        }, icon('check', 15), 'Confirmar calidad y avanzar'))));

    const grid = el('div', { class: 'taller__grid' });
    mesa.append(grid);
    cuerpo.append(rail, mesa);
    dibujarHuecos(grid, c);
    // cargar ilustraciones reales
    studioApi.ilustraciones(pid, capituloEnMesa).then((r) => {
      if (!r.ok) return;
      for (const meta of (r.data.ilustraciones || [])) pintarHueco(grid, c, meta);
    });
  }

  async function ilustrarCapitulo() {
    if (enCurso) return;
    enCurso = true;
    const c = book.chapters[capituloEnMesa];
    const btn = document.getElementById('btn-ilustrar');
    try {
      const crear = await studioApi.crearTrabajo(pid, capituloEnMesa);
      if (!crear.ok) { toast(crear.data?.error || 'No se pudo crear el trabajo', 'error', 9000); return; }
      const jobId = crear.data.job.id;
      let job = crear.data.job;
      if (!crear.data.yaExistente) toast('Trabajo creado: ' + job.total + ' párrafos en cola', 'ok');
      // bucle de pasos: el servidor procesa UN párrafo por llamada (patrón serverless)
      let seguridad = job.total * 4 + 8;
      while (job.state === 'en_curso' && seguridad-- > 0) {
        const r = await studioApi.pasoTrabajo(jobId);
        if (!r.ok) { toast(r.data?.error || 'Paso del trabajo falló', 'error'); break; }
        job = r.data.job;
        if (btn) { btn.innerHTML = ''; btn.append(icon('pulse', 15), ' Ilustrando… ' + job.done + '/' + job.total); }
        refrescarEstadoHuecos(job);
      }
      if (job.state === 'completado') {
        toast('Capítulo ' + c.numero + ' ilustrado (' + job.total + ' párrafos) — revisa y aprueba', 'ok', 8000);
        studio.capitulos[capituloEnMesa].estado = 'ilustrado';
      } else if (job.state === 'con_errores') {
        const errores = job.items.filter((i) => i.state === 'error').length;
        toast('Terminó con ' + errores + ' error(es): revisa esas tarjetas y reintenta', 'error', 10000);
      }
      book.studio = studio;
      await app.db.putBook(book);
    } catch (e) {
      toast('Ilustración interrumpida: ' + e.message + ' — el trabajo persiste en el servidor; pulsa Continuar', 'error', 9000);
    } finally {
      enCurso = false;
      dibujarSesion();
    }
  }

  function refrescarEstadoHuecos(job) {
    for (const item of job.items) {
      const hueco = document.querySelector('[data-hueco="' + item.paraId + '"]');
      if (!hueco) continue;
      hueco.dataset.estado = item.state === 'hecho' ? 'ok' : item.state === 'error' ? 'error' : 'trabajando';
      const txt = hueco.querySelector('.taller__hueco-txt');
      if (txt) txt.textContent = item.state === 'hecho' ? 'Ilustración generada' : item.state === 'error' ? ('Error: ' + (item.error || '').slice(0, 80)) : 'Generando…';
    }
  }

  function dibujarHuecos(grid, c) {
    (c.paragraphs || []).forEach((p) => {
      grid.append(el('div', { class: 'taller__carta' },
        el('div', { class: 'taller__hueco taller__hueco--pendiente', 'data-hueco': p.id, 'data-estado': 'pendiente' },
          icon('palette', 22),
          el('span', { class: 'taller__hueco-txt' }, 'Hueco de ilustración · párrafo ' + (p.idx + 1))),
        el('p', { class: 'taller__extracto' }, (p.texto || '').slice(0, 150) + ((p.texto || '').length > 150 ? '…' : ''))));
    });
  }

  function pintarHueco(grid, c, meta) {
    const carta = grid.querySelector('[data-hueco="' + meta.paraId + '"]');
    if (!carta) return;
    const hueco = carta.querySelector('.taller__hueco');
    const v = meta.versions?.[meta.versionActual - 1] || null;
    const url = v ? studioApi.urlAsset(v.key) : null;
    const evaluacion = v?.evaluacion || null;
    hueco.innerHTML = '';
    hueco.className = 'taller__hueco taller__hueco--' + (meta.estado === 'aprobada' ? 'ok' : meta.estado === 'requiere_correccion' ? 'correccion' : meta.estado === 'error' ? 'error' : 'ok');
    if (url) {
      const img = el('img', { src: url, alt: 'Ilustración del párrafo', loading: 'lazy' });
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit;';
      hueco.append(img);
    }
    const chip = el('span', { class: 'taller__estado-chip taller__estado-chip--' + meta.estado }, ESTADOS_ILUSTRACION[meta.estado] || meta.estado);
    chip.style.cssText = 'position:absolute;top:8px;right:8px;z-index:2;';
    hueco.append(chip);
    // acciones reales por ilustración
    const acciones = el('div', { class: 'taller__hueco-actions' },
      el('button', {
        class: 'taller__mini', title: 'Regenerar (nueva versión; la anterior se conserva)',
        onClick: async () => {
          const r = await studioApi.pasoTrabajo((await estudioTrabajoActivo()) || '');
          if (!r.ok) toast('Usa "Continuar ilustración" del capítulo para regenerar', 'info');
        },
      }, icon('refresh', 12), 'Reintentar'),
      el('button', {
        class: 'taller__mini', title: 'Aprobar esta ilustración',
        onClick: async () => {
          const r = await studioApi.aprobarIlustracion(pid, meta.paraId);
          if (r.ok) { toast('Ilustración aprobada', 'ok'); dibujarSesion(); }
        },
      }, icon('check', 12), 'Aprobar'),
      el('button', {
        class: 'taller__mini', title: 'Pedir corrección (la versión actual se conserva)',
        onClick: async () => {
          const r = await studioApi.rechazarIlustracion(pid, meta.paraId, 'Corrección pedida por el autor');
          if (r.ok) { toast('Marcada para corrección', 'info'); dibujarSesion(); }
        },
      }, icon('alert', 12), 'Corregir'));
    hueco.append(acciones);
    if (evaluacion && evaluacion.veredicto === 'requiere_correccion' && (evaluacion.issues || []).length) {
      const aviso = el('p', { class: 'taller__qa-notas', title: evaluacion.issues.join(' · ') },
        'QA: ' + (evaluacion.issues[0] || '').slice(0, 60));
      aviso.style.cssText = 'position:absolute;left:8px;bottom:8px;right:8px;z-index:2;font-size:10.5px;background:rgba(226,99,92,.85);color:#fff;border-radius:6px;padding:4px 7px;';
      hueco.append(aviso);
    }
  }

  async function estudioTrabajoActivo() {
    return null; // regeneración puntual por párrafo llega con el siguiente incremento
  }

  /* ================= TAB: PERSONAJES (fichas + referencias) ================= */

  function dibujarPersonajes() {
    const panel = el('div', { class: 'taller__panel' });
    const grid = el('div', { class: 'taller__grid' });

    panel.append(el('div', { class: 'taller__panel-head' },
      el('div', {},
        el('h3', { class: 'taller__panel-title' }, icon('mask', 16), 'Fichas permanentes de personajes'),
        el('p', { class: 'hint' }, 'El mismo personaje conserva su ficha e ID en TODAS las ilustraciones del libro. Aprueba una referencia maestra por tipo; las versiones anteriores se conservan.')),
      el('button', {
        class: 'btn btn--ghost', onClick: async () => {
          const r = await studioApi.importarElenco(pid, book.personajes || []);
          if (r.ok) {
            toast('Elenco importado: ' + (r.data.creados || 0) + ' nuevas, ' + (r.data.existentes || 0) + ' existentes', 'ok');
            await recargarFichas(); dibujarPersonajes();
          } else toast(r.data?.error || 'Importación falló', 'error');
        },
      }, icon('download', 14), 'Importar elenco del libro'),
      el('button', {
        class: 'btn btn--primary', onClick: async () => {
          const nombre = prompt('Nombre del nuevo personaje:');
          if (!nombre) return;
          const r = await studioApi.crearFicha(pid, { nombre });
          if (r.ok) { toast('Ficha creada', 'ok'); await recargarFichas(); dibujarPersonajes(); }
          else toast(r.data?.error || 'No se pudo crear', 'error');
        },
      }, icon('plus', 14), 'Nueva ficha')));

    for (const f of fichas) grid.append(cartaFicha(f));
    if (!fichas.length) {
      grid.append(el('div', { class: 'empty empty--slim' },
        el('p', {}, 'Sin fichas todavía: importa el elenco del libro o crea fichas a mano.')));
    }
    panel.append(grid);
    cuerpo.append(panel);
  }

  function cartaFicha(f) {
    const refs = f.referencias || [];
    const aprobadas = refs.filter((r) => r.estado === 'aprobada');
    const carta = el('div', { class: 'taller__carta taller__carta--ficha' },
      el('div', { class: 'taller__ficha-head' },
        el('strong', {}, f.nombre),
        f.alias ? el('span', { class: 'hint' }, ' · ' + f.alias) : null,
        el('span', { class: 'taller__cap-estado ' + (f.estadoAprobacion === 'aprobado' ? 'taller__cap-estado--confirmado' : '') },
          f.estadoAprobacion === 'aprobado' ? '✓ aprobado' : 'borrador')),
      el('p', { class: 'taller__extracto' }, [f.descripcionFisica, f.cabello ? 'Cabello: ' + f.cabello : '', f.vestuario].filter(Boolean).join(' · ').slice(0, 160) || '(sin descripción física)'),
      el('div', { class: 'taller__refs' },
        refs.map((r) => {
          const key = 'projects/' + pid + '/characters/' + f.id + '/references/' + r.id + '/' + r.archivo;
          const thumb = el('div', { class: 'taller__ref' + (r.estado === 'aprobada' ? ' is-ok' : r.estado === 'descartada' ? ' is-off' : '') },
            el('img', { src: studioApi.urlAsset(key), alt: r.tipo, loading: 'lazy' }),
            el('span', { class: 'taller__ref-tipo' }, r.tipo + (r.estado === 'aprobada' ? ' ✓' : '')));
          thumb.title = r.estado === 'aprobada' ? 'Referencia maestra aprobada' : 'Pendiente de aprobación';
          thumb.style.cursor = 'pointer';
          thumb.addEventListener('click', async () => {
            const r2 = await studioApi.aprobarReferencia(pid, f.id, r.id);
            if (r2.ok) { toast('Referencia aprobada (las anteriores se conservan)', 'ok'); await recargarFichas(); dibujarPersonajes(); }
          });
          return thumb;
        })),
      el('div', { class: 'taller__hueco-actions' },
        el('label', { class: 'taller__mini', title: 'Subir imagen de referencia (frontal, lateral…)' }, icon('upload', 12), ' Subir referencia',
          (() => {
            const inp = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' });
            inp.style.display = 'none';
            inp.addEventListener('change', async () => {
              const file = inp.files?.[0];
              if (!file) return;
              try {
                const dataUrl = await studioApi.archivoADataUrl(file);
                const r = await studioApi.subirReferencia(pid, f.id, dataUrl, 'frontal');
                if (r.ok) { toast('Referencia subida — púlsala para aprobarla', 'ok'); await recargarFichas(); dibujarPersonajes(); }
                else toast(r.data?.error || 'Subida falló', 'error');
              } catch (e) { toast(e.message, 'error'); }
            });
            carta.addEventListener('click', (ev) => { if (ev.target.textContent === ' Subir referencia' || ev.target.closest('label')?.textContent === ' Subir referencia') { /* label dispara input nativo */ } });
            return inp;
          })()),
        el('button', {
          class: 'taller__mini', title: 'Editar la ficha',
          onClick: () => editarFichaModal(f),
        }, icon('pencil', 12), 'Editar')));
    return carta;
  }

  function editarFichaModal(f) {
    const campos = [
      ['alias', 'Alias'], ['descripcionFisica', 'Descripción física'], ['rasgosFaciales', 'Rasgos faciales'],
      ['cabello', 'Cabello'], ['ojos', 'Ojos'], ['vestuario', 'Vestuario'], ['accesorios', 'Accesorios'],
      ['complexion', 'Complexión'], ['personalidad', 'Personalidad'], ['funcionNarrativa', 'Función narrativa'],
    ];
    const inputs = {};
    const filas = campos.map(([k, label]) => {
      inputs[k] = el('input', { class: 'input', value: f[k] || '', placeholder: label });
      return el('div', { class: 'field' }, el('label', { class: 'field__label' }, label), inputs[k]);
    });
    const invariables = el('textarea', { class: 'input', rows: 2, placeholder: 'Rasgos que NUNCA cambian (uno por línea)' });
    invariables.value = (f.rasgosInvariables || []).join('\n');
    const mutables = el('textarea', { class: 'input', rows: 2, placeholder: 'Características que cambian durante la historia (una por línea)' });
    mutables.value = (f.rasgosMutables || []).join('\n');
    const wrap = el('div', { class: 'modal-wrap' },
      el('div', { class: 'modal' },
        el('h3', {}, 'Ficha de ' + f.nombre),
        el('p', { class: 'modal__msg hint' }, 'ID permanente: ' + f.id + ' (conservado en TODAS las ilustraciones)'),
        el('div', { class: 'wizard__grid2' }, filas.slice(0, Math.ceil(filas.length / 2)), el('div', {},
          el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Rasgos invariables'), invariables),
          el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Rasgos mutables'), mutables))),
        el('div', { class: 'modal__actions' },
          el('button', { class: 'btn btn--ghost', onClick: () => wrap.remove() }, 'Cancelar'),
          el('button', {
            class: 'btn btn--primary', onClick: async () => {
              const parche = { alias: inputs.alias.value.trim(), descripcionFisica: inputs.descripcionFisica.value.trim(), rasgosFaciales: inputs.rasgosFaciales.value.trim(), cabello: inputs.cabello.value.trim(), ojos: inputs.ojos.value.trim(), vestuario: inputs.vestuario.value.trim(), accesorios: inputs.accesorios.value.trim(), complexion: inputs.complexion.value.trim(), personalidad: inputs.personalidad.value.trim(), funcionNarrativa: inputs.funcionNarrativa.value.trim(), rasgosInvariables: invariables.value.split('\n').map((s) => s.trim()).filter(Boolean), rasgosMutables: mutables.value.split('\n').map((s) => s.trim()).filter(Boolean) };
              const r = await studioApi.editarFicha(pid, f.id, parche);
              if (r.ok) { toast('Ficha actualizada', 'ok'); wrap.remove(); await recargarFichas(); dibujarPersonajes(); }
              else toast(r.data?.error || 'Edición falló', 'error');
            },
          }, icon('check', 14), 'Guardar ficha'))));
    wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.remove(); });
    document.getElementById('modal-root').append(wrap);
  }

  /* ================= TAB: MEMORIA (narrativa, corregible) ================= */

  function dibujarMemoria() {
    const panel = el('div', { class: 'taller__panel' });
    const selector = el('select', { class: 'input input--mini' },
      book.chapters.map((c, i) => el('option', { value: String(i), selected: i === capituloEnMesa }, 'Cap ' + c.numero + ' — ' + (c.titulo || ''))));
    selector.value = String(capituloEnMesa);
    selector.addEventListener('change', () => { capituloEnMesa = Number(selector.value); dibujarMemoria(); });

    panel.append(el('div', { class: 'taller__panel-head' },
      el('div', {},
        el('h3', { class: 'taller__panel-title' }, icon('scroll', 16), 'Memoria narrativa'),
        el('p', { class: 'hint' }, 'Lo que el Taller recuerda de cada capítulo: escenas, presentes, vestuario, saltos temporales. Distingue hechos del texto de interpretaciones de la IA — y puedes corregirla a mano.')),
      selector,
      el('button', {
        class: 'btn btn--primary', onClick: async (e) => {
          const btn = e.currentTarget; btn.disabled = true;
          btn.innerHTML = ''; btn.append(icon('pulse', 14), ' Analizando…');
          try {
            const r = await studioApi.analizarCapitulo(pid, capituloEnMesa);
            if (r.ok) { toast('Memoria analizada', 'ok'); dibujarMemoria(); }
            else toast(r.data?.error || 'Análisis falló', 'error', 9000);
          } finally { btn.disabled = false; btn.innerHTML = ''; btn.append(icon('wand', 14), ' Analizar'); }
        },
      }, icon('wand', 14), ' Analizar')));

    const cont = el('div', { id: 'taller-memoria' });
    panel.append(cont);
    cuerpo.append(panel);

    studioApi.continuidad(pid, capituloEnMesa).then((r) => {
      cont.innerHTML = '';
      if (!r.ok) {
        cont.append(el('div', { class: 'empty empty--slim' },
          el('p', {}, 'Este capítulo aún no fue analizado.'),
          el('p', { class: 'hint' }, 'Pulsa "Analizar": el modelo lee el capítulo completo y extrae las escenas para ilustrarlas con continuidad.')));
        return;
      }
      const continuity = r.data.continuity;
      const escenas = (continuity.escenas || []).map((e) => ({ ...e }));
      const notasEl = el('textarea', { class: 'input', rows: 3, placeholder: 'Notas de continuidad para el capítulo siguiente' });
      notasEl.value = continuity.notasContinuidad || '';
      for (const e of escenas) cont.append(cartaEscena(e));
      cont.append(el('div', { class: 'field' },
        el('label', { class: 'field__label' }, 'Notas de continuidad (corregibles)'), notasEl,
        el('button', {
          class: 'btn btn--small', style: 'margin-top:8px',
          onClick: async () => {
            const r2 = await studioApi.corregirMemoria(pid, capituloEnMesa, { escenas, notasContinuidad: notasEl.value });
            if (r2.ok) toast('Memoria corregida por el autor', 'ok');
          },
        }, icon('check', 13), 'Guardar memoria')));
    });
  }

  function cartaEscena(e) {
    const tipoLabel = { continua: 'continua la anterior', salto_temporal: 'salto temporal', sueno: 'sueño', recuerdo: 'recuerdo', independiente: 'escena independiente' }[e.tipo] || e.tipo;
    return el('div', { class: 'taller__carta' },
      el('div', { class: 'taller__ficha-head' },
        el('strong', {}, 'Escena'),
        el('span', { class: 'taller__cap-estado' }, tipoLabel)),
      el('p', { class: 'taller__extracto' }, [e.ubicacion, e.tiempo].filter(Boolean).join(' · ')),
      el('p', { class: 'hint' }, 'Presentes: ' + ((e.personajesPresentes || []).join(', ') || '—')),
      el('p', { class: 'hint' }, 'Acciones: ' + (e.acciones || '—')),
      (e.objetos || []).length ? el('p', { class: 'hint' }, 'Objetos: ' + e.objetos.join(', ')) : null,
      el('p', { class: 'hint' }, 'Vestuario: ' + (e.vestuario || '—')),
      (e.hechosExplicitos || []).length ? el('p', { class: 'hint hint--dna' }, 'Hechos del texto: ' + e.hechosExplicitos.join(' · ')) : null,
      (e.interpretacionesIA || []).length ? el('p', { class: 'hint', style: 'opacity:.65' }, 'Interpretaciones IA: ' + e.interpretacionesIA.join(' · ')) : null);
  }

  /* ---------- utilidades ---------- */

  function refrescarProgreso() {
    const p = progresoTaller(studio);
    const num = document.getElementById('taller-prog');
    const bar = document.getElementById('taller-prog-bar');
    if (num) num.textContent = p.confirmados + '/' + p.total + ' confirmados';
    if (bar) bar.style.width = p.pct + '%';
  }

  dibujarTab('sesion');

  /* ---------- paneles de estado (sin servidor / sin token / login) ---------- */

  function panelNoDisponible(ping) {
    return el('div', { class: 'empty' },
      el('div', { class: 'empty__ico' }, icon('alert', 44)),
      el('h3', {}, 'El servidor del Taller no responde'),
      el('p', { class: 'hint' }, (ping.data?.error || 'La API persistente del Taller corre en el servidor (server.js local o Vercel en producción). Abre la app con ABRIR-HISTORIETAS.bat o desde el servidor del monorepo.'),
      el('button', { class: 'btn btn--primary', onClick: () => render(document.getElementById('app'), { id: book.id }) }, icon('refresh', 15), 'Reintentar')));
  }

  function panelTokenFaltante() {
    return el('div', { class: 'empty' },
      el('div', { class: 'empty__ico' }, icon('key', 44)),
      el('h3', {}, 'Falta el token del propietario'),
      el('p', { class: 'hint' }, 'En Vercel: define la variable de entorno HISTORIETAS_STUDIO_TOKEN en tu proyecto. En local: el servidor la genera e imprime en consola (data/studio-token.txt).'),
      el('button', { class: 'btn btn--primary', onClick: () => render(document.getElementById('app'), { id: book.id }) }, icon('refresh', 15), 'Ya lo configuré'));
  }

  function panelLogin() {
    const inp = el('input', { type: 'password', class: 'input', placeholder: 'Token del propietario del Taller', autocomplete: 'off' });
    return el('div', { class: 'empty' },
      el('div', { class: 'empty__ico' }, icon('key', 44)),
      el('h3', {}, 'Taller privado — inicia sesión'),
      el('p', { class: 'hint' }, 'La sesión la emite TU servidor con cookie httpOnly. El token lo defines en Vercel (HISTORIETAS_STUDIO_TOKEN) o lo ves en la consola del servidor local.'),
      el('div', { class: 'field', style: 'max-width:420px;margin:12px auto' }, inp),
      el('button', {
        class: 'btn btn--primary', onClick: async () => {
          const r = await studioApi.login(inp.value.trim());
          if (r.ok) { toast('Sesión iniciada — el Taller recuerda tu libro', 'ok'); render(document.getElementById('app'), { id: book.id }); }
          else toast(r.data?.error || 'Token incorrecto', 'error');
        },
      }, icon('check', 15), 'Entrar al Taller'));
  }
}
