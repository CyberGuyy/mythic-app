'use client';
// The habit flower, as decided in the design artifact "Flower cracks and
// tiers" (version 38), drawn by components/dash/bloom/draw.js from what
// lib/dash/flower.js sends. One petal per habit grows from its first tick, a
// seventh a ticked day, and never shrinks. Missed days tear it and days in a
// row rot it; five in a row kill it, and the next tick grows a fresh petal
// while the husk withers away behind it. Every 14 good days unlock the next
// colour, which grows out from the middle of each petal with that habit's
// ticks; once it has grown through every petal it brings its bush stage,
// insect and world; Crimson's insect comes on the first thriving day. Thriving
// days (every petal full, nothing in a row still
// showing) add up and unlock the glow, pollen, dew and sunlight for good.
//
// The flower moves all the time while it is on screen (the world, insect and
// rewards), at most 30 frames a second, and holds still under reduced motion.
// A tick grows its petal with an ease and runs a light up it; healing eases in
// with the tick. What changed since the flower was last seen plays once: a
// new miss tears in, a colour unlocks or grows in, a reward arrives.
//
// The Look button opens a picker for the colour, world and insect, out of
// those already earned. Hovering a petal lights the habit's row in the Habits
// widget and back (components/dash/flower-hover.js).
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Icon } from '../icons.js';
import { PixelIcon, GLYPH } from '../pixel-icon.js';
import post from '../post.js';
import { openComposer } from '../composer/store.js';
import { useFlowerLink, setFlowerHover, onFlowerPulse, tickedNow, settlePending, tickHabit } from '../flower-hover.js';
import { G, B4, tipAt, extent, rim, ease } from '../flower-geo.js';
import { draw, g as GEO, H } from '../bloom/draw.js';
import { WORLDS, INSECT_OPTIONS } from '../bloom/scenery.js';
import { STYLES } from '@/lib/dash/flower-rules.js';
import { stateAt, growIn, dayNum, visitorCame, LADDER, WORLD_ORDER, WORLD_NAMES, TIER_DAYS, TOP_TIER } from '@/lib/dash/bloom-rules.js';

const PET = 14;   /* half the 28px .bl-pet circle */
const GROWS = 520, HEALS = 900, PULSE = 900, FALL = 3200, INTRO = 1600, BURST = 1400, HL = 180;
const FRAME = 1000 / 30;
const SEEN = 'mythic-flower-seen';
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/* tweens: a value easing from a0 to `to` over dur from t0 */
const at = (e, now) => e ? e.a0 + (e.to - e.a0) * ease(clamp((now - e.t0) / e.dur)) : 0;
function tween(map, key, to, now, dur, still, from = null) {
  const e = map.get(key);
  if (!e && from === null) { map.set(key, { a0: to, to, t0: now - dur, dur }); return false; }
  if (e && e.to === to && from === null) return false;
  const a0 = still ? to : from ?? at(e, now);
  map.set(key, { a0, to, t0: still ? now - dur : now, dur });
  return !still;
}
const moving = (map, now) => [...map.values()].some(e => now - e.t0 < e.dur);

/** The theme's --mute tone (the goal outline), read from the canvas's colour (flower.css). */
function toneOf(element, prop, fallback) {
  const value = element ? (prop ? getComputedStyle(element).getPropertyValue(prop).trim() : getComputedStyle(element).color) : '';
  const hex = value.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i), rgb = value.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
  if (hex) return hex.slice(1, 4).map(v => parseInt(v, 16));
  if (rgb) return rgb.slice(1, 4).map(Number);
  return fallback;
}

function readSeen() { try { return JSON.parse(localStorage.getItem(SEEN) || 'null'); } catch { return null; } }
function writeSeen(seen) { try { localStorage.setItem(SEEN, JSON.stringify(seen)); } catch { /* storage may be blocked */ } }

/* the time of day for the Daylight world, 0 at 6 in the morning */
const dayFrac = () => { const d = new Date(); return (((d.getHours() + d.getMinutes() / 60) - 6 + 24) % 24) / 24; };

/* a world fades out to the plate at the edge of the square, in dithered steps */
const softEdge = api => ({ ...api, sq: (i, j, side, col) => { const d = Math.hypot(i + .5 - G / 2, j + .5 - G / 2), f = (G * .5 - d) / (G * .1); if (f <= 0 || (f < 1 && B4[j & 3][i & 3] >= f)) return; api.sq(i, j, side, col); } });

/** What the flower shows: the colour, its insect and world, out of what is earned. */
export function resolveLook(state) {
  const look = state.look || {}, latest = look.tier === null || look.tier === undefined || look.tier > state.done;
  const tier = latest ? state.tier : look.tier;
  const worlds = state.worlds || ['none'], world = look.world && worlds.includes(look.world) ? look.world : worlds[worlds.length - 1];
  const insectTier = latest ? state.done : tier, pick = look.insects?.[insectTier] ?? 0;
  return { tier, from: latest && state.growing ? state.done : null, world, insectTier, insect: INSECT_OPTIONS[insectTier][Math.min(pick, INSECT_OPTIONS[insectTier].length - 1)], latest };
}

/** Each habit's petal with today's tick as it stands this moment, so a tick shows at once. */
function petalsNow(habits, lit, state, today) {
  const todayNum = dayNum(today);
  return habits.map((habit, k) => {
    let ticks = habit.ticks, off = habit.off;
    if (!habit.tracked) { if (!lit[k]) return null; ticks = '1'; off = todayNum - 1; }
    else ticks = ticks.slice(0, -1) + (lit[k] ? '1' : '0');
    if (!ticks.includes('1')) return null;
    const s = stateAt(ticks, ticks.length, k, off);
    const grow = state.growing ? growIn(ticks, state.unlock_index - (dayNum(habit.since || today) - dayNum(state.start)) + 1, ticks.length) : 1;
    return { ...s, grow, back: lit[k] ? 1 : 0 };
  });
}

export default function Flower({ data, theme }) {
  const router = useRouter();
  const { hover, pending } = useFlowerLink();
  const [size, setSize] = useState(0);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [picker, setPicker] = useState(null);   /* the flower's box when the Look picker opened, to place it beside */
  const [lookOver, setLookOver] = useState(null);   /* a look change shows at once, before the refresh lands */
  const cvRef = useRef(null), boxRef = useRef(null), sceneRef = useRef(null), shownRef = useRef([]), tonesRef = useRef(null);
  const anim = useRef({ gr: new Map(), bk: new Map(), gw: new Map(), intro: new Map(), hl: new Map(), pulses: [], falls: new Map(), burst: null, raf: 0, last: 0, t0: 0, visible: true, ready: false });

  const habits = (data?.habits || []).slice(0, H);
  const state = data?.state;
  const n = habits.length;
  const hv = habits.findIndex(habit => habit.id === hover);
  const lit = habits.map(habit => tickedNow(habit, pending));
  const litKey = lit.join(',');
  const over = lookOver && lookOver.of === data ? lookOver.change : null;   /* dropped once the refresh lands */
  const look = state ? resolveLook({ ...state, look: { ...state.look, ...over } }) : null;
  const petals = useMemo(() => state ? petalsNow(habits, lit, state, data.today) : [], [data, litKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { settlePending(habits); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const toastTimer = useRef(0);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const say = (main, sub) => { setToast({ main, sub }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 3200); };

  /* the scene the frames draw, kept current on every render */
  useEffect(() => {
    if (!state) { sceneRef.current = null; return; }
    const unlocks = new Set(state.unlocks);
    sceneRef.current = { petals, look, state, thriving: state.thriving, streak: state.thriving_streak, unlocks, hv, n };
    shownRef.current = habits;
  });

  const paint = (now = performance.now()) => {
    const cv = cvRef.current, scene = sceneRef.current, an = anim.current;
    if (!cv || !scene) return;
    const still = reducedMotion(), T = still ? 8 : (now - an.t0) / 1000;
    const { look: lk, state: st, unlocks } = scene;
    const ps = Array.from({ length: H }, (_, k) => {
      const p = scene.petals[k]; if (!p) return null;
      const id = shownRef.current[k]?.id, fall = an.falls.get(id);
      const pulse = an.pulses.filter(x => x.h === k).map(x => (now - x.t0) / PULSE).find(v => v >= 0 && v < 1);
      return {
        ...p,
        growth: at(an.gr.get(id), now), tier: lk.tier,
        from: lk.from, grow: lk.from !== null ? at(an.gw.get(id), now) : 1,
        misses: p.misses.map(m => ({ ...m, back: at(an.bk.get(id), now), intro: an.intro.has(id + ':' + m.day) ? at(an.intro.get(id + ':' + m.day), now) : 1 })),
        fall: fall ? clamp((now - fall) / FALL) : null,
        pulse,
      };
    });
    const glow = unlocks.has('glow') ? (scene.thriving ? Math.max(1, Math.min(7, scene.streak)) : 1) : 0;
    const fx = {
      time: T, glow, glowIn: scene.thriving ? 1 : .3,
      pollen: unlocks.has('pollen') ? 1 : 0, dew: unlocks.has('dew') ? 1 : 0, sun: unlocks.has('sun') ? 1 : 0,
      bush: st.done, bushTier: lk.tier, aurora: lk.tier >= 4 && lk.tier <= st.done ? 1 : 0,
      burst: an.burst ? clamp((now - an.burst) / BURST) : 0,
    };
    const tones = tonesRef.current || {}, world = lk.world !== 'none' ? WORLDS[lk.world] : null;
    draw(cv, ps, {
      box: [0, 0, G, G], fx, mute: tones.mute,
      env: { dayFrac: dayFrac(), stars: st.thriving_total },
      under: world ? api => world.under(softEdge(api)) : null,
      over: api => {
        if (world?.over) world.over(softEdge(api));
        if (visitorCame(st, lk.insectTier) && lk.insect) lk.insect.over(api);
        /* the hover highlight: the hovered petal's outline, filled or not, in the theme's text tone */
        for (let h = 0; h < H; h++) {
          const a = at(an.hl.get(h), now); if (a <= 0 || !ps[h] && !shownRef.current[h]) continue;
          api.ctx.globalAlpha = .85 * a;
          for (const [i, j] of rim(GEO)[h]) api.sq(i, j, .72, tones.txt || [226, 224, 220]);
          api.ctx.globalAlpha = 1;
        }
      },
    });
  };

  /* the frame loop: runs while the flower is on screen, at most 30 frames a second */
  const loop = () => {
    const an = anim.current;
    if (an.raf) return;
    const step = now => {
      an.raf = 0;
      const still = reducedMotion();
      if (now - an.last >= FRAME || still) { an.last = now; paint(now); }
      an.pulses = an.pulses.filter(x => now - x.t0 < PULSE + 100);
      if (an.burst && now - an.burst > BURST) an.burst = null;
      for (const [id, t0] of an.falls) if (now - t0 > FALL + 200) an.falls.delete(id);
      const busy = an.pulses.length || an.burst || an.falls.size || moving(an.gr, now) || moving(an.bk, now) || moving(an.gw, now) || moving(an.intro, now) || moving(an.hl, now);
      if (an.visible && !document.hidden && (!still || busy)) an.raf = requestAnimationFrame(step);
    };
    an.raf = requestAnimationFrame(step);
  };

  /* tween every petal's growth, healing and new colour toward the current state; a petal starting fresh grows from nothing */
  useEffect(() => {
    const an = anim.current, now = performance.now(), still = reducedMotion() || !an.ready;
    habits.forEach((habit, k) => {
      const p = petals[k], id = habit.id;
      const restarting = p?.restart && !an.falls.has(id) && an.ready && (an.gr.get(id)?.to ?? 0) > 0 && !still;
      if (restarting) { an.falls.set(id, now); tween(an.gr, id, p.growth, now + 500, GROWS * 2, false, 0); }
      else tween(an.gr, id, p ? p.growth : 0, now, GROWS, still);
      tween(an.bk, id, p ? p.back : 0, now, HEALS, still);
      tween(an.gw, id, p ? p.grow : 1, now, GROWS, still);
    });
    an.ready = true;
    loop();
  }, [data, litKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* what changed since the flower was last seen plays once: a new tear, a colour, a reward */
  useEffect(() => {
    if (!state) return;
    const an = anim.current, now = performance.now(), still = reducedMotion();
    const seen = readSeen(), first = !seen;
    const next = { tier: state.tier, done: state.done, unlocks: state.unlocks, thrived: state.thriving_total > 0, misses: {} };
    habits.forEach((habit, k) => {
      const p = petals[k], latest = p?.misses?.filter(m => m.age === 1).map(m => m.day) || [];
      next.misses[habit.id] = Math.max(0, ...(p?.misses || []).map(m => m.day));
      if (first || still) return;
      for (const day of latest) if (day > (seen.misses?.[habit.id] || 0)) tween(an.intro, habit.id + ':' + day, 1, now + 500 + k * 260, INTRO, false, 0);
    });
    if (!first && !still) {
      const fresh = state.unlocks.filter(id => !(seen.unlocks || []).includes(id));
      const announce = (main, sub) => { toastTimer.current = setTimeout(() => say(main, sub), 450); };
      if (state.tier > (seen.tier ?? 0)) { an.burst = now + 300; announce(`${STYLES[state.tier][0]} unlocked`, 'tick your habits to grow it into every petal'); }
      else if (state.done > (seen.done ?? 0)) {
        an.burst = now + 300;
        const brings = [WORLD_NAMES[WORLD_ORDER[state.done]] + ' unlocked', INSECT_OPTIONS[state.done][state.look?.insects?.[state.done] ?? 0].name.toLowerCase() + ' visits'];
        announce(`${STYLES[state.done][0]} has grown in`, brings.join(' · '));
      } else if (state.thriving_total > 0 && !seen.thrived) {
        an.burst = now + 300;
        announce(`A ${INSECT_OPTIONS[0][state.look?.insects?.[0] ?? 0].name.toLowerCase()} visits`, 'your first thriving day');
      } else if (fresh.length) { an.burst = now + 300; announce(LADDER.find(([, id]) => id === fresh[fresh.length - 1])[2] + ' unlocked', `${state.thriving_total} thriving days`); }
    }
    writeSeen(next);
    loop();
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  /* the hover highlight fades in on the hovered petal and out on the one left */
  useEffect(() => {
    const an = anim.current, now = performance.now(), still = reducedMotion();
    for (let h = 0; h < H; h++) tween(an.hl, h, h === hv ? 1 : 0, now, HL, still);
    loop();
  }, [hv]); // eslint-disable-line react-hooks/exhaustive-deps

  /* a tick runs a light up its petal */
  useEffect(() => onFlowerPulse(id => {
    if (reducedMotion()) return;
    const h = shownRef.current.findIndex(habit => habit.id === id);
    if (h < 0) return;
    anim.current.pulses.push({ h, t0: performance.now() + 120 });
    loop();
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  /* the theme's tones, read from the page */
  useEffect(() => {
    tonesRef.current = { mute: toneOf(cvRef.current, null, theme === 'yoru' ? [120, 116, 108] : [140, 138, 132]), txt: toneOf(cvRef.current, '--txt', theme === 'yoru' ? [236, 231, 220] : [226, 224, 220]) };
    paint();
  }, [theme]);

  /* run only while on screen and the tab is showing */
  useEffect(() => {
    const an = anim.current, box = boxRef.current;
    an.t0 = performance.now() - 8000;
    if (!box) return undefined;
    const resize = new ResizeObserver(() => { setSize(box.clientWidth); paint(); });
    resize.observe(box);
    const seen = new IntersectionObserver(([entry]) => { an.visible = entry.isIntersecting; if (an.visible) loop(); });
    seen.observe(box);
    const wake = () => { if (!document.hidden) loop(); };
    document.addEventListener('visibilitychange', wake);
    return () => { resize.disconnect(); seen.disconnect(); document.removeEventListener('visibilitychange', wake); if (an.raf) cancelAnimationFrame(an.raf); an.raf = 0; };
  }, [n > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const tick = habit => {
    setError('');
    tickHabit(habit).then(() => router.refresh(), problem => setError(problem.message));
  };

  const choose = async change => {
    setError('');
    const next = { ...over, ...('tier' in change ? { tier: change.tier } : {}), ...('world' in change ? { world: change.world } : {}), ...('insect' in change ? { insects: Object.assign([...(over?.insects || state.look.insects)], { [change.insect.tier]: change.insect.index }) } : {}) };
    setLookOver({ of: data, change: next });
    try { await post('/api/flower', { action: 'look', ...change }); router.refresh(); } catch (problem) { setLookOver(null); setError(problem.message); }
  };

  const move = event => {
    const cv = cvRef.current, rect = cv.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width * G, py = (event.clientY - rect.top) / rect.height * G;
    /* the petal's whole outline answers the pointer, filled or not */
    let best = -1, bd = 3.5;
    for (let h = 0; h < n; h++) for (const c of GEO.byT[h]) { const dd = Math.hypot(c[0] + .5 - px, c[1] + .5 - py); if (dd < bd) { bd = dd; best = h; } }
    setFlowerHover(best >= 0 ? habits[best].id : null);
    cv.style.cursor = best >= 0 ? 'pointer' : '';
  };

  if (!n) return <section className="panel flower" aria-label="Flower">
    <p className="empty">No habits yet, so the flower has no petals. <button type="button" className="lk" onClick={() => openComposer({ kind: 'habit', prefill: { count: 0, limit: 5 } })}>Add a habit</button> and each one grows a petal.</p>
  </section>;

  // The flower is not centred in its square: one petal points up and the rest
  // down. --bl-shift moves the box by the difference so the silhouette, icons
  // included, has equal air on each side; worked out on the full outline, so
  // the flower never moves as it fills.
  const side = size || 300, unit = side / G, cf = side / G;
  const [top0, bottom0, left0, right0] = extent(GEO);
  let high = top0 * unit, low = bottom0 * unit, west = left0 * unit, east = right0 * unit;
  for (let k = 0; k < n; k++) {
    const [x, y] = tipAt(k, H);
    high = Math.min(high, y * unit - PET); low = Math.max(low, y * unit + PET);
    west = Math.min(west, x * unit - PET); east = Math.max(east, x * unit + PET);
  }
  const shift = ((side - low) - high) / 2, shiftX = ((side - east) - west) / 2;

  const top = state.tier >= TOP_TIER, name = STYLES[state.tier][0];
  const colourLine = state.growing ? <><b>{name}</b> is growing in</>
    : top ? <><b>{name}</b> · the last colour</>
      : <><b>{state.toward} of {TIER_DAYS}</b> good days to {state.next_name}</>;
  const rewards = state.unlocks.map(id => LADDER.find(([, x]) => x === id)[2]);
  const thriveLine = state.thriving ? <>Thriving, day {state.thriving_streak}{rewards.length ? ` · ${rewards.join(', ')}` : ''}</>
    : state.thriving_total ? <>{state.thriving_total} thriving day{state.thriving_total === 1 ? '' : 's'}{rewards.length ? ` · ${rewards.join(', ')}` : ''}</>
      : <>Fill every petal to thrive</>;

  return <section className="panel flower" aria-label="Flower">
    <div className="bl-fig">
      <div className="bl-cv" ref={boxRef} style={{ '--bl-shift': shift.toFixed(1) + 'px', '--bl-shift-x': shiftX.toFixed(1) + 'px' }}>
        <canvas ref={cvRef} onMouseMove={move} onMouseLeave={() => { setFlowerHover(null); if (cvRef.current) cvRef.current.style.cursor = ''; }}
          onClick={() => { if (hv >= 0) tick(habits[hv]); }} aria-hidden="true" />
        <div className="bl-pets">
          {/* each habit's icon past its petal tip, a dot glyph on the flower's half-cell grid */}
          {size > 0 && habits.map((habit, k) => {
            const [x, y] = tipAt(k, H);
            const pitch = cf / 2, span = GLYPH * pitch;
            const snap = v => Math.round((v * cf - span / 2) / pitch) * pitch + span / 2;
            return <button key={habit.id} type="button" className={['bl-pet', lit[k] && 'on', hv === k && 'hv', !petals[k] && 'bare'].filter(Boolean).join(' ')}
              style={{ left: snap(x).toFixed(2) + 'px', top: snap(y).toFixed(2) + 'px', width: span.toFixed(2) + 'px', height: span.toFixed(2) + 'px', '--k': k }}
              title={habit.tracked ? `${habit.name} · ${habit.streak} day streak` : `${habit.name} · a tick starts its petal`} aria-label={`${lit[k] ? 'Untick' : 'Tick'} ${habit.name}`} aria-pressed={lit[k]}
              onMouseEnter={() => setFlowerHover(habit.id)} onMouseLeave={() => setFlowerHover(null)} onFocus={() => setFlowerHover(habit.id)} onBlur={() => setFlowerHover(null)}
              onClick={() => tick(habit)}>
              <PixelIcon name={habit.icon} pitch={pitch} />
            </button>;
          })}
        </div>
        <div className={'bl-toast' + (toast ? ' show' : '')} aria-live="polite">{toast && <>{toast.main}<small>{toast.sub}</small></>}</div>
      </div>
      <div className="bl-cap">
        <div className="bl-up">
          <div className="bl-meter" title={state.growing ? `Each tick grows ${name} further into its petal` : `A good day is ${state.keep} of ${n} habits ticked`} aria-label={state.growing ? `${name} is growing in` : `${state.toward} of ${TIER_DAYS} good days`}>
            {Array.from({ length: TIER_DAYS }, (_, i) => <i key={i} className={state.growing || top || i < state.toward ? 'y' : undefined} />)}
          </div>
          <p className="bl-line">{colourLine}</p>
          <button type="button" className="bl-btn" aria-expanded={!!picker} onClick={() => setPicker(open => open ? null : { rect: boxRef.current.getBoundingClientRect(), root: boxRef.current.closest('.dash-root') })}>
            <Icon name="flower" size={15} stroke={1.7} />Look
          </button>
        </div>
        <p className="bl-thrive">{thriveLine}</p>
        {picker && <LookPicker state={state} look={look} anchor={picker.rect} root={picker.root} onPick={choose} onClose={() => setPicker(null)} />}
        {error && <p className="bl-err" role="alert">{error}</p>}
      </div>
    </div>
  </section>;
}

/** The look picker: a colour, a world and the colour's insect, out of those
 *  earned; the rest show what unlocks them. It opens beside the flower, so the
 *  flower stays in view while you choose. */
const PICK_W = 360;
function LookPicker({ state, look, anchor, root, onPick, onClose }) {
  const ref = useRef(null);
  const place = !anchor ? null
    : anchor.right + 16 + PICK_W <= window.innerWidth - 12 ? { left: anchor.right + 16, top: anchor.top + anchor.height / 2 }
      : anchor.left - 16 - PICK_W >= 12 ? { left: anchor.left - 16 - PICK_W, top: anchor.top + anchor.height / 2 } : null;
  useEffect(() => {
    const away = event => { if (ref.current && !ref.current.contains(event.target) && !event.target.closest?.('.bl-btn')) onClose(); };
    const esc = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [onClose]);
  const swatch = t => `linear-gradient(135deg, rgb(${STYLES[t][1][1].join(',')}), rgb(${STYLES[t][1][3].join(',')}))`;
  const insects = INSECT_OPTIONS[look.insectTier], picked = state.look.insects[look.insectTier] ?? 0;
  const box = <div className={'bl-look' + (place ? ' side' : '')} ref={ref} role="dialog" aria-label="Look" style={place ? { left: place.left, top: place.top, width: PICK_W } : undefined}>
    <div className="bl-lrow">
      <span className="bl-lab">Colour</span>
      <div className="bl-opts">
        <button type="button" className="bl-opt" aria-pressed={look.latest} onClick={() => onPick({ tier: null })}><i className="sw" style={{ background: swatch(state.tier) }} />Newest</button>
        {STYLES.map(([nm], t) => {
          const open = t <= state.done;
          return <button key={nm} type="button" className="bl-opt" aria-pressed={!look.latest && look.tier === t} disabled={!open}
            title={open ? nm : t === state.tier ? `${nm} is growing in` : `Unlocks after ${TIER_DAYS * t} good days`} onClick={() => onPick({ tier: t })}>
            <i className="sw" style={{ background: open ? swatch(t) : undefined }} />{nm}
          </button>;
        })}
      </div>
    </div>
    <div className="bl-lrow">
      <span className="bl-lab">World</span>
      <div className="bl-opts">
        {WORLD_ORDER.map((id, t) => {
          const open = state.worlds.includes(id);
          return <button key={id} type="button" className="bl-opt" aria-pressed={look.world === id} disabled={!open}
            title={open ? WORLD_NAMES[id] : `Comes with ${STYLES[t][0]}`} onClick={() => onPick({ world: id })}>{WORLD_NAMES[id]}</button>;
        })}
      </div>
    </div>
    <div className="bl-lrow">
      <span className="bl-lab">Visitor</span>
      <div className="bl-opts">
        {insects.map((option, index) => <button key={option.name} type="button" className="bl-opt" aria-pressed={picked === index} disabled={!visitorCame(state, look.insectTier)}
          title={visitorCame(state, look.insectTier) ? option.name : look.insectTier ? `Comes once ${STYLES[look.insectTier][0]} has grown in` : 'Comes on your first thriving day'}
          onClick={() => onPick({ insect: { tier: look.insectTier, index } })}>{option.name}</button>)}
      </div>
    </div>
  </div>;
  /* beside the flower it is drawn at the top of the dashboard, over every other widget */
  return place && root ? createPortal(box, root) : box;
}
