# Historietas — Fábrica de Historias Magistrales

> Doce salas de especialistas literarios forjan libros ilustrados completos:
> título, subtítulo, tabla de contenido, capítulos y **un panel por párrafo** con
> personajes coherentes de la primera a la última página.

App 100 % estática (HTML + CSS + JS, sin build, sin dependencias) que vive en
`public/historietas/` y se sirve en **`/historietas`** del monorepo. También
funciona standalone con `ABRIR-HISTORIETAS.bat`.

---

## Arranque

| Modo | Cómo | URL |
|---|---|---|
| Integrado (recomendado) | el servidor Next del monorepo ya la sirve; los rewrites de `next.config.ts` puentean la API | `http://localhost:9002/historietas` |
| Standalone | doble clic en `ABRIR-HISTORIETAS.bat` (arranca `server.js`, puerto 9130, con puente CORS) | `http://localhost:9130/` |
| Tests (Node 18+) | `node --test tests/*.test.mjs` | 132 pruebas, sin red |

## Clave de API (gratuita)

1. Entra en **https://build.nvidia.com** → *Get API Key* (clave `nvapi-…`, créditos de prueba gratuitos).
2. En la app: **Ajustes** → pega la clave → *Ejecutar diagnóstico*.

La clave se guarda solo en `localStorage` de tu navegador. Nunca viaja a ningún
servidor salvo a la API de NVIDIA (Authorization Bearer), y el puente del mismo
origen (`/historietas/api/…`) solo admite como destino `integrate.api.nvidia.com`
y `ai.api.nvidia.com`.

## Modelos (elegidos tras investigar el catálogo, Oct 2026)

- **Escritura — `moonshotai/kimi-k3`** (recomendado): 2.8T parámetros MoE, multimodal
  (entiende las imágenes que subas), 1M de contexto. Alternas: Nemotron 3 Ultra 550B,
  DeepSeek V4 Pro, GLM 5.3; rápidos: Nemotron 3.5 Lightning, GLM 5.3 Flash.
- **Paneles — `black-forest-labs/flux.2-klein-4b`** (recomendado): el más nuevo y rapidísimo.
  La coherencia de personajes se sostiene con ADN visual canónico + semilla determinista.
  Alternas: FLUX.1 Schnell (4 pasos), FLUX.1 Kontext (reencuadra un panel manteniendo
  al personaje idéntico), SD 3.5 Large. Nota técnica: el endpoint alojado valida
  `width`/`height` contra una lista cerrada y rechaza el campo `image` — la app usa
  solo dimensiones del esquema oficial y coherencia por ADN+semilla.

## Cómo forja un libro (pipeline)

```
Concepto → Biblia → Personajes → Esquema → Escritura (cap a cap)
        → Pase de impacto (capítulos clave) → Guion visual → Paneles → Listo
```

### Perfeccionar tu propio libro (nuevo)

En **Nueva historia** puedes **arrastrar tu manuscrito** (PDF, DOCX, TXT o MD — o pegar el
texto). El editor literario forense de la sala lo analiza y **rellena TODO el encargo
automáticamente**: título, tono, punto de vista, público, tipo de final, época, premisa,
intensidades, género detectado y elenco del original (con ADN visual para los paneles).

Después decides el nivel de personalización de la mejora:
- **Fidelidad**: Alta (respetar trama, escenas y final) · Equilibrada · Audaz (reimaginar)
- **Prosa**: Pulir (toques mínimos) · Editorial · Plena voz de la sala
- **Preservar**: nombres de personajes, tu final, tus escenas clave (checkboxes)
- **Indicaciones de mejora**: pre-llenadas con el diagnóstico honesto del manuscrito
  (fortalezas y debilidades detectadas) y editables.

La reescritura usa un **canon de secciones** del original (resumen + cita literal de cada
parte, en orden): el esquema cubre todas las secciones y cada capítulo recibe las suyas,
con la voz literal del autor como referencia. Novelas largas se digieren por partes y se
sintetizan automáticamente. El flujo manual original sigue intacto.

- **12 categorías**, cada una con su **sala de 6 especialistas** con oficio propio
  (showrunner, arquitecto del mundo, psicólogo, tejedor de tramas, prosista y
  cirujano de giros) más la **Directora Visual** y el **Guardián de Continuidad**.
- **Capítulos**: modo libre (la sala decide 12-22) o **exactos** (15, 20, 25 o los que
  digas — se re-pide el esquema hasta cuadrar y se ajusta con respaldo determinista).
- **Un panel por párrafo**: ADN visual canónico (apariencia + vestuario bloqueados),
  semilla determinista por párrafo, cámaras que sirven al **beat narrativo**
  (pools por rol: diálogo → planos de conversación, acción → tracking/contrapicados,
  revelación → detallísimos) y estilo visual de la categoría bloqueado en cada prompt,
  con una sola fuente de paleta (la biblia de la obra manda).
- **Hojas de personaje**: la forja dibuja un retrato canónico de cada personaje
  antes que los paneles. Con FLUX.1 Kontext ese retrato viaja como **imagen ancla
  de cada panel** (caras idénticas de verdad); con FLUX.2 Klein es la referencia
  facial del Guardián Visual y puedes regenerarla desde el lector.
- **Guardián Visual (QA por visión)**: tras generar cada panel, el modelo multimodal
  lo inspecciona contra el ADN, la escena pedida y las hojas de personaje; si detecta
  texto pintado, caras fuera de canon o anatomía rota, **re-dibuja el panel con
  corrección quirúrgica automática** (1 intento; fail-open: nunca tumba la forja).
- **Lettering de cómic real**: los diálogos del párrafo se componen como **globos
  CON DUEÑO sobre el panel** — la Directora Visual atribuye cada cita exacta a su
  personaje (chip con su nombre, 1.º hablante a la izquierda, 2.º a la derecha,
  máx. 2 por viñeta para legibilidad perfecta). Overlay HTML determinista — nunca
  se le pide texto al modelo de imagen. Conmutable en la barra del lector.
- **Prueba de continuidad con un clic** (Ajustes → Diagnóstico): genera **2 paneles
  consecutivos** del mismo personaje con las semillas consecutivas de un libro real,
  verifica que comparten ADN canónico y estilo, y el **Guardián Visual compara el
  panel 2 contra el panel 1** — comprueba tú mismo que cada imagen continúa a la
  anterior antes de forjar el libro entero.
- **Páginas de cómic**: en modo Cómic y pantallas anchas los paneles forman una
  retícula de viñetas; los **splash** (momento cumbre del capítulo) abren la página
  completa, y los primeros planos bajan a 4:3 íntimo en libros 16:9.
- **Auto-ablandado del filtro de contenido**: si la API rechaza una escena
  (CONTENT_FILTERED), la sala la reescribe menos gráfica y reintenta sola.
- **Narración de voz súper realista**: cada párrafo tiene su botón circular
  **▶**, y al narrar aparece un **reproductor flotante profesional** (glass +
  degradado ámbar, ecualizador animado, pausa/detener, barra de progreso del
  libro). El libro se narra solo con las **voces neuronales del navegador** —
  instantáneas y gratis; en Edge/Chrome son las "Online Natural" de Microsoft,
  elegidas automáticamente, con selector de voz y velocidad. El texto **se pinta
  de amarillo EN TIEMPO REAL** palabra a palabra (interpolación por frase
  recalibrada por cada palabra real — funciona incluso con voces que no
  disparan eventos), la app **recuerda por dónde quedaste** (porcentaje global
  y barras por capítulo en el índice) y el chip **"Continuar"** te devuelve en
  un clic a la frase exacta. (NVIDIA NIM no ofrece TTS hospedado — verificado
  contra su referencia oficial; las voces del navegador son la mejor voz real
  disponible sin coste ni latencia.)
- **Modo previsualización**: en el asistente puedes forjar **solo el capítulo 1**
  primero, revisarlo en el lector y continuar la forja completa con un clic.
- **Tu canon es ley**: sube imágenes de personajes, objetos, paisajes o define
  situaciones con texto; el modelo multimodal extrae su ADN visual y la sala los
  integra con sus nombres exactos en trama, diálogos y paneles. El asistente te
  avisa si algún personaje del elenco se forja sin su retrato.
- **Todo controlable a mano**: premisa o "Inspírame", título, tono, POV, época,
  público, 5 intensidades (emoción/psicología/acción/romance/oscuridad), tipo de
  final, notas de exigencias, párrafos por capítulo, formato de panel, modelos,
  Guardián Visual y hojas de personaje (Ajustes).
- **Robusta**: checkpoints tras cada paso (reanuda donde iba si recargas o pausas),
  cancelación, reintentos con backoff, tolerancia a paneles fallidos, re-rolls y
  cambio de encuadre por panel desde el lector, reescritura completa por capítulo,
  barra de progreso honesta (estimación exacta por capítulo escrito).
- **Salida**: lector en modo Cómic o Novela con TOC, exportación JSON,
  **HTML autocontenido** (imágenes incrustadas) e impresión/PDF con CSS de imprenta.

## Estructura

```
public/historietas/
├── index.html            shell SPA (hash router)
├── css/                  tokens + base + vistas
├── js/
│   ├── core/             utils, events, store, db (IndexedDB), router, app
│   ├── api/              models.mjs (catálogo), client.mjs (NVIDIA NIM)
│   ├── domain/           book.mjs, assets.mjs, continuity.mjs, lettering.mjs
│   ├── specialists/      shared.mjs + 12 categorías + registry.mjs
│   ├── prompts/          writers.mjs (7 fases), images.mjs (paneles)
│   ├── engine/           pipeline.mjs (orquestador), imagegen.mjs (fábrica de paneles), panelqa.mjs (Guardián Visual), tts.mjs (narración con karaoke)
│   ├── ui/               components + 5 vistas (biblioteca, asistente, forja, lector, ajustes)
│   └── main.mjs          arranque y rutas
├── server.js             standalone + puente CORS (puerto 9130)
├── ABRIR-HISTORIETAS.bat
├── tests/                132 pruebas Node (sin red, cliente simulado)
├── AGENTS.md             mapa técnico para IA
└── README.md
```

Convenciones: módulos ES `.mjs` (mismos archivos en navegador y Node), cero
dependencias, sin build. Ver `AGENTS.md` para el detalle por módulo y cómo extender.
