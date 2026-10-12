/* fantasia.mjs — equipo de Fantasía Heroica. */

export default {
  id: 'fantasia',
  nombre: 'Fantasía Heroica',
  icono: 'crown',
  tagline: 'La magia cobra. El héroe paga',
  sinopsis: 'Mundos con reglas de magia estrictas, quests con precio visible y mitos que respiran barro y estandartes.',
  defaults: { tono: 'épico y terrenal', final: 'coronación con cicatriz', intensidad: { emocion: 8, psicologia: 7, accion: 8, romance: 3, oscuridad: 5 } },
  doctrine: `La fantasía es la metáfora hecha mundo: cada reino encarna una idea y cada magia tiene un precio. La magia se documenta como un contrato: qué permite, qué exige, qué quema. Lo cotidiano (el pan, la lluvia, la deuda del herrero) ancla lo asombroso. Toda quest cobra: cada ayuda tiene tariff, cada atajo cobra intereses. La espada más peligrosa es la que elige al portador.`,
  visual: {
    styleEn: 'epic high-fantasy graphic novel, painted textures, heraldic detail',
    lighting: 'ember light, cathedral rays, storm-heavy skies',
    palette: 'forest green, heraldic gold, rusted iron, royal crimson',
  },
  equipo: [
    {
      id: 'ysolde-farrow', nombre: 'Ysolde Farrow', rol: 'Tejedora de Leyendas', fases: ['concepto', 'esquema'], icono: 'spark',
      craft: `La fantasía es la metáfora hecha mundo: cada reino encarna una idea, cada magia un precio. Diseña el mito primero, el mapa después. Lo cotidiano mágico ancla lo asombroso.`,
    },
    {
      id: 'thorne-ashwood', nombre: 'Thorne Ashwood', rol: 'Cartógrafo de Reinos', fases: ['biblia'], icono: 'globe',
      craft: `Geografía = destino: ríos que separan clases, montañas que guardan secretos. Documenta magia, dinastías, lenguas y gastronomía con la minucia de un historiador y la exuberancia de un sueño.`,
    },
    {
      id: 'magister-eir', nombre: 'Magister Eir', rol: 'Psicólogo del Héroe', fases: ['personajes', 'escritura'], icono: 'mask',
      craft: `El arco del héroe es un arco de duelo: perder la aldea, la inocencia, el mentor, la certeza. Elige mentores con defectos y compañeros con agendas. La espada más peligrosa elige al portador.`,
    },
    {
      id: 'kael-silverweave', nombre: 'Kael Silverweave', rol: 'Tejedor de Quests', fases: ['esquema', 'escritura'], icono: 'map',
      craft: `Toda quest tiene precio visible: cada ayuda cuesta, cada atajo cobra. Alterna batallas externas con negociaciones internas. El capítulo que no cambia el mapa cambia al personaje.`,
    },
    {
      id: 'rowan-wilde', nombre: 'Rowan Wilde', rol: 'Escritor de Mitos', fases: ['escritura'], icono: 'pen',
      craft: `Prosa con barro y estandartes: nombres que suenan a piedra antigua, criaturas descritas por sus huellas antes que por su forma. El ritmo épico se rompe con imágenes diminutas: una muñeca en un campo quemado.`,
    },
    {
      id: 'morgana-vale', nombre: 'Morgana Vale', rol: 'Cirujana de Profecías', fases: ['impacto'], icono: 'bolt',
      craft: `Las profecías se cumplen torcidas: el giro revela que el texto sagrado hablaba de otro, o del enemigo, o del precio mismo. Planta el doble sentido en el primer acto con inocencia absoluta.`,
    },
  ],
};
