// WI-032 Phase 3 — frame-only paradigm. The four legacy domain kinds
// (slide / canvas-design / block-doc / media) and their *Block components
// have been removed; their visual content is now represented as primitive
// children inside a `frame`. The migration helper rewrites any persisted
// legacy data on load (see `migrate-frame-only.ts`).
//
// Capability-style registry — render adapter per DomainKind. Phase 11 —
// every domain is a Frame: it can have its own children (nested frames)
// rendered inside its rectangle, regardless of kind.

import type { ComponentType } from "react";
import type { AgoItem, DomainKind, ItemAttrsByKind } from "../types.js";
import { FrameBlock } from "./FrameBlock.js";
import { ImageBlock } from "./ImageBlock.js";
import { ShapeBlock } from "./ShapeBlock.js";
import { TextBlock } from "./TextBlock.js";
import { VideoBlock } from "./VideoBlock.js";

export type DomainRendererProps<K extends DomainKind> = {
  readonly item: AgoItem<K>;
  readonly onUpdate?: (patch: Partial<ItemAttrsByKind[K]>) => void;
};

export const DOMAIN_RENDERERS: {
  readonly [K in DomainKind]: ComponentType<DomainRendererProps<K>>;
} = {
  frame: FrameBlock,
  image: ImageBlock,
  video: VideoBlock,
  shape: ShapeBlock,
  text: TextBlock,
};

export { FrameBlock, ImageBlock, ShapeBlock, TextBlock, VideoBlock };
