// Render a saved list of rosters into one contact-sheet PNG (Vivid palette) + a
// tile->name/url legend. Reads keepers.json by default; pass another file to render
// a different list (e.g. the latest sweep):
//   node montage.mjs              # render keepers.json
//   node montage.mjs picks.json   # render the last explore.mjs sweep
import { readFileSync, writeFileSync } from 'node:fs';
import solver from '../solver.js';
import { parseUrl } from './score.mjs';
import { encodePNG, vividColors, BG } from './png.mjs';
const { solveSteps } = solver;

const file = process.argv[2] || 'keepers.json';
const data = JSON.parse(readFileSync(new URL(`./${file}`, import.meta.url)));
// Accept either shape: { keepers:[{name,url,...}] } or { picks:[{url,lens,...}] }.
const list = data.keepers || data.picks || data;
if (!Array.isArray(list) || !list.length) { console.error(`no entries in ${file}`); process.exit(1); }

const S = 90, W = 2 * S + 1;     // 181px per tile
const COLS = 6, PAD = 6;
const rows = Math.ceil(list.length / COLS);
const SHEETW = COLS * W + (COLS + 1) * PAD;
const SHEETH = rows * W + (rows + 1) * PAD;
const sheet = new Uint8Array(SHEETW * SHEETH * 3);
for (let i = 0; i < SHEETW * SHEETH; i++) { sheet[i * 3] = 30; sheet[i * 3 + 1] = 30; sheet[i * 3 + 2] = 36; }

const manifest = []; // sidecar: what each tile index actually is, for keep.mjs
list.forEach((entry, t) => {
  const { occ, K } = solveSteps(parseUrl(entry.url), S, { detailCap: 0 });
  const cols = vividColors(K);
  const r = Math.floor(t / COLS), c = t % COLS;
  const tx = PAD + c * (W + PAD);
  const ty = PAD + r * (W + PAD);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const v = occ[y * W + x];
    const col = v ? cols[v - 1] : BG;
    const px = ((ty + y) * SHEETW + (tx + x)) * 3;
    sheet[px] = col[0]; sheet[px + 1] = col[1]; sheet[px + 2] = col[2];
  }
  manifest.push({ index: t, r, c, ...entry });
  const label = entry.name ? `${entry.name} — ${entry.url}` : entry.url;
  const tagBits = [entry.family, entry.lens].filter(Boolean).join('/');
  const tag = tagBits ? ` [${tagBits}]` : '';
  console.log(`tile ${String(t).padStart(2)} [r${r} c${c}]  ${label}${tag}`);
});

const png = encodePNG(sheet, SHEETW, SHEETH);
const out = new URL('./sheet.png', import.meta.url).pathname;
writeFileSync(out, png);
// sidecar manifest so `keep.mjs <index>` knows exactly what each tile was
const sidecar = new URL('./sheet.json', import.meta.url).pathname;
writeFileSync(sidecar, JSON.stringify({ source: file, extent: S, cols: COLS, tiles: manifest }, null, 2) + '\n');
console.log(`\n${list.length} tiles from ${file} -> ${out}  (${SHEETW}x${SHEETH}, ${(png.length / 1024).toFixed(0)}kb)`);
console.log(`sidecar -> ${sidecar}  (keep tiles with: node keep.mjs <index> ...)`);
