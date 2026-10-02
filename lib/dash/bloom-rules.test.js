import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assign, runsOf, stateAt, progress, growIn, ladderAt, visitorCame, KILL, HEAL_DAYS, TIER_DAYS, WORLD_ORDER } from './bloom-rules.js';

const row = (n, f) => Array.from({ length: n }, (_, x) => f(x + 1) ? '1' : '0').join('');

test('a run tears the same first rip further each day, and a slip after a tick starts a new one', () => {
  const misses = assign([1, 2, 3, 6].map(day => ({ petal: 0, day })));
  assert.deepEqual(misses.map(m => m.run), [1, 2, 3, 1]);
  assert.deepEqual(misses.slice(1, 3).map(m => m.pattern), ['bigrip', 'bigrip']);
  assert.equal(misses[2].origin, misses[0].origin);
  assert.ok(['tip', 'lefthigh', 'righthigh', 'leftlow', 'rightlow'].includes(misses[3].pattern));
});

test('a petal grows a seventh a tick from its first tick and never shrinks for a miss', () => {
  assert.equal(stateAt('1', 1).growth, 1 / 7);
  const s = stateAt('1111101111', 10);
  assert.equal(s.growth, 1);
  assert.equal(s.misses.length, 1);
  assert.equal(stateAt('1111110', 7).misses.length, 0, "today's missing tick is not a miss yet");
});

test('runs heal in 3, 5, 6 and 7 days back, and ticking today already counts', () => {
  assert.deepEqual(HEAL_DAYS, [0, 3, 5, 6, 7]);
  for (const len of [1, 2, 3, 4]) {
    const t = '1'.repeat(7) + '0'.repeat(len) + '1'.repeat(10), last = 7 + len;
    const healedOn = Array.from({ length: 10 }, (_, b) => b + 1).find(b => runsOf(stateAt(t, last + b).misses)[0].u >= 1);
    assert.equal(healedOn, HEAL_DAYS[len], `${len} in a row`);
  }
});

test('five in a row kill the petal, and the next tick starts it fresh', () => {
  const t = '1111111' + '0'.repeat(KILL) + '11';
  assert.equal(stateAt('1111111' + '0'.repeat(KILL + 1), 13).dead, true, 'dead the day after the fifth miss');
  assert.equal(stateAt(t, 12).dead, false, 'four misses before today: not yet');
  const back = stateAt(t, 13);
  assert.deepEqual([back.dead, back.restart, back.growth, back.misses.length], [false, true, 1 / 7, 0]);
});

test('miss days are absolute, so the same missed day lines up across petals', () => {
  const a = stateAt('1101', 4, 0, 100), b = stateAt('11101', 5, 1, 99);
  assert.equal(a.misses[0].day, 103);
  assert.equal(b.misses[0].day, 103);
});

test('every 14 good days unlock the next colour, which is complete once it has grown through every petal', () => {
  const all = Array.from({ length: 5 }, () => row(21, () => true));
  const p = progress(all);
  assert.equal(p.good, 21);
  assert.equal(p.tier, 1);
  assert.equal(p.unlocked[1], TIER_DAYS - 1);
  assert.equal(p.done, 1, 'seven ticks after the unlock cover every full petal');
  const short = progress(Array.from({ length: 5 }, () => row(17, () => true)));
  assert.deepEqual([short.tier, short.done], [1, 0], 'four ticks in: Ember is still growing in');
  assert.equal(growIn(row(17, () => true), 14, 17), 4 / 7);
});

test('the next colour waits for the one growing in to be complete', () => {
  // three habits tick every day, two never after day 1: good days pile up, but those two petals are dead and never block
  const rows = [...Array.from({ length: 3 }, () => row(40, () => true)), ...Array.from({ length: 2 }, () => row(40, d => d === 1))];
  const p = progress(rows);
  assert.equal(p.tier, 2);
  assert.equal(p.done, 2);
});

test('thriving needs every petal full with no run of two still showing; days add up and unlock the ladder', () => {
  const perfect = progress(Array.from({ length: 5 }, () => row(30, () => true)));
  assert.equal(perfect.thrivingTotal, 24, 'from the day every petal is full');
  assert.equal(perfect.thriving, true);
  assert.deepEqual(ladderAt(perfect.thrivingTotal).map(item => item.id), ['glow', 'pollen', 'dew']);
  const slip = progress([row(14, d => d !== 10), ...Array.from({ length: 4 }, () => row(14, () => true))]);
  assert.equal(slip.thriving, true, 'a single slip does not stop it');
  const two = progress([row(14, d => d !== 10 && d !== 11), ...Array.from({ length: 4 }, () => row(14, () => true))]);
  assert.equal(two.thriving, false, 'two in a row stop it until healed');
  const off = progress(Array.from({ length: 5 }, () => row(14, d => d !== 12)));
  assert.equal(off.thriving, false, 'a day with all five missed pauses it');
});

test('habits start on their first tick: days before it are not misses', () => {
  const p = progress(['--1111111', '111111111', '111111111', '111111111', '111111111'].map(r => r));
  assert.equal(p.thriving, true);
  assert.equal(WORLD_ORDER[0], 'none');
});

test('a visitor comes only at a milestone: Crimson\'s on the first thriving day, later ones once their colour has grown in', () => {
  assert.equal(visitorCame({ done: 0, thriving_total: 0 }, 0), false, 'not on a fresh flower');
  assert.equal(visitorCame({ done: 0, thriving_total: 1 }, 0), true);
  assert.equal(visitorCame({ done: 0, thriving_total: 9 }, 1), false, 'Ember still growing in');
  assert.equal(visitorCame({ done: 1, thriving_total: 9 }, 1), true);
});
