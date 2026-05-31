// WI-032 Phase 3 — frame-only paradigm. The four legacy domain kinds
// (slide / canvas-design / block-doc / media) and their *Block components
// have been removed; their visual content is now represented as primitive
// children inside a `frame`. The migration helper rewrites any persisted
// legacy data on load (see `migrate-frame-only.ts`).
//
// Capability-style registry — render adapter per DomainKind. Phase 11 —
// every domain is a Frame: it can have its own children (nested frames)
// rendered inside its rectangle, regardless of kind.
//
// AUDIT-005 (V-4) — the per-kind renderer catalogue moved to the single
// DomainKind registry (`../domain-kinds.ts`). This barrel keeps the historical
// `DOMAIN_RENDERERS` / `DomainRendererProps` import paths stable + re-exports
// the Block components.

export { DOMAIN_RENDERERS, type DomainRendererProps } from "../domain-kinds.js";
export { FrameBlock } from "./FrameBlock.js";
export { ImageBlock } from "./ImageBlock.js";
export { LineBlock } from "./LineBlock.js";
export { QrBlock } from "./QrBlock.js";
export { ShapeBlock } from "./ShapeBlock.js";
export { TextBlock } from "./TextBlock.js";
export { VideoBlock } from "./VideoBlock.js";
