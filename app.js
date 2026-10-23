/* rumo à carta — lógica da app (contas, mural, comentários e respostas, stickers, perfis, biblioteca, temas e notificações) */
(() => {
  'use strict';

  const cfg = window.RUMO_CONFIG || {};
  const AV = window.RUMO_AVATARS;
  const BUCKET = 'prints';
  const PAGE = 30;               // prints carregados de cada vez
  const SIGN_SECONDS = 3600;     // validade dos links privados das imagens
  const STALE_MS = 60 * 1000;    // ao voltar à app, atualiza se passou mais de 1 minuto
  const PASS_MARK = 27;          // certas (em 30) para passar no exame
  const TZ = 'Europe/Lisbon';
  const GOAL = 10;               // testes temáticos para ficar preparada num tema
  const STICKER_PX = 320;        // lado (em píxeis) de cada sticker guardado
  const POST_COLS = 'id,user_id,image_path,thumb_path,note,correct,kind,created_at';
  const COMMENT_COLS = 'id,post_id,user_id,body,parent_id,sticker_path,created_at';
  const THEMES_STALE_MS = 20 * 1000;

  // temas da categoria B, pela ordem do bom condutor (bomcondutor.pt)
  const THEMES = [
    { key: 'cedencia-de-passagem', name: 'cedência de passagem', sub: '' },
    { key: 'circulacao-e-seguranca', name: 'circulação e segurança', sub: 'veículos em missão urgente de socorro' },
    { key: 'classificacao', name: 'classificação', sub: 'constituintes, inspeções, pesos e dimensões, proteção de ambiente, equipamentos de segurança, acidente' },
    { key: 'estado-fisico-do-condutor', name: 'estado físico do condutor', sub: 'álcool, drogas e medicamentos, sinais de obrigação' },
    { key: 'iluminacao', name: 'iluminação', sub: 'passageiros e carga, condução defensiva e peões' },
    { key: 'outras-manobras', name: 'outras manobras', sub: '' },
    { key: 'paragem-e-estacionamento', name: 'paragem e estacionamento', sub: 'cruzamento de veículos' },
    { key: 'sinais-de-indicacao', name: 'sinais de indicação', sub: '' },
    { key: 'sinais-de-perigo', name: 'sinais de perigo', sub: '' },
    { key: 'sinais-de-prescricao-especifica', name: 'sinais de prescrição específica', sub: 'sinais de cedência de passagem' },
    { key: 'sinais-de-proibicao', name: 'sinais de proibição', sub: '' },
    { key: 'sinalizacao-luminosa', name: 'sinalização luminosa', sub: 'marcas no pavimento e outra sinalização' },
    { key: 'titulos-de-conducao', name: 'títulos de condução', sub: 'obtenção, revalidação, responsabilidade civil e criminal, contra-ordenações, cassação' },
    { key: 'ultrapassagem', name: 'ultrapassagem', sub: '' },
    { key: 'velocidade', name: 'velocidade', sub: '' },
    { key: 'vias-de-transito', name: 'vias de trânsito', sub: 'condições ambientais adversas' }
  ];
  const THEME_BY_KEY = new Map(THEMES.map((t) => [t.key, t]));

  const $ =(sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    user: null,
    profiles: new Map(),   // id -> { id, name, avatar, idx }
    posts: [],
    comments: new Map(),   // post_id -> [comentários, do mais antigo para o mais recente]
    stats: new Map(),      // user_id -> linha de profile_stats()
    themes: new Map(),     // user_id -> Map(tema -> testes temáticos feitos)
    themesAt: 0,
    themesErr: false,
    expanded: new Set(),   // prints com todos os comentários à vista
    drafts: new Map(),     // post_id -> comentário por enviar
    reply: new Map(),      // post_id -> id do comentário a que se está a responder
    extra: new Map(),      // prints abertos a partir de um aviso e que não estão no mural carregado
    notifs: [],            // avisos (lembretes, comentários, respostas), do mais recente para o mais antigo
    notifsAt: 0,
    notifsErr: false,
    stickers: [],          // álbum de stickers (de todas)
    stickerUrls: new Map(),// caminho -> link privado temporário
    stkManage: false,
    stkPick: null,
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
  let commentDelTimer = null;
  let pickedFile = null;
  let previewUrl = null;
  let menuAvatar = null;
  let nameAvatar = null;

  /* ------------------------------------------------ utilitários */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

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

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  /* ------------------------------------------------ datas (sempre hora de lisboa) */
  const fmtTime = new Intl.DateTimeFormat('pt-PT', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  const fmtDayShort = new Intl.DateTimeFormat('pt-PT', { timeZone: TZ, day: 'numeric', month: 'short' });
  const fmtDayLong = new Intl.DateTimeFormat('pt-PT', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
  const fmtKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

  const dayKey = (d) => fmtKey.format(d);
  function addDays(key, n) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  }

  function whenLabel(iso) {
    const d = new Date(iso);
    const key = dayKey(d);
    const today = dayKey(new Date());
    const time = fmtTime.format(d);
    if (key === today) return 'hoje, ' + time;
    if (key === addDays(today, -1)) return 'ontem, ' + time;
    return fmtDayShort.format(d) + ', ' + time;
  }

  function dayHeading(iso) {
    const d = new Date(iso);
    const key = dayKey(d);
    const today = dayKey(new Date());
    if (key === today) return 'hoje';
    if (key === addDays(today, -1)) return 'ontem';
    return fmtDayLong.format(d);
  }

  /* ------------------------------------------------ pessoas e avatares */
  function personOf(uid) {
    return state.profiles.get(uid) || { id: uid, name: 'alguém', avatar: null, idx: 0 };
  }

  function avatarKeyOf(uid) {
    const p = personOf(uid);
    return p.avatar && AV.has(p.avatar) ? p.avatar : AV.keyAt(p.idx);
  }

  function avatarHtml(uid, extra = '') {
    return `<span class="avatar ${extra}" aria-hidden="true">${AV.svg(avatarKeyOf(uid))}</span>`;
  }

  function renderAvatarPicker(box, selected, onPick) {
    box.innerHTML = AV.list.map((a) =>
      `<button type="button" class="av-opt" role="radio" aria-checked="${a.key === selected}" data-av="${a.key}" aria-label="${esc(a.label)}">${AV.svg(a.key)}</button>`
    ).join('');
    box.onclick = (e) => {
      const b = e.target.closest('.av-opt');
      if (!b) return;
      $$('.av-opt', box).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      onPick(b.dataset.av);
    };
  }

  function paintHeroes() {
    $$('[data-hero]').forEach((el) => { el.innerHTML = AV.svg(el.dataset.hero || 'carro'); });
  }

  /* ------------------------------------------------ arranque */
  function configured() {
    const url = String(cfg.SUPABASE_URL || '');
    const key = String(cfg.SUPABASE_KEY || '');
    return /^https:\/\/.+/.test(url) && key.length > 20 && !/COLA_AQUI/.test(url + key);
  }

  async function boot() {
    paintHeroes();
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
    state.comments = new Map();
    state.stats = new Map();
    state.themes = new Map();
    state.themesAt = 0;
    state.themesErr = false;
    state.expanded = new Set();
    state.drafts = new Map();
    state.reply = new Map();
    state.extra = new Map();
    state.notifs = [];
    state.notifsAt = 0;
    state.notifsErr = false;
    state.stickers = [];
    state.stickerUrls = new Map();
    state.stkManage = false;
    state.stkPick = null;
    state.hasMore = false;
    state.filter = 'all';
    state.view = 'mural';
    closeDialog($('#dlg-stickers'));
    closeDialog($('#dlg-maker'));
    closeDialog($('#dlg-view'));
    closeDialog($('#dlg-publish'));
    closeDialog($('#dlg-menu'));
    closeDialog($('#dlg-dice'));
  }

  function showLoadError(err) {
    console.error(err);
    $('#error-text').textContent = navigator.onLine === false
      ? 'sem ligação à internet. liga-te e tenta outra vez.'
      : 'algo correu mal ao falar com o servidor. tenta outra vez dentro de instantes.';
    showScreen('error');
  }

  async function enterApp(user) {
    state.user = user;
    showScreen('loading');
    try {
      await loadProfiles();
      if (!state.profiles.has(user.id)) {
        nameAvatar = AV.keyAt(state.profiles.size);
        renderAvatarPicker($('#name-avatars'), nameAvatar, (k) => { nameAvatar = k; });
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
    const params = new URLSearchParams(location.search);
    const verId = params.get('ver');
    if (params.has('novo') || verId) {
      try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignorar */ }
    }
    if (params.has('novo')) openNewPost();
    await loadPosts(true);
    if (verId) openFromLink(verId);
  }

  /* ------------------------------------------------ dados */
  async function loadProfiles() {
    const { data, error } = await sb.from('profiles').select('id,name,avatar,created_at').order('created_at', { ascending: true });
    if (error) throw error;
    state.profiles = new Map(data.map((p, i) => [p.id, { id: p.id, name: p.name, avatar: p.avatar || null, idx: i }]));
  }

  async function signUrls(rows) {
    const paths = [];
    rows.forEach((r) => { paths.push(r.image_path, r.thumb_path); });
    if (!paths.length) return new Map();
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(paths, SIGN_SECONDS);
    if (error) throw error;
    return new Map(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  }

  async function signStickers(paths) {
    const need = Array.from(new Set(paths.filter(Boolean))).filter((p) => !state.stickerUrls.has(p));
    if (!need.length) return;
    try {
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(need, SIGN_SECONDS);
      if (error) throw error;
      data.forEach((d) => { if (d.signedUrl) state.stickerUrls.set(d.path, d.signedUrl); });
    } catch (err) {
      console.warn('stickers', err);
    }
  }

  async function loadComments(ids, reset) {
    if (reset) { state.comments = new Map(); state.stickerUrls = new Map(); }
    if (!ids.length) return;
    try {
      const { data, error } = await sb
        .from('comments')
        .select(COMMENT_COLS)
        .in('post_id', ids)
        .order('created_at', { ascending: true });
      if (error) throw error;
      ids.forEach((id) => state.comments.set(id, []));
      data.forEach((c) => state.comments.get(c.post_id).push(c));
      await signStickers(data.map((c) => c.sticker_path));
    } catch (err) {
      console.warn('comentários', err);   // os prints aparecem na mesma
    }
  }

  async function loadStats() {
    try {
      const { data, error } = await sb.rpc('profile_stats');
      if (error) throw error;
      state.stats = new Map(data.map((r) => [r.user_id, r]));
      paintStreak();
      if (state.view === 'perfis') renderPerfis();
    } catch (err) {
      console.warn('estatísticas', err);
    }
  }

  async function loadPosts(reset) {
    if (state.loading) return;
    state.loading = true;
    $('#btn-refresh').setAttribute('aria-busy', 'true');
    if (reset) { loadStats(); loadThemes(); loadNotifs(); }
    try {
      const from = reset ? 0 : state.posts.length;
      const { data, error } = await sb
        .from('posts')
        .select(POST_COLS)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;

      const urls = await signUrls(data);
      await loadComments(data.map((r) => r.id), reset);
      const rows = data.map((r) => ({
        ...r,
        urlFull: urls.get(r.image_path) || '',
        urlThumb: urls.get(r.thumb_path) || ''
      }));

      state.posts = reset ? rows : state.posts.concat(rows);
      if (reset) state.extra = new Map();
      state.hasMore = data.length === PAGE;
      state.lastLoad = Date.now();
      render();
    } catch (err) {
      console.error(err);
      toast(navigator.onLine === false ? 'sem ligação. tenta outra vez.' : 'não foi possível atualizar. tenta outra vez.');
    } finally {
      state.loading = false;
      $('#btn-refresh').removeAttribute('aria-busy');
    }
  }

  /* ------------------------------------------------ desenho */
  function paintHeader() {
    const me = personOf(state.user.id);
    $('#btn-menu').innerHTML = avatarHtml(state.user.id, 'avatar-lg');
    $('#btn-menu').setAttribute('aria-label', 'o teu perfil: ' + me.name);
    paintStreak();
  }

  function paintStreak() {
    const pill = $('#hdr-streak');
    const s = state.user && state.stats.get(state.user.id);
    pill.hidden = !s;
    if (!s) return;
    $('#hdr-streak-n').textContent = String(s.streak || 0);
    pill.classList.toggle('off', !s.streak);
    pill.title = s.streak ? plural(s.streak, 'dia seguido', 'dias seguidos') + ' com prints' : 'publica hoje para começar o streak';
  }

  function setView(view) {
    state.view = view;
    $('#view-mural').hidden = view !== 'mural';
    $('#view-biblioteca').hidden = view !== 'biblioteca';
    $('#view-perfis').hidden = view !== 'perfis';
    $('#view-temas').hidden = view !== 'temas';
    $('#view-avisos').hidden = view !== 'avisos';
    $$('.tab').forEach((t) => {
      if (t.dataset.view === view) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    if (view === 'avisos') $('#btn-bell').setAttribute('aria-current', 'page');
    else $('#btn-bell').removeAttribute('aria-current');
    render();
    if (view === 'temas' && Date.now() - state.themesAt > THEMES_STALE_MS) loadThemes();
    if (view === 'avisos' && Date.now() - state.notifsAt > THEMES_STALE_MS) loadNotifs();
    window.scrollTo(0, 0);
  }

  function render() {
    if (!state.user) return;
    if (state.view === 'mural') renderMural();
    else if (state.view === 'biblioteca') renderBiblioteca();
    else if (state.view === 'temas') renderTemas();
    else if (state.view === 'avisos') renderAvisos();
    else renderPerfis();
  }

  function emptyHtml(title, text, avatar = 'nuvem') {
    return `<div class="empty"><span class="avatar">${AV.svg(avatar)}</span><h2 class="h2">${esc(title)}</h2><p>${esc(text)}</p></div>`;
  }

  function scoreHtml(c) {
    if (c == null) return '';
    const pass = c >= PASS_MARK;
    const tick = pass ? '<svg width="16" height="16" class="ico ico-bold" aria-hidden="true"><use href="#i-check"/></svg>' : '';
    return `<span class="score ${pass ? 'pass' : ''}" title="${c} certas em 30">${tick}${c}<small>/30</small></span>`;
  }

  /* comentários: conversas (um comentário e as respostas) */
  const postById = (id) => state.posts.find((p) => p.id === id) || state.extra.get(id) || null;
  const stickerUrl = (path) => state.stickerUrls.get(path) || '';

  function threadsOf(list) {
    const byId = new Map(list.map((c) => [c.id, c]));
    const rootOf = (c) => {
      let cur = c;
      for (let n = 0; n < 30 && cur.parent_id && byId.has(cur.parent_id); n++) cur = byId.get(cur.parent_id);
      return cur;
    };
    const threads = new Map();
    list.forEach((c) => {
      const r = rootOf(c);
      if (!threads.has(r.id)) threads.set(r.id, { root: r, replies: [], last: r.created_at });
      const t = threads.get(r.id);
      if (r.id !== c.id) t.replies.push(c);
      if (c.created_at > t.last) t.last = c.created_at;
    });
    // as conversas com atividade mais recente ficam em baixo, perto da caixa de escrever
    return Array.from(threads.values()).sort((a, b) => (a.last < b.last ? -1 : a.last > b.last ? 1 : 0));
  }

  const DEL_ICON = '<svg width="16" height="16" class="ico" aria-hidden="true"><use href="#i-x"/></svg>';

  function commentItem(c, post, byId, isReply) {
    const mine = c.user_id === state.user.id;
    const canDelete = mine || post.user_id === state.user.id;
    const parent = c.parent_id ? byId.get(c.parent_id) : null;
    const showTo = isReply && parent && parent.parent_id;   // só quando não é uma resposta direta ao comentário de cima
    const content = c.sticker_path
      ? `<img class="csticker" src="${esc(stickerUrl(c.sticker_path))}" alt="sticker de ${esc(personOf(c.user_id).name)}" loading="lazy" decoding="async">`
      : `<span class="ctext">${esc(c.body)}</span>`;
    return `<div class="citem ${mine ? 'mine' : ''} ${isReply ? 'reply' : ''}" data-cid="${esc(c.id)}">
        ${avatarHtml(c.user_id, 'avatar-xs')}
        <div class="cbubble ${c.sticker_path ? 'has-sticker' : ''}"><b>${esc(personOf(c.user_id).name)}</b>${showTo ? `<span class="cto">↪ ${esc(personOf(parent.user_id).name)}</span>` : ''}${content}
          <div class="cmeta"><time datetime="${esc(c.created_at)}">${esc(whenLabel(c.created_at))}</time><button type="button" class="c-reply" data-reply="${esc(c.id)}">responder</button></div>
        </div>
        ${canDelete ? `<button type="button" class="c-del" data-cdel="${esc(c.id)}" aria-label="apagar comentário">${DEL_ICON}</button>` : ''}
      </div>`;
  }

  function commentsBody(post) {
    const list = state.comments.get(post.id) || [];
    const byId = new Map(list.map((c) => [c.id, c]));
    const threads = threadsOf(list);
    const collapsed = threads.length > 3 && !state.expanded.has(post.id);
    const shown = collapsed ? threads.slice(-2) : threads;
    const more = collapsed
      ? `<button type="button" class="c-more" data-expand="${esc(post.id)}">ver os ${list.length} comentários</button>`
      : '';
    const items = shown.map((t) => {
      const replies = t.replies.length
        ? `<ul class="creplies">${t.replies.map((r) => `<li>${commentItem(r, post, byId, true)}</li>`).join('')}</ul>`
        : '';
      return `<li class="cthread">${commentItem(t.root, post, byId, false)}${replies}</li>`;
    }).join('');
    return more + (items ? `<ul class="clist">${items}</ul>` : '');
  }

  function replyChip(post) {
    const cid = state.reply.get(post.id);
    const target = cid && (state.comments.get(post.id) || []).find((c) => c.id === cid);
    if (!target) return '';
    return `<div class="rchip"><svg width="16" height="16" class="ico" aria-hidden="true"><use href="#i-reply"/></svg><span>a responder a <b>${esc(personOf(target.user_id).name)}</b></span><button type="button" data-reply-cancel="${esc(post.id)}" aria-label="cancelar a resposta">${DEL_ICON}</button></div>`;
  }

  function commentsSection(post) {
    const draft = state.drafts.get(post.id) || '';
    return `<section class="comments" data-comments="${esc(post.id)}" aria-label="comentários">
      <div class="c-body">${commentsBody(post)}</div>
      <div class="c-chip">${replyChip(post)}</div>
      <form class="cform" data-post="${esc(post.id)}" autocomplete="off">
        <button type="button" class="stk-btn" data-sticker-pick="${esc(post.id)}" aria-label="enviar um sticker"><svg width="22" height="22" class="ico" aria-hidden="true"><use href="#i-sticker"/></svg></button>
        <input type="text" maxlength="300" placeholder="escreve um comentário…" aria-label="escrever um comentário" autocapitalize="none" enterkeyhint="send" value="${esc(draft)}">
        <button type="submit" class="send" aria-label="enviar comentário" ${draft.trim() ? '' : 'disabled'}><svg width="20" height="20" class="ico" aria-hidden="true"><use href="#i-send"/></svg></button>
      </form>
    </section>`;
  }

  function refreshComments(postId) {
    const post = postById(postId);
    if (!post) return;
    $$('[data-comments="' + postId + '"]').forEach((sec) => {
      $('.c-body', sec).innerHTML = commentsBody(post);
      $('.c-chip', sec).innerHTML = replyChip(post);
    });
  }

  function renderMural() {
    const box = $('#view-mural');
    if (!state.posts.length) {
      box.innerHTML = state.lastLoad
        ? emptyHtml('ainda não há prints', 'faz um teste de código e publica aqui o print do resultado.', 'carro')
        : '';
      return;
    }
    const cards = state.posts.map((p) => {
      const who = personOf(p.user_id);
      const isSticker = p.kind === 'sticker';
      const alt = `${isSticker ? 'sticker' : 'print'} de ${who.name}, ${whenLabel(p.created_at)}`;
      return `
        <article class="post card ${isSticker ? 'sticker-post' : ''}">
          <div class="post-head">
            ${avatarHtml(p.user_id)}
            <div class="grow">
              <p class="who-name">${esc(who.name)}</p>
              <p class="post-time">${esc(whenLabel(p.created_at))}</p>
            </div>
            ${scoreHtml(p.correct)}
          </div>
          <button type="button" class="post-media ${isSticker ? 'sticker-media' : ''}" data-open="${esc(p.id)}" aria-label="${isSticker ? 'ver sticker em ponto grande' : 'ver print em ponto grande'}">
            <img src="${esc(p.urlFull)}" alt="${esc(alt)}" loading="lazy" decoding="async">
          </button>
          ${p.note ? `<p class="post-note">${esc(p.note)}</p>` : ''}
          ${commentsSection(p)}
        </article>`;
    }).join('');
    box.innerHTML = `<div class="feed">${cards}</div>` +
      (state.hasMore ? '<button type="button" class="btn btn-ghost more" data-more>ver mais antigos</button>' : '');
  }

  function renderBiblioteca() {
    const box = $('#view-biblioteca');
    const people = Array.from(state.profiles.values());
    const prints = state.posts.filter((p) => p.kind !== 'sticker');   // os stickers ficam só no mural
    const filtered = state.filter === 'all' ? prints : prints.filter((p) => p.user_id === state.filter);

    const chip = (id, label, count) =>
      `<button type="button" class="chip" data-filter="${esc(id)}" aria-pressed="${state.filter === id}">${esc(label)} (${count})</button>`;
    const chips = `<div class="chips" role="group" aria-label="filtrar por pessoa">` +
      chip('all', 'todas', prints.length) +
      people.map((p) => chip(p.id, p.name, prints.filter((x) => x.user_id === p.id).length)).join('') +
      `</div>`;

    if (!filtered.length) {
      const msg = state.filter === 'all'
        ? emptyHtml('a biblioteca está vazia', 'os prints publicados ficam aqui, organizados por dia.', 'nuvem')
        : emptyHtml('sem prints ainda', `${personOf(state.filter).name} ainda não publicou nenhum print.`, 'nuvem');
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
        <button type="button" class="tile" data-open="${esc(p.id)}" aria-label="print de ${esc(who.name)}, ${esc(whenLabel(p.created_at))}${p.correct != null ? ', ' + p.correct + ' em 30' : ''}">
          <img src="${esc(p.urlThumb)}" alt="" loading="lazy" decoding="async">
          ${avatarHtml(p.user_id, 'avatar-sm')}
          ${scoreHtml(p.correct)}
        </button>`;
    });
    if (open) html += '</div>';
    if (state.hasMore) html += '<button type="button" class="btn btn-ghost more" data-more>ver mais antigos</button>';
    box.innerHTML = html;
  }

  /* perfis: streak, dias ativos e índice de preparação */
  const tierOf = (r) => (r == null ? null : r >= 70 ? 'ok' : r >= 40 ? 'mid' : 'low');
  const VERDICT = {
    ok: 'pronta para o exame!',
    mid: 'quase lá, continua!',
    low: 'ainda a aquecer, vai treinando.'
  };

  function profileCard(p, today) {
    const s = state.stats.get(p.id) || {};
    const mine = p.id === state.user.id;
    const streak = Number(s.streak) || 0;
    const active = Number(s.active_days) || 0;
    const best = Number(s.best_streak) || 0;
    const tests = Number(s.tests) || 0;
    const passed = Number(s.passed) || 0;
    const avg = s.avg_correct == null ? null : Number(s.avg_correct);
    const readiness = s.readiness == null ? null : Number(s.readiness);
    const tier = tierOf(readiness);
    const last14 = new Set(s.last14 || []);
    const postedToday = s.last_active === today;

    let dots = '';
    for (let i = 13; i >= 0; i--) {
      const key = addDays(today, -i);
      const on = last14.has(key);
      dots += `<span class="pd ${on ? 'on' : ''} ${i === 0 ? 'today' : ''}" title="${esc(key)}${on ? ' · ativa' : ''}">${on ? '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-check"/></svg>' : ''}</span>`;
    }
    const n14 = [...last14].length;
    const note = !streak && !postedToday
      ? (mine ? 'publica hoje para começares um streak!' : `${p.name} ainda não publicou hoje.`)
      : streak && !postedToday
        ? (mine ? 'publica hoje para não perderes o streak!' : `${p.name} ainda não publicou hoje.`)
        : 'já publicou hoje.';

    const idxVal = readiness == null ? '–' : String(readiness);
    return `
      <article class="pcard card">
        <div class="pcard-top">
          ${avatarHtml(p.id, 'avatar-xl')}
          <div class="grow">
            <h3 class="pname">${esc(p.name)}${mine ? ' <span class="me">(tu)</span>' : ''}</h3>
            <p class="psub">${esc(plural(tests, 'teste com nota', 'testes com nota'))} · ${esc(plural(passed, 'aprovado', 'aprovados'))}</p>
          </div>
          <div class="pstreak ${streak ? '' : 'off'}">
            <span class="n"><svg width="26" height="26" aria-hidden="true"><use href="#i-flame"/></svg>${streak}</span>
            <span>${streak === 1 ? 'dia seguido' : 'dias seguidos'}</span>
          </div>
        </div>

        <div>
          <div class="pdays-label"><span>últimos 14 dias</span><span>${esc(plural(n14, 'dia ativo', 'dias ativos'))}</span></div>
          <div class="pdays" role="img" aria-label="${esc(plural(n14, 'dia ativo', 'dias ativos'))} nos últimos 14 dias">${dots}</div>
          <p class="small muted" style="margin-top:6px">${esc(note)}</p>
        </div>

        <div class="stats3">
          <div class="stat"><b>${active}</b><span>${active === 1 ? 'dia ativo' : 'dias ativos'}</span></div>
          <div class="stat"><b>${best}</b><span>melhor streak</span></div>
          <div class="stat"><b>${avg == null ? '–' : String(avg).replace('.', ',')}</b><span>média /30</span></div>
        </div>

        <div>
          <div class="index-top">
            <h4 class="h3" style="margin:0">índice de preparação</h4>
            <span class="index-val">${idxVal}<small> /100</small></span>
          </div>
          <div class="meter" role="img" aria-label="índice de preparação: ${readiness == null ? 'ainda sem nota' : readiness + ' em 100'}">
            <div class="meter-fill ${tier || ''}" style="width:${readiness == null ? 0 : readiness}%"></div>
            <div class="meter-mark"></div>
          </div>
          <div class="meter-scale" aria-hidden="true"><span style="left:0">0</span><span style="left:70%">70 · pronta</span><span style="right:0;left:auto;transform:none">100</span></div>
          <p class="verdict ${tier || ''}">${esc(tier ? VERDICT[tier] : 'publica um teste com nota para teres índice.')}</p>
        </div>

        <button type="button" class="btn btn-ghost" data-user-prints="${esc(p.id)}">ver os prints de ${esc(p.name)}</button>
      </article>`;
  }

  function renderPerfis() {
    const box = $('#view-perfis');
    const today = dayKey(new Date());
    const people = Array.from(state.profiles.values())
      .sort((a, b) => (b.id === state.user.id) - (a.id === state.user.id) || a.idx - b.idx);
    box.innerHTML = `
      <div class="people">
        <div class="people-head">
          <h2 class="h2">as duas <svg class="deco" width="22" height="22" aria-hidden="true"><use href="#i-heart"/></svg></h2>
          <p class="small muted">um dia conta como ativo quando publicas pelo menos um print.</p>
        </div>
        ${people.map((p) => profileCard(p, today)).join('')}
      </div>`;
  }

  /* ------------------------------------------------ temáticos (separados dos testes normais) */
  const doneOf = (uid, key) => {
    const m = state.themes.get(uid);
    return Math.min(GOAL, (m && m.get(key)) || 0);
  };
  function setDone(uid, key, n) {
    if (!state.themes.has(uid)) state.themes.set(uid, new Map());
    state.themes.get(uid).set(key, n);
  }
  const readyCount = (uid) => THEMES.filter((t) => doneOf(uid, t.key) >= GOAL).length;
  const totalDone = (uid) => THEMES.reduce((sum, t) => sum + doneOf(uid, t.key), 0);

  async function loadThemes() {
    try {
      const { data, error } = await sb.from('theme_progress').select('user_id,theme,done');
      if (error) throw error;
      const m = new Map();
      data.forEach((r) => {
        if (!m.has(r.user_id)) m.set(r.user_id, new Map());
        m.get(r.user_id).set(r.theme, Number(r.done) || 0);
      });
      state.themes = m;
      state.themesErr = false;
      state.themesAt = Date.now();
    } catch (err) {
      console.warn('temáticos', err);
      state.themesErr = true;
    }
    if (state.user && state.view === 'temas') renderTemas();
  }

  function themeCard(t, me, others) {
    const done = doneOf(me, t.key);
    const ready = done >= GOAL;
    const pct = done ? Math.max(6, Math.round((done / GOAL) * 100)) : 0;
    const friends = others.map((o) => {
      const d = doneOf(o.id, t.key);
      return `<span class="tfriend" title="${esc(o.name)}: ${d} de ${GOAL}">${avatarHtml(o.id, 'avatar-xs')}<span><b>${d}</b>/${GOAL}</span>${d >= GOAL ? '<svg class="ico ico-bold" width="14" height="14" aria-hidden="true"><use href="#i-check"/></svg>' : ''}</span>`;
    }).join('');
    return `
      <article class="theme card ${ready ? 'ready' : ''}" data-theme="${esc(t.key)}">
        <div class="theme-top">
          <div class="grow">
            <h3 class="tname">${esc(t.name)}</h3>
            ${t.sub ? `<p class="tsub">${esc(t.sub)}</p>` : ''}
          </div>
          <span class="tcount">${ready ? '<svg class="ico ico-bold" width="20" height="20" aria-hidden="true"><use href="#i-check"/></svg>' : ''}<b>${done}</b><small>/${GOAL}</small></span>
        </div>
        <div class="tbar" role="img" aria-label="${done} de ${GOAL} testes neste tema"><i class="${ready ? 'ok' : ''}" style="width:${ready ? 100 : pct}%"></i></div>
        <div class="theme-bot">
          <span class="tfriends">${friends}</span>
          <span class="tbtns">
            ${ready ? '<span class="tready">preparada!</span>' : ''}
            <button type="button" class="tstep tminus" data-theme-minus="${esc(t.key)}" aria-label="menos um teste: ${esc(t.name)}" ${done ? '' : 'disabled'}><svg width="20" height="20" class="ico ico-bold" aria-hidden="true"><use href="#i-minus"/></svg></button>
            <button type="button" class="tstep tplus" data-theme-plus="${esc(t.key)}" aria-label="mais um teste: ${esc(t.name)}" ${ready ? 'disabled' : ''}><svg width="22" height="22" class="ico ico-bold" aria-hidden="true"><use href="#i-plus"/></svg></button>
          </span>
        </div>
      </article>`;
  }

  function renderTemas() {
    const box = $('#view-temas');
    const me = state.user.id;
    const people = Array.from(state.profiles.values())
      .sort((a, b) => (b.id === me) - (a.id === me) || a.idx - b.idx);
    const others = people.filter((p) => p.id !== me);
    const head = `
      <div class="themes-head">
        <div class="grow">
          <h2 class="h2">temas</h2>
          <p class="small muted">testes temáticos, à parte dos testes normais. aponta cada teste que fizeres; aos ${GOAL}, estás preparada nesse tema.</p>
        </div>
        <button type="button" class="dice-btn" id="btn-dice" aria-label="sortear um tema"><svg width="30" height="30" class="ico" aria-hidden="true"><use href="#i-dice"/></svg></button>
      </div>`;
    if (state.themesErr && !state.themes.size) {
      box.innerHTML = `<div class="themes">${head}<div class="empty"><h2 class="h2">não foi possível carregar</h2><p>verifica a ligação e tenta outra vez.</p><button type="button" class="btn btn-ghost" data-retry-themes>tentar outra vez</button></div></div>`;
      return;
    }
    const sum = people.map((p) => `
      <div class="tsum-p">${avatarHtml(p.id, 'avatar-sm')}
        <div><b>${esc(p.name)}${p.id === me ? ' (tu)' : ''}</b><span>${readyCount(p.id)}/${THEMES.length} temas</span><span>${esc(plural(totalDone(p.id), 'teste', 'testes'))}</span></div>
      </div>`).join('');
    box.innerHTML = `
      <div class="themes">
        ${head}
        <div class="tsum">${sum}</div>
        ${THEMES.map((t) => themeCard(t, me, others)).join('')}
      </div>`;
  }

  async function bumpTheme(key, delta) {
    const me = state.user.id;
    const cur = doneOf(me, key);
    const next = Math.min(GOAL, Math.max(0, cur + delta));
    if (next === cur) return;
    setDone(me, key, next);
    if (state.view === 'temas') renderTemas();
    if ($('#dlg-dice').open) paintDice();
    try {
      const { error } = await sb.rpc('theme_bump', { p_theme: key, p_delta: next - cur });
      if (error) throw error;
      state.themesAt = Date.now();
      if (next >= GOAL && cur < GOAL) toast('preparada em ' + THEME_BY_KEY.get(key).name + '!');
    } catch (err) {
      console.error(err);
      toast('não foi possível guardar. tenta outra vez.');
      loadThemes();
    }
  }

  /* dado: sorteia um tema que ainda não esteja preparado */
  let diceKey = null;
  let diceTimer = null;

  function pickTheme() {
    const me = state.user.id;
    let pool = THEMES.filter((t) => doneOf(me, t.key) < GOAL);
    if (!pool.length) pool = THEMES.slice();
    if (pool.length > 1 && diceKey) pool = pool.filter((t) => t.key !== diceKey);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function paintDice() {
    const t = THEME_BY_KEY.get(diceKey);
    if (!t) return;
    const me = state.user.id;
    const done = doneOf(me, t.key);
    const all = THEMES.every((x) => doneOf(me, x.key) >= GOAL);
    $('#dice-result').innerHTML = `
      <p class="dr-label">${all ? 'já estás preparada em todos! que tal rever este?' : 'calhou-te'}</p>
      <h3 class="dr-name">${esc(t.name)}</h3>
      ${t.sub ? `<p class="dr-sub">${esc(t.sub)}</p>` : ''}
      <p class="dr-prog">${done >= GOAL ? 'preparada neste tema!' : `${done}/${GOAL} neste tema`}</p>`;
    $('#dice-plus').disabled = done >= GOAL;
    $('#dice-plus').hidden = false;
  }

  function rollDice() {
    const result = $('#dice-result');
    const face = $('#dice-face');
    clearInterval(diceTimer);
    const final = pickTheme();
    $('#dice-plus').disabled = true;
    $('#dice-again').disabled = true;
    face.classList.add('rolling');
    result.innerHTML = '<p class="dr-label">a sortear…</p><h3 class="dr-name roll">&nbsp;</h3>';
    let n = 0;
    diceTimer = setInterval(() => {
      n += 1;
      if (n < 9) {
        const r = THEMES[Math.floor(Math.random() * THEMES.length)];
        result.innerHTML = `<p class="dr-label">a sortear…</p><h3 class="dr-name roll">${esc(r.name)}</h3>`;
        return;
      }
      clearInterval(diceTimer);
      face.classList.remove('rolling');
      diceKey = final.key;
      paintDice();
      $('#dice-again').disabled = false;
    }, 90);
  }

  function openDice() {
    if (!state.user) return;
    diceKey = null;
    openDialog($('#dlg-dice'));
    rollDice();
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
    const post = postById(id);
    if (!post) return;
    const who = personOf(post.user_id);
    const isSticker = post.kind === 'sticker';
    state.openPostId = id;
    $('#view-img').src = post.urlFull;
    $('#view-img').alt = `${isSticker ? 'sticker' : 'print'} de ${who.name}, ${whenLabel(post.created_at)}`;
    $('#view-sticker').hidden = isSticker;
    $('#view-avatar').innerHTML = avatarHtml(post.user_id, 'avatar-lg');
    $('#view-title').textContent = who.name;
    $('#view-when').textContent = whenLabel(post.created_at);
    $('#view-score').innerHTML = scoreHtml(post.correct);
    const note = $('#view-note');
    note.textContent = post.note || '';
    note.hidden = !post.note;
    $('#view-comments').innerHTML = commentsSection(post);
    $('#view-open').href = post.urlFull;
    const del = $('#view-delete');
    del.hidden = post.user_id !== state.user.id;
    del.textContent = 'apagar';
    del.dataset.armed = '';
    clearTimeout(deleteTimer);
    openDialog($('#dlg-view'));
    // ao abrir, os comentários e respostas deste print passam a "vistos"
    markNotif(state.notifs.filter((n) => n.post_id === id && n.kind !== 'lembrete' && !n.read_at).map((n) => n.id), true);
  }

  async function onDeleteClick() {
    const del = $('#view-delete');
    if (del.dataset.armed !== '1') {
      del.dataset.armed = '1';
      del.textContent = 'apagar mesmo?';
      clearTimeout(deleteTimer);
      deleteTimer = setTimeout(() => { del.dataset.armed = ''; del.textContent = 'apagar'; }, 5000);
      return;
    }
    clearTimeout(deleteTimer);
    const post = postById(state.openPostId);
    if (!post) return;
    del.disabled = true;
    del.textContent = 'a apagar…';
    try {
      const { error } = await sb.from('posts').delete().eq('id', post.id);
      if (error) throw error;
      // os ficheiros são apagados a seguir; se falhar, o print já saiu da lista
      await sb.storage.from(BUCKET).remove(Array.from(new Set([post.image_path, post.thumb_path]))).catch(() => {});
      state.posts = state.posts.filter((p) => p.id !== post.id);
      state.extra.delete(post.id);
      state.comments.delete(post.id);
      closeDialog($('#dlg-view'));
      render();
      loadStats();
      loadNotifs();   // os avisos deste print desaparecem com ele
      toast(post.kind === 'sticker' ? 'sticker apagado.' : 'print apagado.');
    } catch (err) {
      console.error(err);
      toast('não foi possível apagar. tenta outra vez.');
      del.textContent = 'apagar';
      del.dataset.armed = '';
    } finally {
      del.disabled = false;
    }
  }

  /* ------------------------------------------------ comentar */
  async function onCommentSubmit(form) {
    const postId = form.dataset.post;
    const input = $('input', form);
    const btn = $('.send', form);
    const body = input.value.replace(/\s+/g, ' ').trim();
    if (!body || btn.disabled) return;
    btn.disabled = true;
    try {
      const { data, error } = await sb
        .from('comments')
        .insert({ post_id: postId, user_id: state.user.id, body, parent_id: state.reply.get(postId) || null })
        .select(COMMENT_COLS)
        .single();
      if (error) throw error;
      const list = state.comments.get(postId) || [];
      list.push(data);
      state.comments.set(postId, list);
      state.drafts.delete(postId);
      state.reply.delete(postId);
      $$('[data-comments="' + postId + '"] .cform').forEach((f) => { $('input', f).value = ''; $('.send', f).disabled = true; });
      refreshComments(postId);
    } catch (err) {
      console.error(err);
      toast('não foi possível comentar. tenta outra vez.');
      btn.disabled = !input.value.trim();
    }
  }

  function onCommentInput(input) {
    const form = input.closest('.cform');
    const postId = form.dataset.post;
    state.drafts.set(postId, input.value);
    $$('[data-comments="' + postId + '"] .cform').forEach((f) => {
      const i = $('input', f);
      if (i !== input) i.value = input.value;
      $('.send', f).disabled = !input.value.trim();
    });
  }

  function descendantsOf(list, id) {
    const out = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      list.forEach((c) => {
        if (c.parent_id && out.has(c.parent_id) && !out.has(c.id)) { out.add(c.id); grew = true; }
      });
    }
    return out;
  }

  async function onCommentDelete(btn) {
    const cid = btn.dataset.cdel;
    const icon = '<svg width="16" height="16" class="ico" aria-hidden="true"><use href="#i-x"/></svg>';
    if (btn.dataset.armed !== '1') {
      btn.dataset.armed = '1';
      btn.textContent = 'apagar?';
      clearTimeout(commentDelTimer);
      commentDelTimer = setTimeout(() => { btn.dataset.armed = ''; btn.innerHTML = icon; }, 4000);
      return;
    }
    clearTimeout(commentDelTimer);
    btn.disabled = true;
    try {
      const { error } = await sb.from('comments').delete().eq('id', cid);
      if (error) throw error;
      // apagar um comentário apaga também as respostas que lhe fizeram
      state.comments.forEach((list, postId) => {
        const gone = descendantsOf(list, cid);
        const next = list.filter((c) => !gone.has(c.id));
        if (next.length !== list.length) {
          state.comments.set(postId, next);
          if (gone.has(state.reply.get(postId))) state.reply.delete(postId);
          refreshComments(postId);
        }
      });
      loadNotifs();
    } catch (err) {
      console.error(err);
      toast('não foi possível apagar o comentário.');
      btn.disabled = false;
      btn.dataset.armed = '';
      btn.innerHTML = icon;
    }
  }

  // devolve true se o toque era de comentários
  function handleCommentClick(e) {
    const more = e.target.closest('[data-expand]');
    if (more) { state.expanded.add(more.dataset.expand); refreshComments(more.dataset.expand); return true; }
    const del = e.target.closest('[data-cdel]');
    if (del) { onCommentDelete(del); return true; }
    const reply = e.target.closest('[data-reply]');
    if (reply) {
      const sec = reply.closest('[data-comments]');
      if (sec) {
        state.reply.set(sec.dataset.comments, reply.dataset.reply);
        refreshComments(sec.dataset.comments);
        const input = $('.cform input', sec);
        if (input) input.focus();
      }
      return true;
    }
    const cancel = e.target.closest('[data-reply-cancel]');
    if (cancel) { state.reply.delete(cancel.dataset.replyCancel); refreshComments(cancel.dataset.replyCancel); return true; }
    const pick = e.target.closest('[data-sticker-pick]');
    if (pick) { openStickers({ mode: 'comment', postId: pick.dataset.stickerPick }); return true; }
    return false;
  }

  /* ------------------------------------------------ publicar */
  function readScore() {
    const v = $('#publish-score').value.trim();
    if (!/^\d{1,2}$/.test(v)) return null;
    const n = Number(v);
    return n >= 0 && n <= 30 ? n : null;
  }

  function updatePublishUi() {
    const n = readScore();
    const hint = $('#score-hint');
    hint.className = 'score-hint small';
    if (n == null) {
      hint.textContent = 'quantas respostas certas em 30?';
    } else if (n >= PASS_MARK) {
      hint.textContent = `passaste! ${n} certas em 30 (o mínimo são ${PASS_MARK}).`;
      hint.classList.add('ok');
    } else {
      hint.textContent = `faltam ${PASS_MARK - n} certas para passar (o mínimo são ${PASS_MARK}).`;
      hint.classList.add('low');
    }
    $('#btn-publish-submit').disabled = !(pickedFile && n != null);
  }

  function setScore(n) {
    $('#publish-score').value = n == null ? '' : String(n);
    updatePublishUi();
  }

  function stepScore(delta) {
    const n = readScore();
    setScore(n == null ? (delta > 0 ? PASS_MARK : PASS_MARK - 1) : Math.min(30, Math.max(0, n + delta)));
  }

  function onScoreInput() {
    const input = $('#publish-score');
    let v = input.value.replace(/\D/g, '').slice(0, 2);
    if (v !== '' && Number(v) > 30) v = '30';
    input.value = v;
    updatePublishUi();
  }

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
    $('#btn-publish-submit').textContent = 'publicar';
    setScore(null);
  }

  function onFilePicked() {
    const file = $('#file-input').files && $('#file-input').files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      showError($('#publish-error'), 'escolhe uma imagem (por exemplo, o print do teste).');
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
    updatePublishUi();
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
    const score = readScore();
    if (!pickedFile || score == null) {
      if (pickedFile) showError($('#publish-error'), 'diz quantas respostas certas tiveste (de 0 a 30).');
      return;
    }
    const btn = $('#btn-publish-submit');
    const status = $('#publish-status');
    btn.disabled = true;
    btn.textContent = 'a publicar…';
    showError($('#publish-error'), '');
    const uploaded = [];

    try {
      status.textContent = 'a preparar a imagem…';
      const img = await loadImage(pickedFile);
      const full = await toJpeg(img, 2000, 0.8);
      const thumb = await toJpeg(img, 480, 0.75);

      const base = `${state.user.id}/${uuid()}`;
      const imagePath = `${base}.jpg`;
      const thumbPath = `${base}_t.jpg`;

      status.textContent = 'a enviar…';
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
        note: note || null,
        correct: score
      });
      if (ins.error) throw ins.error;

      closeDialog($('#dlg-publish'));
      resetPublish();
      // o print conta para o lembrete mais antigo que ainda estava por fazer
      const pending = state.notifs.filter((n) => n.kind === 'lembrete' && !n.read_at).pop();
      let msg = score >= PASS_MARK ? 'publicado! passaste neste, boa!' : 'publicado.';
      if (pending) { await markNotif([pending.id], true); msg += ' contou para um lembrete.'; }
      toast(msg);
      setView('mural');
      await loadPosts(true);
    } catch (err) {
      console.error(err);
      if (uploaded.length) sb.storage.from(BUCKET).remove(uploaded).catch(() => {});
      showError($('#publish-error'), 'não foi possível publicar. verifica a ligação e tenta outra vez.');
      status.textContent = '';
      btn.disabled = false;
      btn.textContent = 'publicar';
    }
  }

  /* ------------------------------------------------ avisos (o sino) */
  const unreadCount = () => state.notifs.filter((n) => !n.read_at).length;

  function paintBell() {
    const n = unreadCount();
    const badge = $('#bell-badge');
    badge.hidden = n === 0;
    badge.textContent = n > 99 ? '99+' : String(n);
    $('#btn-bell').setAttribute('aria-label', n ? `notificações, ${n} por ver` : 'notificações');
  }

  async function loadNotifs() {
    if (!state.user) return;
    try {
      const { data, error } = await sb
        .from('notifications')
        .select('id,kind,body,post_id,created_at,read_at')
        .order('created_at', { ascending: false })
        .limit(120);
      if (error) throw error;
      state.notifs = data;
      state.notifsErr = false;
    } catch (err) {
      console.warn('avisos', err);
      state.notifsErr = true;
    }
    state.notifsAt = Date.now();
    paintBell();
    if (state.view === 'avisos') renderAvisos();
  }

  async function markNotif(ids, read) {
    ids = ids.filter(Boolean);
    if (!ids.length) return;
    const stamp = read ? new Date().toISOString() : null;
    const before = new Map();
    state.notifs.forEach((n) => { if (ids.includes(n.id)) { before.set(n.id, n.read_at); n.read_at = stamp; } });
    paintBell();
    if (state.view === 'avisos') renderAvisos();
    try {
      const { error } = await sb.from('notifications').update({ read_at: stamp }).in('id', ids);
      if (error) throw error;
    } catch (err) {
      console.warn('avisos', err);
      state.notifs.forEach((n) => { if (before.has(n.id)) n.read_at = before.get(n.id); });
      paintBell();
      if (state.view === 'avisos') renderAvisos();
      toast('não foi possível atualizar os avisos.');
    }
  }

  function noticeHtml(n) {
    const read = !!n.read_at;
    const reminder = n.kind === 'lembrete';
    const text = n.body.replace(/^🚨\s*/, '');
    const icon = reminder ? 'i-bell' : 'i-reply';
    const label = reminder ? 'lembrete' : n.kind === 'resposta' ? 'resposta' : 'comentário';
    const actions = [];
    if (reminder && !read) actions.push(`<button type="button" class="btn btn-primary btn-sm" data-notif-new="${esc(n.id)}">publicar print</button>`);
    if (!reminder && n.post_id) actions.push(`<button type="button" class="btn ${read ? 'btn-ghost' : 'btn-primary'} btn-sm" data-notif-open="${esc(n.id)}">ver</button>`);
    actions.push(read
      ? `<button type="button" class="btn btn-ghost btn-sm" data-notif-unread="${esc(n.id)}">desfazer</button>`
      : `<button type="button" class="btn btn-ghost btn-sm" data-notif-read="${esc(n.id)}">${reminder ? 'feito' : 'visto'}</button>`);
    return `<li class="notice ${read ? 'read' : ''} ${reminder ? 'reminder' : ''}">
        <span class="notice-ico" aria-hidden="true"><svg width="22" height="22" class="ico"><use href="#${icon}"/></svg></span>
        <div class="notice-main">
          <p class="notice-text">${esc(text)}</p>
          <p class="notice-meta"><span>${label}</span> · <time datetime="${esc(n.created_at)}">${esc(whenLabel(n.created_at))}</time></p>
          <div class="notice-actions">${actions.join('')}</div>
        </div>
      </li>`;
  }

  function renderAvisos() {
    const box = $('#view-avisos');
    if (!state.notifsAt) { box.innerHTML = ''; return; }
    if (state.notifsErr && !state.notifs.length) {
      box.innerHTML = `<div class="empty"><span class="avatar">${AV.svg('nuvem')}</span><h2 class="h2">não deu para carregar</h2><p>verifica a ligação e tenta outra vez.</p><button type="button" class="btn btn-primary" data-retry-notifs>tentar outra vez</button></div>`;
      return;
    }
    const unread = state.notifs.filter((n) => !n.read_at);
    const done = state.notifs.filter((n) => n.read_at).slice(0, 15);
    let html = `<div class="av-head"><h2 class="h2">notificações</h2>${unread.length > 1 ? '<button type="button" class="btn btn-ghost btn-sm" data-notif-all>marcar tudo como visto</button>' : ''}</div>
      <p class="small muted">aqui ficam os lembretes de testes e os comentários. o que ainda não viste fica em cima, para não deixares nenhum teste para trás.</p>`;
    if (!unread.length) {
      html += emptyHtml('tudo em dia', 'não tens nenhum aviso por ver.', 'carro');
    } else {
      html += `<h3 class="sec">por ver (${unread.length})</h3><ul class="notices">${unread.map(noticeHtml).join('')}</ul>`;
    }
    if (done.length) html += `<h3 class="sec">já vistas</h3><ul class="notices">${done.map(noticeHtml).join('')}</ul>`;
    box.innerHTML = html;
  }

  function handleNoticeClick(e) {
    const byId = (id) => state.notifs.find((n) => n.id === id);
    const read = e.target.closest('[data-notif-read]');
    if (read) { markNotif([read.dataset.notifRead], true); return true; }
    const unread = e.target.closest('[data-notif-unread]');
    if (unread) { markNotif([unread.dataset.notifUnread], false); return true; }
    if (e.target.closest('[data-notif-all]')) { markNotif(state.notifs.filter((n) => !n.read_at).map((n) => n.id), true); return true; }
    if (e.target.closest('[data-retry-notifs]')) { loadNotifs(); return true; }
    const fresh = e.target.closest('[data-notif-new]');
    if (fresh) { openNewPost(); return true; }   // fica "feito" quando o print for publicado
    const open = e.target.closest('[data-notif-open]');
    if (open) {
      const n = byId(open.dataset.notifOpen);
      if (n && n.post_id) { markNotif([n.id], true); openPostById(n.post_id); }
      return true;
    }
    return false;
  }

  /* abrir um print a partir de um aviso (ou de uma notificação do telemóvel) */
  async function ensurePost(id) {
    const known = postById(id);
    if (known) return known;
    try {
      const { data, error } = await sb.from('posts').select(POST_COLS).eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const urls = await signUrls([data]);
      const post = { ...data, urlFull: urls.get(data.image_path) || '', urlThumb: urls.get(data.thumb_path) || '' };
      state.extra.set(id, post);
      return post;
    } catch (err) {
      console.warn('print', err);
      return null;
    }
  }

  async function openPostById(id) {
    if (!/^[0-9a-f-]{36}$/i.test(String(id))) return;
    const post = await ensurePost(id);
    if (!post) { toast('esse print já não existe.'); return; }
    await loadComments([id], false);   // traz as respostas mais recentes
    openViewer(id);
  }
  const openFromLink = openPostById;

  /* ------------------------------------------------ stickers */
  let stkCtx = null;      // { mode: 'comment', postId } ou { mode: 'post' }
  let stkArm = null;      // sticker a meio de ser apagado (toca duas vezes)
  let stkArmTimer = null;

  async function loadStickers() {
    try {
      const { data, error } = await sb
        .from('stickers')
        .select('id,user_id,path,created_at')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      state.stickers = data;
      await signStickers(data.map((s) => s.path));
      return true;
    } catch (err) {
      console.warn('stickers', err);
      return false;
    }
  }

  async function openStickers(ctx) {
    if (!state.user) return;
    stkCtx = ctx;
    state.stkManage = false;
    state.stkPick = null;
    stkArm = null;
    $('#stk-title').textContent = ctx.mode === 'post' ? 'publicar um sticker' : 'enviar um sticker';
    $('#stk-send').hidden = ctx.mode !== 'post';
    $('#stk-send').disabled = true;
    $('#stk-send').textContent = 'publicar no mural';
    renderStickers(true);
    openDialog($('#dlg-stickers'));
    const ok = await loadStickers();
    if (!$('#dlg-stickers').open) return;
    renderStickers(false, !ok);
  }

  function stickerTile(s, mine) {
    const url = stickerUrl(s.path);
    const sel = state.stkPick === s.path;
    const armed = stkArm === s.path;
    const manage = state.stkManage;
    const cls = ['stk-tile', sel ? 'sel' : '', manage && mine ? 'manage' : '', manage && !mine ? 'dim' : '', armed ? 'armed' : ''].join(' ');
    const label = manage && mine ? (armed ? 'toca outra vez para apagar' : 'apagar este sticker') : 'sticker de ' + personOf(s.user_id).name;
    return `<button type="button" class="${cls}" data-stk="${esc(s.path)}" aria-label="${esc(label)}" aria-pressed="${sel}" ${manage && !mine ? 'disabled' : ''}>
        <img src="${esc(url)}" alt="" loading="lazy" decoding="async">
        ${manage && mine ? `<span class="stk-x">${armed ? 'apagar?' : '✕'}</span>` : ''}
      </button>`;
  }

  function renderStickers(loading, failed) {
    const me = state.user.id;
    const mine = state.stickers.filter((s) => s.user_id === me);
    const hint = $('#stk-hint');
    const manageBtn = $('#stk-manage');
    manageBtn.setAttribute('aria-pressed', String(state.stkManage));
    manageBtn.textContent = state.stkManage ? 'concluir' : 'apagar';
    manageBtn.hidden = !mine.length;
    hint.textContent = state.stkManage
      ? 'toca duas vezes num sticker teu para o apagar.'
      : stkCtx && stkCtx.mode === 'post'
        ? 'escolhe um sticker e publica-o no mural.'
        : 'toca num sticker para o enviar.';
    let html = `<h3 class="sec">os teus</h3><div class="stk-list">
      <button type="button" class="stk-tile stk-new" data-stk-new aria-label="criar um sticker novo"><svg width="28" height="28" class="ico" aria-hidden="true"><use href="#i-plus"/></svg><span>novo</span></button>
      ${mine.map((s) => stickerTile(s, true)).join('')}</div>`;
    if (loading) html += '<p class="small muted">a carregar…</p>';
    if (failed) html += '<p class="small muted">não foi possível carregar o álbum. tenta outra vez.</p>';
    state.profiles.forEach((p) => {
      if (p.id === me) return;
      const list = state.stickers.filter((s) => s.user_id === p.id);
      if (list.length) html += `<h3 class="sec">de ${esc(p.name)}</h3><div class="stk-list">${list.map((s) => stickerTile(s, false)).join('')}</div>`;
    });
    $('#stk-grid').innerHTML = html;
  }

  async function deleteSticker(path) {
    const s = state.stickers.find((x) => x.path === path);
    if (!s || s.user_id !== state.user.id) return;
    try {
      // só sai do álbum; o ficheiro fica, para não estragar comentários e posts que já o usam
      const { error } = await sb.from('stickers').delete().eq('id', s.id);
      if (error) throw error;
      state.stickers = state.stickers.filter((x) => x.id !== s.id);
      if (state.stkPick === path) { state.stkPick = null; $('#stk-send').disabled = true; }
      stkArm = null;
      renderStickers(false);
    } catch (err) {
      console.warn('stickers', err);
      toast('não foi possível apagar o sticker.');
    }
  }

  function onStickerTile(tile) {
    const path = tile.dataset.stk;
    if (state.stkManage) {
      if (stkArm === path) { clearTimeout(stkArmTimer); deleteSticker(path); return; }
      stkArm = path;
      clearTimeout(stkArmTimer);
      stkArmTimer = setTimeout(() => { stkArm = null; if ($('#dlg-stickers').open) renderStickers(false); }, 4000);
      renderStickers(false);
      return;
    }
    if (stkCtx && stkCtx.mode === 'comment') {
      const postId = stkCtx.postId;
      closeDialog($('#dlg-stickers'));
      sendStickerComment(postId, path);
      return;
    }
    state.stkPick = path;
    $('#stk-send').disabled = false;
    renderStickers(false);
  }

  async function sendStickerComment(postId, path) {
    try {
      const { data, error } = await sb
        .from('comments')
        .insert({ post_id: postId, user_id: state.user.id, sticker_path: path, parent_id: state.reply.get(postId) || null })
        .select(COMMENT_COLS)
        .single();
      if (error) throw error;
      const list = state.comments.get(postId) || [];
      list.push(data);
      state.comments.set(postId, list);
      state.reply.delete(postId);
      refreshComments(postId);
    } catch (err) {
      console.error(err);
      toast('não foi possível enviar o sticker. tenta outra vez.');
    }
  }

  async function publishStickerPost() {
    const path = state.stkPick;
    const btn = $('#stk-send');
    if (!path || btn.disabled) return;
    btn.disabled = true;
    btn.textContent = 'a publicar…';
    const dest = `${state.user.id}/${uuid()}.jpg`;
    const storage = sb.storage.from(BUCKET);
    let copied = false;
    try {
      // cópia do ficheiro, para o post continuar a existir mesmo que o sticker saia do álbum
      const cp = await storage.copy(path, dest);
      if (cp.error) throw cp.error;
      copied = true;
      const ins = await sb.from('posts').insert({
        user_id: state.user.id, image_path: dest, thumb_path: dest, kind: 'sticker', note: null, correct: null
      });
      if (ins.error) throw ins.error;
      closeDialog($('#dlg-stickers'));
      toast('sticker publicado.');
      setView('mural');
      await loadPosts(true);
    } catch (err) {
      console.error(err);
      if (copied) storage.remove([dest]).catch(() => {});
      toast('não foi possível publicar o sticker. tenta outra vez.');
      btn.disabled = false;
      btn.textContent = 'publicar no mural';
    }
  }

  /* ------------------------------------------------ criar um sticker (recortar e arrumar) */
  const mk = { url: null, w: 0, h: 0, zoom: 1, ox: 0, oy: 0, V: 0, ptrs: new Map(), pinch: null, back: null };

  const mkBase = () => mk.V / Math.min(mk.w, mk.h);

  function mkClamp() {
    const s = mkBase() * mk.zoom;
    mk.ox = Math.min(0, Math.max(mk.V - mk.w * s, mk.ox));
    mk.oy = Math.min(0, Math.max(mk.V - mk.h * s, mk.oy));
  }

  function mkPaint() {
    const s = mkBase() * mk.zoom;
    const img = $('#maker-img');
    img.style.width = (mk.w * s) + 'px';
    img.style.height = (mk.h * s) + 'px';
    img.style.transform = `translate(${mk.ox}px, ${mk.oy}px)`;
  }

  // aproxima mantendo o ponto (px, py) da moldura no mesmo sítio
  function mkZoomAt(z, px, py) {
    z = Math.min(4, Math.max(1, z));
    const s0 = mkBase() * mk.zoom;
    const s1 = mkBase() * z;
    const ix = (px - mk.ox) / s0;
    const iy = (py - mk.oy) / s0;
    mk.zoom = z;
    mk.ox = px - ix * s1;
    mk.oy = py - iy * s1;
    mkClamp();
    mkPaint();
    $('#maker-zoom').value = String(z);
  }

  function mkReset() {
    if (mk.url) { URL.revokeObjectURL(mk.url); mk.url = null; }
    mk.w = mk.h = 0;
    mk.zoom = 1;
    mk.ptrs.clear();
    mk.pinch = null;
    const img = $('#maker-img');
    img.hidden = true;
    img.removeAttribute('src');
    $('#maker-empty').hidden = false;
    $('#maker-zoom-box').hidden = true;
    $('#maker-zoom').value = '1';
    $('#maker-other').hidden = true;
    $('#maker-save').disabled = true;
    $('#maker-save').textContent = 'guardar no álbum';
    showError($('#maker-error'), '');
  }

  async function mkLoad(blob) {
    showError($('#maker-error'), '');
    const url = URL.createObjectURL(blob);
    const img = $('#maker-img');
    try {
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
      if (!img.naturalWidth || !img.naturalHeight) throw new Error('imagem vazia');
    } catch (err) {
      URL.revokeObjectURL(url);
      showError($('#maker-error'), 'não foi possível abrir essa imagem. tenta outra.');
      return;
    }
    if (mk.url) URL.revokeObjectURL(mk.url);
    mk.url = url;
    mk.w = img.naturalWidth;
    mk.h = img.naturalHeight;
    mk.V = $('#maker-frame').clientWidth || 280;
    mk.zoom = 1;
    const s = mkBase();
    mk.ox = (mk.V - mk.w * s) / 2;
    mk.oy = (mk.V - mk.h * s) / 2;
    img.hidden = false;
    $('#maker-empty').hidden = true;
    $('#maker-zoom-box').hidden = false;
    $('#maker-zoom').value = '1';
    $('#maker-other').hidden = false;
    $('#maker-save').disabled = false;
    mkClamp();
    mkPaint();
  }

  async function openMaker(opts = {}) {
    if (!state.user) return;
    mkReset();
    mk.back = opts.back || null;
    openDialog($('#dlg-maker'));
    if (opts.post) {
      // usa o print que está aberto (descarrega o ficheiro com a sessão, para o recorte funcionar)
      $('#maker-hint').textContent = 'a abrir o print…';
      try {
        const { data, error } = await sb.storage.from(BUCKET).download(opts.post.image_path);
        if (error) throw error;
        await mkLoad(data);
      } catch (err) {
        console.warn('sticker', err);
        showError($('#maker-error'), 'não foi possível abrir o print. escolhe a imagem da galeria.');
      }
      $('#maker-hint').textContent = 'arrasta para enquadrar e aproxima com a barra. fica um quadradinho pequeno.';
    } else {
      $('#maker-hint').textContent = 'escolhe uma imagem, arrasta para enquadrar e aproxima com a barra. fica um quadradinho pequeno.';
    }
  }

  async function mkSave() {
    if (!mk.w || $('#maker-save').disabled) return;
    const btn = $('#maker-save');
    btn.disabled = true;
    btn.textContent = 'a guardar…';
    showError($('#maker-error'), '');
    const path = `${state.user.id}/s_${uuid()}.jpg`;
    const storage = sb.storage.from(BUCKET);
    let uploaded = false;
    try {
      const s = mkBase() * mk.zoom;
      let sw = Math.min(mk.V / s, mk.w, mk.h);
      const sx = Math.max(0, Math.min(-mk.ox / s, mk.w - sw));
      const sy = Math.max(0, Math.min(-mk.oy / s, mk.h - sw));
      let src = $('#maker-img');
      let ssx = sx, ssy = sy;
      // imagens grandes: reduz primeiro para metade-a-metade, fica mais nítido
      if (sw > STICKER_PX * 2) {
        const mid = document.createElement('canvas');
        mid.width = mid.height = STICKER_PX * 2;
        mid.getContext('2d').drawImage(src, sx, sy, sw, sw, 0, 0, mid.width, mid.height);
        src = mid; ssx = 0; ssy = 0; sw = mid.width;
      }
      const cv = document.createElement('canvas');
      cv.width = cv.height = STICKER_PX;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, STICKER_PX, STICKER_PX);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, ssx, ssy, sw, sw, 0, 0, STICKER_PX, STICKER_PX);
      const blob = await new Promise((resolve) => cv.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('sem imagem');

      const up = await storage.upload(path, blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false });
      if (up.error) throw up.error;
      uploaded = true;
      const ins = await sb.from('stickers').insert({ user_id: state.user.id, path }).select('id,user_id,path,created_at').single();
      if (ins.error) throw ins.error;
      state.stickers.unshift(ins.data);
      state.stickerUrls.set(path, URL.createObjectURL(blob));
      closeDialog($('#dlg-maker'));
      toast('sticker guardado no álbum.');
    } catch (err) {
      console.error(err);
      if (uploaded) storage.remove([path]).catch(() => {});
      showError($('#maker-error'), 'não foi possível guardar. verifica a ligação e tenta outra vez.');
      btn.disabled = false;
      btn.textContent = 'guardar no álbum';
    }
  }

  function bindMaker() {
    const frame = $('#maker-frame');
    $('#maker-empty').addEventListener('click', () => $('#maker-file').click());
    $('#maker-other').addEventListener('click', () => $('#maker-file').click());
    $('#maker-file').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) mkLoad(f);
    });
    $('#maker-cancel').addEventListener('click', () => closeDialog($('#dlg-maker')));
    $('#maker-save').addEventListener('click', mkSave);
    $('#maker-zoom').addEventListener('input', (e) => { if (mk.w) mkZoomAt(Number(e.target.value), mk.V / 2, mk.V / 2); });
    $('#dlg-maker').addEventListener('close', () => {
      const back = mk.back;
      mk.back = null;
      mkReset();
      if (back && state.user) openStickers(back);   // volta ao álbum de onde veio
    });

    frame.addEventListener('wheel', (e) => {
      if (!mk.w) return;
      e.preventDefault();
      const r = frame.getBoundingClientRect();
      mkZoomAt(mk.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    frame.addEventListener('pointerdown', (e) => {
      if (!mk.w) return;
      try { frame.setPointerCapture(e.pointerId); } catch (err) { /* ignorar */ }
      mk.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (mk.ptrs.size === 2) {
        const [a, b] = Array.from(mk.ptrs.values());
        mk.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: mk.zoom };
      }
    });
    frame.addEventListener('pointermove', (e) => {
      const p = mk.ptrs.get(e.pointerId);
      if (!p || !mk.w) return;
      if (mk.ptrs.size === 1) {
        mk.ox += e.clientX - p.x;
        mk.oy += e.clientY - p.y;
        mkClamp();
        mkPaint();
      }
      p.x = e.clientX;
      p.y = e.clientY;
      if (mk.ptrs.size === 2 && mk.pinch) {
        const [a, b] = Array.from(mk.ptrs.values());
        const r = frame.getBoundingClientRect();
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        mkZoomAt(mk.pinch.z * (d / mk.pinch.d), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      }
    });
    const up = (e) => { mk.ptrs.delete(e.pointerId); mk.pinch = null; };
    frame.addEventListener('pointerup', up);
    frame.addEventListener('pointercancel', up);

    window.addEventListener('resize', () => {
      if (!mk.w || !$('#dlg-maker').open) return;
      const V = $('#maker-frame').clientWidth;
      if (!V || V === mk.V) return;
      const f = V / mk.V;
      mk.V = V;
      mk.ox *= f;
      mk.oy *= f;
      mkClamp();
      mkPaint();
    });
  }

  /* ------------------------------------------------ conta */
  function authMessage(err) {
    const msg = String((err && err.message) || '').toLowerCase();
    const code = String((err && err.code) || '');
    if (code === 'email_not_confirmed' || msg.includes('not confirmed')) {
      return 'o email desta conta ainda não foi confirmado. pede a quem criou as contas para a confirmar.';
    }
    if (code === 'invalid_credentials' || msg.includes('invalid login')) {
      return 'email ou palavra-passe errados. confirma e tenta outra vez.';
    }
    if (navigator.onLine === false || msg.includes('fetch') || msg.includes('network')) {
      return 'sem ligação à internet. tenta outra vez.';
    }
    return 'não foi possível entrar. tenta outra vez.';
  }

  async function onLogin(ev) {
    ev.preventDefault();
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    const errEl = $('#login-error');
    if (!email || !password) { showError(errEl, 'preenche o email e a palavra-passe.'); return; }
    const btn = $('#login-submit');
    btn.disabled = true;
    btn.textContent = 'a entrar…';
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
      btn.textContent = 'entrar';
    }
  }

  function cleanName(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }

  async function onNameSubmit(ev) {
    ev.preventDefault();
    const name = cleanName($('#name-input').value);
    const errEl = $('#name-error');
    if (!name) { showError(errEl, 'escreve o teu nome.'); return; }
    const btn = $('#name-submit');
    btn.disabled = true;
    showError(errEl, '');
    try {
      const { error } = await sb.from('profiles').insert({ id: state.user.id, name, avatar: nameAvatar });
      // 23505 = o perfil já existia; seguimos em frente.
      if (error && error.code !== '23505') throw error;
      await loadProfiles();
      await startMain();
    } catch (err) {
      console.error(err);
      showError(errEl, 'não foi possível guardar. tenta outra vez.');
    } finally {
      btn.disabled = false;
    }
  }

  function openMenu() {
    $('#menu-email').textContent = state.user.email || '';
    $('#menu-name').value = personOf(state.user.id).name;
    menuAvatar = avatarKeyOf(state.user.id);
    renderAvatarPicker($('#menu-avatars'), menuAvatar, (k) => { menuAvatar = k; });
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
    if (!name) { showError(errEl, 'escreve o teu nome.'); return; }
    const btn = $('#btn-menu-save');
    btn.disabled = true;
    try {
      const { error } = await sb.from('profiles').update({ name, avatar: menuAvatar }).eq('id', state.user.id);
      if (error) throw error;
      await loadProfiles();
      paintHeader();
      render();
      closeDialog($('#dlg-menu'));
      toast('perfil guardado.');
    } catch (err) {
      console.error(err);
      showError(errEl, 'não foi possível guardar. tenta outra vez.');
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
      status.textContent = 'no iphone, as notificações só funcionam com a app instalada: toca em partilhar, depois em adicionar ao ecrã principal, e abre a app a partir do ícone novo.';
    } else if (st === 'unsupported') {
      status.textContent = 'este navegador não suporta notificações.';
    } else if (st === 'denied') {
      status.textContent = isIos()
        ? 'as notificações estão bloqueadas. ativa-as em definições do iphone → notificações → rumo à carta.'
        : 'as notificações estão bloqueadas neste navegador. ativa-as nas definições do site.';
    } else {
      const sub = st === 'granted' ? await currentPushSub() : null;
      if (sub) {
        status.textContent = 'ativas neste telemóvel. recebes 3 a 5 lembretes por dia, entre as 07:00 e as 22:00, e um aviso quando comentarem um print teu.';
        test.hidden = false; off.hidden = false;
      } else {
        status.textContent = 'recebe 3 a 5 lembretes por dia (entre as 07:00 e as 22:00) para fazeres um teste e publicares o print, e um aviso quando comentarem um print teu.';
        on.hidden = false;
      }
    }
  }

  async function enableNotifications(errEl) {
    // O pedido de permissão tem de acontecer logo no toque, por isso vem primeiro.
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      if (errEl) showError(errEl, 'sem permissão não consigo enviar avisos. podes mudar isto nas definições do telemóvel.');
      return false;
    }
    try {
      await subscribeThisDevice();
      return true;
    } catch (err) {
      console.error(err);
      if (errEl) showError(errEl, 'não foi possível ativar. confirma que a app está instalada no ecrã principal e tenta outra vez.');
      return false;
    }
  }

  async function onNotifOn() {
    const btn = $('#btn-notif-on');
    btn.disabled = true;
    try {
      if (await enableNotifications($('#notif-error'))) toast('notificações ativadas.');
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
      toast('notificações desativadas neste telemóvel.');
    } catch (err) {
      console.error(err);
      showError($('#notif-error'), 'não foi possível desativar. tenta outra vez.');
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
      toast('teste enviado. deve chegar em segundos.');
    } catch (err) {
      console.error(err);
      showError($('#notif-error'), 'não consegui enviar o teste. tenta desativar e ativar outra vez.');
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
      toast(ok ? 'notificações ativadas.' : 'não foi possível ativar. vê o menu da conta.');
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
    // toque numa notificação com a app já aberta: o service worker avisa-nos
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (!e.data) return;
        if (e.data.type === 'novo') openNewPost();
        if (e.data.type === 'ver' && state.user) openPostById(e.data.id);
      });
    }

    $('#btn-tip-close').addEventListener('click', () => {
      $('#ios-tip').hidden = true;
      try { localStorage.setItem('rumo-ios-tip', '1'); } catch (e) { /* ignorar */ }
    });

    $$('.tab').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));
    $('#btn-bell').addEventListener('click', () => setView(state.view === 'avisos' ? 'mural' : 'avisos'));

    // stickers
    $('#btn-publish-sticker').addEventListener('click', () => {
      closeDialog($('#dlg-publish'));
      resetPublish();
      openStickers({ mode: 'post' });
    });
    $('#view-sticker').addEventListener('click', () => {
      const post = postById(state.openPostId);
      if (post) openMaker({ post });
    });
    $('#stk-close').addEventListener('click', () => closeDialog($('#dlg-stickers')));
    $('#stk-send').addEventListener('click', publishStickerPost);
    $('#stk-manage').addEventListener('click', () => {
      state.stkManage = !state.stkManage;
      stkArm = null;
      renderStickers(false);
    });
    $('#stk-grid').addEventListener('click', (e) => {
      if (e.target.closest('[data-stk-new]')) {
        const back = stkCtx;
        closeDialog($('#dlg-stickers'));
        openMaker({ back });
        return;
      }
      const tile = e.target.closest('[data-stk]');
      if (tile) onStickerTile(tile);
    });
    $('#dlg-stickers').addEventListener('close', () => { state.stkManage = false; stkArm = null; });
    bindMaker();

    $('#btn-new').addEventListener('click', openNewPost);
    $('#btn-pick').addEventListener('click', () => $('#file-input').click());
    $('#file-input').addEventListener('change', onFilePicked);
    $('#publish-score').addEventListener('input', onScoreInput);
    $('#score-minus').addEventListener('click', () => stepScore(-1));
    $('#score-plus').addEventListener('click', () => stepScore(1));
    $('#btn-publish-cancel').addEventListener('click', () => { closeDialog($('#dlg-publish')); resetPublish(); });
    $('#dlg-publish').addEventListener('cancel', () => setTimeout(resetPublish, 0));

    $('#dice-again').addEventListener('click', rollDice);
    $('#dice-plus').addEventListener('click', () => { if (diceKey) bumpTheme(diceKey, 1); });
    $('#dice-close').addEventListener('click', () => closeDialog($('#dlg-dice')));
    $('#dlg-dice').addEventListener('close', () => clearInterval(diceTimer));

    $('#view-close').addEventListener('click', () => closeDialog($('#dlg-view')));
    $('#view-delete').addEventListener('click', onDeleteClick);
    $('#dlg-view').addEventListener('click', handleCommentClick);

    // fechar as janelas ao tocar no fundo escurecido
    ['#dlg-publish', '#dlg-menu', '#dlg-dice', '#dlg-stickers'].forEach((sel) => {
      const dlg = $(sel);
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg) { closeDialog(dlg); if (sel === '#dlg-publish') resetPublish(); }
      });
    });

    // delegação: abrir print, filtros, perfis, comentários e "ver mais"
    $('#main').addEventListener('click', (e) => {
      if (handleCommentClick(e)) return;
      if (handleNoticeClick(e)) return;
      const plus = e.target.closest('[data-theme-plus]');
      if (plus) { bumpTheme(plus.dataset.themePlus, 1); return; }
      const minus = e.target.closest('[data-theme-minus]');
      if (minus) { bumpTheme(minus.dataset.themeMinus, -1); return; }
      if (e.target.closest('#btn-dice')) { openDice(); return; }
      if (e.target.closest('[data-retry-themes]')) { loadThemes(); return; }
      const prints = e.target.closest('[data-user-prints]');
      if (prints) { state.filter = prints.dataset.userPrints; setView('biblioteca'); return; }
      const open = e.target.closest('[data-open]');
      if (open) { openViewer(open.dataset.open); return; }
      const filter = e.target.closest('[data-filter]');
      if (filter) { state.filter = filter.dataset.filter; renderBiblioteca(); return; }
      if (e.target.closest('[data-more]')) loadPosts(false);
    });

    // comentários: escrever e enviar (funciona no mural e no visualizador)
    document.addEventListener('input', (e) => {
      if (e.target.matches && e.target.matches('.cform input')) onCommentInput(e.target);
    });
    document.addEventListener('submit', (e) => {
      const form = e.target.closest && e.target.closest('.cform');
      if (!form) return;
      e.preventDefault();
      onCommentSubmit(form);
    });

    // se um link privado expirar, volta a pedir a lista
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

    window.addEventListener('offline', () => toast('sem ligação à internet.'));
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
  }

  boot();
})();
