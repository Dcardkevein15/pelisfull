/* tts.test.mjs — el lector de voz: troceo con offsets exactos, selección de la
   mejor voz, memoria de lectura y la cola de frases del Narrador con un
   speechSynthesis falso (Node no tiene Web Speech API). */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitNarration, rankVoices, Narrador,
  saveReadingProgress, loadReadingProgress, getTtsPrefs, setTtsPrefs,
} from '../js/engine/tts.mjs';

/* ---------------- troceo ---------------- */

test('splitNarration reconstruye el texto exacto: todo carácter cubierto y offsets fieles', () => {
  const casos = [
    'La niebla entraba como si la casa respirara. «La puerta ya está abierta.» Ana dudó.',
    'Una sola frase sin punto final',
    '',
    '   ',
    'Primero. Segundo! Tercero? Cuarto… Quinto: Sexto; Séptimo — y algo más.',
    'Multi\nlínea con saltos.',
  ];
  for (const t of casos) {
    const chunks = splitNarration(t);
    for (const c of chunks) {
      assert.equal(t.slice(c.offset, c.offset + c.text.length), c.text,
        'offset inexacto en "' + c.text.slice(0, 30) + '"');
      assert.ok(c.text.length > 0 && c.text.length <= 231, 'trozo fuera de tamaño');
    }
    // sin solapamientos ni huecos de contenido (los espacios entre cortes no importan)
    let prevFin = -1;
    for (const c of chunks) {
      assert.ok(c.offset > prevFin - 1, 'solape u orden roto');
      prevFin = c.offset + c.text.length;
    }
  }
  // cubre hasta el último carácter no-espacio
  const t1 = casos[0];
  const ultimo = splitNarration(t1).at(-1);
  assert.equal(t1.slice(ultimo.offset).replace(/\s+$/, ''), ultimo.text, 'el último trozo llega al final');
});

test('splitNarration parte frases kilométricas por comas sin perder caracteres', () => {
  const larga = 'El pasillo ' + 'se estiraba, y estiraba, y estiraba, '.repeat(30) + 'hasta el final.';
  const chunks = splitNarration(larga);
  assert.ok(chunks.length >= 2, 'se parte');
  for (const c of chunks) {
    assert.equal(larga.slice(c.offset, c.offset + c.text.length), c.text);
    assert.ok(c.text.length <= 231);
  }
  // nada del contenido se pierde: los trozos, en orden, recompone el párrafo
  const recompuesto = chunks.map((c) => larga.slice(c.offset, c.offset + c.text.length)).join('');
  const normaliza = (x) => x.replace(/\s+/g, ' ').trim();
  assert.equal(normaliza(recompuesto), normaliza(larga), 'todo el texto viaja en la cola');
});

/* ---------------- selección de voz ---------------- */

const VOICES = [
  { name: 'Microsoft Sabina - Spanish (Spain)', lang: 'es-ES', localService: true },
  { name: 'Microsoft Elvira Online (Natural) - Spanish (Spain)', lang: 'es-ES', localService: false },
  { name: 'Google español de Estados Unidos', lang: 'es-US', localService: false },
  { name: 'Microsoft Aria Online (Natural) - English (US)', lang: 'en-US', localService: false },
  { name: 'Compact Speech synthesizer', lang: 'es-MX', localService: true },
];

test('la mejor voz para español es la neuronal online; la compact queda la última', () => {
  const ranking = rankVoices(VOICES, 'es');
  assert.equal(ranking[0].name, 'Microsoft Elvira Online (Natural) - Spanish (Spain)');
  assert.equal(ranking.at(-1).name, 'Compact Speech synthesizer', 'la compact solo como último recurso');
  assert.ok(!ranking.some((v) => v.lang.startsWith('en')), 'otras lenguas fuera');
});

test('para un libro en inglés gana la voz neuronal inglesa', () => {
  assert.equal(rankVoices(VOICES, 'en')[0].name, 'Microsoft Aria Online (Natural) - English (US)');
});

/* ---------------- memoria de lectura y preferencias ---------------- */

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test('el progreso de lectura persiste por libro y sobrevive a lecturas corruptas', () => {
  const s = memStorage();
  saveReadingProgress('libro-1', { paraId: 'par_9', chapterIdx: 2, paraIdx: 4, charIndex: 120, pct: 37.5 }, s);
  saveReadingProgress('libro-2', { paraId: 'par_1', chapterIdx: 0, paraIdx: 0, charIndex: 0, pct: 0 }, s);
  const p1 = loadReadingProgress('libro-1', s);
  assert.equal(p1.paraId, 'par_9');
  assert.equal(p1.pct, 37.5);
  assert.ok(p1.updatedAt);
  assert.equal(loadReadingProgress('libro-2', s).paraId, 'par_1');
  assert.equal(loadReadingProgress('libro-3', s), null);
  // guardia contra basura preexistente
  const roto = memStorage();
  roto.setItem('historietas.tts.progress.v1', '{no es json');
  saveReadingProgress('x', { paraId: 'p', chapterIdx: 0, paraIdx: 0, charIndex: 0, pct: 1 }, roto);
  assert.equal(loadReadingProgress('x', roto).paraId, 'p');
  // sin storage disponible no rompe
  saveReadingProgress('x', { paraId: 'p', pct: 0 }, null);
  assert.equal(loadReadingProgress('x', null), null);
});

test('las preferencias de voz (elegida y velocidad) hacen round-trip', () => {
  const s = memStorage();
  assert.deepEqual(getTtsPrefs(s), { voiceName: '', rate: 1 });
  setTtsPrefs({ voiceName: 'Microsoft Elvira Online (Natural) - Spanish (Spain)', rate: 1.25 }, s);
  const p = getTtsPrefs(s);
  assert.equal(p.voiceName, 'Microsoft Elvira Online (Natural) - Spanish (Spain)');
  assert.equal(p.rate, 1.25);
  assert.deepEqual(getTtsPrefs(null), { voiceName: '', rate: 1 }, 'sin storage, defaults');
});

/* ---------------- Narrador con speechSynthesis falso ---------------- */

class FakeU {
  constructor(text) { this.text = text; this.lang = ''; this.rate = 1; this.voice = null; }
}

function fakeSynth() {
  const synth = {
    queue: [], paused: false, cancelled: 0,
    speak(u) { synth.queue.push(u); },
    cancel() { synth.cancelled++; synth.queue = []; },
    pause() { synth.paused = true; },
    resume() { synth.paused = false; },
  };
  return synth;
}

test('el Narrador encadena frases, traduce offsets a absolutos y avisa UN solo onend', async () => {
  const synth = fakeSynth();
  const n = new Narrador({ synth, utteranceCtor: FakeU, lang: 'es', rate: 1.2 });
  const boundaries = [];
  let ends = 0;
  n.onboundary = (b) => boundaries.push(b.charIndex);
  n.onend = () => ends++;

  const texto = 'Primera frase. Segunda frase. Tercera.';
  const ok = await n.speak(texto);
  assert.equal(ok, true);
  assert.equal(n.hablando, true);
  assert.equal(synth.queue.length, 1, 'la cola es una CADENA: una utterance viva');
  const u1 = synth.queue.shift();
  assert.equal(u1.text, 'Primera frase.');
  assert.equal(u1.rate, 1.2, 'la velocidad viaja');
  assert.equal(u1.lang, 'es');

  u1.onboundary?.({ charIndex: 3, charLength: 3 });
  assert.deepEqual(boundaries, [3], 'boundary con offset absoluto del párrafo');
  u1.onend(); // → encola la 2.ª frase
  const u2 = synth.queue.shift();
  assert.equal(u2.text.replace(/^\s/, ''), 'Segunda frase.');
  // el navegador dispara boundaries al inicio de cada palabra: 'Segunda' está en el
  // charIndex 1 del trozo (que arranca con el espacio tras el punto anterior)
  u2.onboundary?.({ charIndex: 1, charLength: 7 });
  assert.ok(boundaries.includes(texto.indexOf('Segunda')), 'offset absoluto de la 2.ª frase');
  u2.onend(); // → 3.ª
  synth.queue.shift().onend(); // fin del párrafo completo

  assert.equal(ends, 1, 'onend exactamente una vez al terminar TODO el párrafo');
  assert.equal(n.hablando, false);
  assert.equal(synth.queue.length, 0);
});

test('speak trocea en cadena: cada onend dispara la siguiente frase', async () => {
  const synth = fakeSynth();
  const n = new Narrador({ synth, utteranceCtor: FakeU });
  let fin = false;
  n.onend = () => { fin = true; };
  await n.speak('A. B. C.');
  const u1 = synth.queue.shift();
  u1.onend(); // termina la 1.ª → encola la 2.ª
  const u2 = synth.queue.shift();
  assert.equal(u2.text.replace(/^\s/, ''), 'B.');
  u2.onend();
  const u3 = synth.queue.shift();
  assert.equal(u3.text.replace(/^\s/, ''), 'C.');
  assert.equal(fin, false, 'aún no termina el párrafo');
  u3.onend();
  assert.equal(fin, true, 'onend del párrafo completo tras la última frase');
  assert.equal(synth.queue.length, 0);
});

test('stop cancela: no hay más boundary ni onend tras detener', async () => {
  const synth = fakeSynth();
  const n = new Narrador({ synth, utteranceCtor: FakeU });
  let ends = 0, errs = 0;
  n.onend = () => ends++;
  n.onerror = () => errs++;
  await n.speak('Una frase.');
  const u = synth.queue[0];
  n.stop();
  assert.equal(synth.cancelled >= 1, true);
  assert.equal(n.hablando, false);
  u.onboundary?.({ charIndex: 0, charLength: 1 }); // evento tardío tras cancel
  u.onend?.();
  assert.equal(ends, 0);
  assert.equal(errs, 0);
});

test('speak desde un carácter concreto (reanudación a mitad de párrafo)', async () => {
  const synth = fakeSynth();
  const n = new Narrador({ synth, utteranceCtor: FakeU });
  const texto = 'Primer tramo del texto. Segundo tramo que continúa.';
  const desde = texto.indexOf('Segundo');
  await n.speak(texto, { fromChar: desde });
  assert.equal(synth.queue[0].text, 'Segundo tramo que continúa.');
  // el boundary llega en offset ABSOLUTO del párrafo (no del tramo recortado)
  const boundaries = [];
  n.onboundary = (b) => boundaries.push(b.charIndex);
  synth.queue[0].onboundary?.({ charIndex: 1, charLength: 7 });
  assert.equal(boundaries[0], desde + 1, 'el fromChar se suma: el karaoke no queda desfasado');
});

test('onchunkstart: cada frase anuncia dónde arranca (karaoke interpolado)', async () => {
  const synth = fakeSynth();
  const n = new Narrador({ synth, utteranceCtor: FakeU });
  const texto = 'Frase uno. Frase dos. Frase tres.';
  const esperados = splitNarration(texto).map((c) => c.offset); // invariante del troceador
  const inicios = [];
  n.onchunkstart = (c) => inicios.push(c.charIndex);
  await n.speak(texto);
  const u1 = synth.queue.shift();
  u1.onstart?.();
  assert.deepEqual(inicios, [esperados[0]]);
  u1.onend?.();
  const u2 = synth.queue.shift();
  u2.onstart?.();
  assert.deepEqual(inicios, [esperados[0], esperados[1]], 'offset absoluto de la 2.ª frase');
  // con reanudación a mitad de párrafo el inicio también es absoluto
  const n2 = new Narrador({ synth, utteranceCtor: FakeU });
  const inicios2 = [];
  n2.onchunkstart = (c) => inicios2.push(c.charIndex);
  const desde = texto.indexOf('Frase dos');
  await n2.speak(texto, { fromChar: desde });
  synth.queue.shift().onstart?.();
  assert.deepEqual(inicios2, [desde]);
});

test('resume detecta el motor atascado y lo reporta para reiniciar', async () => {
  const synth = fakeSynth();
  synth.resume = () => { synth.paused = false; };
  const n = new Narrador({ synth, utteranceCtor: FakeU });
  assert.equal(await n.resume(), true);
  const atascado = fakeSynth();
  atascado.paused = true;
  atascado.resume = () => { /* no despausa: bug real de algunas voces online */ };
  const n2 = new Narrador({ synth: atascado, utteranceCtor: FakeU });
  assert.equal(await n2.resume(), false, 'motor colgado → false → la vista reinicia por el cursor');
});

test('texto vacío: onend inmediato y sin utterances', async () => {
  const synth = fakeSynth();
  const n = new Narrador({ synth, utteranceCtor: FakeU });
  let ends = 0;
  n.onend = () => ends++;
  await n.speak('   ');
  assert.equal(synth.queue.length, 0);
  assert.equal(ends, 1);
});

test('sin speechSynthesis disponible el Narrador no rompe', async () => {
  const n = new Narrador({ synth: null, utteranceCtor: null });
  let ends = 0;
  n.onend = () => ends++;
  assert.equal(await n.speak('Hola.'), false);
  n.pause();
  n.stop();
  assert.equal(ends, 0);
});
