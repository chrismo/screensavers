/*
----- Coding Tutorial by Patt Vira -----
Name: Slime Molds (Physarum)
Video Tutorial: https://youtu.be/VyXxSNcgDtg

References:
1. Algorithm by Jeff Jones: https://uwe-repository.worktribe.com/output/980579/characteristics-of-pattern-formation-and-evolution-in-approximations-of-physarum-transport-networks

Original sketch: https://openprocessing.org/sketch/2924168
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
};
// Per-param bias added on top of drift output. Set when a preset is pressed
// while drift is on, then decays toward 0 so drift returns to its natural
// sweep. ~5s to fade at 60fps with decay 0.99.
const driftBias = { rotAngle: 0, sensorAngle: 0, sensorDist: 0, moldSpeed: 0 };
const driftBiasDecay = 0.99;

// --- lerp (cycle through presets) -----------------------------------------
let lerpMode = false;
let lerpFrom = 0;
let lerpTo = 1;
let lerpT = 0;
const lerpDuration = 480; // frames per transition (~8s @ 60fps)

// --- DOM panel handles ----------------------------------------------------
const dom = {};

function setup() {
  createCanvas(windowWidth, windowHeight);
  angleMode(DEGREES);
  d = pixelDensity();

  for (let i = 0; i < num; i++) {
    molds[i] = new Mold();
  }
  describe(
    'This sketch simulates behaviors of slime molds. Each slime mold object has position (x and y), traveling direction (r and heading angle) and sensor (in 3 directions: front, left, and forward). As a slime mold moves through the trail, it leaves a trace and the trail map is updated. In each simulation step, a slime mold senses the trail map (the pixel color value) and decides which direction to move and rotate.',
    LABEL
  );

  setupDom();
}

function draw() {
  if (drift) {
    driftT += driftSpeed;
    rotAngle    = driftValue('rotAngle')    + driftBias.rotAngle;
    sensorAngle = driftValue('sensorAngle') + driftBias.sensorAngle;
    sensorDist  = driftValue('sensorDist')  + driftBias.sensorDist;
    moldSpeed   = driftValue('moldSpeed')   + driftBias.moldSpeed;
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
    bgFade = p.bgFade;
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

function keyPressed() {
  if (keyCode === LEFT_ARROW) {
    rotAngle -= angleStep;
  } else if (keyCode === RIGHT_ARROW) {
    rotAngle += angleStep;
  } else if (keyCode === UP_ARROW) {
    sensorAngle += angleStep;
  } else if (keyCode === DOWN_ARROW) {
    sensorAngle -= angleStep;
  } else if (key === '[') {
    sensorDist = max(1, sensorDist - distStep);
  } else if (key === ']') {
    sensorDist += distStep;
  } else if (key === '-') {
    moldSpeed = max(0.1, moldSpeed - speedStep);
  } else if (key === '=') {
    // Snap back to grid when bumping up from the sub-step floor (0.1).
    moldSpeed = moldSpeed < speedStep ? speedStep : moldSpeed + speedStep;
  } else if (key === ',') {
    bgFade = max(1, bgFade - fadeStep);
  } else if (key === '.') {
    bgFade += fadeStep;
  } else if (key === 'd' || key === 'D') {
    drift = !drift;
    if (drift) lerpMode = false;
  } else if (key === 'l' || key === 'L') {
    lerpMode = !lerpMode;
    if (lerpMode) {
      drift = false;
      lerpFrom = presetIdx;
      lerpTo = (presetIdx + 1) % presets.length;
      lerpT = 0;
    }
  } else if (key === 'r' || key === 'R') {
    for (let i = 0; i < num; i++) molds[i] = new Mold();
    background(0);
  } else if (key === 'h' || key === 'H') {
    toggleDrawer();
  } else if (key >= '0' && key <= '9') {
    const i = Number(key);
    applyPreset(i);
    if (lerpMode) {
      lerpFrom = i;
      lerpTo = (i + 1) % presets.length;
      lerpT = 0;
    }
  } else {
    return;
  }
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
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.textContent = i;
    dom.presetPills.appendChild(pill);
  }

  const toggle = document.getElementById('drawer-toggle');
  toggle.addEventListener('click', () => {
    toggleDrawer();
    toggle.blur();
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
