# Historietas — Fábrica de Historias Magistrales

> Doce salas de especialistas literarios forjan tu libro completo: título,
> subtítulo, mapa de capítulos y prosa magistral. El libro se DESCARGA en PDF
> con su portada (autor, año, dedicatoria). Cuando el texto está terminado,
> el **Taller de Ilustración** (Parte 2) lo ilustra capítulo a capítulo.

App 100 % estática (HTML + CSS + JS, sin build, sin dependencias) que vive en
`public/historietas/` y se sirve en **`/historietas`** del monorepo. También
funciona standalone con `ABRIR-HISTORIETAS.bat`.

**v3.0 — SOLO TEXTO**: la creación del libro (arquitectura principal) está
completamente separada de la creación de imágenes. Las ilustraciones se
procesan en el Taller, un capítulo por sesión, y solo se avanza al siguiente
cuando la calidad está confirmada. La narración de voz quedó intacta.

---

## Arranque

| Modo | Cómo | URL |
|---|---|---|
| Integrado (recomendado) | el servidor Next del monorepo ya la sirve; los rewrites de `next.config.ts` puentean la API | `http://localhost:9002/historietas` |
| Standalone | doble clic en `ABRIR-HISTORIETAS.bat` (arranca `server.js`, puerto 9130, con puente CORS) | `http://localhost:9130/` |
| Tests (Node 18+) | `node --test tests/*.test.mjs` | 131 pruebas, sin red |

## Clave de API (gratuita)

1. Entra en **https://build.nvidia.com** → *Get API Key* (clave `nvapi-…`, créditos de prueba gratuitos).
2. En la app: **Ajustes** → pega la clave → *Ejecutar diagnóstico*.

La clave se guarda solo en `localStorage` de tu navegador. Nunca viaja a ningún
servidor salvo a la API de NVIDIA (Authorization Bearer), y el puente del mismo
origen (`/historietas/api/…`) solo admite como destino `integrate.api.nvidia.com`.

## Modelo (elegidos tras investigar el catálogo, Oct 2026)

- **Escritura — `moonshotai/kimi-k3`** (recomendado): 2.8T parámetros MoE,
  multimodal, 1M de contexto. Alternas: Nemotron 3 Ultra, DeepSeek V4 Pro,
  GLM 5.3; rápidos: Nemotron 3.5 Lightning, GLM 5.3 Flash.

## Cómo forja un libro (pipeline de TEXTO)

```
Concepto → Biblia → Personajes → Esquema → Escritura (cap a cap)
         → Pase de impacto (capítulos clave) → Libro terminado
```

### Perfeccionar tu propio libro

En **Nueva historia** puedes **arrastrar tu manuscrito** (PDF, DOCX, TXT o MD — o pegar el
texto). El editor literario forense lo analiza y **rellena TODO el encargo
automáticamente**: título, tono, punto de vista, público, tipo de final, época,
premisa, intensidades, género detectado y elenco del original (con ADN visual
para las ilustraciones).

Después decides el nivel de personalización de la mejora:
- **Fidelidad**: Alta (respetar trama, escenas y final) · Equilibrada · Audaz
- **Prosa**: Pulir (toques mínimos) · Editorial · Plena voz de la sala
- **Preservar**: nombres de personajes, tu final, tus escenas clave (checkboxes)
- **Indicaciones de mejora**: pre-llenadas con el diagnóstico honesto del manuscrito

La reescritura usa un **canon de secciones** del original (resumen + cita literal
de cada parte, en orden): el esquema cubre todas las secciones y cada capítulo
recibe las suyas, con la voz literal del autor como referencia.

### Portada del libro (adornos del autor)

En el asistente (paso 4) y desde el lector (**Portada**) puedes escribir el
**autor**, el **año** y la **dedicatoria**. Estos datos viven en la portada
tipográfica de la app y en la primera página del PDF (con página de dedicatoria
propia).

### Descarga en PDF (arriba a la derecha en el lector)

El libro terminado se descarga como **PDF real** generado al vuelo con cero
dependencias: portada con título/subtítulo/autor/año, página de dedicatoria,
**índice con folios reales** (doble pasada de paginación) y capítulos con folio
al pie. Los acentos viajan en WinAnsi con las métricas reales de Helvetica.

- **12 categorías**, cada una con su sala de 6 especialistas con oficio propio
  (showrunner, arquitecto del mundo, psicólogo, tejedor de tramas, prosista y
  cirujano de giros) más el **Guardián de Continuidad** en el pase de impacto.
- **Capítulos**: modo libre (la sala decide 12-22) o **exactos** (se re-pide el
  esquema hasta cuadrar y se ajusta con respaldo determinista).
- **Tu canon es ley**: personajes, objetos, paisajes y situaciones definidos
  con texto se integran con sus nombres exactos en trama y diálogos; su
  **ADN visual** queda guardado como canon para el Taller de Ilustración.
- **Todo controlable a mano**: premisa o "Inspírame", título, tono, POV, época,
  público, 5 intensidades, tipo de final, notas de exigencias, párrafos por
  capítulo, modelo de escritura.
- **Robusta**: checkpoints tras cada paso (reanuda donde iba si recargas o
  pausas), cancelación, reintentos con backoff, modo previsualización
  (forjar solo el capítulo 1 primero), edición de párrafos y reforja por
  capítulo desde el lector.
- **Narración de voz súper realista**: reproductor flotante profesional
  (pausa/detener/progreso), voces neuronales del navegador elegidas
  automáticamente, karaoke en tiempo real palabra a palabra y **memoria de
  lectura** con un clic ("Continuar · 43% · cap 05").
- **Salida**: lector en prosa con TOC, PDF, exportación JSON, **HTML
  autocontenido** e impresión con CSS de imprenta.

## El Taller de Ilustración (Parte 2) — FUNCIONAL

Cuando el texto está terminado, el botón **Ir al Taller** abre la segunda parte:
un sistema profesional de ilustración narrativa con **persistencia real**.

**Qué hace hoy (verificado E2E contra el servidor real):**
- **Sesión privada**: el servidor emite una cookie httpOnly firmada con tu token
  de propietario. Sin sesión, la API deniega TODO (401) — incluidas las imágenes.
- **Fichas permanentes de personajes**: ID estable para toda la novela, ADN
  visual, rasgos invariables/mutables, historial de versiones y estado de
  aprobación. Importa el elenco del libro o crea fichas a mano.
- **Referencias visuales**: sube imágenes por tipo (frontal, lateral, tres
  cuartos, cuerpo completo, expresión), aprueba UNA maestra por tipo — las
  versiones anteriores se conservan siempre.
- **Memoria narrativa**: analiza el capítulo completo (escenas, presentes,
  vestuario, objetos, saltos temporales), distingue hechos del texto de
  interpretaciones de la IA y puedes corregirla a mano.
- **Trabajos paso a paso**: cada llamada al servidor ilustra UN párrafo y
  persiste el avance (patrón serverless): progreso visible, reanudación tras
  cualquier interrupción, sin duplicados, reintentos con tope de intentos.
- **Versionado**: regenerar crea v2 sin borrar v1; la aprobada nunca se pierde.
- **QA automático**: cada ilustración se evalúa por visión contra el párrafo,
  el canon y la referencia aprobada (fail-open: el QA nunca destruye nada).
  La decisión final siempre es del autor: **Confirmar calidad → siguiente capítulo**.

### Persistencia (sin Firebase, sin Google)

| Entorno | Almacenamiento | Qué necesitas |
|---|---|---|
| **Vercel (producción)** | **Vercel Blob** — imágenes Y metadatos JSON con claves persistentes (`projects/<id>/…`) | Una credencial gratuita: `BLOB_READ_WRITE_TOKEN` |
| **Local (server.js)** | **Sistema de archivos** en `data/` (gitignored) — persistente en tu máquina | Nada: el token se genera e imprime en consola |

### Configuración de Vercel (5 minutos, sin código)

1. **Instalar dependencia** (ya añadida a `package.json`): el próximo `npm install`/deploy la trae (`@vercel/blob`).
2. **Crear el Blob Store**: Vercel → tu proyecto → *Storage* → *Blob* → Create (plan gratuito). Vercel crea la variable `BLOB_READ_WRITE_TOKEN` automáticamente.
3. **Variables de entorno** (Vercel → Settings → Environment Variables):
   - `HISTORIETAS_STUDIO_TOKEN` — un secreto largo que TÚ eliges (p. ej. `openssl rand -hex 32`). Es el token de inicio de sesión del Taller.
   - `NVIDIA_API_KEY` — tu clave `nvapi-…` **del lado del servidor** (nunca más en el navegador).
   - Opcionales: `HISTORIETAS_IMAGE_MODEL` (por defecto `black-forest-labs/flux.2-klein-4b`), `HISTORIETAS_TEXT_MODEL` (`moonshotai/kimi-k3`), `HISTORIETAS_PROVIDER` (`nvidia` | `mock` | `none`).
4. **Desplegar**: `git push` — el rewrite `/historietas/api/studio/*` ya vive en `next.config.ts`.

### En local (ABRIR-HISTORIETAS.bat)

- El servidor genera tu token de desarrollo en `data/studio-token.txt` y lo imprime en consola la primera vez.
- Con `set HISTORIETAS_PROVIDER=mock && node server.js` pruebas TODO el flujo sin gastar créditos (PNG de prueba etiquetado); con `NVIDIA_API_KEY` en el entorno genera de verdad.

### Verificado vs pendiente de credenciales

| Verificado (131 pruebas + E2E HTTP contra el servidor real) | Requiere tus credenciales |
|---|---|
| Persistencia local real (archivos en disco sobreviven), Vercel Blob (contrato idéntico — driver probado en tests de contrato), sesión httpOnly, fichas, referencias, memoria narrativa, trabajos paso a paso, versiones, QA fail-open, assets privados, límites de tamaño y rate | Generación con NVIDIA real (necesita `NVIDIA_API_KEY` en el servidor), Blob en producción (necesita `BLOB_READ_WRITE_TOKEN` en Vercel), análisis narrativo con Kimi real |

## Estructura

```
public/historietas/
├── index.html            shell SPA (hash router)
├── css/                  tokens + base + vistas
├── js/
│   ├── core/             utils, events, store, db (IndexedDB), router, app, draft
│   ├── api/              models.mjs (catálogo de texto), client.mjs (NVIDIA NIM texto)
│   ├── domain/           book.mjs, assets.mjs, continuity.mjs, manuscript.mjs
│   ├── specialists/      shared.mjs + 12 categorías + registry.mjs
│   ├── prompts/          writers.mjs (6 fases de texto)
│   ├── export/           pdf.mjs (generador de PDF puro, cero dependencias)
│   ├── studio/            state.mjs (modelo del Taller de Ilustración — Parte 2)
│   ├── engine/            pipeline.mjs (orquestador), tts.mjs (narración con karaoke)
│   ├── ui/                components + 6 vistas (biblioteca, asistente, forja, lector, taller, ajustes)
│   └── main.mjs          arranque y rutas
├── server.js             standalone + puente CORS (puerto 9130)
├── ABRIR-HISTORIETAS.bat
├── tests/                131 pruebas Node + E2E HTTP (tests/e2e-taller.mjs)
├── AGENTS.md             mapa técnico para IA
└── README.md
```

Convenciones: módulos ES `.mjs` (mismos archivos en navegador y Node), cero
dependencias, sin build. Ver `AGENTS.md` para el detalle por módulo y cómo extender.
