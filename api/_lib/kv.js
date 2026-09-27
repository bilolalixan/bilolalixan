// Upstash Redis over its REST API (no dependencies).

/* Finds the Upstash REST URL and token. Vercel's integration names them
   KV_REST_API_URL / KV_REST_API_TOKEN, or <PREFIX>_KV_REST_API_URL when a
   custom prefix was chosen; a direct Upstash setup uses UPSTASH_REDIS_REST_*. */
function find() {
  const env = process.env;
  const pairs = [
    ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
    ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
  ];
  for (const k of Object.keys(env)) {
    const m = k.match(/^(.*)_REST_API_URL$/) || k.match(/^(.*)_REDIS_REST_URL$/);
    if (m) pairs.push([k, k.replace(/URL$/, 'TOKEN')]);
  }
  for (const [u, t] of pairs) {
    if (env[u] && env[t] && /^https:/.test(env[u])) return { url: env[u].replace(/\/$/, ''), token: env[t] };
  }
  return null;
}

function cfg() {
  const c = find();
  if (!c) throw new Error('Redis (Upstash) is not connected to this Vercel project (redeploy after connecting it)');
  return c;
}

const configured = () => !!find();

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
