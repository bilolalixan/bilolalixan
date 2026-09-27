// Minimal Telegram Bot API clients.
//   blog bot:       BLOG_BOT_TOKEN  (tg, download)
//   The Hub Robot:  TG_TOKEN        (hub.tg, hub.download) — leads, feedback, subscribers

class TelegramError extends Error {
  constructor(method, data, status) {
    super(`Telegram ${method}: ${data.description || status}`);
    this.code = data.error_code || status;
    this.retryAfter = data.parameters && data.parameters.retry_after;
  }
}

function createBot(envName) {
  const token = () => {
    const t = process.env[envName];
    if (!t) throw new Error(`${envName} is not set`);
    return t;
  };

  async function tg(method, params = {}) {
    const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) throw new TelegramError(method, data, res.status);
    return data.result;
  }

  /** Downloads a file sent to the bot and returns it as a Buffer. */
  async function download(fileId) {
    const file = await tg('getFile', { file_id: fileId });
    const res = await fetch(`https://api.telegram.org/file/bot${token()}/${file.file_path}`);
    if (!res.ok) throw new Error('Telegram file download failed: ' + res.status);
    return Buffer.from(await res.arrayBuffer());
  }

  return { tg, download };
}

const blog = createBot('BLOG_BOT_TOKEN');
const hub = createBot('TG_TOKEN');

module.exports = { tg: blog.tg, download: blog.download, hub, createBot, TelegramError };
