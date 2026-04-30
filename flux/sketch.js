// Endless tube of lights: blobs stream from far ahead toward a stationary
// camera, then wrap back to the far end with new colors, sizes, and speeds.
// Camera is fixed at the origin looking down -z, so the world coordinates
// stay in a small fixed window forever — no growing-Z precision drift.
// Per-blob speed variance is the parallax cue that makes the tube read as
// 3D depth rather than a 2D wash.

const NUM_BLOBS = 500;
const TUBE_RADIUS = 30;          // how far blobs can be from the central axis
const Z_FAR = -100;              // spawn z (deep in front of camera)
const Z_NEAR = 0.5;              // recycle threshold (just past camera)
const FLOW_SPEED = 4.0;          // mean travel speed (units/sec, +z)
const SPEED_VARIANCE = 0.4;      // ± fraction of FLOW_SPEED for parallax
const SIZE_MIN = 1.0;
const SIZE_MAX = 2.5;
const JIGGLE_AMP = 0.2;          // x-y wobble amplitude (units, gentle firefly)
const JIGGLE_FREQ_MIN = 1.0;     // wobble speed range (radians/sec)
const JIGGLE_FREQ_MAX = 2.5;
const SPIN_RATE = 0.2;           // camera roll speed around z-axis (radians/sec)
const CHASE_RATE = 0.15;         // camera lerp rate toward target (1/sec; lower = lazier)
const CHASE_INERTIA = 5.0;       // how fast camera velocity adapts to new target (1/sec)
const PICK_THRESHOLD_Z = -50;    // only orbs deeper than this are eligible new targets
const MAX_DT = 0.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75, window.innerWidth / window.innerHeight, 0.1, 200,
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
  // round blobs, regardless of camera roll (sprites are screen-aligned).
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

const state = [];

function respawn(sprite, i) {
  // sqrt distribution → uniform area on the disk (avoids center-bias).
  const r = Math.sqrt(Math.random()) * TUBE_RADIUS;
  const theta = Math.random() * Math.PI * 2;
  const baseX = Math.cos(theta) * r;
  const baseY = Math.sin(theta) * r;
  sprite.position.x = baseX;
  sprite.position.y = baseY;
  sprite.position.z = Z_FAR;
  sprite.material.color.setHSL(Math.random(), 0.75, 0.55);
  sprite.material.map = blobTex;  // reset to soft blob (in case it was the target)
  const s = SIZE_MIN + Math.random() * (SIZE_MAX - SIZE_MIN);
  sprite.scale.set(s, s, 1);
  const jfreq = () => JIGGLE_FREQ_MIN + Math.random() * (JIGGLE_FREQ_MAX - JIGGLE_FREQ_MIN);
  state[i] = {
    baseX, baseY,
    speed: FLOW_SPEED * (1 + (Math.random() * 2 - 1) * SPEED_VARIANCE),
    jfx: jfreq(), jfy: jfreq(),
    jpx: Math.random() * Math.PI * 2,
    jpy: Math.random() * Math.PI * 2,
  };
}

const sprites = [];
for (let i = 0; i < NUM_BLOBS; i++) {
  const mat = new THREE.SpriteMaterial({
    map: blobTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  scene.add(sprite);
  sprites.push(sprite);
  respawn(sprite, i);
  // Stagger initial z so the tube is populated from frame 1, not a wave.
  sprite.position.z = Z_FAR + Math.random() * (Z_NEAR - Z_FAR);
}

let targetIdx = -1;
let camVx = 0, camVy = 0;
function pickTarget() {
  const candidates = [];
  for (let i = 0; i < NUM_BLOBS; i++) {
    if (sprites[i].position.z < PICK_THRESHOLD_Z) candidates.push(i);
  }
  if (candidates.length === 0) return -1;
  const idx = candidates[Math.floor(Math.random() * candidates.length)];
  sprites[idx].material.map = starTex;
  return idx;
}

let last = performance.now();
function tick(now) {
  const dt = Math.min((now - last) / 1000, MAX_DT);
  last = now;
  const t = now / 1000;
  for (let i = 0; i < NUM_BLOBS; i++) {
    const sprite = sprites[i];
    const s = state[i];
    sprite.position.z += s.speed * dt;
    // Cone: at spawn (z=Z_FAR) factor is 0 → all orbs at vertex; at camera
    // plane (z=0) factor is 1 → orb has reached its baseX/baseY endpoint.
    const cone = 1 - sprite.position.z / Z_FAR;
    sprite.position.x = s.baseX * cone + Math.sin(t * s.jfx + s.jpx) * JIGGLE_AMP;
    sprite.position.y = s.baseY * cone + Math.sin(t * s.jfy + s.jpy) * JIGGLE_AMP;
    if (i === targetIdx && sprite.position.z > 0) targetIdx = -1;
    if (sprite.position.z > Z_NEAR) respawn(sprite, i);
  }
  if (targetIdx < 0) targetIdx = pickTarget();
  if (targetIdx >= 0) {
    const tgt = state[targetIdx];
    // Lerp's "desired" velocity toward target; actual velocity smooths toward
    // it over CHASE_INERTIA, so handoffs ramp up instead of lurching.
    const desiredVx = (tgt.baseX - camera.position.x) * CHASE_RATE;
    const desiredVy = (tgt.baseY - camera.position.y) * CHASE_RATE;
    const vk = 1 - Math.exp(-CHASE_INERTIA * dt);
    camVx += (desiredVx - camVx) * vk;
    camVy += (desiredVy - camVy) * vk;
    camera.position.x += camVx * dt;
    camera.position.y += camVy * dt;
  }
  camera.rotation.z = t * SPIN_RATE;
  // Counter-rotate the star so it stays world-fixed instead of screen-locked.
  if (targetIdx >= 0) sprites[targetIdx].material.rotation = -camera.rotation.z;
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
