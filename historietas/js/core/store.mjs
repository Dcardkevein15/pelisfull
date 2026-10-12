/* store.mjs — ajustes de la app persistidos en localStorage (con guarda para Node). */

export const DEFAULT_SETTINGS = {
  nvApiKey: '',
  textModel: 'moonshotai/kimi-k3',
  transport: 'auto',            // auto | bridge | proxy | direct | custom
  customProxyBase: '',           // p. ej. http://localhost:9130/proxy
  parrafosPorCapitulo: 10,       // 6..14
  paseImpacto: true,            // segunda pasada en capítulos clave
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
