'use client';
// The Dash shell: the theme attribute on the root, the nav, and a track of two
// panes that slides between Today (the three zones, customise mode and the
// drawer) and Projects (the project plan). Both panes stay mounted, so a
// switch keeps each one's state; the hidden pane is inert and hidden from
// screen readers, and once the slide is over it folds to no height so the
// page is as tall as the pane in view. The switch writes the address with
// history.replaceState (lib/dash/views.js): nothing reloads or refetches, and
// each pane comes back at the scroll position it was left at. Picking another
// project fetches its plan from /api/dash/projects/view. Layout changes show at once
// (a draft), post to /api/settings, then refresh the server page so the
// loaders run for whatever is now on it. Keyboard focus follows a moved
// widget, a removed one goes to its drawer entry, and leaving customise mode
// (Done or Esc in the drawer or a handle bar) returns to the nav button.
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { THEMES, DEFAULT_THEME } from '@/lib/dash/themes.js';
import { addWidget, moveWidget, removeWidget, defaultLayout } from '@/lib/dash/layout.js';
import { setTimeZone } from '@/lib/day.js';
import post from './post.js';
import Nav from './Nav.jsx';
import Zone from './Zone.jsx';
import Drawer from './Drawer.jsx';
import ComposerHost from './composer/ComposerHost.jsx';

export default function DashShell({ theme, layout, widgets, data, profile = {} }) {
  // The day is counted in the profile's timezone, in the browser as on the server.
  setTimeZone(profile.timezone);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState(null);
  const [customising, setCustomising] = useState(false);
  // the drawer lies over the page; hiding it uncovers the side column's handles
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [error, setError] = useState('');
  const latest = useRef(0);
  const queue = useRef(Promise.resolve());
  const root = useRef(null);
  const focusAfter = useRef(null);

  // Runs after every render; acts only when a change asked for a focus target.
  useEffect(() => {
    const selectors = focusAfter.current;
    if (!selectors) return;
    focusAfter.current = null;
    const target = selectors.map(selector => root.current?.querySelector(selector)).find(element => element && !element.disabled);
    target?.focus();
  });

  const shownTheme = draft?.theme ?? theme;
  const shown = draft?.layout ?? layout;
  const flair = (THEMES[shownTheme] || THEMES[DEFAULT_THEME]).flair;
  // The composers' project chips come from the tasks loader.
  const projects = (data?.tasks?.ok && data.tasks.value?.projects) || [];

  // Every layout post carries the whole layout, so they must reach the server
  // in the order they were made: each waits for the one before (a slow
  // response let an older layout land last and win). Only the newest one
  // refreshes the page and drops the draft.
  function save(body, next) {
    const mine = ++latest.current;
    setError('');
    setDraft(next);
    queue.current = queue.current.then(async () => {
      try {
        await post('/api/settings', body);
        if (latest.current === mine) startTransition(() => { router.refresh(); setDraft(null); });
      } catch (failure) {
        if (latest.current === mine) startTransition(() => { router.refresh(); setDraft(null); });
        setError(failure.message);
      }
    });
  }

  function change(edit, focus) {
    let next;
    try { next = edit(shown); } catch (failure) { setError(failure.message); return; }
    focusAfter.current = focus || null;
    save({ action: 'layout', theme: shownTheme, layout: next }, { theme: shownTheme, layout: next });
  }

  function endCustomise() {
    focusAfter.current = ['.dash-nav [data-customise]'];
    setCustomising(false);
  }
  const onKeyDown = event => {
    if (customising && event.key === 'Escape' && event.target.closest?.('.dash-drawer, .dash-handle')) { event.preventDefault(); endCustomise(); }
  };

  const zone = (name, offset) => <Zone zone={name} items={shown[name]} widgets={widgets} data={data} theme={shownTheme} flair={flair}
    customising={customising} offset={offset}
    onMove={(id, target, index, focus) => change(current => moveWidget(current, id, target, index, widgets), focus)}
    onRemove={id => change(current => removeWidget(current, id, widgets), [`[data-drawer-item="${id}"] button`, '.dash-drawer h2'])} />;

  const customise = () => {
    setDrawerOpen(true);
    setCustomising(value => !value);
  };

  return <div ref={root} className="dash-root" data-theme={shownTheme} data-customising={customising ? '' : undefined} onKeyDown={onKeyDown}>
    <div className="dash-wrap">
      <Nav theme={shownTheme} customising={customising} onCustomise={customise} />
      {error && <p className="dash-alert" role="alert">{error}</p>}
      {zone('top', 0)}
      <main className="dash-grid">
        {zone('left', shown.top.length)}
        {zone('right', shown.top.length + shown.left.length)}
      </main>
    </div>
    {customising && !drawerOpen && <button type="button" className="btn sm dash-drawer-tab" onClick={() => { focusAfter.current = ['.dash-drawer h2']; setDrawerOpen(true); }}>Widgets</button>}
    {customising && drawerOpen && <Drawer layout={shown} widgets={widgets}
      onAdd={(id, target, focus) => change(current => addWidget(current, id, target, widgets), focus)}
      onReset={() => save({ action: 'reset', theme: shownTheme }, { theme: shownTheme, layout: defaultLayout(shownTheme, widgets) })}
      onHide={() => { focusAfter.current = ['.dash-drawer-tab']; setDrawerOpen(false); }}
      onClose={endCustomise} />}
    <ComposerHost theme={shownTheme} flair={flair} projects={projects} reminders={!!profile.reminders} />
  </div>;
}
