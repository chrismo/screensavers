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
| `S` / `X` | arm store / clear, then press `0`–`9` (or tap a pill) |
| `B` / `⇧B`| next / previous preset pack         |
| `D`       | toggle drift mode (perlin auto-morph) |
| `L`       | play / stop the script               |
| `R`       | reset molds (re-seed at center, clear canvas) |
| `C`       | copy a screensaver URL that reproduces the current state |
| `H`       | show/hide control drawer            |
| `Esc`     | cancel an armed store/clear         |

Editing a script is pointer-only — click a segment on the strip, then use the
drawer's `script` rows. There's no keyboard path to it yet.

`rate` and `driftSpeed` are panel-only (no key binding).

## Presets

A preset is a named snapshot of the full live config. The base ten:
`0 Slime`, `1 Cobweb`, `2 Honeycomb`, `3 Highways`, `4 Plasma`,
`5 Dendrite`, `6 Tube`, `7 Ooze`, `8 Vermicelli`, `9 Burlap`.

## Slots

A pack is a bank of **ten slots**, `0`–`9`, and the panel always shows all ten —
an empty slot is an outlined pad rather than a missing one, which is what makes
storing into it discoverable.

**Play → tune → `S` → pick a slot → repeat.** Storing takes two presses: `S`
arms it (the pill row tints, the mode row shows `store?`), then `0`–`9` or a tap
on a pill says where. `X` arms a clear the same way. An armed action cancels on
`Esc`, on pressing the same key again, or after six seconds.

Storing mid-lerp captures the transient, which is usually the point — the
interesting configurations are often a few seconds after a change, not where it
settles.

Two presses rather than one is deliberate: there is no undo, so a single
keystroke that overwrites a slot is one slip away from losing something you
wanted. A one-press `⇧N` store is [parked in `ideas.md`](ideas.md) for when
there's an undo to catch it.

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

### Per-leg timing — the pack's default rhythm

Each preset carries the settings for the leg that *leaves* it:

| setting | meaning                                        | default |
| ------- | ---------------------------------------------- | ------- |
| `hold`  | dwell at this preset before the transition     | `0`     |
| `dur`   | length of the transition into the next preset  | `1`     |
| `ease`  | curve: `linear`, `smooth`, `smoother`, `in`, `out` | `smooth` |

`hold` and `dur` are **multiples of 8 seconds**, not absolute, so a pack
describes its rhythm as ratios and the `rate` knob scales the whole thing.

These are no longer what plays. They are the seed: selecting a pack rotates them
into a **script** (see below), and the script is what runs. A `?script=`
overrides them entirely.

`hold` matters more than it looks: physarum needs a few seconds after a param
jump to re-knit, so a dwell is what lets a mesh actually settle into a regime
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

## Scripts

A pack is a palette. A **script** is the choreography over it — what plays when
you press `L`.

A script is a list of **steps**, and a step is one fused thing:

> arrive at slot N — by **cut**, or by **lerp** over `dur` seconds — then
> **dwell** there for `dwell` seconds.

Fusing the move and the dwell is the point rather than a shortcut. A transition
is an *edge*, and welding it to the node it arrives at means there is never a
dangling one: every step says both how you get somewhere and how long you stay.
It is also why timing can't live on the preset — "sudden or gradual" is a
property of the move, not of the destination, so the same slot can be cut to in
one step and slowly morphed into in another.

```
script := step (';' step)*
step   := ['*'] ('~' | '=') slot ['!'] ['@' timing]
timing := dur ['/' dwell ['/' ease]]     after '~'
        | dwell                          after '='   (a cut has nothing to time)
```

| piece | means |
| ----- | ----- |
| `~3`  | lerp into slot 3 over the default 8s, no dwell |
| `~3@6`      | lerp in over 6s |
| `~3@6/60`   | lerp in over 6s, then sit for 60s |
| `~3@6/60/smoother` | …with that easing curve |
| `=3@10`     | **cut** to slot 3 and sit for 10s |
| `=3!@10`    | …and **re-seed the molds** on the way in, like pressing `R` |
| `*`         | loop marker: steps before it play once, the rest cycle forever |

`!` is worth more than it looks. The best effects in
[issue #1](https://github.com/chrismo/screensavers/issues/1) are *from-scratch*
transients — a field that grew into a configuration looks nothing like one that
was morphed into it, because the mesh adapts continuously instead of starting
over. `=4!@30` is the gesture for that: cut there, wipe, watch it build for 30
seconds. It fires on step **entry**, which for a cut is the same instant as
arrival; on a `~` step the re-seed happens as the morph begins, so the field
grows while the params slide.

So the motivating case — hold, morph, then loop between a long dwell and a quick
move — is:

```
?script==0@10;~1@6/3;*~2@8/60;~3@4
```

Cut to slot 0 and hold 10s; morph to slot 1 over 6s and hold 3s; then loop
forever between a 60s dwell on slot 2 and a 4s morph to slot 3.

`~` glides and `=` snaps. The obvious sigil for "go to" is `>`, and it's still
accepted if you type it — but `>` is in the URL spec's query percent-encode set,
so it comes back as `%3E` on every step and re-inflates the URL. `~` and `=`
survive raw, so that's what `C` writes.

**Seconds are absolute.** A script says `60s` and means 60 seconds — the units
you actually think in when choreographing. The `rate` knob is a global
multiplier on top (`0.5` = half speed), so "slow the whole thing down" survives
without every number in the script being relative to something.

**Without a `?script=`**, the active pack's own per-leg timing is rotated into an
equivalent script, so a pack plays exactly as it did before scripts existed. The
panel's `step` row becomes `script` when a URL-supplied one is in play — which is
also when `C` emits `?script=` rather than `?lerp=1`.

Pressing `0`–`9` during playback moves the playhead to the moment that slot is
arrived at, rather than restarting. A step pointing at a slot you later cleared
still takes its time — the choreography keeps its shape — it just has nothing to
show; its segment on the strip shows as an outline.

### The strip

The script laid out along the axis it lives on: a band across the bottom, one
segment per step, each as wide as its share of the script's seconds. Within a
segment the approach is a gradient and the dwell is flat, so `~2@4/60` (a quick
move into a long sit) and `~2@32/32` read differently at a glance. A `↻` marks
where the loop returns to, a bright left edge marks a cut, a `!` on the label
marks a re-seed, and the playhead sweeps it while playback runs.

It appears when there's something to watch or something to edit — whenever
playback is running, or whenever the drawer is open — and slides out of the
drawer's way when both are up. `?nopanel=1` never builds it at all, so a
screensaver stays a screensaver.

**The strip selects, the drawer edits.** Click a segment and the `script` section
of the drawer points at that step: `slot`, `move`, `dwell` and `ease` on ordinary
−/+ rows (hold to repeat), plus buttons to flip morph↔cut, toggle the `!`
re-seed, duplicate or drop the step, and set the loop point. Dragging a segment's
edge to re-time it would mean hit targets, snapping and touch handling for a
result these rows already give.

Clicking a segment during playback moves the playhead to that step's *start* —
you clicked the segment, so the approach is part of what you asked to see. That's
the opposite of `0`–`9`, which skips to the arrival.

**The first edit forks the script**, the same way the first slot store forks a
pack and for the same reason: a derived script is regenerated from the pack's
timing on every rebuild, and copy-URL emits only `?lerp=1` for it. So an edit
that didn't mark the script custom would be wiped by the next slot store and
would be missing from the very URL meant to reproduce it. After an edit, `C`
emits the whole `?script=` and the panel's `step` label reads `script`.

One asymmetry to know about: a cut keeps its `move` duration parked, so flipping
cut→morph→cut is lossless in the session — but a cut has nowhere in the URL to
write that number, so it comes back as the default after a reload.

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
| `?script=SPEC`   | choreography over the slots (see Scripts)           |
| `?lerp=1`        | start playback on the pack's own default script     |
| `?rate=N`        | playback speed multiplier (default 1; `0.5` is half speed) |
| `?drift=1`       | start in drift mode (perlin auto-morph)             |
| `?nopanel=1`     | hide the control drawer (recommended for screensaver) |
| `?rotAngle=N`    | rotation step in degrees (default 45)               |
| `?sensorAngle=N` | sensor splay in degrees (default 45)                |
| `?sensorDist=N`  | sensor reach in pixels (default 10)                 |
| `?moldSpeed=N`   | per-frame movement (default 1.0)                    |
| `?bgFade=N`      | per-frame trail-fade alpha 1–255 (default 5)        |
| `?num=N`         | mold count (default 4000)                           |
| `?lerpDuration=N`| legacy alias for `?rate=` (`480 / N`)               |
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

Petri-dish backlog lives in [`ideas.md`](ideas.md), including the full design
conversation behind **scripted playback** (slots / steps / scripts) and what's
still open after it — undo on store, and the `⇧N` one-press store parked behind
it.

## License

CC BY-NC-SA 4.0 — see [LICENSE](LICENSE). Forced by the upstream Patt
Vira fork's ShareAlike clause.
