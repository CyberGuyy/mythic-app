// Telegram: your own bot (made with @BotFather) as a pocket inbox and a
// reminder bell. Message it a line and it becomes a task ("note: ..." makes a
// note, "/today" lists the day); a task with Remind me on is sent to you at
// its time. The bot answers one chat only: the one that sent the link code
// shown on the Connections page. Mythic polls Telegram (no webhook), so it
// works on a laptop behind a router.
import { randomBytes } from 'node:crypto';
import { ensureDashSettings, readSetting, writeSetting } from '../dash/settings.js';
import { readTasks } from '../tasks/store.js';
import { createTask } from '../tasks/actions.js';
import { saveNote } from '../notes.js';
import { simpleTasks } from '../simple/tasks-view.js';
import { isOpen } from '../task-list.js';
import { wallTime } from '../day.js';

const KEY = 'telegram';
const API = 'https://api.telegram.org';
const TOKEN = /^\d{5,20}:[A-Za-z0-9_-]{30,80}$/;
// A reminder more than this late is dropped rather than sent hours after the fact.
const STALE_MS = 12 * 3600000;

export function readTelegram(db) {
  ensureDashSettings(db);
  return readSetting(db, KEY, {}) || {};
}
const writeTelegram = (db, value, now = new Date()) => { ensureDashSettings(db); writeSetting(db, KEY, value, now); };

/** What the Connections page shows: never the token itself. */
export function telegramStatus(db) {
  const t = readTelegram(db);
  if (!t.bot_token) return { on: false };
  return { on: true, bot: t.bot_username || null, linked: !!t.chat_id, chat: t.chat_name || null, code: t.chat_id ? null : t.link_code, error: t.error || null, linked_at: t.linked_at || null };
}

async function call(token, method, body = {}, { fetcher = fetch, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(`${API}/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!data.ok) throw new Error(data.description || `Telegram answered ${response.status}.`);
    return data.result;
  } finally {
    clearTimeout(timer);
  }
}

/** Save a bot token after checking it with Telegram. */
export async function connectTelegram(db, token, { fetcher = fetch, now = new Date() } = {}) {
  const clean = String(token || '').trim();
  if (!TOKEN.test(clean)) throw new Error('That does not look like a bot token. BotFather gives one like 123456789:AA…');
  let me;
  try { me = await call(clean, 'getMe', {}, { fetcher }); } catch (error) { throw new Error('Telegram did not accept that token: ' + error.message); }
  writeTelegram(db, { bot_token: clean, bot_username: me.username, link_code: randomBytes(3).toString('hex').toUpperCase(), offset: 0 }, now);
  return telegramStatus(db);
}

export function disconnectTelegram(db, now = new Date()) {
  writeTelegram(db, {}, now);
}

export async function sendTelegram(db, text, { fetcher = fetch } = {}) {
  const t = readTelegram(db);
  if (!t.bot_token || !t.chat_id) throw new Error('Telegram is not connected.');
  return call(t.bot_token, 'sendMessage', { chat_id: t.chat_id, text: String(text).slice(0, 4000), disable_web_page_preview: true }, { fetcher });
}

const HELP = [
  'Send me anything and it becomes a task.',
  'Start with work:, life: or home: to file it there.',
  'note: … saves a note instead.',
  '/today lists what is due today.',
].join('\n');

function todayText(db) {
  const { groups } = simpleTasks(readTasks(db), { view: 'today' });
  const rows = groups.flatMap(group => group.tasks);
  if (!rows.length) return 'Nothing due today.';
  return rows.map(task => (task.group === 'overdue' ? '! ' : '- ') + task.title + (task.due_time ? ' (' + task.due_time + ')' : '')).join('\n');
}

/** One message from the linked chat: what it does and what to answer. */
export function handleMessage(db, text, now = new Date()) {
  const line = String(text || '').trim();
  if (!line) return null;
  if (/^\/(start|help)\b/i.test(line)) return HELP;
  if (/^\/today\b/i.test(line)) return todayText(db);
  const note = /^(?:\/note|note:)\s*([\s\S]+)$/i.exec(line);
  if (note) {
    const [first, ...rest] = note[1].trim().split('\n');
    saveNote(db, { title: first.slice(0, 200), body: rest.join('\n').trim() }, now);
    return 'Saved the note.';
  }
  createTask(db, { line: line.split('\n')[0].slice(0, 500) }, { now, source: 'telegram' });
  return 'Added: ' + line.split('\n')[0].replace(/^(work|life|home)\s*:\s*/i, '').slice(0, 200);
}

/** Fetch new messages once (long poll up to waitSeconds) and act on them. */
export async function pollTelegram(db, { fetcher = fetch, waitSeconds = 25, now = () => new Date() } = {}) {
  const t = readTelegram(db);
  if (!t.bot_token) return 0;
  let updates;
  try {
    updates = await call(t.bot_token, 'getUpdates', { offset: t.offset || 0, timeout: waitSeconds, allowed_updates: ['message'] }, { fetcher, timeoutMs: (waitSeconds + 10) * 1000 });
    if (t.error) writeTelegram(db, { ...readTelegram(db), error: null });
  } catch (error) {
    writeTelegram(db, { ...readTelegram(db), error: String(error.message).slice(0, 200) });
    throw error;
  }
  let handled = 0;
  for (const update of updates) {
    const current = readTelegram(db);
    writeTelegram(db, { ...current, offset: update.update_id + 1 });
    const message = update.message;
    if (!message?.chat?.id || typeof message.text !== 'string') continue;
    const chatId = message.chat.id;
    if (!current.chat_id) {
      // Linking: the code shown on Connections, alone or after /start.
      const code = message.text.trim().replace(/^\/start\s*/i, '').toUpperCase();
      if (current.link_code && code === current.link_code && message.chat.type === 'private') {
        writeTelegram(db, { ...readTelegram(db), chat_id: chatId, chat_name: message.from?.first_name || message.chat.username || 'you', link_code: null, linked_at: now().toISOString() });
        await call(current.bot_token, 'sendMessage', { chat_id: chatId, text: 'Linked to Mythic.\n\n' + HELP }, { fetcher }).catch(() => {});
        handled += 1;
      }
      continue;
    }
    if (chatId !== current.chat_id) continue;
    let answer;
    try { answer = handleMessage(db, message.text, now()); } catch (error) { answer = 'That did not work: ' + error.message; }
    if (answer) await call(current.bot_token, 'sendMessage', { chat_id: chatId, text: answer, reply_to_message_id: message.message_id }, { fetcher }).catch(() => {});
    handled += 1;
  }
  return handled;
}

export function ensureReminders(db) {
  db.exec('CREATE TABLE IF NOT EXISTS reminders_sent (reminder_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, sent_at TEXT NOT NULL)');
}

/** The reminders due now that have not gone out yet. */
export function dueReminders(db, now = new Date()) {
  ensureReminders(db);
  const sent = db.prepare('SELECT 1 FROM reminders_sent WHERE reminder_id = ?');
  return Object.values(readTasks(db).tasks_by_id)
    .filter(task => isOpen(task) && task.reminder?.id && Number.isFinite(Date.parse(task.reminder.at)) && Date.parse(task.reminder.at) <= now.getTime())
    .filter(task => !sent.get(task.reminder.id));
}

/** Send what is due. A stale one is marked as handled without being sent. */
export async function sendDueReminders(db, { fetcher = fetch, now = new Date() } = {}) {
  const t = readTelegram(db);
  if (!t.bot_token || !t.chat_id) return 0;
  ensureReminders(db);
  const mark = db.prepare('INSERT OR IGNORE INTO reminders_sent (reminder_id, task_id, sent_at) VALUES (?, ?, ?)');
  let sent = 0;
  for (const task of dueReminders(db, now)) {
    if (now.getTime() - Date.parse(task.reminder.at) <= STALE_MS) {
      const when = task.due_at ? ' (' + wallTime(new Date(task.due_at)) + ')' : '';
      await sendTelegram(db, 'Reminder: ' + task.title + when, { fetcher });
      sent += 1;
    }
    mark.run(task.reminder.id, task.id, now.toISOString());
  }
  return sent;
}
