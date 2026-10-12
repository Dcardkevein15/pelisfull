/* helpers.mjs — dobles de prueba: cliente NVIDIA simulado y almacenamiento en memoria.
   v3.0 (solo texto): sin mocks de imagen. */

import { extractJSON } from '../js/api/client.mjs';

/** Cliente NVIDIA simulado, programable por marcadores del prompt. */
export class MockClient {
  constructor({ textDelayMs = 0 } = {}) {
    this.textDelayMs = textDelayMs;
    this.textCalls = [];
    this.imageCalls = []; // compatibilidad de firma: siempre vacío (solo texto)
    this.jsonFailures = new Set(); // ordinales de chatJSON (1-based) que fallan
    this._jsonCalls = 0;
    this.outlineFirstCount = null; // si se fija, la primera llamada de esquema devuelve este número
    this._outlineCalls = 0;
    this.cfgData = {
      nvApiKey: 'nvapi-mock',
      textModel: 'mock/pen',
      transport: 'auto',
      customProxyBase: '',
      parrafosPorCapitulo: 3,
      paseImpacto: true,
    };
  }

  cfg() { return this.cfgData; }

  async healthCheck(model) {
    return { ok: true, model: model || this.cfgData.textModel };
  }

  async resolveTextModel(preferido) {
    const model = preferido || this.cfgData.textModel;
    return { model, switched: false };
  }

  async chat(messages, opts = {}) {
    this.textCalls.push({ messages, opts });
    if (this.textDelayMs) {
      await new Promise((r) => setTimeout(r, this.textDelayMs));
      if (opts.signal?.aborted) throw new Error('Cancelado');
    }
    const user = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
    const system = messages.find((m) => m.role === 'system')?.content || '';
    const raw = this._textFor(user, system);
    if (raw === undefined) throw new Error('MOCK: prompt no reconocido:\n' + user.slice(0, 200));
    return raw;
  }

  async chatJSON(messages, opts = {}) {
    this._jsonCalls++;
    if (this.jsonFailures.has(this._jsonCalls)) throw new Error('MOCK: JSON inválido simulado');
    const raw = await this.chat(messages, opts);
    const parsed = extractJSON(raw);
    if (parsed === null) throw new Error('MOCK devolvió JSON inválido');
    return parsed;
  }

  _textFor(user, system) {
    // ping de comprobación de conexión (preflight del pipeline)
    if (user.includes('Responde solo con la palabra LISTO')) return 'LISTO';
    // análisis de manuscrito (contrato completo)
    if (user.includes('"categoria": "género dominante') || user.includes('SÍNTESIS: estos son los análisis parciales')) {
      return JSON.stringify({
        categoria: 'thriller', titulo: 'La Casa que Susurra', tono: 'tenso y quirúrgico',
        pov: 'primera persona', publico: 'adulto general', era: '1999, ciudad costera',
        final: 'La casa se traga al vecino', premisa: 'Una arquitecta hereda una casa imposible.',
        intensidad: { emocion: 9, psicologia: 10, accion: 7, romance: 1, oscuridad: 8 },
        temas: ['miedo', 'familia'],
        personajesCanon: [{ nombre: 'Ana', descripcion: 'la arquitecta heredera', aparienciaEn: 'short black hair, red wool coat, scar over left eyebrow' }],
        fortalezas: ['atmósfera lograda'],
        debilidades: ['final apurado', 'diálogos planos'],
        secciones: [
          { titulo: 'La herencia', resumen: 'Ana recibe la casa.', textoClave: 'La casa respiraba.', personajes: ['Ana'], lugares: ['la casa'] },
          { titulo: 'La primera puerta', resumen: 'Ana abre la puerta uno.', textoClave: 'La puerta ya estaba abierta.', personajes: ['Ana'], lugares: ['la casa'] },
        ],
      });
    }
    // digest parcial de un trozo de manuscrito largo
    if (user.includes('"resumenTrozo"')) {
      const m = user.match(/PARTE (\d+) DE (\d+)/);
      return JSON.stringify({
        resumenTrozo: 'En la parte ' + (m ? m[1] : '?') + ' Ana explora la casa.',
        personajes: [{ nombre: 'Ana', descripcion: 'la heredera', aparienciaEn: 'short black hair' }],
        secciones: [{ titulo: 'Puertas ' + (m ? m[1] : '?'), resumen: 'Ana abre puertas.', textoClave: 'Otra puerta más.', personajes: ['Ana'], lugares: ['la casa'] }],
      });
    }
    // concepto
    if (user.includes('"titulo": "título principal')) {
      return JSON.stringify({ titulo: 'La Casa que Susurra', subtitulo: 'Un thriller en doce puertas', logline: 'Una arquitecta hereda una casa que registra sus miedos.', temas: ['miedo', 'familia', 'memoria'] });
    }
    // biblia
    if (user.includes('"mundo":')) {
      return JSON.stringify({ mundo: 'Ciudad costera de niebla perpetua.', era: '1999', reglas: ['La casa tiene 12 puertas', 'Nadie duerme dos noches seguidas'], tono_visual_en: 'misty gothic comic', paleta_en: 'slate blue, bone white, rust', cronologia: [{ capitulo: 1, evento: 'Llega a la casa' }] });
    }
    // personajes
    if (user.includes('"personajes": [{')) {
      return JSON.stringify({ personajes: [
        { nombre: 'Ana', rol: 'protagonista', edad: '34', apariencia_en: 'short black hair, sharp jaw, olive skin', vestuario_en: 'red wool coat, grey jeans', rasgo_distintivo_en: 'scar over left eyebrow', personalidad: 'obstinada', voz: 'frases cortas', herida: 'culpa', deseo: 'pertenecer', necesita: 'perdonarse', arco: 'de fugitiva a guardiana' },
        { nombre: 'Bruno', rol: 'aliado', edad: '60', apariencia_en: 'white beard, round glasses', vestuario_en: 'brown corduroy jacket', rasgo_distintivo_en: 'chewed pencil behind ear', personalidad: 'amable', voz: 'pausada', herida: 'soledad', deseo: 'ser útil', necesita: 'descanso', arco: 'de guía a traidor arrepentido' },
      ] });
    }
    // esquema
    if (user.includes('"capitulos": [{')) {
      this._outlineCalls++;
      const n = this.outlineFirstCount && this._outlineCalls === 1 ? this.outlineFirstCount : 2;
      return JSON.stringify({ capitulos: Array.from({ length: n }, (_, i) => ({
        numero: i + 1, titulo: 'Puerta ' + (i + 1), proposito: 'avanzar', sinopsis: 'Ana abre la puerta ' + (i + 1) + '.',
        latido_emocional: 'opresión', cliffhanger: 'algo la mira', escenarios: ['la casa'], personajes_clave: ['Ana'],
        secciones_fuente: [i + 1],
        es_punto_medio: i === Math.floor(n / 2) - 1, es_climax: i === n - 1,
      })) });
    }
    // pase de impacto
    if (user.includes('Reescribe ELEVANDO')) {
      const K = (user.match(/Párrafo \d+/g) || []).length;
      return JSON.stringify({
        titulo_capitulo: 'Puerta (impacto)', cliffhanger: 'mejorado', notas_continuidad: 'ok',
        parrafos: Array.from({ length: K }, (_, i) => ({
          texto: 'Párrafo mejorado ' + (i + 1) + '.', rol: 'narracion', personajes_presentes: ['Ana'],
          lugar: 'la casa', momento_dia: 'noche',
        })),
      });
    }
    // escritura de capítulo
    const m = system.match(/Escribes el capítulo (\d+) de (\d+)/);
    if (m) {
      const n = Number(m[1]);
      const K = Number((user.match(/ESCRIBE EXACTAMENTE (\d+) PÁRRAFOS/) || [])[1] || 3);
      return JSON.stringify({
        titulo_capitulo: 'Puerta ' + n, cliffhanger: 'la puerta ' + (n + 1) + ' ya está abierta', notas_continuidad: 'recordar llave',
        parrafos: Array.from({ length: K }, (_, i) => ({
          texto: 'Párrafo ' + n + '.' + (i + 1) + ' — la niebla entraba como si la casa respirara.',
          rol: i % 2 ? 'dialogo' : 'narracion', personajes_presentes: ['Ana'],
          lugar: 'la casa', momento_dia: 'noche',
        })),
      });
    }
    // premisas
    if (user.includes('"premisas"')) {
      return JSON.stringify({ premisas: ['Un farero que ya no puede dormir escucha su propia voz en la radio.'] });
    }
    return undefined;
  }
}

/** Almacenamiento en memoria con la misma interfaz que core/db.mjs. */
export class MemStorage {
  constructor() {
    this.books = new Map();
    this.images = new Map();
    this.assets = [];
  }
  async putBook(b) { this.books.set(b.id, JSON.parse(JSON.stringify(b))); }
  async getBook(id) { const b = this.books.get(id); return b ? JSON.parse(JSON.stringify(b)) : null; }
  async deleteBook(id) { this.books.delete(id); }
  async putImage(key, blob) { this.images.set(key, blob); }
  async getImage(key) { return this.images.get(key) || null; }
  async deleteImage(key) { this.images.delete(key); }
  async putAsset(a) { this.assets = this.assets.filter((x) => x.id !== a.id); this.assets.push(JSON.parse(JSON.stringify(a))); }
  async deleteAsset(id) { this.assets = this.assets.filter((x) => x.id !== id); }
  async listAssetsByBook(bookId) { return this.assets.filter((a) => a.bookId === bookId).map((a) => JSON.parse(JSON.stringify(a))); }
}

/** Bus ficticio para el cliente: simula navegador o red. */
export function fakeFetch(handler) {
  return async (url, opts) => handler(url, opts);
}

export function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, statusText: 'x', json: async () => body };
}

export async function rejects(promise, msg) {
  try { await promise; } catch (e) { return e; }
  throw new Error('Se esperaba un rechazo' + (msg ? ': ' + msg : ''));
}
