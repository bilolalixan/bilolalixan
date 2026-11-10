// Silver Rain — Telegram Mini App prototype.
// Pick a date and time, tap a zone on the plan, look around inside it in 3D,
// then book. Zone data and prices are sample values for the demo.
import { createViewer } from '/silver-rain/scenes.js';

const tg = window.Telegram && window.Telegram.WebApp;
if (tg) {
  tg.ready(); tg.expand();
  try { tg.setHeaderColor('#0b0b0c'); tg.setBackgroundColor('#0b0b0c'); } catch (_) {}
}
const haptic = (kind = 'light') => { try { tg && tg.HapticFeedback.impactOccurred(kind); } catch (_) {} };

const ZONES = [
  { id: 'pool', scene: 'pool', name: 'Basseyn', tag: 'ENG MASHHUR', x: 16, y: 16, w: 200, h: 150, price: 250000, cap: 20, area: 180, temp: '29°',
    sub: 'Isitiladigan basseyn · shezlonglar', feats: ['Isitilgan suv', 'Shezlonglar', 'Sochiq va xalat', 'Bar xizmati'] },
  { id: 'jacuzzi', scene: 'jacuzzi', name: 'Jakuzi', tag: 'GIDROMASSAJ', x: 226, y: 16, w: 98, h: 70, price: 180000, cap: 6, area: 24, temp: '37°',
    sub: 'Gidromassajli vanna', feats: ['Gidromassaj', 'Aromaterapiya', 'LED yoritish'] },
  { id: 'sauna', scene: 'sauna', name: 'Fin saunasi', tag: 'ISSIQ ZONA', x: 226, y: 96, w: 98, h: 70, price: 150000, cap: 8, area: 16, temp: '90°',
    sub: 'Quruq bug\' · yog\'och', feats: ['Quruq bug\'', 'Venik', 'Choy', 'Sovuq dush'] },
  { id: 'hammam', scene: 'hammam', name: 'Turk hammomi', tag: 'AN\'ANAVIY', x: 16, y: 176, w: 146, h: 100, price: 200000, cap: 10, area: 60, temp: '48°',
    sub: 'Marmar · nam bug\'', feats: ['Nam bug\'', 'Kese-massaj', 'Ko\'pikli massaj'] },
  { id: 'relax', scene: 'relax', name: 'Dam olish zonasi', tag: 'BALI USLUBIDA', x: 172, y: 176, w: 152, h: 100, price: 120000, cap: 14, area: 90, temp: '24°',
    sub: 'Choy · sokin musiqa', feats: ['Bepul choy', 'Mevalar', 'Kitoblar', 'Wi-Fi'] },
  { id: 'massage1', scene: 'massage', name: 'Massaj xonasi 1', tag: 'JUFTLIKLAR UCHUN', x: 16, y: 286, w: 98, h: 98, price: 400000, cap: 2, area: 18, temp: '26°',
    sub: '60 daqiqa · 2 kishi', feats: ['Klassik massaj', 'Bali massaji', 'Aromamoylar'] },
  { id: 'massage2', scene: 'massage', name: 'Massaj xonasi 2', tag: 'JUFTLIKLAR UCHUN', x: 124, y: 286, w: 92, h: 98, price: 400000, cap: 2, area: 18, temp: '26°',
    sub: '60 daqiqa · 2 kishi', feats: ['Tosh massaji', 'Sport massaji', 'Aromamoylar'] },
  { id: 'vip', scene: 'vip', name: 'VIP xona', tag: 'PREMIUM', x: 226, y: 286, w: 98, h: 98, price: 900000, cap: 6, area: 45, temp: '28°',
    sub: 'Shaxsiy jakuzi · lounj', feats: ['Shaxsiy jakuzi', 'Lounj zona', 'Shaxsiy xodim', '3 soat'] },
];

const fmt = (n) => n.toLocaleString('ru-RU').replace(/,/g, ' ') + ' so\'m';
const $ = (id) => document.getElementById(id);
const MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'];
const WEEK = ['Yak', 'Du', 'Se', 'Chor', 'Pay', 'Ju', 'Sha'];
const SLOTS = ['10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];

const state = { day: 0, slot: 2, zone: null, guests: 2 };

/* ── Date & time ── */
const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
$('days').innerHTML = days.map((d, i) => `<button class="day" data-i="${i}">${i === 0 ? 'Bugun' : i === 1 ? 'Ertaga' : WEEK[d.getDay()]} · ${d.getDate()} ${MONTHS[d.getMonth()]}</button>`).join('');
$('slots').innerHTML = SLOTS.map((s, i) => `<button class="slot" data-i="${i}">${s}</button>`).join('');
$('days').addEventListener('click', (e) => { const b = e.target.closest('.day'); if (b) { state.day = +b.dataset.i; haptic(); render(); } });
$('slots').addEventListener('click', (e) => { const b = e.target.closest('.slot'); if (b) { state.slot = +b.dataset.i; haptic(); render(); } });

// Demo occupancy: a stable pseudo-random pattern per date and time.
const taken = (z) => { let h = state.day * 31 + state.slot * 17; for (const c of z.id) h = (h * 33 + c.charCodeAt(0)) % 997; return h % 5 === 0; };

/* ── Plan ── */
function planSVG(sel, interactive) {
  return `<rect x="4" y="4" width="332" height="392" rx="22" fill="#141416" stroke="rgba(255,255,255,0.08)"/>` + ZONES.map((z) => {
    const isSel = sel === z.id, isTaken = interactive && taken(z);
    const fill = isSel ? '#7ee0a8' : isTaken ? '#3a1d22' : z.id === 'vip' ? '#2e2a22' : '#232327';
    const stroke = isSel ? '#7ee0a8' : isTaken ? '#6b2a33' : z.id === 'vip' ? 'rgba(200,169,107,0.5)' : 'rgba(255,255,255,0.10)';
    const name = interactive ? `<text class="z-name" x="${z.x + 12}" y="${z.y + 22}" ${isSel ? 'style="fill:#062615"' : ''}>${z.name}</text>
      <text class="z-sub" x="${z.x + 12}" y="${z.y + 37}" ${isSel ? 'style="fill:#0f4a2a"' : ''}>${isTaken ? 'Band' : z.cap + ' kishi · ' + Math.round(z.price / 1000) + 'k'}</text>` : '';
    const wave = interactive && (z.id === 'pool' || z.id === 'jacuzzi') && !isSel ? `<path d="M${z.x + 14} ${z.y + z.h - 22} q 10 -8 20 0 t 20 0 t 20 0" fill="none" stroke="rgba(126,224,168,0.35)" stroke-width="2"/>` : '';
    return `<g class="zone${isTaken ? ' taken' : ''}" data-id="${z.id}"><rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>${wave}${name}</g>`;
  }).join('');
}

function render() {
  document.querySelectorAll('.day').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.i === state.day)));
  document.querySelectorAll('.slot').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.i === state.slot)));
  if (state.zone && taken(state.zone)) state.zone = null;
  $('plan').innerHTML = planSVG(state.zone && state.zone.id, true);
  const z = state.zone;
  $('barSmall').textContent = z ? `${z.name} · ${SLOTS[state.slot]}` : 'Zonani tanlang';
  $('barBig').textContent = z ? fmt(z.price) : '—';
  $('contBtn').disabled = !z;
}

$('plan').addEventListener('click', (e) => {
  const g = e.target.closest('.zone'); if (!g) return;
  const z = ZONES.find((x) => x.id === g.dataset.id);
  if (taken(z)) { haptic('rigid'); return; }
  haptic('medium');
  if (state.zone && state.zone.id === z.id) { openZone(); return; }
  state.zone = z; render();
  openZone();
});
$('contBtn').addEventListener('click', () => state.zone && openZone());
$('closeBtn').addEventListener('click', () => (tg ? tg.close() : history.back()));
$('infoBtn').addEventListener('click', () => {
  const t = 'Silver Rain — Toshkentdagi Bali uslubidagi spa. Zonani tanlang va ichini 3D\'da ko\'ring. (Prototip: narx va bandlik namunaviy.)';
  tg && tg.showAlert ? tg.showAlert(t) : alert(t);
});

/* ── Zone view ── */
const viewer = createViewer($('gl'));
let sheetTimer = 0;

function openZone() {
  const z = state.zone; if (!z) return;
  $('map').hidden = true; $('zone').hidden = false;
  $('viewName').textContent = z.name + ' ichidan';
  $('sTag').textContent = z.tag;
  $('sName').textContent = z.name;
  $('sSub').textContent = `${z.sub} · ${days[state.day].getDate()} ${MONTHS[days[state.day].getMonth()]}, ${SLOTS[state.slot]}`;
  $('stats').innerHTML = `<div><b>${z.area} m²</b><span>maydon</span></div><div><b>${z.temp}</b><span>harorat</span></div><div><b>${z.cap}</b><span>kishigacha</span></div>`;
  $('feats').innerHTML = z.feats.map((f) => `<span>${f}</span>`).join('');
  $('bookBtn').textContent = 'Bron · ' + fmt(z.price);
  $('mini').innerHTML = planSVG(z.id, false);
  $('sheet').classList.remove('open', 'booking');
  $('hint').style.opacity = '1';
  viewer.load(z.scene);
  clearTimeout(sheetTimer);
  sheetTimer = setTimeout(() => { $('sheet').classList.add('open'); $('hint').style.opacity = '0'; }, 1700);
  if (tg) { tg.BackButton.show(); }
}

function closeZone() {
  viewer.stop(); clearTimeout(sheetTimer);
  $('zone').hidden = true; $('map').hidden = false;
  if (tg) tg.BackButton.hide();
  render();
}
$('backBtn').addEventListener('click', closeZone);
$('otherBtn').addEventListener('click', closeZone);
if (tg) tg.BackButton.onClick(() => ($('sheet').classList.contains('booking') ? $('sheet').classList.remove('booking') : closeZone()));
$('gyroBtn').addEventListener('click', async () => { const on = await viewer.enableGyro(); $('gyroBtn').style.background = on ? 'rgba(126,224,168,0.35)' : ''; haptic(); });
// Hide the sheet while looking around, show it again on release.
$('gl').addEventListener('pointerdown', () => { if (!$('sheet').classList.contains('booking')) $('sheet').classList.remove('open'); $('hint').style.opacity = '0'; });
$('gl').addEventListener('pointerup', () => { clearTimeout(sheetTimer); sheetTimer = setTimeout(() => $('sheet').classList.add('open'), 700); });

/* ── Booking ── */
const user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
if (user) $('fName').value = [user.first_name, user.last_name].filter(Boolean).join(' ');
$('bookBtn').addEventListener('click', () => {
  const z = state.zone;
  $('formSub').textContent = `${z.name} · ${days[state.day].getDate()} ${MONTHS[days[state.day].getMonth()]}, ${SLOTS[state.slot]} · ${fmt(z.price)}`;
  $('fMsg').textContent = ''; $('fMsg').className = 'msg';
  $('sheet').classList.add('booking', 'open'); haptic('medium');
});
$('fBack').addEventListener('click', () => $('sheet').classList.remove('booking'));
$('gMinus').addEventListener('click', () => { state.guests = Math.max(1, state.guests - 1); $('gCount').textContent = state.guests; });
$('gPlus').addEventListener('click', () => { state.guests = Math.min(state.zone ? state.zone.cap : 10, state.guests + 1); $('gCount').textContent = state.guests; });

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('fName').value.trim(), phone = $('fPhone').value.replace(/[^\d+]/g, '');
  const msg = $('fMsg');
  if (name.length < 2) { msg.textContent = 'Ismingizni yozing'; msg.className = 'msg err'; return; }
  if (phone.replace(/\D/g, '').length < 9) { msg.textContent = 'Telefon raqamni to\'liq kiriting'; msg.className = 'msg err'; return; }
  const z = state.zone, d = days[state.day];
  const text = [
    '🌿 SILVER RAIN — bron (Mini App prototipi)',
    `Zona: ${z.name}`,
    `Sana: ${d.getDate()} ${MONTHS[d.getMonth()]}, ${SLOTS[state.slot]}`,
    `Mehmonlar: ${state.guests}`,
    `Narx: ${fmt(z.price)}`,
    `Telefon: ${phone}`,
    user && user.username ? `Telegram: @${user.username}` : '',
  ].filter(Boolean).join('\n');
  $('fSend').disabled = true; $('fSend').textContent = 'Yuborilmoqda...';
  try {
    const r = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, text, lang: 'uz', hp: '' }) });
    const data = await r.json();
    if (!data.ok) throw new Error();
    haptic('heavy');
    msg.textContent = 'Rahmat! Administrator tez orada siz bilan bog\'lanadi.'; msg.className = 'msg ok';
    try { tg && tg.HapticFeedback.notificationOccurred('success'); } catch (_) {}
    setTimeout(closeZone, 1800);
  } catch (_) {
    msg.textContent = 'Yuborib bo\'lmadi. Qayta urinib ko\'ring.'; msg.className = 'msg err';
  }
  $('fSend').disabled = false; $('fSend').textContent = 'Yuborish';
});

render();
