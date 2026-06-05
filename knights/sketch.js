// Knights spiral coloring — a screensaver from Numberphile's "Red & Black
// Knights" (Neil Sloane / Jonas Karlsson). Cells of an infinite square spiral
// are claimed by K colors of knights taking turns: on a color's turn it grabs
// the lowest-numbered cell not occupied and not attacked by ANY OTHER color
// (same-color knights may attack each other — that asymmetry is what breeds the
// large-scale patterns). With knights and 2+ colors the plane splits into
// colored regions with chaotic bands along the axes; the structure only gets
// interesting past ~100k–1M placed cells. See OEIS A392177 / A308885.
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
// 1. Piece combos (Numberphile2 "Amazing Chessboard Patterns" extras):
//    - compound leaper = union of several (m,n) offset sets (e.g. knight+camel)
//    - different piece per color (color 1 knight, color 2 camel, …)
//    Both are small: a "piece" becomes a LIST of (m,n) pairs / per-color offsets.
//    Riders (queen/rook/bishop) attack whole lines → denser, different
//    construction ("queens in exile") and a bigger lift.
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
// 6. Roster auto-cycle: rotate through pieces/colors/palettes each loop for
//    long-idle variety (off by default; first entry = 3-color knight).
// 7. 1-color independent-set variant (OEIS A308885): place a knight only if
//    the cell isn't attacked by an EXISTING knight (no same-color attacks) —
//    a different, sparser pattern. Separate small code path.
// Deferred infra (only if needed): Web Worker for multi-million extents;
// supersample/mipmapped-color texture to tame zoomed-out moiré (currently we
// keep the moiré on purpose); letterbox-vs-fill choice at full zoom-out.
// ───────────────────────────────────────────────────────────────────────

// --- live params (URL-overridable, panel-tunable) -----------------------
let piece   = 'knight';  // leaper kind (see PIECES)
let colors  = 3;         // number of knight colors / players (2..4)
let extent  = 512;       // S: max spiral shell ≈ half the grid side
let zoomSec = 90;        // seconds for a full zoom-out
let paletteIdx = 0;      // index into PALETTES
let reveal  = 'spiral';  // reveal mode: 'spiral' | 'square' | 'all'
let startPhase = 0;      // initial zoom phase 0..1 (URL `start`; resume mid-zoom)

// --- internal constants -------------------------------------------------
const H0 = 0.5;          // starting half-window (cells) — one center cell
const HOLD_SEC = 5;      // pause at full extent before restarting
const FADE_SEC = 1.4;    // fade out / in duration
const REVEAL_MARGIN = 1.14; // keep the sweeping head this far inside the frame edge
const BG_FALLBACK = [10, 11, 16];
const REVEAL_MODES = ['spiral', 'square', 'all'];
const REVEAL_CODE = { spiral: 1, square: 2, all: 0 }; // matches the shader's uMode

// --- panel adjustment step sizes ----------------------------------------
const stepExtent = 64;
const stepZoom   = 10;

// --- (m,n) leapers ------------------------------------------------------
// A leaper reaches the 8 squares (±m,±n) and (±n,±m). Knight = (2,1).
const PIECES = {
  knight:   [2, 1],
  camel:    [3, 1],
  zebra:    [3, 2],
  antelope: [4, 3],
  giraffe:  [4, 1],
  fers:     [1, 1],
  vazir:    [1, 0],
};
const PIECE_NAMES = Object.keys(PIECES);

// --- palettes (bg + up to 4 knight colors) ------------------------------
const PALETTES = [
  { name: 'Ember', bg: [10, 11, 16], colors: [[232, 93, 63], [74, 163, 223], [150, 210, 90], [232, 193, 90]] },
  { name: 'Neon',  bg: [8, 8, 12],   colors: [[255, 86, 120], [60, 200, 255], [180, 255, 90], [255, 210, 70]] },
  { name: 'Mono',  bg: [13, 13, 15], colors: [[236, 236, 240], [150, 150, 158], [96, 96, 104], [60, 60, 66]] },
  { name: 'Reef',  bg: [6, 14, 18],  colors: [[255, 122, 80], [34, 200, 180], [120, 150, 255], [240, 220, 110]] },
];

// --- presets ------------------------------------------------------------
// Each snapshots a piece + color count + palette; preset 0 is the 3-color
// knight the build leads with. Others span the fairy pieces / Red & Black.
const presets = [
  { name: 'Knights ×3', piece: 'knight',   colors: 3, paletteIdx: 0 },
  { name: 'Red&Black',  piece: 'knight',   colors: 2, paletteIdx: 2 },
  { name: 'Knights ×4', piece: 'knight',   colors: 4, paletteIdx: 1 },
  { name: 'Camel ×3',   piece: 'camel',    colors: 3, paletteIdx: 3 },
  { name: 'Zebra ×3',   piece: 'zebra',    colors: 3, paletteIdx: 0 },
  { name: 'Antelope ×3', piece: 'antelope', colors: 3, paletteIdx: 1 },
  { name: 'Fers ×3',    piece: 'fers',     colors: 3, paletteIdx: 3 },
];
let presetIdx = 0;

const helpText = {
  piece:  'Which fairy "leaper" the knights are. Knight = (2,1); camel = (3,1); zebra = (3,2); etc. Changes the whole pattern.',
  colors: 'How many colors of knights take turns. 2 = the classic Red & Black; 3 is the most interesting.',
  extent: 'How far the spiral is computed (max shell). Bigger reveals more of the large-scale pattern but costs more to simulate.',
  zoom:   'Seconds for one full zoom-out from the center cell to the full extent.',
  reveal: 'How cells appear. spiral = a point sweeps the numbering spiral, laying color with a glowing head. square = whole rings pop in. all = the finished pattern, just zoomed.',
};

// =======================================================================
// Simulation — produces `occupant` (Int8) over a (2S+1)² grid.
//   0 = empty, else colorIndex+1.
// =======================================================================
let occupant = null;   // Int8Array — 0 empty, else color+1
let spiralIdx = null;  // Int32Array — spiral number (reveal order) per cell
let gridS = 0;         // the S actually simulated (may be clamped)
let lastSimMs = 0;

// Square spiral: counterclockwise, starts at origin, first step east.
// (Verbatim from the OEIS A392177 reference program.)
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

function simulate(S, K, pieceKind) {
  const W = 2 * S + 1;
  const occ = new Int8Array(W * W);       // 0 empty, else color+1
  const threat = new Uint8Array(W * W);   // bit p set if threatened by color p
  const idx = (x, y) => (y + S) * W + (x + S);
  const inGrid = (x, y) => x >= -S && x <= S && y >= -S && y <= S;

  const [m, n] = PIECES[pieceKind] || PIECES.knight;
  // 8 leaper offsets (duplicates for symmetric leapers are harmless).
  const offs = [
    [m, n], [m, -n], [-m, n], [-m, -n],
    [n, m], [-n, m], [n, -m], [-n, -m],
  ];

  // Per-color candidate pointer (a spiral position) + done flag.
  const cx = new Int32Array(K);
  const cy = new Int32Array(K);
  const done = new Array(K).fill(false);
  let remaining = K;

  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  while (remaining > 0) {
    for (let k = 0; k < K; k++) {
      if (done[k]) continue;
      let x = cx[k], y = cy[k];
      // Advance along the spiral to the smallest cell that's legal for color k:
      // not occupied and not threatened by any OTHER color.
      const notK = (~(1 << k)) & 0xff;
      while (true) {
        if (x > S || x < -S || y > S || y < -S) { // left the simulated region
          done[k] = true; remaining--; break;
        }
        const id = idx(x, y);
        if (occ[id] === 0 && (threat[id] & notK) === 0) break; // legal — place here
        const nxt = spiralStep(x, y);
        x = nxt[0]; y = nxt[1];
      }
      cx[k] = x; cy[k] = y;
      if (done[k]) continue;

      // Place a color-k knight and mark its threats.
      const id = idx(x, y);
      occ[id] = k + 1;
      const bit = 1 << k;
      for (let o = 0; o < 8; o++) {
        const tx = x + offs[o][0], ty = y + offs[o][1];
        if (inGrid(tx, ty)) threat[idx(tx, ty)] |= bit;
      }
    }
  }

  lastSimMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  occupant = occ;
  gridS = S;
}

// Walk the spiral once to label every cell with its spiral number (0,1,2,…).
// The first (2S+1)² cells of the square spiral exactly fill the [-S,S]² grid,
// so every cell gets a unique reveal order. Used by the 'spiral' reveal mode.
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
// WebGL renderer — one textured quad, fragment shader samples a centered
// window of half-size H cells.
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
// The texture packs, per cell: RGB = 24-bit spiral number, A = color id (0..K).
// The fragment shader decides whether a cell has been reached by the reveal
// front yet, maps the color id through palette uniforms, and adds a glowing
// leading edge to the most-recently-laid cells in spiral mode.
const FRAG = `
  precision highp float;
  varying vec2 vNdc;
  uniform sampler2D uTex;
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
  uniform vec3  uC1, uC2, uC3, uC4;
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
    int occ = int(floor(t.a * 255.0 + 0.5));

    // Reveal test.
    bool shown = true;
    if (uMode == 1) shown = idx <= uReveal;
    else if (uMode == 2) {
      float ring = max(abs(floor(wx + 0.5)), abs(floor(wy + 0.5)));
      shown = ring <= uRevealRing;
    }

    vec3 col = uBg;
    if (shown) {
      if      (occ == 1) col = uC1;
      else if (occ == 2) col = uC2;
      else if (occ == 3) col = uC3;
      else if (occ == 4) col = uC4;
      // Glowing leading edge: cells laid within the last uHead spiral steps.
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
for (const name of ['uTex', 'uHalf', 'uS', 'uW', 'uAspectX', 'uAspectY', 'uFade',
  'uMode', 'uReveal', 'uRevealRing', 'uHead', 'uBg', 'uC1', 'uC2', 'uC3', 'uC4']) {
  U[name] = gl.getUniformLocation(program, name);
}

const texture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, texture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.uniform1i(U.uTex, 0);

function curPalette() { return PALETTES[paletteIdx % PALETTES.length]; }

// Bake spiral number (RGB) + color id (A) per cell. Color is NOT baked — the
// palette lives in shader uniforms, so changing palette costs nothing here.
function buildTexture() {
  const S = gridS;
  const W = 2 * S + 1;
  const data = new Uint8Array(W * W * 4);
  for (let i = 0; i < W * W; i++) {
    const n = spiralIdx[i];
    const j = i * 4;
    data[j] = n & 255;
    data[j + 1] = (n >> 8) & 255;
    data[j + 2] = (n >> 16) & 255;
    data[j + 3] = occupant[i]; // 0 empty, else color id
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, W, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
}

// Re-run the simulation for the current piece/colors/extent, rebuild texture,
// and restart the zoom from the center.
function rebuild(resetAnim = true) {
  const S = Math.max(8, Math.min(extent, MAX_S));
  if (S !== extent) extent = S;
  const K = Math.max(2, Math.min(colors, 4));
  if (K !== colors) colors = K;
  simulate(S, K, piece);
  buildSpiralIndex(S);
  buildTexture();
  console.log(`[knights] ${piece} ×${colors}, S=${gridS} (${(2 * gridS + 1) ** 2} cells) simulated in ${lastSimMs.toFixed(1)}ms`);
  if (resetAnim) { phase = 0; state = 'zoom'; stateT = 0; fade = 1; }
  updateDom();
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
let phase = 0;          // 0..1 zoom progress
let state = 'zoom';
let stateT = 0;
let fade = 1;

// From the zoom phase, derive the sweep head (a spiral number), the head
// ring, and the window half-size that keeps the head just inside the frame.
function currentReveal() {
  const S = gridS;
  const total = (2 * S + 1) * (2 * S + 1);
  const p = Math.min(Math.max(phase, 0), 1);
  // Reveal count grows exponentially (1 → total): accelerating cells/sec.
  const count = Math.max(1, Math.pow(total, p));
  const headRing = (Math.sqrt(count) - 1) / 2;       // ring the sweep is on
  const half = Math.min(S, Math.max(H0, headRing * REVEAL_MARGIN + 0.5));
  // Glowing edge ≈ a fraction of the current ring's perimeter, so it reads as a
  // visible arc whether we're near the center or zoomed way out.
  const head = Math.max(10, headRing * 3);
  return { count, headRing, half, head };
}

function advance(dt) {
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
    }
  } else if (state === 'fadein') {
    stateT += dt; phase = 0;
    fade = Math.min(stateT / FADE_SEC, 1);
    if (stateT >= FADE_SEC) { state = 'zoom'; stateT = 0; }
  }
}

function rgb3(loc, c) { gl.uniform3f(loc, c[0] / 255, c[1] / 255, c[2] / 255); }

function render() {
  resize();
  const aspect = canvas.width / canvas.height;
  const ax = aspect >= 1 ? aspect : 1;
  const ay = aspect >= 1 ? 1 : 1 / aspect;
  const pal = curPalette();
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
  rgb3(U.uBg, pal.bg);
  rgb3(U.uC1, pal.colors[0]);
  rgb3(U.uC2, pal.colors[1]);
  rgb3(U.uC3, pal.colors[2] || pal.colors[0]);
  rgb3(U.uC4, pal.colors[3] || pal.colors[0]);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// =======================================================================
// Control panel (house monospace-glass drawer; own identity)
// =======================================================================
const dom = {};
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
  .row { display: grid; grid-template-columns: 4.6rem 5.2rem 1fr; align-items: center; gap: 0.5rem;
    padding: 0.3rem 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .row:last-child { border-bottom: none; }
  .row .label { color: #888; }
  .row .val { color: #fff; font-variant-numeric: tabular-nums; text-align: right; }
  .row .keys { justify-self: start; display: flex; align-items: center; gap: 6px; }
  .row .key-hint { font-size: 10px; color: #5b5b5b; letter-spacing: 0.05em; white-space: nowrap; }
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

function paramRow(label, param, hint) {
  const help = (helpText[param] || '').replace(/"/g, '&quot;');
  return `<div class="row" data-help="${help}"><span class="label">${label}</span>` +
    `<div class="keys"><span class="kbd-pair">` +
    `<button class="kbd-btn" data-action="adjust" data-param="${param}" data-dir="-1">−</button>` +
    `<button class="kbd-btn" data-action="adjust" data-param="${param}" data-dir="1">+</button>` +
    `</span><span class="key-hint">${hint}</span></div>` +
    `<span id="v-${param}" class="val"></span></div>`;
}

const PANEL_HTML = `
  <div id="drawer">
    <button id="drawer-toggle" tabindex="-1" aria-label="Toggle controls"></button>
    <div id="drawer-content">
      <h1>Knights <small>spiral</small></h1>
      <h2>pattern</h2>
      ${paramRow('piece', 'piece', '')}
      ${paramRow('colors', 'colors', '')}
      ${paramRow('extent', 'extent', '[ ]')}
      <h2>motion</h2>
      ${paramRow('reveal', 'reveal', 'M')}
      ${paramRow('zoom', 'zoom', '← →')}
      ${paramRow('palette', 'palette', '')}
      <h2>preset</h2>
      <div class="row"><span class="label">preset</span><span id="v-preset" class="val accent" style="color:#9cf"></span></div>
      <div id="v-preset-pills" class="preset-pills"></div>
      <h2>actions</h2>
      <div class="legend">
        <button class="kbd" data-action="restart">R</button><div class="kbd-desc">restart zoom</div>
        <button class="kbd" data-action="copy">C</button><div class="kbd-desc" id="copy-desc">copy screensaver URL</div>
        <button class="kbd" data-action="fullscreen">F</button><div class="kbd-desc">fullscreen</div>
        <button class="kbd" data-action="hide">H</button><div class="kbd-desc">hide / show panel</div>
      </div>
    </div>
  </div>
`;

function injectCss(css) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

const suppressPanel = new URLSearchParams(location.search).get('nopanel') === '1';

function buildPanel() {
  if (suppressPanel || document.getElementById('drawer')) return;
  injectCss(PANEL_CSS);
  const parsed = new DOMParser().parseFromString(PANEL_HTML, 'text/html');
  document.body.appendChild(parsed.body.firstElementChild);

  dom.piece = document.getElementById('v-piece');
  dom.colors = document.getElementById('v-colors');
  dom.extent = document.getElementById('v-extent');
  dom.reveal = document.getElementById('v-reveal');
  dom.zoom = document.getElementById('v-zoom');
  dom.palette = document.getElementById('v-palette');
  dom.preset = document.getElementById('v-preset');
  dom.presetPills = document.getElementById('v-preset-pills');

  for (let i = 0; i < presets.length; i++) {
    const pill = document.createElement('button');
    pill.className = 'pill';
    pill.textContent = (i + 1) % 10;
    pill.addEventListener('click', () => { pickPreset(i); pill.blur(); });
    dom.presetPills.appendChild(pill);
  }

  const toggle = document.getElementById('drawer-toggle');
  toggle.addEventListener('click', () => { toggleDrawer(); toggle.blur(); });

  const content = document.getElementById('drawer-content');
  content.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a === 'restart') restart();
    else if (a === 'copy') copyShareUrl();
    else if (a === 'fullscreen') window.toggleFullscreen?.();
    else if (a === 'hide') toggleDrawer();
    else return;
    el.blur();
  });

  // Hold an adjust button to auto-repeat.
  let holdDelay, holdInterval;
  const stopHold = () => { clearTimeout(holdDelay); clearInterval(holdInterval); };
  content.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-action="adjust"]');
    if (!el) return;
    e.preventDefault();
    const param = el.dataset.param, dir = Number(el.dataset.dir);
    adjustParam(param, dir);
    el.setPointerCapture?.(e.pointerId);
    holdDelay = setTimeout(() => { holdInterval = setInterval(() => adjustParam(param, dir), 120); }, 350);
  });
  content.addEventListener('pointerup', stopHold);
  content.addEventListener('pointercancel', stopHold);

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
  updateDom();
}

function toggleDrawer() {
  const d = document.getElementById('drawer');
  if (d) d.classList.toggle('open');
}

function updateDom() {
  if (!dom.piece) return;
  dom.piece.textContent = piece;
  dom.colors.textContent = String(colors);
  dom.extent.textContent = String(extent);
  dom.reveal.textContent = reveal;
  dom.zoom.textContent = `${zoomSec}s`;
  dom.palette.textContent = curPalette().name;
  dom.preset.textContent = presets[presetIdx] ? presets[presetIdx].name : '—';
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
  if (param === 'piece') { piece = cycle(PIECE_NAMES, piece, dir); rebuild(); }
  else if (param === 'colors') { colors = Math.max(2, Math.min(4, colors + dir)); rebuild(); }
  else if (param === 'extent') { extent = Math.max(64, Math.min(MAX_S, extent + dir * stepExtent)); rebuild(); }
  else if (param === 'reveal') { reveal = cycle(REVEAL_MODES, reveal, dir); updateDom(); }
  else if (param === 'zoom') { zoomSec = Math.max(10, zoomSec + dir * stepZoom); updateDom(); }
  else if (param === 'palette') { paletteIdx = (paletteIdx + dir + PALETTES.length) % PALETTES.length; updateDom(); }
  syncPresetSelection();
}

function pickPreset(i) {
  const p = presets[i];
  if (!p) return;
  presetIdx = i;
  piece = p.piece; colors = p.colors; paletteIdx = p.paletteIdx;
  rebuild();
}

function syncPresetSelection() {
  presetIdx = presets.findIndex((p) => p.piece === piece && p.colors === colors && p.paletteIdx === paletteIdx);
  if (dom.preset) updateDom();
}

function restart() { phase = 0; state = 'zoom'; stateT = 0; fade = 1; }

// --- URL params ---------------------------------------------------------
function applyUrlParams() {
  const q = new URLSearchParams(location.search);
  if (q.has('piece') && PIECES[q.get('piece')]) piece = q.get('piece');
  if (q.has('colors')) colors = Math.max(2, Math.min(4, parseInt(q.get('colors'), 10) || colors));
  if (q.has('extent')) extent = Math.max(64, Math.min(MAX_S, parseInt(q.get('extent'), 10) || extent));
  if (q.has('zoom')) zoomSec = Math.max(10, parseInt(q.get('zoom'), 10) || zoomSec);
  if (q.has('palette')) paletteIdx = (parseInt(q.get('palette'), 10) || 0) % PALETTES.length;
  if (q.has('reveal') && REVEAL_MODES.includes(q.get('reveal'))) reveal = q.get('reveal');
  if (q.has('start')) startPhase = Math.max(0, Math.min(1, parseFloat(q.get('start')) || 0));
}

function copyShareUrl() {
  const q = new URLSearchParams();
  q.set('piece', piece);
  q.set('colors', String(colors));
  q.set('extent', String(extent));
  q.set('zoom', String(zoomSec));
  q.set('palette', String(paletteIdx));
  q.set('reveal', reveal);
  q.set('nopanel', '1');
  const url = `${location.origin}${location.pathname}?${q.toString()}`;
  const done = (msg) => { window.flashToast?.(msg); const d = document.getElementById('copy-desc'); if (d) { const t = d.textContent; d.textContent = msg; setTimeout(() => (d.textContent = t), 1200); } };
  navigator.clipboard?.writeText(url).then(() => done('copied!'), () => done('copy failed'));
}

// --- keyboard -----------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const isAdjust = ['ArrowLeft', 'ArrowRight', '[', ']'].includes(e.key);
  if (e.repeat && !isAdjust) return;
  if (e.key === 'ArrowLeft') adjustParam('zoom', -1);
  else if (e.key === 'ArrowRight') adjustParam('zoom', 1);
  else if (e.key === '[') adjustParam('extent', -1);
  else if (e.key === ']') adjustParam('extent', 1);
  else if (e.key === 'p' || e.key === 'P') adjustParam('piece', 1);
  else if (e.key === 'k' || e.key === 'K') adjustParam('palette', 1);
  else if (e.key === 'm' || e.key === 'M') adjustParam('reveal', 1);
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
  if (dom.piece && (state === 'zoom')) { /* live values are static; no per-frame DOM churn */ }
  requestAnimationFrame(tick);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  grabFocus();
  last = performance.now();
  if (!ticking) { ticking = true; requestAnimationFrame(tick); }
});
requestAnimationFrame(tick);
