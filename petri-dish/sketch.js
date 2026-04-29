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
const driftSpeed = 0.003;
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
const lerpDuration = 480; // frames per transition (~8s @ 60fps)

// --- DOM panel handles ----------------------------------------------------
// The control panel is injected from JS so the same sketch.js works locally
// and on OpenProcessing (where only the JS gets pasted) — single source of
// truth for the panel HTML/CSS. buildPanel() is a no-op if a #drawer is
// already in the DOM.
const dom = {};

const PANEL_CSS = `
  html, body { margin: 0; padding: 0; overflow: hidden; background: #111; }
  canvas { display: block; }

  #drawer {
    position: fixed; top: 0; left: 0; height: 100vh; width: 280px;
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
  }
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
  .row .keys { justify-self: center; display: flex; flex-direction: row; align-items: center; gap: 6px; }
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

      <h2>actions</h2>
      <div class="legend">
        <button class="kbd kbd-action" data-action="drift" title="D">D</button><div class="kbd-desc">drift (perlin)</div>
        <button class="kbd kbd-action" data-action="lerp"  title="L">L</button><div class="kbd-desc">lerp (preset cycle)</div>
        <button class="kbd kbd-action" data-action="reset" title="R">R</button><div class="kbd-desc">reset molds</div>
        <button class="kbd kbd-action" data-action="hide"  title="H">H</button><div class="kbd-desc">hide / show panel</div>
      </div>
    </div>
  </div>
`;

function buildPanel() {
  if (document.getElementById('drawer')) return;
  const style = document.createElement('style');
  style.textContent = PANEL_CSS;
  document.head.appendChild(style);
  // PANEL_HTML is a static template literal with no user input — DOMParser
  // is the script-safe path for materializing it into DOM nodes.
  const parsed = new DOMParser().parseFromString(PANEL_HTML, 'text/html');
  document.body.appendChild(parsed.body.firstElementChild);
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  angleMode(DEGREES);
  colorMode(HSB, 360, 100, 100, 255);
  d = pixelDensity();

  for (let i = 0; i < num; i++) {
    molds[i] = new Mold();
  }
  describe(
    'This sketch simulates behaviors of slime molds. Each slime mold object has position (x and y), traveling direction (r and heading angle) and sensor (in 3 directions: front, left, and forward). As a slime mold moves through the trail, it leaves a trace and the trail map is updated. In each simulation step, a slime mold senses the trail map (the pixel color value) and decides which direction to move and rotate.',
    LABEL
  );

  buildPanel();
  setupDom();
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
}

function toggleDrift() {
  drift = !drift;
  if (drift) lerpMode = false;
}

function toggleLerp() {
  lerpMode = !lerpMode;
  if (lerpMode) {
    drift = false;
    lerpFrom = presetIdx;
    lerpTo = (presetIdx + 1) % presets.length;
    lerpT = 0;
  }
}

function resetMolds() {
  for (let i = 0; i < num; i++) molds[i] = new Mold();
  background(0);
}

function pickPreset(i) {
  applyPreset(i);
  if (lerpMode) {
    lerpFrom = i;
    lerpTo = (i + 1) % presets.length;
    lerpT = 0;
  }
}

function keyPressed() {
  if      (keyCode === LEFT_ARROW)  adjustParam('rotAngle', -1);
  else if (keyCode === RIGHT_ARROW) adjustParam('rotAngle', +1);
  else if (keyCode === UP_ARROW)    adjustParam('sensorAngle', +1);
  else if (keyCode === DOWN_ARROW)  adjustParam('sensorAngle', -1);
  else if (key === '[')             adjustParam('sensorDist', -1);
  else if (key === ']')             adjustParam('sensorDist', +1);
  else if (key === '-')             adjustParam('moldSpeed', -1);
  else if (key === '=')             adjustParam('moldSpeed', +1);
  else if (key === ',')             adjustParam('bgFade', -1);
  else if (key === '.')             adjustParam('bgFade', +1);
  else if (key === 'd' || key === 'D') toggleDrift();
  else if (key === 'l' || key === 'L') toggleLerp();
  else if (key === 'r' || key === 'R') resetMolds();
  else if (key === 'h' || key === 'H') toggleDrawer();
  else if (key >= '0' && key <= '9')   pickPreset(Number(key));
  else return;
  return false;
}

// --- DOM panel ------------------------------------------------------------
function setupDom() {
  dom.rotAngle    = document.getElementById('v-rotAngle');
  dom.sensorAngle = document.getElementById('v-sensorAngle');
  dom.sensorDist  = document.getElementById('v-sensorDist');
  dom.moldSpeed   = document.getElementById('v-moldSpeed');
  dom.bgFade      = document.getElementById('v-bgFade');
  dom.mode        = document.getElementById('v-mode');
  dom.preset      = document.getElementById('v-preset');
  dom.presetPills = document.getElementById('v-preset-pills');

  for (let i = 0; i < presets.length; i++) {
    const pill = document.createElement('button');
    pill.className = 'pill';
    pill.textContent = i;
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
  document.getElementById('drawer-content').addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a === 'adjust') adjustParam(el.dataset.param, Number(el.dataset.dir));
    else if (a === 'drift') toggleDrift();
    else if (a === 'lerp')  toggleLerp();
    else if (a === 'reset') resetMolds();
    else if (a === 'hide')  toggleDrawer();
    el.blur();
  });
}

function toggleDrawer() {
  document.getElementById('drawer').classList.toggle('open');
}

function updateDom() {
  dom.rotAngle.textContent    = `${nf(rotAngle, 1, 1)}°`;
  dom.sensorAngle.textContent = `${nf(sensorAngle, 1, 1)}°`;
  dom.sensorDist.textContent  = `${nf(sensorDist, 1, 1)}px`;
  dom.moldSpeed.textContent   = `${nf(moldSpeed, 1, 2)}×`;
  dom.bgFade.textContent      = nf(bgFade, 1, 1);

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
