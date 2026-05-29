# WI-057 — Freeform polygon (`poly`) shape

Status: **Done — Phase 1 + Phase 2 (interactive vertex-drag UX).**
Owner: hbpark
Updated: 2026-05-30

## Problem

weave shapes had regular `polygon` (sides) and opaque `path` (raw `d`), but no
structured **freeform polygon** the user / Aku agent can draw and reshape by
explicit vertices via the SVG geometry path.

## Decision (user directives)

- Item mutation **always via a command** (weave document mutation rule).
- **Model + render + command logic → agocraft**; **UX → weave**.
- Name = **`poly`**.

## Split

| Layer | Where | What |
|---|---|---|
| Model + render + command | **agocraft** [WI-027](../../../agocraft/records/work-items/WI-027-poly-freeform-polygon.md) | `poly` ShapeSubAttrs `{points(0..1 bbox), closed}`, `shapeToSvgGeometry`→polygon/polyline, `createSetPolyPointsCommand`. Vendored `agocraft-core-1.0.0-rc.20260529204521.tgz`. |
| Command registration | weave `commands.ts` | `createSetPolyPointsCommand("weave.shape.setVertices")` in buildWeaveCommands. |
| Agent schema | weave `weave-command-schemas.ts` | detailed `weave.shape.setVertices` (points 0..1, closed) + label. |
| Create UX | weave `shape-section.tsx` + `IconShapePoly` | sub-kind picker "자유 다각형" + `defaultSubAttrsForKind` poly case. |
| Render | weave `ShapeBlock` | **no change** — generic over `shapeToSvgGeometry` element. |

## Phase 1 — done

- [x] agocraft WI-027 vendored (core bump).
- [x] `weave.shape.setVertices` registered (mutation via command ✓).
- [x] Agent schema + label.
- [x] Toolbar: poly creatable (sub-kind picker + icon + default triangle).
- [x] Verify: typecheck clean, declarative+purity green, biome 0 err,
      unit 62 (weave) + 85 (agocraft core), e2e `shape-poly.spec.ts` **3/3**
      (create→`<polygon>`, setVertices reshape, Cmd+Z revert, open→`<polyline>`,
      guard reject).

## Phase 2 — done (interactive vertex-drag UX)

Direct-manipulation vertex handles, **entirely weave-side** (no @agocraft/editor
change — the `ItemSelectionViewModel` + `freeform` selection anchor were
sufficient):

- `apps/web/src/document/selection-chrome/poly-vertex-handle.tsx` —
  `createPolyVertexHandleViewModel({ editor, getPolyPoints })`. For a selected
  `poly` shape it renders one draggable handle per vertex, positioned via the
  `freeform` anchor (`layout(bounds) → viewport px`). `data-handle-kind="custom"`
  so the GestureRouter's resize/rotate bindings decline; a direct
  `onPointerDown` + document pointermove/up loop computes the new vertex
  (clientXY → 0..1 of `bounds`, clamped) and dispatches
  `editor.exec("weave.shape.setVertices", …)` — mutation via command, 60Hz drag
  folds into one undo via the item.attrs merge key.
- Registered in `DesignPage.tsx` (mirrors the slide-bullet view-model), reading
  live vertices through `docInAgocraftRef`.

Verify: e2e `shape-poly-vertex-edit.spec.ts` — select poly → 3 handles → drag
vertex 0 → moves right+down → **Cmd+Z reverts in one step**. All 10 shape e2e
green.

### Phase 2.1 — done (vertex add/remove + rotation-aware handles)

- **Vertex add**: a hollow MIDPOINT handle per edge; pointer-down inserts a
  vertex at that midpoint and the same gesture drags it (Figma-style).
- **Vertex remove**: double-click a vertex handle removes it (floored at the
  min — 3 closed / 2 open).
- **Rotation-aware (exact at every angle, incl. 45°)**: handles read the item's
  `transform: rotate(θ)` off `[data-frame-id]` and recover the un-rotated frame
  size from the element's **transform-invariant aspect ratio**
  (`offsetWidth/offsetHeight`) + one AABB equation —
  `AABBw = H·(r·|cos| + |sin|)`, whose denominator is > 0 at all angles. This
  replaced the earlier AABB-only 2×2 solve that was singular at 45°
  (`cos 2θ = 0`). Handle placement and the drag inverse use the true rotated
  basis.

Verify: `shape-poly-vertex-edit.spec.ts` — drag (Cmd+Z reverts), midpoint add
(3→4), double-click remove (4→3, floored at 3), and **rotation precision at 45°
and 30°** (handle centers overlay the rendered SVG vertices — `getScreenCTM`
ground truth — within 3px). All shape e2e green.

### Remaining (optional)

- A dedicated vertex-edit *mode* (handles are currently always-on when a poly is
  selected, alongside the default resize/rotate chrome).

## Workflow trail

- Feasibility: [FR-011](../feasibility-reviews/FR-011-freeform-poly.md).
- Plan: `features/shape-poly/ENGINEERING_PLAN.md`.
