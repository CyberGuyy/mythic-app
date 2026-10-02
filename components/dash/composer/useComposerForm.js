'use client';
// One form's state: the values, the errors under each field, busy, and
// whether anything moved (the unsaved-changes guard). save() runs the checks
// in the routes' own words first, then send(form); a refusal from the route
// lands under the field it is about (fieldOf), else under the form.
import { useRef, useState } from 'react';
import { changed, checkForm, fieldOf } from '@/lib/dash/composer.js';

const FOCUSABLE = 'input, textarea, button';

export function useComposerForm(kind, start, send) {
  const [form, setForm] = useState(start);
  const [errors, setErrors] = useState({});
  const [busy, setBusyState] = useState(false);
  // A ref as well as state: a second Cmd Enter in the same tick must not post twice.
  const sending = useRef(false);
  const setBusy = value => { sending.current = value; setBusyState(value); };

  const set = key => value => {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => (current[key] || current.form ? { ...current, [key]: undefined, form: undefined } : current));
  };
  const put = patch => setForm(current => ({ ...current, ...patch }));

  // Focus the first field with a problem, in the topmost composer.
  const focus = key => requestAnimationFrame(() => {
    const layers = document.querySelectorAll('.cmp-layer');
    const field = layers[layers.length - 1]?.querySelector(`[data-field="${key}"]`);
    field?.querySelector(FOCUSABLE)?.focus();
  });

  async function save() {
    if (sending.current) return;
    const problems = checkForm(kind, form);
    const keys = Object.keys(problems);
    if (keys.length) { setErrors(problems); focus(keys[0]); return; }
    setBusy(true);
    setErrors({});
    try {
      await send(form);
    } catch (failure) {
      const field = fieldOf(kind, failure.message);
      setErrors({ [field || 'form']: failure.message });
      if (field) focus(field);
      setBusy(false);
    }
  }

  return { form, set, put, errors, setErrors, busy, setBusy, save, dirty: changed(start, form) };
}
