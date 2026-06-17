# WI-246 — Group-hug live-gesture fix (no drift / no balloon on child drag)

## Metadata

| Field | Value |
|---|---|
| ID | WI-246 |
| Date | 2026-06-17 |
| Owner | hbpark |
| Status | **DONE — fixed + e2e live-verified.** |
| Type | Bug fix (regression in WI-245 group-hug) |
| Decision | [DR-162](../decisions/DR-162-group-hug-shrink-wrap.md) § Live-gesture addendum |
| Builds on | [WI-245](WI-245-group-hug-shrink-wrap.md) |

## Symptom (reported)

"그룹화 한다음 내부아이템 하나를 선택해서 위치를 이동하면 해당아이템의 위치가 이상해지면서 그룹이 비정상적으로 커지는 이슈." After grouping, dragging one inner item makes its position go wrong and the group balloon abnormally.

## Root cause

A live drag/resize commits `weave.item.update` continuously (~60 Hz). The agocraft move binding computes the child's new `frame` relative to the **gesture-start group box (g0)**, cached once per gesture. The WI-245 group-hug refit grew the group box every tick; the binding kept emitting frames relative to g0 while the doc group box drifted to g1, g2, … → the child was mis-placed and the union compounded → balloon. This is the same live-feedback class as the WI-042 Hug resize loop (which was fixed by caching the gesture-start parent box by `sessionId`).

## Fix

`weave.item.update` now branches on the gesture lifecycle:

- **Live gesture (`input.sessionId` present)** — cache the group's gesture-start frame keyed by `sessionId` (`gestureGroupG0`, bounded), and refit via the new `groupHugLivePatches`: the **dragged** child's parent-space box is computed from **g0** (so it tracks the binding's reference), while **other** children use the current group frame (their re-relativized frames preserve absolute position → stable). The refit stays consistent as the box grows; per-item no-op guard corrects only what changed.
- **Programmatic / one-shot (`sessionId` undefined)** — unchanged: `groupHugAfter` against the live doc.

`refit-group.ts` refactored: `composeChildBox` + `refitGroupFromParentBoxes` (parent-space union) underlie both `refitGroupFrames` (one-shot) and `groupHugLivePatches` (live); `buildRefitPatches` emits only items whose frame actually changed.

### Files
- `layout/refit-group.ts` — `composeChildBox`, `refitGroupFromParentBoxes`, `groupHugLivePatches`, per-item-filtered `buildRefitPatches`.
- `commands.ts` — `gestureGroupG0` cache + `gestureGroupG0For`; `weave.item.update` live vs one-shot branch.

## Verification

- Unit: `commands.test.ts` "WI-246 — a LIVE multi-tick drag (same sessionId) does not drift or balloon" — 3 ticks rel g0; asserts final group is the tight union (width ≈ 0.6, not ballooned), dragged child at intended abs position, sibling unmoved.
- **e2e `group-hug.spec.ts` (chromium, 3/3 PASSED)**:
  1. exec single move — group grows to wrap, no overflow.
  2. exec multi-tick `sessionId` drag — group stays tight, child correct, no balloon.
  3. **REAL mouse drag** — deep-select the inner child, `page.mouse` down → 8× pointermove → up (the true gesture path: GestureRouter → frame-manip binding → `commitFrame` → `onCommitFrame` → `weave.item.update` with a real `sessionId`). Group stays bounded (width < 1.3), no child overflows, child moved. This is the path the operator actually hit.
- Full unit suite **1513 green**; typecheck + biome clean; declarativecheck no new violation.

### Harness note
The real-drag test must NOT call `page.emulateMedia(...)` before `prepareDesign` — doing so hangs `prepareDesign`'s `waitForLoadState("networkidle")` (the known emulateMedia-order trap). Removed it; the test then runs in ~7s.
