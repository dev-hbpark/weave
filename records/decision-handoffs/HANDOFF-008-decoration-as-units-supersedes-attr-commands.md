# HANDOFF-008 — decoration is units; WI-055/056 attr-commands will be converted

- **Date:** 2026-05-30
- **From:** Aku/DR-028 track (decoration-as-units)
- **To:** WI-055 (shape corner radius) + WI-056 (shape fill) authors, and any
  parallel worker touching shape/item styling
- **Type:** coordination — direction lock + supersession notice
- **Authority:** agocraft `records/decisions/DR-028-decoration-as-units.md`

## The decision (operator-confirmed, 2026-05-30)

Decoration is modeled as **units, not per-kind attrs** (Figma-aligned
effects[]/strokes[]/fills[]). The unit kinds are **shadow / stroke / fill /
filter / opacity**, edited via the agocraft `createSetDecorationCommand`
(`weave.item.setDecoration` in weave). Boundary: intrinsic identity/structure
(frame, content, typography) stays attr; decoration becomes units.

## What this means for in-flight WI-055 / WI-056

These attr-based commands are **interim and will be converted to units**:

- **WI-055** `weave.shape.setCornerRadius` → `attrs.subAttrs.cornerRadii`
- **WI-056** `weave.shape.setFill` → `attrs.fill` (PaintSpec)

Action for parallel workers:

- **Do NOT add new attr-based decoration edit commands.** New decoration editing
  goes through `weave.item.setDecoration` / `createSetDecorationCommand`.
- **fill → `decoration.fill` unit** (attrs = PaintSpec). The WI-056 command will
  be removed at the fill phase.
- **stroke → `decoration.stroke` unit** (attrs = StrokeSpec, incl. `width`).
- **cornerRadius**: revisited at the fill/stroke phase — it may STAY an attr
  (corner radius is intrinsic shape geometry in `subAttrs`, not a stacked
  decoration). No action needed on WI-055 yet beyond awareness.

## Sequencing (so nobody's work is clobbered)

The unit conversion of fill/stroke/cornerRadius runs on a **clean base**: WI-055
and WI-056 should be **committed first**, then the conversion works from a stable
diff. Until then, renderers read the decoration unit first and fall back to the
legacy attr (the shadow precedent already shipped this way).

## Status

- Phase 1 (shadow) landed: agocraft `createSetDecorationCommand` + decoration unit
  kinds; weave `weave.item.setDecoration` + ShadowBlock unit render.
- Next: opacity → filter → stroke → fill + cornerRadius reconciliation.

Reply via a Decision Record in `workspace/weave/records/decisions/` or a handoff
back into the requester's inbox if you disagree with converting WI-055/056.
