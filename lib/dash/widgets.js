// The Dash widget registry: the only place that knows the list of widgets.
// Adding a widget is one entry here, one component in
// components/dash/widgets/index.js and one stylesheet in app/dash/widgets/.
//
//   id         the key, also the layout item id
//   name       shown in customise mode and in the drawer
//   icon       a key of ICONS in components/dash/icons.js
//   jp         the Japanese subtitle Yoru shows beside the heading (flair.jp)
//   zones      the zones it may live in, the first is where it goes by default
//   span       right zone only: 'main' (column 1), 'side' (column 2) or 'full'
//   band       top zone only: a full-width row (header, year line); every other
//              top widget is a column of the plate
//   plateWidth the plate column width when it sits in the plate
//   pinLast    always the last widget of its zone (the calendar)
//   required   cannot be removed; restored if a saved layout drops it
//   load       server loader: async ({ db, state, now, today, options }) => data.
//              data must be plain JSON. state is the planning state, or null if
//              the planning file could not be read. Throw to show the error card.
//   component  the key in components/dash/widgets/index.js
//
// This module runs on the server only (loaders reach SQLite). Client code gets
// the plain metadata from widgetMeta(), passed down by app/dash/page.js.

import { loadHeader } from './header.js';
import { loadYearline } from './yearline.js';
import { loadTasks } from './tasks.js';
import { flowerView } from './flower.js';
import { habitsView } from './habits.js';
import { loadToday } from './today.js';
import { loadNotes } from '../notes.js';

export const WIDGETS = {
  header: { id: 'header', name: 'Header', icon: 'day', jp: '今日', zones: ['top'], span: 'full', band: true, required: false, load: loadHeader, component: 'Header' },
  flower: { id: 'flower', name: 'Flower', icon: 'flower', jp: '開花', zones: ['top'], span: 'full', plateWidth: 'minmax(0, 1fr)', required: false, load: async ({ db, today }) => flowerView(db, today), component: 'Flower' },
  habits: { id: 'habits', name: 'Habits', icon: 'habits', jp: '習慣', zones: ['top', 'right'], span: 'side', plateWidth: '400px', required: false, load: async ({ db, state, today }) => habitsView(db, state, today), component: 'Habits' },
  yearline: { id: 'yearline', name: 'Year line', icon: 'flag', jp: '一年', zones: ['top'], span: 'full', band: true, required: false, load: loadYearline, component: 'YearLine' },
  tasks: { id: 'tasks', name: 'Tasks', icon: 'tasks', jp: 'タスク', zones: ['right'], span: 'main', required: true, load: loadTasks, component: 'Tasks' },
  today: { id: 'today', name: 'Today', icon: 'day', jp: '今日', zones: ['right', 'left'], span: 'side', required: false, load: loadToday, component: 'Today' },
  notes: { id: 'notes', name: 'Notes', icon: 'notes', jp: 'メモ', zones: ['right', 'left'], span: 'side', required: false, load: loadNotes, component: 'Notes' },
  vision: { id: 'vision', name: 'Vision', icon: 'vision', jp: '展望', zones: ['left', 'right'], span: 'side', required: false, load: async ({ db }) => { const { ensureVision, visionView } = await import('./vision.js'); ensureVision(db); return visionView(db); }, component: 'Vision' },
  sleep: { id: 'sleep', name: 'Sleep', icon: 'moon', jp: '睡眠', zones: ['left', 'right'], span: 'side', required: false, load: async context => (await import('./sleep.js')).loadSleep(context), component: 'Sleep' },
  calendar: { id: 'calendar', name: 'Calendar', icon: 'calendar', jp: '暦', zones: ['right'], span: 'full', pinLast: true, required: false, load: async context => (await import('./calendar.js')).loadCalendar(context), component: 'Calendar' },
};

const META_KEYS = ['id', 'name', 'icon', 'jp', 'zones', 'span', 'band', 'plateWidth', 'pinLast', 'required', 'component'];

/** The registry without loaders: plain data a client component can hold. */
export function widgetMeta(widgets = WIDGETS) {
  return Object.fromEntries(Object.values(widgets).map(widget => [widget.id,
    Object.fromEntries(META_KEYS.filter(key => widget[key] !== undefined).map(key => [key, widget[key]]))]));
}

/** Run the loader of every widget in the layout at once. One failing loader
 *  becomes { ok: false, error } for that widget only; the rest still load. */
export async function loadWidgets(layout, context, widgets = WIDGETS) {
  const items = ['top', 'left', 'right'].flatMap(zone => layout[zone] || []);
  const results = await Promise.allSettled(items.map(item => {
    const widget = widgets[item.id];
    if (!widget) return Promise.reject(new Error('Unknown widget.'));
    return Promise.resolve().then(() => widget.load({ ...context, options: item.options || {} }));
  }));
  return Object.fromEntries(items.map((item, index) => {
    const result = results[index];
    return [item.id, result.status === 'fulfilled'
      ? { ok: true, value: result.value ?? null }
      : { ok: false, error: result.reason?.message || 'This widget could not load.' }];
  }));
}
