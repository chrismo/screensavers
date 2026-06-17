# knights — ideas & deferred work

Knights-specific backlog and the design rationale worth keeping. Cross-sketch
ideas (preset banks, image export, the general output-fingerprinting idea) live
in the repo-root [`../ideas.md`](../ideas.md).

The offline pattern miner — which runs the shared [`../solver.js`](../solver.js)
headless in node to sweep and score the roster space — lives in
[`explore/`](explore/).

## Interactive click-drag zoom (tag: v3)

In the sketch itself, **drag a rectangle to zoom into that region** (and a key to
zoom back out). Right now finding the little defect "critters" (crosshairs,
caterpillars, ring-strings, bugs) means eyeballing the full field and re-rendering
a `--clip` with `tools/shot.mjs` to inspect — a drag-zoom would make that
exploration live and immediate. Pairs naturally with **image export** (zoom in,
then save the crop) and the deterministic-nesting property (the same critters
exist at every extent, just shrunk — so zoom is the right verb, not re-solve).
Knight-specific UX for now, but the rubber-band + viewport-transform mechanism
would generalize to any canvas sketch.

(Noted 2026-06-13; deferred to a knights **v3** at the user's call.)

## Acceleration toggle (steady-pace "study" mode)

Turn the exponential ramp off (`rateAt(t) = accel ? speed·e^(t/TAU) : speed`) so
the run plays at a constant chosen level start-to-finish — good for watching the
*whole* build at one steady rhythm. Cheap to add (panel toggle + key + `?accel=0`)
and it removes the ramp/handoff seam entirely. The catch: constant rate doesn't
compose with large extent — S=1000 ≈ 3.9M placements is ~135 h at 8/s and
effectively never at slow levels. So ship it as an explicit "steady pace, no
zoom-out payoff" mode that implies a small/medium extent; it loses the
narrate→interleave→zoom-out reveal that's the whole point at scale.

(Discussed & deferred 2026-06; user likes the slow-watching direction so will
likely want this.)

## Symmetric (invertible) back-stepping

Forward stepping (`commitAt`) is incremental (cost ∝ distance stepped); backward
stepping is O(head) because three pieces of forward state are a *lossy fold* —
cheap to push, impossible to pop: `threatGrid` is OR'd bits (can't tell when the
last same-color attacker leaves a cell), `cursors[k]` is overwritten, `maxR` is a
running max. (The field pixel and `occGrid` are already invertible — each cell is
claimed once.)

What ships today is the pragmatic fix — **coalesced replay**: a back-step walks
`head` back + flags dirty, and `update()` does at most one `repaintField` per
frame (~300–400 ms worst case at 4M cells, bounded under a held key, zero extra
memory). The *symmetric* design — bitmask → per-color counts, `cursors` →
per-color stack, `maxR` → per-event history — would make back-steps O(distance)
like forward, but costs ~tens of MB extra state at S=1024,K=8. It's a pure
addition (counts ⊃ bitmask, stack ⊃ current cursor): `commitAt` untouched, just
add the `unCommitAt` inverses. Build it only if rapid back-scrubbing at large
extent becomes a real workflow; coalesced replay is the right cost/complexity
point until then.

## Pattern taxonomy — observed knights families

The cross-sketch *idea* (fingerprint a generative sketch's output to categorize
it) lives in [`../ideas.md`](../ideas.md); this is the knights **catalog** of what
actually shows up, from a predict-then-render sweep (exemplars in
[`gallery.html`](gallery.html)). The [`explore/`](explore/) miner now does that
sweep automatically — scoring boards for domains / chaos / symmetry / weaves — so
this catalog is the human-curated read of what its lenses keep surfacing.

**Predict from the roster (by input, cheap and strong):**

- **# distinct reaches** (Chebyshev radius per leaper): same reach → orderly;
  *mixed* reaches → chaos (the knight-2 + antelope-4 discovery).
- **# colors (K)** — more interference; there's a sweet spot (~6). A too-"matched"
  K collapses to four flat quadrants (king at K=4; ferz+dab+alfil at K=8).
- **colorboundness** — ferz/alfil/dabbaba only attack one parity sublattice, so
  they make clean quilt/checker textures; knight/wazir aren't colorbound.
- **neighbor-coverage** — short reach + FULL nearest-neighbor coverage (the "king"
  = wazir+ferz) makes LARGE angular sectors, the opposite of a small mosaic.

**Families (by output):**

- **Diagonal bands** — pure knights.
- **Checkerboard** — wazir ×2.
- **Pinwheel / sunburst** — short-reach pieces with full neighbor coverage; flat
  angular sectors meeting at a central singularity.
- **Quilt** — ferz+dab ×8.
- **Circuit-board / labyrinth** — a domain-forming short piece (king) + exactly
  ONE long-reach piece, whose far vetoes carve walls through the fat domains.
  Reach tunes it: knight (r2) → tight terraces; zebra (r3) → dense PCB; antelope
  (r4) → long flowing conduits.
- **Pyramids / sawtooth** — a colorbound piece speckles a "sky" while a plain
  piece builds smooth domains whose walls radiate as straight rays → triangular
  pyramids with self-similar sawtooth edges.
- **Turbulent mosaic** — mixed-reach compounds (e.g. knight+antelope ×2).

**Heterogeneous rosters (different compounds per color) — the richest axis:**

- **Dichotomy > diversity.** One clear two-regime contrast beats many-way blends.
  Pick TWO contrasting types and let them segregate.
- **Contrast flavors:** *smooth-vs-grain* (non-CB vs CB → alternating satin/velvet
  "petal flower" wedges), *calm-vs-busy* (domain-former vs disruptor),
  *muted-vs-vivid* (dabbaba's sparse fill reads desaturated — the "muted agent").
- **Chaos-placement dial:** a disruptor that *can* form domains (knight+antelope)
  is pushed to a busy outer FRAME around a calm core; a *purely* long-reach
  disruptor (zebra/antelope alone) can't claim territory, so it dumps interference
  at the spiral CENTER. (gallery: *Rose window* vs *Chrysanthemum* — inverses.)

**Defects** split by reach × colorboundness: short-reach *colorbound* pieces get
blocked on one sublattice, so empties align into **linear** (row/column) defects;
long-reach mixes scatter **point** (island) defects. (gallery: *A dotted line* vs
*Three diagonal bugs*.)

**Deterministic nesting** — solve order doesn't depend on extent, so a small-extent
field is exactly the *center* of a large-extent one; raising the extent only
reveals new outer regions around the same core.

## Design rationale (why it's shaped this way)

Kept from the old design spec (the V1 WebGL → V2 Canvas2D migration is done and no
longer interesting; these decisions still explain the code):

- **Reveal = per-cursor construction-order.** Each color's cursor plays out
  independently; a heavily-contested color races far out along the spiral hunting
  open ground while a less-blocked one stays compact — so "how far out each cursor
  is" reads as "who's getting blocked most," made legible by the per-color pins. A
  uniform glow-sweep averages that away, so it's *not* required (optional mode at
  most, maybe never).
- **Renderer = Canvas2D.** The field is one `drawImage`/frame off a 1px-per-cell
  offscreen (memory ≈ a texture at equal extent); sufficient through ~1024–2048. A
  WebGL hybrid is only worth it for extreme extents (~8k+) or a pixel-perfect glow,
  neither wanted. The real scale limiter was the typed-array sequence rework, not
  the renderer.
- **Timing = `speed` ramp.** `speed` (opening placements/sec, exponential ramp) is
  the primary pacing knob — it sets the narrated-intro pace, the sketch's whole
  identity. A duration-first model (total run seconds) was rejected: it makes the
  intro pace emergent rather than set. Static mode is the `speed=0` case. `speed`
  is a discrete level 0–8 on a geometric ladder; the per-cell drop pop is a
  constant ~0.12 s, decoupled from level, so slow levels give a leisurely crawl
  while each cell still fills quickly.
