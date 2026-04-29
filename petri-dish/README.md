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
| `0`–`9`   | jump to preset 0–9                  |
| `D`       | toggle drift mode (perlin auto-morph) |
| `L`       | toggle lerp mode (cycle through presets) |
| `R`       | reset molds (re-seed at center, clear canvas) |
| `C`       | copy a screensaver URL that reproduces the current state |
| `H`       | show/hide control drawer            |

`lerpDuration` and `driftSpeed` are panel-only (no key binding).

## Presets

10 named snapshots of the full live config:
`0 Slime`, `1 Cobweb`, `2 Honeycomb`, `3 Highways`, `4 Plasma`,
`5 Dendrite`, `6 Tube`, `7 Ooze`, `8 Vermicelli`, `9 Burlap`.

## URL params

Applied in order: preset → numeric overrides → mode → panel. The
easiest way to get one is to open the sketch, tune the panel, and
press `C` — it copies a URL that reproduces the current state. The
table below is for hand-rolling.

| param            | effect                                              |
| ---------------- | --------------------------------------------------- |
| `?preset=N`      | start on preset N (0–9)                             |
| `?lerp=1`        | start in lerp mode (smoothly cycles all presets)    |
| `?drift=1`       | start in drift mode (perlin auto-morph)             |
| `?nopanel=1`     | hide the control drawer (recommended for screensaver) |
| `?rotAngle=N`    | rotation step in degrees (default 45)               |
| `?sensorAngle=N` | sensor splay in degrees (default 45)                |
| `?sensorDist=N`  | sensor reach in pixels (default 10)                 |
| `?moldSpeed=N`   | per-frame movement (default 1.0)                    |
| `?bgFade=N`      | per-frame trail-fade alpha 1–255 (default 5)        |
| `?num=N`         | mold count (default 4000)                           |
| `?lerpDuration=N`| frames per lerp transition (default 480 = ~8s)      |
| `?driftSpeed=N`  | perlin step per frame (default 0.003)               |

`lerp` wins over `drift` if both passed. Runtime overrides
(`rotAngle`–`bgFade`) only stick in manual mode — drift and lerp
continuously rewrite the same vars in `draw()`.

## License

CC BY-NC-SA 4.0 — see [LICENSE](LICENSE). Forced by the upstream Patt
Vira fork's ShareAlike clause.
