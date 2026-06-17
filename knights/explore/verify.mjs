// Drift guard for ../solver.js. Fingerprints a few canonical boards and asserts
// they match known-good hashes. If you intentionally change the solver's algorithm,
// re-bless: run `node verify.mjs --bless`, paste the printed EXPECTED map below.
//
// This catches drift WITHIN solver.js. It can't notice if the live sketch's needs
// change without solver.js — but since both consumers now share this one file, the
// only way to diverge is to edit the algorithm here, which this test pins.
import solver from '../solver.js';
const { solveSteps } = solver;

// (label, groups, S) — exercise single / multi-count / compound / multi-group paths.
const CASES = [
  ['knight:2', [{ pieces: ['knight'], count: 2 }], 12],
  ['knight:3', [{ pieces: ['knight'], count: 3 }], 12],
  ['ferz-dabbaba:8', [{ pieces: ['ferz', 'dabbaba'], count: 8 }], 12],
  ['knight:2,zebra:1', [{ pieces: ['knight'], count: 2 }, { pieces: ['zebra'], count: 1 }], 12],
  ['wazir:1,ferz:1,alfil:1', [{ pieces: ['wazir'], count: 1 }, { pieces: ['ferz'], count: 1 }, { pieces: ['alfil'], count: 1 }], 12],
];

// FNV-1a 32-bit over the finished board + placed count.
function fingerprint(occ) {
  let h = 0x811c9dc5, placed = 0;
  for (let i = 0; i < occ.length; i++) {
    const v = occ[i] & 0xff; if (v) placed++;
    h ^= v; h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16).padStart(8, '0')}:${placed}`;
}

const EXPECTED = {
  'knight:2': '7267fe3c:405',
  'knight:3': 'fc66f7ec:379',
  'ferz-dabbaba:8': '5e1453c3:482',
  'knight:2,zebra:1': '2380d0fe:350',
  'wazir:1,ferz:1,alfil:1': '960feac2:496',
};

const bless = process.argv.includes('--bless');
let fail = 0;
const blessed = {};
for (const [label, groups, S] of CASES) {
  const { occ } = solveSteps(groups, S, { detailCap: 0 });
  const fp = fingerprint(occ);
  blessed[label] = fp;
  if (bless) { console.log(`  '${label}': '${fp}',`); continue; }
  const want = EXPECTED[label];
  const ok = want === fp;
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(24)} ${fp}${ok ? '' : `  (expected ${want})`}`);
}
if (bless) { console.log('\nPaste the lines above into EXPECTED.'); process.exit(0); }
if (fail) { console.error(`\n${fail} fingerprint(s) drifted — solver.js changed behavior.`); process.exit(1); }
console.log(`\nall ${CASES.length} boards match — solver.js is in sync.`);
