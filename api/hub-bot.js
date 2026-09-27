// The Hub Robot (TG_TOKEN) webhook: public subscriber bot.
//   Everyone:  /start subscribes and shows the latest posts; /stop unsubscribes;
//              any other message is forwarded to the group (TG_CHAT_ID).
//   Admin (BLOG_ADMIN_ID): any message becomes a broadcast draft
//              ("send to all?"); /stats shows the subscriber count.
// The same bot keeps posting leads and feedback to the group (api/lead.js,
// api/feedback.js); those only call sendMessage and are not affected.
//
// Env: TG_TOKEN, TG_CHAT_ID, BLOG_ADMIN_ID, HUB_WEBHOOK_SECRET (or
// BLOG_WEBHOOK_SECRET), Redis via Vercel's Upstash integration, GITHUB_TOKEN
// (to read the post list).
// One-time setup: open https://www.apelsin.asia/api/hub-bot?setup=<secret>

const { hub } = require('./_lib/telegram');
const subs = require('./_lib/subscribers');
const { groupLog, reportLine } = require('./_lib/notify');
const { esc } = require('./_lib/format');
const T = require('./_lib/templates');
const gh = require('./_lib/github');
const { firstTime } = require('./_lib/kv');

const tg = hub.tg;
const SITE = T.SITE;

const L = {
  uz: {
    welcome: (n) => `Assalomu alaykum, ${n}! 👋\n\nSiz <b>Apelsin</b> blogiga obuna bo'ldingiz. Yangi maqolalar va foydali xabarlarni shu yerga yuborib turamiz.`,
    again: (n) => `Qaytganingizdan xursandmiz, ${n}! Siz obunachisiz ✅`,
    latest: "📚 <b>So'nggi maqolalar</b>",
    noPosts: "Hozircha maqolalar yo'q.",
    btnPosts: '📚 Maqolalar', btnConsult: '💬 Bepul konsultatsiya', btnSite: '🌐 Sayt', btnStop: "🔕 Obunani to'xtatish", btnAll: 'Barcha maqolalar',
    stopped: "🔕 Obuna to'xtatildi. Qaytish uchun /start bosing.",
    notSub: "Siz obunachi emassiz. Obuna bo'lish uchun /start bosing.",
    thanks: 'Rahmat! Xabaringiz jamoamizga yetkazildi 🙌',
  },
  ru: {
    welcome: (n) => `Здравствуйте, ${n}! 👋\n\nВы подписались на блог <b>Apelsin</b>. Будем присылать сюда новые статьи и полезные новости.`,
    again: (n) => `Рады, что вы вернулись, ${n}! Вы подписаны ✅`,
    latest: '📚 <b>Последние статьи</b>',
    noPosts: 'Пока статей нет.',
    btnPosts: '📚 Статьи', btnConsult: '💬 Бесплатная консультация', btnSite: '🌐 Сайт', btnStop: '🔕 Отписаться', btnAll: 'Все статьи',
    stopped: '🔕 Подписка отключена. Чтобы вернуться, нажмите /start.',
    notSub: 'Вы не подписаны. Нажмите /start, чтобы подписаться.',
    thanks: 'Спасибо! Ваше сообщение передано команде 🙌',
  },
  en: {
    welcome: (n) => `Hello, ${n}! 👋\n\nYou're subscribed to the <b>Apelsin</b> blog. We'll send new articles and useful updates here.`,
    again: (n) => `Welcome back, ${n}! You're subscribed ✅`,
    latest: '📚 <b>Latest posts</b>',
    noPosts: 'No posts yet.',
    btnPosts: '📚 Posts', btnConsult: '💬 Free consultation', btnSite: '🌐 Website', btnStop: '🔕 Unsubscribe', btnAll: 'All posts',
    stopped: '🔕 Unsubscribed. Press /start to come back.',
    notSub: "You're not subscribed. Press /start to subscribe.",
    thanks: 'Thank you! Your message was passed to our team 🙌',
  },
};
const langOf = (user) => (/^ru|^uk|^be|^kk/.test(user.language_code || '') ? 'ru' : /^en/.test(user.language_code || '') ? 'en' : 'uz');

const keyboard = (l) => ({
  inline_keyboard: [
    [{ text: l.btnPosts, callback_data: 'latest' }, { text: l.btnConsult, url: `${SITE}/booking` }],
    [{ text: l.btnSite, url: SITE + '/' }, { text: l.btnStop, callback_data: 'stop' }],
  ],
});

const who = (u) => `<b>${esc([u.first_name, u.last_name].filter(Boolean).join(' ') || 'Foydalanuvchi')}</b>${u.username ? ' (@' + esc(u.username) + ')' : ''}`;

async function sendLatest(chatId, l) {
  const index = await gh.readFile('blog/index.html');
  const posts = index ? T.listCards(index).slice(0, 3) : [];
  if (!posts.length) return tg('sendMessage', { chat_id: chatId, text: l.noPosts });
  const text = [l.latest, ''].concat(posts.map((p) =>
    `• <a href="${SITE}/blog/${p.slug}">${esc(p.title)}</a>${p.excerpt ? `\n<i>${esc(p.excerpt.slice(0, 110))}${p.excerpt.length > 110 ? '…' : ''}</i>` : ''}`)).join('\n\n');
  return tg('sendMessage', {
    chat_id: chatId, text, parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: [[{ text: l.btnAll, url: `${SITE}/blog` }]] },
  });
}

/* ── Everyone ── */
async function onStart(msg) {
  const u = msg.from, l = L[langOf(u)];
  const isNew = await subs.add(u);
  await tg('sendMessage', { chat_id: msg.chat.id, text: isNew ? l.welcome(esc(u.first_name || '')) : l.again(esc(u.first_name || '')), parse_mode: 'HTML', reply_markup: keyboard(l) });
  await sendLatest(msg.chat.id, l);
  if (isNew) groupLog(`🆕 Yangi obunachi: ${who(u)} · 🌐 ${esc((u.language_code || '?').toUpperCase())}\nJami: <b>${await subs.count()}</b>`);
}

async function onStop(chatId, u) {
  const l = L[langOf(u)];
  const was = await subs.remove(chatId);
  await tg('sendMessage', { chat_id: chatId, text: was ? l.stopped : l.notSub });
  if (was) groupLog(`🔕 Obunadan chiqdi: ${who(u)}\nJami: <b>${await subs.count()}</b>`);
}

async function onUserMessage(msg) {
  const l = L[langOf(msg.from)];
  // Pass the message to the group with who sent it.
  if (process.env.TG_CHAT_ID) {
    await tg('sendMessage', { chat_id: process.env.TG_CHAT_ID, text: `✉️ Botdagi xabar: ${who(msg.from)}`, parse_mode: 'HTML' });
    await tg('copyMessage', { chat_id: process.env.TG_CHAT_ID, from_chat_id: msg.chat.id, message_id: msg.message_id });
  }
  await tg('sendMessage', { chat_id: msg.chat.id, text: l.thanks, reply_markup: keyboard(l) });
}

/* ── Admin ── */
// The admin is never a subscriber: /start opens this panel instead.
const ADMIN_KEYBOARD = {
  inline_keyboard: [
    [{ text: '📊 Statistika', callback_data: 'a_stats' }, { text: "👥 So'nggi obunachilar", callback_data: 'a_subs' }],
    [{ text: '📚 Maqolalar', callback_data: 'latest' }, { text: "👁 Obunachi ko'rinishi", callback_data: 'a_preview' }],
  ],
};

async function adminPanel(chatId) {
  const text = [
    '👑 <b>Admin paneli — The Hub Robot</b>',
    '',
    `👥 Obunachilar: <b>${await subs.count()}</b>`,
    '',
    "📣 <b>Rassilka:</b> istalgan xabarni (matn, rasm, video, fayl) shu yerga yuboring — obunachilarga yuborishdan oldin tasdiq so'rayman.",
    "📰 Yangi blog maqolalari blog botida «Chop etish + 📣» bosilganda avtomatik yuboriladi.",
    '',
    "Siz admin sifatida obunachilar ro'yxatiga kirmaysiz va rassilka olmaysiz.",
  ].join('\n');
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: ADMIN_KEYBOARD });
}

async function adminStats(chatId) {
  const [total, list] = await Promise.all([subs.count(), subs.recent(100000)]);
  const day = (ms) => new Date(ms + 5 * 3600 * 1000).toISOString().slice(0, 10); // Tashkent date
  const today = day(Date.now());
  const week = Date.now() - 7 * 864e5;
  const langs = {};
  list.forEach((s) => { const l = (s.lang || '?').slice(0, 2).toUpperCase(); langs[l] = (langs[l] || 0) + 1; });
  const text = [
    '📊 <b>Statistika</b>',
    '',
    `👥 Jami obunachilar: <b>${total}</b>`,
    `🆕 Bugun: <b>${list.filter((s) => day(Date.parse(s.joined)) === today).length}</b>`,
    `📅 So'nggi 7 kun: <b>${list.filter((s) => Date.parse(s.joined) >= week).length}</b>`,
    `🌐 Tillar: ${Object.entries(langs).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${esc(l)} ${n}`).join(' · ') || '—'}`,
  ].join('\n');
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
}

async function adminRecent(chatId) {
  const list = await subs.recent(10);
  if (!list.length) return tg('sendMessage', { chat_id: chatId, text: "Hozircha obunachilar yo'q." });
  const when = (iso) => new Date(Date.parse(iso) + 5 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
  const lines = list.map((s, i) => `${i + 1}. <b>${esc(s.name || '—')}</b>${s.username ? ' @' + esc(s.username) : ''} · ${esc((s.lang || '?').toUpperCase())} · ${when(s.joined)}`);
  return tg('sendMessage', { chat_id: chatId, text: "👥 <b>So'nggi obunachilar</b>\n\n" + lines.join('\n'), parse_mode: 'HTML' });
}

/* What a subscriber sees after /start, without subscribing the admin. */
async function adminPreview(chatId, from) {
  const l = L[langOf(from)];
  await tg('sendMessage', { chat_id: chatId, text: "👁 <i>Obunachi ko'rinishi (siz obuna qilinmadingiz):</i>", parse_mode: 'HTML' });
  await tg('sendMessage', { chat_id: chatId, text: l.welcome(esc(from.first_name || '')), parse_mode: 'HTML', reply_markup: keyboard(l) });
  await sendLatest(chatId, l);
}

async function onAdminMessage(msg) {
  const text = (msg.text || '').trim();
  if (text === '/help' || text === '/admin') return adminPanel(msg.chat.id);
  if (text === '/stats') return adminStats(msg.chat.id);
  if (text.startsWith('/')) return tg('sendMessage', { chat_id: msg.chat.id, text: "Noma'lum buyruq. /start — admin paneli" });
  const n = await subs.count();
  return tg('sendMessage', {
    chat_id: msg.chat.id,
    text: `📣 Bu xabar <b>${n}</b> ta obunachiga yuborilsinmi?`,
    parse_mode: 'HTML',
    reply_parameters: { message_id: msg.message_id },
    reply_markup: { inline_keyboard: [[{ text: '✅ Yuborish', callback_data: 'bc' }, { text: '❌ Bekor qilish', callback_data: 'bcx' }]] },
  });
}

async function onAdminBroadcast(cq) {
  const chatId = cq.message.chat.id;
  const draft = cq.message.reply_to_message;
  await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } });
  await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Yuborilmoqda…' });
  if (!draft) return tg('editMessageText', { chat_id: chatId, message_id: cq.message.message_id, text: '⚠️ Asl xabar topilmadi. Qaytadan yuboring.' });
  const r = await subs.broadcast((id) => tg('copyMessage', { chat_id: id, from_chat_id: chatId, message_id: draft.message_id }), { budgetMs: 50000 });
  const line = reportLine(r);
  await tg('editMessageText', { chat_id: chatId, message_id: cq.message.message_id, text: '📣 Rassilka tugadi\n' + line });
  groupLog('📣 Rassilka yuborildi\n' + esc(line));
}

/* ── Webhook ── */
async function setup(req, res) {
  const url = `https://${req.headers['x-forwarded-host'] || req.headers.host}/api/hub-bot`;
  await tg('setWebhook', { url, secret_token: secret(), allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
  await tg('setMyCommands', { commands: [
    { command: 'start', description: "Obuna bo'lish va so'nggi maqolalar" },
    { command: 'stop', description: "Obunani to'xtatish" },
  ] });
  await tg('setMyCommands', { language_code: 'ru', commands: [
    { command: 'start', description: 'Подписаться и последние статьи' },
    { command: 'stop', description: 'Отписаться' },
  ] });
  await tg('setMyCommands', { language_code: 'en', commands: [
    { command: 'start', description: 'Subscribe and latest posts' },
    { command: 'stop', description: 'Unsubscribe' },
  ] });
  const me = await tg('getMe');
  return res.status(200).json({ ok: true, bot: '@' + me.username, webhook: url, redis: subs.configured() });
}

const secret = () => process.env.HUB_WEBHOOK_SECRET || process.env.BLOG_WEBHOOK_SECRET;

module.exports = async (req, res) => {
  const s = secret();
  if (req.method === 'GET') {
    if (s && req.query && req.query.setup === s) {
      try { return await setup(req, res); } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
    }
    return res.status(404).end();
  }
  if (req.method !== 'POST') return res.status(405).end();
  if (!s || req.headers['x-telegram-bot-api-secret-token'] !== s) return res.status(401).end();

  let update = req.body;
  if (typeof update === 'string') { try { update = JSON.parse(update); } catch (_) { update = {}; } }
  update = update || {};
  // A broadcast can take a while; ignore Telegram retrying the same update.
  if (update.update_id != null && !(await firstTime('upd:hub:' + update.update_id))) return res.status(200).json({ ok: true });

  const msg = update.message;
  const cq = update.callback_query;
  // Only private chats; the group itself is just an output for leads/logs.
  const chat = (msg && msg.chat) || (cq && cq.message && cq.message.chat);
  if (!chat || chat.type !== 'private') return res.status(200).json({ ok: true });

  const from = (msg && msg.from) || cq.from;
  const isAdmin = String(from.id) === String(process.env.BLOG_ADMIN_ID || '');

  try {
    if (cq) {
      if (cq.data === 'latest') { await tg('answerCallbackQuery', { callback_query_id: cq.id }); await sendLatest(chat.id, L[langOf(from)]); }
      else if (cq.data === 'stop' && isAdmin) await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Siz adminsiz — obunachi emassiz.' });
      else if (cq.data === 'stop') { await tg('answerCallbackQuery', { callback_query_id: cq.id }); await onStop(chat.id, from); }
      else if (cq.data.startsWith('a_') && isAdmin) {
        await tg('answerCallbackQuery', { callback_query_id: cq.id });
        if (cq.data === 'a_stats') await adminStats(chat.id);
        else if (cq.data === 'a_subs') await adminRecent(chat.id);
        else if (cq.data === 'a_preview') await adminPreview(chat.id, from);
      }
      else if (cq.data === 'bc' && isAdmin) await onAdminBroadcast(cq);
      else if (cq.data === 'bcx' && isAdmin) {
        await tg('answerCallbackQuery', { callback_query_id: cq.id });
        await tg('editMessageText', { chat_id: chat.id, message_id: cq.message.message_id, text: '❌ Bekor qilindi.' });
      } else await tg('answerCallbackQuery', { callback_query_id: cq.id });
    } else if (msg) {
      const text = (msg.text || '').trim();
      if (isAdmin && (text === '/start' || text.startsWith('/start') || text === '/stop')) {
        // Clean up if the admin was subscribed before admins were excluded.
        await subs.remove(chat.id).catch(() => {});
        await adminPanel(chat.id);
      } else if (text === '/start' || text.startsWith('/start ')) await onStart(msg);
      else if (text === '/stop') await onStop(chat.id, from);
      else if (isAdmin) await onAdminMessage(msg);
      else await onUserMessage(msg);
    }
  } catch (e) {
    console.error('[hub-bot]', e);
    if (isAdmin) { try { await tg('sendMessage', { chat_id: chat.id, text: '⚠️ Xatolik: ' + e.message }); } catch (_) {} }
  }
  return res.status(200).json({ ok: true });
};
