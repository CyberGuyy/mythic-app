'use client';
// The project: None first, then one chip a project in its domain's colour with
// its small weekly bars (the Tasks picker's language), then "+ New project",
// which opens the project composer over this one. A project that is no longer
// listed (archived) stays chosen as "Archived project", so an edit does not
// drop it quietly.
import { Icon } from '../../icons.js';

const DOMAINS = new Set(['work', 'life', 'home']);
const colour = project => `var(--${DOMAINS.has(project?.domain) ? project.domain : 'work'})`;

export default function ProjectPicker({ value, projects = [], onChange, onNew, labelledBy }) {
  const kept = value && !projects.some(project => project.id === value);
  return <div className="cmp-seg cmp-pjs" role="group" aria-labelledby={labelledBy}>
    <button type="button" className="cmp-chip" aria-pressed={!value} style={{ '--c': 'var(--soft)' }} onClick={() => onChange(null)}>None</button>
    {kept && <button type="button" className="cmp-chip cmp-pj" aria-pressed="true" style={{ '--c': 'var(--mute)' }}>Archived project</button>}
    {projects.map(project => {
      const bars = project.bars || { done: 0, total: 0 };
      return <button key={project.id} type="button" className="cmp-chip cmp-pj" aria-pressed={value === project.id} style={{ '--c': colour(project) }}
        title={project.name} onClick={() => onChange(value === project.id ? null : project.id)}>
        <b>{project.name}</b>
        {bars.total > 0 && <span className="cmp-pjb" aria-hidden="true">{Array.from({ length: bars.total }, (_, k) => <i key={k} className={k < bars.done ? 'y' : ''} />)}</span>}
      </button>;
    })}
    {onNew && <button type="button" className="cmp-chip cmp-new" onClick={onNew}><Icon name="plus" size={14} stroke={2} />New project</button>}
  </div>;
}
