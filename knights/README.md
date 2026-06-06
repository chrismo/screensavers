# knights

A spiral coloring screensaver from Numberphile's **"Red & Black Knights
(extraordinary result)"** (Neil Sloane & Jonas Karlsson, May 2026) and its
follow-up *"Amazing Chessboard Patterns."*

Cells of an infinite square spiral are claimed by `K` colors of pieces taking
turns. On a color's turn it grabs the lowest-numbered cell that is **not
occupied and not attacked by any *other* color** — same-color pieces *are*
allowed to attack each other, and that asymmetry is what breeds the large-scale
structure. With 2+ colors the plane splits into colored regions with chaotic
bands along the axes; the interesting structure only emerges past ~100k–1M+
placed cells.

Colors are configured as **PIECE-SET × COUNT groups** — each group is a set of
leapers (a *compound* piece whose moves are the union) and how many color-slots
use it; the total colors are the sum. One group (`Knight × 3`) is the classic
3-color knight; several groups reproduce the Numberphile2 per-piece combos
(e.g. `Knight × 2 · Zebra × 1`); a multi-leaper group is a compound piece
(e.g. `Knight+Zebra × 3`). Total colors are capped at 8.

The whole pattern is simulated once into a grid (≈70 ms for the ~1M-cell
default) and baked into a single texture. A raw-WebGL fragment shader then
**sweeps a reveal front along the numbering spiral** — a single point laying
color outward with a glowing leading edge — while a centered window zooms to
keep the sweeping head in frame. The reveal rate accelerates from a handful of
cells to tens of thousands per second, starting on the single center cell.

The **reveal** mode switches this between `spiral` (the sweep, default),
`square` (whole rings pop in at once), and `all` (the finished pattern, just
zoomed).

Live: https://chrismo.github.io/screensavers/knights/

## Controls

Open the drawer (the `›` tab on the left edge) to tune:

| Param | What it does |
| --- | --- |
| **pieces** | PIECE-SET × COUNT groups. Each group shows its selected leapers as chips (tap a chip to remove); the `＋` reveals the rest to add (two+ leapers in a group = a compound piece, moves unioned). `− +` sets how many colors use the group; the swatches show those colors; `✕` removes the group; *+ add color group* adds one. Roster: knight `(2,1)`, wazir `(1,0)`, ferz `(1,1)`, dabbaba `(2,0)`, alfil `(2,2)`, three-leaper `(3,0)`, zebra `(3,2)`, antelope `(4,3)`. Total colors 2–8. |
| **extent** | How far the spiral is computed (max shell). Bigger reveals more pattern; costs more to simulate. |
| **reveal** | How cells appear: `spiral` (point sweeps the spiral with a glowing head), `square` (whole rings pop in), `all` (finished pattern, just zoomed). |
| **zoom** | Seconds for one full zoom-out. `0` = hold on the finished image (no animation) — handy for inspecting combos. |
| **palette** | Color scheme (colors are generated to evenly span the hue wheel for however many colors the groups total). |
| **cycle** (`L`) | When on, advance to the next preset each time a run finishes (rotating through the whole preset roster). |

Keys: `←/→` zoom speed, `[ ]` extent, `K` cycle palette, `M` cycle reveal mode,
`L` toggle preset cycling, `1–9` presets, `R` restart zoom, `C` copy screensaver
URL, `F` fullscreen, `H` hide panel. (Piece groups are mouse/touch-only.)

## URL params (for autoplay / screensaver use)

`groups` (pieces joined by `-`, count after `:`, groups comma-separated — e.g.
`groups=knight-zebra:2,wazir:1`), `extent`, `zoom`, `palette`, `reveal`,
`start` (initial zoom phase 0–1, to resume mid-sweep), `cycle=1` (rotate through
presets), `nopanel=1` (hide the panel), and `panel=open` (open the drawer on
load). `C` / *copy screensaver URL* builds
a URL reproducing the current settings, e.g.:

`https://chrismo.github.io/screensavers/knights/?groups=knight-zebra:2,wazir:1&extent=512&zoom=90&palette=0&reveal=spiral&nopanel=1`

## References

- Numberphile: [Red & Black Knights (extraordinary result)](https://youtu.be/UiX4CFIiegM) · [Amazing Chessboard Patterns (extra)](https://youtu.be/VgmDuBCayPw)
- OEIS [A392177](https://oeis.org/A392177) / [A392178](https://oeis.org/A392178) (red & black knights), [A308885](https://oeis.org/A308885) (single color)

## Licensing

Original code, MIT (the repo default) — the construction is mathematics from
the sources above; this is an independent reimplementation, not a port of the
OEIS reference programs.
