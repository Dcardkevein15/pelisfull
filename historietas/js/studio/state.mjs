/* state.mjs — modelo del Taller de Ilustración (Parte 2 del sistema).
   FILOSOFÍA: UN CAPÍTULO POR SESIÓN. Las imágenes de un capítulo se crean
   en su sesión; solo cuando su calidad está CONFIRMADA se desbloquea el
   siguiente. Nada de forjar el libro entero de imágenes de golpe.
   Este módulo es 100 % PURO (funciones sobre objetos) para poder construir
   y testear las funciones internas de ilustración en la siguiente sesión
   sin tocar vistas ni almacenamiento. Persistencia: `book.studio` (JSON
   del libro en IndexedDB) — las imágenes binarias vivirán en el store de
   imágenes con claves propias del Taller. */

export const CAP_ESTADOS = ['pendiente', 'en_curso', 'ilustrado', 'confirmado'];

/** Crea el estado del Taller para un libro escrito. */
export function createStudioState(book) {
  const chapters = (book.chapters || []).map((c, idx) => ({
    idx,
    escrito: !!c.escrito,
    estado: c.escrito ? 'pendiente' : 'pendiente',
    parrafos: (c.paragraphs || []).map((p) => ({
      paraId: p.id,
      estado: 'pendiente',   // pendiente | generando | ok | error
    })),
  }));
  return { version: 1, actual: 0, capitulos: chapters };
}

/** Normaliza estados heredados o corruptos (libros viejos, JSON a medias). */
export function normalizeStudio(book, raw) {
  const base = createStudioState(book);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.capitulos)) return base;
  base.actual = Math.max(0, Number(raw.actual) || 0);
  raw.capitulos.forEach((rc, i) => {
    const bc = base.capitulos[i];
    if (!bc) return;
    if (CAP_ESTADOS.includes(rc.estado)) bc.estado = rc.estado;
    (rc.parrafos || []).forEach((rp, j) => {
      if (bc.parrafos[j] && rp.paraId === bc.parrafos[j].paraId) {
        bc.parrafos[j].estado = ['pendiente', 'generando', 'ok', 'error'].includes(rp.estado) ? rp.estado : 'pendiente';
      }
    });
  });
  return base;
}

/** Índice del capítulo de la sesión actual: el primero SIN confirmar. */
export function capituloActual(state) {
  const caps = state?.capitulos || [];
  for (let i = 0; i < caps.length; i++) {
    if (caps[i].estado !== 'confirmado') return i;
  }
  return caps.length - 1; // todo confirmado: el último
}

/** ¿Se puede abrir la sesión de ilustración de este capítulo?
 *  Regla de la casa: SOLO el capítulo actual (nunca saltar por delante). */
export function puedeIlustrar(state, idx) {
  const caps = state?.capitulos || [];
  if (idx < 0 || idx >= caps.length) return false;
  if (!caps[idx].escrito) return false;
  return idx === capituloActual(state);
}

/** Marca un capítulo como ilustrado (sus imágenes existen, falta confirmar). */
export function marcarIlustrado(state, idx) {
  const caps = state.capitulos;
  if (idx < 0 || idx >= caps.length) return state;
  if (caps[idx].estado === 'confirmado') return state; // lo confirmado no se toca
  caps[idx].estado = 'ilustrado';
  for (const p of caps[idx].parrafos) p.estado = p.estado === 'pendiente' ? 'ok' : p.estado;
  return state;
}

/** Confirma la calidad de un capítulo y avanza la sesión al siguiente. */
export function confirmarCapitulo(state, idx) {
  const caps = state.capitulos;
  if (idx < 0 || idx >= caps.length) return state;
  if (caps[idx].estado !== 'ilustrado') return state; // solo se confirma lo ilustrado
  caps[idx].estado = 'confirmado';
  state.actual = Math.min(caps.length - 1, idx + 1);
  return state;
}

/** Progreso del Taller: confirmados / total y porcentaje. */
export function progreso(state) {
  const caps = state?.capitulos || [];
  const confirmados = caps.filter((c) => c.estado === 'confirmado').length;
  return {
    confirmados,
    total: caps.length,
    pct: caps.length ? Math.round((confirmados / caps.length) * 100) : 0,
  };
}

export const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  en_curso: 'En sesión',
  ilustrado: 'Ilustrado',
  confirmado: 'Confirmado',
};
