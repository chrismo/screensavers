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
| `0`–`9`   | jump to slot 0–9 in the active pack |
| `⇧0`–`⇧9` | **store** the live config into slot 0–9 |
| `S` / `X` | arm store / clear, then pick a slot (the touch path) |
| `B` / `⇧B`| next / previous preset pack         |
| `D`       | toggle drift mode (perlin auto-morph) |
| `L`       | toggle lerp mode (cycle through presets) |
| `R`       | reset molds (re-seed at center, clear canvas) |
| `C`       | copy a screensaver URL that reproduces the current state |
| `H`       | show/hide control drawer            |
| `Esc`     | cancel an armed store/clear         |

`lerpDuration` and `driftSpeed` are panel-only (no key binding).

## Presets

A preset is a named snapshot of the full live config. The base ten:
`0 Slime`, `1 Cobweb`, `2 Honeycomb`, `3 Highways`, `4 Plasma`,
`5 Dendrite`, `6 Tube`, `7 Ooze`, `8 Vermicelli`, `9 Burlap`.

## Slots

A pack is a bank of **ten slots**, `0`–`9`, and the panel always shows all ten —
an empty slot is an outlined pad rather than a missing one, which is what makes
storing into it discoverable.

**Play → tune → `⇧N` → repeat.** `⇧0`–`⇧9` stores whatever is on screen right now
into that slot; storing mid-lerp captures the transient, which is usually the
point. `S` then a slot does the same without a keyboard, and `X` then a slot
clears one. An armed action cancels on `Esc`, on pressing the same key again, or
after six seconds.

Two rules the rest follows from:

- **The first edit to a built-in pack forks it** into `Weave*`. Copy-URL emits
  `?pack=weave` for a built-in and the full spec only for a custom pack, so
  editing a built-in in place would make the copied URL hand back pristine Weave
  — the edit gone from the very URL meant to reproduce it. Forking also means you
  can't clobber a palette you liked.
- **Clearing leaves a hole.** Slots 5–9 do not slide down into a cleared 4: the
  index *is* the address, both for muscle memory and for the scripts in
  [`ideas.md`](ideas.md) that will reference slots by number. The lerp cycle
  skips holes; picking one does nothing. Trailing holes carry no information and
  are trimmed.

Storing over a slot keeps that slot's **timing** (`hold` / `dur` / `ease`, below).
Timing is the pack's rhythm and the slot is a position in it — you're replacing
what sits there, not how the pack moves. Names are derived from the params
(`33x66x7`), or from a base preset when all five match it exactly.

There is no save button: the URL is the save format. Press `C`.

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
spec   := slot (';' slot)*
slot   := '' | [name ':'] rotAngle ',' sensorAngle ',' sensorDist ',' moldSpeed ',' bgFade ['@' timing]
timing := hold '/' dur ['/' ease]
```

```
?nopanel=1&lerp=1&packname=My%20Bank
  &packs=Fast:45,45,10,1,5@0/0.4/out;Slow:20,20,20,1,5@1/2/smoother;Bare:60,60,8,1,5
```

Up to 10 slots (the `0`–`9` keys). An **empty chunk is an empty slot**, so
`A:…;;C:…` puts `C` in slot 2 — and an unparseable chunk becomes a hole for the
same reason, since skipping it would slide every later slot down one and
invalidate the indexes. Omitted timing falls back to the defaults above.
Pressing `C` while a custom pack is active re-emits the whole spec, so custom
packs round-trip through copy-URL like everything else.

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
| `?preset=N`      | start on slot N (0–9), within the active pack       |
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

## Tests

Pure pack/slot logic — the spec codec, hole semantics, fork-on-write, leg
timing — lives in [`timeline.js`](timeline.js), which the browser loads as a
plain `<script src>` (so a `file://` double-click still works) and node imports
through a CommonJS tail. Same split as `knights/solver.js`.

```
node --test petri-dish/timeline.test.mjs
```

No dependencies and no `package.json` — node's built-in runner. Deliberately
scoped to the logic: whether a pattern is *interesting*, and whether the panel
looks right, stay look-at-it questions.

## Ideas / deferred work

Petri-dish backlog — including the designed-but-unbuilt **scripted playback**
(slots / steps / scripts) — lives in [`ideas.md`](ideas.md).

## License

CC BY-NC-SA 4.0 — see [LICENSE](LICENSE). Forced by the upstream Patt
Vira fork's ShareAlike clause.
