// Портфоліо: UI + 3D-сцена (Three.js)
const DEFAULTS = {
  name: 'Портфоліо',
  role: 'Моушн-дизайн · контент для Instagram',
  heroLines: ['Контент,', 'що рухає', 'увагу'],
  tagline: 'Рілс, сторіс, обкладинки, каруселі та лендінги для брендів і експертів.',
  about: 'Створюю візуальний контент для Instagram: від моушн-рілс до лендінгів. Поєдную дизайн, анімацію та сторітелінг, щоб ваш бренд помічали й запамʼятовували.',
  cta: 'Обговорімо ваш проєкт',
  marquee: 'Відкрито до нових проєктів',
  contacts: { telegram: '', instagram: '', email: '', phone: '' },
  categories: { reels: 'Рілс', covers: 'Обкладинки', stories: 'Сторіс', carousels: 'Каруселі', landings: 'Лендінги' },
  services: {
    reels: 'Монтаж, моушн, субтитри',
    covers: 'Єдиний стиль стрічки',
    stories: 'Прогріви та анонси',
    carousels: 'Експертні пости',
    landings: 'Дизайн і верстка'
  }
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isTouch = matchMedia('(hover:none),(pointer:coarse)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let S = DEFAULTS, WORKS = [], filter = 'all';
const state = { scrollY: 0, vel: 0, mouseX: 0, mouseY: 0 };

// ---------------- loader ----------------
const loaderCount = $('.loader-count'), loaderBar = $('.loader-bar i');
let loadP = 0, loadTarget = 0.15;
(function tickLoader() {
  loadP += (loadTarget - loadP) * 0.08;
  loaderCount.textContent = Math.round(loadP * 100);
  loaderBar.style.transform = `scaleX(${loadP})`;
  if (loadP < 0.995) requestAnimationFrame(tickLoader);
})();
const setLoad = (v) => (loadTarget = Math.max(loadTarget, v));

// ---------------- data ----------------
async function load() {
  try {
    const r = await fetch('data/works.json?v=' + Date.now(), { cache: 'no-store' });
    const d = await r.json();
    S = { ...DEFAULTS, ...(d.settings || {}) };
    S.contacts = { ...DEFAULTS.contacts, ...(d.settings?.contacts || {}) };
    // категорії повністю керуються з адмінки (порядок = порядок у налаштуваннях)
    const c = d.settings?.categories;
    S.categories = c && Object.keys(c).length ? c : DEFAULTS.categories;
    S.services = { ...DEFAULTS.services, ...(d.settings?.services || {}) };
    WORKS = (d.works || []).filter(w => !w.hidden && w.media?.length);
  } catch (e) { console.warn('Не вдалося завантажити works.json', e); }
}

// ---------------- text / settings ----------------
function splitHero() {
  const h = $('.hero-title');
  const lines = (S.heroLines || DEFAULTS.heroLines).filter(Boolean);
  h.setAttribute('aria-label', lines.join(' '));
  let i = 0;
  h.innerHTML = lines.map(l => `<span class="ln" aria-hidden="true">${[...l].map(c => c === ' ' ? ' ' : `<span class="ch" style="--i:${i++}">${esc(c)}</span>`).join('')}</span>`).join('');
}
function splitWords(node) {
  const words = node.textContent.trim().split(/\s+/);
  node.innerHTML = words.map((w, i) => `<span class="w"><i style="--i:${i}">${esc(w)}</i></span>`).join(' ');
}
function applySettings() {
  document.title = S.name && S.name !== DEFAULTS.name ? `${S.name} — портфоліо` : 'Портфоліо';
  $$('[data-bind]').forEach(n => { const v = S[n.dataset.bind]; if (v) n.textContent = v; });
  splitHero();
  $$('.split-words').forEach(splitWords);
  $('.footer-year').textContent = '© ' + new Date().getFullYear();
  // stats
  const cnt = countBy();
  const stats = Object.keys(S.categories).filter(k => cnt[k]).slice(0, 3);
  $('.hero-stats').innerHTML = stats.map(k => `<div class="stat"><b>${String(cnt[k]).padStart(2, '0')}</b><span>${esc(S.categories[k])}</span></div>`).join('');
  // services
  $('.services').innerHTML = Object.entries(S.categories).map(([k, v], i) =>
    `<li data-cat="${k}"><span>${String(i + 1).padStart(2, '0')}</span><span>${esc(v)}</span><em>${esc(S.services[k] || '')}</em></li>`).join('');
  $$('.services li').forEach(li => li.addEventListener('click', () => { setFilter(li.dataset.cat); $('#works').scrollIntoView({ behavior: 'smooth' }); }));
  // marquee
  const m = esc(S.marquee || DEFAULTS.marquee);
  $('.marquee-track').innerHTML = Array(8).fill(`<span>${m}</span>`).join('');
  // contacts
  const c = S.contacts, links = [];
  const tg = c.telegram?.replace(/^@|https?:\/\/t\.me\//g, '');
  const ig = c.instagram?.replace(/^@|https?:\/\/(www\.)?instagram\.com\/|\/$/g, '');
  if (tg) links.push(`<a href="https://t.me/${esc(tg)}" target="_blank" rel="noopener"><span>Telegram</span><small>@${esc(tg)}</small></a>`);
  if (ig) links.push(`<a href="https://instagram.com/${esc(ig)}" target="_blank" rel="noopener"><span>Instagram</span><small>@${esc(ig)}</small></a>`);
  if (c.email) links.push(`<a href="mailto:${esc(c.email)}"><span>Email</span><small>${esc(c.email)}</small></a>`);
  if (c.phone) links.push(`<a href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}"><span>Телефон</span><small>${esc(c.phone)}</small></a>`);
  $('.contact-links').innerHTML = links.join('') || '<p style="color:var(--muted)">Контакти можна додати в адмінці → Налаштування.</p>';
}
const countBy = () => WORKS.reduce((a, w) => (a[w.category] = (a[w.category] || 0) + 1, a), {});

// Кінетична типографіка: літери набирають вагу біля курсора
function heroWeight() {
  if (isTouch || reduced) return;
  let chars = [], rects = [];
  const measure = () => { chars = $$('.hero-title .ch'); rects = chars.map(c => { const r = c.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2 + scrollY]; }); };
  setTimeout(measure, 2600); addEventListener('resize', measure);
  let raf = 0;
  addEventListener('pointermove', e => {
    if (raf || scrollY > innerHeight) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      for (let i = 0; i < chars.length; i++) {
        const dx = e.clientX - rects[i][0], dy = e.clientY + scrollY - rects[i][1];
        const k = Math.max(0, 1 - Math.hypot(dx, dy) / 260);
        chars[i].style.fontWeight = Math.round(600 + k * 300 - (1 - k) * 0);
      }
    });
  });
}

// ---------------- grid ----------------
function renderFilters() {
  const cnt = countBy();
  const cats = [['all', 'Усі', WORKS.length], ...Object.entries(S.categories).filter(([k]) => cnt[k]).map(([k, v]) => [k, v, cnt[k]])];
  $('.filters').innerHTML = cats.map(([k, v, n]) => `<button class="chip${k === filter ? ' is-active' : ''}" data-f="${k}" role="tab">${esc(v)}<sup>${n}</sup></button>`).join('');
  $$('.chip').forEach(b => b.addEventListener('click', () => setFilter(b.dataset.f)));
}
function setFilter(f) {
  if (!f || (f !== 'all' && !S.categories[f])) f = 'all';
  filter = f;
  $$('.chip').forEach(b => b.classList.toggle('is-active', b.dataset.f === f));
  const url = new URL(location); f === 'all' ? url.searchParams.delete('cat') : url.searchParams.set('cat', f); history.replaceState(null, '', url);
  const cards = $$('.card');
  cards.forEach(c => c.classList.add('is-out'));
  setTimeout(renderGrid, cards.length ? 320 : 0);
}
function aspectOf(w) {
  const m = w.media[0];
  let a = m.w && m.h ? m.h / m.w : 16 / 9;
  if (w.category === 'landings') a = Math.min(a, 1.25);
  return Math.min(Math.max(a, 0.56), 1.9);
}
function renderGrid() {
  const g = $('.grid');
  const list = WORKS.filter(w => filter === 'all' || w.category === filter);
  $('.grid-empty').hidden = list.length > 0;
  g.innerHTML = '';
  list.forEach((w, i) => {
    const m = w.media[0];
    const card = el('article', 'card');
    card.dataset.cat = w.category; card.dataset.id = w.id;
    const multi = w.media.length > 1;
    const right = (m.type === 'video' || m.type === 'youtube') && !multi ? '<span class="card-play"></span>' : multi ? `<span class="card-count">${w.media.length} ${plural(w.media.length)}</span>` : '';
    card.innerHTML = `
      <div class="card-inner" tabindex="0" role="button" aria-label="${esc(w.title || 'Робота')}">
        <div class="card-media" style="padding-top:${(aspectOf(w) * 100).toFixed(2)}%">
          <img src="${esc(m.poster || m.src)}" alt="${esc(w.title || '')}" loading="lazy" decoding="async">
          ${m.type === 'video' ? `<video muted loop playsinline preload="none" data-src="${esc(m.src)}"></video>` : ''}
        </div>
        <span class="card-tag">${esc(S.categories[w.category] || '')}</span>
        <div class="card-shine"></div>
        <div class="card-meta"><div><div class="card-title">${esc(w.title || '')}</div>${w.client ? `<div class="card-client">${esc(w.client)}</div>` : ''}</div>${right}</div>
      </div>`;
    card.style.transitionDelay = `${(i % 8) * 60}ms`;
    g.appendChild(card);
    bindCard(card, w);
  });
  revealObserve($$('.card', g));
}
const plural = n => (n % 10 === 1 && n % 100 !== 11) ? 'слайд' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 'слайди' : 'слайдів';

function bindCard(card, w) {
  const inner = $('.card-inner', card), video = $('video', card), img = $('img', card);
  let slideTimer = 0, slide = 0;
  const open = () => openWork(w.id);
  inner.addEventListener('click', open);
  inner.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  if (isTouch) return;
  inner.addEventListener('pointerenter', () => {
    cursor.classList.add('is-view');
    if (video) {
      if (!video.src) video.src = video.dataset.src;
      video.play().then(() => card.classList.add('is-playing')).catch(() => {});
    } else if (w.media.length > 1) {
      slideTimer = setInterval(() => { slide = (slide + 1) % w.media.length; img.src = w.media[slide].poster || w.media[slide].src; }, 900);
    }
  });
  inner.addEventListener('pointerleave', () => {
    cursor.classList.remove('is-view');
    inner.style.transform = '';
    if (video) { video.pause(); card.classList.remove('is-playing'); }
    if (slideTimer) { clearInterval(slideTimer); slideTimer = 0; slide = 0; img.src = w.media[0].poster || w.media[0].src; }
  });
  inner.addEventListener('pointermove', e => {
    const r = inner.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    inner.style.transform = `rotateY(${(x - .5) * 10}deg) rotateX(${(.5 - y) * 10}deg) translateZ(10px)`;
    inner.style.setProperty('--mx', x * 100 + '%'); inner.style.setProperty('--my', y * 100 + '%');
  });
}

let io;
function revealObserve(nodes) {
  io ??= new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  nodes.forEach(n => io.observe(n));
}

// ---------------- lightbox ----------------
const lb = $('.lb');
let cur = null, slideIdx = 0;
function listForNav() { return WORKS.filter(w => filter === 'all' || w.category === filter); }
function openWork(id, push = true) {
  const w = WORKS.find(x => x.id === id); if (!w) return;
  cur = w; slideIdx = 0;
  $('.lb-cat').textContent = S.categories[w.category] || '';
  $('.lb-title').textContent = w.title || '';
  $('.lb-client').textContent = [w.client, w.year].filter(Boolean).join(' · ');
  $('.lb-desc').textContent = w.description || '';
  const link = $('.lb-link');
  link.hidden = !w.link; if (w.link) link.href = w.link;
  link.textContent = /youtu\.?be/.test(w.link || '') ? 'Дивитись на YouTube ↗' : 'Відкрити сайт ↗';
  const many = w.media.length > 1;
  $$('.lb-arrow').forEach(b => b.hidden = !many);
  $('.lb-dots').innerHTML = many ? w.media.map((_, i) => `<button aria-label="Слайд ${i + 1}"></button>`).join('') : '';
  $$('.lb-dots button').forEach((b, i) => b.addEventListener('click', () => showSlide(i)));
  showSlide(0, true);
  if (lb.hidden) {
    lb.hidden = false; document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => lb.classList.add('is-open')));
    scene?.pulse(1);
  }
  if (push) history.replaceState(null, '', '#' + encodeURIComponent(id));
}
function showSlide(i, instant) {
  const w = cur, n = w.media.length;
  slideIdx = (i + n) % n;
  const m = w.media[slideIdx], box = $('.lb-media');
  const build = () => {
    $$('video', box).forEach(v => v.pause());
    let html;
    if (m.type === 'youtube') html = `<div class="lb-yt"><iframe src="https://www.youtube-nocookie.com/embed/${esc(m.yt)}?autoplay=1&rel=0" title="YouTube" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
    else if (m.type === 'video') html = `<video src="${esc(m.src)}" poster="${esc(m.poster || '')}" controls playsinline autoplay loop></video>`;
    else if (w.category === 'landings' && m.h / m.w > 1.6) html = `<div class="lb-scroll"><img src="${esc(m.src)}" alt=""></div>`;
    else html = `<img src="${esc(m.src)}" alt="${esc(w.title || '')}">`;
    box.innerHTML = html;
    box.classList.remove('is-swap');
    const v = $('video', box); if (v) v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
  };
  $$('.lb-dots button').forEach((b, k) => b.classList.toggle('is-on', k === slideIdx));
  if (instant) build(); else { box.classList.add('is-swap'); setTimeout(build, 220); }
}
function closeWork() {
  if (lb.hidden) return;
  lb.classList.remove('is-open');
  $$('video', lb).forEach(v => v.pause());
  setTimeout(() => { lb.hidden = true; $('.lb-media').innerHTML = ''; document.body.style.overflow = ''; }, 450);
  history.replaceState(null, '', location.pathname + location.search);
  cur = null;
}
function stepWork(d) {
  const l = listForNav(); if (!cur || !l.length) return;
  const i = l.findIndex(w => w.id === cur.id);
  const next = l[(i + d + l.length) % l.length];
  $('.lb-media').classList.add('is-swap');
  setTimeout(() => openWork(next.id), 200);
}
function initLightbox() {
  $('.lb-close').addEventListener('click', closeWork);
  $('.lb-bg').addEventListener('click', closeWork);
  $('.lb-prev').addEventListener('click', () => showSlide(slideIdx - 1));
  $('.lb-next').addEventListener('click', () => showSlide(slideIdx + 1));
  $('.lb-wprev').addEventListener('click', () => stepWork(-1));
  $('.lb-wnext').addEventListener('click', () => stepWork(1));
  $('.lb-share').addEventListener('click', async () => {
    const u = location.origin + location.pathname + '#' + encodeURIComponent(cur.id);
    try { await navigator.clipboard.writeText(u); toast('Посилання скопійовано'); } catch { prompt('Скопіюйте посилання:', u); }
  });
  addEventListener('keydown', e => {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeWork();
    if (e.key === 'ArrowRight') cur.media.length > 1 ? showSlide(slideIdx + 1) : stepWork(1);
    if (e.key === 'ArrowLeft') cur.media.length > 1 ? showSlide(slideIdx - 1) : stepWork(-1);
  });
  let sx = 0, sy = 0;
  const stage = $('.lb-stage');
  stage.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  stage.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) cur.media.length > 1 ? showSlide(slideIdx + (dx < 0 ? 1 : -1)) : stepWork(dx < 0 ? 1 : -1);
  });
  addEventListener('hashchange', () => { const id = decodeURIComponent(location.hash.slice(1)); if (WORKS.some(w => w.id === id)) openWork(id, false); });
}
function toast(t) {
  let n = $('.toast'); if (!n) { n = el('div', 'toast'); document.body.appendChild(n); }
  n.textContent = t; n.classList.add('is-on'); clearTimeout(n._t); n._t = setTimeout(() => n.classList.remove('is-on'), 1800);
}

// ---------------- cursor, nav, scroll ----------------
const cursor = $('.cursor');
function initChrome() {
  let cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy;
  addEventListener('pointermove', e => {
    tx = e.clientX; ty = e.clientY;
    state.mouseX = e.clientX / innerWidth * 2 - 1; state.mouseY = -(e.clientY / innerHeight * 2 - 1);
  });
  (function loop() { cx += (tx - cx) * 0.2; cy += (ty - cy) * 0.2; cursor.style.transform = `translate(${cx}px,${cy}px)`; requestAnimationFrame(loop); })();
  document.addEventListener('pointerover', e => { if (e.target.closest('a,button,.chip')) cursor.classList.add('is-link'); });
  document.addEventListener('pointerout', e => { if (e.target.closest('a,button,.chip')) cursor.classList.remove('is-link'); });

  const nav = $('.nav'); let last = 0;
  addEventListener('scroll', () => {
    const y = scrollY;
    state.vel += (y - state.scrollY);
    state.scrollY = y;
    nav.classList.toggle('is-scrolled', y > 40);
    nav.classList.toggle('is-hidden', y > last && y > innerHeight * 0.8);
    last = y;
  }, { passive: true });

  const wo = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && e.target.classList.add('is-in')), { threshold: 0.3 });
  $$('.split-words').forEach(n => wo.observe(n));
}

// ---------------- 3D ----------------
let scene = null;
async function init3D() {
  try {
    const { createScene } = await import('./scene.js?v=mwma34ek');
    scene = await createScene({
      canvas: $('#gl'), works: WORKS, state, isTouch, reduced,
      onOpen: id => openWork(id),
      onHover: on => cursor.classList.toggle('is-view', on),
      onProgress: p => setLoad(0.2 + p * 0.75)
    });
  } catch (e) {
    console.warn('3D недоступне, сайт працює без нього', e);
  }
}

// ---------------- boot ----------------
(async function boot() {
  await load();
  setLoad(0.2);
  applySettings();
  heroWeight();
  const qcat = new URLSearchParams(location.search).get('cat');
  filter = qcat && S.categories[qcat] ? qcat : 'all';
  renderFilters();
  renderGrid();
  initLightbox();
  initChrome();
  await Promise.race([init3D(), new Promise(r => setTimeout(r, 6000))]);
  setLoad(1);
  setTimeout(() => {
    document.body.classList.add('is-ready');
    document.body.classList.remove('is-loading');
    scene?.intro();
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && WORKS.some(w => w.id === id)) setTimeout(() => openWork(id, false), 900);
  }, 450);
})();
