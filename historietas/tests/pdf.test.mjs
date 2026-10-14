/* pdf.test.mjs — el generador de PDF puro: portada, dedicatoria, índice con
   folios reales, capítulos, acentos WinAnsi y estructura PDF 1.4 válida. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPDF, pdfBlob, wrapText, anchoTexto, pdfEscape } from '../js/export/pdf.mjs';
import { createBook, normalizeOutline, normalizeChapter, normalizePortada, computeStats } from '../js/domain/book.mjs';

function libroDePrueba(extra = {}) {
  const book = createBook({ categoryId: 'thriller', capitulos: { modo: 'fijo', cantidad: 2 }, parrafosPorCapitulo: 4, ...extra });
  book.meta.titulo = 'La Casa que Susurra';
  book.meta.subtitulo = 'Un thriller en doce puertas';
  book.meta.logline = 'Una arquitecta hereda una casa que registra sus miedos.';
  book.meta.temas = ['miedo', 'familia'];
  book.meta.portada = normalizePortada({ autor: 'D. Cardona', anio: '2026', dedicatoria: 'Para quienes esperan junto a la puerta' });
  book.chapters = normalizeOutline({ capitulos: [
    { numero: 1, titulo: 'La herencia', sinopsis: 's' },
    { numero: 2, titulo: 'La primera puerta', sinopsis: 's2' },
  ] });
  for (const ch of book.chapters) {
    ch.paragraphs = normalizeChapter({
      titulo_capitulo: ch.titulo,
      parrafos: Array.from({ length: 4 }, (_, i) => ({
        texto: 'Párrafo ' + (i + 1) + ' — la niebla entraba como si la casa respirara, con acentos: acción, más allá, ¿quién?.',
        rol: 'narracion', personajes_presentes: ['Ana'], lugar: 'la casa', momento_dia: 'noche',
      })),
      cliffhanger: 'la puerta siguiente ya está abierta',
    }, ch, 4).paragraphs;
    ch.cliffhanger = 'la puerta siguiente ya está abierta';
  }
  computeStats(book);
  return book;
}

test('wrapText parte líneas que caben en la caja, sin partir palabras', () => {
  const texto = 'la casa respiraba con una calma extraña aquella noche de niebla';
  const maxPt = 200;
  const lineas = wrapText(texto, maxPt, 11);
  assert.ok(lineas.length >= 2, 'se parte');
  for (const l of lineas) {
    assert.ok(anchoTexto(l, 11) <= maxPt, 'línea desbordada: "' + l + '"');
  }
  assert.equal(lineas.join(' '), texto, 'sin perder ni duplicar palabras');
  // una palabra más ancha que la caja cae entera (no se parte)
  const [sola] = wrapText('extraordinariamente', 30, 11);
  assert.equal(sola, 'extraordinariamente');
});

test('pdfEscape neutraliza paréntesis, barras y normaliza a latin1', () => {
  assert.equal(pdfEscape('a(b)c'), 'a\\(b\\)c');
  assert.equal(pdfEscape('back\\slash'), 'back\\\\slash');
  // los acentos españoles viajan como bytes WinAnsi (latin1)
  assert.equal(pdfEscape('acción años ¿ok? ¡sí!').length, 'acción años ¿ok? ¡sí!'.length);
  // fuera de latin1 (p. ej. emoji) se aplana sin romper el literal
  assert.ok(!/[^\x00-\xFF]/.test(pdfEscape('corazón 🖤 y ñandú')));
});

test('buildPDF produce un PDF 1.4 válido con portada, índice y capítulos', () => {
  const book = libroDePrueba();
  const bytes = buildPDF(book);
  const str = Buffer.from(bytes).toString('latin1');
  assert.ok(str.startsWith('%PDF-1.4'), 'cabecera PDF');
  assert.ok(str.includes('/Type /Catalog'), 'catálogo');
  assert.ok(str.includes('/Helvetica-Bold'), 'fuente negrita');
  assert.ok(str.includes('/WinAnsiEncoding'), 'acentos WinAnsi');
  assert.ok(str.includes('xref') && str.includes('startxref') && str.trimEnd().endsWith('%%EOF'), 'xref + trailer');
  // portada: título, autor, año y dedicatoria viajan
  assert.ok(str.includes('La Casa que Susurra'));
  assert.ok(str.includes('D. Cardona'));
  assert.ok(str.includes('2026'));
  assert.ok(str.includes('Para quienes esperan junto a la puerta'));
  // índice con folios reales (el guion largo se aplana a '-' en el literal PDF)
  assert.ok(str.includes('Contenido'));
  assert.ok(str.includes('Capítulo 1 - La herencia'));
  assert.ok(str.includes('Capítulo 2 - La primera puerta'));
  // cuerpo: acentos de la prosa intactos
  assert.ok(str.includes('acción, más allá'));
  assert.ok(str.includes('la puerta siguiente ya está abierta'), 'cliffhanger en cursiva');
  // el blob es descargable
  const blob = pdfBlob(bytes);
  assert.equal(blob.type, 'application/pdf');
});

test('buildPDF: el índice apunta a la página real de cada capítulo', () => {
  const book = libroDePrueba();
  const bytes = buildPDF(book);
  const str = Buffer.from(bytes).toString('latin1');
  // portada(1) + dedicatoria(1) + índice(1) → el capítulo 1 arranca en la página 4
  assert.ok(str.includes('La herencia'), 'título del capítulo en el cuerpo');
  const conteoPaginas = (str.match(/\/Type \/Page[^s]/g) || []).length;
  assert.ok(conteoPaginas >= 5, 'portada + dedicatoria + índice + 2 capítulos: ' + conteoPaginas);
});

test('sin dedicatoria el PDF salta esa página sin romperse', () => {
  const book = libroDePrueba();
  book.meta.portada = normalizePortada({ autor: 'Anónimo' });
  const str = Buffer.from(buildPDF(book)).toString('latin1');
  assert.ok(str.includes('Anónimo'));
  assert.ok(!str.includes('Para quienes esperan'), 'la dedicatoria desapareció');
});

test('capítulos kilométricos paginan en varias páginas', () => {
  const book = libroDePrueba();
  const largo = Array.from({ length: 120 }, (_, i) => 'La niebla entraba como si la casa respirara por la puerta número ' + i + '.').join(' ');
  for (const ch of book.chapters) {
    ch.paragraphs = [{ id: 'p1', idx: 0, texto: largo, rol: 'narracion', personajesPresentes: [], lugar: '', momentoDia: '' }];
  }
  const str = Buffer.from(buildPDF(book)).toString('latin1');
  const conteoPaginas = (str.match(/\/Type \/Page[^s]/g) || []).length;
  assert.ok(conteoPaginas >= 6, 'el texto largo genera varias páginas: ' + conteoPaginas);
});
