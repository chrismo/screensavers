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
const RAW_IN_QUERY = { '%3A': ':', '%2C': ',', '%3B': ';', '%40': '@', '%2F': '/' };
const compactQuery = (params) =>
  params.toString().replace(/%3A|%2C|%3B|%40|%2F/g, (m) => RAW_IN_QUERY[m]);

// --- leg timing -----------------------------------------------------------
// hold/dur are multiples of the panel's lerpDuration rather than absolute
// seconds, so the lerpDuration knob scales a whole pack up or down while the
// pack keeps its internal rhythm.
const legDurFrames  = (p, lerpDuration) => Math.max(1, Math.round(lerpDuration * (p.dur == null ? 1 : p.dur)));
const legHoldFrames = (p, lerpDuration) => Math.max(0, Math.round(lerpDuration * (p.hold || 0)));
const legEase = (p) => EASINGS[p.ease] || EASINGS[DEFAULT_EASE];

// node only — the browser loads this as a classic script (module is undefined).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SLOT_COUNT, EASINGS, DEFAULT_EASE, PARAMS, TIMING,
    filledCount, firstFilled, nextFilled, trimHoles,
    storeSlot, clearSlot, autoName, forkPack,
    parsePack, parseSlot, encodePack, compactQuery,
    legDurFrames, legHoldFrames, legEase,
  };
}
