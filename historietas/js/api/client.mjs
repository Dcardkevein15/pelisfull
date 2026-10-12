/* client.mjs — cliente NVIDIA NIM de TEXTO (OpenAI-compatible).
   v3.0: la app es SOLO TEXTO — los transportes de imagen y la generación
   visual se retiraron con la fase de paneles. El Taller de Ilustración
   (Parte 2) traerá su propio cliente cuando toque.
   - Transportes: puente Next (/historietas/api/nv), proxy local, directo o personalizado.
   - Auto-sanación: descubre el primer transporte que funciona y lo reutiliza.
   - Reintentos con backoff para 429/5xx, timeouts, cancelación por AbortSignal.
   - Extracción robusta de JSON. */

import { NVIDIA_TEXT_HOST } from './models.mjs';
import { sleep } from '../core/utils.mjs';

const TIMEOUT_TEXT_MS = 300000;

/** Respaldo ante caídas del servicio de un modelo (verificado en una caída real de Kimi). */
export const TEXT_FALLBACKS = ['nvidia/nemotron-3.5-lightning-30b-a3b', 'z-ai/glm-5.3'];

export class NvidiaClient {
  /**
   * @param {object} opts
   * @param {object} opts.settings  objeto de ajustes (store del navegador o literal en tests)
   * @param {Function} [opts.fetchImpl] fetch inyectable para tests
   * @param {object} [opts.bus] bus de eventos opcional para diagnósticos
   */
  constructor({ settings, fetchImpl, bus } = {}) {
    this.settings = settings || {};
    this.fetchImpl = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    this.bus = bus || null;
    this._working = { text: null }; // transporte cacheado
  }

  cfg() { return this.settings.data ? this.settings.data : this.settings; }

  key() {
    const k = (this.cfg().nvApiKey || '').trim();
    if (!k) throw new Error('Falta la clave NVIDIA (nvapi-…). Consíguela gratis en build.nvidia.com y pégala en Ajustes.');
    return k;
  }

  /* ---------------- transportes ---------------- */

  origin() {
    try { return typeof location !== 'undefined' ? location.origin : ''; } catch { return ''; }
  }

  textCandidates() {
    const cfg = this.cfg();
    const out = [];
    if (cfg.transport === 'direct') return [NVIDIA_TEXT_HOST];
    if (cfg.transport === 'custom' && cfg.customProxyBase) return [cfg.customProxyBase.replace(/\/+$/, '') + '/integrate.api.nvidia.com/v1'];
    if (cfg.transport === 'bridge') return [this.origin() + '/historietas/api/nv'];
    if (cfg.transport === 'proxy') return [this.origin() + '/proxy/integrate.api.nvidia.com/v1'];
    // auto
    if (cfg.customProxyBase) out.push(cfg.customProxyBase.replace(/\/+$/, '') + '/integrate.api.nvidia.com/v1');
    out.push(this.origin() + '/historietas/api/nv');
    out.push(this.origin() + '/proxy/integrate.api.nvidia.com/v1');
    out.push(NVIDIA_TEXT_HOST);
    return out;
  }

  /* ---------------- HTTP base ---------------- */

  async postJSON(url, body, { timeoutMs, signal, kind } = {}) {
    if (!this.fetchImpl) throw new Error('fetch no disponible en este entorno');
    const ctl = new AbortController();
    const onAbort = () => ctl.abort(signal?.reason);
    if (signal) {
      if (signal.aborted) throw new Error('Cancelado');
      signal.addEventListener('abort', onAbort, { once: true });
    }
    const timer = setTimeout(() => ctl.abort(new Error('Tiempo de espera agotado')), timeoutMs || 120000);
    let res;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': 'Bearer ' + this.key(),
        },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      const err = new Error(String(e?.message || e));
      err.isNetwork = true;
      err.cause = e;
      throw err;
    }
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
    if (res.status === 429 || res.status >= 500) {
      const causa = res.status === 429 ? ' — límite de peticiones' : ' — el servicio no responde (saturado o despertando)';
      const err = new Error('__retry__:' + res.status + ' ' + res.statusText + causa);
      err.status = res.status;
      throw err;
    }
    let data = null;
    try { data = await res.json(); } catch { /* respuestas sin cuerpo */ }
    if (!res.ok) {
      const err = new Error(describeApiError(res.status, data, res.statusText));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  /** POST con reintentos (429/5xx/red) probando candidatos de transporte.
   *  Si todo falla, produce un diagnóstico claro y accionable. */
  async postWithTransport(kind, urlBuilder, body, { timeoutMs, signal, retries = 3 } = {}) {
    const cands = this.textCandidates();
    const cached = this._working[kind];
    const list = cached ? [cached, ...cands.filter((c) => c !== cached)] : cands;
    const failures = [];
    for (const base of list) {
      let netFails = 0;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const out = await this.postJSON(urlBuilder(base), body, { timeoutMs, signal });
          this._working[kind] = base;
          return out;
        } catch (e) {
          if (signal?.aborted) throw new Error('Cancelado');
          if (e.isNetwork) {
            netFails++;
            this._working[kind] = null;
            if (netFails <= 1) { await sleep(900); continue; } // microcorte: un reintento rápido
            failures.push({ base, error: String(e.cause?.message || e.message).slice(0, 120) });
            break; // siguiente transporte
          }
          if (String(e.message).startsWith('__retry__:')) {
            const status = Number(String(e.message).slice(10, 13)) || 0;
            const es429 = status === 429;
            // caída de servicio (5xx): no martillar el mismo transporte — 1 reintento y siguiente
            if ((!es429 && attempt >= 1) || attempt >= retries) {
              // agotados los reintentos: queda registrado en el diagnóstico
              failures.push({ base, error: String(e.message).replace('__retry__:', '').slice(0, 120) });
              break; // siguiente transporte
            }
            await sleep(es429 ? 1600 * (attempt + 1) : 800);
            continue; // reintenta mismo transporte
          }
          if (e.status === 401 || e.status === 403 || e.status === 402) throw e; // clave inválida/sin créditos: no reintentar
          if (e.status === 404) {
            // en standalone la ruta del puente Next no existe: ruido esperable, no un fallo del modelo
            failures.push({
              base,
              error: base.includes('/historietas/api')
                ? 'ruta del puente Next no presente en este servidor (esperable en standalone)'
                : 'HTTP 404 (ruta o modelo no encontrado)',
            });
            this._working[kind] = null;
            break; // siguiente transporte
          }
          throw e;
        }
      }
    }
    throw await this.explainNetworkFailure(kind, failures);
  }

  /** Convierte un fallo total de transporte en un diagnóstico con pasos concretos. */
  async explainNetworkFailure(kind, failures) {
    const via = 'escritura';
    const detail = failures.map((f) => f.base + ' → ' + f.error).join(' | ') || 'sin detalle';
    if (typeof location !== 'undefined' && location.protocol === 'file:') {
      return new Error('La app está abierta como archivo suelto (file://) y el navegador bloquea todas las llamadas a la API. Ábrela con el servidor integrado (http://localhost:9002/historietas) o con ABRIR-HISTORIETAS.bat y recarga.');
    }
    let servidorVivo = false;
    try {
      await this.fetchImpl(this.origin() + '/historietas/api/nv/models', { method: 'GET' });
      servidorVivo = true;
    } catch { servidorVivo = false; }
    if (servidorVivo) {
      return new Error('No se pudo hablar con la API de NVIDIA (' + via + '): el servidor de la app responde, pero la API no. Revisa tu conexión a internet, la clave y los créditos en build.nvidia.com, o ejecuta el Diagnóstico en Ajustes. Detalle: ' + detail);
    }
    return new Error('El servidor que sirve la app no responde (' + via + '): arranca el servidor ("npm run dev" en Uix, puerto 9002) o abre ABRIR-HISTORIETAS.bat, recarga la página y pulsa Reanudar. Detalle: ' + detail);
  }

  /* ---------------- TEXTO ---------------- */

  /** Solo la respuesta final (content). Excluye la traza de razonamiento. */
  pureContent(data) {
    const msg = data?.choices?.[0]?.message;
    if (typeof msg?.content === 'string' && msg.content.trim()) return msg.content;
    if (Array.isArray(msg?.content)) return msg.content.map((p) => p?.text || '').join('');
    return '';
  }

  /** content → traza de razonamiento (último recurso). */
  digContent(data) {
    return this.pureContent(data) || data?.choices?.[0]?.message?.reasoning_content || '';
  }

  /** Chat con cadena de respaldo: si el servicio del modelo elegido está caído
   *  (5xx/timeout/red), se prueba el siguiente modelo en vez de congelarse. */
  async chat(messages, opts = {}) {
    const primero = opts.model || this.cfg().textModel;
    const cadena = [primero, ...TEXT_FALLBACKS.filter((m) => m !== primero)];
    let ultimoError = null;
    for (const mdl of cadena) {
      try {
        return await this.chatOnce(messages, { ...opts, model: mdl });
      } catch (e) {
        ultimoError = e;
        if (opts.signal?.aborted) throw e;
        // solo caídas del servicio prueban otro modelo; clave, créditos, límite
        // o filtro de contenido se reportan tal cual (no se disfrazan)
        if (!/50[234]|Tiempo de espera|Failed to fetch|No se pudo hablar con la API/.test(String(e.message))) throw e;
      }
    }
    throw ultimoError;
  }

  /** Un intento de chat con UN modelo concreto. */
  async chatOnce(messages, { temperature = 0.8, maxTokens = 8000, topP = 0.95, signal, model } = {}) {
    const mdl = model || this.cfg().textModel;
    const ask = (mt) =>
      this.postWithTransport('text', (base) => base.replace(/\/+$/, '') + '/chat/completions', {
        model: mdl,
        messages,
        temperature,
        top_p: topP,
        max_tokens: mt,
        stream: false,
      }, { timeoutMs: TIMEOUT_TEXT_MS, signal, retries: 3 });

    let data = await ask(maxTokens);
    let out = this.pureContent(data);
    if (!out) {
      // Peculiaridad documentada de los modelos de razonamiento (p. ej. Kimi K3):
      // con presupuestos de tokens altos devuelven content vacío y solo razonan.
      // Reintento acotado — patrón ya probado en el ecosistema (director/providers.js).
      data = await ask(4096);
      out = this.pureContent(data);
    }
    if (!out) {
      // Último recurso: la traza de razonamiento suele contener el borrador con el JSON.
      out = data?.choices?.[0]?.message?.reasoning_content || '';
    }
    if (!out) throw new Error('El modelo "' + mdl + '" no devolvió texto. Revisa Ajustes → Diagnóstico.');
    return out;
  }

  /** Ping mínimo a un modelo: ¿el servicio responde? (sin cadena de respaldo). */
  async healthCheck(model) {
    const mdl = model || this.cfg().textModel;
    try {
      await this.chatOnce([{ role: 'user', content: 'Responde solo LISTO' }], { model: mdl, maxTokens: 40, temperature: 0 });
      return { ok: true, model: mdl };
    } catch (e) {
      return { ok: false, model: mdl, error: String(e.message || e).slice(0, 200) };
    }
  }

  /** Resuelve el modelo de texto usable AHORA: el preferido si responde, si no, el respaldo. */
  async resolveTextModel(preferido) {
    const cadena = [preferido || this.cfg().textModel, ...TEXT_FALLBACKS.filter((m) => m !== preferido)];
    const estados = [];
    for (const m of cadena) {
      const r = await this.healthCheck(m);
      estados.push(r);
      if (r.ok) {
        return { model: r.model, switched: r.model !== cadena[0], estados };
      }
    }
    throw new Error('Ningún modelo de escritura responde (' + cadena.join(', ') + '): parece una caída general del servicio de NVIDIA — espera unos minutos. Detalle: ' + (estados[0]?.error || 'sin detalle'));
  }

  /** Chat con respuesta obligatoriamente JSON. Rescate + reintento correctivo. */
  async chatJSON(messages, opts = {}) {
    const maxTokens = opts.maxTokens || 12000;
    const salvage = (txt) => extractJSON(txt) ?? rescueJSON(txt);

    const first = await this.chat(messages, { ...opts, maxTokens, temperature: opts.temperature ?? 0.7 });
    let parsed = salvage(first);
    if (parsed !== null) return parsed;

    const repair = [...messages,
      { role: 'user', content: 'Tu respuesta anterior no era un JSON válido: estaba mal formado, incompleto (se cortó), o tenía texto alrededor. Responde AHORA únicamente con el JSON pedido y COMPLETO: sin markdown, sin explicaciones, sin razonamiento, más compacto, empezando directamente por { o [. JSON:' }];
    const second = await this.chat(repair, { ...opts, maxTokens, temperature: 0.4 });
    parsed = salvage(second);
    if (parsed === null) throw new Error('El modelo no devolvió JSON válido tras dos intentos.');
    return parsed;
  }

  /* ---------------- DIAGNÓSTICO ---------------- */

  async test() {
    const t0 = Date.now();
    const out = { text: null };
    try {
      const txt = await this.chat([{ role: 'user', content: 'Responde solo: LISTO' }], { maxTokens: 300, temperature: 0 });
      out.text = { ok: true, ms: Date.now() - t0, msg: String(txt).trim().slice(0, 60) };
    } catch (e) {
      out.text = { ok: false, ms: Date.now() - t0, msg: e.message };
    }
    return out;
  }
}

/* ---------------- utilidades compartidas ---------------- */

/** Formatea errores HTTP de la API de NVIDIA con el detalle real (nunca [object Object]). */
export function describeApiError(status, data, statusText) {
  let msg = '';
  const detail = data?.detail;
  if (Array.isArray(detail) && detail.length) {
    // errores de validación (422) estilo FastAPI: lista de {loc, msg, type}
    msg = detail
      .map((x) => (Array.isArray(x?.loc) ? x.loc.filter((p) => p !== 'body').join('.') + ': ' : '') + String(x?.msg || x?.message || ''))
      .join('; ');
  }
  const errObj = data?.error;
  if (!msg && errObj) msg = typeof errObj === 'string' ? errObj : (errObj.message || errObj.detail || JSON.stringify(errObj));
  if (!msg) msg = String(data?.message || data?.title || '').trim();
  if (!msg) msg = JSON.stringify(data ?? {}, null, 0).slice(0, 240);
  return 'HTTP ' + status + ' · ' + (msg || String(statusText || 'Error')).slice(0, 400);
}

export function extractJSON(text) {
  if (!text) return null;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch { /* sigue */ }
  const start = t.search(/[{[]/);
  if (start === -1) return null;
  const open = t[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(t.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

/**
 * Rescata un JSON que se cortó por límite de tokens: cierra las cadenas,
 * llaves y corchetes que queden abiertos. Solo entra en juego cuando
 * extractJSON falla. Devuelve el objeto rescatado o null.
 */
export function rescueJSON(text) {
  if (!text) return null;
  const t = String(text);
  const start = t.search(/[{[]/);
  if (start === -1) return null;

  const scan = (body) => {
    const stack = [];
    let inStr = false, esc = false, closed = false;
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (esc) { esc = false; continue; }
      if (inStr) {
        if (c === '\\') { esc = true; continue; }
        if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
      else if (c === '}' || c === ']') {
        stack.pop();
        if (!stack.length) { closed = true; break; }
      }
    }
    return { stack, inStr, closed };
  };

  const first = scan(t.slice(start));
  if (first.closed || !first.stack.length) return null; // ya había JSON completo o no abrió nada

  let body = t.slice(start).trimEnd();
  if (first.inStr) body += '"';
  body = body.replace(/[\s,]+$/, '');
  // clave huérfana al final ("…, "campo": ) → se elimina
  if (body.endsWith(':')) {
    const m = body.match(/,\s*"(?:[^"\\]|\\.)*"\s*:\s*$/);
    if (m) body = body.slice(0, m.index);
    body = body.replace(/[\s,]+$/, '');
  }
  const second = scan(body);
  if (second.closed || !second.stack.length) return null;
  const candidate = body + second.stack.reverse().join('');
  try { return JSON.parse(candidate); } catch { return null; }
}

export function b64ToBlob(b64, fallbackMime) {
  let mime = fallbackMime || 'application/octet-stream';
  if (b64.startsWith('iVBOR')) mime = 'image/png';
  else if (b64.startsWith('/9j/')) mime = 'image/jpeg';
  else if (b64.startsWith('UklGR')) mime = 'image/webp';
  const bin = atob(b64.replace(/^data:[^,]+,/, ''));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
