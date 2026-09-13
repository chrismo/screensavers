# petri-dish

Interactive Physarum slime-mold simulation. Forked from
[Patt Vira's tutorial sketch](https://openprocessing.org/sketch/2213463)
(CC BY-NC-SA 4.0); algorithm from
[Jeff Jones (2010)](https://uwe-repository.worktribe.com/output/980579).

Live: https://chrismo.github.io/screensavers/petri-dish/

## Controls

Keyboard and on-screen drawer share the same handlers — tap the chevron
on the left edge to open the drawer.

| key       | effect                              |
| --------- | ----------------------------------- |
| `← / →`   | rotAngle ∓5°                        |
| `↓ / ↑`   | sensorAngle ∓5°                     |
| `[ / ]`   | sensorDist ∓1px                     |
| `- / =`   | moldSpeed ∓0.5                      |
| `, / .`   | bgFade ∓1                           |
| `0`–`9`   | jump to preset 0–9 in the active pack |
| `B` / `⇧B`| next / previous preset pack         |
| `D`       | toggle drift mode (perlin auto-morph) |
| `L`       | toggle lerp mode (cycle through presets) |
| `R`       | reset molds (re-seed at center, clear canvas) |
| `C`       | copy a screensaver URL that reproduces the current state |
| `H`       | show/hide control drawer            |

`lerpDuration` and `driftSpeed` are panel-only (no key binding).

## Presets

A preset is a named snapshot of the full live config. The base ten:
`0 Slime`, `1 Cobweb`, `2 Honeycomb`, `3 Highways`, `4 Plasma`,
`5 Dendrite`, `6 Tube`, `7 Ooze`, `8 Vermicelli`, `9 Burlap`.

## Packs

A **pack** is a named, ordered set of presets — what the `0`–`9` keys and the
panel pills point at — bundled with the lerp timing for the legs between them.
`B` / `⇧B` cycles packs. Packs are pure navigation: copy-URL still encodes the
full live state, so whichever pack is active, a copied URL reproduces exactly
what you saw.

| pack      | presets                                              | feel |
| --------- | ---------------------------------------------------- | ---- |
| `classic` | all ten, uniform timing                              | the cycle lerp has always had |
| `weave`   | Cobweb, Highways, Tube, Vermicelli, Burlap           | linear/networky; long dwells, slow morphs |
| `bloom`   | Slime, Ooze, Plasma, Dendrite, Honeycomb             | soft and blobby; mixed easing so it breathes unevenly |
| `pulse`   | Plasma, Vermicelli, Honeycomb, Tube, Burlap, Slime   | mostly hold, short snappy legs — a slideshow of regimes |
| `tide`    | a palindromic sensorDist sweep, 2px → 30px → 2px     | one knob swept end to end; steady linear breath |

### Per-leg lerp settings

Each preset carries the settings for the leg that *leaves* it:

| setting | meaning                                        | default |
| ------- | ---------------------------------------------- | ------- |
| `hold`  | dwell at this preset before the transition     | `0`     |
| `dur`   | length of the transition into the next preset  | `1`     |
| `ease`  | curve: `linear`, `smooth`, `smoother`, `in`, `out` | `smooth` |

`hold` and `dur` are **multiples of `lerpDuration`**, not absolute seconds, so
the `lerpDuration` knob still scales a whole pack up or down while the pack
keeps its internal rhythm. The panel's *leg hold* / *leg lerp* rows show the
resolved seconds for the leg you're on.

`hold` matters more than it looks: physarum needs a few seconds after a param
jump to re-knit, so a hold is what lets a mesh actually settle into a regime
instead of being dragged straight through it.

### Custom packs in the URL

`?packs=` carries a whole bank inline, so a collection is just a bookmark
rather than an edit to `sketch.js`:

```
spec   := preset (';' preset)*
preset := [name ':'] rotAngle ',' sensorAngle ',' sensorDist ',' moldSpeed ',' bgFade ['@' timing]
timing := hold '/' dur ['/' ease]
```

```
?nopanel=1&lerp=1&packname=My%20Bank
  &packs=Fast:45,45,10,1,5@0/0.4/out;Slow:20,20,20,1,5@1/2/smoother;Bare:60,60,8,1,5
```

Up to 10 presets (the `0`–`9` slots); unparseable entries are skipped rather
than failing the whole pack, and omitted timing falls back to the defaults
above. Pressing `C` while a custom pack is active re-emits the whole spec, so
custom packs round-trip through copy-URL like everything else.

## URL params

Applied in order: pack → preset → numeric overrides → mode → panel. The
easiest way to get one is to open the sketch, tune the panel, and
press `C` — it copies a URL that reproduces the current state. The
table below is for hand-rolling.

| param            | effect                                              |
| ---------------- | --------------------------------------------------- |
| `?pack=NAME`     | select a built-in pack by slug (`classic`, `weave`, `bloom`, `pulse`, `tide`) or index |
| `?packs=SPEC`    | define an ad-hoc pack inline and select it (see Packs) |
| `?packname=S`    | name for the `?packs=` pack (default `Custom`)      |
| `?preset=N`      | start on preset N (0–9), within the active pack     |
| `?lerp=1`        | start in lerp mode (smoothly cycles all presets)    |
| `?drift=1`       | start in drift mode (perlin auto-morph)             |
| `?nopanel=1`     | hide the control drawer (recommended for screensaver) |
| `?rotAngle=N`    | rotation step in degrees (default 45)               |
| `?sensorAngle=N` | sensor splay in degrees (default 45)                |
| `?sensorDist=N`  | sensor reach in pixels (default 10)                 |
| `?moldSpeed=N`   | per-frame movement (default 1.0)                    |
| `?bgFade=N`      | per-frame trail-fade alpha 1–255 (default 5)        |
| `?num=N`         | mold count (default 4000)                           |
| `?lerpDuration=N`| frames per unit-duration lerp leg (default 480 = ~8s) |
| `?driftSpeed=N`  | perlin step per frame (default 0.003)               |

`lerp` wins over `drift` if both passed. Runtime overrides
(`rotAngle`–`bgFade`) only stick in manual mode — drift and lerp
continuously rewrite the same vars in `draw()`.

## License

CC BY-NC-SA 4.0 — see [LICENSE](LICENSE). Forced by the upstream Patt
Vira fork's ShareAlike clause.
