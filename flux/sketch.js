// Build-up plan — current state stacked too many forces without validating
// each piece. Rebuild in phases; verify each both visually and via the
// diagnostic console logs (spread, meanSpeed, r=[min,max]) before moving on.
//
//   Phase 1: Flow field only, displacement model (no velocity state).
//            pos += flow * dt; original hard cube respawn for containment.
//            Verify: particles flow visibly, no clustering, no popping
//            beyond the deliberate respawn.
//
//   Phase 2: Replace hard cube with soft outer wall.
//            Particles turn around past a radius; no respawn pop.
//
//   Phase 3: Switch to velocity model with flow drag only.
//            Velocity lerps toward flow target. Should look like Phase 2,
//            just smoother.
//
//   Phase 4: Add a single attractor (gentle inverse-square pull).
//            Verify visible perturbation, no capture, spread stays healthy.
//
//   Phase 5: Add the other two attractors.
//
//   Phase 6: Tangential swirl per attractor for orbital behavior.

const NUM = 8000;
const BOUNDS = 2.5;
const F1 = 1.2;                 // primary spatial frequency for the flow field
const F2 = 0.7;                 // secondary spatial frequency
const TIME_RATE = 0.00008;      // master time scale (radians per ms)
const FLOW_TARGET_SPEED = 0.5;  // target velocity magnitude from flow field
const MEDIUM_DRAG = 1.0;        // 1/s — how fast particle velocity matches flow
const ATTRACTOR_PULL = 0.2;     // radial inverse-square pull toward attractor
const ATTRACTOR_SWIRL = 0.8;    // tangential force around each attractor's axis
const ATTRACTOR_EPS = 0.6;      // softening to avoid singularity at center
const DAMP_PER_SEC = 0.15;      // gentle global energy bleed
const RADIAL_K = 0.15;          // soft spring tether to origin (1/s²) — keeps
                                // particles in a rough cloud without a hard wall
const LOG_INTERVAL = 1.0;       // seconds between diagnostic console.log

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 0.1, 100,
);
camera.position.set(0, 0, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1);
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function makeSpriteTexture() {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(
    size / 2, size / 2, 0, size / 2, size / 2, size / 2,
  );
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.4)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}
const spriteTex = makeSpriteTexture();

const positions = new Float32Array(NUM * 3);
const velocities = new Float32Array(NUM * 3);
const colors = new Float32Array(NUM * 3);
const tmpColor = new THREE.Color();
for (let i = 0; i < NUM; i++) {
  positions[i * 3 + 0] = (Math.random() - 0.5) * BOUNDS * 2;
  positions[i * 3 + 1] = (Math.random() - 0.5) * BOUNDS * 2;
  positions[i * 3 + 2] = (Math.random() - 0.5) * BOUNDS * 2;
  tmpColor.setHSL(0.55 + Math.random() * 0.18, 0.65, 0.55);
  colors[i * 3 + 0] = tmpColor.r;
  colors[i * 3 + 1] = tmpColor.g;
  colors[i * 3 + 2] = tmpColor.b;
}

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

const material = new THREE.PointsMaterial({
  size: 0.06,
  map: spriteTex,
  vertexColors: true,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true,
});

const points = new THREE.Points(geo, material);
scene.add(points);

// Three slow-orbiting attractors. Each rides its own Lissajous-style path
// inside the bounding cube; particles get pulled toward them with
// softened inverse-square falloff. Combined with the ambient flow field,
// this produces drifting eddies — currents with whirlpools.
const ATTRACTORS = [
  { phase: 0.0, speed: 4.0, ax: 1.7, ay: 0.9, az: 1.3, radius: 1.4,
    sx: 0.0, sy: 1.0, sz: 0.0,
    color: new THREE.Color(1.00, 0.55, 0.40) },
  { phase: 2.1, speed: 3.0, ax: 0.8, ay: 1.5, az: 1.1, radius: 1.5,
    sx: 0.8, sy: 0.0, sz: 0.6,
    color: new THREE.Color(1.00, 0.80, 0.45) },
  { phase: 4.2, speed: 4.5, ax: 1.1, ay: 1.0, az: 1.6, radius: 1.3,
    sx: 0.0, sy: 0.6, sz: 0.8,
    color: new THREE.Color(1.00, 0.45, 0.75) },
];
const attractorPos = new Float32Array(ATTRACTORS.length * 3);
const attractorCol = new Float32Array(ATTRACTORS.length * 3);
ATTRACTORS.forEach((a, i) => {
  attractorCol[i * 3 + 0] = a.color.r;
  attractorCol[i * 3 + 1] = a.color.g;
  attractorCol[i * 3 + 2] = a.color.b;
});
const attractorGeo = new THREE.BufferGeometry();
attractorGeo.setAttribute('position', new THREE.BufferAttribute(attractorPos, 3));
attractorGeo.setAttribute('color', new THREE.BufferAttribute(attractorCol, 3));
const attractorMat = new THREE.PointsMaterial({
  size: 0.28,
  map: spriteTex,
  vertexColors: true,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true,
});
const attractorMesh = new THREE.Points(attractorGeo, attractorMat);
scene.add(attractorMesh);

function updateAttractors(t) {
  for (let i = 0; i < ATTRACTORS.length; i++) {
    const a = ATTRACTORS[i];
    const k = t * a.speed + a.phase;
    attractorPos[i * 3 + 0] = Math.sin(k * a.ax) * a.radius;
    attractorPos[i * 3 + 1] = Math.sin(k * a.ay + 1.0) * a.radius;
    attractorPos[i * 3 + 2] = Math.cos(k * a.az) * a.radius;
  }
  attractorGeo.attributes.position.needsUpdate = true;
}

function step(dt, t) {
  updateAttractors(t);
  const pos = geo.attributes.position.array;
  const damp = Math.max(0, 1 - DAMP_PER_SEC * dt);
  const dragK = Math.min(1, MEDIUM_DRAG * dt);
  const flowScale = 0.5 * FLOW_TARGET_SPEED;

  for (let i = 0; i < NUM; i++) {
    const ix = i * 3;
    const x = pos[ix], y = pos[ix + 1], z = pos[ix + 2];

    const tx = (Math.sin(y * F1 + t)       + Math.cos(z * F2)) * flowScale;
    const ty = (Math.sin(z * F1 + t * 1.1) + Math.cos(x * F2)) * flowScale;
    const tz = (Math.sin(x * F1 + t * 0.9) + Math.cos(y * F2)) * flowScale;

    let vx = velocities[ix];
    let vy = velocities[ix + 1];
    let vz = velocities[ix + 2];

    vx += (tx - vx) * dragK;
    vy += (ty - vy) * dragK;
    vz += (tz - vz) * dragK;

    for (let j = 0; j < ATTRACTORS.length; j++) {
      const a = ATTRACTORS[j];
      const jx = j * 3;
      const dx = attractorPos[jx]     - x;
      const dy = attractorPos[jx + 1] - y;
      const dz = attractorPos[jx + 2] - z;
      const d2 = dx * dx + dy * dy + dz * dz + ATTRACTOR_EPS;
      const inv = 1 / d2;
      const pull = ATTRACTOR_PULL * inv;
      vx += dx * pull * dt;
      vy += dy * pull * dt;
      vz += dz * pull * dt;
      // tangential swirl: cross(swirlAxis, d) — perpendicular to both
      const tx = a.sy * dz - a.sz * dy;
      const ty = a.sz * dx - a.sx * dz;
      const tz = a.sx * dy - a.sy * dx;
      const swirl = ATTRACTOR_SWIRL * inv;
      vx += tx * swirl * dt;
      vy += ty * swirl * dt;
      vz += tz * swirl * dt;
    }

    vx -= x * RADIAL_K * dt;
    vy -= y * RADIAL_K * dt;
    vz -= z * RADIAL_K * dt;

    vx *= damp;
    vy *= damp;
    vz *= damp;

    velocities[ix]     = vx;
    velocities[ix + 1] = vy;
    velocities[ix + 2] = vz;
    pos[ix]     = x + vx * dt;
    pos[ix + 1] = y + vy * dt;
    pos[ix + 2] = z + vz * dt;
  }
  geo.attributes.position.needsUpdate = true;
}

function logStats(elapsedSec) {
  const pos = geo.attributes.position.array;
  let cx = 0, cy = 0, cz = 0, speed = 0;
  let minD = Infinity, maxD = 0;
  for (let i = 0; i < NUM; i++) {
    const ix = i * 3;
    cx += pos[ix];
    cy += pos[ix + 1];
    cz += pos[ix + 2];
    speed += Math.hypot(velocities[ix], velocities[ix + 1], velocities[ix + 2]);
    const d = Math.hypot(pos[ix], pos[ix + 1], pos[ix + 2]);
    if (d < minD) minD = d;
    if (d > maxD) maxD = d;
  }
  cx /= NUM; cy /= NUM; cz /= NUM;
  speed /= NUM;
  let spread = 0;
  for (let i = 0; i < NUM; i++) {
    const ix = i * 3;
    spread += Math.hypot(pos[ix] - cx, pos[ix + 1] - cy, pos[ix + 2] - cz);
  }
  spread /= NUM;
  const fmt = (v) => v.toFixed(2);
  const a = (i) => `(${fmt(attractorPos[i*3])},${fmt(attractorPos[i*3+1])},${fmt(attractorPos[i*3+2])})`;
  console.log(
    `t=${elapsedSec.toFixed(1)}s`,
    `centroid=(${fmt(cx)},${fmt(cy)},${fmt(cz)})`,
    `spread=${fmt(spread)}`,
    `meanSpeed=${speed.toFixed(3)}`,
    `r=[${fmt(minD)},${fmt(maxD)}]`,
    `att=${a(0)},${a(1)},${a(2)}`,
  );
}

let last = performance.now();
let elapsed = 0;
let logTimer = 0;
function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  elapsed += dt;
  const t = now * TIME_RATE;
  step(dt, t);
  logTimer += dt;
  if (logTimer >= LOG_INTERVAL) {
    logStats(elapsed);
    logTimer = 0;
  }
  camera.position.x = Math.sin(t * 0.5) * 6;
  camera.position.z = Math.cos(t * 0.5) * 6;
  camera.position.y = Math.sin(t * 0.3) * 1.2;
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
