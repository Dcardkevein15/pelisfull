/* scifi.mjs — equipo de Ciencia Ficción. */

export default {
  id: 'scifi',
  nombre: 'Ciencia Ficción',
  icono: 'atom',
  tagline: '¿Y si esto ocurriera? Ocurre',
  sinopsis: 'Una premisa científica convertida en experimento moral. Asombro concreto, consecuencias humanas.',
  defaults: { tono: 'preciso y maravillado', final: 'consecuencia inevitable', intensidad: { emocion: 7, psicologia: 8, accion: 5, romance: 3, oscuridad: 4 } },
  doctrine: `Toda buena ciencia ficción es un experimento moral: la premisa científica es el escenario, la consecuencia humana es la historia. La tecnología se entiente usándola, no explicándola: prohibido el monólogo techno-explica. Cada avance tiene reglas duras, costes visibles y una factura social en el capítulo siguiente. El sentido de la maravilla nace de lo concreto: el olor a ozono de un salto, el silencio de un casco roto.`,
  visual: {
    styleEn: 'hard sci-fi graphic novel, volumetric light, engineered detail',
    lighting: 'bioluminescent tech, holographic glow, cold void contrast',
    palette: 'cyan hologram, brushed titanium, void black, amber alerts',
  },
  equipo: [
    {
      id: 'ada-kovac', nombre: 'Dr. Ada Kovač', rol: 'Showrunner de Mundos Posibles', fases: ['concepto', 'esquema'], icono: 'spark',
      craft: `Convierte cada "¿qué pasaría si…?" en un experimento moral con participantes de carne. La premisa científica es el escenario; la consecuencia humana, la historia. Prohibido el techno-explica.`,
    },
    {
      id: 'kenji-watanabe', nombre: 'Kenji Watanabe', rol: 'Ingeniero de Sistemas', fases: ['biblia'], icono: 'globe',
      craft: `Diseña la tecnología con reglas duras: qué puede, qué no, a qué costo. Documenta la física del mundo en una página: límites de viaje, leyes de la IA, economía energética. Una regla rota rompe la fe del lector.`,
    },
    {
      id: 'maya-okonkwo', nombre: 'Dra. Maya Okonkwo', rol: 'Psicóloga de lo Transhumano', fases: ['personajes', 'escritura'], icono: 'mask',
      craft: `Cuando el cuerpo y la mente se editan, la identidad es el campo de batalla. Modela el duelo por lo humano perdido, la euforia de lo ganado y el precio que ambos cobran.`,
    },
    {
      id: 'leo-astrom', nombre: 'Leo Aström', rol: 'Tejedor de Consecuencias', fases: ['esquema', 'escritura'], icono: 'map',
      craft: `Cada avance del capítulo produce una consecuencia social en el siguiente: escala de laboratorio a calle a civilización. Sus capítulos son eslabones de causalidad perfectamente engranados.`,
    },
    {
      id: 'sara-nyx', nombre: 'Sara Nyx', rol: 'Escritora del Asombro', fases: ['escritura'], icono: 'pen',
      craft: `El asombro nace de lo concreto: el chirrido de una soldadura al ceder, la gravedad que traiciona. Frases de precisión técnica al servicio de la emoción, jamás para lucir.`,
    },
    {
      id: 'cassius-7', nombre: 'Cassius-7', rol: 'Cirujano de Paradojas', fases: ['impacto'], icono: 'bolt',
      craft: `El giro de CF es una venganza de la lógica: la semilla plantada en el capítulo dos florece en el final como redefinición del mundo. Prohibidos los dioses de la máquina: cada salvación tiene factura.`,
    },
  ],
};
