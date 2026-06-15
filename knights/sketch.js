// Knights — "how it's built". Replays the ACTUAL turn-based placement of the
// spiral knight-coloring instead of sweeping the finished pattern. The knights
// rule: cells of a square spiral are claimed by K colors taking turns; on a
// color's turn it grabs the lowest-numbered cell not occupied and not attacked
// by ANY OTHER color (same-color attacks are allowed — that asymmetry breeds the
// pattern). This page narrates that decision: a color's cursor walks the spiral
// to a candidate, we flash the cells it skips (occupied / attacked by an enemy),
// then on a legal cell it commits and lights the squares it now threatens. It
// opens slow and zoomed in (a few decisions a second), then accelerates and
// zooms out, dropping the per-step overlay and just letting the K cursors
// interleave to fill the whole field — the "hybrid" narrate→interleave.
//
// Renderer is Canvas2D: the overlay is glyphs, grid lines, outlines and text that
// 2D draws directly. The committed field is blitted from a 1px-per-cell offscreen
// canvas (one drawImage/frame), so it scales to large extents.
//
// History: this Canvas2D construction-order view replaced an earlier WebGL sketch
// that swept the finished pattern (the per-cursor reveal shows dynamics the
// uniform sweep averaged away). See spec.md for the design decisions. Generic
// panel/page chrome lives in ../panel.js + ../chrome.js; the knights solver and
// piece math are inline below.

// =======================================================================
// Duplicated pure core (kept in sync with ../knights/sketch.js by hand)
// =======================================================================
const MIN_COLORS = 2;
const MAX_COLORS = 8;

const PIECES = {
  knight:      [2, 1],
  wazir:       [1, 0],
  ferz:        [1, 1],
  dabbaba:     [2, 0],
  alfil:       [2, 2],
  threeleaper: [3, 0],
  zebra:       [3, 2],
  antelope:    [4, 3],
};
const PIECE_NAMES = Object.keys(PIECES);
const PIECE_LABEL = {
  knight: 'Knight', wazir: 'Wazir', ferz: 'Ferz', dabbaba: 'Dabbaba',
  alfil: 'Alfil', threeleaper: 'Three-leaper', zebra: 'Zebra', antelope: 'Antelope',
};

const PALETTES = [
  { name: 'Vivid',  bg: [10, 11, 16], hue0: 8,   sat: 0.70, light: 0.58 },
  { name: 'Neon',   bg: [8, 8, 12],   hue0: 330, sat: 0.95, light: 0.62 },
  { name: 'Pastel', bg: [16, 16, 22], hue0: 20,  sat: 0.45, light: 0.70 },
  { name: 'Mono',   bg: [13, 13, 15], mono: true },
];
function curPalette() { return PALETTES[paletteIdx % PALETTES.length]; }

function hsl2rgb(h, s, l) {
  if (s === 0) { const c = Math.round(l * 255); return [c, c, c]; }
  const hue2 = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2(p, q, h + 1 / 3), hue2(p, q, h), hue2(p, q, h - 1 / 3)]
    .map((v) => Math.round(v * 255));
}

function genColors(scheme, N) {
  const out = [];
  for (let i = 0; i < N; i++) {
    if (scheme.mono) {
      const t = N <= 1 ? 0 : i / (N - 1);
      const c = Math.round((0.92 - 0.62 * t) * 255);
      out.push([c, c, Math.min(255, Math.round(c * 1.03))]);
    } else {
      const h = (((scheme.hue0 || 0) + i * 360 / N) % 360) / 360;
      out.push(hsl2rgb(h, scheme.sat, scheme.light));
    }
  }
  return out;
}

// A group is { pieces: [leaper, …], count }: its colors move as the UNION of the
// listed leapers (a compound piece). Total colors = sum of counts.
let groups = [{ pieces: ['knight'], count: 3 }];
function totalColors() { let s = 0; for (const g of groups) s += g.count; return s; }
function sortPieces(ps) {
  const uniq = [...new Set(ps)].filter((p) => PIECES[p]);
  uniq.sort((a, b) => PIECE_NAMES.indexOf(a) - PIECE_NAMES.indexOf(b));
  return uniq;
}
function pieceSetLabel(ps) { return ps.map((p) => PIECE_LABEL[p] || p).join('+'); }
function labelText() {
  return groups.map((g) => `${pieceSetLabel(g.pieces)}×${g.count}`).join(' · ');
}
function groupsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].count !== b[i].count || a[i].pieces.length !== b[i].pieces.length) return false;
    for (let j = 0; j < a[i].pieces.length; j++) if (a[i].pieces[j] !== b[i].pieces[j]) return false;
  }
  return true;
}
function cloneGroups(gs) { return gs.map((g) => ({ pieces: g.pieces.slice(), count: g.count })); }
function normalizeGroups() {
  groups = groups.map((g) => ({ pieces: sortPieces(g.pieces || []), count: g.count | 0 }))
    .filter((g) => g.pieces.length && g.count > 0);
  if (!groups.length) groups = [{ pieces: ['knight'], count: 3 }];
  let t = totalColors();
  for (let i = groups.length - 1; i >= 0 && t > MAX_COLORS; i--) {
    const cut = Math.min(groups[i].count, t - MAX_COLORS);
    groups[i].count -= cut; t -= cut;
    if (groups[i].count === 0) groups.splice(i, 1);
  }
  if (!groups.length) groups = [{ pieces: ['knight'], count: MAX_COLORS }];
  while (totalColors() < MIN_COLORS) groups[groups.length - 1].count++;
}

// Square spiral: counterclockwise, starts at origin, first step east.
function spiralStep(a, b) {
  if (a === 0 && b === 0) return [1, 0];
  if (a > Math.abs(b)) return [a, b + 1];
  if (a < -Math.abs(b)) return [a, b - 1];
  if (b > Math.abs(a)) return [a - 1, b];
  if (b < -Math.abs(a)) return [a + 1, b];
  if (a === b && a > 0) return [a - 1, b];
  if (a === b && a < 0) return [a + 1, b];
  if (a === -b && a > 0) return [a + 1, b];
  return [a, b - 1];
}
function leaperOffsets(piece) {
  const [m, n] = PIECES[piece] || PIECES.knight;
  return [
    [m, n], [m, -n], [-m, n], [-m, -n],
    [n, m], [-n, m], [n, -m], [-n, -m],
  ];
}

// Bump the MINOR on each change so the panel shows when a new build has loaded.
const VERSION = '1.22';

// =======================================================================
// Live params (URL-overridable, panel-tunable)
// =======================================================================
let extent = 24;         // S: max spiral shell ≈ half the grid side (a rung on EXTENT_STEPS)
// Speed is a discrete LEVEL (what the panel gauge and the URL store), mapped to an
// actual placements/sec rate via a geometric ladder. Level 0 = static; 1..8 index
// SPEED_RATES. The fractional slow rates never surface in the panel or the URL.
const SPEED_RATES = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8]; // placements/sec at t=0, per level
let speedLevel = 3;      // 0 = static; default 3 → 1/4 per sec (the ramp accelerates from here)
let lastSpeedLevel = 3;  // remembered animated level, so the static toggle can restore it
let speed = SPEED_RATES[speedLevel - 1]; // derived rate the pacing math uses; 0 when static
let paletteIdx = 0;
let startFrac = 0;       // initial timeline fraction 0..1 (URL `start`)
let cyclePresets = false;
let details = true;      // narration overlays on? off = pure screensaver (field + grid only)
let spiralStyle = 'spiral'; // grid/spiral view: 'none' | 'spiral' | 'grid' | 'both'

// --- pacing / camera constants ------------------------------------------
const TAU = 6.0;             // seconds; placement rate ≈ speed·e^(t/TAU) (bigger = gentler ramp)
const NARRATE_PX = 22;       // cell px above which we draw the step overlay
const NARRATE_RATE_MAX = 10; // placements/sec above which narration is too fast
const DETAIL_CAP = 300;      // record scan/threat detail for only the first N events
const SCAN_CAP = 600;        // max recorded evaluations per turn (detail events)
const EVAL_EVENTS = 12;      // first N placements play eval-by-eval (slow intro)
const EVAL_PER_SEC = 14;     // intro cursor evals/sec AT speed=2 (scales with speed so the knob is the overall tempo)
const XMARK_FADE = 2.6;      // seconds a conflict ✕ lingers after the cursor passes it
const PING_DUR = 0.7;        // sonar ping lifetime (s)
const H0 = 5;                // min half-window (cells) — opening zoom shows ~11 cells
const MARGIN = 1.15;         // keep the frontier this far inside the frame
const HALF_EASE = 2.2;       // half-window easing toward target (per second)
const HOLD_SEC = 4;
const FADE_SEC = 1.2;

// Extent is a discrete ladder: a small readable default, then round hundreds to
// 1000. The panel arrows / [ ] step between rungs; the URL snaps to the nearest.
const EXTENT_STEPS = [24, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
const LANDING_DUR = 0.12;    // seconds for the cell-drop pop — constant, NOT tied to speed

const presets = [
  { name: 'Knights ×3',   groups: [{ pieces: ['knight'], count: 3 }], paletteIdx: 0 },
  { name: 'Red & Black',  groups: [{ pieces: ['knight'], count: 2 }], paletteIdx: 3 },
  { name: 'Knight+Zebra', groups: [{ pieces: ['knight'], count: 2 }, { pieces: ['zebra'], count: 1 }], paletteIdx: 0 },
  { name: 'Ferz+Dab ×8',  groups: [{ pieces: ['ferz', 'dabbaba'], count: 8 }], paletteIdx: 0 },
  { name: 'Wa+Fe+Al',     groups: [{ pieces: ['wazir'], count: 1 }, { pieces: ['ferz'], count: 1 }, { pieces: ['alfil'], count: 1 }], paletteIdx: 1 },
  { name: 'Wa+Fe+Dab ×6', groups: [{ pieces: ['wazir', 'ferz', 'dabbaba'], count: 6 }], paletteIdx: 0 },
  { name: '8-mix',        groups: [{ pieces: ['knight'], count: 4 }, { pieces: ['ferz'], count: 2 }, { pieces: ['dabbaba', 'zebra'], count: 2 }], paletteIdx: 2 },
  { name: '5-mix',        groups: [{ pieces: ['knight'], count: 2 }, { pieces: ['wazir'], count: 2 }, { pieces: ['zebra'], count: 1 }], paletteIdx: 1 },
];
let presetIdx = 0;

const helpText = {
  extent: 'How far the spiral is computed (max shell). Small keeps the solve readable; bigger plays longer before it fills.',
  speed: 'Overall tempo, level 1 (slowest) → 8 (fastest): scales the narrated crawl and the rate the ramp accelerates from. The slow levels are very leisurely; 0 = static (hold on the finished pattern). The per-cell drop is always a quick pop regardless of level.',
  palette: 'Color scheme. Colors evenly span the hue wheel for however many colors the groups add up to.',
};

// =======================================================================
// Stepwise solver — same algorithm as ../knights/ simulate(), instrumented to
// emit the placement SEQUENCE. Each event is either a placement ('p', with the
// cell, the squares it now threatens, and the cells it skipped + why) or an
// 'exhausted' turn ('x', a color that ran off the grid — the "or none").
// =======================================================================
let lastSimMs = 0;

function solveSteps(S) {
  const W = 2 * S + 1;
  const occ = new Int8Array(W * W);
  const threat = new Uint8Array(W * W);
  const idx = (x, y) => (y + S) * W + (x + S);
  const inGrid = (x, y) => x >= -S && x <= S && y >= -S && y <= S;

  const colorOffs = [];
  for (const g of groups) {
    const offs = g.pieces.flatMap(leaperOffsets);
    for (let i = 0; i < g.count; i++) colorOffs.push(offs);
  }
  const K = colorOffs.length;

  const cx = new Int32Array(K), cy = new Int32Array(K);
  const done = new Array(K).fill(false);
  let remaining = K;

  // The construction sequence lives in flat typed arrays (one entry per event) so
  // it scales to large extents; rich per-step detail (scan/threats) is kept only
  // for the first DETAIL_CAP events — the narrated opening — as objects.
  const cap = W * W + K; // placements ≤ cells, plus one "exhausted" event per color
  const seqT = new Uint8Array(cap);  // 0 = placement, 1 = exhausted turn
  const seqK = new Uint8Array(cap);  // color
  const seqX = new Int16Array(cap);  // cell (placements only)
  const seqY = new Int16Array(cap);
  const detail = [];                 // {scan,threats} for events < DETAIL_CAP; sparse after
  let N = 0;

  const t0 = performance.now();
  while (remaining > 0) {
    for (let k = 0; k < K; k++) {
      if (done[k]) continue;
      let x = cx[k], y = cy[k];
      const notK = (~(1 << k)) & 0xff;
      const wantDetail = N < DETAIL_CAP;
      const scan = wantDetail ? [] : null; // every cell the cursor evaluated and rejected
      let off = false;
      while (true) {
        if (x > S || x < -S || y > S || y < -S) { done[k] = true; remaining--; off = true; break; }
        const id = idx(x, y);
        if (occ[id] === 0 && (threat[id] & notK) === 0) break;
        if (wantDetail && scan.length < SCAN_CAP) {
          if (occ[id] !== 0) scan.push({ x, y, kind: 'occ', by: occ[id] - 1 });
          else {
            let by = -1;
            for (let b = 0; b < K; b++) { if (b !== k && (threat[id] & (1 << b))) { by = b; break; } }
            scan.push({ x, y, kind: 'threat', by });
          }
        }
        const nxt = spiralStep(x, y);
        x = nxt[0]; y = nxt[1];
      }
      cx[k] = x; cy[k] = y;
      if (off) { seqT[N] = 1; seqK[N] = k; if (wantDetail) detail[N] = null; N++; continue; }

      const id = idx(x, y);
      occ[id] = k + 1;
      const bit = 1 << k;
      const offs = colorOffs[k];
      const threats = wantDetail ? [] : null;
      for (let o = 0; o < offs.length; o++) {
        const tx = x + offs[o][0], ty = y + offs[o][1];
        if (inGrid(tx, ty)) { threat[idx(tx, ty)] |= bit; if (wantDetail) threats.push([tx, ty]); }
      }
      seqT[N] = 0; seqK[N] = k; seqX[N] = x; seqY[N] = y;
      if (wantDetail) detail[N] = { scan, threats };
      N++;
    }
  }
  lastSimMs = performance.now() - t0;
  return { N, K, S, W, colorOffs, seqT, seqK, seqX, seqY, detail };
}

// =======================================================================
// Canvas2D renderer
// =======================================================================
const canvas = document.getElementById('lab');
const ctx = canvas.getContext('2d');

let sim = null;          // { N, K, S, W, colorOffs, seqT/seqK/seqX/seqY (typed), detail[] }
let palCols = [];        // [r,g,b] per color
let colorLabel = [];     // per-color piece label (group expanded)
let field = null;        // offscreen canvas, 1px per cell (the committed field)
let fieldCtx = null;
let occGrid = null;      // Int8Array board (0 empty else color+1) — for attacker lookups
let threatGrid = null;   // Uint8Array bitmask — bit j set = color j attacks this cell (the danger map)
let cursors = [];        // per-color last placement {x,y} — the "where it left off" markers
let cssW = 0, cssH = 0, dpr = 1;

// --- run/animation state ------------------------------------------------
let head = 0;            // # of events committed
let clock = 0;           // seconds elapsed in the current run
let acc = 0;             // fractional placement accumulator
let half = H0;           // current half-window (cells), eased
let maxR = 0;            // frontier radius (max Chebyshev of placed cells)
let runState = 'run';    // run → hold → fadeout → fadein → run (or 'static': frozen finished pattern)
let stateT = 0;
let fade = 1;
let paused = false;
let evalPos = 0;         // fractional eval index within the current placement (intro)
let xMarks = [];         // lingering conflict ✕ marks: { x, y, by, t }
let pings = [];          // sonar rings on just-placed cells: { x, y, t }
let animClock = 0;       // advances only while running — ages xMarks/pings
let uiClock = 0;         // always advances — drives the paused-marker pulse
let stepDirty = false;   // a backward step happened; coalesce the (O(head)) rebuild to one/frame
let landHead = -1;       // which event the drop-pop timer is for (so the pop is per-placement)
let landT = 0;           // uiClock when the current placement's drop pop began
let introT = 0;          // real seconds spent in the eval-paced intro (anchors the ramp handoff)
function introActive() { return head < EVAL_EVENTS; }       // slow eval-by-eval opening
function evalLen(i) { const d = sim.detail[i]; return (d && d.scan) ? d.scan.length + 1 : 1; }

// Materialize a lightweight event object for index i (only ever one or two live at
// once — the bulk sequence stays in flat typed arrays). null if out of range.
function eventAt(i) {
  if (i < 0 || i >= sim.N) return null;
  const d = sim.detail[i];
  return {
    t: sim.seqT[i] === 1 ? 'x' : 'p',
    k: sim.seqK[i], x: sim.seqX[i], y: sim.seqY[i],
    scan: d ? d.scan : null,
    threats: d ? d.threats : null,
  };
}

// The eval position drawNarration is currently showing — used to snap evalPos on
// pause so manual stepping picks up exactly where the live crawl was.
function currentEp() {
  const d = sim.detail[head];
  const scanLen = (d && d.scan) ? d.scan.length : 0;
  if (introActive()) return Math.max(0, Math.min(scanLen + 1, evalPos));
  return Math.min(scanLen + 1, acc * (scanLen + 1));
}

function colorStr(k) { const c = palCols[k] || [200, 200, 200]; return `rgb(${c[0]},${c[1]},${c[2]})`; }
function bgStr() { const b = curPalette().bg; return `rgb(${b[0]},${b[1]},${b[2]})`; }

// Cumulative placements meant to have played by elapsed time t, and its inverse.
function playedBy(t) { return speed * TAU * (Math.exp(t / TAU) - 1); }
function timeForPlayed(p) { return TAU * Math.log(Math.max(0, p) / (speed * TAU) + 1); }
function rateAt(t) { return speed * Math.exp(t / TAU); }

// speed 0 = static: jump to the finished pattern and hold (no ramp math is ever
// run in this mode, so the divide-by-zero in timeForPlayed is never reached).
function isStatic() { return speed === 0; }

// Set the speed level (0 = static, 1..N index SPEED_RATES) and derive the rate the
// pacing math reads. Remembers the last animated level for the static toggle.
function setSpeedLevel(L) {
  speedLevel = Math.max(0, Math.min(SPEED_RATES.length, L | 0));
  speed = speedLevel === 0 ? 0 : SPEED_RATES[speedLevel - 1];
  if (speedLevel > 0) lastSpeedLevel = speedLevel;
}
// What the panel shows for speed — the bare level number (0 → static).
function speedLabel() { return speedLevel === 0 ? 'static' : String(speedLevel); }

// Extent ladder helpers: nearest rung to the current/given value.
function extentIndex() {
  let best = 0, bd = Infinity;
  for (let i = 0; i < EXTENT_STEPS.length; i++) {
    const d = Math.abs(EXTENT_STEPS[i] - extent);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function snapExtent(v) {
  let best = EXTENT_STEPS[0], bd = Infinity;
  for (const s of EXTENT_STEPS) { const d = Math.abs(s - v); if (d < bd) { bd = d; best = s; } }
  return best;
}

// Stamp the cells a color-k piece at (x,y) attacks (by ITS shape) into the threat
// bitmask — exactly how the solver builds it; this IS the danger map's data.
function stampThreat(k, x, y) {
  if (!threatGrid || !sim.colorOffs) return;
  const offs = sim.colorOffs[k], bit = 1 << k, S = sim.S, W = sim.W;
  for (let o = 0; o < offs.length; o++) {
    const tx = x + offs[o][0], ty = y + offs[o][1];
    if (tx < -S || tx > S || ty < -S || ty > S) continue;
    threatGrid[(ty + S) * W + (tx + S)] |= bit;
  }
}

// Commit event i straight from the typed-array sequence: paint the cell, update
// the occ/threat grids, the color's cursor, and the frontier radius.
function commitAt(i) {
  if (sim.seqT[i] !== 0) return;               // exhausted turn — nothing placed
  const k = sim.seqK[i], x = sim.seqX[i], y = sim.seqY[i];
  fieldCtx.fillStyle = colorStr(k);
  fieldCtx.fillRect(x + sim.S, sim.S - y, 1, 1); // row = S - y → +y points up
  occGrid[(y + sim.S) * sim.W + (x + sim.S)] = k + 1;
  stampThreat(k, x, y);
  cursors[k] = { x, y };
  const r = Math.max(Math.abs(x), Math.abs(y));
  if (r > maxR) maxR = r;
}

// commitAt + narration side-effects: a sonar ping on the placed cell, and the
// turn's conflict cells stamped as lingering ✕ marks (cleared if later filled).
function commitNarrated(i) {
  commitAt(i);
  if (sim.seqT[i] !== 0) return;
  const x = sim.seqX[i], y = sim.seqY[i];
  pings.push({ x, y, t: uiClock }); // uiClock advances even while paused
  if (pings.length > 8) pings.shift();
  for (let j = xMarks.length - 1; j >= 0; j--) {
    if (xMarks[j].x === x && xMarks[j].y === y) xMarks.splice(j, 1); // this cell is filled now
  }
  const d = sim.detail[i];
  if (d && d.scan) {
    for (const s of d.scan) if (s.kind === 'threat') xMarks.push({ x: s.x, y: s.y, by: s.by, t: animClock });
    while (xMarks.length > 220) xMarks.shift();
  }
}

// Replay events [0, n) into a fresh field + grids (palette change / step-back /
// ?start=). Recomputes maxR.
function repaintField(n) {
  fieldCtx.clearRect(0, 0, field.width, field.height);
  if (occGrid) occGrid.fill(0);
  if (threatGrid) threatGrid.fill(0);
  cursors = new Array(sim.K).fill(null);
  maxR = 0;
  for (let i = 0; i < n; i++) commitAt(i);
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cssW = window.innerWidth; cssH = window.innerHeight;
  const w = Math.floor(cssW * dpr), h = Math.floor(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
  }
}
window.addEventListener('resize', resize);

// Camera: origin centered, zoom set by the eased half-window.
function viewMin() { return Math.min(cssW, cssH); }
function cellPxFor(h) { return viewMin() / (2 * h + 1); }

function rebuild(resetRun = true) {
  const S = Math.max(24, Math.min(extent, 1000));
  if (S !== extent) extent = S;
  normalizeGroups();
  sim = solveSteps(S);
  palCols = genColors(curPalette(), Math.max(1, sim.K));
  colorLabel = [];
  for (const g of groups) { const lbl = pieceSetLabel(g.pieces); for (let i = 0; i < g.count; i++) colorLabel.push(lbl); }
  field = document.createElement('canvas');
  field.width = sim.W; field.height = sim.W;
  fieldCtx = field.getContext('2d');
  fieldCtx.imageSmoothingEnabled = false;
  occGrid = new Int8Array(sim.W * sim.W);
  threatGrid = new Uint8Array(sim.W * sim.W);
  cursors = new Array(sim.K).fill(null);
  console.log(`[knights] ${labelText()} — S=${sim.S}, ${sim.K} colors, ${sim.N} events in ${lastSimMs.toFixed(1)}ms`);
  if (resetRun) startRun();
  updateDom();
  updateConfigLabel();
  renderGroups();
}

// Begin (or restart) the run, honoring ?start= by pre-committing that fraction.
function startRun() {
  head = 0; clock = 0; acc = 0; maxR = 0; half = H0;
  runState = 'run'; stateT = 0; fade = 1; paused = false;
  evalPos = 0; xMarks = []; pings = []; animClock = 0; stepDirty = false; landHead = -1; introT = 0;
  if (occGrid) occGrid.fill(0);
  if (threatGrid) threatGrid.fill(0);
  cursors = new Array(sim.K).fill(null);
  if (fieldCtx) fieldCtx.clearRect(0, 0, field.width, field.height); // wipe the old render
  if (isStatic()) {
    // Static mode: commit the whole field, snap the zoom to the full frontier, and
    // hold — no narration, no ramp, no fade/restart cycle.
    head = sim.N;
    repaintField(head);
    runState = 'static';
    half = Math.max(H0, Math.min(sim.S, maxR * MARGIN + 0.5));
    return;
  }
  if (startFrac > 0 && sim.N) {
    head = Math.min(sim.N, Math.floor(startFrac * sim.N));
    repaintField(head);
    clock = timeForPlayed(head);
    half = Math.max(H0, maxR * MARGIN + 0.5);
  }
}

// =======================================================================
// Per-frame update + draw
// =======================================================================
function update(dt) {
  const total = sim.N;
  uiClock += dt;
  // A backward step (or a burst of them, held) only marks state dirty; do the one
  // O(head) rebuild here, at most once per frame, then snap the zoom to the
  // (now-correct) frontier. Coalescing keeps held-left bounded at large extents.
  if (stepDirty) {
    repaintField(head);
    stepDirty = false;
    half = Math.max(H0, Math.min(sim.S, maxR * MARGIN + 0.5));
  }
  if (runState === 'static') return; // frozen finished pattern — nothing to advance
  if (runState === 'run' && !paused) {
    animClock += dt;
    if (introActive()) {
      // Slow opening: walk the cursor through every evaluation, one at a time.
      // Scale with speed (anchored so speed=2 → EVAL_PER_SEC) so the speed knob
      // visibly governs the narrated intro, not just the post-intro ramp.
      introT += dt;
      evalPos += EVAL_PER_SEC * (speed / 2) * dt;
      let guard = 0;
      while (head < total && evalPos >= evalLen(head)) {
        evalPos -= evalLen(head);
        commitNarrated(head); head++;
        if (!introActive()) {
          // Hand off to the ramp CONTINUOUSLY: start it at the intro's actual
          // average rate (head/introT) rather than fast-forwarding the clock up
          // the curve (which jumped to ~2+speed and felt like a sudden lurch).
          const rIntro = head / Math.max(introT, 0.001);
          clock = TAU * Math.log(Math.max(rIntro, speed) / speed);
          evalPos = 0; break;
        }
        if (++guard > 4000) break;
      }
    } else {
      clock += dt;
      acc += rateAt(clock) * dt;
      let n = Math.floor(acc);
      if (n > 0) {
        acc -= n;
        n = Math.min(n, total - head);
        for (let i = 0; i < n; i++) { commitNarrated(head); head++; }
      }
    }
    // Age out lingering ✕ marks (frozen while paused so they can be studied).
    if (xMarks.length) xMarks = xMarks.filter((m) => animClock - m.t < XMARK_FADE);
    if (head >= total) { runState = 'hold'; stateT = 0; }
  } else if (runState === 'hold') {
    stateT += dt; fade = 1;
    if (stateT >= HOLD_SEC) { runState = 'fadeout'; stateT = 0; }
  } else if (runState === 'fadeout') {
    stateT += dt;
    fade = 1 - Math.min(stateT / FADE_SEC, 1);
    if (stateT >= FADE_SEC) {
      if (cyclePresets) { gotoNextPreset(); return; } // rebuild → fresh run
      startFrac = 0; startRun(); fade = 0; runState = 'fadein'; stateT = 0;
    }
  } else if (runState === 'fadein') {
    stateT += dt;
    fade = Math.min(stateT / FADE_SEC, 1);
    if (stateT >= FADE_SEC) { runState = 'run'; stateT = 0; }
  }

  // Sonar pings age on uiClock so a step's ring springs out and fades while paused.
  if (pings.length) pings = pings.filter((p) => uiClock - p.t < PING_DUR);

  // Ease the half-window toward the frontier (only ever zooms out).
  const target = Math.max(H0, Math.min(sim.S, maxR * MARGIN + 0.5));
  if (target > half) half += (target - half) * Math.min(1, dt * HALF_EASE);
}

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = bgStr();
  ctx.fillRect(0, 0, cssW, cssH);

  const cellPx = cellPxFor(half);
  const originX = cssW / 2, originY = cssH / 2;
  // Faded grid + the spiral track first, so placed cells sit on top (graph-paper).
  drawGrid(cellPx, originX, originY);
  drawSpiral(cellPx, originX, originY);
  // Blit the whole committed field in one call (transparent where empty → bg).
  const dw = sim.W * cellPx;
  const dx = originX - (sim.S + 0.5) * cellPx;
  const dy = originY - (sim.S + 0.5) * cellPx;
  ctx.drawImage(field, dx, dy, dw, dw);

  // Narrating this frame? (gates both the danger map and the step overlay)
  // `details` off → pure screensaver: skip every overlay, just field + grid.
  const narrate = details && runState === 'run' && cellPx >= NARRATE_PX && head < sim.N &&
    (paused || introActive() || rateAt(clock) <= NARRATE_RATE_MAX);
  const activeK = head < sim.N ? sim.seqK[head] : 0;

  if (details) {
    // Danger map: where the active mover can't go (enemy fire), in attacker colors.
    if (narrate) drawDangerMap(cellPx, originX, originY, activeK);

    // Lingering conflict ✕ marks (fade over time; cleared when a cell fills).
    drawXMarks(cellPx, originX, originY);

    // Persistent per-color markers: where each color last left off (hidden in the
    // static finished view, which is meant to read as a clean wallpaper).
    if (runState !== 'static') drawCursorMarkers(cellPx, originX, originY);

    // The active decision overlay: move boxes (my reach), attacker lines, cursor.
    if (narrate) drawNarration(eventAt(head), cellPx, originX, originY);

    // One-time sonar ring on each just-placed cell (springs out, fades, gone).
    drawPings(cellPx, originX, originY);
  }

  if (fade < 1) {
    ctx.globalAlpha = 1 - fade;
    ctx.fillStyle = bgStr();
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.globalAlpha = 1;
  }
}

// How "in" the spiral-maze is (0 zoomed out → 1 when cells are big enough to read
// it). Drives the maze alpha AND the plain grid's fade-out, so the path's open
// gaps aren't backfilled by a leftover grid line.
function spiralFade(cellPx) { return Math.max(0, Math.min(1, (cellPx - 8) / 8)); }

// Faded graph-paper grid drawn behind the field, every frame (in the 'grid' and
// 'both' styles). The alpha fades out as cells shrink so it never becomes
// sub-pixel noise when zoomed out.
function drawGrid(cellPx, originX, originY) {
  if (spiralStyle !== 'grid' && spiralStyle !== 'both') return;
  const a = 0.20 * Math.max(0, Math.min(1, (cellPx - 2) / 4));
  if (a <= 0.003) return;
  const S = sim.S;
  const visX = Math.min(S, Math.ceil(cssW / cellPx / 2) + 1);
  const visY = Math.min(S, Math.ceil(cssH / cellPx / 2) + 1);
  // Bound the lines to the (2S+1)² field so they don't bleed past the extent edge
  // (matches the spiral + the field blit); clamped to the viewport for culling.
  const x0 = Math.max(0, originX - (S + 0.5) * cellPx), x1 = Math.min(cssW, originX + (S + 0.5) * cellPx);
  const y0 = Math.max(0, originY - (S + 0.5) * cellPx), y1 = Math.min(cssH, originY + (S + 0.5) * cellPx);
  ctx.strokeStyle = `rgba(255,255,255,${a})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = -visX; gx <= visX + 1; gx++) { const sx = originX + (gx - 0.5) * cellPx; ctx.moveTo(sx, y0); ctx.lineTo(sx, y1); }
  for (let gy = -visY; gy <= visY + 1; gy++) { const sy = originY - (gy - 0.5) * cellPx; ctx.moveTo(x0, sy); ctx.lineTo(x1, sy); }
  ctx.stroke();
}

// The spiral highlight (drawn in the 'spiral' and 'both' styles): the grid's own
// cell walls MINUS the wall the path crosses into the next cell, so the spiral
// corridor reads as the gaps. In 'spiral' the grid isn't drawn at all, so those
// gaps are truly open; in 'both' the faint grid still shows under them. Centered
// on the origin (camera never pans), so only the visible window is computed;
// fades in when cells are big enough to read it and is gone once zoomed out.
function drawSpiral(cellPx, originX, originY) {
  if (spiralStyle !== 'spiral' && spiralStyle !== 'both') return;
  const a = 0.40 * spiralFade(cellPx);
  if (a <= 0.003) return;
  drawSpiralMaze(cellPx, originX, originY, a);
}

// The square spiral as cell walls EXCEPT where the path threads through.
function drawSpiralMaze(cellPx, originX, originY, a) {
  const S = sim.S;
  const visX = Math.min(S, Math.ceil(cssW / cellPx / 2) + 1);
  const visY = Math.min(S, Math.ceil(cssH / cellPx / 2) + 1);
  const visMax = Math.max(visX, visY);
  const key = (cx, cy) => (cx + 2048) * 4096 + (cy + 2048);

  // "Open" walls = the cell boundaries the spiral path steps across (no wall).
  // openV(x,y) = right edge of cell (x,y); openH(x,y) = top edge of cell (x,y).
  const openV = new Set(), openH = new Set();
  let x = 0, y = 0;
  const cap = (2 * visMax + 2) * (2 * visMax + 2) + 4; // safety bound on the trace
  for (let i = 0; i < cap; i++) {
    const n = spiralStep(x, y); const nx = n[0], ny = n[1];
    if (nx > x) openV.add(key(x, y));
    else if (nx < x) openV.add(key(nx, y));
    else if (ny > y) openH.add(key(x, y));
    else openH.add(key(x, ny));
    x = nx; y = ny;
    if (Math.max(Math.abs(x), Math.abs(y)) > visMax) break;
  }

  // Draw every cell wall in view that the path does NOT cross.
  ctx.strokeStyle = `rgba(255,255,255,${a})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gy = -visY; gy <= visY; gy++) {
    for (let gx = -visX; gx <= visX; gx++) {
      if (!openV.has(key(gx, gy))) {            // right edge: vertical line at gx+0.5
        const sx = originX + (gx + 0.5) * cellPx;
        ctx.moveTo(sx, originY - (gy + 0.5) * cellPx);
        ctx.lineTo(sx, originY - (gy - 0.5) * cellPx);
      }
      if (!openH.has(key(gx, gy))) {            // top edge: horizontal line at gy+0.5
        const sy = originY - (gy + 0.5) * cellPx;
        ctx.moveTo(originX + (gx - 0.5) * cellPx, sy);
        ctx.lineTo(originX + (gx + 0.5) * cellPx, sy);
      }
    }
  }
  ctx.stroke();
}

// The danger map: every EMPTY cell an enemy of the active mover (color k) attacks,
// tinted faintly in the attacker's color. Read straight off the threat bitmask —
// the same field the solver builds — so it's shape-correct for any roster. The
// cursor's job is to find the first empty cell with no tint.
function drawDangerMap(cellPx, originX, originY, k) {
  if (!threatGrid || !occGrid) return;
  const S = sim.S, W = sim.W;
  const notK = (~(1 << k)) & 0xff; // ignore the mover's own attacks (same-color is legal)
  const visX = Math.min(S, Math.ceil(cssW / cellPx / 2) + 1);
  const visY = Math.min(S, Math.ceil(cssH / cellPx / 2) + 1);
  for (let gy = -visY; gy <= visY; gy++) {
    for (let gx = -visX; gx <= visX; gx++) {
      const id = (gy + S) * W + (gx + S);
      if (occGrid[id] !== 0) continue;     // occupied cells are skipped on occupancy alone
      const mask = threatGrid[id] & notK;
      if (!mask) continue;
      let j = -1;
      for (let b = 0; b < sim.K; b++) { if (mask & (1 << b)) { j = b; break; } }
      const c = palCols[j] || [230, 90, 90];
      const l = originX + (gx - 0.5) * cellPx, t = originY - (gy + 0.5) * cellPx;
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.2)`;
      ctx.fillRect(l, t, cellPx, cellPx);
    }
  }
}

// Draw the active decision: the cursor walking the spiral through every cell it
// evaluates (✕ on enemy conflicts, outline on occupied) up to its current eval,
// then the landing — a cursor ring resolving into a color drop. Eval progress is
// driven by `evalPos` during the intro, by `acc` after, or shown in full (paused).
function drawNarration(e, cellPx, originX, originY) {
  if (e.t !== 'p' || !e.scan) return;
  const rect = (x, y) => ({ l: originX + (x - 0.5) * cellPx, t: originY - (y + 0.5) * cellPx, s: cellPx });
  const scanLen = e.scan.length;
  let ep;
  if (paused || introActive()) ep = evalPos;             // manual/intro: held eval cursor
  else ep = Math.min(scanLen + 1, acc * (scanLen + 1));
  const walked = Math.max(0, Math.min(scanLen, Math.floor(ep)));

  // Cells already evaluated and rejected this turn.
  for (let i = 0; i < walked; i++) {
    const s = e.scan[i];
    const r = rect(s.x, s.y);
    if (s.kind === 'threat') {
      const c = s.by >= 0 ? palCols[s.by] : [230, 90, 90];
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.16)`;
      ctx.fillRect(r.l, r.t, r.s, r.s);
      drawCross(r, 'rgba(255,255,255,0.55)', cellPx);
    } else {
      ctx.strokeStyle = 'rgba(170,170,180,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(r.l + 1, r.t + 1, r.s - 2, r.s - 2);
    }
  }

  if (ep < scanLen) {
    // Cursor is currently testing scan[walked]. If it's enemy-blocked, show WHICH
    // enemy knight(s) attack it (line + glow); the cursor ring rides on top.
    const s = e.scan[walked];
    if (s.kind === 'threat') drawAttackHighlight(s.x, s.y, e.k, cellPx, originX, originY);
    // The piece's own move boxes from the cursor — on every empty cell it tests.
    // Occupied cells are skipped before the attack rule is even considered, so none.
    if (s.kind !== 'occ') drawMoveBoxes(s.x, s.y, e.k, cellPx, originX, originY);
    const r = rect(s.x, s.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(1.5, cellPx * 0.08);
    ctx.strokeRect(r.l + 2, r.t + 2, r.s - 4, r.s - 4);
    drawCaption(e, s.x, s.y, s.kind === 'occ' ? 'occupied' : 'testing');
  } else {
    // Landed: show the piece's move boxes from its cell, then drop the color. The
    // drop is a constant-duration pop on real time (NOT tied to speed): at slow
    // tempos the cursor still lingers here, but the fill itself stays quick.
    drawMoveBoxes(e.x, e.y, e.k, cellPx, originX, originY);
    const r = rect(e.x, e.y);
    if (paused) {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = Math.max(1.5, cellPx * 0.09);
      ctx.strokeRect(r.l + 2, r.t + 2, r.s - 4, r.s - 4);
    } else {
      if (landHead !== head) { landHead = head; landT = uiClock; } // pop starts on entry
      const g = Math.min(1, (uiClock - landT) / LANDING_DUR);
      const inset = (1 - g) * r.s * 0.4;
      ctx.fillStyle = colorStr(e.k);
      ctx.fillRect(r.l + inset, r.t + inset, r.s - 2 * inset, r.s - 2 * inset);
    }
    drawCaption(e, e.x, e.y, paused ? 'next' : 'placed');
  }
}

// The enemy piece(s) currently attacking cell (cx,cy) — i.e. why color k can't
// take it. A piece of color j≠k at P attacks (cx,cy) iff P = (cx,cy)+off for some
// of j's leaper offsets (offsets are symmetric under negation). Capped at 4.
function attackersOf(cx, cy, k) {
  const out = [];
  if (!occGrid || !sim.colorOffs) return out;
  const S = sim.S, W = sim.W;
  const seen = new Set();
  for (let j = 0; j < sim.K; j++) {
    if (j === k) continue;
    const offs = sim.colorOffs[j];
    for (let o = 0; o < offs.length; o++) {
      const px = cx + offs[o][0], py = cy + offs[o][1];
      if (px < -S || px > S || py < -S || py > S) continue;
      if (occGrid[(py + S) * W + (px + S)] === j + 1) {
        const key = px + ',' + py;
        if (!seen.has(key)) { seen.add(key); out.push({ x: px, y: py, j }); }
        if (out.length >= 4) return out;
      }
    }
  }
  return out;
}

// Draw the block: a line from each attacking knight to the cell it rules out,
// plus a glow ring on the attacker square, in the attacker's color.
function drawAttackHighlight(cx, cy, k, cellPx, originX, originY) {
  const atks = attackersOf(cx, cy, k);
  if (!atks.length) return;
  const ccx = originX + cx * cellPx, ccy = originY - cy * cellPx;
  for (const a of atks) {                       // lines first (under the glow)
    const c = palCols[a.j] || [230, 90, 90];
    ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},0.85)`;
    ctx.lineWidth = Math.max(1.5, cellPx * 0.06);
    ctx.beginPath();
    ctx.moveTo(originX + a.x * cellPx, originY - a.y * cellPx);
    ctx.lineTo(ccx, ccy);
    ctx.stroke();
  }
  for (const a of atks) {                        // glow ring on each attacker
    const c = palCols[a.j] || [230, 90, 90];
    const ax = originX + a.x * cellPx, ay = originY - a.y * cellPx;
    ctx.save();
    ctx.shadowColor = `rgba(${c[0]},${c[1]},${c[2]},0.95)`;
    ctx.shadowBlur = cellPx * 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = Math.max(1.5, cellPx * 0.08);
    ctx.strokeRect(ax - cellPx / 2 + 2, ay - cellPx / 2 + 2, cellPx - 4, cellPx - 4);
    ctx.restore();
  }
}

// Persistent per-color markers: a pin on each color's most-recent placement, so
// you can track where every cursor has crawled to as the field fills.
function drawCursorMarkers(cellPx, originX, originY) {
  if (!cursors) return;
  const rad = Math.max(2.5, Math.min(cellPx * 0.24, 9));
  for (let k = 0; k < cursors.length; k++) {
    const cur = cursors[k];
    if (!cur) continue;
    const x = originX + cur.x * cellPx, y = originY - cur.y * cellPx;
    const c = palCols[k] || [200, 200, 200];
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.fill();
    ctx.lineWidth = Math.max(1, rad * 0.35);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
  }
}

// Lingering ✕ marks for cells skipped due to enemy conflict — they fade over
// XMARK_FADE and vanish if the cell later fills. Drawn behind the live overlay.
function drawXMarks(cellPx, originX, originY) {
  if (cellPx < 7 || !xMarks.length) return;
  for (const m of xMarks) {
    const a = 1 - (animClock - m.t) / XMARK_FADE;
    if (a <= 0) continue;
    const l = originX + (m.x - 0.5) * cellPx, t = originY - (m.y + 0.5) * cellPx, s = cellPx;
    if (cellPx >= 14) {
      const c = m.by >= 0 ? palCols[m.by] : [230, 90, 90];
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.12 * a})`;
      ctx.fillRect(l, t, s, s);
      drawCross({ l, t, s }, `rgba(255,255,255,${0.4 * a})`, cellPx);
    } else {
      ctx.fillStyle = `rgba(255,255,255,${0.4 * a})`;
      ctx.fillRect(l + s * 0.5 - 1, t + s * 0.5 - 1, 2, 2);
    }
  }
}

// A one-time sonar ring on each placed cell: springs out from the cell center,
// fades, and is done. Ages on uiClock so it animates even while paused/stepping.
function drawPings(cellPx, originX, originY) {
  for (const p of pings) {
    const prog = (uiClock - p.t) / PING_DUR;
    if (prog < 0 || prog >= 1) continue;
    const ease = 1 - (1 - prog) * (1 - prog); // fast spring-out, easing to rest
    const cx = originX + p.x * cellPx, cy = originY - p.y * cellPx;
    const rad = cellPx * (0.3 + ease * 2.7);
    ctx.strokeStyle = `rgba(255,255,255,${0.75 * (1 - prog)})`;
    ctx.lineWidth = Math.max(1, cellPx * 0.08);
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// The piece's own attack squares projected from (cx,cy) — its knight's-move boxes
// in the active color. Deduped for compound pieces; clipped to the grid.
function drawMoveBoxes(cx, cy, k, cellPx, originX, originY) {
  const offs = sim.colorOffs ? sim.colorOffs[k] : null;
  if (!offs) return;
  const c = palCols[k] || [200, 200, 200];
  const S = sim.S;
  ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},0.6)`;
  ctx.lineWidth = Math.max(1, cellPx * 0.05);
  const seen = new Set();
  for (let o = 0; o < offs.length; o++) {
    const tx = cx + offs[o][0], ty = cy + offs[o][1];
    if (tx < -S || tx > S || ty < -S || ty > S) continue;
    const key = tx + ',' + ty;
    if (seen.has(key)) continue;
    seen.add(key);
    const l = originX + (tx - 0.5) * cellPx, t = originY - (ty + 0.5) * cellPx;
    ctx.strokeRect(l + 1.5, t + 1.5, cellPx - 3, cellPx - 3);
  }
}

function drawCross(r, style, cellPx) {
  const m = cellPx * 0.28;
  ctx.strokeStyle = style;
  ctx.lineWidth = Math.max(1, cellPx * 0.06);
  ctx.beginPath();
  ctx.moveTo(r.l + m, r.t + m); ctx.lineTo(r.l + r.s - m, r.t + r.s - m);
  ctx.moveTo(r.l + r.s - m, r.t + m); ctx.lineTo(r.l + m, r.t + r.s - m);
  ctx.stroke();
}

function drawCaption(e, x, y, verb) {
  const lbl = colorLabel[e.k] || 'piece';
  const txt = `${lbl}  ·  ${verb} (${x}, ${y})`;
  ctx.font = '13px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const c = palCols[e.k] || [220, 220, 220];
  ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.95)`;
  ctx.fillText(txt, cssW / 2, cssH - 22);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

// =======================================================================
// Control panel — duplicated knights drawer (house monospace-glass)
// =======================================================================
const dom = {};
let panelReady = false;
const PANEL_CSS = `
  #drawer { position: fixed; top: 0; left: 0; height: 100vh; height: 100dvh; width: 280px;
    background: rgba(10, 12, 18, 0.55); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    color: #ddd; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 12px;
    transform: translateX(-280px); transition: transform 0.32s cubic-bezier(0.2,0.8,0.2,1);
    z-index: 10; box-shadow: 0 0 30px rgba(0,0,0,0.4); }
  #drawer.open { transform: translateX(0); }
  #drawer-toggle { position: absolute; left: 100%; top: 1rem; width: 26px; height: 40px;
    background: rgba(10,12,18,0.55); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    border: none; border-radius: 0 6px 6px 0; color: #9cf; font-size: 18px; cursor: pointer;
    font-family: inherit; display: flex; align-items: center; justify-content: center; padding: 0;
    box-shadow: 4px 0 12px rgba(0,0,0,0.3); }
  #drawer-toggle:hover { color: #fff; } #drawer-toggle:focus { outline: none; }
  #drawer.open #drawer-toggle::before { content: '‹'; }
  #drawer:not(.open) #drawer-toggle::before { content: '›'; }
  #drawer-content { padding: 1.25rem 1.4rem; overflow-y: auto; height: 100%; box-sizing: border-box;
    overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.18) transparent; }
  #drawer-content::-webkit-scrollbar { width: 6px; }
  #drawer-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 3px; }
  #drawer-content h1 { font-size: 14px; font-weight: 500; letter-spacing: 0.04em; margin: 0 0 1rem; color: #fff; }
  #drawer-content h1 small { font-weight: 400; color: #888; margin-left: 0.4em; font-size: 11px; }
  #drawer-content h1 small a { color: #9cf; text-decoration: none; }
  #drawer-content h1 small a:hover { color: #fff; }
  #drawer-content h2 { font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.12em;
    margin: 1.4rem 0 0.5rem; color: #888; }
  .h2-aside { text-transform: none; letter-spacing: 0; color: #777; margin-left: 0.5rem; font-weight: 400; }
  .row { display: grid; grid-template-columns: 4.6rem 5.2rem 1fr; align-items: center; gap: 0.5rem;
    padding: 0.3rem 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .row:last-child { border-bottom: none; }
  .row .label { color: #888; }
  .row .val { color: #fff; font-variant-numeric: tabular-nums; text-align: right; }
  .row .keys { justify-self: start; display: flex; align-items: center; gap: 6px; }
  .row .key-hint { font-size: 10px; color: #5b5b5b; letter-spacing: 0.05em; white-space: nowrap; }
  .grp { border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; padding: 0.45rem 0.5rem; margin-bottom: 0.4rem; }
  .grp-chips { display: flex; flex-wrap: wrap; gap: 0.2rem; align-items: center; }
  .chip { font-family: inherit; font-size: 11px; padding: 0.2rem 0.4rem; border-radius: 3px; border: none;
    background: rgba(156,204,255,0.20); color: #cfe6ff; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .chip.sel::after { content: ' ×'; color: rgba(255,255,255,0.45); }
  .chip.sel:hover { background: rgba(230,110,110,0.30); color: #fff; }
  .chip.add { background: rgba(255,255,255,0.05); color: #9cf; font-weight: 600; padding: 0.2rem 0.45rem; }
  .chip.add:hover { background: rgba(255,255,255,0.12); color: #fff; }
  .grp-roster { display: flex; flex-wrap: wrap; gap: 0.2rem; margin-top: 0.35rem; padding-top: 0.35rem;
    border-top: 1px dashed rgba(255,255,255,0.1); }
  .grp-roster .chip { background: rgba(255,255,255,0.05); color: #8a8a92; }
  .grp-roster .chip:hover { background: rgba(255,255,255,0.12); color: #ddd; }
  .grp-foot { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.5rem; }
  .grp-sw { display: flex; gap: 2px; margin-right: auto; }
  .grp-sw .sw { width: 11px; height: 11px; border-radius: 2px; }
  .grp-foot .grp-count { color: #9cf; font-variant-numeric: tabular-nums; min-width: 1.6rem; text-align: center; }
  .grp-del { background: none; border: none; color: #666; cursor: pointer; font-family: inherit;
    font-size: 13px; padding: 0 0.15rem; }
  .grp-del:hover:not([disabled]) { color: #e66; }
  .grp-del[disabled], .kbd-btn[disabled] { opacity: 0.3; cursor: default; }
  .addgrp { display: block; width: 100%; margin: 0.5rem 0 0.2rem; padding: 0.35rem; border-radius: 3px;
    background: rgba(255,255,255,0.05); color: #9cf; }
  .addgrp[disabled] { opacity: 0.3; cursor: default; }
  .preset-pills { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.18rem; padding: 0.15rem 0 0.3rem; }
  .preset-pills .pill { font-family: inherit; font-size: 11.5px; background: rgba(255,255,255,0.05); color: #777;
    padding: 0.28rem 0.42rem; border-radius: 3px; min-width: 1rem; text-align: center; }
  .preset-pills .pill.active { background: rgba(156,204,255,0.22); color: #9cf; }
  .legend { display: grid; grid-template-columns: auto 1fr; gap: 0.45rem 0.85rem; align-items: center; }
  .kbd { font-family: inherit; background: rgba(255,255,255,0.07); padding: 0.35rem 0.6rem; border-radius: 3px;
    font-size: 12px; color: #ccc; text-align: center; white-space: nowrap; line-height: 1; }
  .kbd-desc { color: #aaa; font-size: 11px; }
  button.kbd, .kbd-pair .kbd-btn, .preset-pills .pill { border: none; cursor: pointer; font-family: inherit;
    -webkit-tap-highlight-color: transparent; }
  button.kbd:focus, .kbd-pair .kbd-btn:focus, .preset-pills .pill:focus { outline: none; }
  button.kbd:hover, .kbd-pair .kbd-btn:hover { background: rgba(255,255,255,0.14); color: #fff; }
  button.kbd:active, .kbd-pair .kbd-btn:active, .preset-pills .pill:active { background: rgba(156,204,255,0.32); color: #9cf; }
  .kbd-pair { display: inline-flex; background: rgba(255,255,255,0.07); border-radius: 3px; overflow: hidden; }
  .kbd-pair .kbd-btn { background: none; color: #ccc; font-size: 13px; padding: 0.4rem 0.5rem; line-height: 1; min-width: 1.2rem; }
  .kbd-pair .kbd-btn + .kbd-btn { border-left: 1px solid rgba(0,0,0,0.35); }
  #kn-tooltip { position: fixed; pointer-events: none; background: rgba(10,12,18,0.78);
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); color: #ddd;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 11px; line-height: 1.5;
    padding: 0.6rem 0.75rem; border-radius: 4px; max-width: 240px; z-index: 20;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4); opacity: 0; transform: translateX(-4px);
    transition: opacity 0.15s ease-out, transform 0.15s ease-out; }
  #kn-tooltip.visible { opacity: 1; transform: translateX(0); }
`;

const paramRow = (label, param, hint) => window.SS.paramRow(label, param, hint, helpText[param]);

const PANEL_HTML = `
  <div id="drawer">
    <button id="drawer-toggle" tabindex="-1" aria-label="Toggle controls"></button>
    <div id="drawer-content">
      <h1>Knights <small><a href="gallery.html" target="_blank">gallery →</a> · v${VERSION}</small></h1>
      <h2>pieces <span id="v-total" class="h2-aside"></span></h2>
      <div id="groups"></div>
      <button class="addgrp" data-action="grp-add">+ add color group</button>
      <h2>field</h2>
      ${paramRow('extent', 'extent', '[ ]')}
      <h2>motion</h2>
      ${paramRow('speed', 'speed', '← →')}
      ${paramRow('palette', 'palette', 'K')}
      <h2>preset</h2>
      <div class="row"><span class="label">preset</span><span id="v-preset" class="val accent" style="color:#9cf"></span></div>
      <div id="v-preset-pills" class="preset-pills"></div>
      <h2>actions</h2>
      <div class="legend">
        <button class="kbd" data-action="pause">Space</button><div class="kbd-desc">pause: <span id="v-paused" style="color:#9cf">off</span></div>
        <button class="kbd" data-action="step" data-dir="1">→</button><div class="kbd-desc">step one square (paused)</div>
        <button class="kbd" data-action="restart">R</button><div class="kbd-desc">restart</div>
        <button class="kbd" data-action="static">S</button><div class="kbd-desc">static: <span id="v-static" style="color:#9cf">off</span></div>
        <button class="kbd" data-action="details">D</button><div class="kbd-desc">details: <span id="v-details" style="color:#9cf">on</span></div>
        <button class="kbd" data-action="spiral">G</button><div class="kbd-desc">grid/spiral: <span id="v-spiral" style="color:#9cf">spiral</span></div>
        <button class="kbd" data-action="cycle">L</button><div class="kbd-desc">cycle presets: <span id="v-cycle" style="color:#9cf">off</span></div>
        <button class="kbd" data-action="copy">C</button><div class="kbd-desc" id="copy-desc">copy screensaver URL</div>
        <button class="kbd" data-action="fullscreen">F</button><div class="kbd-desc">fullscreen</div>
        <button class="kbd" data-action="hide">H</button><div class="kbd-desc">hide / show panel</div>
      </div>
    </div>
  </div>
`;

const injectCss = window.SS.injectCss;

const CONFIG_LABEL_CSS = `
  #kn-config { position: fixed; left: 1.1rem; bottom: 1.05rem; z-index: 5;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 12px; color: #cdd; padding: 0.32rem 0.6rem; max-width: 70vw;
    background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 3px; pointer-events: none; white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis; letter-spacing: 0.02em; text-shadow: 0 1px 2px rgba(0,0,0,0.6); }
`;
let configLabelEl = null;
function buildConfigLabel() {
  injectCss(CONFIG_LABEL_CSS);
  configLabelEl = document.createElement('div');
  configLabelEl.id = 'kn-config';
  document.body.appendChild(configLabelEl);
  updateConfigLabel();
}
function updateConfigLabel() { if (configLabelEl) configLabelEl.textContent = labelText(); }

const suppressPanel = new URLSearchParams(location.search).get('nopanel') === '1';

// --- group rows (selected chips + a ＋ that reveals the rest) ------------
let addingGroup = -1;

function swatchStrip(startColor, count, cols) {
  let s = '';
  for (let k = 0; k < count; k++) {
    const c = cols[startColor + k] || [80, 80, 80];
    s += `<span class="sw" style="background:rgb(${c[0]},${c[1]},${c[2]})"></span>`;
  }
  return s;
}
function groupRowHtml(g, i, total, startColor, cols) {
  const decDis = g.count <= 1 ? ' disabled' : '';
  const incDis = total >= MAX_COLORS ? ' disabled' : '';
  const delDis = groups.length <= 1 ? ' disabled' : '';
  const canAdd = g.pieces.length < PIECE_NAMES.length;
  const sel = g.pieces.map((p) =>
    `<button class="chip sel" data-action="grp-chip" data-i="${i}" data-piece="${p}" title="remove">${PIECE_LABEL[p] || p}</button>`).join('');
  const plus = canAdd ? `<button class="chip add" data-action="grp-addpiece" data-i="${i}" title="add a leaper">＋</button>` : '';
  let roster = '';
  if (addingGroup === i && canAdd) {
    roster = '<div class="grp-roster">' + PIECE_NAMES.filter((p) => !g.pieces.includes(p)).map((p) =>
      `<button class="chip" data-action="grp-chip" data-i="${i}" data-piece="${p}">${PIECE_LABEL[p] || p}</button>`).join('') + '</div>';
  }
  return `<div class="grp" data-i="${i}">` +
    `<div class="grp-chips">${sel}${plus}</div>${roster}` +
    `<div class="grp-foot"><span class="grp-sw">${swatchStrip(startColor, g.count, cols)}</span>` +
    `<span class="kbd-pair">` +
    `<button class="kbd-btn" data-action="grp-count" data-i="${i}" data-dir="-1"${decDis}>−</button>` +
    `<button class="kbd-btn" data-action="grp-count" data-i="${i}" data-dir="1"${incDis}>+</button></span>` +
    `<span class="grp-count">×${g.count}</span>` +
    `<button class="grp-del" data-action="grp-del" data-i="${i}"${delDis}>✕</button></div></div>`;
}
function renderGroups() {
  const c = document.getElementById('groups');
  if (!c) return;
  const total = totalColors();
  const cols = genColors(curPalette(), Math.max(1, total));
  let html = '', startColor = 0;
  for (let i = 0; i < groups.length; i++) {
    html += groupRowHtml(groups[i], i, total, startColor, cols);
    startColor += groups[i].count;
  }
  c.innerHTML = html;
  const t = document.getElementById('v-total');
  if (t) t.textContent = `${total} colors`;
  const add = document.querySelector('.addgrp');
  if (add) add.disabled = total >= MAX_COLORS;
}

function grpChip(i, piece) {
  const g = groups[i];
  if (!g || !PIECES[piece]) return;
  if (g.pieces.includes(piece)) {
    if (g.pieces.length <= 1) return;
    g.pieces = g.pieces.filter((p) => p !== piece);
  } else {
    g.pieces = sortPieces([...g.pieces, piece]);
  }
  rebuild();
  syncPresetSelection();
}
function grpToggleAdd(i) { addingGroup = addingGroup === i ? -1 : i; renderGroups(); }
function grpCount(i, dir) {
  const g = groups[i];
  if (!g) return;
  if (dir > 0 && totalColors() >= MAX_COLORS) return;
  if (dir < 0 && g.count <= 1) return;
  g.count += dir;
  rebuild();
  syncPresetSelection();
}
function grpDel(i) {
  if (groups.length <= 1) return;
  groups.splice(i, 1);
  addingGroup = -1;
  rebuild();
  syncPresetSelection();
}
function grpAdd() {
  if (totalColors() >= MAX_COLORS) return;
  groups.push({ pieces: ['knight'], count: 1 });
  addingGroup = groups.length - 1;
  rebuild();
  syncPresetSelection();
}

function buildPanel() {
  if (suppressPanel || document.getElementById('drawer')) return;
  injectCss(PANEL_CSS);
  const parsed = new DOMParser().parseFromString(PANEL_HTML, 'text/html');
  document.body.appendChild(parsed.body.firstElementChild);
  if (new URLSearchParams(location.search).get('panel') === 'open') {
    document.getElementById('drawer').classList.add('open');
  }

  dom.extent = document.getElementById('v-extent');
  dom.speed = document.getElementById('v-speed');
  dom.palette = document.getElementById('v-palette');
  dom.preset = document.getElementById('v-preset');
  dom.presetPills = document.getElementById('v-preset-pills');
  dom.cycle = document.getElementById('v-cycle');
  dom.paused = document.getElementById('v-paused');
  dom.static = document.getElementById('v-static');
  dom.details = document.getElementById('v-details');
  dom.spiral = document.getElementById('v-spiral');

  window.SS.presetPills(dom.presetPills, presets.length, pickPreset);

  const toggle = document.getElementById('drawer-toggle');
  toggle.addEventListener('click', () => { toggleDrawer(); toggle.blur(); });

  const content = document.getElementById('drawer-content');
  content.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a === 'restart') restart();
    else if (a === 'pause') togglePause();
    else if (a === 'step') step(Number(el.dataset.dir));
    else if (a === 'static') toggleStatic();
    else if (a === 'details') toggleDetails();
    else if (a === 'spiral') cycleSpiral();
    else if (a === 'cycle') toggleCycle();
    else if (a === 'copy') copyShareUrl();
    else if (a === 'fullscreen') window.toggleFullscreen?.();
    else if (a === 'hide') toggleDrawer();
    else if (a === 'grp-chip') grpChip(Number(el.dataset.i), el.dataset.piece);
    else if (a === 'grp-addpiece') grpToggleAdd(Number(el.dataset.i));
    else if (a === 'grp-count') grpCount(Number(el.dataset.i), Number(el.dataset.dir));
    else if (a === 'grp-del') grpDel(Number(el.dataset.i));
    else if (a === 'grp-add') grpAdd();
    else return;
    el.blur();
  });

  window.SS.attachHoldRepeat(content, '[data-action="adjust"]',
    (el) => adjustParam(el.dataset.param, Number(el.dataset.dir)), { interval: 120 });

  const tooltip = document.createElement('div');
  tooltip.id = 'kn-tooltip';
  document.body.appendChild(tooltip);
  for (const row of document.querySelectorAll('#drawer-content .row[data-help]')) {
    row.addEventListener('mouseenter', () => {
      if (!row.dataset.help) return;
      tooltip.textContent = row.dataset.help;
      const rect = row.getBoundingClientRect();
      tooltip.style.left = (rect.right + 12) + 'px';
      tooltip.style.top = rect.top + 'px';
      tooltip.classList.add('visible');
    });
    row.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
  }

  panelReady = true;
  renderGroups();
  updateDom();
}

const toggleDrawer = window.SS.toggleDrawer;

function updateDom() {
  if (!panelReady) return;
  dom.extent.textContent = String(extent);
  dom.speed.textContent = speedLabel();
  dom.palette.textContent = curPalette().name;
  dom.preset.textContent = presets[presetIdx] ? presets[presetIdx].name : '—';
  if (dom.cycle) dom.cycle.textContent = cyclePresets ? 'on' : 'off';
  if (dom.paused) dom.paused.textContent = paused ? 'on' : 'off';
  if (dom.static) dom.static.textContent = isStatic() ? 'on' : 'off';
  if (dom.details) dom.details.textContent = details ? 'on' : 'off';
  if (dom.spiral) dom.spiral.textContent = spiralStyle;
  for (let i = 0; i < dom.presetPills.children.length; i++) {
    dom.presetPills.children[i].classList.toggle('active', i === presetIdx);
  }
}

// --- param adjustment ---------------------------------------------------
function adjustParam(param, dir) {
  if (param === 'extent') {
    const i = Math.max(0, Math.min(EXTENT_STEPS.length - 1, extentIndex() + dir));
    extent = EXTENT_STEPS[i];
    rebuild();
  }
  else if (param === 'speed') {
    const wasStatic = speedLevel === 0;
    setSpeedLevel(speedLevel + dir);
    if ((speedLevel === 0) !== wasStatic) { startFrac = 0; startRun(); } // crossed into/out of static
    updateDom();
  }
  else if (param === 'palette') {
    paletteIdx = (paletteIdx + dir + PALETTES.length) % PALETTES.length;
    palCols = genColors(curPalette(), Math.max(1, sim.K));
    repaintField(head);     // recolor the already-committed field
    renderGroups(); updateDom();
  }
  syncPresetSelection();
}

function pickPreset(i) {
  const p = presets[i];
  if (!p) return;
  presetIdx = i;
  groups = cloneGroups(p.groups);
  paletteIdx = p.paletteIdx;
  addingGroup = -1;
  startFrac = 0;
  rebuild();
}
function syncPresetSelection() {
  presetIdx = presets.findIndex((p) => p.paletteIdx === paletteIdx && groupsEqual(p.groups, groups));
  if (panelReady) updateDom();
}
function gotoNextPreset() {
  const i = presetIdx < 0 ? 0 : (presetIdx + 1) % presets.length;
  const p = presets[i];
  presetIdx = i;
  groups = cloneGroups(p.groups);
  paletteIdx = p.paletteIdx;
  addingGroup = -1;
  startFrac = 0;
  rebuild();
}
function toggleCycle() {
  cyclePresets = !cyclePresets;
  window.flashToast?.(`cycle presets ${cyclePresets ? 'on' : 'off'}`);
  updateDom();
}
function togglePause() {
  paused = !paused;
  if (paused) evalPos = currentEp(); // freeze the eval cursor where the live crawl was
  window.flashToast?.(paused ? 'paused' : 'resumed');
  updateDom();
}
// Narration overlays on/off. Off = a pure screensaver: just the building field
// and the faded grid, no decision overlay (handy with nopanel / static).
function toggleDetails() {
  details = !details;
  window.flashToast?.(details ? 'details on' : 'details off');
  updateDom();
}
// Cycle the grid/spiral view: none → spiral-only → grid-only → grid + spiral.
const SPIRAL_STYLES = ['none', 'spiral', 'grid', 'both'];
function cycleSpiral() {
  spiralStyle = SPIRAL_STYLES[(SPIRAL_STYLES.indexOf(spiralStyle) + 1) % SPIRAL_STYLES.length];
  window.flashToast?.(`spiral: ${spiralStyle}`);
  updateDom();
}
// Static (finished pattern, held) ↔ animated. Off → on jumps to the finished
// field; on → off restarts a fresh narrated run at the remembered speed.
function toggleStatic() {
  setSpeedLevel(isStatic() ? lastSpeedLevel : 0);
  startFrac = 0;
  startRun();
  window.flashToast?.(isStatic() ? 'static — finished pattern' : 'animated');
  updateDom();
}
// Single-step ONE evaluation while paused (dir -1 back, +1 forward) — the same
// per-candidate frames the live crawl shows (attacker line/glow and all), advanced
// by hand. Crossing a placement's end commits it; crossing its start un-commits.
function step(dir) {
  if (!paused) { togglePause(); }
  const total = sim.N;
  pings = [];
  evalPos += dir;
  while (head < total && evalPos >= evalLen(head)) {
    evalPos -= evalLen(head);
    commitNarrated(head); head++;
  }
  while (evalPos < 0 && head > 0) {   // cheap: just walk head back; rebuild is deferred
    head--;
    evalPos += evalLen(head);
  }
  if (evalPos < 0) evalPos = 0;
  if (dir < 0) stepDirty = true;      // field/grids/maxR rebuilt once in update()
  xMarks = []; landHead = -1;         // stepped view is just this decision, not the lingering trail
  clock = timeForPlayed(head); acc = 0;
  half = Math.max(H0, Math.min(sim.S, maxR * MARGIN + 0.5)); // forward: maxR correct; backward: re-snapped post-rebuild
  runState = 'run'; fade = 1;
}
function restart() { startFrac = 0; startRun(); }

// --- URL params ---------------------------------------------------------
function applyUrlParams() {
  const q = new URLSearchParams(location.search);
  if (q.has('groups')) {
    const parsed = [];
    for (const part of q.get('groups').split(',')) {
      const [pcs, ct] = part.split(':');
      const pieces = sortPieces((pcs || '').split('-'));
      if (pieces.length) parsed.push({ pieces, count: Math.max(1, parseInt(ct, 10) || 1) });
    }
    if (parsed.length) groups = parsed;
  }
  if (q.has('extent')) { const v = parseInt(q.get('extent'), 10); if (!Number.isNaN(v)) extent = snapExtent(v); }
  if (q.has('speed')) { const L = parseInt(q.get('speed'), 10); if (!Number.isNaN(L)) setSpeedLevel(L); }
  if (q.get('static') === '1') setSpeedLevel(0);
  if (q.has('palette')) paletteIdx = (parseInt(q.get('palette'), 10) || 0) % PALETTES.length;
  if (q.has('start')) startFrac = Math.max(0, Math.min(1, parseFloat(q.get('start')) || 0));
  if (q.get('cycle') === '1') cyclePresets = true;
  if (q.get('details') === '0') details = false;
  if (SPIRAL_STYLES.includes(q.get('spiral'))) spiralStyle = q.get('spiral');
  normalizeGroups();
}

function copyShareUrl() {
  const q = new URLSearchParams();
  q.set('groups', groups.map((g) => `${g.pieces.join('-')}:${g.count}`).join(','));
  q.set('extent', String(extent));
  q.set('speed', String(speedLevel));
  q.set('palette', String(paletteIdx));
  if (cyclePresets) q.set('cycle', '1');
  if (!details) q.set('details', '0');
  if (spiralStyle !== 'spiral') q.set('spiral', spiralStyle);
  q.set('nopanel', '1');
  const url = `${location.origin}${location.pathname}?${q.toString()}`;
  const done = (msg) => { window.flashToast?.(msg); const d = document.getElementById('copy-desc'); if (d) { const t = d.textContent; d.textContent = msg; setTimeout(() => (d.textContent = t), 1200); } };
  navigator.clipboard?.writeText(url).then(() => done('copied!'), () => done('copy failed'));
}

// --- keyboard -----------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const isStep = paused && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');
  const isAdjust = ['ArrowLeft', 'ArrowRight', '[', ']'].includes(e.key);
  if (e.repeat && !isAdjust) return;
  if (e.key === 'ArrowLeft') { if (paused) step(-1); else adjustParam('speed', -1); }
  else if (e.key === 'ArrowRight') { if (paused) step(1); else adjustParam('speed', 1); }
  else if (e.key === '[') adjustParam('extent', -1);
  else if (e.key === ']') adjustParam('extent', 1);
  else if (e.key === 'k' || e.key === 'K') adjustParam('palette', 1);
  else if (e.key === ' ' || e.key === 'p' || e.key === 'P') togglePause();
  else if (e.key === 's' || e.key === 'S') toggleStatic();
  else if (e.key === 'd' || e.key === 'D') toggleDetails();
  else if (e.key === 'g' || e.key === 'G') cycleSpiral();
  else if (e.key === 'l' || e.key === 'L') toggleCycle();
  else if (e.key === 'r' || e.key === 'R') restart();
  else if (e.key === 'c' || e.key === 'C') copyShareUrl();
  else if (e.key === 'h' || e.key === 'H') toggleDrawer();
  else if (e.key >= '0' && e.key <= '9') {
    const i = (Number(e.key) + 9) % 10;
    if (i < presets.length) pickPreset(i); else return;
  } else return;
  e.preventDefault();
});

// --- init + main loop ---------------------------------------------------
resize();
applyUrlParams();
buildPanel();
buildConfigLabel();
rebuild();
syncPresetSelection();

document.body.tabIndex = -1;
const grabFocus = () => document.body.focus();
grabFocus();
window.addEventListener('pageshow', grabFocus);

let last = performance.now();
let ticking = true;
function tick(now) {
  if (document.hidden) { ticking = false; return; }
  const dt = Math.max(0, Math.min((now - last) / 1000, 0.05)); // never run time backward
  last = now;
  resize();
  update(dt);
  draw();
  requestAnimationFrame(tick);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  grabFocus();
  last = performance.now();
  if (!ticking) { ticking = true; requestAnimationFrame(tick); }
});
requestAnimationFrame(tick);
