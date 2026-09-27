// Subscribers of The Hub Robot, stored in Redis:
//   subs        set of chat ids
//   subs:info   hash chat id -> JSON { name, username, lang, joined }

const { cmd, configured } = require('./kv');

const SET = 'subs';
const INFO = 'subs:info';

/** Adds a subscriber; returns true if they were not subscribed before. */
async function add(user) {
  const id = String(user.id);
  const added = await cmd('SADD', SET, id);
  const info = {
    name: [user.first_name, user.last_name].filter(Boolean).join(' ').slice(0, 80),
    username: user.username || '',
    lang: user.language_code || '',
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
  const ids = await all();
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

module.exports = { add, remove, count, all, isSubscribed, broadcast, configured };
