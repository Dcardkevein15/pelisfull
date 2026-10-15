/* ═══════════════════════════════════════════════════════════════
   XSTREAM SOCIAL — cliente de la comunidad (/social)
   Usuarios reales de auth.js (mismo dispositivo = misma persona),
   escrituras firmadas ECDSA, datos en api/social.js (GitHub).
   Sin frameworks: vanilla JS como el resto del proyecto.
   ═══════════════════════════════════════════════════════════════ */
'use strict';
(() => {
  const SOCIAL_API = 'https://xstream-wallet.vercel.app/api/social';
  const GH_REPO = 'Dcardkevein15/pelisfull';
  const TMDB_KEY = '03e66e3a69ab27b33648570df1c843df';

  /* ── utilidades ── */
  const $ = id => document.getElementById(id);
  /* escapa HTML construyendo las entidades por concatenación (XSS-safe) */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    c === '&' ? '&' + 'amp;'
    : c === '<' ? '&' + 'lt;'
    : c === '>' ? '&' + 'gt;'
    : c === '"' ? '&' + 'quot;'
    : '&' + '#39;');
  const slugify = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'video';
  const GRADS = [
    'linear-gradient(135deg,#00E676,#08A9F4)', 'linear-gradient(135deg,#7C4DFF,#08A9F4)',
    'linear-gradient(135deg,#FF304F,#FF8A00)', 'linear-gradient(135deg,#00C2FF,#00E676)',
    'linear-gradient(135deg,#B14DFF,#FF4D9D)', 'linear-gradient(135deg,#08A9F4,#0A84FF)',
    'linear-gradient(135deg,#FFD60A,#FF8A00)', 'linear-gradient(135deg,#32D74B,#00E676)',
  ];
  const gradOf = g => `--g:${GRADS[(+g || 0) % 8]}`;
  const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  function ago(ts) {
    const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return 'hace ' + s + 's';
    if (s < 3600) return 'hace ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'hace ' + Math.floor(s / 3600) + ' h';
    return 'hace ' + Math.floor(s / 86400) + ' d';
  }
  const hms = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  function toast(msg, err) {
    const t = document.createElement('div');
    t.className = 'soc-toast' + (err ? ' err' : '');
    t.textContent = msg;
    $('socToasts').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; }, 2600);
    setTimeout(() => t.remove(), 3100);
  }
  const avatarHtml = (name, grad, size, extra) =>
    `<span class="soc-avatar ${size || ''}" style="${gradOf(grad)}" ${extra || ''}>${esc(initials(name))}</span>`;

  /* ── estado ── */
  const S = {
    me: null, myPubKey: '', catalog: [], posts: [], stories: [], groups: [],
    suggested: [], follows: [], saved: [], convos: [], notifs: [],
    onlineCount: 0, onlineUsers: [], interests: [], bio: '',
    chatFilter: 'todos', attach: null, ready: false,
    /* v3: delta ETag por archivo + lápidas + latido integrado */
    etags: { posts: '', presence: '', index: '' },
    notifsUnread: 0, lastBeatAt: 0, seenTomb: new Set(),
  };

  /* utilidad base64 para la rotación de clave */
  const b64FromBytes = bytes => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); };

  /* ── API con firma de dispositivo (v3) ──
     La firma cubre la OP y TODOS los parámetros, no un texto fijo por
     hora: «soc3|<uid>|<hora>|<op>|<params canónicos>». Una firma
     capturada solo sirve para ESA acción y expira al pasar la hora
     del servidor (anti-replay). */
  async function socCall(op, params = {}, sign = false, extraHeaders, quiet = false) {
    try {
      if (!S.me || !S.me.uid) return null;
      const all = { op, uid: S.me.uid, name: S.me.name, tag: S.me.tag || '', grad: S.me.grad, flag: S.me.flag || '', ...params };
      for (const k of Object.keys(all)) if (all[k] === undefined) delete all[k];
      const headers = { ...(extraHeaders || {}) };
      if (sign) {
        const hora = Math.floor(Date.now() / 3600000);
        all.hora = hora;
        if (S.myPubKey) all.pubKey = S.myPubKey;
        const canon = Object.keys(all).filter(k => !['hora', 'pubKey'].includes(k)).sort().map(k => k + '=' + String(all[k])).join('&');
        const sig = await XAUTH.signText('soc3|' + S.me.uid + '|' + hora + '|' + op + '|' + canon);
        if (sig) headers['x-social-sig'] = sig;
        /* TOFU: la clave pública viaja SIEMPRE con la firma — el servidor
           la registra la primera vez y a partir de ahí la clave viva NO
           se puede cambiar (a menos que la clave vieja firme una rotación) */
      }
      const q = new URLSearchParams(all);
      const r = await fetch(`${SOCIAL_API}?${q}`, { headers });
      const j = await r.json().catch(() => null);
      if (!j || !j.ok) {
        if (!quiet && j && j.error) toast('⚠ ' + j.error, true);
        return j && j.ok ? j : null;
      }
      return j;
    } catch (e) { return null; }
  }

  /* 🛡 encabezados de admin (solo si el dispositivo tiene la clave
     que publica el catálogo — la misma que firma en el chat) */
  async function adminSigHeader() {
    const sig = await XAUTH.signText('xstream-social-admin:' + Math.floor(Date.now() / 3600000));
    return sig ? { 'x-social-admin': sig } : null;
  }

  /* ── catálogo (mismo método a prueba de caché del sitio principal) ── */
  async function loadCatalog() {
    try {
      const cr = await fetch(`https://api.github.com/repos/${GH_REPO}/commits?path=catalog.json&sha=main&per_page=1`, { cache: 'no-store' });
      if (!cr.ok) return;
      const sha = ((await cr.json()) || [])[0];
      if (!sha || !sha.sha) return;
      const jr = await fetch(`https://cdn.jsdelivr.net/gh/${GH_REPO}@${sha.sha}/catalog.json`, { cache: 'no-store' });
      if (!jr.ok) return;
      const cat = await jr.json();
      S.catalog = (cat.series || []).filter(s => s.poster).slice(0, 400);
    } catch (e) { S.catalog = []; }
  }
  const catFind = (...needles) => {
    for (const n of needles) {
      const hit = S.catalog.find(s => slugify(s.t).includes(slugify(n)) || (s.t || '').toLowerCase().includes(n.toLowerCase()));
      if (hit) return hit;
    }
    return null;
  };
  const hotCatalog = () => S.catalog.filter(s => s.kind !== 'pelicula' || s.genre).slice(0, 30);

  /* 🔗 enlace al SITIO PRINCIPAL que funciona en web Y en local:
     web → ../  ·  file:// → ../index.html (si no, el navegador muestra el
     listado de la carpeta en vez de abrir la app)                        */
  const mainLink = h => (location.protocol === 'file:' ? '../index.html' : '../') + (h || '');
  const catLink = s => mainLink(`#/${s.kind === 'pelicula' ? 'pelicula' : 'anime'}/${encodeURIComponent(slugify(s.t))}${s.kind === 'pelicula' ? '' : '/1'}`);

  /* ═══════════ TOPBAR ═══════════ */
  function renderMe() {
    const av = $('socMeAvatar');
    av.style.cssText = gradOf(S.me.grad);
    av.textContent = initials(S.me.name);
    $('socMeName').textContent = S.me.name;
    const cAv = $('socCreateAvatar');
    cAv.style.cssText = gradOf(S.me.grad);
    cAv.textContent = initials(S.me.name);
    $('socMeDrop').innerHTML = `
      <div class="soc-drop-h">${esc(S.me.name)} ${esc(S.me.tag || '')} ${esc(S.me.flag || '')}</div>
      <button data-me="perfil">🧑 Mi perfil</button>
      <button data-me="guardados">🔖 Guardados (${S.saved.length})</button>
      <button data-me="intereses">⭐ Mis intereses</button>
      <button data-me="seguridad">🔐 Seguridad y respaldo</button>
      ${isLocalAdmin() ? '<button data-me="mods">🛡 Panel de moderación</button>' : ''}
      <a href="${mainLink('')}">🎬 Ir a XSTREAM</a>`;
    $('socMeDrop').querySelectorAll('[data-me]').forEach(b => b.addEventListener('click', () => {
      $('socMeDrop').classList.add('hidden');
      if (b.dataset.me === 'perfil') openProfile(S.me.uid);
      if (b.dataset.me === 'guardados') openSaved();
      if (b.dataset.me === 'intereses') openInterests();
      if (b.dataset.me === 'seguridad') openSecurity();
      if (b.dataset.me === 'mods') openAdminReports();
    }));
  }
  function renderCounters() {
    /* v3: usa notifsUnread del servidor (sabe lo leído de verdad),
       con fallback local por si viene sin él                        */
    const unreadNotifs = typeof S.notifsUnread === 'number' ? S.notifsUnread : S.notifs.filter(n => !n.read).length;
    const unreadMsgs = S.convos.reduce((a, c) => a + (c.unread || 0), 0);
    const set = (el, n) => { const b = $(el); if (!b) return; b.hidden = !n; b.textContent = n > 99 ? '99+' : n; };
    set('socBellCount', unreadNotifs); set('socMsgCount', unreadMsgs);
    set('socSideNotif', unreadNotifs); set('socSideMsg', unreadMsgs);
    set('socMobNotif', unreadNotifs); set('socMobMsg', unreadMsgs);
  }
  function renderNotifDrop() {
    const d = $('socNotifDrop');
    d.innerHTML = `<div class="soc-drop-h">Notificaciones</div>` + (S.notifs.length
      ? S.notifs.slice(0, 25).map(n => `
        <div class="soc-nrow ${n.read ? '' : 'unread'}">
          <span class="n-ic">${n.type === 'like' ? '❤️' : n.type === 'comment' ? '💬' : n.type === 'follow' ? '👤' : '✉️'}</span>
          <b>${esc(n.byName)}</b> ${esc(n.text)}<small>${ago(n.at)}</small>
        </div>`).join('')
      : `<div class="soc-empty">Todo tranquilo por ahora — cuando alguien reaccione a lo tuyo, aparece aquí.</div>`);
  }

  /* ═══════════ SIDEBAR + INTERESES ═══════════ */
  const INTERESTS = ['Películas', 'Series', 'Anime', 'Juegos', 'Música', 'Deportes', 'Tecnología'];
  function renderInterests() {
    const box = $('socInterests');
    box.innerHTML = '';
    for (const it of INTERESTS) {
      const b = document.createElement('button');
      b.className = 'soc-int' + (S.interests.includes(it) ? ' on' : '');
      b.textContent = it;
      b.addEventListener('click', async () => {
        const i = S.interests.indexOf(it);
        if (i >= 0) S.interests.splice(i, 1); else S.interests.push(it);
        b.classList.toggle('on');
        await socCall('profile', { bio: S.bio, interests: JSON.stringify(S.interests) }, true);
        toast(i >= 0 ? 'Interés retirado' : '⭐ Interés guardado: ' + it);
      });
      box.appendChild(b);
    }
  }
  function navTo(view) {
    document.querySelectorAll('#socSideNav a, .soc-mob a').forEach(a => a.classList.toggle('on', a.dataset.nav === view));
    if (view === 'inicio') { $('socFeed').scrollIntoView({ behavior: 'smooth' }); closeSheets(); }
    if (view === 'explorar') openExplore();
    if (view === 'foro') { closeSheets(); dockOpen('foro'); foroFetch(); }
    if (view === 'amigos') openFriends();
    if (view === 'grupos') openGroups();
    if (view === 'mensajes') openChatPanel();
    if (view === 'notificaciones') { $('socNotifDrop').classList.remove('hidden'); markNotifsRead(); }
    if (view === 'perfil') openProfile(S.me.uid);
  }
  document.querySelectorAll('#socSideNav a, .soc-mob a').forEach(a =>
    a.addEventListener('click', () => navTo(a.dataset.nav)));

  /* ═══════════ HISTORIAS ═══════════ */
  function renderStories() {
    const box = $('socStories');
    box.innerHTML = '';
    const mk = (cls, inner, name, click, live) => {
      const d = document.createElement('button');
      d.className = 'soc-story ' + cls;
      d.innerHTML = `<span class="soc-story-ring"><span class="soc-avatar">${inner}</span>${live ? '<span class="soc-story-live">EN VIVO</span>' : ''}</span><span class="soc-story-name">${esc(name)}</span>`;
      d.addEventListener('click', click);
      box.appendChild(d);
    };
    mk('new', '＋', 'Crear historia', openCreateStory);
    if (S.stories.some(s => s.uid === S.me.uid)) {
      const mine = S.stories.find(s => s.uid === S.me.uid);
      mk('ring-d', avatarHtml(S.me.name, S.me.grad), 'Tu historia', () => openStoryView(mine), mine.live);
    } else {
      mk('ring-d', avatarHtml(S.me.name, S.me.grad), 'Tu historia', openCreateStory);
    }
    for (const g of S.groups.slice(0, 6)) {
      mk('ring-b', esc(g.name[0]), g.name, () => openConvo('g:' + g.id, g.name));
    }
    for (const s of S.stories.filter(x => x.uid !== S.me.uid).slice(0, 10)) {
      mk('ring-e', avatarHtml(s.name, s.grad), s.name.split(' ')[0], () => openStoryView(s), s.live);
    }
  }
  function openCreateStory() {
    openSheet(`
      <div class="soc-card-h"><span>✨ Crear historia</span></div>
      <p style="color:var(--faint);font-size:12px;line-height:1.6;margin-bottom:12px">
        Las historias duran 24 horas. Puedes marcarla <b style="color:var(--hot)">EN VIVO</b> si estás
        transmitiendo ahora mismo — se mostrará en Eventos en vivo con los espectadores reales conectados.</p>
      <textarea id="ssText" rows="2" placeholder="¿Qué está pasando? (opcional)" maxlength="120" style="width:100%;background:var(--card);border:1px solid var(--line);border-radius:10px;color:var(--ink);padding:10px;outline:none"></textarea>
      <input id="ssImg" placeholder="URL de imagen o póster (opcional)" style="width:100%;margin-top:9px;background:var(--card);border:1px solid var(--line);border-radius:10px;color:var(--ink);padding:9px;outline:none">
      ${S.catalog.length ? `<div style="margin-top:9px;max-height:150px;overflow-y:auto;display:flex;gap:7px;flex-wrap:wrap" id="ssPick">
        ${S.catalog.slice(0, 12).map(c => `<img data-p="${esc(c.poster)}" src="${esc(c.poster)}" style="width:44px;height:62px;object-fit:cover;border-radius:7px;cursor:pointer;border:1px solid var(--line)">`).join('')}
      </div>` : ''}
      <label style="display:flex;gap:8px;align-items:center;margin-top:12px;font-size:12.5px;color:var(--dim)">
        <input type="checkbox" id="ssLive"> 🔴 Estoy EN VIVO ahora
      </label>
      <div style="margin-top:14px"><button class="soc-btn soc-btn-green" id="ssGo">Publicar historia</button></div>`);
    $('ssPick')?.querySelectorAll('img').forEach(i => i.addEventListener('click', () => { $('ssImg').value = i.dataset.p; }));
    $('ssGo').addEventListener('click', async () => {
      const r = await socCall('story', { text: $('ssText').value, img: $('ssImg').value.trim(), live: $('ssLive').checked ? '1' : '' }, true);
      if (r) { toast('✨ Historia publicada'); closeSheet(); refresh(); }
    });
  }
  function openStoryView(s) {
    openSheet(`
      <div class="soc-card-h">
        <span>${avatarHtml(s.name, s.grad, 'sm').replace('<span', `<span title="${esc(s.name)}"`)}</span>
        <b style="margin-left:8px">${esc(s.name)}</b> ${s.live ? '<span class="soc-live-tag">EN VIVO</span>' : ''}
      </div>
      ${s.img ? `<div style="border-radius:12px;overflow:hidden;border:1px solid var(--line);margin-bottom:10px"><img src="${esc(s.img)}" style="width:100%;display:block"></div>` : ''}
      ${s.text ? `<p style="font-size:13.5px;line-height:1.6">${esc(s.text)}</p>` : '<p class="soc-empty">Historia de texto</p>'}
      <small style="display:block;color:var(--faint);margin-top:10px">${ago(s.at)} · desaparece a las 24 h</small>
      <small class="soc-views" id="ssViews">${(s.views || []).length} espectadores${(s.views || []).length === 1 ? '' : 's'}</small>`);
    /* cada apertura cuenta UNA vista por persona en el servidor */
    if (s.id && !(s.views || []).includes(S.me.uid)) {
      socCall('storyView', { sid: s.id }, true).then(r => {
        if (!r || !r.ok) return;
        const views = (s.views = s.views || []);
        if (!views.includes(S.me.uid)) views.push(S.me.uid);
        const v = $('ssViews');
        if (v) v.textContent = views.length + ' espectador' + (views.length === 1 ? '' : 's');
      }).catch(() => { });
    }
  }

  /* ═══════════ PUBLICAR ═══════════ */
  function renderAttach() {
    const box = $('socAttach');
    const a = S.attach;
    if (!a) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    if (a.kind === 'img') box.innerHTML = `<img src="${esc(a.url)}" alt=""><span>Imagen adjunta</span><button class="soc-x" id="ssAttX">✕</button>`;
    if (a.kind === 'vid') box.innerHTML = `<img src="https://i.ytimg.com/vi/${esc(a.url)}/hqdefault.jpg" alt=""><span>Vídeo de YouTube adjunto</span><button class="soc-x" id="ssAttX">✕</button>`;
    if (a.kind === 'link') box.innerHTML = `<span>🔗</span><span style="word-break:break-all">${esc(a.url)}</span><button class="soc-x" id="ssAttX">✕</button>`;
    if (a.kind === 'poll') box.innerHTML = `<span>📊</span><span>Encuesta: ${a.options.length} opciones</span><button class="soc-x" id="ssAttX">✕</button>`;
    $('ssAttX').addEventListener('click', () => { S.attach = null; renderAttach(); });
  }
  /* ═══════════ 🎬 ESTUDIO DE MEDIOS — herramientas profesionales ═══════════
     3 pestañas: Imágenes (URL + TMDB real + catálogo) · Vídeos (trailers
     oficiales de películas/series/anime reales + búsqueda YouTube) · Ideas
     (plantillas que incentivan a abrir temas). Adjunta como imagen o video. */
  async function tmdbMultiSearch(q) {
    try {
      const r = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&language=es-ES&query=${encodeURIComponent(q)}&page=1&include_adult=false`);
      if (!r.ok) return [];
      const j = await r.json();
      return (j.results || []).filter(x => x && x.media_type !== 'person' && (x.poster_path || x.backdrop_path));
    } catch (e) { return []; }
  }
  async function ytSearchPiped(q) {
    const INSTANCES = ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://api.piped.private.coffee'];
    for (const base of INSTANCES) {
      try {
        const r = await fetch(`${base}/search?q=${encodeURIComponent(q)}&filter=videos`);
        if (!r.ok) continue;
        const j = await r.json();
        if (j && j.items) {
          return j.items.filter(i => i && !i.isShort && (i.url || '').includes('v='))
            .slice(0, 12)
            .map(i => ({ key: (i.url.split('v=')[1] || '').split('&')[0], title: i.title, author: i.uploaderName, dur: i.duration }));
        }
      } catch (e) { }
    }
    return [];
  }
  async function tmdbOfficialTrailers(q) {
    const res = await tmdbMultiSearch(q);
    const out = [];
    for (const it of res.slice(0, 8)) {
      if (!it.media_type || it.media_type === 'person') continue;
      try {
        let v = await fetch(`https://api.themoviedb.org/3/${it.media_type}/${it.id}/videos?api_key=${TMDB_KEY}&language=es-ES`).then(r => r.json()).catch(() => null);
        let vids = (v && v.results) || [];
        if (!vids.length) vids = ((await fetch(`https://api.themoviedb.org/3/${it.media_type}/${it.id}/videos?api_key=${TMDB_KEY}&language=en-US`).then(r => r.json()).catch(() => ({}))).results) || [];
        const t = vids.find(x => x.site === 'YouTube' && /Trailer|Teaser/i.test(x.type || '')) || vids.find(x => x.site === 'YouTube');
        if (t) {
          out.push({ key: t.key, title: it.title || it.name, tipo: it.media_type === 'movie' ? 'Película' : 'Serie', official: true });
          if (out.length >= 6) break;
        }
      } catch (e) { }
      await new Promise(r => setTimeout(r, 60));
    }
    return out;
  }
  const IDEAS = [
    { ic: '🔥', t: 'El estreno que todos deben ver', txt: 'Acabo de ver «…» y tengo que contarlo: sin spoilers, ¿pero qué escena es la que más les gustó? 🍿' },
    { ic: '⚔️', t: 'Mi anime del momento', txt: 'Si solo pudieran ver UN anime esta temporada, sería «…». ¿Alguien más lo está siguiendo? 👾' },
    { ic: '🧛', t: 'Recomiéndame algo parecido', txt: 'Amé «…» — ¿qué me recomiendan que tenga ese mismo rollo? Voy a anotar todo 📝' },
    { ic: '😮', t: 'La escena que me marcó', txt: 'Hay escenas que no se olvidan. La mía es de «…», minuto exacto no digo 😏 ¿la suya?' },
    { ic: '🆚', t: 'Versus eterno', txt: 'Duelo de hoy: «…» contra «…». Solo puede quedar uno. Argumentos, no insultos 😄' },
    { ic: '🏆', t: 'Maratón del fin de semana', txt: 'Plan para el finde: maratón completa de «…». ¿Se apunta alguien? Traigo snacks 🎬' },
  ];
  function openMediaStudio(tab) {
    openSheet(`
      <div class="soc-studio">
        <div class="soc-studio-head">
          <b>🎬 Estudio de medios</b>
          <small>Adjunta contenido REAL para tu publicación</small>
        </div>
        <nav class="soc-studio-tabs">
          <button class="${tab === 'vid' ? '' : 'on'}" data-st="img"><span>🖼</span> Imágenes</button>
          <button class="${tab === 'vid' ? 'on' : ''}" data-st="vid"><span>🎬</span> Vídeos</button>
          <button class="${tab === 'temas' ? 'on' : ''}" data-st="temas"><span>💡</span> Ideas</button>
        </nav>

        <section class="soc-studio-pane ${tab === 'vid' ? '' : 'on'}" data-sp="vid">
          <div class="soc-studio-search">
            <input id="stVq" placeholder="Busca una película, serie o anime real — traemos su tráiler oficial…" autocomplete="off">
            <button class="soc-btn soc-btn-green" id="stVgo">Buscar</button>
          </div>
          <div class="soc-studio-res" id="stVres"><div class="soc-empty">Escribe arriba y encontraré tráilers oficiales (YouTube) de la película/serie/anime real — y más vídeos de YouTube.</div></div>
        </section>

        <section class="soc-studio-pane ${tab === 'img' ? 'on' : ''}" data-sp="img">
          <div class="soc-studio-search">
            <input id="stIq" placeholder="Busca arte real de películas/series (TMDB)…" autocomplete="off">
            <button class="soc-btn soc-btn-green" id="stIgo">Buscar</button>
          </div>
          <div class="soc-studio-res" id="stIres"></div>
          <div class="soc-studio-sub">…o pega una URL de imagen:</div>
          <div class="soc-studio-search">
            <input id="stIurl" placeholder="https://… (jpg, png, gif)">
            <button class="soc-btn soc-btn-green" id="stIurlGo">Adjuntar</button>
          </div>
          ${S.catalog.length ? `<div class="soc-studio-sub">…o de tu catálogo XSTREAM:</div>
          <div class="soc-studio-res soc-studio-cat" id="stIcat">
            ${S.catalog.slice(0, 12).map(c => `<img data-p="${esc(c.poster)}" src="${esc(c.poster)}" title="${esc(c.t)}" loading="lazy">`).join('')}
          </div>` : ''}
        </section>

        <section class="soc-studio-pane ${tab === 'temas' ? 'on' : ''}" data-sp="temas">
          <div class="soc-studio-sub">¿No sabes cómo empezar? Una idea, un clic, y el texto queda listo para elogiarlo a tu manera:</div>
          <div class="soc-ideas" id="stIdeas">
            ${IDEAS.map((it, i) => `<button class="soc-idea" data-i="${i}"><span>${it.ic}</span><b>${it.t}</b><small>${esc(it.txt.slice(0, 54))}…</small></button>`).join('')}
          </div>
        </section>
      </div>`, true);

    const sheet = $('socSheet');
    sheet.querySelectorAll('.soc-studio-tabs button').forEach(b => b.addEventListener('click', () => {
      sheet.querySelectorAll('.soc-studio-tabs button').forEach(x => x.classList.toggle('on', x === b));
      sheet.querySelectorAll('.soc-studio-pane').forEach(p => p.classList.toggle('on', p.dataset.sp === b.dataset.st));
    }));

    /* ── pestaña VÍDEOS ── */
    const vgo = () => attachVidSearch();
    $('stVgo').addEventListener('click', vgo);
    $('stVq').addEventListener('keydown', ev => { if (ev.key === 'Enter') vgo(); });
    async function attachVidSearch() {
      const q = $('stVq').value.trim();
      if (q.length < 2) { toast('⚠ Escribe al menos 2 letras', true); return; }
      const box = $('stVres');
      box.innerHTML = '<div class="soc-empty">⏳ Buscando el tráiler oficial y vídeos…</div>';
      const [official, general] = await Promise.all([tmdbOfficialTrailers(q), ytSearchPiped(q)]);
      if (!document.getElementById('stVres')) return;
      let html = '';
      if (official.length) {
        html += `<div class="soc-studio-sub">⭐ Tráilers OFICIALES de la película/serie/anime real</div>` + official.map(v => `
          <button class="soc-vidpick" data-k="${esc(v.key)}">
            <span class="soc-vidpick-th"><img src="https://i.ytimg.com/vi/${esc(v.key)}/hqdefault.jpg" loading="lazy"><i>▶</i></span>
            <span class="soc-vidpick-b"><b>${esc(v.title)}</b><small>${v.tipo} · tráiler oficial de YouTube</small></span>
          </button>`).join('');
      }
      if (general.length) {
        html += `<div class="soc-studio-sub">▶ Más vídeos de YouTube</div>` + general.map(v => `
          <button class="soc-vidpick" data-k="${esc(v.key)}">
            <span class="soc-vidpick-th"><img src="https://i.ytimg.com/vi/${esc(v.key)}/hqdefault.jpg" loading="lazy"><i>▶</i></span>
            <span class="soc-vidpick-b"><b>${esc(v.title.slice(0, 60))}</b><small>${esc(v.author || '')}${v.dur ? ' · ' + fmtDur(v.dur) : ''}</small></span>
          </button>`).join('');
      }
      box.innerHTML = html || '<div class="soc-empty">Sin resultados — prueba con el título exacto de la película o serie.</div>';
      box.querySelectorAll('.soc-vidpick').forEach(b => b.addEventListener('click', () => {
        S.attach = { kind: 'vid', url: b.dataset.k };
        closeSheet(); renderAttach();
        toast('🎬 Vídeo adjuntado — Publica cuando quieras');
      }));
    }
    const fmtDur = s => `${Math.floor((s || 0) / 60)}:${String((s || 0) % 60).padStart(2, '0')}`;

    /* ── pestaña IMÁGENES ── */
    const igo = async () => {
      const q = $('stIq').value.trim();
      if (q.length < 2) { toast('⚠ Escribe al menos 2 letras', true); return; }
      const box = $('stIres');
      box.innerHTML = '<div class="soc-empty">⏳ Buscando arte real…</div>';
      const res = await tmdbMultiSearch(q);
      if (!document.getElementById('stIres')) return;
      box.innerHTML = res.length ? `<div class="soc-studio-imgs">` + res.map(x => `
        <button class="soc-imgpick" data-p="https://image.tmdb.org/t/p/w780${esc(x.backdrop_path || x.poster_path)}">
          <img src="https://image.tmdb.org/t/p/w300${esc(x.poster_path || x.backdrop_path)}" loading="lazy">
          <b>${esc((x.title || x.name || '').slice(0, 22))}</b>
          <small>${x.media_type === 'movie' ? 'Película' : 'Serie'}</small>
        </button>`).join('') + '</div>'
        : '<div class="soc-empty">Sin resultados en TMDB — prueba otro título o pega una URL abajo.</div>';
      box.querySelectorAll('.soc-imgpick').forEach(b => b.addEventListener('click', () => {
        S.attach = { kind: 'img', url: b.dataset.p };
        closeSheet(); renderAttach();
        toast('🖼 Imagen adjuntada');
      }));
    };
    $('stIgo').addEventListener('click', igo);
    $('stIq').addEventListener('keydown', ev => { if (ev.key === 'Enter') igo(); });
    $('stIurlGo').addEventListener('click', () => {
      const u = $('stIurl').value.trim();
      if (!/^https?:\/\//.test(u)) { toast('⚠ Pega una URL válida (https://…)', true); return; }
      S.attach = { kind: 'img', url: u };
      closeSheet(); renderAttach(); toast('🖼 Imagen adjuntada');
    });
    $('stIcat')?.querySelectorAll('img').forEach(i => i.addEventListener('click', () => {
      S.attach = { kind: 'img', url: i.dataset.p };
      closeSheet(); renderAttach(); toast('🖼 Carátula de tu catálogo adjuntada');
    }));

    /* ── pestaña IDEAS ── */
    $('stIdeas').querySelectorAll('.soc-idea').forEach(b => b.addEventListener('click', () => {
      const idea = IDEAS[+b.dataset.i];
      $('socPostText').value = idea.txt;
      closeSheet();
      $('socPostText').focus();
      toast('💡 Idea cargada — complétala a tu manera y publica');
    }));
  }

  /* herramientas del compositor: 📷 Foto/Vídeo y 🎞 GIF abren el ESTUDIO
     de medios; enlace y encuesta conservan sus diálogos propios        */
  document.querySelectorAll('.soc-tool').forEach(t => t.addEventListener('click', () => {
    const k = t.dataset.tool;
    if (k === 'foto' || k === 'gif') { openMediaStudio('img'); return; }
    if (k === 'enlace') {
      const u = prompt('🔗 URL del enlace a compartir:');
      if (u && /^https?:\/\//.test(u)) { S.attach = { kind: 'link', url: u }; renderAttach(); }
      else if (u) toast('⚠ URL no válida', true);
    }
    if (k === 'encuesta') {
      openSheet(`
        <div class="soc-card-h"><span>📊 Crear encuesta</span></div>
        <p style="color:var(--faint);font-size:12px;margin-bottom:10px">Escribe entre 2 y 4 opciones. Los votos son reales: 1 por persona.</p>
        ${[1, 2, 3, 4].map(i => `<input id="ssPoll${i}" placeholder="Opción ${i}${i > 2 ? ' (opcional)' : ''}" maxlength="60" style="width:100%;margin-bottom:8px;background:var(--card);border:1px solid var(--line);border-radius:10px;color:var(--ink);padding:9px;outline:none">`).join('')}
        <button class="soc-btn soc-btn-green" id="ssPollGo">Añadir encuesta</button>`);
      $('ssPollGo').addEventListener('click', () => {
        const opts = [1, 2, 3, 4].map(i => $('ssPoll' + i).value.trim()).filter(Boolean);
        if (opts.length < 2) { toast('⚠ Mínimo 2 opciones', true); return; }
        S.attach = { kind: 'poll', options: opts };
        closeSheet(); renderAttach();
      });
    }
  }));
  $('socPublish').addEventListener('click', async () => {
    const text = $('socPostText').value.trim();
    if (!text && !S.attach) { toast('⚠ Escribe algo o adjunta una imagen', true); return; }
    const p = {
      text,
      img: S.attach && S.attach.kind === 'img' ? S.attach.url : '',
      vid: S.attach && S.attach.kind === 'vid' ? S.attach.url : '',
      link: S.attach && S.attach.kind === 'link' ? S.attach.url : '',
      poll: S.attach && S.attach.kind === 'poll' ? JSON.stringify(S.attach.options) : '',
    };
    const r = await socCall('post', p, true);
    if (r) {
      $('socPostText').value = '';
      S.attach = null; renderAttach();
      toast('✅ Publicado en la comunidad');
      if (r.post) { S.posts.unshift(r.post); syncFeed(); }
    }
  });

  /* ═══════════ FEED — incremental ═══════════
     Las tarjetas viven en feedCards: cada refresco actualiza contadores,
     hilos y encuestas EN SITIO. El input de comentario está FUERA de la
     zona rehecha → lo que escribes sobrevive al refresco de 45 s.      */
  const withTags = t => esc(t).replace(/(^|\s)(#[\wáéíóúñÁÉÍÓÚÑ]+)/g, (m, a, b) => `${a}<span class="tag">${b}</span>`);
  const feedCards = new Map();   /* pid -> { el, cmSig, pollSig } */
  const feedList = () => (S.posts.length ? S.posts : welcomePosts()).filter(p => !S.seenTomb.has(p.id));
  const postOf = pid => feedList().find(p => p.id === pid);

  /* posts de bienvenida del EQUIPO — datos de ejemplo claramente identificados (solo con feed vacío) */
  let _welcomeCache = null;
  function welcomePosts() {
    if (_welcomeCache) return _welcomeCache;
    const solo = catFind('solo leveling', 'soraleveling') || S.catalog.find(s => s.kind !== 'pelicula') || null;
    const dune = catFind('dune', 'dune parte dos') || S.catalog.find(s => s.kind === 'pelicula') || null;
    const mk = (img, text) => ({
      id: 'welcome-' + slugify(text.slice(0, 20)), uid: 'x-stream-social-team', name: 'XSTREAM · Equipo',
      tag: '#oficial', grad: 0, text, img: img || '', link: '', poll: null, at: Date.now() - 3600e3,
      likes: [], comments: [], shares: 0, official: true,
    });
    const out = [];
    if (solo) out.push(mk(solo.poster, `¡Bienvenido a XSTREAM SOCIAL! 🎉 Esta es la nueva comunidad de #cine, #series y #anime. Publica, comenta y sigue a tus creadores favoritos. Como muestra, esto es lo que verás por aquí — hablando de #SoloLeveling y de todo lo que amas. Únete a la conversación 👇`));
    if (dune) out.push(mk('', `¿Ya viste la conversación de la semana? #DuneParte2 sigue dando de qué hablar 🏜️ Cuéntanos tu teoría sin spoilers… o con spoilers, pero avisa 😄`));
    _welcomeCache = out;
    return out;
  }

  /* firmas de cambio: rehilar solo cuando de verdad cambió algo */
  const commentsSig = p => (p.comments || []).map(c => (c.uid || '') + '|' + (c.at || 0) + '|' + ((c.likes || []).length)).join('~');
  const pollSig = p => p.poll ? JSON.stringify(p.poll.votes || {}) : '';

  function commentsHtml(p) {
    const cs = p.comments || [];
    if (!cs.length) return `<div class="soc-comments-none">Aún sin comentarios — sé el primero 👇</div>`;
    return cs.map((c, i) => `
      <div class="soc-comment" data-ci="${i}">
        ${avatarHtml(c.name, 0, 'sm')}
        <div class="soc-comment-b"><b>${esc(c.name)}</b><p>${esc(c.text)}</p><small>${ago(c.at)}</small></div>
        <button class="soc-clike${((c.likes || []).includes(S.me.uid)) ? ' on' : ''}" data-ci="${i}" title="Me gusta el comentario">❤ ${(c.likes || []).length || ''}</button>
      </div>`).join('');
  }

  function pollHtml(p) {
    const total = Object.values(p.poll.votes || {}).reduce((a, v) => a + v.length, 0) || 0;
    const mine = Object.values(p.poll.votes || {}).some(v => v.includes(S.me.uid));
    return `<div class="soc-poll" data-poll="1">
      ${p.poll.o.map((o, i) => {
        const n = ((p.poll.votes || {})[i] || []).length;
        const pct = total ? Math.round(n / total * 100) : 0;
        return `<button class="soc-poll-opt" data-i="${i}">
          <span class="fill ${((p.poll.votes || {})[i] || []).includes(S.me.uid) ? 'mine' : ''}" style="width:${mine ? pct : 0}%"></span>
          <span><small>${esc(o)}</small><small>${mine ? `${n} · ${pct}%` : 'Votar'}</small></span>
        </button>`;
      }).join('')}
      <small style="color:var(--faint);font-size:10.5px">📊 ${total} voto${total === 1 ? '' : 's'}${mine ? '' : ' · 1 por persona'}</small>
    </div>`;
  }
  function wirePoll(card, pid) {
    card.querySelectorAll('.soc-poll-opt').forEach(b => b.addEventListener('click', async () => {
      const p = postOf(pid);
      if (!p) return;
      const r = await socCall('vote', { postId: pid, option: b.dataset.i }, true);
      if (r) { toast('📊 Voto registrado'); refreshSoon(); }
    }));
  }

  function postCard(p) {
    const d = document.createElement('article');
    d.className = 'soc-card soc-post';
    d.dataset.pid = p.id;   /* ancla para #p-<id> (enlaces de compartir) */
    const liked = p.likes.includes(S.me.uid);
    const saved = S.saved.includes(p.id);
    const isTm = p.official || p.uid === 'x-stream-social-team';
    d.innerHTML = `
      <div class="soc-post-h">
        ${avatarHtml(p.name, p.grad, 'lg')}
        <div class="soc-post-user">
          <b>${esc(p.name)} ${isTm ? '<span class="soc-verified" title="Equipo XSTREAM">✔</span>' : ''}</b>
          <small>${esc(p.tag || '')} · ${ago(p.at)}${isTm ? ' · <span style="color:var(--blue)">EQUIPO XSTREAM</span>' : ''}</small>
        </div>
        <div class="soc-post-time">${hms(p.at)}</div>
        <button class="soc-post-menu" title="Opciones">⋯</button>
      </div>
      ${p.text ? `<p class="soc-post-text">${withTags(p.text)}</p>` : ''}
      ${p.img ? `<div class="soc-post-img"><img src="${esc(p.img)}" loading="lazy" alt=""></div>` : ''}
      ${p.vid ? `<div class="soc-post-vid" data-k="${esc(p.vid)}" role="button" tabindex="0"><img src="https://i.ytimg.com/vi/${esc(p.vid)}/hqdefault.jpg" loading="lazy" alt="vídeo"><span class="soc-vid-play">▶</span></div>` : ''}
      ${p.link ? `<a class="soc-post-link" href="${esc(p.link)}" target="_blank" rel="noopener">🔗 ${esc(p.link)}</a>` : ''}
      ${p.poll ? pollHtml(p) : ''}
      <div class="soc-post-acts">
        <button class="soc-act lk ${liked ? 'on' : ''}" title="Me gusta">${liked ? '❤' : '👍'} ${p.likes.length}</button>
        <button class="soc-act cm" title="Ir a los comentarios">💬 ${(p.comments || []).length}</button>
        <button class="soc-act sh" title="Compartir (copia el enlace)">↗ Compartir${p.shares ? ' · ' + p.shares : ''}</button>
        <button class="soc-act sv save ${saved ? 'on' : ''}" title="Guardar">🔖</button>
      </div>
      <div class="soc-comments">
        <div class="soc-comments-list">${commentsHtml(p)}</div>
        <div class="soc-comment-new">
          ${avatarHtml(S.me.name, S.me.grad, 'sm')}
          <input placeholder="Escribe un comentario…" maxlength="400">
          <button class="soc-btn soc-btn-green soc-comment-send">Enviar</button>
        </div>
      </div>`;
    wirePostCard(d, p.id);
    return d;
  }

  /* todo el wiring resuelve el post VIVO por pid — los cierres nunca
     quedan apuntando a datos viejos tras un refresco               */
  function wirePostCard(d, pid) {
    const lk = d.querySelector('.lk');
    lk.addEventListener('click', async () => {
      const p = postOf(pid); if (!p) return;
      const on = !lk.classList.contains('on');
      lk.classList.toggle('on', on);
      lk.textContent = (on ? '❤' : '👍') + ' ' + Math.max(0, p.likes.length + (on ? 1 : -1));
      const r = await socCall('like', { postId: pid, on: on ? '1' : '0' }, true);
      if (r) {
        const i = p.likes.indexOf(S.me.uid);
        if (r.mine && i < 0) p.likes.push(S.me.uid);
        if (!r.mine && i >= 0) p.likes.splice(i, 1);
        lk.textContent = (r.mine ? '❤' : '👍') + ' ' + r.likes;
        lk.classList.toggle('on', !!r.mine);
      }
    });
    d.querySelector('.cm').addEventListener('click', () => { const i = d.querySelector('.soc-comment-new input'); if (i) i.focus(); });
    const cIn = d.querySelector('.soc-comment-new input');
    const cBtn = d.querySelector('.soc-comment-send');
    const sendComment = async () => {
      const p = postOf(pid); if (!p) return;
      const text = cIn.value.trim();
      if (!text) { cIn.focus(); return; }
      cBtn.disabled = true; cBtn.textContent = '…';
      const r = await socCall('comment', { postId: pid, text }, true);
      if (r) {
        cIn.value = '';
        if (!r.deduped) {
          p.comments = p.comments || [];
          p.comments.push({ uid: S.me.uid, name: S.me.name, text, likes: [], at: Date.now() });
          toast('💬 Comentario publicado');
          const rec = feedCards.get(pid); if (rec) updateCard(rec, p);
        }
      }
      cBtn.disabled = false; cBtn.textContent = 'Enviar';
    };
    cIn.addEventListener('keydown', ev => { if (ev.key === 'Enter') sendComment(); });
    cBtn.addEventListener('click', sendComment);
    /* ❤ likes de comentarios — delegado en la lista: sobrevive a rebuilds */
    d.querySelector('.soc-comments-list').addEventListener('click', async ev => {
      const b = ev.target.closest('.soc-clike'); if (!b) return;
      const p = postOf(pid); if (!p) return;
      const ci = +b.dataset.ci;
      const c = (p.comments || [])[ci]; if (!c) return;
      c.likes = c.likes || [];
      const on = !c.likes.includes(S.me.uid);
      const r = await socCall('clike', { postId: pid, ci: String(ci), on: on ? '1' : '0' }, true);
      if (r) {
        const i = c.likes.indexOf(S.me.uid);
        if (r.mine && i < 0) c.likes.push(S.me.uid);
        if (!r.mine && i >= 0) c.likes.splice(i, 1);
        b.classList.toggle('on', !!r.mine);
        b.textContent = '❤ ' + (r.likes || '');
      }
    });
    d.querySelector('.sh').addEventListener('click', async () => {
      const url = location.origin + location.pathname + '#p-' + pid;
      try { await navigator.clipboard.writeText(url); toast('↗ Enlace de la publicación copiado'); } catch (e) { toast(url); }
      await socCall('share', { postId: pid });
    });
    const sv = d.querySelector('.sv');
    sv.addEventListener('click', async () => {
      const on = !sv.classList.contains('on');
      sv.classList.toggle('on', on);
      const r = await socCall('save', { postId: pid, on: on ? '1' : '0' }, true);
      if (r) { S.saved = r.saved || S.saved; toast(on ? '🔖 Guardado' : 'Quitado de guardados'); }
    });
    /* ⋯ menú real de la publicación */
    d.querySelector('.soc-post-menu').addEventListener('click', ev => { ev.stopPropagation(); togglePostMenu(d, pid); });
    /* ▶ vídeo de YouTube: portada + play → embed al instante */
    const vd = d.querySelector('.soc-post-vid');
    if (vd) vd.addEventListener('click', () => {
      vd.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(vd.dataset.k)}?autoplay=1&rel=0" title="Vídeo" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
      vd.classList.add('on');
    });
    if (d.querySelector('.soc-poll')) wirePoll(d, pid);
  }

  /* ── menú ⋯: guardar · copiar · borrar la propia · reportar · moderación ── */
  function closePostMenus() { document.querySelectorAll('.soc-menu').forEach(m => m.remove()); }
  function togglePostMenu(card, pid) {
    const existing = card.querySelector('.soc-menu');
    closePostMenus();
    if (existing) return;
    const p = postOf(pid); if (!p) return;
    const virtual = String(pid).startsWith('welcome-');
    const mine = p.uid === S.me.uid;
    const admin = !!(window.XAUTH && typeof XAUTH.isAdmin === 'function' && XAUTH.isAdmin());
    const m = document.createElement('div');
    m.className = 'soc-menu';
    m.innerHTML = `
      ${virtual ? '' : (mine ? '' : `<button data-m="save">${S.saved.includes(pid) ? '🔖 Quitar de guardados' : '🔖 Guardar'}</button>`)}
      <button data-m="copy">↗ Copiar enlace de la publicación</button>
      ${virtual ? '' : (mine || admin ? `<button data-m="del" class="danger">🗑 Borrar publicación</button>` : `<button data-m="report" class="danger">🚩 Reportar contenido</button>`)}
      ${(!virtual && admin) ? `<button data-m="mod">🛡 Abrir panel de moderación</button>` : ''}`;
    card.appendChild(m);
    m.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-m]');
      if (!b) return;
      closePostMenus();
      const k = b.dataset.m;
      if (k === 'copy') {
        const url = location.origin + location.pathname + '#p-' + pid;
        try { await navigator.clipboard.writeText(url); toast('↗ Enlace copiado'); } catch (e) { toast(url); }
      }
      if (k === 'save') {
        const on = !S.saved.includes(pid);
        const r = await socCall('save', { postId: pid, on: on ? '1' : '0' }, true);
        if (r) { S.saved = r.saved || S.saved; syncFeed(); toast(on ? '🔖 Guardado' : 'Quitado de guardados'); }
      }
      if (k === 'del') {
        const quien = mine ? 'tu publicación' : 'la publicación de ' + (p.name || 'otro usuario');
        if (!confirm('¿Borrar ' + quien + ' de forma definitiva?\n\nEsta acción no se puede deshacer.')) return;
        const hdrs = (!mine && admin) ? await adminSigHeader() : null;
        const r = await socCall('delPost', { postId: pid }, true, hdrs);
        if (r) {
          S.posts = S.posts.filter(x => x.id !== pid);
          S.seenTomb.add(pid);
          const rec = feedCards.get(pid);
          if (rec) { rec.el.remove(); feedCards.delete(pid); }
          syncFeed();
          toast('🗑 Publicación borrada');
        }
      }
      if (k === 'report') openReportSheet(pid);
      if (k === 'mod') openAdminReports();
    });
    const away = ev => { if (!m.contains(ev.target) && !ev.target.closest('.soc-post-menu')) { m.remove(); document.removeEventListener('click', away, true); } };
    document.addEventListener('click', away, true);
  }

  /* actualización en sitio: contadores + hilos + encuestas */
  function updateCard(rec, p) {
    if (!rec) return;
    const d = rec.el;
    const lk = d.querySelector('.lk');
    if (lk) { const liked = p.likes.includes(S.me.uid); lk.classList.toggle('on', liked); lk.textContent = (liked ? '❤' : '👍') + ' ' + p.likes.length; }
    const cm = d.querySelector('.cm');
    if (cm) cm.textContent = '💬 ' + (p.comments || []).length;
    const sh = d.querySelector('.sh');
    if (sh) sh.textContent = '↗ Compartir' + (p.shares ? ' · ' + p.shares : '');
    const sv = d.querySelector('.sv');
    if (sv) sv.classList.toggle('on', S.saved.includes(p.id));
    const csig = commentsSig(p);
    if (csig !== rec.cmSig) {
      rec.cmSig = csig;
      const list = d.querySelector('.soc-comments-list');
      if (list) list.innerHTML = commentsHtml(p);
      /* el input de comentario NO vive en la lista: el borrador sobrevive */
    }
    const psig = pollSig(p);
    if (psig !== rec.pollSig) {
      rec.pollSig = psig;
      const old = d.querySelector('.soc-poll');
      if (old && p.poll) { const t = document.createElement('div'); t.innerHTML = pollHtml(p); old.replaceWith(t.firstElementChild); wirePoll(d, p.id); }
      else if (!old && p.poll) {
        const t = document.createElement('div'); t.innerHTML = pollHtml(p);
        d.querySelector('.soc-post-acts').parentNode.insertBefore(t.firstElementChild, d.querySelector('.soc-post-acts'));
        wirePoll(d, p.id);
      }
    }
  }

  function syncFeed() {
    const box = $('socFeed');
    const posts = feedList();
    if (!posts.length) {
      for (const [, rec] of feedCards) rec.el.remove();
      feedCards.clear();
      box.innerHTML = '';
      $('socFeedEmpty').classList.remove('hidden');
      $('socFeedEmpty').innerHTML = 'Aún no hay publicaciones — sé el primero en escribirle a la comunidad ✍️';
      return;
    }
    $('socFeedEmpty').classList.add('hidden');
    const ids = new Set(posts.map(p => p.id));
    for (const [pid, rec] of feedCards) if (!ids.has(pid)) { rec.el.remove(); feedCards.delete(pid); }
    for (let i = 0; i < posts.length; i++) {
      const p = posts[i];
      let rec = feedCards.get(p.id);
      if (rec) { updateCard(rec, p); continue; }
      const el = postCard(p);
      rec = { el, cmSig: commentsSig(p), pollSig: pollSig(p) };
      feedCards.set(p.id, rec);
      let nextEl = null;
      for (let j = i + 1; j < posts.length; j++) { const n = feedCards.get(posts[j].id); if (n) { nextEl = n.el; break; } }
      box.insertBefore(el, nextEl);
    }
  }
  function renderFeed() { syncFeed(); }   /* compat con las llamadas previas */

  /* ═══════════ TENDENCIAS + GRUPOS ═══════════ */
  function renderTrends() {
    const counts = {};
    for (const p of S.posts) {
      for (const m of String(p.text || '').matchAll(/#([\wáéíóúñÁÉÍÓÚÑ]{2,30})/g)) counts[m[1]] = (counts[m[1]] || 0) + 1;
    }
    let items = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([tag, n]) => ({ tag, n }));
    const cat = hotCatalog().slice(0, 5 - items.length);
    const box = $('socTrends');
    box.innerHTML = '';
    let idx = 1;
    for (const it of items) {
      const d = document.createElement('div');
      d.className = 'soc-trend';
      d.innerHTML = `<span class="soc-trend-idx">${idx++}</span><span class="soc-trend-emoji">💬</span>
        <div class="soc-trend-b"><b>#${esc(it.tag)}</b><small>${it.n} publicación${it.n === 1 ? '' : 'es'} en la comunidad</small></div>
        <span class="soc-trend-up">▲</span>`;
      d.addEventListener('click', () => { $('socSearch').value = '#' + it.tag; doSearch(); });
      box.appendChild(d);
    }
    for (const c of cat) {
      const d = document.createElement('div');
      d.className = 'soc-trend';
      d.innerHTML = `<span class="soc-trend-idx">${idx++}</span>
        <img src="${esc(c.poster)}" loading="lazy" alt="">
        <div class="soc-trend-b"><b>#${esc(slugify(c.t).replace(/-/g, ''))}</b><small>${esc((c.genre || (c.kind === 'pelicula' ? 'Película' : 'Serie')) + '')} · en el catálogo</small></div>
        <span class="soc-trend-up">▲</span>`;
      d.addEventListener('click', () => window.open(catLink(c), '_self'));
      box.appendChild(d);
    }
    if (!box.children.length) box.innerHTML = '<div class="soc-empty">Las tendencias crecen con las publicaciones de la comunidad.</div>';
  }
  function renderGroups() {
    const box = $('socGroups');
    box.innerHTML = '';
    for (const g of S.groups.slice(0, 6)) {
      const joined = S.follows.includes('g:' + g.id);
      const d = document.createElement('div');
      d.className = 'soc-group';
      d.innerHTML = `
        <span class="soc-group-av">${esc(g.name[0])}</span>
        <div class="soc-group-b"><b>${esc(g.name)}</b><small>${g.members} miembro${g.members === 1 ? '' : 's'} · ${esc(g.desc || 'Grupo de la comunidad')}</small></div>
        <button class="soc-btn ${joined ? '' : 'soc-btn-green'}">${joined ? '✓ Miembro' : 'Unirte'}</button>`;
      d.querySelector('button').addEventListener('click', async ev => {
        ev.stopPropagation();
        const r = await socCall('follow', { target: 'g:' + g.id, on: joined ? '0' : '1' }, true);
        if (r) { toast(joined ? 'Saliste de ' + g.name : '⬡ Te uniste a ' + g.name); refresh(); }
      });
      d.addEventListener('click', () => openConvo('g:' + g.id, g.name));
      box.appendChild(d);
    }
  }

  /* ═══════════ DESCUBRIMIENTO ═══════════ */
  /* ═══════════ CARRUSEL DESTACADO — páginas de 3 que ROTAN solas ═══════════
     Contenido 100% real del catálogo; clic → vista previa instantánea.     */
  let featPage = 0, featTimer = null;
  function featuredPool() {
    const picks = [
      catFind('solo leveling', 'soraleveling'),
      catFind('dune'),
      catFind('the last of us', 'last of us'),
    ].filter(Boolean);
    const rest = S.catalog.filter(c => !picks.includes(c) && c.poster).slice(0, 15);
    const pool = [...picks];
    for (const c of rest) if (!pool.includes(c)) pool.push(c);
    return pool.slice(0, 18);
  }
  function renderFeatured() {
    const pool = featuredPool();
    const pages = [];
    for (let i = 0; i < pool.length; i += 3) pages.push(pool.slice(i, i + 3));
    const grid = $('socFeat'), nav = $('socFeatNav');
    if (!grid || !nav) return;
    if (featPage >= pages.length) featPage = 0;
    clearInterval(featTimer);
    if (!pages.length) {
      grid.innerHTML = '<div class="soc-empty">El catálogo se está cargando…</div>';
      nav.innerHTML = '';
      return;
    }
    const page = pages[featPage];
    grid.innerHTML = page.map(c => `
      <button class="soc-feat-it" data-fid="${esc(c.id)}">
        <img src="${esc(c.poster)}" loading="lazy" alt="${esc(c.t)}">
        ${c.kind !== 'pelicula' ? '<span class="soc-feat-badge">EN EMISIÓN</span>' : '<span class="soc-feat-play">▶</span>'}
        <span class="soc-feat-t">${esc(c.t.slice(0, 30))}<small>${esc(c.kind === 'pelicula' ? 'Película completa' : 'Serie · ' + (c.episodes || []).length + ' caps')}</small></span>
      </button>`).join('');
    /* ‹ puntitos › : flechas para pasar a voluntad + puntos de posición.
       La rotación automática sigue (6s) — cada paso manual reinicia el
       conteo, así el auto no pisa el navigation del usuario.            */
    nav.innerHTML = pages.length > 1
      ? '<button class="soc-feat-arrow" data-d="-1" title="Anterior">‹</button>'
        + pages.map((_, i) => `<i class="${i === featPage ? 'on' : ''}" data-fp="${i}"></i>`).join('')
        + '<button class="soc-feat-arrow" data-d="1" title="Siguiente">›</button>'
      : '';
    nav.querySelectorAll('i').forEach(dot => dot.addEventListener('click', () => { featPage = +dot.dataset.fp; renderFeatured(); }));
    nav.querySelectorAll('.soc-feat-arrow').forEach(ar => ar.addEventListener('click', () => {
      featPage = (featPage + Number(ar.dataset.d) + pages.length) % pages.length;
      renderFeatured();
    }));
    grid.querySelectorAll('.soc-feat-it').forEach(b => b.addEventListener('click', () => {
      const c = pool.find(x => x.id === b.dataset.fid);
      if (c) openCatalogPreview(c);
    }));
    /* rotación automática: cada 6s, 3 títulos nuevos */
    if (pages.length > 1) featTimer = setInterval(() => { featPage = (featPage + 1) % pages.length; renderFeatured(); }, 6000);
  }

  /* 👀 vista previa instantánea: ficha con póster, ficha TMDB en vivo,
     botones Ver / Publicar sobre esto (adjunta el póster al compositor) */
  async function openCatalogPreview(c) {
    openSheet(`
      <div class="soc-preview">
        <div class="soc-preview-hero">
          <img class="soc-preview-bg" src="${esc(c.poster)}" alt="">
          <div class="soc-preview-shade"></div>
          <img class="soc-preview-poster" src="${esc(c.poster)}" alt="${esc(c.t)}">
          <div class="soc-preview-meta">
            <b>${esc(c.t)}</b>
            <small>${esc(c.kind === 'pelicula' ? '🎬 Película' : '📺 Serie · ' + (c.episodes || []).length + ' capítulos')}${c.genre ? ' · ' + esc(String(c.genre)) : ''}</small>
          </div>
        </div>
        <p class="soc-preview-story" id="ssPvStory">⏳ Buscando la ficha…</p>
        <div class="soc-preview-acts">
          <a class="soc-btn soc-btn-green" href="${catLink(c)}" target="_self">▶ Ver en XSTREAM</a>
          <button class="soc-btn" id="ssPvShare">↗ Copiar enlace</button>
          <button class="soc-btn soc-btn-blue" id="ssPvPost">💬 Publicar sobre esto</button>
        </div>
      </div>`, true);
    /* ficha TMDB en vivo (sinopsis) */
    (async () => {
      try {
        const type = c.kind === 'pelicula' ? 'movie' : 'tv';
        const r = await fetch(`https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_KEY}&language=es-ES&query=${encodeURIComponent(c.t)}&page=1`);
        const j = await r.json();
        const top = (j.results || [])[0];
        const st = document.getElementById('ssPvStory');
        if (st) st.textContent = top && top.overview ? top.overview : 'Sin ficha disponible — pero lo tienes completo aquí en XSTREAM.';
      } catch (e) { }
    })();
    $('ssPvShare').addEventListener('click', async () => {
      const u = catLink(c);
      try { await navigator.clipboard.writeText(u); toast('↗ Enlace copiado'); } catch (e) { toast(u); }
    });
    $('ssPvPost').addEventListener('click', () => {
      $('socPostText').value = `Acabo de encontrar «${c.t}» en XSTREAM y tengo que recomendarlo`;
      S.attach = { kind: 'img', url: c.poster };
      renderAttach();
      closeSheet();
      $('socPostText').focus();
      toast('💬 Texto y póster listos — publica cuando quieras');
    });
  }
  function renderSuggested() {
    const box = $('socSuggest');
    box.innerHTML = '';
    const list = S.suggested.filter(u => u.uid && u.uid !== S.me.uid).slice(0, 6);
    if (!list.length) { box.innerHTML = '<div class="soc-empty">Cuando más gente participe, te sugeriremos a quién seguir.</div>'; return; }
    for (const u of list) {
      const following = S.follows.includes(u.uid);
      const d = document.createElement('div');
      d.className = 'soc-suggest-it';
      d.innerHTML = `
        ${avatarHtml(u.name, u.grad)}
        <div class="soc-suggest-b"><b>${esc(u.name)} ${u.online ? '<span class="soc-dot on" style="display:inline-block"></span>' : ''}</b><small>${esc(u.tag || '')}${u.posts ? ' · ' + u.posts + ' publicaciones' : ''}</small></div>
        <button class="soc-btn soc-btn-blue">${following ? 'Siguiendo' : 'Seguir'}</button>`;
      d.querySelector('button').addEventListener('click', async ev => {
        ev.stopPropagation();
        const r = await socCall('follow', { target: u.uid, on: following ? '0' : '1' }, true);
        if (r) toast(following ? 'Dejaste de seguir a ' + u.name : '👥 Ahora sigues a ' + u.name);
        refresh();
      });
      d.addEventListener('click', () => openProfile(u.uid));
      box.appendChild(d);
    }
  }
  function renderLive() {
    const box = $('socLive');
    const lives = S.stories.filter(s => s.live);
    if (!lives.length) {
      box.innerHTML = '<div class="soc-empty">No hay eventos en vivo ahora mismo.<br>Cuando alguien marque su historia como EN VIVO aparecerá aquí con sus espectadores reales.</div>';
      return;
    }
    box.innerHTML = '';
    for (const s of lives) {
      const d = document.createElement('div');
      d.className = 'soc-live-it';
      d.innerHTML = `
        ${s.img ? `<img src="${esc(s.img)}" alt="">` : '<span class="soc-live-ph">🔴</span>'}
        <div class="soc-live-b"><b>${esc(s.text || 'Transmisión de ' + s.name)}</b>
        <small>${esc(s.name)} · ${hms(s.at)}</small><small>👁 ${(s.views || []).length} espectador${(s.views || []).length === 1 ? '' : 'es'} real${(s.views || []).length === 1 ? '' : 'es'}</small></div>
        <span class="soc-live-tag">EN VIVO</span>`;
      d.addEventListener('click', () => openStoryView(s));
      box.appendChild(d);
    }
  }

  /* ═══════════ CHAT ═══════════ */
  function renderChat() {
    const box = $('socConvos');
    const groups = S.groups.map(g => {
      const cid = 'g:' + g.id;
      const c = S.convos.find(x => x.id === cid);
      return c ? { ...c, peerName: g.name, peerOnline: false, group: true } : {
        id: cid, last: 'Grupo oficial — únete y escribe', at: 0, unread: 0,
        peerName: g.name, peerOnline: false, group: true,
      };
    });
    let list = [...S.convos.filter(c => !c.id.startsWith('g:')), ...groups];
    if (S.chatFilter === 'amigos') list = list.filter(c => !c.group);
    if (S.chatFilter === 'grupos') list = list.filter(c => c.group);
    list.sort((a, b) => (b.at || 0) - (a.at || 0));
    box.innerHTML = '';
    if (!list.length) { box.innerHTML = '<div class="soc-empty">Sin conversaciones aún — escríbele a alguien desde su perfil o entra a un grupo.</div>'; return; }
    for (const c of list) {
      const d = document.createElement('div');
      d.className = 'soc-convo';
      d.dataset.cid = c.id;
      d.dataset.cname = c.peerName || '';
      d.innerHTML = `
        ${avatarHtml(c.peerName, c.group ? 1 : 2)}
        <div class="soc-convo-b"><b>${esc(c.peerName)}${c.peerOnline ? ' <span class="soc-dot on" style="display:inline-block"></span>' : ''}</b>
        <small>${esc(c.last || '')}</small></div>
        ${c.unread ? `<b class="soc-red">${c.unread}</b>` : ''}
        ${c.at ? `<span class="soc-convo-time">${hms(c.at)}</span>` : ''}`;
      d.addEventListener('click', () => openConvo(c.id, c.peerName));
      box.appendChild(d);
    }
  }
  document.querySelectorAll('#socChatFilters button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#socChatFilters button').forEach(x => x.classList.toggle('on', x === b));
    S.chatFilter = b.dataset.f;
    renderChat();
  }));

  /* ═══════════ 🚀 SOCIAL DOCK — pestañas que cambian AL INSTANTE ═══════════ */
  function dockTab(t) {
    document.querySelectorAll('.soc-dock-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    document.querySelectorAll('.soc-dock-tab').forEach(s => s.classList.toggle('on', s.dataset.tb === t));
  }
  document.querySelectorAll('.soc-dock-tabs button').forEach(b =>
    b.addEventListener('click', () => dockTab(b.dataset.t)));
  function dockOpen(tab) {
    const dock = $('socDock');
    if (getComputedStyle(dock).display === 'none') dock.classList.add('show');
    if (tab) dockTab(tab);
  }
  /* 💬 mensajes (DMs): el dock es del FORO — la lista de conversaciones
     se abre en un sheet (el chat de 1 a 1 ya vive en sheets)             */
  function openChatPanel() {
    renderChat();
    openSheet(`
      <div class="soc-card-h"><span>💬 Mensajes</span></div>
      <div class="soc-sheet-pad" id="socConvoSheet"></div>`);
    const sheetBody = $('socConvoSheet');
    const clone = $('socConvos');
    if (clone && sheetBody) {
      sheetBody.innerHTML = clone.innerHTML;
      sheetBody.querySelectorAll('.soc-convo').forEach(row => {
        row.addEventListener('click', () => { const id = row.dataset.cid, name = row.dataset.cname; if (id) openConvo(id, name || 'Conversación'); });
      });
    }
  }

  let convoTimer = null;
  const convoEtags = {};   /* cid -> { convo, index } — poll con 304 gratis */
  function pairCid(cid) {
    /* los DM usan la id canónica uidA~uidB (ordenada): viniendo de un
       perfil llega el uid pelado — normalizarlo SIEMPRE              */
    if (!cid.startsWith('g:') && !cid.includes('~')) cid = [S.me.uid, cid].sort().join('~');
    return cid;
  }
  async function openConvo(cid, title) {
    clearInterval(convoTimer);
    cid = pairCid(cid);
    const isGroup = cid.startsWith('g:');
    if (isGroup && !S.follows.includes(cid)) {
      const r = await socCall('follow', { target: cid, on: '1' }, true);
      if (r) toast('⬡ Te uniste al grupo para poder escribir');
      else return;
      await refresh();
    }
    openSheet(`
      <div class="soc-card-h"><span>💬 ${esc(title)}</span></div>
      <div class="soc-msgs" id="ssMsgs"></div>
      <div class="soc-comment-new">
        ${avatarHtml(S.me.name, S.me.grad, 'sm')}
        <input id="ssMsgIn" placeholder="Escribe un mensaje…" maxlength="400">
      </div>`);
    const loadMsgs = async () => {
      if (!document.getElementById('ssMsgs')) { clearInterval(convoTimer); return; }
      if (document.hidden) return;   /* pestaña oculta: ni una petición */
      const r = await socCall('messages', { cid, etags: JSON.stringify(convoEtags[cid] || {}) }, false, null, true);
      if (!r) return;
      if (r.etags) convoEtags[cid] = r.etags;
      if (r.same) return;            /* nada nuevo: el poll fue 304 gratis */
      $('ssMsgs').innerHTML = r.msgs.map(m => `
        <div class="soc-msg ${m.uid === S.me.uid ? 'me' : 'you'}">${esc(m.text)}<small>${esc(m.name)} · ${hms(m.at)}</small></div>`).join('')
        || `<div class="soc-empty">Sin mensajes todavía — rompe el hielo 👋</div>`;
      $('ssMsgs').scrollTop = 1e6;
      if (r.cleared) refreshSoon();  /* el índice cambió: refresca el badge */
    };
    /* el listener se monta ANTES del primer await: el usuario puede
       escribir desde el instante en que la hoja aparece                */
    $('ssMsgIn').addEventListener('keydown', async ev => {
      if (ev.key !== 'Enter' || !$('ssMsgIn').value.trim()) return;
      /* el servidor espera: 'g:<id>' para grupos · el UID del otro para individuales */
      const to = isGroup ? cid : cid.split('~').find(x => x !== S.me.uid);
      const r = await socCall('msg', { to, text: $('ssMsgIn').value.trim() }, true);
      if (r) { $('ssMsgIn').value = ''; convoEtags[cid] = {}; loadMsgs(); refreshSoon(); }
    });
    convoEtags[cid] = convoEtags[cid] || {};
    await loadMsgs();
    clearInterval(convoTimer);
    convoTimer = setInterval(loadMsgs, 6000);
  }

  /* ═══════════ ONLINE ═══════════ */
  function renderOnline() {
    /* el chip «en línea» de la cabecera del dock ya no existe — el conteo
       vive ahora solo en la pestaña Vivo (sin crash si falta el elemento) */
    if ($('socOnlineCount')) $('socOnlineCount').textContent = S.onlineCount;
    const box = $('socOnline');
    box.innerHTML = S.onlineUsers.length
      ? S.onlineUsers.map(u => avatarHtml(u.name, u.grad, 'sm').replace('<span', `<span title="${esc(u.name)}"`)).join('')
      : '<div class="soc-empty">Nadie más conectado ahora — invita a tus amigos 👋</div>';
  }

  /* ═══════════ BÚSQUEDA ═══════════
     Personas: además del feed visible, pregunta al servidor — cubre a
     TODA la comunidad (no solo los 60 posts cargados).                    */
  let searchTimer = null, searchSeq = 0;
  function doSearch() {
    const q = $('socSearch').value.trim().toLowerCase();
    const drop = $('socSearchDrop');
    if (q.length < 2) { drop.classList.add('hidden'); return; }
    drop.classList.remove('hidden');
    const seq = ++searchSeq;
    const catHits = S.catalog.filter(s => (s.t || '').toLowerCase().includes(q)).slice(0, 5)
      .map(s => `<div class="soc-sr" data-cat="${esc(s.id)}"><img src="${esc(s.poster)}"><div><b>${esc(s.t)}</b><small>${esc(s.kind === 'pelicula' ? 'Película' : 'Serie')} · en el catálogo →</small></div></div>`);
    const localPeople = new Map();
    for (const u of S.suggested) localPeople.set(u.uid, u);
    for (const p of S.posts) if (p.uid !== S.me.uid && p.name.toLowerCase().includes(q)) localPeople.set(p.uid, { uid: p.uid, name: p.name, tag: p.tag, grad: p.grad });
    const tagHits = q.startsWith('#')
      ? S.posts.filter(p => String(p.text || '').toLowerCase().includes(q)).slice(0, 4)
        .map(p => `<div class="soc-sr" data-post="${esc(p.id)}"><span class="soc-sr-emoji">💬</span><div><b>${esc((p.text || '').slice(0, 46))}…</b><small>publicación →</small></div></div>`)
      : [];
    const render = pplHits => {
      drop.innerHTML = [...catHits, ...pplHits, ...tagHits].join('') ||
        '<div class="soc-empty">Sin resultados para «' + esc(q) + '» — prueba con otro título o persona.</div>';
      drop.querySelectorAll('[data-cat]').forEach(d => d.addEventListener('click', () => {
        const s = S.catalog.find(x => x.id === d.dataset.cat);
        if (s) window.open(catLink(s), '_self');
      }));
      drop.querySelectorAll('[data-usr]').forEach(d => d.addEventListener('click', () => { drop.classList.add('hidden'); openProfile(d.dataset.usr); }));
      drop.querySelectorAll('[data-post]').forEach(d => d.addEventListener('click', () => {
        drop.classList.add('hidden');
        document.querySelector(`#socFeed [data-pid="${CSS.escape(d.dataset.post)}"]`)?.scrollIntoView({ behavior: 'smooth' });
      }));
    };
    const localHits = [...localPeople.values()].filter(u => (u.name || '').toLowerCase().includes(q) && u.uid !== S.me.uid).slice(0, 4)
      .map(u => `<div class="soc-sr" data-usr="${esc(u.uid)}"><span class="soc-sr-emoji">${avatarHtml(u.name, u.grad, 'sm').slice(30, -7)}</span><div><b>${esc(u.name)}</b><small>${esc(u.tag || '')} · persona →</small></div></div>`);
    render(localHits);
    /* refuerzo del servidor: cubre a toda la comunidad */
    if (!q.startsWith('#')) {
      socCall('search', { q }, false, null, true).then(r => {
        if (!r || !r.users || seq !== searchSeq) return;
        if ($('socSearch').value.trim().toLowerCase() !== q) return;
        const srv = r.users.filter(u => u.uid !== S.me.uid).slice(0, 6)
          .map(u => `<div class="soc-sr" data-usr="${esc(u.uid)}"><span class="soc-sr-emoji">${avatarHtml(u.name, u.grad, 'sm').slice(30, -7)}</span><div><b>${esc(u.name)}</b><small>${esc(u.tag || '')} · persona${u.posts ? ' · ' + u.posts + ' publicaciones' : ''} →</small></div></div>`);
        if (srv.length) render(srv);
      }).catch(() => { });
    }
  }
  $('socSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(doSearch, 250); });
  document.addEventListener('click', ev => {
    if (!ev.target.closest('.soc-search') && !ev.target.closest('#socSearchDrop')) $('socSearchDrop').classList.add('hidden');
    if (!ev.target.closest('#socBell') && !ev.target.closest('#socNotifDrop')) $('socNotifDrop').classList.add('hidden');
    if (!ev.target.closest('#socMe') && !ev.target.closest('#socMeDrop')) $('socMeDrop').classList.add('hidden');
  });
  $('socBell').addEventListener('click', ev => { ev.stopPropagation(); $('socNotifDrop').classList.toggle('hidden'); markNotifsRead(); });
  $('socMsgBtn').addEventListener('click', () => navTo('mensajes'));
  $('socMe').addEventListener('click', ev => { ev.stopPropagation(); $('socMeDrop').classList.toggle('hidden'); });

  /* ═══════════ ☀/🌙 TEMA claro-oscuro (como la página principal) ═══════════ */
  let socTheme = 'dark';
  try { socTheme = localStorage.getItem('soc-theme') || 'dark'; } catch (e) { }
  function applySocTheme(t) {
    document.body.classList.toggle('light', t === 'light');
    const tb = $('socThemeBtn');
    if (tb) { tb.textContent = t === 'light' ? '☀️' : '🌙'; tb.title = t === 'light' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'; }
  }
  $('socThemeBtn')?.addEventListener('click', () => {
    socTheme = socTheme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem('soc-theme', socTheme); } catch (e) { }
    applySocTheme(socTheme);
    toast(socTheme === 'light' ? '☀ Tema claro' : '🌙 Tema oscuro');
  });
  applySocTheme(socTheme);
  async function markNotifsRead() {
    const unread = typeof S.notifsUnread === 'number' ? S.notifsUnread : S.notifs.filter(n => !n.read).length;
    if (!unread) return;
    /* respuesta inmediata: el badge se limpia ya; el servidor lo persiste */
    S.notifsUnread = 0;
    S.notifs.forEach(n => { n.read = true; });
    renderCounters(); renderNotifDrop();
    await socCall('notifsRead', {}, true);
  }

  /* ═══════════ HOJAS (overlays) ═══════════ */
  function openSheet(inner, wide) {
    $('socSheet').classList.toggle('wide', !!wide);
    $('socSheet').innerHTML = `<button class="soc-x" id="ssX">✕</button>` + inner;
    $('socOverlay').classList.remove('hidden');
    $('ssX').addEventListener('click', closeSheet);
  }
  function closeSheet() { clearInterval(convoTimer); $('socOverlay').classList.add('hidden'); $('socSheet').innerHTML = ''; }
  function closeSheets() { closeSheet(); document.querySelectorAll('.soc-dock.show').forEach(e => e.classList.remove('show')); }
  $('socOverlay').addEventListener('click', ev => { if (ev.target.id === 'socOverlay') closeSheet(); });

  function openExplore() {
    openSheet(`
      <div class="soc-card-h"><span>🧭 Explorar</span></div>
      <p style="color:var(--faint);font-size:12px;margin-bottom:10px">Lo mejor del catálogo XSTREAM ahora mismo — clic para verlo en el reproductor.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:9px">
        ${S.catalog.slice(0, 18).map(c => `
          <a href="${catLink(c)}" style="text-align:center">
            <img src="${esc(c.poster)}" loading="lazy" style="width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:9px;border:1px solid var(--line)">
            <small style="display:block;margin-top:4px;font-size:10.5px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.t)}</small>
          </a>`).join('') || '<div class="soc-empty">Cargando catálogo…</div>'}
      </div>`);
  }
  function openFriends() {
    const people = new Map();
    for (const u of S.suggested) people.set(u.uid, u);
    for (const p of S.posts) people.set(p.uid, { uid: p.uid, name: p.name, tag: p.tag, grad: p.grad });
    const mine = S.follows.filter(f => !f.startsWith('g:')).map(f => people.get(f)).filter(Boolean);
    openSheet(`
      <div class="soc-card-h"><span>👥 Amigos</span><small>${mine.length} siguiendo</small></div>
      ${mine.length ? mine.map(u => `
        <div class="soc-suggest-it" style="padding:9px 0">
          ${avatarHtml(u.name, u.grad)}
          <div class="soc-suggest-b"><b>${esc(u.name)}</b><small>${esc(u.tag || '')}</small></div>
          <button class="soc-btn" data-unf="${esc(u.uid)}">Dejar de seguir</button>
        </div>`).join('') : '<div class="soc-empty">Todavía no sigues a nadie — pasa por «Personas que quizás conozcas» y sigue a quien te caiga bien.</div>'}`);
    $('socSheet').querySelectorAll('[data-unf]').forEach(b => b.addEventListener('click', async () => {
      const r = await socCall('follow', { target: b.dataset.unf, on: '0' }, true);
      if (r) { toast('Dejaste de seguirlo'); refresh(); openFriends(); }
    }));
  }
  function openGroups() {
    openSheet(`
      <div class="soc-card-h"><span>⬡ Grupos de la comunidad</span></div>
      ${S.groups.map(g => {
        const joined = S.follows.includes('g:' + g.id);
        return `<div class="soc-suggest-it" style="padding:9px 0">
          <span class="soc-group-av">${esc(g.name[0])}</span>
          <div class="soc-suggest-b"><b>${esc(g.name)}</b><small>${g.members} miembro${g.members === 1 ? '' : 's'} · ${esc(g.desc || '')}</small></div>
          <button class="soc-btn ${joined ? '' : 'soc-btn-green'}" data-g="${esc(g.id)}" data-on="${joined ? '0' : '1'}">${joined ? '✓ Miembro' : 'Unirte'}</button>
        </div>`;
      }).join('')}`);
    $('socSheet').querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', async () => {
      const r = await socCall('follow', { target: 'g:' + b.dataset.g, on: b.dataset.on }, true);
      if (r) { toast(b.dataset.on === '1' ? '⬡ ¡Bienvenido al grupo!' : 'Saliste del grupo'); refresh(); openGroups(); }
    }));
  }
  function openSaved() {
    const saved = S.posts.filter(p => S.saved.includes(p.id));
    openSheet(`
      <div class="soc-card-h"><span>🔖 Guardados</span><small>${saved.length}</small></div>
      <div>${saved.length ? saved.map(p => `
        <div style="padding:10px 0;border-bottom:1px solid var(--line)">
          <b style="font-size:12.5px">${esc(p.name)}</b>
          <p style="font-size:12px;color:var(--dim);margin:4px 0">${esc((p.text || '').slice(0, 120))}…</p>
          <small style="color:var(--faint)">${ago(p.at)}</small>
        </div>`).join('') : '<div class="soc-empty">Nada guardado todavía — usa el 🔖 de cualquier publicación.</div>'}</div>`);
  }
  function openInterests() {
    openSheet(`<div class="soc-card-h"><span>⭐ Mis intereses</span></div>
      <p style="color:var(--faint);font-size:12px;margin-bottom:10px">Se guardan en tu perfil. Tus hashtags y tendencias toman forma con ellos.</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px" id="ssInts"></div>`);
    const box = $('ssInts');
    for (const it of INTERESTS) {
      const b = document.createElement('button');
      b.className = 'soc-int' + (S.interests.includes(it) ? ' on' : '');
      b.textContent = it;
      b.addEventListener('click', async () => {
        const i = S.interests.indexOf(it);
        if (i >= 0) S.interests.splice(i, 1); else S.interests.push(it);
        b.classList.toggle('on');
        await socCall('profile', { bio: S.bio, interests: JSON.stringify(S.interests) }, true);
        toast(i >= 0 ? 'Interés retirado' : '⭐ Interés guardado');
        renderInterests();
      });
      box.appendChild(b);
    }
  }
  async function openProfile(uid) {
    const mine = uid === S.me.uid;
    const known = new Map();
    for (const u of S.suggested) known.set(u.uid, u);
    for (const p of S.posts) known.set(p.uid, { uid: p.uid, name: p.name, tag: p.tag, grad: p.grad });
    const u = mine
      ? { uid, name: S.me.name, tag: S.me.tag, grad: S.me.grad, bio: S.bio, posts: S.posts.filter(p => p.uid === uid).length, followers: 0 }
      : { ...(known.get(uid) || { uid, name: 'Usuario', tag: '', grad: 0 }), posts: S.posts.filter(p => p.uid === uid).length };
    const posts = S.posts.filter(p => p.uid === uid).slice(0, 8);
    openSheet(`
      <div style="display:flex;gap:14px;align-items:center;margin-bottom:12px">
        ${avatarHtml(u.name, u.grad, 'lg')}
        <div>
          <b style="font-size:15px">${esc(u.name)}</b>
          <div style="color:var(--faint);font-size:11.5px">${esc(u.tag || '')} · ${u.posts || 0} publicación${u.posts === 1 ? '' : 'es'}${u.online ? ' · 🟢 en línea' : ''}</div>
          ${u.bio ? `<p style="font-size:12px;color:var(--dim);margin-top:4px">${esc(u.bio)}</p>` : ''}
        </div>
      </div>
      ${mine ? `<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <button class="soc-btn" id="ssBio">✎ Editar bio</button>
        <button class="soc-btn" id="ssSec">🔐 Seguridad y respaldo</button>
        ${isLocalAdmin() ? '<button class="soc-btn" id="ssMods">🛡 Panel de moderación</button>' : ''}
        <a class="soc-btn" href="../">🎬 Mi catálogo</a>
      </div>` : `<div style="margin-bottom:12px">
        <button class="soc-btn soc-btn-blue" data-follow="${esc(uid)}">${S.follows.includes(uid) ? 'Siguiendo ✓' : 'Seguir'}</button>
        <button class="soc-btn" data-msg="${esc(uid)}">💬 Mensaje</button>
      </div>`}
      <div class="soc-card-h"><span>Publicaciones</span></div>
      ${posts.length ? posts.map(p => `
        <div style="padding:9px 0;border-bottom:1px solid var(--line)">
          <p style="font-size:12.5px;line-height:1.5">${withTags(p.text || '')}</p>
          <small style="color:var(--faint)">${ago(p.at)} · ❤️ ${p.likes.length} · 💬 ${(p.comments || []).length}</small>
        </div>`).join('') : '<div class="soc-empty">Sin publicaciones todavía.</div>'}`);
    if (mine) {
      $('ssBio').addEventListener('click', async () => {
        const bio = prompt('Tu bio (máx. 200 caracteres):', S.bio || '');
        if (bio === null) return;
        S.bio = bio.slice(0, 200);
        const r = await socCall('profile', { bio: S.bio, interests: JSON.stringify(S.interests) }, true);
        if (r) { toast('✅ Perfil actualizado'); openProfile(uid); }
      });
      $('ssSec')?.addEventListener('click', () => openSecurity());
      $('ssMods')?.addEventListener('click', () => openAdminReports());
    } else {
      $('socSheet').querySelector('[data-follow]')?.addEventListener('click', async ev => {
        const on = !S.follows.includes(uid) ? '1' : '0';
        const r = await socCall('follow', { target: uid, on }, true);
        if (r) { toast(on === '1' ? '👥 Ahora lo sigues' : 'Dejaste de seguirlo'); refresh(); openProfile(uid); }
      });
      $('socSheet').querySelector('[data-msg]')?.addEventListener('click', () => openConvo(uid, u.name));
    }
  }

  /* ═══════════ 🚩 REPORTE · 🛡 MODERACIÓN · 🔐 SEGURIDAD ═══════════ */
  const isLocalAdmin = () => !!(window.XAUTH && typeof XAUTH.isAdmin === 'function' && XAUTH.isAdmin());

  function openReportSheet(pid) {
    const REASONS = ['Spam o publicidad engañosa', 'Contenido ofensivo o abusivo', 'Suplantación de identidad', 'Spoilers sin aviso', 'Otro motivo'];
    openSheet(`
      <div class="soc-card-h"><span>🚩 Reportar contenido</span></div>
      <p style="color:var(--faint);font-size:12px;line-height:1.6;margin-bottom:10px">
        Cuéntanos qué pasa con esta publicación. Solo tú y el equipo ven tu reporte; el autor no se entera de quién reportó.</p>
      <div id="ssRsn">
        ${REASONS.map((r, i) => `<label class="soc-report-opt"><input type="radio" name="ssRep" value="${esc(r)}"${i === 0 ? ' checked' : ''}> ${esc(r)}</label>`).join('')}
      </div>
      <div style="margin-top:14px"><button class="soc-btn soc-btn-green" id="ssRepGo">Enviar reporte</button></div>`);
    $('ssRepGo').addEventListener('click', async () => {
      const sel = $('ssRsn').querySelector('input:checked');
      const r = await socCall('report', { postId: pid, reason: sel ? sel.value : 'Otro motivo' }, true);
      if (r) { toast('🚩 Reporte enviado — el equipo lo revisará'); closeSheet(); }
    });
  }

  async function openAdminReports() {
    const hdr = await adminSigHeader();
    if (!hdr) { toast('⚠ Este dispositivo no tiene la clave de administrador', true); return; }
    const r = await socCall('adminState', {}, false, hdr);
    if (!r) return;
    const items = r.reports || [];
    openSheet(`
      <div class="soc-card-h"><span>🛡 Panel de moderación</span><small>${items.length} reporte${items.length === 1 ? '' : 's'}</small></div>
      ${items.length ? items.map(rp => `
        <div class="soc-report-item">
          <div class="soc-report-t">
            <b>${esc(rp.name || 'Anónimo')}</b> <small>· ${ago(rp.at)}</small>
            <p><span class="soc-report-why">${esc(rp.reason)}</span>${rp.postBy ? ' — publicación de ' + esc(rp.postBy) : ''}<br>«${esc(rp.snippet || '')}»</p>
          </div>
          <div class="soc-report-acts">
            <button class="soc-btn" data-rd="${esc(rp.id)}">✓ Descartar</button>
            <button class="soc-btn soc-btn-green" data-rdel="${esc(rp.postId)}">🗑 Borrar publicación</button>
          </div>
        </div>`).join('') : '<div class="soc-empty">Sin reportes pendientes — la comunidad está tranquila.</div>'}
      <p style="color:var(--faint);font-size:11px;margin-top:10px">Cada acción viaja firmada con la clave que publica el catálogo: nadie más puede moderar.</p>`);
    const sheet = $('socSheet');
    sheet.querySelectorAll('[data-rd]').forEach(b => b.addEventListener('click', async () => {
      const h = await adminSigHeader();
      const rr = await socCall('dismissReport', { reportId: b.dataset.rd }, true, h);
      if (rr) { toast('✓ Reporte descartado'); openAdminReports(); }
    }));
    sheet.querySelectorAll('[data-rdel]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('¿Borrar esta publicación reportada? La acción es definitiva.')) return;
      const h = await adminSigHeader();
      const rr = await socCall('delPost', { postId: b.dataset.rdel }, true, h);
      if (rr) {
        S.posts = S.posts.filter(x => x.id !== b.dataset.rdel);
        S.seenTomb.add(b.dataset.rdel);
        syncFeed();
        toast('🗑 Publicación borrada');
        openAdminReports();
      }
    }));
  }

  function openSecurity() {
    openSheet(`
      <div class="soc-card-h"><span>🔐 Seguridad y respaldo</span></div>
      <p style="color:var(--faint);font-size:12px;line-height:1.6;margin-bottom:12px">
        Tu cuenta vive en este dispositivo: identidad + clave de firma ECDSA. Si borras los datos del
        navegador o cambias de equipo, sin respaldo la cuenta queda bloqueada para siempre. Exporta un
        respaldo <b>cifrado con tu frase</b> y guárdalo donde guardas lo importante.</p>
      <b style="font-size:12px">📤 Exportar respaldo cifrado</b>
      <div class="soc-sec-row">
        <input id="ssSecPass1" type="password" placeholder="Frase secreta (mín. 6 caracteres)" autocomplete="new-password">
        <button class="soc-btn soc-btn-green" id="ssSecExp">Crear respaldo</button>
      </div>
      <textarea id="ssSecBlob" rows="4" spellcheck="false" placeholder="Aquí aparece tu respaldo cifrado — cópialo y guárdalo. Para restaurar en otro dispositivo, pégalo aquí abajo con su frase." style="width:100%;margin-top:9px;background:var(--card);border:1px solid var(--line);border-radius:10px;color:var(--ink);padding:10px;font:11.5px/1.5 ui-monospace,monospace;outline:none;word-break:break-all"></textarea>
      <div style="margin-top:8px"><button class="soc-btn" id="ssSecCopy">⧉ Copiar respaldo</button></div>
      <hr style="border:none;border-top:1px solid var(--line);margin:14px 0">
      <b style="font-size:12px">📥 Restaurar en este dispositivo</b>
      <p style="color:var(--faint);font-size:11.5px;margin:4px 0 8px">Pega el respaldo Y su frase. Reemplaza la cuenta actual de este dispositivo por la del respaldo.</p>
      <div class="soc-sec-row">
        <input id="ssSecPass2" type="password" placeholder="Frase secreta del respaldo" autocomplete="off">
        <button class="soc-btn" id="ssSecImp">Restaurar cuenta</button>
      </div>
      <hr style="border:none;border-top:1px solid var(--line);margin:14px 0">
      <b style="font-size:12px">🔁 Rotar clave de firma</b>
      <p style="color:var(--faint);font-size:11.5px;margin:4px 0 8px">¿Crees que alguien pudo ver tu clave? Genera una nueva firmada con la vieja: la comunidad verifica al instante y la vieja queda revocada.</p>
      <div class="soc-sec-row">
        <input id="ssSecPass3" type="password" placeholder="Confirma con tu frase de respaldo actual" autocomplete="off">
        <button class="soc-btn" id="ssSecRot">Rotar clave</button>
      </div>`);
    $('ssSecExp').addEventListener('click', async () => {
      const pass = $('ssSecPass1').value;
      if (!pass || pass.length < 6) { toast('⚠ La frase necesita al menos 6 caracteres', true); return; }
      const blob = await XAUTH.exportIdentityEncrypted(pass);
      if (!blob) { toast('⚠ No se pudo crear el respaldo', true); return; }
      $('ssSecBlob').value = blob;
      toast('🔐 Respaldo creado — cópialo en un lugar seguro');
    });
    $('ssSecCopy').addEventListener('click', async () => {
      const v = $('ssSecBlob').value.trim();
      if (!v) { toast('⚠ Primero crea el respaldo', true); return; }
      try { await navigator.clipboard.writeText(v); toast('⧉ Respaldo copiado — guárdalo donde guardes lo importante'); }
      catch (e) { toast('Copia manual: selecciona el texto del cuadro', true); }
    });
    $('ssSecImp').addEventListener('click', async () => {
      const blob = $('ssSecBlob').value.trim();
      const pass = $('ssSecPass2').value;
      if (!blob.startsWith('XBAK1.') || !pass) { toast('⚠ Pega el respaldo completo y su frase', true); return; }
      if (!confirm('Restaurar reemplaza la cuenta ACTUAL de este dispositivo por la del respaldo. ¿Continuar?')) return;
      const res = await XAUTH.importIdentityEncrypted(pass, blob);
      if (res && res.ok) {
        toast('🗝 Cuenta restaurada: ' + res.name + ' — recargando…');
        setTimeout(() => location.reload(), 900);
      } else {
        toast('⚠ ' + (res && res.msg ? res.msg : 'No se pudo restaurar'), true);
      }
    });
    $('ssSecRot').addEventListener('click', async () => {
      if (!confirm('Rotar la clave: se genera una nueva firmada con la vieja. El respaldo que tengas de la vieja dejará de servir — exporta uno nuevo después. ¿Continuar?')) return;
      try {
        const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
        const jwkPriv = await crypto.subtle.exportKey('jwk', pair.privateKey);
        const jwkPub = await crypto.subtle.exportKey('jwk', pair.publicKey);
        const pubB64 = b64FromBytes(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)));
        const r = await socCall('rotate', { newPubKey: pubB64 }, true);
        if (!r) return;
        const ok = await XAUTH.installSigningKeys(jwkPriv, jwkPub);
        if (ok) {
          S.myPubKey = pubB64;
          toast('🔁 Clave rotada — este dispositivo ya firma con la nueva');
          $('ssSecPass3').value = '';
        } else toast('⚠ El servidor aceptó la clave nueva pero falló instalarla localmente — reintenta', true);
      } catch (e) { toast('⚠ No se pudo rotar la clave', true); }
    });
  }

  /* ═══════════ CICLO DE VIDA ═══════════
     · refresh usa ETags: «same» = cero payload, cero re-render
     · fusiona por archivo: solo re-renderiza lo que de verdad cambió
     · el latido viaja PEGADO al state (beat=1) cada ~2 min — nada de
       reescribir presence.json por su cuenta
     · pestaña oculta: ni refresco ni latidos (offline honrado)     */
  let refreshT = null, stateTimer = null, refreshing = false;
  const refreshSoon = () => { clearTimeout(refreshT); refreshT = setTimeout(refresh, 600); };
  async function refresh() {
    if (!S.ready || refreshing) return;
    refreshing = true;
    try {
      const params = { etags: JSON.stringify(S.etags) };
      if (Date.now() - (S.lastBeatAt || 0) > 120000) params.beat = '1';
      const j = await socCall('state', params, true, null, true);
      if (!j) return;
      if (j.beatAt) S.lastBeatAt = j.beatAt;
      if (j.same) return;                       /* nada cambió en ningún archivo */
      if (j.etags) S.etags = j.etags;
      if (!j.postsSame) {
        S.posts = j.posts || []; S.stories = j.stories || []; S.groups = j.groups || [];
        S.suggested = j.suggested || []; S.follows = j.follows || []; S.saved = j.saved || [];
        if (j.me) { S.bio = j.me.bio || ''; S.interests = j.me.interests || []; }
        if (Array.isArray(j.tomb)) for (const t of j.tomb) S.seenTomb.add(t.id);
        renderMe(); renderInterests(); renderStories(); syncFeed();
        renderTrends(); renderGroups(); renderFeatured(); renderSuggested(); renderLive();
      }
      if (!j.presenceSame) {
        S.notifs = j.notifs || []; S.notifsUnread = j.notifsUnread || 0;
        S.onlineCount = j.onlineCount || 0; S.onlineUsers = j.onlineUsers || [];
        renderNotifDrop(); renderOnline();
      }
      if (!j.indexSame) S.convos = j.convos || [];
      renderCounters(); renderChat();
      /* #p-<id> en la URL → resalta esa publicación */
      const pid = (location.hash.match(/^#p-(.+)$/) || [])[1];
      if (pid) { const el = document.querySelector(`[data-pid="${CSS.escape(pid)}"]`); if (el) el.scrollIntoView({ behavior: 'smooth' }); }
    } finally { refreshing = false; }
  }
  /* ═══════════ 🧵 FORO XSTREAM — hilos por nicho, con rango y sincronizado ═══════════
     Nichos: general · películas · series · anime · hentai · doramas · drama.
     Los sub-foros nacen del CATÁLOGO REAL (las series más fuertes por caps).
     Rangos sincronizados: 👑 admin del sitio = admin · 🛡 moderadores
     nombrados por el admin · 👤 usuarios — el rango viaja en cada hilo.  */
  const FORO_CATS = [
    ['general', '💬', 'General'], ['peliculas', '🎬', 'Películas'], ['series', '📺', 'Series'],
    ['anime', '🌸', 'Anime'], ['hentai', '🔞', 'Hentai'], ['doramas', '🎭', 'Doramas'], ['drama', '🎞', 'Drama'],
  ];
  const F = { cat: 'general', sub: '', etag: '', threads: [], mods: [], timer: null, loaded: false };

  function foroMyRole() {
    if (isLocalAdmin()) return 'admin';
    if (S.me && F.mods.includes(S.me.uid)) return 'mod';
    return 'user';
  }
  const foroBadge = role => role === 'admin' ? '<b class="foro-badge b-admin" title="Administrador">👑</b>'
    : role === 'mod' ? '<b class="foro-badge b-mod" title="Moderador">🛡</b>'
      : '<b class="foro-badge b-user" title="Usuario">👤</b>';

  function foroWhen(ts) {
    const d = Date.now() - (ts || 0);
    if (d < 60e3) return 'ahora';
    if (d < 36e5) return 'hace ' + Math.floor(d / 60e3) + ' min';
    if (d < 864e5) return 'hace ' + Math.floor(d / 36e5) + ' h';
    if (d < 30 * 864e5) return 'hace ' + Math.floor(d / 864e5) + ' d';
    return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  }

  /* enlaces vivos en el cuerpo: b.yapido.click/ver/abren en la app, el resto _blank */
  function foroLinkify(text) {
    return esc(text).replace(/(https?:\/\/[^\s<]+)/g, u => {
      const mine = /yapido\.click/.test(u);
      return `<a href="${u}" ${mine ? '' : 'target="_blank" rel="noopener"'} class="foro-lnk">🔗 ${u.length > 42 ? u.slice(0, 42) + '…' : u}</a>`;
    }).replace(/\n/g, '<br>');
  }

  function foroMedia(m) {
    if (!m) return '';
    if (/\.(mp4|webm|m3u8|mov)(\?|#|$)/i.test(m)) return `<video src="${esc(m)}" controls playsinline class="foro-media"></video>`;
    if (/\.(png|jpe?g|gif|webp|avif)(\?|#|$)/i.test(m)) return `<img src="${esc(m)}" loading="lazy" class="foro-media" alt="">`;
    return `<a class="foro-linkcard" href="${esc(m)}" ${/yapido\.click/.test(m) ? '' : 'target="_blank" rel="noopener"'}>🔗 ${esc(m.slice(0, 64))}</a>`;
  }

  /* las series más fuertes del nicho (catálogo real, sincronizado) */
  function foroSubsPool() {
    const pool = (S.catalog || []).filter(c => c.poster && (c.episodes || []).length);
    let list = [];
    if (F.cat === 'peliculas') list = pool.filter(c => c.kind === 'pelicula' && !c.hentai);
    else if (F.cat === 'series') list = pool.filter(c => c.kind === 'serie' && !c.hentai);
    else if (F.cat === 'anime') list = pool.filter(c => c.kind === 'serie' && !c.hentai).slice(1);
    else if (F.cat === 'hentai') list = pool.filter(c => c.hentai);
    else if (F.cat === 'doramas') list = pool.filter(c => /dorama/i.test(c.t));
    else if (F.cat === 'drama') list = pool.filter(c => /drama/i.test(c.t));
    return list.slice().sort((a, b) => (b.episodes || []).length - (a.episodes || []).length).slice(0, 10);
  }
  const foroSubName = sub => {
    const c = (S.catalog || []).find(x => slugify(x.t) === sub);
    return c ? c.t : sub;
  };

  async function foroWrite(op, params) {
    let extra = null;
    if (isLocalAdmin()) { try { extra = await adminSigHeader(); } catch (e) { } }
    return socCall(op, params, true, extra);
  }

  async function foroFetch(force) {
    const j = await socCall('forum', (F.etag && !force) ? { etag: F.etag } : {}, false, null, true);
    if (j && j.same) return true;
    if (j && j.ok) {
      F.etag = j.etag || '';
      F.threads = j.threads || [];
      F.mods = j.mods || [];
      F.loaded = true;
      foroRender();
      return true;
    }
    return false;
  }

  function foroRender() {
    const cats = $('foroCats'), subs = $('foroSubs'), list = $('foroList');
    if (!cats || !list) return;
    /* nichos */
    cats.innerHTML = FORO_CATS.map(([id, ic, nm]) =>
      `<button class="foro-cat${F.cat === id ? ' on' : ''}" data-c="${id}"><span>${ic}</span>${nm}</button>`).join('');
    cats.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { F.cat = b.dataset.c; F.sub = ''; foroRender(); }));
    /* sub-foros del catálogo real */
    const pool = foroSubsPool();
    subs.innerHTML = `<button class="foro-sub${F.sub ? '' : ' on'}" data-s="">🌐 Todo el nicho</button>`
      + pool.map(c => `<button class="foro-sub${F.sub === slugify(c.t) ? ' on' : ''}" data-s="${esc(slugify(c.t))}" title="${esc(c.t)}">
          <img src="${esc(c.poster)}" loading="lazy" alt=""><i>${esc(c.t.slice(0, 17))}${c.t.length > 17 ? '…' : ''}</i><small>${(c.episodes || []).length} caps</small>
        </button>`).join('');
    subs.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { F.sub = b.dataset.s; foroRender(); }));
    /* hilos del nicho (+sub si hay), fijados primero */
    let threads = F.threads.filter(t => t.cat === F.cat);
    if (F.sub) threads = threads.filter(t => t.sub === F.sub);
    threads = threads.slice().sort((a, b) => ((b.pin ? 1 : 0) - (a.pin ? 1 : 0)) || (b.at - a.at));
    if (!threads.length) {
      list.innerHTML = `<div class="foro-empty">${F.loaded
        ? `🚀 Nadie ha abierto un tema aquí${F.sub ? ' sobre <b>' + esc(foroSubName(F.sub)) + '</b>' : ''} — estrena el nicho con <b>+ Tema</b>`
        : '⏳ Cargando el foro…'}</div>`;
      return;
    }
    list.innerHTML = threads.map(t => `
      <button class="foro-th" data-tid="${esc(t.id)}">
        <div class="foro-th-t">${t.pin ? '<span class="foro-pin">📌</span>' : ''}${t.lock ? '<span class="foro-pin">🔒</span>' : ''}${esc(t.title)}</div>
        ${t.sub ? `<div class="foro-th-sub">↳ ${esc(foroSubName(t.sub))}</div>` : ''}
        ${t.body ? `<div class="foro-th-prev">${esc(t.body.slice(0, 110))}${t.body.length > 110 ? '…' : ''}</div>` : ''}
        <div class="foro-th-meta">
          ${foroBadge(t.role)}<b>${esc(t.name)}</b>
          <span class="foro-dot">·</span><span>${foroWhen(t.at)}</span>
          <span class="foro-th-stats">💬 ${(t.replies || []).length} · ❤ ${(t.likes || []).length}</span>
        </div>
      </button>`).join('');
    list.querySelectorAll('.foro-th').forEach(b => b.addEventListener('click', () => {
      const t = F.threads.find(x => x.id === b.dataset.tid);
      if (t) foroOpenThread(t);
    }));
  }

  /* 🧵 abrir un hilo: ficha completa con respuestas, likes y acciones de staff */
  function foroOpenThread(t) {
    const me = S.me ? S.me.uid : '';
    const staff = foroMyRole() !== 'user';
    const mine = t.by === me;
    const liked = (t.likes || []).includes(me);
    openSheet(`
      <div class="foro-detail">
        <div class="foro-detail-head">
          <span class="foro-detail-cat">${(() => { const c = FORO_CATS.find(x => x[0] === t.cat); return c ? c[1] + ' ' + c[2] : t.cat; })()}</span>
          ${t.pin ? '<span class="foro-flag">📌 FIJADO</span>' : ''}${t.lock ? '<span class="foro-flag lock">🔒 CERRADO</span>' : ''}
        </div>
        <h3 class="foro-detail-title">${esc(t.title)}</h3>
        ${t.sub ? `<div class="foro-th-sub" style="margin-bottom:6px">↳ ${esc(foroSubName(t.sub))} · <a href="${catLink((S.catalog || []).find(c => slugify(c.t) === t.sub) || { kind: 'serie', t: t.sub })}" class="foro-lnk">ver en XSTREAM →</a></div>` : ''}
        <div class="foro-op-meta">${foroBadge(t.role)}<b>${esc(t.name)}</b><span class="foro-dot">·</span><span>${foroWhen(t.at)}</span></div>
        ${t.body ? `<div class="foro-body">${foroLinkify(t.body)}</div>` : ''}
        ${foroMedia(t.media)}
        <div class="foro-actions">
          <button class="foro-act-btn${liked ? ' on' : ''}" id="fLikeBtn">❤ ${(t.likes || []).length}</button>
          ${(staff || mine) ? `<button class="foro-act-btn warn" id="fDelBtn">🗑 Borrar</button>` : ''}
          ${staff ? `<button class="foro-act-btn" id="fPinBtn">${t.pin ? 'Quitar 📌' : 'Fijar 📌'}</button>
                    <button class="foro-act-btn" id="fLockBtn">${t.lock ? 'Reabrir 🔓' : 'Cerrar 🔒'}</button>` : ''}
        </div>
        <div class="foro-replies-h">💬 ${(t.replies || []).length} ${(t.replies || []).length === 1 ? 'respuesta' : 'respuestas'}</div>
        <div class="foro-replies" id="fReplies">${(t.replies || []).map(r => `
          <div class="foro-reply${r.by === me ? ' mine' : ''}" data-rid="${esc(r.id)}">
            <div class="foro-op-meta">${foroBadge(r.role)}<b>${esc(r.name)}</b><span class="foro-dot">·</span><span>${foroWhen(r.at)}</span>
              ${(staff || r.by === me) ? `<button class="foro-reply-del" data-delrid="${esc(r.id)}" title="Borrar respuesta">✕</button>` : ''}
            </div>
            ${r.body ? `<div class="foro-body">${foroLinkify(r.body)}</div>` : ''}
            ${foroMedia(r.media)}
            <button class="foro-act-btn small${(r.likes || []).includes(me) ? ' on' : ''}" data-rlid="${esc(r.id)}">❤ ${(r.likes || []).length}</button>
          </div>`).join('') || '<div class="foro-empty small">Sé el primero en responder ✍️</div>'}</div>
        ${t.lock && !staff
        ? '<div class="foro-locknote">🔒 Este hilo está cerrado — solo el equipo puede responder.</div>'
        : `<div class="foro-compose">
             <textarea id="fReplyText" rows="3" placeholder="${t.lock ? 'Responder (hilo cerrado — solo equipo)' : 'Escribe tu respuesta…'} (enlaces e imágenes con URL)" maxlength="2000"></textarea>
             <input type="url" id="fReplyMedia" placeholder="https:// imagen o vídeo (opcional)" maxlength="600">
             <button class="soc-btn soc-btn-green" id="fReplyBtn">Responder</button>
           </div>`}
      </div>`, true);

    const refreshThread = async () => {
      const okF = await foroFetch(true);
      const fresh = okF ? F.threads.find(x => x.id === t.id) : null;
      if (fresh) foroOpenThread(fresh);
      else closeSheet();
    };
    const q = id => document.getElementById(id);
    if (q('fLikeBtn')) q('fLikeBtn').addEventListener('click', async () => {
      await foroWrite('fLike', { tid: t.id }); refreshThread();
    });
    if (q('fDelBtn')) q('fDelBtn').addEventListener('click', async () => {
      if (!confirm('¿Borrar este hilo?')) return;
      const j = await foroWrite('fDel', { tid: t.id });
      if (j) { toast('🗑 Hilo borrado'); closeSheet(); foroFetch(true); }
    });
    if (q('fPinBtn')) q('fPinBtn').addEventListener('click', async () => {
      await foroWrite('fPin', { tid: t.id, on: t.pin ? '0' : '1' }); refreshThread();
    });
    if (q('fLockBtn')) q('fLockBtn').addEventListener('click', async () => {
      await foroWrite('fLock', { tid: t.id, on: t.lock ? '0' : '1' }); refreshThread();
    });
    if (q('fReplyBtn')) q('fReplyBtn').addEventListener('click', async () => {
      const body = q('fReplyText').value.trim();
      const media = q('fReplyMedia').value.trim();
      if (!body && !media) { toast('Respuesta vacía', true); return; }
      q('fReplyBtn').disabled = true;
      const j = await foroWrite('fReply', { tid: t.id, body, media });
      if (j) { toast('💬 Respondido'); refreshThread(); }
      else if (q('fReplyBtn')) q('fReplyBtn').disabled = false;
    });
    document.querySelectorAll('#fReplies [data-rlid]').forEach(b => b.addEventListener('click', async ev => {
      ev.stopPropagation();
      await foroWrite('fLike', { tid: t.id, rid: b.dataset.rlid }); refreshThread();
    }));
    document.querySelectorAll('#fReplies [data-delrid]').forEach(b => b.addEventListener('click', async ev => {
      ev.stopPropagation();
      if (!confirm('¿Borrar esta respuesta?')) return;
      const j = await foroWrite('fDel', { tid: t.id, rid: b.dataset.delrid });
      if (j) { toast('🗑 Respuesta borrada'); refreshThread(); }
    }));
  }

  /* ➕ crear un tema: nicho + serie del catálogo (opcional) + título + cuerpo + medio */
  function foroNewSheet() {
    const pool = (S.catalog || []).filter(c => c.poster && (c.episodes || []).length)
      .slice().sort((a, b) => (b.episodes || []).length - (a.episodes || []).length).slice(0, 14);
    openSheet(`
      <div class="foro-new">
        <div class="soc-card-h"><span>➕ Nuevo tema</span></div>
        <div class="foro-cats" id="fnCats">${FORO_CATS.map(([id, ic, nm]) =>
          `<button class="foro-cat${F.cat === id ? ' on' : ''}" data-c="${id}"><span>${ic}</span>${nm}</button>`).join('')}</div>
        <div class="foro-new-label">🏷 ¿De qué serie? (opcional — del catálogo real)</div>
        <div class="foro-subs" id="fnSubs">
          <button class="foro-sub on" data-s="">Sin serie</button>
          ${pool.map(c => `<button class="foro-sub" data-s="${esc(slugify(c.t))}" data-name="${esc(c.t)}" title="${esc(c.t)}">
            <img src="${esc(c.poster)}" loading="lazy" alt=""><i>${esc(c.t.slice(0, 17))}${c.t.length > 17 ? '…' : ''}</i></button>`).join('')}
        </div>
        <input type="text" id="fnTitle" placeholder="Título del tema (mínimo 3 letras)" maxlength="120">
        <textarea id="fnBody" rows="5" placeholder="Cuéntalo: opinión, pregunta, guía… los enlaces se vuelven clicables" maxlength="4000"></textarea>
        <input type="url" id="fnMedia" placeholder="https:// imagen o vídeo para acompañar (opcional)" maxlength="600">
        <button class="soc-btn soc-btn-green foro-new-btn" id="fnGo">🚀 Publicar tema</button>
      </div>`, true);
    let pickCat = F.cat, pickSub = '';
    document.querySelectorAll('#fnCats .foro-cat').forEach(b => b.addEventListener('click', () => {
      pickCat = b.dataset.c;
      document.querySelectorAll('#fnCats .foro-cat').forEach(x => x.classList.toggle('on', x === b));
    }));
    document.querySelectorAll('#fnSubs .foro-sub').forEach(b => b.addEventListener('click', () => {
      pickSub = b.dataset.s || '';
      document.querySelectorAll('#fnSubs .foro-sub').forEach(x => x.classList.toggle('on', x === b));
      if (b.dataset.name) {
        const inp = document.getElementById('fnTitle');
        if (!inp.value.trim()) inp.value = b.dataset.name + ' — ';
        inp.focus();
      }
    }));
    document.getElementById('fnGo').addEventListener('click', async () => {
      const title = document.getElementById('fnTitle').value.trim();
      const body = document.getElementById('fnBody').value.trim();
      const media = document.getElementById('fnMedia').value.trim();
      if (title.length < 3) { toast('El título es muy corto', true); return; }
      if (!body && !media) { toast('El tema está vacío — escribe algo o añade un enlace', true); return; }
      const btn = document.getElementById('fnGo');
      btn.disabled = true;
      const j = await foroWrite('fNew', { cat: pickCat, sub: pickSub, title, body, media });
      btn.disabled = false;
      if (j && j.thread) {
        toast('🚀 Tema publicado');
        closeSheet();
        F.cat = pickCat; F.sub = pickSub;
        await foroFetch(true);
        foroRender();
        if (j.thread.id) foroOpenThread(j.thread);
      }
    });
  }
  if ($('foroNew')) $('foroNew').addEventListener('click', foroNewSheet);

  function foroInit() {
    foroRender();
    foroFetch(true);
    clearInterval(F.timer);
    F.timer = setInterval(() => { if (!document.hidden) foroFetch(); }, 45000);
  }

  function startTimers(now) {
    clearInterval(stateTimer);
    stateTimer = setInterval(() => { if (!document.hidden) refresh(); }, 45000);
    if (now) refresh();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearInterval(stateTimer);   /* oculto: silencio total */
    else startTimers(true);                           /* visible: recupera al vuelo */
  });

  async function boot() {
    /* esperar la identidad del dispositivo (auth.js) */
    let tries = 0;
    while (!(window.XAUTH && XAUTH.ready) && tries++ < 40) await new Promise(r => setTimeout(r, 250));
    if (!(window.XAUTH && XAUTH.ready && XAUTH.id)) {
      document.body.innerHTML = '<div style="display:grid;place-items:center;height:100vh;color:#A8B8CD;font-family:Inter,sans-serif">No se pudo iniciar la identidad — recarga la página.</div>';
      return;
    }
    S.me = XAUTH.id;
    S.ready = true;
    /* 🔗 enlaces al sitio principal que funcionan en web Y en local:
       en file:// apuntan a ../index.html (si no, el navegador enseña el
       listado de la carpeta en vez de abrir la app)                        */
    document.querySelectorAll('[data-main]').forEach(a => { a.href = mainLink(a.dataset.main || ''); });
    document.querySelectorAll('.soc-topnav a.on').forEach(a => { if (location.protocol === 'file:') a.href = './'; });
    /* mi clave pública para el TOFU del servidor (imprescindible firmar) */
    if (typeof XAUTH.pubKeyB64 === 'function') S.myPubKey = (await XAUTH.pubKeyB64()) || '';
    /* primera carga: state firmado CON latido → registra la cuenta y marca en línea */
    await refresh();
    startTimers(false);
    loadCatalog().then(() => {
      _welcomeCache = null;        /* los posts de bienvenida usan pósters reales */
      renderFeatured(); renderTrends(); syncFeed();
      foroInit();                  /* 🧵 el foro arranca con el catálogo (sub-foros reales) */
    }).catch(() => { });
    document.title = 'XSTREAM SOCIAL — La comunidad audiovisual';
  }
  boot();
})();
