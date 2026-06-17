// Sweep a tractable slice of the roster space, score each board, print the top
// candidates per "lens". The solver is the live one (../solver.js) — see README.
//   node explore.mjs
import solver from '../solver.js';
const { solveSteps, PIECE_NAMES } = solver;
const solve = (groups, S) => solveSteps(groups, S, { detailCap: 0 }); // board only, no detail

// ---- candidate generation ------------------------------------------------
// Family A: ONE group, piece-set of 1 or 2 pieces, count 2..8.
// Family B: TWO single-piece groups (ordered), distinct pieces, counts a+b<=8.
function rosterUrl(groups) {
  return groups.map((g) => `${g.pieces.join('-')}:${g.count}`).join(',');
}
const cands = [];
const P = PIECE_NAMES;
for (const p of P) for (let n = 2; n <= 8; n++) cands.push([{ pieces: [p], count: n }]);
for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++)
  for (let n = 2; n <= 8; n++) cands.push([{ pieces: [P[i], P[j]], count: n }]);
for (const a of P) for (const b of P) {
  if (a === b) continue;
  for (let ca = 1; ca <= 7; ca++) for (let cb = 1; cb <= 8 - ca; cb++)
    cands.push([{ pieces: [a], count: ca }, { pieces: [b], count: cb }]);
}

// ---- scoring -------------------------------------------------------------
const S = 90, W = 2 * S + 1;
function features(occ, K) {
  const counts = new Array(K + 1).fill(0);
  let placed = 0;
  for (let i = 0; i < occ.length; i++) { const v = occ[i]; if (v) { counts[v]++; placed++; } }
  if (!placed) return null;
  let used = 0; for (let k = 1; k <= K; k++) if (counts[k]) used++;
  const dom = Math.max(...counts.slice(1)) / placed;
  // edge density: among adjacent placed pairs (right + up), fraction differing
  let eTot = 0, eDiff = 0;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const v = occ[y * W + x]; if (!v) continue;
    if (x + 1 < W) { const r = occ[y * W + x + 1]; if (r) { eTot++; if (r !== v) eDiff++; } }
    if (y + 1 < W) { const u = occ[(y + 1) * W + x]; if (u) { eTot++; if (u !== v) eDiff++; } }
  }
  const edge = eTot ? eDiff / eTot : 0;
  // structure: how much LESS edgy than a random coloring with this domain mix
  const pRand = used > 1 ? 1 - counts.slice(1).reduce((s, c) => s + (c / placed) ** 2, 0) : 0;
  const structure = pRand > 0 ? Math.max(0, 1 - edge / pRand) : 0;
  // symmetry: same-color match under 180deg rotation and main-diagonal transpose
  let sTot = 0, rMatch = 0, tMatch = 0;
  for (let y = 0; y < W; y += 2) for (let x = 0; x < W; x += 2) {
    const v = occ[y * W + x]; if (!v) continue; sTot++;
    if (occ[(W - 1 - y) * W + (W - 1 - x)] === v) rMatch++;
    if (occ[x * W + y] === v) tMatch++;
  }
  const sym = sTot ? Math.max(rMatch, tMatch) / sTot : 0;
  // connected components (4-neighbour, same colour): largest CC fraction + count of
  // small "island" defects (size 2..30) — the "big domain + rare bugs" signature.
  const seen = new Uint8Array(occ.length);
  const stack = new Int32Array(occ.length);
  let lcc = 0, islands = 0, compCount = 0;
  for (let i = 0; i < occ.length; i++) {
    const v = occ[i]; if (!v || seen[i]) continue;
    let sp = 0; stack[sp++] = i; seen[i] = 1; let sz = 0;
    while (sp) {
      const c = stack[--sp]; sz++;
      const cx = c % W, cy = (c - cx) / W;
      if (cx + 1 < W && !seen[c + 1] && occ[c + 1] === v) { seen[c + 1] = 1; stack[sp++] = c + 1; }
      if (cx - 1 >= 0 && !seen[c - 1] && occ[c - 1] === v) { seen[c - 1] = 1; stack[sp++] = c - 1; }
      if (cy + 1 < W && !seen[c + W] && occ[c + W] === v) { seen[c + W] = 1; stack[sp++] = c + W; }
      if (cy - 1 >= 0 && !seen[c - W] && occ[c - W] === v) { seen[c - W] = 1; stack[sp++] = c - W; }
    }
    compCount++;
    if (sz > lcc) lcc = sz;
    if (sz >= 2 && sz <= 30) islands++;
  }
  return { placed, fill: placed / (W * W), used, dom, edge, structure, sym,
    lcc: lcc / placed, islands, comps: compCount };
}

const rows = [];
const t0 = performance.now();
for (const g of cands) {
  const { occ, K } = solve(g, S);
  const f = features(occ, K);
  if (f) rows.push({ url: rosterUrl(g), K, ...f });
}
const dt = performance.now() - t0;

// ---- lenses --------------------------------------------------------------
function top(label, scorer, filter = () => true, n = 12) {
  const r = rows.filter(filter).map((x) => ({ ...x, s: scorer(x) })).sort((a, b) => b.s - a.s).slice(0, n);
  console.log(`\n### ${label}`);
  for (const x of r) console.log(
    `${x.s.toFixed(3)}  dom=${x.dom.toFixed(2)} lcc=${x.lcc.toFixed(2)} isl=${String(x.islands).padStart(3)} edge=${x.edge.toFixed(2)} struct=${x.structure.toFixed(2)} sym=${x.sym.toFixed(2)} used=${x.used}/${x.K} fill=${(x.fill * 100).toFixed(0)}%  ${x.url}`);
}
console.log(`scored ${rows.length} rosters in ${dt.toFixed(0)}ms`);
const crystalline = (x) => x.structure > 0.97 && x.sym > 0.95; // perfect lattice = boring
top('BUGS     (big solid domain + rare island defects)',
  (x) => x.lcc * Math.min(x.islands, 12) / 12, (x) => x.lcc > 0.25 && x.islands >= 1 && !crystalline(x));
top('CHAOS    (structured but NOT a crystal — turbulent w/ order)',
  (x) => x.structure * (1 - x.sym), (x) => x.structure > 0.4 && x.structure < 0.95 && x.fill > 0.4 && !crystalline(x));
top('SYMMETRY (180deg / diagonal self-match, non-trivial)',
  (x) => x.sym * x.structure, (x) => x.used >= 2 && x.fill > 0.3 && x.structure < 0.97);
top('WEAVES   (many colors, structured, balanced)',
  (x) => x.structure * x.used * (1 - x.dom), (x) => x.used >= 3 && x.fill > 0.3 && x.structure < 0.99 && !crystalline(x));
