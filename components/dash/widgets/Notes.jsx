'use client';
// Notes on the Dash. The newest note sits on top as a card showing a few
// lines of itself; the next ones follow as rows (a dot-field cover, the
// title, "project · when"). A card or a row opens the note in the composer,
// New starts one, and All notes shows the whole list in place.
import { useState } from 'react';
import PanelTitle from '../PanelTitle.jsx';
import { openComposer } from '../composer/store.js';

const ROWS = 4;
const DOMAINS = new Set(['work', 'life', 'home']);
const MASK = [
  'radial-gradient(circle at 22% 115%, #000, transparent 72%)',
  'linear-gradient(115deg, transparent 18%, #000 50%, transparent 82%)',
  'repeating-conic-gradient(from 8deg at 82% 105%, #000 0 7deg, transparent 7deg 19deg)',
  'radial-gradient(circle at 68% 45%, transparent 20%, #000 21% 38%, transparent 62%)',
];

const tintOf = note => (DOMAINS.has(note.domain) ? note.domain : 'work');
const lineOf = note => [note.project_name, note.when].filter(Boolean).join(' · ');
/** The body after the title line, on one line, for the card. */
function snippet(note) {
  const body = String(note.body || '');
  const rest = body.trim().startsWith(note.title) ? body.trim().slice(note.title.length) : body;
  return rest.replace(/\s+/g, ' ').trim().slice(0, 240);
}

const open = note => openComposer({ kind: 'note', record: note });

function Lead({ note }) {
  const words = snippet(note);
  return <button type="button" className="nw-lead" style={{ '--c': `var(--${tintOf(note)})` }} onClick={() => open(note)}
    aria-label={`Open ${note.title}, ${lineOf(note)}`}>
    <b>{note.title}</b>
    {words && <span className="nw-words">{words}</span>}
    <small><i aria-hidden="true" />{lineOf(note)}</small>
  </button>;
}

function Row({ note, index }) {
  return <button type="button" className="nl" style={{ '--c': `var(--${tintOf(note)})`, '--m': MASK[index % MASK.length] }} onClick={() => open(note)}
    title={note.excerpt || note.title} aria-label={`Open ${note.title}, ${lineOf(note)}`}>
    <span className="cv" aria-hidden="true" />
    <b>{note.title}</b>
    <small>{lineOf(note) || 'Note'}</small>
  </button>;
}

export default function Notes({ data, flair, meta }) {
  const [all, setAll] = useState(false);
  const notes = data?.notes || [];
  const [lead, ...rest] = notes;
  const shown = all ? rest : rest.slice(0, ROWS);
  return <section className="panel ngal nw">
    <PanelTitle icon={meta.icon} title="Notes" jp={meta.jp} flair={flair}>
      <button type="button" className="lk nw-act" onClick={() => openComposer({ kind: 'note' })}>New</button>
    </PanelTitle>
    {lead
      ? <>
        <Lead note={lead} />
        {shown.length > 0 && <div className="nls">{shown.map((note, index) => <Row key={note.id} note={note} index={index} />)}</div>}
        {rest.length > ROWS && <button type="button" className="lk nl-all" aria-expanded={all} onClick={() => setAll(value => !value)}>{all ? 'Fewer notes' : `All ${notes.length} notes`}</button>}
      </>
      : <p className="empty">No notes yet. Press New, or capture one with ⌘K.</p>}
  </section>;
}
