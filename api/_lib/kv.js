// Upstash Redis over its REST API (no dependencies).
// Vercel's Upstash integration sets KV_REST_API_URL / KV_REST_API_TOKEN;
// a direct Upstash setup uses UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.

function cfg() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Redis (Upstash) is not connected to this Vercel project');
  return { url: url.replace(/\/$/, ''), token };
}

const configured = () => !!((process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
  (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN));

/** Runs one Redis command, e.g. cmd('SADD', 'subs', '42'). */
async function cmd(...args) {
  const { url, token } = cfg();
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(args.map(String)),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error('Redis: ' + (data.error || res.status));
  return data.result;
}

/**
 * Returns true the first time a key is seen within ttl seconds, false after.
 * Used to ignore Telegram retrying an update that is still being processed.
 * Without Redis it always returns true.
 */
async function firstTime(key, ttl = 3600) {
  if (!configured()) return true;
  try { return (await cmd('SET', key, '1', 'NX', 'EX', ttl)) === 'OK'; } catch (_) { return true; }
}

module.exports = { cmd, configured, firstTime };
