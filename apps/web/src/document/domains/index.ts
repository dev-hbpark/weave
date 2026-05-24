import type { ComponentType } from "react";
import type { AgoItem, DomainKind, ItemAttrsByKind } from "../types.js";
import { CanvasBlock } from "./CanvasBlock.js";
import { DocBlock } from "./DocBlock.js";
import { ImageBlock } from "./ImageBlock.js";
import { MediaBlock } from "./MediaBlock.js";
import { ShapeBlock } from "./ShapeBlock.js";
import { SlideBlock } from "./SlideBlock.js";
import { TextBlock } from "./TextBlock.js";
import { VideoBlock } from "./VideoBlock.js";

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
  image: ImageBlock,
  video: VideoBlock,
  shape: ShapeBlock,
  text: TextBlock,
};

export {
  CanvasBlock,
  DocBlock,
  ImageBlock,
  MediaBlock,
  ShapeBlock,
  SlideBlock,
  TextBlock,
  VideoBlock,
};
