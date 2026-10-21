// Jarvis (JARVIS_BOT_TOKEN) webhook: the owner's private assistant bot.
//   Owner only (JARVIS_ADMIN_ID, falls back to BLOG_ADMIN_ID); everyone else is ignored.
//   Any message is handled by Claude with Notion tools (tasks and clients);
//   /today shows what is due now.
//   GET ?cron=1 (Vercel Cron, Authorization: Bearer CRON_SECRET) sends the morning report.
//
// Env: JARVIS_BOT_TOKEN, JARVIS_WEBHOOK_SECRET, JARVIS_ADMIN_ID, ANTHROPIC_API_KEY,
// NOTION_TOKEN, CRON_SECRET, Redis via Vercel's Upstash integration (chat memory).
// One-time setup: open https://www.apelsin.asia/api/jarvis-bot?setup=<secret>&page=<Notion page id>
// (the page must be shared with the Notion integration; it creates the two databases).

const { createBot } = require('./_lib/telegram');
const { esc } = require('./_lib/format');
const { firstTime, cmd, configured } = require('./_lib/kv');
const notion = require('./_lib/notion');
const jarvis = require('./_lib/jarvis');

const tg = createBot('JARVIS_BOT_TOKEN').tg;
const adminId = () => String(process.env.JARVIS_ADMIN_ID || process.env.BLOG_ADMIN_ID || '');
const secret = () => process.env.JARVIS_WEBHOOK_SECRET;

const HISTORY_KEY = (chatId) => 'jarvis:hist:' + chatId;
const HISTORY_MAX = 12;

async function loadHistory(chatId) {
  if (!configured()) return [];
  try { return JSON.parse((await cmd('GET', HISTORY_KEY(chatId))) || '[]'); } catch (_) { return []; }
}
async function saveHistory(chatId, history) {
  if (!configured()) return;
  try { await cmd('SET', HISTORY_KEY(chatId), JSON.stringify(history.slice(-HISTORY_MAX)), 'EX', 86400); } catch (_) {}
}

const send = (chatId, text) => tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } });

/** The "due now" digest, shared by /today and the morning cron. */
async function digest() {
  const { date } = jarvis.tashkentNow();
  const { tasks, clients } = await notion.dueNow(date);
  const lines = [`☀️ <b>Jarvis — ${date}</b>`];
  lines.push('', tasks.length ? '<b>📝 Bugungi va kechikkan vazifalar</b>' : '📝 Bugun vazifa yo\'q');
  for (const t of tasks) lines.push(`• ${esc(t.title)}${t.due && t.due < date ? ` ⚠️ ${esc(t.due)}` : ''}${t.priority === 'High' ? ' 🔥' : ''}`);
  lines.push('', clients.length ? '<b>👥 Bog\'lanish vaqti kelgan mijozlar</b>' : '👥 Bugun follow-up yo\'q');
  for (const c of clients) lines.push(`• ${esc(c.name)} (${esc(c.status || '')}${c.channel ? ', ' + esc(c.channel) : ''})${c.contact ? ' — ' + esc(c.contact) : ''}`);
  return lines.join('\n');
}

async function setup(req, res) {
  const url = `https://${req.headers['x-forwarded-host'] || req.headers.host}/api/jarvis-bot`;
  await tg('setWebhook', { url, secret_token: secret(), allowed_updates: ['message'], drop_pending_updates: true });
  await tg('setMyCommands', { commands: [
    { command: 'today', description: 'Bugungi vazifalar va follow-uplar' },
    { command: 'tasks', description: 'Ochiq vazifalar' },
    { command: 'clients', description: 'Mijozlar ro\'yxati' },
  ] });
  const out = { ok: true, bot: '@' + (await tg('getMe')).username, webhook: url, redis: configured() };
  if (req.query.page) out.notion = await notion.setup(String(req.query.page));
  return res.status(200).json(out);
}

async function onMessage(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  if (!text) return send(chatId, 'Hozircha faqat matn tushunaman. Ovozli xabar keyingi bosqichda.');
  if (text === '/start') return send(chatId, '👋 Men Jarvis. Vazifa, mijoz yoki reja haqida oddiy so\'z bilan yozing.\n\n/today — bugun nima bor\n/tasks — vazifalar\n/clients — mijozlar');
  if (text === '/today') return send(chatId, await digest());

  await tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
  const prompt = text === '/tasks' ? 'Ochiq vazifalarimni ko\'rsat' : text === '/clients' ? 'Mijozlar ro\'yxatini ko\'rsat' : text;
  const history = await loadHistory(chatId);
  const answer = await jarvis.reply(history, prompt);
  await saveHistory(chatId, [...history, { role: 'user', content: prompt }, { role: 'assistant', content: answer }]);
  return send(chatId, esc(answer));
}

module.exports = async (req, res) => {
  const s = secret();
  if (req.method === 'GET') {
    if (s && req.query && req.query.setup === s) {
      try { return await setup(req, res); } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
    }
    if (req.query && req.query.cron && process.env.CRON_SECRET && req.headers.authorization === 'Bearer ' + process.env.CRON_SECRET) {
      try { await send(adminId(), await digest()); return res.status(200).json({ ok: true }); }
      catch (e) { console.error('[jarvis-bot cron]', e); return res.status(500).json({ ok: false, error: e.message }); }
    }
    return res.status(404).end();
  }
  if (req.method !== 'POST') return res.status(405).end();
  if (!s || req.headers['x-telegram-bot-api-secret-token'] !== s) return res.status(401).end();

  let update = req.body;
  if (typeof update === 'string') { try { update = JSON.parse(update); } catch (_) { update = {}; } }
  update = update || {};
  if (update.update_id != null && !(await firstTime('upd:jarvis:' + update.update_id))) return res.status(200).json({ ok: true });

  const msg = update.message;
  // Private chat with the owner only.
  if (!msg || msg.chat.type !== 'private' || String(msg.from.id) !== adminId()) return res.status(200).json({ ok: true });

  try {
    await onMessage(msg);
  } catch (e) {
    console.error('[jarvis-bot]', e);
    try { await send(msg.chat.id, '⚠️ Xatolik: ' + esc(e.message)); } catch (_) {}
  }
  return res.status(200).json({ ok: true });
};
