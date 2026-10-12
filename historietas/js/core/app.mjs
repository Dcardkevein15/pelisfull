/* app.mjs — contexto compartido de la aplicación (cliente, ajustes, rutas, runs activos). */

import { store } from './store.mjs';
import { bus } from './events.mjs';
import { router } from './router.mjs';
import * as db from './db.mjs';
import { NvidiaClient } from '../api/client.mjs';
import { Pipeline } from '../engine/pipeline.mjs';

export const app = {
  store,
  bus,
  router,
  db,
  client: null,
  runs: new Map(), // bookId -> { pipeline, book, promise }
};

export function bootApp() {
  store.load();
  app.client = new NvidiaClient({ settings: store, bus });
  return app;
}

/** Lanza (o devuelve) la forja activa de un libro. */
export function startRun(book) {
  const existing = app.runs.get(book.id);
  if (existing) return existing;
  const pipeline = new Pipeline({ client: app.client, storage: app.db, bus });
  const run = { pipeline, book, promise: pipeline.generate(book) };
  app.runs.set(book.id, run);
  run.promise
    .catch(() => {})
    .finally(() => setTimeout(() => app.runs.delete(book.id), 800));
  return run;
}

export const getRun = (bookId) => app.runs.get(bookId) || null;

export function cancelRun(bookId) {
  const run = app.runs.get(bookId);
  if (run) run.pipeline.cancel(bookId);
}
