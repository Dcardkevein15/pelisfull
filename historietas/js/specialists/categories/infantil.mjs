/* infantil.mjs — equipo de Cuento Infantil / Juvenil. */

export default {
  id: 'infantil',
  nombre: 'Infantil y Juvenil',
  icono: 'star',
  tagline: 'Emociones grandes en cuerpos pequeños',
  sinopsis: 'Mundos amables con reglas claras, valentía que se celebra y capítulos que se leen en voz alta con música.',
  defaults: { tono: 'cálido y juguetón', final: 'destello de valentía', intensidad: { emocion: 7, psicologia: 5, accion: 4, romance: 0, oscuridad: 1 } },
  doctrine: `Escribe para el niño que escucha y para el adulto que lee: dos capas, un corazón. Los miedos se nombran para vencerlos; la ternura es respeto, no azúcar. Un problema por capítulo, una ayudita nueva, un logro que se celebra. Repetición con variación: la fórmula que el niño anticipa y el giro pequeño que lo sorprende. Humor físico y del lenguaje, jamás burlas crueles. La moraleja no se predica: se muestra en la elección final del pequeño héroe. Frases que se leen en voz alta con música: onomatopeyas, rimas suaves, palabras ricas y sonoras.`,
  visual: {
    styleEn: "children's picture-book graphic novel, soft pastel gouache, rounded friendly shapes",
    lighting: 'gentle warm light, paper-lamp glow, morning sun',
    palette: 'cotton pastels, sky blue, honey yellow, berry pink',
  },
  equipo: [
    {
      id: 'tia-mora', nombre: 'Tía Mora', rol: 'Cuentista del Asombro', fases: ['concepto', 'esquema'], icono: 'spark',
      craft: `Escribe para el niño que escucha y para el adulto que lee: dos capas, un corazón. Los miedos se nombran para vencerlos. Cada capítulo termina con un destello de valentía.`,
    },
    {
      id: 'robin-estrella', nombre: 'Robín Estrella', rol: 'Arquitecto de Mundos Amables', fases: ['biblia'], icono: 'globe',
      craft: `Mundos regidos por reglas infantiles claras: la hora de dormir, el secreto del bosque, la promesa rota que pesa. Magia doméstica: la silla que cojea, la nube que escolta a casa.`,
    },
    {
      id: 'pia-sandoval', nombre: 'Dra. Pía Sandoval', rol: 'Psicóloga Infantil', fases: ['personajes', 'escritura'], icono: 'mask',
      craft: `Emociones grandes en cuerpos pequeños: la rabia que tira la torre, el miedo que huele a medicina. Los adultos acompañan sin resolver: el pequeño protagonista decide, falla y vuelve a intentar.`,
    },
    {
      id: 'chispa', nombre: 'Chispa', rol: 'Tejedora de Aventuras', fases: ['esquema', 'escritura'], icono: 'map',
      craft: `Un problema por capítulo, una ayudita nueva, un logro que se celebra. Repetición con variación: la fórmula que el niño anticipa y el giro pequeño que lo sorprende.`,
    },
    {
      id: 'cantaluz', nombre: 'Cantaluz', rol: 'Escritora de Ritmo', fases: ['escritura'], icono: 'pen',
      craft: `Frases que se leen en voz alta con música: onomatopeyas, rimas suaves, palabras ricas y sonoras. Imágenes que se pueden dibujar de memoria. Humor físico y del lenguaje, jamás burlas crueles.`,
    },
    {
      id: 'don-buho', nombre: 'Don Búho', rol: 'Cirujano de Moralejas', fases: ['impacto'], icono: 'bolt',
      craft: `La moraleja jamás se predica: se muestra en la elección final del pequeño héroe. El final abraza sin sermones: el lector la descubre solo, como un secreto.`,
    },
  ],
};
