# screensavers

Interactive p5.js / WebGL screensaver-style sketches by chrismo. Each
lives in its own subdirectory and is served as a static page from
GitHub Pages at `https://chrismo.github.io/screensavers/<name>/`. The
canonical autoplay form for screensaver use adds `?nopanel=1&lerp=1`
(or whatever URL params the sketch supports).

## Sketches

- [petri-dish/](petri-dish/) — interactive Physarum slime-mold
  simulation. See [petri-dish/README.md](petri-dish/README.md) for
  controls, presets, and supported URL params.
  Live: https://chrismo.github.io/screensavers/petri-dish/

## Use as a macOS screensaver

Any of these sketches can be run as a macOS screensaver via
[WebViewScreenSaver](https://github.com/liquidx/webviewscreensaver),
which loads an arbitrary URL into a screensaver-mode webview. Setup:

1. Install WebViewScreenSaver (download the `.saver` from the
   [releases page](https://github.com/liquidx/webviewscreensaver/releases),
   double-click to install, then pick it under
   *System Settings → Screen Saver*).
2. Open a sketch in the browser, tune its control panel to taste, then
   press `C` (or click *copy screensaver URL* in the panel's actions
   row) — it copies a URL that reproduces the current state.
3. Paste that URL into the WebViewScreenSaver options.

For petri-dish a quick canned URL is
`https://chrismo.github.io/screensavers/petri-dish/?nopanel=1&lerp=1`.
Each sketch's own README documents its supported URL params if you'd
rather hand-build one.

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
