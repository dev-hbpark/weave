# DR-078 — weave.item.add usable-frame guard: a zero-area item can never land (uneditable)

- **Date:** 2026-06-06 · **Status:** Accepted · **WI:** WI-113
- **Relates:** `commands.ts` (addItem, `normalizeShapeAttrs`/`setImageCrop` guard precedents WI-062/WI-061),
  hit-test gate `total-scale-context.ts` `HIT_THRESHOLD_AREA_PX2` + `NestedFrame.tsx`,
  `weave-command-schemas.ts` (agent-facing contract), 루트 CLAUDE.md (Continuous Self-Verification)
- **Operator directive (2026-06-06):** 에이전트가 텍스트를 추가할 때 **포지션(frame) 정보 없이**
  넣는 경우가 있어 편집 불가 상태가 됨 — 실수하지 않도록 가드해야 함. 또한 추가 전에 **대상
  컨테이너의 레이아웃을 확인**하는 과정이 필요 — absolute인데 grid인 줄 알고 frame 없이 넣기도 함.

## Context

An item is interactive only while its on-screen AREA clears `HIT_THRESHOLD_AREA_PX2`
(10 px²); below it, `NestedFrame` sets `pointer-events:none` and the item can't be
clicked, selected, or edited. The agent (small-think, driving weave over reverse-MCP)
sometimes calls `weave.item.add` with a **zero/degenerate frame** — width 0, height 0,
or NaN — most often because it treats an **ABSOLUTE** container as an auto-layout
(flex/grid) one and omits/zeroes the frame. An absolute parent does NOT auto-position
its children, so the item lands at zero area → permanently uneditable.

`item.add` only requires `kind`; `frame` is optional and, when provided, is shallow-
merged over the seed with **no validation** (the seed's `FULL_FRAME` is wiped by a
degenerate override). The schema told the agent nothing about the size requirement or
the layout dependency.

## Decision

Defense in depth: a hard guard at the command layer + clearer agent guidance.

### D1 — Command-layer hard guard (`commands.ts` `addItem.run`).
Capture the kind's **seed frame** before overrides. After merging caller `frame` /
`attrsOverride`, run `ensureUsableFrame(kind, frame, seed)`:
- restore the seed value for any **missing/zero/NaN** `width` (all kinds) and `height`
  (non-text kinds);
- keep whatever **valid position** (`x`/`y`) and valid dimensions the caller gave;
- **Text auto-fits its height** (frame.width drives wrapping), so a *finite* text
  height — including 0 — is left to the auto-fit; only width is enforced for text.
A degenerate frame is `MIN_FRAME_SIDE = 1e-3` (ratio). Pure + unit-tested. In DEV a
`console.warn` surfaces each correction so the agent's mistakes are visible. This is the
hard guarantee — no add (agent OR user) can produce a zero-area item, regardless of
container layout. Mirrors the existing `normalizeShapeAttrs` (WI-062) / `setImageCrop`
(WI-061) command-layer guards.

### D2 — Agent guidance (`weave-command-schemas.ts`).
- `FRAME`: state that `width`/`height` MUST be > 0 — zero/omitted → zero area →
  invisible & **unselectable (uneditable)**; note text auto-fits height (width matters).
- `weave.item.add` description: **check the target container's layout first** (from the
  snapshot). ABSOLUTE container → MUST pass a frame with width>0 & height>0 (no auto-
  position). AUTO-LAYOUT (flex/grid) → OMIT the frame (the layout positions & sizes the
  child; don't fight it). "Do not assume a container is grid; verify."

## Consequences

- (+) A sizeless/positionless add can never produce an uneditable item — the failure the
  operator reported is structurally impossible now. Works for both layout kinds (the
  guard ensures a non-degenerate frame; the layout engine still repositions for auto-
  layout parents).
- (+) Valid frames pass through untouched; the common correct text case (width set,
  height auto) is preserved (text height left to auto-fit).
- (+) DEV warn turns a silent agent mistake into a visible signal during testing.
- (−) A guarded text whose width was zeroed becomes full-width (seed) — a recoverable
  visible default, not the agent's intended box. The schema guidance reduces how often
  the guard must fire. (Acceptable: editable beats invisible.)
- (−) The guard restores the SEED size, not a context-aware one (no canvas px in the
  command). Sufficient for selectability; fine-grained sizing stays the agent's job.

## Verification

- Unit (`commands.test.ts` "usable-frame guard"): zero width on text → restored, position
  kept; text height 0 → kept (auto-fit), width fixed; non-text (image) height 0 →
  restored; valid frame unchanged; omitted frame keeps seed. 103 commands tests + `tsc`
  + `biome` green.
- Full-turn behavior (agent reliably reading the layout) is model-dependent → the schema
  guidance is best-effort; the command guard is the hard backstop.
