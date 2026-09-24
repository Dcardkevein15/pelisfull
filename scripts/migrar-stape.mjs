/* ═══════════════════════════════════════════════════════════════
   🚚 Migración Streamtape → archive.org (robot de GitHub Actions)
   ───────────────────────────────────────────────────────────────
   Los videos servidos por Streamtape traen anuncios dentro de su
   reproductor (su modelo de negocio) y son imposibles de quitar sin
   romper la reproducción. La salida real: re-alojarlos.

   Este script corre en GitHub (workflow_dispatch). Por cada episodio
   del catálogo cuyo enlace sea de Streamtape:
     1. file/dlticket  → ticket de descarga (API oficial del admin)
     2. espera de cortesía → file/dl → URL directa temporal
     3. descarga el MP4 a disco
     4. PUT al item archive.org de la serie (x-archive S3, CORS libre)
     5. anota vieja-url → nueva-url en migration-map.json

   Es REANUDABLE: cada corrida migra como mucho LOTE videos y hace
   skip de los ya migrados (o marcados FAIL). Necesita 4 credenciales
   como inputs del workflow (nunca se guardan en el repo).

   NO toca catalog.json: el catálogo se firma en el dispositivo del
   admin. Aquí solo se produce migration-map.json; la app lo integra
   y el admin publica con su firma habitual.
   ═══════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CATALOG = path.join(ROOT, 'catalog.json');
const MAPFILE = path.join(ROOT, 'migration-map.json');

const LOTE = Math.max(1, parseInt(process.env.INPUT_LOTE || '8', 10));
/* timeout por episodio (descargar+subir ~130 MB puede tardar) */
const EP_TIMEOUT_MS = 8 * 60 * 1000;
const SA = process.env.STAPE_LOGIN, SK = process.env.STAPE_KEY;
const IA_A = process.env.IA_ACCESS, IA_S = process.env.IA_SECRET;

if (!SA || !SK || !IA_A || !IA_S) {
  console.error('Faltan credenciales (stape login/key · archive.org access/secret)');
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const stapeApi = async (ep, params) => {
  const q = new URLSearchParams({ login: SA, key: SK, ...params });
  const r = await fetch(`https://api.streamtape.com/${ep}?${q}`);
  const j = await r.json().catch(() => ({}));
  return j;
};

/* id del vídeo de Streamtape dentro de una URL /e/ o /v/ */
const stapeId = u => (String(u || '').match(/streamtape\.(?:com|to)\/e\/([\w-]+)/i)
  || String(u || '').match(/streamtape\.(?:com|to)\/v\/([\w-]+)/i) || [])[1] || null;

/* item archive.org por entrada (1 solo por serie/película — TODO queda
   agrupado en él; nunca se parte una serie en varios ítems) */
const iaItem = s => 'xmig-' + String(s.id).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/* crea el ítem (bucket) si no existe; archive.org lo exige antes de subir */
async function iaEnsureBucket(item, title) {
  const url = `https://s3.us.archive.org/${item}/`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `LOW ${IA_A}:${IA_S}`,
      'x-archive-meta-mediatype': 'movies',
      'x-archive-meta-title': title.slice(0, 120),
      'x-archive-meta-description': 'Mirror público migrado por el propietario del contenido.',
      'x-archive-meta-language': 'Spanish',
    },
  });
  /* 200 OK = creado; 301/409 = ya existía: igual */
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`IA no pudo crear el ítem ${item}: HTTP ${r.status} ${txt.slice(0, 100)}`);
  }
}

/* sube un archivo de disco a archive.org (S3-compatible) */
async function iaUpload(item, filename, filePath, title) {
  await iaEnsureBucket(item, title);
  const url = `https://s3.us.archive.org/${item}/${encodeURIComponent(filename)}`;
  const data = fs.createReadStream(filePath);
  const size = fs.statSync(filePath).size;
  const r = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `LOW ${IA_A}:${IA_S}`,
      'Content-Type': 'video/mp4',
      'Content-Length': String(size),
    },
    body: data,
    duplex: 'half',
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error('IA PUT ' + r.status + ' ' + txt.slice(0, 120));
  }
  return `https://archive.org/download/${item}/${encodeURIComponent(filename)}`;
}

async function main() {
  const cat = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const map = fs.existsSync(MAPFILE) ? JSON.parse(fs.readFileSync(MAPFILE, 'utf8')) : {};
  /* reintentar los que antes marcaron FAIL (p. ej. cuando archive.org no
     creaba el bucket y todo fallaba en 500: ya no es culpa del enlace) */
  for (const k of Object.keys(map)) if (map[k] === 'FAIL') delete map[k];

  /* inventario pendiente */
  const pend = [];
  for (const s of cat.series || []) {
    for (const e of s.episodes || []) {
      const id = stapeId(e.url);
      if (!id) continue;
      const done = map[e.url];
      if (done && (done.startsWith('http') || done === 'FAIL')) continue;
      pend.push({ s, e, id });
    }
  }
  console.log(`📦 pendientes: ${pend.length} episodios Streamtape (lote máx: ${LOTE})`);
  if (!pend.length) {
    fs.writeFileSync(MAPFILE, JSON.stringify(map, null, 1));
    console.log('✅ Nada que migrar. Mapa final guardado.');
    return;
  }

  let hechos = 0;
  for (const job of pend.slice(0, LOTE)) {
    const { s, e, id } = job;
    console.log(`\n▶ ${s.t} · E${e.n} · stape:${id}`);
    try {
      /* 1) ticket */
      const tk = await stapeApi('file/dlticket', { file: id });
      if (!tk.result || !tk.result.ticket) throw new Error('sin ticket: ' + JSON.stringify(tk).slice(0, 120));
      await sleep(6000); /* Streamtape pide ~5s entre ticket y dl */
      /* 2) URL directa temporal */
      const dl = await stapeApi('file/dl', { file: id, ticket: tk.result.ticket });
      if (!dl.result || !dl.result.url) throw new Error('sin url: ' + JSON.stringify(dl).slice(0, 120));
      const dlUrl = dl.result.url, dlName = dl.result.name || `E${e.n}.mp4`;
      /* 3) descargar a disco */
      const tmp = path.join(ROOT, '.migration-tmp');
      fs.mkdirSync(tmp, { recursive: true });
      const fp = path.join(tmp, `${id}.mp4`);
      const vr = await fetch(dlUrl);
      if (!vr.ok || !vr.body) throw new Error('descarga HTTP ' + vr.status);
      await pipeline(Readable.fromWeb(vr.body), fs.createWriteStream(fp));
      const mb = fs.statSync(fp).size / 1048576;
      console.log(`   ⬇ descargado ${mb.toFixed(1)} MB`);
      if (mb < 1) throw new Error('archivo sospechosamente pequeño');
      /* 4) subir a archive.org — el NOMBRE respeta la forma de la entrada:
         · serie con varios capítulos  → "E### - nombre.mp4" (ordenados solos)
         · serie de UN solo video (temporada empaquetada) o película
           → "<título>.mp4" a pelo, dentro de su propio ítem            */
      const esSolo = (s.episodes || []).length === 1;
      const baseName = String(esSolo ? (s.t || dlName) : (e.t || dlName))
        .replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70);
      const fileName = esSolo
        ? `${baseName || 'video'}.mp4`
        : `E${String(e.n).padStart(3, '0')} - ${baseName || ('Capitulo ' + e.n)}.mp4`;
      const newUrl = await iaUpload(iaItem(s), fileName, fp, `${s.t}${esSolo ? '' : ' · ' + (e.t || 'Episodio ' + e.n)}`);
      fs.rmSync(fp, { force: true });
      await sleep(4000);
      /* 5) verificar que ya responde */
      const chk = await fetch(newUrl, { method: 'HEAD' }).catch(() => null);
      if (!chk || !chk.ok) throw new Error('IA no confirma aún (se publica en el próximo lote)');
      map[e.url] = newUrl;
      hechos++;
      console.log(`   ✅ migrado → ${newUrl}`);
      /* guardar progreso tras CADA episodio (resistente a cortes) */
      fs.writeFileSync(MAPFILE, JSON.stringify(map, null, 1));
    } catch (err) {
      map[e.url] = 'FAIL';
      console.log(`   ⚠ FAIL: ${err.message}`);
      fs.writeFileSync(MAPFILE, JSON.stringify(map, null, 1));
    }
  }
  console.log(`\n🏁 Lote terminado: ${hechos} migrados. Vuelve a lanzar el workflow para continuar.`);
}

main().catch(e => { console.error('ERROR FATAL:', e); process.exit(1); });
