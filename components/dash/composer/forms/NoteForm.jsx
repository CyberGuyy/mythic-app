'use client';
// A note: title, the body and a project. An edit carries the stamp the note
// had when it opened; if the note moved on since, the route refuses with
// STALE_NOTE and the next Save keeps this version on purpose. Delete asks twice.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Composer from '../Composer.jsx';
import DeleteButton from '../DeleteButton.jsx';
import { useComposerForm } from '../useComposerForm.js';
import { Field, TitleField, BodyField, ProjectPicker } from '../fields/index.js';
import post from '../../post.js';
import { ROUTES, noteBody, noteDeleteBody, noteStart } from '@/lib/dash/composer.js';

// lib/dash/notes.js STALE_NOTE (notes.test.js keeps the Notes widget's copy the same)
const STALE_NOTE = 'This note changed somewhere else after you opened it. Save again to keep your version.';

export default function NoteForm({ entry, projects = [], done, close, flair, active }) {
  const router = useRouter();
  const original = entry.record || null;
  const [start] = useState(() => noteStart(original, entry.prefill));
  const [seen, setSeen] = useState(original?.stamp ?? null);
  const f = useComposerForm('note', start, async form => {
    try { done(await post(ROUTES.note, noteBody(form, original, seen))); }
    catch (failure) {
      if (failure.message === STALE_NOTE) { setSeen(null); router.refresh(); }
      throw failure;
    }
  });
  const { form, set, errors } = f;
  async function remove() {
    f.setBusy(true);
    try { done(await post(ROUTES.note, noteDeleteBody(original.id))); }
    catch (failure) { f.setErrors({ form: failure.message }); f.setBusy(false); }
  }
  return <Composer kind="note" editing={!!original} flair={flair} active={active} dirty={f.dirty} busy={f.busy} error={errors.form}
    onSave={f.save} onClose={close} aside={original && <DeleteButton busy={f.busy} onDelete={remove} />}>
    <TitleField value={form.title} onChange={set('title')} placeholder="Title" error={errors.title} />
    <div data-field="body" className="cmp-note"><BodyField value={form.body} onChange={set('body')} placeholder="Write the note" label="Note" minRows={6} invalid={!!errors.body} />
      {errors.body && <p className="cmp-err" role="alert">{errors.body}</p>}</div>
    <Field label="Project" icon="flag" id="project_id" error={errors.project_id}>
      <ProjectPicker value={form.project_id} projects={projects} onChange={set('project_id')} labelledBy="project_id-label" />
    </Field>
  </Composer>;
}
