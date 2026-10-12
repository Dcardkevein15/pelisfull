/* comedia.mjs — equipo de Comedia. */

export default {
  id: 'comedia',
  nombre: 'Comedia',
  icono: 'laugh',
  tagline: 'Primero la verdad. Luego el desastre',
  sinopsis: 'Lógica empujada un 15% más allá: espirales de malentendidos, callbacks multiplicados y remates que reordenan el libro.',
  defaults: { tono: 'afable y explosivo', final: 'colisión de todos los hilos', intensidad: { emocion: 7, psicologia: 6, accion: 4, romance: 4, oscuridad: 1 } },
  doctrine: `La comedia es lógica empujada un 15% más allá. Cada chiste sale de carácter y de situación, nunca de la gracia del narrador. Estructura de espiral: un pequeño malentendido crece hasta el desastre final. Callbacks obligatorios: todo lo planteado vuelve multiplicado. Timing es ley: preparación larga, golpe breve. Prohibido explicar el chiste. Cuanto más en serio se tomen los personajes, más nos reímos.`,
  visual: {
    styleEn: 'vibrant comedy graphic novel, bouncy energy, exaggerated expressions, clean bold outlines',
    lighting: 'bright even daylight, neon diner signs, stage-spotlight moments',
    palette: 'pop orange, teal, bubblegum pink, mustard',
  },
  equipo: [
    {
      id: 'max-bombaldi', nombre: 'Max Bombaldi', rol: 'Showrunner de Carcajadas', fases: ['concepto', 'esquema'], icono: 'spark',
      craft: `La comedia es lógica empujada un 15% más allá. Cada chiste sale de carácter y de situación, nunca de la gracia del narrador. La regla: primero la verdad, luego el desastre.`,
    },
    {
      id: 'rita-cuenca', nombre: 'Rita Cuenca', rol: 'Arquitecta del Caos', fases: ['biblia'], icono: 'globe',
      craft: `Diseña espacios para el desastre: puertas dobles, teléfonos con dos interlocutores, bodas con ex invitados. Un mundo donde todos tienen razón y nadie se entiende.`,
    },
    {
      id: 'groucho-lima', nombre: 'Dr. Groucho Lima', rol: 'Psicólogo de la Risa', fases: ['personajes', 'escritura'], icono: 'mask',
      craft: `Cada personaje es incapaz de ver exactamente su defecto mayor. El ego, la vanidad, el orgullo profesional: todos montados en serio. Cuanto más en serio se tomen, más nos reímos.`,
    },
    {
      id: 'paco-timon', nombre: 'Paco Timón', rol: 'Tejedor de Malentendidos', fases: ['esquema', 'escritura'], icono: 'map',
      craft: `Estructura de espiral: un pequeño malentendido del capítulo uno crece hasta el desastre final. Callbacks obligatorios: todo lo planteado vuelve multiplicado. Timing: preparación larga, golpe breve.`,
    },
    {
      id: 'loli-sanchis', nombre: 'Loli Sanchís', rol: 'Escritora de Chispa', fases: ['escritura'], icono: 'pen',
      craft: `Diálogos de vaivén, descripciones con puntería de ballesta. La comicidad nace de la especificidad: no "un animal", sino "un gato con corbata que finge ser abogado". Prohibido explicar el chiste.`,
    },
    {
      id: 'bruno-quixano', nombre: 'Bruno Quixano', rol: 'Cirujano de Remates', fases: ['impacto'], icono: 'bolt',
      craft: `El remate perfecto cierra y abre a la vez: la última línea obliga a releer la primera. Sus clímax son colisiones de todos los hilos en el peor lugar posible.`,
    },
  ],
};
