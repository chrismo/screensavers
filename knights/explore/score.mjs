// Shared scoring + roster helpers for the miner. explore.mjs sweeps with these and
// emits picks.json; montage.mjs uses parseUrl to render. One definition of "the
// lenses" so the sweep and its output never disagree.

export const S = 90, W = 2 * S + 1; // sweep extent: 181x181 board

export function rosterUrl(groups) {
  return groups.map((g) => `${g.pieces.join('-')}:${g.count}`).join(',');
}
export function parseUrl(url) {
  return url.split(',').map((part) => {
    const [pcs, ct] = part.split(':');
    return { pieces: pcs.split('-'), count: Math.max(1, parseInt(ct, 10) || 1) };
  });
}

// Canonical live link for a roster `url` (the groups string). One definition so the
// stamped keepers.json links and links.html agree. `static=1` shows the finished
// pattern instantly; palette=0 is Vivid (matches the thumbnails).
export const BASE = 'https://chrismo.github.io/screensavers/knights/';
export const DEFAULT_PARAMS = 'palette=0&static=1';
export function linkFor(url, base = BASE, params = DEFAULT_PARAMS) {
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}groups=${url}${params ? '&' + params : ''}`;
}

// Board features over the placed cells. occ: Int8Array (0 empty, else color+1).
export function features(occ, K) {
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

const crystalline = (x) => x.structure > 0.97 && x.sym > 0.95; // perfect lattice = boring

// The lenses: each scores rows (with features merged in) and filters out non-members.
export const LENSES = [
  { name: 'bugs', label: 'big solid domain + rare island defects',
    score: (x) => x.lcc * Math.min(x.islands, 12) / 12,
    filter: (x) => x.lcc > 0.25 && x.islands >= 1 && !crystalline(x) },
  { name: 'chaos', label: 'structured but NOT a crystal — turbulent w/ order',
    score: (x) => x.structure * (1 - x.sym),
    filter: (x) => x.structure > 0.4 && x.structure < 0.95 && x.fill > 0.4 && !crystalline(x) },
  { name: 'symmetry', label: '180deg / diagonal self-match, non-trivial',
    score: (x) => x.sym * x.structure,
    filter: (x) => x.used >= 2 && x.fill > 0.3 && x.structure < 0.97 },
  { name: 'weaves', label: 'many colors, structured, balanced',
    score: (x) => x.structure * x.used * (1 - x.dom),
    filter: (x) => x.used >= 3 && x.fill > 0.3 && x.structure < 0.99 && !crystalline(x) },
];
