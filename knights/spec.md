# knights — design notes & migration history

> **CUTOVER DONE (2026-06-12, v1.20).** The Canvas2D "how it's built" sketch (V2,
> formerly `knights-lab/`) replaced the original WebGL `knights/` (V1) — V1 is
> deleted, V2 now lives at `knights/`, and the gallery's "labs" entry is gone.
> This doc is kept as the design rationale + migration record; the parity table
> below tracks what V1 had and how V2 covers it.

## Goal (original, now met)

`knights-lab/` (V2, Canvas2D, "how it's built") was built to become the successor
of `knights/` (V1, WebGL, the zoomed-out pattern): iterate V2 side by side until
it's a **superset** of V1, then strangler-fig the cutover. That cutover is now
done (see banner above).

This doc enumerates the differences, especially **things V1 had that V2 didn't**
(the parity gaps — now closed or resolved), plus V2-only additions and the design
decisions.

## Parity gaps — V1 has it, V2 doesn't (close these)

| # | Gap | V1 (knights/) | V2 (knights-lab/) today | Action / notes |
|---|-----|---------------|--------------------------|----------------|
| 1 | **Large extent** | default `512`, up to `MAX_S` (~½ of GL max texture, thousands) | **DONE (v1.11):** typed-array sequence unlocks large S. Default later set to `24` and cap to `1000` (v1.16). | Reworked: detail objects kept only for the narrated opening; full sequence in flat typed arrays (`seqT`/`seqK` Uint8, `seqX`/`seqY` Int16) + sparse `detail[]`; bulk walks the arrays via `commitAt`. Verified: S=1024 = 3.9M events built in **273 ms** (~25 MB), no stall. Headroom to ~2048 if wanted. |
| 2 | **Reveal modes / sweep** | `spiral` (point sweeps the numbering spiral with a glowing head), `square` (whole rings), `all` (finished, just zoomed). Gated on each cell's spiral number in the shader. | only construction-order fill (cells appear in the order the solver places them) | **Resolved (see Decisions): NOT a parity requirement.** V2's per-cursor construction-order reveal is canonical — it shows the dynamics V1's uniform sweep averages away. Glow-sweep is an optional mode at most, low priority / maybe never. |
| 3 | **Static "hold" mode** | `zoom=0` → hold on the finished image (inspect a combo, no animation) | **DONE (v1.13):** `speed=0` (the "0" of the chosen timing model) jumps to the finished field and holds — no narration/ramp/fade cycle. Reached via the panel speed-arrow floor, the `S` key, or `?speed=0`/`?static=1`. Overlays (cursor pins etc.) are suppressed so it reads as a clean wallpaper. | Done. |
| 4 | **Zoom-timing model** | `zoomSec` = seconds for one full zoom-out (default 90); `← →` adjust | `speed` = opening placements/sec (default 2), exponential ramp | **RESOLVED (see Decisions): keep `speed`.** It directly sets V2's narration-first identity (the narrated intro pace); `zoomSec`/total-duration was rejected as a worse fit. Static mode is the `speed=0` case. |
| 5 | **`M` reveal key** | `M` cycles reveal mode | n/a | Drop — n/a unless the glow-sweep is ever added as an optional mode (#2). |
| 6 | **Preset list** | …`Antelope×3`, `Ferz+Dab×6`… | swapped to `Ferz+Dab×4`, `Wazir×2` (dropped `Antelope×3`) | Reconcile to one canonical preset set for v2. |
| 7 | **extent step size** | `stepExtent = 64` | **DONE (v1.16):** discrete ladder `EXTENT_STEPS = [24, 100, 200 … 1000]` (default `24`); panel/`[ ]` step rungs, URL snaps to nearest | Replaced the fixed step with named rungs. No alignment needed (Canvas2D; V1's 64 was just convenience, not a WebGL/texture requirement). |

## V2-only additions — preserve through the merge

These are the reason V2 exists; the "opening act" the original TODO wanted:

- **Construction-order narration:** eval-by-eval cursor crawl, ✕ on enemy-blocked
  cells, **attacker lines + glow** (which enemy knight blocks, shape-correct),
  **move boxes** (the active piece's own reach, in its color), **danger map**
  (the full threat field — every empty cell under enemy fire, attacker-colored),
  **per-color "left off" pins**, one-time **sonar** ring on each placement.
- **Eval-granular pause / stepping** (`Space`, `←/→`) — the same per-candidate
  frames the live crawl shows, hand-advanced.
- **`speed`** control and the **`VERSION`** tag in the panel.
- Canvas2D renderer with a 1px-per-cell offscreen field blitted once per frame.

At large extent these auto-hide: the overlays only draw while zoomed in
(`cellPx >= NARRATE_PX`), so the narration is a brief opening that fades into the
bulk fill — i.e. "always on" works without a toggle. Still add `?details=0`
(+ a key) for a pure-screensaver look.

## Equivalent in both (no work)

Group editor (chips + roster + swatches), procedural palettes, preset pills,
config label (persists under `?nopanel=1`), `copyShareUrl` screensaver URL,
fullscreen (`F`), cycle presets (`L`), hide panel (`H`), `?panel=open`, the
house monospace-glass drawer, dev live-reload via chrome.js.

## Shared-core debt (do during the merge)

Both files **duplicate** the pure core (PIECES/PIECE_LABEL, spiral step, leaper
offsets, palettes, group helpers, the group-editor drawer). The graft is the
moment to extract a shared `knights/core.js` that both import, so V1 and V2 stop
drifting. (V2's `solveSteps` is the instrumented superset of V1's `simulate`.)

## Decisions

**Resolved**
- **Reveal = per-cursor construction-order, canonical.** Each color's cursor
  plays out independently; a heavily-contested color's cursor races far out along
  the spiral hunting open ground while a less-blocked one stays compact — so "how
  far out each cursor is" reads as "who's getting blocked most," made legible by
  the per-color pins. V1's uniform glow-sweep averages that away, so it's *not* a
  parity requirement (optional mode at most, low priority / maybe never).
- **Renderer = Canvas2D.** Dropping the glow-sweep removes the only real reason
  for a WebGL hybrid. Canvas2D is sufficient through ~1024–2048 (the field is one
  `drawImage`/frame off a 1px-per-cell offscreen — same idea as V1's textured
  quad; memory ≈ V1's texture at equal extent). A WebGL hybrid (GL field + 2D
  overlays) is only worth it for extreme extents (~8k+) or a pixel-perfect glow,
  neither of which we want now. The real scale limiter is the `events[]` rework
  (gap #1), not the renderer.

**Resolved (cont.)**
- **Timing model = `speed` (ramp), keep it.** `speed` (opening placements/sec,
  exponential ramp) stays V2's primary pacing knob — it directly sets the
  narrated-intro pace, which is V2's whole identity. V1's `zoomSec` (total
  run duration) was rejected: duration-first makes the intro pace emergent
  rather than set, a poor fit for a narration-first sketch. **Static mode is the
  `speed=0` case** (mirrors V1's `zoom=0`): jump to the finished pattern and hold.
  (v1.13.) v1.14: `speed` now also scales the narrated intro crawl (was a fixed
  `EVAL_PER_SEC`, so the knob looked dead while you watched the opening) — it's
  now the overall tempo, not just the post-intro ramp multiplier. v1.15: `speed`
  became a discrete **level** 0–8 on a geometric ladder (`1/16…8` placements/sec),
  shown in the panel and stored in the URL as the integer level — so the slow
  end reaches 1/16/s without ever surfacing a fraction in the panel or the URL.
  (v1.16: panel shows the bare level number, not a gauge.) v1.16 also decoupled
  the per-cell **drop pop** from speed — it's a constant ~0.12 s real-time pop, so
  slow levels give a leisurely *crawl* to watch while each cell still fills
  quickly (the dwell on a placed cell is slow, the fill is not). v1.17 fixed a
  jarring speed *lurch* at the intro→ramp handoff (placement #12): the old code
  set `clock = timeForPlayed(head)`, fast-forwarding up the `e^(t/TAU)` curve so
  the ramp began at `EVAL_EVENTS/TAU + speed` (≈2+speed) — a ~9× jump at slow
  levels. Now the ramp is anchored to the intro's *measured* average rate
  (`head/introT`, clamped to ≥ speed), so the two phases meet continuously.

**Deferred (revisit on request)**
- **Acceleration toggle — yes, but only for small extents.** When the user asks
  "why don't we have an acceleration toggle?", the answer is: *we can — as long as
  we limit it to small contexts.* The toggle would turn the exponential ramp off
  (`rateAt(t) = accel ? speed·e^(t/TAU) : speed`) so the run plays at a constant
  chosen level start-to-finish — great for watching the *whole* build at one
  steady rhythm (a study mode), cheap to add (panel toggle + key + `?accel=0`),
  and it removes the ramp/handoff seam entirely. The hard catch: constant rate
  doesn't compose with large extent — S=1000 ≈ 3.9M placements is ~135 h at 8/s
  and effectively never at slow levels. So ship it as an explicit "steady pace, no
  zoom-out payoff" mode that implies a small/medium extent; it loses V2's
  signature narrate→interleave→zoom-out reveal, which is the whole point at scale.
  (Discussed & deferred 2026-06; user likes the slow-watching direction so will
  likely want this.)

**Still open**
1. ~~**Details default:**~~ **DONE (v1.20):** narration overlay is on by default
   (auto-hides when zoomed out) AND has an explicit toggle — `D` key, panel row,
   `?details=0`, carried into the copied screensaver URL. Off = field + grid only.
3. **Symmetric (invertible) stepping — deferred, not blocked.** Forward stepping
   (`commitAt`) is incremental (cost ∝ distance stepped); backward stepping is
   O(head) because three pieces of forward state are a *lossy fold* — cheap to
   push, impossible to pop. `threatGrid` is OR'd bits (can't tell when the last
   same-color attacker leaves a cell), `cursors[k]` is overwritten (prior
   placement discarded), `maxR` is a running max (prior value discarded). The
   field pixel and `occGrid` are *already* invertible (each cell is claimed once).
   v1.12 ships the pragmatic fix — **coalesced replay**: a back-step just walks
   `head` back + flags dirty, and `update()` does at most one `repaintField` per
   frame (~300–400 ms worst case at 4M cells, bounded under a held key, zero extra
   memory). The *symmetric* design — bitmask → per-color counts, `cursors` →
   per-color stack, `maxR` → per-event history — would make back-steps O(distance)
   like forward, but costs ~tens of MB extra state at S=1024,K=8 (counts grid is
   K× the bitmask). It's a **pure addition** (counts ⊃ bitmask, stack ⊃ current
   cursor): `commitAt` is untouched, you just add the `unCommitAt` inverses
   alongside. Build it only if rapid back-scrubbing at large extent becomes a real
   workflow; coalesced replay is the right cost/complexity point until then.
   (Checkpoint+replay is the wrong fit here — the state worth snapshotting is the
   big grids, so snapshots cost more memory than just making the ops invertible.)

## Suggested order of work

1. ~~**Typed-array sequence rework** (#1) → unlock extent 1024.~~ **DONE (v1.11).**
2. ~~**Static/finished mode** (#3) + settle the **timing model** (#4).~~ **DONE
   (v1.13).** `speed=0` static; `speed` model kept.
3. ~~**Details toggle.**~~ **DONE (v1.20):** `D` / panel / `?details=0`.
4. ~~**Preset reconcile** (#6), **extent step** (#7).~~ **DONE (v1.16/1.19):**
   extent ladder; presets refreshed (Ferz+Dab ×8, Wa+Fe+Dab ×6, 8-mix in).
5. ~~**Strangler cutover.**~~ **DONE (2026-06-12, v1.20):** V1 deleted, V2 promoted
   to `knights/`, gallery "labs" entry removed (see banner up top).
6. **Reveal-mode decision** (#2/#5) — only if the WebGL glow-sweep is ever wanted
   back as an optional mode (resolved as NOT required; low priority / maybe never).
   The shared-core extraction is now moot — with V1 gone, V2's inline copy is the
   only one, so there's nothing to de-dupe.
