# DR-104 — Agent text in an auto-flex ROW gets a CSS-`flex:1` share policy

**Status:** ACCEPTED
**Date:** 2026-06-08
**Work item:** WI-149
**Related:** DR-103 (render legibility floor), DR-098 (Fixed box for free-placed agent text), small-think DR-052

## Context

Recurring defect: an agent-generated row (`[01 | description]`) rendered the
description as a ~1-glyph-wide vertical sliver. Earlier DRs treated it as a
render problem (DR-103) and a guidance problem (DR-052) — both insufficient.

Root cause, established from the **actual agent command log** + a live doc probe:

1. The agent adds the text into a flex row with **no `frame`** — the CSS-natural
   "size me by content" intent. It never sets a bad width or basis.
2. weave's `ensureUsableFrame` fills the missing width with the kind seed, and
   the **text seed is `FULL_FRAME` (width 1.0)**. So the child enters the row at
   full parent width.
3. Two full-width children **over-fill** the row. agocraft `auto-flex`
   (`engine.ts` `resolveMainSizes`) shrinks them with **no `min-content` floor**
   (`Math.max(0, …)` → toward 0), and `joinPolicy` (`engine.ts:400`) **freezes
   the shrunk width back as a numeric `basis`** with `grow:0`.
4. `resolveBasis("auto")` also returns the *current frame width*, so on every
   later relayout `basis = current width = 0.011`, `grow:0`, excess≈0 → the child
   is **permanently stranded** at the sliver. A one-way ratchet to zero.

The probe confirmed the frozen end-state: `[01 basis 0.829, desc basis 0.011]`,
summing to available — no live shrink, just frozen. **The agent's intent was
reasonable; the weave full-width seed + engine ratchet broke it.**

## Decision

When the agent adds a **text into an auto-flex ROW** with no explicit
`layoutChild`, stamp `{ kind:'auto-flex', grow:1, shrink:1, basis:0 }` (CSS
`flex:1`) in `fixAgentTextBox` (`agent-text-resize.ts`). 

- `basis:0` → the child contributes **nothing** to the row's base size, so the
  row can never over-fill from the full-width seed → it never shrinks → the
  ratchet cannot start.
- `grow:1` → children **share** the row's main-axis width evenly; none hogs,
  none starves.
- agocraft `onChildAdd` **respects** a policy whose kind matches the parent
  layout (`existing.kind === layout.kind` skips `joinPolicy`), so the engine
  keeps this verbatim instead of freezing the full-width seed.

This sets correct space **at add-time** (not post-render correction). It is the
companion to the existing free-placement branch (DR-098 Fixed box) — both pick
the right `layoutChild` from the container's layout kind.

## Scope / non-goals

- **auto-flex COLUMN and auto-grid are left alone.** A column's main axis is
  height (width is the cross axis, bound by align/stretch); a grid cell's track
  bounds the width. The full-width seed is harmless there and the layout owns
  the size (auto-height text).
- **Deliberate asymmetry** (a narrow number badge + a wide body) remains the
  agent's job via an auto-grid track or an explicit `grow`/`basis` — any
  agent-set `layoutChild` short-circuits this stamp. The trade-off of `flex:1`
  is an even split (a short number sits centred in its half) — acceptable and
  far better than a stranded sliver; the agent already uses grids for intended
  asymmetry (seen throughout the command log).
- The agocraft engine gaps themselves (no `min-content` shrink floor; `basis`
  ratchet via frozen widths) are **not** fixed here — they need a per-child
  `min` in the flex policy + host-supplied text measurement + a re-vendor. This
  weave-side policy avoids triggering them and is sufficient for the agent path.

## Verify

`biome` + `@weave/web` typecheck clean; Rule 6 declarativecheck OK; the full
aku agent suite (100 tests) passes incl. new `agent-text-resize` cases for the
flex-row share, grid pass-through, and explicit-policy respect.
