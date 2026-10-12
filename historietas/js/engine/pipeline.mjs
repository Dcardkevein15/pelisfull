/* pipeline.mjs — orquestador de la forja del libro (SOLO TEXTO).
   Fases: concepto → biblia → personajes → esquema → escritura → impacto → listo.
   v3.0: las ilustraciones viven en el Taller (Parte 2, js/studio/) — aquí no
   se procesa ninguna imagen. Con checkpoints, cancelación y reanudación. */

import {
  PHASES, computeStats, keyChapterIndexes, normalizeChapter, normalizeOutline, addCredits, touch,
} from '../domain/book.mjs';
import { getCategory, teamForPhase } from '../specialists/registry.mjs';
import {
  buildBiblePrompt, buildChapterPrompt, buildCharactersPrompt, buildConceptPrompt,
  buildImpactPrompt, buildOutlinePrompt,
} from '../prompts/writers.mjs';
import { sleep } from '../core/utils.mjs';

export class Pipeline {
  /**
   * @param {object} deps { client, storage, bus }
   * storage: { putBook(book), getBook(id), listAssetsByBook(bookId) }
   */
  constructor({ client, storage, bus } = {}) {
    this.client = client;
    this.storage = storage;
    this.bus = bus || { emit() {} };
    this.ctl = null;
  }

  log(book, msg, tipo = 'info') {
    const entry = { msg: String(msg), tipo, at: new Date().toISOString() };
    book.progress.log.push(entry);
    if (book.progress.log.length > 400) book.progress.log.splice(0, book.progress.log.length - 400);
    this.bus.emit('log', { bookId: book.id, ...entry });
  }

  setPhase(book, phaseId) {
    const idx = PHASES.findIndex((p) => p.id === phaseId);
    book.progress.phaseIdx = Math.max(book.progress.phaseIdx, idx);
    book.status = 'generando';
    this.bus.emit('phase', { bookId: book.id, phase: phaseId, idx });
  }

  async persist(book) {
    touch(book);
    await this.storage.putBook(book);
    this.bus.emit('book', { bookId: book.id, status: book.status, progress: { ...book.progress } });
  }

  async cancel(bookId) {
    if (this.ctl) {
      this.ctl.abort(new Error('Cancelado por el usuario'));
      this.ctl = null;
    }
  }

  /**
   * Reintenta una llamada de fase con paciencia: los modelos de razonamiento
   * fallan a ratos (JSON incompleto, content vacío, rate limits…). Solo sube
   * el error al llamador tras agotar los intentos, y cada fallo queda en el diario.
   */
  async retry(book, label, fn, attempts = 3) {
    for (let i = 1; ; i++) {
      try {
        return await fn();
      } catch (e) {
        if (this.ctl?.signal?.aborted) throw e;
        if (i >= attempts) throw e;
        const ms = 1600 * i;
        this.log(book, label + ': intento ' + i + ' falló (' + String(e.message || e).slice(0, 160) + '). Reintentando…', 'warn');
        await sleep(ms);
      }
    }
  }

  /** Lanza (o reanuda) la generación completa. */
  async generate(book) {
    this.ctl = new AbortController();
    const signal = this.ctl.signal;
    try {
      await this.preflight(book, signal);
      await this.run(book, signal);
      book.status = 'listo';
      computeStats(book);
      await this.persist(book);
      this.bus.emit('done', { bookId: book.id });
      return book;
    } catch (e) {
      if (signal.aborted) {
        book.status = 'pausado';
        await this.persist(book);
        this.bus.emit('paused', { bookId: book.id });
      } else {
        book.status = 'fallido';
        this.log(book, 'ERROR FATAL: ' + (e.message || e), 'error');
        await this.persist(book);
        this.bus.emit('failed', { bookId: book.id, error: e.message });
      }
      throw e;
    } finally {
      this.ctl = null;
    }
  }

  async run(book, signal) {
    const category = getCategory(book.brief.categoryId);
    if (!category) throw new Error('Categoría desconocida: ' + book.brief.categoryId);
    const assets = (await this.storage.listAssetsByBook(book.id)) || [];

    /* ---------- 1. CONCEPTO ---------- */
    if (!book.meta.titulo) {
      this.setPhase(book, 'concepto');
      this.log(book, 'Sala de escritores reuniéndose: ' + teamForPhase(category, 'concepto').map((s) => s.nombre).join(' · '));
      const { system, user } = buildConceptPrompt(book.brief, assets);
      const raw = await this.retry(book, 'Concepto', () =>
        this.client.chatJSON([{ role: 'system', content: system }, { role: 'user', content: user }], { signal, model: this.textModel(book) }));
      book.meta.titulo = String(raw.titulo || 'Sin título').slice(0, 140);
      book.meta.subtitulo = String(raw.subtitulo || '').slice(0, 200);
      book.meta.logline = String(raw.logline || '').slice(0, 600);
      book.meta.temas = Array.isArray(raw.temas) ? raw.temas.map(String).slice(0, 8) : [];
      book.meta.categoria = category.id;
      addCredits(book, teamForPhase(category, 'concepto'), 'concepto');
      this.log(book, 'Concepto forjado: "' + book.meta.titulo + '" — ' + book.meta.logline);
      await this.persist(book);
    }

    /* ---------- 2. BIBLIA ---------- */
    if (!book.biblia.mundo) {
      this.setPhase(book, 'biblia');
      const { system, user } = buildBiblePrompt(book.brief, book.meta, assets);
      const raw = await this.retry(book, 'Biblia', () => this.client.chatJSON([{ role: 'system', content: system }, { role: 'user', content: user }], { signal, model: this.textModel(book) }));
      book.biblia.mundo = String(raw.mundo || '');
      book.biblia.era = String(raw.era || '');
      book.biblia.reglas = Array.isArray(raw.reglas) ? raw.reglas.map(String) : [];
      book.biblia.tonoVisualEn = String(raw.tono_visual_en || '');
      book.biblia.paletaEn = String(raw.paleta_en || '');
      book.biblia.cronologia = Array.isArray(raw.cronologia) ? raw.cronologia : [];
      addCredits(book, teamForPhase(category, 'biblia'), 'biblia');
      this.log(book, 'Biblia construida. Mundo listo con ' + book.biblia.reglas.length + ' reglas duras.');
      await this.persist(book);
    }

    /* ---------- 3. PERSONAJES ---------- */
    if (!book.personajes.length) {
      this.setPhase(book, 'personajes');
      const { system, user } = buildCharactersPrompt(book.brief, book.meta, book.biblia, assets);
      const raw = await this.retry(book, 'Personajes', () => this.client.chatJSON([{ role: 'system', content: system }, { role: 'user', content: user }], { signal, model: this.textModel(book) }));
      book.personajes = (Array.isArray(raw.personajes) ? raw.personajes : []).map((c, i) => ({
        id: 'chr_' + (i + 1),
        nombre: String(c.nombre || 'Personaje ' + (i + 1)).slice(0, 80),
        rol: String(c.rol || 'secundario'),
        edad: String(c.edad || ''),
        aparienciaEn: String(c.apariencia_en || ''),
        vestuarioEn: String(c.vestuario_en || ''),
        rasgoDistintivoEn: String(c.rasgo_distintivo_en || ''),
        personalidad: String(c.personalidad || ''),
        voz: String(c.voz || ''),
        herida: String(c.herida || ''),
        deseo: String(c.deseo || ''),
        necesita: String(c.necesita || ''),
        arco: String(c.arco || ''),
        assetId: null,
      }));
      // El canon del autor manda: los personajes subidos por el usuario se casan por nombre
      for (const chr of book.personajes) {
        const asset = assets.find(
          (a) => a.tipo === 'personaje' && a.nombre.toLowerCase() === chr.nombre.toLowerCase()
        );
        if (asset) {
          chr.assetId = asset.id;
          if (asset.aparienciaEn) chr.aparienciaEn = asset.aparienciaEn;
          if (asset.vestuarioEn) chr.vestuarioEn = asset.vestuarioEn;
          if (asset.rasgoDistintivoEn) chr.rasgoDistintivoEn = asset.rasgoDistintivoEn;
          this.log(book, 'Canon del autor vinculado: ' + chr.nombre);
        }
      }
      addCredits(book, teamForPhase(category, 'personajes'), 'personajes');
      this.log(book, 'Elenco diseñado: ' + book.personajes.map((c) => c.nombre).join(', '));
      await this.persist(book);
    }

    /* ---------- 4. ESQUEMA ---------- */
    if (!book.chapters.length) {
      this.setPhase(book, 'esquema');
      const wantFixed = book.brief.capitulos.modo === 'fijo';
      const wantCount = book.brief.capitulos.cantidad;
      let attempt = 0, raw = null;
      for (;;) {
        const { system, user } = buildOutlinePrompt(book.brief, book.meta, book.biblia, book.personajes, assets);
        raw = await this.retry(book, 'Esquema', () => this.client.chatJSON([{ role: 'system', content: system }, { role: 'user', content: user }], { signal, model: this.textModel(book) }));
        book.chapters = normalizeOutline(raw);
        attempt++;
        if (!wantFixed) break;
        if (book.chapters.length === wantCount) break;
        if (attempt >= 3) {
          this.log(book,
            'Aviso: se pidieron ' + wantCount + ' capítulos y el modelo devolvió ' + book.chapters.length +
            '. Se ajusta el esquema automáticamente.', 'warn');
          break;
        }
        this.log(book, 'Reajuste de esquema: pedidos ' + wantCount + ', recibidos ' + book.chapters.length + '. Se vuelve a pedir con precisión…', 'warn');
      }
      // Ajuste determinista del número exacto
      if (wantFixed && book.chapters.length !== wantCount) {
        while (book.chapters.length > wantCount) book.chapters.pop();
        while (book.chapters.length < wantCount) {
          const base = book.chapters[book.chapters.length - 1] || null;
          const n = book.chapters.length + 1;
          book.chapters.push({
            id: 'cap_auto_' + n,
            numero: n,
            titulo: 'Capítulo ' + n,
            proposito: 'Desarrollo y convergencia hacia el clímax.',
            sinopsis: base ? 'Las consecuencias de "' + base.titulo + '" empujan la historia un paso más allá.' : 'La historia avanza.',
            latidoEmocional: 'Tensión creciente',
            cliffhanger: 'Una nueva revelación lo cambia todo',
            escenarios: [], personajesClave: [],
            esPuntoMedio: false, esClimax: false,
            paragraphs: [], escrito: false,
            impacto: { aplicado: false },
          });
        }
      }
      book.chapters.forEach((c, i) => { c.numero = i + 1; });
      addCredits(book, teamForPhase(category, 'esquema'), 'esquema');
      this.log(book, 'Esquema cerrado: ' + book.chapters.length + ' capítulos.');
      await this.persist(book);
    }

    /* ---------- 5+6. ESCRITURA E IMPACTO (capítulo a capítulo) ---------- */
    const keyIdx = new Set(keyChapterIndexes(book.chapters.length));
    this.setPhase(book, 'escritura');

    for (let i = 0; i < book.chapters.length; i++) {
      if (signal.aborted) throw new Error('Cancelado');
      // Modo previsualización: solo el capítulo 1; el resto espera al visto bueno
      if (book.brief.preview && i >= 1) {
        this.log(book, 'Previsualización lista: capítulo 1 de ' + book.chapters.length +
          '. Revísalo en el lector y pulsa "Continuar forja completa" para el resto.');
        break;
      }
      const chapter = book.chapters[i];

      if (!chapter.escrito) {
        const { system, user } = buildChapterPrompt(book, i);
        const raw = await this.retry(book, 'Capítulo ' + chapter.numero + ' — escritura', () => this.client.chatJSON([{ role: 'system', content: system }, { role: 'user', content: user }], { signal, model: this.textModel(book) }));
        const norm = normalizeChapter(raw, chapter, book.brief.parrafosPorCapitulo);
        chapter.titulo = norm.titulo;
        chapter.paragraphs = norm.paragraphs;
        chapter.cliffhanger = norm.cliffhanger;
        chapter.escrito = true;
        this.log(book, 'Capítulo ' + chapter.numero + ' escrito: "' + chapter.titulo + '" (' + chapter.paragraphs.length + ' párrafos).');
        addCredits(book, teamForPhase(category, 'escritura'), 'escritura');
        await this.persist(book);
      }

      // Pase de impacto solo en capítulos clave
      if (book.brief.pases.impacto && !chapter.impacto.aplicado && keyIdx.has(i)) {
        const { system, user } = buildImpactPrompt(book, i);
        try {
          const raw = await this.retry(book, 'Impacto cap. ' + chapter.numero, () => this.client.chatJSON([{ role: 'system', content: system }, { role: 'user', content: user }], { signal, model: this.textModel(book) }));
          const norm = normalizeChapter(raw, chapter, chapter.paragraphs.length || book.brief.parrafosPorCapitulo);
          if (norm.paragraphs.length === chapter.paragraphs.length && norm.paragraphs.every((p) => p.texto)) {
            norm.paragraphs.forEach((np, j) => {
              const target = chapter.paragraphs[j];
              target.texto = np.texto;
              target.rol = np.rol;
              target.personajesPresentes = np.personajesPresentes;
              target.lugar = np.lugar;
              target.momentoDia = np.momentoDia;
            });
            // el título del esquema es contrato estructural: el pase de impacto no renombra
            chapter.cliffhanger = norm.cliffhanger;
          }
          chapter.impacto.aplicado = true;
          this.log(book, 'Pase de impacto aplicado al capítulo ' + chapter.numero + ' (' + teamForPhase(category, 'impacto').map((s) => s.nombre).join(' · ') + ').');
          addCredits(book, teamForPhase(category, 'impacto'), 'impacto');
        } catch (e) {
          if (signal.aborted) throw e;
          this.log(book, 'El pase de impacto del capítulo ' + chapter.numero + ' falló y se conserva la versión actual: ' + e.message, 'warn');
        }
        await this.persist(book);
      }

      book.progress.chaptersDone = i + 1;
      this.bus.emit('chapter', { bookId: book.id, idx: i, titulo: chapter.titulo, done: true });
    }

    computeStats(book);
  }

  /** Re-forja un único capítulo ya escrito (desde el lector). */
  async reforgeChapter(book, chapterIdx) {
    this.ctl = new AbortController();
    const signal = this.ctl.signal;
    const chapter = book.chapters[chapterIdx];
    if (!chapter) throw new Error('Capítulo inexistente');
    chapter.escrito = false;
    chapter.impacto.aplicado = false;
    const savedStatus = book.status;
    book.status = 'generando';
    this.log(book, 'Re-forjando el capítulo ' + chapter.numero + '…');
    try {
      await this.preflight(book, signal);
      const category = getCategory(book.brief.categoryId);
      const keyIdx = new Set(keyChapterIndexes(book.chapters.length));

      const { system, user } = buildChapterPrompt(book, chapterIdx);
      const raw = await this.retry(book, 'Re-forja cap. ' + chapter.numero, () => this.client.chatJSON([{ role: 'system', content: system }, { role: 'user', content: user }], { signal, model: this.textModel(book) }));
      const norm = normalizeChapter(raw, chapter, book.brief.parrafosPorCapitulo);
      chapter.titulo = norm.titulo;
      chapter.paragraphs = norm.paragraphs;
      chapter.cliffhanger = norm.cliffhanger;
      chapter.escrito = true;
      this.log(book, 'Capítulo ' + chapter.numero + ' reescrito.');
      await this.persist(book);

      if (book.brief.pases.impacto && keyIdx.has(chapterIdx)) {
        try {
          const imp = buildImpactPrompt(book, chapterIdx);
          const rawImp = await this.retry(book, 'Impacto cap. ' + chapter.numero, () => this.client.chatJSON([{ role: 'system', content: imp.system }, { role: 'user', content: imp.user }], { signal, model: this.textModel(book) }));
          const normImp = normalizeChapter(rawImp, chapter, chapter.paragraphs.length);
          if (normImp.paragraphs.length === chapter.paragraphs.length) {
            normImp.paragraphs.forEach((np, j) => Object.assign(chapter.paragraphs[j], {
              texto: np.texto, rol: np.rol, personajesPresentes: np.personajesPresentes,
              lugar: np.lugar, momentoDia: np.momentoDia,
            }));
          }
          chapter.impacto.aplicado = true;
          this.log(book, 'Pase de impacto re-aplicado al capítulo ' + chapter.numero + '.');
        } catch (e) { this.log(book, 'Impacto del cap. ' + chapter.numero + ' omitido: ' + e.message, 'warn'); }
        await this.persist(book);
      }

      computeStats(book);
      book.status = savedStatus === 'listo' ? 'listo' : book.status;
      await this.persist(book);
      return chapter;
    } catch (e) {
      book.status = 'pausado';
      await this.persist(book);
      throw e;
    } finally {
      this.ctl = null;
    }
  }

  textModel(book) { return book?.brief?.modelos?.texto || this._runTextModel || undefined; }

  /** Comprobación de vuelo: clave presente y servicio de escritura accesible.
   *  Si el modelo preferido está caído, resuelve un respaldo para toda la corrida. */
  async preflight(book, signal) {
    const key = (this.client.cfg().nvApiKey || '').trim();
    if (!key) {
      throw new Error('Falta la clave de NVIDIA (nvapi-…): consíguela gratis en build.nvidia.com y pégala en Ajustes. Sin ella la forja no puede encender.');
    }
    this.log(book, 'Verificando conexión con la API de NVIDIA…');
    const resuelto = await this.retry(book, 'Conexión', () =>
      this.client.resolveTextModel(this.textModel(book)));
    this._runTextModel = resuelto.model;
    this.log(book, 'Conexión OK. Escribiendo con ' + resuelto.model +
      (resuelto.switched ? ' (respaldo activo: el modelo principal está caído en NVIDIA ahora mismo).' : ' — el estudio responde.') );
  }
}
