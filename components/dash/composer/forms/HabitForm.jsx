'use client';
// A habit: its name, the time of day it belongs to, and its line icon. New,
// or an edit of entry.record. You keep exactly five habits (HABIT_COUNT in
// lib/simple/habits.js), so on an edit "Delete" turns the form into a
// replace: the fields clear, and Save deletes the old habit with its ticks
// and puts the new one in its place. With more than five (older data) Delete
// is a plain two-step delete. The habit goes to /api/habits; a chosen
// icon then goes to the flower route (no icon: the flower picks one from the
// name).
import { useState } from 'react';
import Composer from '../Composer.jsx';
import DeleteButton from '../DeleteButton.jsx';
import { useComposerForm } from '../useComposerForm.js';
import { Field, TitleField, Segmented, IconGrid } from '../fields/index.js';
import post from '../../post.js';
import { ROUTES, habitBody, habitIconBody, habitStart } from '@/lib/dash/composer.js';
import { HABIT_ICON_GROUPS } from '@/lib/dash/flower-icons.js';

const TIMES = [{ value: 'morning', label: 'Morning', icon: 'sunrise' }, { value: 'afternoon', label: 'Afternoon', icon: 'day' }, { value: 'evening', label: 'Evening', icon: 'moon' }];

export default function HabitForm({ entry, done, close, flair, active }) {
  const original = entry.record || null;
  const limit = entry.prefill?.limit ?? 5;
  const surplus = (entry.prefill?.count ?? limit) > limit;
  const [start] = useState(() => habitStart(entry.prefill, original));
  const [replacing, setReplacing] = useState(false);
  const f = useComposerForm('habit', start, async form => {
    const result = await post(ROUTES.habit, habitBody(form, original, replacing));
    const id = result.id || original.id;
    const iconMoved = original && !replacing ? form.icon !== start.icon : !!form.icon;
    if (iconMoved) await post('/api/flower', habitIconBody(id, form.icon));
    done(result);
  });
  const { form, set, put, errors } = f;

  // the name field takes focus, since the button that was pressed goes away
  const focusName = () => requestAnimationFrame(() => document.querySelector('.cmp-layer:last-child .cmp-title')?.focus());
  const replace = () => { setReplacing(true); put(habitStart()); f.setErrors({}); focusName(); };
  const keep = () => { setReplacing(false); put(start); f.setErrors({}); focusName(); };
  async function remove() {
    f.setBusy(true);
    try { done(await post(ROUTES.habit, { action: 'delete', id: original.id })); }
    catch (failure) { f.setErrors({ form: failure.message }); f.setBusy(false); }
  }

  const aside = !original ? null
    : replacing ? <button type="button" className="lk cmp-del" disabled={f.busy} onClick={keep}>Keep {original.name}</button>
    : surplus ? <DeleteButton busy={f.busy} onDelete={remove} />
    : <button type="button" className="lk cmp-del" disabled={f.busy} onClick={replace}
      title={`You keep ${limit} habits, so a deleted habit is replaced by a new one`}>Delete and replace</button>;

  return <Composer kind="habit" editing={!!original} heading={replacing ? 'Replace habit' : undefined} flair={flair} active={active}
    dirty={f.dirty} busy={f.busy} error={errors.form} onSave={f.save} onClose={close} aside={aside} saveLabel={replacing ? 'Replace' : 'Save'}>
    {replacing && <p className="cmp-hint" role="status">Replace deletes <b>{original.name}</b> and its ticks. The new habit starts with no ticks, so you still have {limit}.</p>}
    <TitleField value={form.name} onChange={set('name')} placeholder={replacing ? 'The new habit' : 'Read 20 pages'} label="Name" error={errors.name} maxLength={120} />
    <Field label="When" icon="clock" id="time_of_day" error={errors.time_of_day}>
      <Segmented value={form.time_of_day} options={TIMES} onChange={set('time_of_day')} labelledBy="time_of_day-label" />
    </Field>
    <Field label="Icon" icon="flower" id="icon" error={errors.icon} top>
      <IconGrid value={form.icon} onChange={set('icon')} groups={HABIT_ICON_GROUPS} labelledBy="icon-label" />
    </Field>
  </Composer>;
}
