# petri-dish — ideas & deferred work

Petri-dish-specific backlog. Cross-sketch ideas (preset banks, image export, the
general output-fingerprinting idea) live in the repo-root
[`../ideas.md`](../ideas.md).

## Scripted playback — slots, steps, scripts

**Status:** designed 2026-09-13. **All three phases built** — slots and steps
2026-09-13, the editing UI and the `reset` flag 2026-09-15. See
[`README.md`](README.md#slots) and [`README.md#scripts`](README.md#scripts) for
what they do, and [`timeline.js`](timeline.js) /
[`timeline.test.mjs`](timeline.test.mjs) for the logic. This section is the whole
design conversation compressed, so picking it up cold doesn't mean re-deriving
it.

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

### Phase 1 — slots — BUILT 2026-09-13

Self-contained, immediately useful while playing, and independent of the step
rotation. This is the capture affordance that replaces the rejected "record live
play" idea: **play → tune → store into a slot → repeat → arrange slots later.**
It makes the pack a sampler pad bank.

- ✅ **Store** the live config (the five params) into slot 0-9 — `S`, then the
  slot (`⇧0`-`⇧9` was built and then pulled; see below)
- ✅ **Clear** a slot, leaving a hole
- ✅ **Fork on write** — see the forced constraint below
- ✅ Pills grow an empty state; `pickPreset` no-ops on an empty slot; the lerp
  cycle skips empties; `encodePack` encodes gaps
- ✅ Toast + pill flash on store, since overwriting is destructive-ish

Two things fell out of building it that the design hadn't anticipated:

- **The bank shows all ten pads, always.** Packs used to render one pill per
  preset, which makes an empty slot indistinguishable from a slot that isn't
  there — and storing into slot 7 of a 5-preset pack undiscoverable. Ten fixed
  pads is what the sampler metaphor was already implying, and it retires
  `presets.length` as a load-bearing number.
- **Empty pads are outlined, not dimmed.** Dimming was tried first and read as
  "filled but inactive" at a glance; an outline with no fill reads as a
  different *kind* of thing.

Also decided: **storing over a slot keeps that slot's timing.** `hold`/`dur`/
`ease` are the pack's rhythm and the slot is a position in it, so swapping what
sits there shouldn't change how the pack moves. (Phase 2 makes this moot by
moving timing onto steps.)

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

#### Settled while building

- **Clear gesture: arm, then pick** — the lean, as designed. `X` (button or key)
  arms and the next slot pick consumes it; `S` arms store the same way. Identical
  under a finger and a mouse, no long-press plumbing, and the armed state is
  visible (the bank tints, the mode row appends `clear?`). Cancels on `Esc`, on
  the same key again, or after 6s — an armed destructive mode shouldn't outlive
  your attention.
- **Arming is the *only* way to store.** `⇧0`-`⇧9` as a one-press direct store
  was built, used, and pulled the same day (2026-09-13): with no undo behind it,
  a single keystroke that silently overwrites a slot is one slip from losing
  something you wanted, and the slip is cheap — `⇧` is already held for `⇧B`, and
  the digits are right there. Two presses is the right friction for a
  destructive, unrecoverable action.

#### Still open

- **Undo on store, and `⇧N` behind it.** One level of undo is cheap, a history
  isn't. Fork-on-write already covers the catastrophic case (built-ins are safe)
  but not "I just overwrote my good slot 4." These two are one item, in this
  order: **undo first, then `⇧0`-`⇧9` can come back**, because the sampler
  convention is genuinely the faster gesture once a slip is recoverable — it just
  can't lead.

  The plumbing is still in place and the hard part is already solved. `slotFromKey`
  reads `e.code`, so `⇧1` is identifiable (`e.key` for it is `!`, with no digit in
  it to test) and layout-robust; the keydown handler returns early on `e.shiftKey`
  and `storeIntoSlot` is unchanged. Putting it back is deleting that guard.
- ~~**The `reset` flag on a step.**~~ **Built 2026-09-15** — see Phase 3.
- **Rename a slot.** Auto-names shipped as designed (`33x66x7`, or a base
  preset's name when all five params match it exactly). A rename would have to be
  a separate later gesture — prompting at store time interrupts the play→capture
  flow and is clunky on iPad.

### Phase 2 — steps — BUILT 2026-09-13

The rotation described above, plus:

- ✅ Step kinds: `lerp to` (`~`) and `cut to` (`=`, a 0s lerp, but worth naming).
- ✅ **Absolute seconds**, with `rate` as the global multiplier. The old
  `lerpDuration` knob became `rate`; `?lerpDuration=N` maps to `480/N` so old
  URLs still behave.
- ✅ **Loop = flat list + a loop-from marker** (`*`), one tail loop.
- ✅ URL form — settled as `?script==0@10;~1@6/3;*~2@8/60;~3@4`.
- **`>` can't be the lerp sigil.** It was built that way first and the regression
  run caught it: `>` is in the URL spec's query percent-encode set, so every step
  came back `%3E` and re-inflated the URL `compactQuery` had just flattened. `~`
  (glide) and `=` (snap) both survive raw; `>` is still read, never written. The
  raw set also gained `=`, which is safe because only the *first* `=` of a pair
  separates key from value.
- ✅ The **`reset` flag**, built 2026-09-15 — see Phase 3 below.

#### The doc contradicted itself about what a step is

The model table says a step *fuses* the move and the dwell ("go to slot N, by cut
or lerp, over T seconds; then dwell D seconds") and argues for it: fusing "the
edge and the node so there's never a dangling transition". But the sketched URL
form — `0 10s; >1 6s; 1 3s` — is *unfused*, with dwells and moves as separate
steps.

**Built fused.** The model table is the considered position; the URL was marked
"roughly". Fusing is what makes the doc's own argument work: `>2@8/60` has to say
how it arrives, so the transition can't dangle. It also halves the step count.

#### What pack timing became

Not deleted — **rotated, and demoted to a seed**. `scriptFromPack()` turns a
pack's per-leg `hold`/`dur`/`ease` into a script (the leg *out of* N is the leg
*into* N+1, and the first slot takes its arriving leg from the last, since the
cycle wraps). A pack therefore plays exactly as it did before scripts existed,
and every `?packs=...@hold/dur/ease` URL still works. A `?script=` overrides the
derived one entirely and is what copy-URL re-emits.

This is a better answer than dropping pack timing: the doc's objection was that
timing-on-the-preset *can't express* a preset arrived at two different ways. It
still can't — but it doesn't have to, because it is now only a default. Packs
stay palettes-with-a-rhythm; scripts are the playback model.

#### What a lerp moves *from*

Not the previous step. The step before the loop marker is one thing on the first
pass and another on every loop after, so a previous-step lookup has no single
answer. The sketch **snapshots the live values when the step index changes**,
which is also what keeps a step change caught mid-morph from jumping, and what
makes a cleared slot harmless. `stepAt()` deliberately does not report a `from`.

The cost: playback is not a pure function of `t`, so a Phase 3 scrub will be
approximate across a seek. Revisit if the timeline strip needs exactness.

### Phase 3 — UI surface — BUILT 2026-09-15

**B and A both, which is what the design already implied.** The fork was posed as
strip-vs-list, but the "if B" note underneath it — *strip selects, drawer edits*
— is a both-answer wearing a one-answer's clothes: B needs somewhere to put the
numbers, and A is that somewhere. C (radial) stays rejected for editing and stays
interesting as a display.

| | shape | verdict |
| --- | ----- | ---- |
| **A** | Vertical step list in the drawer | **Built**, as the `script` section: `slot` / `move` / `dwell` / `ease` on ordinary −/+ rows, plus morph↔cut, `!`, duplicate, drop, loop-from-here |
| **B** | Horizontal strip along the bottom | **Built.** One segment per step, width = its share of the script's seconds, approach as gradient and dwell as flat, `↻` on the loop step, playhead sweeping |
| C | Radial/ring | Not built. Still a poor editor and still possibly a lovely display |

- ✅ The **`reset` flag**, the item held since the design. `!` rides next to the
  slot (`=4!@30`), not in the timing tail — the tail is open-ended, so a trailing
  flag there gets swallowed by the ease field. It fires on step **entry**, which
  for a cut is the same instant as arrival. Measured on a 2s loop: exactly two
  re-seeds over 4s, molds 21px from center right after one and 79px 60 frames
  later. The hypothesis it was parked to test is now a thing you can actually
  watch.
- ✅ Suppressed completely under `?nopanel=1` — verified, the strip element is
  never built.

#### Decided while building

- **The strip is visible when playing OR when the drawer is open.** Two
  conditions, each with its own reason: it's a playback HUD, and it's the thing
  you select from while editing. It slides right by the drawer's 280px when both
  are up (`#drawer.open ~ #strip`), so a script is never half-hidden behind the
  drawer.
- **Nothing in the strip's state changes its layout.** The separator, the cut
  edge and the selection are inset shadows and an outline, never borders or gaps
  — so a segment's width stays exactly its fraction of the script and the
  playhead can't drift out of agreement with the segments. Measured: a 19.2s step
  in a 106.4s script came out 207px of a 1149px track, which is the fraction to
  the pixel.
- **The playhead derives from `stepAt()`**, via a pure `playheadFrac()`, rather
  than keeping its own clock. The strip is a *view* of playback, so a seek, a loop
  wrap and a rate change can't put the line and the molds in different places.
- **The strip rebuilds on script identity.** Every timeline.js edit returns a new
  script object, so `stripScript !== script` is a complete change signal — no
  dirty flags to keep in sync, and no teardown of the element under the pointer 60
  times a second.
- **The first script edit forks the script**, exactly parallel to slots forking a
  built-in pack, and forced the same way: `rebuildScript()` regenerates a derived
  script from pack timing, and `shareUrl()` emits only `?lerp=1` for one. An edit
  that didn't set `scriptCustom` would be wiped by the next slot store *and* be
  missing from the URL meant to reproduce it.
- **Clicking a segment seeks to the step's start, not its arrival** — the
  opposite of `0`-`9`. Pressing `3` means "show me slot 3 now"; clicking a segment
  means "play me this bit", and the approach is part of the bit.
- **`+` duplicates the selected step** rather than inserting a blank. A new step
  is nearly always a variation on the one you were just looking at.
- **A cut keeps its `move` duration parked**, so morph→cut→morph is lossless in
  the session. It can't survive the URL — a cut has nowhere to write the number —
  which the round-trip test asserts explicitly rather than leaving to be
  discovered.

#### Still open after Phase 3

- **No keyboard path to the editor.** Selecting a step is pointer-only. Stepping
  the selection with `⇧←/→` would be a few lines, but every free key is a key that
  can be hit by accident, so it waits for the want to be real.
- **Drag-to-retime a segment.** Deliberately not built (see above). The −/+ rows
  cover it; revisit only if re-timing by eye against the playhead turns out to be
  the thing you actually want to do.
- **The playhead is approximate across a seek**, because playback isn't a pure
  function of `t` — the lerp origin is snapshotted. Unchanged by Phase 3, and
  still only worth fixing if exact scrubbing is wanted.

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
- **`URLSearchParams` inflates every delimiter.** ~~Roughly two thirds of the
  `?packs=` URL.~~ **Fixed 2026-09-13** (`compactQuery` in `timeline.js`), and
  the estimate was high. Measured on the shipped Weave pack: the `?packs=` value
  is 178 characters of information that `URLSearchParams` expands to 266, in a
  365-character share URL. Raw, that's 178 and 277 — **a third off the param,
  24% off the whole URL**, not two thirds.

  The shape of the fix is worth keeping in mind for script URLs: let
  `URLSearchParams` do the encoding, since that's the part that has to be right,
  then un-escape only `:` `,` `;` `@` `/` — all legal raw in a query per RFC 3986,
  all passed through untouched by the `URL.search` setter, all read back
  unchanged by `URLSearchParams`. `&`, `=`, `+` and space stay encoded, since
  those hold the query's own structure together. A value that literally contains
  the text `%3A` was already encoded to `%253A` and doesn't match.
- **`!` survives a query raw, `>` doesn't** — same family as the `>` lesson, and
  worth re-checking per character rather than reasoning about it. `URLSearchParams`
  escapes `!` to `%21`, but it's an RFC 3986 sub-delim and *not* in the URL spec's
  query percent-encode set, so it joins `compactQuery`'s raw set and a `!` step
  costs one character instead of three. `*` (the loop marker) was already safe.
- **`node --test <dir>` with an absolute path fails** ("Cannot find module") —
  it tries to load the directory as an entry point. `node --test <file>`, and a
  bare `node --test` that discovers from the cwd, both work.
- **Two classic scripts can't both declare the same top-level `const`** — that's
  a redeclaration `SyntaxError`, not a shadow. Splitting `timeline.js` out of
  `sketch.js` therefore means *moving* `EASINGS` / `parsePack` / `encodePack`,
  never copying them. Related: `legDurFrames` can't see `sketch.js`'s live
  `lerpDuration` binding from another script, so timeline takes it as an
  argument and `sketch.js` keeps one-arg `legDur` / `legHold` wrappers.
- **`chrome.js`'s dev live-reload only polled `sketch.js`**, so edits to a new
  sibling script reloaded nothing. A fixed union list was tried first and was
  wrong: every sketch lacking a file on it logged a 404 twice a second, in the
  same console these sketches are debugged in. It's opt-in now — a sketch sets
  `window.SS_WATCH = ['timeline.js']` before `chrome.js` loads.

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

Built 2026-09-13: 36 tests in `timeline.test.mjs`, run with
`node --test petri-dish/timeline.test.mjs`. **89 as of 2026-09-15**, covering
step advancement, the `reset` flag, strip layout (`segments` / `playheadFrac`)
and every script edit.

The strip pulled more logic into timeline.js than expected, and that was the
point: segment widths and playhead position are *arithmetic*, so they belong
where they can be asserted rather than eyeballed. What stayed visual is what
should be — whether the approach-gradient reads as arriving, and whether the live
segment looks live. Both needed a real fix that no test would have caught: the
dwell was rendering darker than the end of its own approach, which reads
backwards.

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
