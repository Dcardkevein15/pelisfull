/* models.mjs — catálogo curado de modelos de texto NVIDIA NIM (build.nvidia.com).
   v3.0: la app es SOLO TEXTO — el catálogo de imágenes se retiró con la fase
   de paneles. El Taller de Ilustración (Parte 2) traerá SU propio catálogo.
   Todos funcionan con la clave gratuita nvapi-… de build.nvidia.com.
   Investigado el 2026-10-04 contra docs.api.nvidia.com y build.nvidia.com. */

export const NVIDIA_TEXT_HOST = 'https://integrate.api.nvidia.com/v1';

/* ---------- TEXTO / RAZONAMIENTO / VISIÓN ---------- */
export const TEXT_MODELS = [
  {
    id: 'moonshotai/kimi-k3',
    nombre: 'Kimi K3 · 2.8T MoE',
    tier: 'maxima',
    multimodal: true,
    ctx: '1M',
    desc: 'El más inteligente del catálogo gratuito. 104B activos, razona siempre, entiende imágenes y escribe con matiz literario. Recomendado.',
    recomendado: true,
  },
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b',
    nombre: 'Nemotron 3 Ultra · 550B',
    tier: 'maxima',
    multimodal: false,
    ctx: '1M',
    desc: 'Razonamiento frontera de NVIDIA (55B activos, MambaMoE híbrido). Planificación de tramas impecable.',
  },
  {
    id: 'deepseek-ai/deepseek-v4-pro',
    nombre: 'DeepSeek V4 Pro',
    tier: 'maxima',
    multimodal: false,
    ctx: 'largo',
    desc: 'Razonamiento profundo, excelentes giros y lógica de trama.',
  },
  {
    id: 'z-ai/glm-5.3',
    nombre: 'GLM 5.3',
    tier: 'maxima',
    multimodal: false,
    ctx: 'largo',
    desc: 'Generalista de primer nivel, prosa fluida y natural.',
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b',
    nombre: 'Nemotron 3 Super · 120B',
    tier: 'equilibrada',
    multimodal: false,
    ctx: 'largo',
    desc: 'Equilibrio calidad/velocidad para capítulos largos.',
  },
  {
    id: 'openai/gpt-oss-120b',
    nombre: 'GPT-OSS 120B',
    tier: 'equilibrada',
    multimodal: false,
    ctx: 'largo',
    desc: 'Modelo abierto de OpenAI, estilo versátil.',
  },
  {
    id: 'nvidia/nemotron-3.5-lightning-30b-a3b',
    nombre: 'Nemotron 3.5 Lightning · 30B',
    tier: 'rapida',
    multimodal: false,
    ctx: 'largo',
    desc: 'MoE ultrarrápido (3B activos): ideación y borradores instantáneos.',
  },
  {
    id: 'z-ai/glm-5.3-flash',
    nombre: 'GLM 5.3 Flash',
    tier: 'rapida',
    multimodal: false,
    ctx: 'largo',
    desc: 'Respuesta inmediata para premisas y esbozos.',
  },
  {
    id: 'meta/llama-3.3-70b-instruct',
    nombre: 'Llama 3.3 70B',
    tier: 'rapida',
    multimodal: false,
    ctx: '128K',
    desc: 'Clásico estable como respaldo universal.',
  },
];

export const textModelInfo = (id) => TEXT_MODELS.find((m) => m.id === id) || null;
export const isMultimodal = (id) => !!textModelInfo(id)?.multimodal;
