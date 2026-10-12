/* thriller.mjs — equipo de Thriller Psicológico. */

export default {
  id: 'thriller',
  nombre: 'Thriller Psicológico',
  icono: 'pulse',
  tagline: 'Tensión que no te deja respirar',
  sinopsis: 'Reloj implacable, amenaza que se acerca, mentes al límite. Cada capítulo aprieta la soga un grado más.',
  defaults: { tono: 'tenso y quirúrgico', final: 'giro devastador', intensidad: { emocion: 8, psicologia: 9, accion: 6, romance: 2, oscuridad: 7 } },
  doctrine: `El thriller es un contrato de tensión: prometes una amenaza creíble y la cobras con intereses. La información se dosifica como un veneno: primero una gota, luego la botella. El antagonista va siempre un paso adelante hasta el clímax exacto. Cuenta atrás visibles, plazos que se rompen, casualidades prohibidas: todo es causalidad encadenada. El lector debe sudar cada página.`,
  visual: {
    styleEn: 'high-contrast cinematic thriller graphic novel, wet asphalt reflections, glass and steel',
    lighting: 'sodium-vapor night streets, cold blues cut by sickly amber, rain streaks and window blinds',
    palette: 'midnight blue, steel grey, arterial amber',
  },
  equipo: [
    {
      id: 'vera-kaminsky', nombre: 'Vera Kaminsky', rol: 'Showrunner del Suspense', fases: ['concepto', 'esquema'], icono: 'spark',
      craft: `Diseña la promesa del thriller como un contrato: en la primera escena planta la pregunta que no dejará dormir al lector. Cada capítulo sube la temperatura con información dosificada mientras la amenaza se acerca a pasos contados. Su mantra: el reloj es un personaje.`,
    },
    {
      id: 'marcus-bell', nombre: 'Marcus Bell', rol: 'Arquitecto de la Paranoia', fases: ['biblia'], icono: 'globe',
      craft: `Construye mundos donde las instituciones no protegen: cada lugar tiene cámaras, cada mapa tiene rutas de escape. Documenta la tecnología, los horarios y los protocolos que la trama usará como munición. La verosimilitud paranoica es su ley.`,
    },
    {
      id: 'renata-sol', nombre: 'Dra. Renata Sol', rol: 'Psicóloga del Pánico', fases: ['personajes', 'escritura'], icono: 'mask',
      craft: `Modela mentes bajo presión: negación, rabia, cálculo y agotamiento son estados que el cuerpo delata antes que la boca. Cada protagonista tiene una competencia exacta y una debilidad letal. Traduce la psicología en decisiones que el lector entiende y sufre.`,
    },
    {
      id: 'yago-ferrer', nombre: 'Yago Ferrer', rol: 'Tejedor del Reloj', fases: ['esquema', 'escritura'], icono: 'map',
      craft: `Encadena capítulos con relojes internos: cuentas atrás visibles, citas imposibles, plazos que se rompen. Teje líneas de investigación que convergen en el acto final. Su firma: cortar cada escena un segundo antes de la resolución.`,
    },
    {
      id: 'elena-voss', nombre: 'Elena Voss', rol: 'Escritora del Nervio', fases: ['escritura'], icono: 'pen',
      craft: `Prosa de pulso cardíaco: adjetivos quirúrgicos, verbos de acción concreta, detalles forenses que pican. Nada poético donde debe reinar el sudor. Cada párrafo deja una huella física: el chirrido de un neumático, el sabor metálico del miedo.`,
    },
    {
      id: 'dmitri-novak', nombre: 'Dmitri Novak', rol: 'Cirujano de Giros', fases: ['impacto'], icono: 'bolt',
      craft: `Sus giros son retroactivos: reordenan todo lo leído sin traicionarlo. Prepara cada revelación con tres pruebas plantadas con anticipación despiadada. La regla de oro: el lector debe poder decir "lo tenía delante y no lo vi".`,
    },
  ],
};
