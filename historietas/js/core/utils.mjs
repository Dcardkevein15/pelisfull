/* utils.mjs — utilidades puras, sin dependencias del navegador.
   Todos los módulos del sistema pueden importarse en Node para los tests. */

export const uid = (prefix = 'id') =>
  prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export function debounce(fn, ms = 300) {
  let t;
  const d = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  d.cancel = () => clearTimeout(t);
  return d;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '\u0026amp;')
    .replace(/</g, '\u0026lt;')
    .replace(/>/g, '\u0026gt;')
    .replace(/"/g, '\u0026quot;')
    .replace(/'/g, '\u0026#39;');
}

/** Hash FNV-1a de 32 bits — determinista para semillas y caches. */
export function hashString(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h >>> 0;
}

export const wordCount = (text) =>
  String(text ?? '').trim() ? String(text).trim().split(/\s+/).length : 0;

export function truncate(str, n) {
  const s = String(str ?? '');
  return s.length <= n ? s : s.slice(0, Math.max(0, n - 1)) + '…';
}

export const fmtBytes = (n) => {
  if (!n && n !== 0) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
};

export const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(iso ?? '');
  }
};

export const randomPick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function slug(str) {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'sin-titulo';
}

export function deepClone(obj) {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(obj); } catch { /* cae abajo */ }
  }
  return JSON.parse(JSON.stringify(obj));
}

/** Descarga un blob/dataURL en el navegador (no-op en Node). */
export function downloadBlob(data, filename, mime = 'application/octet-stream') {
  if (typeof document === 'undefined') return;
  const a = document.createElement('a');
  a.href = typeof data === 'string' && data.startsWith('data:') ? data : URL.createObjectURL(data);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    if (a.href.startsWith('blob:')) URL.revokeObjectURL(a.href);
  }, 400);
}

/** Lee un File como dataURL (navegador). */
export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('No se pudo leer el archivo: ' + (file?.name || '')));
    fr.readAsDataURL(file);
  });
}

/** Blob → dataURL, isomórfico (FileReader en navegador, Buffer en Node). */
export async function blobToDataURL(blob) {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error('No se pudo convertir el blob'));
      fr.readAsDataURL(blob);
    });
  }
  const buf = Buffer.from(await blob.arrayBuffer());
  return 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + buf.toString('base64');
}

export const nowISO = () => new Date().toISOString();

export function safeJsonParse(str, fallback = null) {
  try { return JSON.parse(str); } catch { return fallback; }
}
