'use client';
// The Dash tasks widget. A row of project buttons sits over the list; picking
// one slides its open tasks to the top by urgent > doing > to do, then the add
// line, then Other tasks, and puts its name and this week's effort in the
// heading. All restores the groups: Urgent, To do, Doing, then Done
// collapsed. Cmd 1 to 5 toggles the projects. Play and stop (TaskClock) keep
// a run's time in a ring and its tooltip.
// Everything comes from one load (lib/dash/tasks.js), so picking never
// refetches; a change posts to /api/tasks and refreshes. Enter on the add
// line opens the composer with the typed title and the picked project, a
// click on a title opens that task, and a double click renames it in place.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PanelTitle from '../PanelTitle.jsx';
import TaskClock from './TaskClock.jsx';
import { Icon } from '../icons.js';
import post from '../post.js';
import { openComposer } from '../composer/store.js';
import { ESTIMATE_CHOICES, formatEstimate, formatHours } from '@/lib/dash/estimate.js';

const CAT = { work: 'Work', life: 'Life', home: 'Home' };
const STATUS = { urgent: ['Urgent', 'var(--hot)'], doing: ['Doing', 'var(--work)'], todo: ['To do', 'var(--mute)'] };
const GROUPS = [['urgent', 'Urgent', 'var(--hot)'], ['todo', 'To do', 'var(--txt)'], ['doing', 'Doing', 'var(--work)']];
const PREFIX = /^(work|life|home)\s*:\s*(.*)$/i;
const EMPTY = new Set();
const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
// Cmd 1 to 5 is for the page, not for a field you are typing in.
const typing = target => typeof Element !== 'undefined' && target instanceof Element && !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
// Nor while a composer is open over the page.
const composerOpen = () => typeof document !== 'undefined' && !!document.querySelector('.cmp-layer');
// Enter while an input method is composing picks a character, not the line.
const composing = event => event.nativeEvent?.isComposing || event.keyCode === 229;

/** Ids hidden or sliding out until the next load arrives: tied to the data
 *  they were set against, so fresh data clears them without an effect. */
function useMarks(data) {
  const [marks, setMarks] = useState({ data, ids: EMPTY });
  const ids = marks.data === data ? marks.ids : EMPTY;
  const change = (id, on) => setMarks(current => {
    const next = new Set(current.data === data ? current.ids : EMPTY);
    if (on) next.add(id); else next.delete(id);
    return { data, ids: next };
  });
  return [ids, change];
}

/** Titles and estimates shown before the refresh brings them back, tied to the
 *  data they were set against like the marks above. */
function usePatches(data) {
  const [patches, setPatches] = useState({ data, map: {} });
  const map = patches.data === data ? patches.map : {};
  const change = (id, patch) => setPatches(current => {
    const next = { ...(current.data === data ? current.map : {}) };
    if (patch) next[id] = { ...next[id], ...patch }; else delete next[id];
    return { data, map: next };
  });
  return [map, change];
}

function WeekBar({ project }) {
  const week = project.week || {};
  const planned = week.minutes_planned || 0;
  const ratio = planned ? Math.min(1, (week.minutes_done || 0) / planned) : 0;
  const tip = formatEstimate(week.minutes_done || 0) + ' of estimates finished this week'
    + (planned ? ', ' + formatEstimate(planned) + ' planned' : '') + '. Effort, not completion.';
  return <span className="wkw" title={tip}>
    <span className="wkl"><span>This week</span><b>~{formatHours(week.hours_done)}{planned > 0 && <small>/{formatHours(week.hours_planned)}</small>}</b></span>
    <span className="wkt"><i className={ratio >= 1 ? 'full' : ''} style={{ transform: `scaleX(${ratio.toFixed(3)})` }} /></span>
  </span>;
}

export default function Tasks({ data, flair, meta }) {
  const router = useRouter();
  const projects = data?.projects || [];
  const groups = data?.groups || { urgent: [], todo: [], doing: [], done: [] };

  const [sel, setSel] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [addLine, setAddLine] = useState('');
  const [error, setError] = useState('');
  const [leaving, markLeaving] = useMarks(data);
  const [gone, markGone] = useMarks(data);
  const [patched, patch] = usePatches(data);

  const picked = projects.find(project => project.id === sel) || null;
  // A project just made with + is picked once the refresh brings it in.
  const pickedId = picked ? sel : null;

  // FLIP: measure every keyed child of the list, re-render, then slide each
  // from where it was (440 ms, the page ease) and fade the new ones in. Fresh
  // data (an add, a capture, an accepted suggestion) slides the same way, from
  // where the rows last settled. offsetTop ignores running transforms, so a
  // measure taken mid-slide is still the row's real place.
  const listRef = useRef(null);
  const snapshot = useRef(null);
  const settled = useRef({ data, spots: null });
  const clickTimer = useRef(null);
  const measure = () => new Map([...(listRef.current?.querySelectorAll(':scope > [data-key]') || [])].map(node => [node.dataset.key, node.offsetTop]));
  const flip = update => { snapshot.current = measure(); update(); };
  useLayoutEffect(() => {
    let before = snapshot.current;
    snapshot.current = null;
    if (!before && settled.current.data !== data) before = settled.current.spots;
    settled.current = { data, spots: measure() };
    if (!before || !listRef.current || still()) return;
    for (const node of listRef.current.querySelectorAll(':scope > [data-key]')) {
      const old = before.get(node.dataset.key);
      if (old == null) { node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' }); continue; }
      const dy = old - node.offsetTop;
      if (Math.abs(dy) <= 1) continue;
      node.classList.add('mv');
      const done = () => node.classList.remove('mv');
      node.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 440, easing: 'cubic-bezier(.16, 1, .3, 1)' }).finished.then(done, done);
    }
  });

  // Picking a project swaps the list at once: another project's rows are not
  // the same rows moving, so they do not slide.
  const pick = id => { setSel(id); setRenaming(null); setError(''); };

  // Cmd 1 to 5 toggles a project; the picked one again returns to All.
  useEffect(() => {
    const onKey = event => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey || event.key < '1' || event.key > '5' || event.key.length !== 1) return;
      if (event.defaultPrevented || typing(event.target) || composerOpen()) return;
      const project = projects[Number(event.key) - 1];
      if (!project) return;
      event.preventDefault();
      pick(pickedId === project.id ? null : project.id);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  async function run(call) {
    setError('');
    try { await call(); router.refresh(); return true; }
    catch (failure) { setError(failure.message); return false; }
  }

  function tick(row) {
    if (leaving.has(row.id)) return;
    markLeaving(row.id, true);
    setTimeout(async () => {
      flip(() => markGone(row.id, true));
      const ok = await run(() => post('/api/tasks', { action: 'toggle', id: row.id }));
      if (!ok) { markGone(row.id, false); markLeaving(row.id, false); }
    }, still() ? 0 : 400);
  }

  // The typed line (a work:/life:/home: prefix picks the area, else the
  // picked project's) opens the task composer; the line clears once it saves.
  function add() {
    const line = addLine.trim();
    const prefix = line.match(PREFIX);
    const section = prefix ? prefix[1].toLowerCase() : picked?.domain || 'work';
    openComposer({
      kind: 'task', prefill: { title: prefix ? prefix[2].trim() : line, section, project_id: pickedId || null },
      onSaved: () => setAddLine(''),
    });
  }
  const edit = row => openComposer({ kind: 'task', record: row });
  // One click opens the task; a double click renames it in place instead.
  function titleClick(event, row) {
    clearTimeout(clickTimer.current);
    if (event.detail > 1) return;
    clickTimer.current = setTimeout(() => edit(row), 230);
  }
  function titleDouble(row) {
    clearTimeout(clickTimer.current);
    startRename(row);
  }

  function startRename(row) { setRenaming(row.id); setTitleDraft(row.title); }
  // Enter saves; an empty title is refused and the field stays open.
  async function saveRename(row) {
    const title = titleDraft.trim();
    if (!title) return;
    setRenaming(null);
    if (title === row.title) return;
    patch(row.id, { title });
    const ok = await run(() => post('/api/tasks', { action: 'rename', id: row.id, title }));
    if (!ok) patch(row.id, null);
  }

  async function estimate(row, value) {
    const minutes = value === '' ? null : Number(value);
    patch(row.id, { estimate_minutes: minutes });
    const ok = await run(() => post('/api/tasks', { action: 'estimate', id: row.id, estimate_minutes: minutes }));
    if (!ok) patch(row.id, null);
  }

  const newProject = () => openComposer({
    kind: 'project', prefill: { domain: picked?.domain || 'work' },
    onSaved: result => { if (result?.id) flip(() => setSel(result.id)); },
  });
  const editProject = () => picked && openComposer({
    kind: 'project', record: picked,
    onSaved: result => { if (result?.deleted) pick(null); },
  });

  // ---- the list plan: keyed items in order ----
  const shown = row => !gone.has(row.id);
  const open = ['urgent', 'doing', 'todo'].flatMap(key => groups[key] || []).filter(shown);
  const items = [];
  if (!pickedId) {
    for (const [key, label, colour] of GROUPS) {
      const rows = (groups[key] || []).filter(shown);
      if (!rows.length) continue;
      items.push({ key: 'g-' + key, group: { label, colour, n: rows.length } });
      for (const row of rows) items.push({ key: 't' + row.id, row });
    }
    if (!open.length) items.push({ key: 'empty', empty: 'Nothing open. Write the next task below.' });
    items.push({ key: 'add', add: true });
  } else {
    const mine = open.filter(row => row.project_id === pickedId);
    const rest = open.filter(row => row.project_id !== pickedId);
    for (const row of mine) items.push({ key: 't' + row.id, row });
    if (!mine.length) items.push({ key: 'empty', empty: 'No open tasks in this project yet.' });
    items.push({ key: 'add', add: true });
    if (rest.length) {
      items.push({ key: 'g-other', group: { label: 'Other tasks', colour: 'var(--mute)', n: rest.length } });
      for (const row of rest) items.push({ key: 't' + row.id, row });
    }
  }
  const done = (groups.done || []).filter(shown);
  if (done.length) {
    items.push({ key: 'g-done', group: { label: 'Done', colour: 'var(--life)', n: done.length, open: showDone, toggle: 'done' } });
    if (showDone) for (const row of done) items.push({ key: 't' + row.id, row });
  }

  const tag = row => {
    if (pickedId && row.project_id === pickedId && STATUS[row.kind]) {
      const [word, colour] = STATUS[row.kind];
      return <span className="tst" style={{ '--c': colour }}>{word}</span>;
    }
    return row.project_name ? <span className="tpj">{row.project_name}</span> : null;
  };

  const renderRow = base => {
    const row = patched[base.id] ? { ...base, ...patched[base.id] } : base;
    const isDone = row.kind === 'done';
    const classes = ['row', isDone && 'done', leaving.has(row.id) && 'bye'].filter(Boolean).join(' ');
    const section = CAT[row.section] ? row.section : 'work';
    return <div key={'t' + row.id} className={classes} data-key={'t' + row.id}>
      <button type="button" className="tk" aria-label={isDone ? 'Restore ' + row.title : 'Mark ' + row.title + ' done'} title={isDone ? 'Restore' : 'Mark done'} onClick={() => tick(row)}>
        <Icon name="check" size={14} stroke={2.6} />
      </button>
      <div className="tsk-main">
        {renaming === row.id
          ? <input className="tsk-rename" value={titleDraft} aria-label="Task title" autoComplete="off" autoFocus
              onChange={event => setTitleDraft(event.target.value)}
              aria-invalid={!titleDraft.trim()}
              onKeyDown={event => { if (event.key === 'Enter' && !composing(event)) saveRename(row); if (event.key === 'Escape') setRenaming(null); }}
              onBlur={() => setRenaming(null)} />
          : isDone
            ? <p>{row.title}</p>
            : <p className="tsk-open" role="button" tabIndex={0} title="Open the task" onClick={event => titleClick(event, row)} onDoubleClick={() => titleDouble(row)}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); edit(row); } }}>{row.title}</p>}
        {!isDone && <div className="meta">
          <span className="cat" style={{ '--c': `var(--${section})` }}><Icon name={section} size={14} stroke={1.8} />{CAT[section]}</span>
          {tag(row)}
        </div>}
      </div>
      {!isDone && <span className="rt">
        <TaskClock title={row.title} clock={row.clock} onPress={action => run(() => post('/api/tasks', { action, id: row.id }))} />
        <button type="button" className="tsk-pen" aria-label={'Edit ' + row.title} title="Edit" onClick={() => edit(row)}><Icon name="pen" size={13} /></button>
        <label className={'test' + (row.estimate_minutes ? '' : ' none')} title={row.estimate_minutes ? 'Estimate' : 'Add an estimate'}>
          {row.estimate_minutes ? '~' + formatEstimate(row.estimate_minutes) : 'Estimate'}
          <select aria-label={'Estimate for ' + row.title} value={row.estimate_minutes ?? ''} onChange={event => estimate(row, event.target.value)}>
            <option value="">No estimate</option>
            {!ESTIMATE_CHOICES.includes(row.estimate_minutes) && row.estimate_minutes && <option value={row.estimate_minutes}>{formatEstimate(row.estimate_minutes)}</option>}
            {ESTIMATE_CHOICES.map(minutes => <option key={minutes} value={minutes}>{formatEstimate(minutes)}</option>)}
          </select>
        </label>
        <span className={'due' + (row.due_late || row.kind === 'urgent' ? ' late' : '')}>{row.due_label}</span>
      </span>}
    </div>;
  };

  const TOGGLES = { done: setShowDone };

  const renderItem = item => {
    if (item.row) return renderRow(item.row);
    if (item.group) {
      const { label, colour, n, open: isOpen, toggle } = item.group;
      return <div key={item.key} className="grp" data-key={item.key} style={{ '--c': colour }}>
        <i />{label}<span>{n}</span>
        {toggle && <button type="button" aria-expanded={isOpen} onClick={() => flip(() => TOGGLES[toggle](value => !value))}>{isOpen ? 'Hide' : 'Show'}</button>}
      </div>;
    }
    if (item.add) {
      return <div key="add" className="addt" data-key="add">
        <Icon name="plus" size={14} />
        <input value={addLine} placeholder={pickedId ? 'Add a task to ' + (picked?.name || 'this project') : 'Add a task'} autoComplete="off"
          aria-label="Add a task" onChange={event => setAddLine(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && !composing(event)) { event.preventDefault(); add(); } if (event.key === 'Escape') { setAddLine(''); event.currentTarget.blur(); } }} />
        <button type="button" className="addt-more" aria-label="New task with details" title="New task with a day, a time and more" onClick={add}><Icon name="plus" size={15} stroke={2} /></button>
      </div>;
    }
    return <p key={item.key} className="empty tsk-empty" data-key={item.key}>{item.empty}</p>;
  };

  const openCount = pickedId ? open.filter(row => row.project_id === pickedId).length : open.length;
  const headingName = <b className="tsk-name" title={plural(openCount, 'open task')}>{picked ? picked.name : 'Tasks'}</b>;

  return <section className="panel tasks-w">
    <div className="pk" role="group" aria-label="Pick a project">
      <button type="button" className="pkb all" aria-pressed={!pickedId} onClick={() => pick(null)}>All</button>
      {projects.map((project, index) => {
        const on = project.id === pickedId;
        const bars = project.bars || { done: 0, total: 0 };
        const unit = project.weekly_unit === 'hours' ? 'h' : '';
        const count = project.target_this_week ? `${project.done_this_week}${unit}/${project.target_this_week}${unit}` : project.open + ' open';
        const tip = project.name + ': ' + (project.target_this_week
          ? `${project.done_this_week} of ${project.target_this_week} ${project.weekly_unit} this week`
          : plural(project.open, 'open task')) + (index < 5 ? ' · Cmd ' + (index + 1) : '');
        return <button key={project.id} type="button" className={'pkb' + (on ? ' on' : '')} aria-pressed={on} title={tip}
          style={{ '--c': `var(--${CAT[project.domain] ? project.domain : 'work'})` }} onClick={() => pick(on ? null : project.id)}>
          <span className="pkt"><b>{project.name}</b>{on && <span className="pkc">{count}</span>}</span>
          <span className="pkb2" aria-hidden="true">{Array.from({ length: Math.max(1, bars.total) }, (_, k) => <i key={k} className={k < bars.done ? 'y' : ''} />)}</span>
        </button>;
      })}
      <button type="button" className="pkb new" title="New project" aria-label="New project" onClick={newProject}><Icon name="plus" size={14} /></button>
    </div>

    <PanelTitle icon={meta.icon} title={<>{headingName}{picked && <WeekBar project={picked} />}</>} jp={pickedId ? null : meta.jp} flair={flair}>
      {pickedId && <button type="button" className="lk" onClick={editProject}>
        <Icon name="pen" size={12} />Edit
      </button>}
    </PanelTitle>

    <div className="tsk-lists" ref={listRef}>{items.map(renderItem)}</div>
    {error && <p className="empty tsk-error" role="alert">{error}</p>}
  </section>;
}
