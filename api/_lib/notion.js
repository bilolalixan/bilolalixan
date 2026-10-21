// Notion REST client (no dependencies) and the two Jarvis databases:
//   Tasks   — Name, Due, Status (Todo/Done), Priority, Note
//   Clients — Name, Status, Channel, Contact, Service, Language, Follow-up, Note
// Database ids come from NOTION_TASKS_DB / NOTION_CLIENTS_DB, or from Redis
// where setup() stores them after creating the databases.

const kv = require('./kv');

const API = 'https://api.notion.com/v1';
const opts = (names) => ({ select: { options: names.map((name) => ({ name })) } });

const SCHEMA = {
  tasks: {
    title: 'Jarvis — Vazifalar',
    properties: {
      Name: { title: {} },
      Due: { date: {} },
      Status: opts(['Todo', 'Done']),
      Priority: opts(['High', 'Normal', 'Low']),
      Note: { rich_text: {} },
    },
  },
  clients: {
    title: 'Jarvis — Mijozlar',
    properties: {
      Name: { title: {} },
      Status: opts(['New', 'Contacted', 'Replied', 'Negotiation', 'Won', 'Lost']),
      Channel: opts(['Telegram', 'Instagram', 'WhatsApp', 'Email', 'Other']),
      Contact: { rich_text: {} },
      Service: { rich_text: {} },
      Language: opts(['uz', 'ru', 'en']),
      'Follow-up': { date: {} },
      Note: { rich_text: {} },
    },
  },
};

async function nf(path, method = 'GET', body) {
  if (!process.env.NOTION_TOKEN) throw new Error('NOTION_TOKEN is not set');
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + process.env.NOTION_TOKEN,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Notion ${method} ${path}: ${data.message || res.status}`);
  return data;
}

/** Creates both databases under a Notion page and remembers their ids. */
async function setup(parentPageId) {
  const ids = {};
  for (const key of Object.keys(SCHEMA)) {
    const db = await nf('/databases', 'POST', {
      parent: { type: 'page_id', page_id: parentPageId },
      title: [{ type: 'text', text: { content: SCHEMA[key].title } }],
      properties: SCHEMA[key].properties,
    });
    ids[key] = db.id;
    if (kv.configured()) await kv.cmd('SET', 'jarvis:db:' + key, db.id);
  }
  return ids;
}

async function dbId(key) {
  const env = process.env[key === 'tasks' ? 'NOTION_TASKS_DB' : 'NOTION_CLIENTS_DB'];
  if (env) return env;
  const id = kv.configured() ? await kv.cmd('GET', 'jarvis:db:' + key) : null;
  if (!id) throw new Error('Notion databases are not set up yet (open the ?setup= link)');
  return id;
}

const text = (s) => [{ type: 'text', text: { content: String(s).slice(0, 1900) } }];
const plain = (rt) => (rt || []).map((t) => t.plain_text).join('');
const sel = (p) => (p && p.select ? p.select.name : null);
const date = (p) => (p && p.date ? p.date.start : null);

function taskOut(page) {
  const p = page.properties;
  return { id: page.id, title: plain(p.Name.title), due: date(p.Due), status: sel(p.Status), priority: sel(p.Priority), note: plain(p.Note.rich_text) };
}
function clientOut(page) {
  const p = page.properties;
  return {
    id: page.id, name: plain(p.Name.title), status: sel(p.Status), channel: sel(p.Channel),
    contact: plain(p.Contact.rich_text), service: plain(p.Service.rich_text), language: sel(p.Language),
    followup: date(p['Follow-up']), note: plain(p.Note.rich_text),
  };
}

const query = async (key, body) => (await nf(`/databases/${await dbId(key)}/query`, 'POST', body)).results;

async function addTask({ title, due, priority, note }) {
  const props = { Name: { title: text(title) }, Status: { select: { name: 'Todo' } } };
  if (due) props.Due = { date: { start: due } };
  if (priority) props.Priority = { select: { name: priority } };
  if (note) props.Note = { rich_text: text(note) };
  const page = await nf('/pages', 'POST', { parent: { database_id: await dbId('tasks') }, properties: props });
  return taskOut(page);
}

async function listTasks({ includeDone = false } = {}) {
  const body = { sorts: [{ property: 'Due', direction: 'ascending' }], page_size: 50 };
  if (!includeDone) body.filter = { property: 'Status', select: { equals: 'Todo' } };
  return (await query('tasks', body)).map(taskOut);
}

async function completeTask(id) {
  return taskOut(await nf('/pages/' + id, 'PATCH', { properties: { Status: { select: { name: 'Done' } } } }));
}

function clientProps(c) {
  const props = {};
  if (c.name) props.Name = { title: text(c.name) };
  if (c.status) props.Status = { select: { name: c.status } };
  if (c.channel) props.Channel = { select: { name: c.channel } };
  if (c.contact) props.Contact = { rich_text: text(c.contact) };
  if (c.service) props.Service = { rich_text: text(c.service) };
  if (c.language) props.Language = { select: { name: c.language } };
  if (c.followup) props['Follow-up'] = { date: { start: c.followup } };
  if (c.note) props.Note = { rich_text: text(c.note) };
  return props;
}

async function addClient(c) {
  const props = clientProps({ status: 'New', ...c });
  const page = await nf('/pages', 'POST', { parent: { database_id: await dbId('clients') }, properties: props });
  return clientOut(page);
}

async function listClients({ status } = {}) {
  const body = { sorts: [{ property: 'Follow-up', direction: 'ascending' }], page_size: 50 };
  if (status) body.filter = { property: 'Status', select: { equals: status } };
  return (await query('clients', body)).map(clientOut);
}

async function updateClient(id, fields) {
  return clientOut(await nf('/pages/' + id, 'PATCH', { properties: clientProps(fields) }));
}

/** Open tasks due today or earlier, and active clients whose follow-up is due. */
async function dueNow(today) {
  const [tasks, clients] = await Promise.all([
    query('tasks', {
      filter: { and: [
        { property: 'Status', select: { equals: 'Todo' } },
        { property: 'Due', date: { on_or_before: today } },
      ] },
    }),
    query('clients', {
      filter: { and: [
        { property: 'Follow-up', date: { on_or_before: today } },
        { property: 'Status', select: { does_not_equal: 'Won' } },
        { property: 'Status', select: { does_not_equal: 'Lost' } },
      ] },
    }),
  ]);
  return { tasks: tasks.map(taskOut), clients: clients.map(clientOut) };
}

module.exports = { setup, addTask, listTasks, completeTask, addClient, listClients, updateClient, dueNow };
