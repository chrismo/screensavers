# ideas — cross-sketch backlog

Deferred ideas that aren't specific to one sketch. When built, most of these
probably belong in the shared infrastructure (`panel.js` / `chrome.js`) so every
sketch benefits, rather than being reimplemented per sketch. Sketch-specific
ideas live in that sketch's own notes (e.g. `knights/spec.md`).

## Preset banks / URL-carried presets

Applies to any sketch that has presets **and** a state-encoding "copy screensaver
URL" (knights, petri-dish, …).

**Key realization: banks are pure navigation.** The copy-share URL already encodes
the full state (groups / params), so however the quick-pick is organized, copied
URLs keep reproducing exactly. Banks only change what the `0–9` keys and the panel
pills point at — they don't touch reproduction.

Two sizes, smallest first:

- **URL-carried bank (the lighter, preferred first step).** A URL param that
  carries a whole bank of (up to ~8) presets — a list of the sketch's own
  preset-specs, e.g. `?presets=<spec>;<spec>;…`. Then a "collection" is just a
  **bookmarked URL**: favorites can be gathered anywhere you keep links (browser
  bookmarks, a text file, a gist) instead of being baked into the code. The 8
  slots / `0–9` keys map to whatever the URL supplies, falling back to the
  built-in bank when the param is absent.

- **Multiple banks of 8 (the fuller version).** N banks (e.g. 32 presets in 4
  banks), inline or in an external `presets.js` (loaded like `panel.js`), with a
  **hotkey to cycle banks** (`B` / `Shift-B`) + `?bank=`. Mechanism = banks/pages
  of 8 so the `0–9` muscle memory survives; route the existing
  pick/cycle/pills/selection logic through a `curBank()`, and regenerate the pills
  on switch. A between-runs cycle (knights' `L`) rolls within the active bank,
  optionally rolling over into the next.

**Where it should live:** ideally shared in `panel.js`, with each sketch supplying
its own preset-spec encode/decode, so all sketches get banks uniformly. Related
note: some sketches are light on shortcuts (knights) vs. heavy (petri-dish has
many) — there's room to grow more fine-tuned per-sketch controls, and a bank
hotkey is a natural first one.

(Noted 2026-06-12; not needed now — captured for if/when collecting presets
becomes a thing.)

## Pattern taxonomy / output fingerprinting

Applies to any generative sketch whose output is a field/image worth
characterizing (knights' colored spiral, petri-dish's trails, …). Idea: compute a
small **fingerprint** of metrics from the rendered output so different "kinds" of
patterns can be categorized — then auto-label, auto-curate, or sample for
variety. Composes with **preset banks** above (auto-curated banks = one exemplar
per cluster).

Two complementary angles (worked example = knights):

- **By output — measure the field.** knights' `occGrid` (color per cell) yields
  cheap, discriminating metrics. The key: *no single metric works* — you need a
  few, because e.g. checkerboard and chaos both have lots of edges but differ
  wildly in periodicity. A usable set:
  - **periodicity** (FFT-peak ratio / autocorrelation) — repeats vs not
  - **region size** (mean contiguous same-color blob) — fragmented vs large
  - **local entropy** (color diversity in NxN windows) — busy vs ordered
  - **anisotropy** (directional autocorrelation) — diagonal bands vs radial
    pinwheel vs isotropic chaos

  Families seen so far separate on these: clean diagonal **bands** (pure knights),
  **checkerboard** (wazir ×2), **pinwheel/radial** (wazir+ferz ×6), **quilt**
  (ferz+dab ×8), **turbulent mosaic** (mixed-reach compounds, e.g. knight+antelope
  ×2). Computable from data we already have; full FFT at S=1000 (≈4M cells) wants
  downsampling, but region-size + windowed-entropy are cheap as-is.
  - *Sub-feature — defects.* Large solid domains can carry tiny **defects**: lone
    specks or little "bug" knots of empty + stolen cells. Two kinds seen so far —
    **interior islands** (specks deep inside a solid field, seeded by a single
    long-reach piece vetoing one cell) and **domain-wall** defects (blooms along
    the empty-cell borders between domains). Only appear with long-reach compound
    pieces in the roster. (Worked example: `knights/gallery.html`.)

- **By input — predict from the roster** (cheaper, surprisingly strong). Often you
  can call the family before solving:
  - **# of distinct reaches** (Chebyshev radius per leaper): same reach → orderly;
    *mixed* reaches → chaos (the knight-2 + antelope-4 discovery).
  - **# colors (K)** — more interference.
  - **colorboundness** — ferz/alfil/dabbaba only attack one parity sublattice, so
    they can't reach the "other color" cells; this is *why* they make clean
    quilt/checker textures. Knight/wazir aren't colorbound. Big driver.
  - **OR vs AND compounding**, if that knob is ever added.

**Payoffs:** auto-label the current pattern in the panel; **auto-curated preset
banks** (one per cluster); a **"surprise me"** that samples diverse families;
**interestingness filtering** (skip degenerate solid/checkerboard runs).

(Noted 2026-06-12; explicitly a "someday, if in the mood" — the user likes
playing/watching more than instrumenting. Captured so the taxonomy doesn't have
to be re-derived.)

## Image export — save the current frame as a PNG

Applies to any canvas sketch. A key / panel button that grabs the current canvas
and downloads it (`canvas.toBlob` → object URL → `<a download>` click), so you
can keep a still of a pattern you like. Cheap, self-contained, and a natural home
in shared `chrome.js` (next to fullscreen / copy-URL) so every sketch gets it.

Options to consider:
- **Resolution** — export at display size, or re-render at a higher resolution
  (e.g. a big offscreen pass) for wallpaper-quality stills.
- **Filename** — encode the state into it (the same params the share URL uses) so
  a saved image is self-describing / reproducible.

Dev counterpart already exists: [`tools/shot.mjs`](tools/shot.mjs) screenshots any
sketch URL headlessly (used for verification) — the in-sketch download would be
the user-facing version of the same capability.

(Noted 2026-06-12.)
