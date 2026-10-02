import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { addHabit, setHabitCheck, shiftDay } from '../simple/habits.js';
import { ensureFlower, ensureHabitIcons, setHabitIcon, readFlower, habitsWithIcons, flowerView, startFresh, resetHabits, setLook, tickRows } from './flower.js';
import { keepFor, STYLES, DAYS, NEED, FILL, ladder, growthOf } from './flower-rules.js';
import { petal, geometry, extent, rim, drawn, goal, goalParts, outline, bushFill, LAYER_STAGE, GOAL_RIM, GOAL_FILL, regrowLight, petalScale, BUD, G } from '../../components/dash/flower-geo.js';
import { HABIT_ICONS, defaultHabitIcon } from './flower-icons.js';
import { ICONS } from '../../components/dash/icons.js';

const TODAY = '2026-09-23';
const made = new Date('2026-07-01T09:00:00Z');
const fresh = () => { const db = new Database(':memory:'); ensureHabitIcons(db); ensureFlower(db); return db; };
const five = db => ['Read', 'Wake at 8', 'Meditate', 'Gym', 'Chin tucks'].map(name => addHabit(db, { name, time_of_day: 'morning', now: made }));
/** Tick the first `per` habits on each of `days` days ending `end`. */
const keepDays = (db, ids, end, days, per = 3) => { for (let back = 0; back < days; back += 1) ids.slice(0, per).forEach(id => setHabitCheck(db, id, shiftDay(end, -back), true)); };
const abs0 = Math.round(Date.parse(TODAY + 'T12:00:00Z') / 86400000) - (DAYS - 1);

test('the KEEP rule is 3 of 5, as a share, never below one', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 8].map(keepFor), [1, 2, 2, 3, 3, 4, 5]);
});

test('every habit icon is a line icon in the shared map, and the ladder is the fixed six', () => {
  for (const name of HABIT_ICONS) assert.ok(ICONS[name], name);
  assert.deepEqual(STYLES.map(style => style[0]), ['Crimson', 'Ember', 'Gold', 'Jade', 'Frost', 'Iris']);
  assert.equal(ladder()[3].brings, 'vines');
  assert.equal(ladder()[0].brings, '');
});

test('a habit with no icon picked gets one from its name, not its place in the list', () => {
  const cases = {
    '7+ hours of sleep': 'bed', 'In bed by 11': 'bed', '8 am wake up time': 'alarm', 'Up at 6am': 'alarm', 'Wake at 8': 'alarm',
    Meditating: 'lotus', 'Meditate 5 minutes': 'lotus', Reading: 'book', 'Read 20 pages': 'book', 'Finish a book': 'book',
    'Go to the gym': 'dumbbell', 'Lift weights': 'dumbbell', 'Training': 'dumbbell', 'Morning run': 'run', 'Walk 10k steps': 'steps',
    'Chin tucks': 'posture', 'Posture check': 'posture', 'Neck stretch': 'posture', 'Drink water': 'droplet', 'No phone after 10': 'phoneoff',
    'Practise music': 'music', 'Journal': 'journal', 'Program for an hour': 'leaf', 'Instagram detox': 'leaf', '': 'leaf',
    'Hit my macros': 'macros', '150g protein': 'macros', 'Meal prep': 'plate', 'Morning weigh-in': 'scale', 'Take creatine': 'pill',
    'No alcohol': 'glass', '16:8 fasting': 'hourglass', 'Cold shower': 'snow', 'Floss': 'tooth', 'Deep work block': 'timer',
  };
  for (const [name, icon] of Object.entries(cases)) assert.equal(defaultHabitIcon(name), icon, name);
  for (const icon of Object.values(cases)) assert.ok(HABIT_ICONS.includes(icon), icon);
  const db = fresh();
  // listHabits sorts morning first, so a position-based default would give the sleep habit the book.
  for (const [name, time] of [['Chin tucks', 'evening'], ['Reading', 'afternoon'], ['Meditating', 'morning'], ['7+ hours of sleep', 'morning'], ['8 am wake up time', 'morning']]) addHabit(db, { name, time_of_day: time, now: made });
  const icons = Object.fromEntries(habitsWithIcons(db).map(habit => [habit.name, [habit.icon, habit.icon_picked]]));
  assert.deepEqual(icons, { '7+ hours of sleep': ['bed', false], '8 am wake up time': ['alarm', false], Meditating: ['lotus', false], Reading: ['book', false], 'Chin tucks': ['posture', false] });
  const reading = habitsWithIcons(db).find(habit => habit.name === 'Reading');
  setHabitIcon(db, reading.id, 'coin');
  assert.deepEqual(habitsWithIcons(db).find(habit => habit.name === 'Reading').icon, 'coin', 'a picked icon wins over the name');
});

test('habits get an icon column once, and only a known icon is stored', () => {
  const db = fresh();
  ensureHabitIcons(db);
  const [id] = five(db);
  assert.ok(db.prepare('PRAGMA table_info(habits)').all().some(column => column.name === 'icon'));
  assert.equal(setHabitIcon(db, id, 'lotus'), 'lotus');
  assert.equal(habitsWithIcons(db).find(habit => habit.id === id).icon, 'lotus');
  assert.equal(habitsWithIcons(db).find(habit => habit.id === id).icon_picked, true);
  assert.throws(() => setHabitIcon(db, id, 'rocket'), /habit icons/);
  assert.throws(() => setHabitIcon(db, 'missing', 'book'), /not found/);
  assert.equal(setHabitIcon(db, id, null), null);
  assert.equal(habitsWithIcons(db).find(habit => habit.id === id).icon_picked, false);
});

test('extent() is the goal outline: it fits its square and is the same for every bush stage and every growth', () => {
  for (const H of [1, 5, 8]) {
    const g = geometry(H);
    const box = extent(g, 0);
    const [top, bottom, left, right] = box;
    assert.ok(top >= 0 && bottom <= G && top < bottom && left < right);
    // the centring box does not move as the bush fills in or the petals grow
    assert.deepEqual(extent(g, 5), box, 'bush 0 and bush 5');
    assert.deepEqual(extent(g, 0, Array(H).fill(0)), extent(g, 0, Array(H).fill(1)), 'growth 0 and 1');
    // and everything the goal draws (on the canvas: the dust of full bloom reaches past its edge) and whatever is filled lies inside it
    const on = v => Math.min(G, Math.max(0, v));
    for (const [i, j, , side] of goal(g)) assert.ok(on(j + .5 - side / 2) >= top - 1e-9 && on(j + .5 + side / 2) <= bottom + 1e-9 && on(i + .5 - side / 2) >= left - 1e-9 && on(i + .5 + side / 2) <= right + 1e-9);
    for (const growth of [1 / 14, 1]) for (let h = 0; h < H; h++) for (const [i, j] of drawn(g, h, growth)) {
      assert.ok(j + .5 - .41 >= top - 1e-9 && j + .5 + .41 <= bottom + 1e-9 && i + .5 - .41 >= left - 1e-9 && i + .5 + .41 <= right + 1e-9);
    }
  }
});

test('the goal outline is every petal at full size and every bush stage, whatever is ticked or reached', () => {
  const key = c => c[0] + ',' + c[1];
  for (const H of [1, 5, 8]) {
    const g = geometry(H), cells = goal(g);
    assert.equal(goal(g), cells, 'built once per geometry, with no ticks or bush stage in it');
    const expected = new Set([...g.track, ...g.shape, ...g.vines, ...g.dust].map(key));
    assert.deepEqual(new Set(cells.map(key)), expected, 'the full petals plus every stage');
    // every petal's full shape is in it, and every dithered bush cell of every stage
    for (const c of [...g.track, ...g.deco]) assert.ok(expected.has(key(c)));
    assert.deepEqual([...new Set(g.deco.map(c => c[6]))].sort(), [0, 1, 2], 'the back row, the outer ring and the extra petals');
    assert.ok(g.vines.length > 0 && g.dust.length > 0);
    // faint: a rim at GOAL_RIM, a dotted inside at GOAL_FILL, nothing louder
    for (const [, , a] of cells) assert.ok([0, GOAL_FILL, GOAL_RIM].includes(a));
    assert.ok(GOAL_RIM <= .4 && GOAL_FILL <= .12);
    const rimKeys = new Set(rim(g).flat().map(key));
    for (const c of cells.slice(0, g.track.length)) assert.equal(c[2] === GOAL_RIM, rimKeys.has(key(c)), 'a petal is outlined by its rim');
    const inside = cells.filter(c => c[2] !== GOAL_RIM);
    assert.ok(inside.some(c => c[2] === GOAL_FILL) && inside.some(c => c[2] === 0), 'the inside is dotted, not solid');
    for (let h = 0; h < H; h++) assert.ok(rim(g)[h].length > 8, 'every petal has an outline');
  }
});

test('before the reveal the outline is exactly the petals; after it, the petals and every bush stage', () => {
  const key = c => c[0] + ',' + c[1];
  for (const H of [1, 5, 8]) {
    const g = geometry(H), before = outline(g, false);
    assert.equal(before.length, g.track.length);
    assert.deepEqual(new Set(before.map(key)), new Set(g.track.map(key)), 'the petals at full size, nothing of the bush');
    const bushKeys = new Set([...g.shape, ...g.vines, ...g.dust].map(key)), petalKeys = new Set(g.track.map(key));
    assert.ok(before.every(c => petalKeys.has(key(c))));
    assert.equal(outline(g, true), goal(g), 'after the reveal: the whole goal');
    assert.deepEqual([...goalParts(g).petals, ...goalParts(g).bush], goal(g));
    assert.deepEqual(new Set(goalParts(g).bush.map(key)), bushKeys);
  }
});

test('the bush fill is empty before the reveal, even with a bush stage stored', () => {
  const g = geometry(5);
  for (let bush = 0; bush <= 5; bush++) assert.deepEqual(bushFill(g, bush, false), { deco: [], vines: [], dust: [] });
  const after = bushFill(g, 5, true);
  assert.ok(after.deco.length > 0 && after.vines.length > 0 && after.dust.length > 0);
});

test('the filled part: nothing at growth 0, a small whole petal inside the outline at one tick, the whole petal at 1', () => {
  const key = c => c[0] + ',' + c[1];
  for (const H of [1, 5, 8]) {
    const g = geometry(H), outline = new Set(goal(g).map(key));
    for (let h = 0; h < H; h++) {
      const all = g.track.filter(c => c[2] === h);
      assert.deepEqual(drawn(g, h, 0), []);
      const bud = drawn(g, h, 1 / 7);
      assert.ok(bud.length > 0 && bud.length < all.length / 4, `${H} petals: petal ${h}'s bud is small`);
      for (const c of bud) { assert.ok(c[3] <= petalScale(1 / 7), 'inside the scaled petal'); assert.ok(outline.has(key(c)), 'inside the outline'); assert.equal(c[2], h); }
      assert.deepEqual(new Set(drawn(g, h, 1).map(key)), new Set(all.map(key)));
    }
  }
});

test('the bush fills exactly the stages the flower has reached by upgrades', () => {
  const key = c => c[0] + ',' + c[1];
  const g = geometry(5);
  for (let bush = 0; bush <= 5; bush++) {
    const fill = bushFill(g, bush);
    const expected = g.deco.filter(c => bush >= LAYER_STAGE[c[6]]);
    assert.deepEqual(fill.deco, expected);
    assert.deepEqual(fill.vines, bush >= 3 ? g.vines : []);
    assert.deepEqual(fill.dust, bush >= 5 ? g.dust : []);
    const outline = new Set(goal(g).map(key));
    for (const c of [...fill.deco, ...fill.vines, ...fill.dust]) assert.ok(outline.has(key(c)), 'inside the outline');
  }
  assert.equal(bushFill(g, 0).deco.length, 0, 'a new flower fills no bush');
  const two = new Set(bushFill(g, 2).deco.map(c => c[6]));
  assert.deepEqual([...two].sort(), [0, 1], 'bush 2: the back row and the outer ring');
  assert.ok(bushFill(g, 4).deco.some(c => c[6] === 2), 'bush 4 brings the extra petals');
});

test("a petal's rim is a closed ring of its own cells, each touching a cell outside the petal", () => {
  for (const H of [1, 3, 5, 8]) {
    const g = geometry(H), rims = rim(g);
    assert.equal(rims.length, H);
    assert.equal(rim(g), rims, 'built once per geometry');
    const own = new Map(g.track.map(c => [c[0] + ',' + c[1], c[2]]));
    const four = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    rims.forEach((cells, h) => {
      assert.ok(cells.length > 8, `${H} petals: petal ${h} has a rim`);
      const on = new Set(cells.map(c => c[0] + ',' + c[1]));
      for (const [i, j, owner] of cells) {
        assert.equal(owner, h);
        assert.equal(own.get(i + ',' + j), h, 'a rim cell is a cell of the petal');
        assert.ok(four.some(([dx, dy]) => own.get((i + dx) + ',' + (j + dy)) !== h), 'a rim cell touches a cell outside the petal');
        // closed: every rim cell has at least two rim neighbours, so the ring has no loose end
        let near = 0;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if ((dx || dy) && on.has((i + dx) + ',' + (j + dy))) near++;
        assert.ok(near >= 2, `${H} petals: rim cell ${i},${j} of petal ${h} has ${near} rim neighbours`);
      }
      // one piece: every rim cell is reached from the first through 8-neighbours
      const seen = new Set([cells[0][0] + ',' + cells[0][1]]), queue = [cells[0]];
      while (queue.length) { const [i, j] = queue.pop(); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const key = (i + dx) + ',' + (j + dy); if (on.has(key) && !seen.has(key)) { seen.add(key); queue.push(key.split(',').map(Number)); } } }
      assert.equal(seen.size, cells.length, `${H} petals: petal ${h}'s rim is one ring`);
      // every interior cell of the petal is inside the ring, not on it
      const inner = g.track.filter(c => c[2] === h && !on.has(c[0] + ',' + c[1]));
      assert.ok(inner.length > 0, 'the petal has cells inside its rim');
    });
  }
});

test('drawn() grows a whole petal from its base: a small petal at one tick, larger each day, the whole petal at 1', () => {
  assert.equal(petalScale(0), 0);
  assert.ok(Math.abs(petalScale(1 / 7) - (BUD + (1 - BUD) / 7)) < 1e-9, 'one tick is a small petal, not nothing');
  assert.equal(petalScale(1), 1);
  assert.ok(petalScale(1 / 14) > 0 && petalScale(1 / 14) < petalScale(1 / 7), 'a tick easing in grows from nothing');
  for (const H of [1, 5, 8]) {
    const g = geometry(H);
    for (let h = 0; h < H; h++) {
      const all = g.track.filter(c => c[2] === h), days = [1, 2, 3, 4, 5, 6].map(d => drawn(g, h, d / 7));
      assert.equal(drawn(g, h, 1).length, all.length, 'every cell at 1');
      assert.deepEqual(new Set(drawn(g, h, 1)), new Set(all));
      assert.deepEqual(drawn(g, h, 0), [], 'nothing at 0');
      for (let d = 1; d < days.length; d++) {
        assert.ok(days[d].length > days[d - 1].length, 'larger each day');
        const later = new Set(days[d]);
        for (const c of days[d - 1]) assert.ok(later.has(c), 'a day holds the day before');
      }
      const bud = days[0], s = petalScale(1 / 7);
      // every cell of the scaled petal is drawn, so its rounded tip is there too: no straight cut
      for (const c of all) assert.equal(bud.includes(c), c[3] <= s);
      assert.ok(Math.max(...bud.map(c => c[4])) > .8 * s, `${H} petals: petal ${h}'s bud reaches its own tip`);
      const across = new Set(bud.map(c => Math.round(c[5] * 4)));
      assert.ok(across.size >= 3, `${H} petals: petal ${h}'s bud is ${across.size} cells across`);
    }
  }
});

test('a dead petal regrowing is dimmer until it has healed', () => {
  const dead = petal([true, ...Array(26).fill(false), false], 0, 0, abs0);
  assert.ok(dead.grow < 1);
  assert.ok(regrowLight(dead) >= .3 && regrowLight(dead) < 1);
  assert.ok(regrowLight({ grow: .9 }) > regrowLight({ grow: .2 }), 'brighter as it comes back');
  assert.equal(regrowLight({ grow: 1 }), 1);
});

test('the view: a fresh flower is Crimson with no petals until a habit is ticked', () => {
  const db = fresh(), ids = five(db);
  startFresh(db, TODAY);
  const view = flowerView(db, TODAY);
  assert.deepEqual([view.state.tier, view.state.done, view.state.good, view.state.toward, view.state.need], [0, 0, 0, 0, 14]);
  assert.deepEqual(view.habits.map(habit => habit.tracked), [false, false, false, false, false]);
  assert.deepEqual(view.state.worlds, ['none']);
  setHabitCheck(db, ids[0], TODAY, true);
  const one = flowerView(db, TODAY).habits.find(habit => habit.id === ids[0]);
  assert.deepEqual([one.tracked, one.since, one.ticks, one.growth], [true, TODAY, '1', 1 / 7]);
});

test('tick rows start at each habit\'s first tick', () => {
  const db = fresh(), ids = five(db);
  setHabitCheck(db, ids[0], shiftDay(TODAY, -2), true);
  setHabitCheck(db, ids[0], TODAY, true);
  setHabitCheck(db, ids[1], shiftDay(TODAY, -1), true);
  const rows = tickRows(db, habitsWithIcons(db).filter(habit => ids.slice(0, 2).includes(habit.id)).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)), shiftDay(TODAY, -3), TODAY);
  assert.deepEqual(rows, ['-101', '--10']);
});

test('fourteen good days bring Ember, which grows in with ticks and then shows its world', () => {
  const db = fresh(), ids = five(db);
  const start = shiftDay(TODAY, -20);
  startFresh(db, start);
  keepDays(db, ids, TODAY, 21, 5);
  const view = flowerView(db, TODAY);
  assert.deepEqual([view.state.tier, view.state.done, view.state.growing], [1, 1, false]);
  assert.deepEqual(view.state.worlds, ['none', 'sky']);
  const mid = flowerView(db, shiftDay(TODAY, -4));
  assert.deepEqual([mid.state.tier, mid.state.done, mid.state.growing, mid.state.tier_name], [1, 0, true, 'Ember']);
  assert.ok(mid.habits.every(habit => habit.grow > 0 && habit.grow < 1));
});

test('the look only takes what has been earned', () => {
  const db = fresh(); five(db);
  startFresh(db, TODAY);
  assert.throws(() => setLook(db, { tier: 1 }, TODAY), /not grown in/);
  assert.throws(() => setLook(db, { world: 'pond' }, TODAY), /not been unlocked/);
  assert.deepEqual(setLook(db, { insect: { tier: 0, index: 1 } }, TODAY), { tier: null, world: null, insects: [1, 0, 0, 1, 0, 0] });
  assert.deepEqual(readFlower(db).look.insects, [1, 0, 0, 1, 0, 0]);
});

test('a reset deletes every tick and counts from the day given; habits and the look stay', () => {
  const db = fresh(), ids = five(db);
  keepDays(db, ids, TODAY, 9, 5);
  setLook(db, { insect: { tier: 0, index: 2 } }, TODAY);
  const result = resetHabits(db, TODAY);
  assert.deepEqual(result, { removed: 45, fresh_start: TODAY });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM habit_checks').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM habits WHERE active = 1').get().n, 5);
  assert.equal(readFlower(db).look.insects[0], 2);
  assert.ok(flowerView(db, TODAY).habits.every(habit => !habit.tracked && habit.streak === 0));
});
