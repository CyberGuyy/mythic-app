'use client';
// The Dash nav: the wordmark, the capture slot, Connections and the
// Customise / Done button.
import Link from 'next/link';
import { THEMES } from '@/lib/dash/themes.js';
import Capture from './Capture.jsx';

export default function Nav({ theme, customising, onCustomise }) {
  const mark = THEMES[theme]?.flair?.mark;
  return <nav className="dash-nav" aria-label="Dashboard">
    <span className="dash-mark"><i aria-hidden="true" />Mythic{mark && <em lang="ja">{mark}</em>}</span>
    <Capture />
    <Link className="lk dash-mail" href="/settings">Connections</Link>
    <button type="button" className="btn sm" data-customise aria-pressed={customising} onClick={onCustomise}>{customising ? 'Done' : 'Customise'}</button>
  </nav>;
}
