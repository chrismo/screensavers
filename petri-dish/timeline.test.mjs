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
  parsePack, encodePack, compactQuery,
  legEase,
  DEFAULT_STEP_DUR, parseScript, encodeScript, stepSeconds, scriptLength, stepAt, stepStart, findStepForSlot, scriptFromPack,
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


// --- query compaction -----------------------------------------------------

test('compactQuery leaves the pack spec delimiters raw', () => {
  const p = new URLSearchParams();
  p.set('packs', 'A:1,2,3,4,5;;B:6,7,8,9,10@0/1/out');
  assert.equal(compactQuery(p), 'packs=A:1,2,3,4,5;;B:6,7,8,9,10@0/1/out');
});

test('compactQuery keeps & escaped — it is what actually separates pairs', () => {
  const p = new URLSearchParams();
  p.set('packname', 'My Pack&x=1');
  // & must stay %26 or it would split the query into two params. `=` need not:
  // only the FIRST `=` of a pair separates key from value, so a later one is
  // just data — which is what lets a script's `=0` cut steps ride raw.
  const q = compactQuery(p);
  assert.equal(q, 'packname=My+Pack%26x=1');
  assert.equal(new URLSearchParams(q).get('packname'), 'My Pack&x=1', 'still reparses');
});

test('compactQuery leaves a cut step readable, = and all', () => {
  const p = new URLSearchParams();
  p.set('script', '=0@10;~1@6/3;*~2@8/60');
  assert.equal(compactQuery(p), 'script==0@10;~1@6/3;*~2@8/60');
  assert.equal(new URLSearchParams(compactQuery(p)).get('script'), p.get('script'));
});

test('compactQuery round-trips through URLSearchParams unchanged', () => {
  const p = new URLSearchParams();
  p.set('packs', 'we ird:1,2,3,4,5@0.5/1.5/smoother;;X:9,8,7,6,5');
  p.set('packname', 'Weave*');
  p.set('preset', '3');
  const back = new URLSearchParams(compactQuery(p));
  for (const k of ['packs', 'packname', 'preset']) assert.equal(back.get(k), p.get(k), k);
});

test('compactQuery survives the URL.search setter without re-encoding', () => {
  const p = new URLSearchParams();
  p.set('packs', 'A:1,2,3,4,5@0/1/out');
  const u = new URL('https://example.com/petri-dish/');
  u.search = compactQuery(p);
  assert.equal(u.search, '?packs=A:1,2,3,4,5@0/1/out');
  assert.equal(new URLSearchParams(u.search).get('packs'), p.get('packs'));
});

test('compactQuery does not unescape a value that literally contains "%3A"', () => {
  const p = new URLSearchParams();
  p.set('packname', '%3A'); // the user's actual five characters, not a colon
  assert.equal(compactQuery(p), 'packname=%253A');
  assert.equal(new URLSearchParams(compactQuery(p)).get('packname'), '%3A');
});

// Measured against the shipped Weave pack, so the number means something: the
// ?packs= param goes 266 -> 178 characters, a third off, and none of the 178 is
// escaping. (The whole URL is a 24% cut — the other params barely inflate.)
test('compactQuery takes a third off a real pack spec', () => {
  const spec = encodePack(parsePack(
    'Cobweb:20,20,20,1,5@0.8/1.8/smoother;Highways:30,30,30,2,5@0.6/2/smoother;' +
    'Tube:12,95,60,2,2@1/1.5/smooth;Vermicelli:45,45,2,1,5@0.8/2/smoother;' +
    'Burlap:5,5,4,0.6,1@1.2/1.6/smoother'));
  const p = new URLSearchParams();
  p.set('packs', spec);
  const before = p.toString().length;
  const after = compactQuery(p).length;
  assert.equal(after, 'packs='.length + spec.length, 'nothing left escaped');
  assert.ok(after <= before * 0.7, `expected <=70% of ${before}, got ${after}`);
});

// --- scripts: steps, loop, advancement ------------------------------------
// A step FUSES the move and the dwell: "arrive at slot N — by cut, or by lerp
// over `dur` seconds — then sit there for `dwell` seconds." That's the model
// table in ideas.md, and the reason for it is that a transition is an edge: it
// can't dangle if it's welded to the node it arrives at.

test('parseScript reads a lerp step: slot, dur, dwell, ease', () => {
  const s = parseScript('~3@6/60/smoother');
  assert.equal(s.steps.length, 1);
  assert.deepEqual(s.steps[0], { slot: 3, cut: false, dur: 6, dwell: 60, ease: 'smoother' });
});

test('parseScript reads a cut step, whose one number is the dwell', () => {
  // a cut has no transition to time, so `@10` is 10s parked — not a 10s move
  assert.deepEqual(parseScript('=0@10').steps[0], { slot: 0, cut: true, dur: 0, dwell: 10, ease: undefined });
});

test('parseScript defaults a bare step to a plain morph, no dwell', () => {
  assert.deepEqual(parseScript('~1').steps[0], { slot: 1, cut: false, dur: DEFAULT_STEP_DUR, dwell: 0, ease: undefined });
  assert.deepEqual(parseScript('=1').steps[0], { slot: 1, cut: true, dur: 0, dwell: 0, ease: undefined });
});

test('parseScript loops from step 0 unless a * marks another', () => {
  assert.equal(parseScript('~0;~1;~2').loopFrom, 0);
  assert.equal(parseScript('=0@10;~1@6/3;*~2@8/60;~3@4').loopFrom, 2);
});

test('parseScript skips a step it cannot read, marker and all', () => {
  const s = parseScript('~0;nonsense;~9@2/1');
  assert.equal(s.steps.length, 2);
  assert.deepEqual(s.steps.map((x) => x.slot), [0, 9]);
});

test('parseScript rejects a slot outside the bank', () => {
  assert.equal(parseScript('~10'), null, 'two digits is not slot 1 followed by junk');
  assert.equal(parseScript('~-1'), null);
  assert.equal(parseScript('~9').steps[0].slot, 9);
});

test('parseScript of nothing is null, not an empty script', () => {
  assert.equal(parseScript(''), null);
  assert.equal(parseScript(';;'), null);
});

test('parseScript still accepts > as an alias, and encodeScript normalizes it', () => {
  // > is what a hand-writer reaches for, but it percent-encodes to %3E, so it is
  // read and never written.
  assert.deepEqual(parseScript('>3@6/60'), parseScript('~3@6/60'));
  assert.equal(encodeScript(parseScript('>3@6/60')), '~3@6/60');
});

test('encodeScript is the inverse of parseScript', () => {
  for (const spec of ['~0;~1;~2', '=0@10;~1@6/3;*~2@8/60;~3@4', '~3@6/60/smoother', '=2@1.5']) {
    assert.equal(encodeScript(parseScript(spec)), spec, spec);
  }
});

test('stepSeconds is move plus dwell, and a cut has no move', () => {
  assert.equal(stepSeconds({ cut: false, dur: 6, dwell: 3 }), 9);
  assert.equal(stepSeconds({ cut: true, dur: 6, dwell: 3 }), 3);
});

// The motivating example from ideas.md, fused: cut to 0 and hold 10s; morph to 1
// over 6s and hold 3s; then loop between a 60s dwell on 2 and a 4s morph to 3.
const EXAMPLE = parseScript('=0@10;~1@6/3;*~2@8/60;~3@4');

test('scriptLength splits the play-once intro from the looping tail', () => {
  assert.deepEqual(scriptLength(EXAMPLE), { intro: 19, loop: 72, total: 91 });
});

test('stepAt walks the intro, naming the step and the phase within it', () => {
  const at = (t) => { const r = stepAt(EXAMPLE, t, 1); return [r.index, r.phase, r.progress]; };
  assert.deepEqual(at(0),  [0, 'dwell', 0],   'a cut has no move phase to sit in');
  assert.deepEqual(at(5),  [0, 'dwell', 0.5]);
  assert.deepEqual(at(10), [1, 'move',  0]);
  assert.deepEqual(at(13), [1, 'move',  0.5]);
  assert.deepEqual(at(16), [1, 'dwell', 0]);
  assert.deepEqual(at(19), [2, 'move',  0]);
  assert.deepEqual(at(23), [2, 'move',  0.5]);
  assert.deepEqual(at(27), [2, 'dwell', 0]);
});

test('stepAt loops back to the marker, not to the top', () => {
  assert.equal(stepAt(EXAMPLE, 87, 1).index, 3, 'end of the 60s dwell');
  const wrapped = stepAt(EXAMPLE, 91, 1); // intro 19 + loop 72
  assert.equal(wrapped.index, 2, 'back to the * step, not step 0');
  assert.equal(wrapped.phase, 'move');
  assert.equal(wrapped.progress, 0);
  assert.deepEqual([stepAt(EXAMPLE, 95, 1).index, stepAt(EXAMPLE, 95, 1).progress], [2, 0.5]);
  assert.equal(stepAt(EXAMPLE, 19 + 72 * 5, 1).index, 2, 'still there many loops later');
});

test('stepAt scales everything by rate — under 1 is slower', () => {
  assert.deepEqual([stepAt(EXAMPLE, 20, 1).index, stepAt(EXAMPLE, 20, 1).phase], [2, 'move']);
  // at half speed, 20s of wall clock is only 10s of script
  assert.deepEqual([stepAt(EXAMPLE, 20, 0.5).index, stepAt(EXAMPLE, 20, 0.5).phase], [1, 'move']);
  assert.equal(stepAt(EXAMPLE, 5, 2).index, 1, '5s at 2x is 10s of script');
});

test('stepAt survives a script with no duration at all', () => {
  const z = parseScript('=0;=1');
  const r = stepAt(z, 5, 1);
  assert.ok(r.index >= 0 && r.index < 2);
  assert.ok(Number.isFinite(r.progress));
});

test('stepAt clamps a negative elapsed to the start', () => {
  assert.equal(stepAt(EXAMPLE, -5, 1).index, 0);
});

// --- deriving a script from a pack's own timing ---------------------------
// The quarter-turn from ideas.md: legacy `dur` on preset N times the leg N->N+1
// (outgoing), so rotated to mean the leg *into* N it becomes a step. `hold` on N
// was always the dwell at N, and stays put.

test('scriptFromPack rotates outgoing legs into arriving ones', () => {
  const slots = [
    { name: 'A', hold: 0.8, dur: 1.8, ease: 'smoother' },
    { name: 'B', hold: 0.6, dur: 2.0, ease: 'linear' },
  ];
  const s = scriptFromPack(slots, 8); // 8s per unit leg
  assert.deepEqual(s.steps, [
    // arriving at A takes B's outgoing leg, because the cycle wraps
    { slot: 0, cut: false, dur: 16, dwell: 6.4, ease: 'linear' },
    { slot: 1, cut: false, dur: 14.4, dwell: 4.8, ease: 'smoother' },
  ]);
  assert.equal(s.loopFrom, 0);
});

test('scriptFromPack skips holes and takes the leg from the previous filled slot', () => {
  const slots = [{ name: 'A', dur: 1, hold: 0 }, null, { name: 'C', dur: 2, hold: 1 }];
  const s = scriptFromPack(slots, 10);
  assert.deepEqual(s.steps.map((x) => [x.slot, x.dur, x.dwell]), [[0, 20, 0], [2, 10, 10]]);
});

test('scriptFromPack defaults an untimed pack to even legs and no dwell', () => {
  const s = scriptFromPack([{ name: 'A' }, { name: 'B' }], 8);
  assert.deepEqual(s.steps.map((x) => [x.dur, x.dwell]), [[8, 0], [8, 0]]);
});

test('scriptFromPack of an empty bank is null', () => {
  assert.equal(scriptFromPack([null, null], 8), null);
});

test('scriptFromPack of a single slot still yields a playable one-step script', () => {
  const s = scriptFromPack([{ name: 'A', dur: 1, hold: 2 }], 8);
  assert.deepEqual(s.steps.map((x) => [x.slot, x.dur, x.dwell]), [[0, 8, 16]]);
});

test('stepStart is where a step begins in script seconds', () => {
  assert.equal(stepStart(EXAMPLE, 0), 0);
  assert.equal(stepStart(EXAMPLE, 1), 10);
  assert.equal(stepStart(EXAMPLE, 2), 19);
  assert.equal(stepStart(EXAMPLE, 3), 87);
});

test('stepStart round-trips through stepAt', () => {
  for (let i = 0; i < EXAMPLE.steps.length; i++) {
    assert.equal(stepAt(EXAMPLE, stepStart(EXAMPLE, i), 1).index, i, `step ${i}`);
  }
});

test('findStepForSlot finds the first step targeting a slot, or -1', () => {
  assert.equal(findStepForSlot(EXAMPLE, 2), 2);
  assert.equal(findStepForSlot(EXAMPLE, 0), 0);
  assert.equal(findStepForSlot(EXAMPLE, 7), -1);
});
