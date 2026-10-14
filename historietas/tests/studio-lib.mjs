/* studio-lib.mjs — resolvedor portable de lib/historietas-studio/ para los
   tests. La ruta a lib/ depende de QUÉ copia del proyecto corre la suite:
   public/x/historietas/tests → ../../../../lib (monorepo)
   public/historietas/tests   → ../../../lib    (monorepo, copia canónica)
   bh/jajajaj (copia suelta)  → sin lib: mensaje claro. */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CANDIDATOS = [
  path.join(here, '..', '..', '..', '..', 'lib', 'historietas-studio'),
  path.join(here, '..', '..', '..', 'lib', 'historietas-studio'),
];
const LIB = CANDIDATOS.find((d) => fs.existsSync(path.join(d, 'engine.mjs')));
if (!LIB) {
  throw new Error('lib/historietas-studio/ no encontrado: los tests del motor del Taller corren en las copias dentro del monorepo (public/historietas o public/x/historietas).');
}

const mod = (nombre) => import(pathToFileURL(path.join(LIB, nombre)).href);

const engine = await mod('engine.mjs');
const storage = await mod('storage.mjs');
const auth = await mod('auth.mjs');
const providers = await mod('providers.mjs');
const analysis = await mod('analysis.mjs');

export const { createEngine } = engine;
export const { createStorage, claveValida } = storage;
export const { createAuth, resolveOwnerToken } = auth;
export const { proveedorNvidia, proveedorMock, crearProveedor } = providers;
export const { buildIllustrationPrompt, seedDe, evaluarIlustracion } = analysis;
export const LIB_ROOT = LIB;
