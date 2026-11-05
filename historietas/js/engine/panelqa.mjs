/* panelqa.mjs — el Guardián Visual: QA por visión (fail-open) + anti-filtro. */

import { extractJSON } from '../api/client.mjs';
import { dnaLine } from '../domain/continuity.mjs';
import { truncate } from '../core/utils.mjs';

export const QA_MAX_REGENS = 1;

export function qaEnabledFor(settings, textModel) {
  if (settings?.panelQa === false) return false;
  return true;
}

export async function reviewPanel({ client, dataURL, book, para, hojas = [], textModel, signal } = {}) {
  try {
    if (!dataURL) return { ok: true, issues: [] };
    const presentes = (para.personajesPresentes || []).map((n) => (book.personajes || []).find((c) => c.nombre.toLowerCase() === String(n).toLowerCase())).filter(Boolean);
    const dna = presentes.map((c) => '- ' + dnaLine(c)).join('\n');
    const escena = para.panelVisual?.escena_en || para.escenaEn || '';
    const accion = para.panelVisual?.accion_en || para.accionEn || '';
    const instruction = [
      'FICHA DE PRODUCCIÓN DEL PANEL:', 'Scene: ' + truncate([escena, accion].filter(Boolean).join(' — '), 400),
      presentes.length ? 'Personajes (diseño canónico):\n' + dna : 'Sin personajes.',
      'Inspecciona LA PRIMERA imagen' + (hojas.length ? ' (la siguiente es su retrato canónico de referencia)' : '') + ':',
      '1. ¿Texto, letras o globos pintados? 2. ¿Cara/vestuario idénticos al canon? 3. ¿Escena refleja el párrafo? 4. ¿Anatomía correcta?',
      'Devuelve ÚNICAMENTE JSON: {"ok": true|false, "issues": ["solo si ok=false"]}',
    ].join('\n');
    const raw = await client.chat([
      { role: 'system', content: 'Eres el GUARDIÁN VISUAL de un estudio de cómic. Respondes ÚNICAMENTE JSON válido.' },
      { role: 'user', content: [{ type: 'text', text: instruction }, { type: 'image_url', image_url: { url: dataURL } }, ...hojas.filter((h) => h?.dataURL).slice(0, 3).map((h) => ({ type: 'image_url', image_url: { url: h.dataURL } })) ] },
    ], { temperature: 0.1, maxTokens: 700, signal, model: textModel });
    const parsed = extractJSON(raw);
    if (!parsed || typeof parsed !== 'object') return { ok: true, issues: [] };
    const issues = (Array.isArray(parsed.issues) ? parsed.issues : []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 5);
    return { ok: !(parsed.ok === false && issues.length > 0), issues };
  } catch { return { ok: true, issues: [] }; }
}

export async function softenScene({ client, escena, accion, textModel, signal } = {}) {
  const raw = await client.chat([
    { role: 'system', content: 'Eres director de arte. Respondes ÚNICAMENTE JSON válido.' },
    { role: 'user', content: ['La siguiente escena fue rechazada por el filtro de seguridad. REESCRÍBELA en inglés manteniendo la acción SIN gore explícito, desnudez o violencia gráfica.', 'Scene: ' + truncate(escena, 400), 'Action: ' + truncate(accion, 300), 'Devuelve ÚNICAMENTE JSON: {"escena_en": "...", "accion_en": "..."}'].join('\n') },
  ], { temperature: 0.3, maxTokens: 600, signal, model: textModel });
  const parsed = extractJSON(raw);
  if (!parsed?.escena_en && !parsed?.accion_en) throw new Error('reescritura sin JSON');
  return { escena_en: String(parsed.escena_en || escena || ''), accion_en: String(parsed.accion_en || accion || '') };
}
