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
    me: null, catalog: [], posts: [], stories: [], groups: [],
    suggested: [], follows: [], saved: [], convos: [], notifs: [],
    onlineCount: 0, onlineUsers: [], interests: [], bio: '',
    chatFilter: 'todos', attach: null, pollDraft: null,
  };

  /* ── API con firma de dispositivo ── */
  async function socCall(op, params = {}, sign = false) {
    try {
      const q = new URLSearchParams({ op, uid: S.me.uid, name: S.me.name, tag: S.me.tag, grad: S.me.grad, flag: S.me.flag || '', ...params });
      const headers = {};
      if (sign) {
        const hora = Math.floor(Date.now() / 3600000);
        const sig = await XAUTH.signText(`social-${S.me.uid}:${hora}`);
        if (sig) headers['x-social-sig'] = sig;
      }
      const r = await fetch(`${SOCIAL_API}?${q}`, { headers });
      const j = await r.json();
      if (!j.ok && j.error) { toast('⚠ ' + j.error, true); return null; }
      return j;
    } catch (e) { return null; }
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
  const catLink = s => `../#/${s.kind === 'pelicula' ? 'pelicula' : 'anime'}/${encodeURIComponent(slugify(s.t))}${s.kind === 'pelicula' ? '' : '/1'}`;
  const hotCatalog = () => S.catalog.filter(s => s.kind !== 'pelicula' || s.genre).slice(0, 30);

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
      <a href="../">🎬 Ir a XSTREAM</a>`;
    $('socMeDrop').querySelectorAll('[data-me]').forEach(b => b.addEventListener('click', () => {
      $('socMeDrop').classList.add('hidden');
      if (b.dataset.me === 'perfil') openProfile(S.me.uid);
      if (b.dataset.me === 'guardados') openSaved();
      if (b.dataset.me === 'intereses') openInterests();
    }));
  }
  function renderCounters() {
    const unreadNotifs = S.notifs.filter(n => !n.read).length;
    const unreadMsgs = S.convos.reduce((a, c) => a + (c.unread || 0), 0);
    const set = (el, n) => { const b = $(el); b.hidden = !n; b.textContent = n > 99 ? '99+' : n; };
    set('socBellCount', unreadNotifs); set('socMsgCount', unreadMsgs);
    set('socSideNotif', unreadNotifs); set('socSideMsg', unreadMsgs);
    set('socMobNotif', unreadNotifs); set('socMobMsg', unreadMsgs);
  }
  function renderNotifDrop() {
    const d = $('socNotifDrop');
    d.innerHTML = `<div class="soc-drop-h">Notificaciones</div>` + (S.notifs.length
      ? S.notifs.slice(0, 25).map(n => `
        <div class="soc-nrow">
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
      <small style="display:block;color:var(--faint);margin-top:10px">${ago(s.at)} · desaparece a las 24 h</small>`);
  }

  /* ═══════════ PUBLICAR ═══════════ */
  function renderAttach() {
    const box = $('socAttach');
    const a = S.attach;
    if (!a) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    if (a.kind === 'img') box.innerHTML = `<img src="${esc(a.url)}" alt=""><span>Imagen adjunta</span><button class="soc-x" id="ssAttX">✕</button>`;
    if (a.kind === 'link') box.innerHTML = `<span>🔗</span><span style="word-break:break-all">${esc(a.url)}</span><button class="soc-x" id="ssAttX">✕</button>`;
    if (a.kind === 'poll') box.innerHTML = `<span>📊</span><span>Encuesta: ${a.options.length} opciones</span><button class="soc-x" id="ssAttX">✕</button>`;
    $('ssAttX').addEventListener('click', () => { S.attach = null; renderAttach(); });
  }
  document.querySelectorAll('.soc-tool').forEach(t => t.addEventListener('click', async () => {
    const k = t.dataset.tool;
    if (k === 'foto' || k === 'gif') {
      openSheet(`
        <div class="soc-card-h"><span>${k === 'gif' ? '🎞 Añadir GIF o imagen' : '📷 Añadir foto o vídeo'}</span></div>
        <input id="ssIm" placeholder="Pega la URL de la imagen (https://…)" style="width:100%;background:var(--card);border:1px solid var(--line);border-radius:10px;color:var(--ink);padding:9px;outline:none">
        ${S.catalog.length ? `<p style="color:var(--faint);font-size:11px;margin:10px 0 6px">…o elige un póster real de tu catálogo:</p>
        <div style="max-height:240px;overflow-y:auto;display:flex;gap:8px;flex-wrap:wrap" id="ssPickC">
          ${S.catalog.slice(0, 24).map(c => `<img data-p="${esc(c.poster)}" src="${esc(c.poster)}" style="width:52px;height:74px;object-fit:cover;border-radius:8px;cursor:pointer;border:1px solid var(--line)">`).join('')}
        </div>` : ''}
        <div style="margin-top:13px"><button class="soc-btn soc-btn-green" id="ssImGo">Adjuntar</button></div>`);
      $('ssPickC')?.querySelectorAll('img').forEach(i => i.addEventListener('click', () => { $('ssIm').value = i.dataset.p; }));
      $('ssImGo').addEventListener('click', () => {
        const u = $('ssIm').value.trim();
        if (!/^https?:\/\//.test(u)) { toast('⚠ Pega una URL válida (https://…)', true); return; }
        S.attach = { kind: 'img', url: u };
        closeSheet(); renderAttach();
      });
    }
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
      link: S.attach && S.attach.kind === 'link' ? S.attach.url : '',
      poll: S.attach && S.attach.kind === 'poll' ? JSON.stringify(S.attach.options) : '',
    };
    const r = await socCall('post', p, true);
    if (r) {
      $('socPostText').value = '';
      S.attach = null; renderAttach();
      toast('✅ Publicado en la comunidad');
      refresh();
    }
  });

  /* ═══════════ FEED ═══════════ */
  const withTags = t => esc(t).replace(/(^|\s)(#[\wáéíóúñÁÉÍÓÚÑ]+)/g, (m, a, b) => `${a}<span class="tag">${b}</span>`);
  function postCard(p) {
    const d = document.createElement('article');
    d.className = 'soc-card soc-post';
    d.dataset.pid = p.id;   /* ancla para #p-<id> (enlaces de compartir) */
    const liked = p.likes.includes(S.me.uid);
    const saved = S.saved.includes(p.id);
    const comments = p.comments || [];
    d.innerHTML = `
      <div class="soc-post-h">
        ${avatarHtml(p.name, p.grad, 'lg')}
        <div class="soc-post-user">
          <b>${esc(p.name)} ${p.official || p.uid === 'x-stream-social-team' ? '<span class="soc-verified" title="Equipo XSTREAM">✔</span>' : ''}</b>
          <small>${esc(p.tag || '')} · ${ago(p.at)}${p.official || p.uid === 'x-stream-social-team' ? ' · <span style="color:var(--blue)">EQUIPO XSTREAM</span>' : ''}</small>
        </div>
        <div class="soc-post-time">${hms(p.at)}</div>
      <button class="soc-post-menu" title="Opciones">⋯</button>
      </div>
      ${p.text ? `<p class="soc-post-text">${withTags(p.text)}</p>` : ''}
      ${p.img ? `<div class="soc-post-img"><img src="${esc(p.img)}" loading="lazy" alt=""></div>` : ''}
      ${p.link ? `<a class="soc-post-link" href="${esc(p.link)}" target="_blank" rel="noopener">🔗 ${esc(p.link)}</a>` : ''}
      ${p.poll ? pollHtml(p) : ''}
      <div class="soc-post-acts">
        <button class="soc-act lk ${liked ? 'on' : ''}" title="Me gusta">❤️ ${p.likes.length}</button>
        <button class="soc-act cm" title="Comentarios">💬 ${comments.length}</button>
        <button class="soc-act sh" title="Compartir (copia el enlace)">↗ Compartir${p.shares ? ' · ' + p.shares : ''}</button>
        <button class="soc-act sv save ${saved ? 'on' : ''}" title="Guardar">🔖 ${saved ? 'Guardado' : 'Guardar'}</button>
      </div>
      <div class="soc-comments hidden">
        ${comments.map(c => `
          <div class="soc-comment">
            ${avatarHtml(c.name, 0, 'sm')}
            <div class="soc-comment-b"><b>${esc(c.name)}</b><p>${esc(c.text)}</p><small>${ago(c.at)}</small></div>
          </div>`).join('')}
        <div class="soc-comment-new">
          ${avatarHtml(S.me.name, S.me.grad, 'sm')}
          <input placeholder="Escribe un comentario…" maxlength="400">
        </div>
      </div>`;
    const lk = d.querySelector('.lk');
    lk.addEventListener('click', async () => {
      lk.classList.toggle('on');
      const r = await socCall('like', { postId: p.id, on: lk.classList.contains('on') ? '1' : '0' }, true);
      if (r) { p.likes = r.mine ? [...p.likes] : p.likes; lk.textContent = '❤️ ' + r.likes; }
      refreshSoon();
    });
    d.querySelector('.cm').addEventListener('click', () => d.querySelector('.soc-comments').classList.toggle('hidden'));
    const cIn = d.querySelector('.soc-comment-new input');
    cIn.addEventListener('keydown', async ev => {
      if (ev.key !== 'Enter' || !cIn.value.trim()) return;
      const r = await socCall('comment', { postId: p.id, text: cIn.value.trim() }, true);
      if (r) { toast('💬 Comentario publicado'); refresh(); }
    });
    d.querySelector('.sh').addEventListener('click', async () => {
      const url = location.origin + location.pathname + '#p-' + p.id;
      try { await navigator.clipboard.writeText(url); toast('↗ Enlace de la publicación copiado'); } catch (e) { toast(url); }
      await socCall('share', { postId: p.id });
      refreshSoon();
    });
    const sv = d.querySelector('.sv');
    sv.addEventListener('click', async () => {
      const on = !sv.classList.contains('on');
      sv.classList.toggle('on', on);
      sv.textContent = on ? '🔖 Guardado' : '🔖 Guardar';
      const r = await socCall('save', { postId: p.id, on: on ? '1' : '0' }, true);
      if (r) { S.saved = r.saved || S.saved; toast(on ? '🔖 Guardado' : 'Quitado de guardados'); }
    });
    d.querySelector('.soc-post-menu').addEventListener('click', () => toast('Opciones: usar Guardar o Compartir · abre el perfil tocando el avatar'));
    if (p.poll) wirePoll(d, p);
    return d;
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
  function wirePoll(d, p) {
    d.querySelectorAll('.soc-poll-opt').forEach(b => b.addEventListener('click', async () => {
      const r = await socCall('vote', { postId: p.id, option: b.dataset.i }, true);
      if (r) { toast('📊 Voto registrado'); refresh(); }
    }));
  }

  /* posts de bienvenida del EQUIPO — datos de ejemplo claramente identificados */
  function welcomePosts() {
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
    return out;
  }

  function renderFeed() {
    const box = $('socFeed');
    box.innerHTML = '';
    const posts = [...S.posts, ...(S.posts.length ? [] : welcomePosts())];
    if (!posts.length) {
      $('socFeedEmpty').classList.remove('hidden');
      $('socFeedEmpty').innerHTML = 'Aún no hay publicaciones — sé el primero en escribirle a la comunidad ✍️';
      return;
    }
    $('socFeedEmpty').classList.add('hidden');
    for (const p of posts) box.appendChild(postCard(p));
  }

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
  function renderFeatured() {
    const picks = [
      catFind('solo leveling', 'soraleveling'),
      catFind('dune'),
      catFind('the last of us', 'last of us'),
    ].filter(Boolean);
    const fill = hotCatalog().filter(c => !picks.includes(c)).slice(0, 3 - picks.length);
    const list = [...picks, ...fill].slice(0, 3);
    $('socFeat').innerHTML = list.length ? list.map((c, i) => `
      <a class="soc-feat-it" href="${catLink(c)}">
        <img src="${esc(c.poster)}" loading="lazy" alt="${esc(c.t)}">
        ${c.kind !== 'pelicula' ? '<span class="soc-feat-badge">EN EMISIÓN</span>' : ''}
        <span class="soc-feat-t">${esc(c.t.slice(0, 30))}<small>${esc(c.kind === 'pelicula' ? 'Película' : 'Serie · ' + (c.episodes || []).length + ' caps')}</small></span>
      </a>`).join('') : '<div class="soc-empty">El catálogo se está cargando…</div>';
    $('socFeatNav').innerHTML = list.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('');
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
      box.innerHTML = '<div class="soc-empty">No hay eventos en vivo ahora mismo.<br>Cuando alguien marque su historia como EN VIVO aparecerá aquí con los espectadores reales conectados.</div>';
      return;
    }
    box.innerHTML = '';
    for (const s of lives) {
      const d = document.createElement('div');
      d.className = 'soc-live-it';
      d.innerHTML = `
        ${s.img ? `<img src="${esc(s.img)}" alt="">` : '<span class="soc-live-ph">🔴</span>'}
        <div class="soc-live-b"><b>${esc(s.text || 'Transmisión de ' + s.name)}</b>
        <small>${esc(s.name)} · ${hms(s.at)}</small><small>👁 ${S.onlineCount} conectado${S.onlineCount === 1 ? '' : 's'} ahora</small></div>
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
  function openChatPanel() {
    const chat = $('socChatPanel');
    if (getComputedStyle(chat).display === 'none') chat.classList.add('show');
    chat.scrollIntoView({ behavior: 'smooth' });
  }

  let convoTimer = null;
  async function openConvo(cid, title) {
    clearInterval(convoTimer);
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
      const r = await socCall('messages', { cid });
      if (!r) return;
      $('ssMsgs').innerHTML = r.msgs.map(m => `
        <div class="soc-msg ${m.uid === S.me.uid ? 'me' : 'you'}">${esc(m.text)}<small>${esc(m.name)} · ${hms(m.at)}</small></div>`).join('')
        || `<div class="soc-empty">Sin mensajes todavía — rompe el hielo 👋</div>`;
      $('ssMsgs').scrollTop = 1e6;
    };
    await loadMsgs();
    convoTimer = setInterval(loadMsgs, 6000);
    $('ssMsgIn').addEventListener('keydown', async ev => {
      if (ev.key !== 'Enter' || !$('ssMsgIn').value.trim()) return;
      /* el servidor espera: 'g:<id>' para grupos · el UID del otro para individuales */
      const to = isGroup ? cid : cid.split('~').find(x => x !== S.me.uid);
      const r = await socCall('msg', { to, text: $('ssMsgIn').value.trim() }, true);
      if (r) { $('ssMsgIn').value = ''; loadMsgs(); refreshSoon(); }
    });
  }

  /* ═══════════ ONLINE ═══════════ */
  function renderOnline() {
    $('socOnlineCount').textContent = S.onlineCount;
    const box = $('socOnline');
    box.innerHTML = S.onlineUsers.length
      ? S.onlineUsers.map(u => avatarHtml(u.name, u.grad, 'sm').replace('<span', `<span title="${esc(u.name)}"`)).join('')
      : '<div class="soc-empty">Nadie más conectado ahora — invita a tus amigos 👋</div>';
  }

  /* ═══════════ BÚSQUEDA ═══════════ */
  let searchTimer = null;
  function doSearch() {
    const q = $('socSearch').value.trim().toLowerCase();
    const drop = $('socSearchDrop');
    if (q.length < 2) { drop.classList.add('hidden'); return; }
    drop.classList.remove('hidden');
    const catHits = S.catalog.filter(s => (s.t || '').toLowerCase().includes(q)).slice(0, 5)
      .map(s => `<div class="soc-sr" data-cat="${esc(s.id)}"><img src="${esc(s.poster)}"><div><b>${esc(s.t)}</b><small>${esc(s.kind === 'pelicula' ? 'Película' : 'Serie')} · en el catálogo →</small></div></div>`);
    const people = new Map();
    for (const u of S.suggested) people.set(u.uid, u);
    for (const p of S.posts) if (p.uid !== S.me.uid && p.name.toLowerCase().includes(q)) people.set(p.uid, { uid: p.uid, name: p.name, tag: p.tag, grad: p.grad });
    const pplHits = [...people.values()].filter(u => u.name.toLowerCase().includes(q)).slice(0, 4)
      .map(u => `<div class="soc-sr" data-usr="${esc(u.uid)}"><span class="soc-sr-emoji">${avatarHtml(u.name, u.grad, 'sm').slice(30, -7)}</span><div><b>${esc(u.name)}</b><small>${esc(u.tag || '')} · persona →</small></div></div>`);
    const tagHits = q.startsWith('#')
      ? S.posts.filter(p => ('#' + String(p.text).match(/#[\wáéíóúñ]+/g)?.join(' #') || '').toLowerCase().includes(q)).slice(0, 4)
        .map(p => `<div class="soc-sr" data-post="${esc(p.id)}"><span class="soc-sr-emoji">💬</span><div><b>${esc((p.text || '').slice(0, 46))}…</b><small>publicación →</small></div></div>`)
      : [];
    drop.innerHTML = [...catHits, ...pplHits, ...tagHits].join('') ||
      '<div class="soc-empty">Sin resultados para «' + esc(q) + '» — prueba con otro título o persona.</div>';
    drop.querySelectorAll('[data-cat]').forEach(d => d.addEventListener('click', () => {
      const s = S.catalog.find(x => x.id === d.dataset.cat);
      if (s) window.open(catLink(s), '_self');
    }));
    drop.querySelectorAll('[data-usr]').forEach(d => d.addEventListener('click', () => { drop.classList.add('hidden'); openProfile(d.dataset.usr); }));
    drop.querySelectorAll('[data-post]').forEach(d => d.addEventListener('click', () => {
      drop.classList.add('hidden');
      document.querySelector(`#socFeed [data-id="${d.dataset.post}"]`)?.scrollIntoView({ behavior: 'smooth' });
    }));
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
  async function markNotifsRead() {
    if (S.notifs.some(n => !n.read)) { await socCall('notifsRead', {}, true); refreshSoon(); }
  }

  /* ═══════════ HOJAS (overlays) ═══════════ */
  function openSheet(inner) { $('socSheet').innerHTML = `<button class="soc-x" id="ssX">✕</button>` + inner; $('socOverlay').classList.remove('hidden'); $('ssX').addEventListener('click', closeSheet); }
  function closeSheet() { clearInterval(convoTimer); $('socOverlay').classList.add('hidden'); $('socSheet').innerHTML = ''; }
  function closeSheets() { closeSheet(); document.querySelectorAll('.soc-col-right.show,.soc-chat.show').forEach(e => e.classList.remove('show')); }
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
      ${mine ? `<div style="display:flex;gap:8px;margin-bottom:12px">
        <button class="soc-btn" id="ssBio">✎ Editar bio</button>
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
    } else {
      $('socSheet').querySelector('[data-follow]')?.addEventListener('click', async ev => {
        const on = !S.follows.includes(uid) ? '1' : '0';
        const r = await socCall('follow', { target: uid, on }, true);
        if (r) { toast(on === '1' ? '👥 Ahora lo sigues' : 'Dejaste de seguirlo'); refresh(); openProfile(uid); }
      });
      $('socSheet').querySelector('[data-msg]')?.addEventListener('click', () => openConvo(uid, u.name));
    }
  }

  /* ═══════════ CICLO DE VIDA ═══════════ */
  let refreshT = null;
  const refreshSoon = () => { clearTimeout(refreshT); refreshT = setTimeout(refresh, 600); };
  async function refresh() {
    const j = await socCall('state');
    if (!j) return;
    S.posts = j.posts || []; S.stories = j.stories || []; S.groups = j.groups || [];
    S.suggested = j.suggested || []; S.follows = j.follows || []; S.saved = j.saved || [];
    S.convos = j.convos || []; S.notifs = j.notifs || [];
    S.onlineCount = j.onlineCount || 0; S.onlineUsers = j.onlineUsers || [];
    if (j.me) { S.bio = j.me.bio || ''; S.interests = j.me.interests || []; }
    renderMe(); renderCounters(); renderNotifDrop();
    renderInterests(); renderStories(); renderFeed();
    renderTrends(); renderGroups(); renderFeatured(); renderSuggested(); renderLive();
    renderChat(); renderOnline();
    /* #p-<id> en la URL → resalta esa publicación */
    const pid = (location.hash.match(/^#p-(.+)$/) || [])[1];
    if (pid) { const el = document.querySelector(`[data-pid="${pid}"]`); if (el) el.scrollIntoView({ behavior: 'smooth' }); }
  }

  async function boot() {
    /* esperar la identidad del dispositivo (auth.js) */
    let tries = 0;
    while (!(window.XAUTH && XAUTH.ready) && tries++ < 40) await new Promise(r => setTimeout(r, 250));
    if (!(window.XAUTH && XAUTH.ready && XAUTH.id)) {
      document.body.innerHTML = '<div style="display:grid;place-items:center;height:100vh;color:#A8B8CD;font-family:Inter,sans-serif">No se pudo iniciar la identidad — recarga la página.</div>';
      return;
    }
    S.me = XAUTH.id;
    /* bio/intereses ya guardados */
    const j = await socCall('state');
    if (j) {
      S.posts = j.posts || []; S.stories = j.stories || []; S.groups = j.groups || [];
      S.suggested = j.suggested || []; S.follows = j.follows || []; S.saved = j.saved || [];
      S.convos = j.convos || []; S.notifs = j.notifs || [];
      S.onlineCount = j.onlineCount || 0; S.onlineUsers = j.onlineUsers || [];
      if (j.me) { S.bio = j.me.bio || ''; S.interests = j.me.interests || []; }
    }
    renderMe(); renderCounters(); renderNotifDrop(); renderInterests();
    renderStories(); renderFeed(); renderTrends(); renderGroups();
    renderSuggested(); renderLive(); renderChat(); renderOnline();
    /* latido de presencia + refresco de estado */
    socCall('beat').catch(() => { });
    setInterval(() => socCall('beat').catch(() => { }), 60000);
    setInterval(refresh, 45000);
    await loadCatalog();
    renderFeatured(); renderTrends(); renderFeed();
    document.title = 'XSTREAM SOCIAL — La comunidad audiovisual';
  }
  boot();
})();
