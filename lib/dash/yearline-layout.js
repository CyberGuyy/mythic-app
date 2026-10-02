// lib/dash/yearline-layout.js
// Where the year line's labels go (components/dash/widgets/YearLine.jsx), at
// the width the track is drawn. Pure, so the browser runs it at the width it
// measures and the server at the 1440 px page's.
//
// Widths come from character counts, a Geist name at LABEL_CHARS's 0.56 em a
// character and a date, mostly figures, at MONO_CHARS's 0.6 em. Both are a
// little wide on purpose, so two labels that clear here clear on the page.
// em per character: a Geist name and a mostly-figures mono date
const LABEL_CHARS = 0.7;
const MONO_CHARS = 0.72;

/** The track on a 1440 px page; the server lays the labels out at this width. */
export const WIDE_TRACK = 1110;
/** The track on a 390 px phone (the page is 56 px narrower than the window). */
export const PHONE_TRACK = 334;
export const NAME_PX = 13 * LABEL_CHARS * 10 / 12.5; // a 13 px name: 7.28 px a character
export const DATE_PX = 12.5 * MONO_CHARS * 10 / 12; // a 12.5 px date: 7.5 px a character
const DATE_GAP = 7, PAD = 10, GAP = 8; // px: between name and date, the diamond's side, between two labels
// The fork (yearline.css .fork): 24 px wide from 1 px left of the now marker,
// in the row the labels above the line use. A label keeps clear of it.
export const FORK_PX = Object.freeze([-1, 23]);

/** A label's width in px: its name, and its date unless `short`. */
export const labelPx = (flag, short = false) => flag.name.length * NAME_PX + (!short && flag.on ? flag.on.length * DATE_PX + DATE_GAP : 0) + PAD;

const spanOf = (at, width, side) => (side === 'l' ? [at - width, at] : [at, at + width]);
// A flag as it came, without an earlier placement.
const PLACED = new Set(['lane', 'side', 'quiet', 'short']);
const bare = flag => Object.fromEntries(Object.entries(flag).filter(([key]) => !PLACED.has(key)));
const clear = (spans, [from, to], gap) => spans.every(([a, b]) => to + gap <= a || from >= b + gap);

/**
 * Where each flag's label goes, in date order, at a track `width` px wide.
 * A label sits left of its diamond (toward the time already gone) unless it
 * would run off the track or into a label already placed; then it tries the
 * right. When neither clears, its date is dropped first (`short`, the date
 * stays in its tooltip), then it goes to the row under the month labels
 * (lane 1), with its date and then without, then to a third row under that
 * (lane 2, projects only), which a phone with a branch waiting needs. When nothing clears, the label is
 * left off (`quiet`): the diamond stays and its tooltip carries the name, so
 * no two labels ever print over each other. With `fork_at` (the now marker,
 * as a %, when a branch is waiting) the fork's box is held in the top row
 * first, so no label is drawn across it.
 */
export function placeFlags(flags, { width = WIDE_TRACK, fork_at = null } = {}) {
  const pct = px => px / width * 100, gap = pct(GAP);
  const lanes = [[], [], []];
  if (typeof fork_at === 'number') lanes[0].push([fork_at + pct(FORK_PX[0]), fork_at + pct(FORK_PX[1])]);
  return flags.map(bare).map(flag => {
    // The third row is for projects; Year end alone never grows the line.
    for (const lane of flag.id === 'year-end' ? [0, 1] : [0, 1, 2]) for (const short of flag.on ? [false, true] : [false]) {
      const w = pct(labelPx(flag, short));
      for (const side of ['l', 'r']) {
        const span = spanOf(flag.at, w, side);
        if (span[0] < 0 || span[1] > 100 || !clear(lanes[lane], span, gap)) continue;
        lanes[lane].push(span);
        return { ...flag, lane, side, ...(short ? { short: true } : {}) };
      }
    }
    return { ...flag, lane: 0, side: flag.at > 50 ? 'l' : 'r', quiet: true };
  });
}

/** The printed label boxes as [from, to] percentages per lane, for checking overlaps. */
export const labelSpans = (flags, { width = WIDE_TRACK } = {}) => flags.filter(flag => !flag.quiet)
  .map(flag => ({ lane: flag.lane, span: spanOf(flag.at, labelPx(flag, !!flag.short) / width * 100, flag.side) }));
