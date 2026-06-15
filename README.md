# screensavers

Interactive, screensaver-style sketches by chrismo (p5.js, WebGL, and
plain Canvas2D). Each lives in its own subdirectory and is served as a
static page from GitHub Pages at
`https://chrismo.github.io/screensavers/<name>/`. The canonical autoplay
form for screensaver use adds `?nopanel=1` (plus whatever URL params the
sketch supports, e.g. `&lerp=1` for petri-dish).

## Sketches

- [petri-dish/](petri-dish/) — interactive Physarum slime-mold
  simulation. See [petri-dish/README.md](petri-dish/README.md) for
  controls, presets, and supported URL params.
  Live: https://chrismo.github.io/screensavers/petri-dish/
- [knights/](knights/) — an interactive sandbox for the *Red & Black Knights*
  spiral graph-coloring (after Numberphile): replays the actual turn-based solve,
  narrating each placement decision while zoomed in, then accelerating and
  interleaving to reveal the emergent large-scale pattern — and lets you swap in
  any roster of leaper pieces. Canvas2D. See [knights/README.md](knights/README.md)
  for controls and URL params.
  Live: https://chrismo.github.io/screensavers/knights/

Cross-sketch ideas / backlog live in [ideas.md](ideas.md).

## Running as a screensaver / desktop

Open a sketch, tune the panel to taste, press `C` (or click *copy
screensaver URL* in the panel's actions row) — it copies a URL that
reproduces the current state. Paste that URL into whatever loads URLs
on your desktop or as a screensaver.

On macOS the situation is messier than it should be — Apple's
deprecated the third-party screensaver pipeline on Tahoe and pushed
people toward their own private aerial-video engine. See
[macos-screensaver.md](macos-screensaver.md) for the current
recommendations (TL;DR: Plash for "petri-dish on the desktop" works
best; WebViewScreenSaver still works on Tahoe but with rough edges).

A quick canned petri-dish URL:
`https://chrismo.github.io/screensavers/petri-dish/?nopanel=1&lerp=1`.

## Licensing

The repo is **MIT** by default — see [LICENSE](LICENSE). Individual
sketches may be licensed differently when they're forks of upstream
work that requires it; check each sketch's own `LICENSE` file. Notably,
`petri-dish/` is **CC BY-NC-SA 4.0** because it's derived from
[Patt Vira's tutorial sketch](https://openprocessing.org/sketch/2213463),
which is CC BY-NC-SA. ShareAlike forces the derivative to keep the
same license.

## Adding a new sketch

Create `<sketch-name>/index.html` (loads `<script src="sketch.js">`)
and `<sketch-name>/sketch.js`. Add a `<sketch-name>/README.md` with
controls and any URL params the sketch honors. Add an entry to the
Sketches list above. If the sketch is a fork of CC-or-other-licensed
work, drop the upstream's `LICENSE` file alongside `sketch.js` and add
a matching SPDX header at the top of `sketch.js`; otherwise it
inherits the repo MIT license.
