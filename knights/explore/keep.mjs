// Keep tiles from the last montage render into keepers.json, by tile index.
//   node montage.mjs picks.json     # render a sweep, writes sheet.json
//   node keep.mjs 6 17 22           # append those tiles to keepers.json
//
// Pulls url + lens from sheet.json (the sidecar montage wrote), drops in placeholder
// name/note for you to edit, and dedupes by url. Run montage again afterward to see
// your keepers. Grep keepers.json for "TODO" to find ones still needing a name/note.
import { readFileSync, writeFileSync } from 'node:fs';
import { linkFor } from './score.mjs';

const here = (f) => new URL(`./${f}`, import.meta.url).pathname;
const idxs = process.argv.slice(2).map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
if (!idxs.length) {
  console.error('usage: node keep.mjs <index> [<index> ...]   (indices from the last `node montage.mjs` render)');
  process.exit(1);
}

let sheet;
try { sheet = JSON.parse(readFileSync(here('sheet.json'))); }
catch { console.error('no sheet.json — run `node montage.mjs <file>` first to render a sheet.'); process.exit(1); }
const byIndex = new Map(sheet.tiles.map((t) => [t.index, t]));

const data = JSON.parse(readFileSync(here('keepers.json')));
const have = new Set(data.keepers.map((k) => k.url));

let added = 0;
for (const i of idxs) {
  const tile = byIndex.get(i);
  if (!tile) { console.log(`skip ${i}: no such tile in sheet.json (it has ${sheet.tiles.length} tiles)`); continue; }
  if (have.has(tile.url)) { console.log(`skip ${i}: ${tile.url} already kept`); continue; }
  data.keepers.push({ name: 'TODO', url: tile.url, link: linkFor(tile.url), lens: tile.lens || 'unknown', ...(tile.family ? { family: tile.family } : {}), note: 'TODO' });
  have.add(tile.url);
  added++;
  console.log(`kept ${i}: ${tile.url} [${tile.lens || 'unknown'}]  (name/note = TODO)`);
}

if (added) {
  writeFileSync(here('keepers.json'), JSON.stringify(data, null, 2) + '\n');
  console.log(`\n+${added} keeper(s) -> keepers.json. Edit the TODO name/note, then \`node montage.mjs\` to view.`);
} else {
  console.log('\nnothing added.');
}
