// Vercel serverless function: likes and comments for blog posts.
//   GET  /api/social?slugs=a,b,c              → { ok, likes: {slug: n}, comments: {slug: n} }
//   POST /api/social {action:'like'|'unlike', slug, client}   → { ok, likes }
//   POST /api/social {action:'comment', slug, title, name, text, lang} → { ok, comments }
// Counts live in Upstash Redis (hashes blog:likes / blog:comments). A like is
// remembered per browser (a random id kept in localStorage) so repeated taps
// don't inflate the count. Comments are not published on the site: they go to
// the Telegram group through The Hub Robot (TG_TOKEN / TG_CHAT_ID).

const kv = require('./_lib/kv');

const SLUG = /^[a-z0-9-]{1,80}$/;
const CLIENT = /^[A-Za-z0-9-]{8,64}$/;
const LANGS = { uz: "O'zbek", ru: 'Rus', en: 'Ingliz' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function ip(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || 'unknown';
}

/** At most `max` requests per `sec` seconds for one key. */
async function allowed(key, max, sec) {
  const n = await kv.cmd('INCR', key);
  if (Number(n) === 1) await kv.cmd('EXPIRE', key, sec);
  return Number(n) <= max;
}

async function counts(slugs) {
  const [l, c] = await Promise.all([
    kv.cmd('HMGET', 'blog:likes', ...slugs),
    kv.cmd('HMGET', 'blog:comments', ...slugs),
  ]);
  const likes = {}, comments = {};
  slugs.forEach((s, i) => { likes[s] = Math.max(0, Number(l[i]) || 0); comments[s] = Math.max(0, Number(c[i]) || 0); });
  return { likes, comments };
}

async function like(slug, client, on) {
  const key = `blog:liked:${slug}:${client}`;
  if (on) {
    const first = (await kv.cmd('SET', key, '1', 'NX', 'EX', 60 * 60 * 24 * 365 * 2)) === 'OK';
    if (first) return Number(await kv.cmd('HINCRBY', 'blog:likes', slug, 1));
  } else if (Number(await kv.cmd('DEL', key)) === 1) {
    const n = Number(await kv.cmd('HINCRBY', 'blog:likes', slug, -1));
    if (n < 0) { await kv.cmd('HSET', 'blog:likes', slug, 0); return 0; }
    return n;
  }
  return Math.max(0, Number(await kv.cmd('HGET', 'blog:likes', slug)) || 0);
}

async function comment(b, req) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;
  if (!TG_TOKEN || !TG_CHAT_ID) return { status: 500, body: { ok: false, error: 'config' } };
  const text = String(b.text || '').trim().slice(0, 1000);
  if (text.length < 2) return { status: 400, body: { ok: false, error: 'empty' } };
  const name = String(b.name || '').replace(/\s+/g, ' ').trim().slice(0, 60) || '—';
  const title = String(b.title || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const lang = LANGS[b.lang] ? b.lang : 'uz';
  const url = `https://www.apelsin.asia/blog/${b.slug}`;
  const msg = [
    '💬 <b>Blogga yangi izoh</b>',
    '',
    `📝 <a href="${url}">${esc(title || b.slug)}</a>`,
    `👤 <b>Ism:</b> ${esc(name)}`,
    '',
    esc(text),
    '',
    `🌐 Til: ${LANGS[lang]}`,
  ].join('\n');
  const tg = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT_ID, text: msg, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }),
  }).then((r) => r.json()).catch(() => ({}));
  if (!tg.ok) return { status: 502, body: { ok: false, error: 'telegram' } };
  const n = kv.configured() ? Number(await kv.cmd('HINCRBY', 'blog:comments', b.slug, 1)) : null;
  return { status: 200, body: { ok: true, comments: n } };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      if (!kv.configured()) return res.status(200).json({ ok: true, likes: {}, comments: {} });
      const slugs = [...new Set(String(req.query?.slugs || '').split(','))].filter((s) => SLUG.test(s)).slice(0, 60);
      if (!slugs.length) return res.status(200).json({ ok: true, likes: {}, comments: {} });
      return res.status(200).json({ ok: true, ...(await counts(slugs)) });
    }
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });

    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (_) { b = null; } }
    if (!b || typeof b !== 'object' || !SLUG.test(String(b.slug || ''))) return res.status(400).json({ ok: false, error: 'body' });

    if (b.action === 'like' || b.action === 'unlike') {
      if (!kv.configured()) return res.status(503).json({ ok: false, error: 'storage' });
      if (!CLIENT.test(String(b.client || ''))) return res.status(400).json({ ok: false, error: 'client' });
      if (!(await allowed('rl:like:' + ip(req), 60, 60))) return res.status(429).json({ ok: false, error: 'rate' });
      return res.status(200).json({ ok: true, likes: await like(b.slug, b.client, b.action === 'like') });
    }

    if (b.action === 'comment') {
      if (b.hp) return res.status(200).json({ ok: true });
      if (kv.configured() && !(await allowed('rl:comment:' + ip(req), 5, 600))) return res.status(429).json({ ok: false, error: 'rate' });
      const r = await comment(b, req);
      return res.status(r.status).json(r.body);
    }

    return res.status(400).json({ ok: false, error: 'action' });
  } catch (e) {
    console.error('social', e.message);
    return res.status(500).json({ ok: false, error: 'server' });
  }
};
