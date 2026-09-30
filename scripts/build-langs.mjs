// Builds the language versions of the site's main pages.
//
//   node scripts/build-langs.mjs
//
// Russian is the default language and lives at the root (/, /services, ...).
// Uzbek and English copies are written to /uz/... and /en/.... The root file
// of each page is the source: every element with data-i18n, data-i18n-html,
// data-i18n-aria or data-i18n-ph gets its text from the dictionary in
// assets/i18n.js (plus the page's own window.I18N_PAGE), and the <title>,
// meta tags, canonical, hreflang links and internal links are set per
// language. Run it after editing any of these pages; the root file is
// rewritten too, so it always holds the Russian text.
//
// Blog posts are not copied: their content is only in Uzbek, and their
// interface follows the visitor's saved language at runtime.
//
// Needs Playwright (set PLAYWRIGHT to its index.mjs if it is not global).

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://www.apelsin.asia';
const LANGS = ['ru', 'uz', 'en'];
const DEFAULT = 'ru';
const LOCALE = { ru: 'ru_RU', uz: 'uz_UZ', en: 'en_US' };

const pwPath = process.env.PLAYWRIGHT || path.join(execSync('npm root -g').toString().trim(), 'playwright/index.mjs');
const { chromium } = await import(pwPath);

/* ── Dictionary from assets/i18n.js ── */
function loadDict() {
  let D = null;
  const window = { __I18N_EXPORT: (d) => { D = d; } };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets/i18n.js'), 'utf8'), { window });
  if (!D) throw new Error('assets/i18n.js did not export its dictionary');
  // Only plain strings can be baked into HTML.
  const out = {};
  for (const l of LANGS) out[l] = Object.fromEntries(Object.entries(D[l]).filter(([, v]) => typeof v === 'string'));
  return out;
}

/** The object literal assigned to window.I18N_PAGE in a page, if any. */
function pageDict(html) {
  const at = html.indexOf('window.I18N_PAGE =');
  if (at < 0) return {};
  const start = html.indexOf('{', at);
  let depth = 0, q = null;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') q = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return vm.runInNewContext('(' + html.slice(start, i + 1) + ')');
  }
  throw new Error('unterminated window.I18N_PAGE');
}

/* ── Pages and their titles / descriptions per language ── */
const SVC = ['performance-marketing', 'lead-generation', 'google-ads', 'web-development', 'influencer-marketing', 'reels-production', 'logo-design', 'branding'];
const SVC_TAIL = { ru: 'Apelsin, Ташкент — бесплатная консультация.', uz: 'Apelsin, Toshkent — bepul konsultatsiya.', en: 'Apelsin, Tashkent — free consultation.' };

const PAGES = [
  { path: '/', file: 'index.html', meta: {
    ru: ['Apelsin — performance-маркетинговое агентство в Ташкенте', 'Apelsin — performance-маркетинговое агентство в Ташкенте. Таргетированная реклама, Google Ads, сайты и брендинг, которые приносят бизнесу заявки и продажи. Бесплатная консультация.'],
    uz: ['Apelsin — performance-marketing agentligi, Toshkent', "Apelsin — Toshkentdagi performance-marketing agentligi. Target reklama, Google Ads, sayt va brending orqali biznesingizga lid va sotuv olib kelamiz. Bepul konsultatsiya."],
    en: ['Apelsin — performance marketing agency in Tashkent', 'Apelsin is a performance marketing agency in Tashkent. Targeted ads, Google Ads, websites and branding that bring your business leads and sales. Free consultation.'],
  } },
  { path: '/bilolalixan', file: 'bilolalixan/index.html', meta: {
    ru: ["Bilol alixan Kemal O'g'li — основатель Kingdom Group", "Bilol alixan Kemal O'g'li — основатель Kingdom Group. Телефон, Telegram, Instagram, LinkedIn и YouTube для связи; оставьте отзыв напрямую."],
    uz: ["Bilol alixan Kemal O'g'li — Founder, Kingdom Group", "Bilol alixan Kemal O'g'li — Kingdom Group asoschisi. Aloqa uchun telefon, Telegram, Instagram, LinkedIn va YouTube; fikringizni to'g'ridan-to'g'ri yuboring."],
    en: ["Bilol alixan Kemal O'g'li — Founder, Kingdom Group", "Bilol alixan Kemal O'g'li, founder of Kingdom Group. Phone, Telegram, Instagram, LinkedIn and YouTube; send your feedback directly."],
  } },
  { path: '/booking', file: 'booking/index.html', meta: {
    ru: ['Бесплатная маркетинговая консультация — Apelsin', 'Бесплатная маркетинговая консультация от Apelsin: ответьте на 8 коротких вопросов, и наш специалист свяжется с вами со стратегией для вашего бизнеса.'],
    uz: ['Bepul marketing konsultatsiyasi — Apelsin', "Apelsin'dan bepul marketing konsultatsiyasi: 8 ta qisqa savolga javob bering, mutaxassisimiz biznesingiz uchun strategiya bo'yicha siz bilan bog'lanadi."],
    en: ['Free marketing consultation — Apelsin', 'Free marketing consultation from Apelsin: answer 8 short questions and our specialist will contact you with a strategy for your business.'],
  } },
  { path: '/blog', file: 'blog/index.html', meta: {
    ru: ['Блог о маркетинге — Apelsin', 'Блог Apelsin: практические статьи о performance-маркетинге, рекламе, продажах и бизнес-стратегии. Автор — Bilol alixan.'],
    uz: ['Marketing blogi — Apelsin', "Apelsin marketing blogi: performance-marketing, reklama, sotuv va biznes strategiyasi bo'yicha amaliy maqolalar. Muallif — Bilol alixan."],
    en: ['Marketing blog — Apelsin', 'Apelsin blog: practical articles on performance marketing, advertising, sales and business strategy. By Bilol alixan.'],
  } },
  { path: '/services', file: 'services/index.html', meta: {
    ru: ['Маркетинговые услуги в Ташкенте — Apelsin', 'Услуги Apelsin: performance-маркетинг, таргетированная реклама (lead generation), Google Ads, разработка сайтов, influencer-маркетинг, Reels, логотип и брендинг. Ташкент.'],
    uz: ['Marketing xizmatlari Toshkentda — Apelsin', "Apelsin xizmatlari: performance marketing, target reklama (lead generation), Google Ads, sayt yaratish, influencer marketing, Reels, logo va branding. Toshkent."],
    en: ['Marketing services in Tashkent — Apelsin', 'Apelsin services: performance marketing, targeted ads (lead generation), Google Ads, web development, influencer marketing, Reels, logo design and branding. Tashkent.'],
  } },
  ...SVC.map((slug) => ({ path: '/services/' + slug, file: `services/${slug}.html`, svc: slug })),
];

const langPath = (p, l) => (l === DEFAULT ? p : '/' + l + (p === '/' ? '' : p));
const outFile = (file, l) => (l === DEFAULT ? file : path.join(l, file));

/* ── Translate one page in the browser (scripts disabled) ── */
function translate({ l, dict, P, meta, alts, canonical, locale, DEFAULT }) {
  const t = (k) => (P[l] && P[l][k]) ?? dict[l][k] ?? (P[DEFAULT] && P[DEFAULT][k]) ?? dict[DEFAULT][k] ?? dict.uz[k];
  const doc = document;
  doc.documentElement.lang = l;
  doc.querySelectorAll('[data-i18n]').forEach((el) => { const v = t(el.dataset.i18n); if (typeof v === 'string') el.textContent = v; });
  doc.querySelectorAll('[data-i18n-html]').forEach((el) => {
    let v = t(el.dataset.i18nHtml); if (typeof v !== 'string') return;
    if (v.includes('{avatar}')) { const img = el.querySelector('img'); v = v.replace('{avatar}', img ? img.outerHTML : ''); }
    el.innerHTML = v;
  });
  doc.querySelectorAll('[data-i18n-aria]').forEach((el) => { const v = t(el.dataset.i18nAria); if (typeof v === 'string') el.setAttribute('aria-label', v); });
  doc.querySelectorAll('[data-i18n-ph]').forEach((el) => { const v = t(el.dataset.i18nPh); if (typeof v === 'string') el.setAttribute('placeholder', v); });
  doc.querySelectorAll('[data-theme-toggle]').forEach((el) => el.setAttribute('aria-label', t('theme')));
  const share = doc.getElementById('shareBtn'); if (share) share.setAttribute('aria-label', t('share'));

  // Internal links to pages that exist in every language
  const VARIANT = /^\/(?:bilolalixan|booking|blog|services(?:\/[a-z-]+)?)?$/;
  doc.querySelectorAll('a[href^="/"]').forEach((a) => {
    const href = a.getAttribute('href');
    if (href.startsWith('//')) return;
    const m = href.match(/^([^?#]*)(.*)$/);
    const base = (m[1].replace(/^\/(uz|en)(?=\/|$)/, '') || '/').replace(/(.)\/$/, '$1');
    if (!VARIANT.test(base)) return;
    a.setAttribute('href', (l === DEFAULT ? base : '/' + l + (base === '/' ? '' : base)) + m[2]);
  });

  // Head
  const [title, desc] = meta;
  doc.title = title;
  const set = (sel, v) => doc.querySelectorAll(sel).forEach((el) => el.setAttribute('content', v));
  set('meta[name="description"]', desc);
  set('meta[property="og:title"], meta[name="twitter:title"]', title);
  set('meta[property="og:description"], meta[name="twitter:description"]', desc);
  set('meta[property="og:locale"]', locale);
  set('meta[property="og:url"]', canonical);
  let can = doc.querySelector('link[rel="canonical"]');
  if (!can) { can = doc.createElement('link'); can.rel = 'canonical'; doc.head.appendChild(can); }
  can.setAttribute('href', canonical);
  // Structured data: description and language follow the page language.
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      const ld = JSON.parse(s.textContent);
      if ('description' in ld) ld.description = desc;
      if ('inLanguage' in ld) ld.inLanguage = l;
      s.textContent = JSON.stringify(ld).replace(/</g, '\\u003c');
    } catch (_) {}
  });
  doc.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());
  let after = can;
  for (const [hl, href] of alts) {
    const link = doc.createElement('link');
    link.setAttribute('rel', 'alternate'); link.setAttribute('hreflang', hl); link.setAttribute('href', href);
    after.after(doc.createTextNode('\n'), link); after = link;
  }
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML + '\n';
}

const dict = loadDict();
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await browser.newContext({ javaScriptEnabled: false });
const page = await ctx.newPage();
await page.route('**/*', (r) => r.abort());

const written = [];
for (const pg of PAGES) {
  const src = fs.readFileSync(path.join(ROOT, pg.file), 'utf8');
  const P = pageDict(src);
  const alts = [...LANGS.map((l) => [l, SITE + langPath(pg.path, l)]), ['x-default', SITE + langPath(pg.path, DEFAULT)]];
  for (const l of LANGS) {
    let meta = pg.meta && pg.meta[l];
    if (pg.svc) {
      const d = dict[l];
      meta = [`${d['sn:' + pg.svc]} — ${d['st:' + pg.svc]} | Apelsin`, `${d['ss:' + pg.svc]} ${SVC_TAIL[l]}`];
    }
    await page.setContent(src, { waitUntil: 'domcontentloaded' });
    const html = await page.evaluate(translate, { l, dict, P, meta, alts, canonical: SITE + langPath(pg.path, l), locale: LOCALE[l], DEFAULT });
    const out = path.join(ROOT, outFile(pg.file, l));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, html);
    written.push(path.relative(ROOT, out));
  }
}
await browser.close();

/* ── Sitemap: every language version of these pages ── */
const smPath = path.join(ROOT, 'sitemap.xml');
let sm = fs.readFileSync(smPath, 'utf8');
const today = new Date().toISOString().slice(0, 10);
for (const pg of PAGES) {
  for (const l of LANGS) {
    const loc = SITE + (langPath(pg.path, l) === '/' ? '/' : langPath(pg.path, l));
    if (sm.includes(`<loc>${loc}</loc>`)) continue;
    sm = sm.replace('</urlset>', `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${pg.path === '/' ? '0.9' : '0.7'}</priority>\n  </url>\n</urlset>`);
  }
}
fs.writeFileSync(smPath, sm);

console.log(`Wrote ${written.length} pages:\n  ` + written.join('\n  '));
