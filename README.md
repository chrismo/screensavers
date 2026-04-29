# screensavers

Interactive p5.js / WebGL screensaver-style sketches by chrismo. Each
lives in its own subdirectory and is served as a static page from
GitHub Pages at `https://chrismo.github.io/screensavers/<name>/`. The
canonical autoplay form for screensaver use adds `?nopanel=1&lerp=1`
(or whatever URL params the sketch supports).

## Sketches

- [petri-dish/](petri-dish/) — interactive Physarum slime-mold
  simulation with 10 named presets, perlin auto-drift, and a
  preset-cycle lerp mode.
  Live: https://chrismo.github.io/screensavers/petri-dish/

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
and `<sketch-name>/sketch.js`. Add an entry to the Sketches list above.
If the sketch is a fork of CC-or-other-licensed work, drop the
upstream's `LICENSE` file alongside `sketch.js` and add a matching
SPDX header at the top of `sketch.js`; otherwise it inherits the repo
MIT license.
