// Telegram blog bot (webhook). Lets the site owner publish and delete blog
// posts from Telegram: each action becomes one commit on GitHub, and Vercel
// redeploys the site automatically.
//
// Env (Vercel → Settings → Environment Variables):
//   BLOG_BOT_TOKEN        token of the blog bot from @BotFather
//   BLOG_ADMIN_ID         the owner's Telegram user id (only this user is served)
//   BLOG_WEBHOOK_SECRET   random string; checks that requests come from Telegram
//   GITHUB_TOKEN          fine-grained token, Contents read/write on the repo
//   GITHUB_REPO           optional, default bilolalixan/bilolalixan
//   GITHUB_BRANCH         optional, default main
//
// One-time setup: open https://www.apelsin.asia/api/blog-bot?setup=<BLOG_WEBHOOK_SECRET>

const { fromTelegram, fromMarkdown, fromRichMessage, slugify, readingMinutes, tashkentDate, excerpt, esc } = require('./_lib/format');
const T = require('./_lib/templates');
const gh = require('./_lib/github');
const { tg, download } = require('./_lib/telegram');
const subs = require('./_lib/subscribers');
const notify = require('./_lib/notify');
const { firstTime } = require('./_lib/kv');

const BTN_NEW = '📝 Yangi maqola';
const BTN_LIST = '📚 Maqolalar';
const BTN_HELP = 'ℹ️ Yordam';
const KEYBOARD = { keyboard: [[{ text: BTN_NEW }, { text: BTN_LIST }], [{ text: BTN_HELP }]], resize_keyboard: true, is_persistent: true };
const MAX_DOC_BYTES = 200 * 1024;

const HELP = [
  '<b>Apelsin blog boti</b>',
  '',
  'Maqola chop etish uchun uni shu yerga yuboring:',
  '• <b>1-qator</b> — sarlavha',
  "• keyingi qatorlar — matn. Bo'sh qator yangi xatboshini boshlaydi",
  "• <b>qalin</b>, <i>kursiv</i>, havolalar va iqtibos saytda ham saqlanadi",
  "• alohida qatordagi qisqa <b>qalin</b> matn — kichik sarlavha bo'ladi",
  "• <code>- </code> bilan boshlangan qatorlar — ro'yxat",
  '• oxirgi qatorga <code>#Marketing</code> kabi teg yozish mumkin',
  '',
  "🖼 Muqova rasm kerak bo'lsa — rasmni izoh (caption) bilan yuboring.",
  "📄 Uzun maqola (4096 belgidan ko'p) — <code>.md</code> yoki <code>.txt</code> fayl qilib yuboring (Markdown: <code>## sarlavha</code>, <code>**qalin**</code>, <code>- ro'yxat</code>).",
  '',
  "Yuborganingizdan so'ng ko'rinishini ko'rsataman va «Chop etish»ni bosasiz.",
].join('\n');

const NEW_HINT = [
  "Maqolani bitta xabar qilib yuboring 👇",
  '',
  '<i>Namuna:</i>',
  '<code>Marketingda 3 ta asosiy xato',
  '',
  'Birinchi xatboshi matni...',
  '',
  '- birinchi punkt',
  '- ikkinchi punkt',
  '',
  '#Marketing</code>',
].join('\n');

/* ── Parsing the owner's message into a post ── */
async function parsePost(msg) {
  let parsed, coverId = null;
  if (msg.document) {
    const name = msg.document.file_name || '';
    const isText = /\.(md|markdown|txt)$/i.test(name) || /^text\//.test(msg.document.mime_type || '');
    if (!isText) throw new UserError("Faqat .md yoki .txt fayl qabul qilinadi.");
    if (msg.document.file_size > MAX_DOC_BYTES) throw new UserError('Fayl juda katta (200 KB dan kichik bo\'lsin).');
    const buf = await download(msg.document.file_id);
    parsed = fromMarkdown(buf.toString('utf8'));
  } else if (msg.rich_message) {
    const unknown = new Set();
    parsed = fromRichMessage(msg.rich_message, (t) => unknown.add(t));
    if (unknown.size) console.log('[blog-bot] rich_message unknown types', [...unknown].join(', '), JSON.stringify(msg.rich_message).slice(0, 4000));
  } else if (msg.photo) {
    parsed = fromTelegram(msg.caption || '', msg.caption_entities);
    coverId = msg.photo[msg.photo.length - 1].file_id;
  } else {
    const found = findText(msg);
    parsed = fromTelegram(found ? found.text : '', found ? found.entities : []);
  }
  if (!parsed.title) throw new UserError("Sarlavha topilmadi: birinchi qatorga sarlavha yozing.");
  if (parsed.title.length > 140) throw new UserError('Sarlavha juda uzun (140 belgigacha).');
  if (!parsed.html.trim()) throw new UserError("Maqola matni bo'sh: sarlavhadan keyin matn yozing.");
  return {
    title: parsed.title,
    tag: parsed.tag || 'Maqola',
    bodyHtml: parsed.html,
    description: excerpt(parsed.lead),
    minutes: readingMinutes(parsed.plain),
    coverId,
  };
}

class UserError extends Error {}

/* Text of a message. Besides text/caption, looks one level deep for any
   object shaped like { text, entities } in case Telegram delivers formatted
   messages under a newer field. */
function findText(msg) {
  if (typeof msg.text === 'string') return { text: msg.text, entities: msg.entities || [] };
  if (typeof msg.caption === 'string') return { text: msg.caption, entities: msg.caption_entities || [] };
  for (const [k, v] of Object.entries(msg)) {
    if (k === 'reply_to_message' || k === 'from' || k === 'chat' || !v || typeof v !== 'object') continue;
    if (typeof v.text === 'string' && v.text.trim()) return { text: v.text, entities: v.entities || v.text_entities || [] };
  }
  return null;
}

/* ── Actions ── */
async function sendPreview(chatId, msg) {
  const post = await parsePost(msg);
  const text = [
    "👀 <b>Ko'rib chiqish</b>",
    '',
    `<b>${esc(post.title)}</b>`,
    `🏷 ${esc(post.tag)} · ⏱ ${post.minutes} daqiqa${post.coverId ? ' · 🖼 muqova bor' : ''}`,
    `🔗 apelsin.asia/blog/${slugify(post.title)}`,
    '',
    `<i>${esc(post.description)}</i>`,
    '',
    'Chop etilsinmi?',
  ].join('\n');
  await tg('sendMessage', {
    chat_id: chatId, text, parse_mode: 'HTML',
    reply_parameters: { message_id: msg.message_id },
    reply_markup: { inline_keyboard: [
      [{ text: '✅ Chop etish + 📣 obunachilarga', callback_data: 'pub' }],
      [{ text: '🌐 Faqat saytga', callback_data: 'pubq' }, { text: '❌ Bekor qilish', callback_data: 'cancel' }],
    ] },
  });
}

async function uniqueSlug(base) {
  for (let i = 1; i < 20; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (!(await gh.exists(`blog/${slug}.html`))) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function publish(original) {
  const post = await parsePost(original);
  const slug = await uniqueSlug(slugify(post.title));
  // The publish time is when Publish is pressed, not when the draft was sent.
  const date = tashkentDate(new Date());
  const changes = [];

  let cover = null;
  if (post.coverId) {
    const img = await download(post.coverId);
    cover = `/assets/blog/${slug}.jpg`;
    changes.push({ path: cover.slice(1), base64: img.toString('base64') });
  }

  const data = { ...post, slug, date, cover };
  const [indexes, sitemap] = await Promise.all([readIndexes(), gh.readFile('sitemap.xml')]);
  if (!indexes.length) throw new Error('blog/index.html not found');

  changes.push({ path: `blog/${slug}.html`, text: T.postPage(data) });
  const card = T.postCard(data);
  for (const { path, text } of indexes) changes.push({ path, text: T.addCard(text, card) });
  if (sitemap != null) changes.push({ path: 'sitemap.xml', text: T.addToSitemap(sitemap, slug, date.iso) });

  await gh.commit(changes, `Blog: publish "${post.title}"`);
  return { slug, title: post.title, excerpt: post.description, cover };
}

// The blog list exists in every site language: /blog (ru), /uz/blog, /en/blog.
const INDEXES = ['blog/index.html', 'uz/blog/index.html', 'en/blog/index.html'];
async function readIndexes() {
  const texts = await Promise.all(INDEXES.map((p) => gh.readFile(p)));
  return INDEXES.map((path, i) => ({ path, text: texts[i] })).filter((x) => x.text != null);
}

async function removePost(slug) {
  const [indexes, sitemap] = await Promise.all([readIndexes(), gh.readFile('sitemap.xml')]);
  const changes = [];
  for (const { path, text } of indexes) {
    const next = T.removeCard(text, slug);
    if (next) changes.push({ path, text: next });
  }
  if (!changes.length) throw new UserError('Bu maqola topilmadi (ehtimol allaqachon o\'chirilgan).');
  if (await gh.exists(`blog/${slug}.html`)) changes.push({ path: `blog/${slug}.html`, delete: true });
  if (await gh.exists(`assets/blog/${slug}.jpg`)) changes.push({ path: `assets/blog/${slug}.jpg`, delete: true });
  if (sitemap != null) changes.push({ path: 'sitemap.xml', text: T.removeFromSitemap(sitemap, slug) });
  await gh.commit(changes, `Blog: delete ${slug}`);
}

async function sendList(chatId) {
  const index = await gh.readFile('blog/index.html');
  const posts = index ? T.listCards(index) : [];
  if (!posts.length) return tg('sendMessage', { chat_id: chatId, text: "Hozircha maqolalar yo'q.", reply_markup: KEYBOARD });
  const lines = posts.map((p, i) => `${i + 1}. <a href="${T.SITE}/blog/${p.slug}">${esc(p.title)}</a> · ${p.date.slice(0, 16).replace('T', ' ')}`);
  await tg('sendMessage', {
    chat_id: chatId,
    text: `📚 <b>Maqolalar (${posts.length})</b>\n\n${lines.join('\n')}\n\nO'chirish uchun tanlang:`,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: posts.slice(0, 30).map((p) => [{ text: '🗑 ' + p.title.slice(0, 40), callback_data: 'del:' + p.slug }]) },
  });
}

/* ── Update handlers ── */
async function onMessage(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();

  if (text === '/start' || text === '/help' || text === BTN_HELP) {
    return tg('sendMessage', { chat_id: chatId, text: HELP, parse_mode: 'HTML', reply_markup: KEYBOARD });
  }
  if (text === '/new' || text === BTN_NEW) {
    return tg('sendMessage', { chat_id: chatId, text: NEW_HINT, parse_mode: 'HTML', reply_markup: KEYBOARD });
  }
  if (text === '/list' || text === BTN_LIST) return sendList(chatId);
  if (text.startsWith('/')) {
    return tg('sendMessage', { chat_id: chatId, text: "Noma'lum buyruq. /help ni bosing.", reply_markup: KEYBOARD });
  }
  if (msg.rich_message || msg.photo || msg.document || findText(msg)) return sendPreview(chatId, msg);

  // Unknown message shape: log it (visible only in Vercel logs) and show the
  // field names so the format can be supported.
  const keys = Object.keys(msg).filter((k) => !['message_id', 'from', 'chat', 'date'].includes(k));
  console.log('[blog-bot] unrecognized message', JSON.stringify(msg).slice(0, 4000));
  return tg('sendMessage', {
    chat_id: chatId,
    text: "Bu xabar turini taniy olmadim (maydonlar: " + keys.join(', ') + ").\nMaqolani oddiy matn, rasm+izoh yoki .md fayl qilib yuboring.",
    reply_markup: KEYBOARD,
  });
}

async function onCallback(cq) {
  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;
  const data = cq.data || '';
  const edit = (text, extra = {}) => tg('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });

  if (data === 'pub' || data === 'pubq') {
    const original = cq.message.reply_to_message;
    if (!original) {
      await tg('answerCallbackQuery', { callback_query_id: cq.id });
      return edit('⚠️ Asl xabar topilmadi. Maqolani qaytadan yuboring.');
    }
    // Drop the buttons first so a double tap cannot publish twice.
    await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
    await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Chop etilmoqda…' });
    const post = await publish(original);
    const url = `${T.SITE}/blog/${post.slug}`;
    const head = `✅ <b>Chop etildi!</b>\n\n<b>${esc(post.title)}</b>\n${url}`;
    if (data === 'pubq') return edit(`${head}\n\nSayt taxminan 1 daqiqada yangilanadi.`);
    if (!subs.configured()) return edit(`${head}\n\n⚠️ Obunachilar bazasi (Upstash Redis) ulanmagan — rassilka yuborilmadi.`);

    // Announce to subscribers once the page is live, so the link works.
    await edit(`${head}\n\n⏳ Sayt yangilanishini kutib, obunachilarga yuboryapman…`);
    const live = await notify.waitUntilLive(url);
    const r = await notify.announcePost(post, post.cover);
    const line = notify.reportLine(r) + (live ? '' : ' (sahifa hali yangilanmagan bo\'lishi mumkin)');
    notify.groupLog(`📰 Yangi maqola: <b>${esc(post.title)}</b>\n${esc(line)}`);
    return edit(`${head}\n\n📣 ${esc(line)}`);
  }

  if (data === 'cancel') {
    await tg('answerCallbackQuery', { callback_query_id: cq.id });
    return edit('❌ Bekor qilindi.');
  }

  if (data.startsWith('del:')) {
    const slug = data.slice(4);
    await tg('answerCallbackQuery', { callback_query_id: cq.id });
    return tg('sendMessage', {
      chat_id: chatId,
      text: `🗑 <b>/blog/${esc(slug)}</b> o'chirilsinmi? Buni qaytarib bo'lmaydi.`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: "Ha, o'chirish", callback_data: 'delok:' + slug }, { text: "Yo'q", callback_data: 'cancel' }]] },
    });
  }

  if (data.startsWith('delok:')) {
    const slug = data.slice(6);
    await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
    await tg('answerCallbackQuery', { callback_query_id: cq.id, text: "O'chirilmoqda…" });
    await removePost(slug);
    return edit(`🗑 <b>/blog/${esc(slug)}</b> o'chirildi. Sayt taxminan 1 daqiqada yangilanadi.`);
  }

  return tg('answerCallbackQuery', { callback_query_id: cq.id });
}

/* ── One-time webhook setup (GET ?setup=<secret>) ── */
async function setup(req, res) {
  const url = `https://${req.headers['x-forwarded-host'] || req.headers.host}/api/blog-bot`;
  await tg('setWebhook', {
    url, secret_token: process.env.BLOG_WEBHOOK_SECRET,
    allowed_updates: ['message', 'callback_query'], drop_pending_updates: true,
  });
  await tg('setMyCommands', {
    commands: [
      { command: 'new', description: 'Yangi maqola' },
      { command: 'list', description: "Maqolalar ro'yxati / o'chirish" },
      { command: 'help', description: 'Yordam' },
    ],
  });
  const me = await tg('getMe');
  return res.status(200).json({ ok: true, bot: '@' + me.username, webhook: url });
}

module.exports = async (req, res) => {
  const secret = process.env.BLOG_WEBHOOK_SECRET;
  const admin = String(process.env.BLOG_ADMIN_ID || '');

  if (req.method === 'GET') {
    if (secret && req.query && req.query.setup === secret) {
      try { return await setup(req, res); } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
    }
    return res.status(404).end();
  }
  if (req.method !== 'POST') return res.status(405).end();
  if (!secret || req.headers['x-telegram-bot-api-secret-token'] !== secret) return res.status(401).end();

  let update = req.body;
  if (typeof update === 'string') { try { update = JSON.parse(update); } catch (_) { update = {}; } }
  update = update || {};

  // Publishing can take ~a minute (waiting for the deploy); Telegram may retry
  // the same update meanwhile. Handle each update only once.
  if (update.update_id != null && !(await firstTime('upd:blog:' + update.update_id))) return res.status(200).json({ ok: true });

  const from = (update.message && update.message.from) || (update.callback_query && update.callback_query.from);
  const chatId = (update.message && update.message.chat.id) || (update.callback_query && update.callback_query.message.chat.id);
  if (!from || !chatId) return res.status(200).json({ ok: true });

  try {
    if (!admin || String(from.id) !== admin) {
      if (update.message) await tg('sendMessage', { chat_id: chatId, text: "Bu bot faqat Apelsin sayti administratori uchun. apelsin.asia/blog" });
      else await tg('answerCallbackQuery', { callback_query_id: update.callback_query.id });
    } else if (update.callback_query) {
      await onCallback(update.callback_query);
    } else if (update.message) {
      await onMessage(update.message);
    }
  } catch (e) {
    const text = e instanceof UserError ? '⚠️ ' + e.message : '⚠️ Xatolik yuz berdi: ' + e.message;
    try { await tg('sendMessage', { chat_id: chatId, text }); } catch (_) {}
    if (!(e instanceof UserError)) console.error(e);
  }
  // Always 200 so Telegram does not retry the same update.
  return res.status(200).json({ ok: true });
};
