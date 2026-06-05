# DR-design-016 — Toolbar UX: kind/state Quick curation + More popover aesthetic + (Phase 2) QuickActionBar curation & item Lock

- **Date:** 2026-06-04 · **Status:** Accepted (Phase 1 in progress) · **WI:** WI-029 follow-up / toolbar UX
- **Relates:** DR-design-015 (ContextualToolbar Tier-2 compound), DR-design-012
  (QuickActionBar edge anchor), the product-UX 전수검토 (this session). Supersedes
  the relevant Quick/More choices of DR-design-015.
- **Triage:** Step 2–3 — modifies the `ContextualToolbar` design-system primitive
  (Bar.Field label typography) + every per-kind section's Quick/More split.
  Phase 2 adds a net-new **item Lock** capability (model + gating) — its own DR.

## Context

Product-UX review found the two floating toolbars under-curated:

- **ContextualToolbar Quick** (always-visible row) buries high-frequency controls:
  text **size** is in a More accordion, **chart** Quick is empty, **frame** Quick
  is only the background swatch, **shape** Quick is only fill.
- **More popover** labels use `font-mono uppercase text-[10px] tracking-[1.2px]`
  — a dev-console aesthetic that reads poorly with Korean labels (정렬/외곽선),
  and sections inconsistently mix flat vs accordion layouts.
- **QuickActionBar** (frame-edge command bar) is generic (add/delete/align/
  layout/crop/replace) and not curated per item-kind by frequency; it lacks a
  **Lock** action entirely (no lock capability exists in the product).

## Decisions (from planner/designer review)

### Phase 1 — ContextualToolbar (this DR)

1. **Quick promotions** — promote the single highest-frequency control per kind
   into the always-visible Quick row:
   - **text**: a compact font-**size** stepper (after B/I/U, before color).
   - **frame**: a **layout** toggle (절대 / Flex / Grid) via `IconToggleGroup`.
   - **chart**: a **chart-type** quick switcher.
   - **shape**: a **stroke** swatch (beside fill).
2. **More aesthetic** — `Bar.Field` label typography changes from mono-uppercase
   to a clean, Korean-friendly sentence-case (no `font-mono`, no `uppercase`,
   ~11px, normal tracking). Labels themselves move to Korean (synergy with the
   copy-IA label-unification finding). **Conditional grouping**: a section with
   > 5 fields uses Accordion groups (text already does); ≤ 5 stays flat.

### Phase 2 — QuickActionBar + item Lock (separate follow-up DR)

3. **QuickActionBar** becomes kind/state-curated, frequency-first:
   - per-kind core actions (frame: add-child · toggle-slide · ungroup; image:
     replace · crop; video: replace · mute; chart: edit-data; multi: align ·
     flex · grid · group),
   - **Lock** (잠금) added to every selection,
   - **Delete** stays pinned right. **Duplicate is intentionally NOT added**
     (keyboard Cmd+D remains).
4. **Item Lock** is net-new — no `locked` attr / command / icon exists today.
   Requires: weave-local `attrs.locked?: boolean`, selection/drag/resize/delete
   gating, `weave.item.setLocked` command (History-routed), an `IconLock`/
   `IconUnlock`, a locked visual + unlock affordance. **This is a capability, not
   a toolbar tweak — it gets its own Decision Record** before implementation.

## Consequences

- (+) The most-used edit per kind becomes 1-click (text size, chart type, frame
  layout, shape stroke) instead of 2-click via More.
- (+) The More popover reads as a polished Korean UI, not a dev console.
- (+) QuickActionBar surfaces the right actions per selection; Lock fills a real
  gap (protect finished elements).
- (−) Quick row may reach 5 items for text (size + B/I/U + color) — within the
  fixed bar width; verified visually.
- (−) Lock touches interaction gating broadly (Phase 2 risk) — isolated behind
  its own DR + e2e.

## Verification

- Phase 1: typecheck/lint/vitest green; browser screenshot of text / frame /
  chart / shape toolbars showing the promoted Quick control + the restyled More.
- Phase 2: e2e for lock gating (locked item not selectable/movable/deletable;
  unlock restores) + QuickActionBar per-kind action presence.

## Status log

- 2026-06-04 — Phase 1 started: primitive label aesthetic + text-size Quick first.
- 2026-06-04 — Phase 1 (mostly done):
  - ✅ `Bar.Field` label aesthetic (mono-uppercase → Korean 11px sentence-case).
  - ✅ All section field + kind labels translated to Korean (48 labels across
    11 section files; QR kind chip kept).
  - ✅ Quick promotions: **text 크기** (compact px slider) + **shape 테두리**
    (compact stroke swatch, `StrokeControl compact`). **frame 레이아웃** Select
    and **chart 종류** Select were already in Quick — no change needed.
  - ✅ Conditional Accordion grouping for shape / image / video (2 groups each:
    "모양/이미지/비디오" + "스타일"). text & frame were already grouped.
  - Verified: typecheck + lint clean, vitest 570 passed, browser screenshots of
    text / shape Quick + the restyled Korean More popover + grouped shape More.
  - **Phase 1 COMPLETE.**
- Phase 2 (QuickActionBar curation + item Lock) — **COMPLETE**:
  - Item Lock capability shipped under its own **DR-061** (model + gating + toggle
    + chrome). Multi-select lock + on-canvas lock badge included.
  - QuickActionBar curation: lock command registered at the END so the bar places
    it after the kind/multi primary actions and just before the pinned delete.
  - Verified: `e2e/item-lock.spec.ts`, typecheck GREEN, lint clean, vitest 571.
  - Out of scope (new feature): group / wrap-into-frame for multi (no command
    exists) — future WI.
- Phase 2 follow-up (user feedback "what actually improved? flip is still wide
  Korean text, the bar only gained lock"):
  - **Flip control → compact icons.** New `IconFlipHorizontal` / `IconFlipVertical`
    in the design system replace the wide 좌우 / 상하 text pills in `FlipControls`
    (used by every flippable kind's Quick/More).
  - **QuickActionBar gained a real Duplicate action** (복제, `IconCopy`) for every
    kind + multi — dispatches `weave.item.duplicate` / `weave.items.duplicate`
    (a real copy, not the blank add-stub). Sits left of lock + the pinned delete.
    (Reverses the earlier "복제없이" choice per the user's follow-up feedback.)
  - Verified: duplicate e2e (click 복제 → 2 items), browser screenshots of the
    bar (복제 · 잠금 · 삭제) and the icon-only 뒤집기 field; typecheck/lint/vitest 571.
- Phase 2 follow-up #2 (user: "any other awkwardly large controls in More — the
  align pad, color swatch rows?"):
  - **정렬 (text): 2D AlignmentPad + separate justify switch → two compact icon
    SegmentedControls (가로 / 세로).** The pad was the standout oversized control.
  - **`SegmentedControl` now renders an option's ICON only when present** (label
    becomes the accessible name), so icon segments are compact. Safe — the only
    icon-bearing SegmentedControl is the new align one (the icon+label options in
    shape / frame live in `Select` dropdowns, unaffected).
  - Verified: typecheck/lint clean, vitest 576, screenshot of the compact 정렬.
  - Assessed but left as-is (not awkward): color swatch rows (single swatch +
    clear), Mode / 꾸밈 / 대소문자 segments. Candidate for a future tighten: the
    text 크기 field (px/% toggle row + slider row = 2 rows).
- Phase 2 follow-up #3 (user: "for image, 원본·맞춤·뒤집기 should be visible in the
  bar, not inside `...` — re-balance Quick vs More per kind, exposing the
  identifying props"):
  - **image** Quick = 원본(replace icon) · 맞춤(Fit) · 뒤집기. More = 설명 ·
    불투명도 · 모서리 · 그림자 · 필터.
  - **video** Quick = 원본 · 음소거 · 맞춤 · 뒤집기. More = 반복 · 음량 · 그림자 ·
    불투명도.
  - **shape** Quick = 모양(종류) · 채우기 · 테두리. More = 뒤집기 · 불투명도 ·
    모서리 · 곡선 · 그림자.
  - Principle: the kind's identifying / highest-frequency props live in Quick;
    the rest go to More. (text / frame / chart already followed this.)
  - Verified: typecheck/lint clean, vitest 576, screenshot of the image bar
    (원본 · 맞춤 · 뒤집기 inline).
  - Minor follow-up: the 맞춤 Fit dropdown options are still English
    (Cover/Contain/Fill/None) — Korean-ize in a copy pass.
