/* registry.mjs — índice de categorías y sus equipos de especialistas.
   Resuelve qué especialistas participan en cada fase y compone sus prompts. */

import thriller from './categories/thriller.mjs';
import misterio from './categories/misterio.mjs';
import romantica from './categories/romantica.mjs';
import scifi from './categories/scifi.mjs';
import fantasia from './categories/fantasia.mjs';
import horror from './categories/horror.mjs';
import drama from './categories/drama.mjs';
import aventura from './categories/aventura.mjs';
import historica from './categories/historica.mjs';
import comedia from './categories/comedia.mjs';
import infantil from './categories/infantil.mjs';
import noir from './categories/noir.mjs';
import { CONTINUITY_GUARDIAN, composeSystemPrompt } from './shared.mjs';

export const CATEGORIES = [
  thriller, misterio, romantica, scifi, fantasia, horror,
  drama, aventura, historica, comedia, infantil, noir,
];

export const SPECIALISTS = CATEGORIES.flatMap((c) => c.equipo);

export function getCategory(id) {
  return CATEGORIES.find((c) => c.id === id) || null;
}

export function getSpecialist(id) {
  return SPECIALISTS.find((s) => s.id === id) || null;
}

/** Especialistas de una categoría (equipo propio + Guardián de Continuidad). */
export function fullTeam(category) {
  return [...category.equipo, CONTINUITY_GUARDIAN];
}

/** Miembros del equipo que trabajan en una fase concreta. */
export function teamForPhase(category, phase) {
  const own = category.equipo.filter((s) => s.fases.includes(phase));
  const shared = [VISUAL_DIRECTOR, CONTINUITY_GUARDIAN].filter((s) => s.fases.includes(phase));
  if (phase === 'impacto' && !own.length) {
    // respaldo: cualquier cirujano del género
    return [...category.equipo.filter((s) => /cirujan/i.test(s.rol)), ...shared];
  }
  return [...own, ...shared];
}

const PHASE_NAMES = {
  concepto: 'Concepto y promesa',
  biblia: 'Biblia narrativa y mundo',
  personajes: 'Diseño de personajes y psicología',
  esquema: 'Arquitectura del esquema capítulo a capítulo',
  escritura: 'Escritura del capítulo',
  impacto: 'Pase de impacto y giros',
};

/** Prompt de sistema completo para una fase. */
export function phaseSystemPrompt(category, phase, extra = '') {
  const team = teamForPhase(category, phase);
  return composeSystemPrompt({
    doctrine: category.doctrine,
    specialists: team,
    phaseName: PHASE_NAMES[phase] || phase,
    extra,
  });
}

/** Créditos legibles de todos los que firman el libro. */
export function creditsFor(category) {
  const seen = new Set();
  const out = [];
  for (const s of fullTeam(category)) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}
