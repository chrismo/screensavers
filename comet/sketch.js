// Endless cone of lights: orbs stream from a vanishing point at z=-depth
// toward a stationary camera, fan out as they approach, then wrap back to
// the vertex with new colors, sizes, and speeds. Camera (x,y) lazily
// chases a randomly picked target orb (the cross-spike "star" one); on
// each handoff a new target gets the star treatment. World coordinates
// stay in a fixed window — no growing-Z precision drift.
//
// Control panel matches petri-dish (drawer / glass / monospace). 7 live
// params + 8 presets + URL params for shareable autoplay. No drift / lerp
// modes (yet).

// --- live params (URL-overridable, panel-tunable) -----------------------
let num    = 500;       // orb count
let speed  = 4.0;       // mean travel speed (units/sec, +z)
let radius = 30;        // cone radius at the camera plane
let depth  = 100;       // |z| of the cone vertex (spawn distance)
let spin   = 0.2;       // cone-spin rate around z-axis (rad/sec)
let chase  = 0.15;      // camera lerp rate toward target (1/sec; 0 = off)

// --- internal constants (not exposed) -----------------------------------
const Z_NEAR = 0.5;             // recycle threshold (just past camera)
const SPEED_VARIANCE = 0.4;     // ± fraction of speed for parallax
const SIZE_MIN = 1.0;
const SIZE_MAX = 2.5;
const CHASE_RAMP = 0.25;        // trapezoidal motion profile shape — fraction of trajectory spent ramping in/out
const PICK_DEPTH_FRAC = 0.5;    // only orbs deeper than this fraction of |depth| are eligible
const CAM_RECENTER_RATE = 1.5;  // when chase is off, how fast camera drifts back to (0,0)
const APPROACH_DURATION = 6.0;  // seconds — camera arc-in from in front of the comet
const MAX_DT = 0.05;

// --- panel adjustment step sizes ----------------------------------------
const stepNum    = 50;
const stepSpeed  = 0.5;
const stepRadius = 5;
const stepDepth  = 10;
const stepSpin   = 0.05;
const stepChase  = 0.05;

// --- per-param help text (shown as native browser tooltip on hover) ------
const helpText = {
  num:    'Number of orbs in the cone.',
  speed:  'How fast orbs travel toward you.',
  radius: 'How wide orbs spread at their closest point.',
  depth:  'How far away orbs spawn. Bigger gives more depth.',
  spin:   'How fast the comet rotates.',
  chase:  'How much the camera commits to the orb\'s endpoint. 1 = arrives at it as the orb dies; 0.5 = lands halfway; 0 disables. >1 overshoots past the endpoint.',
};

// --- presets -------------------------------------------------------------
// Each preset snapshots the full live config. Tuned to span regimes:
// quiet starfield, dense warp, narrow tube, sparse void, etc.
const presets = [
  { name: 'Calm',    num: 500,  speed: 4.0,  radius: 28, depth: 100, spin: 0.20, chase: 0.30 },
  { name: 'Drift',   num: 200,  speed: 1.0,  radius: 35, depth: 180, spin: 0.05, chase: 0.00 },
  { name: 'Warp',    num: 1500, speed: 12.0, radius: 50, depth: 250, spin: 0.30, chase: 0.25 },
  { name: 'Hunt',    num: 200,  speed: 12.0, radius: 45, depth:  80, spin: 0.10, chase: 1.20 },
  { name: 'Cluster', num: 400,  speed: 8.0,  radius:  8, depth:  60, spin: 0.20, chase: 0.30 },
  { name: 'Vast',    num: 1200, speed: 1.5,  radius: 160, depth: 280, spin: 0.02, chase: 0.05 },
  { name: 'Spin',    num: 600,  speed: 2.0,  radius: 35, depth: 100, spin: 1.50, chase: 0.00 },
  { name: 'Disco',   num: 2000, speed: 15.0, radius: 35, depth: 100, spin: 0.50, chase: 1.00 },
];
let presetIdx = 0;

// --- DOM panel ----------------------------------------------------------
const dom = {};

const BASE_CSS = `
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #1a2230; }
  canvas { display: block; }
`;

const PANEL_CSS = `
  #drawer {
    position: fixed; top: 0; left: 0;
    height: 100vh; height: 100dvh; /* dvh trims iPad URL bar so drawer fits */
    width: 280px;
    background: rgba(10, 12, 18, 0.55);
    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    color: #ddd;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 12px;
    transform: translateX(-280px);
    transition: transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
    z-index: 10;
    box-shadow: 0 0 30px rgba(0, 0, 0, 0.4);
  }
  #drawer.open { transform: translateX(0); }

  #drawer-toggle {
    position: absolute; left: 100%; top: 1rem;
    width: 26px; height: 40px;
    background: rgba(10, 12, 18, 0.55);
    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    border: none; border-radius: 0 6px 6px 0;
    color: #9cf; font-size: 18px; cursor: pointer; font-family: inherit;
    display: flex; align-items: center; justify-content: center; padding: 0;
    box-shadow: 4px 0 12px rgba(0, 0, 0, 0.3);
  }
  #drawer-toggle:hover { color: #fff; }
  #drawer-toggle:focus { outline: none; }
  #drawer.open #drawer-toggle::before { content: '‹'; }
  #drawer:not(.open) #drawer-toggle::before { content: '›'; }

  #drawer-content {
    padding: 1.25rem 1.4rem; overflow-y: auto; height: 100%; box-sizing: border-box;
    overscroll-behavior: contain;
    scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.18) transparent;
  }
  #drawer-content::-webkit-scrollbar { width: 6px; }
  #drawer-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 3px; }
  #drawer-content h1 { font-size: 14px; font-weight: 500; letter-spacing: 0.04em; margin: 0 0 1rem; color: #fff; }
  #drawer-content h1 small { font-weight: 400; color: #888; margin-left: 0.4em; font-size: 11px; }
  #drawer-content h2 { font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.12em; margin: 1.4rem 0 0.5rem; color: #888; }

  .row {
    display: grid; grid-template-columns: 5.5rem 5.2rem 1fr;
    align-items: center; gap: 0.5rem;
    padding: 0.3rem 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }
  .row:last-child { border-bottom: none; }
  .row .label { color: #888; }
  .row .val { color: #fff; font-variant-numeric: tabular-nums; text-align: right; }
  .row .val.accent { color: #9cf; }
  .row .keys { justify-self: start; display: flex; flex-direction: row; align-items: center; gap: 6px; }
  .row .key-hint { font-size: 10px; color: #5b5b5b; letter-spacing: 0.05em; line-height: 1; white-space: nowrap; }
  .row.wide { grid-template-columns: 1fr auto; }

  .legend { display: grid; grid-template-columns: auto 1fr; gap: 0.45rem 0.85rem; align-items: center; }

  .preset-pills { display: flex; justify-content: flex-end; gap: 0.18rem; padding: 0.15rem 0 0.3rem; }
  .preset-pills .pill {
    font-family: inherit; font-size: 11.5px;
    background: rgba(255, 255, 255, 0.05); color: #555;
    padding: 0.28rem 0.42rem; border-radius: 3px; min-width: 1rem; text-align: center;
  }
  .preset-pills .pill.active { background: rgba(156, 204, 255, 0.22); color: #9cf; }

  .kbd {
    font-family: inherit; background: rgba(255, 255, 255, 0.07);
    padding: 0.35rem 0.6rem; border-radius: 3px;
    font-size: 12px; color: #ccc; text-align: center; white-space: nowrap; line-height: 1;
  }
  .kbd-desc { color: #aaa; font-size: 11px; }

  button.kbd, .kbd-pair .kbd-btn, .preset-pills .pill {
    border: none; cursor: pointer; font-family: inherit; -webkit-tap-highlight-color: transparent;
  }
  button.kbd:focus, .kbd-pair .kbd-btn:focus, .preset-pills .pill:focus { outline: none; }
  button.kbd:hover, .kbd-pair .kbd-btn:hover { background: rgba(255, 255, 255, 0.14); color: #fff; }
  button.kbd:active, .kbd-pair .kbd-btn:active, .preset-pills .pill:active {
    background: rgba(156, 204, 255, 0.32); color: #9cf;
  }

  .kbd-pair {
    display: inline-flex; background: rgba(255, 255, 255, 0.07); border-radius: 3px; overflow: hidden;
  }
  .kbd-pair .kbd-btn {
    background: none; color: #ccc; font-size: 13px; padding: 0.4rem 0.5rem; line-height: 1; min-width: 1.2rem;
  }
  .kbd-pair .kbd-btn + .kbd-btn { border-left: 1px solid rgba(0, 0, 0, 0.35); }

  #comet-tooltip {
    position: fixed;
    pointer-events: none;
    background: rgba(10, 12, 18, 0.78);
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    color: #ddd;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 11px;
    line-height: 1.5;
    padding: 0.6rem 0.75rem;
    border-radius: 4px;
    max-width: 240px;
    z-index: 20;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    opacity: 0;
    transform: translateX(-4px);
    transition: opacity 0.15s ease-out, transform 0.15s ease-out;
  }
  #comet-tooltip.visible {
    opacity: 1;
    transform: translateX(0);
  }
`;

const paramRow = (label, param, hint) => window.SS.paramRow(label, param, hint, helpText[param]);

const PANEL_HTML = `
  <div id="drawer">
    <button id="drawer-toggle" tabindex="-1" aria-label="Toggle controls"></button>
    <div id="drawer-content">
      <h1>Comet <small>chaser</small></h1>

      <h2>state</h2>
      ${paramRow('num',    'num',    '')}
      ${paramRow('speed',  'speed',  '← →')}
      ${paramRow('radius', 'radius', '↓ ↑')}
      ${paramRow('depth',  'depth',  '[ ]')}
      ${paramRow('spin',   'spin',   ', .')}
      ${paramRow('chase',  'chase',  '')}

      <h2>preset</h2>
      <div class="row wide"><span class="label">preset</span><span id="v-preset" class="val accent"></span></div>
      <div id="v-preset-pills" class="preset-pills"></div>

      <h2>actions</h2>
      <div class="legend">
        <button class="kbd kbd-action" data-action="reset">R</button><div class="kbd-desc">reset orbs</div>
        <button class="kbd kbd-action" data-action="copy">C</button><div class="kbd-desc" id="copy-desc">copy screensaver URL</div>
        <button class="kbd kbd-action" data-action="approach">A</button><div class="kbd-desc">approach: <span id="v-approach" class="accent">on</span></div>
        <button class="kbd kbd-action" data-action="fullscreen">F</button><div class="kbd-desc">fullscreen</div>
        <button class="kbd kbd-action" data-action="hide">H</button><div class="kbd-desc">hide / show panel</div>
      </div>
    </div>
  </div>
`;

const injectCss = window.SS.injectCss;

function buildPanel() {
  if (document.getElementById('drawer')) return;
  injectCss(PANEL_CSS);
  // PANEL_HTML is a static template with no user input — DOMParser is the
  // script-safe path for materializing it into DOM nodes.
  const parsed = new DOMParser().parseFromString(PANEL_HTML, 'text/html');
  document.body.appendChild(parsed.body.firstElementChild);
}

// --- Three.js setup -----------------------------------------------------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75, window.innerWidth / window.innerHeight, 0.1, 400,
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x1a2230, 1);
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- textures -----------------------------------------------------------
function makeBlobTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(
    size / 2, size / 2, 0, size / 2, size / 2, size / 2,
  );
  g.addColorStop(0.00, 'rgba(255,255,255,1.0)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.15)');
  g.addColorStop(1.00, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}
const blobTex = makeBlobTexture();

function makeStarTexture() {
  // Soft round core plus two perpendicular tapered "spikes" — produces a
  // cross / lens-flare look that reads as a distinct shape against the
  // round blobs, regardless of camera roll.
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.globalCompositeOperation = 'lighter';
  const smear = (scaleX, scaleY) => {
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.scale(scaleX, scaleY);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size / 2);
    g.addColorStop(0.00, 'rgba(255,255,255,1.0)');
    g.addColorStop(0.30, 'rgba(255,255,255,0.4)');
    g.addColorStop(1.00, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  };
  smear(1, 1);      // round core
  smear(1, 0.04);   // horizontal spike
  smear(0.04, 1);   // vertical spike
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}
const starTex = makeStarTexture();

// --- orbs ---------------------------------------------------------------
const sprites = [];
const state = [];

function makeSprite() {
  const mat = new THREE.SpriteMaterial({
    map: blobTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.Sprite(mat);
}

function respawn(sprite, i) {
  // sqrt distribution → uniform area on the disk (avoids center-bias).
  const r = Math.sqrt(Math.random()) * radius;
  const theta = Math.random() * Math.PI * 2;
  const baseX = Math.cos(theta) * r;
  const baseY = Math.sin(theta) * r;
  sprite.position.x = baseX;
  sprite.position.y = baseY;
  sprite.position.z = -depth;
  sprite.material.color.setHSL(Math.random(), 0.75, 0.55);
  sprite.material.map = blobTex;  // reset (in case it was the target)
  const s = SIZE_MIN + Math.random() * (SIZE_MAX - SIZE_MIN);
  sprite.scale.set(s, s, 1);
  state[i] = {
    baseX, baseY,
    speed: speed * (1 + (Math.random() * 2 - 1) * SPEED_VARIANCE),
  };
}

let targetIdx = -1;
let approachT = 0;
// Chase planning state: on each new target, we plan a trapezoidal-eased
// trajectory from the camera's current position to a "trust point" computed
// from chase × (death − target). The camera follows the plan exactly,
// arriving at the trust point precisely when the orb expires.
let planStartX = 0, planStartY = 0;
let planStartT = 0;
let planAimX = 0, planAimY = 0;
let planDuration = 1;
let lastChase = 0;          // detect live chase changes so the trajectory replans
let playApproach = true;       // user preference: play approach on load + every preset change
let approachActive = playApproach;  // currently mid-approach?
let cometRoll = 0;  // accumulated cone-spin angle (radians); orbs rotate around z by this.

function pickTarget() {
  const threshold = -depth * PICK_DEPTH_FRAC;
  const candidates = [];
  for (let i = 0; i < num; i++) {
    if (sprites[i].position.z < threshold) candidates.push(i);
  }
  if (candidates.length === 0) return -1;
  const idx = candidates[Math.floor(Math.random() * candidates.length)];
  sprites[idx].material.map = starTex;
  return idx;
}

// Trapezoidal motion profile: linear ramp-up, constant cruise, linear ramp-down.
// `ramp` is the fraction of t spent on each ramp (0..0.5). 0 → pure linear,
// 0.5 → degenerates to smoothstep (no constant-velocity middle).
function trapezoidEase(t, ramp) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (ramp <= 0) return t;
  if (ramp >= 0.5) return t * t * (3 - 2 * t);
  const norm = 1 - ramp;
  if (t < ramp)         return (t * t) / (2 * ramp) / norm;
  if (t < 1 - ramp)     return (ramp / 2 + (t - ramp)) / norm;
  const u = 1 - t;
  return 1 - (u * u) / (2 * ramp) / norm;
}

// Rebuild the sprite pool to match the current `num`. Also used on first
// init since spawning has to happen after `num` is finalized from URL/preset.
function setNum(newNum) {
  newNum = Math.max(1, Math.floor(newNum));
  // Trim if shrinking
  while (sprites.length > newNum) {
    const s = sprites.pop();
    state.pop();
    scene.remove(s);
  }
  // Grow if expanding
  while (sprites.length < newNum) {
    const sprite = makeSprite();
    scene.add(sprite);
    const i = sprites.length;
    sprites.push(sprite);
    respawn(sprite, i);
    // Stagger initial z so the cone is populated from frame 1.
    sprite.position.z = -depth + Math.random() * (Z_NEAR + depth);
  }
  num = newNum;
  targetIdx = -1;  // will get re-picked next tick
}

function resetOrbs() {
  for (let i = 0; i < num; i++) {
    respawn(sprites[i], i);
    sprites[i].position.z = -depth + Math.random() * (Z_NEAR + depth);
  }
  targetIdx = -1;
  window.flashToast?.('reset');
}

// --- presets and adjustment --------------------------------------------
function applyPreset(i) {
  const p = presets[i];
  speed  = p.speed;
  radius = p.radius;
  depth  = p.depth;
  spin   = p.spin;
  chase  = p.chase;
  if (sprites.length > 0 && p.num !== num) setNum(p.num);
  else num = p.num;
  presetIdx = i;
  if (playApproach) {
    approachT = 0;
    approachActive = true;
  }
}

function toggleApproach() {
  playApproach = !playApproach;
  window.flashToast?.(`approach ${playApproach ? 'on' : 'off'}`);
}

function pickPreset(i) {
  applyPreset(i);
  window.flashToast?.(`preset ${(i + 1) % 10}: ${presets[i].name}`);
}

function adjustParam(name, dir) {
  const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));
  if      (name === 'num')    setNum(clamp(50,  2000, num    + dir * stepNum));
  else if (name === 'speed')  speed  = clamp(0.5, 15,  speed  + dir * stepSpeed);
  else if (name === 'radius') radius = clamp(5,   180, radius + dir * stepRadius);
  else if (name === 'depth')  depth  = clamp(30,  300, depth  + dir * stepDepth);
  else if (name === 'spin')   spin   = clamp(0,    2,  spin   + dir * stepSpin);
  else if (name === 'chase')  chase  = clamp(0,    2,  chase  + dir * stepChase);
  toastParam(name);
}

function toastParam(name) {
  let msg;
  if      (name === 'num')    msg = `num ${num}`;
  else if (name === 'speed')  msg = `speed ${speed.toFixed(1)}`;
  else if (name === 'radius') msg = `radius ${radius.toFixed(0)}`;
  else if (name === 'depth')  msg = `depth ${depth.toFixed(0)}`;
  else if (name === 'spin')   msg = `spin ${spin.toFixed(2)}`;
  else if (name === 'chase')  msg = `chase ${chase.toFixed(2)}`;
  else return;
  window.flashToast?.(msg);
}

// --- copy URL ----------------------------------------------------------
// Build a screensaver-friendly URL that reproduces the current panel
// state. Only emits params that differ from the active preset's defaults.
function copyShareUrl() {
  if (!navigator.clipboard) return;
  const close = (a, b) => Math.abs(a - b) < 1e-6;
  const fmt = (n, d) => Number(n.toFixed(d)).toString();

  const params = new URLSearchParams();
  params.set('nopanel', '1');
  if (!playApproach) params.set('approach', '0');
  params.set('preset', String(presetIdx));

  const p = presets[presetIdx];
  if (!close(num,    p.num))    params.set('num',    String(num));
  if (!close(speed,  p.speed))  params.set('speed',  fmt(speed, 2));
  if (!close(radius, p.radius)) params.set('radius', fmt(radius, 1));
  if (!close(depth,  p.depth))  params.set('depth',  fmt(depth, 1));
  if (!close(spin,   p.spin))   params.set('spin',   fmt(spin, 3));
  if (!close(chase,  p.chase))  params.set('chase',  fmt(chase, 3));

  const url = new URL(location.pathname, location.href);
  url.search = params.toString();

  navigator.clipboard.writeText(url.toString()).then(() => {
    const desc = document.getElementById('copy-desc');
    if (!desc) return;
    const orig = desc.textContent;
    desc.textContent = 'copied!';
    desc.style.color = '#9cf';
    setTimeout(() => { desc.textContent = orig; desc.style.color = ''; }, 1200);
  }).catch(() => {});
}

// --- URL params ---------------------------------------------------------
// Applied in order: approach → preset → numeric overrides → panel.
//
// ?preset=N   apply preset N (0 to presets.length-1) before overrides
// ?nopanel=1  skip the control drawer entirely
// ?approach=0 skip the approach animation (preset changes also won't replay it)
// ?num=N      orb count
// ?speed=N    flow speed
// ?radius=N   cone radius at camera plane
// ?depth=N    spawn distance (cone vertex |z|)
// ?spin=N     cone spin rate
// ?chase=N    camera target-lerp rate (0 = chase off)
function applyUrlParams() {
  const params = new URLSearchParams(location.search);

  // Parse approach before preset so applyPreset's approach-replay respects the flag.
  if (params.get('approach') === '0') {
    playApproach = false;
    approachActive = false;
  }

  const presetParam = params.get('preset');
  if (presetParam !== null) {
    const i = Number(presetParam);
    if (Number.isInteger(i) && i >= 0 && i < presets.length) applyPreset(i);
  }

  const setNumber = (key, setter) => {
    const v = parseFloat(params.get(key));
    if (Number.isFinite(v)) setter(v);
  };
  setNumber('num',    (v) => { num = Math.max(1, Math.floor(v)); });
  setNumber('speed',  (v) => { speed = v; });
  setNumber('radius', (v) => { radius = v; });
  setNumber('depth',  (v) => { depth = v; });
  setNumber('spin',   (v) => { spin = v; });
  setNumber('chase',  (v) => { chase = v; });

  if (params.get('nopanel') !== '1') {
    buildPanel();
    setupDom();
  }
}

// --- DOM panel hookup --------------------------------------------------
function setupDom() {
  dom.num     = document.getElementById('v-num');
  dom.speed   = document.getElementById('v-speed');
  dom.radius  = document.getElementById('v-radius');
  dom.depth   = document.getElementById('v-depth');
  dom.spin    = document.getElementById('v-spin');
  dom.chase   = document.getElementById('v-chase');
  dom.preset  = document.getElementById('v-preset');
  dom.presetPills = document.getElementById('v-preset-pills');
  dom.approach = document.getElementById('v-approach');

  window.SS.presetPills(dom.presetPills, presets.length, pickPreset);

  const toggle = document.getElementById('drawer-toggle');
  toggle.addEventListener('click', () => {
    toggleDrawer();
    toggle.blur();
  });

  // Delegated click dispatch — every actionable control carries data-action.
  const drawerContent = document.getElementById('drawer-content');
  drawerContent.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if      (a === 'reset')      resetOrbs();
    else if (a === 'copy')       copyShareUrl();
    else if (a === 'approach')   toggleApproach();
    else if (a === 'fullscreen') window.toggleFullscreen?.();
    else if (a === 'hide')       toggleDrawer();
    else return;
    el.blur();
  });

  // Hold an adjust button to auto-repeat.
  window.SS.attachHoldRepeat(drawerContent, '[data-action="adjust"]',
    (el) => adjustParam(el.dataset.param, Number(el.dataset.dir)), { interval: 60 });

  // Custom tooltip — appears to the right of the drawer, matching the same
  // smoky-glass aesthetic. Single shared element, repositioned on hover.
  const tooltip = document.createElement('div');
  tooltip.id = 'comet-tooltip';
  document.body.appendChild(tooltip);
  for (const row of document.querySelectorAll('#drawer-content .row[data-help]')) {
    row.addEventListener('mouseenter', () => {
      tooltip.textContent = row.dataset.help;
      const rect = row.getBoundingClientRect();
      tooltip.style.left = (rect.right + 12) + 'px';
      tooltip.style.top = rect.top + 'px';
      tooltip.classList.add('visible');
    });
    row.addEventListener('mouseleave', () => {
      tooltip.classList.remove('visible');
    });
  }
}

const toggleDrawer = window.SS.toggleDrawer;

function updateDom() {
  if (!dom.num) return;  // panel was suppressed via ?nopanel=1
  dom.num.textContent    = String(num);
  dom.speed.textContent  = `${speed.toFixed(1)}`;
  dom.radius.textContent = `${radius.toFixed(0)}`;
  dom.depth.textContent  = `${depth.toFixed(0)}`;
  dom.spin.textContent   = `${spin.toFixed(2)}`;
  dom.chase.textContent  = `${chase.toFixed(2)}`;
  dom.preset.textContent = presets[presetIdx].name;
  if (dom.approach) dom.approach.textContent = playApproach ? 'on' : 'off';

  for (let i = 0; i < dom.presetPills.children.length; i++) {
    dom.presetPills.children[i].classList.toggle('active', i === presetIdx);
  }
}

// --- keyboard ----------------------------------------------------------
window.addEventListener('keydown', (e) => {
  // Don't intercept if user is typing in an input (none yet, but defensive).
  if (e.target instanceof HTMLInputElement) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return; // let Cmd+R, Cmd+L, etc. through
  // Browser auto-repeats keydown when held. Allow that for adjust shortcuts
  // (arrows, brackets, , .) but suppress it for toggles, reset, and preset
  // selection — otherwise holding R rapid-fires resetOrbs and holding A
  // strobes approach on/off.
  const isAdjust = (
    e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
    e.key === 'ArrowUp'   || e.key === 'ArrowDown' ||
    e.key === '[' || e.key === ']' ||
    e.key === ',' || e.key === '.'
  );
  if (e.repeat && !isAdjust) return;
  if      (e.key === 'ArrowLeft')  adjustParam('speed', -1);
  else if (e.key === 'ArrowRight') adjustParam('speed', +1);
  else if (e.key === 'ArrowDown')  adjustParam('radius', -1);
  else if (e.key === 'ArrowUp')    adjustParam('radius', +1);
  else if (e.key === '[')          adjustParam('depth', -1);
  else if (e.key === ']')          adjustParam('depth', +1);
  else if (e.key === ',')          adjustParam('spin', -1);
  else if (e.key === '.')          adjustParam('spin', +1);
  else if (e.key === 'r' || e.key === 'R') resetOrbs();
  else if (e.key === 'c' || e.key === 'C') copyShareUrl();
  else if (e.key === 'a' || e.key === 'A') toggleApproach();
  else if (e.key === 'h' || e.key === 'H') toggleDrawer();
  else if (e.key >= '0' && e.key <= '9') {
    const i = (Number(e.key) + 9) % 10;  // 1..9,0 → 0..9 (keyboard layout order)
    if (i < presets.length) pickPreset(i);
    else return;
  }
  else return;
  e.preventDefault();
});

// --- init --------------------------------------------------------------
injectCss(BASE_CSS);
applyUrlParams();
if (sprites.length === 0) setNum(num);

// Pull keyboard focus into the document so shortcuts work without an
// initial canvas click. The browser may keep focus in the URL bar after a
// manual reload — we can't steal it (security feature), but pageshow and
// visibilitychange give us additional chances when conditions change.
document.body.tabIndex = -1;
const grabFocus = () => document.body.focus();
grabFocus();
window.addEventListener('pageshow', grabFocus);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  grabFocus();
  // Re-arm dt and kick the loop in case it stopped while hidden.
  last = performance.now();
  if (!ticking) { ticking = true; requestAnimationFrame(tick); }
});

// --- main loop ---------------------------------------------------------
let last = performance.now();
let ticking = true;
function tick(now) {
  // Pause cleanly while the tab is hidden — the visibilitychange handler
  // will re-arm `last` and re-kick RAF on return so dt doesn't spike.
  if (document.hidden) { ticking = false; return; }
  const dt = Math.min((now - last) / 1000, MAX_DT);
  last = now;

  // Spin lives on the cone of orbs, not the camera — so the spin is visible
  // from any camera angle (including the approach arc) and the star sprite's
  // cross spikes are naturally world-fixed without counter-rotation.
  cometRoll += spin * dt;
  const cosR = Math.cos(cometRoll);
  const sinR = Math.sin(cometRoll);

  for (let i = 0; i < num; i++) {
    const sprite = sprites[i];
    const s = state[i];
    sprite.position.z += s.speed * dt;
    // Cone factor: 0 at vertex (z=-depth) → 1 at camera plane (z=0).
    const cone = 1 + sprite.position.z / depth;
    const bx = s.baseX * cone;
    const by = s.baseY * cone;
    sprite.position.x = bx * cosR - by * sinR;
    sprite.position.y = bx * sinR + by * cosR;
    if (i === targetIdx && sprite.position.z > 0) targetIdx = -1;
    if (sprite.position.z > Z_NEAR) respawn(sprite, i);
  }

  if (approachActive) {
    // Approach: wide semicircular arc around the cone. Camera starts on the
    // spawn-point side of the cone (past the vertex at z=-depth), swings
    // around to the side, and ends at the origin (the normal chase position).
    //   θ=0    → (0, y, -2R)  — past the vertex (z = -2*depth)
    //   θ=π/2  → (R, y, -R)   — to the side (offset = depth, at vertex z-plane)
    //   θ=π    → (0, y,  0)   — at origin
    approachT += dt;
    const k = Math.min(approachT / APPROACH_DURATION, 1);
    const eased = k * k * (3 - 2 * k);  // smoothstep
    const theta = eased * Math.PI;
    const R = depth * 1.0;
    camera.position.set(
      R * Math.sin(theta),
      depth * 0.04 * (1 - eased),       // small vertical lift, decays to 0
      -R * (1 + Math.cos(theta)),
    );
    camera.lookAt(0, 0, -depth * 0.4);  // track the cone middle throughout
    if (k >= 1) {
      approachActive = false;
      camera.position.set(0, 0, 0);
    }
  } else {
    if (chase > 0) {
      let needPlan = false;
      if (targetIdx < 0) {
        targetIdx = pickTarget();
        if (targetIdx >= 0) needPlan = true;
      } else if (chase !== lastChase) {
        // Chase value moved — replan from current camera position so the
        // change takes effect now, not after the next handoff.
        needPlan = true;
      }
      if (needPlan && targetIdx >= 0) {
        // Plan a trapezoidal trajectory to a "trust point" between the
        // target's current rendered position and its predicted position
        // at end-of-life (when its z hits Z_NEAR).
        const tgt = state[targetIdx];
        const tgtSprite = sprites[targetIdx];
        const tDeath = Math.max(0.1, (Z_NEAR - tgtSprite.position.z) / tgt.speed);
        const futureRoll = cometRoll + spin * tDeath;
        const cosF = Math.cos(futureRoll);
        const sinF = Math.sin(futureRoll);
        const tx = tgt.baseX * cosR - tgt.baseY * sinR;
        const ty = tgt.baseX * sinR + tgt.baseY * cosR;
        const deathX = tgt.baseX * cosF - tgt.baseY * sinF;
        const deathY = tgt.baseX * sinF + tgt.baseY * cosF;

        planStartX = camera.position.x;
        planStartY = camera.position.y;
        planStartT = now / 1000;
        planAimX = tx + (deathX - tx) * chase;
        planAimY = ty + (deathY - ty) * chase;
        planDuration = tDeath;
        lastChase = chase;
      }
      if (targetIdx >= 0) {
        const tPlan = ((now / 1000) - planStartT) / Math.max(0.001, planDuration);
        const eased = trapezoidEase(tPlan, CHASE_RAMP);
        camera.position.x = planStartX + (planAimX - planStartX) * eased;
        camera.position.y = planStartY + (planAimY - planStartY) * eased;
      }
    } else {
      // Chase off — clear star, decay camera back toward origin.
      if (targetIdx >= 0) {
        sprites[targetIdx].material.map = blobTex;
        targetIdx = -1;
      }
      const decay = Math.exp(-CAM_RECENTER_RATE * dt);
      camera.position.x *= decay;
      camera.position.y *= decay;
    }
  }

  renderer.render(scene, camera);
  updateDom();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
