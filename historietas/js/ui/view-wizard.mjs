/* view-wizard.mjs — asistente de creación en 4 pasos.
   1. Género (sala de especialistas)  2. Semilla creativa (parámetros)
   3. Elenco y artefactos (imágenes del autor)  4. Confirmación y forja. */

import { el, icon, toast, spinner, confirmar } from './components.mjs';
import { app } from '../core/app.mjs';
import { CATEGORIES, getCategory, fullTeam } from '../specialists/registry.mjs';
import { createBook, normalizePortada } from '../domain/book.mjs';
import { createAsset, ASSET_TYPES, craftAssetDNA } from '../domain/assets.mjs';
import { buildPremiseIdeasPrompt } from '../prompts/writers.mjs';
import { extractText, analyzeManuscript } from '../domain/manuscript.mjs';
import { TEXT_MODELS } from '../api/models.mjs';
import { extractJSON } from '../api/client.mjs';
import { saveWizardDraft, loadWizardDraft, clearWizardDraft, draftHasContent } from '../core/draft.mjs';

let draftHookInstalled = false;
let currentSaveDraft = null;

const POVS = ['tercera persona limitada', 'primera persona', 'tercera omnisciente', 'múltiples puntos de vista'];
const PUBLICOS = ['adulto general', 'adolescente / joven adulto', 'infantil', 'solo adulto (contenido maduro)'];
const FINALES = ['sorpréndeme', 'círculo cerrado', 'giro devastador', 'final amargo', 'final abierto con eco', 'catarsis luminosa'];

const FIDELIDAD_LABELS = {
  fieles: 'Alta — respetar trama, escenas y final',
  equilibrada: 'Equilibrada — conservar el alma, mejorar la estructura',
  audaz: 'Audaz — reimaginar libremente (el original es semilla)',
};
const PROSA_LABELS = {
  pulir: 'Pulir — toques mínimos sobre mi voz',
  editorial: 'Editorial — reescritura plena con oficio',
  reinventar: 'Plena voz de la sala — máximo brillo literario',
};

export async function render(root) {
  root.innerHTML = '';
  const state = {
    step: 1,
    categoryId: null,
    premisa: '', titulo: '', publico: 'adulto general', tono: '', pov: POVS[0], era: '', notas: '',
    final: 'sorpréndeme',
    idioma: 'es',
    extensionParrafo: 'normal',
    intensidad: { emocion: 8, psicologia: 8, accion: 5, romance: 3, oscuridad: 5 },
    capitulos: { modo: 'auto', cantidad: 15 },
    parrafosPorCapitulo: app.store.get('parrafosPorCapitulo') || 10,
    pases: { impacto: app.store.get('paseImpacto') !== false },
    preview: false, // previsualización: forjar solo el capítulo 1 antes de comprometer el libro
    portada: { autor: '', anio: '', dedicatoria: '' },
    modelos: { texto: app.store.get('textModel') },
    assets: [],
    origen: null, // {archivo, palabras, analisis, secciones, personajesCanon} cuando se perfecciona un manuscrito
    digests: null, // punto de control del análisis: {archivo, chars, partes} — el trabajo hecho nunca se repite
    fuente: { nivelFidelidad: 'equilibrada', nivelProsa: 'editorial', preservar: { nombres: true, final: true, escenas: true }, indicaciones: '' },
  };
  let ctlAnalisis = null;
  let restoredOnce = false;

  /* Persistencia total: el borrador y el elenco suelto sobreviven a cualquier recarga.
     El elenco (assets con bookId null) vive en IndexedDB y se recupera SIEMPRE —
     incluso de sesiones anteriores sin borrador. */
  const draft = loadWizardDraft();
  if (draftHasContent(draft)) {
    for (const k of Object.keys(draft)) {
      if (draft[k] !== undefined && draft[k] !== null) state[k] = draft[k];
    }
  }
  const looseAssets = await app.db.listAssetsByBook(null).catch(() => []);
  state.assets = looseAssets;
  restoredOnce = draftHasContent(draft) || looseAssets.length > 0;

  function saveDraft() {
    saveWizardDraft(state);
  }
  currentSaveDraft = saveDraft;
  if (!draftHookInstalled) {
    draftHookInstalled = true;
    window.addEventListener('beforeunload', () => { try { currentSaveDraft?.(); } catch {} });
  }

  const box = el('div', { class: 'wizard' });
  root.append(el('h2', { class: 'section-title' }, el('span', { class: 'section-title__ico' }, icon('wand', 22)), 'Nueva historia'), box);
  const restoredLabel = draftHasContent(draft)
    ? 'Borrador restaurado: manuscrito, encargo y elenco siguen aquí.'
    : 'Elenco recuperado de tu sesión anterior.';
  if (restoredOnce) toast(restoredLabel, 'ok');
  draw();

  async function descartarBorrador() {
    if (!(await confirmar('Se descarta el borrador del asistente (manuscrito analizado y elenco suelto). Tu biblioteca de libros no se toca.', { danger: true, okTxt: 'Descartar' }))) return;
    clearWizardDraft();
    for (const a of await app.db.listAssetsByBook(null).catch(() => [])) {
      await app.db.deleteAsset(a.id).catch(() => {});
      if (a.imageKey) await app.db.deleteImage(a.imageKey).catch(() => {});
    }
    render(root);
  }

  function draw() {
    box.innerHTML = '';
    box.append(stepper());
    if (restoredOnce) box.append(el('div', { class: 'ms-restored' },
      el('span', { class: 'hint' }, restoredLabel),
      el('button', { class: 'btn btn--small btn--ghost btn--danger-ghost', onClick: descartarBorrador }, icon('x', 13), 'Empezar de cero')));
    if (state.step === 1) box.append(stepEntrada());
    if (state.step === 2) box.append(stepSemilla());
    if (state.step === 3) box.append(stepElenco());
    if (state.step === 4) box.append(stepConfirm());
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    saveDraft();
  }

  function stepper() {
    const names = ['Inicio', 'Semilla', 'Elenco', 'Forja'];
    return el('div', { class: 'steps' }, names.map((n, i) => el('div', {
      class: 'steps__step ' + (state.step === i + 1 ? 'is-now' : state.step > i + 1 ? 'is-done' : ''),
      onClick: () => { if (i + 1 < state.step || canAdvance(i + 1)) { state.step = i + 1; draw(); } },
    }, el('span', { class: 'steps__num' }, i + 1), n)));
  }

  /* ---------------- PASO 1: manuscrito propio o género ---------------- */

  function stepEntrada() {
    const wrap = el('div', {});
    const grid = el('div', { class: 'cat-grid' },
      CATEGORIES.map((c) => el('button', {
        class: 'cat-card ' + (state.categoryId === c.id ? 'is-sel' : ''),
        onClick: () => {
          state.categoryId = c.id;
          state.tono = state.tono || c.defaults.tono;
          state.final = state.final === 'sorpréndeme' ? c.defaults.final : state.final;
          if (!state.origen) Object.assign(state.intensidad, c.defaults.intensidad);
          draw();
        },
      },
        el('div', { class: 'cat-card__ico' }, icon(c.icono, 26)),
        el('h3', {}, c.nombre),
        el('p', { class: 'cat-card__tag' }, c.tagline),
        el('p', { class: 'cat-card__team' }, c.equipo.map((s) => s.nombre.split(' ')[0] + ' ' + (s.nombre.split(' ')[1] || '')).join(' · ')),
      )));

    if (state.origen) {
      const cat = getCategory(state.categoryId);
      wrap.append(el('div', { class: 'ms-done' },
        el('span', { class: 'ms-done__ico' }, icon('check', 18)),
        el('div', {},
          el('strong', {}, 'Manuscrito analizado: ' + state.origen.archivo),
          el('p', { class: 'hint' },
            state.origen.palabras.toLocaleString('es') + ' palabras · género detectado: ' + (cat?.nombre || state.categoryId) +
            ' · ' + state.origen.secciones.length + ' secciones mapeadas · encargo rellenado automáticamente.'),
        )));
    } else {
      const up = uploadPanel();
      if (up) wrap.append(up); // guardia: append(null) del navegador pinta el texto "null"
    }
    wrap.append(el('h3', { class: 'section-title section-title--slim' }, 'O EMPIEZA DE CERO — elige tu sala de especialistas'));
    wrap.append(grid);
    wrap.append(el('div', { class: 'wizard__nav' },
      el('span'),
      el('button', {
        class: 'btn btn--primary btn--lg', disabled: !state.categoryId,
        onClick: () => { state.step = 2; draw(); },
      }, state.origen ? 'Revisar el encargo rellenado' : 'Continuar', icon('chevronRight', 16))));
    return wrap;
  }

  /** Panel de subida/pegado del manuscrito propio. */
  function uploadPanel() {
    const fileIn = el('input', { type: 'file', accept: '.pdf,.docx,.doc,.txt,.md,.markdown,.rtf', class: 'file-hidden', id: 'f-ms' });
    const pasteTa = el('textarea', {
      class: 'input', rows: 3, id: 'ms-paste', placeholder: '…o pega aquí el texto de tu libro y pulsa "Analizar texto pegado"',
    });
    const status = el('div', { class: 'ms-status', id: 'ms-status' });
    const btnAnalizar = el('button', {
      class: 'btn', id: 'ms-analizar',
      onClick: async () => {
        const f = fileIn.files && fileIn.files[0];
        if (f) return analizarManuscrito(f);
        toast('Elige un archivo o pega tu texto primero', 'error');
      },
    }, icon('upload', 16), 'Subir y analizar mi libro');
    const btnPegar = el('button', {
      class: 'btn btn--ghost', id: 'ms-pegar',
      onClick: async () => {
        const texto = pasteTa.value.trim();
        if (!texto) return toast('Pega primero el texto de tu libro', 'error');
        return correrAnalisis('texto pegado', texto, 0);
      },
    }, icon('pencil', 16), 'Analizar texto pegado');

    const zone = el('div', {
      class: 'dropzone', id: 'ms-zone',
      onClick: () => fileIn.click(),
    },
      el('div', { class: 'dropzone__ico' }, icon('feather', 28)),
      el('strong', {}, 'Arrastra aquí tu manuscrito'),
      el('span', { class: 'hint' }, 'PDF, DOCX, TXT o MD — la sala lo analiza y rellena TODO el encargo automáticamente: título, tono, POV, público, final, época, intensidades y elenco.'),
      el('span', { class: 'dropzone__formats' }, '.pdf · .docx · .txt · .md'),
    );
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('is-over');
      const f = e.dataTransfer?.files?.[0];
      if (f) analizarManuscrito(f);
    });
    fileIn.addEventListener('change', () => {
      const f = fileIn.files && fileIn.files[0];
      if (f) analizarManuscrito(f);
    });

    let cronMetro = null;
    function setStatus(txt, working) {
      status.innerHTML = '';
      if (cronMetro) { clearInterval(cronMetro); cronMetro = null; }
      if (!txt) return;
      status.append(working ? spinner(14) : icon('check', 14), el('span', {}, txt));
      status.classList.toggle('is-working', !!working);
      if (working) {
        // cronómetro: que nunca parezca congelado mientras el servicio responde
        const t0 = Date.now();
        const etiqueta = txt;
        cronMetro = setInterval(() => {
          const span = status.querySelector('span');
          if (!span || !span.isConnected) { clearInterval(cronMetro); cronMetro = null; return; }
          span.textContent = etiqueta + ' — ' + Math.round((Date.now() - t0) / 1000) + 's';
        }, 5000);
      }
    }

    let ultimoAnalisis = null; // {nombre, texto, palabras} para Reintentar sin re-leer el archivo

    async function analizarManuscrito(file) {
      if (!app.store.get('nvApiKey')) { toast('Configura tu clave NVIDIA en Ajustes para analizar tu libro', 'error'); return app.router.go('/ajustes'); }
      setAnalyzing(true);
      setStatus('Extrayendo el texto…', true);
      try {
        const { texto, recortado, palabras } = await extractText(file, (st) => setStatus(st, true));
        if (recortado) toast('Manuscrito muy largo: se analizaron cabeza y cola (600.000 caracteres)', 'info');
        ultimoAnalisis = { nombre: file.name, texto, palabras };
        await correrAnalisis(file.name, texto, palabras);
      } catch (e) {
        failAnalisis(e);
      }
    }

    async function correrAnalisis(nombre, texto, palabras) {
      setAnalyzing(true);
      setStatus('Comprobando el servicio de escritura…', true);
      ctlAnalisis = new AbortController();
      try {
        const resuelto = await app.client.resolveTextModel();
        if (resuelto.switched) {
          toast('El modelo principal está caído en NVIDIA ahora mismo: esta fase usará ' + resuelto.model + ' (respaldo verificado con tu clave).', 'info', 10000);
        }
        setStatus('Analizando tu manuscrito…', true);
        const res = await analyzeManuscript({
          client: app.client, archivo: nombre, texto, model: resuelto.model,
          prev: state.digests, // punto de control: reanuda las partes ya analizadas de ESTE archivo
          onDigests: (checkpoint) => { state.digests = checkpoint; saveDraft(); },
          onStage: (st) => setStatus(st, true),
          signal: ctlAnalisis.signal,
        });
        if (palabras) res.palabras = palabras;
        await aplicarAnalisis(res);
      } catch (e) {
        failAnalisis(e);
      }
    }

    function failAnalisis(e) {
      setAnalyzing(false);
      const msg = ctlAnalisis?.signal.aborted ? 'Análisis cancelado.' : String(e?.message || e);
      // el fallo se queda VISIBLE con su causa y un botón para reintentar sin perder nada
      setStatus('', false);
      status.classList.remove('is-working');
      status.append(
        el('span', { class: 'ms-fail' }, icon('alert', 13), ' Falló el análisis: ' + msg),
        el('button', {
          class: 'btn btn--small', onClick: async () => {
            if (!ultimoAnalisis) return;
            const u = ultimoAnalisis;
            ultimoAnalisis = null;
            status.innerHTML = '';
            await correrAnalisis(u.nombre, u.texto, u.palabras);
          },
        }, icon('refresh', 13), 'Reintentar (las partes ya analizadas se conservan)'),
      );
      if (!ctlAnalisis?.signal.aborted) toast('Falló el análisis: ' + msg, 'error', 10000);
    }

    function setAnalyzing(on) {
      btnAnalizar.disabled = on;
      btnPegar.disabled = on;
      if (on) {
        const btnCancelar = el('button', {
          class: 'btn btn--ghost btn--danger-ghost', id: 'ms-cancelar',
          onClick: () => { ctlAnalisis?.abort(new Error('Cancelado por el usuario')); },
        }, icon('x', 14), 'Cancelar análisis');
        status.append(btnCancelar);
      }
    }

    return el('section', { class: 'ms-panel' },
      el('h3', { class: 'ms-panel__title' }, el('span', { class: 'section-title__ico' }, icon('feather', 20)), 'Perfeccionar mi libro'),
      el('p', { class: 'ms-panel__sub' },
        'Sube tu manuscrito y la sala editorial lo analiza al instante: rellena automáticamente todo el encargo ' +
        '(título, tono, punto de vista, público, final, época, intensidades y elenco con su ADN visual) y luego lo reescribe con oficio, con paneles ilustrados por párrafo.'),
      zone, fileIn,
      el('div', { class: 'ms-panel__actions' }, btnAnalizar, btnPegar),
      pasteTa, status);
  }

  /** Aplica el análisis al estado: TODO el encargo queda relleno. */
  async function aplicarAnalisis(res) {
    const a = res.analisis;
    // re-análisis: los personajes automáticos de un análisis anterior se retiran
    // (junto a cualquier homónimo suelto de sesiones previas) para no duplicar elenco
    const nombresNuevos = new Set((res.personajesCanon || []).map((p) => p.nombre.toLowerCase()));
    const sobreviven = [];
    for (const old of state.assets) {
      const duplicado = old.automatico || nombresNuevos.has(old.nombre.toLowerCase());
      if (duplicado) {
        await app.db.deleteAsset(old.id).catch(() => {});
        if (old.imageKey) await app.db.deleteImage(old.imageKey).catch(() => {});
      } else {
        sobreviven.push(old);
      }
    }
    state.assets = sobreviven;

    state.origen = res;
    state.categoryId = a.categoria;
    state.premisa = a.premisa;
    state.titulo = a.titulo;
    state.tono = a.tono;
    state.pov = a.pov;
    state.publico = a.publico;
    state.era = a.era;
    state.final = a.final;
    Object.assign(state.intensidad, a.intensidad);
    state.fuente.indicaciones = a.debilidades.map((d) => 'Corregir: ' + d).join('\n');
    // elenco del original → canon de personajes (assets automáticos)
    for (const p of res.personajesCanon || []) {
      const asset = createAsset({ nombre: p.nombre, tipo: 'personaje', descripcion: p.descripcion, dnaEn: p.aparienciaEn });
      asset.automatico = true;
      state.assets.push(asset);
      await app.db.putAsset(asset).catch(() => {});
    }
    toast('Encargo rellenado automáticamente: ' + (res.secciones.length) + ' secciones y ' + (res.personajesCanon.length) + ' personajes del original', 'ok');
    state.digests = null; // análisis completado: el punto de control ya no hace falta
    state.step = 2;
    draw();
  }

  function canAdvance(step) {
    if (step === 1) return !!state.categoryId;
    return true;
  }

  function navBtns(prevFn, nextLabel, nextFn, canNext = true) {
    return el('div', { class: 'wizard__nav' },
      prevFn ? el('button', { class: 'btn btn--ghost', onClick: prevFn }, icon('chevronLeft', 16), 'Atrás') : el('span'),
      el('button', { class: 'btn btn--primary btn--lg', disabled: !canNext, onClick: nextFn }, nextLabel, icon('chevronRight', 16)));
  }

  /** Select tolerante: incluye el valor actual aunque venga del análisis del manuscrito. */
  function selWith(base, current, onch) {
    const opts = [...new Set([...base, ...(current ? [current] : [])])];
    const sel = el('select', { class: 'input' }, opts.map((p) => el('option', { value: p }, p)));
    sel.value = current || opts[0];
    if (sel.value !== (current || opts[0])) sel.value = opts[0];
    sel.addEventListener('change', () => onch(sel.value));
    return sel;
  }

  /** Panel de reescritura (solo con manuscrito): diagnóstico + fidelidad + prosa + preservar. */
  function origenPanel() {
    if (!state.origen) return null;
    const a = state.origen.analisis;
    const f = state.fuente;

    const fidSel = el('select', { class: 'input' },
      Object.entries(FIDELIDAD_LABELS).map(([id, label]) => el('option', { value: id, selected: f.nivelFidelidad === id }, label)));
    fidSel.value = f.nivelFidelidad;
    fidSel.addEventListener('change', () => { f.nivelFidelidad = fidSel.value; });

    const prosaSel = el('select', { class: 'input' },
      Object.entries(PROSA_LABELS).map(([id, label]) => el('option', { value: id, selected: f.nivelProsa === id }, label)));
    prosaSel.value = f.nivelProsa;
    prosaSel.addEventListener('change', () => { f.nivelProsa = prosaSel.value; });

    const indicTa = el('textarea', {
      class: 'input', rows: 3,
      placeholder: 'Qué quieres que mejore la sala (rellenado con el diagnóstico; edítalo a tu gusto)',
    });
    indicTa.value = f.indicaciones;
    indicTa.addEventListener('input', () => { f.indicaciones = indicTa.value; });

    return el('section', { class: 'origen' },
      el('div', { class: 'origen__head' },
        el('span', { class: 'origen__ico' }, icon('feather', 20)),
        el('div', {},
          el('h3', {}, 'Reescritura de tu manuscrito: ' + state.origen.archivo),
          el('p', { class: 'hint' },
            (state.origen.palabras || 0).toLocaleString('es') + ' palabras analizadas · ' +
            state.origen.secciones.length + ' secciones mapeadas · elenco del original incorporado al canon.')),
      ),
      a.fortalezas?.length || a.debilidades?.length ? el('div', { class: 'diag' },
        ...a.fortalezas.map((x) => el('span', { class: 'diag__chip diag__chip--ok' }, icon('check', 12), x)),
        ...a.debilidades.map((x) => el('span', { class: 'diag__chip diag__chip--warn' }, icon('alert', 12), x)),
      ) : null,
      el('div', { class: 'wizard__grid2' },
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Nivel de fidelidad al original'), fidSel),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Nivel de mejora de la prosa'), prosaSel)),
      el('div', { class: 'wizard__row origen__checks' },
        el('label', { class: 'check' }, (() => { const c = el('input', { type: 'checkbox', checked: f.preservar.nombres }); c.addEventListener('change', () => { f.preservar.nombres = c.checked; }); return c; })(), ' Mantener los nombres de mis personajes'),
        el('label', { class: 'check' }, (() => { const c = el('input', { type: 'checkbox', checked: f.preservar.final }); c.addEventListener('change', () => { f.preservar.final = c.checked; }); return c; })(), ' Mantener mi final'),
        el('label', { class: 'check' }, (() => { const c = el('input', { type: 'checkbox', checked: f.preservar.escenas }); c.addEventListener('change', () => { f.preservar.escenas = c.checked; }); return c; })(), ' Mantener mis escenas clave'),
      ),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Indicaciones de mejora (personalízalas)'), indicTa));
  }

  /* ---------------- PASO 2: semilla ---------------- */
  function stepSemilla() {
    const cat = getCategory(state.categoryId);
    const premisaTa = el('textarea', {
      class: 'input', rows: 4, id: 'f-premisa', placeholder: 'Cuenta la historia que llevas dentro… (puedes dejarlo vacío y pulsar "Inspírame")',
    });
    premisaTa.value = state.premisa;
    premisaTa.addEventListener('input', () => { state.premisa = premisaTa.value; });

    const ideasBox = el('div', { class: 'ideas', id: 'ideas-box' });
    const btnIdea = el('button', {
      class: 'btn btn--ghost', id: 'btn-idea',
      onClick: async () => {
        if (!app.store.get('nvApiKey')) return toast('Configura tu clave NVIDIA en Ajustes', 'error');
        btnIdea.disabled = true;
        btnIdea.innerHTML = '';
        btnIdea.append(spinner(14), 'Buscando premisas…');
        try {
          const { system, user } = buildPremiseIdeasPrompt(cat, 3);
          const raw = await app.client.chatJSON([{ role: 'system', content: system }, { role: 'user', content: user }], { maxTokens: 900 });
          ideasBox.innerHTML = '';
          for (const p of raw?.premisas || []) {
            ideasBox.append(el('button', {
              class: 'idea-chip', onClick: () => { state.premisa = String(p); premisaTa.value = String(p); },
            }, icon('spark', 13), String(p)));
          }
        } catch (e) { toast('No pude inventar premisas: ' + e.message, 'error'); }
        finally { btnIdea.disabled = false; btnIdea.innerHTML = ''; btnIdea.append(icon('spark', 16), 'Inspírame'); }
      },
    }, icon('spark', 16), 'Inspírame');

    const tituloIn = el('input', { class: 'input', id: 'f-titulo', placeholder: 'Libre — el estudio lo bautiza' });
    tituloIn.value = state.titulo;
    tituloIn.addEventListener('input', () => { state.titulo = tituloIn.value; });

    const tonoIn = el('input', { class: 'input', id: 'f-tono', placeholder: cat.defaults.tono });
    tonoIn.value = state.tono;
    tonoIn.addEventListener('input', () => { state.tono = tonoIn.value; });

    const eraIn = el('input', { class: 'input', id: 'f-era', placeholder: 'Época y escenario (p. ej. "Buenos Aires, 1978")' });
    eraIn.value = state.era;
    eraIn.addEventListener('input', () => { state.era = eraIn.value; });

    const povSel = selWith(POVS, state.pov, (v) => { state.pov = v; });
    const pubSel = selWith(PUBLICOS, state.publico, (v) => { state.publico = v; });
    const finSel = selWith(FINALES, state.final, (v) => { state.final = v; });

    const sliders = el('div', { class: 'sliders' });
    for (const [k, label] of Object.entries({ emocion: 'Emoción', psicologia: 'Psicología', accion: 'Acción', romance: 'Romance', oscuridad: 'Oscuridad' })) {
      const val = el('span', { class: 'sliders__val' }, String(state.intensidad[k]));
      const r = el('input', { type: 'range', min: 0, max: 10, value: state.intensidad[k] });
      r.addEventListener('input', () => { state.intensidad[k] = Number(r.value); val.textContent = r.value; });
      sliders.append(el('div', { class: 'sliders__row' }, el('label', {}, label), r, val));
    }

    const chaps = el('div', { class: 'chips' },
      ['auto', 15, 20, 25].map((v) => el('button', {
        class: 'chip ' + (state.capitulos.modo === 'auto' && v === 'auto' || state.capitulos.modo === 'fijo' && state.capitulos.cantidad === v ? 'is-sel' : ''),
        onClick: () => {
          if (v === 'auto') state.capitulos = { modo: 'auto', cantidad: null };
          else state.capitulos = { modo: 'fijo', cantidad: v };
          draw();
        },
      }, v === 'auto' ? 'Libre (la sala decide 12-22)' : v + ' capítulos')),
      (() => {
        const own = el('div', { class: 'chip chip--input ' + (state.capitulos.modo === 'fijo' && ![15, 20, 25].includes(state.capitulos.cantidad) ? 'is-sel' : '') },
          el('span', {}, 'Otro:'),
          (() => {
            const n = el('input', { type: 'number', min: 3, max: 40, value: state.capitulos.cantidad || 12, class: 'input input--mini' });
            n.addEventListener('change', () => {
              const v = Math.max(3, Math.min(40, Number(n.value) || 12));
              n.value = v;
              state.capitulos = { modo: 'fijo', cantidad: v };
              draw();
            });
            return n;
          })());
        return own;
      })());

    const parasSel = el('select', { class: 'input' }, [6, 7, 8, 9, 10, 11, 12, 13, 14].map((n) => el('option', { value: String(n) }, n + ' párrafos = ' + n + ' paneles por capítulo')));
    parasSel.value = String(state.parrafosPorCapitulo);
    parasSel.addEventListener('change', () => { state.parrafosPorCapitulo = Number(parasSel.value); });

    const notasTa = el('textarea', { class: 'input', rows: 3, placeholder: 'Todo lo que exijas: personajes concretos, escenas obligatorias, temas prohibidos, ritmo…' });
    notasTa.value = state.notas; notasTa.addEventListener('input', () => { state.notas = notasTa.value; });

    return el('div', {},
      origenPanel(),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Premisa'), premisaTa, el('div', { class: 'wizard__row' }, btnIdea, ideasBox)),
      el('div', { class: 'wizard__grid2' },
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Título (opcional)'), tituloIn),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Tono'), tonoIn)),
      el('div', { class: 'wizard__grid3' },
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Punto de vista'), povSel),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Público'), pubSel),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Tipo de final'), finSel)),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Época / escenario'), eraIn),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Intensidades (0-10)'), sliders),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Capítulos'), chaps),
      el('div', { class: 'wizard__grid2' },
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Párrafos por capítulo'), parasSel),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Exigencias del autor (notas)'), notasTa)),
      navBtns(() => { state.step = 1; draw(); }, 'Elenco y artefactos', () => { state.step = 3; draw(); }));
  }

  /* ---------------- PASO 3: elenco / artefactos (canon textual) ---------------- */
  function stepElenco() {
    const grid = el('div', { class: 'assets-grid' });
    if (!state.assets.length) {
      grid.append(el('div', { class: 'empty empty--slim' },
        el('p', {}, 'Define personajes, objetos, paisajes o situaciones de tu canon: la sala los integra en la historia con sus nombres exactos.'),
        el('p', { class: 'hint' }, 'El ADN visual que forjes aquí lo usará el Taller de Ilustración (Parte 2) para dibujarlos.')));
    }
    for (const a of state.assets) grid.append(assetCard(a));

    return el('div', {},
      el('p', { class: 'wizard__hint' }, 'Tu canon: lo que definas aquí es ley para la sala de escritores. El "ADN visual" es un retrato textual (rasgos, vestuario, colores) — las ilustraciones se crean luego en el Taller, capítulo a capítulo.'),
      el('div', { class: 'wizard__row' },
        el('button', { class: 'btn', onClick: () => { addTextAsset(); draw(); } }, icon('plus', 16), 'Añadir elemento'),
        state.origen && personajesFaltantes().length
          ? el('button', { class: 'btn btn--ghost', onClick: recuperarPersonajesManuscrito },
              icon('refresh', 16), 'Recuperar personajes del manuscrito (' + personajesFaltantes().length + ')')
          : null),
      grid,
      navBtns(() => { state.step = 2; draw(); }, 'Confirmar y forjar', () => { state.step = 4; draw(); }));
  }

  /* ---------------- elenco: alta, recuperación del manuscrito y quitar ---------------- */

  /* DECLARACIÓN de función (no const): se eleva y es segura de llamar desde el primer
     draw() de la carga — una const aquí rompería con TDZ al restaurar el paso 3. */
  function personajesFaltantes() {
    return (state.origen?.analisis?.personajesCanon || []).filter(
      (p) => !state.assets.some((a) => a.nombre.toLowerCase() === p.nombre.toLowerCase())
    );
  }

  async function recuperarPersonajesManuscrito() {
    const faltan = personajesFaltantes();
    if (!faltan.length) return toast('Todos los personajes del manuscrito ya están en el elenco', 'ok');
    for (const p of faltan) {
      const asset = createAsset({ nombre: p.nombre, tipo: 'personaje', descripcion: p.descripcion, dnaEn: p.aparienciaEn });
      asset.automatico = true;
      state.assets.push(asset);
      await app.db.putAsset(asset).catch(() => {});
    }
    toast('Recuperados del manuscrito: ' + faltan.map((p) => p.nombre).join(', '), 'ok');
    draw();
  }

  function addTextAsset() {
    const asset = createAsset({ nombre: 'Elemento ' + (state.assets.length + 1), tipo: 'situacion', descripcion: '' });
    state.assets.push(asset);
    app.db.putAsset(asset).catch(() => {});
  }

  function assetCard(a) {
    const nombre = el('input', { class: 'input input--mini', value: a.nombre });
    nombre.addEventListener('input', () => { a.nombre = nombre.value; app.db.putAsset(a).catch(() => {}); });
    const tipo = el('select', { class: 'input input--mini' }, ASSET_TYPES.map((t) => el('option', { value: t.id, selected: a.tipo === t.id }, t.nombre)));
    tipo.addEventListener('change', () => { a.tipo = tipo.value; app.db.putAsset(a).catch(() => {}); });
    const desc = el('textarea', { class: 'input input--mini', rows: 3, placeholder: 'Describe el elemento y su papel en la historia' });
    desc.value = a.descripcion;
    desc.addEventListener('input', () => { a.descripcion = desc.value; app.db.putAsset(a).catch(() => {}); });

    const actions = el('div', { class: 'asset-card__actions' },
      el('button', {
        class: 'btn btn--small', title: 'Forja su ADN visual textual (retrato en palabras para las ilustraciones)',
        onClick: async (e) => {
          if (!a.descripcion.trim()) return toast('Escribe primero la descripción', 'error');
          const btn = e.currentTarget; btn.disabled = true;
          btn.innerHTML = ''; btn.append(spinner(13), 'Forjando ADN…');
          try {
            const raw = await craftAssetDNA(app.client, { nombre: a.nombre, tipo: a.tipo, descripcion: a.descripcion });
            const parsed = extractJSON(raw) || {};
            a.aparienciaEn = parsed.apariencia_en || ''; a.vestuarioEn = parsed.vestuario_en || '';
            a.rasgoDistintivoEn = parsed.rasgo_distintivo_en || '';
            await app.db.putAsset(a);
            toast('ADN visual listo para "' + a.nombre + '"', 'ok');
          } catch (err) { toast('Fallo: ' + err.message, 'error'); }
          finally { btn.disabled = false; btn.innerHTML = ''; btn.append(icon('wand', 13), 'ADN visual'); }
        },
      }, icon('wand', 13), 'ADN visual'),
      el('button', {
        class: 'btn btn--small btn--danger-ghost', title: 'Quitar del elenco (con confirmación)',
        onClick: async () => {
          const recuperable = state.origen && (state.origen.analisis?.personajesCanon || []).some(
            (p) => p.nombre.toLowerCase() === a.nombre.toLowerCase()
          );
          if (!(await confirmar(
            '¿Quitar a "' + a.nombre + '" del elenco?' +
            (recuperable ? ' Podrás recuperarlo con "Recuperar personajes del manuscrito".' : ' Podrás volver a añadirlo a mano.'),
            { titulo: 'Quitar del elenco', okTxt: 'Quitar' }
          ))) return;
          state.assets = state.assets.filter((x) => x.id !== a.id);
          await app.db.deleteAsset(a.id).catch(() => {});
          draw();
        },
      }, icon('trash', 13), 'Quitar'));

    return el('div', { class: 'asset-card asset-card--texto' },
      el('div', { class: 'asset-card__body' },
        el('div', { class: 'wizard__grid2' }, nombre, tipo), desc, actions,
        a.aparienciaEn ? el('p', { class: 'hint hint--dna' }, 'ADN: ' + a.aparienciaEn.slice(0, 120) + '…') : null));
  }

  /* ---------------- PASO 4: confirmación y portada ---------------- */
  function stepConfirm() {
    const cat = getCategory(state.categoryId);
    const team = fullTeam(cat);
    const caps = state.capitulos.modo === 'fijo' ? state.capitulos.cantidad + ' capítulos exactos' : 'capítulos libres (12-22)';

    const selText = el('select', { class: 'input' }, TEXT_MODELS.map((m) => el('option', { value: m.id }, (m.recomendado ? '★ ' : '') + m.nombre)));
    selText.value = state.modelos.texto; selText.addEventListener('change', () => { state.modelos.texto = selText.value; });

    const inpAutor = el('input', { class: 'input', value: state.portada.autor || '', placeholder: 'Tu nombre o seudónimo' });
    inpAutor.addEventListener('input', () => { state.portada.autor = inpAutor.value; });
    const inpAnio = el('input', { class: 'input', value: state.portada.anio || '', placeholder: 'Año de la obra' });
    inpAnio.addEventListener('input', () => { state.portada.anio = inpAnio.value; });
    const taDedicatoria = el('textarea', { class: 'input', rows: 2, placeholder: 'Dedicatoria: "Para…, con cariño"' });
    taDedicatoria.value = state.portada.dedicatoria || '';
    taDedicatoria.addEventListener('input', () => { state.portada.dedicatoria = taDedicatoria.value; });

    return el('div', { class: 'confirm' },
      el('div', { class: 'confirm__head' },
        el('div', { class: 'cat-card__ico' }, icon(cat.icono, 30)),
        el('h3', {}, state.titulo || 'El estudio bautizará la obra'),
        el('p', { class: 'confirm__prem' }, state.premisa || 'Premisa sorpresa: la sala decide.')),
      el('div', { class: 'confirm__rows' },
        row('Género', cat.nombre), row('Estructura', caps + ' · ' + state.parrafosPorCapitulo + ' párrafos por capítulo'),
        row('Público / POV', state.publico + ' · ' + state.pov),
        row('Intensidades', Object.entries(state.intensidad).map(([k, v]) => k + ' ' + v).join(' · ')),
        row('Elenco del autor', state.assets.length ? state.assets.map((a) => a.nombre).join(', ') : '—'),
        state.origen
          ? row('Origen', 'Reescritura de "' + state.origen.archivo + '" · Fidelidad: ' + FIDELIDAD_LABELS[state.fuente.nivelFidelidad] + ' · Prosa: ' + PROSA_LABELS[state.fuente.nivelProsa])
          : null,
        row('Sala de especialistas', team.map((s) => s.nombre.split(' ')[0]).join(', ') + ' y equipo técnico')),
      el('div', { class: 'confirm__portada' },
        el('h4', { class: 'confirm__portada-title' }, icon('feather', 15), 'Portada del libro (opcional, editable luego)'),
        el('div', { class: 'wizard__grid2' },
          el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Autor'), inpAutor),
          el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Año'), inpAnio)),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Dedicatoria'), taDedicatoria)),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Modelo de escritura'), selText),
      el('div', { class: 'wizard__row' },
        el('label', { class: 'check' }, (() => { const c = el('input', { type: 'checkbox', checked: state.pases.impacto }); c.addEventListener('change', () => { state.pases.impacto = c.checked; }); return c; })(), ' Pase de impacto en capítulos clave'),
        el('label', { class: 'check' }, (() => { const c = el('input', { type: 'checkbox', checked: !!state.preview }); c.addEventListener('change', () => { state.preview = c.checked; }); return c; })(), ' Previsualizar: forjar solo el capítulo 1 primero')),
      navBtns(() => { state.step = 3; draw(); }, 'Forjar la historia', forjar, !!state.categoryId));

    function row(k, v) { return el('div', { class: 'confirm__row' }, el('strong', {}, k), el('span', {}, v)); }
  }

  async function forjar() {
    if (!app.store.get('nvApiKey')) { toast('Falta tu clave NVIDIA: ve a Ajustes', 'error'); return app.router.go('/ajustes'); }
    const cat = getCategory(state.categoryId);
    const book = createBook({
      categoryId: state.categoryId,
      premisa: state.premisa,
      titulo: state.titulo,
      idioma: 'es',
      publico: state.publico,
      tono: state.tono || cat.defaults.tono,
      pov: state.pov, era: state.era,
      intensidad: state.intensidad,
      capitulos: state.capitulos,
      parrafosPorCapitulo: state.parrafosPorCapitulo,
      final: state.final === 'sorpréndeme' ? '' : state.final,
      notas: state.notas,
      pases: state.pases,
      preview: !!state.preview,
      portada: { ...state.portada },
      fuente: state.origen ? {
        archivo: state.origen.archivo,
        nivelFidelidad: state.fuente.nivelFidelidad,
        nivelProsa: state.fuente.nivelProsa,
        preservar: { ...state.fuente.preservar },
        indicaciones: state.fuente.indicaciones,
        canon: {
          tituloOriginal: state.origen.analisis.titulo,
          premisaOriginal: state.origen.analisis.premisa,
          secciones: state.origen.secciones,
        },
      } : null,
    });
    book.brief.modelos = { ...state.modelos };
    for (const a of state.assets) {
      a.bookId = book.id;
      book.brief.assetIds.push(a.id);
      await app.db.putAsset(a).catch(() => {});
    }
    await app.db.putBook(book);
    clearWizardDraft(); // el borrador ya es un libro: no debe restaurarse en el próximo asistente
    app.router.go('/forja/' + book.id);
  }
}
