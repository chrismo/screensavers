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

Adds: keyboard + tap controls, named presets grouped into swappable packs
(each with its own per-leg lerp timing), perlin auto-drift mode, preset-cycle
lerp, mold reset, "commit"-based brightness shading, and a 10-slot bank you can
store the live config into.

Pure pack/slot logic lives in timeline.js (loaded first); this file is the p5
sketch, the panel, and the input handling.
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

// EASINGS / DEFAULT_EASE, the pack spec codec and all the slot logic come from
// timeline.js, loaded as a classic <script src> ahead of this file. Tell
// chrome.js's dev live-reload to watch it too — it only knows about sketch.js.
window.SS_WATCH = ['timeline.js'];

// --- presets ---------------------------------------------------------------
// Each preset snapshots the full live config. The base ten span the regimes
// discovered while playing: thin parallel highways, tight cells, sweeping
// long-range networks, the chaotic-but-organized "tipping point" at 2px, etc.
const CLASSIC = [
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

// --- packs -----------------------------------------------------------------
// A *pack* is a named, ordered collection of presets — what the 0-9 keys and
// the panel pills point at — bundled with the lerp timing for the legs between
// them. Packs are pure navigation: copy-URL still encodes the full live state,
// so however the quick-picks are organized, a copied URL keeps reproducing
// exactly what you saw.
//
// Per-leg lerp settings ride on the preset the leg *leaves*:
//   hold  dwell at this preset before starting the transition  (default 0)
//   dur   length of the transition into the NEXT preset        (default 1)
//   ease  curve for that transition, a key of EASINGS          (default smooth)
//
// hold/dur are multiples of the panel's lerpDuration rather than absolute
// seconds, so the lerpDuration knob still scales a whole pack up or down while
// the pack keeps its internal rhythm. Physarum needs a few seconds after a
// param jump to re-knit, which is what `hold` buys: the mesh gets to actually
// settle into a regime instead of being dragged straight through it.
const tune = (name, timing) =>
  Object.assign({}, CLASSIC.find((p) => p.name === name), timing);

const packs = [
  // The original ten at uniform timing — the cycle lerp has always had.
  { name: 'Classic', presets: CLASSIC },

  // The linear, networky end. Long dwells so each mesh finishes knitting, and
  // slow smootherstep legs so the rebuild reads as a morph rather than a cut.
  { name: 'Weave', presets: [
    tune('Cobweb',     { hold: 0.8, dur: 1.8, ease: 'smoother' }),
    tune('Highways',   { hold: 0.6, dur: 2.0, ease: 'smoother' }),
    tune('Tube',       { hold: 1.0, dur: 1.5, ease: 'smooth'   }),
    tune('Vermicelli', { hold: 0.8, dur: 2.0, ease: 'smoother' }),
    tune('Burlap',     { hold: 1.2, dur: 1.6, ease: 'smoother' }),
  ] },

  // The soft, blobby end. Medium legs with the easing mixed on purpose, so the
  // cycle breathes unevenly instead of metronoming.
  { name: 'Bloom', presets: [
    tune('Slime',     { hold: 0.4, dur: 1.2, ease: 'smooth'   }),
    tune('Ooze',      { hold: 0.6, dur: 1.0, ease: 'out'      }),
    tune('Plasma',    { hold: 0.3, dur: 1.4, ease: 'in'       }),
    tune('Dendrite',  { hold: 0.8, dur: 1.2, ease: 'smoother' }),
    tune('Honeycomb', { hold: 0.5, dur: 1.0, ease: 'smooth'   }),
  ] },

  // Contrast first: mostly hold, with short ease-out legs that move fast and
  // land soft — a slideshow of regimes rather than a morph between them.
  { name: 'Pulse', presets: [
    tune('Plasma',     { hold: 0.6, dur: 0.3, ease: 'out' }),
    tune('Vermicelli', { hold: 0.6, dur: 0.3, ease: 'out' }),
    tune('Honeycomb',  { hold: 0.6, dur: 0.3, ease: 'out' }),
    tune('Tube',       { hold: 0.6, dur: 0.3, ease: 'out' }),
    tune('Burlap',     { hold: 0.6, dur: 0.3, ease: 'out' }),
    tune('Slime',      { hold: 0.6, dur: 0.4, ease: 'out' }),
  ] },

  // One knob swept end to end: sensorDist from the chaotic 2px tipping point
  // out to 30px long-range highways, everything else pinned at Slime's values.
  // Palindromic so the wrap-around leg is just another step of the same sweep,
  // and linear legs with no holds so the whole pack reads as one steady breath.
  { name: 'Tide', presets: [2, 6, 12, 20, 30, 20, 12, 6].map((sensorDist) => ({
    name: `${sensorDist}px`,
    rotAngle: 45, sensorAngle: 45, sensorDist, moldSpeed: 1.0, bgFade: 5,
    hold: 0, dur: 0.75, ease: 'linear',
  })) },
];
let packIdx = 0;
let presets = packs[0].presets; // active pack's presets; re-pointed by setPack
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

// --- lerp (cycle through the active pack's presets) ------------------------
// Each cycle step is a *leg*: an optional hold at `lerpFrom`, then an eased
// transition into `lerpTo`. Both phases are driven by the from-preset's
// hold/dur/ease (see packs above), scaled by lerpDuration.
let lerpMode = false;
let lerpFrom = 0;
let lerpTo = 1;
let lerpT = 0;     // 0-1 through the transition
let lerpHoldT = 0; // 0-1 through the hold that precedes it
let lerpDuration = 480; // frames per unit-duration transition (~8s @ 60fps)

// timeline.js takes lerpDuration as an argument (it can't see this module's
// live binding); these close over it so the call sites stay short.
const legDur  = (p) => legDurFrames(p, lerpDuration);
const legHold = (p) => legHoldFrames(p, lerpDuration);

// --- slot editing ---------------------------------------------------------
// A pack is a bank of SLOT_COUNT slots and the panel always shows all ten, so
// storing is play → tune → S → pick a pad. Arming is the only way in: the S / X
// buttons (or keys) arm an action and the next slot pick consumes it, which
// behaves identically under a finger and a mouse and needs no long-press. A
// one-press store was tried and pulled — too easy to wipe a slot, no undo.
let armed = null; // null | 'store' | 'clear'
let armedTimer;
const ARM_TIMEOUT = 6000;
const slotLabel = (i) => (i + 1) % 10; // slot 9 is the '0' key, as the pills read

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
  /* An empty slot stays visible and tappable — that's how storing into one is
     discoverable. An outline instead of a fill so it reads as a different *kind*
     of thing (a pad with nothing on it) rather than as a dimmer preset; merely
     darkening it was too close to a filled-but-inactive pill to tell apart.
     Ordered after .active/.target so a tie goes to empty. */
  .preset-pills .pill.empty {
    background: none; color: #3a3a3a;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.085);
  }
  /* Armed store / clear tints the whole bank, so it's obvious the next tap is
     not an ordinary preset jump. Clear only lights the slots it could act on. */
  .preset-pills.arm-store .pill { background: rgba(130, 240, 180, 0.16); color: #7ad9a4; }
  .preset-pills.arm-clear .pill:not(.empty) { background: rgba(255, 130, 130, 0.20); color: #f99; }
  .preset-pills .pill.flash { animation: pill-flash 450ms ease-out; }
  @keyframes pill-flash { from { background: #9cf; color: #04121f; } }

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

const paramRow = (label, param, hint) => window.SS.paramRow(label, param, hint);

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
      ${paramRow('pack', 'pack', 'B \u21e7B')}
      <div class="row wide"><span class="label">preset</span><span id="v-preset" class="val accent"></span></div>
      <div id="v-preset-pills" class="preset-pills"></div>

      <h2>timing</h2>
      ${paramRow('lerpDuration', 'lerpDuration', '')}
      ${paramRow('driftSpeed',   'driftSpeed',   '')}
      <div class="row wide"><span class="label">leg hold</span><span id="v-legHold" class="val"></span></div>
      <div class="row wide"><span class="label">leg lerp</span><span id="v-legLerp" class="val"></span></div>

      <h2>actions</h2>
      <div class="legend">
        <button class="kbd kbd-action" data-action="pack">B</button><div class="kbd-desc">next pack (⇧B back)</div>
        <button class="kbd kbd-action" data-action="drift">D</button><div class="kbd-desc">drift (perlin)</div>
        <button class="kbd kbd-action" data-action="lerp">L</button><div class="kbd-desc">lerp (preset cycle)</div>
        <span class="kbd-pair"><button class="kbd-btn kbd-action" data-action="store">S</button><button
          class="kbd-btn kbd-action" data-action="clear">X</button></span><div class="kbd-desc">store / clear slot, then pick</div>
        <button class="kbd kbd-action" data-action="reset">R</button><div class="kbd-desc">reset molds</div>
        <button class="kbd kbd-action" data-action="copy">C</button><div class="kbd-desc" id="copy-desc">copy screensaver URL</div>
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
// pack → preset → numeric overrides → mode → panel.
//
// Pack selection:
//   ?pack=NAME     select a built-in pack by slug (classic, weave, …) or index
//   ?packs=SPEC    define an ad-hoc pack inline and select it (see parsePack)
//   ?packname=S    name for the ?packs= pack (default "Custom")
//
// Mode + panel:
//   ?preset=N      apply preset N (0-9, within the active pack)
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
  // Pack first: it re-points what ?preset= and the 0-9 keys index into.
  const packsParam = params.get('packs');
  if (packsParam) {
    const custom = parsePack(packsParam, params.get('packname'));
    if (custom) {
      packs.push(custom);
      setPack(packs.length - 1);
    }
  } else {
    const packParam = params.get('pack');
    if (packParam !== null) {
      const i = findPack(packParam);
      if (i >= 0) setPack(i);
    }
  }

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
    restartLerpAt(presetIdx);
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
  } else if (lerpMode && presets[lerpFrom] && presets[lerpTo]) {
    // Hold at the from-preset first (if the pack asked for one), then run the
    // eased transition. Both lengths come from the from-preset's own settings.
    // Empty slots are skipped, so the cycle walks the filled ones only.
    const hold = legHold(presets[lerpFrom]);
    if (lerpHoldT < 1) lerpHoldT = hold > 0 ? Math.min(1, lerpHoldT + 1 / hold) : 1;
    if (lerpHoldT < 1) {
      setValues(presets[lerpFrom]);
    } else {
      lerpT += 1 / legDur(presets[lerpFrom]);
      if (lerpT >= 1) {
        lerpT = 0;
        lerpHoldT = 0;
        lerpFrom = lerpTo;
        const nx = nextFilled(presets, lerpFrom);
        lerpTo = nx < 0 ? lerpFrom : nx;
        presetIdx = lerpFrom;
      }
      applyLerp(presets[lerpFrom], presets[lerpTo], lerpT);
    }
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

function setValues(p) {
  rotAngle    = p.rotAngle;
  sensorAngle = p.sensorAngle;
  sensorDist  = p.sensorDist;
  moldSpeed   = p.moldSpeed;
  bgFade      = p.bgFade;
}

function applyPreset(i) {
  const p = presets[i];
  if (!p) return; // empty slot — nothing to apply
  if (drift) {
    // Snap by setting bias = preset - current drift output. Bias decays
    // each frame in draw(), so values drift back to natural orbit.
    driftBias.rotAngle    = p.rotAngle    - driftValue('rotAngle');
    driftBias.sensorAngle = p.sensorAngle - driftValue('sensorAngle');
    driftBias.sensorDist  = p.sensorDist  - driftValue('sensorDist');
    driftBias.moldSpeed   = p.moldSpeed   - driftValue('moldSpeed');
    driftBias.bgFade      = p.bgFade      - driftValue('bgFade');
  } else {
    setValues(p);
  }
  presetIdx = i;
}

// The leg's easing belongs to the preset it leaves, so `a` picks the curve.
function applyLerp(a, b, t) {
  const e = legEase(a)(constrain(t, 0, 1));
  rotAngle    = lerp(a.rotAngle,    b.rotAngle,    e);
  sensorAngle = lerp(a.sensorAngle, b.sensorAngle, e);
  sensorDist  = lerp(a.sensorDist,  b.sensorDist,  e);
  moldSpeed   = lerp(a.moldSpeed,   b.moldSpeed,   e);
  bgFade      = lerp(a.bgFade,      b.bgFade,      e);
}

// --- packs: selection, parsing, encoding ----------------------------------
// Switch the active pack. Packs are navigation only, so this just re-points
// the 0-9 keys / pills and restarts at the new pack's first preset.
function setPack(i, announce) {
  const n = packs.length;
  packIdx = ((i % n) + n) % n;
  presets = packs[packIdx].presets;
  const start = Math.max(0, firstFilled(presets, 0)); // a pack can lead with holes
  applyPreset(start);
  presetIdx = start;
  if (lerpMode) restartLerpAt(start);
  rebuildPresetPills();
  if (announce) window.flashToast?.(`pack: ${packs[packIdx].name}`);
}

function cyclePack(dir) {
  setPack(packIdx + (dir < 0 ? -1 : 1), true);
}

function restartLerpAt(i) {
  lerpFrom = presets[i] ? i : Math.max(0, firstFilled(presets, 0));
  const nx = nextFilled(presets, lerpFrom);
  lerpTo = nx < 0 ? lerpFrom : nx; // one filled slot: sit on it rather than cycle
  lerpT = 0;
  lerpHoldT = 0;
}

const packSlug = (name) => String(name).toLowerCase().replace(/\s+/g, '-');

// Resolve a ?pack= value: a slug/name match first, then a bare index.
function findPack(v) {
  const want = packSlug(v.trim());
  const byName = packs.findIndex((pk) => packSlug(pk.name) === want);
  if (byName >= 0) return byName;
  const i = Number(v);
  return Number.isInteger(i) && i >= 0 && i < packs.length ? i : -1;
}

// parsePack / encodePack — the ?packs= codec — live in timeline.js, next to the
// slot logic they have to agree with about holes.

// --- action handlers (shared by keyboard and tap UI) ----------------------
function adjustParam(name, dir) {
  // `pack` isn't a number, but riding the −/+ row keeps the panel uniform and
  // gets hold-to-repeat for free; it toasts its own message.
  if (name === 'pack') { cyclePack(dir); return; }
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
    restartLerpAt(presetIdx);
  }
  window.flashToast?.(`lerp ${lerpMode ? 'on' : 'off'}`);
}

function resetMolds() {
  for (let i = 0; i < num; i++) molds[i] = new Mold();
  background(0);
  window.flashToast?.('reset');
}

// A slot pick from a pill or a digit key. If an action is armed it consumes the
// pick; otherwise this is the plain "jump to preset" it always was.
function pickSlot(i) {
  if (armed === 'store') { disarm(); storeIntoSlot(i); return; }
  if (armed === 'clear') { disarm(); clearSlotAt(i); return; }
  pickPreset(i);
}

function pickPreset(i) {
  if (!presets[i]) { window.flashToast?.(`slot ${slotLabel(i)} empty`); return; }
  applyPreset(i);
  if (lerpMode) restartLerpAt(i);
  window.flashToast?.(`preset ${slotLabel(i)}: ${presets[i].name}`);
}

// Arm store or clear for the next slot pick. Same key again, Escape, or the
// timeout cancels — an armed destructive mode shouldn't outlive your attention.
function arm(mode) {
  if (armed === mode) { disarm(); return; }
  armed = mode;
  syncArmClass();
  window.flashToast?.(mode === 'store' ? 'store → pick a slot' : 'clear → pick a slot');
  clearTimeout(armedTimer);
  armedTimer = setTimeout(disarm, ARM_TIMEOUT);
}

function disarm() {
  clearTimeout(armedTimer);
  armed = null;
  syncArmClass();
}

function syncArmClass() {
  if (!dom.presetPills) return;
  dom.presetPills.classList.toggle('arm-store', armed === 'store');
  dom.presetPills.classList.toggle('arm-clear', armed === 'clear');
}

// The first edit to a built-in pack forks it. shareUrl() emits `?pack=weave` for
// a built-in and the full spec only for a custom pack, so editing in place would
// make copy-URL hand back pristine Weave — the edit gone from the very URL meant
// to reproduce it. Forking also means a palette you liked can't be clobbered.
function editablePack() {
  const pk = packs[packIdx];
  if (pk.custom) return pk;
  const fork = forkPack(pk, packs.map((x) => x.name));
  packs.push(fork);
  packIdx = packs.length - 1;
  presets = fork.presets;
  return fork;
}

const setSlots = (pk, slots) => { pk.presets = slots; presets = slots; };

// Store the live config into a slot. This is the capture affordance: play, tune,
// S, pick. Values are read live, so storing mid-lerp captures the transient —
// which is the point, since the interesting moments are often a few seconds
// after a change.
function storeIntoSlot(i) {
  if (!Number.isInteger(i) || i < 0 || i >= SLOT_COUNT) return;
  const forking = !packs[packIdx].custom;
  const pk = editablePack();
  setSlots(pk, storeSlot(pk.presets, i, { rotAngle, sensorAngle, sensorDist, moldSpeed, bgFade }, CLASSIC));
  if (!lerpMode && !drift) presetIdx = i; // so copy-URL diffs against what we just stored
  rebuildPresetPills();
  flashPill(i);
  window.flashToast?.(`slot ${slotLabel(i)} = ${presets[i].name}` + (forking ? ` · forked to ${pk.name}` : ''));
}

// Clear a slot, leaving a hole. 5-9 must NOT slide down into a cleared 4: the
// indexes are the addresses, for muscle memory now and for scripts later.
function clearSlotAt(i) {
  if (!presets[i]) { window.flashToast?.(`slot ${slotLabel(i)} already empty`); return; }
  const forking = !packs[packIdx].custom;
  const pk = editablePack();
  const was = pk.presets[i].name;
  setSlots(pk, clearSlot(pk.presets, i));
  reseat();
  rebuildPresetPills();
  flashPill(i);
  window.flashToast?.(`slot ${slotLabel(i)} cleared (${was})` + (forking ? ` · forked to ${pk.name}` : ''));
}

// After an edit, playback may be pointing at a slot that just went away.
function reseat() {
  const f = firstFilled(presets, 0);
  if (f < 0) return; // bank is empty; draw() and updateDom() both tolerate it
  if (!presets[presetIdx]) { presetIdx = f; applyPreset(f); }
  if (lerpMode && (!presets[lerpFrom] || !presets[lerpTo])) restartLerpAt(presetIdx);
}

function flashPill(i) {
  const pill = dom.presetPills?.children[i];
  if (!pill) return;
  pill.classList.remove('flash');
  void pill.offsetWidth; // restart the animation rather than ignore a repeat store
  pill.classList.add('flash');
}

// Build a screensaver-friendly URL that reproduces the current panel state.
// Only emits params that differ from preset defaults — keeps the URL readable.
function shareUrl() {
  const close = (a, b) => Math.abs(a - b) < 1e-6;
  // Round through toFixed → Number to drop FP noise and trailing zeros.
  const fmt = (n, d) => Number(n.toFixed(d)).toString();

  const params = new URLSearchParams();
  params.set('nopanel', '1');

  // Packs are navigation, but the 0-9 slots have to mean the same thing on the
  // other end for ?preset= to land — so the pack rides along too. An ad-hoc
  // ?packs= pack is re-emitted in full, since there's nothing to name it by.
  const pk = packs[packIdx];
  if (pk.custom) {
    params.set('packs', encodePack(pk));
    if (pk.name !== 'Custom') params.set('packname', pk.name);
  } else if (packIdx !== 0) {
    params.set('pack', packSlug(pk.name));
  }

  params.set('preset', String(presetIdx));

  if (lerpMode) {
    params.set('lerp', '1');
  } else if (drift) {
    params.set('drift', '1');
  } else {
    // Manual mode — emit any of the 5 runtime vars that differ from the
    // preset's value. In drift/lerp those vars get rewritten every frame,
    // so a snapshot would be misleading. With presetIdx on an empty slot
    // there's nothing to diff against, so all five go out absolute.
    const p = presets[presetIdx];
    if (!p || !close(rotAngle,    p.rotAngle))    params.set('rotAngle',    fmt(rotAngle, 2));
    if (!p || !close(sensorAngle, p.sensorAngle)) params.set('sensorAngle', fmt(sensorAngle, 2));
    if (!p || !close(sensorDist,  p.sensorDist))  params.set('sensorDist',  fmt(sensorDist, 2));
    if (!p || !close(moldSpeed,   p.moldSpeed))   params.set('moldSpeed',   fmt(moldSpeed, 3));
    if (!p || !close(bgFade,      p.bgFade))      params.set('bgFade',      fmt(bgFade, 1));
  }

  // Speed knobs / mold count apply regardless of mode.
  if (!close(lerpDuration, 480))   params.set('lerpDuration', fmt(lerpDuration, 0));
  if (!close(driftSpeed,   0.003)) params.set('driftSpeed',   fmt(driftSpeed, 5));
  if (num !== 4000)                params.set('num',          String(num));

  const url = new URL(location.pathname, location.href);
  url.search = compactQuery(params); // raw `:;,@/` — see timeline.js
  return url.toString();
}

function copyShareUrl() {
  if (!navigator.clipboard) return;
  navigator.clipboard.writeText(shareUrl()).then(() => {
    const desc = document.getElementById('copy-desc');
    if (!desc) return;
    const orig = desc.textContent;
    desc.textContent = 'copied!';
    desc.style.color = '#9cf';
    setTimeout(() => { desc.textContent = orig; desc.style.color = ''; }, 1200);
  }).catch(() => {});
}

// Which slot a keypress addresses, or -1. Read from e.code so the digits don't
// move under a non-US layout, and so a modified digit is still identifiable —
// e.key for shift+1 is '!', with no digit in it to test. Numpad digits count;
// e.key is the fallback for anything that reports no code.
function slotFromKey(e) {
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code || '');
  const ch = m ? m[1] : (e.key >= '0' && e.key <= '9' ? e.key : null);
  return ch == null ? -1 : (Number(ch) + 9) % 10; // '1'→slot 0 … '0'→slot 9
}

// Native keydown rather than p5's keyPressed so the browser's built-in
// key-repeat fires on held keys for the adjust shortcuts. Non-adjust keys
// (toggles, reset, preset) are gated on e.repeat so holding R doesn't
// reset 30×/sec.
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return; // let Cmd+R, Cmd+L, etc. through
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
  else if (e.key === 'b') cyclePack(+1);
  else if (e.key === 'B') cyclePack(-1); // shift-B walks back
  else if (e.key === 'd' || e.key === 'D') toggleDrift();
  else if (e.key === 'l' || e.key === 'L') toggleLerp();
  else if (e.key === 'r' || e.key === 'R') resetMolds();
  else if (e.key === 'c' || e.key === 'C') copyShareUrl();
  else if (e.key === 'h' || e.key === 'H') toggleDrawer();
  else if (e.key === 's' || e.key === 'S') arm('store');
  else if (e.key === 'x' || e.key === 'X') arm('clear');
  else if (e.key === 'Escape' && armed) disarm(); // unarmed Escape stays the browser's
  else {
    const slot = slotFromKey(e);
    // Shift+digit is deliberately inert: ⇧N as a direct store is one slip away
    // from wiping a slot you wanted, with no undo behind it. Arming with S first
    // is the only way in. See ideas.md — this is held, not abandoned.
    if (slot < 0 || e.shiftKey) return;
    pickSlot(slot);
  }
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
  dom.legHold      = document.getElementById('v-legHold');
  dom.legLerp      = document.getElementById('v-legLerp');
  dom.mode         = document.getElementById('v-mode');
  dom.pack         = document.getElementById('v-pack');
  dom.preset       = document.getElementById('v-preset');
  dom.presetPills  = document.getElementById('v-preset-pills');

  rebuildPresetPills();

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
    if      (a === 'pack')       cyclePack(+1);
    else if (a === 'drift')      toggleDrift();
    else if (a === 'lerp')       toggleLerp();
    else if (a === 'store')      arm('store');
    else if (a === 'clear')      arm('clear');
    else if (a === 'reset')      resetMolds();
    else if (a === 'copy')       copyShareUrl();
    else if (a === 'fullscreen') window.toggleFullscreen?.();
    else if (a === 'hide')       toggleDrawer();
    else return;
    el.blur();
  });

  // Hold an adjust button to auto-repeat.
  window.SS.attachHoldRepeat(drawerContent, '[data-action="adjust"]',
    (el) => adjustParam(el.dataset.param, Number(el.dataset.dir)), { interval: 60 });
}

const toggleDrawer = window.SS.toggleDrawer;

// The bank is always SLOT_COUNT pads — empty slots show as empty rather than
// vanishing, which is what makes storing into one discoverable. So the pills are
// built once and only restyled after that; rebuilding would kill the store flash
// mid-animation. No-op until the panel exists (?nopanel=1).
function rebuildPresetPills() {
  if (!dom.presetPills) return;
  if (dom.presetPills.children.length !== SLOT_COUNT) {
    window.SS.presetPills(dom.presetPills, SLOT_COUNT, pickSlot);
  }
  syncArmClass();
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

  // The leg rows describe the transition *out of* the preset we're sitting on.
  // Every slot can be empty, so every read of one is a maybe.
  const cycling = lerpMode && presets[lerpFrom] && presets[lerpTo];
  const leg = presets[lerpMode ? lerpFrom : presetIdx];
  dom.legHold.textContent = leg ? `${nf(legHold(leg) / 60, 1, 1)}s` : '—';
  dom.legLerp.textContent = leg ? `${nf(legDur(leg) / 60, 1, 1)}s ${leg.ease || DEFAULT_EASE}` : '—';

  let modeStr = 'manual';
  if (drift) modeStr = 'drift (perlin)';
  else if (lerpMode) modeStr = !cycling ? 'lerp (no slots)'
    : lerpHoldT < 1 ? `hold ${nf(lerpHoldT * 100, 1, 0)}%`
    : `lerp ${nf(lerpT * 100, 1, 0)}%`;
  if (armed) modeStr += ` · ${armed}?`;
  dom.mode.textContent = modeStr;

  dom.pack.textContent = packs[packIdx].name;
  dom.preset.textContent = cycling
    ? `${presets[lerpFrom].name} → ${presets[lerpTo].name}`
    : (presets[presetIdx]?.name || '—');

  const activeIdx = lerpMode ? lerpFrom : presetIdx;
  const targetIdx = cycling ? lerpTo : -1;
  for (let i = 0; i < dom.presetPills.children.length; i++) {
    const p = dom.presetPills.children[i];
    const filled = !!presets[i];
    p.classList.toggle('active', filled && i === activeIdx);
    p.classList.toggle('target', filled && i === targetIdx);
    p.classList.toggle('empty', !filled);
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
