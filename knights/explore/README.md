# knights/explore — offline pattern miner

The knights solve is pure and deterministic, so it runs headless in node thousands
of times a second — no browser. That makes it possible to *sweep* the roster space
(which is enormous — ~1.8×10¹⁹ structurally distinct patterns: each of up to 8 color
slots independently picks one of 255 "movers", and order matters), score each board,
and surface the rare gems instead of eyeballing one URL at a time.

It runs the **same solver as the live sketch** — [`../solver.js`](../solver.js),
imported here and loaded as a `<script src>` there. One algorithm, two consumers.

## Files

- **`explore.mjs`** — sweep a tractable slice of rosters, score each board (dominance,
  edge density, connected-component "islands", symmetry), print the top picks per
  *lens* (BUGS / CHAOS / SYMMETRY / WEAVES). `node explore.mjs`
- **`montage.mjs`** — render a curated `PICKS` list into one contact-sheet PNG
  (`sheet.png`, gitignored) in the Vivid palette + a tile→URL legend. Edit `PICKS`,
  then `node montage.mjs`.
- **`png.mjs`** — no-deps truecolor PNG encoder (node zlib) + the Vivid palette ported
  from `sketch.js`'s `genColors`, so thumbnails match the live colors.
- **`verify.mjs`** — drift guard: fingerprints canonical boards and asserts they match
  known-good hashes. `node verify.mjs`

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
