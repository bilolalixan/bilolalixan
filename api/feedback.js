// Vercel serverless function: receives feedback from the site and forwards it
// to the Telegram group. The bot token never reaches the browser — it is read
// from the TG_TOKEN / TG_CHAT_ID environment variables set in Vercel.

const MAX_NAME = 60;
const MAX_TEXT = 1000;
const LANGS = ['uz', 'ru', 'en'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });

  const { TG_TOKEN, TG_CHAT_ID } = process.env;
  if (!TG_TOKEN || !TG_CHAT_ID) return res.status(500).json({ ok: false, error: 'config' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = null; }
  }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'body' });

  // Honeypot: bots fill the hidden field; pretend success and drop it.
  if (body.hp) return res.status(200).json({ ok: true });

  const text = String(body.text || '').trim().slice(0, MAX_TEXT);
  const name = String(body.name || '').trim().slice(0, MAX_NAME) || '—';
  const lang = LANGS.includes(body.lang) ? body.lang : 'uz';
  if (!text) return res.status(400).json({ ok: false, error: 'empty' });

  const msg =
    '💬 Yangi fikr (sayt)\n\n' +
    '👤 Ism: ' + name + '\n' +
    '🌐 Til: ' + lang.toUpperCase() + '\n\n' +
    text;

  try {
    const tg = await fetch('https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text: msg, disable_web_page_preview: true })
    });
    const data = await tg.json();
    if (!data.ok) return res.status(502).json({ ok: false, error: 'telegram' });
    return res.status(200).json({ ok: true });
  } catch (_) {
    return res.status(502).json({ ok: false, error: 'telegram' });
  }
};
