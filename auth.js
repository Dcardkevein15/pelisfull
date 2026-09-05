/* ═══════════════════════════════════════════════════════════
   X·STREAM · auth.js — EL CORAZÓN DEL SISTEMA
   ───────────────────────────────────────────────────────────
   1) IDENTIDAD AUTOMÁTICA — al entrar, la app crea (o recupera)
      una cuenta permanente de dispositivo. Sin registro, sin
      correo, sin Firebase, sin servicios de terceros.
   2) PERSISTENCIA MULTI-CAPA — la identidad vive en
      localStorage + IndexedDB + Cache API + cookie; si una capa
      se borra, las demás la resucitan. Y con el 🗝 CÓDIGO DE
      IDENTIDAD la cuenta (nombre, avatar, país…) se regenera
      IDÉNTICA en cualquier dispositivo, incluso tras desinstalar.
   3) ROLES — 👑 administrador (frase maestra) y 👁 lector.
      El lector ve TODO el catálogo pero no puede editar nada.
   4) CATÁLOGO COMPARTIDO — el admin publica catalog.json junto
      a index.html; cada visitante lo descarga al entrar y ve
      EXACTAMENTE lo mismo. Cero servidores, cero baneos.
   ═══════════════════════════════════════════════════════════ */
'use strict';
(function () {

  /* ─────────── CONFIG ─────────── */
  const CONFIG = {
    adminHash: 'a3ab540a338d2c6f1b9f10e89dc4c13b03cdd3b32f5679ef3ebe88472eb224dc',
    lsKey: 'xstream-auth-v1',
    idbName: 'xstream-auth', idbStore: 'identity', idbKey: 'me',
    cacheName: 'xstream-auth-v1', cacheUrl: './xauth-identity.json',
    cookie: 'xuid', cookieDays: 3650,
    catalogUrl: 'catalog.json',
    ghRepo: 'Dcardkevein15/pelisfull',
    ghBranch: 'main',
    ghTokenKey: 'xstream-gh-token',
  };

  /* botones/zonas que SOLO ve el administrador (el lector ni los ve) */
  const ADMIN_ONLY_IDS = [
    'cineBtn', 'driveFolderBtn', 'editModeBtn', 'addSeriesBtn',
    'trashBtn', 'brokenBtn', 'renameBtn', 'insertEpBtn', 'addEpBtn',
    'delSeriesBtn', 'tagBtn', 'undoBtn', 'goEditBtn', 'importBtn',
    'moveCatBtn', 'tvTools',
  ];

  /* ─────────── Utilidades base ─────────── */
  const axEsc = s => String(s == null ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* FNV-1a 32 bits — hash rápido y determinista para nombres/avatars */
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  /* SHA-256 síncrono en JS puro — respaldo para file:// donde
     crypto.subtle (contexto seguro) no existe. */
  function sha256Sync(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    const maxWord = Math.pow(2, 32);
    let result = '';
    const words = [];
    const asciiBitLength = ascii.length * 8;
    let hash = sha256Sync.h = sha256Sync.h || [];
    const k = sha256Sync.k = sha256Sync.k || [];
    let primeCounter = k.length;
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (let i = 0; i < ascii.length; i++) {
      const j = ascii.charCodeAt(i);
      if (j >> 8) return null; /* solo bytes 0-255 */
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = (asciiBitLength / maxWord) | 0;
    words[words.length] = asciiBitLength;
    for (let j = 0; j < words.length;) {
      const w = words.slice(j, j += 16);
      const oldHash = hash;
      hash = hash.slice(0, 8);
      for (let i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = hash[0], e = hash[4];
        const temp1 = hash[7]
          + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25))
          + ((e & hash[5]) ^ ((~e) & hash[6]))
          + k[i]
          + (w[i] = (i < 16) ? w[i] : (
            w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3))
            + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        const temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (let i = 0; i < 8; i++) {
      for (let j = 3; j + 1; j--) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += ((b < 16) ? '0' : '') + b.toString(16);
      }
    }
    return result;
  }
  const toUtf8Bytes = s => unescape(encodeURIComponent(s));
  async function sha256(str) {
    if (window.crypto && crypto.subtle && window.isSecureContext !== false) {
      try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
        return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (e) { /* cae al respaldo */ }
    }
    return sha256Sync(toUtf8Bytes(str)) || '';
  }

  /* ─────────── Código de identidad (base32 sin caracteres ambiguos) ─────────── */
  const B32 = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  function bytesToCode(bytes) {
    let bits = 0, val = 0, out = '';
    for (const b of bytes) {
      val = (val << 8) | b; bits += 8;
      while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) out += B32[(val << (5 - bits)) & 31];
    return out;
  }
  function codeToBytes(code) {
    const clean = String(code || '').toUpperCase().replace(/[^A-Z2-9]/g, '');
    let bits = 0, val = 0;
    const out = [];
    for (const ch of clean) {
      const v = B32.indexOf(ch);
      if (v < 0) continue;
      val = (val << 5) | v; bits += 5;
      if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
    }
    return new Uint8Array(out);
  }
  const fmtCode = c => String(c).replace(/(.{4})/g, '$1-').replace(/-$/, '');

  /* ─────────── Nombres automáticos (deterministas desde la semilla) ─────────── */
  const NOM_A = ['Lince', 'Fénix', 'Dragón', 'Búho', 'Tigre', 'Lobo', 'Cóndor', 'Jaguar',
    'Halcón', 'Puma', 'Zorro', 'León', 'Orca', 'Cuervo', 'Axolote', 'Nutria',
    'Colibrí', 'Guepardo', 'Mantis', 'Búfalo', 'Serpiente', 'Topo', 'Buitre', 'Tlacuache'];
  const NOM_B = ['Ámbar', 'Umbral', 'Nébula', 'Sombra', 'Solar', 'Ónice', 'Coral', 'Jade',
    'Ígneo', 'Astral', 'Carmesí', 'Glacial', 'Éter', 'Vértice', 'Prisma', 'Ceniza',
    'Turquesa', 'Obsidiana', 'Zafiro', 'Vulcano', 'Relámpago', 'Pardo', 'Torre', 'Nimbus'];

  const AV_GRADS = [
    ['#7c3aed', '#312e81'], ['#ff2e63', '#4a0e2e'], ['#f59e0b', '#7c2d12'],
    ['#10b981', '#064e3b'], ['#3b82f6', '#1e3a8a'], ['#ef4444', '#7f1d1d'],
    ['#ec4899', '#831843'], ['#14b8a6', '#134e4a'], ['#8b5cf6', '#4c1d95'],
    ['#f97316', '#7c2d12'], ['#06b6d4', '#164e63'], ['#d8ff3e', '#3f6212'],
  ];

  /* ─────────── País / nacionalidad aproximada por zona horaria ─────────── */
  const TZ_COUNTRY = {
    'Europe/Madrid': ['ES', 'España'],
    'Atlantic/Canary': ['ES', 'España'],
    'America/Mexico_City': ['MX', 'México'], 'America/Cancun': ['MX', 'México'],
    'America/Merida': ['MX', 'México'], 'America/Monterrey': ['MX', 'México'],
    'America/Mazatlan': ['MX', 'México'], 'America/Chihuahua': ['MX', 'México'],
    'America/Hermosillo': ['MX', 'México'], 'America/Tijuana': ['MX', 'México'],
    'America/Argentina/Buenos_Aires': ['AR', 'Argentina'], 'America/Argentina/Cordoba': ['AR', 'Argentina'],
    'America/Argentina/Mendoza': ['AR', 'Argentina'], 'America/Argentina/Tucuman': ['AR', 'Argentina'],
    'America/Argentina/Salta': ['AR', 'Argentina'], 'America/Argentina/Jujuy': ['AR', 'Argentina'],
    'America/Cordoba': ['AR', 'Argentina'], 'America/Rosario': ['AR', 'Argentina'],
    'America/Bogota': ['CO', 'Colombia'],
    'America/Santiago': ['CL', 'Chile'], 'Pacific/Easter': ['CL', 'Chile'],
    'America/Lima': ['PE', 'Perú'],
    'America/Caracas': ['VE', 'Venezuela'],
    'America/Guayaquil': ['EC', 'Ecuador'], 'Pacific/Galapagos': ['EC', 'Ecuador'],
    'America/La_Paz': ['BO', 'Bolivia'],
    'America/Asuncion': ['PY', 'Paraguay'],
    'America/Montevideo': ['UY', 'Uruguay'],
    'America/Panama': ['PA', 'Panamá'],
    'America/Costa_Rica': ['CR', 'Costa Rica'],
    'America/Guatemala': ['GT', 'Guatemala'],
    'America/El_Salvador': ['SV', 'El Salvador'],
    'America/Tegucigalpa': ['HN', 'Honduras'],
    'America/Managua': ['NI', 'Nicaragua'],
    'America/Santo_Domingo': ['DO', 'Rep. Dominicana'],
    'America/Havana': ['CU', 'Cuba'],
    'America/Puerto_Rico': ['PR', 'Puerto Rico'],
    'America/New_York': ['US', 'Estados Unidos'], 'America/Chicago': ['US', 'Estados Unidos'],
    'America/Denver': ['US', 'Estados Unidos'], 'America/Los_Angeles': ['US', 'Estados Unidos'],
    'America/Phoenix': ['US', 'Estados Unidos'], 'America/Anchorage': ['US', 'Estados Unidos'],
    'Pacific/Honolulu': ['US', 'Estados Unidos'],
    'America/Sao_Paulo': ['BR', 'Brasil'], 'America/Manaus': ['BR', 'Brasil'],
    'America/Fortaleza': ['BR', 'Brasil'], 'America/Recife': ['BR', 'Brasil'],
    'Europe/Lisbon': ['PT', 'Portugal'],
    'Europe/Andorra': ['AD', 'Andorra'],
  };

  function flagEmoji(cc) {
    if (!cc || cc.length !== 2) return '🌐';
    return String.fromCodePoint(...cc.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0)));
  }

  function detectGeo() {
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { }
    let cc = null, country = null;
    if (tz && TZ_COUNTRY[tz]) { cc = TZ_COUNTRY[tz][0]; country = TZ_COUNTRY[tz][1]; }
    if (!cc) {
      /* respaldo: subetiqueta de región del idioma (es-CO → CO) */
      const m = (navigator.language || '').match(/-([A-Za-z]{2})\b/);
      if (m) cc = m[1].toUpperCase();
      if (cc === 'ES') country = 'España';
    }
    return { tz: tz || 'desconocida', cc: cc || '', flag: cc ? flagEmoji(cc) : '🌐', country: country || (cc ? cc : 'Internacional') };
  }

  function detectDevice() {
    const ua = navigator.userAgent || '';
    const mob = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    return { kind: mob ? '📱 Móvil' : '💻 Ordenador', platform: String(platform).slice(0, 24) || '—' };
  }

  /* ─────────── Avatar procedural (SVG inline, determinista) ─────────── */
  function avatarSvg(id) {
    const h = fnv1a(id.uid + id.name);
    const grads = AV_GRADS[h % AV_GRADS.length];
    const ini = (id.name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    /* patrón de barras decorativo según el hash */
    let bars = '';
    for (let i = 0; i < 4; i++) {
      const y = 18 + ((h >> (i * 4)) % 56);
      const w = 18 + ((h >> (i * 5)) % 60);
      bars += `<rect x='${i % 2 ? 96 - w - 10 : 10}' y='${y}' width='${w}' height='7' rx='3.5' fill='rgba(255,255,255,.${13 + i * 4})'/>`;
    }
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>` +
      `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
      `<stop offset='0' stop-color='${grads[0]}'/><stop offset='1' stop-color='${grads[1]}'/></linearGradient></defs>` +
      `<rect width='96' height='96' fill='url(#g)'/>` + bars +
      `<circle cx='48' cy='42' r='24' fill='rgba(10,10,15,.35)'/>` +
      `<text x='48' y='51' font-family='Archivo Black,Arial' font-size='24' font-weight='900' fill='#fff' text-anchor='middle'>${ini}</text>` +
      `</svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  /* ─────────── La identidad ─────────── */
  let ID = null;          // objeto identidad en memoria
  let API = null;         // puente con app.js (se conecta con XAUTH.attach)

  function identityFromSeed(bytes) {
    if (!bytes || bytes.length < 10) return null;
    const hex = [...bytes.slice(0, 10)].map(b => b.toString(16).padStart(2, '0')).join('');
    const h1 = fnv1a('a>' + hex), h2 = fnv1a('b>' + hex), h3 = fnv1a('c>' + hex);
    const name = NOM_A[h1 % NOM_A.length] + ' ' + NOM_B[h2 % NOM_B.length];
    const geo = detectGeo();
    const dev = detectDevice();
    return {
      v: 1,
      uid: 'x-' + hex,                       /* 20 chars hex: id único del dispositivo */
      code: bytesToCode(bytes),              /* 🗝 código maestro de 16 letras */
      name,
      nameAuto: name,                        /* para saber si el nombre es automático */
      tag: '#' + String(1000 + (h3 % 9000)),
      grad: h3 % AV_GRADS.length,
      country: geo.country, cc: geo.cc, flag: geo.flag, tz: geo.tz,
      lang: navigator.language || 'es',
      device: dev.kind, platform: dev.platform,
      createdAt: Date.now(), lastSeen: Date.now(), visits: 0,
      admin: false,
    };
  }

  function newIdentity() {
    const bytes = new Uint8Array(10);
    crypto.getRandomValues(bytes);
    const id = identityFromSeed(bytes);
    id.isNew = true;
    return id;
  }

  /* sanea una identidad recuperada de una capa (versión vieja / campos perdidos) */
  function normalizeIdentity(id) {
    if (!id || typeof id !== 'object' || !id.uid || !id.code) return null;
    id.name = id.name || 'Visitante';
    id.nameAuto = id.nameAuto || id.name;
    id.tag = id.tag || '#0000';
    id.country = id.country || 'Internacional';
    id.flag = id.flag || '🌐';
    id.cc = id.cc || '';
    id.grad = typeof id.grad === 'number' ? id.grad : 0;
    id.lang = id.lang || 'es';
    id.tz = id.tz || '';
    id.device = id.device || '💻 Ordenador';
    id.platform = id.platform || '';
    id.createdAt = id.createdAt || Date.now();
    id.visits = id.visits || 0;
    id.admin = !!id.admin;
    return id;
  }

  /* ═══════════ PERSISTENCIA MULTI-CAPA ═══════════
     La identidad se guarda en 4 sitios a la vez. Si el navegador
     limpia uno (o desinstalas la app), cualquier otro la resucita. */
  function lsRead() {
    try { const r = localStorage.getItem(CONFIG.lsKey); return r ? JSON.parse(r) : null; }
    catch (e) { return null; }
  }
  function lsWrite(id) {
    try { localStorage.setItem(CONFIG.lsKey, JSON.stringify(id)); } catch (e) { }
  }
  function cookieWrite(id) {
    try {
      const exp = new Date(Date.now() + CONFIG.cookieDays * 864e5).toUTCString();
      document.cookie = `${CONFIG.cookie}=${encodeURIComponent(id.code)}; expires=${exp}; path=/; SameSite=Lax`;
    } catch (e) { }
  }
  function cookieRead() {
    try {
      const m = document.cookie.match(new RegExp('(?:^|; )' + CONFIG.cookie + '=([^;]+)'));
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  }
  function idbOpen() {
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('sin idb'));
      const rq = indexedDB.open(CONFIG.idbName, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(CONFIG.idbStore);
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error || new Error('idb'));
    });
  }
  async function idbRead() {
    try {
      const db = await idbOpen();
      return await new Promise(res => {
        const tx = db.transaction(CONFIG.idbStore, 'readonly');
        const g = tx.objectStore(CONFIG.idbStore).get(CONFIG.idbKey);
        g.onsuccess = () => res(g.result || null);
        g.onerror = () => res(null);
      });
    } catch (e) { return null; }
  }
  async function idbWrite(id) {
    try {
      const db = await idbOpen();
      await new Promise(res => {
        const tx = db.transaction(CONFIG.idbStore, 'readwrite');
        tx.objectStore(CONFIG.idbStore).put(JSON.parse(JSON.stringify(id)), CONFIG.idbKey);
        tx.oncomplete = res; tx.onerror = res;
      });
    } catch (e) { }
  }
  async function cacheRead() {
    try {
      if (!('caches' in window)) return null;
      const c = await caches.open(CONFIG.cacheName);
      const r = await c.match(CONFIG.cacheUrl);
      return r ? await r.json() : null;
    } catch (e) { return null; }
  }
  async function cacheWrite(id) {
    try {
      if (!('caches' in window)) return;
      const c = await caches.open(CONFIG.cacheName);
      await c.put(CONFIG.cacheUrl, new Response(JSON.stringify(id), { headers: { 'Content-Type': 'application/json' } }));
    } catch (e) { }
  }
  function writeAll() {
    if (!ID) return;
    ID.lastSeen = Date.now();
    lsWrite(ID); cookieWrite(ID); idbWrite(ID); cacheWrite(ID);
  }
  function requestPersist() {
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
    } catch (e) { }
  }

  /* ─────────── Toast propio (independiente de app.js) ─────────── */
  let axToastTimer = null;
  function axToast(msg, err) {
    let el = document.getElementById('axToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'axToast'; el.className = 'ax-toast hidden';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.toggle('err', !!err);
    el.classList.remove('hidden');
    clearTimeout(axToastTimer);
    axToastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
  }

  /* ═══════════ ROLES ═══════════ */
  const isAdmin = () => !!(ID && ID.admin);
  let unlockFails = 0;
  async function unlockAdmin(pass) {
    const h = await sha256(String(pass || '').trim());
    if (h && h === CONFIG.adminHash) {
      ID.admin = true; writeAll(); applyRole(); renderChip();
      return true;
    }
    unlockFails++;
    return false;
  }
  function lockAdmin() {
    if (!ID) return;
    ID.admin = false; writeAll(); applyRole(); renderChip();
  }
  function applyRole() {
    const admin = isAdmin();
    document.body.classList.toggle('ro', !admin);
    for (const id of ADMIN_ONLY_IDS) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('ro-hide', !admin);
    }
    /* Firebase queda retirado: el catálogo compartido lo sustituye */
    const sb = document.getElementById('syncBtn');
    if (sb) sb.style.display = 'none';
    const chip = document.getElementById('userChip');
    if (chip) chip.classList.toggle('is-admin', admin);
    /* 🔒 FAIL-CLOSED: solo los que SÍ verificaron la clave ven los controles */
    document.body.classList.toggle('admin-on', admin);
    /* refresca la lista por si hay botones que dependen del rol (TV, papelera…) */
    if (API && API.onRoleChange) { try { API.onRoleChange(); } catch (e) { } }
    else if (API && API.renderSeries) { try { API.renderSeries(); } catch (e) { } }
  }

  /* ═══════════ CHIP EN LA TOPBAR (avatar + nombre) ═══════════ */
  function renderChip() {
    const chip = document.getElementById('userChip');
    if (!chip || !ID) return;
    const ava = chip.querySelector('.uc-ava');
    const nm = chip.querySelector('.uc-name');
    const sub = chip.querySelector('.uc-sub');
    if (ava) ava.src = avatarSvg(ID);
    if (nm) nm.textContent = (ID.admin ? '👑 ' : '') + ID.name;
    if (sub) sub.textContent = (ID.flag ? ID.flag + ' ' : '') + (ID.country || '') + ' · ' + ID.tag;
    /* al pasar el ratón (o en pantallas donde el texto va oculto) se muestra todo */
    chip.title = `${ID.name} ${ID.tag} · ${ID.flag} ${ID.country}\nClic para abrir tu perfil`;
  }

  /* ═══════════ MODAL DE PERFIL ═══════════ */
  function profileModalEnsure() {
    let bd = document.getElementById('axProfile');
    if (bd) return bd;
    bd = document.createElement('div');
    bd.id = 'axProfile';
    bd.className = 'ax-backdrop hidden';
    bd.innerHTML = `
      <div class="modal ax-modal">
        <div class="ax-head">
          <img class="ax-ava" id="axAva" alt="">
          <div class="ax-id">
            <div class="ax-namerow">
              <b id="axName"></b>
              <span id="axTag" class="ax-tag"></span>
              <button class="ax-edit" id="axEditName" title="Cambiar tu nombre">✎</button>
            </div>
            <div class="ax-role" id="axRole"></div>
          </div>
        </div>
        <div class="ax-grid" id="axGrid"></div>
        <div class="ax-sec">
          <div class="ax-sec-t">♥ Tu actividad en este dispositivo</div>
          <div class="ax-stats" id="axStats"></div>
          <div class="ax-recent" id="axRecent"></div>
        </div>
        <div class="ax-sec">
          <div class="ax-sec-t">🗝 Código de identidad</div>
          <p class="ax-note">Con este código vuelves a SER esta misma cuenta (nombre, avatar y perfil) en cualquier dispositivo, <b>incluso si desinstalas la app</b>. Guárdalo como oro.</p>
          <div class="ax-codebox">
            <code id="axCode"></code>
            <button class="btn btn-mini" id="axCopyCode">Copiar</button>
          </div>
          <div class="ax-restore">
            <input id="axRestoreIn" placeholder="Pega tu código para restaurar tu cuenta" spellcheck="false" autocomplete="off">
            <button class="btn btn-mini" id="axRestoreBtn">Restaurar</button>
          </div>
        </div>
        <div class="ax-sec" id="axAdminSec"></div>
        <div class="ax-sec">
          <div class="ax-sec-t">🌐 Catálogo compartido</div>
          <div class="ax-catstatus" id="axCatStatus"></div>
          <div id="axPublishZone"></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="axClose">Cerrar</button>
        </div>
      </div>`;
    document.body.appendChild(bd);
    bd.addEventListener('click', ev => { if (ev.target === bd) bd.classList.add('hidden'); });
    bd.querySelector('#axClose').addEventListener('click', () => bd.classList.add('hidden'));
    bd.querySelector('#axCopyCode').addEventListener('click', () => {
      navigator.clipboard.writeText(ID.code)
        .then(() => axToast('🗝 Código copiado — guárdalo en un lugar seguro'))
        .catch(() => axToast('No se pudo copiar', true));
    });
    bd.querySelector('#axEditName').addEventListener('click', async () => {
      const cur = ID.name;
      const nuevo = prompt('Tu nombre visible:', cur);
      if (nuevo === null) return;
      const t = nuevo.trim().slice(0, 30);
      if (!t || t === cur) return;
      ID.name = t; writeAll(); renderChip(); renderProfile();
      axToast('✎ Nombre actualizado');
    });
    bd.querySelector('#axRestoreBtn').addEventListener('click', () => {
      const raw = bd.querySelector('#axRestoreIn').value;
      const bytes = codeToBytes(raw);
      if (bytes.length < 10) return axToast('⚠ Código no válido', true);
      const eraAdmin = ID.admin;
      const restored = identityFromSeed(bytes);
      restored.admin = eraAdmin; /* si ya eras admin aquí, lo sigues siendo */
      ID = restored;
      writeAll(); renderChip(); applyRole(); renderProfile();
      axToast(`🗝 Cuenta restaurada: ${ID.name} ${ID.tag}`);
    });
    return bd;
  }

  function renderProfile() {
    if (!ID) return;
    const bd = profileModalEnsure();
    bd.querySelector('#axAva').src = avatarSvg(ID);
    bd.querySelector('#axName').textContent = ID.name;
    bd.querySelector('#axTag').textContent = ID.tag;
    const roleEl = bd.querySelector('#axRole');
    roleEl.innerHTML = ID.admin
      ? '<span class="ax-badge admin">👑 ADMINISTRADOR</span>'
      : '<span class="ax-badge lector">👁 LECTOR — solo lectura</span>';
    /* ficha de datos del dispositivo */
    const since = new Date(ID.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    bd.querySelector('#axGrid').innerHTML = `
      <div class="ax-cell"><span>🌍 Nacionalidad</span><b>${ID.flag} ${axEsc(ID.country)}</b></div>
      <div class="ax-cell"><span>🗣 Idioma</span><b>${axEsc(ID.lang)}</b></div>
      <div class="ax-cell"><span>🕒 Zona</span><b>${axEsc(ID.tz)}</b></div>
      <div class="ax-cell"><span>${ID.device}</span><b>${axEsc(ID.platform || '—')}</b></div>
      <div class="ax-cell"><span>📅 Cuenta creada</span><b>${since}</b></div>
      <div class="ax-cell"><span>👣 Visitas</span><b>${ID.visits}</b></div>`;
    bd.querySelector('#axCode').textContent = fmtCode(ID.code);
    /* estadísticas personales leyendo el estado de app.js (si está conectado) */
    const st = API && API.getState ? API.getState() : null;
    const statsEl = bd.querySelector('#axStats');
    const recentEl = bd.querySelector('#axRecent');
    if (st) {
      const favs = st.series.filter(s => s.fav);
      let vistos = 0;
      for (const sid of Object.keys(st.progress || {})) {
        vistos += Object.values(st.progress[sid]).filter(p => p && p.done).length;
      }
      const totalSec = Math.floor((st.stats && st.stats.totalSec) || 0);
      const h = Math.floor(totalSec / 3600), m = Math.round((totalSec % 3600) / 60);
      statsEl.innerHTML = `
        <div class="ax-stat"><b>${favs.length}</b><span>♥ Favoritos</span></div>
        <div class="ax-stat"><b>${vistos}</b><span>✓ Vistos</span></div>
        <div class="ax-stat"><b>${h ? h + 'h ' + m + 'm' : m + ' min'}</b><span>⏱ Viendo</span></div>`;
      /* últimos 5 según progreso (historial) */
      const recentes = [];
      for (const s of st.series) {
        const prog = (st.progress || {})[s.id];
        if (!prog) continue;
        let best = null;
        for (const [n, p] of Object.entries(prog)) {
          if (p && p.at && (!best || p.at > best.at)) best = { ep: +n, at: p.at };
        }
        if (best) recentes.push({ s, ...best });
      }
      recentes.sort((a, b) => b.at - a.at);
      recentEl.innerHTML = recentes.length
        ? recentes.slice(0, 5).map(r =>
          `<div class="ax-rec"><span class="ax-rec-t">${axEsc(r.s.t)}</span><span class="ax-rec-e">${r.s.kind === 'pelicula' ? '🎬' : 'E' + r.ep} · ${new Date(r.at).toLocaleDateString()}</span></div>`).join('')
        : '<div class="ax-note">Aún no has visto nada — tu historial aparecerá aquí.</div>';
    } else {
      statsEl.innerHTML = '<div class="ax-note">Estadísticas disponibles cuando la app termine de cargar.</div>';
      recentEl.innerHTML = '';
    }
    renderAdminZone();
    renderCatalogStatus();
  }

  function renderAdminZone() {
    const bd = profileModalEnsure();
    const sec = bd.querySelector('#axAdminSec');
    if (isAdmin()) {
      sec.innerHTML = `
        <div class="ax-sec-t">👑 Zona de administrador</div>
        <p class="ax-note">Eres el administrador absoluto: solo tú ves los botones de edición (Buscar cine, Importar Drive, Editar enlaces, Añadir serie…) y solo tú puedes publicar el catálogo.</p>
        <button class="btn btn-ghost" id="axLock">🔒 Salir del modo admin</button>`;
      sec.querySelector('#axLock').addEventListener('click', () => {
        lockAdmin(); renderProfile();
        axToast('🔒 Modo solo lectura activado');
      });
    } else {
      sec.innerHTML = `
        <div class="ax-sec-t">👑 ¿Eres el administrador?</div>
        <p class="ax-note">Introduce la frase maestra para desbloquear todas las herramientas de edición y la publicación del catálogo.</p>
        <div class="ax-restore">
          <input id="axAdminPass" type="password" placeholder="Frase maestra" autocomplete="off">
          <button class="btn btn-acid" id="axUnlock">Desbloquear</button>
        </div>
        <p class="ax-note">Atajo: abre la web con <b>?admin=TU-FRASE</b> al final de la URL.</p>`;
      const go = async () => {
        const val = sec.querySelector('#axAdminPass').value;
        if (unlockFails >= 5) { await new Promise(r => setTimeout(r, 4000)); unlockFails = 0; }
        const ok = await unlockAdmin(val);
        if (ok) { renderProfile(); axToast('👑 ¡Hola, jefe! Todos los botones son tuyos'); }
        else axToast('⚠ Frase incorrecta', true);
      };
      sec.querySelector('#axUnlock').addEventListener('click', go);
      sec.querySelector('#axAdminPass').addEventListener('keydown', ev => { if (ev.key === 'Enter') go(); });
    }
  }

  function openProfile() {
    if (!ID) return;
    renderProfile();
    profileModalEnsure().classList.remove('hidden');
  }

  /* ═══════════ CATÁLOGO COMPARTIDO (sin Firebase) ═══════════
     El administrador PUBLICA catalog.json junto a index.html.
     Cada visitante lo descarga al entrar: todos ven exactamente
     lo mismo que el administrador. Es nuestro "P2P" sin red P2P:
     un archivo estático servido por el propio hosting. */
  function cleanForPublish(s) {
    const o = {};
    ['id', 't', 'jp', 'tag', 'g', 'kind', 'anime', 'poster', 'tags', 'seasons', 'order'].forEach(k => {
      if (s[k] !== undefined) o[k] = s[k];
    });
    o.episodes = (s.episodes || []).map(e => {
      const p = {};
      ['n', 't', 'url', 'sub', 'season', 'ova', 'srcOva', 'srcSeason'].forEach(k => {
        if (e[k] !== undefined && e[k] !== '' && e[k] !== null) p[k] = e[k];
      });
      /* 📸 publica la miniatura ya extraída (si existe) para que los lectores
         la vean al instante, sin tener que volver a pedirla ellos         */
      const tk = s.id + ':' + e.n;
      if (state.thumbs && state.thumbs[tk]) p.thumb = state.thumbs[tk];
      return p;
    });
    return o;
  }

  async function publishCatalog() {
    if (!isAdmin()) return axToast('🔒 Solo el administrador publica el catálogo', true);
    if (!API || !API.getState) return axToast('La app aún no está lista', true);
    const state = API.getState();
    const series = state.series.filter(s => !s.personal && s.via !== 'shared').map(cleanForPublish);
    /* 📡 los canales TV SIEMPRE van en el catálogo público (con fuentes iptv-org vivas) */
    const channels = (state.channels || []).map(c => ({
      id: c.id, name: c.name, logo: c.logo, group: c.group, url: c.url,
      epg: c.epg || '', cc: c.cc || '', quality: c.quality || '', src: c.src,
    }));
    const payload = {
      app: 'xstream', v: Date.now(), by: ID.name + ' ' + ID.tag,
      at: new Date().toISOString(), n: series.length + channels.length, series, channels,
      tvSources: state.tvSources || {},
    };

    /* ① PUBLICACIÓN AUTOMÁTICA A GITHUB — los lectores lo reciben solos */
    const token = ghToken() || ghAskToken();
    if (token) {
      axToast('🌐 Publicando en GitHub… todos lo recibirán en ~1 minuto');
      try {
        await ghPublishCatalog(payload, token);
        state.catalogMeta = { v: payload.v, at: Date.now(), n: payload.n };
        if (API.save) API.save();
        renderCatalogStatus();
        axToast(`🌐 PUBLICADO para todos: ${payload.n} entradas · los visitantes lo reciben automáticamente`);
        return;
      } catch (e) {
        axToast('⚠ No se pudo publicar en GitHub: ' + (e.message || e) + '. Revisa tu token.', true);
        /* continúa al respaldo local abajo */
      }
    } else {
      axToast('⚠ Sin token de GitHub: uso el respaldo con descarga', true);
    }

    /* ② respaldo: guardar el archivo y subirlo a mano (mecanismo antiguo) */
    const json = JSON.stringify(payload);
    if (window.showSaveFilePicker) {
      try {
        const h = await window.showSaveFilePicker({
          suggestedName: 'catalog.json',
          types: [{ description: 'Catálogo X·STREAM', accept: { 'application/json': ['.json'] } }],
        });
        const w = await h.createWritable();
        await w.write(json); await w.close();
        state.catalogMeta = { v: payload.v, at: Date.now(), n: payload.n };
        if (API.save) API.save();
        renderCatalogStatus();
        axToast('🌐 catalog.json guardado — súbelo al repo para que se vea');
        return;
      } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'catalog.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    axToast('⬇ catalog.json descargado — súbelo al repo para publicarlo');
  }

  /* ═══ Publicación directa a GitHub (el catálogo llega a TODOS solo) ═══
     El token nunca se incluye en el catálogo ni se sube al repo:
     vive solo en el localStorage del dispositivo del administrador. */
  function ghToken() {
    try { return localStorage.getItem(CONFIG.ghTokenKey) || ''; } catch (e) { return ''; }
  }
  function ghAskToken(force) {
    const cur = ghToken();
    if (cur && !force) return cur;
    const t = window.prompt(
      '🔑 TOKEN DE GITHUB (classic, con permiso "repo")\n\n' +
      'Se guarda SOLO en este dispositivo — nunca se sube al repo ni va en el catálogo.\n' +
      'GitHub → Settings → Developer settings → Tokens (classic) → Generate new token → marca el scope "repo".'
      + (cur ? `\n\nActual: …${cur.slice(-6)} (borra el campo para eliminarlo)` : ''),
      ''
    );
    if (t === null) return cur;
    const v = t.trim();
    if (!v) { try { localStorage.removeItem(CONFIG.ghTokenKey); } catch (e) { } return ''; }
    try { localStorage.setItem(CONFIG.ghTokenKey, v); } catch (e) { }
    return v;
  }
  async function ghPublishCatalog(payload, token) {
    const base = `https://api.github.com/repos/${CONFIG.ghRepo}/contents/catalog.json`;
    const headers = { Authorization: 'token ' + token, Accept: 'application/vnd.github+json' };
    /* necesitamos el SHA actual del archivo para poder sobreescribirlo */
    const get = await fetch(`${base}?ref=${CONFIG.ghBranch}`, { headers });
    let sha = null;
    if (get.ok) { sha = (await get.json()).sha; }
    /* UTF-8 → base64 sin romper tildes/emoji */
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 1))));
    const res = await fetch(base, {
      method: 'PUT', headers,
      body: JSON.stringify({
        message: `📡 catálogo ${new Date().toISOString()}`,
        content, branch: CONFIG.ghBranch,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || ('HTTP ' + res.status));
    }
    return true;
  }

  function renderCatalogStatus() {
    const bd = document.getElementById('axProfile');
    if (!bd) return;
    const el = bd.querySelector('#axCatStatus');
    const st = API && API.getState ? API.getState() : null;
    const meta = st && st.catalogMeta;
    if (meta && meta.v) {
      el.innerHTML = `📡 Versión aplicada: <b>${new Date(meta.v).toLocaleString()}</b> · ${meta.n != null ? meta.n + ' títulos' : '—'}`;
    } else {
      el.innerHTML = 'Aún no se ha aplicado ningún catálogo publicado en este dispositivo.';
    }
    const zone = bd.querySelector('#axPublishZone');
    if (isAdmin()) {
      zone.innerHTML = `<button class="btn btn-acid" id="axPublish">🌐 Publicar mi biblioteca para TODOS</button>
        <p class="ax-note">Genera <b>catalog.json</b> con tus series y películas (sin tus datos personales). Guárdalo junto a <b>index.html</b> y todo visitante lo recibirá automáticamente al abrir la web.</p>`;
      zone.querySelector('#axPublish').addEventListener('click', publishCatalog);
    } else {
      zone.innerHTML = '';
    }
  }

  /* aplicar el catálogo publicado (solo lectores; el admin ES la fuente) */
  function applyCatalog(cat) {
    const state = API.getState();
    const newIds = new Set(cat.series.map(s => s.id));
    /* los stubs temporales creados al abrir un enlace compartido deben
       DISOLVERSE dentro de la serie original cuando el catálogo llega    */
    const slugify = t => String(t || '').toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    /* match flexible: título exacto, o sufijo/subcadena de slug (el stub
       "kimetsu-no-yaiba" coincide con "demon-slayer-kimetsu-no-yaiba") */
    const slugMatch = (a, b) => {
      if (a === b) return true;
      if (a.endsWith('-' + b) || b.endsWith('-' + a)) return true;
      const ax = ' ' + a.replace(/-/g, ' ') + ' ', bx = ' ' + b.replace(/-/g, ' ') + ' ';
      return ax.includes(bx) || bx.includes(ax);
    };
    /* rescatamos el progreso del stub antes de fusionarlo */
    const dissolved = []; /* [{stubId, realId}] — los avisamos a la app para que repinte */
    state.series = state.series.filter(s => {
      if (!s.via || s.via !== 'shared') return true;
      const slug = slugify(s.t);
      const real = cat.series.find(x => x.t === s.t || slugMatch(slugify(x.t), slug));
      if (real) {
        /* migramos el progreso del stub al real y lo borramos */
        const stProg = (state.progress || {})[s.id] || {};
        for (const [epN, pr] of Object.entries(stProg)) {
          state.progress = state.progress || {};
          state.progress[real.id] = state.progress[real.id] || {};
          state.progress[real.id][epN] = state.progress[real.id][epN] || pr;
        }
        if (state.lastPlayed && state.lastPlayed[s.id]) {
          state.lastPlayed[real.id] = Math.max(state.lastPlayed[real.id] || 0, state.lastPlayed[s.id]);
          delete state.lastPlayed[s.id];
        }
        dissolved.push({ stubId: s.id, realId: real.id });
        return false; /* el stub se disuelve en la serie de verdad */
      }
      return true; /* sin contraparte en el catálogo, se conserva */
    });
    /* avisamos a la app para que repinte si el stub estaba activo */
    if (dissolved.length && API.onStubDissolved) {
      try { API.onStubDissolved(dissolved); } catch (e) { }
    }
    const keepLocal = s => s.personal || s.via === 'shared';
    /* 1) lo que no está en el catálogo del admin desaparece
          (salvo series personales o recibidas por enlace compartido) */
    state.series = state.series.filter(s => keepLocal(s) || newIds.has(s.id));
    /* 2) inserta/actualiza cada entrada del admin conservando lo personal */
    let added = 0, updated = 0;
    for (const cs of cat.series) {
      const local = state.series.find(x => x.id === cs.id);
      let target = local;
      if (!local) {
        state.series.push(JSON.parse(JSON.stringify(cs)));
        added++;
        target = state.series[state.series.length - 1];
      } else {
        const fav = local.fav, rem = local.reminder;
        for (const k of Object.keys(local)) {
          if (!(k in cs) && k !== 'fav' && k !== 'reminder') delete local[k];
        }
        Object.assign(local, JSON.parse(JSON.stringify(cs)));
        if (fav !== undefined) local.fav = fav;
        if (rem !== undefined) local.reminder = rem;
        updated++;
      }
      /* 📸 si el admin incluyó miniaturas, se guardan tal cual para el lector */
      if (target && Array.isArray(target.episodes)) {
        for (const e of target.episodes) {
          if (e.thumb) {
            state.thumbs = state.thumbs || {};
            const tk = cs.id + ':' + e.n;
            if (!state.thumbs[tk]) state.thumbs[tk] = e.thumb;
          }
        }
      }
    }
    /* 3) limpieza: progreso/papelera de series que ya no existen */
    const alive = new Set(state.series.map(s => s.id));
    if (state.progress) Object.keys(state.progress).forEach(k => { if (!alive.has(k)) delete state.progress[k]; });
    if (state.lastPlayed) Object.keys(state.lastPlayed).forEach(k => { if (!alive.has(k)) delete state.lastPlayed[k]; });
    state.trash = (state.trash || []).filter(t => t.series && alive.has(t.series.id));
    /* 📡 canales de TV: el catálogo del admin es la lista oficial.
       Se reemplazan los canales compartidos anteriores pero se conservan
       los que el lector haya añadido a mano (src 'manual'). */
    if (Array.isArray(cat.channels)) {
      const manuales = (state.channels || []).filter(c => c.src === 'manual');
      state.channels = cat.channels.map(c => ({ ...c, src: c.src || 'catalog', at: Date.now() })).concat(manuales);
      if (state.currentChannel && !state.channels.some(c => c.id === state.currentChannel)) {
        state.currentChannel = null;
      }
    }
    /* las fuentes M3U del admin quedan suscritas en el lector también,
       así sus dispositivos pueden refrescar los enlaces sin esperar una nueva publicación */
    if (cat.tvSources && typeof cat.tvSources === 'object') {
      state.tvSources = Object.assign({}, state.tvSources || {}, cat.tvSources);
    }
    state.catalogMeta = { v: cat.v, at: Date.now(), n: cat.series.length + (cat.channels ? cat.channels.length : 0) };
    API.save();
    API.renderSeries(); API.renderEpisodes(); API.renderContinue();
    /* ▶ Corrección clave: si la serie ACTIVA en este momento está abierta
       y el catálogo llegó con URLs nuevas, recargamos el capítulo que el
       usuario está viendo para que el video ya no quede vacío. */
    if (API.onCatalogRefreshSignal) {
      try { API.onCatalogRefreshSignal(); } catch (e) { }
    }
    if (API.renderTagChips) API.renderTagChips();
    if (added || updated) axToast(`🌐 Catálogo actualizado: ${cat.series.length} títulos de ${cat.by || 'el administrador'}`);
  }

  let syncing = false;
  async function syncCatalog() {
    if (isAdmin()) return;                 /* el admin nunca se pisa a sí mismo */
    if (!/^https?:$/.test(location.protocol)) return; /* file:// → sin red */
    if (syncing) return;
    syncing = true;
    try {
      /* anti-caché agresivo: el mismo archivo pedido 2 veces seguidas
         puede servirse viejo desde el CDN de GitHub Pages, así que
         añadimos un parámetro único cada vez */
      const r = await fetch(CONFIG.catalogUrl + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const cat = await r.json();
      if (!cat || typeof cat.v !== 'number' || !Array.isArray(cat.series) || !cat.series.length) return;
      const st = API.getState();
      const cur = (st.catalogMeta && st.catalogMeta.v) || 0;
      if (cat.v <= cur) return;            /* ya está aplicada esta versión */
      applyCatalog(cat);
    } catch (e) { /* sin archivo: sigue con lo local */ }
    finally { syncing = false; }
  }

  /* ═══════════ ARRANQUE ═══════════ */
  async function boot() {
    /* 1) lee la capa más rápida (localStorage) al instante */
    let id = normalizeIdentity(lsRead());
    /* 2) si no hay, prueba la cookie (lleva solo el código → se regenera todo) */
    if (!id) {
      const c = cookieRead();
      if (c) { id = identityFromSeed(codeToBytes(c)); if (id) id.restored = true; }
    }
    if (id) {
      ID = id;
      bootUI();
      /* 3) en segundo plano: si IndexedDB/Cache tienen una identidad
            más completa (p.ej. localStorage limpiado), la adoptan */
      (async () => {
        const deeper = normalizeIdentity(await idbRead()) || normalizeIdentity(await cacheRead());
        if (deeper && (!lsRead())) {
          ID = deeper; ID.restored = true;
          writeAll(); renderChip(); applyRole();
        }
      })();
    } else {
      /* 4) ninguna capa rápida: prueba las profundas antes de crear */
      id = normalizeIdentity(await idbRead()) || normalizeIdentity(await cacheRead());
      if (id) { ID = id; ID.restored = true; }
      else { ID = newIdentity(); }
      bootUI();
    }
    ID.visits = (ID.visits || 0) + 1;
    writeAll();
    requestPersist();
    renderChip();
    applyRole();

    if (ID.isNew) {
      axToast(`👤 Cuenta creada: ${ID.name} ${ID.tag} — tu progreso se guarda solo`);
      ID.isNew = false; writeAll();
    } else if (ID.restored) {
      axToast(`♻ Bienvenido de nuevo, ${ID.name} — cuenta recuperada`);
      ID.restored = false; writeAll();
    }
    /* entrada admin por URL: ?admin=FRASE (se borra de la barra al instante) */
    try {
      const q = new URLSearchParams(location.search);
      if (q.has('admin') && !isAdmin()) {
        const pass = q.get('admin');
        history.replaceState(null, '', location.pathname + (location.hash || ''));
        const ok = await unlockAdmin(pass);
        axToast(ok ? '👑 ¡Hola, jefe! Todos los botones son tuyos' : '🔒 Frase incorrecta', !ok);
      }
    } catch (e) { }
  }

  function bootUI() {
    /* engancha el chip de la topbar (si index.html ya lo tiene) */
    const wire = () => {
      const chip = document.getElementById('userChip');
      if (chip && !chip.dataset.wired) {
        chip.dataset.wired = '1';
        chip.addEventListener('click', openProfile);
      }
    };
    wire();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wire);
    }
    addEventListener('beforeunload', writeAll);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') writeAll(); });
  }

  /* ═══════════ PUENTE CON app.js ═══════════ */
  function attach(api) {
    API = api || {};
    applyRole();   /* por si app.js creó elementos tras el boot */
    renderChip();
    /* al entrar: si soy lector, descargo y aplico el catálogo del admin */
    syncCatalog().catch(() => { });
    /* re-chequeo automático: al volver a la pestaña, al recuperar red, y cada 2 min.
       Si no hay nada nuevo, el usuario no percibe absolutamente nada. */
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) syncCatalog().catch(() => { });
    });
    window.addEventListener('online', () => syncCatalog().catch(() => { }));
    setInterval(() => syncCatalog().catch(() => { }), 2 * 60 * 1000);
  }

  /* ═══════════ API pública ═══════════ */
  window.XAUTH = {
    attach,
    isAdmin,
    openProfile,
    publishCatalog,
    lockAdmin,
    unlockAdmin,
    sha256,
    get id() { return ID; },
    get ready() { return !!ID; },
  };

  /* anti-parpadeo: oculta los controles de admin desde el primer
     instante; si luego la frase maestra desbloquea, reaparecen */
  applyRole();

  boot();
})();
