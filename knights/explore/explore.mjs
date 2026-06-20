// Sweep a few structured FAMILIES of the roster space, score each board, print the top
// candidates per lens, and EMIT picks.json (the regenerable derivation: top-N per lens
// with score + features + groups, each tagged with the family that produced it).
//   node explore.mjs                  # sweep all families, print, write picks.json
//   node explore.mjs 20               # top-20 per lens instead of 12
//   node explore.mjs --family C,D     # only some families (prefix: D = D-bal/D-dom/D-grad)
//   node explore.mjs 20 --family A    # combine: top-20, family A only
//
// A "family" is a generation rule: it fixes some structural dials (number of color
// groups, piece-set size per group, count shape) and sweeps the rest. The families are
// a deliberate, tractable SLICE of the ~1.8e19 space — see README "Families are a
// sampling bias". To add or widen one, edit the FAMILIES registry below.
import { writeFileSync } from 'node:fs';
import solver from '../solver.js';
import { S, rosterUrl, features, LENSES } from './score.mjs';
const { solveSteps, PIECE_NAMES } = solver;
const solve = (groups) => solveSteps(groups, S, { detailCap: 0 }); // board only, no detail

const P = PIECE_NAMES;
// ordered distinct piece-triples (8*7*6 = 336); order matters — color 0 builds first.
function* triples3() {
  for (const a of P) for (const b of P) { if (b === a) continue;
    for (const c of P) { if (c === a || c === b) continue; yield [a, b, c]; } }
}
const GRAD = [[3, 2, 1], [4, 2, 1], [5, 2, 1], [4, 3, 1]]; // distinct descending counts, sum<=8

// ---- family registry -----------------------------------------------------
// Each family: { name, label, *gen() } yielding `groups` arrays. Add an entry to widen
// the sweep; every pick + montage tile is tagged with the family that produced it, so
// the per-family summary tells you which structural slice actually yields keepers.
const FAMILIES = [
  { name: 'A', label: 'one uniform mover (1-2 pieces)', *gen() {
      for (const p of P) for (let n = 2; n <= 8; n++) yield [{ pieces: [p], count: n }];
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++)
        for (let n = 2; n <= 8; n++) yield [{ pieces: [P[i], P[j]], count: n }];
    } },
  { name: 'B', label: 'two single-piece colors', *gen() {
      for (const a of P) for (const b of P) { if (a === b) continue;
        for (let ca = 1; ca <= 7; ca++) for (let cb = 1; cb <= 8 - ca; cb++)
          yield [{ pieces: [a], count: ca }, { pieces: [b], count: cb }]; }
    } },
  { name: 'C', label: 'one compound triple (3 pieces)', *gen() {
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++)
        for (let k = j + 1; k < P.length; k++)
          for (let n = 2; n <= 8; n++) yield [{ pieces: [P[i], P[j], P[k]], count: n }];
    } },
  { name: 'D-bal', label: 'three colors, balanced counts', *gen() {
      for (const [a, b, c] of triples3()) for (const n of [1, 2])
        yield [{ pieces: [a], count: n }, { pieces: [b], count: n }, { pieces: [c], count: n }];
    } },
  { name: 'D-dom', label: 'three colors, one dominant (n,1,1)', *gen() {
      for (const [a, b, c] of triples3()) for (let n = 2; n <= 6; n++)
        yield [{ pieces: [a], count: n }, { pieces: [b], count: 1 }, { pieces: [c], count: 1 }];
    } },
  { name: 'D-grad', label: 'three colors, graded counts', *gen() {
      for (const [a, b, c] of triples3()) for (const [na, nb, nc] of GRAD)
        yield [{ pieces: [a], count: na }, { pieces: [b], count: nb }, { pieces: [c], count: nc }];
    } },
];

// ---- args: [topN] [--family A,C] -----------------------------------------
const argv = process.argv.slice(2);
let TOP_N = 12, famSel = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--family' || a === '--fam') famSel = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
  else if (/^\d+$/.test(a)) TOP_N = Math.max(1, parseInt(a, 10));
}
// a selector token matches a family by exact name or as a prefix group ("D" -> D-*).
const matches = (name) => !famSel || famSel.some((t) => name === t || name.startsWith(t + '-'));
const active = FAMILIES.filter((f) => matches(f.name));
if (!active.length) {
  console.error(`no families match ${famSel.join(',')}; known: ${FAMILIES.map((f) => f.name).join(', ')}`);
  process.exit(1);
}

// ---- sweep (dedup by url, first family wins) -----------------------------
const rows = [];
const seen = new Map(); // url -> family that first produced it
const stats = new Map(active.map((f) => [f.name, { gen: 0, scored: 0, shadowed: 0 }]));
const t0 = performance.now();
for (const fam of active) {
  const st = stats.get(fam.name);
  for (const g of fam.gen()) {
    st.gen++;
    const url = rosterUrl(g);
    if (seen.has(url)) { st.shadowed++; continue; }
    seen.set(url, fam.name);
    const { occ, K } = solve(g);
    const f = features(occ, K);
    if (!f) continue;
    st.scored++;
    rows.push({ family: fam.name, url, groups: g, K, ...f });
  }
}
const dt = performance.now() - t0;
console.log(`scored ${rows.length} rosters across ${active.length} families in ${dt.toFixed(0)}ms\n`);

// ---- rank per lens, print + collect for picks.json -----------------------
const round = (x, n = 2) => Math.round(x * 10 ** n) / 10 ** n;
const picks = [];
for (const lens of LENSES) {
  const ranked = rows.filter(lens.filter).map((x) => ({ ...x, s: lens.score(x) }))
    .sort((a, b) => b.s - a.s).slice(0, TOP_N);
  console.log(`### ${lens.name.toUpperCase()}  (${lens.label})`);
  ranked.forEach((x, i) => {
    console.log(`${x.s.toFixed(3)}  ${x.family.padEnd(6)} dom=${x.dom.toFixed(2)} lcc=${x.lcc.toFixed(2)} isl=${String(x.islands).padStart(3)} struct=${x.structure.toFixed(2)} sym=${x.sym.toFixed(2)} used=${x.used}/${x.K} fill=${(x.fill * 100).toFixed(0)}%  ${x.url}`);
    picks.push({
      lens: lens.name, rank: i + 1, family: x.family, url: x.url, score: round(x.s, 3), groups: x.groups,
      features: {
        dom: round(x.dom), lcc: round(x.lcc), islands: x.islands, edge: round(x.edge),
        structure: round(x.structure), sym: round(x.sym), used: x.used, K: x.K, fill: round(x.fill, 3),
      },
    });
  });
  console.log('');
}

// ---- per-family summary: which slice yields keepers ----------------------
// For each family: how many it generated/scored, lens survivors (passed each filter),
// and how many distinct picks it landed in the printed top-N. This is the head-to-head
// signal — a family that generates thousands but lands zero top-N picks is a dead slice.
console.log(`### PER-FAMILY  (gen -> scored, lens survivors, then top-${TOP_N} hits)`);
for (const fam of active) {
  const st = stats.get(fam.name);
  const survivors = LENSES.map((l) => `${l.name} ${rows.filter((r) => r.family === fam.name && l.filter(r)).length}`).join('  ');
  const hits = picks.filter((p) => p.family === fam.name).length;
  const sh = st.shadowed ? ` (${st.shadowed} dup)` : '';
  console.log(`${fam.name.padEnd(7)} gen ${String(st.gen).padStart(5)} -> scored ${String(st.scored).padStart(5)}${sh}   ${survivors}   ★ ${hits}`);
}
console.log('');

const out = new URL('./picks.json', import.meta.url).pathname;
const meta = { extent: S, topN: TOP_N,
  families: active.map((f) => ({ name: f.name, label: f.label, ...stats.get(f.name) })),
  lenses: LENSES.map((l) => l.name), picks };
writeFileSync(out, JSON.stringify(meta, null, 2) + '\n');
console.log(`wrote ${out}  (${picks.length} picks, top ${TOP_N} x ${LENSES.length} lenses, ${active.length} families)`);
