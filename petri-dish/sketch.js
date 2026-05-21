// SPDX-License-Identifier: CC-BY-NC-SA-4.0
/*
Petri Dish — interactive Physarum playground

Forked by chrismo, co-authored with Claude (Anthropic).

Forked from Patt Vira's "Slime Molds (Physarum)" tutorial:
  Original sketch: https://openprocessing.org/sketch/2213463
  Video tutorial:  https://youtu.be/VyXxSNcgDtg

Algorithm: Jeff Jones (2010), "Characteristics of Pattern Formation and
Evolution in Approximations of Physarum Transport Networks"
  https://uwe-repository.worktribe.com/output/980579

Adds: keyboard + tap controls, 10 named presets, perlin auto-drift mode,
preset-cycle lerp, mold reset, "commit"-based brightness shading.
*/

let molds = [];
let num = 4000;
let d;

let rotAngle = 45;
let sensorAngle = 45;
let sensorDist = 10;
let moldSpeed = 1;
let bgFade = 5;

const angleStep = 5;
const distStep = 1;
const speedStep = 0.5;
const fadeStep = 1;
const lerpDurationStep = 60; // 1s @ 60fps
const driftSpeedStep = 0.001;

// --- presets ---------------------------------------------------------------
// 0-9 each snapshot the full live config. Tuned to span the regimes
// discovered while playing: thin parallel highways, tight cells, sweeping
// long-range networks, the chaotic-but-organized "tipping point" at 2px, etc.
const presets = [
  { name: 'Slime',         rotAngle: 45, sensorAngle: 45, sensorDist: 10, moldSpeed: 1.0, bgFade:  5 },
  { name: 'Cobweb',        rotAngle: 20, sensorAngle: 20, sensorDist: 20, moldSpeed: 1.0, bgFade:  5 },
  { name: 'Honeycomb',     rotAngle: 60, sensorAngle: 60, sensorDist:  8, moldSpeed: 1.0, bgFade:  5 },
  { name: 'Highways',      rotAngle: 30, sensorAngle: 30, sensorDist: 30, moldSpeed: 2.0, bgFade:  5 },
  { name: 'Plasma',        rotAngle: 85, sensorAngle: 85, sensorDist: 15, moldSpeed: 2.5, bgFade:  8 },
  { name: 'Dendrite',      rotAngle: 80, sensorAngle: 35, sensorDist: 18, moldSpeed: 1.0, bgFade:  1 },
  { name: 'Tube',          rotAngle: 12, sensorAngle: 95, sensorDist: 60, moldSpeed: 2.0, bgFade:  2 },
  { name: 'Ooze',          rotAngle: 70, sensorAngle: 40, sensorDist:  6, moldSpeed: 0.5, bgFade:  2 },
  { name: 'Vermicelli',    rotAngle: 45, sensorAngle: 45, sensorDist:  2, moldSpeed: 1.0, bgFade:  5 },
  { name: 'Burlap',        rotAngle:  5, sensorAngle:  5, sensorDist:  4, moldSpeed: 0.6, bgFade:  1 },
];
let presetIdx = 0;

// --- drift (perlin auto-morph) --------------------------------------------
let drift = false;
let driftT = 0;
let driftSpeed = 0.003;
const driftRanges = {
  rotAngle:    { min: 5,   max: 90, offset: 0   },
  sensorAngle: { min: 5,   max: 90, offset: 100 },
  sensorDist:  { min: 2,   max: 30, offset: 200 },
  moldSpeed:   { min: 0.5, max: 3,  offset: 300 },
  bgFade:      { min: 1,   max: 15, offset: 400 },
};
// Per-param bias added on top of drift output. Set when a preset is pressed
// while drift is on, then decays toward 0 so drift returns to its natural
// sweep. ~5s to fade at 60fps with decay 0.99.
const driftBias = { rotAngle: 0, sensorAngle: 0, sensorDist: 0, moldSpeed: 0, bgFade: 0 };
const driftBiasDecay = 0.99;

// --- lerp (cycle through presets) -----------------------------------------
let lerpMode = false;
let lerpFrom = 0;
let lerpTo = 1;
let lerpT = 0;
let lerpDuration = 480; // frames per transition (~8s @ 60fps)

// --- DOM panel handles ----------------------------------------------------
// The control panel is injected from JS so the same sketch.js works locally
// and on OpenProcessing (where only the JS gets pasted) — single source of
// truth for the panel HTML/CSS. buildPanel() is a no-op if a #drawer is
// already in the DOM.
const dom = {};

// Base host CSS — always injected, even with ?nopanel=1, so the body
// isn't a flash of white before the canvas paints its first frame.
const BASE_CSS = `
  html, body { margin: 0; padding: 0; overflow: hidden; background: #111; }
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
  .preset-pills .pill.target { background: rgba(156, 204, 255, 0.45); color: #fff; }

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
`;

function paramRow(label, param, hint) {
  return `<div class="row"><span class="label">${label}</span>` +
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
      <h1>Petri Dish <small>Physarum</small></h1>

      <h2>state</h2>
      ${paramRow('rotAngle',    'rotAngle',    '← →')}
      ${paramRow('sensorAngle', 'sensorAngle', '↓ ↑')}
      ${paramRow('sensorDist',  'sensorDist',  '[ ]')}
      ${paramRow('moldSpeed',   'moldSpeed',   '- =')}
      ${paramRow('bgFade',      'bgFade',      ', .')}

      <h2>mode</h2>
      <div class="row wide"><span class="label">mode</span><span id="v-mode" class="val accent"></span></div>
      <div class="row wide"><span class="label">preset</span><span id="v-preset" class="val accent"></span></div>
      <div id="v-preset-pills" class="preset-pills"></div>

      <h2>timing</h2>
      ${paramRow('lerpDuration', 'lerpDuration', '')}
      ${paramRow('driftSpeed',   'driftSpeed',   '')}

      <h2>actions</h2>
      <div class="legend">
        <button class="kbd kbd-action" data-action="drift">D</button><div class="kbd-desc">drift (perlin)</div>
        <button class="kbd kbd-action" data-action="lerp">L</button><div class="kbd-desc">lerp (preset cycle)</div>
        <button class="kbd kbd-action" data-action="reset">R</button><div class="kbd-desc">reset molds</div>
        <button class="kbd kbd-action" data-action="copy">C</button><div class="kbd-desc" id="copy-desc">copy screensaver URL</div>
        <button class="kbd kbd-action" data-action="fullscreen">F</button><div class="kbd-desc">fullscreen</div>
        <button class="kbd kbd-action" data-action="hide">H</button><div class="kbd-desc">hide / show panel</div>
      </div>
    </div>
  </div>
`;

function injectCss(css) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

function buildPanel() {
  if (document.getElementById('drawer')) return;
  injectCss(PANEL_CSS);
  // PANEL_HTML is a static template literal with no user input — DOMParser
  // is the script-safe path for materializing it into DOM nodes.
  const parsed = new DOMParser().parseFromString(PANEL_HTML, 'text/html');
  document.body.appendChild(parsed.body.firstElementChild);
}

function setup() {
  injectCss(BASE_CSS);

  // num affects mold-creation count, so it has to be read before the loop.
  // Everything else gets applied after mold setup.
  const params = new URLSearchParams(location.search);
  const numOverride = parseFloat(params.get('num'));
  if (Number.isFinite(numOverride) && numOverride > 0) {
    num = Math.max(1, Math.floor(numOverride));
  }

  createCanvas(windowWidth, windowHeight);
  angleMode(DEGREES);
  colorMode(HSB, 360, 100, 100, 255);
  background(0); // start fully opaque black so the per-frame low-alpha
                 // background(0, bgFade) doesn't fade up from a transparent canvas
  d = pixelDensity();

  for (let i = 0; i < num; i++) {
    molds[i] = new Mold();
  }
  describe(
    'This sketch simulates behaviors of slime molds. Each slime mold object has position (x and y), traveling direction (r and heading angle) and sensor (in 3 directions: front, left, and forward). As a slime mold moves through the trail, it leaves a trace and the trail map is updated. In each simulation step, a slime mold senses the trail map (the pixel color value) and decides which direction to move and rotate.',
    LABEL
  );

  applyUrlParams(params);
}

// URL params for screensaver / shareable-link autoplay. Applied in order:
// preset → numeric overrides → mode → panel.
//
// Mode + panel:
//   ?preset=N      apply preset N (0-9) before overrides and mode
//   ?lerp=1        start in lerp mode (preset cycle)
//   ?drift=1       start in drift mode (perlin auto-morph)
//   ?nopanel=1     skip the control drawer entirely
//
// Runtime overrides (override the preset's values):
//   ?rotAngle=N    rotation step (deg)
//   ?sensorAngle=N sensor splay (deg)
//   ?sensorDist=N  sensor reach (px)
//   ?moldSpeed=N   per-frame movement
//   ?bgFade=N      per-frame trail fade alpha (1-255)
//
// Speed knobs (apply regardless of mode):
//   ?num=N           mold count (default 4000) — applied in setup() above
//   ?lerpDuration=N  frames per lerp transition (default 480)
//   ?driftSpeed=N    perlin step per frame (default 0.003)
//
// lerp wins over drift if both passed. Runtime overrides only stick in
// manual mode — drift and lerp continuously rewrite the same vars in draw().
function applyUrlParams(params) {
  const presetParam = params.get('preset');
  if (presetParam !== null) {
    const i = Number(presetParam);
    if (Number.isInteger(i) && i >= 0 && i < presets.length) applyPreset(i);
  }

  const setNum = (key, setter) => {
    const v = parseFloat(params.get(key));
    if (Number.isFinite(v)) setter(v);
  };
  setNum('rotAngle',     (v) => { rotAngle = v; });
  setNum('sensorAngle',  (v) => { sensorAngle = v; });
  setNum('sensorDist',   (v) => { sensorDist = v; });
  setNum('moldSpeed',    (v) => { moldSpeed = v; });
  setNum('bgFade',       (v) => { bgFade = v; });
  setNum('lerpDuration', (v) => { lerpDuration = v; });
  setNum('driftSpeed',   (v) => { driftSpeed = v; });

  if (params.get('lerp') === '1') {
    lerpMode = true;
    lerpFrom = presetIdx;
    lerpTo = (presetIdx + 1) % presets.length;
    lerpT = 0;
  } else if (params.get('drift') === '1') {
    drift = true;
  }

  if (params.get('nopanel') !== '1') {
    buildPanel();
    setupDom();
  }
}

function draw() {
  if (drift) {
    driftT += driftSpeed;
    rotAngle    = driftValue('rotAngle')    + driftBias.rotAngle;
    sensorAngle = driftValue('sensorAngle') + driftBias.sensorAngle;
    sensorDist  = driftValue('sensorDist')  + driftBias.sensorDist;
    moldSpeed   = driftValue('moldSpeed')   + driftBias.moldSpeed;
    bgFade      = driftValue('bgFade')      + driftBias.bgFade;
    for (const k in driftBias) driftBias[k] *= driftBiasDecay;
  } else if (lerpMode) {
    lerpT += 1 / lerpDuration;
    if (lerpT >= 1) {
      lerpT = 0;
      lerpFrom = lerpTo;
      lerpTo = (lerpTo + 1) % presets.length;
      presetIdx = lerpFrom;
    }
    applyLerp(presets[lerpFrom], presets[lerpTo], lerpT);
  }

  background(0, bgFade);
  loadPixels();

  for (let i = 0; i < num; i++) {
    molds[i].update();
    molds[i].display();
  }

  updateDom();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function driftValue(param) {
  const r = driftRanges[param];
  return map(noise(driftT + r.offset), 0, 1, r.min, r.max);
}

function applyPreset(i) {
  const p = presets[i];
  if (drift) {
    // Snap by setting bias = preset - current drift output. Bias decays
    // each frame in draw(), so values drift back to natural orbit.
    driftBias.rotAngle    = p.rotAngle    - driftValue('rotAngle');
    driftBias.sensorAngle = p.sensorAngle - driftValue('sensorAngle');
    driftBias.sensorDist  = p.sensorDist  - driftValue('sensorDist');
    driftBias.moldSpeed   = p.moldSpeed   - driftValue('moldSpeed');
    driftBias.bgFade      = p.bgFade      - driftValue('bgFade');
  } else {
    rotAngle    = p.rotAngle;
    sensorAngle = p.sensorAngle;
    sensorDist  = p.sensorDist;
    moldSpeed   = p.moldSpeed;
    bgFade      = p.bgFade;
  }
  presetIdx = i;
}

function applyLerp(a, b, t) {
  const ease = t * t * (3 - 2 * t); // smoothstep
  rotAngle    = lerp(a.rotAngle,    b.rotAngle,    ease);
  sensorAngle = lerp(a.sensorAngle, b.sensorAngle, ease);
  sensorDist  = lerp(a.sensorDist,  b.sensorDist,  ease);
  moldSpeed   = lerp(a.moldSpeed,   b.moldSpeed,   ease);
  bgFade      = lerp(a.bgFade,      b.bgFade,      ease);
}

// --- action handlers (shared by keyboard and tap UI) ----------------------
function adjustParam(name, dir) {
  if (name === 'rotAngle')         rotAngle    += dir * angleStep;
  else if (name === 'sensorAngle') sensorAngle += dir * angleStep;
  else if (name === 'sensorDist')  sensorDist   = dir < 0 ? max(1, sensorDist - distStep) : sensorDist + distStep;
  else if (name === 'moldSpeed')   moldSpeed    = dir < 0
    ? max(0.1, moldSpeed - speedStep)
    : (moldSpeed < speedStep ? speedStep : moldSpeed + speedStep); // snap to grid from 0.1 floor
  else if (name === 'bgFade')      bgFade       = dir < 0 ? max(1, bgFade - fadeStep) : bgFade + fadeStep;
  else if (name === 'lerpDuration') lerpDuration = dir < 0 ? max(60, lerpDuration - lerpDurationStep) : lerpDuration + lerpDurationStep;
  else if (name === 'driftSpeed')   driftSpeed   = dir < 0 ? max(0.0005, driftSpeed - driftSpeedStep) : driftSpeed + driftSpeedStep;
  toastParam(name);
}

function toastParam(name) {
  let msg;
  if      (name === 'rotAngle')     msg = `rotAngle ${nf(rotAngle, 1, 1)}°`;
  else if (name === 'sensorAngle')  msg = `sensorAngle ${nf(sensorAngle, 1, 1)}°`;
  else if (name === 'sensorDist')   msg = `sensorDist ${nf(sensorDist, 1, 1)}px`;
  else if (name === 'moldSpeed')    msg = `moldSpeed ${nf(moldSpeed, 1, 2)}×`;
  else if (name === 'bgFade')       msg = `bgFade ${nf(bgFade, 1, 1)}`;
  else if (name === 'lerpDuration') msg = `lerpDuration ${nf(lerpDuration / 60, 1, 1)}s`;
  else if (name === 'driftSpeed')   msg = `driftSpeed ${nf(driftSpeed, 1, 4)}`;
  else return;
  window.flashToast?.(msg);
}

function toggleDrift() {
  drift = !drift;
  if (drift) lerpMode = false;
  window.flashToast?.(`drift ${drift ? 'on' : 'off'}`);
}

function toggleLerp() {
  lerpMode = !lerpMode;
  if (lerpMode) {
    drift = false;
    lerpFrom = presetIdx;
    lerpTo = (presetIdx + 1) % presets.length;
    lerpT = 0;
  }
  window.flashToast?.(`lerp ${lerpMode ? 'on' : 'off'}`);
}

function resetMolds() {
  for (let i = 0; i < num; i++) molds[i] = new Mold();
  background(0);
  window.flashToast?.('reset');
}

function pickPreset(i) {
  applyPreset(i);
  if (lerpMode) {
    lerpFrom = i;
    lerpTo = (i + 1) % presets.length;
    lerpT = 0;
  }
  window.flashToast?.(`preset ${(i + 1) % 10}: ${presets[i].name}`);
}

// Build a screensaver-friendly URL that reproduces the current panel state
// and copy it to the clipboard. Only emits params that differ from preset
// defaults — keeps the URL readable.
function copyShareUrl() {
  if (!navigator.clipboard) return;

  const close = (a, b) => Math.abs(a - b) < 1e-6;
  // Round through toFixed → Number to drop FP noise and trailing zeros.
  const fmt = (n, d) => Number(n.toFixed(d)).toString();

  const params = new URLSearchParams();
  params.set('nopanel', '1');
  params.set('preset', String(presetIdx));

  if (lerpMode) {
    params.set('lerp', '1');
  } else if (drift) {
    params.set('drift', '1');
  } else {
    // Manual mode — emit any of the 5 runtime vars that differ from the
    // preset's value. In drift/lerp those vars get rewritten every frame,
    // so a snapshot would be misleading.
    const p = presets[presetIdx];
    if (!close(rotAngle,    p.rotAngle))    params.set('rotAngle',    fmt(rotAngle, 2));
    if (!close(sensorAngle, p.sensorAngle)) params.set('sensorAngle', fmt(sensorAngle, 2));
    if (!close(sensorDist,  p.sensorDist))  params.set('sensorDist',  fmt(sensorDist, 2));
    if (!close(moldSpeed,   p.moldSpeed))   params.set('moldSpeed',   fmt(moldSpeed, 3));
    if (!close(bgFade,      p.bgFade))      params.set('bgFade',      fmt(bgFade, 1));
  }

  // Speed knobs / mold count apply regardless of mode.
  if (!close(lerpDuration, 480))   params.set('lerpDuration', fmt(lerpDuration, 0));
  if (!close(driftSpeed,   0.003)) params.set('driftSpeed',   fmt(driftSpeed, 5));
  if (num !== 4000)                params.set('num',          String(num));

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

// Native keydown rather than p5's keyPressed so the browser's built-in
// key-repeat fires on held keys for the adjust shortcuts. Non-adjust keys
// (toggles, reset, preset) are gated on e.repeat so holding R doesn't
// reset 30×/sec.
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const isAdjust = (
    e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
    e.key === 'ArrowUp'   || e.key === 'ArrowDown' ||
    e.key === '[' || e.key === ']' ||
    e.key === '-' || e.key === '=' ||
    e.key === ',' || e.key === '.'
  );
  if (e.repeat && !isAdjust) return;
  if      (e.key === 'ArrowLeft')  adjustParam('rotAngle', -1);
  else if (e.key === 'ArrowRight') adjustParam('rotAngle', +1);
  else if (e.key === 'ArrowUp')    adjustParam('sensorAngle', +1);
  else if (e.key === 'ArrowDown')  adjustParam('sensorAngle', -1);
  else if (e.key === '[')          adjustParam('sensorDist', -1);
  else if (e.key === ']')          adjustParam('sensorDist', +1);
  else if (e.key === '-')          adjustParam('moldSpeed', -1);
  else if (e.key === '=')          adjustParam('moldSpeed', +1);
  else if (e.key === ',')          adjustParam('bgFade', -1);
  else if (e.key === '.')          adjustParam('bgFade', +1);
  else if (e.key === 'd' || e.key === 'D') toggleDrift();
  else if (e.key === 'l' || e.key === 'L') toggleLerp();
  else if (e.key === 'r' || e.key === 'R') resetMolds();
  else if (e.key === 'c' || e.key === 'C') copyShareUrl();
  else if (e.key === 'h' || e.key === 'H') toggleDrawer();
  else if (e.key >= '0' && e.key <= '9') pickPreset((Number(e.key) + 9) % 10);
  else return;
  e.preventDefault();
});

// --- DOM panel ------------------------------------------------------------
function setupDom() {
  dom.rotAngle     = document.getElementById('v-rotAngle');
  dom.sensorAngle  = document.getElementById('v-sensorAngle');
  dom.sensorDist   = document.getElementById('v-sensorDist');
  dom.moldSpeed    = document.getElementById('v-moldSpeed');
  dom.bgFade       = document.getElementById('v-bgFade');
  dom.lerpDuration = document.getElementById('v-lerpDuration');
  dom.driftSpeed   = document.getElementById('v-driftSpeed');
  dom.mode         = document.getElementById('v-mode');
  dom.preset       = document.getElementById('v-preset');
  dom.presetPills  = document.getElementById('v-preset-pills');

  for (let i = 0; i < presets.length; i++) {
    const pill = document.createElement('button');
    pill.className = 'pill';
    pill.textContent = (i + 1) % 10;
    pill.addEventListener('click', () => { pickPreset(i); pill.blur(); });
    dom.presetPills.appendChild(pill);
  }

  const toggle = document.getElementById('drawer-toggle');
  toggle.addEventListener('click', () => {
    toggleDrawer();
    toggle.blur();
  });

  // Delegated click dispatch for tap UI: every actionable control carries
  // data-action. Keeps the JS in one place and keeps the keyboard +
  // tap paths sharing the same handlers.
  const drawerContent = document.getElementById('drawer-content');
  drawerContent.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if      (a === 'drift')      toggleDrift();
    else if (a === 'lerp')       toggleLerp();
    else if (a === 'reset')      resetMolds();
    else if (a === 'copy')       copyShareUrl();
    else if (a === 'fullscreen') window.toggleFullscreen?.();
    else if (a === 'hide')       toggleDrawer();
    else return;
    el.blur();
  });

  // Hold an adjust button to auto-repeat — mirrors browser key-repeat on
  // held arrow/bracket keys. Fires once on pointerdown, then after a 350ms
  // delay starts ticking every 60ms.
  let holdDelay, holdInterval;
  function stopHold() { clearTimeout(holdDelay); clearInterval(holdInterval); }
  drawerContent.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-action="adjust"]');
    if (!el) return;
    e.preventDefault();
    const param = el.dataset.param;
    const dir = Number(el.dataset.dir);
    adjustParam(param, dir);
    el.setPointerCapture?.(e.pointerId);
    holdDelay = setTimeout(() => {
      holdInterval = setInterval(() => adjustParam(param, dir), 60);
    }, 350);
  });
  drawerContent.addEventListener('pointerup', stopHold);
  drawerContent.addEventListener('pointercancel', stopHold);
}

function toggleDrawer() {
  const drawer = document.getElementById('drawer');
  if (drawer) drawer.classList.toggle('open');
}

function updateDom() {
  if (!dom.rotAngle) return; // panel was suppressed via ?nopanel=1
  dom.rotAngle.textContent     = `${nf(rotAngle, 1, 1)}°`;
  dom.sensorAngle.textContent  = `${nf(sensorAngle, 1, 1)}°`;
  dom.sensorDist.textContent   = `${nf(sensorDist, 1, 1)}px`;
  dom.moldSpeed.textContent    = `${nf(moldSpeed, 1, 2)}×`;
  dom.bgFade.textContent       = nf(bgFade, 1, 1);
  dom.lerpDuration.textContent = `${nf(lerpDuration / 60, 1, 1)}s`;
  dom.driftSpeed.textContent   = nf(driftSpeed, 1, 4);

  let modeStr = 'manual';
  if (drift) modeStr = 'drift (perlin)';
  else if (lerpMode) modeStr = `lerp ${nf(lerpT * 100, 1, 0)}%`;
  dom.mode.textContent = modeStr;

  dom.preset.textContent = lerpMode
    ? `${presets[lerpFrom].name} → ${presets[lerpTo].name}`
    : presets[presetIdx].name;

  const activeIdx = lerpMode ? lerpFrom : presetIdx;
  const targetIdx = lerpMode ? lerpTo : -1;
  for (let i = 0; i < dom.presetPills.children.length; i++) {
    const p = dom.presetPills.children[i];
    p.classList.toggle('active', i === activeIdx);
    p.classList.toggle('target', i === targetIdx);
  }
}

// --- Mold class -----------------------------------------------------------
// Brightness "commit" model: each mold tracks a smoothed [0..1] indicator
// of whether it's currently committing to its heading (going straight) or
// turning to chase a brighter trail. Brightness on the trail map maps from
// this — committed runs draw bright, turning molds draw dim.
//
// IMPORTANT: this isn't purely cosmetic. The trail map is what sensors read
// the next frame, so dim trails in turning zones make those zones less
// attractive to other molds, adding positive feedback toward established
// flow channels. Patterns become more channelized than the unweighted
// (constant-brightness) version.
const COMMIT_SMOOTH = 0.08;     // EMA pull-rate per frame; ~8-frame half-life
const BRIGHTNESS_MIN = 30;      // brightness when fully turning
const BRIGHTNESS_MAX = 100;     // brightness when fully committed

class Mold {
  constructor() {
    this.x = random(width / 2 - 20, width / 2 + 20);
    this.y = random(height / 2 - 20, height / 2 + 20);
    this.r = 0.5;

    this.heading = random(360);
    this.vx = cos(this.heading);
    this.vy = sin(this.heading);

    this.rSensorPos = createVector(0, 0);
    this.lSensorPos = createVector(0, 0);
    this.fSensorPos = createVector(0, 0);

    this.commit = 1;
  }

  update() {
    this.vx = cos(this.heading);
    this.vy = sin(this.heading);

    this.x = (this.x + this.vx * moldSpeed + width) % width;
    this.y = (this.y + this.vy * moldSpeed + height) % height;

    this.getSensorPos(this.rSensorPos, this.heading + sensorAngle);
    this.getSensorPos(this.lSensorPos, this.heading - sensorAngle);
    this.getSensorPos(this.fSensorPos, this.heading);

    let index, l, r, f;
    index = 4 * (d * floor(this.rSensorPos.y)) * (d * width) + 4 * (d * floor(this.rSensorPos.x));
    r = pixels[index] + pixels[index + 1] + pixels[index + 2];

    index = 4 * (d * floor(this.lSensorPos.y)) * (d * width) + 4 * (d * floor(this.lSensorPos.x));
    l = pixels[index] + pixels[index + 1] + pixels[index + 2];

    index = 4 * (d * floor(this.fSensorPos.y)) * (d * width) + 4 * (d * floor(this.fSensorPos.x));
    f = pixels[index] + pixels[index + 1] + pixels[index + 2];

    let turning = true;
    if (f > l && f > r) {
      this.heading += 0;
      turning = false;
    } else if (f < l && f < r) {
      if (random(1) < 0.5) {
        this.heading += rotAngle;
      } else {
        this.heading -= rotAngle;
      }
    } else if (l > r) {
      this.heading += -rotAngle;
    } else if (r > l) {
      this.heading += rotAngle;
    }
    this.updateCommit(turning);
  }

  display() {
    noStroke();
    fill(0, 0, this.brightness());
    ellipse(this.x, this.y, this.r * 2, this.r * 2);
  }

  updateCommit(turning) {
    const target = turning ? 0 : 1;
    this.commit = this.commit * (1 - COMMIT_SMOOTH) + target * COMMIT_SMOOTH;
  }

  brightness() {
    return BRIGHTNESS_MIN + this.commit * (BRIGHTNESS_MAX - BRIGHTNESS_MIN);
  }

  getSensorPos(sensor, angle) {
    sensor.x = (this.x + sensorDist * cos(angle) + width) % width;
    sensor.y = (this.y + sensorDist * sin(angle) + height) % height;
  }
}

// Pause the draw loop while the tab is hidden. Browsers already throttle RAF
// when hidden, but stopping outright also halts the GPU work and lets the
// pattern resume from exactly where it was on return.
document.addEventListener('visibilitychange', () => {
  if (typeof noLoop !== 'function') return;
  if (document.hidden) noLoop();
  else loop();
});
