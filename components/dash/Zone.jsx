'use client';
// One zone of the dashboard. top: full-width bands (header, year line) and one
// plate holding every other top widget as a column. left: a single column.
// right: runs of two columns (span main | side), with span full widgets across
// both. In customise mode every widget gets a handle bar: drag it to reorder
// inside the zone (native HTML5 drag and drop), or use the zone menu, the
// arrow buttons (the keyboard path) and remove. onMove(id, zone, index, focus)
// takes the selectors the shell should focus once the move has rendered.
import { Component, useState } from 'react';
import { WIDGET_COMPONENTS, Stub } from './widgets/index.js';
import { Icon } from './icons.js';
import PanelTitle from './PanelTitle.jsx';
import { ZONE_NAMES } from '@/lib/dash/layout.js';

// Which visual column a widget sits in, so the arrows step past widgets in the
// other column instead of doing nothing visible.
const columnOf = (zone, meta) => zone === 'right' ? meta.span : zone === 'top' ? (meta.band ? 'band' : 'plate') : 'column';

class WidgetBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return <Problem meta={this.props.meta} flair={this.props.flair} line={this.state.error.message} />;
  }
}

function Problem({ meta, flair, line }) {
  return <section className="panel dash-error" role="alert">
    <PanelTitle icon={meta.icon} title={meta.name} jp={meta.jp} flair={flair} />
    <p className="empty">This could not load. {line}</p>
  </section>;
}

function Body({ item, meta, entry, theme, flair, customising }) {
  if (entry === undefined) return <section className="panel dash-pending" aria-busy="true">
    <PanelTitle icon={meta.icon} title={meta.name} jp={meta.jp} flair={flair} />
  </section>;
  if (!entry.ok) return <Problem meta={meta} flair={flair} line={entry.error} />;
  const Widget = WIDGET_COMPONENTS[meta.component] || Stub;
  return <WidgetBoundary meta={meta} flair={flair}>
    <Widget data={entry.value} options={item.options || {}} theme={theme} flair={flair} customising={customising} meta={meta} />
  </WidgetBoundary>;
}

export default function Zone({ zone, items, widgets, data, theme, flair, customising, offset = 0, onMove, onRemove }) {
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);

  const neighbour = (index, direction) => {
    const key = columnOf(zone, widgets[items[index].id]);
    for (let other = index + direction; other >= 0 && other < items.length; other += direction) {
      if (columnOf(zone, widgets[items[other].id]) === key) return other;
    }
    return -1;
  };

  const slot = (item, index) => {
    const meta = widgets[item.id];
    const earlier = neighbour(index, -1), later = neighbour(index, 1);
    const sideways = zone === 'top' && !meta.band;
    // After a move the control that was used may be gone (a new zone) or
    // disabled (the end of a column): the shell focuses the first of these
    // that exists, so the keyboard path keeps its place.
    const own = control => `[data-widget="${item.id}"] > .dash-handle ${control}`;
    const classes = ['dash-w', dragging === item.id && 'is-dragging', over === item.id && 'is-over'].filter(Boolean).join(' ');
    const drop = customising ? {
      onDragOver: event => {
        if (!dragging || dragging === item.id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        if (over !== item.id) setOver(item.id);
      },
      onDragLeave: event => { if (!event.currentTarget.contains(event.relatedTarget)) setOver(current => current === item.id ? null : current); },
      onDrop: event => {
        event.preventDefault();
        const from = dragging;
        setDragging(null); setOver(null);
        if (from && from !== item.id) onMove(from, zone, index);
      },
    } : {};
    return <div key={item.id} className={classes} data-widget={item.id} style={{ '--n': offset + index }} {...drop}>
      {customising && <div className="dash-handle" draggable={!meta.pinLast}
        onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id); setDragging(item.id); }}
        onDragEnd={() => { setDragging(null); setOver(null); }}>
        {!meta.pinLast && <span className="grip" aria-hidden="true"><Icon name="drag" size={16} stroke={2.6} /></span>}
        <b>{meta.name}</b>
        {meta.zones.length > 1 && <select aria-label={'Zone for ' + meta.name} value={zone} onChange={event => onMove(item.id, event.target.value, Infinity, [own('select')])}>
          {meta.zones.map(option => <option key={option} value={option}>{ZONE_NAMES[option]}</option>)}
        </select>}
        {!meta.pinLast && <>
          <button type="button" data-move="earlier" aria-label={'Move ' + meta.name + (sideways ? ' left' : ' up')} title={sideways ? 'Move left' : 'Move up'} disabled={earlier < 0} onClick={() => onMove(item.id, zone, earlier, [own('[data-move=earlier]'), own('[data-move=later]')])}><Icon name={sideways ? 'left' : 'up'} size={15} /></button>
          <button type="button" data-move="later" aria-label={'Move ' + meta.name + (sideways ? ' right' : ' down')} title={sideways ? 'Move right' : 'Move down'} disabled={later < 0} onClick={() => onMove(item.id, zone, later, [own('[data-move=later]'), own('[data-move=earlier]')])}><Icon name={sideways ? 'right' : 'down'} size={15} /></button>
        </>}
        {!meta.required && <button type="button" aria-label={'Remove ' + meta.name} title="Remove" onClick={() => onRemove(item.id)}><Icon name="x" size={15} /></button>}
      </div>}
      <Body item={item} meta={meta} entry={data[item.id]} theme={theme} flair={flair} customising={customising} />
    </div>;
  };

  const empty = customising && !items.length ? <p className="dash-zone-empty">{ZONE_NAMES[zone]} is empty. Add a widget from the drawer.</p> : null;

  if (zone === 'top') {
    const plate = items.map((item, index) => ({ item, index })).filter(({ item }) => !widgets[item.id].band);
    const first = plate.length ? plate[0].index : -1;
    const columns = plate.map(({ item }) => widgets[item.id].plateWidth || 'minmax(0, 1fr)').join(' ');
    return <section className="dash-zone dash-top" data-zone="top">
      {items.map((item, index) => {
        if (widgets[item.id].band) return <div key={item.id} className="dash-band">{slot(item, index)}</div>;
        if (index !== first) return null;
        return <section key="plate" className="dash-plate" style={{ '--plate-cols': columns, '--n': offset + index }}>
          {plate.map(entry => slot(entry.item, entry.index))}
        </section>;
      })}
      {empty}
    </section>;
  }

  if (zone === 'right') {
    const runs = [];
    let run = null;
    items.forEach((item, index) => {
      const span = widgets[item.id].span;
      if (span === 'full') { run = null; runs.push({ full: { item, index } }); return; }
      if (!run) { run = { main: [], side: [] }; runs.push(run); }
      run[span === 'main' ? 'main' : 'side'].push({ item, index });
    });
    return <div className="dash-zone dash-right" data-zone="right">
      {runs.map((entry, index) => entry.full
        ? <div key={entry.full.item.id} className="dash-full">{slot(entry.full.item, entry.full.index)}</div>
        : <div key={'run-' + index} className="dash-cols">
          <div className="dash-col dash-col-main">{entry.main.map(one => slot(one.item, one.index))}</div>
          <div className="dash-col dash-col-side">{entry.side.map(one => slot(one.item, one.index))}</div>
        </div>)}
      {empty}
    </div>;
  }

  return <div className="dash-zone dash-left" data-zone={zone}>
    {items.map(slot)}
    {empty}
  </div>;
}
