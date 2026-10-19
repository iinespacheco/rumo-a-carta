/* Rumo à Carta — lógica da app (contas, mural, biblioteca de prints e notificações) */
(() => {
  'use strict';

  const cfg = window.RUMO_CONFIG || {};
  const BUCKET = 'prints';
  const PAGE = 30;               // prints carregados de cada vez
  const SIGN_SECONDS = 3600;     // validade dos links privados das imagens
  const STALE_MS = 60 * 1000;    // ao voltar à app, atualiza se passou mais de 1 minuto

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    user: null,
    profiles: new Map(),   // id -> { id, name, idx }
    posts: [],
    hasMore: false,
    view: 'mural',
    filter: 'all',
    lastLoad: 0,
    loading: false,
    openPostId: null
  };

  let sb = null;
  let installPrompt = null;
  let toastTimer = null;
  let deleteTimer = null;
  let pickedFile = null;
  let previewUrl = null;

  /* ------------------------------------------------ utilitários */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const initial = (name) => (Array.from(String(name || '?').trim())[0] || '?').toUpperCase();

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  function showError(el, message) {
    el.textContent = message;
    el.hidden = !message;
  }

  function showScreen(name) {
    ['loading', 'setup', 'error', 'login', 'name'].forEach((s) => {
      $('#screen-' + s).hidden = s !== name;
    });
    $('#screen-app').hidden = name !== 'app';
  }

  /* ------------------------------------------------ datas */
  const fmtTime = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' });
  const fmtDayShort = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' });
  const fmtDayLong = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtKey = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });

  const dayKey = (d) => fmtKey.format(d);
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function whenLabel(iso) {
    const d = new Date(iso);
    const key = dayKey(d);
    const time = fmtTime.format(d);
    if (key === dayKey(new Date())) return 'Hoje, ' + time;
    if (key === dayKey(daysAgo(1))) return 'Ontem, ' + time;
    return fmtDayShort.format(d) + ', ' + time;
  }

  function dayHeading(iso) {
    const d = new Date(iso);
    const key = dayKey(d);
    if (key === dayKey(new Date())) return 'Hoje';
    if (key === dayKey(daysAgo(1))) return 'Ontem';
    return capitalize(fmtDayLong.format(d));
  }

  /* ------------------------------------------------ pessoas */
  function personOf(uid) {
    return state.profiles.get(uid) || { id: uid, name: 'Alguém', idx: 0 };
  }

  function avatarHtml(uid, extra = '') {
    const p = personOf(uid);
    return `<span class="avatar who-${p.idx % 2} ${extra}" aria-hidden="true">${esc(initial(p.name))}</span>`;
  }

  /* ------------------------------------------------ arranque */
  function configured() {
    const url = String(cfg.SUPABASE_URL || '');
    const key = String(cfg.SUPABASE_KEY || '');
    return /^https:\/\/.+/.test(url) && key.length > 20 && !/COLA_AQUI/.test(url + key);
  }

  async function boot() {
    bindEvents();
    registerServiceWorker();

    if (!configured() || !window.supabase) {
      showScreen('setup');
      return;
    }

    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });

    sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        resetState();
        showScreen('login');
      }
    });

    try {
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;
      if (data.session) await enterApp(data.session.user);
      else showScreen('login');
    } catch (err) {
      showLoadError(err);
    }
  }

  function resetState() {
    state.user = null;
    state.profiles = new Map();
    state.posts = [];
    state.hasMore = false;
    state.filter = 'all';
    state.view = 'mural';
    closeDialog($('#dlg-view'));
    closeDialog($('#dlg-publish'));
    closeDialog($('#dlg-menu'));
  }

  function showLoadError(err) {
    console.error(err);
    $('#error-text').textContent = navigator.onLine === false
      ? 'Sem ligação à internet. Liga-te e tenta outra vez.'
      : 'Algo correu mal ao falar com o servidor. Tenta outra vez dentro de instantes.';
    showScreen('error');
  }

  async function enterApp(user) {
    state.user = user;
    showScreen('loading');
    try {
      await loadProfiles();
      if (!state.profiles.has(user.id)) {
        showScreen('name');
        setTimeout(() => $('#name-input').focus(), 50);
        return;
      }
      await startMain();
    } catch (err) {
      showLoadError(err);
    }
  }

  async function startMain() {
    paintHeader();
    setView('mural');
    showScreen('app');
    maybeShowIosTip();
    paintNotifTip();
    syncPushQuietly();
    if (new URLSearchParams(location.search).has('novo')) {
      try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignorar */ }
      openNewPost();
    }
    await loadPosts(true);
  }

  /* ------------------------------------------------ dados */
  async function loadProfiles() {
    const { data, error } = await sb.from('profiles').select('id,name,created_at').order('created_at', { ascending: true });
    if (error) throw error;
    state.profiles = new Map(data.map((p, i) => [p.id, { id: p.id, name: p.name, idx: i }]));
  }

  async function signUrls(rows) {
    const paths = [];
    rows.forEach((r) => { paths.push(r.image_path, r.thumb_path); });
    if (!paths.length) return new Map();
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(paths, SIGN_SECONDS);
    if (error) throw error;
    return new Map(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  }

  async function loadPosts(reset) {
    if (state.loading) return;
    state.loading = true;
    $('#btn-refresh').setAttribute('aria-busy', 'true');
    try {
      const from = reset ? 0 : state.posts.length;
      const { data, error } = await sb
        .from('posts')
        .select('id,user_id,image_path,thumb_path,note,created_at')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;

      const urls = await signUrls(data);
      const rows = data.map((r) => ({
        ...r,
        urlFull: urls.get(r.image_path) || '',
        urlThumb: urls.get(r.thumb_path) || ''
      }));

      state.posts = reset ? rows : state.posts.concat(rows);
      state.hasMore = data.length === PAGE;
      state.lastLoad = Date.now();
      render();
    } catch (err) {
      console.error(err);
      toast(navigator.onLine === false ? 'Sem ligação. Tenta outra vez.' : 'Não foi possível atualizar. Tenta outra vez.');
    } finally {
      state.loading = false;
      $('#btn-refresh').removeAttribute('aria-busy');
    }
  }

  /* ------------------------------------------------ desenho */
  function paintHeader() {
    const me = personOf(state.user.id);
    $('#btn-menu').innerHTML = avatarHtml(state.user.id, 'avatar-lg');
    $('#btn-menu').setAttribute('aria-label', 'A tua conta: ' + me.name);
  }

  function setView(view) {
    state.view = view;
    $('#view-mural').hidden = view !== 'mural';
    $('#view-biblioteca').hidden = view !== 'biblioteca';
    $$('.tab').forEach((t) => {
      if (t.dataset.view === view) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    if (!state.user) return;
    if (state.view === 'mural') renderMural();
    else renderBiblioteca();
  }

  function emptyHtml(title, text) {
    return `<div class="empty"><h2 class="h2">${esc(title)}</h2><p>${esc(text)}</p></div>`;
  }

  function renderMural() {
    const box = $('#view-mural');
    if (!state.posts.length) {
      box.innerHTML = state.lastLoad
        ? emptyHtml('Ainda não há prints', 'Faz um teste de código e publica aqui o print do resultado.')
        : '';
      return;
    }
    const cards = state.posts.map((p) => {
      const who = personOf(p.user_id);
      const alt = `Print de ${who.name}, ${whenLabel(p.created_at)}`;
      return `
        <article class="post">
          <div class="post-head">
            ${avatarHtml(p.user_id)}
            <div>
              <p class="who-name">${esc(who.name)}</p>
              <p class="post-time">${esc(whenLabel(p.created_at))}</p>
            </div>
          </div>
          <button type="button" class="post-media" data-open="${esc(p.id)}" aria-label="Ver print em ponto grande">
            <img src="${esc(p.urlFull)}" alt="${esc(alt)}" loading="lazy" decoding="async">
          </button>
          ${p.note ? `<p class="post-note">${esc(p.note)}</p>` : ''}
        </article>`;
    }).join('');
    box.innerHTML = `<div class="feed">${cards}</div>` +
      (state.hasMore ? '<button type="button" class="btn btn-ghost more" data-more>Ver mais antigos</button>' : '');
  }

  function renderBiblioteca() {
    const box = $('#view-biblioteca');
    const people = Array.from(state.profiles.values());
    const filtered = state.filter === 'all' ? state.posts : state.posts.filter((p) => p.user_id === state.filter);

    const chip = (id, label, count) =>
      `<button type="button" class="chip" data-filter="${esc(id)}" aria-pressed="${state.filter === id}">${esc(label)} (${count})</button>`;
    const chips = `<div class="chips" role="group" aria-label="Filtrar por pessoa">` +
      chip('all', 'Todas', state.posts.length) +
      people.map((p) => chip(p.id, p.name, state.posts.filter((x) => x.user_id === p.id).length)).join('') +
      `</div>`;

    if (!filtered.length) {
      const msg = state.filter === 'all'
        ? emptyHtml('A biblioteca está vazia', 'Os prints publicados ficam aqui, organizados por dia.')
        : emptyHtml('Sem prints ainda', `${personOf(state.filter).name} ainda não publicou nenhum print.`);
      box.innerHTML = chips + (state.lastLoad ? msg : '');
      return;
    }

    let html = chips;
    let currentKey = '';
    let open = false;
    filtered.forEach((p) => {
      const key = dayKey(new Date(p.created_at));
      if (key !== currentKey) {
        if (open) html += '</div>';
        html += `<h2 class="day">${esc(dayHeading(p.created_at))}</h2><div class="grid">`;
        currentKey = key;
        open = true;
      }
      const who = personOf(p.user_id);
      html += `
        <button type="button" class="tile" data-open="${esc(p.id)}" aria-label="Print de ${esc(who.name)}, ${esc(whenLabel(p.created_at))}">
          <img src="${esc(p.urlThumb)}" alt="" loading="lazy" decoding="async">
          ${avatarHtml(p.user_id, 'avatar-sm')}
        </button>`;
    });
    if (open) html += '</div>';
    if (state.hasMore) html += '<button type="button" class="btn btn-ghost more" data-more>Ver mais antigos</button>';
    box.innerHTML = html;
  }

  /* ------------------------------------------------ janelas */
  function openDialog(dlg) {
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); }
    else dlg.setAttribute('open', '');
  }
  function closeDialog(dlg) {
    if (dlg.open) { if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open'); }
  }

  function openViewer(id) {
    const post = state.posts.find((p) => p.id === id);
    if (!post) return;
    const who = personOf(post.user_id);
    state.openPostId = id;
    $('#view-img').src = post.urlFull;
    $('#view-img').alt = `Print de ${who.name}, ${whenLabel(post.created_at)}`;
    $('#view-avatar').innerHTML = avatarHtml(post.user_id, 'avatar-lg');
    $('#view-title').textContent = who.name;
    $('#view-when').textContent = whenLabel(post.created_at);
    const note = $('#view-note');
    note.textContent = post.note || '';
    note.hidden = !post.note;
    $('#view-open').href = post.urlFull;
    const del = $('#view-delete');
    del.hidden = post.user_id !== state.user.id;
    del.textContent = 'Apagar';
    del.dataset.armed = '';
    clearTimeout(deleteTimer);
    openDialog($('#dlg-view'));
  }

  async function onDeleteClick() {
    const del = $('#view-delete');
    if (del.dataset.armed !== '1') {
      del.dataset.armed = '1';
      del.textContent = 'Apagar mesmo?';
      clearTimeout(deleteTimer);
      deleteTimer = setTimeout(() => { del.dataset.armed = ''; del.textContent = 'Apagar'; }, 5000);
      return;
    }
    clearTimeout(deleteTimer);
    const post = state.posts.find((p) => p.id === state.openPostId);
    if (!post) return;
    del.disabled = true;
    del.textContent = 'A apagar…';
    try {
      const { error } = await sb.from('posts').delete().eq('id', post.id);
      if (error) throw error;
      // Os ficheiros são apagados a seguir; se falhar, o print já saiu da lista.
      await sb.storage.from(BUCKET).remove([post.image_path, post.thumb_path]).catch(() => {});
      state.posts = state.posts.filter((p) => p.id !== post.id);
      closeDialog($('#dlg-view'));
      render();
      toast('Print apagado.');
    } catch (err) {
      console.error(err);
      toast('Não foi possível apagar. Tenta outra vez.');
      del.textContent = 'Apagar';
      del.dataset.armed = '';
    } finally {
      del.disabled = false;
    }
  }

  /* ------------------------------------------------ publicar */
  function resetPublish() {
    pickedFile = null;
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    $('#file-input').value = '';
    $('#publish-preview').hidden = true;
    $('#publish-preview').removeAttribute('src');
    $('#drop-empty').hidden = false;
    $('.drop').classList.remove('has-image');
    $('#publish-note').value = '';
    showError($('#publish-error'), '');
    $('#publish-status').textContent = '';
    $('#btn-publish-submit').disabled = true;
    $('#btn-publish-submit').textContent = 'Publicar';
  }

  function onFilePicked() {
    const file = $('#file-input').files && $('#file-input').files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      showError($('#publish-error'), 'Escolhe uma imagem (por exemplo, o print do teste).');
      return;
    }
    showError($('#publish-error'), '');
    pickedFile = file;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    const img = $('#publish-preview');
    img.src = previewUrl;
    img.hidden = false;
    $('#drop-empty').hidden = true;
    $('.drop').classList.add('has-image');
    $('#btn-publish-submit').disabled = false;
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagem ilegível')); };
      img.src = url;
    });
  }

  function toJpeg(img, maxEdge, quality) {
    const w = img.naturalWidth, h = img.naturalHeight;
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('falha ao reduzir a imagem'))), 'image/jpeg', quality);
    });
  }

  async function onPublish(ev) {
    ev.preventDefault();
    if (!pickedFile) return;
    const btn = $('#btn-publish-submit');
    const status = $('#publish-status');
    btn.disabled = true;
    btn.textContent = 'A publicar…';
    showError($('#publish-error'), '');
    const uploaded = [];

    try {
      status.textContent = 'A preparar a imagem…';
      const img = await loadImage(pickedFile);
      const full = await toJpeg(img, 2000, 0.8);
      const thumb = await toJpeg(img, 480, 0.75);

      const base = `${state.user.id}/${uuid()}`;
      const imagePath = `${base}.jpg`;
      const thumbPath = `${base}_t.jpg`;

      status.textContent = 'A enviar…';
      const storage = sb.storage.from(BUCKET);
      let res = await storage.upload(imagePath, full, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false });
      if (res.error) throw res.error;
      uploaded.push(imagePath);
      res = await storage.upload(thumbPath, thumb, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false });
      if (res.error) throw res.error;
      uploaded.push(thumbPath);

      const note = $('#publish-note').value.trim();
      const ins = await sb.from('posts').insert({
        user_id: state.user.id,
        image_path: imagePath,
        thumb_path: thumbPath,
        note: note || null
      });
      if (ins.error) throw ins.error;

      closeDialog($('#dlg-publish'));
      resetPublish();
      toast('Publicado.');
      setView('mural');
      await loadPosts(true);
    } catch (err) {
      console.error(err);
      if (uploaded.length) sb.storage.from(BUCKET).remove(uploaded).catch(() => {});
      showError($('#publish-error'), 'Não foi possível publicar. Verifica a ligação e tenta outra vez.');
      status.textContent = '';
      btn.disabled = false;
      btn.textContent = 'Publicar';
    }
  }

  /* ------------------------------------------------ conta */
  function authMessage(err) {
    const msg = String((err && err.message) || '').toLowerCase();
    const code = String((err && err.code) || '');
    if (code === 'email_not_confirmed' || msg.includes('not confirmed')) {
      return 'O email desta conta ainda não foi confirmado. Pede a quem criou as contas para a confirmar.';
    }
    if (code === 'invalid_credentials' || msg.includes('invalid login')) {
      return 'Email ou palavra-passe errados. Confirma e tenta outra vez.';
    }
    if (navigator.onLine === false || msg.includes('fetch') || msg.includes('network')) {
      return 'Sem ligação à internet. Tenta outra vez.';
    }
    return 'Não foi possível entrar. Tenta outra vez.';
  }

  async function onLogin(ev) {
    ev.preventDefault();
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    const errEl = $('#login-error');
    if (!email || !password) { showError(errEl, 'Preenche o email e a palavra-passe.'); return; }
    const btn = $('#login-submit');
    btn.disabled = true;
    btn.textContent = 'A entrar…';
    showError(errEl, '');
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      $('#login-password').value = '';
      await enterApp(data.user);
    } catch (err) {
      showError(errEl, authMessage(err));
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  }

  function cleanName(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }

  async function onNameSubmit(ev) {
    ev.preventDefault();
    const name = cleanName($('#name-input').value);
    const errEl = $('#name-error');
    if (!name) { showError(errEl, 'Escreve o teu nome.'); return; }
    const btn = $('#name-submit');
    btn.disabled = true;
    showError(errEl, '');
    try {
      const { error } = await sb.from('profiles').insert({ id: state.user.id, name });
      // 23505 = o perfil já existia; seguimos em frente.
      if (error && error.code !== '23505') throw error;
      await loadProfiles();
      await startMain();
    } catch (err) {
      console.error(err);
      showError(errEl, 'Não foi possível guardar o nome. Tenta outra vez.');
    } finally {
      btn.disabled = false;
    }
  }

  function openMenu() {
    $('#menu-email').textContent = state.user.email || '';
    $('#menu-name').value = personOf(state.user.id).name;
    showError($('#menu-error'), '');
    $('#btn-install').hidden = !installPrompt;
    showError($('#notif-error'), '');
    paintNotifBox();
    openDialog($('#dlg-menu'));
  }

  async function onMenuSave(ev) {
    ev.preventDefault();
    const name = cleanName($('#menu-name').value);
    const errEl = $('#menu-error');
    if (!name) { showError(errEl, 'Escreve o teu nome.'); return; }
    const btn = $('#btn-menu-save');
    btn.disabled = true;
    try {
      const { error } = await sb.from('profiles').update({ name }).eq('id', state.user.id);
      if (error) throw error;
      await loadProfiles();
      paintHeader();
      render();
      closeDialog($('#dlg-menu'));
      toast('Nome guardado.');
    } catch (err) {
      console.error(err);
      showError(errEl, 'Não foi possível guardar o nome. Tenta outra vez.');
    } finally {
      btn.disabled = false;
    }
  }

  async function logout() {
    closeDialog($('#dlg-menu'));
    try { await sb.auth.signOut(); } catch (err) { console.error(err); }
    resetState();
    showScreen('login');
  }

  /* ------------------------------------------------ notificações (Web Push) */
  const pushSupported = () =>
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  function b64ToBytes(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }

  const sameKey = (buf, bytes) => {
    if (!buf) return false;
    const a = new Uint8Array(buf);
    return a.length === bytes.length && a.every((v, i) => v === bytes[i]);
  };

  async function currentPushSub() {
    if (!pushSupported()) return null;
    try {
      const reg = await navigator.serviceWorker.ready;
      return await reg.pushManager.getSubscription();
    } catch (e) { return null; }
  }

  async function saveSubToServer(sub) {
    const j = sub.toJSON();
    const { error } = await sb.rpc('save_push_subscription', {
      p_endpoint: j.endpoint,
      p_p256dh: j.keys && j.keys.p256dh,
      p_auth: j.keys && j.keys.auth,
      p_ua: navigator.userAgent
    });
    if (error) throw error;
  }

  async function subscribeThisDevice() {
    const { data: key, error } = await sb.rpc('get_vapid_public_key');
    if (error) throw error;
    if (!key) throw new Error('chave de envio ainda não existe');
    const bytes = b64ToBytes(key);
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub.options && sub.options.applicationServerKey, bytes)) {
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
    await saveSubToServer(sub);
  }

  // Ao abrir a app: se já deu permissão, garante que este telemóvel está
  // registado para a conta que está com sessão (também apanha mudanças de conta).
  async function syncPushQuietly() {
    try {
      if (!pushSupported() || Notification.permission !== 'granted' || !state.user) return;
      await subscribeThisDevice();
    } catch (err) { console.warn('push sync', err); }
  }

  function notifState() {
    if (!pushSupported()) return isIos() && !isStandalone() ? 'ios-install' : 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    return Notification.permission === 'granted' ? 'granted' : 'default';
  }

  async function paintNotifBox() {
    const st = notifState();
    const status = $('#notif-status');
    const on = $('#btn-notif-on'), test = $('#btn-notif-test'), off = $('#btn-notif-off');
    on.hidden = test.hidden = off.hidden = true;
    if (st === 'ios-install') {
      status.textContent = 'No iPhone, as notificações só funcionam com a app instalada: toca em Partilhar, depois em Adicionar ao ecrã principal, e abre a app a partir do ícone novo.';
    } else if (st === 'unsupported') {
      status.textContent = 'Este navegador não suporta notificações.';
    } else if (st === 'denied') {
      status.textContent = isIos()
        ? 'As notificações estão bloqueadas. Ativa-as em Definições do iPhone → Notificações → Rumo à Carta.'
        : 'As notificações estão bloqueadas neste navegador. Ativa-as nas definições do site.';
    } else {
      const sub = st === 'granted' ? await currentPushSub() : null;
      if (sub) {
        status.textContent = 'Ativas neste telemóvel. Recebes 3 a 5 lembretes por dia, entre as 07:00 e as 22:00.';
        test.hidden = false; off.hidden = false;
      } else {
        status.textContent = 'Recebe 3 a 5 lembretes por dia (entre as 07:00 e as 22:00) para fazeres um teste e publicares o print.';
        on.hidden = false;
      }
    }
  }

  async function enableNotifications(errEl) {
    // O pedido de permissão tem de acontecer logo no toque, por isso vem primeiro.
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      if (errEl) showError(errEl, 'Sem permissão não consigo enviar avisos. Podes mudar isto nas definições do telemóvel.');
      return false;
    }
    try {
      await subscribeThisDevice();
      return true;
    } catch (err) {
      console.error(err);
      if (errEl) showError(errEl, 'Não foi possível ativar. Confirma que a app está instalada no ecrã principal e tenta outra vez.');
      return false;
    }
  }

  async function onNotifOn() {
    const btn = $('#btn-notif-on');
    btn.disabled = true;
    try {
      if (await enableNotifications($('#notif-error'))) toast('Notificações ativadas.');
    } finally {
      btn.disabled = false;
      paintNotifBox();
      paintNotifTip();
    }
  }

  async function onNotifOff() {
    const btn = $('#btn-notif-off');
    btn.disabled = true;
    try {
      const sub = await currentPushSub();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await sb.rpc('remove_push_subscription', { p_endpoint: endpoint });
      }
      toast('Notificações desativadas neste telemóvel.');
    } catch (err) {
      console.error(err);
      showError($('#notif-error'), 'Não foi possível desativar. Tenta outra vez.');
    } finally {
      btn.disabled = false;
      paintNotifBox();
    }
  }

  async function onNotifTest() {
    const btn = $('#btn-notif-test');
    btn.disabled = true;
    showError($('#notif-error'), '');
    try {
      const { data, error } = await sb.functions.invoke('push-sender', { body: { action: 'test' } });
      if (error) throw error;
      if (!data || !data.sent) throw new Error('nada enviado');
      toast('Teste enviado. Deve chegar em segundos.');
    } catch (err) {
      console.error(err);
      showError($('#notif-error'), 'Não consegui enviar o teste. Tenta desativar e ativar outra vez.');
    } finally {
      btn.disabled = false;
    }
  }

  function paintNotifTip() {
    let later = false;
    try { later = localStorage.getItem('rumo-notif-tip') === '1'; } catch (e) { /* sem armazenamento */ }
    $('#notif-tip').hidden = !(pushSupported() && Notification.permission === 'default' && !later);
  }

  async function onTipNotifOn() {
    const btn = $('#btn-tip-notif-on');
    btn.disabled = true;
    try {
      const ok = await enableNotifications(null);
      toast(ok ? 'Notificações ativadas.' : 'Não foi possível ativar. Vê o menu da conta.');
    } finally {
      btn.disabled = false;
      paintNotifTip();
    }
  }

  function openNewPost() {
    if (!state.user) return;
    resetPublish();
    openDialog($('#dlg-publish'));
  }

  /* ------------------------------------------------ instalar a app */
  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIos = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function maybeShowIosTip() {
    let dismissed = false;
    try { dismissed = localStorage.getItem('rumo-ios-tip') === '1'; } catch (e) { /* sem armazenamento */ }
    $('#ios-tip').hidden = !(isIos() && !isStandalone() && !dismissed);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('sw', err));
    });
  }

  /* ------------------------------------------------ eventos */
  function bindEvents() {
    $('#form-login').addEventListener('submit', onLogin);
    $('#form-name').addEventListener('submit', onNameSubmit);
    $('#form-publish').addEventListener('submit', onPublish);
    $('#form-menu').addEventListener('submit', onMenuSave);

    $('#btn-retry').addEventListener('click', async () => {
      showScreen('loading');
      try {
        const { data } = await sb.auth.getSession();
        if (data.session) await enterApp(data.session.user); else showScreen('login');
      } catch (err) { showLoadError(err); }
    });
    $('#btn-error-logout').addEventListener('click', logout);

    $('#btn-refresh').addEventListener('click', () => loadPosts(true));
    $('#btn-menu').addEventListener('click', openMenu);
    $('#btn-menu-close').addEventListener('click', () => closeDialog($('#dlg-menu')));
    $('#btn-logout').addEventListener('click', logout);
    $('#btn-install').addEventListener('click', async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      try { await installPrompt.userChoice; } catch (e) { /* ignorar */ }
      installPrompt = null;
      $('#btn-install').hidden = true;
    });

    $('#btn-notif-on').addEventListener('click', onNotifOn);
    $('#btn-notif-off').addEventListener('click', onNotifOff);
    $('#btn-notif-test').addEventListener('click', onNotifTest);
    $('#btn-tip-notif-on').addEventListener('click', onTipNotifOn);
    $('#btn-tip-notif-later').addEventListener('click', () => {
      $('#notif-tip').hidden = true;
      try { localStorage.setItem('rumo-notif-tip', '1'); } catch (e) { /* ignorar */ }
    });
    // Toque numa notificação com a app já aberta: o service worker avisa-nos
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'novo') openNewPost();
      });
    }

    $('#btn-tip-close').addEventListener('click', () => {
      $('#ios-tip').hidden = true;
      try { localStorage.setItem('rumo-ios-tip', '1'); } catch (e) { /* ignorar */ }
    });

    $$('.tab').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));

    $('#btn-new').addEventListener('click', openNewPost);
    $('#btn-pick').addEventListener('click', () => $('#file-input').click());
    $('#file-input').addEventListener('change', onFilePicked);
    $('#btn-publish-cancel').addEventListener('click', () => { closeDialog($('#dlg-publish')); resetPublish(); });
    $('#dlg-publish').addEventListener('cancel', () => setTimeout(resetPublish, 0));

    $('#view-close').addEventListener('click', () => closeDialog($('#dlg-view')));
    $('#view-delete').addEventListener('click', onDeleteClick);

    // Fechar as janelas ao tocar no fundo escurecido
    ['#dlg-publish', '#dlg-menu'].forEach((sel) => {
      const dlg = $(sel);
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg) { closeDialog(dlg); if (sel === '#dlg-publish') resetPublish(); }
      });
    });

    // Delegação: abrir print, filtros e "ver mais"
    $('#main').addEventListener('click', (e) => {
      const open = e.target.closest('[data-open]');
      if (open) { openViewer(open.dataset.open); return; }
      const filter = e.target.closest('[data-filter]');
      if (filter) { state.filter = filter.dataset.filter; renderBiblioteca(); return; }
      if (e.target.closest('[data-more]')) loadPosts(false);
    });

    // Se um link privado expirar, volta a pedir a lista
    document.addEventListener('error', (e) => {
      if (e.target && e.target.tagName === 'IMG' && state.user && e.target.closest('#main') && Date.now() - state.lastLoad > 30000) {
        loadPosts(true);
      }
    }, true);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && state.user && !$('#screen-app').hidden && Date.now() - state.lastLoad > STALE_MS) {
        loadPosts(true);
      }
    });

    window.addEventListener('offline', () => toast('Sem ligação à internet.'));
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
  }

  boot();
})();
