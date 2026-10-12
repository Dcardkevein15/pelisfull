/* source.test.mjs — guardas estáticas sobre el código fuente del navegador.
   Nació de un bug real: dos `function origenPanel` en view-wizard.mjs se
   sombreadaron y el panel de subir manuscritos devolvía null (el navegador
   pintaba el texto "null"). Esto no puede volver a pasar sin que truene un test. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const jsRoot = join(here, '..', 'js');

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.mjs')) out.push(p);
  }
  return out;
}

function functionNames(src) {
  const names = {};
  for (const m of src.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    names[m[1]] = (names[m[1]] || 0) + 1;
  }
  return names;
}

test('ningún módulo declara dos veces la misma función (sombreado silencioso)', () => {
  const dupes = [];
  for (const f of walk(jsRoot)) {
    const src = readFileSync(f, 'utf8');
    for (const [name, count] of Object.entries(functionNames(src))) {
      if (count > 1) dupes.push(f.replace(jsRoot, '') + ' → ' + name + ' ×' + count);
    }
  }
  assert.deepEqual(dupes, [], 'funciones duplicadas (la última taparía a la primera)');
});

test('el asistente tiene el panel de subida y el de fidelidad, sin sombrearse', () => {
  const src = readFileSync(join(jsRoot, 'ui', 'view-wizard.mjs'), 'utf8');
  const names = functionNames(src);
  assert.equal(names.uploadPanel, 1, 'panel de subida de manuscrito presente y único');
  assert.equal(names.origenPanel, 1, 'panel de fidelidad presente y único');
  assert.ok(src.includes('uploadPanel();'), 'el paso 1 invoca uploadPanel');
  assert.ok(!/wrap\.append\(origenPanel\(\)\)/.test(src), 'el paso 1 nunca invoca el panel de fidelidad');
});

test('todos los módulos del navegador referencian archivos que existen (imports relativos)', () => {
  const faltantes = [];
  for (const f of walk(jsRoot)) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/from\s+'(\.[^']+)'/g)) {
      const target = join(dirname(f), m[1]);
      let ok = false;
      try { readFileSync(target); ok = true; } catch { ok = false; }
      if (!ok) faltantes.push(f.replace(jsRoot, '') + ' → ' + m[1]);
    }
  }
  assert.deepEqual(faltantes, [], 'imports rotos');
});

test('ninguna const-flecha se usa antes de su línea (zona muerta temporal)', () => {
  // Nació de un bug real: `const personajesFaltantes = () => …` llamada desde el
  // primer draw() al restaurar el paso 3 → "Cannot access … before initialization".
  // Se aplica a las vistas (js/ui): ahí render() ejecuta draw() durante la propia
  // inicialización y el orden importa. En core/, las const-flecha exportadas se
  // llaman siempre tras evaluarse el módulo (patrón seguro, sin falsos positivos).
  const uiRoot = join(jsRoot, 'ui');
  const problemas = [];
  for (const f of walk(uiRoot)) {
    const lines = readFileSync(f, 'utf8').split('\n');
    // 1) posiciones de las const-flecha
    const decl = new Map();
    lines.forEach((line, idx) => {
      const m = line.match(/const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/);
      if (m) decl.set(m[1], idx);
    });
    // 2) usos como función antes de su línea
    for (const [name, declLine] of decl) {
      const useRx = new RegExp('\\b' + name + '\\s*\\(');
      for (let i = 0; i < declLine; i++) {
        if (useRx.test(lines[i])) {
          problemas.push(f.replace(jsRoot, '') + ' » "' + name + '()" usado en línea ' + (i + 1) + ', declarado en ' + (declLine + 1));
          break;
        }
      }
    }
  }
  assert.deepEqual(problemas, [], 'const-flecha usada antes de inicializarse (TDZ)');
});

/* ============ guardas de arranque (la "página negra" no puede volver) ============
   Bug real (Oct 2026): un paréntesis faltante en el TOC de view-reader.mjs rompía
   el import de main.mjs → el navegador solo pintaba el topbar estático y el resto
   quedaba negro. La suite estaba en verde porque NINGÚN test importa los módulos
   de ui/. Estas dos guardas cierran ese hueco para siempre. */

test('todo módulo ES parsea sin errores de sintaxis (node --check)', () => {
  const rotos = [];
  for (const f of walk(jsRoot)) {
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    } catch (e) {
      const detalle = String(e.stderr || e.message).split('\n').filter(Boolean).slice(0, 2).join(' · ');
      rotos.push(f.replace(jsRoot, '') + ' → ' + detalle);
    }
  }
  assert.deepEqual(rotos, [], 'módulos con errores de sintaxis');
});

test('todo módulo (salvo main.mjs) se IMPORTA de verdad: sintaxis + exports reales', async () => {
  const fallos = [];
  for (const f of walk(jsRoot)) {
    if (f.endsWith(join('js', 'main.mjs'))) continue; // main toca document al ejecutarse: solo sintaxis
    try {
      await import(pathToFileURL(f).href);
    } catch (e) {
      fallos.push(f.replace(jsRoot, '') + ' → ' + String(e.message || e).slice(0, 140));
    }
  }
  assert.deepEqual(fallos, [], 'módulos que revientan al importarse');
});
