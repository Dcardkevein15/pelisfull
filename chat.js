/* ═══════════════════════════════════════════════════════════
   💬 X·STREAM CHAT — cliente (todo propio: API /api/chat en Vercel
   + repo GitHub como almacén; cero Firebase, cero terceros)
   ───────────────────────────────────────────────────────────
   · Salas con cupo (el admin decide cuántos; se auto-crea otra al llenarse)
   · Mensajes públicos y privados (1 a 1) con TTL ajustable
   · Enlaces con tarjeta (título/desc/imagen, resuelto en el servidor)
   · ❤ en mensajes con enlace → favoritos persistentes (sobreviven al TTL)
   · Presencia online/offline, roles 👑/🛡/👤, DM al tocar un usuario
   · Al entrar a la web con un DM sin leer → se abre directo esa conversación
   ═══════════════════════════════════════════════════════════ */
'use strict';
(function () {
  /* el buzón ya usa z.yapido.click para las APIs serverless del ecosistema */
  const API = 'https://z.yapido.click/api/chat';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const timeHM = ts => new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

  /* ── estado local del chat ── */
  const S = {
    ready: false,            /* identidad lista */
    open: false,             /* la pestaña Chat visible */
    room: localStorage.getItem('xchat-room') || '',
    lastMsgId: '0',          /* cursor incremental sala */
    lastDmId: '0',           /* cursor incremental DMs */
    presence: [],
    meta: null,
    myFavs: new Set(),
    view: 'room',            /* 'room' | 'dm' */
    peer: null,              /* uid del DM abierto */
    peerName: '',
    msgsById: new Map(),     /* para saber cuáles llevan enlace y qué tienen */
    dmThreads: [],           /* bandeja */
    unreadDm: 0,
    polling: null,
    beating: null,
    openTried: false,
  };

  /* ── identidad y rol del sistema actual (auth.js) ── */
  function me() {
    const X = window.XAUTH;
    if (!X || !X.ready) return null;
    return {
      uid: X.id && X.id.uid,
      name: X.id && X.id.name,
      tag: X.id && X.id.tag,
      role: X.isAdmin() ? 'admin' : (X.isMod && X.isMod() ? 'mod' : 'user'),
      admin: X.isAdmin(),
      mod: !!(X.isMod && X.isMod()),
    };
  }

  /* llamada al servidor */
  async function api(params, method = 'GET', body = null) {
    const m = me();
    const headers = { 'Content-Type': 'application/json' };
    if (m && m.admin && window.XAUTH && XAUTH.vaultGet) {
      const k = XAUTH.vaultGet('propKey');
      if (k) headers['x-chat-key'] = k; /* misma clave maestra del buzón */
    }
    const r = await fetch(API + params, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!j || j.ok === false) throw new Error((j && j.error) || ('HTTP ' + r.status));
    return j;
  }

  /* ═══════ PESTAÑAS Contenido / Chat ═══════ */
  function switchTab(which) {
    const isChat = which === 'chat';
    $('ptabContent').classList.toggle('on', !isChat);
    $('ptabChat').classList.toggle('on', isChat);
    $('panelContent').classList.toggle('hidden', isChat);
    $('panelChat').classList.toggle('hidden', !isChat);
    S.open = isChat;
    if (isChat) {
      ensureRoom().then(() => beat());
      renderMsgs();          /* pintar inmediato aunque el poll ya vendrá */
      if (S.view === 'dm') markDmRead();
    }
  }
  $('ptabContent').addEventListener('click', () => switchTab('content'));
  $('ptabChat').addEventListener('click', () => switchTab('chat'));

  /* ═══════ RENDER: mensajes ═══════ */
  const escUrl = u => { try { const uu = new URL(u); return uu.protocol === 'http:' || uu.protocol === 'https:' ? uu.href : null; } catch (e) { return null; } };
  function linkify(text) {
    const urls = [];
    const html = esc(text).replace(/(https?:\/\/[^\s<>"']+)/g, m => { urls.push(m); return `<a class="chat-link" href="${esc(m)}" target="_blank" rel="noopener">${esc(m.length > 46 ? m.slice(0, 43) + '…' : m)}</a>`; });
    return { html, urls };
  }

  function msgEl(m) {
    const mine = me() && m.uid === me().uid;
    const div = document.createElement('div');
    div.className = 'chat-msg' + (mine ? ' mine' : '');
    div.dataset.id = m.id;
    const roleBdg = m.role === 'admin' ? '<span class="chat-role admin">👑 admin</span>'
      : m.role === 'mod' ? '<span class="chat-role mod">🛡 mod</span>' : '';
    const { html, urls } = linkify(m.text);
    const favBtn = urls.length
      ? `<button class="chat-fav ${S.myFavs.has(m.id) ? 'on' : ''}" data-fav="${m.id}" title="${S.myFavs.has(m.id) ? 'Quitar de favoritos' : 'Guardar enlace en favoritos (no se borra con el TTL)'}">${S.myFavs.has(m.id) ? '❤' : '🤍'}</button>`
      : '';
    div.innerHTML = `
      <div class="chat-head">
        <button class="chat-who" data-uid="${esc(m.uid)}" data-name="${esc(m.name)}">${esc(m.name)}</button>
        ${roleBdg}
        <span class="chat-time">${timeHM(m.ts)}</span>
        ${favBtn}
      </div>
      <div class="chat-body">${html}</div>
      ${urls.length ? `<div class="chat-prev" data-unfurl="${esc(urls[0])}"></div>` : ''}`;
    /* abrir DM desde el nombre */
    div.querySelector('.chat-who').addEventListener('click', () => openDm(m.uid, m.name));
    return div;
  }

  /* tarjetas de enlace (unfurl asíncrono, una por URL) */
  const unfurlCache = new Map();
  async function fillPreviews(container) {
    const nodes = container.querySelectorAll('.chat-prev[data-unfurl]:not([data-done])');
    for (const n of nodes) {
      n.dataset.done = '1';
      const url = n.dataset.unfurl;
      try {
        if (!unfurlCache.has(url)) unfurlCache.set(url, await api('?op=unfurl&url=' + encodeURIComponent(url)));
      } catch (e) { unfurlCache.set(url, { ok: true }); }
      const u = unfurlCache.get(url);
      if (!u || !u.title) { n.remove(); continue; }
      n.innerHTML = `
        <a class="chat-card" href="${esc(u.url)}" target="_blank" rel="noopener">
          ${u.img ? `<img src="${esc(u.img)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
          <span class="cc-t">${esc(u.title)}</span>
          ${u.desc ? `<span class="cc-d">${esc(u.desc)}</span>` : ''}
          <span class="cc-h">${esc((() => { try { return new URL(u.url).hostname; } catch (e) { return ''; } })())}</span>
        </a>`;
    }
  }

  function renderMsgs() {
    const box = $('chatMsgs');
    if (!box) return;
    const abajo = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.innerHTML = '';
    const u = me();
    if (S.view === 'room') {
      const roomMsgs = [...S.msgsById.values()].filter(m => m.room === S.room);
      if (!roomMsgs.length) {
        box.innerHTML = `<div class="chat-empty">Aún no hay mensajes en esta sala — di hola 👋</div>`;
      } else {
        for (const m of roomMsgs) box.appendChild(msgEl(m));
      }
    } else {
      const th = [...S.msgsById.values()].filter(m => m.from === S.peer && m.to === (u && u.uid) || m.from === (u && u.uid) && m.to === S.peer);
      if (!th.length) box.innerHTML = `<div class="chat-empty">Conversación con <b>${esc(S.peerName)}</b> — escríbele algo (solo lo ven ustedes dos).</div>`;
      else for (const m of th) {
        /* adaptamos el DM al molde del mensaje: uid remitente = m.from */
        const node = msgEl({ id: m.id, uid: m.from, name: m.from === (u && u.uid) ? 'Tú' : (m.name || S.peerName), role: m.role, text: m.text, ts: m.ts });
        box.appendChild(node);
      }
    }
    fillPreviews(box);
    if (abajo) box.scrollTop = box.scrollHeight;
  }

  /* ═══════ RENDER: lista de usuarios (presencia) ═══════ */
  function renderPresence() {
    const wrap = $('chatUsers');
    const count = $('chatOnline');
    if (!wrap || !count) return;
    const mine = me() && me().uid;
    count.textContent = '● ' + S.presence.length;
    wrap.innerHTML = '';
    /* admin ve a TODOS (aunque estén offline): el servidor no los lista de
       todos modos — registramos localmente quienes vimos para mostrar "offline" */
    const offlineSeen = JSON.parse(localStorage.getItem('xchat-known') || '[]');
    for (const p of S.presence) {
      if (p.name && !offlineSeen.find(o => o.uid === p.uid)) offlineSeen.push({ uid: p.uid, name: p.name, role: p.role });
    }
    localStorage.setItem('xchat-known', JSON.stringify(offlineSeen.slice(-400)));
    const mk = (p, on) => {
      const li = document.createElement('button');
      li.className = 'chat-user' + (on ? '' : ' off');
      li.innerHTML = `<i>${on ? '●' : '○'}</i><span>${esc(p.name)}</span>${p.role === 'admin' ? '<b>👑</b>' : p.role === 'mod' ? '<b>🛡</b>' : ''}`;
      li.title = (on ? 'En línea' : 'Fuera de línea') + ' — toca para mensaje privado';
      li.addEventListener('click', () => { if (p.uid !== mine) openDm(p.uid, p.name); });
      return li;
    };
    for (const p of S.presence) wrap.appendChild(mk(p, true));
    /* offline: solo si eres staff (el admin quiere verlos siempre) */
    if (me() && (me().admin || me().mod)) {
      for (const o of offlineSeen) {
        if (!S.presence.find(p => p.uid === o.uid)) wrap.appendChild(mk(o, false));
      }
    }
  }

  /* ═══════ POLLING sala + presencia + DMs ═══════ */
  async function poll() {
    if (!S.ready) return;
    try {
      const j = await api(`?op=state&after=${S.lastMsgId}&room=${encodeURIComponent(S.room)}&me=${encodeURIComponent(me().uid)}`);
      if (j.msgs && j.msgs.length) {
        for (const m of j.msgs) S.msgsById.set(m.id, m);
        S.lastMsgId = j.last;
        renderMsgs();
      }
      if (j.dms) {
        let nuevos = 0;
        for (const m of j.dms) {
          if (!S.msgsById.has(m.id) && m.to === me().uid) nuevos++;
          S.msgsById.set(m.id, m);
        }
        if (j.lastDm) S.lastDmId = j.lastDm;
        if (nuevos) onNewDm(nuevos);
        if (S.view === 'dm') renderMsgs();
      }
      S.presence = j.presence || [];
      S.meta = j.meta || S.meta;
      S.myFavs = new Set(j.myFavs || []);
      renderPresence();
      renderRooms();
      renderBadge();
      applyChatBg();
    } catch (e) { /* silencio: reintenta en la próxima vuelta */ }
  }

  /* re-pinta los ids de favoritos sin recargar */
  function refreshFavButtons() {
    document.querySelectorAll('.chat-fav').forEach(b => {
      const on = S.myFavs.has(b.dataset.fav);
      b.classList.toggle('on', on);
      b.textContent = on ? '❤' : '🤍';
    });
  }

  /* ═══════ SALAS ═══════ */
  function renderRooms() {
    const sel = $('chatRoomSel');
    if (!sel || !S.meta || !S.meta.rooms) return;
    const prev = sel.value;
    sel.innerHTML = '';
    for (const r of S.meta.rooms) {
      const n = S.presence.filter(p => p.room === r.id).length;
      const full = S.meta.maxUsers && n >= S.meta.maxUsers ? ' (llena)' : '';
      const o = document.createElement('option');
      o.value = r.id; o.textContent = `${r.name} · ${n}${full}`;
      sel.appendChild(o);
    }
    if (S.room && [...sel.options].some(o => o.value === S.room)) sel.value = S.room;
    else if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
    else S.room = sel.value;
  }

  async function ensureRoom() {
    if (S.room) return;
    S.room = 'general';
  }

  $('chatRoomSel').addEventListener('change', () => {
    S.room = $('chatRoomSel').value;
    localStorage.setItem('xchat-room', S.room);
    switchToRoom();
  });

  async function switchToRoom() {
    S.view = 'room';
    $('chatInbox').classList.add('hidden');
    renderMsgs();
    await beat(); /* avisa al servidor en qué sala estoy */
    await poll();
  }

  /* ═══════ PRESENCIA (heartbeat) ═══════ */
  async function beat() {
    if (!S.ready) return;
    try {
      const m = me();
      const j = await api('', 'POST', { op: 'beat', uid: m.uid, name: displayName(), role: m.role, room: S.room });
      if (j.room && j.room !== S.room) {
        S.room = j.room;
        localStorage.setItem('xchat-room', S.room);
        renderRooms();
        renderMsgs();
      }
      if (j.meta) { S.meta = j.meta; renderRooms(); }
    } catch (e) { }
  }

  function displayName() {
    const custom = localStorage.getItem('xchat-nick');
    if (custom) return custom;
    const m = me();
    return m ? (m.name + (m.tag ? ' ' + m.tag : '')) : 'Anónimo';
  }

  /* ═══════ ENVIAR ═══════ */
  async function sendNow() {
    const inp = $('chatInput');
    const text = (inp.value || '').trim();
    if (!text) return;
    const m = me();
    if (!m) return;
    inp.value = '';
    try {
      if (S.view === 'dm' && S.peer) {
        await api('', 'POST', { op: 'dm', to: S.peer, uid: m.uid, name: displayName(), role: m.role, text });
      } else {
        await api('', 'POST', { op: 'sent', room: S.room, uid: m.uid, name: displayName(), role: m.role, text });
      }
      await poll();
    } catch (e) {
      inp.value = text; /* no perder lo escrito */
      toastLite('⚠ No se pudo enviar: ' + (e.message || e));
    }
  }
  $('chatSend').addEventListener('click', sendNow);
  $('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendNow(); });

  /* ═══════ FAVORITOS (❤ en mensajes con enlace) ═══════ */
  document.addEventListener('click', async ev => {
    const b = ev.target.closest('.chat-fav');
    if (!b) return;
    const id = b.dataset.fav;
    const on = !S.myFavs.has(id);
    try {
      await api('', 'POST', { op: on ? 'fav' : 'unfav', uid: me().uid, msgId: id });
      on ? S.myFavs.add(id) : S.myFavs.delete(id);
      b.classList.toggle('on', on);
      b.textContent = on ? '❤' : '🤍';
      toastLite(on ? '❤ Guardado en tus favoritos (no se borra aunque el chat se limpie)' : 'Quitado de favoritos');
    } catch (e) { toastLite('⚠ No se pudo guardar'); }
  });

  /* vista de la bandeja de favoritos del usuario (en el inbox) */
  function renderFavs(j) {
    const box = $('chatInbox');
    box.innerHTML = '<div class="chat-inbox-head">❤ Tus enlaces favoritos <span class="chat-x" id="chatInboxClose">✕</span></div>';
    if (!j.favs || !j.favs.length) {
      box.innerHTML += '<div class="chat-empty">Aún no has guardado enlaces. Toca 🤍 en uno del chat para conservarlo aunque el chat se limpie.</div>';
    }
    for (const f of (j.favs || []).slice().reverse()) {
      const d = document.createElement('div');
      d.className = 'chat-inbox-item';
      d.innerHTML = `<div class="chat-inbox-t">${esc((f.snap && f.snap.name) || 'enlace')}</div><div class="chat-inbox-p">${esc((f.snap && f.snap.text) || '').slice(0, 140)}</div>`;
      /* clic abre el primer enlace del snapshot */
      d.addEventListener('click', () => {
        const txt = (f.snap && f.snap.text) || '';
        const m = txt.match(/https?:\/\/[^\s<>"']+/);   /* regex en variable: sin ambigüedad dentro del template */
        if (m && m[0]) window.open(m[0], '_blank', 'noopener');
      });
      box.appendChild(d);
    }
    box.classList.remove('hidden');
    $('chatInboxClose').addEventListener('click', () => box.classList.add('hidden'));
  }
  $('chatFavsBtn').addEventListener('click', async () => {
    try { const j = await api('', 'POST', { op: 'favList', uid: me().uid }); renderFavs(j); } catch (e) { toastLite('⚠ No se pudieron cargar'); }
  });

  /* ═══════ DMs ═══════ */
  $('chatInboxBtn').addEventListener('click', async () => {
    const box = $('chatInbox');
    if (!box.classList.toggle('hidden')) { box.classList.add('hidden'); return; }
    try {
      const j = await api('?op=dm-list&me=' + encodeURIComponent(me().uid));
      box.innerHTML = '<div class="chat-inbox-head">📩 Conversaciones privadas <span class="chat-x" id="chatInboxClose">✕</span></div>';
      if (!j.threads.length) box.innerHTML += '<div class="chat-empty">Sin privados. Toca el nombre de alguien para abrir uno.</div>';
      for (const t of j.threads) {
        const d = document.createElement('div');
        d.className = 'chat-inbox-item';
        d.innerHTML = `<div class="chat-inbox-t">${esc(t.peerName || t.peer)}</div><div class="chat-inbox-p">${esc(t.lastText)} · ${timeHM(t.lastTs)}</div>${t.unread ? `<b class="chat-badge">${t.unread}</b>` : ''}`;
        d.addEventListener('click', () => openDm(t.peer, t.peerName || t.peer));
        box.appendChild(d);
      }
      $('chatInboxClose').addEventListener('click', () => box.classList.add('hidden'));
    } catch (e) { toastLite('⚠ No se pudo abrir la bandeja'); }
  });

  function openDm(uid, name) {
    if (!uid || uid === (me() && me().uid)) return;
    S.view = 'dm'; S.peer = uid; S.peerName = name || uid;
    $('chatInbox').classList.add('hidden');
    if (!S.open) switchTab('chat');
    $('chatRoomSel').style.display = 'none';
    renderMsgs();
    markDmRead();
  }
  async function markDmRead() {
    if (!S.peer || !S.ready) return;
    try { await api('', 'POST', { op: 'dmRead', uid: me().uid, peer: S.peer }); } catch (e) { }
    renderBadge();
  }

  /* volver de DM a sala (tocando el selector… que está oculto: botón virtual) */
  $('chatRoomSel').addEventListener('click', () => { });

  /* ═══════ BADGES + AUTO-ABRIR DM al entrar ═══════ */
  function renderBadge() {
    const total = S.unreadDm;
    for (const id of ['chatBadge', 'chatDmBadge']) {
      const el = $(id);
      if (!el) continue;
      el.textContent = total > 99 ? '99+' : total;
      el.classList.toggle('hidden', !total);
    }
  }
  function onNewDm() {
    if (S.view === 'dm' && S.open) { markDmRead(); return; }
    S.unreadDm++;
    renderBadge();
    if (window.Notification && Notification.permission === 'granted') {
      try { new Notification('💬 Nuevo mensaje privado', { body: 'Tienes un mensaje en X·STREAM', silent: false }); } catch (e) { }
    }
  }

  /* al entrar a la web: si hay DM sin leer, abrirlo de inmediato */
  async function autoOpenUnread() {
    if (S.openTried) return; S.openTried = true;
    try {
      const j = await api('?op=dm-list&me=' + encodeURIComponent(me().uid));
      S.unreadDm = (j.threads || []).reduce((a, t) => a + (t.unread || 0), 0);
      renderBadge();
      const unread = (j.threads || []).find(t => t.unread > 0);
      if (unread) {
        toastLite(`💬 Tienes ${unread.unread} mensaje${unread.unread > 1 ? 's' : ''} privado${unread.unread > 1 ? 's' : ''} de ${unread.peerName || 'alguien'} — abriéndolo…`);
        setTimeout(() => openDm(unread.peer, unread.peerName), 700);
      }
    } catch (e) { }
  }

  /* ═══════ ADMIN: ajustes del chat ═══════ */
  function buildSettings() {
    const btn = $('chatSettingsBtn');
    if (!btn) return;
    btn.classList.toggle('hidden', !(me() && me().admin));
    btn.onclick = async () => {
      const m = S.meta || {};
      const html = `
        <div class="chat-set">
          <label>👥 Usuarios por sala <b id="csMax">${m.maxUsers || 50}</b>
            <input type="range" id="csMaxIn" min="2" max="200" value="${m.maxUsers || 50}"></label>
          <p class="chat-hint">Cuando una sala llega al tope, se crea otra sola (ej. «Sala 2»).</p>
          <label>🧹 Borrar mensajes del chat cada… (horas)
            <input type="number" id="csTtl" min="1" max="720" value="${m.ttlHours || 48}"></label>
          <label>🔒 Borrar mensajes privados cada… (horas)
            <input type="number" id="csDmTtl" min="1" max="720" value="${m.dmTtlHours || m.ttlHours || 48}"></label>
          <label>🖼 Imagen de fondo del chat (URL) — vacío = sin fondo
            <input type="text" id="csBg" placeholder="https://…" value="${esc(m.bg || '')}"></label>
          <label>🏷 Salas (una por línea: «id · nombre»)
            <textarea id="csRooms" rows="3">${esc((m.rooms || S.meta?.rooms || []).map(r => r.id + ' · ' + r.name).join('\n'))}</textarea></label>
          <button class="btn btn-acid" id="csSave">Guardar ajustes</button>
        </div>`;
      const w = document.createElement('div');
      w.className = 'chat-set-wrap';
      w.innerHTML = html;
      document.body.appendChild(w);
      $('csMaxIn').addEventListener('input', () => $('csMax').textContent = $('csMaxIn').value);
      $('csSave').addEventListener('click', async () => {
        const rooms = $('csRooms').value.split('\n').map(l => l.trim()).filter(Boolean)
          .map(l => { const p = l.split('·'); return { id: (p[0] || '').trim().replace(/[^\w-]/g, '').toLowerCase() || ('sala' + Math.random().toString(36).slice(2, 6)), name: (p[1] || p[0] || 'Sala').trim() }; });
        try {
          await api('', 'POST', {
            op: 'meta', meta: {
              maxUsers: +$('csMaxIn').value, ttlHours: +$('csTtl').value,
              dmTtlHours: +$('csDmTtl').value, bg: $('csBg').value.trim(), rooms,
            },
          });
          w.remove();
          toastLite('✅ Ajustes del chat guardados — se aplican al momento');
          await poll();
        } catch (e) { toastLite('⚠ ' + (e.message || 'no se pudo guardar'), true); }
      });
      w.addEventListener('click', ev => { if (ev.target === w) w.remove(); });
    };
  }

  /* fondo del chat (translúcido) */
  function applyChatBg() {
    const el = $('chatBg');
    if (!el) return;
    const url = (S.meta && S.meta.bg) || '';
    el.style.backgroundImage = url ? `url("${esc(url)}")` : 'none';
  }

  function toastLite(text, err) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = text;
    t.classList.remove('hidden');
    t.classList.toggle('toast-err', !!err);
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.add('hidden'), 3400);
  }

  /* editar mi apodo del chat (lápiz junto al selector de sala) */
  function wireNick() {
    /* lo inyectamos en el top del chat */
    const top = document.querySelector('.chat-top');
    if (!top) return;
    const b = document.createElement('button');
    b.className = 'chip-filter';
    b.id = 'chatNickBtn';
    b.title = 'Tu nombre visible en el chat (doble toque para cambiarlo)';
    const paint = () => b.innerHTML = '✍ ' + esc(displayName());
    paint();
    b.addEventListener('click', () => {
      const v = prompt('Tu nombre para el chat:', localStorage.getItem('xchat-nick') || displayName());
      if (v === null) return;
      const n = v.trim().slice(0, 30) || '';
      if (n) localStorage.setItem('xchat-nick', n); else localStorage.removeItem('xchat-nick');
      paint();
      beat(); /* publicar el cambio en presencia al instante */
    });
    top.insertBefore(b, $('chatSettingsBtn'));
  }

  /* ═══════ ARRANQUE ═══════ */
  function bootChat() {
    const m = me();
    if (!m || !m.uid) { setTimeout(bootChat, 600); return; }
    S.ready = true;
    wireNick();
    buildSettings();
    if (window.Notification && Notification.permission === 'default') {
      try { Notification.requestPermission().catch(() => { }); } catch (e) { }
    }
    /* la primera entrada: carga completa + heartbeat */
    ensureRoom().then(() => beat()).then(() => poll());
    S.polling = setInterval(poll, 3500);
    S.beating = setInterval(beat, 25000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { beat(); poll(); } });
    /* los favs pintan ❤ al vuelo cuando se abre un mensaje con link */
    window.addEventListener('focus', () => poll());
    autoOpenUnread();
  }
  bootChat();
})();
