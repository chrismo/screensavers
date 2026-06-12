# knights-lab → knights v2 — parity spec

## Goal

`knights-lab/` (V2, Canvas2D, "how it's built") is intended to grow into the
successor of `knights/` (V1, WebGL, the zoomed-out pattern). Plan: iterate V2
side by side until it's a **superset** of V1, then strangler-fig the cutover —
flip the index label, eventually point `knights/` at V2 (rename / redirect).
We are NOT touching the index promotion or deleting V1 yet.

This doc enumerates the differences, especially **things V1 has that V2 doesn't**
(the parity gaps to close), plus V2-only additions to preserve and the open
design decisions.

## Parity gaps — V1 has it, V2 doesn't (close these)

| # | Gap | V1 (knights/) | V2 (knights-lab/) today | Action / notes |
|---|-----|---------------|--------------------------|----------------|
| 1 | **Large extent** | default `512`, up to `MAX_S` (~½ of GL max texture, thousands) | **DONE (v1.11):** default `60`, cap raised to `1024` (panel/URL/engine) | Reworked: detail objects kept only for the narrated opening; full sequence in flat typed arrays (`seqT`/`seqK` Uint8, `seqX`/`seqY` Int16) + sparse `detail[]`; bulk walks the arrays via `commitAt`. Verified: S=1024 = 3.9M events built in **273 ms** (~25 MB), no stall. Default unchanged (10.6k events, ~6 ms). Headroom to ~2048 if wanted. |
| 2 | **Reveal modes / sweep** | `spiral` (point sweeps the numbering spiral with a glowing head), `square` (whole rings), `all` (finished, just zoomed). Gated on each cell's spiral number in the shader. | only construction-order fill (cells appear in the order the solver places them) | **Resolved (see Decisions): NOT a parity requirement.** V2's per-cursor construction-order reveal is canonical — it shows the dynamics V1's uniform sweep averages away. Glow-sweep is an optional mode at most, low priority / maybe never. |
| 3 | **Static "hold" mode** | `zoom=0` → hold on the finished image (inspect a combo, no animation) | always animates the build; no static-final mode | Add an equivalent (e.g. `speed=0` or a `mode=all`) that jumps to the finished field and holds. |
| 4 | **Zoom-timing model** | `zoomSec` = seconds for one full zoom-out (default 90); `← →` adjust | `speed` = opening placements/sec (default 2), exponential ramp | Different mental models. Decide which V2 ships (or support both). `zoomSec`-style "total duration" may be friendlier for screensaver setup. |
| 5 | **`M` reveal key** | `M` cycles reveal mode | n/a | Drop — n/a unless the glow-sweep is ever added as an optional mode (#2). |
| 6 | **Preset list** | …`Antelope×3`, `Ferz+Dab×6`… | swapped to `Ferz+Dab×4`, `Wazir×2` (dropped `Antelope×3`) | Reconcile to one canonical preset set for v2. |
| 7 | **extent step size** | `stepExtent = 64` | `stepExtent = 20` | Re-tune once large extents are supported (probably want coarse steps again). |

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

**Still open**
1. **Zoom/timing model:** `speed` (ramp) vs `zoomSec` (total duration) vs both.
2. **Details default:** always-on-with-auto-hide (current behavior) vs a visible
   toggle; what `?details=` / key.
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
   `?extent=1024` works; default stays 60. (`?details=0` still TODO.)
2. **Static/finished mode** (#3) + settle the **timing model** (still-open #1).
3. **Reveal-mode decision** (#2/#5) — if bringing the sweep over, that's the big
   visual piece.
4. **Preset reconcile** (#6), **extent step** (#7).
5. **Extract `knights/core.js`** and de-dupe (shared-core debt).
6. Strangler cutover: index label → "Knights v2", then repoint `knights/`.
