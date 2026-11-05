/* images.mjs — constructor de prompts de panel (una imagen por párrafo).
   ANTI-GEMELAS: la escena SIEMPRE salió del párrafo y DOMINA el prompt.
   Presupuesto 800 chars con degradación por niveles (ADN jamás cae). */

import { styleCoreFor, paletteFor, dnaLine, dnaLineCore, seedForPanel, cameraFor, shot, panelPeso, refsForParagraph } from '../domain/continuity.mjs';
import { getCategory } from '../specialists/registry.mjs';
import { ensamblarPanel } from './budget.mjs';

export const NEGATIVE_BASE =
  'text, letters, words, watermark, signature, logo, speech bubbles, subtitles, extra limbs, extra fingers, deformed hands, blurry, low quality, jpeg artifacts, inconsistent character design, changed outfit, different face, cropped heads';

export const AVOID_LINE =
  'Strictly avoided anywhere in the image: text, letters, words, speech bubbles, captions, watermarks, logos, signatures, extra fingers, deformed hands, changed faces or wardrobe.';

/**
 * Construye el prompt final de un panel (la escena domina; ADN prioritario).
 */
export function buildPanelPrompt(book, chapter, para, panelVisual, opts = {}) {
  const category = getCategory(book.brief.categoryId) || { visual: {} };
  const K = chapter.paragraphs.length;

  const camera = opts.cameraId
    ? shot(opts.cameraId)
    : cameraFor(chapter.numero - 1, para.idx, K, panelVisual?.encuadre || para.encuadreSugerido, para.rol);

  const escena = panelVisual?.escena_en || para.escenaEn || '';
  const accion = panelVisual?.accion_en || para.accionEn || '';
  const lugar = panelVisual?.lugar_en || para.lugar || '';
  const momento = panelVisual?.momento_dia || para.momentoDia || '';
  const climaLuz = panelVisual?.clima_luz || '';
  const mood = panelVisual?.mood || '';
  const peso = panelPeso(para, K);

  const presentes = (para.personajesPresentes || [])
    .map((n) => (book.personajes || []).find(
      (c) => c.nombre.toLowerCase() === String(n).toLowerCase()
    ))
    .filter(Boolean);
  const dnaLines = presentes.map((c) => dnaLineCore(c));

  const style = [
    styleCoreFor(category),
    book.biblia.tonoVisualEn ? 'overall style: ' + book.biblia.tonoVisualEn : '',
    paletteFor(category, book.biblia),
  ].filter(Boolean).join(', ');

  const prompt = ensamblarPanel({
    refLine: opts.refNombre
      ? 'The attached reference image shows ' + opts.refNombre + ': reproduce their EXACT identical face, hair and features; keep them on-model in this panel.'
      : '',
    style,
    quality: 'Masterful graphic-novel art: expressive character acting, richly painted textures, dramatic staging, detailed environment that tells the story.',
    panelLine: peso === 2 ? 'Wide cinematic splash panel with sweeping composition.' : 'Single coherent graphic-novel panel.',
    cameraLine: 'Camera: ' + camera.en + '.',
    sceneText: [escena, accion].filter(Boolean).join(' — '),
    locationLine: lugar ? 'Location: ' + lugar + '.' : '',
    lightLine: [momento, climaLuz].filter(Boolean).length ? 'Light: ' + [momento, climaLuz].filter(Boolean).join(', ') + '.' : '',
    moodLine: mood ? 'Mood: ' + mood + '.' : '',
    dnaLines,
    correctionLine: opts.correction ? 'Art-direction correction for this redraw (fix exactly this): ' + opts.correction + '.' : '',
    avoid: AVOID_LINE,
  });

  const seed = seedForPanel(book.id, chapter.numero - 1, para.idx, para.panel?.version || 0);
  return { prompt, negative: NEGATIVE_BASE, camera, seed, peso };
}
