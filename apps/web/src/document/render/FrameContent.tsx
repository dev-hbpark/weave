// FrameContent — DR-017 Phase 5: thin alias around agocraft's FrameSurface.
//
// The original FrameContent lived here and weave's FrameStage / PresentPage
// both used it. The primitive (domain-renderer dispatch + overflow:visible
// policy + chrome slot) is now owned by agocraft so a single source defines
// the rule for every mode (edit / present / future thumbnail). This file
// keeps the original import path stable while delegating to the agocraft
// primitive plus weave's `DOMAIN_RENDERERS` map.

import {
  createDomainRendererRegistry,
  type DomainRendererProps,
  FrameSurface,
  type FrameSurfaceProps,
} from "@agocraft/editor/react";
import type { ComponentType } from "react";
import { DOMAIN_RENDERERS } from "../domains/index.js";
import type { AgoItem } from "../types.js";

// Build the weave renderer registry once. agocraft's FrameSurface looks
// up by item.kind via this registry, never imports DOMAIN_RENDERERS
// directly (keeps the agocraft → weave dependency one-way clean).
const renderers = createDomainRendererRegistry(
  // DOMAIN_RENDERERS is keyed by DomainKind (string union) and its
  // component values accept the per-kind DomainRendererProps that
  // weave's domain components are typed against. agocraft's registry
  // works on a generic `DomainRendererProps`; the structural cast is
  // safe because all weave renderers accept `{ item, onUpdate?,
  // onUpdateShape?, onRemoveShape? }` (extra fields ignored).
  DOMAIN_RENDERERS as unknown as Readonly<Record<string, ComponentType<DomainRendererProps>>>,
);

export interface FrameContentProps {
  readonly item: AgoItem;
  readonly onUpdate?: (patch: Record<string, unknown>) => void;
  readonly onUpdateShape?: (shapeId: string, patch: object) => void;
  readonly onRemoveShape?: (shapeId: string) => void;
}

export function FrameContent(props: FrameContentProps) {
  const passthrough: FrameSurfaceProps = {
    item: props.item as unknown as FrameSurfaceProps["item"],
    renderers,
    ...(props.onUpdate !== undefined ? { onUpdate: props.onUpdate } : {}),
    ...(props.onUpdateShape !== undefined ? { onUpdateShape: props.onUpdateShape } : {}),
    ...(props.onRemoveShape !== undefined ? { onRemoveShape: props.onRemoveShape } : {}),
  };
  return <FrameSurface {...passthrough} />;
}

// Re-export the overflow constant so legacy imports keep resolving.
export { FRAME_OVERFLOW } from "@agocraft/editor/react";
