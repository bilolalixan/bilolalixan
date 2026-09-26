// HTML for a blog post page and its card on /blog. Mirrors
// blog/apelsin-blogi-ishga-tushdi.html so bot-made posts look identical.

const { esc } = require('./format');

const SITE = 'https://www.apelsin.asia';

const ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>';
const ICON_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
const ICON_SUN = '<svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
const ICON_MOON = '<svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>';
const ICON_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>';

const THEME_SCRIPT = `<script>
/* Apply the saved (or system) theme before first paint. */
(function () {
  var t = null;
  try { t = localStorage.getItem('theme'); } catch (_) {}
  if (t !== 'light' && t !== 'dark') t = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = t === 'light' ? '#eeeef0' : '#0b0b0c';
})();
</script>`;

/**
 * @param {object} p
 * @param {string} p.slug
 * @param {string} p.title
 * @param {string} p.tag
 * @param {string} p.description  plain text, ~160 chars
 * @param {string} p.bodyHtml     already-escaped article HTML
 * @param {{iso:string,human:string}} p.date
 * @param {number} p.minutes
 * @param {string|null} p.cover   site path of the cover image, e.g. /assets/blog/slug.jpg
 */
function postPage(p) {
  const url = `${SITE}/blog/${p.slug}`;
  const image = p.cover ? SITE + p.cover : `${SITE}/assets/og-blog.jpg`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'BlogPosting',
    headline: p.title, description: p.description,
    datePublished: p.date.iso, dateModified: p.date.iso, inLanguage: 'uz',
    image, mainEntityOfPage: url,
    author: { '@type': 'Person', name: "Bilol alixan Kemal O'g'li", url: `${SITE}/bilolalixan` },
    publisher: { '@type': 'Organization', name: 'Apelsin', logo: { '@type': 'ImageObject', url: `${SITE}/assets/icon-512.png` } },
  };
  const ldJson = JSON.stringify(ld).replace(/</g, '\\u003c');
  const cover = p.cover
    ? `\n      <figure><img src="${esc(p.cover)}" alt="${esc(p.title)}"></figure>\n`
    : '';

  return `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#0b0b0c">
${THEME_SCRIPT}
<title>${esc(p.title)} — Apelsin</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Apelsin">
<meta property="og:locale" content="uz_UZ">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${esc(image)}">
<meta property="article:published_time" content="${p.date.iso}">
<meta property="article:author" content="Bilol alixan">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(image)}">
<script type="application/ld+json">${ldJson}</script>
<link rel="stylesheet" href="/assets/blog.css">
</head>
<body>

<div class="wrap">

  <!-- HERO -->
  <header class="card hero">
    <div class="top">
      <div class="top-left">
        <a class="pill" href="/blog">
          ${ICON_BACK}
          Blog
        </a>
      </div>
      <div class="top-actions">
        <button class="icon-btn theme-btn" type="button" data-theme-toggle aria-label="Yorug' / qorong'i rejim">
          ${ICON_SUN}
          ${ICON_MOON}
        </button>
        <button class="icon-btn" id="shareBtn" type="button" aria-label="Ulashish">
          ${ICON_SHARE}
        </button>
      </div>
    </div>

    <div class="hero-body">
      <p class="eyebrow">
        <span class="post-tag">${esc(p.tag)}</span>
        <time datetime="${p.date.iso}">${esc(p.date.human)}</time>
        <span class="dot"></span>
        <span>${p.minutes} daqiqa o'qish</span>
      </p>
      <h1 class="h1"><b>${esc(p.title)}</b></h1>
      <div class="chips">
        <a class="chip" href="/bilolalixan" style="text-decoration:none">
          <img src="/assets/bilolalixan.jpg" alt="" style="width:22px;height:22px;border-radius:50%;object-fit:cover;margin-left:-6px">
          <b>Bilol alixan</b> · Founder
        </a>
      </div>
    </div>
  </header>

  <!-- ARTICLE -->
  <article class="card article">
    <div class="prose">${cover}
${p.bodyHtml}
    </div>
  </article>

  <!-- CTA -->
  <a class="card cta" href="/bilolalixan">
    <img src="/assets/bilolalixan.jpg" alt="Bilol alixan">
    <div class="cta-text">
      <p class="cta-title">Bilol alixan bilan bog'lanish</p>
      <p class="cta-sub">Fikr qoldiring yoki savol bering</p>
    </div>
    <span class="go">${ICON_NEXT}</span>
  </a>

  <p class="foot"><a href="/">© Apelsin</a> · <a href="/blog">Blog</a></p>
</div>

<script>
document.getElementById('shareBtn').addEventListener('click', async () => {
  const data = { title: document.title, url: location.href };
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(data.url);
    alert('Havola nusxalandi');
  } catch (_) {}
});
</script>
<script src="/assets/i18n.js"></script>
<script src="/assets/theme.js"></script>
</body>
</html>
`;
}

/** Card for /blog. The newest card gets the "featured" class. */
function postCard(p) {
  return `    <!-- POST:${p.slug} -->
    <a class="card post-card featured" href="/blog/${p.slug}">
      <div class="post-meta">
        <span class="post-tag">${esc(p.tag)}</span>
        <time datetime="${p.date.iso}">${esc(p.date.human)}</time>
        <span class="dot"></span>
        <span>${p.minutes} daqiqa</span>
      </div>
      <h2 class="post-title">${esc(p.title)}</h2>
      <p class="post-excerpt">${esc(p.description)}</p>
      <div class="post-foot">
        <span class="author"><img src="/assets/bilolalixan.jpg" alt=""><span><b>Bilol alixan</b></span></span>
        <span class="go">${ICON_NEXT}</span>
      </div>
    </a>
    <!-- /POST:${p.slug} -->
`;
}

/** Insert a card at the top of /blog and make it the only featured one. */
function addCard(indexHtml, cardHtml) {
  const START = /<!-- POSTS:START[^>]*-->\n/;
  if (!START.test(indexHtml)) throw new Error('POSTS:START marker not found in blog/index.html');
  const unfeatured = indexHtml.replace(/class="card post-card featured"/g, 'class="card post-card"');
  return unfeatured.replace(START, (m) => m + cardHtml);
}

/** Remove a card; the newest remaining card becomes featured. */
function removeCard(indexHtml, slug) {
  const re = new RegExp(`[ \\t]*<!-- POST:${slug} -->[\\s\\S]*?<!-- /POST:${slug} -->\\n?`);
  if (!re.test(indexHtml)) return null;
  let out = indexHtml.replace(re, '').replace(/class="card post-card featured"/g, 'class="card post-card"');
  out = out.replace('class="card post-card"', 'class="card post-card featured"');
  return out;
}

/** List posts on /blog (newest first) from the card markers. */
function listCards(indexHtml) {
  const out = [];
  const re = /<!-- POST:([a-z0-9-]+) -->[\s\S]*?<time datetime="([^"]+)">[\s\S]*?<h2 class="post-title">([\s\S]*?)<\/h2>/g;
  let m;
  while ((m = re.exec(indexHtml))) out.push({ slug: m[1], date: m[2], title: m[3].replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') });
  return out;
}

function addToSitemap(xml, slug, iso) {
  if (xml.includes(`/blog/${slug}</loc>`)) return xml;
  return xml.replace('</urlset>', `  <url>
    <loc>${SITE}/blog/${slug}</loc>
    <lastmod>${iso}</lastmod>
    <priority>0.7</priority>
  </url>
</urlset>`);
}

function removeFromSitemap(xml, slug) {
  const re = new RegExp(`[ \\t]*<url>\\s*<loc>${SITE.replace(/[.]/g, '\\.')}/blog/${slug}</loc>[\\s\\S]*?</url>\\n?`);
  return xml.replace(re, '');
}

module.exports = { postPage, postCard, addCard, removeCard, listCards, addToSitemap, removeFromSitemap, SITE };
