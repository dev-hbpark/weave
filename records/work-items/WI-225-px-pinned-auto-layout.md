# WI-225 — Structural fix: px-pinned auto-layout (stop the cascade of Hug bugs)

## Metadata

| Field | Value |
|---|---|
| ID | WI-225 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | DONE (4 reported symptoms) · item.add Hug-growth follow-up open |
| Type | Structural fix (layout / ratio↔px circularity) |
| Decision | [DR-141](../decisions/DR-141-px-pinned-auto-layout.md) |
| Supersedes | the incremental WI-048 patches' #2 basis bake (now via the pin) |

## Problem

Operator hit a cascade of auto-layout (Hug/Fixed) bugs in succession:
1. **gap → 점점 커짐** (gap0.3·4children → container width 0.557→0.657 GROWS).
2. **Hug→Fixed→resize → child 작아짐** (92px→22px).
3. **너비Hug→자식높이변경→너비Fixed→resize → 자식 높이 축소.**
4. **Hug 컨테이너 이동만 해도 자식 축소.**

Operator: *"이렇게 다양하게 여기저기서 문제생기지 않게 구조가 필요해."* The symptoms
all share ONE root cause: weave items are sized by parent-relative `frame` ratio,
but auto-layout needs stable px intrinsics → the Hug px pipeline (`sizePx ?? abs`,
`gapPx = gap × box`) and the Fixed ratio adapter (`resolveBasis("auto")` reads the
live frame) are **circular** → drift/grow/shrink on every op.

## Fix

[DR-141](../decisions/DR-141-px-pinned-auto-layout.md) — **px-pin the auto-layout
subtree**. New helper `apps/web/src/document/layout/pin-auto-layout-px.ts`
(`pinAutoLayoutPx` + `stagePinned`) bakes each child's `sizePx` + explicit
basis/crossSize and the container's `gapPx`/`paddingPx` from the current geometry;
the engine reads px as authoritative, so the subtree is stable.

- `weave.frame.setSizing`: pin (subsumes the WI-048 hug→fixed basis bake) → stage →
  re-fit against the pinned doc.
- `weave.item.update`: reflow children only on a SIZE change — a pure MOVE no longer
  reflows (fixes #4).

## Verification

- e2e `apps/web/e2e/frame-sizing-refit.spec.ts` — **6 green**: setSizing-Hug refit +
  undo + gap-refit + #2 abs-stable + **gap-Hug constant (0.53, was growing)** +
  **move leaves children unchanged**. Manual repros confirmed #3 (height) stable.
- weave `tsc` clean, unit **1387 green**; agocraft `@agocraft/layout` **373 green**
  (no engine change / re-vendor).

## Remaining (follow-up)

- **[WI-226](WI-226-add-to-hug-container-grow.md)** (BACKLOG, deferred): adding a
  child to an ALREADY-Hug container doesn't grow the container (re-Hug then
  shrinks). Needs an `item.add` Hug re-fit + new-child pin — separate, deeper than
  this change. The common flow (add → Hug) is fully covered here.
- (Optional) promote pinning into `weave.frame.setLayout` / `weave.item.add` for
  full boundary coverage.
