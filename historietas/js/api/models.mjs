/* models.mjs — catálogo curado TEXT_MODELS + IMAGE_MODELS (NVIDIA NIM). */

export const NVIDIA_TEXT_HOST = 'https://integrate.api.nvidia.com/v1';
export const NVIDIA_GENAI_HOST = 'https://ai.api.nvidia.com/v1/genai';

const DIMS_KLEIN = { '16:9': [1344, 768], '9:16': [768, 1344], '1:1': [1024, 1024], '4:3': [1280, 960], '3:4': [960, 1280] };
const DIMS_SCHNELL = { '16:9': [1344, 768], '9:16': [768, 1344], '1:1': [1024, 1024], '4:3': [1152, 896], '3:4': [896, 1152] };
const DIMS_STD = { '16:9': [1344, 768], '9:16': [768, 1344], '1:1': [1024, 1024], '4:3': [1152, 896], '3:4': [896, 1152] };

export const IMAGE_MODELS = [
  { id: 'black-forest-labs/flux.2-klein-4b', nombre: 'FLUX.2 Klein 4B', tipo: 'flux2', refs: false, supportsNegative: false, desc: 'El más nuevo (2026) y rapidísimo. Coherencia por ADN + semilla + Guardián Visual.', recomendado: true, dims: DIMS_KLEIN },
  { id: 'black-forest-labs/flux.1-schnell', nombre: 'FLUX.1 Schnell', tipo: 'schnell', refs: false, supportsNegative: false, desc: 'Probado y rapidísimo (4 pasos).', dims: DIMS_SCHNELL },
  { id: 'black-forest-labs/flux.1-kontext-dev', nombre: 'FLUX.1 Kontext Dev', tipo: 'kontext', refs: true, supportsNegative: false, desc: 'Coherencia REAL por imagen: ancla cada panel a la hoja de personaje. Licencia no comercial.', dims: DIMS_STD },
  { id: 'stabilityai/stable-diffusion-3.5-large', nombre: 'Stable Diffusion 3.5 Large', tipo: 'sd35', refs: false, supportsNegative: true, desc: 'Estética pictórica, 30 pasos, negative_prompt nativo.', dims: DIMS_STD },
];

export const ASPECTS = ['16:9', '9:16', '1:1', '4:3', '3:4'];

export const TEXT_MODELS = [
  { id: 'nvidia/nemotron-3.5-lightning-30b-a3b', nombre: 'Nemotron 3.5 Lightning · 30B', tier: 'rapida', multimodal: false, ctx: 'largo', desc: 'MoE ultrarrápido, verificado funcionando ahora.', recomendado: true },
  { id: 'z-ai/glm-5.3', nombre: 'GLM 5.3', tier: 'maxima', multimodal: false, ctx: 'largo', desc: 'Generalista de primer nivel, prosa fluida. Verificado funcionando.' },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b', nombre: 'Nemotron 3 Ultra · 550B', tier: 'maxima', multimodal: false, ctx: '1M', desc: 'Razonamiento frontera de NVIDIA. Verificado funcionando.' },
  { id: 'openai/gpt-oss-20b', nombre: 'GPT-OSS 20B', tier: 'equilibrada', multimodal: false, ctx: 'largo', desc: 'Modelo abierto de OpenAI. Verificado funcionando.' },
  { id: 'minimaxai/minimax-m3.1-flash', nombre: 'MiniMax M3.1 Flash', tier: 'rapida', multimodal: false, ctx: 'largo', desc: 'Rápido y verificado funcionando.' },
];

export const textModelInfo = (id) => TEXT_MODELS.find((m) => m.id === id) || null;
export const imageModelInfo = (id) => IMAGE_MODELS.find((m) => m.id === id) || null;
export const isMultimodal = (id) => !!textModelInfo(id)?.multimodal;

export function imageDims(modelId, aspect) {
  const m = imageModelInfo(modelId) || imageModelInfo('black-forest-labs/flux.2-klein-4b');
  return m.dims[aspect] || m.dims['16:9'];
}
