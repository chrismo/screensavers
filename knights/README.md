# knights — how it's built

Replays the **actual turn-based placement** of the knights spiral-coloring,
narrating *why* each cell gets its color, then accelerating and zooming out to
reveal the emergent large-scale pattern.

The rule (from Numberphile's "Red & Black Knights"): cells of a square spiral
are claimed by K colors of pieces taking turns. On a color's turn it grabs the
lowest-numbered cell that is **not occupied** and **not attacked by any other
color** (same-color attacks are allowed — that asymmetry is what breeds the
large-scale pattern).

It **narrates** that decision and then lets it run:

1. **Narrate** (slow, zoomed in) — the active color's cursor walks the spiral to
   a candidate. Cells it skips flash with the reason: a white **✕** over a cell
   attacked by an enemy color, a plain outline over an already-occupied cell. On
   a legal cell it drops in its color and outlines the squares it now threatens.
   A caption names the piece and what it's doing. While the cursor sits on an
   enemy-blocked cell, a **line + glow** points to the enemy piece(s) attacking
   it (in their color), so you can see exactly *why* it's skipped. A persistent
   **pin** marks where each color last left off, so all the cursors stay trackable
   as the field fills.
2. **Interleave** (fast, zooming out) — as the run accelerates and cells get too
   small to read, the overlay drops and the K cursors just fill the field,
   building the emergent large-scale pattern.

Renderer is **Canvas2D**: the committed field is blitted from a 1px-per-cell
offscreen canvas in one draw call per frame, so it scales to large extents; the
narration overlay is drawn on top only while zoomed in.

## Controls

| Key | Action |
| --- | --- |
| `Space` / `P` | pause / resume |
| `←` `→` | when paused: step one placement back / forward; when running: slower / faster (at speed 0 → **static**) |
| `[` `]` | shrink / grow the computed extent (re-solves) |
| `K` | cycle palette |
| `S` | toggle **static** mode — jump to the finished pattern and hold (a clean wallpaper, no animation/overlay); toggle off to restart the build |
| `D` | toggle **details** — the narration overlay; off = a pure screensaver (just the building field + grid) |
| `L` | toggle preset cycling (rotate presets between runs) |
| `R` | restart the run |
| `C` | copy a `?nopanel=1` screensaver URL of the current state |
| `F` | fullscreen |
| `H` | hide / show the control panel |
| `0`–`9` | jump to a preset |

The panel's **pieces** section is the full group editor: each color group is a
set of leapers (a compound piece) × a count; total colors = the sum (capped at
8). Add/remove leaper chips, adjust counts, add/remove groups; the swatches show
each group's actual colors.

## URL params

- `groups=knight-zebra:2,wazir:1` — color groups. Pieces in a group joined by
  `-` (a compound leaper), count after `:`, groups separated by `,`. (`-` not
  `+`: in a query string `+` decodes to a space.) Roster: `knight`, `wazir`,
  `ferz`, `dabbaba`, `alfil`, `threeleaper`, `zebra`, `antelope`.
- `extent=24` — spiral half-extent S (grid is (2S+1)²). Steps on a ladder
  (`24 · 100 · 200 · … · 1000`); the panel arrows / `[` `]` move between rungs and
  a URL value snaps to the nearest. Small (the `24` default) keeps the solve
  readable; bigger plays longer before it fills.
- `speed=3` — overall tempo as a **level** `0`–`8` (shown in the panel as the
  level number; default `3`). Higher = faster; it scales both the narrated crawl
  and the rate the ramp accelerates from. The levels are a geometric ladder
  (`1/16 · 1/8 · 1/4 · 1/2 · 1 · 2 · 4 · 8` placements/sec) — the slow rungs are
  very leisurely. (The per-cell drop is always a quick pop, independent of level.)
  `speed=0` (or `static=1`) is **static** mode: skip the build, hold on the
  finished pattern (handy as a wallpaper or for inspecting a combo).
- `palette=0` — 0 Vivid · 1 Neon · 2 Pastel · 3 Mono.
- `start=0.5` — start the timeline at this fraction (pre-fills that much, handy
  for inspecting the zoomed-out end state).
- `details=0` — hide the narration overlay (pure-screensaver look).
- `cycle=1` — rotate to the next preset between runs.
- `nopanel=1` — hide the panel (screensaver mode).

Example: a 6-color Ferz+Dabbaba compound, mid-run —
`?groups=ferz-dabbaba:6&start=0.5&nopanel=1`.

## Notes

This Canvas2D "how it's built" view replaced an earlier WebGL sketch that swept
the finished pattern — the per-cursor construction-order reveal shows dynamics
the uniform sweep averaged away. See [`spec.md`](spec.md) for the design
decisions and migration history. Generic panel/page chrome is shared with the
rest of the gallery via `../panel.js` and `../chrome.js`; the knights-specific
solver and piece math live inline here.
