# WI-113 — Guard weave.item.add against zero-area (uneditable) items

- **Date:** 2026-06-06 · **Status:** Done · **DR:** DR-078

## Problem

The agent adds text (and other items) without a usable **position/size frame** — often
because it treats an ABSOLUTE container as auto-layout and omits the frame. The item
lands at zero area, fails the pointer-events hit-test (`HIT_THRESHOLD_AREA_PX2`), and
becomes **unselectable / uneditable**.

## Change (DR-078)

- `apps/web/src/document/commands.ts` — `ensureUsableFrame(kind, frame, seed)` +
  `MIN_FRAME_SIDE`; applied in `addItem.run` after the frame/attrsOverride merge.
  Restores the seed size for any missing/zero/NaN width (all kinds) and height (non-text;
  text auto-fits height). Keeps valid position. DEV `console.warn` on correction.
- `apps/web/src/features/aku/agent/weave-command-schemas.ts` — `FRAME` (width/height
  must be > 0) + `weave.item.add` description (check container layout: absolute → frame
  required with w,h>0; auto-layout → omit frame).

## Acceptance

- No `weave.item.add` (agent or user) can emit a zero-area item; valid frames pass
  through; the common text case (auto-height) is preserved.
- Verify: `commands.test.ts` "usable-frame guard" (5 cases) + 103 commands tests +
  `tsc --noEmit` + `biome check` green.
