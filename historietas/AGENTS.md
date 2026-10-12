# Historietas — Cerebro del Subproyecto

> App autocontenida en `public/historietas/` (misma convención que `salud`, `director`,
> `objetivos`): vanilla JS con **módulos ES `.mjs`**, cero build, cero dependencias,
> persisted en IndexedDB. Consulta este archivo antes de tocar nada.

## Stack

- HTML5 + CSS3 (tokens/base/vistas) + JS ES modules (`.mjs`)
- **NVIDIA NIM** (`build.nvidia.com`, clave gratuita `nvapi-…`):
  - Texto (OpenAI-compatible): `POST https://integrate.api.nvidia.com/v1/chat/completions`
  - Imágenes (genai): `POST https://ai.api.nvidia.com/v1/genai/<modelo>` con payloads específicos por modelo (flux2/schnell/kontext/sd35)
- Transportes: puente Next (`/historietas/api/nv|nvgen`, definidos en `next.config.ts` raíz),
  puente standalone (`server.js` → `/proxy/<host>/…`, puerto 9130, allowlist NVIDIA),
  directo o personalizado. El cliente auto-descubre el primero que funciona.
- Tests: `node --test tests/*.test.mjs` (132 pruebas, cliente y storage simulados, sin red).

## Mapa de módulos

| Ruta | Responsabilidad |
|---|---|
| `js/core/utils.mjs` | uid, hashString (semillas), escapeHtml, blobToDataURL isomórfico… |
| `js/core/events.mjs` | `EventBus` pub/sub + singleton `bus` |
| `js/core/store.mjs` | ajustes en localStorage (`DEFAULT_SETTINGS` es el contrato: panelQa, hojasPersonaje…) |
| `js/core/draft.mjs` | borrador del asistente (DRAFT_FIELDS incluye `preview`) |
| `js/core/db.mjs` | IndexedDB: `books` (libros JSON), `images` (blobs por clave), `assets` |
| `js/core/router.mjs` | hash router con `:params` (`#/`, `#/nuevo`, `#/forja/:id`, `#/libro/:id`, `#/ajustes`) |
| `js/core/app.mjs` | contexto global: `app.client`, `startRun/getRun/cancelRun` |
| `js/api/models.mjs` | catálogo curado TEXT_MODELS / IMAGE_MODELS + `imageDims`, `supportsNegativePrompt` |
| `js/api/client.mjs` | `NvidiaClient`: `chat`, `chatJSON`, `describeImage`, `generateImage`, `test`; `extractJSON`, `digB64`, `b64ToBlob`. Kontext usa `refs[0]`/`image` como imagen ancla |
| `js/domain/book.mjs` | `createBook` (brief con `preview`), `normalizeOutline`, `normalizeChapter`, `computeStats`, `keyChapterIndexes`, `PHASES` |
| `js/domain/assets.mjs` | elenco del autor; `describeAssetWithAI` (visión) y `craftAssetDNA` (texto→ADN); `generateAssetPortrait` (hojas de personaje) |
| `js/domain/continuity.mjs` | semillas (`seedForPanel`), `CAMERA_SHOTS`+`cameraFor` (reglas + ids directos + `ROL_SHOTS` por beat), `dnaLine`, `compressBible`, `styleCoreFor`/`paletteFor` (dedup: la biblia manda), `panelsAspectFor` (splash/íntimos), `panelPeso`, `refsForParagraph` (assets + hojas) |
| `js/domain/lettering.mjs` | `extractDialogues`: líneas entrecomilladas → globos HTML del lector |
| `js/domain/manuscript.mjs` | ingesta de manuscrito propio: extractText (pdf.js/mammoth CDN perezoso, txt/md con fallback windows-1252), chunkText, analyzeManuscript (1 llamada o digest→síntesis), normalizeAnalysis |
| `js/specialists/shared.mjs` | `BASE_DOCTRINE` (10 reglas de la casa), Directora Visual, Guardián, `composeSystemPrompt` |
| `js/specialists/categories/*.mjs` | 12 categorías × 6 especialistas (id/nombre/rol/fases/craft) + doctrine + visual |
| `js/specialists/registry.mjs` | índice, `teamForPhase`, `phaseSystemPrompt`, `creditsFor` |
| `js/prompts/writers.mjs` | builders `{system,user}` de las 7 fases — **aquí viven los contratos JSON** |
| `js/prompts/budget.mjs` | **presupuesto de 800** (límite real del endpoint): `ensamblarPanel`/`ensamblarHoja` degradan por niveles (lujo primero, ADN jamás), `clipWords`, `dnaCapPara` |
| `js/prompts/images.mjs` | `buildPanelPrompt` (ADN + cámara por beat + estilo dedup + peso + ancla kontext + corrección Guardián), `NEGATIVE_BASE` (solo SD 3.5) y `AVOID_LINE` (plegado al prompt positivo) |
| `js/engine/pipeline.mjs` | `Pipeline.generate` (concepto→…→hojas→paneles), `reforgeChapter`, previsualización (brief.preview), checkpoints, cancel/reanudar |
| `js/engine/imagegen.mjs` | `generateChapterPanels` (concurrencia+reintentos+aspecto por panel+ancla kontext), `regeneratePanel` |
| `js/engine/panelqa.mjs` | **Guardián Visual real**: `reviewPanel` (visión, fail-open), `softenScene` (CONTENT_FILTERED), `qaEnabledFor`, `QA_MAX_REGENS=1` |
| `js/engine/tts.mjs` | **Narración de voz** (Web Speech API): `Narrador` (cola de frases con offsets absolutos, `onboundary` + `onchunkstart`, pausa/reanudación robusta, inyectable para tests), `rankVoices`/`pickBestVoice` (voces neuronales por idioma), `splitNarration` (troceo con offsets fieles), progreso (`loadReadingProgress`/`saveReadingProgress`, localStorage) y prefs (`getTtsPrefs`/`setTtsPrefs`). NOTA: NVIDIA NIM NO tiene TTS hospedado (verificado contra docs.api.nvidia.com) — la voz es del navegador. |
| `js/engine/selfcheck.mjs` | **Prueba de continuidad** (Ajustes, 1 clic): 2 paneles consecutivos con los builders reales + verificación estática de ADN/estilo/semillas + Guardián Visual panel-2-vs-panel-1 |
| `js/ui/*.mjs` | components (el/iconos/toasts/modal con cancelTxt) + 5 vistas (lector: globos, splash, badge QA, banner previsualización, hojas re-roll, narración con karaoke) |
| `server.js` | standalone + puente CORS allowlist (`integrate|ai.api.nvidia.com`) |

## Contratos clave (no romper)

- **Pipeline ↔ storage**: `{ putBook, getBook, deleteBook, listAssetsByBook, putImage, getImage, putAsset, deleteAsset }` (db.mjs y MemStorage de tests lo cumplen).
- **Pipeline ↔ client**: `{ cfg(), chat, chatJSON, generateImage }` (NvidiaClient y MockClient lo cumplen).
- **JSON de las fases** (writers.mjs define, book.mjs consume): concepto `titulo/subtitulo/logline/temas`; biblia `mundo/era/reglas/tono_visual_en/paleta_en/cronologia`; personajes `personajes[{nombre, rol, edad, apariencia_en, vestuario_en, rasgo_distintivo_en, personalidad, voz, herida, deseo, necesita, arco}]`; esquema `capitulos[{numero, titulo, proposito, sinopsis, latido_emocional, cliffhanger, escenarios, personajes_clave, es_punto_medio, es_climax}]`; capítulo `{titulo_capitulo, parrafos[{texto, rol, personajes_presentes, lugar, momento_dia, accion_en, escena_en, encuadre_sugerido}], cliffhanger, notas_continuidad}`; guion visual `paneles[{indice, escena_en, accion_en, lugar_en, momento_dia, clima_luz, encuadre, mood, peso, dialogo[{personaje, linea}]}]` (peso 2 = splash, máx. 1 por capítulo; dialogo = citas EXACTAS con dueño, máx. 2, normalizado por `normalizeVisualPanel`).
- **OJO nombre de campo**: el párrafo interno lleva `personajesPresentes` (CON S final) — bug histórico de dedo: escribirlo sin S deja el ADN fuera del prompt sin error visible (hay test que lo vigila).
- **Encuadres**: solo ids de `CAMERA_SHOTS` (continuity.mjs); `cameraFor` reconoce los ids directamente y respeta pools por rol (`ROL_SHOTS`) cuando nadie sugiere.
- **Modelos de imagen — dimensiones del ESQUEMA del endpoint, no de la ficha**: el OpenAPI de `flux.2-klein-4b` restringe width/height al enum {768,832,896,960,1024,1088,1152,1216,1280,1344} (mandar 1456×720 = 422) y declara `"image": null` — el endpoint alojado NO acepta referencias: nunca enviar `image` con klein/schnell (solo kontext, que sí lo admite). Con klein la coherencia se sostiene con ADN textual + semilla + **Guardián Visual** (QA por visión contra la hoja de personaje); con kontext la **hoja de personaje viaja como imagen ancla** (`refs[0]` → `image`). Los 422 de FastAPI llegan como `{detail:[{loc,msg}]}`: `describeApiError` los formatea legibles (nunca `[object Object]`).
- **Presupuesto de prompt — 800 caracteres MÁXIMO** (422 real: `"prompt: String should have at most 800 characters"`, verificado con la clave del autor): TODO prompt de imagen (paneles y hojas) se ensambla con `prompts/budget.mjs` (`ensamblarPanel`/`ensamblarHoja`). Degradación determinista por niveles — lujo primero (línea de calidad → iluminación del estilo → cláusula → avoid compacto → ADN 120 → ADN 90), el ADN de TODOS los presentes jamás se cae, la escena absorbe el resto con mínimo razonable (60 chars) y recorte duro final de garantía. Los tests (`budget.test.mjs`) incluyen la regresión exacta del caso que lo reveló (elenco kilométrico: "Dra. Ines Okafor").
- **Negative prompts**: solo SD 3.5 tiene `negative_prompt` nativo (`supportsNegative: true` en models.mjs); para FLUX el bloque de negativos va PLEGADO en el prompt positivo (`AVOID_LINE`, images.mjs) — `NEGATIVE_BASE` se descarta en endpoints que no lo aceptan.
- **Guardián Visual (`panelqa.mjs`)**: fail-open SIEMPRE — modelo no multimodal, red caída o JSON ilegible = panel aprobado. Máx. `QA_MAX_REGENS=1` re-dibufo correctivo por panel; el veredicto queda en `panel.qa {ok, issues}` y el lector lo enseña si `ok=false`. Requiere ajuste `panelQa` (default ON) + modelo de texto multimodal.
- **Hojas de personaje**: tras la fase de personajes, `Pipeline` dibuja un retrato canónico por personaje (`retrato:<bookId>:<charId>`, campo `personaje.retratoKey`) salvo que el canon del autor ya tenga imagen. Ajuste `hojasPersonaje` (default ON). Re-rollable desde el lector. Es el ancla Kontext y la referencia facial del QA.
- **Previsualización (`brief.preview`)**: la escritura y los paneles se cortan tras el capítulo 1; el lector muestra banner con "Continuar forja completa" (pon `preview=false` y `startRun` — el pipeline reanuda sin repetir nada).
- **Lettering**: los globos del modo Cómic son overlay HTML (`lettering.mjs` extrae las líneas entrecomilladas) — jamás pedir texto pintado al modelo de imagen.
- **Narración (tts.mjs + lector)**: la voz es del NAVEGADOR (Web Speech API), no de la API de NVIDIA — NVIDIA NIM no ofrece TTS hospedado (verificado contra su referencia oficial; riva-translate es un LLM de texto, y el Riva TTS real es un contenedor gRPC self-hosted con GPU). Se elige la voz neuronal del idioma del libro (`brief.idioma`). `Narrador` es inyectable para tests (`synth`/`utteranceCtor`); en la vista hay UN narrador vivo a nivel de módulo (`narradorVivo` + `detenerVoz()`) que se detiene en cada re-render. Invariante de `splitNarration`: `texto.slice(c.offset, c.offset + c.text.length) === c.text`. **Karaoke en tiempo real**: la vista interpola el amarillo por frase (`onchunkstart` recalibra el tramo; ticker 120ms; los `onboundary` reales corrigen al vuelo) — funciona incluso con voces que no disparan eventos de palabra. El reproductor flotante (`#tts-player`) concentra pausa/detener/progreso; los offsets de reanudación son absolutos (`_fromChar` se suma en cada evento). Memoria de lectura en localStorage: `historietas.tts.progress.v1` (`{paraId, chapterIdx, paraIdx, charIndex, pct}` por libro, con fallback por índices si el párrafo cambió tras una reforja) y `historietas.tts.prefs.v1` (`{voiceName, rate}`). Karaoke: spans `.kw` con `data-s` = offset de la palabra; `.is-read` = amarillo, `.is-reading` = palabra actual.
- **Manuscrito propio** (`book.brief.fuente`, opcional): `{archivo, nivelFidelidad (fieles|equilibrada|audaz), nivelProsa (pulir|editorial|reinventar), preservar {nombres, final, escenas}, indicaciones, canon {tituloOriginal, premisaOriginal, secciones[{i,titulo,resumen,textoClave,personajes,lugares}]}}`. Los bloques de reescritura (`fuenteReglas`, `fuenteSeccionesBlock`, `fuenteCapituloBlock` en writers.mjs) solo se inyectan si `fuente` existe. El esquema devuelve `secciones_fuente` (índices del canon) y `normalizeOutline` los recoge como `chapter.seccionesFuente`; sin asignación, el reparto es proporcional. El análisis del manuscrito produce TODO el encargo de la wizard (auto-fill) + personajesCanon (assets automáticos).
- **Claves de imagen**: `<bookId>:<chapterId>:<paraId>:v<version>`; asset: `asset:<assetId>`.
- **Panel = párrafo**: SIEMPRE 1:1. La cantidad de párrafos la fija `brief.parrafosPorCapitulo` (3–16).

## Reglas del sistema

1. **El canon del autor es sagrado**: assets (nombre/tipo/descripción/ADN) entran a biblia, personajes, esquema, capítulos y paneles; los personajes se casan por nombre exacto (`assetId`).
2. **Coherencia**: ADN canónico + semilla determinista + estilo bloqueado + vestuario fijo en cada panel; el Guardián de Continuidad vigila impacto y visual.
3. **Capítulos fijos = exactos**: si el esquema no cuadra se re-pide (máx. 3) y luego se ajusta deterministamente; el ajuste queda avisado en el log de la forja.
4. **Nada de placeholders**: los prompts y el motor están completos; extender = añadir un archivo de categoría y registrarlo.
5. **Sin secretos en código**: la clave vive solo en localStorage del usuario y viaja como Bearer al puente.
6. Los errores de paneles no abortan la forja: quedan `status:'error'` y se re-lanzan desde el lector.

## Peculiaridades conocidas de los modelos (defensas activas)

- **Modelos de razonamiento (Kimi K3, Nemotron, etc.) pueden devolver `content` vacío** con presupuestos de tokens altos y dejarlo todo en `reasoning_content` (quirk ya documentado en `director/js/providers.js`). Defensa en `client.chat()`: cadena `pureContent` → reintento acotado a 4096 → traza de razonamiento como último recurso.
- **JSON truncado por límite de tokens**: `rescueJSON` cierra cadenas/llaves/corchetes abiertos (solo entra si `extractJSON` falla). El reintento correctivo de `chatJSON` pide el JSON completo y compacto.
- **Fallos puntuales de fase no matan la forja**: `Pipeline.retry()` reintenta cada fase 3 veces con aviso en el diario; tras agotar, el libro queda `fallido` con banner en la Forja y **Reanudar** retoma exactamente donde se detuvo (checkpoints).
- **Sin `reasoning_content` en extractJSON a ciegas**: se prefiere siempre `content`; la traza es fallback.
- **Fallos de red** (servidor caído, pestaña viva sin servidor, microcortes): `postWithTransport` reintenta cada transporte y, si todo falla, `explainNetworkFailure` sonda el origen (`GET /historietas/api/nv/models` responde sin clave) y produce un diagnóstico accionable (arranca el servidor / revisa conexión / revisa clave) con el detalle de cada transporte. Nunca se filtran prefijos internos al usuario.
- **Preflight** (`Pipeline.preflight`): antes de mover una ficha (forja o re-forja) verifica clave + ping a la API; si la conexión está caída, falla rápido y claro sin consumir fases.

## Cómo extender

- **Nueva categoría**: crea `js/specialists/categories/<id>.mjs` (copia el contrato de cualquiera: 6 especialistas con `fases` de {concepto, biblia, personajes, esquema, escritura, impacto}), impórtalo y añádelo a `CATEGORIES` en `registry.mjs`. Los tests de integridad lo validan solos.
- **Nuevo modelo**: añádelo a `models.mjs` con `dims` por aspecto (solo resoluciones oficiales de la ficha de NVIDIA) y `tipo` si su payload difiere; extiende `generateImage` en `client.mjs`.
- **Nueva fase**: prompt builder en `writers.mjs` + bloque en `pipeline.run` + normalizador si produce datos.

## Producción

`https://yapido.click/historietas` — los rewrites ya viven en `next.config.ts`
(`/historietas` → `index.html`, `/historietas/api/nv/:path*` → NIM texto,
`/historietas/api/nvgen/:path*` → NIM genai). Vercel respeta estos rewrites.
