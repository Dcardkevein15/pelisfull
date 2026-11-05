/* store.mjs — ajustes de la app persistidos en localStorage (con guarda para Node). */

export const DEFAULT_SETTINGS = {
  nvApiKey: '',
  textModel: 'nvidia/nemotron-3.5-lightning-30b-a3b',
  imageModel: 'black-forest-labs/flux.2-klein-4b',
  transport: 'auto',
  customProxyBase: '',
  imageAspect: '16:9',
  imageConcurrency: 3,
  panelQa: true,
  parrafosPorCapitulo: 10,
  paseImpacto: true,
  guionVisual: true,
  idioma: 'es',
};

const KEY = 'historietas.settings.v1';

function canPersist() {
  try { return typeof localStorage !== 'undefined'; } catch { return false; }
}

/**
 * Auto-reparación de ajustes guardados. Se ejecuta en cada carga.
 * v3.0 (solo texto): las claves de imagen heredadas (imageModel, imageAspect,
 * imageConcurrency, panelQa, hojasPersonaje, guionVisual) se retiran porque la
 * ilustración vive en el Taller (Parte 2) con sus propios ajustes.
 */
export function migrateSettings(data) {
  if (!data || typeof data !== 'object') return data;
  for (const k of ['imageModel', 'imageAspect', 'imageConcurrency', 'panelQa', 'hojasPersonaje', 'guionVisual', 'brandingAgua']) {
    delete data[k];
  }
  // NVIDIA eliminó modelos: migrar a los actuales (lección 410 Gone)
  const deprecados = {
    'moonshotai/kimi-k3': 'nvidia/nemotron-3.5-lightning-30b-a3b',
    'moonshotai/kimi-k2.6': 'nvidia/nemotron-3.5-lightning-30b-a3b',
    'deepseek-ai/deepseek-v4-pro': 'z-ai/glm-5.3',
    'deepseek-ai/deepseek-v4.1-flash': 'z-ai/glm-5.3',
    'openai/gpt-oss-120b': 'openai/gpt-oss-20b',
    'meta/llama-3.3-70b-instruct': 'z-ai/glm-5.3',
    'nvidia/nemotron-3-super-120b-a12b': 'nvidia/nemotron-3.5-lightning-30b-a3b',
  };
  if (deprecados[data.textModel]) data.textModel = deprecados[data.textModel];
  return data;
}

export const store = {
  data: { ...DEFAULT_SETTINGS },

  load() {
    if (!canPersist()) return this.data;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...DEFAULT_SETTINGS, ...migrateSettings(JSON.parse(raw)) };
    } catch (e) { console.warn('[store] ajustes corruptos, se restauran los valores por defecto', e); }
    return this.data;
  },

  save() {
    if (!canPersist()) return;
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); }
    catch (e) { console.warn('[store] no se pudieron guardar los ajustes', e); }
  },

  get(k) { return this.data[k]; },

  set(k, v) {
    this.data[k] = v;
    this.save();
  },

  update(patch) {
    Object.assign(this.data, patch);
    this.save();
  },

  reset() {
    this.data = { ...DEFAULT_SETTINGS };
    this.save();
  },
};
