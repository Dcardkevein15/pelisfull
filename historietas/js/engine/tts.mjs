/* tts.mjs — lector de voz del libro: narración realista con karaoke palabra a
   palabra y memoria de lectura.
   Motor: voces neuronales del propio navegador (Web Speech API). Razones:
   - INSTANTÁNEA: cero latencia de red, no gasta créditos de la API.
   - SÚPER REALISTA: en Edge/Chrome las voces "Online (Natural)" de Microsoft
     (y las Google) son redes neuronales de producción, indistinguibles de
     una narración humana; se elige la mejor automáticamente y se puede
     cambiar a mano (selector de voz + velocidad en el lector).
   - KARAOKE: los eventos de frontera de palabra permiten pintar de amarillo
     el texto a medida que se lee.
   Defensas: troceo por frases (bug de Chrome con utterances largas), reanudación
   tras pausa con reinicio de respaldo, y guardas para Node/tests (sin
   speechSynthesis el módulo se importa sin romper). */

import { sleep } from '../core/utils.mjs';

const PROGRESS_KEY = 'historietas.tts.progress.v1';
const PREFS_KEY = 'historietas.tts.prefs.v1';

export function ttsSupported() {
  try { return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'; }
  catch { return false; }
}

/* ---------------- voces ---------------- */

function voiceScore(v, lang) {
  const name = String(v?.name || '').toLowerCase();
  const vlang = String(v?.lang || '').toLowerCase().replace('_', '-');
  const want = String(lang || 'es').toLowerCase();
  let langScore = 0;
  if (vlang.startsWith(want)) langScore = 40;
  else if (vlang.startsWith(want.split('-')[0])) langScore = 20;
  let s = langScore;
  // las neuronales/online son las realistas: máxima prioridad
  if (/online \(natural\)|online natural|neural/.test(name)) s += 50;
  else if (/\(natural\)|natural\b/.test(name)) s += 30;
  else if (/google/.test(name)) s += 18;
  else if (/microsoft/.test(name)) s += 8;
  if (v?.localService === false) s += 6; // las online suelen sonar mejor
  // penalizar las rotófonas clásicas del SO
  if (/compact|espeak|festival/.test(name)) s -= 25;
  return { total: s, lang: langScore };
}

/** Ranking de voces narradoras (inyectable — producción: las del navegador).
 *  Una voz que ni siquiera habla el idioma del libro queda FUERA por muy
 *  bonita que suene: narrar en la lengua equivocada no sirve. */
export function rankVoices(voices, lang) {
  return [...(voices || [])]
    .map((v) => ({ v, ...voiceScore(v, lang) }))
    .filter((x) => x.lang > 0 && x.total > 0)
    .sort((a, b) => b.total - a.total)
    .map((x) => x.v);
}

/** Voces narradoras ordenadas de mejor a peor para el idioma del libro. */
export function listNarratorVoices(lang) {
  if (!ttsSupported()) return [];
  try { return rankVoices(speechSynthesis.getVoices(), lang); }
  catch { return []; }
}

/** La mejor voz para un idioma (o null si no hay ninguna). */
export function pickBestVoice(lang) {
  return listNarratorVoices(lang)[0] || null;
}

/** Resuelve una voz por nombre (para restaurar la preferencia del usuario). */
export function findVoiceByName(nombre, lang) {
  if (!nombre) return null;
  return listNarratorVoices(lang).find((v) => v.name === nombre) || null;
}

/** Espera a que el navegador publique su lista de voces (llega async). */
export async function waitForVoices(timeoutMs = 1500) {
  if (!ttsSupported()) return [];
  if (speechSynthesis.getVoices().length) return speechSynthesis.getVoices();
  await new Promise((resolve) => {
    const t = setTimeout(resolve, timeoutMs);
    try {
      speechSynthesis.addEventListener('voiceschanged', () => { clearTimeout(t); resolve(); }, { once: true });
    } catch { clearTimeout(t); resolve(); }
  });
  try { return speechSynthesis.getVoices(); } catch { return []; }
}

/* ---------------- troceo de texto ---------------- */

/**
 * Parte un párrafo en frases narrables con su offset absoluto.
 * Chrome corta las utterances largas: troceamos por puntuación natural
 * (~≤230 caracteres) y encolamos; el karaoke suma el offset de cada trozo.
 * Invariante: t.slice(c.offset, c.offset + c.text.length) === c.text — los
 * offsets siempre apuntan exactamente al texto del trozo.
 * @returns {[{ offset: number, text: string }]}
 */
export function splitNarration(text) {
  const t = String(text || '');
  const out = [];
  const cortes = [];
  for (let i = 0; i < t.length - 1; i++) {
    if (t[i] === '\n') { cortes.push(i + 1); continue; }
    if (/[.!?…;:»”"')\]]/.test(t[i]) && /\s/.test(t[i + 1])) cortes.push(i + 1);
  }
  cortes.push(t.length);
  let prev = 0;
  for (const fin of cortes) {
    const piece = t.slice(prev, fin);
    if (piece.trim().length) {
      if (piece.length <= 230) out.push({ offset: prev, text: piece.replace(/\s+$/, '') });
      else out.push(...splitLong(piece, prev));
    }
    prev = fin;
  }
  return out;
}

/** Respaldo para frases kilométricas: cortes por coma/espacio cada ~220 chars.
 *  Los espacios intermedios NUNCA se descartan del offset: viajan al frente del
 *  trozo siguiente (inofensivos para la voz) para mantener la contabilidad exacta. */
function splitLong(piece, offset) {
  const out = [];
  let rest = piece;
  let base = offset;
  while (rest.length > 230) {
    let cut = rest.lastIndexOf(', ', 220);
    if (cut < 60) cut = rest.lastIndexOf(' ', 220);
    if (cut < 30) cut = 220;
    const part = rest.slice(0, cut + 1).replace(/\s+$/, '');
    if (part.length) out.push({ offset: base, text: part });
    base += part.length;
    rest = rest.slice(part.length);
  }
  if (rest.trim().length) out.push({ offset: base, text: rest.replace(/\s+$/, '') });
  return out;
}

/* ---------------- narrador ---------------- */

/**
 * Narrador con cola de frases, pausa/reanudación robusta y offsets absolutos.
 * Inyectable para tests: { synth, utteranceCtor } — en producción usa los
 * globales del navegador.
 * Eventos: onboundary (palabra real), onchunkstart (frase arranca — permite
 * karaoke interpolado cuando la voz NO dispara boundaries), onend, onerror.
 */
export class Narrador {
  constructor({ synth, utteranceCtor, lang = 'es', voice = null, rate = 1 } = {}) {
    this.synth = synth ?? (ttsSupported() ? speechSynthesis : null);
    this.U = utteranceCtor ?? (typeof SpeechSynthesisUtterance !== 'undefined' ? SpeechSynthesisUtterance : null);
    this.lang = lang;
    this.voice = voice;
    this.rate = rate;
    this.onboundary = null; // ({ charIndex, charLength }) — offset ABSOLUTO del párrafo
    this.onchunkstart = null; // ({ charIndex }) — offset absoluto donde arranca la frase
    this.onend = null;      // terminó todo el párrafo
    this.onerror = null;
    this._queue = [];
    this._utter = null;
    this._stopped = true;
    this._cancelAt = 0;
    this._fromChar = 0;
  }

  get hablando() { return !this._stopped; }

  /** Narra `text` (opcionalmente desde un carácter concreto). Cancela lo anterior. */
  async speak(text, { fromChar = 0 } = {}) {
    if (!this.synth || !this.U) return false;
    this.stop();
    if (Date.now() - this._cancelAt < 80) await sleep(90); // Chrome: speak() pegado a cancel() se traga la voz
    this._fromChar = Number(fromChar) || 0;
    const chunks = splitNarration(String(text || '').slice(this._fromChar));
    if (!chunks.length) { this.onend?.(); return true; }
    this._queue = chunks;
    this._stopped = false;
    this._next();
    return true;
  }

  _next() {
    if (this._stopped) return;
    const chunk = this._queue.shift();
    if (!chunk) {
      this._stopped = true;
      this._utter = null;
      this.onend?.();
      return;
    }
    const u = new this.U(chunk.text);
    u.lang = this.lang;
    u.rate = this.rate;
    if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang || this.lang; }
    u.onstart = () => {
      if (this._stopped) return;
      this.onchunkstart?.({ charIndex: this._fromChar + chunk.offset });
    };
    u.onboundary = (e) => {
      if (this._stopped) return;
      this.onboundary?.({
        // ABSOLUTO: desde donde arrancó esta tanda + la frase + la palabra
        charIndex: this._fromChar + chunk.offset + (e.charIndex || 0),
        charLength: e.charLength || 0,
      });
    };
    u.onend = () => { if (!this._stopped) this._next(); };
    u.onerror = (e) => {
      if (this._stopped) return;
      this._stopped = true;
      this._utter = null;
      this.onerror?.(e);
    };
    this._utter = u;
    try { this.synth.speak(u); }
    catch (e) { this._stopped = true; this.onerror?.(e); }
  }

  pause() { try { this.synth?.pause(); } catch { /* nada */ } }

  /**
   * Reanuda. Devuelve false si el motor quedó atascado en pausa (le pasa con
   * algunas voces online): el llamante reinicia el párrafo por su último
   * carácter hablado — de ahí que la vista memorice el cursor del karaoke.
   */
  async resume() {
    if (!this.synth) return false;
    try {
      this.synth.resume();
      if (!this.synth.paused) return true;
      await sleep(600);
      return !this.synth.paused;
    } catch { return false; }
  }

  stop() {
    this._stopped = true;
    this._queue = [];
    try { this.synth?.cancel(); } catch { /* nada */ }
    this._cancelAt = Date.now();
  }
}

/* ---------------- memoria de lectura (progreso) ---------------- */

function storageOrDefault(storage) {
  if (storage) return storage;
  try { if (typeof localStorage !== 'undefined') return localStorage; } catch { /* tests */ }
  return null;
}

/**
 * Guarda por dónde va la lectura de un libro.
 * data: { paraId, chapterIdx, paraIdx, charIndex, pct, updatedAt }
 */
export function saveReadingProgress(bookId, data, storage) {
  const s = storageOrDefault(storage);
  if (!s || !bookId || !data) return false;
  try {
    const all = _readAll(s);
    all[bookId] = { ...data, updatedAt: new Date().toISOString() };
    s.setItem(PROGRESS_KEY, JSON.stringify(all));
    return true;
  } catch { return false; }
}

export function loadReadingProgress(bookId, storage) {
  const s = storageOrDefault(storage);
  if (!s || !bookId) return null;
  try {
    const all = _readAll(s);
    return all[bookId] || null;
  } catch { return null; }
}

function _readAll(s) {
  try {
    const raw = s.getItem(PROGRESS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch { return {}; }
}

/* ---------------- preferencias de voz ---------------- */

export function getTtsPrefs(storage) {
  const s = storageOrDefault(storage);
  try {
    const raw = s?.getItem(PREFS_KEY);
    const p = raw ? JSON.parse(raw) : null;
    return { voiceName: p?.voiceName || '', rate: Number(p?.rate) || 1 };
  } catch { return { voiceName: '', rate: 1 }; }
}

export function setTtsPrefs(prefs, storage) {
  const s = storageOrDefault(storage);
  if (!s) return false;
  try {
    s.setItem(PREFS_KEY, JSON.stringify({ voiceName: prefs?.voiceName || '', rate: Number(prefs?.rate) || 1 }));
    return true;
  } catch { return false; }
}
