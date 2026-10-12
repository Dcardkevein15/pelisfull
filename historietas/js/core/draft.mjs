/* draft.mjs — persistencia del borrador del asistente (Nueva historia).
   Extraída a módulo propio para ser testeable en Node con un storage simulado.
   En el navegador usa localStorage; nunca rompe la app si el almacenamiento falla. */

const DRAFT_KEY = 'historietas.wizard-draft.v1';

function storageOrDefault(storage) {
  if (storage) return storage;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { /* entorno sin localStorage (tests sin shim) */ }
  return null;
}

/** Campos del estado del asistente que componen el borrador. */
export const DRAFT_FIELDS = [
  'step', 'categoryId', 'premisa', 'titulo', 'publico', 'tono', 'pov', 'era', 'notas',
  'final', 'idioma', 'extensionParrafo', 'intensidad', 'capitulos', 'parrafosPorCapitulo', 'pases', 'modelos', 'fuente', 'origen',
  'digests', 'preview', 'portada',
];

export function saveWizardDraft(state, storage) {
  const s = storageOrDefault(storage);
  if (!s) return false;
  try {
    const data = {};
    for (const k of DRAFT_FIELDS) data[k] = state ? state[k] : undefined;
    s.setItem(DRAFT_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false; // sin espacio o storage roto: el asistente funciona sin borrador
  }
}

export function loadWizardDraft(storage) {
  const s = storageOrDefault(storage);
  if (!s) return null;
  try {
    const raw = s.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null; // JSON corrupto: se empieza de cero sin romper
  }
}

export function clearWizardDraft(storage) {
  const s = storageOrDefault(storage);
  if (!s) return;
  try { s.removeItem(DRAFT_KEY); } catch { /* nada */ }
}

/** ¿El borrador tiene contenido digno de restaurar? */
export function draftHasContent(draft) {
  return !!(draft && (draft.origen || draft.categoryId || draft.premisa || (draft.step || 1) > 1));
}
