// Minimal Telegram Bot API client for the blog bot (BLOG_BOT_TOKEN).

function token() {
  const t = process.env.BLOG_BOT_TOKEN;
  if (!t) throw new Error('BLOG_BOT_TOKEN is not set');
  return t;
}

async function tg(method, params = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description || res.status}`);
  return data.result;
}

/** Downloads a file sent to the bot and returns it as a Buffer. */
async function download(fileId) {
  const file = await tg('getFile', { file_id: fileId });
  const res = await fetch(`https://api.telegram.org/file/bot${token()}/${file.file_path}`);
  if (!res.ok) throw new Error('Telegram file download failed: ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}

module.exports = { tg, download };
