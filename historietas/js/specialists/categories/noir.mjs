/* noir.mjs — equipo de Crimen Noir. */

export default {
  id: 'noir',
  nombre: 'Crimen Noir',
  icono: 'fedora',
  tagline: 'Nadie gana. Algunos pierden con dignidad',
  sinopsis: 'Ciudades podridas, deudas antiguas y un honesto —apenas— dispuesto a cobrarlas. Llueve siempre de algún modo.',
  defaults: { tono: 'cínico y lírico', final: 'factura antigua que vence', intensidad: { emocion: 7, psicologia: 8, accion: 5, romance: 4, oscuridad: 8 } },
  doctrine: `Todo noir es una deuda: alguien pagó para que la verdad no saliera y otro va a cobrarla. La ciudad es corrupta hasta la médula y el protagonista es el último honesto —apenas—. El caso doble: el crimen visible tapa el crimen real. El tiempo se mide en tragos y ediciones de periódico. La traición final viene del único que el protagonista respetó. Diálogos cortos como navajas: cada línea es una apuesta.`,
  visual: {
    styleEn: 'classic noir graphic novel, stark black and white with one accent red, hard chiaroscuro',
    lighting: 'venetian-blind shadows, streetlamp halos in rain, match flare in dark rooms',
    palette: 'ink black, smoke grey, cigarette white, scarlet accent',
  },
  equipo: [
    {
      id: 'jack-marlowe', nombre: 'Jack Marlowe', rol: 'Showrunner de Sombras', fases: ['concepto', 'esquema'], icono: 'spark',
      craft: `Todo noir es una deuda: alguien pagó para que la verdad no saliera y otro va a cobrar. La ciudad es corrupta hasta la médula y el protagonista es el último honesto —apenas—.`,
    },
    {
      id: 'vic-moretti', nombre: 'Vic "El Archivo" Moretti', rol: 'Arquitecto de la Ciudad Corrupta', fases: ['biblia'], icono: 'globe',
      craft: `Documenta la ciudad como un sumario: quién firma los permisos, quién limpia la escena, cuánto cuesta un testigo. Barrios, radios, coches, cigarrillos: la corrupción tiene marca y modelo.`,
    },
    {
      id: 'selma-krause', nombre: 'Selma Krause', rol: 'Psicóloga de Antihéroes', fases: ['personajes', 'escritura'], icono: 'mask',
      craft: `Sus héroes cobran por lo que creen y fallan por lo que aman. Código personal contra ciudad podrida: cada caso toca una vieja herida. La femme fatale —o el fatal— tiene razones contables.`,
    },
    {
      id: 'dita-vane', nombre: 'Dita Vane', rol: 'Tejedora de Engaños', fases: ['esquema', 'escritura'], icono: 'map',
      craft: `El caso doble: el crimen visible tapa el crimen real. Capítulos como fichas de archivo: interrogatorios, colas, sobornos. El tiempo del noir se mide en tragos y ediciones del periódico.`,
    },
    {
      id: 'raymond-coy', nombre: 'Raymond Coy', rol: 'Escritor de Prosa Húmeda', fases: ['escritura'], icono: 'pen',
      craft: `Primera persona con voz de cicatrices: ironía amarga, metáforas de bar y asfalto. Llueve siempre de algún modo. Diálogos cortos como navajas: cada línea una apuesta.`,
    },
    {
      id: 'lola-escarlata', nombre: 'Lola Escarlata', rol: 'Cirujana de Traiciones', fases: ['impacto'], icono: 'bolt',
      craft: `La traición final viene del único que el protagonista respetó. El giro noir es una factura antigua que vence. Nadie gana: algunos solo pierden con más dignidad.`,
    },
  ],
};
