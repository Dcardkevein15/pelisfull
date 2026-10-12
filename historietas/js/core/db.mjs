/* db.mjs — persistencia IndexedDB: libros (JSON), imágenes (blobs) y assets.
   En Node (tests) el motor recibe un almacenamiento alternativo inyectado. */

const DB_NAME = 'historietas';
const DB_VERSION = 1;

let dbPromise = null;

function hasIDB() {
  try { return typeof indexedDB !== 'undefined'; } catch { return false; }
}

export function openDB() {
  if (!hasIDB()) return Promise.reject(new Error('IndexedDB no disponible en este entorno'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('No se pudo abrir IndexedDB'));
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ---------- libros ---------- */
export const listBooks = () => tx('books', 'readonly').then((s) => wrap(s.getAll()));
export const getBook = (id) => tx('books', 'readonly').then((s) => wrap(s.get(id)));
export const putBook = (book) => tx('books', 'readwrite').then((s) => wrap(s.put(book)));

export async function deleteBook(id) {
  const book = await getBook(id).catch(() => null);
  const s = await tx('books', 'readwrite');
  await wrap(s.delete(id));
  // limpia imágenes y assets asociados
  if (book) {
    for (const ch of book.chapters || []) {
      for (const p of ch.paragraphs || []) {
        if (p.panel?.imageKey) await deleteImage(p.panel.imageKey).catch(() => {});
      }
    }
    for (const a of book.assets || []) {
      if (a.imageKey) await deleteImage(a.imageKey).catch(() => {});
    }
  }
  const assets = await listAssetsByBook(id).catch(() => []);
  for (const a of assets) await deleteAsset(a.id).catch(() => {});
}

/* ---------- imágenes (blobs) ---------- */
export const putImage = (key, blob) =>
  tx('images', 'readwrite').then((s) => wrap(s.put({ key, blob, at: Date.now() })));
export const getImage = (key) =>
  tx('images', 'readonly').then((s) => wrap(s.get(key))).then((row) => (row ? row.blob : null));
export const deleteImage = (key) =>
  tx('images', 'readwrite').then((s) => wrap(s.delete(key)));

/* ---------- assets (elenco/objetos/paisajes del usuario) ---------- */
export const putAsset = (asset) => tx('assets', 'readwrite').then((s) => wrap(s.put(asset)));
export const getAsset = (id) => tx('assets', 'readonly').then((s) => wrap(s.get(id)));
export const deleteAsset = (id) => tx('assets', 'readwrite').then((s) => wrap(s.delete(id)));
export const listAssetsByBook = (bookId) =>
  tx('assets', 'readonly')
    .then((s) => wrap(s.getAll()))
    .then((all) => all.filter((a) => a.bookId === bookId));
