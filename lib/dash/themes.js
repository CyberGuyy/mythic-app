// The Dash theme. A theme is a skin: one entry here plus one CSS file under
// app/dash/themes/<id>.css with every rule under .dash-root[data-theme="<id>"].
// It restyles colour, type and framing; spacing and sizes live in dash.css.
// The skeleton: the top is the date header, the plate (flower | habits) and
// the year line; the left column is vision and sleep; the right area is tasks
// beside today and notes, with the calendar last across both columns.
// Pure data, safe to import from client components.

const SKELETON = {
  top: [{ id: 'header' }, { id: 'flower' }, { id: 'habits' }, { id: 'yearline' }],
  left: [{ id: 'vision' }, { id: 'sleep' }],
  right: [{ id: 'tasks' }, { id: 'today' }, { id: 'notes' }, { id: 'calendar' }],
};
const copy = layout => JSON.parse(JSON.stringify(layout));

export const THEMES = {
  yoru: {
    id: 'yoru', name: 'Yoru', tagline: '90s Japanese night photography',
    layout: copy(SKELETON),
    // sky: the halftone behind the header; jp: Japanese subtitles on
    // headings; mark: text after the wordmark.
    flair: { sky: 'halftone', jp: true, mark: '夜' },
  },
};

export const DEFAULT_THEME = 'yoru';
export const themeIds = () => Object.keys(THEMES);
export const isTheme = id => typeof id === 'string' && Object.hasOwn(THEMES, id);
export const themeOf = id => THEMES[isTheme(id) ? id : DEFAULT_THEME];
