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
  /* API serverless propia del ecosistema (Vercel). Es CORS-abierta, así que
     funciona igual en x.yapido.click, en local (file://) y en desarrollo. */
  const API = 'https://acortador-iota.vercel.app/api/chat';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const timeHM = ts => new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

  /* ── mini-avatar procedural por usuari@ (determinista: el mismo avatar le
     sale a todo el mundo para esa persona; cero red, cero peticiones) ── */
  const AV_GRADS = [
    ['#7c3aed', '#312e81'], ['#ff2e63', '#4a0e2e'], ['#f59e0b', '#7c2d12'],
    ['#10b981', '#064e3b'], ['#3b82f6', '#1e3a8a'], ['#ef4444', '#7f1d1d'],
    ['#ec4899', '#831843'], ['#14b8a6', '#134e4a'], ['#8b5cf6', '#4c1d95'],
    ['#f97316', '#7c2d12'], ['#06b6d4', '#164e63'], ['#d8ff3e', '#3f6212'],
  ];
  const avHash = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
  function avatarFor(uid, name) {
    const h = avHash(String(uid) + '|' + String(name || ''));
    const g = AV_GRADS[h % AV_GRADS.length];
    const ini = String(name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${g[0]}'/><stop offset='1' stop-color='${g[1]}'/></linearGradient></defs><rect width='40' height='40' fill='url(#g)'/><text x='20' y='26' font-family='Arial' font-size='15' font-weight='800' fill='#fff' text-anchor='middle'>${ini}</text></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

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
    rev: 0,                  /* cursor de revisión del estado del chat (differential) */
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

  /* llamada al servidor — con reintentos si la red falla temporalmente */
  async function api(params, method = 'GET', body = null, intentos = 3) {
    const m = me();
    const headers = { 'Content-Type': 'application/json' };
    /* staff: puede firmar (admin) o usar la clave del buzón que sólo staff conoce */
    if (m && (m.admin || m.mod) && window.XAUTH) {
      if (m.admin && XAUTH.signText && body && (body.op === 'meta' || body.op === 'bgUpload' || body.op === 'bgClear' || body.op === 'del')) {
        const sig = await XAUTH.signText('xstream-chat-admin:' + Math.floor(Date.now() / 3600000));
        if (sig) headers['x-chat-sig'] = sig;
      }
      if (XAUTH.vaultGet) {
        const k = XAUTH.vaultGet('propKey');
        if (k) headers['x-chat-key'] = k;
      }
    }
    let ultimo = null;
    for (let i = 1; i <= intentos; i++) {
      try {
        const r = await fetch(API + params, { method, headers, body: body ? JSON.stringify(body) : undefined });
        const j = await r.json().catch(() => ({}));
        if (!j || j.ok === false) throw new Error((j && j.error) || ('HTTP ' + r.status));
        return j;
      } catch (e) {
        ultimo = e;
        /* si es un fallo de red (no HTTP), reintenta; si es HTTP, no pierdas tiempo si es 4xx */
        if (/^(4\d\d)/.test(e.message || '') && !/^(408|429)/.test(e.message || '')) break;
        if (i < intentos) await new Promise(r => setTimeout(r, 400 * i));
      }
    }
    throw ultimo;
  }

  /* ═══════ PESTAÑAS Contenido / Chat ═══════ */
  function switchTab(which) {
    const isChat = which === 'chat';
    $('ptabContent').classList.toggle('on', !isChat);
    $('ptabChat').classList.toggle('on', isChat);
    $('panelContent').classList.toggle('hidden', isChat);
    $('panelChat').classList.toggle('hidden', !isChat);
    S.open = isChat;
    /* 📱 móvil + chat abierto: la caja de escribir se vuelve flotante anclada
       al borde inferior (CSS) — la página puede scrollear libre y aun así la
       caja JAMÁS se mueve ni deja hueco debajo                             */
    document.body.classList.toggle('chat-open', isChat);
    if (isChat) {
      ensureRoom().then(() => beat());
      renderMsgs();          /* pintar inmediato aunque el poll ya vendrá */
      if (S.view === 'dm') markDmRead();
      /* 📱 móvil: al ABRIR, el chat salta al instante a su lugar (vista
         completa con la caja de escribir ya pegada abajo). Después la página
         scrolea normal: la firmeza la pone la CSS (caja sticky abajo)     */
      if (window.innerWidth <= 900) {
        /* block:'end' → el BORDE INFERIOR del panel queda al ras del borde
           inferior de la vista: la caja de escribir aterriza exacta, ni un
           píxel de hueco debajo (y arriba queda respirando la barra)      */
        try { $('panelChat').scrollIntoView({ behavior: 'auto', block: 'end' }); } catch (e) { }
      }
    }
  }
  window.addEventListener('resize', () => { /* el CSS fluido lo resuelve solo */ });
  $('ptabContent').addEventListener('click', () => switchTab('content'));
  $('ptabChat').addEventListener('click', () => switchTab('chat'));
  /* 📱 móvil a pantalla completa: sin las pestañas visibles hace falta un
     botón de salida DENTRO del chat (la ✕ del chat-top, solo se ve con el
     chat abierto y pantalla chica — ver CSS body.chat-open #chatCloseBtn) */
  $('chatCloseBtn').addEventListener('click', () => switchTab('content'));

  /* ═══════ RENDER: mensajes ═══════ */
  const escUrl = u => { try { const uu = new URL(u); return uu.protocol === 'http:' || uu.protocol === 'https:' ? uu.href : null; } catch (e) { return null; } };
  function linkify(text) {
    const urls = [];
    const html = esc(text).replace(/(https?:\/\/[^\s<>"']+)/g, m => { urls.push(m); return `<a class="chat-link" href="${esc(m)}" target="_blank" rel="noopener">${esc(m.length > 46 ? m.slice(0, 43) + '…' : m)}</a>`; });
    return { html, urls };
  }

  function msgEl(m) {
    const mine = me() && m.uid === me().uid;
    const canDel = mine || (me() && (me().admin || me().mod));
    const div = document.createElement('div');
    div.className = 'chat-msg' + (mine ? ' mine' : '');
    div.dataset.id = m.id;
    const roleBdg = m.role === 'admin' ? '<span class="chat-role admin">👑 admin</span>'
      : m.role === 'mod' ? '<span class="chat-role mod">🛡 mod</span>' : '';
    const { html, urls } = linkify(m.text);
    const favBtn = urls.length
      ? `<button class="chat-fav ${S.myFavs.has(m.id) ? 'on' : ''}" data-fav="${m.id}" title="${S.myFavs.has(m.id) ? 'Quitar de favoritos' : 'Guardar enlace en favoritos (no se borra con el TTL)'}">${S.myFavs.has(m.id) ? '❤' : '🤍'}</button>`
      : '';
    const delBtn = canDel ? `<button class="chat-del" data-del="${m.id}" title="Borrar este mensaje">✕</button>` : '';
    /* Barra de acciones: reaccionar, citar, editar (editar solo el autor) */
    const acts = `<button class="chat-act" data-react="${m.id}" title="Reaccionar">🙂</button>`
      + `<button class="chat-act" data-quote="${m.id}" title="Citar / responder">↩</button>`
      + (mine ? `<button class="chat-act" data-edit="${m.id}" title="Editar el mensaje">✏</button>` : '');
    const quoteBlk = m.quote
      ? `<div class="chat-quote"><b>${esc(m.quote.name || '?')}</b><span>${esc((m.quote.text || '').slice(0, 90))}</span></div>` : '';
    const imgBlk = m.img ? `<img class="chat-img" src="${esc(m.img)}" alt="" loading="lazy">` : '';
    const reacts = m.reactions && Object.keys(m.reactions).length
      ? `<div class="chat-reactions">` + Object.entries(m.reactions).map(([e, uids]) =>
        `<button class="chat-reaction${(me() && (uids || []).includes(me().uid)) ? ' on' : ''}" data-emoji="${esc(e)}" data-msg="${esc(m.id)}">${e} ${uids.length}</button>`).join('') + `</div>` : '';
    div.innerHTML = `
      <div class="chat-head">
        <img class="chat-ava" src="${avatarFor(m.uid, m.name)}" alt="">
        <button class="chat-who" data-uid="${esc(m.uid)}" data-name="${esc(m.name)}">${esc(m.name)}</button>
        ${roleBdg}
        <span class="chat-time">${timeHM(m.ts)}${m.edited ? ' <i>(editado)</i>' : ''}</span>
        ${favBtn}
      </div>
      <div class="chat-body">${html}</div>
      ${quoteBlk}
      ${imgBlk}
      ${reacts}
      ${urls.length ? `<div class="chat-prev" data-unfurl="${esc(urls[0])}"></div>` : ''}
      <div class="chat-actions">${acts}</div>
      ${delBtn}`;
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
    const staff = me() && (me().admin || me().mod);
    const mk = (p, on) => {
      const li = document.createElement('button');
      li.className = 'chat-user' + (on ? '' : ' off');
      const isMe = p.uid === mine;
      const isOtherStaff = p.role === 'admin' || p.role === 'mod';
      const muteB = (staff && !isMe && !isOtherStaff)
        ? `<i class="chat-mute" data-mute="${esc(p.uid)}" data-name="${esc(p.name)}" title="Silenciar a ${esc(p.name)} (sus mensajes llegan pero no puede escribir)">🔇</i>` : '';
      li.innerHTML = `<img class="chat-ava u-ava" src="${avatarFor(p.uid, p.name)}" alt=""><i class="u-dot">${on ? '●' : '○'}</i><span class="u-name">${esc(p.name)}</span>${p.role === 'admin' ? '<b>👑</b>' : p.role === 'mod' ? '<b>🛡</b>' : ''}${muteB}`;
      li.title = (on ? 'En línea' : 'Fuera de línea') + ' — toca para mensaje privado';
      li.addEventListener('click', ev => {
        /* el 🔇 tiene su propio evento y no abre DM */
        if (ev.target.closest('.chat-mute')) return;
        if (!isMe) openDm(p.uid, p.name);
      });
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

  /* ═══════ POLLING sala + presencia + DMs — por REVISIÓN (cambios y nuevos) ═══════ */
  async function poll() {
    if (!S.ready) return;
    try {
      const j = await api(`?op=state&rev=${S.rev || 0}&room=${encodeURIComponent(S.room)}&me=${encodeURIComponent(me().uid)}`);
      let cambio = false;
      /* mensajes nuevos O modificados/editados/reaccionados/borrados */
      if (j.msgs && j.msgs.length) {
        for (const m of j.msgs) { S.msgsById.set(m.id, m); }
        cambio = true;
      }
      if (j.deleted && j.deleted.length) {
        for (const id of j.deleted) if (S.msgsById.delete(id)) cambio = true;
      }
      if (j.dms && j.dms.length) {
        let nuevos = 0;
        for (const m of j.dms) {
          if (!S.msgsById.has(m.id) && m.to === me().uid) nuevos++;
          S.msgsById.set(m.id, m);
        }
        if (nuevos) onNewDm(nuevos);
        cambio = true;
      }
      if (j.rev) S.rev = j.rev;
      if (cambio) renderMsgs();
      S.presence = j.presence || [];
      S.meta = j.meta || S.meta;
      if (j.rooms) S.rooms = j.rooms;   /* las salas vienen a NIVEL RAÍZ (j.rooms), no en meta */
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

  /* ═══════ SALAS — chips que se crean solos ═══════
     (las salas llegan a NIVEL RAÍZ de la respuesta — j.rooms —, no dentro de
      meta: el <select> viejo quedaba en blanco para siempre por eso. Ahora
      cada sala nueva aparece sola como botoncito con su contador en vivo)  */
  function renderRooms() {
    const box = $('chatRooms');
    if (!box) return;
    const rooms = S.rooms || [];
    if (!rooms.length) { box.innerHTML = ''; return; }
    const ocupa = id => S.presence.filter(p => p.room === id).length;
    /* firma: solo repintamos si algo cambió de verdad (nada de parpadeo
       ni de perder el scroll de la fila en cada sondeo de 3,5 s)          */
    const sig = JSON.stringify(rooms.map(r => [r.id, r.name, ocupa(r.id)]))
      + '|' + S.room + '|' + (S.meta && S.meta.maxUsers);
    if (sig === S._roomsSig) return;
    S._roomsSig = sig;
    box.innerHTML = '';
    for (const r of rooms) {
      const n = ocupa(r.id);
      const full = S.meta && S.meta.maxUsers && n >= S.meta.maxUsers;
      const b = document.createElement('button');
      b.className = 'room-chip' + (S.room === r.id ? ' on' : '') + (full ? ' full' : '');
      b.innerHTML = `<span class="rc-name">${esc(r.name)}</span><b class="rc-n">${full ? 'llena' : '● ' + n}</b>`;
      b.title = full ? `${r.name} está llena` : `Entrar a ${r.name} — ${n} conectados ahora`;
      b.addEventListener('click', () => {
        if (S.room === r.id) return;
        S.room = r.id;
        localStorage.setItem('xchat-room', S.room);
        switchToRoom();
      });
      box.appendChild(b);
    }
    /* la sala activa siempre a la vista dentro de la fila scrolleable */
    const on = box.querySelector('.room-chip.on');
    if (on) { try { on.scrollIntoView({ inline: 'nearest', block: 'nearest' }); } catch (e) { } }
  }

  async function ensureRoom() {
    if (S.room) return;
    S.room = 'general';
  }

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
      if (j.meta) S.meta = j.meta;
      if (j.rooms) { S.rooms = j.rooms; renderRooms(); }
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
    const editing = inp.dataset.editId;
    const pendImg = inp.dataset.imgUrl;
    const quoting = inp.dataset.quoteId && inp.dataset.quoteText
      ? { id: inp.dataset.quoteId, name: inp.dataset.quoteName, text: inp.dataset.quoteText } : null;
    if (!text && !pendImg) return;
    const m = me();
    if (!m) return;
    inp.value = '';
    try {
      if (editing) {
        await api('', 'POST', { op: 'edit', uid: m.uid, msgId: editing, text });
        delete inp.dataset.editId;
        $('chatQuoteStrip')?.classList.add('hidden');
      } else {
        const base = { uid: m.uid, name: displayName(), role: m.role, text, ...(pendImg ? { img: pendImg } : {}), ...(quoting ? { quote: quoting } : {}) };
        if (S.view === 'dm' && S.peer) await api('', 'POST', { op: 'dm', to: S.peer, ...base });
        else await api('', 'POST', { op: 'sent', room: S.room, ...base });
      }
      /* limpiar cita/imagen tras enviar */
      const strip = $('chatQuoteStrip'); if (strip) strip.classList.add('hidden');
      delete inp.dataset.quoteId; delete inp.dataset.quoteName; delete inp.dataset.quoteText; delete inp.dataset.imgUrl; delete inp.dataset.editId;
      updateImgThumb();
      await poll();
    } catch (e) {
      inp.value = text; /* no perder lo escrito */
      toastLite('⚠ No se pudo enviar: ' + (e.message || e));
    }
  }
  $('chatSend').addEventListener('click', sendNow);
  $('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendNow(); });

  /* 📷 compartir imagen en el chat (sube al repo, no a servicios) */
  let imgPickBusy = false;
  async function pickChatImage() {
    if (imgPickBusy) return;
    imgPickBusy = true;
    try {
      const file = await new Promise(res => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = () => res(inp.files && inp.files[0]);
        inp.oncancel = () => res(null);
        inp.click();
      });
      if (!file) return;
      toastLite('⏳ Preparando imagen…');
      const dataUrl = await fitImage(file, 1200);
      const j = await api('', 'POST', { op: 'uploadImg', uid: me().uid, dataUrl });
      $('chatInput').dataset.imgUrl = j.url;
      toastLite('📷 Imagen lista — escribe (o no) y envía');
      updateImgThumb();
    } catch (e) {
      toastLite('⚠ ' + (e.message || 'no se pudo subir'), true);
    } finally { imgPickBusy = false; }
  }
  $('chatImgBtn').addEventListener('click', pickChatImage);
  function updateImgThumb() {
    let chip = $('chatImgChip');
    const url = $('chatInput').dataset.imgUrl;
    if (!chip) {
      chip = document.createElement('div');
      chip.className = 'chat-imgchip hidden';
      chip.id = 'chatImgChip';
      const compose = document.querySelector('.chat-compose');
      compose.parentElement.insertBefore(chip, compose);
    }
    if (url) {
      chip.innerHTML = `<img src="${esc(url)}" alt=""><span>Imagen lista — se enviará con tu texto</span><button class="cq-x" id="chatImgX">✕</button>`;
      chip.classList.remove('hidden');
      $('chatImgX').addEventListener('click', () => { delete $('chatInput').dataset.imgUrl; chip.classList.add('hidden'); });
    } else chip.classList.add('hidden');
  }

  /* 🔇 silenciar (solo staff) — atajo pinchando el icono junto al nombre */
  document.addEventListener('click', async ev => {
    const b = ev.target.closest('.chat-mute');
    if (!b) return;
    if (!confirm(`¿Silenciar a ${b.dataset.name}? Sus mensajes dejan de aparecer (guardarás los suyos de todos modos).`)) return;
    try { await api('', 'POST', { op: 'mute', uid: b.dataset.mute, by: displayName() }); toastLite(`🔇 ${b.dataset.name} fue silenciado`); } catch (e) { toastLite('⚠ ' + (e.message || 'falló'), true); }
  });

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
    /* abrir si estaba oculto, cerrar si estaba abierto — un toque = un estado */
    if (box.classList.contains('hidden')) box.classList.remove('hidden');
    else { box.classList.add('hidden'); return; }
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
    $('chatRooms').classList.add('hidden');
    $('chatBackBtn').classList.remove('hidden');
    renderMsgs();
    markDmRead();
  }
  /* volver de un DM a la sala */
  $('chatBackBtn').addEventListener('click', () => {
    S.view = 'room'; S.peer = null; S.peerName = '';
    $('chatRooms').classList.remove('hidden');
    $('chatBackBtn').classList.add('hidden');
    renderMsgs();
  });

  /* 👥 toggle de la lista de usuarios en línea */
  $('chatOnline').addEventListener('click', () => {
    const p = $('chatUsers');
    p.classList.toggle('open');
  });
  async function markDmRead() {
    if (!S.peer || !S.ready) return;
    try { await api('', 'POST', { op: 'dmRead', uid: me().uid, peer: S.peer }); } catch (e) { }
    renderBadge();
  }

  /* 🗑 borrar mensaje: autor, mod o admin */
  document.addEventListener('click', async ev => {
    const b = ev.target.closest('.chat-del');
    if (!b) return;
    const msgId = b.dataset.del;
    if (!confirm('¿Borrar este mensaje?')) return;
    try {
      await api('', 'POST', { op: 'del', uid: me().uid, msgId });
      S.msgsById.delete(msgId);
      renderMsgs();
    } catch (e) { toastLite('⚠ ' + (e.message || 'no se pudo borrar'), true); }
  });

  /* 🙂 reacciones rápidas + cita + edición (delegados sobre el mensaje) */
  const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
  let emojiPanel = null;

  document.addEventListener('click', async ev => {
    /* abrir panel de emojis */
    const reactBtn = ev.target.closest('.chat-act[data-react]');
    if (reactBtn) {
      closeEmojiPanel();
      const msgId = reactBtn.dataset.react;
      emojiPanel = document.createElement('div');
      emojiPanel.className = 'chat-emoji-panel';
      emojiPanel.innerHTML = EMOJIS.map(e => `<button class="chat-emoji" data-emoji="${e}">${e}</button>`).join('');
      reactBtn.closest('.chat-msg').appendChild(emojiPanel);
      emojiPanel.querySelectorAll('.chat-emoji').forEach(b => {
        b.addEventListener('click', async () => {
          closeEmojiPanel();
          const emoji = b.dataset.emoji;
          try {
            await api('', 'POST', { op: 'react', uid: me().uid, msgId, emoji });
            await poll();
          } catch (e) { toastLite('⚠ No se pudo reaccionar'); }
        });
      });
      return;
    }
    /* una reacción existente: toggle (te sumas o te quitas) */
    const reBtn = ev.target.closest('.chat-reaction');
    if (reBtn) {
      try {
        await api('', 'POST', { op: 'react', uid: me().uid, msgId: reBtn.dataset.msg, emoji: reBtn.dataset.reactEmoji });
        await poll();
      } catch (e) { }
      return;
    }
    /* citar: llena la caja con la referencia */
    const qBtn = ev.target.closest('.chat-act[data-quote]');
    if (qBtn) {
      const orig = S.msgsById.get(qBtn.dataset.quote);
      if (!orig) return;
      const inp = $('chatInput');
      inp.dataset.quoteId = orig.id;
      inp.dataset.quoteName = orig.name;
      inp.dataset.quoteText = (orig.text || '').slice(0, 120);
      renderQuoteChip();
      inp.focus();
      return;
    }
    /* editar: solo si es mío — abro el input con el texto actual */
    const edBtn = ev.target.closest('.chat-act[data-edit]');
    if (edBtn) {
      const orig = S.msgsById.get(edBtn.dataset.edit);
      if (!orig || !me() || orig.uid !== me().uid) return;
      const inp = $('chatInput');
      inp.dataset.editId = orig.id;
      inp.value = orig.text;
      renderEditChip(orig);
      inp.focus();
      inp.select();
      inp.setSelectionRange(inp.value.length, inp.value.length);
      return;
    }
    /* cerrar panel emoji si toco fuera */
    if (emojiPanel && !emojiPanel.contains(ev.target)) closeEmojiPanel();
  });

  function closeEmojiPanel() { if (emojiPanel) { emojiPanel.remove(); emojiPanel = null; } }

  /* franja de cita/edición sobre el input */
  function renderQuoteChip() {
    let strip = $('chatQuoteStrip');
    if (!strip) {
      strip = document.createElement('div');
      strip.className = 'chat-qstrip';
      strip.id = 'chatQuoteStrip';
      const compose = document.querySelector('.chat-compose');
      compose.parentElement.insertBefore(strip, compose);
    }
    const inp = $('chatInput');
    strip.innerHTML = `<span class="cq-l">↩ ${esc(inp.dataset.quoteName)}:</span><span class="cq-t">${esc(inp.dataset.quoteText)}…</span><button class="cq-x" id="cqClose">✕</button>`;
    strip.classList.remove('hidden');
    $('cqClose').addEventListener('click', () => { strip.classList.add('hidden'); delete inp.dataset.quoteId; });
  }
  function renderEditChip(orig) {
    let strip = $('chatQuoteStrip');
    if (!strip) {
      strip = document.createElement('div');
      strip.className = 'chat-qstrip editing';
      strip.id = 'chatQuoteStrip';
      const compose = document.querySelector('.chat-compose');
      compose.parentElement.insertBefore(strip, compose);
    }
    strip.innerHTML = `<span class="cq-l">✏ Editando tu mensaje</span><span class="cq-t">Escribe el texto nuevo y dale a enviar</span><button class="cq-x" id="cqClose">✕</button>`;
    strip.classList.remove('hidden');
    $('cqClose').addEventListener('click', () => { strip.classList.add('hidden'); const inp = $('chatInput'); inp.value = ''; delete inp.dataset.editId; });
  }

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

  /* ═══════ 🖼 FONDO DEL CHAT — subida desde el dispositivo ═══════
   Admin: la imagen SUBE al repo y queda como predeterminada de TODOS.
   Cada usuario puede poner la suya SOLO en su dispositivo (localStorage),
   con opción de "volver a la oficial". Las medidas óptimas se sugieren
   según el dispositivo detectado.                                */
  function deviceKind() {
    const ua = navigator.userAgent || '';
    /* 0) el UA de teléfono/tablet manda */
    if (/iphone|ipod|android.*mobi|mobi/i.test(ua)) return 'movil';
    if (/ipad|tablet/i.test(ua)) return 'tablet';
    /* 1) puntero FINO (ratón o trackpad) => es una computadora, aunque la
       ventana sea pequeña. Antes bastaba una pantalla 1080p o un portátil
       1366×768 para caer mal clasificado como «tablet» o incluso «móvil». */
    const fino = window.matchMedia && matchMedia('(pointer: fine)').matches;
    if (fino) return 'pc';
    /* 2) equipo puramente táctil sin UA claro (tablets modernas): por tamaño */
    const w = Math.min(screen.width, screen.height);
    return w < 768 ? 'movil' : (w <= 1280 ? 'tablet' : 'pc');
  }
  function sugerenciaMedidas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(screen.width * dpr), h = Math.round(screen.height * dpr);
    const kind = deviceKind();
    if (kind === 'movil') return { w: Math.min(w, 1080), ratio: '9:16 (vertical)', dev: '📱 móvil' };
    if (kind === 'tablet') return { w: Math.min(w, 1600), ratio: '4:3 (casi cuadrada)', dev: '📟 tablet' };
    return { w: Math.min(w, 1920), ratio: '16:9 (panorámica)', dev: '🖥 computador' };
  }
  /* recorta/encaja una imagen local a ancho útil y la devuelve como data url */
  function fitImage(file, maxW) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => rej(new Error('imagen no legible'));
      img.src = URL.createObjectURL(file);
    });
  }

  /* sugerencia por dispositivo: nombre amable + ancho recomendado para cubrir su pantalla */
  const DEVS = [
    { k: 'movil', icon: '📱', label: 'Móvil', ratio: 'vertical (9:19) — lo ve quien entra desde el teléfono' },
    { k: 'tablet', icon: '📟', label: 'Tablet', ratio: 'apaisada suave (4:3) — tablets' },
    { k: 'pc', icon: '🖥', label: 'PC', ratio: 'panorámica (16:9) — computadores' },
  ];
  function devWidth(dev) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (dev === 'movil') return Math.min(Math.round(Math.min(screen.width, screen.height) * dpr * 1.1), 1080);
    if (dev === 'tablet') return Math.min(Math.round(Math.max(screen.width, screen.height) * dpr * 0.9), 1600);
    return Math.min(Math.round(screen.width * dpr), 1920);
  }

  function openBgPicker(adminMode) {
    const oficial = (S.meta && typeof S.meta.bg === 'object' ? S.meta.bg : {}) || {};
    const mine = localStorage.getItem('xchat-bg-local');
    const miDev = deviceKind();
    /* el estado de cada dispositivo: oficial (global) + mi override local */
    const card = d => {
      const oficialUrl = oficial[d.k] ? oficial[d.k] + '&m=' + (S.meta && S.meta.bgTs || 0) : null;
      const esMiDispositivo = d.k === miDev ? ' · <b style="color:var(--acid)">TÚ ESTÁS AQUÍ</b>' : '';
      return `<div class="bg-slot${d.k === miDev ? ' here' : ''}" data-dev="${d.k}">
        <div class="bg-slot-head">${d.icon} <b>${d.label}</b>${esMiDispositivo}</div>
        <div class="bg-slot-prev" data-prev="${d.k}" style="${oficialUrl ? `background-image:url('${esc(oficialUrl)}')` : ''}">
          ${oficialUrl ? '' : '<span>Sin imagen oficial</span>'}
        </div>
        <p class="chat-hint">Sugerida: ${devWidth(d.k)} px de ancho · ${d.ratio}</p>
        <div class="bg-slot-btns">
          <button class="btn btn-mini" data-pick="${d.k}">📁 Elegir…</button>
          <button class="btn btn-mini hidden" data-apply="${d.k}">Aplicar aquí</button>
          ${adminMode ? `<button class="btn btn-mini hidden" data-pub="${d.k}">🌐 Publicar oficial</button>` : ''}
          ${adminMode && oficialUrl ? `<button class="btn btn-mini" data-clear="${d.k}" title="Quitar el fondo oficial de este dispositivo">✕</button>` : ''}
        </div>
      </div>`;
    };
    /* 👑 el administrador ve los 3 dispositivos (él publica el oficial);
       cualquier otro usuario ve SOLO el de su dispositivo: elige su imagen
       y queda guardada para siempre, pero solo en ESTE aparato (local) */
    const lista = adminMode ? DEVS : DEVS.filter(d => d.k === miDev);
    const w = document.createElement('div');
    w.className = 'chat-set-wrap';
    w.innerHTML = `
      <div class="chat-set" style="max-width:600px">
        <h3 style="margin:0">🖼 Fondo del chat${adminMode ? ', por dispositivo' : ''}</h3>
        <p class="chat-hint">${adminMode
          ? 'Cada hueco es un tipo de dispositivo: la imagen que subas a 📱 <b>Móvil</b> la ven quienes entren desde el teléfono; la de 🖥 <b>PC</b>, quienes entren desde computador. La mía LOCAL solo se ve en ESTE aparato.'
          : 'Eliges una imagen para el chat y queda guardada <b>permanentemente, solo en este dispositivo</b> (nadie más la ve). El fondo oficial para todos lo publica el administrador.'}</p>
        <div class="bg-slots">${lista.map(card).join('')}</div>
        <div id="bgStatus" class="chat-hint"></div>
        <div class="chat-setrow">
          <button class="btn btn-ghost" id="bgReset">↺ Quitar mi personalización (volver a la oficial)</button>
          <button class="btn btn-ghost" id="bgClose">Cerrar</button>
        </div>
        <input type="file" id="bgFile" accept="image/*" hidden>
      </div>`;
    document.body.appendChild(w);
    const chosen = {};  /* dev → dataUrl */
    let pubBusy = false;
    w.addEventListener('click', async ev => {
      const pick = ev.target.closest('[data-pick]');
      const apply = ev.target.closest('[data-apply]');
      const pub = ev.target.closest('[data-pub]');
      const clear = ev.target.closest('[data-clear]');
      if (pick) { w.dataset.armed = pick.dataset.pick; $('bgFile').click(); return; }
      if (apply) {
        const dev = apply.dataset.apply;
        if (!chosen[dev]) return toastLite('Primero elige la imagen', true);
        localStorage.setItem('xchat-bg-local-' + dev, chosen[dev]);
        applyChatBg();
        toastLite(`🖼 Tu fondo en ${dev} — solo TU dispositivo lo ve así`);
        return;
      }
      if (clear) {
        const dev = clear.dataset.clear;
        try {
          await api('', 'POST', { op: 'bgClear', dev });
          if (S.meta && typeof S.meta.bg === 'object') delete S.meta.bg[dev];
          applyChatBg();
          w.querySelector(`[data-prev="${dev}"]`).style.backgroundImage = 'none';
          w.querySelector(`[data-prev="${dev}"]`).innerHTML = '<span>Sin imagen oficial</span>';
          toastLite(`✕ Fondo oficial de ${dev} eliminado`);
        } catch (e) { toastLite('⚠ ' + (e.message || 'falló'), true); }
        return;
      }
      if (pub) {
        const dev = pub.dataset.pub;
        if (!chosen[dev]) return toastLite('Primero elige la imagen', true);
        if (pubBusy) return;
        pubBusy = true;
        $('bgStatus').textContent = `🌐 Publicando fondo de ${dev}…`;
        try {
          const j = await api('', 'POST', { op: 'bgUpload', dev, dataUrl: chosen[dev] });
          if (!S.meta || typeof S.meta.bg !== 'object') S.meta = { ...(S.meta || {}), bg: {} };
          S.meta.bg[dev] = j.url;
          S.meta.bgTs = Date.now();
          applyChatBg();
          const prev = w.querySelector(`[data-prev="${dev}"]`);
          prev.style.backgroundImage = `url('${j.url}')`; prev.innerHTML = '';
          $('bgStatus').textContent = `✅ Oficial de ${dev} publicada — todos la verán`;
        } catch (e) { $('bgStatus').textContent = '⚠ ' + (e.message || 'falló'); }
        finally { pubBusy = false; }
        return;
      }
    });
    $('bgFile').addEventListener('change', async ev => {
      const f = ev.target.files && ev.target.files[0];
      const dev = w.dataset.armed;
      if (!f || !dev) return;
      $('bgStatus').textContent = '⏳ Ajustando la imagen para ' + dev + '…';
      try {
        chosen[dev] = await fitImage(f, devWidth(dev));
        $('bgStatus').textContent = `✅ Lista (${(chosen[dev].length / 1024).toFixed(0)} KB) — pulsa «Aplicar aquí»${adminMode ? ' o «Publicar oficial»' : ''}`;
        const applyBtn = w.querySelector(`[data-apply="${dev}"]`);
        const pubBtn = w.querySelector(`[data-pub="${dev}"]`);
        if (applyBtn) applyBtn.classList.remove('hidden');
        if (pubBtn) pubBtn.classList.remove('hidden');
        const prev = w.querySelector(`[data-prev="${dev}"]`);
        prev.style.backgroundImage = `url('${chosen[dev]}')`;
        prev.style.display = 'flex';
      } catch (e) { $('bgStatus').textContent = '⚠ ' + e.message; }
    });
    $('bgReset').addEventListener('click', () => {
      ['movil', 'tablet', 'pc'].forEach(d => localStorage.removeItem('xchat-bg-local-' + d));
      localStorage.removeItem('xchat-bg-local');
      applyChatBg();
      toastLite('↺ Volvió el fondo oficial');
      w.remove();
    });
    $('bgClose').addEventListener('click', () => w.remove());
    w.addEventListener('click', ev => { if (ev.target === w) w.remove(); });
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
          <div class="chat-setrow">
            <label style="flex:1">🖼 Fondo oficial
              <button class="btn btn-ghost" id="csBgBtn" style="width:100%">Cambiar imagen…</button></label>
            <button class="btn btn-ghost" id="csBgOff" title="Quitar el fondo">✕</button>
          </div>
          <label>🏷 Salas (una por línea: «id · nombre»)
            <textarea id="csRooms" rows="3">${esc((m.rooms || S.meta?.rooms || []).map(r => r.id + ' · ' + r.name).join('\n'))}</textarea></label>
          <p class="chat-hint">El fondo oficial se sube con el botón de arriba; cada visitante puede poner el suyo localmente desde el icono 🖼 del chat.</p>
          <button class="btn btn-acid" id="csSave">Guardar ajustes</button>
        </div>`;
      const w = document.createElement('div');
      w.className = 'chat-set-wrap';
      w.innerHTML = html;
      document.body.appendChild(w);
      $('csMaxIn').addEventListener('input', () => $('csMax').textContent = $('csMaxIn').value);
      $('csBgBtn').addEventListener('click', () => { w.remove(); openBgPicker(true); });
      $('csBgOff').addEventListener('click', async () => {
        try {
          await api('', 'POST', { op: 'bgClear' });  /* quita el fondo oficial de los 3 dispositivos */
          if (S.meta && typeof S.meta.bg === 'object') S.meta.bg = {}; else if (S.meta) S.meta.bg = {};
          applyChatBg(); toastLite('Fondo oficial eliminado en todos los dispositivos');
        } catch (e) { toastLite('⚠ ' + e.message, true); }
      });
      $('csSave').addEventListener('click', async () => {
        const rooms = $('csRooms').value.split('\n').map(l => l.trim()).filter(Boolean)
          .map(l => { const p = l.split('·'); return { id: (p[0] || '').trim().replace(/[^\w-]/g, '').toLowerCase() || ('sala' + Math.random().toString(36).slice(2, 6)), name: (p[1] || p[0] || 'Sala').trim() }; });
        try {
          await api('', 'POST', {
            op: 'meta', meta: {
              maxUsers: +$('csMaxIn').value, ttlHours: +$('csTtl').value,
              dmTtlHours: +$('csDmTtl').value, rooms,
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

  /* fondo del chat: gana el override local de ESTE dispositivo; si no, el
     oficial de ESTE tipo de dispositivo (móvil/tablet/PC son independientes) */
  function applyChatBg() {
    const el = $('chatBg');
    if (!el) return;
    const dev = deviceKind();
    const local = localStorage.getItem('xchat-bg-local-' + dev) || localStorage.getItem('xchat-bg-local');
    const oficialObj = (S.meta && typeof S.meta.bg === 'object' ? S.meta.bg : {}) || {};
    const official = oficialObj[dev] || '';
    const url = local || official;
    el.style.backgroundImage = url ? `url("${url}")` : 'none';
    $('panelChat').classList.toggle('has-bg', !!url);
  }

  function toastLite(text, err) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = text;
    t.classList.remove('hidden');
    t.classList.toggle('toast-err', !!err);
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.add('hidden'), 3400);
  }

  /* 🖼 todos pueden cambiar su fondo del chat (solo en SU dispositivo);
     el admin además puede publicar la oficial para TODOS desde ⚙ */
  $('chatBgBtn').addEventListener('click', () => openBgPicker(!!(me() && me().admin)));

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
    /* 🕊 NUNCA pedimos el permiso de notificaciones: esa burbuja del navegador
       genera desconfianza. Quien lo haya activado por su cuenta en los ajustes
       del navegador seguirá recibiendo avisos (onNewDm ya lo comprueba con
       permission === 'granted'); el resto NO ve ninguna petición molesta. */
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
