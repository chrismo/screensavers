// Knights — "how it's built" lab. A companion to ../knights/ that replays the
// ACTUAL turn-based placement instead of sweeping the finished pattern. The
// knights rule: cells of a square spiral are claimed by K colors taking turns;
// on a color's turn it grabs the lowest-numbered cell not occupied and not
// attacked by ANY OTHER color (same-color attacks are allowed — that asymmetry
// breeds the pattern). This page narrates that decision: a color's cursor walks
// the spiral to a candidate, we flash the cells it skips (occupied / attacked by
// an enemy), then on a legal cell it commits and lights the squares it now
// threatens. It opens slow and zoomed in (a few decisions a second), then
// accelerates and zooms out, dropping the per-step overlay and just letting the
// K cursors interleave to fill the whole field — the "hybrid" narrate→interleave.
//
// Renderer is Canvas2D (not the main sketch's WebGL): the overlay is glyphs,
// grid lines, outlines and text that 2D draws directly. The committed field is
// blitted from a 1px-per-cell offscreen canvas (one drawImage/frame), so it
// scales to any extent. See ../knights/sketch.js TODO ideas #2 + #5.
//
// NOTE: the pure helpers below (PIECES, spiralStep, leaperOffsets, palette and
// group logic, the group-editor drawer) are DUPLICATED verbatim from
// ../knights/sketch.js by design — this is a prototype lab and the main sketch
// is intentionally left untouched. Graft-time TODO: extract a shared
// knights/core.js and de-dupe both copies.

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
const VERSION = '1.3';

// =======================================================================
// Live params (URL-overridable, panel-tunable)
// =======================================================================
let extent = 60;         // S: max spiral shell ≈ half the grid side (small = readable)
let speed = 2;           // base placements/sec at t=0 (the ramp accelerates from here)
let paletteIdx = 0;
let startFrac = 0;       // initial timeline fraction 0..1 (URL `start`)
let cyclePresets = false;

// --- pacing / camera constants ------------------------------------------
const TAU = 6.0;             // seconds; placement rate ≈ speed·e^(t/TAU) (bigger = gentler ramp)
const NARRATE_PX = 22;       // cell px above which we draw the step overlay
const NARRATE_RATE_MAX = 10; // placements/sec above which narration is too fast
const DETAIL_CAP = 300;      // record skip/threat detail for only the first N events
const H0 = 5;                // min half-window (cells) — opening zoom shows ~11 cells
const MARGIN = 1.15;         // keep the frontier this far inside the frame
const HALF_EASE = 2.2;       // half-window easing toward target (per second)
const HOLD_SEC = 4;
const FADE_SEC = 1.2;

const stepExtent = 20;
const stepSpeed = 1;

const presets = [
  { name: 'Knights ×3',   groups: [{ pieces: ['knight'], count: 3 }], paletteIdx: 0 },
  { name: 'Red & Black',  groups: [{ pieces: ['knight'], count: 2 }], paletteIdx: 3 },
  { name: 'Knight+Zebra', groups: [{ pieces: ['knight'], count: 2 }, { pieces: ['zebra'], count: 1 }], paletteIdx: 0 },
  { name: 'Compound KZ',  groups: [{ pieces: ['knight', 'zebra'], count: 3 }], paletteIdx: 1 },
  { name: 'Wa+Fe+Al',     groups: [{ pieces: ['wazir'], count: 1 }, { pieces: ['ferz'], count: 1 }, { pieces: ['alfil'], count: 1 }], paletteIdx: 1 },
  { name: 'Ferz+Dab ×4',  groups: [{ pieces: ['ferz', 'dabbaba'], count: 4 }], paletteIdx: 0 },
  { name: 'Wazir ×2',     groups: [{ pieces: ['wazir'], count: 2 }], paletteIdx: 2 },
  { name: '5-mix',        groups: [{ pieces: ['knight'], count: 2 }, { pieces: ['wazir'], count: 2 }, { pieces: ['zebra'], count: 1 }], paletteIdx: 1 },
];
let presetIdx = 0;

const helpText = {
  extent: 'How far the spiral is computed (max shell). Small keeps the solve readable; bigger plays longer before it fills.',
  speed: 'Opening placements per second. The rate accelerates from here, so this mostly sets how leisurely the narrated intro is.',
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
  const events = [];

  const t0 = performance.now();
  while (remaining > 0) {
    for (let k = 0; k < K; k++) {
      if (done[k]) continue;
      let x = cx[k], y = cy[k];
      const notK = (~(1 << k)) & 0xff;
      const detail = events.length < DETAIL_CAP;
      const skipped = detail ? [] : null;
      let off = false;
      while (true) {
        if (x > S || x < -S || y > S || y < -S) { done[k] = true; remaining--; off = true; break; }
        const id = idx(x, y);
        if (occ[id] === 0 && (threat[id] & notK) === 0) break;
        if (detail) {
          if (occ[id] !== 0) skipped.push({ x, y, kind: 'occ', by: occ[id] - 1 });
          else {
            let by = -1;
            for (let b = 0; b < K; b++) { if (b !== k && (threat[id] & (1 << b))) { by = b; break; } }
            skipped.push({ x, y, kind: 'threat', by });
          }
          if (skipped.length > 6) skipped.shift(); // keep the last few (nearest the landing)
        }
        const nxt = spiralStep(x, y);
        x = nxt[0]; y = nxt[1];
      }
      cx[k] = x; cy[k] = y;
      if (off) { events.push({ t: 'x', k }); continue; }

      const id = idx(x, y);
      occ[id] = k + 1;
      const bit = 1 << k;
      const offs = colorOffs[k];
      const threats = detail ? [] : null;
      for (let o = 0; o < offs.length; o++) {
        const tx = x + offs[o][0], ty = y + offs[o][1];
        if (inGrid(tx, ty)) { threat[idx(tx, ty)] |= bit; if (detail) threats.push([tx, ty]); }
      }
      events.push(detail ? { t: 'p', k, x, y, skipped, threats } : { t: 'p', k, x, y });
    }
  }
  lastSimMs = performance.now() - t0;
  return { events, K, S, W };
}

// =======================================================================
// Canvas2D renderer
// =======================================================================
const canvas = document.getElementById('lab');
const ctx = canvas.getContext('2d');

let sim = null;          // { events, K, S, W }
let palCols = [];        // [r,g,b] per color
let colorLabel = [];     // per-color piece label (group expanded)
let field = null;        // offscreen canvas, 1px per cell (the committed field)
let fieldCtx = null;
let cssW = 0, cssH = 0, dpr = 1;

// --- run/animation state ------------------------------------------------
let head = 0;            // # of events committed
let clock = 0;           // seconds elapsed in the current run
let acc = 0;             // fractional placement accumulator
let half = H0;           // current half-window (cells), eased
let maxR = 0;            // frontier radius (max Chebyshev of placed cells)
let runState = 'run';    // run → hold → fadeout → fadein → run
let stateT = 0;
let fade = 1;
let paused = false;

function colorStr(k) { const c = palCols[k] || [200, 200, 200]; return `rgb(${c[0]},${c[1]},${c[2]})`; }
function bgStr() { const b = curPalette().bg; return `rgb(${b[0]},${b[1]},${b[2]})`; }

// Cumulative placements meant to have played by elapsed time t, and its inverse.
function playedBy(t) { return speed * TAU * (Math.exp(t / TAU) - 1); }
function timeForPlayed(p) { return TAU * Math.log(Math.max(0, p) / (speed * TAU) + 1); }
function rateAt(t) { return speed * Math.exp(t / TAU); }

function paintCell(e) {
  fieldCtx.fillStyle = colorStr(e.k);
  fieldCtx.fillRect(e.x + sim.S, sim.S - e.y, 1, 1); // row = S - y → +y points up
}

function commit(e) {
  if (e.t !== 'p') return;
  paintCell(e);
  const r = Math.max(Math.abs(e.x), Math.abs(e.y));
  if (r > maxR) maxR = r;
}

// Replay events [0, n) into a fresh field (used on palette change / step-back /
// ?start=). Recomputes maxR.
function repaintField(n) {
  fieldCtx.clearRect(0, 0, field.width, field.height);
  maxR = 0;
  for (let i = 0; i < n; i++) {
    const e = sim.events[i];
    if (e.t !== 'p') continue;
    fieldCtx.fillStyle = colorStr(e.k);
    fieldCtx.fillRect(e.x + sim.S, sim.S - e.y, 1, 1);
    const r = Math.max(Math.abs(e.x), Math.abs(e.y));
    if (r > maxR) maxR = r;
  }
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
  const S = Math.max(12, Math.min(extent, 600));
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
  console.log(`[knights-lab] ${labelText()} — S=${sim.S}, ${sim.K} colors, ${sim.events.length} events in ${lastSimMs.toFixed(1)}ms`);
  if (resetRun) startRun();
  updateDom();
  updateConfigLabel();
  renderGroups();
}

// Begin (or restart) the run, honoring ?start= by pre-committing that fraction.
function startRun() {
  head = 0; clock = 0; acc = 0; maxR = 0; half = H0;
  runState = 'run'; stateT = 0; fade = 1; paused = false;
  if (fieldCtx) fieldCtx.clearRect(0, 0, field.width, field.height); // wipe the old render
  if (startFrac > 0 && sim.events.length) {
    head = Math.min(sim.events.length, Math.floor(startFrac * sim.events.length));
    repaintField(head);
    clock = timeForPlayed(head);
    half = Math.max(H0, maxR * MARGIN + 0.5);
  }
}

// =======================================================================
// Per-frame update + draw
// =======================================================================
function update(dt) {
  const total = sim.events.length;
  if (runState === 'run' && !paused) {
    clock += dt;
    acc += rateAt(clock) * dt;
    let n = Math.floor(acc);
    if (n > 0) {
      acc -= n;
      n = Math.min(n, total - head);
      for (let i = 0; i < n; i++) commit(sim.events[head++]);
    }
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
  // Faded grid first, so placed cells sit on top of it (graph-paper look).
  drawGrid(cellPx, originX, originY);
  // Blit the whole committed field in one call (transparent where empty → bg).
  const dw = sim.W * cellPx;
  const dx = originX - (sim.S + 0.5) * cellPx;
  const dy = originY - (sim.S + 0.5) * cellPx;
  ctx.drawImage(field, dx, dy, dw, dw);

  // Overlay: narrate the active decision while zoomed in and slow enough.
  const narrate = runState === 'run' && cellPx >= NARRATE_PX &&
    (paused || rateAt(clock) <= NARRATE_RATE_MAX) && head < sim.events.length;
  if (narrate) drawNarration(sim.events[head], paused ? 0.5 : acc, cellPx, originX, originY);

  if (fade < 1) {
    ctx.globalAlpha = 1 - fade;
    ctx.fillStyle = bgStr();
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.globalAlpha = 1;
  }
}

// Faded graph-paper grid drawn behind the field, every frame. The alpha fades
// out as cells shrink so it never becomes sub-pixel noise when zoomed out.
function drawGrid(cellPx, originX, originY) {
  const a = 0.20 * Math.max(0, Math.min(1, (cellPx - 2) / 4));
  if (a <= 0.003) return;
  const S = sim.S;
  const visX = Math.min(S, Math.ceil(cssW / cellPx / 2) + 1);
  const visY = Math.min(S, Math.ceil(cssH / cellPx / 2) + 1);
  ctx.strokeStyle = `rgba(255,255,255,${a})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = -visX; gx <= visX + 1; gx++) { const sx = originX + (gx - 0.5) * cellPx; ctx.moveTo(sx, 0); ctx.lineTo(sx, cssH); }
  for (let gy = -visY; gy <= visY + 1; gy++) { const sy = originY - (gy - 0.5) * cellPx; ctx.moveTo(0, sy); ctx.lineTo(cssW, sy); }
  ctx.stroke();
}

// Draw the per-step decision overlay for placement event `e` at progress f∈[0,1].
function drawNarration(e, f, cellPx, originX, originY) {
  const rect = (x, y) => ({ l: originX + (x - 0.5) * cellPx, t: originY - (y + 0.5) * cellPx, s: cellPx });
  if (e.t !== 'p' || !e.skipped) return;
  const pulse = 0.5 + 0.5 * Math.sin(f * Math.PI); // brighten then settle

  // Cells the cursor skipped on the way here, with the reason.
  for (const s of e.skipped) {
    const r = rect(s.x, s.y);
    if (s.kind === 'threat') {
      const c = s.by >= 0 ? palCols[s.by] : [230, 90, 90];
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.22 * pulse})`;
      ctx.fillRect(r.l, r.t, r.s, r.s);
      ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.85 * pulse})`;
      ctx.lineWidth = Math.max(1, cellPx * 0.06);
      ctx.strokeRect(r.l + 1, r.t + 1, r.s - 2, r.s - 2);
      drawCross(r, `rgba(255,255,255,${0.55 * pulse})`, cellPx);
    } else {
      ctx.strokeStyle = 'rgba(170,170,180,0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(r.l + 1, r.t + 1, r.s - 2, r.s - 2);
    }
  }

  // Attack squares this piece will stamp (fade in past the midpoint).
  if (f > 0.35) {
    const c = palCols[e.k] || [200, 200, 200];
    const a = Math.min(1, (f - 0.35) / 0.4);
    for (const [tx, ty] of e.threats) {
      const r = rect(tx, ty);
      ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.5 * a})`;
      ctx.lineWidth = Math.max(1, cellPx * 0.05);
      ctx.strokeRect(r.l + 1.5, r.t + 1.5, r.s - 3, r.s - 3);
    }
  }

  // The chosen cell: a cursor ring early, dropping into a color fill.
  const r = rect(e.x, e.y);
  if (f < 0.5) {
    ctx.strokeStyle = `rgba(255,255,255,${0.85})`;
    ctx.lineWidth = Math.max(1.5, cellPx * 0.08);
    ctx.strokeRect(r.l + 2, r.t + 2, r.s - 4, r.s - 4);
  } else {
    const g = (f - 0.5) / 0.5;
    const inset = (1 - g) * r.s * 0.4;
    ctx.fillStyle = colorStr(e.k);
    ctx.fillRect(r.l + inset, r.t + inset, r.s - 2 * inset, r.s - 2 * inset);
    ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - g)})`;
    ctx.lineWidth = Math.max(1, cellPx * 0.05);
    ctx.strokeRect(r.l + inset, r.t + inset, r.s - 2 * inset, r.s - 2 * inset);
  }

  drawCaption(e, f);
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

function drawCaption(e, f) {
  const lbl = colorLabel[e.k] || 'piece';
  const verb = f < 0.5 ? 'testing' : 'placed';
  const txt = `${lbl}  ·  ${verb} (${e.x}, ${e.y})`;
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
      <h1>Knights <small>how it's built · v${VERSION}</small></h1>
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
        <button class="kbd" data-action="step" data-dir="1">→</button><div class="kbd-desc">step a placement (paused)</div>
        <button class="kbd" data-action="restart">R</button><div class="kbd-desc">restart</div>
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
  dom.speed.textContent = `${speed}/s`;
  dom.palette.textContent = curPalette().name;
  dom.preset.textContent = presets[presetIdx] ? presets[presetIdx].name : '—';
  if (dom.cycle) dom.cycle.textContent = cyclePresets ? 'on' : 'off';
  if (dom.paused) dom.paused.textContent = paused ? 'on' : 'off';
  for (let i = 0; i < dom.presetPills.children.length; i++) {
    dom.presetPills.children[i].classList.toggle('active', i === presetIdx);
  }
}

// --- param adjustment ---------------------------------------------------
function adjustParam(param, dir) {
  if (param === 'extent') { extent = Math.max(24, Math.min(220, extent + dir * stepExtent)); rebuild(); }
  else if (param === 'speed') { speed = Math.max(1, Math.min(30, speed + dir * stepSpeed)); updateDom(); }
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
  window.flashToast?.(paused ? 'paused' : 'resumed');
  updateDom();
}
// Single-step a placement while paused (dir -1 back, +1 forward).
function step(dir) {
  if (!paused) { togglePause(); }
  const total = sim.events.length;
  if (dir > 0 && head < total) { commit(sim.events[head++]); }
  else if (dir < 0 && head > 0) { head--; repaintField(head); }
  clock = timeForPlayed(head); acc = 0;
  half = Math.max(half, maxR * MARGIN + 0.5);
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
  if (q.has('extent')) extent = Math.max(24, Math.min(220, parseInt(q.get('extent'), 10) || extent));
  if (q.has('speed')) { const s = parseInt(q.get('speed'), 10); if (!Number.isNaN(s)) speed = Math.max(1, Math.min(30, s)); }
  if (q.has('palette')) paletteIdx = (parseInt(q.get('palette'), 10) || 0) % PALETTES.length;
  if (q.has('start')) startFrac = Math.max(0, Math.min(1, parseFloat(q.get('start')) || 0));
  if (q.get('cycle') === '1') cyclePresets = true;
  normalizeGroups();
}

function copyShareUrl() {
  const q = new URLSearchParams();
  q.set('groups', groups.map((g) => `${g.pieces.join('-')}:${g.count}`).join(','));
  q.set('extent', String(extent));
  q.set('speed', String(speed));
  q.set('palette', String(paletteIdx));
  if (cyclePresets) q.set('cycle', '1');
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
  const dt = Math.min((now - last) / 1000, 0.05);
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
