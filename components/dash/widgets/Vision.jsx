'use client';
// Vision: your own photos, images only (no
// labels, one small pencil, never a big Add tile, horizontal frames). The film
// look is 90s JDM night photography on a disposable camera: grain and colour
// fringing from the #dash-retro SVG filter, faded blacks, a teal and amber
// grade, a flash vignette and the orange date stamp.
// Port of features.js bake(): once a photo loads it is drawn through the
// filter into a canvas that replaces the img, so the page does not re-run the
// SVG filter on every scroll or hover frame. Yoru sets the frames in a film
// strip (v-yoru.html .vstrip). The pencil turns on edit mode: a small
// "Add photo" picker in the heading, and per photo a move grip, remove and a
// corner handle. The board is a six-column grid (lib/dash/vision.js
// VISION_GRID): a photo spans w columns and h rows, 6 by 6 being the old
// full-width frame. In edit mode a photo drags to a new place (the others
// slide aside, FLIP) and the corner handle resizes it on the grid; the grip
// and the handle also take the arrow keys. Changes show at once and save as
// one layout; a refused save puts the board back. The crop button (or a
// double click) opens the frame pop-up (composer/forms/VisionFrame.jsx),
// where the photo moves inside its frame and crops tighter; the bake and the
// live look place it with lib/dash/vision-crop.js.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PanelTitle from '../PanelTitle.jsx';
import { Icon } from '../icons.js';
import post from '../post.js';
import { openComposer } from '../composer/store.js';
import { coverRect, cropStyle } from '@/lib/dash/vision-crop.js';

const MAX_BYTES = 8 * 1024 * 1024;
const GRID = { columns: 6, minW: 2, maxW: 6, minH: 2, maxH: 10 };
// A press has to travel this far before it becomes a drag, so a click stays a click.
const DRAG_START = 4;
// After a swap the pointer must move this far before the next one, so two
// photos of different sizes do not trade places back and forth under it.
const SWAP_GAP = 16;
const KEY_SAVE_MS = 450;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const sizeWords = item => `${item.w} of ${GRID.columns} columns wide, ${item.h} rows tall`;
const FILM = 'contrast(1.28) saturate(.58) brightness(.68) sepia(.2)';

/** The grain, colour fringing and soft blur, once per page. */
function RetroFilter() {
  return <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
    <filter id="dash-retro" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
      <feOffset in="r" dx="1.6" result="r2" />
      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="gb" />
      <feOffset in="gb" dx="-1.6" result="gb2" />
      <feBlend in="r2" in2="gb2" mode="screen" result="ca" />
      <feGaussianBlur in="ca" stdDeviation=".45" result="soft" />
      <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="4" result="n" />
      <feColorMatrix in="n" type="matrix" values=".33 .33 .33 0 0  .33 .33 .33 0 0  .33 .33 .33 0 0  0 0 0 0 1" result="n2" />
      <feComposite in="soft" in2="n2" operator="arithmetic" k1="0" k2="1" k3=".34" k4="-.15" />
    </filter>
  </svg>;
}

let filterable;
/** Whether a canvas takes ctx.filter (Safari before 18 does not), asked once. */
const canFilter = () => (filterable ??= typeof document !== 'undefined' && 'filter' in document.createElement('canvas').getContext('2d'));
// Resizing the column fires the observer on every frame; the bake waits for it to settle.
const REBAKE_MS = 150;

/** Draw the photo with the whole film look into the canvas, placed by its
 *  crop. Returns false when the frame has no size yet or the browser cannot
 *  filter a canvas. */
function bake(canvas, img, crop) {
  const fig = canvas.parentElement;
  const w = fig?.clientWidth, h = fig?.clientHeight, d = Math.min(window.devicePixelRatio || 1, 2);
  if (!w || !h || !img.naturalWidth || !canFilter()) return false;
  canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
  const x = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  x.clearRect(0, 0, W, H);
  // cover, placed and zoomed by the crop
  const { dx, dy, dw, dh } = coverRect(W, H, img.naturalWidth, img.naturalHeight, crop);
  x.filter = `url(#dash-retro) ${FILM}`;
  x.drawImage(img, dx, dy, dw, dh);
  x.filter = 'none';
  // the teal and amber grade
  x.globalCompositeOperation = 'soft-light';
  const grade = x.createLinearGradient(0, 0, W * .35, H);
  grade.addColorStop(0, 'rgba(20,70,95,.5)'); grade.addColorStop(1, 'rgba(120,60,15,.38)');
  x.fillStyle = grade; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'source-over';
  // the flash vignette: an ellipse 105% by 95% of the frame, centred a little high
  const rx = W * 1.05, ry = H * .95;
  x.save(); x.translate(W / 2, H * .46); x.scale(1, ry / rx);
  const vignette = x.createRadialGradient(0, 0, 0, 0, 0, rx);
  vignette.addColorStop(.32, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,.82)');
  x.fillStyle = vignette; x.fillRect(-rx, -rx, rx * 2, rx * 2);
  x.restore();
  return true;
}

function Photo({ item, index, count, editing, sizing, lifted, busy, onGrab, onRemove, onResizeStart, onMoveKey, onSizeKey, onFrame }) {
  const canvas = useRef(null);
  const [image, setImage] = useState(null);
  const [baked, setBaked] = useState(false);

  useEffect(() => {
    let live = true;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { if (live) setImage(img); };
    img.src = item.src;
    return () => { live = false; img.onload = null; };
  }, [item.src]);

  const { x: cropX, y: cropY, zoom } = item;
  useEffect(() => {
    const node = canvas.current, frame = node?.parentElement;
    if (!image || !node || !frame) return undefined;
    const crop = { x: cropX, y: cropY, zoom };
    // Once per photo (and again for a new crop), not on every render.
    setBaked(bake(node, image, crop));
    // A resize on the board, moving the widget between the 250px and 400px
    // columns, or resizing the window re-sizes the frame: bake again once it
    // has settled.
    let width = frame.clientWidth, height = frame.clientHeight, timer = null;
    const watch = new ResizeObserver(() => {
      const nextWidth = frame.clientWidth, nextHeight = frame.clientHeight;
      if (!nextWidth || (Math.abs(nextWidth - width) <= 1 && Math.abs(nextHeight - height) <= 1)) return;
      width = nextWidth; height = nextHeight;
      clearTimeout(timer);
      timer = setTimeout(() => setBaked(bake(node, image, crop)), REBAKE_MS);
    });
    watch.observe(frame);
    return () => { clearTimeout(timer); watch.disconnect(); };
  }, [image, cropX, cropY, zoom]);

  // While the handle is held the frame changes size on every snap: the live
  // CSS look stands in for the canvas, which is baked again once it settles.
  const film = baked && !sizing;
  const classes = ['ph', film && 'baked', sizing && 'sizing', lifted && 'lift'].filter(Boolean).join(' ');
  return <figure className={classes} data-id={item.id} style={{ gridColumn: `span ${item.w}`, gridRow: `span ${item.h}` }}
    onPointerDown={editing ? onGrab : undefined} onDoubleClick={editing ? onFrame : undefined}>
    {/* Until the bake runs (or where a canvas cannot take the filter) the
        img carries the same look as a live CSS filter. */}
    {/* eslint-disable-next-line @next/next/no-img-element -- a local photo route, drawn into the canvas once baked */}
    {!film && image && <img src={item.src} alt="" draggable={false} style={cropStyle(item)} />}
    <canvas ref={canvas} aria-hidden="true" />
    <span className="stamp">{item.stamp}</span>
    {editing && <>
      <button type="button" className="vis-grip" title="Drag to move, or use the arrow keys"
        aria-label={`Move photo ${index + 1} of ${count}. Arrow keys move it earlier or later.`} onKeyDown={onMoveKey}>
        <Icon name="drag" size={14} stroke={2.4} />
      </button>
      <button type="button" className="vis-x" aria-label={`Remove photo ${index + 1}`} title="Remove" disabled={busy} onClick={onRemove}>
        <Icon name="x" size={12} stroke={2} />
      </button>
      <button type="button" className="vis-frame" title="Frame: move and crop the photo inside its frame" aria-label={`Frame photo ${index + 1}`}
        disabled={busy} onClick={onFrame}><Icon name="crop" size={12} stroke={2} /></button>
      <button type="button" className="vis-size" title="Drag to resize, or use the arrow keys"
        aria-label={`Resize photo ${index + 1}, ${sizeWords(item)}. Left and right change the width, up and down the height.`}
        onPointerDown={onResizeStart} onKeyDown={onSizeKey}>
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M11 4v7H4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {sizing && <span className="vis-dim" aria-hidden="true">{item.w} × {item.h}</span>}
    </>}
  </figure>;
}

/** The board as local state. Every layout change starts here and is saved
 *  from here, so once the board has changed it keeps its own layout over
 *  refreshed data (a refresh asked for before the last save can land after
 *  it and would undo the newer layout). Fresh data wins again when the set
 *  of photos changes (an upload, a removal) or after reset(), which a
 *  refused save calls so the next refresh puts the saved board back. */
function useBoard(items) {
  const [board, setBoard] = useState({ from: items, items, own: false });
  const sameSet = (a, b) => a.length === b.length && a.every(item => b.some(other => other.id === item.id));
  const pick = value => (value.from === items || (value.own && sameSet(value.items, items)) ? value.items : items);
  const current = pick(board);
  const set = next => setBoard(value => {
    const base = pick(value);
    return { from: items, items: typeof next === 'function' ? next(base) : next, own: true };
  });
  const reset = () => setBoard(value => ({ ...value, own: false }));
  return [current, set, reset];
}

const sameLayout = (a, b) => a.length === b.length && a.every((item, index) => item.id === b[index].id && item.w === b[index].w && item.h === b[index].h);

export default function Vision({ data, flair, meta }) {
  const router = useRouter();
  const [liftId, setLiftId] = useState(null);
  const [sizingId, setSizingId] = useState(null);
  const [items, setItems, resetBoard] = useBoard(data?.items || []);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [said, setSaid] = useState('');
  const picker = useRef(null);
  const grid = useRef(null);
  const gesture = useRef(null);
  const flipFrom = useRef(null);
  const saving = useRef(Promise.resolve());
  const keyTimer = useRef(null);
  // The board as the gestures last left it (a pointer move can land before the re-render).
  const latest = useRef(items);
  useLayoutEffect(() => { latest.current = items; });

  async function run(work) {
    setBusy(true); setError('');
    try { await work(); router.refresh(); }
    catch (problem) { setError(problem.message || 'That did not work'); }
    finally { setBusy(false); }
  }

  // An upload or a removal changes the set of photos, so any layout save
  // still waiting (an arrow key's pause) goes first and finishes first.
  function settled() {
    if (keyTimer.current) { clearTimeout(keyTimer.current); keyTimer.current = null; save(latest.current); }
    return saving.current;
  }

  function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) { setError('That photo is over 8 MB.'); return; }
    run(async () => {
      await settled();
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/vision', { method: 'POST', body: form });
      let body = {};
      try { body = await response.json(); } catch { body = {}; }
      if (!response.ok) throw new Error(body.error || 'That photo could not be added');
    });
  }
  const remove = id => run(async () => { await settled(); return post('/api/vision', { action: 'remove', id }); });

  // One layout save at a time, in order; a refusal shows its line and the
  // refresh puts the board back to what was saved.
  function save(next) {
    setError('');
    const body = { action: 'layout', items: next.map(({ id, w, h }) => ({ id, w, h })) };
    saving.current = saving.current
      .then(() => post('/api/vision', body))
      .then(() => router.refresh(), problem => { setError(problem.message || 'The new layout did not save.'); resetBoard(); router.refresh(); });
  }
  // Arrow keys save once they pause.
  const saveSoon = () => { clearTimeout(keyTimer.current); keyTimer.current = setTimeout(() => { keyTimer.current = null; save(latest.current); }, KEY_SAVE_MS); };

  // ---- FLIP: where every photo sat before a change, then slide from there ----
  const nodes = () => [...(grid.current?.querySelectorAll(':scope > [data-id]') || [])];
  const measure = () => new Map(nodes().map(node => [node.dataset.id, { x: node.offsetLeft, y: node.offsetTop }]));
  const change = next => { flipFrom.current = measure(); latest.current = next; setItems(next); };

  // The lifted photo follows the pointer: its place in the grid may have
  // moved under it, so its offset is worked out from where it sits now.
  function follow() {
    const drag = gesture.current;
    if (drag?.kind !== 'move' || !drag.moved) return;
    const node = grid.current?.querySelector(`:scope > [data-id="${drag.id}"]`);
    if (!node) return;
    const x = drag.left + (drag.lastX - drag.startX) - node.offsetLeft;
    const y = drag.top + (drag.lastY - drag.startY) - node.offsetTop;
    node.style.transform = `translate(${x}px, ${y}px)${still() ? '' : ' scale(1.03)'}`;
  }

  useLayoutEffect(() => {
    const before = flipFrom.current;
    flipFrom.current = null;
    follow();
    if (!before || still()) return;
    const dragged = gesture.current?.kind === 'move' ? gesture.current.id : null;
    for (const node of nodes()) {
      if (node.dataset.id === dragged) continue;
      const old = before.get(node.dataset.id);
      if (!old) continue;
      const dx = old.x - node.offsetLeft, dy = old.y - node.offsetTop;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.16, 1, .3, 1)' });
    }
  });

  function endGesture(cancelled) {
    const drag = gesture.current;
    if (!drag) return;
    gesture.current = null;
    window.removeEventListener('pointermove', drag.onMove);
    window.removeEventListener('pointerup', drag.onUp);
    window.removeEventListener('pointercancel', drag.onCancel);
    window.removeEventListener('keydown', drag.onKey, true);
    const node = grid.current?.querySelector(`:scope > [data-id="${drag.id}"]`);
    if (drag.kind === 'move' && node) {
      const from = node.style.transform;
      node.style.transform = '';
      if (from && !still()) node.animate([{ transform: from }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.16, 1, .3, 1)' });
    }
    setLiftId(null);
    setSizingId(null);
    if (cancelled) { change(drag.origin); return; }
    if (!sameLayout(drag.origin, latest.current)) {
      const index = latest.current.findIndex(item => item.id === drag.id);
      const item = latest.current[index];
      setSaid(drag.kind === 'move' ? `Photo moved to place ${index + 1} of ${latest.current.length}.` : `Photo resized to ${sizeWords(item)}.`);
      save(latest.current);
    }
  }

  function begin(kind, event, id, onMove) {
    const drag = {
      kind, id, origin: latest.current, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY,
      moved: false, onMove,
      onUp: () => endGesture(false),
      onCancel: () => endGesture(true),
      onKey: key => { if (key.key === 'Escape') { key.preventDefault(); key.stopPropagation(); endGesture(true); } },
    };
    gesture.current = drag;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', drag.onUp);
    window.addEventListener('pointercancel', drag.onCancel);
    window.addEventListener('keydown', drag.onKey, true);
    return drag;
  }

  // ---- move: press anywhere on a photo (not its buttons) and drag ----
  function grab(event, id) {
    if (event.button !== 0 || gesture.current || busy || event.target.closest('.vis-x, .vis-size, .vis-frame')) return;
    const node = event.currentTarget;
    const drag = begin('move', event, id, move => {
      if (gesture.current !== drag) return;
      drag.lastX = move.clientX; drag.lastY = move.clientY;
      if (!drag.moved) {
        if (Math.hypot(move.clientX - drag.startX, move.clientY - drag.startY) < DRAG_START) return;
        drag.moved = true;
        drag.left = node.offsetLeft; drag.top = node.offsetTop;
        drag.swapX = move.clientX; drag.swapY = move.clientY;
        setLiftId(id);
      }
      follow();
      if (Math.hypot(move.clientX - drag.swapX, move.clientY - drag.swapY) < SWAP_GAP) return;
      // The photo under the pointer, by its place in the grid (not where a
      // slide has it right now).
      const box = grid.current.getBoundingClientRect();
      const px = move.clientX - box.left, py = move.clientY - box.top;
      const over = nodes().find(other => other.dataset.id !== id && px >= other.offsetLeft && px < other.offsetLeft + other.offsetWidth
        && py >= other.offsetTop && py < other.offsetTop + other.offsetHeight);
      if (!over) return;
      const list = latest.current;
      const from = list.findIndex(item => item.id === id), to = list.findIndex(item => item.id === over.dataset.id);
      if (from < 0 || to < 0 || from === to) return;
      const next = [...list];
      next.splice(to, 0, next.splice(from, 1)[0]);
      drag.swapX = move.clientX; drag.swapY = move.clientY;
      change(next);
    });
    node.setPointerCapture?.(event.pointerId);
  }

  // ---- resize: the corner handle snaps the photo to the grid ----
  function resizeStart(event, id) {
    if (event.button !== 0 || gesture.current || busy) return;
    event.stopPropagation();
    event.preventDefault();
    const style = getComputedStyle(grid.current);
    const gap = parseFloat(style.columnGap) || 0;
    const colStep = (grid.current.clientWidth - gap * (GRID.columns - 1)) / GRID.columns + gap;
    const rowStep = (parseFloat(style.gridAutoRows) || colStep) + gap;
    const start = latest.current.find(item => item.id === id);
    const drag = begin('size', event, id, move => {
      if (gesture.current !== drag) return;
      drag.moved = true;
      const w = clamp(start.w + Math.round((move.clientX - drag.startX) / colStep), GRID.minW, GRID.maxW);
      const h = clamp(start.h + Math.round((move.clientY - drag.startY) / rowStep), GRID.minH, GRID.maxH);
      const now = latest.current.find(item => item.id === id);
      if (now && (now.w !== w || now.h !== h)) change(latest.current.map(item => (item.id === id ? { ...item, w, h } : item)));
    });
    setSizingId(id);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  // ---- the keyboard: the grip moves, the handle resizes ----
  function moveKey(event, index) {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const to = index + step;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    next.splice(to, 0, next.splice(index, 1)[0]);
    change(next);
    setSaid(`Photo moved to place ${to + 1} of ${items.length}.`);
    saveSoon();
    const id = items[index].id;
    requestAnimationFrame(() => grid.current?.querySelector(`[data-id="${id}"] .vis-grip`)?.focus());
  }
  function sizeKey(event, index) {
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!delta) return;
    event.preventDefault();
    const item = items[index];
    const w = clamp(item.w + delta[0], GRID.minW, GRID.maxW), h = clamp(item.h + delta[1], GRID.minH, GRID.maxH);
    if (w === item.w && h === item.h) return;
    change(items.map(one => (one.id === item.id ? { ...one, w, h } : one)));
    setSaid(`Photo ${index + 1} is ${sizeWords({ w, h })}.`);
    saveSoon();
  }

  // Leaving the page: a waiting arrow-key save still goes, and a drag in
  // progress lets go of its window listeners.
  useEffect(() => () => {
    if (keyTimer.current) { clearTimeout(keyTimer.current); keyTimer.current = null; save(latest.current); }
    if (gesture.current) endGesture(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- unmount only

  // The frame pop-up: the photo's crop and shape. On save the board takes
  // the new values at once (it keeps its own layout over a refresh).
  function frame(id) {
    const item = latest.current.find(one => one.id === id);
    if (!item || gesture.current) return;
    openComposer({ kind: 'vision-frame', record: item, prefill: { gridWidth: grid.current?.clientWidth || 222 }, onSaved: result => {
      const saved = result?.item;
      if (saved) change(latest.current.map(one => (one.id === saved.id ? { ...one, x: saved.x, y: saved.y, zoom: saved.zoom, w: saved.w, h: saved.h } : one)));
    } });
  }

  const toggle = () => {
    if (gesture.current) endGesture(true);
    setEditing(on => !on);
    setError('');
  };

  return <section className={'panel vis' + (editing ? ' editing' : '')}>
    <RetroFilter />
    <PanelTitle icon={meta.icon} title="Vision" jp={meta.jp} flair={flair}>
      {editing && <>
        <button type="button" className="lk vis-add" disabled={busy || items.length >= 6} title={items.length >= 6 ? 'The board holds six photos' : undefined}
          onClick={() => picker.current?.click()}>{busy ? 'Saving' : 'Add photo'}</button>
        <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={upload} />
      </>}
      <button type="button" className="edit" aria-label="Edit vision board" title="Edit vision board" aria-pressed={editing} onClick={toggle}>
        <Icon name={editing ? 'check' : 'pen'} />
      </button>
    </PanelTitle>
    {items.length ? <div className="vis-strip">
      <div className="vis-grid" ref={grid}>
        {items.map((item, index) => <Photo key={item.id} item={item} index={index} count={items.length}
          editing={editing} busy={busy} sizing={sizingId === item.id} lifted={liftId === item.id}
          onGrab={event => grab(event, item.id)} onRemove={() => remove(item.id)} onResizeStart={event => resizeStart(event, item.id)}
          onMoveKey={event => moveKey(event, index)} onSizeKey={event => sizeKey(event, index)} onFrame={() => frame(item.id)} />)}
      </div>
    </div> : <p className="empty vis-none">No photos yet. Add the things you are working toward with the pencil.</p>}
    {editing && items.length > 0 && <p className="vis-hint">Drag a photo to move it, drag its corner to resize, or double click to frame it.</p>}
    <p className="vis-live" aria-live="polite">{said}</p>
    {error && <p className="empty vis-error" role="alert">{error}</p>}
  </section>;
}
