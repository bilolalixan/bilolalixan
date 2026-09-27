// Messages that go through The Hub Robot: group log lines and new-post
// announcements to subscribers. Shared by api/hub-bot.js and api/blog-bot.js.

const { hub } = require('./telegram');
const subs = require('./subscribers');
const { esc } = require('./format');
const { SITE } = require('./templates');

/** A line in the leads/feedback group (TG_CHAT_ID). Never throws. */
async function groupLog(html) {
  if (!process.env.TG_CHAT_ID) return;
  try {
    await hub.tg('sendMessage', { chat_id: process.env.TG_CHAT_ID, text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  } catch (e) { console.error('groupLog', e.message); }
}

/** The announcement a subscriber receives for a post. */
function postMessage(post) {
  const url = `${SITE}/blog/${post.slug}`;
  const text = [
    `🆕 <b>${esc(post.title)}</b>`,
    post.excerpt ? `\n${esc(post.excerpt)}` : '',
  ].join('\n');
  return {
    url,
    text,
    reply_markup: { inline_keyboard: [[{ text: "📖 O'qish", url }]] },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits (up to maxMs) until a freshly committed page is live on Vercel. */
async function waitUntilLive(url, maxMs = 35000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      if (res.ok) return true;
    } catch (_) {}
    await sleep(5000);
  }
  return false;
}

/**
 * Sends a post to every subscriber. `cover` is a site path like
 * /assets/blog/slug.jpg (sent as a photo), or null.
 */
const READ = { uz: "📖 O'qish", ru: '📖 Читать', en: '📖 Read' };

async function announcePost(post, cover, { budgetMs = 20000 } = {}) {
  const m = postMessage(post);
  const langOf = await subs.langs().catch(() => ({}));
  const markup = (chatId) => ({ inline_keyboard: [[{ text: READ[langOf[chatId]] || READ.uz, url: m.url }]] });
  return subs.broadcast((chatId) => (cover
    ? hub.tg('sendPhoto', { chat_id: chatId, photo: SITE + cover, caption: m.text, parse_mode: 'HTML', reply_markup: markup(chatId) })
    : hub.tg('sendMessage', { chat_id: chatId, text: m.text, parse_mode: 'HTML', reply_markup: markup(chatId), link_preview_options: { url: m.url, prefer_large_media: true } })), { budgetMs });
}

function reportLine(r) {
  let s = `✅ ${r.sent} ta obunachiga yuborildi`;
  if (r.removed) s += ` · ${r.removed} ta botni bloklagan (ro'yxatdan o'chirildi)`;
  if (r.failed) s += ` · ${r.failed} ta xato`;
  if (r.left) s += ` · ⏳ vaqt yetmadi, ${r.left} ta qoldi`;
  return s;
}

module.exports = { groupLog, postMessage, waitUntilLive, announcePost, reportLine };
