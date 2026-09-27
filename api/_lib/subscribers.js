// Subscribers of The Hub Robot, stored in Redis:
//   subs        set of chat ids
//   subs:info   hash chat id -> JSON { name, username, lang, joined }
//   subs:lang   hash chat id -> uz | ru | en   (language the user picked in the bot)

const { cmd, configured } = require('./kv');

const SET = 'subs';
const INFO = 'subs:info';
const LANG = 'subs:lang';
const LANGS = ['uz', 'ru', 'en'];

const isAdmin = (id) => String(id) === String(process.env.BLOG_ADMIN_ID || '');

/** Adds a subscriber; returns true if they were not subscribed before. The admin is never a subscriber. */
async function add(user, lang) {
  const id = String(user.id);
  if (isAdmin(id)) return false;
  const added = await cmd('SADD', SET, id);
  const info = {
    name: [user.first_name, user.last_name].filter(Boolean).join(' ').slice(0, 80),
    username: user.username || '',
    lang: lang || user.language_code || '',
    joined: new Date().toISOString(),
  };
  if (added) await cmd('HSET', INFO, id, JSON.stringify(info));
  return added === 1;
}

/** Removes a subscriber; returns true if they were subscribed. */
async function remove(id) {
  const removed = await cmd('SREM', SET, String(id));
  await cmd('HDEL', INFO, String(id));
  return removed === 1;
}

const count = () => cmd('SCARD', SET).then(Number);

/** The language a user picked in the bot, or null if they haven't yet. */
async function getLang(id) {
  const l = await cmd('HGET', LANG, String(id));
  return LANGS.includes(l) ? l : null;
}

/** Saves the user's language (also on their subscriber record, for stats). */
async function setLang(id, lang) {
  if (!LANGS.includes(lang)) return;
  await cmd('HSET', LANG, String(id), lang);
  const raw = await cmd('HGET', INFO, String(id));
  if (raw) {
    try { const info = JSON.parse(raw); info.lang = lang; await cmd('HSET', INFO, String(id), JSON.stringify(info)); } catch (_) {}
  }
}

/** { chatId: lang } for everyone who picked a language. */
async function langs() {
  const flat = (await cmd('HGETALL', LANG)) || [];
  const out = {};
  for (let i = 0; i < flat.length; i += 2) out[flat[i]] = flat[i + 1];
  return out;
}

/** The newest subscribers first: [{ id, name, username, lang, joined }]. */
async function recent(n = 10) {
  const flat = (await cmd('HGETALL', INFO)) || [];
  const list = [];
  for (let i = 0; i < flat.length; i += 2) {
    try { list.push({ id: flat[i], ...JSON.parse(flat[i + 1]) }); } catch (_) {}
  }
  return list.sort((a, b) => String(b.joined).localeCompare(String(a.joined))).slice(0, n);
}
const all = () => cmd('SMEMBERS', SET);
const isSubscribed = (id) => cmd('SISMEMBER', SET, String(id)).then((r) => r === 1);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends something to every subscriber with fn(chatId), about 20 per second.
 * Users who blocked the bot are removed. Stops early if the time budget runs
 * out (serverless limit) and reports how many were left.
 */
async function broadcast(fn, { budgetMs = 50000 } = {}) {
  const started = Date.now();
  const ids = (await all()).filter((id) => !isAdmin(id));
  const res = { total: ids.length, sent: 0, removed: 0, failed: 0, left: 0 };
  for (let i = 0; i < ids.length; i++) {
    if (Date.now() - started > budgetMs) { res.left = ids.length - i; break; }
    try {
      await fn(ids[i]);
      res.sent++;
    } catch (e) {
      if (e.code === 429 && e.retryAfter) {
        await sleep(e.retryAfter * 1000);
        i--; continue;
      }
      if (e.code === 403 || /blocked|deactivated|chat not found/i.test(e.message)) {
        await remove(ids[i]).catch(() => {});
        res.removed++;
      } else {
        res.failed++;
      }
    }
    await sleep(50);
  }
  return res;
}

module.exports = { add, remove, count, recent, all, isSubscribed, getLang, setLang, langs, broadcast, configured, LANGS };
