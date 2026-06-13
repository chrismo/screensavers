# ideas — cross-sketch backlog

Deferred ideas that aren't specific to one sketch. When built, most of these
probably belong in the shared infrastructure (`panel.js` / `chrome.js`) so every
sketch benefits, rather than being reimplemented per sketch. Sketch-specific
ideas live in that sketch's own notes (e.g. `knights/spec.md`).

## Preset banks / URL-carried presets

Applies to any sketch that has presets **and** a state-encoding "copy screensaver
URL" (knights, petri-dish, …).

**Key realization: banks are pure navigation.** The copy-share URL already encodes
the full state (groups / params), so however the quick-pick is organized, copied
URLs keep reproducing exactly. Banks only change what the `0–9` keys and the panel
pills point at — they don't touch reproduction.

Two sizes, smallest first:

- **URL-carried bank (the lighter, preferred first step).** A URL param that
  carries a whole bank of (up to ~8) presets — a list of the sketch's own
  preset-specs, e.g. `?presets=<spec>;<spec>;…`. Then a "collection" is just a
  **bookmarked URL**: favorites can be gathered anywhere you keep links (browser
  bookmarks, a text file, a gist) instead of being baked into the code. The 8
  slots / `0–9` keys map to whatever the URL supplies, falling back to the
  built-in bank when the param is absent.

- **Multiple banks of 8 (the fuller version).** N banks (e.g. 32 presets in 4
  banks), inline or in an external `presets.js` (loaded like `panel.js`), with a
  **hotkey to cycle banks** (`B` / `Shift-B`) + `?bank=`. Mechanism = banks/pages
  of 8 so the `0–9` muscle memory survives; route the existing
  pick/cycle/pills/selection logic through a `curBank()`, and regenerate the pills
  on switch. A between-runs cycle (knights' `L`) rolls within the active bank,
  optionally rolling over into the next.

**Where it should live:** ideally shared in `panel.js`, with each sketch supplying
its own preset-spec encode/decode, so all sketches get banks uniformly. Related
note: some sketches are light on shortcuts (knights) vs. heavy (petri-dish has
many) — there's room to grow more fine-tuned per-sketch controls, and a bank
hotkey is a natural first one.

(Noted 2026-06-12; not needed now — captured for if/when collecting presets
becomes a thing.)
