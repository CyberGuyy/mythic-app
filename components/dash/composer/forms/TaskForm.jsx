'use client';
// A task, new or edited: title, area, project, when (day and time), how long,
// repeat, remind, priority and detail. An edit starts from the row's own
// values and sends every editor field (update rewrites them all); Delete asks
// twice and cancels the task, which keeps the record. The event composer is
// this form with the day and time open in the form and a time required.
import { useState } from 'react';
import Composer from '../Composer.jsx';
import DeleteButton from '../DeleteButton.jsx';
import { useComposerForm } from '../useComposerForm.js';
import { openComposer } from '../store.js';
import { Field, TitleField, BodyField, Segmented, Toggle, DatePicker, TimePicker, DurationField, RepeatField, ProjectPicker } from '../fields/index.js';
import post from '../../post.js';
import { ROUTES, taskBody, taskDeleteBody, taskStart } from '@/lib/dash/composer.js';

export const AREAS = [['work', 'Work'], ['life', 'Life'], ['home', 'Home']].map(([value, label]) => ({ value, label, icon: value, color: `var(--${value})` }));

export default function TaskForm({ entry, event = false, projects = [], today, done, close, flair, active, reminders = false }) {
  const original = entry.record || null;
  const kind = event ? 'event' : 'task';
  const [start] = useState(() => taskStart(original, entry.prefill));
  // A project made from here shows before the refresh brings it back.
  const [made, setMade] = useState(null);
  const f = useComposerForm(kind, start, async form => {
    const body = taskBody(form, original);
    done({ ...(await post(ROUTES.task, body)), body });
  });
  const { form, set, errors } = f;
  const list = made && !projects.some(project => project.id === made.id) ? [...projects, made] : projects;

  // A time without a day would be stored with no due date: pick today for it.
  const setTime = time => { set('due_time')(time); if (time && !form.due_day) set('due_day')(today); };
  const newProject = () => openComposer({
    kind: 'project', prefill: { domain: form.section },
    onSaved: result => { setMade({ id: result.id, name: result.body.name, domain: result.body.domain, bars: { done: 0, total: 0 } }); set('project_id')(result.id); },
  });
  async function remove() {
    f.setBusy(true);
    try { done(await post(ROUTES.task, taskDeleteBody(original.id))); }
    catch (failure) { f.setErrors({ form: failure.message }); f.setBusy(false); }
  }

  const when = event
    ? <div className="cmp-open" data-field="due_day">
      <div><DatePicker inline value={form.due_day} onChange={day => set('due_day')(day)} today={today} clear={false} />{errors.due_day && <p className="cmp-err" role="alert">{errors.due_day}</p>}</div>
      <div data-field="due_time"><TimePicker inline value={form.due_time} onChange={set('due_time')} clear={false} />{errors.due_time && <p className="cmp-err" role="alert">{errors.due_time}</p>}</div>
    </div>
    : <Field label="When" icon="cal" id="due_day" error={errors.due_day || errors.due_time}>
      <div className="cmp-row">
        <DatePicker value={form.due_day} onChange={day => { set('due_day')(day); if (!day) set('due_time')(null); }} today={today} label="Day" invalid={!!errors.due_day} />
        <TimePicker value={form.due_time} onChange={setTime} label="Time" invalid={!!errors.due_time} />
      </div>
    </Field>;

  return <Composer kind={kind} editing={!!original} flair={flair} active={active} dirty={f.dirty} busy={f.busy} error={errors.form}
    onSave={f.save} onClose={close} aside={original && <DeleteButton busy={f.busy} onDelete={remove} />}>
    <TitleField value={form.title} onChange={set('title')} placeholder={event ? 'What is on' : 'What needs doing'} error={errors.title} maxLength={500} />
    {event && when}
    <Field label="Area" icon="grid" id="section" error={errors.section}>
      <Segmented value={form.section} options={AREAS} onChange={set('section')} labelledBy="section-label" />
    </Field>
    <Field label="Project" icon="flag" id="project_id" error={errors.project_id}>
      <ProjectPicker value={form.project_id} projects={list} onChange={set('project_id')} onNew={newProject} labelledBy="project_id-label" />
    </Field>
    {!event && when}
    <Field label="Length" icon="clock" id="estimate_minutes" error={errors.estimate_minutes}>
      <DurationField value={form.estimate_minutes} onChange={set('estimate_minutes')} labelledBy="estimate_minutes-label" invalid={!!errors.estimate_minutes} />
    </Field>
    <Field label="Repeat" icon="habits" id="repeat" error={errors.repeat}>
      <RepeatField value={form.repeat} onChange={set('repeat')} labelledBy="repeat-label" />
    </Field>
    <div className="cmp-toggles">
      {(reminders || form.remind) && <Toggle checked={form.remind} onChange={set('remind')} label="Remind me" icon="bell" />}
      {!event && <Toggle checked={form.is_priority} onChange={set('is_priority')} label="Priority" icon="flame" />}
    </div>
    {!event && <div data-field="detail"><BodyField value={form.detail} onChange={set('detail')} placeholder="Add detail" label="Detail" minRows={2} maxLength={4000} /></div>}
  </Composer>;
}
