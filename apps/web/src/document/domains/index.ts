import type { ComponentType } from "react";
import type { AgoItem, DomainKind, ItemAttrsByKind } from "../types.js";
import { CanvasBlock } from "./CanvasBlock.js";
import { DocBlock } from "./DocBlock.js";
import { MediaBlock } from "./MediaBlock.js";
import { SlideBlock } from "./SlideBlock.js";

// Capability-style registry — render adapter per DomainKind. Phase 11 —
// every domain is a Frame: it can have its own children (nested frames)
// rendered inside its rectangle, regardless of kind.
export type DomainRendererProps<K extends DomainKind> = {
  readonly item: AgoItem<K>;
  readonly onUpdate?: (patch: Partial<ItemAttrsByKind[K]>) => void;
};

export const DOMAIN_RENDERERS: {
  readonly [K in DomainKind]: ComponentType<DomainRendererProps<K>>;
} = {
  slide: SlideBlock,
  "canvas-design": CanvasBlock,
  "block-doc": DocBlock,
  media: MediaBlock,
};

export { CanvasBlock, DocBlock, MediaBlock, SlideBlock };
