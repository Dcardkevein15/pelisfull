/* pdf.mjs — generador de PDF puro (cero dependencias, sin build).
   La app es solo texto: el libro terminado se DESCARGA como PDF desde el lector.
   Motor: PDF 1.4 mínimo con las fuentes core Helvetica (regular/negrita/cursiva)
   en WinAnsiEncoding — los acentos españoles viajan como bytes latin1.
   Métricas de ancho reales de Helvetica (AFM estándar) para partir líneas sin
   desbordar la página. Diseño: carta (612×792), portada + dedicatoria + índice
   con numeración real (doble pasada) + capítulos con folio al pie. */

const W = 612;            // carta
const H = 792;
const MARGEN_X = 72;
const TOPE = H - 76;      // primera línea utilizable
const PISO = 64;          // última línea utilizable

/* ---------- métricas Helvetica (unidades/1000) ---------- */

const HELV = { ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333, a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500, '{': 334, '|': 260, '}': 334, '~': 584 };
const HELV_BOLD = { ' ': 278, '!': 333, '"': 474, '#': 556, '$': 556, '%': 889, '&': 722, "'": 238, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556, ':': 333, ';': 333, '<': 584, '=': 584, '>': 584, '?': 611, '@': 975, A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, '[': 333, '\\': 278, ']': 333, '^': 584, _: 556, '`': 333, a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500, '{': 389, '|': 280, '}': 389, '~': 584 };

const BASE_PLANA = { '¿': '?', '¡': 'i', '«': '"', '»': '"', '—': '-', '–': '-', '’': "'", '‘': "'", '“': '"', '”': '"', '…': '.' };

function anchoChar(ch, bold) {
  const tabla = bold ? HELV_BOLD : HELV;
  if (tabla[ch] !== undefined) return tabla[ch];
  const plano = BASE_PLANA[ch];
  if (plano !== undefined) return anchoChar(plano, bold);
  // acentuadas: el ancho de la letra base (AFM de Helvetica coincide)
  const sinAcento = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (sinAcento && sinAcento !== ch) return anchoChar(sinAcento, bold);
  return 556; // desconocida: ancho medio
}

export function anchoTexto(texto, sizePt, bold = false) {
  let total = 0;
  for (const ch of String(texto || '')) total += anchoChar(ch, bold);
  return (total * sizePt) / 1000;
}

/** Parte un texto en líneas que caben en `maxPt` puntos (sin partir palabras). */
export function wrapText(texto, maxPt, sizePt, bold = false) {
  const palabras = String(texto || '').split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = '';
  for (const palabra of palabras) {
    const prueba = actual ? actual + ' ' + palabra : palabra;
    if (anchoTexto(prueba, sizePt, bold) <= maxPt || !actual) {
      actual = prueba;
    } else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/** Escapa el texto para el literal PDF y normaliza a latin1/WinAnsi. */
export function pdfEscape(str) {
  let out = '';
  for (const ch of String(str || '')) {
    const code = ch.codePointAt(0);
    if (ch === '\\' || ch === '(' || ch === ')') {
      out += '\\' + ch;
    } else if (code <= 255) {
      out += ch;
    } else {
      const plano = BASE_PLANA[ch] ?? ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      for (const p of plano) {
        const c2 = p.codePointAt(0);
        if (c2 <= 255) out += p;
      }
    }
  }
  return out;
}

/* ---------- composición de páginas ---------- */

function nuevaPagina() {
  return { lineas: [], folio: true };
}

function linea(pagina, { texto, f = 'F1', s = 11, x = MARGEN_X, y, align = 'izq', rgb = null }) {
  pagina.lineas.push({ texto: String(texto || ''), f, s, x, y, align, rgb });
}

function centro(texto, s, bold) { return (W - anchoTexto(texto, s, bold)) / 2; }

/** Añade un bloque de texto con interlineado; devuelve la Y tras el bloque. */
function bloque(pagina, texto, { y, f = 'F1', s = 11, leading = null, maxPt = W - 2 * MARGEN_X, align = 'izq', extra = 0 }) {
  const bold = f === 'F2';
  const lh = leading || s * 1.45;
  for (const l of wrapText(texto, maxPt, s, bold)) {
    if (y - lh < PISO) return null; // página llena
    const x = align === 'centro' ? centro(l, s, bold) : MARGEN_X;
    linea(pagina, { texto: l, f, s, x, y, align });
    y -= lh;
  }
  return y - extra;
}

/**
 * Construye el PDF del libro.
 * @param {object} book libro interno (meta + chapters con paragraphs)
 * @returns {Uint8Array} bytes del PDF listos para Blob/descarga
 */
export function buildPDF(book) {
  const meta = book.meta || {};
  const portada = meta.portada || {};
  const capitulos = (book.chapters || []).filter((c) => (c.paragraphs || []).length);

  // ----- pasada 1: paginación del cuerpo (para el índice con folios reales) -----
  const paginas = [];
  let pag = nuevaPagina();
  pag.folio = false; // portada sin folio
  paginas.push(pag);

  // portada
  let y = TOPE - 120;
  for (const l of wrapText(meta.titulo || 'Sin título', W - 2 * MARGEN_X - 60, 26, true)) {
    linea(pag, { texto: l, f: 'F2', s: 26, x: centro(l, 26, true), y, align: 'centro' });
    y -= 34;
  }
  if (meta.subtitulo) {
    for (const l of wrapText(meta.subtitulo, W - 2 * MARGEN_X - 60, 14)) {
      linea(pag, { texto: l, f: 'F3', s: 14, x: centro(l, 14), y, align: 'centro' });
      y -= 20;
    }
  }
  y -= 26;
  if (portada.autor || portada.anio) {
    const por = [portada.autor, portada.anio].filter(Boolean).join(' · ');
    linea(pag, { texto: por, f: 'F1', s: 12, x: centro(por, 12), y, align: 'centro' });
    y -= 24;
  }
  if (meta.logline) y = bloque(pag, meta.logline, { y: y - 8, f: 'F3', s: 11, align: 'centro', maxPt: W - 2 * MARGEN_X - 80 }) ?? y;
  if ((meta.temas || []).length) {
    y -= 10;
    const temas = meta.temas.join('  ·  ');
    y = bloque(pag, temas, { y, f: 'F1', s: 10, align: 'centro', maxPt: W - 2 * MARGEN_X - 80 }) ?? y;
  }

  // dedicatoria (página propia, centrada en el tercio superior)
  if (portada.dedicatoria) {
    pag = nuevaPagina();
    paginas.push(pag);
    let yd = TOPE - 220;
    linea(pag, { texto: 'A quienes guardan esta historia', f: 'F1', s: 9, x: centro('A quienes guardan esta historia', 9), y: yd, align: 'centro' });
    yd -= 30;
    for (const l of wrapText(portada.dedicatoria, W - 2 * MARGEN_X - 100, 13)) {
      linea(pag, { texto: l, f: 'F3', s: 13, x: centro(l, 13), y: yd, align: 'centro' });
      yd -= 20;
    }
  }

  // índice (folios reales: se completan en la pasada 2)
  pag = nuevaPagina();
  paginas.push(pag);
  let yIndice = TOPE;
  linea(pag, { texto: 'Contenido', f: 'F2', s: 20, x: MARGEN_X, y: yIndice, align: 'izq' });
  yIndice -= 36;
  const entradasIndice = [];
  for (const c of capitulos) {
    entradasIndice.push({ cap: c, pagIdx: paginas.length });
    pag = nuevaPagina();
    paginas.push(pag);
  }

  // cuerpo: un capítulo arranca SIEMPRE en página nueva
  const inicioCapitulo = [];
  capitulos.forEach((c, ci) => {
    const pagIdx = entradasIndice[ci].pagIdx;
    const p = paginas[pagIdx];
    inicioCapitulo.push(pagIdx);
    let yc = TOPE;
    linea(p, { texto: 'CAPÍTULO ' + c.numero, f: 'F1', s: 10, x: MARGEN_X, y: yc, align: 'izq' });
    yc -= 26;
    for (const l of wrapText(c.titulo || '', W - 2 * MARGEN_X, 19, true)) {
      linea(p, { texto: l, f: 'F2', s: 19, x: MARGEN_X, y: yc, align: 'izq' });
      yc -= 25;
    }
    yc -= 8;
    let actual = p;
    for (const par of c.paragraphs || []) {
      const res = bloque(actual, par.texto, { y: yc, s: 11, leading: 16.5, extra: 7 });
      if (res === null) {
        actual = nuevaPagina();
        paginas.push(actual);
        yc = TOPE;
        const res2 = bloque(actual, par.texto, { y: yc, s: 11, leading: 16.5, extra: 7 });
        yc = res2 === null ? yc : res2;
      } else {
        yc = res;
      }
    }
    if (c.cliffhanger) {
      const res = bloque(actual, '— ' + c.cliffhanger, { y: yc - 4, f: 'F3', s: 11, leading: 15 });
      if (res !== null) yc = res;
    }
    entradasIndice[ci].folioReal = null; // se calcula con el índice abajo
  });

  // ----- pasada 2: escribir el índice con los folios reales -----
  // folio de una página = su índice dentro del PDF + 1 (portada cuenta como 1)
  const pagIndice = 1 + (portada.dedicatoria ? 1 : 0);
  const paginasIndice = paginas[pagIndice];
  let yi = TOPE - 36;
  for (const e of entradasIndice) {
    const titulo = 'Capítulo ' + e.cap.numero + ' — ' + (e.cap.titulo || '');
    const folio = String(e.pagIdx + 1);
    const anchoFolio = anchoTexto(folio, 11);
    const anchoTitulo = anchoTexto(titulo, 11);
    const puntos = '.'.repeat(Math.max(3, Math.floor(((W - 2 * MARGEN_X) - anchoTitulo - anchoFolio - 12) / anchoTexto('.', 11))));
    linea(paginasIndice, { texto: titulo + ' ' + puntos, f: 'F1', s: 11, x: MARGEN_X, y: yi, align: 'izq' });
    linea(paginasIndice, { texto: folio, f: 'F1', s: 11, x: W - MARGEN_X - anchoFolio, y: yi, align: 'izq' });
    yi -= 20;
  }

  // ----- serialización -----
  const objetos = [];
  const push = (s) => objetos.push(s);

  const nObjPaginas = paginas.map((_, i) => 6 + i * 2);
  // 1: catalogo · 2: pages · 3-5: fuentes · 6+i*2: página i · 7+i*2: contenido i
  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  push('2 0 obj\n<< /Type /Pages /Kids [' + nObjPaginas.map((n) => n + ' 0 R').join(' ') + '] /Count ' + paginas.length + ' >>\nendobj\n');
  push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n');
  push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n');
  push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>\nendobj\n');

  paginas.forEach((p, i) => {
    const nPag = 6 + i * 2;
    const nCont = 7 + i * 2;
    let stream = '';
    for (const l of p.lineas) {
      stream += 'BT /' + l.f + ' ' + l.s + ' Tf 1 0 0 1 ' + l.x.toFixed(2) + ' ' + l.y.toFixed(2) + ' Tm (' + pdfEscape(l.texto) + ') Tj ET\n';
    }
    if (p.folio) {
      const folio = String(i + 1);
      const x = centro(folio, 10);
      stream += 'BT /F1 10 Tf 1 0 0 1 ' + x.toFixed(2) + ' 40 Tm (' + folio + ') Tj ET\n';
    }
    push(nPag + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ' + nCont + ' 0 R >>\nendobj\n');
    push(nCont + ' 0 obj\n<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream\nendobj\n');
  });

  const total = 6 + paginas.length * 2;
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (const obj of objetos) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefPos = pdf.length;
  pdf += 'xref\n0 ' + (total + 1) + '\n';
  pdf += '0000000000 65535 f \n';
  for (const off of offsets) {
    pdf += String(off).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += 'trailer\n<< /Size ' + (total + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF';

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

/** Blob de descarga listo para el navegador. */
export function pdfBlob(bytes) {
  return new Blob([bytes], { type: 'application/pdf' });
}
