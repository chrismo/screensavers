// Knights spiral coloring — a screensaver from Numberphile's "Red & Black
// Knights" (Neil Sloane / Jonas Karlsson). Cells of an infinite square spiral
// are claimed by K colors of pieces taking turns: on a color's turn it grabs
// the lowest-numbered cell not occupied and not attacked by ANY OTHER color
// (same-color pieces may attack each other — that asymmetry is what breeds the
// large-scale patterns). With 2+ colors the plane splits into colored regions
// with chaotic bands along the axes; the structure only gets interesting past
// ~100k–1M placed cells. See OEIS A392177 / A308885.
//
// Colors are specified as PIECE × COUNT groups: each group is a leaper and how
// many color-slots use it (total colors = the sum). One group {knight,3} is the
// classic 3-color knight; several groups give the Numberphile2 "Amazing
// Chessboard Patterns" per-piece combos.
//
// We simulate the whole pattern once into a typed-array grid, bake it into a
// single texture (RGB = each cell's spiral number, A = its color id), then a
// raw-WebGL fragment shader samples a centered window. A reveal front gated on
// the spiral number sweeps outward — a single point tracing the numbering
// spiral, laying color with a glowing leading edge — while the window zooms to
// keep the head in frame. Reveal accelerates from a handful of cells to tens of
// thousands per second; the per-frame cost is one quad. Modes: spiral (sweep),
// square (whole rings), all (finished pattern, just zoomed).
//
// ── FUTURE IDEAS / TODO ────────────────────────────────────────────────
// 1. [DONE] Per-color pieces AND compound leapers via PIECE-SET × COUNT groups
//    (each group's colors move as the union of its selected leapers). Panel UI
//    reworked to selected-chips + a ＋ that reveals the roster, with per-group
//    color swatches. Still open: riders (queen/rook/bishop) attack whole lines
//    → denser, different construction ("queens in exile") and a bigger lift.
// 2. "How it's determined" visualization — show the per-step decision:
//    a color's cursor advances the spiral to a candidate; draw the piece's
//    attack squares; flash any enemy conflict and SKIP (→ the "or none"
//    empties); on a legal cell, commit the color and light the squares it now
//    threatens. Needs the placement SEQUENCE + an overlay pass (our current
//    engine only thresholds finished colors, so this is a new render path).
//    Two-regime: run it slow while zoomed in, drop the overlay and hand off to
//    the bulk sweep once cells get too small / placements too fast to read.
//    Plan: prototype in a knights-lab/ page, then graft the good version into
//    this sketch as an "opening act."
// 3. A lab page exploring the CURRENT spiral-coloring viz itself (sandbox for
//    params/pattern comparison), alongside the "how" lab.
// 4. 3D extrapolation: generalize the spiral + leaper rule into a 3D shell
//    spiral with a 3D knight move; swap the quad for instanced voxels/points
//    + a camera. The raw-WebGL setup keeps this door open. Speculative/big.
// 5. True construction-order animation (OEIS A395355): instead of the spiral
//    sweep, replay the actual turn-based placement — K interleaved cursors
//    jumping around. Jumpier but "how it's really built." Pairs with idea 2.
// 6. [DONE] Preset cycling: rotate to the next preset when each run finishes.
// 7. 1-color independent-set variant (OEIS A308885): place a piece only if the
//    cell isn't attacked by an EXISTING piece (no same-color attacks).
// 8. Up to 16 colors (widen the Uint8 threat mask to Uint16) if 8 proves few.
// Deferred infra (only if needed): Web Worker for multi-million extents;
// supersample to tame zoomed-out moiré (currently kept on purpose).
// ───────────────────────────────────────────────────────────────────────

// --- live params (URL-overridable, panel-tunable) -----------------------
let groups = [{ pieces: ['knight'], count: 3 }]; // each group: a leaper SET × COUNT
let extent  = 512;       // S: max spiral shell ≈ half the grid side
let zoomSec = 90;        // seconds for a full zoom-out
let paletteIdx = 0;      // index into PALETTES
let reveal  = 'spiral';  // reveal mode: 'spiral' | 'square' | 'all'
let startPhase = 0;      // initial zoom phase 0..1 (URL `start`; resume mid-zoom)
let cyclePresets = false; // rotate to the next preset when a run finishes

// --- internal constants -------------------------------------------------
const H0 = 0.5;          // starting half-window (cells) — one center cell
const HOLD_SEC = 5;      // pause at full extent before restarting
const FADE_SEC = 1.4;    // fade out / in duration
const REVEAL_MARGIN = 1.14; // keep the sweeping head this far inside the frame edge
const REVEAL_MODES = ['spiral', 'square', 'all'];
const REVEAL_CODE = { spiral: 1, square: 2, all: 0 }; // matches the shader's uMode
const MIN_COLORS = 2;
const MAX_COLORS = 8;    // total colors; bounded by the 8-bit threat mask

// --- panel adjustment step sizes ----------------------------------------
const stepExtent = 64;
const stepZoom   = 10;

// --- (m,n) leapers (the Numberphile2 roster) ----------------------------
// A leaper reaches the 8 squares (±m,±n) and (±n,±m); symmetric leapers just
// produce duplicate offsets, which are harmless.
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

// Display names for the panel + config label.
const PIECE_LABEL = {
  knight: 'Knight', wazir: 'Wazir', ferz: 'Ferz', dabbaba: 'Dabbaba',
  alfil: 'Alfil', threeleaper: 'Three-leaper', zebra: 'Zebra', antelope: 'Antelope',
};

// --- palettes (procedural; up to MAX_COLORS evenly-spaced hues) ----------
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

// N distinct colors for the current scheme.
function genColors(scheme, N) {
  const out = [];
  for (let i = 0; i < N; i++) {
    if (scheme.mono) {
      const t = N <= 1 ? 0 : i / (N - 1);
      const c = Math.round((0.92 - 0.62 * t) * 255);
      out.push([c, c, Math.min(255, Math.round(c * 1.03))]); // faint cool tint
    } else {
      const h = (((scheme.hue0 || 0) + i * 360 / N) % 360) / 360;
      out.push(hsl2rgb(h, scheme.sat, scheme.light));
    }
  }
  return out;
}

// --- group helpers ------------------------------------------------------
// A group is { pieces: [leaper, …], count }. Its colors all move as the UNION
// of the listed leapers (a compound piece).
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

// Keep groups valid: each pieces set non-empty & known, count ≥ 1, total in
// [MIN_COLORS, MAX_COLORS].
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

// --- presets ------------------------------------------------------------
const presets = [
  { name: 'Knights ×3',   groups: [{ pieces: ['knight'], count: 3 }], paletteIdx: 0 },
  { name: 'Red & Black',  groups: [{ pieces: ['knight'], count: 2 }], paletteIdx: 3 },
  { name: 'Knight+Zebra', groups: [{ pieces: ['knight'], count: 2 }, { pieces: ['zebra'], count: 1 }], paletteIdx: 0 },
  { name: 'Compound KZ',  groups: [{ pieces: ['knight', 'zebra'], count: 3 }], paletteIdx: 1 },
  { name: 'Wa+Fe+Al',     groups: [{ pieces: ['wazir'], count: 1 }, { pieces: ['ferz'], count: 1 }, { pieces: ['alfil'], count: 1 }], paletteIdx: 1 },
  { name: 'Antelope ×3',  groups: [{ pieces: ['antelope'], count: 3 }], paletteIdx: 1 },
  { name: 'Ferz+Dab ×6', groups: [{ pieces: ['ferz', 'dabbaba'], count: 6 }], paletteIdx: 0 },
  { name: '5-mix',        groups: [{ pieces: ['knight'], count: 2 }, { pieces: ['wazir'], count: 2 }, { pieces: ['zebra'], count: 1 }], paletteIdx: 1 },
];
let presetIdx = 0;

const helpText = {
  extent: 'How far the spiral is computed (max shell). Bigger reveals more of the large-scale pattern but costs more to simulate.',
  zoom:   'Seconds for one full zoom-out from the center cell to the full extent. 0 = hold on the finished image (no animation) — handy for inspecting combos.',
  reveal: 'How cells appear. spiral = a point sweeps the numbering spiral, laying color with a glowing head. square = whole rings pop in. all = the finished pattern, just zoomed.',
  palette: 'Color scheme. Colors are generated to evenly span the hue wheel for however many colors the groups add up to.',
};

// =======================================================================
// Simulation — produces `occupant` (Int8) over a (2S+1)² grid.
//   0 = empty, else colorIndex+1. Each color uses its group's piece.
// =======================================================================
let occupant = null;   // Int8Array — 0 empty, else color+1
let spiralIdx = null;  // Int32Array — spiral number (reveal order) per cell
let gridS = 0;         // the S actually simulated (may be clamped)
let gridK = 0;         // number of colors actually simulated
let lastSimMs = 0;

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
  return [a, b - 1]; // a === -b && a < 0
}

function leaperOffsets(piece) {
  const [m, n] = PIECES[piece] || PIECES.knight;
  return [
    [m, n], [m, -n], [-m, n], [-m, -n],
    [n, m], [-n, m], [n, -m], [-n, -m],
  ];
}

function simulate(S) {
  const W = 2 * S + 1;
  const occ = new Int8Array(W * W);       // 0 empty, else color+1
  const threat = new Uint8Array(W * W);   // bit p set if threatened by color p
  const idx = (x, y) => (y + S) * W + (x + S);
  const inGrid = (x, y) => x >= -S && x <= S && y >= -S && y <= S;

  // Per-color offset set: each group's colors move as the UNION of its leapers.
  const colorOffs = [];
  for (const g of groups) {
    const offs = g.pieces.flatMap(leaperOffsets); // duplicate offsets are harmless
    for (let i = 0; i < g.count; i++) colorOffs.push(offs);
  }
  const K = colorOffs.length;

  const cx = new Int32Array(K);
  const cy = new Int32Array(K);
  const done = new Array(K).fill(false);
  let remaining = K;

  const t0 = performance.now();

  while (remaining > 0) {
    for (let k = 0; k < K; k++) {
      if (done[k]) continue;
      let x = cx[k], y = cy[k];
      // Advance to the smallest cell legal for color k: not occupied and not
      // threatened by any OTHER color.
      const notK = (~(1 << k)) & 0xff;
      while (true) {
        if (x > S || x < -S || y > S || y < -S) { done[k] = true; remaining--; break; }
        const id = idx(x, y);
        if (occ[id] === 0 && (threat[id] & notK) === 0) break;
        const nxt = spiralStep(x, y);
        x = nxt[0]; y = nxt[1];
      }
      cx[k] = x; cy[k] = y;
      if (done[k]) continue;

      const id = idx(x, y);
      occ[id] = k + 1;
      const bit = 1 << k;
      const offs = colorOffs[k];
      for (let o = 0; o < offs.length; o++) {
        const tx = x + offs[o][0], ty = y + offs[o][1];
        if (inGrid(tx, ty)) threat[idx(tx, ty)] |= bit;
      }
    }
  }

  lastSimMs = performance.now() - t0;
  occupant = occ;
  gridS = S;
  gridK = K;
}

// Label every cell with its spiral number (reveal order). The first (2S+1)²
// spiral cells exactly fill the [-S,S]² grid.
function buildSpiralIndex(S) {
  const W = 2 * S + 1;
  const out = new Int32Array(W * W);
  let x = 0, y = 0;
  for (let i = 0; i < W * W; i++) {
    out[(y + S) * W + (x + S)] = i;
    const nxt = spiralStep(x, y);
    x = nxt[0]; y = nxt[1];
  }
  spiralIdx = out;
}

// =======================================================================
// WebGL renderer — one textured quad; the fragment shader samples a centered
// window and maps each cell's color id through a small palette texture.
// =======================================================================
const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
if (!gl) {
  document.body.innerHTML = '<p style="color:#ddd;font-family:monospace;padding:2rem">WebGL is required for this sketch.</p>';
  throw new Error('no webgl');
}
const MAX_TEX = gl.getParameter(gl.MAX_TEXTURE_SIZE);
const MAX_S = Math.floor((MAX_TEX - 1) / 2);

const VERT = `
  attribute vec2 aPos;
  varying vec2 vNdc;
  void main() { vNdc = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }
`;
// Data texture packs per cell: RGB = 24-bit spiral number, A = color id (0..K).
// Color id indexes a 16-wide palette texture (texel 0 = background).
const FRAG = `
  precision highp float;
  varying vec2 vNdc;
  uniform sampler2D uTex;
  uniform sampler2D uPalette;
  uniform float uHalf;      // window half-size in cells
  uniform float uS;         // grid S
  uniform float uW;         // 2S+1
  uniform float uAspectX;
  uniform float uAspectY;
  uniform float uFade;      // 1 = visible, 0 = fully faded to bg
  uniform int   uMode;      // 0 = all, 1 = spiral, 2 = square
  uniform float uReveal;    // spiral number of the sweep head
  uniform float uRevealRing;// ring index of the square front
  uniform float uHead;      // length (in spiral cells) of the glowing leading edge
  uniform vec3  uBg;
  void main() {
    float wx = vNdc.x * uHalf * uAspectX;
    float wy = vNdc.y * uHalf * uAspectY;
    vec2 uv = (vec2(wx, wy) + uS + 0.5) / uW;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(uBg, 1.0); return;
    }
    vec4 t = texture2D(uTex, uv);
    float idx = floor(t.r * 255.0 + 0.5)
              + floor(t.g * 255.0 + 0.5) * 256.0
              + floor(t.b * 255.0 + 0.5) * 65536.0;
    float occ = floor(t.a * 255.0 + 0.5);

    bool shown = true;
    if (uMode == 1) shown = idx <= uReveal;
    else if (uMode == 2) {
      float ring = max(abs(floor(wx + 0.5)), abs(floor(wy + 0.5)));
      shown = ring <= uRevealRing;
    }

    vec3 col = uBg;
    if (shown) {
      col = texture2D(uPalette, vec2((occ + 0.5) / 16.0, 0.5)).rgb; // texel 0 = bg
      if (uMode == 1) {
        float age = uReveal - idx;
        if (age >= 0.0 && age < uHead) {
          float g = 1.0 - age / uHead;
          col = mix(col, vec3(1.0), 0.75 * g * g);
        }
      }
    }
    gl_FragColor = vec4(mix(uBg, col, uFade), 1.0);
  }
`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('shader: ' + gl.getShaderInfoLog(s));
  }
  return s;
}
const program = gl.createProgram();
gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
  throw new Error('link: ' + gl.getProgramInfoLog(program));
}
gl.useProgram(program);

const quad = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quad);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(program, 'aPos');
gl.enableVertexAttribArray(aPos);
gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

const U = {};
for (const name of ['uTex', 'uPalette', 'uHalf', 'uS', 'uW', 'uAspectX', 'uAspectY',
  'uFade', 'uMode', 'uReveal', 'uRevealRing', 'uHead', 'uBg']) {
  U[name] = gl.getUniformLocation(program, name);
}

// Data texture (unit 0).
const texture = gl.createTexture();
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, texture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.uniform1i(U.uTex, 0);

// Palette texture (unit 1) — 16×1 RGBA, persistent binding.
const paletteTex = gl.createTexture();
gl.activeTexture(gl.TEXTURE1);
gl.bindTexture(gl.TEXTURE_2D, paletteTex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.uniform1i(U.uPalette, 1);
gl.activeTexture(gl.TEXTURE0);

// Bake spiral number (RGB) + color id (A) per cell.
function buildTexture() {
  const W = 2 * gridS + 1;
  const data = new Uint8Array(W * W * 4);
  for (let i = 0; i < W * W; i++) {
    const n = spiralIdx[i];
    const j = i * 4;
    data[j] = n & 255;
    data[j + 1] = (n >> 8) & 255;
    data[j + 2] = (n >> 16) & 255;
    data[j + 3] = occupant[i]; // 0 empty, else color id
  }
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, W, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
}

// Fill the 16×1 palette texture: index 0 = bg, 1..N = generated colors.
function buildPaletteTexture() {
  const scheme = curPalette();
  const N = Math.max(1, gridK);
  const cols = genColors(scheme, N);
  const data = new Uint8Array(16 * 4);
  const bg = scheme.bg;
  for (let i = 0; i < 16; i++) {
    const c = (i >= 1 && i <= N) ? cols[i - 1] : bg;
    data[i * 4] = c[0]; data[i * 4 + 1] = c[1]; data[i * 4 + 2] = c[2]; data[i * 4 + 3] = 255;
  }
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, paletteTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 16, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.activeTexture(gl.TEXTURE0);
}

// Re-run the simulation for the current groups/extent, rebuild textures, and
// (optionally) restart the zoom from the center.
function rebuild(resetAnim = true) {
  const S = Math.max(8, Math.min(extent, MAX_S));
  if (S !== extent) extent = S;
  normalizeGroups();
  simulate(S);
  buildSpiralIndex(S);
  buildTexture();
  buildPaletteTexture();
  console.log(`[knights] ${labelText()} — S=${gridS}, ${gridK} colors, ${(2 * gridS + 1) ** 2} cells in ${lastSimMs.toFixed(1)}ms`);
  if (resetAnim) { phase = 0; state = 'zoom'; stateT = 0; fade = 1; }
  updateDom();
  updateConfigLabel();
  renderGroups();
}

// --- canvas sizing ------------------------------------------------------
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(window.innerWidth * dpr);
  const h = Math.floor(window.innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    gl.viewport(0, 0, w, h);
  }
}
window.addEventListener('resize', resize);

// =======================================================================
// Animation state machine: zoom → hold → fadeout → fadein → zoom …
// =======================================================================
let phase = 0;
let state = 'zoom';
let stateT = 0;
let fade = 1;

function currentReveal() {
  const S = gridS;
  const total = (2 * S + 1) * (2 * S + 1);
  // zoom = 0 → hold on the finished image: everything shown, full extent, no
  // sweep head (head = 0 disables the glow).
  if (zoomSec <= 0) return { count: total, headRing: S, half: S, head: 0 };
  const p = Math.min(Math.max(phase, 0), 1);
  const count = Math.max(1, Math.pow(total, p)); // exponential → accelerating
  const headRing = (Math.sqrt(count) - 1) / 2;
  const half = Math.min(S, Math.max(H0, headRing * REVEAL_MARGIN + 0.5));
  const head = Math.max(10, headRing * 3);
  return { count, headRing, half, head };
}

function advance(dt) {
  if (zoomSec <= 0) { phase = 1; fade = 1; return; } // static hold on final image
  if (state === 'zoom') {
    phase += dt / Math.max(1, zoomSec);
    fade = 1;
    if (phase >= 1) { phase = 1; state = 'hold'; stateT = 0; }
  } else if (state === 'hold') {
    stateT += dt; fade = 1;
    if (stateT >= HOLD_SEC) { state = 'fadeout'; stateT = 0; }
  } else if (state === 'fadeout') {
    stateT += dt;
    fade = 1 - Math.min(stateT / FADE_SEC, 1);
    if (stateT >= FADE_SEC) {
      fade = 0; phase = 0; state = 'fadein'; stateT = 0;
      if (cyclePresets) gotoNextPreset();
    }
  } else if (state === 'fadein') {
    stateT += dt; phase = 0;
    fade = Math.min(stateT / FADE_SEC, 1);
    if (stateT >= FADE_SEC) { state = 'zoom'; stateT = 0; }
  }
}

function render() {
  resize();
  const aspect = canvas.width / canvas.height;
  const ax = aspect >= 1 ? aspect : 1;
  const ay = aspect >= 1 ? 1 : 1 / aspect;
  const bg = curPalette().bg;
  const r = currentReveal();
  gl.useProgram(program);
  gl.uniform1f(U.uHalf, r.half);
  gl.uniform1f(U.uS, gridS);
  gl.uniform1f(U.uW, 2 * gridS + 1);
  gl.uniform1f(U.uAspectX, ax);
  gl.uniform1f(U.uAspectY, ay);
  gl.uniform1f(U.uFade, fade);
  gl.uniform1i(U.uMode, REVEAL_CODE[reveal] ?? 1);
  gl.uniform1f(U.uReveal, r.count);
  gl.uniform1f(U.uRevealRing, r.headRing);
  gl.uniform1f(U.uHead, r.head);
  gl.uniform3f(U.uBg, bg[0] / 255, bg[1] / 255, bg[2] / 255);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// =======================================================================
// Control panel (house monospace-glass drawer; own identity)
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
      <h1>Knights <small>spiral</small></h1>
      <h2>pieces <span id="v-total" class="h2-aside"></span></h2>
      <div id="groups"></div>
      <button class="addgrp" data-action="grp-add">+ add color group</button>
      <h2>field</h2>
      ${paramRow('extent', 'extent', '[ ]')}
      <h2>motion</h2>
      ${paramRow('reveal', 'reveal', 'M')}
      ${paramRow('zoom', 'zoom', '← →')}
      ${paramRow('palette', 'palette', 'K')}
      <h2>preset</h2>
      <div class="row"><span class="label">preset</span><span id="v-preset" class="val accent" style="color:#9cf"></span></div>
      <div id="v-preset-pills" class="preset-pills"></div>
      <h2>actions</h2>
      <div class="legend">
        <button class="kbd" data-action="cycle">L</button><div class="kbd-desc">cycle presets: <span id="v-cycle" style="color:#9cf">off</span></div>
        <button class="kbd" data-action="restart">R</button><div class="kbd-desc">restart zoom</div>
        <button class="kbd" data-action="copy">C</button><div class="kbd-desc" id="copy-desc">copy screensaver URL</div>
        <button class="kbd" data-action="fullscreen">F</button><div class="kbd-desc">fullscreen</div>
        <button class="kbd" data-action="hide">H</button><div class="kbd-desc">hide / show panel</div>
      </div>
    </div>
  </div>
`;

const injectCss = window.SS.injectCss;

// Persistent config label (the piece groups), styled like chrome.js's toast.
// Independent of the panel so it shows in ?nopanel=1 screensaver mode.
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
function updateConfigLabel() {
  if (configLabelEl) configLabelEl.textContent = labelText();
}

const suppressPanel = new URLSearchParams(location.search).get('nopanel') === '1';

// --- group rows (selected chips + a ＋ that reveals the rest) ------------
let addingGroup = -1;   // index of the group whose roster is expanded, or -1

function swatchStrip(startColor, count, palCols) {
  let s = '';
  for (let k = 0; k < count; k++) {
    const c = palCols[startColor + k] || [80, 80, 80];
    s += `<span class="sw" style="background:rgb(${c[0]},${c[1]},${c[2]})"></span>`;
  }
  return s;
}

function groupRowHtml(g, i, total, startColor, palCols) {
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
    `<div class="grp-foot"><span class="grp-sw">${swatchStrip(startColor, g.count, palCols)}</span>` +
    `<span class="kbd-pair">` +
    `<button class="kbd-btn" data-action="grp-count" data-i="${i}" data-dir="-1"${decDis}>−</button>` +
    `<button class="kbd-btn" data-action="grp-count" data-i="${i}" data-dir="1"${incDis}>+</button></span>` +
    `<span class="grp-count">×${g.count}</span>` +
    `<button class="grp-del" data-action="grp-del" data-i="${i}"${delDis}>✕</button></div></div>`;
}

// Rebuild the groups section (single source of truth). Swatches show each
// group's actual rendered colors, so the panel maps colors → groups.
function renderGroups() {
  const c = document.getElementById('groups');
  if (!c) return;
  const total = totalColors();
  const palCols = genColors(curPalette(), Math.max(1, total));
  let html = '', startColor = 0;
  for (let i = 0; i < groups.length; i++) {
    html += groupRowHtml(groups[i], i, total, startColor, palCols);
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
    if (g.pieces.length <= 1) return; // keep at least one leaper
    g.pieces = g.pieces.filter((p) => p !== piece);
  } else {
    g.pieces = sortPieces([...g.pieces, piece]);
  }
  rebuild();           // re-sims, then renderGroups()
  syncPresetSelection();
}
function grpToggleAdd(i) {
  addingGroup = addingGroup === i ? -1 : i;
  renderGroups();
}
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
  addingGroup = groups.length - 1; // open the new group's roster to pick pieces
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
  dom.reveal = document.getElementById('v-reveal');
  dom.zoom = document.getElementById('v-zoom');
  dom.palette = document.getElementById('v-palette');
  dom.preset = document.getElementById('v-preset');
  dom.presetPills = document.getElementById('v-preset-pills');
  dom.cycle = document.getElementById('v-cycle');

  window.SS.presetPills(dom.presetPills, presets.length, pickPreset);

  const toggle = document.getElementById('drawer-toggle');
  toggle.addEventListener('click', () => { toggleDrawer(); toggle.blur(); });

  const content = document.getElementById('drawer-content');
  content.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a === 'restart') restart();
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

  // Hold an adjust button to auto-repeat (global params only; group controls
  // re-render their section per tap, so they're single-click).
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
  dom.reveal.textContent = reveal;
  dom.zoom.textContent = zoomSec === 0 ? 'hold' : `${zoomSec}s`;
  dom.palette.textContent = curPalette().name;
  dom.preset.textContent = presets[presetIdx] ? presets[presetIdx].name : '—';
  if (dom.cycle) dom.cycle.textContent = cyclePresets ? 'on' : 'off';
  for (let i = 0; i < dom.presetPills.children.length; i++) {
    dom.presetPills.children[i].classList.toggle('active', i === presetIdx);
  }
}

// --- param adjustment ---------------------------------------------------
function cycle(arr, cur, dir) {
  const i = arr.indexOf(cur);
  return arr[(i + dir + arr.length) % arr.length];
}

function adjustParam(param, dir) {
  if (param === 'extent') { extent = Math.max(64, Math.min(MAX_S, extent + dir * stepExtent)); rebuild(); }
  else if (param === 'reveal') { reveal = cycle(REVEAL_MODES, reveal, dir); updateDom(); }
  else if (param === 'zoom') { zoomSec = Math.max(0, zoomSec + dir * stepZoom); updateDom(); }
  else if (param === 'palette') { paletteIdx = (paletteIdx + dir + PALETTES.length) % PALETTES.length; buildPaletteTexture(); renderGroups(); updateDom(); }
  syncPresetSelection();
}

function pickPreset(i) {
  const p = presets[i];
  if (!p) return;
  presetIdx = i;
  groups = cloneGroups(p.groups);
  paletteIdx = p.paletteIdx;
  addingGroup = -1;
  rebuild();
}

function syncPresetSelection() {
  presetIdx = presets.findIndex((p) => p.paletteIdx === paletteIdx && groupsEqual(p.groups, groups));
  if (panelReady) updateDom();
}

// Advance to the next preset without resetting the fade/zoom state — called at
// the black moment between runs when cycling is on.
function gotoNextPreset() {
  const i = presetIdx < 0 ? 0 : (presetIdx + 1) % presets.length;
  const p = presets[i];
  presetIdx = i;
  groups = cloneGroups(p.groups);
  paletteIdx = p.paletteIdx;
  addingGroup = -1;
  rebuild(false);
}

function toggleCycle() {
  cyclePresets = !cyclePresets;
  window.flashToast?.(`cycle presets ${cyclePresets ? 'on' : 'off'}`);
  updateDom();
}

function restart() { phase = 0; state = 'zoom'; stateT = 0; fade = 1; }

// --- URL params ---------------------------------------------------------
function applyUrlParams() {
  const q = new URLSearchParams(location.search);
  if (q.has('groups')) {
    // groups=knight-zebra:2,wazir:1  (pieces joined by -, count after :)
    // ('-' not '+': in a query string '+' decodes to a space.)
    const parsed = [];
    for (const part of q.get('groups').split(',')) {
      const [pcs, ct] = part.split(':');
      const pieces = sortPieces((pcs || '').split('-'));
      if (pieces.length) parsed.push({ pieces, count: Math.max(1, parseInt(ct, 10) || 1) });
    }
    if (parsed.length) groups = parsed;
  }
  if (q.has('extent')) extent = Math.max(64, Math.min(MAX_S, parseInt(q.get('extent'), 10) || extent));
  if (q.has('zoom')) { const z = parseInt(q.get('zoom'), 10); if (!Number.isNaN(z)) zoomSec = Math.max(0, z); }
  if (q.has('palette')) paletteIdx = (parseInt(q.get('palette'), 10) || 0) % PALETTES.length;
  if (q.has('reveal') && REVEAL_MODES.includes(q.get('reveal'))) reveal = q.get('reveal');
  if (q.has('start')) startPhase = Math.max(0, Math.min(1, parseFloat(q.get('start')) || 0));
  if (q.get('cycle') === '1') cyclePresets = true;
  normalizeGroups();
}

function copyShareUrl() {
  const q = new URLSearchParams();
  q.set('groups', groups.map((g) => `${g.pieces.join('-')}:${g.count}`).join(','));
  q.set('extent', String(extent));
  q.set('zoom', String(zoomSec));
  q.set('palette', String(paletteIdx));
  q.set('reveal', reveal);
  if (cyclePresets) q.set('cycle', '1');
  q.set('nopanel', '1');
  const url = `${location.origin}${location.pathname}?${q.toString()}`;
  const done = (msg) => { window.flashToast?.(msg); const d = document.getElementById('copy-desc'); if (d) { const t = d.textContent; d.textContent = msg; setTimeout(() => (d.textContent = t), 1200); } };
  navigator.clipboard?.writeText(url).then(() => done('copied!'), () => done('copy failed'));
}

// --- keyboard -----------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return; // let Cmd+R, Cmd+L, etc. through
  const isAdjust = ['ArrowLeft', 'ArrowRight', '[', ']'].includes(e.key);
  if (e.repeat && !isAdjust) return;
  if (e.key === 'ArrowLeft') adjustParam('zoom', -1);
  else if (e.key === 'ArrowRight') adjustParam('zoom', 1);
  else if (e.key === '[') adjustParam('extent', -1);
  else if (e.key === ']') adjustParam('extent', 1);
  else if (e.key === 'k' || e.key === 'K') adjustParam('palette', 1);
  else if (e.key === 'm' || e.key === 'M') adjustParam('reveal', 1);
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
applyUrlParams();
buildPanel();
buildConfigLabel();
rebuild();
phase = startPhase;  // honor ?start= (rebuild reset phase to 0)
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
  advance(dt);
  render();
  requestAnimationFrame(tick);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  grabFocus();
  last = performance.now();
  if (!ticking) { ticking = true; requestAnimationFrame(tick); }
});
requestAnimationFrame(tick);
