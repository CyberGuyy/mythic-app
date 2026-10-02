// Onboarding: what the first-run flow (/welcome) collects, checked and saved
// in one go. Your name and timezone, a few projects, up to five habits (one
// petal each on the flower), a few first tasks and, if you have one, a
// calendar feed. Everything is optional except the timezone, and nothing is
// saved until the last step, so leaving half way changes nothing.
import { writeProfile } from './profile.js';
import { ensureProjects, addProject, listProjects } from './simple/projects.js';
import { ensureHabits, addHabit, countActiveHabits, HABIT_COUNT, TIMES_OF_DAY } from './simple/habits.js';
import { ensureHabitIcons, setHabitIcon } from './dash/flower.js';
import { HABIT_ICONS } from './dash/flower-icons.js';
import { SECTIONS } from './task-list.js';
import { createTask } from './tasks/actions.js';
import { addFeed, refreshFeed } from './connectors/calendar.js';

export const MAX_PROJECTS = 5;
export const MAX_TASKS = 5;

/** Habits people often keep, with the icon each gets, offered as chips. */
export const HABIT_IDEAS = [
  { name: '7+ hours of sleep', time_of_day: 'morning', icon: 'bed' },
  { name: 'Move for 30 minutes', time_of_day: 'afternoon', icon: 'run' },
  { name: 'Read 10 pages', time_of_day: 'evening', icon: 'book' },
  { name: 'Drink 2 litres of water', time_of_day: 'afternoon', icon: 'droplet' },
  { name: 'Meditate', time_of_day: 'morning', icon: 'lotus' },
  { name: 'Journal', time_of_day: 'evening', icon: 'journal' },
  { name: 'Stretch', time_of_day: 'morning', icon: 'stretch' },
  { name: '10,000 steps', time_of_day: 'evening', icon: 'steps' },
  { name: 'No phone in bed', time_of_day: 'evening', icon: 'phoneoff' },
  { name: 'Deep work block', time_of_day: 'morning', icon: 'timer' },
  { name: 'Practise a language', time_of_day: 'evening', icon: 'language' },
  { name: 'Eat a proper breakfast', time_of_day: 'morning', icon: 'egg' },
];

const text = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** The request, checked. Throws with a line that says what to fix. */
export function checkSetup(body) {
  const projects = (Array.isArray(body.projects) ? body.projects : []).map(project => ({
    name: text(project?.name, 120), domain: SECTIONS.includes(project?.domain) ? project.domain : 'work',
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(project?.deadline || '') ? project.deadline : null,
  })).filter(project => project.name);
  if (projects.length > MAX_PROJECTS) throw new Error(`Start with up to ${MAX_PROJECTS} projects; you can add more later.`);
  const habits = (Array.isArray(body.habits) ? body.habits : []).map(habit => ({
    name: text(habit?.name, 120), time_of_day: TIMES_OF_DAY.includes(habit?.time_of_day) ? habit.time_of_day : 'morning',
    icon: HABIT_ICONS.includes(habit?.icon) ? habit.icon : null,
  })).filter(habit => habit.name);
  if (habits.length > HABIT_COUNT) throw new Error(`Pick up to ${HABIT_COUNT} habits, one for each petal.`);
  const tasks = (Array.isArray(body.tasks) ? body.tasks : []).map(task => ({
    title: text(task?.title, 500), project: Number.isInteger(task?.project) ? task.project : null,
  })).filter(task => task.title);
  if (tasks.length > MAX_TASKS) throw new Error(`Start with up to ${MAX_TASKS} tasks.`);
  const calendar = text(body.calendar_url, 2000);
  return { name: text(body.name, 40), timezone: body.timezone, projects, habits, tasks, calendar };
}

/** Save the whole setup. Returns what was made. */
export async function completeSetup(db, body, { now = new Date(), fetcher } = {}) {
  const setup = checkSetup(body);
  ensureProjects(db);
  ensureHabits(db);
  ensureHabitIcons(db);
  let feedId = null;
  const made = db.transaction(() => {
    writeProfile(db, { name: setup.name, timezone: setup.timezone }, now);
    const existing = new Map(listProjects(db).map(project => [project.name.toLowerCase(), project.id]));
    const projectIds = setup.projects.map(project => existing.get(project.name.toLowerCase()) || addProject(db, { ...project, now }));
    const room = Math.max(0, HABIT_COUNT - countActiveHabits(db));
    const habitIds = setup.habits.slice(0, room).map(habit => {
      const id = addHabit(db, { name: habit.name, time_of_day: habit.time_of_day, now });
      if (habit.icon) setHabitIcon(db, id, habit.icon);
      return id;
    });
    const taskIds = setup.tasks.map(task => createTask(db, { line: task.title, project_id: task.project !== null ? projectIds[task.project] || null : null }, { now }));
    if (setup.calendar) feedId = addFeed(db, { name: 'Calendar', url: setup.calendar });
    writeProfile(db, { onboarded: true }, now);
    return { projects: projectIds.length, habits: habitIds.length, tasks: taskIds.length };
  })();
  // The first fetch, so the calendar shows on the first visit; a failure is
  // shown on Connections, it does not undo the setup.
  if (feedId) made.calendar = await refreshFeed(db, feedId, { now, ...(fetcher ? { fetcher } : {}) });
  return made;
}
