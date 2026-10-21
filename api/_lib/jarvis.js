// Jarvis brain: Claude with Notion tools. Takes the owner's free-form message
// (uz/ru/en), calls tools as needed and returns the reply text.
// Env: ANTHROPIC_API_KEY, JARVIS_MODEL (optional).

const notion = require('./notion');

const MODEL = () => process.env.JARVIS_MODEL || 'claude-sonnet-5-5';
const MAX_STEPS = 6;

const STATUS = ['New', 'Contacted', 'Replied', 'Negotiation', 'Won', 'Lost'];
const CHANNEL = ['Telegram', 'Instagram', 'WhatsApp', 'Email', 'Other'];

const clientFields = {
  channel: { type: 'string', enum: CHANNEL },
  contact: { type: 'string', description: 'Username, phone or email' },
  service: { type: 'string', description: 'What we offer or what they need' },
  language: { type: 'string', enum: ['uz', 'ru', 'en'] },
  followup: { type: 'string', description: 'Next follow-up date, YYYY-MM-DD' },
  note: { type: 'string' },
};

const TOOLS = [
  { name: 'add_task', description: 'Add a task to the Notion task list.',
    input_schema: { type: 'object', required: ['title'], properties: {
      title: { type: 'string' }, due: { type: 'string', description: 'YYYY-MM-DD' },
      priority: { type: 'string', enum: ['High', 'Normal', 'Low'] }, note: { type: 'string' } } } },
  { name: 'list_tasks', description: 'List tasks, soonest due first. Open tasks only unless include_done is true.',
    input_schema: { type: 'object', properties: { include_done: { type: 'boolean' } } } },
  { name: 'complete_task', description: 'Mark a task done by its id (from list_tasks).',
    input_schema: { type: 'object', required: ['task_id'], properties: { task_id: { type: 'string' } } } },
  { name: 'add_client', description: 'Add a client or prospect to the Notion client list.',
    input_schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, status: { type: 'string', enum: STATUS }, ...clientFields } } },
  { name: 'list_clients', description: 'List clients, soonest follow-up first; optionally only one status.',
    input_schema: { type: 'object', properties: { status: { type: 'string', enum: STATUS } } } },
  { name: 'update_client', description: 'Change a client\'s status, follow-up date, contact or note by id (from list_clients).',
    input_schema: { type: 'object', required: ['client_id'], properties: { client_id: { type: 'string' }, status: { type: 'string', enum: STATUS }, ...clientFields } } },
];

async function runTool(name, i) {
  switch (name) {
    case 'add_task': return notion.addTask(i);
    case 'list_tasks': return notion.listTasks({ includeDone: !!i.include_done });
    case 'complete_task': return notion.completeTask(i.task_id);
    case 'add_client': return notion.addClient(i);
    case 'list_clients': return notion.listClients(i);
    case 'update_client': { const { client_id, ...fields } = i; return notion.updateClient(client_id, fields); }
    default: throw new Error('Unknown tool ' + name);
  }
}

/** Today's date (YYYY-MM-DD) and weekday in Tashkent, where the owner works. */
function tashkentNow(d = new Date()) {
  const f = (o) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', ...o }).format(d);
  return { date: f({ year: 'numeric', month: '2-digit', day: '2-digit' }), weekday: f({ weekday: 'long' }) };
}

const system = () => {
  const now = tashkentNow();
  return [
    "You are Jarvis, the personal assistant of the owner of a marketing and IT agency in Uzbekistan",
    "(marketing, SMM, targeting, post-production, websites, bots, software).",
    "You keep their task list and client list in Notion through your tools, and help plan the day.",
    "Reply in the language the owner writes in (Uzbek, Russian or English), briefly and concretely.",
    `Today is ${now.weekday}, ${now.date} (Asia/Tashkent); turn relative dates like \"tomorrow\" into YYYY-MM-DD.`,
    "Use tools instead of guessing. Never invent ids: call list_tasks / list_clients first when you need one.",
    "You cannot yet search for prospects or message anyone; if asked, say that comes in a later stage.",
    "Plain text only: no Markdown, no HTML.",
  ].join(' ');
};

async function claude(messages) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL(), max_tokens: 1500, system: system(), tools: TOOLS, messages }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Claude: ' + ((data.error && data.error.message) || res.status));
  return data;
}

/** history: earlier [{role, content: string}] turns. Returns the reply text. */
async function reply(history, userText) {
  const messages = [...history, { role: 'user', content: userText }];
  for (let step = 0; step < MAX_STEPS; step++) {
    const data = await claude(messages);
    const calls = data.content.filter((b) => b.type === 'tool_use');
    if (data.stop_reason !== 'tool_use' || !calls.length) {
      return data.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim() || '…';
    }
    messages.push({ role: 'assistant', content: data.content });
    const results = [];
    for (const c of calls) {
      try {
        results.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(await runTool(c.name, c.input || {})) });
      } catch (e) {
        results.push({ type: 'tool_result', tool_use_id: c.id, is_error: true, content: e.message });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  return "Juda ko'p qadam kerak bo'ldi, so'rovni soddaroq qilib qayta yozing.";
}

module.exports = { reply, tashkentNow, TOOLS };
