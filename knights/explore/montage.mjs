// Render a curated set of rosters into one contact-sheet PNG (Vivid palette) and
// print a tile->URL legend. Edit PICKS, then: node montage.mjs
import { writeFileSync } from 'node:fs';
import solver from '../solver.js';
import { encodePNG, vividColors, BG } from './png.mjs';
const { solveSteps } = solver;
const solve = (groups, S) => solveSteps(groups, S, { detailCap: 0 });

// Curated spread across the lenses (see explore.mjs output to refresh these).
const PICKS = [
  'knight:2',                  // Red & Black (reference)
  'knight:3',
  'knight:1,threeleaper:1',    // BUGS: big domain, few islands
  'knight:1,alfil:1',          // BUGS: minimal — one crack across a solid field
  'dabbaba:1,zebra:1',         // BUGS: clustered diagonal defects
  'knight-threeleaper:2',      // diagonal "circuit-board" bar
  'ferz:1,knight:1',           // SYMMETRY: 8-pointed pinwheel (sym 0.97)
  'alfil:1,knight:1',          // SYMMETRY
  'alfil-antelope:2',          // SYMMETRY: compass starburst
  'knight-antelope:2',         // SYMMETRY: fuzzy diagonal cross
  'wazir:2,knight:2',          // CHAOS
  'knight:4,wazir:3',          // CHAOS, 7 colors
  'ferz:2,wazir:4',            // CHAOS, 6 colors — purple spider-burst
  'knight-dabbaba:8',          // WEAVE: 8-color confetti pinwheel
  'knight-ferz:8',             // WEAVE: 8-color kaleidoscope
  'wazir-ferz:8',              // WEAVE: pastel pinwheel wedges
  'threeleaper:1,knight:4',    // CHAOS, 5 colors — circuit bar
  'zebra:1,alfil:1',           // SYMMETRY: radial sunburst
];

function parse(url) {
  return url.split(',').map((part) => {
    const [pcs, ct] = part.split(':');
    return { pieces: pcs.split('-'), count: Math.max(1, parseInt(ct, 10) || 1) };
  });
}

const S = 90, W = 2 * S + 1;     // 181px per tile
const COLS = 6, PAD = 6;
const rows = Math.ceil(PICKS.length / COLS);
const SHEETW = COLS * W + (COLS + 1) * PAD;
const SHEETH = rows * W + (rows + 1) * PAD;
const sheet = new Uint8Array(SHEETW * SHEETH * 3);
for (let i = 0; i < SHEETW * SHEETH; i++) { sheet[i * 3] = 30; sheet[i * 3 + 1] = 30; sheet[i * 3 + 2] = 36; }

PICKS.forEach((url, t) => {
  const { occ, K } = solve(parse(url), S);
  const cols = vividColors(K);
  const tx = PAD + (t % COLS) * (W + PAD);
  const ty = PAD + Math.floor(t / COLS) * (W + PAD);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const v = occ[y * W + x];
    const c = v ? cols[v - 1] : BG;
    const px = ((ty + y) * SHEETW + (tx + x)) * 3;
    sheet[px] = c[0]; sheet[px + 1] = c[1]; sheet[px + 2] = c[2];
  }
  console.log(`tile ${String(t).padStart(2)} [r${Math.floor(t / COLS)} c${t % COLS}]  ${url}`);
});

const png = encodePNG(sheet, SHEETW, SHEETH);
const out = new URL('./sheet.png', import.meta.url).pathname;
writeFileSync(out, png);
console.log(`\nwrote ${out}  (${SHEETW}x${SHEETH}, ${(png.length / 1024).toFixed(0)}kb)`);
