'use client';
// Frame one vision photo: move it inside its frame and crop it tighter. The
// preview is the photo's own frame, drawn large with the same film look and
// the same placement maths as the board (lib/dash/vision-crop.js). Drag the
// photo to move it; the wheel or a pinch zooms about the pointer; the arrow
// keys move it and + and - zoom when the preview has focus. Crop sets how
// much of the photo shows (Full, 3/4, Half, Third or the slider); Shape
// sets the frame to cinema, wide, classic or square rows on the grid.
// Reset puts the photo back in the middle, uncropped.
import { useEffect, useRef, useState } from 'react';
import Composer from '../Composer.jsx';
import { Chip, Field } from '../fields/index.js';
import post from '../../post.js';
import { CROP, CROP_SIZES, SHAPES, cropStyle, frameAspect, panCrop, rowsForShape, zoomCrop } from '@/lib/dash/vision-crop.js';

const PREVIEW_W = 508;
const PREVIEW_MAX_H = 340;
const near = (a, b) => Math.abs(a - b) < 0.02;
const same = (a, b) => near(a.x, b.x) && near(a.y, b.y) && near(a.zoom, b.zoom) && a.w === b.w && a.h === b.h;

export default function VisionFrame({ entry, done, close, flair, active }) {
  const item = entry.record || {};
  const gridWidth = entry.prefill?.gridWidth || 222;
  const [start] = useState(() => ({ x: item.x ?? 0.5, y: item.y ?? 0.5, zoom: item.zoom ?? 1, w: item.w ?? 6, h: item.h ?? 6 }));
  const [crop, setCrop] = useState(start);
  const [natural, setNatural] = useState(null);
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const box = useRef(null);
  const drag = useRef(null);
  const latest = useRef(crop);
  useEffect(() => { latest.current = crop; });

  // The preview keeps the frame's shape: as wide as the pop-up allows, lower
  // for tall frames so it never runs off the screen.
  const aspect = frameAspect(crop.w, crop.h, gridWidth);
  const width = Math.min(PREVIEW_W, PREVIEW_MAX_H * aspect);
  const height = width / aspect;

  const frameSize = () => ({ fw: box.current?.clientWidth || width, fh: box.current?.clientHeight || height });
  const update = next => { setError(''); setCrop(current => ({ ...current, ...next(current) })); };

  function onPointerDown(event) {
    if (event.button !== 0 || !natural) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY };
    setMoving(true);
  }
  function onPointerMove(event) {
    if (!drag.current || !natural) return;
    const { fw, fh } = frameSize();
    const moveX = event.clientX - drag.current.x, moveY = event.clientY - drag.current.y;
    drag.current = { x: event.clientX, y: event.clientY };
    update(current => panCrop(current, moveX, moveY, fw, fh, natural.w, natural.h));
  }
  const onPointerUp = () => { drag.current = null; setMoving(false); };

  // The wheel (and a trackpad pinch, which arrives as a wheel with ctrl) zooms
  // about the pointer. A non-passive listener, so the page does not scroll.
  useEffect(() => {
    const node = box.current;
    if (!node || !natural) return undefined;
    const onWheel = event => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002));
      update(current => zoomCrop(current, current.zoom * factor, rect.width, rect.height, natural.w, natural.h, event.clientX - rect.left, event.clientY - rect.top));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [natural]);

  function onKeyDown(event) {
    if (!natural) return;
    const { fw, fh } = frameSize();
    const step = event.shiftKey ? 32 : 8;
    const pan = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[event.key];
    if (pan) { event.preventDefault(); update(current => panCrop(current, pan[0], pan[1], fw, fh, natural.w, natural.h)); return; }
    if (event.key === '+' || event.key === '=' || event.key === '-') {
      event.preventDefault();
      update(current => zoomCrop(current, current.zoom + (event.key === '-' ? -0.1 : 0.1), fw, fh, natural.w, natural.h));
    }
  }

  const zoomTo = zoom => {
    const { fw, fh } = frameSize();
    update(current => (natural ? zoomCrop(current, zoom, fw, fh, natural.w, natural.h) : { zoom }));
  };
  const shapeTo = ratio => update(current => ({ h: rowsForShape(current.w, ratio, gridWidth) }));
  const reset = () => update(() => ({ x: 0.5, y: 0.5, zoom: 1 }));

  async function save() {
    if (busy) return;
    setBusy(true); setError('');
    const { x, y, zoom, w, h } = latest.current;
    try { done(await post('/api/vision', { action: 'frame', id: item.id, x, y, zoom, w, h })); }
    catch (failure) { setError(failure.message); setBusy(false); }
  }

  const shapeOn = ratio => rowsForShape(crop.w, ratio, gridWidth) === crop.h;
  const centred = near(crop.x, 0.5) && near(crop.y, 0.5) && near(crop.zoom, 1);
  return <Composer kind="vision-frame" flair={flair} active={active} dirty={!same(start, crop)} busy={busy} error={error} wide
    onSave={save} onClose={close}
    aside={<button type="button" className="lk" disabled={busy || centred} onClick={reset}>Reset</button>}>
    <div className="vf-stage">
      <div ref={box} className={'vf-frame' + (moving ? ' moving' : '') + (natural ? '' : ' loading')} style={{ width, height }}
        role="application" tabIndex={0} aria-label="Photo in its frame. Drag or use the arrow keys to move it, the wheel or + and - to zoom."
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={onKeyDown}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a local photo route, placed by the crop */}
        <img src={item.src} alt="" draggable={false} style={cropStyle(crop)}
          onLoad={event => setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })} />
        <span className="vf-thirds" aria-hidden="true" />
        <span className="vf-stamp" aria-hidden="true">{item.stamp}</span>
      </div>
      <p className="vf-tip">{natural ? 'Drag to move the photo in its frame. Scroll or pinch to zoom.' : 'Loading the photo'}</p>
    </div>
    <Field label="Crop" icon="crop" id="vf-crop">
      <div className="vf-row">
        {CROP_SIZES.map(([label, zoom]) => <Chip key={label} on={near(crop.zoom, zoom)} onClick={() => zoomTo(zoom)}>{label}</Chip>)}
        <label className="vf-zoom">
          <input type="range" min={CROP.minZoom} max={CROP.maxZoom} step="0.01" value={crop.zoom} aria-label="Zoom"
            style={{ '--p': ((crop.zoom - CROP.minZoom) / (CROP.maxZoom - CROP.minZoom) * 100).toFixed(1) + '%' }}
            onChange={event => zoomTo(Number(event.target.value))} />
          <b>{crop.zoom.toFixed(2).replace(/\.?0+$/, '')}×</b>
        </label>
      </div>
    </Field>
    <Field label="Shape" icon="vision" id="vf-shape">
      <div className="vf-row">
        {SHAPES.map(([key, label, ratio]) => <Chip key={key} on={shapeOn(ratio)} onClick={() => shapeTo(ratio)}>{label}</Chip>)}
        <span className="vf-size">{crop.w} × {crop.h} on the board</span>
      </div>
    </Field>
  </Composer>;
}
