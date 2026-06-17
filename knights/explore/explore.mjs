// Sweep a tractable slice of the roster space, score each board, print the top
// candidates per lens, and EMIT picks.json (the regenerable derivation: top-N per
// lens with score + features + groups). montage.mjs can render that file.
//   node explore.mjs            # sweep, print, write picks.json
//   node explore.mjs 20         # top-20 per lens instead of 12
import { writeFileSync } from 'node:fs';
import solver from '../solver.js';
import { S, rosterUrl, features, LENSES } from './score.mjs';
const { solveSteps, PIECE_NAMES } = solver;
const solve = (groups) => solveSteps(groups, S, { detailCap: 0 }); // board only, no detail
const TOP_N = Math.max(1, parseInt(process.argv[2], 10) || 12);

// ---- candidate generation ------------------------------------------------
// Family A: ONE group, piece-set of 1 or 2 pieces, count 2..8.
// Family B: TWO single-piece groups (ordered), distinct pieces, counts a+b<=8.
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

// ---- sweep ---------------------------------------------------------------
const rows = [];
const t0 = performance.now();
for (const g of cands) {
  const { occ, K } = solve(g);
  const f = features(occ, K);
  if (f) rows.push({ url: rosterUrl(g), groups: g, K, ...f });
}
const dt = performance.now() - t0;
console.log(`scored ${rows.length} rosters in ${dt.toFixed(0)}ms\n`);

// ---- rank per lens, print + collect for picks.json -----------------------
const round = (x, n = 2) => Math.round(x * 10 ** n) / 10 ** n;
const picks = [];
for (const lens of LENSES) {
  const ranked = rows.filter(lens.filter).map((x) => ({ ...x, s: lens.score(x) }))
    .sort((a, b) => b.s - a.s).slice(0, TOP_N);
  console.log(`### ${lens.name.toUpperCase()}  (${lens.label})`);
  ranked.forEach((x, i) => {
    console.log(`${x.s.toFixed(3)}  dom=${x.dom.toFixed(2)} lcc=${x.lcc.toFixed(2)} isl=${String(x.islands).padStart(3)} struct=${x.structure.toFixed(2)} sym=${x.sym.toFixed(2)} used=${x.used}/${x.K} fill=${(x.fill * 100).toFixed(0)}%  ${x.url}`);
    picks.push({
      lens: lens.name, rank: i + 1, url: x.url, score: round(x.s, 3), groups: x.groups,
      features: {
        dom: round(x.dom), lcc: round(x.lcc), islands: x.islands, edge: round(x.edge),
        structure: round(x.structure), sym: round(x.sym), used: x.used, K: x.K, fill: round(x.fill, 3),
      },
    });
  });
  console.log('');
}

const out = new URL('./picks.json', import.meta.url).pathname;
writeFileSync(out, JSON.stringify({ extent: S, topN: TOP_N, lenses: LENSES.map((l) => l.name), picks }, null, 2) + '\n');
console.log(`wrote ${out}  (${picks.length} picks, top ${TOP_N} x ${LENSES.length} lenses)`);
