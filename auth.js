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
    3) ROLES — 👑 administrador (frase maestra; publica y firma),
       🛡 moderadores (pases firmados con caducidad, ligados al
       dispositivo: editan pero NO publican ni ven claves) y
       👁 lectores (ven TODO el catálogo pero no editan nada).
    4) CATÁLOGO COMPARTIDO — el admin publica catalog.json junto
       a index.html; cada visitante lo descarga al entrar y ve
       EXACTAMENTE lo mismo. Cero servidores, cero baneos.
    5) CATÁLOGO FIRMADO — el admin firma catalog.json con ECDSA
       P-256 (WebCrypto) al publicar, sin pasos extra. Cada
       lector valida el ESQUEMA y verifica la FIRMA con la clave
       pública embebida (CONFIG.catalogPubKey): un archivo
       adulterado en el hosting se rechaza entero.
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
    /* 🔐 Clave pública ECDSA P-256 (base64 SPKI) que firma el catálogo.
       Se genera sola al publicar la 1ª vez; cópiala del Perfil → «Firma del
       catálogo» y pégala aquí UNA sola vez. Mientras esté vacía, los lectores
       aceptan el catálogo sin firma (modo legado); con clave, RECHAZAN
       cualquier catalog.json que no esté firmado por tu clave privada. */
    catalogPubKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEd8Ro3qWzRh/Tz2Hnj6t31SlTG6CUFcqKA6iphH1MnAIVK3DGSa2GCR5lSy5V6jQLtSGNxTj2qFw3GmWrhL9P1w==',
    tgSite: 'https://dcardkevein15.github.io/pelisfull/',   /* tu web pública (para el botón ▶ Ver ahora) */
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

  /* ─────────── Código de identidad (base32 sin ceros/unos: 0,O y 1 fuera) ───────────
     ⚠ El alfabeto debe tener EXACTAMENTE 32 caracteres. La 'I' va AL FINAL
     (índice 31) para no romper los códigos ya repartidos: los índices 0-30
     quedan idénticos al alfabeto original.                                 */
  const B32 = '23456789ABCDEFGHJKMNPQRSTUVWXYZI';
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
    /* 🩹 Reparación de códigos LEGADOS: la versión antigua del alfabeto
       tenía 31 chars y el valor 31 se imprimía como el texto "undefined".
       Ese valor perdido era SIEMPRE el índice 31 = 'I' → lo restauramos
       antes de decodificar. Así reviven los códigos viejos sin pedir otros. */
    const clean = String(code || '').toUpperCase()
      .replace(/UNDEFINED/g, 'I').replace(/[^A-Z2-9]/g, '');
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
    /* 🛡 rol moderador: caduca solo; un pase expirado no revive nunca */
    id.mod = !!id.mod;
    id.modExp = id.modExp || 0;
    if (id.mod && id.modExp && Date.now() > id.modExp) { id.mod = false; id.modExp = 0; }
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

  /* ═══════════ 🔐 FIRMA DEL CATÁLOGO (ECDSA P-256) ═══════════
     El admin firma catalog.json al publicarlo (transparente: mismo
     botón de siempre). Los lectores verifican la firma con la clave
     pública embebida en CONFIG.catalogPubKey. La clave privada NUNCA
     sale del dispositivo del admin: vive en IndexedDB (no va al repo,
     ni al catálogo, ni a la red). Aunque alguien logre escribir en el
     hosting, sin esa clave no puede fabricar un catálogo válido. */

  const bytesToB64 = b => { let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); };
  function b64ToBytes(s) {
    const bin = atob(String(s).replace(/\s+/g, ''));
    const b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b;
  }

  /* JSON canónico (claves ordenadas en todos los niveles) para que la
     firma sea idéntica al firmar y al verificar, sin importar el motor */
  function canonicalJson(v) {
    if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
  }

  /* claves de la pareja de firma en el mismo almacén de la identidad */
  async function idbGet(key) {
    try {
      const db = await idbOpen();
      return await new Promise(res => {
        const g = db.transaction(CONFIG.idbStore, 'readonly').objectStore(CONFIG.idbStore).get(key);
        g.onsuccess = () => res(g.result === undefined ? null : g.result);
        g.onerror = () => res(null);
      });
    } catch (e) { return null; }
  }
  async function idbSet(key, val) {
    try {
      const db = await idbOpen();
      await new Promise(res => {
        const tx = db.transaction(CONFIG.idbStore, 'readwrite');
        tx.objectStore(CONFIG.idbStore).put(val, key);
        tx.oncomplete = res; tx.onerror = res;
      });
      return true;
    } catch (e) { return false; }
  }

  const SIG_IDB_KEY = 'catalog-signing-keys';
  const sigKeysGet = () => idbGet(SIG_IDB_KEY); /* { jwkPriv, jwkPub, pubB64 } | null */

  async function sigKeysEnsure() {
    if (!(window.crypto && crypto.subtle && window.isSecureContext !== false)) return null;
    let rec = await sigKeysGet();
    if (rec && rec.jwkPriv && rec.jwkPub) return rec;
    /* la pareja se genera una única vez; se exporta en JWK solo para
       guardarla en IndexedDB (respaldo/cambio de dispositivo) */
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwkPriv = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const jwkPub = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const pubB64 = bytesToB64(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)));
    rec = { jwkPriv, jwkPub, pubB64 };
    await idbSet(SIG_IDB_KEY, rec);
    axToast('🔐 Clave de firma creada — vive solo en este dispositivo');
    return rec;
  }

  /* firma el payload (sin el campo sig); devuelve base64 o null */
  async function sigSignPayload(payload) {
    const rec = await sigKeysGet();
    if (!rec) return null;
    const priv = await crypto.subtle.importKey('jwk', rec.jwkPriv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' }, priv,
      new TextEncoder().encode(canonicalJson(payload))
    );
    return bytesToB64(new Uint8Array(sig));
  }

  /* importar una clave privada de respaldo (formato: base64 de JSON {priv,pub}) */
  async function sigImport(packed) {
    try {
      const j = JSON.parse(new TextDecoder().decode(b64ToBytes(packed)));
      if (!j || !j.priv || !j.pub) return false;
      const priv = await crypto.subtle.importKey('jwk', j.priv, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
      const pubK = await crypto.subtle.importKey('jwk', j.pub, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
      /* prueba de coherencia: una firma de test debe verificar con la pública */
      const probe = new TextEncoder().encode('xstream-keycheck');
      const s = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, probe);
      if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubK, s, probe))) return false;
      const pubB64 = bytesToB64(new Uint8Array(await crypto.subtle.exportKey('spki', pubK)));
      await idbSet(SIG_IDB_KEY, { jwkPriv: j.priv, jwkPub: j.pub, pubB64 });
      return true;
    } catch (e) { return false; }
  }

  /* respaldo portátil de la clave privada (para firmar desde otro dispositivo) */
  async function sigExportPacked() {
    const rec = await sigKeysGet();
    if (!rec) return '';
    return bytesToB64(new TextEncoder().encode(JSON.stringify({ priv: rec.jwkPriv, pub: rec.jwkPub })));
  }

  /* verificación en el LECTOR:
     'ok' firmado por la clave · 'no-key' protección aún no activada (acepta,
     comportamiento de siempre) · 'unavailable' sin WebCrypto (contexto no
     seguro: acepta, no bloqueamos) · 'invalid' RECHAZAR siempre */
  async function verifyCatalog(cat) {
    const pubB64 = CONFIG.catalogPubKey;
    if (!pubB64) return 'no-key';
    if (!(window.crypto && crypto.subtle && window.isSecureContext !== false)) return 'unavailable';
    if (typeof cat.sig !== 'string' || cat.sig.length < 60 || cat.sig.length > 512) return 'invalid';
    try {
      const pub = await crypto.subtle.importKey('spki', b64ToBytes(pubB64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      const unsigned = { ...cat };
      delete unsigned.sig;
      const ok = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' }, pub,
        b64ToBytes(cat.sig),
        new TextEncoder().encode(canonicalJson(unsigned))
      );
      return ok ? 'ok' : 'invalid';
    } catch (e) { return 'invalid'; }
  }

  /* ═══════════ 🛡 VALIDACIÓN DEL CATÁLOGO ═══════════
     Antes de tocar el estado local, el catálogo debe ser exactamente
     lo que la app espera: tipos, tamaños razonables, URLs solo http(s)
     y cero claves peligrosas (__proto__ y cía). Un archivo raro se
     descarta entero, nunca se aplica «a medias». */
  function validateCatalog(cat) {
    if (!cat || typeof cat !== 'object' || Array.isArray(cat)) return false;
    if (typeof cat.v !== 'number' || !isFinite(cat.v) || cat.v <= 0) return false;
    const okUrl = u => typeof u === 'string' && u.length <= 2048 && /^https?:\/\//i.test(u);
    const okStr = (s, n) => typeof s === 'string' && s.length <= n;
    const okThumb = u => okUrl(u) ||
      (typeof u === 'string' && u.length <= 300000 && /^data:image\/(png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i.test(u));
    const noBadKeys = o => {
      for (const k of Object.keys(o)) if (k === '__proto__' || k === 'constructor' || k === 'prototype') return false;
      return true;
    };

    const series = cat.series;
    if (!Array.isArray(series) || !series.length || series.length > 5000) return false;
    for (const s of series) {
      if (!s || typeof s !== 'object' || Array.isArray(s) || !noBadKeys(s)) return false;
      if (!okStr(s.id, 90) || !okStr(s.t, 300)) return false;
      if (!Array.isArray(s.episodes) || s.episodes.length > 5000) return false;
      if (s.poster && !okThumb(s.poster)) return false;
      if (s.tags !== undefined &&
        (!Array.isArray(s.tags) || s.tags.length > 30 || s.tags.some(t => !okStr(t, 60)))) return false;
      if (s.seasons !== undefined) {
        if (!s.seasons || typeof s.seasons !== 'object' || Array.isArray(s.seasons) || !noBadKeys(s.seasons)) return false;
        for (const k of Object.keys(s.seasons)) {
          if (!/^\d{1,3}$/.test(k) || !okStr(s.seasons[k], 120)) return false;
        }
      }
      for (const e of s.episodes) {
        if (!e || typeof e !== 'object' || Array.isArray(e) || !noBadKeys(e)) return false;
        if (typeof e.n !== 'number' || !isFinite(e.n) || e.n < 0 || e.n > 100000) return false;
        if (e.t !== undefined && e.t !== null && e.t !== '' && !okStr(e.t, 300)) return false;
        if (e.url !== undefined && e.url !== '' && e.url !== null && !okUrl(e.url)) return false;
        if (e.sub !== undefined && e.sub !== '' && !okUrl(e.sub)) return false;
        if (e.thumb !== undefined && e.thumb !== '' && !okThumb(e.thumb)) return false;
      }
    }

    if (cat.channels !== undefined) {
      if (!Array.isArray(cat.channels) || cat.channels.length > 50000) return false;
      for (const c of cat.channels) {
        if (!c || typeof c !== 'object' || Array.isArray(c) || !noBadKeys(c)) return false;
        if (!okStr(c.id, 160) || !okStr(c.name, 220) || !okUrl(c.url)) return false;
        if (c.logo && !okUrl(c.logo)) return false;
        if (c.group && !okStr(c.group, 120)) return false;
        if (c.epg && !okStr(c.epg, 120)) return false;
        if (c.cc && !okStr(c.cc, 8)) return false;
        if (c.quality && !okStr(c.quality, 24)) return false;
        if (c.src !== undefined && c.src !== '' && !okStr(c.src, 60)) return false;
      }
    }

    if (cat.tvSources !== undefined) {
      const t = cat.tvSources;
      if (!t || typeof t !== 'object' || Array.isArray(t) || !noBadKeys(t)) return false;
      for (const k of Object.keys(t)) {
        if (!okStr(k, 90)) return false;
        const v = t[k];
        if (v === '' || v == null) continue;
        /* forma simple: la URL directamente */
        if (typeof v === 'string') { if (!okUrl(v)) return false; continue; }
        /* forma real (app.js:790): { url, name, at } — la url es lo que
           los lectores descargarán solos: DEBE ser http(s) auténtica      */
        if (typeof v === 'object' && !Array.isArray(v) && noBadKeys(v)
          && okUrl(v.url)
          && (v.name === undefined || okStr(v.name, 120))
          && (v.at === undefined || (typeof v.at === 'number' && isFinite(v.at)))) continue;
        return false;
      }
    }

    if (cat.by !== undefined && !okStr(cat.by, 120)) return false;
    if (cat.at !== undefined && !okStr(cat.at, 40)) return false;
    if (cat.sig !== undefined && (typeof cat.sig !== 'string' || cat.sig.length > 512)) return false;
    return true;
  }

  /* ═══════════ 🛡 PASES DE MODERADOR (firmados ECDSA) ═══════════
     El admin genera un pase firmado con La MISMA clave que firma el
     catálogo. Formato: XMOD.<payload b64url>.<firma b64url>
     payload = { t:'mod', uid:'x-…', exp:<ms> }. El uid se deriva del
     🗝 código de identidad de la persona: el pase SOLO funciona en su
     dispositivo, caduca solo y nadie puede falsificarlo (necesitaría
     tu clave privada).                                             */

  const b64urlEncode = b => bytesToB64(b instanceof Uint8Array ? b : new Uint8Array(b))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  function b64urlToBytes(s) {
    s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return b64ToBytes(s);
  }

  /* uid de una cuenta a partir de su 🗝 código de identidad (16 letras) */
  function uidFromIdentityCode(code) {
    const bytes = codeToBytes(code);
    if (bytes.length < 10) return null;
    return 'x-' + [...bytes.slice(0, 10)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /* solo ADMIN: crea un pase firmado para el dispositivo de ese código */
  async function modInviteCreate(idCode, hours) {
    if (!isAdmin()) return null;
    if (!(window.crypto && crypto.subtle && window.isSecureContext !== false)) return null;
    const uid = uidFromIdentityCode(idCode);
    if (!uid) return null;
    const rec = await sigKeysEnsure();
    if (!rec) return null;
    const payload = new TextEncoder().encode(
      JSON.stringify({ t: 'mod', uid, exp: Date.now() + Math.max(1, hours || 72) * 3600e3 })
    );
    const priv = await crypto.subtle.importKey('jwk', rec.jwkPriv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, payload);
    return 'XMOD.' + b64urlEncode(payload) + '.' + b64urlEncode(new Uint8Array(sig));
  }

  /* verifica un pase SIN aplicarlo: 'ok' | 'for-other' | 'expired' | 'invalid' */
  async function modCodeCheck(raw) {
    const m = String(raw || '').trim().replace(/\s+/g, '')
      .match(/^XMOD\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
    if (!m) return 'invalid';
    if (!CONFIG.catalogPubKey) return 'invalid';      /* sin clave pública embebida no hay cómo verificar */
    if (!(window.crypto && crypto.subtle && window.isSecureContext !== false)) return 'invalid';
    let payload, payloadBytes;
    try {
      payloadBytes = b64urlToBytes(m[1]);
      payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    } catch (e) { return 'invalid'; }
    if (!payload || payload.t !== 'mod' || typeof payload.uid !== 'string' || typeof payload.exp !== 'number') return 'invalid';
    try {
      const pub = await crypto.subtle.importKey('spki', b64ToBytes(CONFIG.catalogPubKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64urlToBytes(m[2]), payloadBytes);
      if (!ok) return 'invalid';
    } catch (e) { return 'invalid'; }
    if (Date.now() > payload.exp) return 'expired';
    if (!ID || payload.uid !== ID.uid) return 'for-other';   /* el pase es de otro dispositivo */
    return 'ok';
  }

  /* canjear el pase: este dispositivo queda como moderador hasta su caducidad */
  async function modRedeem(code) {
    const r = await modCodeCheck(code);
    if (r !== 'ok') return r;
    const payload = JSON.parse(new TextDecoder().decode(
      b64urlToBytes(String(code).trim().replace(/\s+/g, '').split('.')[1])
    ));
    ID.mod = true;
    ID.modExp = payload.exp;
    writeAll(); applyRole(); renderChip();
    return 'ok';
  }

  /* ═══════════ 🔐 BÓVEDA LOCAL DE CLAVES ═══════════
     Guarda credenciales de terceros (Streamtape login/key, API key de
     Drive) SOLO en este navegador — mismo modelo que el token GitHub de
     localStorage. Nunca van al repo, ni al catálogo, ni a la red:
     solo se usan para llamar a la API correspondiente desde aquí.
     app.js las lee con vget() → la "sesión" de Streamtape sobrevive
     al cerrar y volver a abrir la app (eso era lo que fallaba).    */
  const VAULT_LS = 'xstream-vault-v1';
  let vaultMem = null;
  function vaultRead() {
    if (vaultMem) return vaultMem;
    try { vaultMem = JSON.parse(localStorage.getItem(VAULT_LS) || '{}') || {}; }
    catch (e) { vaultMem = {}; }
    return vaultMem;
  }
  function vaultGet(k) { return vaultRead()[k] || ''; }
  function vaultSet(obj) {
    const v = vaultRead();
    for (const k of Object.keys(obj || {})) v[k] = String(obj[k] == null ? '' : obj[k]);
    vaultMem = v;
    try { localStorage.setItem(VAULT_LS, JSON.stringify(v)); } catch (e) { }
  }
  const vaultOpen = () => true;   /* la bóveda es de este dispositivo: siempre disponible */

  /* ═══════════ ROLES ═══════════
     👑 admin  — tú: edita + publica el catálogo firmado + genera
                 invitaciones (único con clave privada y token).
     🛡 moderador — edita TODO lo editorial (series, enlaces, importar,
                 TV, papelera…) en su dispositivo. NO puede publicar el
                 catálogo global (la firma ECDSA solo la tiene tu clave),
                 ni ver la zona de administrador, ni crear invitaciones.
     👁 lector — solo mira.                                                */
  const isAdmin = () => !!(ID && ID.admin);
  const isMod = () => !!(ID && ID.mod);
  const isStaff = () => isAdmin() || isMod();
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
    const staff = isStaff();
    /* las herramientas de edición las ven admin Y moderadores */
    document.body.classList.toggle('ro', !staff);
    for (const id of ADMIN_ONLY_IDS) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('ro-hide', !staff);
    }
    /* Firebase queda retirado: el catálogo compartido lo sustituye */
    const sb = document.getElementById('syncBtn');
    if (sb) sb.style.display = 'none';
    const chip = document.getElementById('userChip');
    if (chip) chip.classList.toggle('is-admin', admin);
    if (chip) chip.classList.toggle('is-mod', !admin && isMod());
    /* 🔒 FAIL-CLOSED: solo los que SÍ verificaron la clave ven los controles */
    document.body.classList.toggle('admin-on', admin);
    document.body.classList.toggle('mod-on', !admin && isMod());
    /* equipo (admin+mod): desbloquea las herramientas editoriales del CSS */
    document.body.classList.toggle('staff-on', staff);
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
    if (nm) nm.textContent = (ID.admin ? '👑 ' : (ID.mod ? '🛡 ' : '')) + ID.name;
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
        <div class="ax-sec" id="axSigZone"></div>
        <div class="ax-sec" id="axModZone"></div>
        <div class="ax-sec" id="axTgZone"></div>
        <div class="ax-sec" id="axPropZone"></div>
        <div class="ax-sec" id="axModJoin"></div>
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
      /* 🛡 confirmación dura: restaurar REEMPLAZA tu identidad (cambia tu uid);
         los pases ligados a la cuenta vieja dejarían de valer. Antes pasaba sin
         avisar — una pegada errónea aquí rompía los pases de moderador        */
      const futura = identityFromSeed(bytes);
      if (futura.uid === ID.uid) return axToast('Ya eres esa cuenta — nada que restaurar');
      const ok = confirm(`Vas a REEMPLAZAR tu cuenta actual (${ID.name} ${ID.tag}) por «${futura.name} ${futura.tag}».\n\nTus pases de moderador ligados a la cuenta actual dejarán de funcionar.\n\n¿Continuar?`);
      if (!ok) return;
      const eraAdmin = ID.admin;
      const eraMod = ID.mod, eraModExp = ID.modExp;
      const restored = futura;
      restored.admin = eraAdmin; /* si ya eras admin aquí, lo sigues siendo */
      if (eraMod) { restored.mod = true; restored.modExp = eraModExp; } /* tu rol te sigue si era tuyo */
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
      : (ID.mod
        ? '<span class="ax-badge admin">🛡 MODERADOR</span>'
        : '<span class="ax-badge lector">👁 LECTOR — solo lectura</span>');
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
    renderModZone();
    renderTgZone();
    renderPropZone();
    renderModJoin();
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
        <p class="ax-note">Tu sesión de administrador queda guardada en este dispositivo — no hace falta volver a escribirla.</p>`;
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

  /* construye el payload del catálogo (lo usan el admin al publicar
     y el moderador al enviar una propuesta al buzón) */
  function buildCatalogPayload(state) {
    const series = state.series.filter(s => !s.personal && s.via !== 'shared').map(cleanForPublish);
    /* 📡 los canales TV SIEMPRE van en el catálogo público (con fuentes iptv-org vivas) */
    const channels = (state.channels || []).map(c => ({
      id: c.id, name: c.name, logo: c.logo, group: c.group, url: c.url,
      epg: c.epg || '', cc: c.cc || '', quality: c.quality || '', src: c.src,
    }));
    return {
      app: 'xstream', v: Date.now(), by: ID.name + ' ' + ID.tag,
      at: new Date().toISOString(), n: series.length + channels.length, series, channels,
      tvSources: state.tvSources || {},
    };
  }

  async function publishCatalog() {
    if (!isAdmin()) return axToast('🔒 Solo el administrador publica el catálogo', true);
    if (!API || !API.getState) return axToast('La app aún no está lista', true);
    const state = API.getState();
    const payload = buildCatalogPayload(state);

    /* 🔐 FIRMA ECDSA — invisible: la 1ª vez crea tu clave en este
       dispositivo y firma; después solo firma. Si no hay cripto
       disponible (contexto no seguro), publica como siempre.     */
    try {
      await sigKeysEnsure();
      const sig = await sigSignPayload(payload);
      if (sig) payload.sig = sig;
    } catch (e) { console.warn('[xstream] publicación sin firma:', e); }

    /* ① PUBLICACIÓN AUTOMÁTICA A GITHUB — los lectores lo reciben solos */
    const token = ghToken() || ghAskToken();
    if (token) {
      axToast('🌐 Publicando en GitHub… todos lo recibirán en ~1 minuto');
      try {
        await ghPublishCatalog(payload, token);
        state.catalogMeta = { v: payload.v, at: Date.now(), n: payload.n };
        if (API.save) API.save();
        renderCatalogStatus();
        axToast(`🌐 PUBLICADO para todos: ${payload.n} entradas · los visitantes lo reciben automáticamente`
          + (payload.sig
            ? (CONFIG.catalogPubKey ? ' · 🔐 firmado y blindado' : ' · 🔐 firmado — falta pegar tu clave pública en auth.js para activar el blindaje')
            : ''));
        /* 📢 Telegram: anuncia solo las novedades (nunca bloquea la publicación) */
        telegramAnnounce(payload).catch(e => console.warn('[telegram]', e));
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

  /* ═══════════ 📢 TELEGRAM — anuncios automáticos al publicar ═══════════
     Sin RSS ni servidores: al publicar el catálogo se compara con la foto
     del último anuncio y se publica SOLO lo nuevo (series y películas; la
     TV no, es efímera). Credenciales en la bóveda local de este dispositivo. */
  const TG_API = 'https://api.telegram.org';
  const TG_SNAP_KEY = 'xstream-tg-snap-v1';
  const tgSlug = t => String(t || '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const tgSiteUrl = () => (vaultGet('tgSite') || CONFIG.tgSite || '').trim();
  function tgDeepLink(s) {
    const b = tgSiteUrl();
    if (!b) return '';
    return b.replace(/\/?$/, '/') + '#' + (s.kind === 'pelicula' ? '/pelicula/' : '/anime/') + tgSlug(s.t);
  }

  function tgSnapLoad() { try { return JSON.parse(localStorage.getItem(TG_SNAP_KEY) || 'null'); } catch (e) { return null; } }
  function tgSnapSave(payload) {
    const snap = {};
    for (const s of payload.series || []) {
      snap[s.id] = { t: s.t, k: s.kind, n: (s.episodes || []).length, ln: (s.episodes || []).filter(e => e.url).length };
    }
    try { localStorage.setItem(TG_SNAP_KEY, JSON.stringify({ v: payload.v, at: Date.now(), items: snap })); } catch (e) { }
  }

  /* diff: SOLO novedades con contenido reproducible */
  function buildTelegramEvents(payload, snapItems) {
    const ev = [];
    if (!snapItems) return ev;                    /* 1ª vez: solo se hace la foto */
    for (const s of payload.series || []) {
      const linked = (s.episodes || []).filter(e => e.url).length;
      const prev = snapItems[s.id];
      if (!prev) { if (linked) ev.push({ tipo: 'nuevo', s }); continue; }
      const delta = linked - (prev.ln || 0);
      if (delta > 0) ev.push({ tipo: 'mas', s, delta });
    }
    return ev;
  }

  function tgCaption(ev) {
    const s = ev.s;
    const linked = (s.episodes || []).filter(e => e.url).length;
    const esP = s.kind === 'pelicula';
    if (ev.tipo === 'nuevo') {
      return (esP ? '🎬 <b>PELÍCULA NUEVA</b>' : '🆕 <b>SERIE NUEVA</b>')
        + `\n\n<b>${axEsc(s.t)}</b>`
        + (esP ? '' : `\n📺 ${linked} capítulo${linked === 1 ? '' : 's'} disponible${linked === 1 ? '' : 's'}`)
        + '\n\n▶️ Gratis y sin registro — X·STREAM';
    }
    return (esP ? '🎬 <b>' : '➕ <b>NUEVOS CAPÍTULOS · ') + axEsc(s.t) + '</b>'
      + (esP ? '' : `\nHoy: +${ev.delta} capítulo${ev.delta === 1 ? '' : 's'} de golpe (ya son ${linked})`)
      + '\n\n▶️ Sigue la maratón en X·STREAM';
  }

  async function tgSend(token, chat, text, photo, url, seriesId) {
    /* teclado: ▶ Ver ahora + 🔔 Avísame si llegan capítulos nuevos */
    let kb;
    if (url) {
      const rows = [[{ text: '▶▶ Ver ahora', url }]];
      if (seriesId) rows.push([{ text: '🔔 Avísame si suma capítulos', callback_data: 'f:' + String(seriesId).slice(0, 60) }]);
      kb = { inline_keyboard: rows };
    }
    const method = photo ? 'sendPhoto' : 'sendMessage';
    const body = photo
      ? { chat_id: chat, photo, caption: text, parse_mode: 'HTML', reply_markup: kb }
      : { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb };
    const r = await fetch(`${TG_API}/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.description || ('HTTP ' + r.status));
    return j;
  }

  /* DMs personales: cuando una serie que alguien sigue suma capítulos,
     el bot le escribe directo ("🆕 Tu serie trajo 2 episodios nuevos") */
  async function tgNotifySubscribers(events) {
    const token = vaultGet('tgBotToken');
    if (!token) return;
    const subs = await tgSubsRead().catch(() => null);
    if (!subs) return;
    /* normaliza: solo eventos con suma de capítulos y seguidores */
    const porSerie = {};
    for (const ev of events || []) {
      if (ev.tipo !== 'mas' || !ev.s || !ev.s.id) continue;
      porSerie[ev.s.id] = ev;
    }
    for (const [chatId, map] of Object.entries(subs)) {
      for (const sid of Object.keys(map || {})) {
        const ev = porSerie[sid];
        if (!ev) continue;
        const texto = `🆕 <b>${axEsc(ev.s.t)}</b> sumó ${ev.delta} capítulo${ev.delta === 1 ? '' : 's'}.\n\n▶️ Está listo en X·STREAM`;
        try { await tgSend(token, chatId, texto, null, tgDeepLink(ev.s)); } catch (e) { console.warn('[tg] dm', chatId, e.message || e); }
        await new Promise(r => setTimeout(r, 1200));
      }
    }
  }

  /* suscripciones guardadas en el repo (tg-subs.json) — misma caja fuerte del buzón */
  const TG_SUBS_RAW = () => 'https://raw.githubusercontent.com/' + CONFIG.ghRepo + '/' + CONFIG.ghBranch + '/tg-subs.json';
  async function tgSubsRead() {
    const r = await fetch(TG_SUBS_RAW() + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return {};
    try { return await r.json(); } catch (e) { return {}; }
  }

  /* punto de entrada tras publicar: anuncia solo el delta, con foto y botón */
  async function telegramAnnounce(payload) {
    const token = vaultGet('tgBotToken'), chat = vaultGet('tgChat');
    if (!token || !chat) return;                                   /* no configurado → silencio total */
    const prev = tgSnapLoad();
    const events = buildTelegramEvents(payload, prev && prev.items);
    if (!prev) {
      tgSnapSave(payload);
      axToast('📢 Telegram: listo — desde la próxima publicación anunciaré solo las novedades');
      return;
    }
    tgSnapSave(payload);
    if (!events.length) return;
    let enviados = 0;
    if (events.length <= 6) {
      for (const ev of events) {
        try { await tgSend(token, chat, tgCaption(ev), ev.s.poster || null, tgDeepLink(ev.s), ev.s.id); enviados++; }
        catch (e) { console.warn('[telegram]', e); }
        await new Promise(r => setTimeout(r, 1100));               /* amable con el rate limit */
      }
    } else {
      /* avalancha → un solo post resumen (nadie quiere 20 mensajes seguidos) */
      const lines = events.slice(0, 14).map(ev =>
        '• ' + (ev.s.kind === 'pelicula' ? '🎬 ' : '📺 ') + axEsc(ev.s.t)
        + (ev.tipo === 'mas' ? ` (+${ev.delta} caps)` : ''));
      try {
        await tgSend(token, chat,
          `🌊 <b>ACTUALIZACIÓN GRANDE — ${events.length} novedades</b>\n\n${lines.join('\n')}\n\n▶️ Todo en X·STREAM`,
          null, tgSiteUrl());
        enviados = events.length;
      } catch (e) { console.warn('[telegram]', e); }
    }
    if (enviados) axToast(`📢 Telegram: ${enviados} publicación${enviados === 1 ? '' : 'es'} enviada${enviados === 1 ? '' : 's'} a tu canal`);
    /* 🔔 suscriptores: DM personal a quien siga una serie que acaba de sumar */
    try { await tgNotifySubscribers(events); } catch (e) { console.warn('[tg-subs]', e); }
  }

  /* ═══════════ 📩 PROPUESTAS DE MODERADORES ═══════════
     El moderador envía su catálogo a un buzón del repo vía un pequeño
     worker (acortador/api/propuestas.js, Vercel). Tú lo ves en tu panel:
     👁 ver · ✅ aprobar (se publica FIRMADO con tu clave, igual que si
     lo hubieras escrito tú) · 🗑 descartar. Solo viven las 10 últimas. */

  const PROP_API = () => (vaultGet('propApi') || 'https://z.yapido.click/api/propuestas').replace(/\/+$/, '');
  const propKey = () => (vaultGet('propKey') || '').trim();

  async function propFetch(path, opts = {}) {
    const r = await fetch(PROP_API() + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', 'x-prop-key': propKey(), ...(opts.headers || {}) },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }

  /* 🛡 lado del moderador: subir su biblioteca al buzón del admin */
  async function propuestaEnviar() {
    if (!isStaff()) return axToast('🔒 Solo el equipo puede enviar propuestas', true);
    if (!propKey()) return axToast('⚠ Falta la clave de propuestas — pídela al administrador', true);
    if (!API || !API.getState) return axToast('La app aún no está lista', true);
    const payload = buildCatalogPayload(API.getState());
    payload.by = ID.name + ' ' + ID.tag + ' · 🛡 moderador';
    axToast('📤 Enviando tu propuesta al administrador…');
    try {
      await propFetch('', { method: 'POST', body: JSON.stringify({ by: payload.by, n: payload.n, payload }) });
      axToast('📩 ¡Enviada! El admin la revisará en su panel y la publicará');
    } catch (e) { axToast('⚠ No llegó al buzón: ' + (e.message || e), true); }
  }

  /* 👑 lado del admin: bandeja + aprobar firmando con su clave */
  async function propListar() { const j = await propFetch(''); return j.items || []; }
  async function propLeer(id) { const j = await propFetch('?id=' + encodeURIComponent(id)); return j.item; }
  async function propBorrar(id) { await propFetch('', { method: 'DELETE', body: JSON.stringify({ id }) }); }

  async function propAprobar(id) {
    const item = await propLeer(id);
    const payload = item && item.payload;
    if (!payload || !Array.isArray(payload.series)) throw new Error('propuesta vacía o corrupta');
    if (!validateCatalog(payload)) return axToast('⚠ La propuesta no supera la validación del catálogo', true);
    const state = API.getState();
    const diff = computeProposalDiff(payload, state);
    if (diff.sinCambios) return axToast('🤷 No trae nada nuevo respecto a tu biblioteca — descártala si quieres', true);

    axToast('📥 Integrando los cambios del moderador en tu biblioteca…');
    applyProposalDiff(diff, state);

    /* publicar = tu flujo normal: FIRMA contigo + subida a GitHub */
    const finalPayload = buildCatalogPayload(state);
    await sigKeysEnsure();
    const sig = await sigSignPayload(finalPayload);
    if (sig) finalPayload.sig = sig;
    const token = ghToken() || ghAskToken();
    if (!token) return;
    axToast('🌐 Publicando, firmado con tu clave…');
    await ghPublishCatalog(finalPayload, token);
    await propBorrar(id);
    state.catalogMeta = { v: finalPayload.v, at: Date.now(), n: finalPayload.n };
    if (API.save) API.save();
    telegramAnnounce(finalPayload).catch(() => { });
    axToast(`✅ Propuesta de ${item.by || 'moderador'} integrada y PUBLICADA con tu firma`);
  }

  /* ═══ Modal de revisión de propuesta (el "ver" bonito) ═══ */
  function propModalEnsure() {
    let bd = document.getElementById('axPropView');
    if (bd) return bd;
    bd = document.createElement('div');
    bd.id = 'axPropView';
    bd.className = 'ax-backdrop hidden';
    bd.innerHTML = `
      <div class="modal ax-modal pv-modal">
        <div class="ax-head">
          <div class="ax-id">
            <div class="ax-namerow"><b id="pvTitle">Propuesta</b></div>
            <div class="ax-role"><span class="ax-badge admin" id="pvBadge">novedades</span></div>
          </div>
        </div>
        <div id="pvBody" class="pv-body"></div>
        <div class="pv-preview hidden" id="pvPreview">
          <div class="pv-preview-head">
            <b id="pvPrevTitle"></b>
            <span class="pv-status" id="pvStatus"></span>
            <button class="btn btn-mini" id="pvClose">✕ cerrar preview</button>
          </div>
          <div id="pvPlay"></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="pvCloseAll">Cerrar</button>
          <button class="btn btn-acid" id="pvApprove">✅ Aprobar y publicar</button>
        </div>
      </div>`;
    document.body.appendChild(bd);
    bd.addEventListener('click', ev => { if (ev.target === bd) bd.classList.add('hidden'); });
    bd.querySelector('#pvCloseAll').addEventListener('click', () => bd.classList.add('hidden'));
    bd.querySelector('#pvClose').addEventListener('click', () => {
      bd.querySelector('#pvPreview').classList.add('hidden');
      bd.querySelector('#pvPlay').innerHTML = '';
    });
    bd.querySelector('#pvApprove').addEventListener('click', pvApproveClick);
    return bd;
  }

  /* el ✅ del modal: aprueba-la-propuesta-cache (la integra y la publica firmada) */
  async function pvApproveClick() {
    const bd = propModalEnsure();
    const btn = bd.querySelector('#pvApprove');
    const id = computeProposalDiffCache && computeProposalDiffCache.id;
    if (!id) { bd.classList.add('hidden'); return; }
    btn.disabled = true; btn.textContent = '⏳ Publicando…';
    try {
      await propAprobar(id);
      bd.classList.add('hidden');
      renderPropZone();
    } catch (e) { axToast('⚠ No se pudo publicar: ' + (e.message || e), true); }
    finally { btn.disabled = false; btn.textContent = '✅ Aprobar y publicar'; }
  }

  /* previsualiza UN enlace dentro del modal y dice si responde */
  function pvPreviewInto(url, title) {
    const bd = propModalEnsure();
    const box = bd.querySelector('#pvPreview');
    const play = bd.querySelector('#pvPlay');
    bd.querySelector('#pvPrevTitle').textContent = title;
    box.classList.remove('hidden');
    play.innerHTML = '';
    const st = bd.querySelector('#pvStatus');
    st.textContent = '⏳ comprobando…'; st.className = 'pv-status checking';

    /* según el tipo de fuente: iframe oficial o reproductor nativo */
    const dId = (url.match(/drive\.google\.com\/file\/d\/([\w-]+)/) || [])[1] || (url.match(/[?&]id=([\w-]+)/) || [])[1];
    const stape = url.match(/streamtape\.(?:com|to)\/(?:[ev])\/([\w-]+)/i);
    const esVideoDirecto = /\.(mp4|m4v|webm|ogv|ogg|mov)(\?|#|$)/i.test(url);

    if (dId) {
      play.innerHTML = `<iframe src="https://drive.google.com/file/d/${dId}/preview" allow="autoplay;fullscreen" allowfullscreen></iframe>`;
      st.textContent = '📂 Google Drive (vista previa)'; st.className = 'pv-status ok';
      return;
    }
    if (stape) {
      play.innerHTML = `<iframe src="https://streamtape.com/e/${stape[1]}" allowfullscreen allowtransparency allow="autoplay"></iframe>`;
      st.textContent = '☁ Streamtape (vista previa)'; st.className = 'pv-status ok';
      return;
    }
    if (esVideoDirecto) {
      const v = document.createElement('video');
      v.src = url; v.controls = true; v.muted = true; v.preload = 'metadata';
      play.appendChild(v);
      const timer = setTimeout(() => { st.textContent = '⚠ no respondió en 8s — quizá caído'; st.className = 'pv-status err'; }, 8000);
      v.addEventListener('loadedmetadata', () => { clearTimeout(timer); st.textContent = `✅ VIVO · video real · ${Math.round(v.duration)}s`; st.className = 'pv-status ok'; });
      v.addEventListener('error', () => { clearTimeout(timer); st.textContent = '✗ no carga — enlace caído o con CORS estricto'; st.className = 'pv-status err'; });
      v.load();
      return;
    }
    st.textContent = 'Fuente externa — solo se puede abrir aparte:';
    st.className = 'pv-status';
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    a.className = 'btn btn-acid'; a.textContent = '🔗 Abrir en la fuente';
    play.appendChild(a);
  }

  /* render del modal de revisión con el DELTA (solo lo que él añade/cambia) */
  async function propVer(id, by) {
    const bd = propModalEnsure();
    const body = bd.querySelector('#pvBody');
    bd.querySelector('#pvPreview').classList.add('hidden');
    bd.querySelector('#pvPlay').innerHTML = '';
    bd.querySelector('#pvTitle').textContent = `Propuesta de ${by || 'moderador'}`;
    bd.querySelector('#pvBadge').textContent = 'leyendo…';
    body.innerHTML = '<p class="ax-note">Leyendo el buzón y comparando con tu biblioteca…</p>';
    bd.classList.remove('hidden');

    try {
      const item = await propLeer(id);
      const payload = item.payload;
      const diff = computeProposalDiff(payload, API.getState());
      computeProposalDiffCache = { id, payload, diff };
      const tipoChip = s => s.kind === 'pelicula' ? '🎬 película' : '📺 anime/serie';

      if (diff.sinCambios) {
        bd.querySelector('#pvBadge').textContent = 'sin cambios';
        body.innerHTML = `<p class="ax-note">🤷 Esta propuesta no añade nada nuevo respecto a tu biblioteca actual. Seguro que el moderador se basó en una versión vieja. Puedes descartarla.</p>`;
        return;
      }

      let html = '';
      let bits = 0;
      if (diff.nuevas.length) {
        bits += diff.nuevas.length;
        html += `<div class="pv-grp"><div class="pv-grp-t">🆕 NUEVO en tu biblioteca (${diff.nuevas.length})</div>`;
        for (const it of diff.nuevas.slice(0, 20)) {
          const withUrl = it.eps.filter(e => e.url);
          html += `<div class="pv-row"><div class="pv-row-t"><span class="pv-chip">${tipoChip(it.s)}</span> <b>${axEsc(it.s.t)}</b> <span class="pv-dim">· ${withUrl.length} cap${withUrl.length === 1 ? '' : 's'} con enlace</span></div><div class="pv-acts" data-ep="${withUrl.length ? withUrl[0].n : ''}"></div></div>`;
        }
        if (diff.nuevas.length > 20) html += `<p class="ax-note">…y ${diff.nuevas.length - 20} más.</p>`;
        html += `</div>`;
      }
      if (diff.porSerie.length) {
        bits += diff.porSerie.length;
        html += `<div class="pv-grp"><div class="pv-grp-t">➕ CAPÍTULOS NUEVOS en series que YA tienes (${diff.porSerie.length})</div>`;
        for (const row of diff.porSerie) {
          html += `<div class="pv-row"><div class="pv-row-t"><b>${axEsc(row.t)}</b> <span class="pv-dim">+${row.count} capítulo${row.count > 1 ? 's' : ''}</span></div><div class="pv-list">` +
            row.eps.slice(0, 14).map(e => `<div class="pv-ep"><span>E${e.n} · ${axEsc(e.t || '')}</span><button class="btn btn-mini pv-go" data-url="${axEsc(e.url)}" data-title="${axEsc(row.t + ' · E' + e.n)}">▶ previsualizar</button></div>`).join('') +
            (row.eps.length > 14 ? `<p class="ax-note">…y ${row.eps.length - 14} más.</p>` : '') +
            `</div></div>`;
        }
        html += `</div>`;
      }
      if (diff.canalesNuevos.length) {
        bits += diff.canalesNuevos.length;
        html += `<div class="pv-grp"><div class="pv-grp-t">📡 CANALES de TV nuevos (${diff.canalesNuevos.length})</div>` +
          diff.canalesNuevos.slice(0, 10).map(c => `<div class="pv-ep"><span>${axEsc(c.name)}${c.group ? ' · ' + axEsc(c.group) : ''}</span></div>`).join('') +
          (diff.canalesNuevos.length > 10 ? `<p class="ax-note">…y ${diff.canalesNuevos.length - 10} más.</p>` : '') + `</div>`;
      }
      body.innerHTML = html;
      bd.querySelector('#pvBadge').textContent = bits + ' bloques nuevos';
      /* previsualizador inline por capítulo */
      body.querySelectorAll('.pv-go').forEach(b => b.addEventListener('click', ev => {
        ev.preventDefault(); ev.stopPropagation();
        pvPreviewInto(b.dataset.url, b.dataset.title);
      }));
    } catch (e) {
      body.innerHTML = `<p class="ax-note">⚠ No se pudo leer: ${axEsc(e.message || String(e))}</p>`;
    }
  }
  let computeProposalDiffCache = null;

  /* ═══ Zona 📩 bandeja de propuestas (solo admin) ═══ */

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
      renderSigZone(bd).catch(() => { });
    } else {
      zone.innerHTML = '';
      const sz = bd.querySelector('#axSigZone');
      if (sz) sz.innerHTML = '';
    }
  }

  /* ═══ Zona 🔐 firma del catálogo (solo admin): estado, clave pública
        para activar el blindaje y respaldo de la clave privada ═══ */
  async function renderSigZone(bd) {
    const zone = bd.querySelector('#axSigZone');
    if (!zone || !isAdmin()) return;
    const rec = await sigKeysGet();
    if (!rec) {
      zone.innerHTML = `<div class="ax-sec-t">🔐 Firma del catálogo</div>
        <p class="ax-note">Pulsa <b>«Publicar»</b> una vez: tu clave de firma se crea sola en este dispositivo y el catálogo sale firmado. Vuelve aquí después.</p>`;
      return;
    }
    const activo = CONFIG.catalogPubKey && CONFIG.catalogPubKey === rec.pubB64;
    const otra = CONFIG.catalogPubKey && CONFIG.catalogPubKey !== rec.pubB64;
    zone.innerHTML = `
      <div class="ax-sec-t">🔐 Firma del catálogo</div>
      ${activo
        ? `<p class="ax-note">✅ <b>Blindaje ACTIVO.</b> Todo visitante rechaza cualquier catálogo que no esté firmado con tu clave privada. Aunque alguien escriba en el repo, no puede inyectar nada.</p>`
        : otra
          ? `<p class="ax-note">⚠️ La clave pública embebida en <b>auth.js</b> NO es la de este dispositivo. Si cambiaste de PC, importa tu clave privada abajo; si no, copia la pública de aquí y actualiza auth.js.</p>`
          : `<p class="ax-note">⚠️ <b>Falta un paso (solo una vez):</b> copia tu clave pública, pégala en <b>auth.js</b> → <code>CONFIG.catalogPubKey</code> y sube auth.js. Desde ese momento los lectores rechazan cualquier catálogo que no firmes tú.</p>`}
      <div class="ax-codebox">
        <code id="axSigPub">${rec.pubB64}</code>
        <button class="btn btn-mini" id="axSigPubCopy">Copiar pública</button>
      </div>
      <div class="ax-restore">
        <input id="axSigPrivIn" placeholder="Clave privada de firma (solo para usar otro dispositivo)" spellcheck="false" autocomplete="off">
        <button class="btn btn-mini" id="axSigPrivImport">Importar</button>
      </div>
      <div style="margin-top:6px">
        <button class="btn btn-mini" id="axSigPrivOut">⤴ Copiar mi clave privada (respaldo / otro dispositivo)</button>
      </div>`;
    zone.querySelector('#axSigPubCopy').addEventListener('click', () => {
      navigator.clipboard.writeText(rec.pubB64)
        .then(() => axToast('🔑 Clave pública copiada — pégala en auth.js → CONFIG.catalogPubKey'))
        .catch(() => axToast('No se pudo copiar', true));
    });
    zone.querySelector('#axSigPrivOut').addEventListener('click', async () => {
      const ok = confirm(
        'La CLAVE PRIVADA es el único secreto que firma tu catálogo.\n' +
        'Quien la tenga puede publicar como si fuera tú.\n\n' +
        'Úsala solo para respaldo o para firmar desde otro dispositivo.\n\n¿Copiarla al portapapeles?'
      );
      if (!ok) return;
      const packed = await sigExportPacked();
      if (!packed) return axToast('No hay clave en este dispositivo', true);
      navigator.clipboard.writeText(packed)
        .then(() => axToast('🗝 Clave privada copiada — guárdala en un lugar seguro'))
        .catch(() => axToast('No se pudo copiar', true));
    });
    zone.querySelector('#axSigPrivImport').addEventListener('click', async () => {
      const v = zone.querySelector('#axSigPrivIn').value.trim();
      if (!v) return;
      const ok = await sigImport(v);
      if (ok) { axToast('🔐 Clave importada — este dispositivo ya publica con tu firma'); renderCatalogStatus(); }
      else axToast('⚠ Clave inválida o incompleta', true);
    });
  }

  /* ═══ Zona 🛡 moderadores (solo ADMIN): generar pases de invitación ═══ */
  function renderModZone() {
    const bd = profileModalEnsure();
    const zone = bd.querySelector('#axModZone');
    if (!zone) return;
    if (!isAdmin()) { zone.innerHTML = ''; return; }
    zone.innerHTML = `
      <div class="ax-sec-t">🛡 Moderadores — crear invitación</div>
      <p class="ax-note">Un moderador <b>edita todo lo editorial</b> (series, enlaces, importar, TV, papelera…) en SU dispositivo, pero <b>nunca publica el catálogo ni toca tus claves</b>: eso solo lo hace tu clave de firma.<br>
      1) La persona abre su Perfil y te envía su <b>🗝 Código de identidad</b>.<br>
      2) Lo pegas aquí y le devuelves el pase generado — <b>solo funciona en su dispositivo</b> y caduca solo.</p>
      <div class="ax-restore">
        <input id="axModUid" placeholder="Código de identidad (XXXX-XXXX-…)" spellcheck="false" autocomplete="off">
        <select id="axModHours" title="Duración del pase" style="background:var(--bg);border:1px solid var(--line);border-radius:10px;color:var(--ink);padding:8px">
          <option value="24">24 horas</option>
          <option value="72" selected>3 días</option>
          <option value="168">1 semana</option>
          <option value="720">1 mes</option>
          <option value="2160">3 meses</option>
          <option value="4320">6 meses</option>
          <option value="8760">1 año</option>
        </select>
        <button class="btn btn-acid" id="axModGen">Generar pase</button>
      </div>
      <div class="ax-codebox hidden" id="axModPrev" style="margin-top:8px;align-items:center;gap:10px">
        <img id="axModPrevAva" class="ax-ava" style="width:38px;height:38px;border-radius:12px" alt="">
        <div style="flex:1;min-width:0">
          <b id="axModPrevName"></b> <span id="axModPrevTag" class="ax-tag"></span>
          <div class="ax-note" id="axModPrevGeo" style="margin:2px 0 0"></div>
        </div>
      </div>
      <div class="ax-codebox hidden" id="axModOut" style="margin-top:8px">
        <code id="axModCode" style="word-break:break-all"></code>
        <button class="btn btn-mini" id="axModCopy">Copiar pase</button>
      </div>`;
    /* previsualización en vivo: a quién pertenece ese código (evita pases
       generados para la persona equivocada). Nota: el código SOLO lleva la
       identidad automática — si esa persona se cambió el nombre a mano,
       aquí verás el nombre automático, pero el pase funciona igual en SU
       dispositivo (su nombre personalizado no se pierde).                 */
    const inp = zone.querySelector('#axModUid');
    const prev = zone.querySelector('#axModPrev');
    inp.addEventListener('input', () => {
      const bytes = codeToBytes(inp.value);
      if (bytes.length < 10) { prev.classList.add('hidden'); return; }
      const who = identityFromSeed(bytes);
      zone.querySelector('#axModPrevAva').src = avatarSvg(who);
      zone.querySelector('#axModPrevName').textContent = who.name;
      zone.querySelector('#axModPrevTag').textContent = who.tag;
      zone.querySelector('#axModPrevGeo').textContent = `${who.flag} ${who.country} · identidad automática`;
      prev.classList.remove('hidden');
    });
    zone.querySelector('#axModGen').addEventListener('click', async () => {
      const code = zone.querySelector('#axModUid').value.trim();
      const hours = parseInt(zone.querySelector('#axModHours').value, 10);
      const inp = zone.querySelector('#axModGen');
      inp.disabled = true;
      try {
        const pass = await modInviteCreate(code, hours);
        if (!pass) { axToast('⚠ Código de identidad no válido (¿está completo?)', true); return; }
        zone.querySelector('#axModCode').textContent = pass;
        zone.querySelector('#axModOut').classList.remove('hidden');
        axToast('🛡 Pase creado — cópialo y envíaselo');
      } finally { inp.disabled = false; }
    });
    zone.querySelector('#axModCopy').addEventListener('click', () => {
      navigator.clipboard.writeText(zone.querySelector('#axModCode').textContent)
        .then(() => axToast('📋 Pase copiado — envíaselo a tu moderador'))
        .catch(() => axToast('No se pudo copiar', true));
    });
  }

  /* ═══ Zona 📢 Telegram (solo admin): conectar canal + prueba ═══ */
  function renderTgZone() {
    const bd = profileModalEnsure();
    const zone = bd.querySelector('#axTgZone');
    if (!zone) return;
    if (!isAdmin()) { zone.innerHTML = ''; return; }
    const hasToken = !!vaultGet('tgBotToken');
    zone.innerHTML = `
      <div class="ax-sec-t">📢 Telegram — publicaciones automáticas</div>
      ${hasToken
        ? `<p class="ax-note">✅ Conectado a <b>${axEsc(vaultGet('tgChat') || 'tu canal')}</b>. Cada vez que pulse <b>«Publicar»</b> anuncio solo lo nuevo (series y películas; la TV no, es efímera). El token vive solo en este dispositivo.</p>`
        : `<p class="ax-note">🛠 3 pasos: 1) En Telegram habla con <b>@BotFather</b> → <code>/newbot</code> → copia el token. 2) Crea tu canal y añade el bot como <b>administrador</b> (permiso de publicar). 3) Pega aquí el token y el @nombre del canal.</p>`}
      <div class="ax-restore" style="flex-direction:column;align-items:stretch;gap:6px">
        <input id="axTgToken" type="password" placeholder="Token del bot (1234567:ABC…)" spellcheck="false" autocomplete="off" value="${axEsc(vaultGet('tgBotToken'))}">
        <div style="display:flex;gap:6px">
          <input id="axTgChat" placeholder="@tu_canal" spellcheck="false" autocomplete="off" style="flex:1" value="${axEsc(vaultGet('tgChat'))}">
          <input id="axTgSite" placeholder="https://tu-web… (botón ▶ Ver ahora)" spellcheck="false" autocomplete="off" style="flex:1.7" value="${axEsc(vaultGet('tgSite'))}">
        </div>
      </div>
      <div class="modal-actions" style="justify-content:flex-start">
        <button class="btn btn-acid" id="axTgSave">Guardar conexión</button>
        <button class="btn btn-ghost" id="axTgTest">Enviar prueba al canal</button>
        <button class="btn btn-ghost" id="axTgHook" title="Conecta el bot para recibir respuestas (suscripciones 🔔 y avisos 📩)">⚡ Activar directo del bot</button>
      </div>`;
    zone.querySelector('#axTgSave').addEventListener('click', () => {
      const token = zone.querySelector('#axTgToken').value.trim();
      const chat = zone.querySelector('#axTgChat').value.trim();
      const site = zone.querySelector('#axTgSite').value.trim();
      vaultSet({ tgBotToken: token, tgChat: chat, tgSite: site });
      axToast(token && chat ? '📢 Telegram guardado — se anunciarán las novedades al publicar' : '✖ Conexión de Telegram vacía (limpiada)');
    });
    zone.querySelector('#axTgTest').addEventListener('click', async () => {
      const token = zone.querySelector('#axTgToken').value.trim();
      const chat = zone.querySelector('#axTgChat').value.trim();
      const site = zone.querySelector('#axTgSite').value.trim();
      if (!token || !chat) return axToast('⚠ Pega token y @canal primero (y pulsa Guardar)', true);
      axToast('📢 Enviando prueba…');
      try {
        await tgSend(token, chat, '✅ <b>X·STREAM conectado</b>\n\nLas novedades de tu catálogo se anunciarán aquí solas, con póster y botón ▶▶', null, site || tgSiteUrl());
        axToast('✅ Revisa tu canal — si llegó, estás listo');
      } catch (e) { axToast('⚠ Telegram rechazó: ' + (e.message || e), true); }
    });
    /* ⚡ conecta el webhook del bot (una vez): activa botones 🔔 y avisos 📩 */
    zone.querySelector('#axTgHook').addEventListener('click', async () => {
      const token = zone.querySelector('#axTgToken').value.trim();
      if (!token) return axToast('⚠ Pega tu token primero (y Guardar)', true);
      if (!confirm('Conecto el bot para recibir respuestas de los botones (suscripciones 🔔 y avisos al buzón 📩). ¿Seguir?')) return;
      try {
        const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 'https://z.yapido.click/api/tgwebhook' }),
        });
        const j = await r.json();
        if (j.ok) axToast('⚡ Bot conectado — los botones de las publicaciones ya responden');
        else axToast('⚠ Telegram: ' + (j.description || 'no conectado'), true);
      } catch (e) { axToast('⚠ ' + (e.message || e), true); }
    });
  }

  /* ═══════════ 🔍 DIF y FUSIÓN de propuestas ═══════════
     La propuesta trae la biblioteca ENTERA del moderador; al admin solo le
     interesa lo que CAMBIÓ respecto a su propia biblioteca. Y al aprobar se
     integra SOLO ese delta — nunca reemplazamos (si el moderador tiene una
     versión vieja de algo, lo tuyo no se toca).                            */

  function computeProposalDiff(payload, local) {
    const diff = { nuevas: [], porSerie: [], canalesNuevos: [], sinCambios: true };
    const localSeries = (local.series || []);
    const localChannels = local.channels || [];
    const chanIds = new Set(localChannels.map(c => c.id));

    for (const s of payload.series || []) {
      const localOne = localSeries.find(x => x.id === s.id);
      const eps = s.episodes || [];
      if (!localOne) {
        /* serie o película completamente nueva */
        diff.nuevas.push({ s, eps });
        diff.sinCambios = false;
        continue;
      }
      /* existe: qué capítulos trae que tú no tengas (huella = url) */
      const haveUrls = new Set((localOne.episodes || []).map(e => e.url).filter(Boolean));
      const nuevosEps = eps.filter(e => e.url && !haveUrls.has(e.url));
      if (nuevosEps.length) {
        diff.porSerie.push({ id: localOne.id, t: localOne.t, eps: nuevosEps, count: nuevosEps.length });
        diff.sinCambios = false;
      }
    }
    for (const c of payload.channels || []) {
      if (!chanIds.has(c.id)) { diff.canalesNuevos.push(c); diff.sinCambios = false; }
    }
    /* mapa id→serie del payload, para heredar temporadas/etiquetas al fusionar */
    diff.__payloadSeries = {};
    for (const s of payload.series || []) diff.__payloadSeries[s.id] = s;
    return diff;
  }

  /* integra el delta en TU biblioteca local (lo que vas a firmar y publicar) */
  function applyProposalDiff(diff, state) {
    for (const item of diff.nuevas) {
      if (!state.series.find(x => x.id === item.s.id)) {
        state.series.push(JSON.parse(JSON.stringify(item.s)));
      }
    }
    for (const row of diff.porSerie) {
      const target = state.series.find(x => x.id === row.id);
      if (!target) continue;
      for (const ep of row.eps) {
        target.episodes.push(JSON.parse(JSON.stringify(ep)));
      }
      /* reordena por temporada + posición y renumera 1..N llevándose el progreso */
      const prog = (state.progress || {})[target.id] || {};
      const map = new Map();
      target.episodes.forEach((e, i) => { map.set(e.n, i + 1); e.n = i + 1; });
      const np = {};
      for (const k of Object.keys(prog)) { const nk = map.get(+k); if (nk != null) np[nk] = prog[k]; }
      state.progress[target.id] = np;
      /* etiquetas de temporada que él añadió y tú no tenías */
      const propSerie = (diff.__payloadSeries || {})[row.id];
      if (propSerie && propSerie.seasons) {
        target.seasons = target.seasons || {};
        for (const k of Object.keys(propSerie.seasons)) if (!target.seasons[k]) target.seasons[k] = propSerie.seasons[k];
      }
    }
    for (const c of diff.canalesNuevos) {
      state.channels = (state.channels || []).concat([{ ...c, src: 'propuesta' }]);
    }
  }

  /* ═══ Zona 📩 bandeja de propuestas (solo admin) ═══ */
  async function renderPropZone() {
    const bd = profileModalEnsure();
    const zone = bd.querySelector('#axPropZone');
    if (!zone) return;
    if (!isAdmin()) { zone.innerHTML = ''; return; }
    zone.innerHTML = `
      <div class="ax-sec-t">📩 Propuestas de moderadores</div>
      <p class="ax-note">Los moderadores envían aquí sus versiones sin descargas ni archivos. Tú las apruebas: se publican <b>firmadas con tu clave</b>. Máximo las últimas <b>10</b>.</p>
      <div class="ax-restore">
        <input id="axPropKey" type="password" placeholder="Clave de propuestas (la compartes solo con moderadores)" spellcheck="false" autocomplete="off" value="${axEsc(propKey())}">
        <button class="btn btn-mini" id="axPropSaveKey">Guardar clave</button>
      </div>
      <div class="ax-catstatus" id="axPropStatus">—</div>
      <div id="axPropList"></div>
      <div class="modal-actions" style="justify-content:flex-start">
        <button class="btn btn-ghost" id="axPropReload">🔄 Actualizar bandeja</button>
      </div>`;
    zone.querySelector('#axPropSaveKey').addEventListener('click', () => {
      vaultSet({ propKey: zone.querySelector('#axPropKey').value.trim() });
      axToast('🗝 Clave de propuestas guardada');
    });
    zone.querySelector('#axPropReload').addEventListener('click', () => renderPropZone());

    /* cargar bandeja */
    const status = zone.querySelector('#axPropStatus');
    const list = zone.querySelector('#axPropList');
    if (!propKey()) { status.textContent = 'Sin clave — la bandeja no se puede leer todavía.'; return; }
    status.textContent = 'Leyendo bandeja…';
    try {
      const items = await propListar();
      if (!items.length) { status.textContent = '✔ Bandeja vacía — sin propuestas pendientes.'; list.innerHTML = ''; return; }
      status.textContent = items.length + (items.length === 1 ? ' propuesta pendiente' : ' propuestas pendientes');
      list.innerHTML = '';
      for (const it of items) {
        const row = document.createElement('div');
        row.className = 'ax-rec';
        row.innerHTML = `<span class="ax-rec-t">📩 ${axEsc(it.by || 'moderador')}</span>
          <span class="ax-rec-e">${it.n != null ? it.n + ' entradas · ' : ''}${it.at ? new Date(it.at).toLocaleString() : ''}</span>`;
        const btns = document.createElement('span');
        btns.style.cssText = 'display:flex;gap:6px;margin-top:6px';
        const bVer = document.createElement('button'); bVer.className = 'btn btn-mini'; bVer.textContent = '👁 Ver';
        const bOk = document.createElement('button'); bOk.className = 'btn btn-acid'; bOk.textContent = '✅ Aprobar y publicar';
        const bNo = document.createElement('button'); bNo.className = 'btn btn-ghost'; bNo.textContent = '🗑';
        bVer.addEventListener('click', () => propVer(it.id, it.by));
        bOk.addEventListener('click', async () => {
          if (!confirm(`¿Aprobar y PUBLICAR la propuesta de ${it.by || 'moderador'}? Saldrá firmada con tu clave.`)) return;
          bOk.disabled = true; bOk.textContent = '⏳ Publicando…';
          try { await propAprobar(it.id); renderPropZone(); }
          catch (e) { axToast('⚠ No se pudo publicar: ' + (e.message || e), true); renderPropZone(); }
        });
        bNo.addEventListener('click', async () => {
          if (!confirm('¿Descartar esta propuesta? (se borra del buzón)')) return;
          try { await propBorrar(it.id); axToast('🗑 Propuesta descartada'); renderPropZone(); }
          catch (e) { axToast('⚠ ' + (e.message || e), true); }
        });
        btns.append(bVer, bOk, bNo);
        row.appendChild(btns);
        list.appendChild(row);
      }
    } catch (e) {
      status.textContent = '⚠ ' + (e.message || e);
    }
  }

  /* ═══ Zona 🛡 canje de pase — abajo del perfil, visible para todos ═══ */
  function renderModJoin() {
    const bd = profileModalEnsure();
    const zone = bd.querySelector('#axModJoin');
    if (!zone) return;
    if (isAdmin()) {
      zone.innerHTML = `<div class="ax-sec-t">🛡 Moderador</div>
        <p class="ax-note">Tú eres el <b>administrador</b>: ya lo tienes todo. Arriba puedes crear pases para tus moderadores.</p>`;
      return;
    }
    if (isMod()) {
      zone.innerHTML = `<div class="ax-sec-t">🛡 Moderador</div>
        <p class="ax-note">✅ <b>Pase activo.</b> Ya puedes usar todas las herramientas de edición. Cuando termines, envía tu versión directo al buzón del administrador — sin descargar nada.</p>
        <p class="ax-note">Caduca: <b>${new Date(ID.modExp).toLocaleString()}</b></p>
        <div class="ax-restore">
          <input id="axModKey" type="password" placeholder="Clave de propuestas (te la da el administrador)" spellcheck="false" autocomplete="off" value="${axEsc(propKey())}">
        </div>
        <div class="modal-actions" style="justify-content:flex-start">
          <button class="btn btn-acid" id="axModSend">📤 Enviar mi versión al administrador</button>
          <button class="btn btn-ghost" id="axModLeave">Dejar de ser moderador</button>
        </div>`;
      zone.querySelector('#axModKey').addEventListener('change', () => {
        vaultSet({ propKey: zone.querySelector('#axModKey').value.trim() });
        axToast('🗝 Clave guardada en este dispositivo');
      });
      zone.querySelector('#axModSend').addEventListener('click', () => {
        vaultSet({ propKey: zone.querySelector('#axModKey').value.trim() });
        propuestaEnviar();
      });
      zone.querySelector('#axModLeave').addEventListener('click', () => {
        ID.mod = false; ID.modExp = 0;
        writeAll(); applyRole(); renderChip(); renderProfile();
        axToast('👁 Volviste a modo lector');
      });
      return;
    }
    zone.innerHTML = `
      <div class="ax-sec-t">🛡 ¿Tienes un pase de moderador?</div>
      <p class="ax-note">Si el administrador te dio un pase (empieza por <b>XMOD…</b>), pégalo aquí para activar las herramientas de edición. El pase solo sirve en <b>este dispositivo</b> y caduca solo.</p>
      <div class="ax-restore">
        <input id="axModIn" placeholder="Pega tu pase XMOD…" spellcheck="false" autocomplete="off">
        <button class="btn btn-acid" id="axModGo">Activar</button>
      </div>
      <div id="axModErr"></div>`;
    const errBox = zone.querySelector('#axModErr');
    const go = async () => {
      const code = zone.querySelector('#axModIn').value;
      if (!code.trim()) return;
      errBox.innerHTML = '';
      const r = await modRedeem(code);
      if (r === 'ok') { axToast('🛡 ¡Pase aceptado! Ya eres moderador — se te han abierto las herramientas de edición'); renderProfile(); }
      else if (r === 'for-other') {
        /* el pase sigue la cuenta del código de identidad CON EL QUE SE GENERÓ.
           Si restauraste otra cuenta entre tanto, tu uid cambió: el admin debe
           generar el pase con tu código ACTUAL. Lo mostramos listo para copiar. */
        errBox.innerHTML = `<div class="ax-note" style="border-left:3px solid var(--hot);padding:8px 10px;margin-top:8px">
          ⚠ Ese pase se generó para <b>otro código de identidad</b> (quizá restauraste tu cuenta o es de otra persona).
          Envía al administrador <b>tu código actual</b> y pide un pase nuevo:
          <div class="ax-codebox" style="margin-top:6px"><code>${fmtCode(ID.code)}</code><button class="btn btn-mini" id="axModSendCode">Copiar mi código</button></div></div>`;
        errBox.querySelector('#axModSendCode').addEventListener('click', () => {
          navigator.clipboard.writeText(fmtCode(ID.code)).then(() => axToast('📋 Código copiado — envíaselo al administrador')).catch(() => { });
        });
      }
      else if (r === 'expired') axToast('⚠ Ese pase ya caducó — pide uno nuevo', true);
      else axToast('⚠ Pase no válido', true);
    };
    zone.querySelector('#axModGo').addEventListener('click', go);
    zone.querySelector('#axModIn').addEventListener('keydown', ev => { if (ev.key === 'Enter') go(); });
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
      /* 🔒 Candado 1: esquema — si no tiene EXACTAMENTE la forma esperada,
         se descarta entero (protege de archivos corruptos o inyectados)  */
      if (!validateCatalog(cat)) { console.warn('[xstream] catálogo rechazado: estructura inválida'); return; }
      /* 🔒 Candado 2: firma ECDSA — si la clave pública está activada y la
         firma no cuadra, alguien modificó el archivo: se ignora          */
      const firma = await verifyCatalog(cat);
      if (firma === 'invalid') { console.warn('[xstream] catálogo rechazado: FIRMA INVÁLIDA — el archivo fue alterado'); return; }
      if (firma === 'no-key') console.info('[xstream] catálogo aceptado sin verificación de firma (blíndalo pegando CONFIG.catalogPubKey en auth.js)');
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
    /* 🔒 H5: la entrada admin por URL (?admin=FRASE) quedó ELIMINADA — la frase
       viajaba a logs del hosting, historial del navegador y referers.
       Ahora solo se desbloquea desde Perfil → zona de administrador.
       Si alguien llega con ese parámetro, se limpia de la barra SIN usarlo. */
    try {
      const q = new URLSearchParams(location.search);
      if (q.has('admin')) {
        q.delete('admin');
        const rest = q.toString();
        history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + (location.hash || ''));
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
    isMod,
    isStaff,
    vaultGet,
    vaultSet,
    vaultOpen,
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
