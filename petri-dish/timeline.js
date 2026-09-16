// SPDX-License-Identifier: CC-BY-NC-SA-4.0
// petri-dish/timeline.js — the pack/slot logic, pure. No DOM, no canvas, no p5.
//
// ONE source of truth, two consumers — the same split knights/solver.js uses:
//   • the sketch loads it as a classic <script src> (so petri-dish still runs on a
//     file:// double-click — top-level decls become globals sketch.js reads);
//   • node --test imports it through the CommonJS tail at the bottom (skipped in
//     the browser, where `module` is undefined).
//
// A *pack* is a bank of SLOT_COUNT slots, each holding a preset or nothing. The
// bank is addressed by index and stays that way: clearing slot 4 leaves a hole
// rather than sliding 5-9 down, so muscle memory — and, later, scripts that
// reference slots by index — keep pointing at the same thing.

const SLOT_COUNT = 10; // the 0-9 keys / pills

// --- easing ----------------------------------------------------------------
// Named curves a pack can pick per lerp leg. 'smooth' (smoothstep) is what the
// cycle always used, so it stays the default.
const EASINGS = {
  linear:   (t) => t,
  smooth:   (t) => t * t * (3 - 2 * t),
  smoother: (t) => t * t * t * (t * (t * 6 - 15) + 10),
  in:       (t) => t * t,
  out:      (t) => t * (2 - t),
};
const DEFAULT_EASE = 'smooth';

// The five params a preset snapshots. Order matters: it's the ?packs= field order.
const PARAMS = ['rotAngle', 'sensorAngle', 'sensorDist', 'moldSpeed', 'bgFade'];
// Timing rides on the preset the leg *leaves* — see the packs comment in sketch.js.
const TIMING = ['hold', 'dur', 'ease'];

// --- slots ----------------------------------------------------------------
const filledCount = (slots) => slots.reduce((n, p) => n + (p ? 1 : 0), 0);

// Index of the first filled slot at or after `from`, or -1 if the bank is empty.
function firstFilled(slots, from) {
  for (let i = from || 0; i < slots.length; i++) if (slots[i]) return i;
  return -1;
}

// The next filled slot after `from`, wrapping. Returns `from` when it's the only
// one filled (so a one-preset pack sits still instead of cycling), -1 if none are.
function nextFilled(slots, from) {
  const n = slots.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (slots[i]) return i;
  }
  return -1;
}

// Trailing holes carry no information — they'd just be dead pills and `;;` tails
// in the URL — so the bank is always "up to the last filled slot".
const trimHoles = (slots) => {
  const out = slots.slice();
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
};

// Store a live config into slot `i`, padding with holes if it's past the end.
// The slot's *timing* survives: hold/dur/ease are the pack's rhythm, and
// swapping which preset sits at a position shouldn't change how the pack moves.
// Returns a new array — the caller re-points the pack at it.
function storeSlot(slots, i, cfg, known) {
  const out = slots.slice();
  while (out.length < i) out.push(null);
  const prev = out[i] || null;
  const p = { name: cfg.name || autoName(cfg, known) };
  for (const k of PARAMS) p[k] = cfg[k];
  if (prev) for (const k of TIMING) if (prev[k] != null) p[k] = prev[k];
  out[i] = p;
  return out;
}

// Empty slot `i`, leaving a hole. Out-of-range is a no-op copy.
function clearSlot(slots, i) {
  if (!Number.isInteger(i) || i < 0 || i >= slots.length) return slots.slice();
  const out = slots.slice();
  out[i] = null;
  return trimHoles(out);
}

// A name derived from the params, the way the Tide pack already does it (`12px`).
// An exact match against `known` (the base ten) wins, so storing an untouched
// Plasma reads as `Plasma` rather than as numbers. Otherwise the three
// shape-defining params, which are what the eye actually tracks.
function autoName(cfg, known) {
  const n1 = (n) => Number(Number(n).toFixed(1)).toString();
  for (const p of known || []) {
    if (p && PARAMS.every((k) => Math.abs(p[k] - cfg[k]) < 1e-6)) return p.name;
  }
  return `${n1(cfg.rotAngle)}x${n1(cfg.sensorAngle)}x${n1(cfg.sensorDist)}`;
}

// --- fork on write --------------------------------------------------------
// shareUrl() emits `?pack=weave` for a built-in and the full spec only for a
// custom pack, so editing a built-in in place would make copy-URL hand back
// pristine Weave — the edit gone from the very URL meant to reproduce it. So the
// first write forks. Built-ins stay pristine and a palette can't be clobbered.
function forkPack(pk, takenNames) {
  const taken = new Set(takenNames || []);
  let name = `${pk.name}*`;
  while (taken.has(name)) name += '*';
  return { name, presets: pk.presets.slice(), custom: true };
}

// --- ?packs= spec: parse / encode -----------------------------------------
//   spec   := slot (';' slot)*
//   slot   := '' | [name ':'] rot ',' sensA ',' sensD ',' speed ',' fade ['@' timing]
//   timing := hold '/' dur ['/' ease]
//
// e.g. ?packs=Fast:45,45,10,1,5@0/0.4/out;;Slow:20,20,20,1,5@1/2/smoother
// An empty — or unparseable — chunk is a hole rather than a skip, so a corrupt
// entry can't slide every later slot down one and invalidate the indexes.
function parsePack(spec, name) {
  const out = [];
  for (const chunk of String(spec).split(';')) {
    if (out.length === SLOT_COUNT) break;
    out.push(parseSlot(chunk.trim(), out.length));
  }
  const slots = trimHoles(out);
  return slots.length ? { name: name || 'Custom', presets: slots, custom: true } : null;
}

function parseSlot(s, slotIdx) {
  if (!s) return null;
  const at = s.indexOf('@');
  const head = at < 0 ? s : s.slice(0, at);
  const colon = head.indexOf(':');
  const nums = (colon < 0 ? head : head.slice(colon + 1)).split(',').map(Number);
  if (nums.length < 5 || nums.some((n) => !Number.isFinite(n))) return null;
  const p = { name: (colon < 0 ? '' : head.slice(0, colon).trim()) || `P${slotIdx + 1}` };
  PARAMS.forEach((k, i) => { p[k] = nums[i]; });
  if (at >= 0) {
    const [h, dur, ease] = s.slice(at + 1).split('/');
    const hv = parseFloat(h);
    const dv = parseFloat(dur);
    if (Number.isFinite(hv) && hv >= 0) p.hold = hv;
    if (Number.isFinite(dv) && dv > 0) p.dur = dv;
    if (ease && EASINGS[ease.trim()]) p.ease = ease.trim();
  }
  return p;
}

// Inverse of parsePack, for round-tripping a custom pack through copy-URL.
function encodePack(pk) {
  const fmt = (n, d) => Number(n.toFixed(d)).toString();
  return trimHoles(pk.presets).map((p) => {
    if (!p) return ''; // a hole
    // The spec's delimiters can't survive inside a name, so they don't get to try.
    const nm = String(p.name || '').replace(/[;:@/,]/g, ' ').trim();
    const head = `${nm ? nm + ':' : ''}${fmt(p.rotAngle, 2)},${fmt(p.sensorAngle, 2)},` +
      `${fmt(p.sensorDist, 2)},${fmt(p.moldSpeed, 3)},${fmt(p.bgFade, 1)}`;
    if (p.hold == null && p.dur == null && !p.ease) return head;
    return `${head}@${fmt(p.hold || 0, 3)}/${fmt(p.dur == null ? 1 : p.dur, 3)}/${p.ease || DEFAULT_EASE}`;
  }).join(';');
}

// --- scripts: steps, loop, advancement ------------------------------------
// A *step* fuses the move and the dwell: "arrive at slot N — by cut, or by lerp
// over `dur` seconds — then sit there for `dwell` seconds." Fusing them is the
// point rather than a shortcut: a transition is an *edge*, and welding it to the
// node it arrives at means there is never a dangling one.
//
// This is the quarter-turn off the pack model. There, `dur` on preset N timed the
// leg N->N+1 (outgoing), which only works while a preset appears once; rotate it
// to mean the leg *into* N and the same preset can be arrived at three different
// ways in one script. Packs keep their timing as the seed a default script is
// derived from (scriptFromPack below), but the script is what actually plays.
//
//   script := step (';' step)*
//   step   := ['*'] ('~' | '=') slot ['!'] ['@' timing]  '~' lerp into, '=' cut to
//   timing := dur ['/' dwell ['/' ease]]                 after '~'
//           | dwell                                      after '=' (nothing to time)
//
// `!` is the reset flag: entering the step re-seeds the molds, the way the R key
// does. It rides next to the slot rather than in the timing because it describes
// the arrival, not a duration — and because the timing tail is open-ended, so a
// trailing flag there would be swallowed by the ease field.
//
// e.g. ?script=*~2@8/60;~3@4  — loop between a 60s dwell on slot 2 and a 4s morph
// to slot 3. Seconds are absolute: choreography is written in the units you think
// in, and the `rate` knob scales the whole thing without touching the script.
//
// `~` glides, `=` snaps. The obvious sigil for "go to" was `>`, and it was built
// that way first — but `>` is in the URL spec's query percent-encode set, so it
// comes back as %3E on every single step and re-inflates the URL that compactQuery
// exists to keep flat. `~` and `=` both survive raw. `>` is still accepted on the
// way in, since it's what a hand-writer reaches for; encodeScript emits `~`.
const DEFAULT_STEP_DUR = 8; // seconds, matching the pack default of 480 frames
const STEP_RE = /^(\*)?([~=>])(\d+)(!)?(?:@(.*))?$/; // '>' is a legacy-friendly alias for '~'

function parseScript(spec) {
  const steps = [];
  let loopFrom = 0;
  for (const chunk of String(spec).split(';')) {
    const s = chunk.trim();
    if (!s) continue;
    const m = STEP_RE.exec(s);
    if (!m) continue;
    const slot = Number(m[3]);
    if (slot >= SLOT_COUNT) continue; // '>10' is out of the bank, not slot 1 plus junk
    const cut = m[2] === '=';
    const parts = (m[5] || '').split('/');
    const num = (v, dflt) => {
      const n = parseFloat(v);
      return Number.isFinite(n) && n >= 0 ? n : dflt;
    };
    const step = { slot, cut, dur: 0, dwell: 0, ease: undefined, reset: !!m[4] };
    if (cut) {
      step.dwell = num(parts[0], 0);
    } else {
      step.dur = num(parts[0], DEFAULT_STEP_DUR);
      step.dwell = num(parts[1], 0);
      const e = (parts[2] || '').trim();
      if (e && EASINGS[e]) step.ease = e;
    }
    if (m[1]) loopFrom = steps.length; // the '*' marks where the tail loop returns
    steps.push(step);
  }
  return steps.length ? { steps, loopFrom: Math.min(loopFrom, steps.length - 1) } : null;
}

// Inverse of parseScript. Omits anything that is already the default, so a plain
// morph cycle encodes as '>0;>1;>2' rather than as a wall of 8/0s.
function encodeScript(sc) {
  const n = (v) => Number(v.toFixed(3)).toString();
  return sc.steps.map((st, i) => {
    const head = (i === sc.loopFrom && sc.loopFrom !== 0 ? '*' : '') +
      (st.cut ? '=' : '~') + st.slot + (st.reset ? '!' : '');
    if (st.cut) return st.dwell ? `${head}@${n(st.dwell)}` : head;
    let parts = [];
    if (st.ease) parts = [n(st.dur), n(st.dwell), st.ease];
    else if (st.dwell) parts = [n(st.dur), n(st.dwell)];
    else if (st.dur !== DEFAULT_STEP_DUR) parts = [n(st.dur)];
    return parts.length ? `${head}@${parts.join('/')}` : head;
  }).join(';');
}

const stepSeconds = (st) => (st.cut ? 0 : st.dur) + st.dwell;

// Steps before loopFrom are an intro played once; the rest cycle forever.
function scriptLength(sc) {
  const add = (a, b) => a + b;
  const lens = sc.steps.map(stepSeconds);
  const intro = lens.slice(0, sc.loopFrom).reduce(add, 0);
  const loop = lens.slice(sc.loopFrom).reduce(add, 0);
  return { intro, loop, total: intro + loop };
}

// Where playback is at `elapsed` wall-clock seconds: which step, whether it is
// still moving or has arrived and is dwelling, and how far through that phase.
// `rate` scales script time against wall time — 0.5 plays it half as fast.
//
// Pure, so the panel, a future scrub-able timeline and the tests all read the
// same answer. What it deliberately does NOT say is what to lerp *from*: the
// sketch snapshots the live values when the step changes, which is the only thing
// that stays right across a loop back to the marker, a cleared slot, or a step
// change caught mid-morph.
function stepAt(sc, elapsed, rate) {
  const r = Number.isFinite(rate) && rate > 0 ? rate : 1;
  const lens = sc.steps.map(stepSeconds);
  const { intro, loop } = scriptLength(sc);
  let t = Math.max(0, elapsed) * r;
  if (t >= intro) t = loop > 0 ? intro + ((t - intro) % loop) : intro;
  let i = 0;
  while (i < lens.length - 1 && t >= lens[i]) { t -= lens[i]; i += 1; }
  const step = sc.steps[i];
  const move = step.cut ? 0 : step.dur;
  if (t < move) return { index: i, step, phase: 'move', progress: move > 0 ? t / move : 0 };
  return {
    index: i, step, phase: 'dwell',
    progress: step.dwell > 0 ? Math.min(1, (t - move) / step.dwell) : 0,
  };
}

// Where a step begins, in script seconds. Lets a slot pick during playback jump
// the playhead to the moment that slot is arrived at, instead of restarting.
function stepStart(sc, index) {
  let t = 0;
  for (let i = 0; i < index && i < sc.steps.length; i++) t += stepSeconds(sc.steps[i]);
  return t;
}

const findStepForSlot = (sc, slot) => sc.steps.findIndex((st) => st.slot === slot);

// --- the strip: layout and playhead ---------------------------------------
// What the timeline strip needs from the model, and nothing more. Both are pure,
// so the strip, the panel and the tests can't disagree about where the playhead
// is or how wide a segment should be.

// One entry per step, sized by its share of the script. `moveFrac` is how much of
// that share is the move rather than the dwell, which is what lets a segment show
// its own shape — a long dwell with a quick approach reads differently from an
// even morph. A script of nothing but cuts has no seconds at all, so it divides
// the strip evenly rather than collapsing to zero width.
function segments(sc) {
  const { total } = scriptLength(sc);
  const n = sc.steps.length;
  return sc.steps.map((st, i) => {
    const secs = stepSeconds(st);
    const move = st.cut ? 0 : st.dur;
    return {
      index: i, slot: st.slot, cut: st.cut, reset: !!st.reset, ease: st.ease,
      dur: st.dur, dwell: st.dwell,
      seconds: secs,
      frac: total > 0 ? secs / total : 1 / n,
      moveFrac: secs > 0 ? move / secs : 0,
      loop: i === sc.loopFrom,
    };
  });
}

// Where the playhead sits, 0 to 1 across the strip. Derived from stepAt so a seek,
// a loop wrap and a rate change all land in exactly one place; the strip is a view
// of the clock, never a second copy of it.
function playheadFrac(sc, elapsed, rate) {
  const { total } = scriptLength(sc);
  if (!(total > 0)) return 0;
  const at = stepAt(sc, elapsed, rate);
  const st = at.step;
  const within = at.phase === 'move'
    ? at.progress * st.dur
    : (st.cut ? 0 : st.dur) + at.progress * st.dwell;
  return Math.min(1, (stepStart(sc, at.index) + within) / total);
}

// --- editing a script -----------------------------------------------------
// Every edit returns a new script instead of mutating one, the same way a slot
// edit returns a new bank: the sketch swaps the whole thing in, so there is no
// half-applied state for draw() to catch mid-frame.
//
// The loop marker is an index, so every insert and delete has to carry it — it
// points at a *step*, and it should keep pointing at that same step afterwards.

const EASE_NAMES = Object.keys(EASINGS);

const clampSlot = (n) => Math.max(0, Math.min(SLOT_COUNT - 1, Math.round(Number(n) || 0)));
const clampSecs = (n) => { const v = Number(n); return Number.isFinite(v) && v > 0 ? v : 0; };

function withStep(sc, i, patch) {
  if (!sc || !Number.isInteger(i) || i < 0 || i >= sc.steps.length) return sc;
  const steps = sc.steps.slice();
  const st = Object.assign({}, steps[i], patch);
  st.slot = clampSlot(st.slot);
  st.dur = clampSecs(st.dur);
  st.dwell = clampSecs(st.dwell);
  st.cut = !!st.cut;
  st.reset = !!st.reset;
  if (st.ease && !EASINGS[st.ease]) st.ease = undefined;
  // A 0s lerp *is* a cut, so a step that claims to morph needs a leg to morph
  // over. Going the other way leaves `dur` parked, so toggling cut is lossless.
  if (!st.cut && st.dur === 0) st.dur = DEFAULT_STEP_DUR;
  steps[i] = st;
  return { steps, loopFrom: sc.loopFrom };
}

// Insert at `i`, pushing what was there down. The marker rides along if it was at
// or after the insertion point, so it keeps pointing at the same step.
function insertStep(sc, i, step) {
  const steps = sc ? sc.steps.slice() : [];
  const at = Math.max(0, Math.min(steps.length, i));
  const base = { slot: 0, cut: false, dur: DEFAULT_STEP_DUR, dwell: 0, ease: undefined, reset: false };
  const st = Object.assign(base, step);
  st.slot = clampSlot(st.slot);
  st.dur = clampSecs(st.dur);
  st.dwell = clampSecs(st.dwell);
  st.cut = !!st.cut;
  st.reset = !!st.reset;
  if (!st.cut && st.dur === 0) st.dur = DEFAULT_STEP_DUR;
  steps.splice(at, 0, st);
  const loopFrom = sc && sc.loopFrom >= at ? sc.loopFrom + 1 : (sc ? sc.loopFrom : 0);
  return { steps, loopFrom: Math.min(loopFrom, steps.length - 1) };
}

// Delete step `i`. A script with no steps isn't a script — parseScript returns
// null for one — so the last step can't be deleted.
function deleteStep(sc, i) {
  if (!sc || sc.steps.length <= 1) return sc;
  if (!Number.isInteger(i) || i < 0 || i >= sc.steps.length) return sc;
  const steps = sc.steps.slice();
  steps.splice(i, 1);
  const loopFrom = sc.loopFrom > i ? sc.loopFrom - 1 : sc.loopFrom;
  return { steps, loopFrom: Math.min(loopFrom, steps.length - 1) };
}

// Move the loop marker. Setting it where it already is clears it back to 0 — the
// whole script loops — so the same gesture turns an intro on and off.
function setLoopFrom(sc, i) {
  if (!sc) return sc;
  const at = Math.max(0, Math.min(sc.steps.length - 1, i));
  return { steps: sc.steps.slice(), loopFrom: at === sc.loopFrom ? 0 : at };
}

// Next/previous named curve, wrapping. No ease means the default, so a first
// press moves off `smooth` rather than onto it.
function cycleEase(name, dir) {
  const i = EASE_NAMES.indexOf(EASINGS[name] ? name : DEFAULT_EASE);
  const n = EASE_NAMES.length;
  return EASE_NAMES[(((i + (dir < 0 ? -1 : 1)) % n) + n) % n];
}

// The default script for a pack: its own per-leg timing, rotated. `dur` on the
// PREVIOUS filled slot timed the leg out of it, which is the leg into this one;
// `hold` was always the dwell here and stays put. The first slot takes its
// arriving leg from the last, because the cycle wraps. Result: a pack plays
// exactly as it did before scripts existed.
function scriptFromPack(slots, legSeconds) {
  const filled = [];
  for (let i = 0; i < slots.length; i++) if (slots[i]) filled.push(i);
  if (!filled.length) return null;
  const steps = filled.map((slot, k) => {
    const prev = slots[filled[(k - 1 + filled.length) % filled.length]];
    return {
      slot,
      cut: false,
      dur: legSeconds * (prev.dur == null ? 1 : prev.dur),
      dwell: legSeconds * (slots[slot].hold || 0),
      ease: prev.ease,
      reset: false, // only a hand-written script can ask for a re-seed

    };
  });
  return { steps, loopFrom: 0 };
}

// --- query building -------------------------------------------------------
// URLSearchParams percent-encodes every delimiter a pack spec is made of. Measured
// on the shipped Weave pack: the ?packs= value is 178 characters of information
// that URLSearchParams blows up to 266 with %3A / %2C / %3B / %2F, and the whole
// share URL runs 365. Raw, those are 178 and 277 — a third off the param, 24% off
// the URL. (The design note in ideas.md guessed two thirds; it's a third.)
// All five delimiters are legal raw in a query per RFC 3986 (`:` and `@` are
// pchar, `,` and `;` are sub-delims, `/` is explicitly allowed), the URL.search
// setter passes them through, and URLSearchParams reads them back unchanged.
//
// So: let URLSearchParams do the encoding — it's the part that has to be right —
// then un-escape only these five. `&`, `=`, `+` and space stay encoded, because
// those are what hold the query's own structure together. A value that literally
// contains the characters "%3A" was encoded to "%253A" and doesn't match.
// `=` is safe because only the FIRST `=` of a pair separates key from value —
// URLSearchParams reads `script=~2@8/60` and `a=b=c` the same correct way.
const RAW_IN_QUERY = {
  '%3A': ':', '%2C': ',', '%3B': ';', '%40': '@', '%2F': '/', '%3D': '=', '%7E': '~',
  '%21': '!',
};
const compactQuery = (params) =>
  params.toString().replace(/%3A|%2C|%3B|%40|%2F|%3D|%7E|%21/g, (m) => RAW_IN_QUERY[m]);

// --- easing lookup --------------------------------------------------------
// Takes an object rather than a name, so a step, a preset or a bare { ease } all
// go straight in and anything unrecognized lands on the default curve.
const legEase = (p) => EASINGS[p.ease] || EASINGS[DEFAULT_EASE];

// node only — the browser loads this as a classic script (module is undefined).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SLOT_COUNT, EASINGS, DEFAULT_EASE, PARAMS, TIMING,
    filledCount, firstFilled, nextFilled, trimHoles,
    storeSlot, clearSlot, autoName, forkPack,
    parsePack, parseSlot, encodePack, compactQuery,
    DEFAULT_STEP_DUR, parseScript, encodeScript, stepSeconds, scriptLength, stepAt, stepStart, findStepForSlot, scriptFromPack,
    segments, playheadFrac,
    EASE_NAMES, withStep, insertStep, deleteStep, setLoopFrom, cycleEase,
    legEase,
  };
}
