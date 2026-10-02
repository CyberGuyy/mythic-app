// The habit icons the flower's picker offers: the bloom.js HI set, drawn from
// ICONS in components/dash/icons.js. Plain data so the client (the picker) and
// node (setHabitIcon's validation) import the same list.
// Grouped for the picker; HABIT_ICONS is every one of them, in this order.
export const HABIT_ICON_GROUPS = [
  ['Body', ['dumbbell', 'kettlebell', 'run', 'steps', 'bike', 'swim', 'stretch', 'posture', 'pulse', 'mountain', 'snow', 'bed', 'alarm', 'sunrise', 'day']],
  ['Food', ['plate', 'macros', 'egg', 'apple', 'bowl', 'bottle', 'pill', 'coffee', 'glass', 'droplet', 'hourglass', 'scale', 'flame']],
  ['Mind', ['lotus', 'book', 'journal', 'brain', 'timer', 'target', 'pen', 'code', 'language', 'headphones', 'music', 'mic', 'palette', 'camera']],
  ['Life', ['tooth', 'sparkle', 'broom', 'mail', 'chat', 'screen', 'phoneoff', 'laptop', 'coin', 'heart', 'leaf', 'sprout']],
];
export const HABIT_ICONS = HABIT_ICON_GROUPS.flatMap(([, icons]) => icons);

// Until you pick one, a habit's icon comes from its name, first match wins:
// "7+ hours of sleep" gets the bed and "Reading" the book, wherever they sit
// in the list. "am" only counts as a word or after a digit ("8am", "8 am").
const BY_NAME = [
  [/macro|protein|calorie|\bcarb|\bkcal/, 'macros'],
  [/\bmeal|\beat|food|\bcook|prep/, 'plate'],
  [/fast(ing)?\b/, 'hourglass'],
  [/weigh[- ]?in|weigh myself|body ?weight|\bscale\b/, 'scale'],
  [/vitamin|supplement|creatine|\bpills?\b/, 'pill'],
  [/coffee|caffeine/, 'coffee'],
  [/alcohol|no drinking|sober|\bbooze|\bbeer|\bwine/, 'glass'],
  [/fruit|\bveg/, 'apple'],
  [/sleep|\bbed/, 'bed'],
  [/\bwake|\bwoke|alarm|(?:\b|\d)am\b/, 'alarm'],
  [/meditat/, 'lotus'],
  [/\bread|\bbook|\bpages?\b/, 'book'],
  [/\bgym|\blift|\btrain/, 'dumbbell'],
  [/\bsteps?\b|10k/, 'steps'],
  [/\brun|\bwalk/, 'run'],
  [/\bbike|cycl/, 'bike'],
  [/\bswim/, 'swim'],
  [/\bchin|posture|\bneck/, 'posture'],
  [/stretch|\byoga|mobility/, 'stretch'],
  [/cardio|\bheart rate|\bzone 2/, 'pulse'],
  [/\bcold|\bice\b|plunge/, 'snow'],
  [/journal|\bdiary/, 'journal'],
  [/\bcode|coding|programm/, 'code'],
  [/language|spanish|japanese|russian|duolingo/, 'language'],
  [/\bfloss|\bteeth|\btooth/, 'tooth'],
  [/skin ?care/, 'sparkle'],
  [/\bclean|\btidy/, 'broom'],
  [/inbox|\bemail|\bmail/, 'mail'],
  [/screen ?time/, 'screen'],
  [/\bfocus|deep work|pomodoro/, 'timer'],
  [/\bfilm|\bphoto|content/, 'camera'],
  [/water/, 'droplet'],
  [/phone/, 'phoneoff'],
  [/music/, 'music'],
];

/** The icon a habit shows when none is picked yet, chosen from its name. */
export function defaultHabitIcon(name) {
  const text = String(name || '').toLowerCase();
  for (const [pattern, icon] of BY_NAME) if (pattern.test(text)) return icon;
  return 'leaf';
}
