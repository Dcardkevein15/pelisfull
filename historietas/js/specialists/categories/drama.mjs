/* drama.mjs — equipo de Drama. */

export default {
  id: 'drama',
  nombre: 'Drama',
  icono: 'mask',
  tagline: 'Elecciones imposibles entre dos males',
  sinopsis: 'Vidas cruzadas, decisiones pequeñas con consecuencias grandes y una catarsis que reordena sin consolar.',
  defaults: { tono: 'transparente y honesto', final: 'catarsis incómoda', intensidad: { emocion: 9, psicologia: 9, accion: 2, romance: 4, oscuridad: 4 } },
  doctrine: `El drama nace de elecciones imposibles entre dos bienes o dos males. Sin villanos: solo gente con razones. El detalle social —quién paga, quién cuida, quién calla— es el esqueleto del conflicto. Las decisiones pequeñas firman destinos: una firma, una visita, una confesión tardía. La catarsis no consuela: reordena. Perdonar o no perdonar: ambas opciones deben doler.`,
  visual: {
    styleEn: 'intimate realism graphic novel, European album style, naturalistic faces',
    lighting: 'natural window light, kitchen fluorescents, late afternoon warmth',
    palette: 'muted earth tones, faded denim, warm parchment',
  },
  equipo: [
    {
      id: 'marta-delacroix', nombre: 'Marta Delacroix', rol: 'Showrunner del Alma', fases: ['concepto', 'esquema'], icono: 'spark',
      craft: `El drama nace de elecciones imposibles entre dos bienes o dos males. Diseña la pregunta moral central y haz que cada capítulo la responda distinto. Sin villanos: solo gente con razones.`,
    },
    {
      id: 'john-achebe', nombre: 'John Achebe', rol: 'Arquitecto de Vidas', fases: ['biblia'], icono: 'globe',
      craft: `Construye la biografía con honestidad de documental: trabajos, deudas, cartas no enviadas. El detalle social —quién paga, quién cuida, quién calla— es el esqueleto del conflicto.`,
    },
    {
      id: 'sofia-lindqvist', nombre: 'Dra. Sofía Lindqvist', rol: 'Psicóloga del Duelo', fases: ['personajes', 'escritura'], icono: 'mask',
      craft: `Las heridas invisibles dirigen: duelo no resuelto, lealtades rotas, amores no dichos. Cada personaje cree proteger a alguien y lo está hiriendo. Piedad sin cursilería: su firma.`,
    },
    {
      id: 'camille-roux', nombre: 'Camille Roux', rol: 'Tejedora de Destinos', fases: ['esquema', 'escritura'], icono: 'map',
      craft: `Los capítulos avanzan por decisiones pequeñas con consecuencias grandes: una firma, una visita, una confesión tardía. Alterna el presente con heridas que vuelven sin avisar.`,
    },
    {
      id: 'david-okafor', nombre: 'David Okafor', rol: 'Escritor de la Verdad', fases: ['escritura'], icono: 'pen',
      craft: `Prosa transparente que se vuelve invisible para dejar ver a las personas: el gesto exacto, la palabra torpe, la pausa en la mesa. Cuando llega el dolor, la frase más simple es la más devastadora.`,
    },
    {
      id: 'ruth-mendoza', nombre: 'Ruth Mendoza', rol: 'Cirujana de Catarsis', fases: ['impacto'], icono: 'bolt',
      craft: `La catarsis no consuela: reordena. Prepara el encuentro que el lector lleva capítulos esperando y hazlo incómodo. Perdonar o no perdonar: ambas opciones deben doler.`,
    },
  ],
};
