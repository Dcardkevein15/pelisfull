/* imagegen.mjs — fábrica de paneles: generar → QA → re-dibujo correctivo. */

import { buildPanelPrompt } from '../prompts/images.mjs';
import { refsForParagraph, panelsAspectFor } from '../domain/continuity.mjs';
import { imageModelInfo } from '../api/models.mjs';
import { blobToDataURL } from '../core/utils.mjs';
import { qaEnabledFor, reviewPanel, softenScene, QA_MAX_REGENS } from './panelqa.mjs';

async function withConcurrency(items, limit, worker) {
  const queue = items.map((item, i) => ({ item, i }));
  const runners = Math.max(1, Math.min(limit, queue.length));
  await Promise.all(Array.from({ length: runners }, async () => {
    for (;;) { const next = queue.shift(); if (!next) return; await worker(next.item, next.i); }
  }));
}

function hojasForParagraph(book, para, hojasByCharId) {
  const out = [];
  for (const nombre of para.personajesPresentes || []) {
    const ch = (book.personajes || []).find((c) => c.nombre.toLowerCase() === String(nombre).toLowerCase());
    if (ch && hojasByCharId?.[ch.id]) out.push({ nombre: ch.nombre, dataURL: hojasByCharId[ch.id] });
    if (out.length >= 3) break;
  }
  return out;
}

function anchorForParagraph(book, para, assetsById, hojasByCharId) {
  for (const nombre of para.personajesPresentes || []) {
    const ch = (book.personajes || []).find((c) => c.nombre.toLowerCase() === String(nombre).toLowerCase());
    if (!ch) continue;
    if (ch.assetId && assetsById?.[ch.assetId]?.dataURL) return { nombre: ch.nombre, dataURL: assetsById[ch.assetId].dataURL };
    if (hojasByCharId?.[ch.id]) return { nombre: ch.nombre, dataURL: hojasByCharId[ch.id] };
  }
  return null;
}

export async function generateChapterPanels(p) {
  const { book, chapter, client, settings, storage, bus, signal, assetsById, hojasByCharId, onPanelDone } = p;
  const hojas = hojasByCharId || {};
  const imageModel = book.brief.modelos?.imagen || settings.imageModel || client.cfg().imageModel;
  const baseAspect = book.brief.modelos?.aspecto || settings.imageAspect || client.cfg().imageAspect || '16:9';
  const concurrency = Math.max(1, Math.min(6, Number(settings.imageConcurrency) || 3));
  const info = imageModelInfo(imageModel);
  const supportsRefs = !!info?.refs;
  const textModel = book.brief.modelos?.texto || settings.textModel || client.cfg().textModel;
  const qaOn = qaEnabledFor(settings, textModel) && typeof client.chat === 'function';

  const pending = chapter.paragraphs.filter((x) => x.panel.status !== 'ok');
  if (!pending.length) return;

  await withConcurrency(pending, concurrency, async (para) => {
    if (signal?.aborted) return;
    const anchor = supportsRefs ? anchorForParagraph(book, para, assetsById, hojas) : null;
    const refNombre = anchor ? anchor.nombre : null;
    const built = buildPanelPrompt(book, chapter, para, para.panelVisual || null, { refNombre });
    const aspect = panelsAspectFor(baseAspect, built.peso, built.camera.id);
    const refs = supportsRefs ? (anchor ? [anchor.dataURL] : refsForParagraph(book, para, assetsById || {}, hojas)) : [];

    para.panel.status = 'generando';
    para.panel.prompt = built.prompt;
    para.panel.camera = built.camera.id;
    para.panel.error = null;
    bus?.emit('panel', { bookId: book.id, chapterIdx: chapter.numero - 1, paraIdx: para.idx, status: 'generando' });

    try {
      const result = await forgePanel({ book, chapter, para, client, built, aspect, refs, refNombre, negative: built.negative, imageModel, qaOn, textModel, hojas: hojasForParagraph(book, para, hojas), signal });
      para.panel.version++;
      const key = book.id + ':' + chapter.id + ':' + para.id + ':v' + para.panel.version;
      await storage.putImage(key, result.blob);
      para.panel.imageKey = key;
      para.panel.seed = result.seed;
      para.panel.model = imageModel;
      para.panel.status = 'ok';
      para.panel.error = null;
      para.panel.qa = result.qa;
      bus?.emit('panel', { bookId: book.id, chapterIdx: chapter.numero - 1, paraIdx: para.idx, status: 'ok' });
    } catch (e) {
      if (signal?.aborted) { para.panel.status = 'pendiente'; return; }
      para.panel.status = 'error';
      para.panel.error = String(e.message || e).slice(0, 300);
      bus?.emit('panel', { bookId: book.id, chapterIdx: chapter.numero - 1, paraIdx: para.idx, status: 'error', error: para.panel.error });
    }
    onPanelDone?.(para);
  });
}

async function forgePanel({ book, chapter, para, client, built, aspect, refs, refNombre, negative, imageModel, qaOn, textModel, hojas, signal }) {
  let prompt = built.prompt;
  let seed = built.seed;
  let blob = null;
  let softened = false;

  for (let regen = 0; regen <= QA_MAX_REGENS; regen++) {
    for (;;) {
      try {
        blob = await client.generateImage({ prompt, negative, model: imageModel, aspect, seed, refs, signal });
        break;
      } catch (e) {
        if (signal?.aborted) throw e;
        const msg = String(e?.message || e);
        if (!softened && /CONTENT_FILTERED/i.test(msg)) {
          softened = true;
          try {
            const soft = await softenScene({ client, escena: para.panelVisual?.escena_en || para.escenaEn || '', accion: para.panelVisual?.accion_en || para.accionEn || '', textModel, signal });
            if (para.panelVisual) { para.panelVisual.escena_en = soft.escena_en; para.panelVisual.accion_en = soft.accion_en; }
            else { para.escenaEn = soft.escena_en; para.accionEn = soft.accion_en; }
            const rebuilt = buildPanelPrompt(book, chapter, para, para.panelVisual || null, { refNombre });
            prompt = rebuilt.prompt;
            seed = (seed + 104729) % 2147483647;
            continue;
          } catch (softErr) {
            throw new Error('Filtro de seguridad + reintento suavizado falló: ' + String(softErr.message || softErr).slice(0, 140));
          }
        }
        throw e;
      }
    }
    if (!qaOn) return { blob, seed, qa: { ok: true, issues: [] } };
    const dataURL = await blobToDataURL(blob);
    const qa = await reviewPanel({ client, dataURL, book, para, hojas, textModel, signal });
    if (qa.ok) return { blob, seed, qa };
    if (regen < QA_MAX_REGENS) {
      const corrected = buildPanelPrompt(book, chapter, para, para.panelVisual || null, { correction: qa.issues.join('; '), refNombre });
      prompt = corrected.prompt;
      seed = (seed + 101 * (regen + 1)) % 2147483647;
    }
  }
  return { blob, seed, qa: { ok: true, issues: [] } };
}

export async function regeneratePanel(p) {
  const { book, chapter, para, client, settings, storage, bus, signal, cameraId, usePreviousAsRef } = p;
  const imageModel = book.brief.modelos?.imagen || settings.imageModel || client.cfg().imageModel;
  const baseAspect = book.brief.modelos?.aspecto || settings.imageAspect || client.cfg().imageAspect || '16:9';
  const info = imageModelInfo(imageModel);
  let previousDataURL = null;
  if (usePreviousAsRef && para.panel.imageKey && info) {
    try { const blob = await storage.getImage(para.panel.imageKey); if (blob) previousDataURL = await blobToDataURL(blob); } catch {}
  }
  const opts = cameraId ? { cameraId } : {};
  const { prompt, negative, camera, seed, peso } = buildPanelPrompt(book, chapter, para, para.panelVisual || null, opts);
  const aspect = panelsAspectFor(baseAspect, peso, camera.id);
  para.panel.status = 'generando';
  bus?.emit('panel', { bookId: book.id, chapterIdx: chapter.numero - 1, paraIdx: para.idx, status: 'generando' });
  const blob = await client.generateImage({
    prompt, negative, model: imageModel, aspect, seed,
    image: info?.tipo === 'kontext' ? previousDataURL : null,
    refs: info?.refs && info.tipo !== 'kontext' && previousDataURL ? [previousDataURL] : [],
    matchAspectToImage: !!previousDataURL, signal,
  });
  para.panel.version++;
  const key = book.id + ':' + chapter.id + ':' + para.id + ':v' + para.panel.version;
  await storage.putImage(key, blob);
  para.panel.imageKey = key; para.panel.seed = seed; para.panel.camera = camera.id; para.panel.model = imageModel;
  para.panel.status = 'ok'; para.panel.error = null; para.panel.qa = null;
  bus?.emit('panel', { bookId: book.id, chapterIdx: chapter.numero - 1, paraIdx: para.idx, status: 'ok' });
  return para.panel;
}
