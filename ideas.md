# ideas — cross-sketch backlog

Deferred ideas that aren't specific to one sketch. When built, most of these
probably belong in the shared infrastructure (`panel.js` / `chrome.js`) so every
sketch benefits, rather than being reimplemented per sketch. Sketch-specific
ideas live in that sketch's own notes (e.g. `knights/ideas.md`).

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

Two complementary angles:

- **By output — measure the field.** A few cheap, discriminating metrics (no single
  one works): **periodicity** (FFT-peak / autocorrelation), **region size** (mean
  same-color blob), **local entropy** (color diversity in NxN windows),
  **anisotropy** (directional autocorrelation).
- **By input — predict from the roster/params** before solving (often surprisingly
  strong): reach diversity, # colors, colorboundness, compounding mode.

**Payoffs:** auto-label the current pattern in the panel; **auto-curated preset
banks** (one per cluster); a **"surprise me"** that samples diverse families;
**interestingness filtering** (skip degenerate runs).

The worked example is knights — its concrete catalog of observed families, roster
predictors, and defect types (from a 2026-06 render sweep) lives in
[`knights/ideas.md`](knights/ideas.md).

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
