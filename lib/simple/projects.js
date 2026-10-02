// Projects: a short list you group tasks under. The rows live in SQLite;
// the tasks keep pointing at them through project_id in the planning state.
// Status is never stored: it is read off the open tasks every time.
import { randomUUID } from 'node:crypto';
import { Tasks } from '../planning-models.js';
import { SECTIONS, isOpen } from '../task-list.js';
import { localToday } from '../day.js';
import { dueGroupOf } from './tasks-view.js';
import { numberWord } from './format.js';

export const DOMAINS = SECTIONS;
export const DOMAIN_LABELS = { work: 'Work', life: 'Life', home: 'Home' };
export const DOMAIN_PHRASE = { work: 'at work', life: 'in life', home: 'at home' };
export const WEEKLY_UNITS = ['tasks', 'hours'];
export const QUIET_DAYS = 3;
const iso = value => (value instanceof Date ? value : new Date(value || Date.now())).toISOString();

export function ensureProjects(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, domain TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', next_step TEXT NOT NULL DEFAULT '', weekly_target INTEGER, weekly_unit TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT);
  `);
  // A table made before v3 gains the column; every existing row reads as an
  // empty next step, which the page shows as "Add a next step."
  const columns = db.prepare('PRAGMA table_info(projects)').all().map(column => column.name);
  if (!columns.includes('next_step')) db.exec("ALTER TABLE projects ADD COLUMN next_step TEXT NOT NULL DEFAULT ''");
  // The Dash year line flags a project's deadline: a local day or nothing.
  if (!columns.includes('deadline')) db.exec('ALTER TABLE projects ADD COLUMN deadline TEXT');
}

function cleanName(value) {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!name) throw new Error('Give the project a name.');
  return name.slice(0, 120);
}
function cleanDomain(value) {
  if (!DOMAINS.includes(value)) throw new Error('Choose work, life or home.');
  return value;
}
const cleanNote = value => String(value ?? '').trim().slice(0, 500);
function cleanDeadline(value) {
  if (value === null || value === '') return null;
  const day = String(value).trim();
  const date = new Date(day + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) throw new Error('Use a YYYY-MM-DD day for the deadline.');
  return day;
}
function cleanTarget(target, unit) {
  if (target === null || target === undefined || target === '') return { target: null, unit: null };
  const number = Number(target);
  if (!Number.isInteger(number) || number < 1 || number > 999) throw new Error('The weekly target is a whole number from 1 to 999.');
  if (!WEEKLY_UNITS.includes(unit)) throw new Error('Count the target in tasks or hours.');
  return { target: number, unit };
}

export function addProject(db, { name, domain, note = '', weekly_target: target = null, weekly_unit: unit = 'tasks', deadline = null, now } = {}) {
  const id = randomUUID(), at = iso(now), weekly = cleanTarget(target, unit);
  // The add action of /api/projects passes the deadline too; keep it rather than drop it.
  const day = deadline === undefined ? null : cleanDeadline(deadline);
  db.prepare('INSERT INTO projects (id, name, domain, note, weekly_target, weekly_unit, deadline, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, cleanName(name), cleanDomain(domain), cleanNote(note), weekly.target, weekly.unit, day, at, at);
  return id;
}

export function updateProject(db, id, { name, domain, note, next_step: nextStep, weekly_target: target, weekly_unit: unit, deadline, now } = {}) {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!row) throw new Error('Project not found.');
  const weekly = target === undefined ? { target: row.weekly_target, unit: row.weekly_unit } : cleanTarget(target, unit ?? row.weekly_unit ?? 'tasks');
  db.prepare('UPDATE projects SET name = ?, domain = ?, note = ?, next_step = ?, weekly_target = ?, weekly_unit = ?, deadline = ?, updated_at = ? WHERE id = ?').run(
    name === undefined ? row.name : cleanName(name),
    domain === undefined ? row.domain : cleanDomain(domain),
    note === undefined ? row.note : cleanNote(note),
    nextStep === undefined ? row.next_step : cleanNote(nextStep),
    weekly.target, weekly.unit,
    deadline === undefined ? row.deadline ?? null : cleanDeadline(deadline),
    iso(now), id);
}

/** Delete on the page is an archive in the table: the row stays, the list
 *  forgets it, and detachProjectTasks frees its tasks. Nothing is lost. */
export function deleteProject(db, id, now) {
  const done = db.prepare('UPDATE projects SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL').run(iso(now), iso(now), id);
  if (!done.changes) throw new Error('Project not found.');
}

const shape = row => ({ id: row.id, name: row.name, domain: row.domain, note: row.note, next_step: row.next_step ?? '', weekly_target: row.weekly_target ?? null, weekly_unit: row.weekly_unit ?? null, deadline: row.deadline ?? null, created_at: row.created_at, updated_at: row.updated_at });

export function listProjects(db) {
  return db.prepare('SELECT * FROM projects WHERE archived_at IS NULL').all().map(shape).sort((a, b) => a.name.localeCompare(b.name));
}
export const projectOptions = db => listProjects(db).map(project => ({ id: project.id, name: project.name }));
export const projectNames = db => Object.fromEntries(listProjects(db).map(project => [project.id, project.name]));

export function detachProjectTasks(state, projectId) {
  let next = state;
  for (const task of Object.values(state?.tasks_by_id || {})) {
    if (task.project_id === projectId) next = Tasks.updateTask(next, task.id, { project_id: null });
  }
  return next;
}

const daysBetween = (fromDay, toDay) => Math.round((Date.parse(toDay + 'T12:00:00Z') - Date.parse(fromDay + 'T12:00:00Z')) / 86400000);
const order = (a, b) => (b.is_priority ? 1 : 0) - (a.is_priority ? 1 : 0) || String(a.due_at || '9').localeCompare(String(b.due_at || '9')) || String(a.created_at).localeCompare(String(b.created_at));
const changedAt = task => String(task.updated_at || task.created_at);

/** OVERDUE beats DUE TODAY beats QUIET beats ON TRACK. Quiet counts local
 *  days since any open task of the project last changed, and for a project
 *  with no open tasks, since the project row itself last changed. */
export function projectStatus(project, tasks, { now = new Date() } = {}) {
  const today = localToday(now);
  const open = tasks.filter(task => isOpen(task) && task.project_id === project.id).sort(order);
  const groups = open.map(task => dueGroupOf(task, today));
  const last = open.length
    ? open.reduce((latest, task) => (changedAt(task) > latest ? changedAt(task) : latest), changedAt(open[0]))
    : String(project.updated_at || project.created_at || now.toISOString());
  const quietDays = Math.max(0, daysBetween(localToday(new Date(last)), today));
  const activity = quietDays === 0 ? 'Active today' : 'Quiet ' + quietDays + ' day' + (quietDays === 1 ? '' : 's');
  const base = { open: open.length, quiet_days: quietDays, activity, next: open[0]?.title || null };
  if (groups.includes('overdue')) return { ...base, key: 'overdue', label: 'Overdue', pill: 'pill-coral' };
  if (groups.includes('today')) return { ...base, key: 'due_today', label: 'Due today', pill: 'pill-honey' };
  if (quietDays >= QUIET_DAYS) return { ...base, key: 'quiet', label: 'Quiet ' + quietDays + ' days', pill: 'pill-quiet' };
  return { ...base, key: 'on_track', label: 'On track', pill: 'pill-mint' };
}

const capitalise = text => text.charAt(0).toUpperCase() + text.slice(1);
function summaryLine(domains) {
  const parts = domains.filter(domain => domain.projects.length).map(domain => numberWord(domain.projects.length) + ' ' + DOMAIN_PHRASE[domain.domain]);
  if (!parts.length) return 'No projects yet. Add one and give its tasks a home.';
  const quiet = domains.flatMap(domain => domain.projects).filter(project => project.key === 'quiet').map(project => project.name);
  const tail = quiet.length === 0 ? '' : quiet.length === 1 ? ' ' + quiet[0] + ' has gone quiet.' : ' ' + quiet.slice(0, -1).join(', ') + ' and ' + quiet.at(-1) + ' have gone quiet.';
  return capitalise(parts.join(', ')) + '.' + tail;
}

export function projectsView(state, db, { now = new Date() } = {}) {
  const tasks = Object.values(state?.tasks_by_id || {});
  const projects = listProjects(db).map(project => { const status = projectStatus(project, tasks, { now }); return { ...project, ...status, next: project.next_step || status.next }; });
  const domains = DOMAINS.map(domain => ({
    domain, label: DOMAIN_LABELS[domain],
    open: tasks.filter(task => isOpen(task) && (task.section || 'work') === domain).length,
    projects: projects.filter(project => project.domain === domain),
  }));
  return {
    counts: { projects: projects.length, due_today: projects.filter(project => project.key === 'due_today').length, overdue: projects.filter(project => project.key === 'overdue').length },
    summary: summaryLine(domains),
    domains,
  };
}
