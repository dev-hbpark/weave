# FR-021 — WASM+Worker+WebGPU sprite engine — RELOCATED to agocraft

- **Date:** 2026-06-06 · **Status:** RELOCATED (superseded by agocraft FR-010)

The sprite animation engine is a **reusable library** and was relocated to agocraft
(operator: "sprite-engine을 agocraft로"). The feasibility review now lives with the
owner:

- **agocraft FR-010** (agocraft `records/feasibility-reviews/`), agocraft DR-044, agocraft WI-035,
  package `@agocraft/sprite-engine`.

weave's remaining concern is **consuming** `@agocraft/sprite-engine` to animate Aku
behind the `AkuExpressionRenderer` seam (DR-070 D2) — tracked as the weave consumer
work item **WI-104**.
