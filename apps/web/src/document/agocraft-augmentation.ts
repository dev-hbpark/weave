// agocraft module augmentation — weave-host variants.
//
// agocraft 1.0.0-rc post-WI-027 strips host-domain knowledge from its core
// view-model types: `SubSelectionVariants` ships as an empty interface that
// each host augments to declare its own sub-selection shapes. This file is
// imported once at app bootstrap so weave's variants flow into every
// `useEditorVM` / `vm.subSelection.set(...)` site without code changes.
//
// Adding a new sub-selection shape = one entry below. agocraft is never
// edited. The discriminated union (`SubSelection`) is computed by mapped
// type, so callers `vm.subSelection.get()?.kind === "hotspot"` still
// narrows correctly.

import type { ItemId } from "@agocraft/core";

declare module "@agocraft/editor" {
  interface SubSelectionVariants {
    "canvas-shape": { frameId: ItemId; shapeId: string };
    "doc-paragraph": { frameId: ItemId; index: number };
    hotspot: { frameId: ItemId; hotspotId: string };
  }
}
