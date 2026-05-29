# WI-057 — Freeform polygon (`poly`) shape

Status: **Phase 1 done (creatable + command/agent-editable + renders). Phase 2 (vertex-drag UX) deferred.**
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

## Phase 2 — deferred (interactive vertex-drag UX)

Direct-manipulation vertex handles on canvas. Substantial interaction work,
scoped separately:
- New `InteractionMode "vertex-edit"` (`interaction-mode.tsx`).
- Custom selection-chrome view model rendering one draggable handle per vertex
  (transform/rotation-aware), mirroring `frame-default-view-model.tsx`.
- Gesture binding: handle drag → normalized point → `editor.exec("weave.shape.setVertices", …)`.
- Add vertex (double-click edge) / remove vertex (Delete). Enter (double-click) / exit (Esc).

Until Phase 2, a poly is reshaped via the command / agent (and the toolbar
sub-kind picker creates it). Rendering, undo, and the data model are complete.

## Workflow trail

- Feasibility: [FR-011](../feasibility-reviews/FR-011-freeform-poly.md).
- Plan: `features/shape-poly/ENGINEERING_PLAN.md`.
