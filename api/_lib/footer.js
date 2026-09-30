// The site-wide footer: services, navigation, contacts and company details.
// One source for every page: scripts/build-langs.mjs writes it into the main
// pages (between the FOOTER markers) and templates.js into blog posts. The
// Russian text is baked in; data-i18n keys (assets/i18n.js) translate it.

const SERVICES = ['performance-marketing', 'lead-generation', 'google-ads', 'web-development', 'influencer-marketing', 'reels-production', 'logo-design', 'branding'];

// Russian labels (the default language); translations live in assets/i18n.js.
const RU = {
  'performance-marketing': 'Performance-маркетинг в Ташкенте',
  'lead-generation': 'Таргетированная реклама в Ташкенте',
  'google-ads': 'Реклама в Google Ads в Ташкенте',
  'web-development': 'Разработка сайтов в Ташкенте',
  'influencer-marketing': 'Реклама у блогеров в Ташкенте',
  'reels-production': 'Reels Production в Ташкенте',
  'logo-design': 'Дизайн логотипа в Ташкенте',
  'branding': 'Брендинг в Ташкенте',
};

const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';

const CSS_LINK = '<link rel="stylesheet" href="/assets/footer.css">';

const HTML = `<!-- FOOTER:START (generated from api/_lib/footer.js) -->
  <footer class="card site-foot" id="siteFooter">
   <div class="sf-in">
    <div class="sf-brand">
      <a class="sf-logo" href="/" aria-label="Apelsin"><img src="/assets/apelsin-logo.png" alt="Apelsin" width="160" height="22"></a>
      <p class="sf-about" data-i18n="footAbout">Apelsin — performance-маркетинговое агентство в Ташкенте. Настраиваем рекламу, создаём сайты, контент и бренд, которые приносят бизнесу заявки и продажи.</p>
      <a class="sf-cta" href="/booking"><span data-i18n="footBook">Бесплатная консультация</span>${ARROW}</a>
    </div>
    <nav class="sf-col" aria-label="Услуги в Ташкенте" data-i18n-aria="footServices">
      <p class="sf-h" data-i18n="footServices">Услуги в Ташкенте</p>
      <ul>
${SERVICES.map((s) => `        <li><a href="/services/${s}" data-i18n="fs:${s}">${RU[s]}</a></li>`).join('\n')}
        <li><a class="sf-all" href="/services" data-i18n="footAllServices">Все услуги</a></li>
      </ul>
    </nav>
    <nav class="sf-col" aria-label="Навигация" data-i18n-aria="footNav">
      <p class="sf-h" data-i18n="footNav">Навигация</p>
      <ul>
        <li><a href="/" data-i18n="footHome">Главная</a></li>
        <li><a href="/services" data-i18n="services">Услуги</a></li>
        <li><a href="/blog" data-i18n="footBlog">Блог о маркетинге</a></li>
        <li><a href="/booking" data-i18n="footBook">Бесплатная консультация</a></li>
        <li><a href="/bilolalixan" data-i18n="footFounder">Основатель — Bilol alixan</a></li>
      </ul>
    </nav>
    <div class="sf-col">
      <p class="sf-h" data-i18n="footContacts">Контакты</p>
      <ul>
        <li><a href="tel:+998338308000">+998 33 830 80 00</a></li>
        <li><a href="https://t.me/bilolalixans" target="_blank" rel="noopener">Telegram: @bilolalixans</a></li>
        <li><a href="https://www.instagram.com/bilolalixan" target="_blank" rel="noopener">Instagram: @bilolalixan</a></li>
        <li><a href="https://www.youtube.com/@bilolalixan" target="_blank" rel="noopener">YouTube: @bilolalixan</a></li>
        <li><a href="https://www.linkedin.com/in/bilol-alixan-toxirov-828897304" target="_blank" rel="noopener">LinkedIn</a></li>
        <li><span data-i18n="footAddr">Ташкент, Узбекистан</span></li>
      </ul>
    </div>
    <div class="sf-col sf-req">
      <p class="sf-h" data-i18n="footReq">Реквизиты</p>
      <dl>
        <dt data-i18n="footReqBrand">Бренд</dt><dd>Apelsin</dd>
        <dt data-i18n="footReqFounder">Основатель</dt><dd>Bilol alixan Kemal O'g'li</dd>
        <dt data-i18n="footReqCity">Адрес</dt><dd data-i18n="footAddr">Ташкент, Узбекистан</dd>
        <dt data-i18n="footReqPhone">Телефон</dt><dd>+998 33 830 80 00</dd>
        <dt data-i18n="footReqSite">Сайт</dt><dd>apelsin.asia</dd>
      </dl>
    </div>
    <div class="sf-bottom">
      <span>© 2026 Apelsin. <span data-i18n="footRights">Все права защищены.</span></span>
      <span class="sf-langs"><a href="/" hreflang="ru" data-lang-link="ru">Русский</a><a href="/uz" hreflang="uz" data-lang-link="uz">O'zbekcha</a><a href="/en" hreflang="en" data-lang-link="en">English</a></span>
    </div>
   </div>
  </footer>
  <!-- FOOTER:END -->`;

const MARK = /<!-- FOOTER:START[\s\S]*?<!-- FOOTER:END -->/;

/** Puts the footer into a page: replaces the marked block, or the old one-line footer. */
function inject(html) {
  let out;
  if (MARK.test(html)) out = html.replace(MARK, () => HTML);
  else if (/<p class="foot"[^>]*>[\s\S]*?<\/p>/.test(html)) out = html.replace(/<p class="foot"[^>]*>[\s\S]*?<\/p>/, () => HTML);
  else out = html.replace(/(\n<\/div>\s*\n(?:\s*<script|<script))/, (m, g) => '\n' + HTML + g);
  if (!out.includes(CSS_LINK)) out = out.replace('</head>', CSS_LINK + '\n</head>');
  return out;
}

module.exports = { HTML, CSS_LINK, inject, SERVICES };
