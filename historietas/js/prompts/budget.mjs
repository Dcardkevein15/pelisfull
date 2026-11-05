/* budget.mjs — el presupuesto REAL de la API: 800 caracteres máximo.
   ANTI-GEMELAS: la escena domina (mínimo 160 chars), el ADN jamás cae. */

export const PROMPT_MAX = 800;
export const AVOID_COMPACT = 'No text, no letters, no speech bubbles, no watermark; anatomically correct hands.';

const CLAUSULA_CONSISTENCIA = 'consistent character design across all panels: identical faces, identical wardrobe, coherent environment continuity';
const CLAUSULA_CORTA = 'consistent character design';

export function clipWords(txt, max) {
  const t = String(txt || '');
  if (t.length <= max) return t;
  if (max <= 0) return '';
  const cut = t.slice(0, Math.max(0, max));
  const i = cut.lastIndexOf(' ');
  const base = i > max * 0.6 ? cut.slice(0, i) : cut;
  return base.replace(/[\s,;:.]+$/, '').trimEnd();
}

export function dnaCapPara(n) {
  if (n >= 3) return 110;
  if (n === 2) return 150;
  return 180;
}

function styleForLevel(style, level) {
  let s = String(style || '');
  if (level === 'nolight' || level === 'lean') s = s.replace(/,?\s*lighting: [^]*?(?=, consistent character design)/, '');
  if (level === 'lean') s = s.replace(CLAUSULA_CONSISTENCIA, CLAUSULA_CORTA);
  return s;
}

function montarPanel(p, n) {
  const style = styleForLevel(p.style, n.style);
  const avoid = n.avoid === 'compact' ? AVOID_COMPACT : String(p.avoid || '');
  const dna = (p.dnaLines || []).map((l) => '- ' + clipWords(l, n.dnaCap)).join(' ');
  const chars = dna ? 'Characters in frame (EXACT canonical design, identical faces and wardrobe): ' + dna : '';
  const base = [
    p.refLine, style + '.', n.quality ? p.quality : '', p.panelLine, p.cameraLine,
    p.locationLine, p.lightLine, p.moodLine, chars, p.correctionLine, avoid,
  ].filter(Boolean);
  const disponible = PROMPT_MAX - base.join(' ').length - 1;
  const sceneLine = disponible > 12 ? 'Scene: ' + clipWords(p.sceneText, disponible - 8) : '';
  const sceneLen = disponible > 12 ? sceneLine.length : 0;
  const prompt = [
    p.refLine, style + '.', n.quality ? p.quality : '', p.panelLine, p.cameraLine,
    sceneLine, p.locationLine, p.lightLine, p.moodLine, chars, p.correctionLine, avoid,
  ].filter(Boolean).join(' ');
  return { prompt, sceneLen };
}

export function ensamblarPanel(p) {
  const capBase = dnaCapPara((p.dnaLines || []).length);
  const niveles = [
    { quality: true, style: 'full', avoid: 'full', dnaCap: capBase },
    { quality: false, style: 'full', avoid: 'full', dnaCap: capBase },
    { quality: false, style: 'nolight', avoid: 'full', dnaCap: capBase },
    { quality: false, style: 'lean', avoid: 'full', dnaCap: capBase },
    { quality: false, style: 'lean', avoid: 'compact', dnaCap: capBase },
    { quality: false, style: 'lean', avoid: 'compact', dnaCap: 120 },
    { quality: false, style: 'lean', avoid: 'compact', dnaCap: 90 },
  ];
  const escenaIdeal = Math.min(String(p.sceneText || '').length, 160);
  let ultimo = null;
  for (let i = 0; i < niveles.length; i++) {
    ultimo = montarPanel(p, niveles[i]);
    if (ultimo.prompt.length <= PROMPT_MAX && (ultimo.sceneLen >= escenaIdeal || i === niveles.length - 1)) {
      return ultimo.prompt;
    }
  }
  return clipWords(ultimo.prompt, PROMPT_MAX - 1).trimEnd();
}

export function ensamblarHoja(h) {
  const niveles = [
    { style: true, tail: h.tail, dnaCap: 420 },
    { style: true, tail: 'head and shoulders, facing viewer, neutral background', dnaCap: 420 },
    { style: false, tail: 'head and shoulders, facing viewer, neutral background', dnaCap: 420 },
    { style: false, tail: 'head and shoulders, facing viewer, neutral background', dnaCap: 240 },
    { style: false, tail: 'head and shoulders, neutral background', dnaCap: 160 },
  ];
  let ultimo = '';
  for (const n of niveles) {
    const dna = clipWords(h.base, n.dnaCap);
    ultimo = [n.style ? h.style : '', h.head + ': ' + dna, n.tail, h.quality].filter(Boolean).join('. ');
    if (ultimo.length <= PROMPT_MAX) return ultimo;
  }
  return clipWords(ultimo, PROMPT_MAX - 1).trimEnd();
}
