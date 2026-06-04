# knights

A spiral coloring screensaver from Numberphile's **"Red & Black Knights
(extraordinary result)"** (Neil Sloane & Jonas Karlsson, May 2026) and its
follow-up *"Amazing Chessboard Patterns."*

Cells of an infinite square spiral are claimed by `K` colors of knights taking
turns. On a color's turn it grabs the lowest-numbered cell that is **not
occupied and not attacked by any *other* color** — same-color knights *are*
allowed to attack each other, and that asymmetry is what breeds the large-scale
structure. With knights and 2+ colors the plane splits into colored regions
with chaotic bands along the axes; the interesting structure only emerges past
~100k–1M+ placed cells.

The whole pattern is simulated once into a grid (≈70 ms for the ~1M-cell
default), baked into a single texture, and a raw-WebGL fragment shader samples a
centered window that **zooms out exponentially** — so the reveal rate
accelerates from a handful of cells to tens of thousands per second, starting
on the single center cell.

Live: https://chrismo.github.io/screensavers/knights/

## Controls

Open the drawer (the `›` tab on the left edge) to tune:

| Param | What it does |
| --- | --- |
| **piece** | Which `(m,n)` leaper the knights are — knight `(2,1)`, camel `(3,1)`, zebra `(3,2)`, antelope `(4,3)`, giraffe `(4,1)`, fers `(1,1)`, vazir `(1,0)`. Each gives a different pattern. |
| **colors** | Number of knight colors taking turns (2–4). 2 is the classic Red & Black; 3 is the most interesting. |
| **extent** | How far the spiral is computed (max shell). Bigger reveals more pattern; costs more to simulate. |
| **zoom** | Seconds for one full zoom-out. |
| **ease** | Zoom pacing — higher lingers on the tiny center structure before accelerating. |
| **palette** | Color scheme. |

Keys: `←/→` zoom speed, `↑/↓` ease, `[ ]` extent, `P` cycle piece, `K` cycle
palette, `1–9` presets, `R` restart zoom, `C` copy screensaver URL, `F`
fullscreen, `H` hide panel.

## URL params (for autoplay / screensaver use)

`piece`, `colors`, `extent`, `zoom`, `ease`, `palette`, and `nopanel=1`
(hide the panel). `C` / *copy screensaver URL* builds a URL reproducing the
current settings, e.g.:

`https://chrismo.github.io/screensavers/knights/?piece=knight&colors=3&extent=512&zoom=90&ease=1.4&palette=0&nopanel=1`

## References

- Numberphile: [Red & Black Knights (extraordinary result)](https://youtu.be/UiX4CFIiegM) · [Amazing Chessboard Patterns (extra)](https://youtu.be/VgmDuBCayPw)
- OEIS [A392177](https://oeis.org/A392177) / [A392178](https://oeis.org/A392178) (red & black knights), [A308885](https://oeis.org/A308885) (single color)

## Licensing

Original code, MIT (the repo default) — the construction is mathematics from
the sources above; this is an independent reimplementation, not a port of the
OEIS reference programs.
