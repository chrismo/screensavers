// Endless tube of lights: blobs stream from far ahead toward a stationary
// camera, then wrap back to the far end with new colors, sizes, and speeds.
// Camera is fixed at the origin looking down -z, so the world coordinates
// stay in a small fixed window forever — no growing-Z precision drift.
// Per-blob speed variance is the parallax cue that makes the tube read as
// 3D depth rather than a 2D wash.

const NUM_BLOBS = 150;
const TUBE_RADIUS = 18;          // how far blobs can be from the central axis
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

let last = performance.now();
function tick(now) {
  const dt = Math.min((now - last) / 1000, MAX_DT);
  last = now;
  const t = now / 1000;
  for (let i = 0; i < NUM_BLOBS; i++) {
    const sprite = sprites[i];
    const s = state[i];
    sprite.position.z += s.speed * dt;
    sprite.position.x = s.baseX + Math.sin(t * s.jfx + s.jpx) * JIGGLE_AMP;
    sprite.position.y = s.baseY + Math.sin(t * s.jfy + s.jpy) * JIGGLE_AMP;
    if (sprite.position.z > Z_NEAR) respawn(sprite, i);
  }
  camera.rotation.z = t * SPIN_RATE;
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
