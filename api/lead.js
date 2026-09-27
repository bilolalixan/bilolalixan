// Vercel serverless function: receives a consultation request from /booking
// and posts it as a lead card to the Telegram group through The Hub Robot
// (the same bot as the feedback form: TG_TOKEN / TG_CHAT_ID env vars).
// The form sends option codes; they are turned into Uzbek labels here so the
// group always reads the lead in one language.

const OPTIONS = {
  industry: {
    retail: "Savdo / do'kon", services: "Xizmat ko'rsatish", food: 'Restoran / kafe',
    beauty: "Go'zallik va salomatlik", education: "Ta'lim", realestate: "Qurilish / ko'chmas mulk",
    production: 'Ishlab chiqarish', it: 'IT / onlayn servis', other: 'Boshqa',
  },
  staff: { s0: "Faqat o'zim", s1: '1–5', s2: '6–20', s3: '21–50', s4: '51–200', s5: '200+' },
  budget: {
    b0: "Hozircha yo'q", b1: '$500 gacha', b2: '$500 – $2 000', b3: '$2 000 – $5 000',
    b4: '$5 000 – $10 000', b5: '$10 000+',
  },
  goals: {
    sales: 'Sotuvni oshirish', leads: "Ko'proq mijoz / lid olish", brand: 'Brendni tanitish',
    ads: 'Reklama samaradorligini oshirish', smm: 'Ijtimoiy tarmoqlarni rivojlantirish',
    site: 'Sayt yoki savdo voronkasi', strategy: 'Marketing strategiyasi', audit: 'Marketing auditi',
    other: 'Boshqa',
  },
};
// /services/<slug> pages link to /booking?service=<slug>.
const SERVICES = {
  'performance-marketing': 'Performance Marketing',
  'lead-generation': 'Lead Generation',
  'google-ads': 'Google Ads',
  'web-development': 'Web-sayt yaratish',
  'influencer-marketing': 'Influencer Marketing',
  'reels-production': 'Reels Production',
  'logo-design': 'Logo & Design',
  'branding': 'Branding',
};
const LANGS = { uz: "O'zbek", ru: 'Rus', en: 'Ingliz' };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const str = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

function validate(b) {
  const lead = {
    name: str(b.name, 60),
    business: str(b.business, 80),
    industry: OPTIONS.industry[b.industry] ? b.industry : null,
    industryOther: str(b.industryOther, 60),
    staff: OPTIONS.staff[b.staff] ? b.staff : null,
    budget: OPTIONS.budget[b.budget] ? b.budget : null,
    goals: Array.isArray(b.goals) ? [...new Set(b.goals.filter((g) => OPTIONS.goals[g]))].slice(0, 9) : [],
    goalOther: str(b.goalOther, 80),
    problem: String(b.problem == null ? '' : b.problem).trim().slice(0, 800),
    phone: String(b.phone || '').replace(/[^\d+]/g, ''),
    telegram: str(b.telegram, 40).replace(/^@+/, '').replace(/^https?:\/\/t\.me\//i, ''),
    lang: LANGS[b.lang] ? b.lang : 'uz',
    source: str(b.source, 200),
    service: SERVICES[b.service] ? b.service : null,
  };
  const errors = [];
  if (lead.name.length < 2) errors.push('name');
  if (lead.business.length < 2) errors.push('business');
  if (!lead.industry) errors.push('industry');
  if (!lead.staff) errors.push('staff');
  if (!lead.budget) errors.push('budget');
  if (!lead.goals.length) errors.push('goals');
  const digits = lead.phone.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) errors.push('phone');
  if (lead.telegram && !/^[A-Za-z0-9_]{4,32}$/.test(lead.telegram)) errors.push('telegram');
  return { lead, errors };
}

function card(l) {
  const industry = l.industry === 'other' && l.industryOther ? `Boshqa — ${l.industryOther}` : OPTIONS.industry[l.industry];
  const goals = l.goals.map((g) => (g === 'other' && l.goalOther ? `Boshqa — ${l.goalOther}` : OPTIONS.goals[g]));
  const d = l.phone.replace(/\D/g, '');
  const phone = d.length === 12 && d.startsWith('998')
    ? `+998 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`
    : '+' + d;
  const lines = [
    '🔥 <b>Yangi lid — konsultatsiya</b>',
    '',
    ...(l.service ? [`🧩 <b>Xizmat:</b> ${esc(SERVICES[l.service])}`] : []),
    `👤 <b>Ism:</b> ${esc(l.name)}`,
    `🏢 <b>Biznes:</b> ${esc(l.business)}`,
    `🧭 <b>Yo'nalish:</b> ${esc(industry)}`,
    `👥 <b>Xodimlar:</b> ${esc(OPTIONS.staff[l.staff])}`,
    `💰 <b>Marketing byudjeti (oyiga):</b> ${esc(OPTIONS.budget[l.budget])}`,
    `🎯 <b>Maqsad:</b> ${esc(goals.join(', '))}`,
  ];
  if (l.problem) lines.push('', `📝 <b>Muammo:</b>\n${esc(l.problem)}`);
  lines.push('', `📞 <b>Telefon:</b> ${esc(phone)}`);
  if (l.telegram) lines.push(`✈️ <b>Telegram:</b> @${esc(l.telegram)}`);
  lines.push('', `🌐 Til: ${LANGS[l.lang]}${l.source ? ` · Manba: ${esc(l.source)}` : ''}`);
  return lines.join('\n');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });

  const { TG_TOKEN, TG_CHAT_ID } = process.env;
  if (!TG_TOKEN || !TG_CHAT_ID) return res.status(500).json({ ok: false, error: 'config' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'body' });

  // Bots: hidden honeypot field, or a form "filled" in under 4 seconds.
  if (body.hp || (Number(body.elapsed) > 0 && Number(body.elapsed) < 4000)) return res.status(200).json({ ok: true });

  const { lead, errors } = validate(body);
  if (errors.length) return res.status(400).json({ ok: false, error: 'invalid', fields: errors });

  const payload = {
    chat_id: TG_CHAT_ID,
    text: card(lead),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  };
  if (lead.telegram) {
    payload.reply_markup = { inline_keyboard: [[{ text: '✈️ Telegramda yozish', url: `https://t.me/${lead.telegram}` }]] };
  }

  try {
    const tg = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await tg.json();
    if (!data.ok) return res.status(502).json({ ok: false, error: 'telegram' });
    return res.status(200).json({ ok: true });
  } catch (_) {
    return res.status(502).json({ ok: false, error: 'telegram' });
  }
};

module.exports.validate = validate;
module.exports.card = card;
