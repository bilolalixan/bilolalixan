/* /blog as a social-style feed.
   Reads the static post cards in #posts (kept for search engines, no-JS
   visitors and the blog bot) and builds: a notifications bell and search in
   the top bar, a stories row (author + latest posts, opened full screen), post
   cards with likes and comments (/api/social), and a floating bottom nav.
   Texts use data-i18n keys so the site-wide language switch updates them. */
(function () {
  const cards = [...document.querySelectorAll('#posts .post-card')];
  const feed = document.getElementById('feed');
  const storiesEl = document.getElementById('stories');
  if (!cards.length || !feed || !storiesEl) return;

  const AV = '/assets/bilolalixan.jpg';
  const t = (k, ...a) => (window.I18N ? window.I18N.t(k, ...a) : k);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const orig = (el) => (el ? (el.dataset.i18nOrig ?? el.textContent).trim() : '');
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  };
  const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));
  const svg = (inner, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const I = {
    heart: svg('<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>', 1.8),
    bubble: svg('<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/><line x1="8.5" y1="11.5" x2="8.51" y2="11.5"/><line x1="12" y1="11.5" x2="12.01" y2="11.5"/><line x1="15.5" y1="11.5" x2="15.51" y2="11.5"/>', 1.8),
    dots: svg('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>', 2.4),
    share: svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/>'),
    link: svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
    check: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 1.5l2.6 1.9 3.2-.2 1 3 2.6 1.9-1 3 1 3-2.6 1.9-1 3-3.2-.2L12 22.5l-2.6-1.9-3.2.2-1-3-2.6-1.9 1-3-1-3 2.6-1.9 1-3 3.2.2z"/><path d="M8 12.2l2.7 2.7L16.2 9.4" fill="none" stroke="var(--card2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    plus: svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 2.4),
    arrow: svg('<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>'),
    close: svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
    chat: svg('<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/><line x1="8.5" y1="11.5" x2="8.51" y2="11.5"/><line x1="12" y1="11.5" x2="12.01" y2="11.5"/><line x1="15.5" y1="11.5" x2="15.51" y2="11.5"/>'),
    home: svg('<path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
    user: svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  };

  const posts = cards.map((a) => {
    const meta = a.querySelector('.post-meta');
    const time = meta && meta.querySelector('time');
    const spans = meta ? [...meta.children].filter((e) => e.tagName === 'SPAN' && !e.classList.contains('dot') && !e.classList.contains('post-tag')) : [];
    const href = a.getAttribute('href');
    return {
      slug: href.split('/').pop(), href,
      cover: a.dataset.cover || null,
      title: orig(a.querySelector('.post-title')),
      excerpt: orig(a.querySelector('.post-excerpt')),
      tag: orig(a.querySelector('.post-tag')),
      datetime: time ? time.getAttribute('datetime') : '',
      dateText: orig(time),
      minutes: orig(spans[spans.length - 1]),
    };
  });

  const art = (p, cls = '') => {
    if (p.cover) return `<span class="${cls}"><img src="${esc(p.cover)}" alt="" loading="lazy"></span>`;
    const h = hash(p.slug);
    return `<span class="${cls} art" style="--aa:${140 + (h % 80)}deg;--ax:${10 + (h >> 3) % 80}%;--ay:${(h >> 7) % 40}%"><span class="art-mark"></span></span>`;
  };
  const metaHtml = (p) => `<span class="post-meta"><time datetime="${esc(p.datetime)}">${esc(p.dateText)}</time>${p.minutes ? `<span class="dot"></span><span>${esc(p.minutes)}</span>` : ''}</span>`;

  document.documentElement.classList.add('js-feed');

  /* ── STORIES ── */
  const seen = new Set(store.get('blogSeenStories', []));
  storiesEl.innerHTML =
    `<a class="st st-me" href="/bilolalixan"><span style="position:relative"><img class="st-av" src="${AV}" alt=""><span class="st-plus">${I.plus}</span></span><span data-i18n="fStory">${esc(t('fStory'))}</span></a>` +
    posts.map((p, i) => `<button class="st st-post${seen.has(p.slug) ? ' seen' : ''}" type="button" data-i="${i}" aria-label="${esc(p.title)}">${art(p, 'st-bg')}<img class="st-av" src="${AV}" alt=""><span class="st-cap"><span>${esc(p.title)}</span></span></button>`).join('');
  storiesEl.addEventListener('click', (e) => {
    const b = e.target.closest('.st-post');
    if (b) openStory(Number(b.dataset.i));
  });

  /* ── FEED ── */
  feed.innerHTML = posts.map((p, i) => {
    const prev = posts[(i + 1) % posts.length], next = posts[(i + posts.length - 1) % posts.length];
    return `<article class="fp" data-slug="${esc(p.slug)}">
  <header class="fp-head">
    <a class="fp-author" href="/bilolalixan"><img src="${AV}" alt=""><span class="fp-who"><span class="fp-name">Bilol alixan ${I.check}</span>${metaHtml(p)}</span></a>
    ${p.tag ? `<span class="fp-tagwrap"><span class="post-tag">${esc(p.tag)}</span></span>` : ''}
  </header>
  <a class="fp-media" href="${esc(p.href)}" aria-label="${esc(p.title)}">
    ${posts.length > 1 ? art(prev, 'fp-ghost l') + art(next, 'fp-ghost r') : ''}
    <span class="fp-main">${art(p, 'fp-art')}<span class="fp-kicker"><img src="${AV}" alt="">Apelsin</span><span class="fp-cap"><b>${esc(p.title)}</b></span></span>
  </a>
  <a class="fp-body" href="${esc(p.href)}"><p class="fp-text">${esc(p.excerpt)}</p></a>
  <div class="fp-actions">
    <span class="fp-pill fp-stats">
      <button class="fp-like" type="button" aria-pressed="false" data-i18n-aria="fLike" aria-label="${esc(t('fLike'))}">${I.heart}<span class="n">0</span></button>
      <button class="fp-cm" type="button" data-i18n-aria="fComments" aria-label="${esc(t('fComments'))}">${I.bubble}<span class="n">0</span></button>
    </span>
    <button class="fp-pill fp-write" type="button">${I.bubble}<span data-i18n="fWrite">${esc(t('fWrite'))}</span></button>
    <button class="fp-pill fp-more" type="button" aria-haspopup="true" data-i18n-aria="fMore" aria-label="${esc(t('fMore'))}">${I.dots}</button>
    <div class="fp-menu" hidden>
      <button type="button" data-act="share">${I.share}<span data-i18n="share">${esc(t('share'))}</span></button>
      <button type="button" data-act="copy">${I.link}<span data-i18n="fCopy">${esc(t('fCopy'))}</span></button>
    </div>
  </div>
</article>`;
  }).join('');
  const bySlug = (slug) => posts.find((p) => p.slug === slug);

  /* Likes and comment counts */
  let client = store.get('blogClient', null);
  if (!client) { client = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9-]/g, ''); store.set('blogClient', client); }
  const liked = new Set(store.get('blogLiked', []));
  const setCount = (art, sel, n) => { const el = art.querySelector(sel + ' .n'); if (el && n != null) { el.textContent = fmt(n); el.dataset.n = n; } };
  feed.querySelectorAll('.fp').forEach((a) => { a.querySelector('.fp-like').setAttribute('aria-pressed', String(liked.has(a.dataset.slug))); });
  fetch('/api/social?slugs=' + posts.map((p) => p.slug).join(','))
    .then((r) => r.json())
    .then((d) => {
      if (!d || !d.ok) return;
      feed.querySelectorAll('.fp').forEach((a) => {
        setCount(a, '.fp-like', d.likes[a.dataset.slug] || 0);
        setCount(a, '.fp-cm', d.comments[a.dataset.slug] || 0);
      });
    })
    .catch(() => {});

  async function toggleLike(art) {
    const btn = art.querySelector('.fp-like'), slug = art.dataset.slug;
    const on = btn.getAttribute('aria-pressed') !== 'true';
    const nEl = btn.querySelector('.n'), before = Number(nEl.dataset.n || 0);
    btn.setAttribute('aria-pressed', String(on));
    setCount(art, '.fp-like', Math.max(0, before + (on ? 1 : -1)));
    if (on) { btn.classList.add('pop'); setTimeout(() => btn.classList.remove('pop'), 250); liked.add(slug); } else liked.delete(slug);
    store.set('blogLiked', [...liked]);
    try {
      const r = await fetch('/api/social', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: on ? 'like' : 'unlike', slug, client }) });
      const d = await r.json();
      if (d.ok) setCount(art, '.fp-like', d.likes);
    } catch (_) {}
  }

  async function share(p, copyOnly) {
    const url = location.origin + p.href;
    try {
      if (!copyOnly && navigator.share) { await navigator.share({ title: p.title, url }); return; }
      await navigator.clipboard.writeText(url);
      alert(t('copied'));
    } catch (_) {}
  }

  feed.addEventListener('click', (e) => {
    const art = e.target.closest('.fp');
    if (!art) return;
    const p = bySlug(art.dataset.slug);
    if (e.target.closest('.fp-like')) return toggleLike(art);
    if (e.target.closest('.fp-cm, .fp-write')) return openComment(p, art);
    const menu = art.querySelector('.fp-menu');
    if (e.target.closest('.fp-more')) { e.stopPropagation(); closeMenus(menu); menu.hidden = !menu.hidden; return; }
    const act = e.target.closest('.fp-menu [data-act]');
    if (act) { menu.hidden = true; share(p, act.dataset.act === 'copy'); }
  });
  const closeMenus = (except) => feed.querySelectorAll('.fp-menu').forEach((m) => { if (m !== except) m.hidden = true; });
  document.addEventListener('click', (e) => { if (!e.target.closest('.fp-actions')) closeMenus(); });

  /* ── COMMENT SHEET ── */
  function openComment(p, art) {
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.innerHTML = `<form class="sheet-box" novalidate>
      <div class="sheet-grab"></div>
      <h3>${esc(t('fCmTitle'))}</h3>
      <p class="sheet-post">${esc(p.title)}</p>
      <input name="name" maxlength="60" autocomplete="name" placeholder="${esc(t('fCmName'))}">
      <textarea name="text" maxlength="1000" required placeholder="${esc(t('fCmText'))}"></textarea>
      <input class="hp" name="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <p class="sheet-note">${esc(t('fCmNote'))}</p>
      <button class="sheet-send" type="submit">${esc(t('fCmSend'))}</button>
      <p class="sheet-msg" aria-live="polite"></p>
    </form>`;
    document.body.appendChild(sheet);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => sheet.classList.add('open'));
    const form = sheet.querySelector('form'), msg = sheet.querySelector('.sheet-msg'), send = sheet.querySelector('.sheet-send');
    const close = () => { sheet.classList.remove('open'); document.body.style.overflow = ''; setTimeout(() => sheet.remove(), 220); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    setTimeout(() => form.text.focus(), 250);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.text.value.trim().length < 2) { form.text.focus(); return; }
      send.disabled = true; send.textContent = t('fCmSending'); msg.textContent = ''; msg.className = 'sheet-msg';
      try {
        const r = await fetch('/api/social', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'comment', slug: p.slug, title: p.title, name: form.name.value, text: form.text.value, hp: form.hp.value, lang: window.I18N ? window.I18N.lang : 'uz' }) });
        const d = await r.json();
        if (!d.ok) throw new Error();
        if (d.comments != null) setCount(art, '.fp-cm', d.comments);
        msg.textContent = t('fCmDone'); msg.className = 'sheet-msg ok';
        form.text.value = '';
        setTimeout(close, 1400);
      } catch (_) {
        msg.textContent = t('fCmErr'); msg.className = 'sheet-msg err';
      }
      send.disabled = false; send.textContent = t('fCmSend');
    });
  }

  /* ── STORY VIEWER ── */
  const DUR = 6000;
  let sv = null;
  function openStory(start) {
    if (sv) return;
    const box = document.createElement('div');
    box.className = 'sv';
    box.innerHTML = `<div class="sv-box" role="dialog" aria-modal="true">
      <div class="sv-slide"></div>
      <div class="sv-bars">${posts.map(() => '<span><i></i></span>').join('')}</div>
      <div class="sv-tap prev"></div><div class="sv-tap next"></div>
    </div>`;
    document.body.appendChild(box);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => box.classList.add('open'));
    const slide = box.querySelector('.sv-slide'), bars = [...box.querySelectorAll('.sv-bars i')];
    let i = start, t0 = 0, elapsed = 0, paused = false, raf = 0;

    function show(n) {
      i = n; elapsed = 0; t0 = performance.now();
      const p = posts[i];
      seen.add(p.slug); store.set('blogSeenStories', [...seen]);
      const st = storiesEl.querySelector(`.st-post[data-i="${i}"]`); if (st) st.classList.add('seen');
      bars.forEach((b, j) => { b.style.width = j < i ? '100%' : '0%'; });
      slide.innerHTML = `${art(p, 'sv-art')}
        <div class="sv-head"><img src="${AV}" alt=""><div><b>Bilol alixan</b>${metaHtml(p)}</div>
          <button class="sv-close" type="button" aria-label="${esc(t('fClose'))}">${I.close}</button></div>
        <div class="sv-body">${p.tag ? `<span class="post-tag">${esc(p.tag)}</span>` : ''}
          <h2 class="sv-title">${esc(p.title)}</h2><p class="sv-text">${esc(p.excerpt)}</p>
          <a class="sv-read" href="${esc(p.href)}">${esc(t('fRead'))}${I.arrow}</a></div>`;
      if (window.I18N) window.I18N.refresh();
    }
    function loop(now) {
      if (!paused) {
        const d = elapsed + (now - t0);
        bars[i].style.width = Math.min(100, (d / DUR) * 100) + '%';
        if (d >= DUR) { if (i < posts.length - 1) show(i + 1); else return close(); }
      }
      raf = requestAnimationFrame(loop);
    }
    function pause(on) {
      if (on === paused) return;
      if (on) elapsed += performance.now() - t0; else t0 = performance.now();
      paused = on;
    }
    function close() {
      cancelAnimationFrame(raf); sv = null;
      box.classList.remove('open'); document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      setTimeout(() => box.remove(), 200);
    }
    const go = (d) => { const n = i + d; if (n < 0) show(0); else if (n >= posts.length) close(); else show(n); };
    const onKey = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    document.addEventListener('keydown', onKey);

    // Tap left/right to move, hold to pause, swipe down to close.
    let down = null;
    box.addEventListener('pointerdown', (e) => { if (e.target.closest('a, button')) return; down = { x: e.clientX, y: e.clientY, t: performance.now() }; pause(true); });
    box.addEventListener('pointerup', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y, dt = performance.now() - down.t;
      down = null; pause(false);
      if (dy > 80 && Math.abs(dy) > Math.abs(dx)) return close();
      if (Math.abs(dx) > 60) return go(dx < 0 ? 1 : -1);
      if (dt < 250) { if (e.target.closest('.sv-tap.prev')) go(-1); else if (e.target.closest('.sv-tap.next')) go(1); }
    });
    box.addEventListener('pointercancel', () => { down = null; pause(false); });
    box.addEventListener('click', (e) => { if (e.target.closest('.sv-close')) close(); else if (e.target === box) close(); });

    sv = { close };
    show(start);
    raf = requestAnimationFrame(loop);
  }

  /* ── BELL: posts since the last visit ── */
  const bell = document.getElementById('bellBtn'), panel = document.getElementById('bellPanel');
  if (bell && panel) {
    const last = store.get('blogLastVisit', Date.now() - 7 * 864e5);
    const isNew = (p) => (Date.parse(p.datetime) || 0) > last;
    const fresh = posts.filter(isNew);
    bell.hidden = false;
    const setN = (n) => { document.getElementById('bellCount').textContent = n; bell.classList.toggle('zero', !n); };
    setN(fresh.length);
    panel.innerHTML = `<h3 data-i18n="fNew">${esc(t('fNew'))}</h3>` + (posts.length
      ? posts.slice(0, 5).map((p) => `<a href="${esc(p.href)}"${isNew(p) ? ' class="new"' : ''}><img src="${AV}" alt=""><span><b>${esc(p.title)}</b><span class="post-meta"><time datetime="${esc(p.datetime)}">${esc(p.dateText)}</time></span></span></a>`).join('')
      : `<p data-i18n="fNoNew">${esc(t('fNoNew'))}</p>`);
    const open = (on) => { panel.hidden = !on; bell.setAttribute('aria-expanded', String(on)); };
    bell.addEventListener('click', (e) => {
      e.stopPropagation(); open(panel.hidden);
      store.set('blogLastVisit', Date.now()); setN(0);
    });
    document.addEventListener('click', (e) => { if (!panel.hidden && !e.target.closest('.bh-bell-wrap')) open(false); });
  }

  /* ── SEARCH ── */
  const sBtn = document.getElementById('searchBtn'), sRow = document.getElementById('searchRow'), sIn = document.getElementById('searchInput');
  if (sBtn && sRow && sIn) {
    sBtn.hidden = false;
    sBtn.addEventListener('click', () => {
      sRow.hidden = !sRow.hidden;
      if (!sRow.hidden) sIn.focus(); else { sIn.value = ''; filter(''); }
    });
    const filter = (q) => {
      q = q.trim().toLowerCase();
      let shown = 0;
      feed.querySelectorAll('.fp').forEach((a) => {
        const p = bySlug(a.dataset.slug);
        const hit = !q || (p.title + ' ' + p.excerpt + ' ' + p.tag).toLowerCase().includes(q);
        a.hidden = !hit; if (hit) shown++;
      });
      storiesEl.hidden = !!q;
      document.getElementById('feedEmpty').hidden = shown > 0;
    };
    sIn.addEventListener('input', () => filter(sIn.value));
  }

  /* ── BOTTOM NAV ── */
  const nav = document.createElement('nav');
  nav.className = 'bnav';
  nav.innerHTML =
    `<a href="https://t.me/bilolalixans" target="_blank" rel="noopener" data-i18n-aria="navChat" aria-label="${esc(t('navChat'))}">${I.chat}</a>` +
    `<a class="bn-home" href="/">${I.home}<span data-i18n="navHome">${esc(t('navHome'))}</span></a>` +
    `<a class="bn-add" href="/booking" data-i18n-aria="navBook" aria-label="${esc(t('navBook'))}">${I.plus}</a>` +
    `<a href="/bilolalixan" data-i18n-aria="navProfile" aria-label="${esc(t('navProfile'))}">${I.user}</a>`;
  document.body.appendChild(nav);
  let lastY = scrollY;
  addEventListener('scroll', () => {
    const y = scrollY;
    if (Math.abs(y - lastY) < 8) return;
    nav.classList.toggle('hide', y > lastY && y > 120);
    lastY = y;
  }, { passive: true });

  if (window.I18N) window.I18N.refresh();
})();
