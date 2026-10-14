# Historietas — Cerebro del Subproyecto

> App autocontenida en `public/historietas/`: vanilla JS con **módulos ES
  `.mjs`**, cero build, cero dependencias, persistida en IndexedDB.
  **v3.0 — SOLO TEXTO**: la creación del libro (arquitectura principal) está
  separada de la creación de imágenes. Consulta este archivo antes de tocar nada.

## Stack

- HTML5 + CSS3 (tokens/base/vistas) + JS ES modules (`.mjs`)
- **NVIDIA NIM** (build.nvidia.com, clave gratuita `nvapi-…`):
  - Texto (OpenAI-compatible): `POST https://integrate.api.nvidia.com/v1/chat/completions`
- Transportes: puente Next (`/historietas/api/nv`, definidos en `next.config.ts` raíz),
  puente standalone (`server.js` → `/proxy/<host>/…`, puerto 9130, allowlist NVIDIA),
  directo o personalizado. El cliente auto-descubre el primero que funciona.
- Tests: `node --test tests/*.test.mjs` (131 pruebas, cliente y storage simulados, sin red) + `tests/e2e-taller.mjs` (19 verificaciones HTTP contra el servidor real).

## Mapa de módulos

| Ruta | Responsabilidad |
|---|---|
| `js/core/utils.mjs` | uid, hashString, escapeHtml, blobToDataURL isomórfico… |
| `js/core/events.mjs` | `EventBus` pub/sub + singleton `bus` |
| `js/core/store.mjs` | ajustes en localStorage (`DEFAULT_SETTINGS` es el contrato — v3.0: sin claves de imagen; `migrateSettings` retira las heredadas de la v2.x) |
| `js/core/draft.mjs` | borrador del asistente (DRAFT_FIELDS incluye `preview` y `portada`) |
| `js/core/db.mjs` | IndexedDB: `books` (libros JSON), `assets` |
| `js/core/router.mjs` | hash router con `:params` (`#/`, `#/nuevo`, `#/forja/:id`, `#/libro/:id`, `#/taller/:id`, `#/ajustes`) |
| `js/core/app.mjs` | contexto global: `app.client`, `startRun/getRun/cancelRun` |
| `js/api/models.mjs` | catálogo curado TEXT_MODELS + `isMultimodal` |
| `js/api/client.mjs` | `NvidiaClient`: `chat`, `chatJSON`, `healthCheck`, `resolveTextModel`, `test`; `extractJSON`, `rescueJSON`, `describeApiError` |
| `js/domain/book.mjs` | `createBook` (brief con `preview` + `portada`; meta.portada = autor/año/dedicatoria), `normalizeOutline`, `normalizeChapter`, `normalizePortada`, `computeStats`, `keyChapterIndexes`, `PHASES` (7, sin visual) |
| `js/domain/assets.mjs` | elenco del autor; `craftAssetDNA` (texto→ADN visual — puente al Taller) |
| `js/domain/continuity.mjs` | `dnaLine` (ADN canónico EN), `compressBible`, `lastParagraphs`, `outlineDigest` |
| `js/domain/manuscript.mjs` | ingesta de manuscrito propio: extractText (pdf.js/mammoth CDN perezoso, txt/md con fallback windows-1252), chunkText, analyzeManuscript (1 llamada o digest→síntesis), normalizeAnalysis |
| `js/specialists/shared.mjs` | `BASE_DOCTRINE` (10 reglas), **Guardián de Continuidad** (solo fase impacto — v3.0: la Directora Visual se retiró), `composeSystemPrompt` |
| `js/specialists/categories/*.mjs` | 12 categorías × 6 especialistas (id/nombre/rol/fases/craft) + doctrine + visual (canon para el Taller) |
| `js/specialists/registry.mjs` | índice, `teamForPhase`, `phaseSystemPrompt`, `creditsFor` |
| `js/prompts/writers.mjs` | builders `{system,user}` de las fases de TEXTO — **aquí viven los contratos JSON** |
| `js/export/pdf.mjs` | **generador de PDF puro**: `buildPDF` (portada + dedicatoria + índice con folios reales + capítulos), `wrapText`/`anchoTexto` (métricas reales de Helvetica), `pdfEscape` (WinAnsi), `pdfBlob` |
| `js/studio/state.mjs` | **Taller de Ilustración (Parte 2) — modelo PURO**: `createStudioState`, `normalizeStudio`, `capituloActual`, `puedeIlustrar` (solo el capítulo actual), `marcarIlustrado`, `confirmarCapitulo` (puerta de calidad), `progreso`. Persiste en `book.studio` |
| `js/engine/pipeline.mjs` | `Pipeline.generate` (concepto→…→impacto→listo — sin imágenes), `reforgeChapter`, previsualización (brief.preview), checkpoints, cancel/reanudar |
| `js/engine/tts.mjs` | **Narración de voz** (Web Speech API): `Narrador` (cola de frases con offsets absolutos, `onboundary` + `onchunkstart`, pausa/reanudación robusta, inyectable para tests), `rankVoices`/`pickBestVoice`, `splitNarration`, progreso y prefs en localStorage |
| `js/ui/*.mjs` | components + 6 vistas: biblioteca (portadas tipográficas), asistente (portada del libro), forja, lector (prosa + PDF + narración), **taller** (Parte 2: raíl de capítulos + mesa de sesión), ajustes |

## Contratos clave (no romper)

- **Pipeline ↔ storage**: `{ putBook, getBook, deleteBook, listAssetsByBook, putImage, getImage, putAsset, deleteAsset }` (db.mjs y MemStorage de tests lo cumplen).
- **Pipeline ↔ client**: `{ cfg(), chat, chatJSON }`.
- **JSON de las fases** (writers.mjs define, book.mjs consume): concepto `titulo/subtitulo/logline/temas`; biblia `mundo/era/reglas/tono_visual_en/paleta_en/cronologia`; personajes `personajes[{nombre, rol, edad, apariencia_en, vestuario_en, rasgo_distintivo_en, personalidad, voz, herida, deseo, necesita, arco}]`; esquema `capitulos[{numero, titulo, proposito, sinopsis, latido_emocional, cliffhanger, escenarios, personajes_clave, es_punto_medio, es_climax}]`; capítulo `{titulo_capitulo, parrafos[{texto, rol, personajes_presentes, lugar, momento_dia}], cliffhanger, notas_continuidad}` — **v3.0: SIN campos visuales** (escena_en, accion_en, encuadre_sugerido viven en el Taller cuando toque).
- **OJO nombre de campo**: el párrafo interno lleva `personajesPresentes` (CON S final) — escribirlo sin S rompe el casado por nombre sin error visible (hay test que lo vigila).
- **Portada del libro**: `book.meta.portada = {autor, anio, dedicatoria}` (normalizada por `normalizePortada`); viaja en el PDF y en la cabecera tipográfica del lector.
- **Manuscrito propio** (`book.brief.fuente`, opcional): igual que v2.x (canon de secciones, fidelidad, prosa, preservar, indicaciones).
- **Capítulos fijos = exactos**: si el esquema no cuadra se re-pide (máx. 3) y luego se ajusta deterministamente.
- **Nada de placeholders**: extender = añadir un archivo de categoría y registrarlo.
- **Sin secretos en código**: la clave vive solo en localStorage del usuario y viaja como Bearer al puente.

## Peculiaridades conocidas de los modelos (defensas activas)

- **Modelos de razonamiento (Kimi K3, Nemotron, etc.) pueden devolver `content` vacío** con presupuestos de tokens altos. Defensa en `client.chat()`: reintento acotado a 4096 → traza de razonamiento como último recurso.
- **JSON truncado por límite de tokens**: `rescueJSON` cierra cadenas/llaves/corchetes abiertos.
- **Fallos puntuales de fase no matan la forja**: `Pipeline.retry()` reintenta cada fase 3 veces con aviso en el diario; tras agotar, el libro queda `fallido` con banner y **Reanudar** retoma exactamente donde se detuvo.
- **Fallos de red**: `postWithTransport` reintenta cada transporte y, si todo falla, `explainNetworkFailure` sonda el origen y produce un diagnóstico accionable.
- **Preflight** (`Pipeline.preflight`): verifica clave + ping a la API antes de mover una ficha.

## La Parte 2 — Taller de Ilustración (FUNCIONAL, sin Firebase)

- **Arquitectura**: el motor vive en `Uix/lib/historietas-studio/` (solo servidor: storage, auth, providers, analysis, jobs, engine) y lo sirven DOS adaptadores: la API route `src/app/api/historietas-studio/[...path]/route.ts` (Vercel) y `server.js` (local) — mismo código, cero duplicación. El navegador habla con `/historietas/api/studio/*` (rewrite en next.config.ts) vía `js/studio/client.mjs`.
- **Persistencia**: `storage.mjs` con dos drivers del mismo contrato — Vercel Blob (producción, `BLOB_READ_WRITE_TOKEN`) y sistema de archivos local (`data/`, gitignored). El disco de Vercel NUNCA se usa como persistencia. Layout lógico: `projects/<pid>/{book,config,text}.json`, `characters/<cid>/{ficha,references/*}`, `continuity/chapter-N.json`, `illustrations/<paraId>/{meta,vN.png}`, `jobs/<id>.json`.
- **Auth**: token del propietario (`HISTORIETAS_STUDIO_TOKEN` en Vercel; autogenerado en `data/studio-token.txt` en local) → cookie httpOnly HMAC (`auth.mjs`). TODOS los endpoints excepto ping/login la exigen — incluido el streaming de imágenes (`GET /asset?key=…` con allowlist de claves).
- **Claves de proveedor SOLO en servidor**: `NVIDIA_API_KEY` vive en env de Vercel/proceso — el navegador jamás la ve. Adaptador independiente (`providers.mjs`): nvidia (klein/schnell/kontext/sd35 con payloads por tipo; kontext recibe la referencia aprobada como `image`) + `mock` (PNG real determinista, etiquetado, para pruebas sin créditos).
- **Trabajos**: patrón serverless real — el estado persiste en `jobs/<id>.json`; cada `POST /job/:id/step` ilustra UN párrafo (las 10 etapas del plan: párrafo→contexto→presentes→fichas→memoria→prompt→generar→guardar→versionar→estado) y el cliente hace el bucle. Reanudable, sin duplicados, tope de 3 intentos por ítem.
- **QA por visión** (`analysis.mjs evaluarIlustracion`): compara contra párrafo + canon + referencia; FALL-OPEN siempre. Aprobación final del autor en `illustration/:paraId/approve`; regenerar crea versión nueva sin borrar la anterior.
- **E2E**: `node tests/e2e-taller.mjs` (con el server.js corriendo con `HISTORIETAS_PROVIDER=mock`) verifica los 19 pasos del ciclo completo por HTTP real. Los tests unitarios del motor (`tests/studio-api.test.mjs` vía `tests/studio-lib.mjs`) corren en el suite sin red.

## Cómo extender

- **Nueva categoría**: crea `js/specialists/categories/<id>.mjs` (6 especialistas con `fases` de {concepto, biblia, personajes, esquema, escritura, impacto}), impórtalo y añádelo a `CATEGORIES` en `registry.mjs`.
- **Nueva fase de texto**: prompt builder en `writers.mjs` + bloque en `pipeline.run` + normalizador si produce datos.
- **Nuevo proveedor de imágenes**: un objeto con `generate({prompt, model, aspect, seed, referenceDataUrl})` en `lib/historietas-studio/providers.mjs` + registro en `crearProveedor` — nada más.

## Producción

`https://yapido.click/historietas` — los rewrites ya viven en `next.config.ts`
(`/historietas` → `index.html`, `/historietas/api/nv/:path*` → NIM texto).

*Última actualización: v3.0 — solo texto, PDF y Taller de Ilustración (Parte 2 preparada).*
