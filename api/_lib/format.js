// Turns a Telegram message (text + entities) or a Markdown file into the blocks
// and HTML used by blog posts. Everything user-provided is escaped here.

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const safeUrl = (u) => {
  const s = String(u || '').trim();
  if (/^https?:\/\//i.test(s) || /^mailto:/i.test(s) || /^tel:/i.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s)) return 'https://' + s;
  return null;
};

/* ── Telegram text + entities → inline HTML for text[start, end) ── */
function renderRange(text, entities, start, end) {
  const inside = (entities || [])
    .filter((e) => e.offset < end && e.offset + e.length > start)
    .map((e) => ({ ...e, s: Math.max(e.offset, start), e: Math.min(e.offset + e.length, end) }))
    .filter((e) => e.s < e.e);

  const open = (e) => {
    switch (e.type) {
      case 'bold': return '<strong>';
      case 'italic': return '<em>';
      case 'underline': return '<u>';
      case 'strikethrough': return '<s>';
      case 'code': case 'pre': return '<code>';
      case 'text_link': { const u = safeUrl(e.url); return u ? '<a href="' + esc(u) + '" rel="noopener">' : ''; }
      case 'url': { const u = safeUrl(text.slice(e.offset, e.offset + e.length)); return u ? '<a href="' + esc(u) + '" rel="noopener">' : ''; }
      default: return '';
    }
  };
  const close = (e) => {
    switch (e.type) {
      case 'bold': return '</strong>';
      case 'italic': return '</em>';
      case 'underline': return '</u>';
      case 'strikethrough': return '</s>';
      case 'code': case 'pre': return '</code>';
      case 'text_link': return safeUrl(e.url) ? '</a>' : '';
      case 'url': return safeUrl(text.slice(e.offset, e.offset + e.length)) ? '</a>' : '';
      default: return '';
    }
  };

  // Telegram entities never partially overlap, so a simple stack works.
  const sorted = inside.sort((a, b) => a.s - b.s || b.e - a.e);
  let out = '';
  const stack = [];
  let k = 0;
  for (let i = start; i <= end; i++) {
    while (stack.length && stack[stack.length - 1].e === i) out += close(stack.pop());
    if (i === end) break;
    while (k < sorted.length && sorted[k].s === i) { out += open(sorted[k]); stack.push(sorted[k]); k++; }
    out += esc(text[i]);
  }
  while (stack.length) out += close(stack.pop());
  return out;
}

const BULLET = /^\s*([-•*—–])\s+/;
const NUMBER = /^\s*(\d{1,3})[.)]\s+/;
const QUOTE  = /^\s*>\s?/;

/* Split text into blocks separated by blank lines, keeping UTF-16 offsets. */
function splitBlocks(text, from) {
  const blocks = [];
  const re = /\n[ \t]*\n+/g;
  let last = from, m;
  re.lastIndex = from;
  while ((m = re.exec(text))) {
    if (m.index > last) blocks.push([last, m.index]);
    last = m.index + m[0].length;
  }
  if (last < text.length) blocks.push([last, text.length]);
  return blocks.filter(([a, b]) => text.slice(a, b).trim());
}

function lineRanges(text, a, b) {
  const out = [];
  let s = a;
  for (let i = a; i <= b; i++) {
    if (i === b || text[i] === '\n') { out.push([s, i]); s = i + 1; }
  }
  return out.filter(([x, y]) => text.slice(x, y).trim());
}

const coveredBy = (entities, type, a, b) =>
  (entities || []).some((e) => (type instanceof Array ? type.includes(e.type) : e.type === type) &&
    e.offset <= a && e.offset + e.length >= b);

/* Telegram message → { title, tag, blocksHtml, plain } */
function fromTelegram(text, entities) {
  text = text || '';
  entities = entities || [];

  // Title = first non-empty line (plain text).
  const firstNl = text.indexOf('\n');
  const titleEnd = firstNl === -1 ? text.length : firstNl;
  const title = text.slice(0, titleEnd).trim();

  let blocks = splitBlocks(text, titleEnd);

  // Optional tag: a trailing block made only of hashtags (#Marketing).
  let tag = null;
  if (blocks.length) {
    const [a, b] = blocks[blocks.length - 1];
    const last = text.slice(a, b).trim();
    if (/^(#[\p{L}\p{N}_]+\s*)+$/u.test(last)) {
      tag = last.split(/\s+/)[0].slice(1).replace(/_/g, ' ');
      blocks = blocks.slice(0, -1);
    }
  }

  const html = [];
  const plain = [];
  const paras = [];
  for (const [a, b] of blocks) {
    const raw = text.slice(a, b);
    const lines = lineRanges(text, a, b);
    plain.push(raw.replace(/^\s*(>|[-•*—–]|\d{1,3}[.)])\s+/gm, '').trim());

    const trimmedStart = a + (raw.length - raw.trimStart().length);
    const trimmedEnd = b - (raw.length - raw.trimEnd().length);

    if (coveredBy(entities, ['blockquote', 'expandable_blockquote'], trimmedStart, trimmedEnd) ||
        lines.every(([x, y]) => QUOTE.test(text.slice(x, y)))) {
      const inner = lines.map(([x, y]) => {
        const m = text.slice(x, y).match(QUOTE);
        return renderRange(text, entities, x + (m ? m[0].length : 0), y);
      });
      html.push('<blockquote>' + inner.join('<br>') + '</blockquote>');
    } else if (lines.every(([x, y]) => BULLET.test(text.slice(x, y)))) {
      const items = lines.map(([x, y]) => '<li>' + renderRange(text, entities, x + text.slice(x, y).match(BULLET)[0].length, y) + '</li>');
      html.push('<ul>' + items.join('') + '</ul>');
    } else if (lines.every(([x, y]) => NUMBER.test(text.slice(x, y)))) {
      const items = lines.map(([x, y]) => '<li>' + renderRange(text, entities, x + text.slice(x, y).match(NUMBER)[0].length, y) + '</li>');
      html.push('<ol>' + items.join('') + '</ol>');
    } else if (lines.length === 1 && raw.trim().length <= 90 &&
               coveredBy(entities, 'bold', trimmedStart, trimmedEnd)) {
      html.push('<h2>' + esc(raw.trim()) + '</h2>');
    } else {
      html.push('<p>' + lines.map(([x, y]) => renderRange(text, entities, x, y)).join('<br>') + '</p>');
      paras.push(raw.trim());
    }
  }
  return { title, tag, html: html.join('\n'), plain: plain.join('\n\n'), lead: leadOf(paras, plain) };
}

/* ── Minimal Markdown (for long posts sent as .md / .txt files) ── */
function mdInline(s) {
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => {
    const url = safeUrl(u.replace(/&amp;/g, '&'));
    return url ? '<a href="' + esc(url) + '" rel="noopener">' + t + '</a>' : t;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>').replace(/(^|[^\w])_([^_\s][^_]*)_/g, '$1<em>$2</em>');
  return out;
}

function fromMarkdown(src) {
  const text = String(src || '').replace(/\r\n?/g, '\n').trim();
  const blocks = text.split(/\n[ \t]*\n+/).map((b) => b.trim()).filter(Boolean);
  let title = '';
  let tag = null;

  if (blocks.length && /^#\s+/.test(blocks[0])) {
    const lines = blocks[0].split('\n');
    title = lines[0].replace(/^#\s+/, '').trim();
    if (lines.length > 1) blocks[0] = lines.slice(1).join('\n'); else blocks.shift();
  } else if (blocks.length) {
    const lines = blocks[0].split('\n');
    title = lines[0].replace(/^#+\s*/, '').trim();
    if (lines.length > 1) blocks[0] = lines.slice(1).join('\n'); else blocks.shift();
  }
  if (blocks.length && /^(#[\p{L}\p{N}_]+\s*)+$/u.test(blocks[blocks.length - 1])) {
    tag = blocks.pop().split(/\s+/)[0].slice(1).replace(/_/g, ' ');
  }

  const html = [];
  const plain = [];
  const paras = [];
  for (const b of blocks) {
    const lines = b.split('\n').filter((l) => l.trim());
    plain.push(b.replace(/^\s*(#+|>|[-•*—–]|\d{1,3}[.)])\s+/gm, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, ''));
    let m;
    if (lines.length === 1 && (m = lines[0].match(/^(#{2,4})\s+(.*)$/))) {
      html.push((m[1].length === 2 ? '<h2>' : '<h3>') + mdInline(m[2]) + (m[1].length === 2 ? '</h2>' : '</h3>'));
    } else if (lines.every((l) => QUOTE.test(l))) {
      html.push('<blockquote>' + lines.map((l) => mdInline(l.replace(QUOTE, ''))).join('<br>') + '</blockquote>');
    } else if (lines.every((l) => BULLET.test(l))) {
      html.push('<ul>' + lines.map((l) => '<li>' + mdInline(l.replace(BULLET, '')) + '</li>').join('') + '</ul>');
    } else if (lines.every((l) => NUMBER.test(l))) {
      html.push('<ol>' + lines.map((l) => '<li>' + mdInline(l.replace(NUMBER, '')) + '</li>').join('') + '</ol>');
    } else if (/^(-{3,}|\*{3,})$/.test(b)) {
      html.push('<hr>');
    } else {
      html.push('<p>' + lines.map(mdInline).join('<br>') + '</p>');
      paras.push(plain[plain.length - 1]);
    }
  }
  return { title, tag, html: html.join('\n'), plain: plain.join('\n\n'), lead: leadOf(paras, plain) };
}

/* ── Telegram rich messages (message.rich_message.blocks) ──
   Newer Telegram clients send formatted posts as blocks, e.g.
   { type: 'paragraph', text: 'Hi' } or { type: 'list', items: [{ label: '•', blocks: [...] }] }.
   Inline text is a string, an array, or an object like { type: 'bold', text: ... }.
   Unknown types keep their text, and are reported via onUnknown for follow-up. */
const INLINE_TAGS = { bold: 'strong', italic: 'em', underline: 'u', strikethrough: 's', strike: 's', code: 'code', fixed: 'code', monospace: 'code', spoiler: 'span' };
const LINK_TYPES = ['url', 'text_url', 'text_link', 'link', 'anchor'];

function richInline(t, onUnknown) {
  if (t == null) return '';
  if (typeof t === 'string') return esc(t);
  if (Array.isArray(t)) return t.map((x) => richInline(x, onUnknown)).join('');
  if (typeof t !== 'object') return esc(String(t));
  const inner = richInline(t.text != null ? t.text : t.texts, onUnknown);
  const type = t.type || t['@type'] || '';
  if (INLINE_TAGS[type]) return `<${INLINE_TAGS[type]}>${inner}</${INLINE_TAGS[type]}>`;
  if (LINK_TYPES.includes(type)) {
    const u = safeUrl(t.url || t.href || richPlain(t.text));
    return u ? `<a href="${esc(u)}" rel="noopener">${inner}</a>` : inner;
  }
  if (!['plain', 'hashtag', 'cashtag', 'mention', 'email', 'phone', 'phone_number', 'text', 'concat', 'custom_emoji', ''].includes(type)) onUnknown && onUnknown('inline:' + type);
  return inner;
}

function richPlain(t) {
  if (t == null) return '';
  if (typeof t === 'string') return t;
  if (Array.isArray(t)) return t.map(richPlain).join('');
  if (typeof t === 'object') return richPlain(t.text != null ? t.text : t.texts);
  return String(t);
}

const isAllBold = (t) => t && typeof t === 'object' && !Array.isArray(t) && (t.type === 'bold');

function fromRichMessage(rich, onUnknown) {
  const blocks = (rich && (rich.blocks || rich.content)) || [];
  const html = [], plain = [], paras = [];
  let title = '', tag = null;

  // Title: first text block; tag: trailing block made only of hashtags.
  const list = blocks.slice();
  if (list.length && list[0].text != null) title = richPlain(list.shift().text).trim();
  if (list.length) {
    const last = list[list.length - 1];
    const lp = last && last.text != null ? richPlain(last.text).trim() : '';
    if (lp && /^(#[\p{L}\p{N}_]+\s*)+$/u.test(lp)) { tag = lp.split(/\s+/)[0].slice(1).replace(/_/g, ' '); list.pop(); }
  }

  const renderBlock = (b, depth = 0) => {
    const type = (b && (b.type || b['@type'])) || '';
    const txt = b.text != null ? b.text : b.texts;
    const p = richPlain(txt).trim();
    switch (type) {
      case 'paragraph': case 'text': case 'plain': case '':
        if (!p && !b.blocks) return '';
        if (b.blocks && txt == null) return b.blocks.map((x) => renderBlock(x, depth)).join('\n');
        plain.push(p);
        if (depth === 0 && p.length <= 90 && isAllBold(txt)) return `<h2>${esc(p)}</h2>`;
        if (depth === 0) paras.push(p);
        return `<p>${richInline(txt, onUnknown).replace(/\n/g, '<br>')}</p>`;
      case 'heading': case 'header': case 'title': case 'subtitle': case 'subheader': case 'subheading': {
        plain.push(p);
        const lvl = (b.level || (type.startsWith('sub') ? 3 : 2)) >= 3 ? 'h3' : 'h2';
        return `<${lvl}>${richInline(txt, onUnknown)}</${lvl}>`;
      }
      case 'quote': case 'blockquote': case 'pullquote': case 'block_quote': {
        const inner = b.blocks ? b.blocks.map((x) => richPlainBlock(x)).join('\n') : p;
        plain.push(inner);
        const body = b.blocks ? b.blocks.map((x) => richInline(x.text != null ? x.text : x.texts, onUnknown)).join('<br>') : richInline(txt, onUnknown);
        return `<blockquote>${body}</blockquote>`;
      }
      case 'list': case 'bullet_list': case 'ordered_list': case 'numbered_list': {
        const items = b.items || b.children || [];
        const ordered = /ordered|numbered/.test(type) || b.ordered === true ||
          (items.length && items.every((it) => /^\d+[.)]?$/.test(String(it.label || '').trim())));
        const lis = items.map((it) => {
          const inner = it.blocks
            ? it.blocks.map((x, i) => (i === 0 && ['paragraph', 'text', 'plain', ''].includes(x.type || '')
              ? richInline(x.text != null ? x.text : x.texts, onUnknown) : renderBlock(x, depth + 1))).join('')
            : richInline(it.text != null ? it.text : it.texts, onUnknown);
          plain.push(it.blocks ? it.blocks.map(richPlainBlock).join(' ') : richPlain(it.text));
          return `<li>${inner}</li>`;
        });
        return `<${ordered ? 'ol' : 'ul'}>${lis.join('')}</${ordered ? 'ol' : 'ul'}>`;
      }
      case 'preformatted': case 'pre': case 'code': case 'code_block':
        plain.push(p);
        return `<p><code>${esc(p)}</code></p>`;
      case 'divider': case 'hr': case 'separator':
        return '<hr>';
      default:
        onUnknown && onUnknown('block:' + type);
        if (b.blocks) return b.blocks.map((x) => renderBlock(x, depth)).join('\n');
        if (p) { plain.push(p); if (depth === 0) paras.push(p); return `<p>${richInline(txt, onUnknown)}</p>`; }
        return '';
    }
  };
  const richPlainBlock = (b) => (b.text != null || b.texts != null) ? richPlain(b.text != null ? b.text : b.texts)
    : (b.blocks ? b.blocks.map(richPlainBlock).join(' ') : (b.items || []).map(richPlainBlock).join(' '));

  for (const b of list) { const h = renderBlock(b); if (h) html.push(h); }
  return { title, tag, html: html.join('\n'), plain: plain.join('\n\n'), lead: leadOf(paras, plain) };
}

/* Text for the post description: the first paragraphs, not headings or lists. */
function leadOf(paras, plain) {
  const src = paras.length ? paras : plain;
  let out = '';
  for (const p of src) { out += (out ? ' ' : '') + p; if (out.length >= 100) break; }
  return out;
}

/* ── Helpers ── */
const CYR = { а:'a',б:'b',в:'v',г:'g',ғ:'g',д:'d',е:'e',ё:'yo',ж:'j',з:'z',и:'i',й:'y',к:'k',қ:'q',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ў:'o',ф:'f',х:'x',ҳ:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sh',ъ:'',ы:'i',ь:'',э:'e',ю:'yu',я:'ya' };

function slugify(title) {
  const s = String(title).toLowerCase()
    .split('').map((c) => (c in CYR ? CYR[c] : c)).join('')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[''`ʻʼ‘’]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  // Keep it short enough for Telegram callback data (64 bytes).
  return (s || 'maqola').slice(0, 48).replace(/-+$/, '');
}

const readingMinutes = (plain) => Math.max(1, Math.round(String(plain).split(/\s+/).filter(Boolean).length / 200));

const MONTHS_UZ = ['yanvar','fevral','mart','aprel','may','iyun','iyul','avgust','sentabr','oktabr','noyabr','dekabr'];
function tashkentDate(d = new Date()) {
  const t = new Date(d.getTime() + 5 * 3600 * 1000); // UTC+5, no DST
  const y = t.getUTCFullYear(), m = t.getUTCMonth(), day = t.getUTCDate();
  return { iso: `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`, human: `${day}-${MONTHS_UZ[m]}, ${y}` };
}

function excerpt(plain, max = 160) {
  const s = String(plain).replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

module.exports = { esc, fromTelegram, fromMarkdown, fromRichMessage, slugify, readingMinutes, tashkentDate, excerpt };
