// knights/solver.js — the canonical solver: the pieces, the spiral order, and the
// construction rule. ONE source of truth, two consumers:
//   • the live sketch loads it as a classic <script src> (so it still runs on a
//     file:// double-click — top-level decls become shared globals sketch.js uses);
//   • the node explorer in explore/ imports it (the CommonJS tail below; skipped in
//     the browser, where `module` is undefined).
// Change the rule here and both stay in sync. No DOM, no canvas — pure data in/out.

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

// The square spiral walk: given a cell, the next cell outward. This IS the
// construction order — the sequence every color scans for its next home.
function spiralStep(a, b) {
  if (a === 0 && b === 0) return [1, 0];
  if (a > Math.abs(b)) return [a, b + 1];
  if (a < -Math.abs(b)) return [a, b - 1];
  if (b > Math.abs(a)) return [a - 1, b];
  if (b < -Math.abs(a)) return [a + 1, b];
  if (a === b && a > 0) return [a - 1, b];
  if (a === b && a < 0) return [a + 1, b];
  if (a === -b && a > 0) return [a + 1, b];
  return [a, b - 1];
}

// The eight squares a leaper of shape (m,n) attacks, by reflection/swap.
function leaperOffsets(piece) {
  const [m, n] = PIECES[piece] || PIECES.knight;
  return [
    [m, n], [m, -n], [-m, n], [-m, -n],
    [n, m], [-n, m], [n, -m], [-n, -m],
  ];
}

// Stepwise solver. Round-robin over colors; each color walks the spiral from where
// it left off and claims the first cell not occupied and not attacked by ANY OTHER
// color (same-color attacks are allowed — that asymmetry is what breeds the
// pattern). Emits the placement SEQUENCE in flat typed arrays (one entry per event:
// a placement, or an 'exhausted' turn when a color runs off the grid), records rich
// scan/threat detail for the first `detailCap` events (the narrated opening), and
// returns the finished board `occ` (0 = empty, else color+1) plus the solve time.
//
//   groups : [{ pieces:[name,...], count }] — a group's colors move as the UNION of
//            its leapers (a compound piece). Total colors = sum of counts.
//   S      : extent (half-window, in cells). Board is (2S+1)².
//   opts   : { detailCap = 300, scanCap = 600 } — pass detailCap:0 to skip all detail
//            recording (the explorer does this; it only wants `occ`).
function solveSteps(groups, S, opts) {
  opts = opts || {};
  const detailCap = opts.detailCap == null ? 300 : opts.detailCap;
  const scanCap = opts.scanCap == null ? 600 : opts.scanCap;

  const W = 2 * S + 1;
  const occ = new Int8Array(W * W);
  const threat = new Uint8Array(W * W);
  const idx = (x, y) => (y + S) * W + (x + S);
  const inGrid = (x, y) => x >= -S && x <= S && y >= -S && y <= S;

  const colorOffs = [];
  for (const g of groups) {
    const offs = g.pieces.flatMap(leaperOffsets);
    for (let i = 0; i < g.count; i++) colorOffs.push(offs);
  }
  const K = colorOffs.length;

  const cx = new Int32Array(K), cy = new Int32Array(K);
  const done = new Array(K).fill(false);
  let remaining = K;

  // The construction sequence lives in flat typed arrays (one entry per event) so it
  // scales to large extents; rich per-step detail (scan/threats) is kept only for the
  // first `detailCap` events — the narrated opening — as objects.
  const cap = W * W + K; // placements ≤ cells, plus one "exhausted" event per color
  const seqT = new Uint8Array(cap);  // 0 = placement, 1 = exhausted turn
  const seqK = new Uint8Array(cap);  // color
  const seqX = new Int16Array(cap);  // cell (placements only)
  const seqY = new Int16Array(cap);
  const detail = [];                 // {scan,threats} for events < detailCap; sparse after
  let N = 0;

  const t0 = performance.now();
  while (remaining > 0) {
    for (let k = 0; k < K; k++) {
      if (done[k]) continue;
      let x = cx[k], y = cy[k];
      const notK = (~(1 << k)) & 0xff;
      const wantDetail = N < detailCap;
      const scan = wantDetail ? [] : null; // every cell the cursor evaluated and rejected
      let off = false;
      while (true) {
        if (x > S || x < -S || y > S || y < -S) { done[k] = true; remaining--; off = true; break; }
        const id = idx(x, y);
        if (occ[id] === 0 && (threat[id] & notK) === 0) break;
        if (wantDetail && scan.length < scanCap) {
          if (occ[id] !== 0) scan.push({ x, y, kind: 'occ', by: occ[id] - 1 });
          else {
            let by = -1;
            for (let b = 0; b < K; b++) { if (b !== k && (threat[id] & (1 << b))) { by = b; break; } }
            scan.push({ x, y, kind: 'threat', by });
          }
        }
        const nxt = spiralStep(x, y);
        x = nxt[0]; y = nxt[1];
      }
      cx[k] = x; cy[k] = y;
      if (off) { seqT[N] = 1; seqK[N] = k; if (wantDetail) detail[N] = null; N++; continue; }

      const id = idx(x, y);
      occ[id] = k + 1;
      const bit = 1 << k;
      const offs = colorOffs[k];
      const threats = wantDetail ? [] : null;
      for (let o = 0; o < offs.length; o++) {
        const tx = x + offs[o][0], ty = y + offs[o][1];
        if (inGrid(tx, ty)) { threat[idx(tx, ty)] |= bit; if (wantDetail) threats.push([tx, ty]); }
      }
      seqT[N] = 0; seqK[N] = k; seqX[N] = x; seqY[N] = y;
      if (wantDetail) detail[N] = { scan, threats };
      N++;
    }
  }
  const simMs = performance.now() - t0;
  return { N, K, S, W, colorOffs, seqT, seqK, seqX, seqY, detail, occ, simMs };
}

// node only — the browser loads this as a classic script (module is undefined).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PIECES, PIECE_NAMES, spiralStep, leaperOffsets, solveSteps };
}
