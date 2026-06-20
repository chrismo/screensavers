# knights/explore — offline pattern miner

The knights solve is pure and deterministic, so it runs headless in node thousands
of times a second — no browser. That makes it possible to *sweep* the roster space
(which is enormous — ~1.8×10¹⁹ structurally distinct patterns: each of up to 8 color
slots independently picks one of 255 "movers", and order matters), score each board,
and surface the rare gems instead of eyeballing one URL at a time.

It runs the **same solver as the live sketch** — [`../solver.js`](../solver.js),
imported here and loaded as a `<script src>` there. One algorithm, two consumers.

## The approach: stochastic exploration, deterministic capture

This toolchain sits at a deliberate tension. Exploration is best done *stochastically*
— wander the space, follow hunches, notice what's striking. But the things worth
keeping should be *deterministic and reproducible* — a saved roster must render the
same board every time, or the gallery is built on sand. So the split is intentional:

- **Stochastic** — proposing which corners of the space to look at, eyeballing
  montages, naming what's beautiful. Open-ended and human/Claude-driven; it doesn't
  need to be repeatable.
- **Deterministic** — the solver, the scoring, the saved rosters (`keepers.json`), and
  the drift guard (`verify.mjs`). Once something is captured, it's pinned. Re-running
  reproduces it exactly.

`picks.json` (regenerable) vs `keepers.json` (curated) is the seam between these two
modes — see "Two lists" below.

### Families are a sampling bias — and we know it

The full space (~1.8×10¹⁹ patterns, or ~19M structural *shapes* if you ignore counts
and exact pieces) is far too big to sweep whole, and most of it is visual mush (when
everything attacks everything, you get noise). So `explore.mjs` doesn't sweep the
space — it generates a few **families**: structured slices defined by a generation
rule. Each family fixes some dials (number of groups, piece-set size per group, count
shape) and sweeps the rest. To add or widen one, edit the `FAMILIES` registry in
`explore.mjs`; every pick is tagged with its family, and the sweep prints a per-family
summary so you can see which slice actually yields keepers.

The registry (counts = rosters generated):

| family  | structure                                       | ~count |
|---------|-------------------------------------------------|--------|
| **A**     | one uniform mover, 1–2 pieces, count 2–8        | 252    |
| **B**     | two single-piece colors, distinct, counts ≤8    | 1,568  |
| **C**     | one compound triple (3 pieces), count 2–8       | 392    |
| **D-bal** | three single-piece colors, balanced counts      | 672    |
| **D-dom** | three single-piece colors, one dominant (n,1,1) | 1,680  |
| **D-grad**| three single-piece colors, graded counts        | 1,344  |

A and B came first — the simplest shapes, where the original hand-found picks already
lived — chosen as a starting point, not a vetted "top two." C and the three D
sub-families followed. The piece-ordering (which color builds first) is the real size
multiplier for the D families: there are 8·7·6 = 336 ordered distinct triples, so the
count *shape* (balanced / dominant / graded) is split into its own sub-family rather
than swept as one ~19k-roster blob.

**Observed (one full sweep, 5,908 rosters):** C is the standout — it opened a whole new
dense circuit-maze "weave" genre (e.g. `knight-ferz-zebra:8`) plus strong bug-domain
boards, and landed the most top-N picks. D-dom / D-grad earn their place in the
chaotic, many-color lenses but score *zero* on `bugs` (many colors → no single big
domain for island-defects to sit in). D-bal is the weakest. The slice is still a slice
— more families (single+pair, repeated pieces across colors, four-color) remain
unexplored. Widening the registry is the main lever for finding genuinely new patterns.

### The accepted risk

Capturing deterministic scripts means baking in assumptions — the current families, the
lens definitions, the `S=90` extent — any of which a later breakthrough could overturn.
We might paint ourselves into a corner without noticing. That's an accepted trade,
mitigated by: `picks.json` is regenerable (the derivation is never lost), `keepers.json`
stores rosters as plain URLs (independent of how they were found), and `verify.mjs`
makes any change to the *solver itself* loud. So the corners we can paint into are about
*what we look at*, not *what we'd reproduce* — and those are cheap to repaint by adding a
family and re-sweeping.

## Two lists: the sweep vs. the keepers

The miner separates *what a sweep finds* (regenerable) from *the gems worth keeping*
(curated):

- **`picks.json`** — the **derivation**, emitted by `explore.mjs`: top-N per lens with
  each row's score + features + groups. Regenerated every sweep, so it's gitignored.
  This is the answer to "what's the path to these?" — re-run the sweep, read the file.
- **`keepers.json`** — the **curation**, hand-edited and committed: the gems you chose,
  each `{ name, url, link, lens, note }`. `lens` records which lens surfaced it
  ('reference' for anchors); `link` is tool-stamped from `url`. This is the durable list
  and the on-ramp to `gallery.html` / `presets[]`.

## The keep loop

Sweep → render → spot the ones you like → keep them by tile number → load them live:

```
node explore.mjs              # sweep -> picks.json
node montage.mjs picks.json   # contact sheet -> sheet.png (+ sheet.json sidecar)
node keep.mjs 6 17 22         # append tiles 6/17/22 to keepers.json (name/note = TODO)
# ...edit the TODO name/note in keepers.json...
node links.mjs                # live URLs for every keeper -> links.html
```

`keep.mjs` reads the `sheet.json` sidecar from the last `montage.mjs` run, so a tile
*index* unambiguously maps to a roster regardless of which list you rendered. It dedupes
by url and drops in `TODO` name/note for you to fill — `grep TODO keepers.json` finds
what still needs naming.

## Files

- **`score.mjs`** — shared scoring: `features(occ, K)`, the `LENSES` (scorer + filter
  each), `parseUrl`/`rosterUrl`, and `linkFor` (URL builder). One definition so the
  sweep and its output agree.
- **`explore.mjs`** — generate the families, solve + score each board, print the top
  picks per lens (plus a per-family summary), and write `picks.json`. Families live in
  the `FAMILIES` registry — **add an entry to widen the sweep.** `node explore.mjs`
  (top-12), `node explore.mjs 20` (top-20), or `node explore.mjs --family C,D` to sweep
  a subset (a token matches by name or as a prefix group, so `D` = `D-bal/D-dom/D-grad`).
- **`montage.mjs`** — render a list into one contact-sheet PNG (`sheet.png`) + a
  `sheet.json` sidecar (tile→roster map) in the Vivid palette. `node montage.mjs` (reads
  `keepers.json`) or `node montage.mjs picks.json` (renders the last sweep).
- **`keep.mjs`** — `node keep.mjs <index> ...` appends those tiles (from `sheet.json`)
  to `keepers.json` with placeholder name/note. Dedupes by url.
- **`links.mjs`** — `node links.mjs [file]` prints live URLs for a list and writes a
  clickable `links.html` ("open all in tabs"). `--base <url>` for local/other hosts,
  `--params <str>` to override the default `palette=0&static=1`. `--stamp` writes a
  canonical `link` field into each `keepers.json` entry (derived from `url`, so it
  never drifts) — re-run it after editing rosters.
- **`png.mjs`** — no-deps truecolor PNG encoder (node zlib) + the Vivid palette ported
  from `sketch.js`'s `genColors`, so thumbnails match the live colors.
- **`verify.mjs`** — drift guard: fingerprints canonical boards and asserts they match
  known-good hashes. `node verify.mjs`

Committed: source + `keepers.json` (the curated list). Gitignored (regenerable):
`sheet.png`, `sheet.json`, `picks.json`, `links.html`.

## Reproducing a find

Every roster maps to a live URL. `knight:1,threeleaper:1` →
`../?groups=knight:1,threeleaper:1` (a group is `pieceset:count`; compound pieces are
dash-joined, e.g. `ferz-dabbaba:8`). Add `&palette=`/`&extent=`/`&static=1` to taste.

## The one caveat

The solver now lives in a single shared file, so there's no hand-copied port to drift
— the only way to change behavior is to edit `../solver.js` itself. If you do that
**intentionally**, re-bless the guard: `node verify.mjs --bless`, paste the printed
`EXPECTED` map back into `verify.mjs`. If `verify.mjs` fails when you *didn't* mean to
change the algorithm, that's the guard doing its job.
