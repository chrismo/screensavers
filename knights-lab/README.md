# knights-lab — how it's built

A companion to [`../knights/`](../knights/) that replays the **actual
turn-based placement** instead of sweeping the finished pattern. It shows
*why* each cell gets its color.

The rule (from Numberphile's "Red & Black Knights"): cells of a square spiral
are claimed by K colors of pieces taking turns. On a color's turn it grabs the
lowest-numbered cell that is **not occupied** and **not attacked by any other
color** (same-color attacks are allowed — that asymmetry is what breeds the
large-scale pattern).

This page **narrates** that decision and then lets it run:

1. **Narrate** (slow, zoomed in) — the active color's cursor walks the spiral to
   a candidate. Cells it skips flash with the reason: a white **✕** over a cell
   attacked by an enemy color, a plain outline over an already-occupied cell. On
   a legal cell it drops in its color and outlines the squares it now threatens.
   A caption names the piece and what it's doing.
2. **Interleave** (fast, zooming out) — as the run accelerates and cells get too
   small to read, the overlay drops and the K cursors just fill the field,
   building the same emergent pattern the main sketch reveals.

Renderer is **Canvas2D** (the main sketch is WebGL): the committed field is
blitted from a 1px-per-cell offscreen canvas in one draw call per frame, so it
scales to any extent; the narration overlay is drawn on top only while zoomed in.

## Controls

| Key | Action |
| --- | --- |
| `Space` / `P` | pause / resume |
| `←` `→` | when paused: step one placement back / forward; when running: slower / faster |
| `[` `]` | shrink / grow the computed extent (re-solves) |
| `K` | cycle palette |
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
- `extent=60` — spiral half-extent S (grid is (2S+1)²). Small keeps the solve
  readable; bigger plays longer before it fills.
- `speed=3` — opening placements per second (the rate accelerates from here).
- `palette=0` — 0 Vivid · 1 Neon · 2 Pastel · 3 Mono.
- `start=0.5` — start the timeline at this fraction (pre-fills that much, handy
  for inspecting the zoomed-out end state).
- `cycle=1` — rotate to the next preset between runs.
- `nopanel=1` — hide the panel (screensaver mode).

Example: a 6-color Ferz+Dabbaba compound, mid-run —
`?groups=ferz-dabbaba:6&start=0.5&nopanel=1`.

## Status

This is a **prototype lab**. Its pure helpers (piece roster, spiral/leaper math,
palette and group logic, the group-editor drawer) are duplicated from
`../knights/sketch.js` on purpose, leaving the main sketch untouched. The intended
next step is to extract a shared `knights/core.js`, then graft this narration into
the main sketch as an "opening act" mode that hands off to the WebGL sweep — see
the TODO in `../knights/sketch.js` (ideas #2 and #5).
