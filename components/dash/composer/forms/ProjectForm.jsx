'use client';
// A project: name, area, deadline, a weekly target in tasks or hours, and a
// note. Delete (edit only) asks twice; the route archives the project and
// takes its tasks off it.
import { useState } from 'react';
import Composer from '../Composer.jsx';
import DeleteButton from '../DeleteButton.jsx';
import { useComposerForm } from '../useComposerForm.js';
import { AREAS } from './TaskForm.jsx';
import { Field, TitleField, BodyField, Segmented, DatePicker, NumberField } from '../fields/index.js';
import post from '../../post.js';
import { ROUTES, projectBody, projectStart } from '@/lib/dash/composer.js';

const UNITS = [{ value: 'tasks', label: 'Tasks', icon: 'tasks' }, { value: 'hours', label: 'Hours', icon: 'clock' }];

export default function ProjectForm({ entry, today, done, close, flair, active }) {
  const original = entry.record || null;
  const [start] = useState(() => projectStart(original, entry.prefill));
  const f = useComposerForm('project', start, async form => {
    const body = projectBody(form, original);
    done({ ...(await post(ROUTES.project, body)), ...(original ? { id: original.id } : {}), body });
  });
  const { form, set, errors } = f;
  async function remove() {
    f.setBusy(true);
    try { done({ ...(await post(ROUTES.project, { action: 'delete', id: original.id })), deleted: true }); }
    catch (failure) { f.setErrors({ form: failure.message }); f.setBusy(false); }
  }
  return <Composer kind="project" editing={!!original} flair={flair} active={active} dirty={f.dirty} busy={f.busy} error={errors.form}
    onSave={f.save} onClose={close} aside={original && <DeleteButton busy={f.busy} onDelete={remove} />}>
    <TitleField value={form.name} onChange={set('name')} placeholder="Project name" label="Name" error={errors.name} maxLength={120} />
    <Field label="Area" icon="grid" id="domain" error={errors.domain}>
      <Segmented value={form.domain} options={AREAS} onChange={set('domain')} labelledBy="domain-label" />
    </Field>
    <Field label="Deadline" icon="cal" id="deadline" error={errors.deadline}>
      <DatePicker value={form.deadline} onChange={set('deadline')} today={today} label="Deadline" placeholder="No deadline" invalid={!!errors.deadline} />
    </Field>
    <Field label="Each week" icon="target" id="weekly_target" error={errors.weekly_target}>
      <div className="cmp-row cmp-target">
        <NumberField value={form.weekly_target} onChange={set('weekly_target')} label="Weekly target" placeholder="None" invalid={!!errors.weekly_target} />
        <Segmented value={form.weekly_unit} options={UNITS} onChange={set('weekly_unit')} labelledBy="weekly_target-label" />
      </div>
    </Field>
    <div data-field="note"><BodyField value={form.note} onChange={set('note')} placeholder="What this project is for" label="Note" minRows={2} maxLength={500} /></div>
  </Composer>;
}
