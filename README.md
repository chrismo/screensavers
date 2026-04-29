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

## Use as a macOS screensaver

Any of these sketches can be run as a macOS screensaver via
[WebViewScreenSaver](https://github.com/liquidx/webviewscreensaver),
which loads an arbitrary URL into a screensaver-mode webview. Setup:

1. Install WebViewScreenSaver (download the `.saver` from the
   [releases page](https://github.com/liquidx/webviewscreensaver/releases),
   double-click to install, then pick it under
   *System Settings → Screen Saver*).
2. In the screensaver options, paste in the autoplay URL. The
   [landing page](https://chrismo.github.io/screensavers/) has a
   builder that generates one for you.
3. Canonical petri-dish autoplay URL:
   `https://chrismo.github.io/screensavers/petri-dish/?nopanel=1&lerp=1`

### petri-dish URL params

| param        | effect                                         |
| ------------ | ---------------------------------------------- |
| `?nopanel=1` | hide the control drawer (recommended for screensaver use) |
| `?lerp=1`    | start in lerp mode (smoothly cycles through all 10 presets) |
| `?drift=1`   | start in drift mode (perlin auto-morph)        |
| `?preset=N`  | start on preset N (0–9)                        |

`lerp` wins over `drift` if both are passed. `preset` is applied first,
so e.g. `?preset=3&drift=1` starts the drift orbit biased toward
preset 3.

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
