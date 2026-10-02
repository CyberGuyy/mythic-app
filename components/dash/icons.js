// Dash line icons on a 24 grid, drawn with the stroke (fill none, round caps).
// ICONS maps a name to the inner SVG markup; <Icon name="tasks" /> draws one
// and <IconBadge name="tasks" /> draws it in the 30px .hi heading badge.
// The first block is the P map; the rest come
// from features.js and bloom.js (habit icons for the flower's icon picker).
// Plain createElement so node --test can import the map.
import { createElement as h } from 'react';

export const ICONS = {
  // shared.js P map
  work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
  life: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  flame: '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z"/>',
  bolt: '<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  send: '<path d="M21 3L3 11l6 2 2 6 3-4 4 3z"/>',
  phone: '<path d="M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a1 1 0 0 1-1 1A17 17 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
  note: '<path d="M5 3h10l4 4v14H5z"/><path d="M9 12h6M9 16h6"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.5M4 12h.5M4 18h.5"/>',
  grid: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  spark: '<path d="M12 3v6M12 15v6M3 12h6M15 12h6"/>',
  // widget headings (features.js IC map)
  tasks: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  habits: '<path d="M17 2.5l3.5 3.5L17 9.5"/><path d="M3.5 11V9.5A3.5 3.5 0 0 1 7 6h13.5"/><path d="M7 21.5L3.5 18 7 14.5"/><path d="M20.5 13v1.5A3.5 3.5 0 0 1 17 18H3.5"/>',
  notes: '<path d="M6 3h9l4 4v14H6z"/><path d="M14.5 3v5h4.5M9 13h7M9 17h5"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/>',
  wish: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
  money: '<path d="M18 7V5a1 1 0 0 0-1-1H6a2 2 0 0 0 0 4h13a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V6"/><circle cx="16" cy="14" r="1.1"/>',
  vision: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  day: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  // Dash additions
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12h.01"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  drag: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  flower: '<path d="M12 12c-3-2.5-3-6.5 0-9 3 2.5 3 6.5 0 9z"/><path d="M12 12c-3.8.8-7-1.3-7.8-5 3.8-.8 7 1.3 7.8 5zM12 12c3.8.8 7-1.3 7.8-5-3.8-.8-7 1.3-7.8 5z"/><path d="M12 12v9M12 17c-2-1.8-4-2-6-1.5M12 18.5c2-1.8 4-2 6-1.5"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M2 6h14a2 2 0 0 1 2 2v14"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  // more habit icons (2026-09-23): food and macros, body, mind, life
  plate: '<path d="M7 3v18M4.5 3v4.5a2.5 2.5 0 0 0 5 0V3"/><path d="M17.5 21V3c-2.4 1.3-3.5 3.8-3.5 8h3.5"/>',
  macros: '<path d="M11 4a8 8 0 1 0 8.9 8.9H11z"/><path d="M14 3.1A8 8 0 0 1 20.9 10H14z"/>',
  egg: '<path d="M12 3C8.6 3 6 9 6 13a6 6 0 0 0 12 0c0-4-2.6-10-6-10z"/>',
  apple: '<path d="M12 7.5C10.3 6.2 6.6 6 5.2 9.2S5 16.2 6.8 18.6 10.4 21 12 20c1.6 1 3.4 1 5.2-1.4S20.2 12.4 18.8 9.2 13.7 6.2 12 7.5z"/><path d="M12 7.5c0-2 1-3.6 3-4.5"/>',
  bowl: '<path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0z"/><path d="M8 8c0-1.4.9-2 .9-3.5M12 8c0-1.4.9-2 .9-3.5M16 8c0-1.4.9-2 .9-3.5"/>',
  bottle: '<path d="M9.5 3h5M10.5 3v3.5L8 10v10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V10l-2.5-3.5V3"/><path d="M8 14h8"/>',
  pill: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M9.5 9.5l5 5"/>',
  coffee: '<path d="M4 9h13v4.5a6.5 6.5 0 0 1-6.5 6.5A6.5 6.5 0 0 1 4 13.5z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H16.5M8 3.5v2.5M12.5 3.5v2.5"/>',
  glass: '<path d="M7 3h10l-.4 5a4.6 4.6 0 0 1-9.2 0z"/><path d="M12 12.6V20.5M8 20.5h8"/>',
  hourglass: '<path d="M6 3h12M6 21h12M7 3c0 5 5 6.5 5 9s-5 4-5 9M17 3c0 5-5 6.5-5 9s5 4 5 9"/>',
  scale: '<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M8 9.5a5.6 5.6 0 0 1 8 0"/><path d="M12 10l1.6-2"/>',
  steps: '<path d="M8.5 3.5c1.7 0 2.6 2 2.4 4.4S9.8 12 8.5 12s-2.5-1.6-2.5-4 .8-4.5 2.5-4.5zM6.6 15h3.8v1.6a1.9 1.9 0 0 1-3.8 0z"/><path d="M15.5 7.5c1.7 0 2.5 2.1 2.5 4.4S16.8 16 15.5 16 13 14.4 13 12s.8-4.5 2.5-4.5zM13.6 19h3.8v.3a1.9 1.9 0 0 1-3.8 0z"/>',
  bike: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l3.5-7h5.5l3 7M9.5 9l3.5 7M8.5 6H12"/>',
  swim: '<path d="M3 16.5c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5M3 20.5c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5"/><circle cx="17" cy="6.5" r="2"/><path d="M5 12l5-4 3 3 2.5-1"/>',
  kettlebell: '<path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/><path d="M8 8.5h8l1.4 2.4a6.5 6.5 0 1 1-10.8 0z"/>',
  stretch: '<circle cx="12" cy="4.5" r="2"/><path d="M4.5 7.5l7.5 2.5 7.5-2.5M12 10v5l-4 6M12 15l4 6"/>',
  pulse: '<path d="M3 12h4l2.5-6 4.5 12 2.5-6H21"/>',
  mountain: '<path d="M3 20l6.5-11 4 6.5 2.5-3.5L21 20z"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5"/>',
  journal: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18M12.5 8H16M12.5 12H16"/>',
  brain: '<path d="M12 5.5a3 3 0 0 0-5.7 1.3A3 3 0 0 0 4.5 11.5a3 3 0 0 0 1.5 4.6A3 3 0 0 0 12 18.5z"/><path d="M12 5.5a3 3 0 0 1 5.7 1.3 3 3 0 0 1 1.8 4.7 3 3 0 0 1-1.5 4.6 3 3 0 0 1-6 2.4"/><path d="M12 5.5v13"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 2.5h5M18 6.5l1.5-1.5"/>',
  code: '<path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13.5 5l-3 14"/>',
  language: '<path d="M4 6h9M8.5 4v2c0 4-2 7.5-4.5 9M6 10c1.5 2.5 3.5 4 6 5"/><path d="M13 20.5l3.5-8.5 3.5 8.5M14.3 17.5h4.4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 1.9-1 1.5-2-.6-1.5.3-2.5 1.8-2.5h2c1.8 0 3.2-1.3 3.2-3.5 0-5-3.8-9-8.5-9z"/><path d="M7.5 11h.01M10 7.5h.01M14.5 7.5h.01"/>',
  camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
  tooth: '<path d="M7.5 3.5c-2.5 0-4 2-4 4.5 0 3 1.5 4.5 2 7s1 5.5 2.5 5.5 1.5-3 2-5 1-2 2-2 1.5 0 2 2 .5 5 2 5 2-3 2.5-5.5 2-4 2-7c0-2.5-1.5-4.5-4-4.5-2 0-2.5 1-4.5 1s-2.5-1-4.5-1z"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  broom: '<path d="M15 3l-3.5 9"/><path d="M7 11.5l8 3-2 6.5H5z"/><path d="M9 16.5l-1 4.5M11.5 17.5l-.8 3.5"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  screen: '<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16.5V20"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12c0-4-3-6.5-7-6.5 0 4 3 6.5 7 6.5zM12 14.5c0-3.5 2.5-6 6.5-6 0 3.5-2.5 6-6.5 6z"/>',
  // habit icons (bloom.js), offered by the flower's icon picker
  book: '<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z"/><path d="M12 6.5v13"/>',
  alarm: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2M5 4 2.5 6.5M19 4l2.5 2.5"/>',
  sunrise: '<path d="M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0M12 5v3.5M4.8 10.3l2 2M19.2 10.3l-2 2M8 21.5h8"/>',
  lotus: '<path d="M12 20c-4 0-8-2-9-6 3 0 5 1 6.5 3M12 20c4 0 8-2 9-6-3 0-5 1-6.5 3M12 20c-2.6-3-2.6-9 0-13 2.6 4 2.6 10 0 13z"/>',
  dumbbell: '<path d="M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11"/>',
  posture: '<circle cx="12" cy="4.5" r="2"/><path d="M12 7.5v8M8 10.5l4-1.5 4 1.5M12 15.5l-3 6M12 15.5l3 6"/>',
  droplet: '<path d="M12 3.5s6 6.2 6 10.5a6 6 0 0 1-12 0c0-4.3 6-10.5 6-10.5z"/>',
  leaf: '<path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15M5 19c3-5 6-8 10-10"/>',
  headphones: '<path d="M4 15v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14.5" width="4" height="6" rx="1.5"/><rect x="17" y="14.5" width="4" height="6" rx="1.5"/>',
  laptop: '<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M2.5 19h19"/>',
  phoneoff: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M3.5 4.5l17 15"/>',
  bed: '<path d="M3 18v-8M3 14h18v4M21 14v-1a3 3 0 0 0-3-3h-7v4"/><circle cx="7" cy="11" r="1.6"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.6c-.6-.8-1.5-1.2-2.5-1.2-1.6 0-2.7.8-2.7 2 0 2.7 5.4 1.2 5.4 3.8 0 1.2-1.2 2-2.8 2-1.1 0-2.1-.5-2.7-1.3M12 6.6v1.8M12 16.2v1.4"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  run: '<circle cx="14.5" cy="4.5" r="2"/><path d="M6 12.5l3.5-3.5 4 1.5 2 3.5 3.5 1M9.5 21l2.5-5-3-3M13 16l3.5 5"/>',
  // play and stop on a task row
  play: '<path d="M8.5 5.8v12.4l9.8-6.2z"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
  chat: '<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4.5 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>',
  talk: '<path d="M4 10v4M8 7v10M12 4.5v15M16 7v10M20 10v4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.2"/>',
  // Telegram on Connections: a paper plane
  telegram: '<path d="M20.6 4.3L3.4 11c-.7.3-.7 1.3 0 1.5l4.3 1.5 1.7 5.2c.2.6 1 .8 1.4.3l2.5-2.4 4.4 3.3c.5.4 1.3.1 1.4-.5l2.9-14.2c.2-.8-.6-1.4-1.4-1.1z"/><path d="M7.7 14l9.4-6.3-6 7.6"/>',
};

/** One line icon. The markup is the static map above, never user text. */
export function Icon({ name, size = 18, stroke = 1.8, className }) {
  return h('svg', {
    viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: stroke,
    strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, className,
    dangerouslySetInnerHTML: { __html: ICONS[name] || '' },
  });
}

/** The heading badge: a 30px rounded square on the panel tone. */
export function IconBadge({ name, stroke = 1.7 }) {
  return h('span', { className: 'hi', 'aria-hidden': true }, h(Icon, { name, size: 16, stroke }));
}
