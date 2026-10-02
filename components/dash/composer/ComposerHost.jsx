'use client';
// Draws every open composer (store.js) into a layer on document.body. The
// layer carries .dash-root and the theme, so the modal reads the page's own
// tokens. The page under it does not scroll while one is open. After a save
// the page refreshes (the loaders run again), the opener's onSaved runs, and
// the composer closes.
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { closeComposer, useComposers } from './store.js';
import TaskForm from './forms/TaskForm.jsx';
import EventForm from './forms/EventForm.jsx';
import NoteForm from './forms/NoteForm.jsx';
import ProjectForm from './forms/ProjectForm.jsx';
import HabitForm from './forms/HabitForm.jsx';
import NightForm from './forms/NightForm.jsx';
import VisionFrame from './forms/VisionFrame.jsx';
import { localToday } from '@/lib/day.js';

const FORMS = {
  task: TaskForm, event: EventForm, note: NoteForm, project: ProjectForm,
  habit: HabitForm, night: NightForm, 'vision-frame': VisionFrame,
};

export default function ComposerHost({ theme, flair, projects, reminders = false }) {
  const router = useRouter();
  const entries = useComposers();
  const open = entries.length > 0;

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => { root.style.overflow = before; };
  }, [open]);

  if (!open) return null;
  const today = localToday();
  return createPortal(<div className="dash-root cmp-root" data-theme={theme}>
    {entries.map((entry, index) => {
      const Form = FORMS[entry.kind] || TaskForm;
      const done = result => {
        router.refresh();
        entry.onSaved?.(result);
        closeComposer(entry.key);
      };
      return <Form key={entry.key} entry={entry} active={index === entries.length - 1} flair={flair} projects={projects} today={today} reminders={reminders}
        done={done} close={() => closeComposer(entry.key)} />;
    })}
  </div>, document.body);
}
