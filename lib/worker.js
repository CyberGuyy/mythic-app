// The background work, started once with the server (instrumentation.js):
// fetch calendar feeds every quarter hour, send due reminders every minute,
// and long-poll Telegram while a bot is connected. Each loop catches its own
// errors, so one failing connector never stops the others.
import { getDb } from './db.js';
import { applyProfile } from './profile.js';
import { refreshStaleFeeds } from './connectors/calendar.js';
import { pollTelegram, sendDueReminders, readTelegram } from './connectors/telegram.js';

const MINUTE = 60000;
let started = false;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function every(ms, task) {
  const run = () => Promise.resolve().then(task).catch(error => console.error('[mythic worker]', error?.message || error));
  setTimeout(run, 5000);
  return setInterval(run, ms);
}

async function telegramLoop() {
  for (;;) {
    const db = getDb();
    if (!readTelegram(db).bot_token) { await sleep(15000); continue; }
    try {
      applyProfile(db);
      await pollTelegram(db);
    } catch {
      // the error is on the Connections page; back off a little
      await sleep(30000);
    }
  }
}

export function startWorker() {
  if (started) return;
  started = true;
  every(15 * MINUTE, () => { const db = getDb(); applyProfile(db); return refreshStaleFeeds(db); });
  every(MINUTE, () => { const db = getDb(); applyProfile(db); return sendDueReminders(db); });
  telegramLoop();
  console.log('[mythic worker] calendars, reminders and Telegram are running');
}
