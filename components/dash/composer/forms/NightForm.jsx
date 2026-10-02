'use client';
// Log a night: the day you woke, bed and wake times, and a note. The day
// starts where the sleep route would (yesterday before 04:00); picking a day
// already logged brings its times in, and saving replaces it. The night's
// length shows as it is typed, in the Sleep widget's big figures.
import { useState } from 'react';
import Composer from '../Composer.jsx';
import { useComposerForm } from '../useComposerForm.js';
import { Field, DatePicker, TimePicker, LineField } from '../fields/index.js';
import post from '../../post.js';
import { BED_QUICK, WAKE_QUICK, ROUTES, nightBody, nightLength, nightStart } from '@/lib/dash/composer.js';

const pad = value => String(value).padStart(2, '0');

export default function NightForm({ entry, today, done, close, flair, active }) {
  const nights = entry.prefill?.nights || {};
  const [start] = useState(() => nightStart(entry.prefill));
  const f = useComposerForm('night', start, async form => done(await post(ROUTES.night, nightBody(form))));
  const { form, set, put, errors } = f;
  const pickDay = day => {
    set('day')(day);
    const logged = nights[day];
    if (logged) put({ bed_at: logged.bed_at, woke_at: logged.woke_at, note: logged.note || '' });
  };
  const length = nightLength(form.bed_at, form.woke_at);
  const shown = length != null && length > 0 && length <= 16 * 60;
  return <Composer kind="night" flair={flair} active={active} dirty={f.dirty} busy={f.busy} error={errors.form} onSave={f.save} onClose={close}
    saveLabel={nights[form.day] ? 'Save' : 'Log night'}>
    <div className={'cmp-sum' + (shown ? '' : ' none')} aria-live="polite">
      {shown ? <b>{Math.floor(length / 60)}<small>h</small>{pad(length % 60)}<small>m</small></b> : <b>0<small>h</small>00<small>m</small></b>}
      <span>{shown ? 'asleep' : 'Pick the bed and wake times'}</span>
    </div>
    <Field label="Woke on" icon="sunrise" id="day" error={errors.day}>
      <DatePicker value={form.day} onChange={pickDay} today={today} max={today} clear={false} label="Woke on" invalid={!!errors.day} />
    </Field>
    <Field label="Bed" icon="bed" id="bed_at" error={errors.bed_at}>
      <TimePicker value={form.bed_at} onChange={set('bed_at')} label="Bedtime" quick={BED_QUICK} clear={false} invalid={!!errors.bed_at} />
    </Field>
    <Field label="Woke" icon="alarm" id="woke_at" error={errors.woke_at}>
      <TimePicker value={form.woke_at} onChange={set('woke_at')} label="Wake time" quick={WAKE_QUICK} clear={false} invalid={!!errors.woke_at} />
    </Field>
    <Field label="Note" icon="note" id="note" error={errors.note}>
      <LineField value={form.note} onChange={set('note')} placeholder="Late film, woke once" label="Note" maxLength={500} />
    </Field>
  </Composer>;
}
