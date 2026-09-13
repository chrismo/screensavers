// Tests for petri-dish/timeline.js — the pure slot/pack logic.
//
// Run:  node --test petri-dish/timeline.test.mjs
//   (or a bare `node --test` from the repo root; `node --test <dir>` with an
//    absolute path fails, it tries to load the directory as an entry point.)
//
// Zero dependencies, node's built-in runner, no package.json — matching the
// rest of the repo. Scope is deliberately the logic only: whether a pattern is
// interesting stays a look-at-it question.
import test from 'node:test';
import assert from 'node:assert/strict';
import T from './timeline.js';

const {
  SLOT_COUNT, EASINGS, DEFAULT_EASE,
  firstFilled, nextFilled, filledCount,
  storeSlot, clearSlot, autoName, forkPack,
  parsePack, encodePack,
  legHoldFrames, legDurFrames, legEase,
} = T;

// A minimal preset factory: the five params plus a name.
const P = (name, rotAngle, sensorAngle, sensorDist, moldSpeed = 1, bgFade = 5) =>
  ({ name, rotAngle, sensorAngle, sensorDist, moldSpeed, bgFade });

const A = P('A', 10, 11, 12);
const B = P('B', 20, 21, 22);
const C = P('C', 30, 31, 32);

// --- slots ----------------------------------------------------------------

test('SLOT_COUNT is the 0-9 bank', () => {
  assert.equal(SLOT_COUNT, 10);
});

test('firstFilled skips leading holes, -1 when empty', () => {
  assert.equal(firstFilled([A, B]), 0);
  assert.equal(firstFilled([null, null, C]), 2);
  assert.equal(firstFilled([]), -1);
  assert.equal(firstFilled([null, null]), -1);
});

test('nextFilled skips holes and wraps', () => {
  const slots = [A, null, null, B, null];
  assert.equal(nextFilled(slots, 0), 3);
  assert.equal(nextFilled(slots, 3), 0);
  assert.equal(nextFilled(slots, 1), 3); // from inside a hole
});

test('nextFilled on a single filled slot returns that slot', () => {
  assert.equal(nextFilled([null, B, null], 1), 1);
});

test('nextFilled with nothing filled is -1', () => {
  assert.equal(nextFilled([null, null], 0), -1);
});

test('filledCount ignores holes', () => {
  assert.equal(filledCount([A, null, B, null]), 2);
});

test('storeSlot replaces in place without mutating the input', () => {
  const before = [A, B];
  const after = storeSlot(before, 1, P('New', 99, 98, 97));
  assert.equal(after[1].name, 'New');
  assert.equal(before[1], B, 'original array untouched');
  assert.notEqual(after, before, 'returns a new array');
});

test('storeSlot past the end pads with holes', () => {
  const after = storeSlot([A], 3, C);
  assert.equal(after.length, 4);
  assert.deepEqual([after[1], after[2]], [null, null]);
  assert.equal(after[3].name, 'C');
});

test('storeSlot keeps the slot timing — the pack rhythm outlives the preset in it', () => {
  const slot = Object.assign({}, B, { hold: 1.2, dur: 1.8, ease: 'smoother' });
  const after = storeSlot([A, slot], 1, P('New', 99, 98, 97));
  assert.equal(after[1].name, 'New');
  assert.equal(after[1].rotAngle, 99);
  assert.equal(after[1].hold, 1.2);
  assert.equal(after[1].dur, 1.8);
  assert.equal(after[1].ease, 'smoother');
});

test('storeSlot into a hole gets default timing, not a neighbour\'s', () => {
  const slots = [Object.assign({}, A, { hold: 9, dur: 9, ease: 'in' }), null];
  const after = storeSlot(slots, 1, P('New', 1, 2, 3));
  assert.equal(after[1].hold, undefined);
  assert.equal(after[1].dur, undefined);
  assert.equal(after[1].ease, undefined);
});

test('storeSlot auto-names a config that arrives nameless', () => {
  const after = storeSlot([], 0, { rotAngle: 45, sensorAngle: 45, sensorDist: 10, moldSpeed: 1, bgFade: 5 });
  assert.equal(after[0].name, '45x45x10');
});

test('clearSlot leaves a hole and does not shift later slots', () => {
  const after = clearSlot([A, B, C], 1);
  assert.equal(after.length, 3);
  assert.equal(after[0].name, 'A');
  assert.equal(after[1], null);
  assert.equal(after[2].name, 'C', 'index stability is the whole point of holes');
});

test('clearSlot trims trailing holes', () => {
  assert.equal(clearSlot([A, B, C], 2).length, 2);
  assert.equal(clearSlot([A, null, null], 0).length, 0);
});

test('clearSlot does not mutate the input', () => {
  const before = [A, B];
  clearSlot(before, 0);
  assert.equal(before[0], A);
});

test('clearSlot out of range is a no-op copy', () => {
  assert.deepEqual(clearSlot([A], 5), [A]);
  assert.deepEqual(clearSlot([A], -1), [A]);
});

// --- auto names -----------------------------------------------------------

test('autoName is the three shape params', () => {
  assert.equal(autoName({ rotAngle: 45, sensorAngle: 45, sensorDist: 10 }), '45x45x10');
});

test('autoName rounds to one decimal and drops trailing zeros', () => {
  assert.equal(autoName({ rotAngle: 84.53, sensorAngle: 12, sensorDist: 3.04 }), '84.5x12x3');
});

test('autoName prefers the name of a known preset it matches exactly', () => {
  const known = [P('Slime', 45, 45, 10, 1, 5)];
  assert.equal(autoName({ rotAngle: 45, sensorAngle: 45, sensorDist: 10, moldSpeed: 1, bgFade: 5 }, known), 'Slime');
  // one param off is not a match — all five have to agree
  assert.equal(autoName({ rotAngle: 45, sensorAngle: 45, sensorDist: 10, moldSpeed: 2, bgFade: 5 }, known), '45x45x10');
});

// --- fork on write --------------------------------------------------------

test('forkPack copies the slots and marks the fork custom', () => {
  const pk = { name: 'Weave', presets: [A, null, B] };
  const fork = forkPack(pk, ['Classic', 'Weave']);
  assert.equal(fork.name, 'Weave*');
  assert.equal(fork.custom, true);
  assert.deepEqual(fork.presets, [A, null, B]);
  assert.notEqual(fork.presets, pk.presets, 'fork owns its own array');
  assert.equal(pk.custom, undefined, 'built-in stays pristine');
});

test('forkPack adds a star per collision so names stay unique', () => {
  assert.equal(forkPack({ name: 'Weave', presets: [] }, ['Weave', 'Weave*']).name, 'Weave**');
});

// --- pack spec round-trip (retrofit: this shipped untested) ---------------

test('parsePack reads the five params and defaults the name', () => {
  const pk = parsePack('45,45,10,1,5');
  assert.equal(pk.presets.length, 1);
  assert.deepEqual(pk.presets[0], {
    name: 'P1', rotAngle: 45, sensorAngle: 45, sensorDist: 10, moldSpeed: 1, bgFade: 5,
  });
  assert.equal(pk.name, 'Custom');
  assert.equal(pk.custom, true);
});

test('parsePack reads a name and per-leg timing', () => {
  const p = parsePack('Fast:45,45,10,1,5@0.5/1.5/out').presets[0];
  assert.equal(p.name, 'Fast');
  assert.equal(p.hold, 0.5);
  assert.equal(p.dur, 1.5);
  assert.equal(p.ease, 'out');
});

test('parsePack rejects a bad ease rather than inventing a curve', () => {
  assert.equal(parsePack('X:1,2,3,4,5@0/1/bogus').presets[0].ease, undefined);
});

test('parsePack turns an empty chunk into a hole', () => {
  const slots = parsePack('A:1,2,3,4,5;;C:6,7,8,9,10').presets;
  assert.equal(slots.length, 3);
  assert.equal(slots[1], null);
  assert.equal(slots[2].name, 'C');
});

test('parsePack turns an unparseable chunk into a hole, keeping later indexes put', () => {
  const slots = parsePack('A:1,2,3,4,5;garbage;C:6,7,8,9,10').presets;
  assert.equal(slots.length, 3);
  assert.equal(slots[1], null);
  assert.equal(slots[2].name, 'C');
});

test('parsePack trims trailing holes', () => {
  assert.equal(parsePack('A:1,2,3,4,5;;').presets.length, 1);
});

test('parsePack of nothing but holes is null, not an empty pack', () => {
  assert.equal(parsePack(';;'), null);
  assert.equal(parsePack(''), null);
});

test('parsePack stops at 10 slots, counting holes', () => {
  const spec = Array.from({ length: 14 }, (_, i) => `S${i}:1,2,3,4,5`).join(';');
  assert.equal(parsePack(spec).presets.length, 10);
  // holes occupy slots too, so 8 presets + 2 holes fills the bank
  const withHoles = ';;' + Array.from({ length: 14 }, (_, i) => `S${i}:1,2,3,4,5`).join(';');
  const slots = parsePack(withHoles).presets;
  assert.equal(slots.length, 10);
  assert.equal(slots[9].name, 'S7');
});

test('encodePack is the inverse of parsePack, holes included', () => {
  const spec = 'A:10,11,12,1,5;;Fast:45,45,10,1,5@0.5/1.5/out';
  assert.equal(encodePack(parsePack(spec)), spec);
});

test('encodePack round-trips a pack with no timing as bare params', () => {
  const spec = 'A:1,2,3,4,5;B:6,7,8,9,10';
  assert.equal(encodePack(parsePack(spec)), spec);
});

test('encodePack strips delimiters out of a name so the spec stays parseable', () => {
  const pk = { presets: [P('we;ird:na@me/x,y', 1, 2, 3)] };
  const spec = encodePack(pk);
  assert.equal(spec, 'we ird na me x y:1,2,3,1,5');
  assert.equal(parsePack(spec).presets[0].name, 'we ird na me x y');
});

test('encodePack trims trailing holes', () => {
  assert.equal(encodePack({ presets: [A, null, null] }), 'A:10,11,12,1,5');
});

// --- easing / leg timing --------------------------------------------------

test('every easing pins 0 to 0 and 1 to 1', () => {
  for (const [name, fn] of Object.entries(EASINGS)) {
    assert.equal(fn(0), 0, `${name}(0)`);
    assert.equal(fn(1), 1, `${name}(1)`);
  }
});

test('legEase falls back to the default curve on a missing or bogus name', () => {
  assert.equal(legEase({}), EASINGS[DEFAULT_EASE]);
  assert.equal(legEase({ ease: 'nope' }), EASINGS[DEFAULT_EASE]);
  assert.equal(legEase({ ease: 'linear' }), EASINGS.linear);
});

test('leg frames scale by lerpDuration, with dur defaulting to 1 and hold to 0', () => {
  assert.equal(legDurFrames({}, 480), 480);
  assert.equal(legDurFrames({ dur: 1.5 }, 480), 720);
  assert.equal(legHoldFrames({}, 480), 0);
  assert.equal(legHoldFrames({ hold: 0.5 }, 480), 240);
});

test('legDurFrames never returns 0 — a 0-frame leg would divide by zero', () => {
  assert.equal(legDurFrames({ dur: 0 }, 480), 1);
});
