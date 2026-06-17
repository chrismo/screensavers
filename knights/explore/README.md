# knights/explore — offline pattern miner

The knights solve is pure and deterministic, so it runs headless in node thousands
of times a second — no browser. That makes it possible to *sweep* the roster space
(which is enormous — ~1.8×10¹⁹ structurally distinct patterns: each of up to 8 color
slots independently picks one of 255 "movers", and order matters), score each board,
and surface the rare gems instead of eyeballing one URL at a time.

It runs the **same solver as the live sketch** — [`../solver.js`](../solver.js),
imported here and loaded as a `<script src>` there. One algorithm, two consumers.

## Two lists: the sweep vs. the keepers

The miner separates *what a sweep finds* (regenerable) from *the gems worth keeping*
(curated):

- **`picks.json`** — the **derivation**, emitted by `explore.mjs`: top-N per lens with
  each row's score + features + groups. Regenerated every sweep, so it's gitignored.
  This is the answer to "what's the path to these?" — re-run the sweep, read the file.
- **`keepers.json`** — the **curation**, hand-edited and committed: the gems you chose,
  each `{ name, url, lens, note }`. `lens` records which lens surfaced it ('reference'
  for anchors). This is the durable list and the on-ramp to `gallery.html` / `presets[]`.

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
  each), and `parseUrl`/`rosterUrl`. One definition so the sweep and its output agree.
- **`explore.mjs`** — sweep a tractable slice of rosters, print the top picks per lens,
  and write `picks.json`. `node explore.mjs` (or `node explore.mjs 20` for top-20).
- **`montage.mjs`** — render a list into one contact-sheet PNG (`sheet.png`) + a
  `sheet.json` sidecar (tile→roster map) in the Vivid palette. `node montage.mjs` (reads
  `keepers.json`) or `node montage.mjs picks.json` (renders the last sweep).
- **`keep.mjs`** — `node keep.mjs <index> ...` appends those tiles (from `sheet.json`)
  to `keepers.json` with placeholder name/note. Dedupes by url.
- **`links.mjs`** — `node links.mjs [file]` prints live URLs for a list and writes a
  clickable `links.html` ("open all in tabs"). `--base <url>` for local/other hosts,
  `--params <str>` to override the default `palette=0&static=1`.
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
