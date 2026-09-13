# petri-dish — ideas & deferred work

Petri-dish-specific backlog. Cross-sketch ideas (preset banks, image export, the
general output-fingerprinting idea) live in the repo-root
[`../ideas.md`](../ideas.md).

## Scripted playback — slots, steps, scripts

**Status:** designed 2026-09-13, not built. Phase 1 (slots) is the agreed
starting point. This section is the whole design conversation compressed, so
picking it up cold doesn't mean re-deriving it.

### The problem

Some of the best moments in this sketch are *transients* — a configuration is
fascinating for a few seconds after it changes and then settles into something
duller. The notes in [issue #1][i1] are full of these ("esp. at the start";
"sensorDist of 90-95 have a cool effect of a 1st circle that then collapses back
to center"), and [issue #3][i3] is a whole family found by pausing a lerp mid-run
to watch.

Today there's no way to say *stay here for 10 seconds, then move on before it
gets boring*. `lerp` cycles a pack on one uniform rhythm; manual tweaks get
overwritten every frame while lerp or drift is running. The wanted thing is
closer to a script:

```
- [usual presets] for 10s
- turn on lerp and lerp to next presets in 6s
- [next presets] for 3s
- then maybe even loop:
    - [p3] for 60s
    - lerp to [p4] for 4s
    - loop
```

### The model

Four nouns. Only the last two are new.

| noun | what it is |
| ------ | ---------- |
| **preset** | five params + a name. **No timing.** Pure vocabulary |
| **pack** | up to 10 preset *slots*, some possibly empty. A palette, nothing more |
| **step** | *go to slot N, by cut or lerp, over T seconds; then dwell D seconds* |
| **script** | ordered steps + a loop point. Steps reference slots **by index** |

### The key decision: a transition is an edge, not a node

The shipped packs feature hangs `hold` / `dur` / `ease` on the **preset**, where
they describe the leg *leaving* it. That works only while presets are
single-use slots, and it already leaks: the `Tide` pack is
`[2, 6, 12, 20, 30, 20, 12, 6]`, in which `6px`, `12px` and `20px` each appear
**twice as duplicated objects** — they have to, because the outbound leg from
`20px→30px` and from `20px→12px` can't otherwise differ.

It breaks harder in the direction we're going:

- **Sudden vs. morph is a property of the move, not the destination.** If Plasma
  is sometimes cut to and sometimes lerped into, that can't live on Plasma.
- **Scripts reference slots by index** (which is what keeps URLs short), so by
  construction the same preset appears at several points with different timings.

Hence: timing moves off the preset and onto the **step**, which fuses the edge
and the node so there's never a dangling transition. Mechanically this is one
quarter-turn of what exists — today `dur` on preset N means the leg `N→N+1`
(outgoing); rotate it to mean the leg *into* N and you have steps.

**What that costs:** the `hold`/`dur`/`ease`-on-preset half of the packs work
gets rotated onto steps. The rest ports intact — the `EASINGS` curves, the
hold→transition state machine in `draw()`, the pills, the URL codec, and the
palettes themselves (Weave / Bloom / Pulse / Tide are still good *palettes*).
Partial rework of an existing feature, not a throwaway.

### Phase 1 — slots (start here)

Self-contained, immediately useful while playing, and independent of the step
rotation. This is the capture affordance that replaces the rejected "record live
play" idea: **play → tune → store into a slot → repeat → arrange slots later.**
It makes the pack a sampler pad bank.

- **Store** the live config (the five params) into slot 0-9
- **Clear** a slot, leaving a hole
- **Fork on write** — see the forced constraint below
- Pills grow an empty state; `pickPreset` no-ops on an empty slot; the lerp
  cycle skips empties; `encodePack` encodes gaps
- Toast + pill flash on store, since overwriting is destructive-ish

#### Forking is forced, not a preference

`shareUrl()` emits `?pack=weave` for a built-in pack, and re-emits the full spec
only when `pk.custom` is true. So storing into a built-in slot, pressing `C`,
and reloading would silently give back **pristine Weave** — the edit gone from
the very URL meant to reproduce it.

So the first write to a built-in pack must **copy-on-write into a custom pack**
(`Weave*`). Built-ins stay pristine, reproduction stays honest, and clobbering a
palette you liked becomes impossible.

#### Decided

- **Holes, not compaction.** Clearing slot 4 must not shift 5-9 down: it would
  break muscle memory and every script that references slots by index. Costs
  roughly a 20% complexity bump across pills / pick / cycle / encode.
- **Auto-descriptive names** from the params, the way `Tide` already does it
  (`12px`). Rename is a later nicety, not v1 — prompting for a name interrupts
  the play→capture flow and is clunky on iPad.
- **URL is the only save format.** No storage API is used anywhere in this repo
  today, and the whole idiom is "tune it, press `C`, the URL is the artifact."
  Adding `localStorage` would be the project's first hidden state. Revisit only
  if work actually gets lost.

#### Open

- **Clear gesture.** Leaning arm-a-button-then-click-a-pill (discoverable,
  identical by touch and mouse). Long-press on a pill is the touch-native
  alternative and `SS.attachHoldRepeat` already has press-and-hold plumbing to
  crib from.
- **Undo on store** — one level is cheap, a history isn't. Fork-on-write already
  covers the catastrophic case (built-ins are safe) but not "I just overwrote my
  good slot 4."

### Phase 2 — steps

The rotation described above, plus:

- Step kinds: `lerp to` and `cut to` (a 0s lerp, but worth naming).
- A **`reset` flag** on a step — re-seed molds + clear canvas, what `R` does —
  is **held, not scoped in** (2026-09-13). The theory is that the issue #1
  effects are *from-scratch* transients a slow lerp can't reproduce, since the
  field adapts continuously instead of starting over. Still untested. Revisit
  once there's a script to try it against.
- **Absolute seconds**, not multiples of `lerpDuration`. The multiplier
  indirection is the wrong shape for choreography. Keep the knob as a **global
  rate multiplier** (1.0x default) so "slow the whole thing down" survives.
- **Loop = flat list + a loop-from marker** (one tail loop). Covers the
  motivating example exactly. Nested blocks only if something later needs them.
- URL form, roughly `?pack=weave&script=0 10s; >1 6s; 1 3s; loop: 2 60s; >3 4s`

### Phase 3 — UI surface

Two candidates. **A** is the conventional shape for a sequencer and the cheaper
build; **B** needs to be seen before judging, and a static mock (real segment
widths, real playhead, no editing) is under an hour purely to look at.

| | shape | read |
| --- | ----- | ---- |
| **A** | Vertical step list in the drawer, collapsible sections | Step lists are vertical in every sequencer ever made. Reuses `SS.paramRow` and the drawer grammar wholesale |
| **B** | Horizontal strip along the bottom — segments sized by duration, playhead sweeps, click to scrub | The natural axis for time; doesn't fight the left drawer; doubles as a playback HUD. More build |
| C | Radial/ring, playhead sweeping a circle | Makes the loop structure self-evident and suits the screensaver aesthetic. Poor for precise editing — possibly a lovely *display* later |

If **B**: **strip selects, drawer edits.** Drag-to-resize is the expensive,
fiddly part (hit targets, snapping, touch); clicking a segment to select it and
then editing via ordinary `−/+` rows gets the same result with no new
interaction code and hold-to-repeat already working.

Whichever wins, it must suppress completely under `?nopanel=1` — playback has to
run headless for screensaver use.

### Rejected, and why (don't re-litigate)

- **Live recording** — timestamp keypresses and emit a script. Attractive because
  discovery happens by playing, but the changes wanted are often sudden and
  deliberate, more like a preset toggle than a performance. Slots capture the
  same intent without a recorder, a debounce policy, or a lerp-mode segmentation
  problem.
- **JSON payload in the URL** — `{`, `}`, `"`, `,`, `:` all percent-encode; a
  6-step script becomes 1500+ chars of `%7B%22`. Base64 fixes the size and kills
  hand-editability, which was most of the point.
- **External JSON file fetched at runtime** — breaks `file://` double-click,
  which collides with this repo's loading convention. **Measured 2026-09-13**,
  headless Chrome on a `file://` page in the same directory as the target:

  ```
  [log] SCRIPT-TAG: loaded ok
  [log] FETCH: FAILED -> Failed to fetch
  [log] XHR: FAILED
  Access to fetch at 'file:///…/data.json' from origin 'null' has been blocked
  by CORS policy: Cross origin requests are only supported for protocol
  schemes: chrome, chrome-extension, chrome-untrusted, data, http, https,
  isolated-app.
  ```

  A `file://` document has an **opaque origin** (`null`), so `fetch` and `XHR`
  to a sibling file are both refused — while `<script src>` in the same page
  loads fine, which is exactly why the vendored `p5.min.js` / `three.min.js`
  work on a double-click. So the rule for this project is general: **runtime
  `fetch` of any local asset is off the table, `<script src>` is not.** If a big
  curated payload is ever wanted, the answer is a `scripts.js` loaded via
  `<script src>` like `panel.js` — JSON ergonomics without the fetch.
- **Compacting slots on clear** — see Holes above.

### Gotchas found while designing

- **`Shift`+digit is not a digit.** Store wants to be shift+digit (sampler
  convention; `⇧B` already establishes shift-as-modifier here), but `e.key` for
  shift+1 is `!`. The handler at `sketch.js:749` tests `e.key >= '0' && e.key <= '9'`,
  so the store path needs `e.code` (`Digit1`…`Digit0`), which is also more
  layout-robust.
- **`URLSearchParams` triples every delimiter.** The 4-preset `?packs=` URL we
  ship runs ~330 chars, of which roughly two thirds is `%3A` / `%2C` / `%2F`
  inflation — about 120 chars of actual information. Those characters are legal
  in a query per RFC 3986; building that one param by hand keeps `:;,@` raw and
  roughly thirds the length. Worth doing before script URLs make it hurt.
- **`node --test <dir>` with an absolute path fails** ("Cannot find module") —
  it tries to load the directory as an entry point. `node --test <file>`, and a
  bare `node --test` that discovers from the cwd, both work.

### Testing

Decided 2026-09-13: this is complex enough to warrant a suite, **scoped to the
logic and nothing else**. This project has worked precisely because verification
is "look at it" — golden-master screenshots would trade that away for
maintenance, and they're explicitly not wanted.

**Tested** — pure, deterministic, no DOM / canvas / p5:

- script DSL parse ↔ encode round-trip
- step advancement: given a script and elapsed frames, which step, which phase
  (dwell vs. transition), and `t` within it
- slot semantics: store, clear-leaves-a-hole, fork-on-first-write, index
  stability across a clear
- pack spec parse ↔ encode round-trip — a **retrofit**, since `parsePack` /
  `encodePack` shipped with no tests at all
- easing curves (trivial, but free)

**Not tested** — anything a person answers by looking: whether a pattern is
interesting, panel layout, the mold field itself. Those stay visual, via
[`../tools/shot.mjs`](../tools/shot.mjs) probes when a headless check is useful.

**How: follow the `knights/solver.js` precedent**, which already solved this
exact problem in this repo. That file is pure logic with no DOM and no canvas,
loaded by the browser as a classic `<script src>` (so `file://` double-click
still works — top-level decls become globals the sketch uses) with a CommonJS
tail guarded by `typeof module !== 'undefined'` that node imports. The offline
miner in `knights/explore/` consumes it that way today.

`petri-dish/sketch.js` can't be loaded in node at all as it stands — verified:

```
ReferenceError: window is not defined
  at petri-dish/sketch.js:273   const paramRow = (label, param, hint) => window.SS.paramRow(...)
```

...because `PANEL_HTML` is a top-level template literal that calls `paramRow()`
during evaluation. So the timeline logic needs extracting regardless of testing;
testing just makes it urgent. Call it **`petri-dish/timeline.js`** — not
`script.js`, which collides with both `sketch.js` and the `script` concept.

Runner: node's built-in one. `node --test`, `.test.mjs` files, **zero
dependencies and no `package.json`** — which matters in a repo that has neither
and shouldn't grow one for this. Verified working on node v24.3.0.

### Loose end

The [issue #3][i3] donut family (unstable Tube → donut → flamboyant donut →
negative tubes) is a ready-made pack that was never folded in — a single-axis
`sensorAngle` sweep at 84.53 → 114.53 → 149.53, all captured at
`lerpDuration=3600` (60s legs). It's also a good first *script* once phase 2
lands, since 60s dwells are exactly what the current model can't express
naturally.

[i1]: https://github.com/chrismo/screensavers/issues/1
[i3]: https://github.com/chrismo/screensavers/issues/3

(Designed 2026-09-13 across a long back-and-forth; captured so the reasoning
survives the gap before it gets built.)
