// WI-019 Phase 2 — ZOrderCapability adapter for top-level Frame items.
//
// In the current weave document model (Phase 11+ Figma Frame paradigm), all
// four domain kinds (slide / canvas-design / block-doc / media) live as
// direct children of `doc.root`. Their stacking context = their position in
// `root.children`. Same adapter applies to all four kinds — only the kind
// dispatch differs at registration time.
//
// NOTE on Patch emission: agocraft's current Patch model does not have an
// "explicit children reorder" variant — `item.children` can flag
// `reordered: true` but cannot carry the new order. Until that variant lands
// (follow-up WI), the Patch[] returned here is empty, and the actual reorder
// is performed via the `reorderChildren` direct callback wired by the host
// in `usePeekMode`. Once the Patch variant ships, this adapter will return
// proper Patches and the bypass disappears.

import type { Document, Patch } from "@agocraft/core";
import { createZOrderAdapter, type ZOrderCapability } from "@agocraft/core";

export interface DesignFrameZOrderAdapterDeps {
  /** Resolves the current document. Called on every adapter invocation. */
  readonly getDocument: () => Document;
}

export function createDesignFrameZOrderAdapter(
  deps: DesignFrameZOrderAdapterDeps,
): ZOrderCapability {
  function readZ(itemId: string): number {
    const root = deps.getDocument().root;
    return root.children.findIndex((c) => String(c.id) === itemId);
  }

  // Phase 2 — empty Patch[] (see file-level note). readZ stays accurate so
  // PeekModeController can compose `orderedAsc` correctly; the actual
  // reorder mutation is performed by the host via direct callback.
  function writeZ(_itemId: string, _z: number): ReadonlyArray<Patch> {
    return [];
  }

  // Same: empty Patch[] for local reorder. The Inspector still reflects the
  // preview via the controller's local state; commit dispatches editor.exec
  // (resulting in no Patches) and the host's direct callback applies the
  // change to weave's Design state outside the agocraft pipeline.
  function reorderLocalStack(_orderedAsc: ReadonlyArray<string>): ReadonlyArray<Patch> {
    return [];
  }

  function listSiblings(itemId: string): ReadonlyArray<string> {
    const root = deps.getDocument().root;
    const me = root.children.find((c) => String(c.id) === itemId);
    if (!me) return [];
    return root.children.map((c) => String(c.id));
  }

  return createZOrderAdapter({
    readZ,
    writeZ,
    reorderLocalStack,
    listSiblings,
  });
}
