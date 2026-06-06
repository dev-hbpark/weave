# DR-071 — Sprite engine architecture — SUPERSEDED (relocated to agocraft DR-044)

- **Date:** 2026-06-06 · **Status:** Superseded by **agocraft DR-044**

The engine is a reusable library; ownership moved to agocraft (operator:
"sprite-engine을 agocraft로"). The architecture decision (Rust+wgpu in a Worker,
4-tier fallback, vendored WASM, registry dispatch, DR-013 factories) now lives at:

- **agocraft DR-044** (agocraft `records/decisions/`), agocraft FR-010, agocraft WI-035,
  package `@agocraft/sprite-engine`.

This DR is preserved (not deleted) per the Decommission Sweep rule — DRs are marked
superseded, never removed. weave's side = consume the engine for Aku (WI-104), wiring
`createGpuSpriteRenderer()` into the `AkuExpressionRenderer` seam (DR-070 D2) with
`cssSpriteRenderer` as the CSS fallback tier.
