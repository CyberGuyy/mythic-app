import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from '../db.js';
import { readTasks } from '../tasks/store.js';
import { listNotes } from '../notes.js';
import { createTask } from '../tasks/actions.js';
import { connectTelegram, telegramStatus, pollTelegram, sendDueReminders, handleMessage, readTelegram } from './telegram.js';

const TOKEN = '123456789:AAHfakefakefakefakefakefakefakefake1';

/** A fake Telegram: answers getMe, hands out queued updates once, records what was sent. */
function fakeTelegram(updates = []) {
  const sent = [];
  const queue = [...updates];
  const fetcher = async (url, options) => {
    const method = url.split('/').pop();
    const body = JSON.parse(options.body || '{}');
    let result;
    if (method === 'getMe') result = { id: 1, username: 'my_mythic_bot' };
    else if (method === 'getUpdates') result = queue.splice(0).filter(update => update.update_id >= (body.offset || 0));
    else if (method === 'sendMessage') { sent.push(body); result = { message_id: sent.length }; }
    return { ok: true, status: 200, json: async () => ({ ok: true, result }) };
  };
  return { fetcher, sent, push: update => queue.push(update) };
}

const message = (id, text, chat = 42, type = 'private') => ({ update_id: id, message: { message_id: id, text, chat: { id: chat, type }, from: { first_name: 'Sam' } } });

test('a bad token is refused before Telegram is asked', async () => {
  await assert.rejects(connectTelegram(memoryDb(), 'nope', { fetcher: fakeTelegram().fetcher }), /bot token/);
});

test('connecting, linking with the code, then capturing a task and a note', async () => {
  const db = memoryDb();
  const tg = fakeTelegram();
  const status = await connectTelegram(db, TOKEN, { fetcher: tg.fetcher });
  assert.deepEqual([status.on, status.bot, status.linked], [true, 'my_mythic_bot', false]);
  const code = status.code;

  // a stranger and a wrong code are ignored; the right code links the chat
  tg.push(message(1, 'hello', 7));
  tg.push(message(2, '/start WRONG'));
  tg.push(message(3, '/start ' + code));
  await pollTelegram(db, { fetcher: tg.fetcher, waitSeconds: 0 });
  assert.equal(telegramStatus(db).linked, true);
  assert.equal(readTelegram(db).chat_id, 42);
  assert.equal(readTelegram(db).offset, 4);

  // the linked chat captures; another chat is ignored
  tg.push(message(4, 'home: water the plants'));
  tg.push(message(5, 'note: Gift ideas\nA book'));
  tg.push(message(6, 'buy milk', 99));
  await pollTelegram(db, { fetcher: tg.fetcher, waitSeconds: 0 });
  const titles = Object.values(readTasks(db).tasks_by_id).map(task => [task.title, task.section]);
  assert.deepEqual(titles, [['water the plants', 'home']]);
  assert.deepEqual(listNotes(db).notes.map(note => [note.title, note.body]), [['Gift ideas', 'A book']]);
  assert.match(tg.sent.at(-2).text, /^Added: water the plants/);
});

test('/today lists what is due', () => {
  const db = memoryDb();
  assert.equal(handleMessage(db, '/today'), 'Nothing due today.');
  createTask(db, { title: 'Pay rent', due_day: new Date().toISOString().slice(0, 10), due_time: '23:59' });
  assert.match(handleMessage(db, '/today'), /Pay rent/);
});

test('a due reminder goes out once; a stale one is dropped without sending', async () => {
  const db = memoryDb();
  const tg = fakeTelegram();
  await connectTelegram(db, TOKEN, { fetcher: tg.fetcher });
  tg.push(message(1, readTelegram(db).link_code));
  await pollTelegram(db, { fetcher: tg.fetcher, waitSeconds: 0 });
  const before = tg.sent.length;

  const now = new Date();
  const inAMinute = new Date(now.getTime() + 60000);
  createTask(db, { title: 'Call the bank', due_at: inAMinute.toISOString(), remind: true }, { now });
  createTask(db, { title: 'Old one', due_at: new Date(now.getTime() - 2 * 86400000).toISOString(), remind: true }, { now: new Date(now.getTime() - 3 * 86400000) });

  assert.equal(await sendDueReminders(db, { fetcher: tg.fetcher, now }), 0, 'the old one is stale, the new one not due yet');
  const later = new Date(now.getTime() + 2 * 60000);
  assert.equal(await sendDueReminders(db, { fetcher: tg.fetcher, now: later }), 1);
  assert.equal(await sendDueReminders(db, { fetcher: tg.fetcher, now: later }), 0, 'never twice');
  assert.equal(tg.sent.length, before + 1);
  assert.match(tg.sent.at(-1).text, /^Reminder: Call the bank/);
});
