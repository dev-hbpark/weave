// WI-019 Phase 2 — register the design-frame ZOrderCapability adapter for
// each of the 4 top-level Frame kinds in the weave document model.
//
// The adapter is a singleton per editor; same impl serves all four kinds
// (their z-stacking storage is identical = root.children array index).

import { type CapabilityRegistry, type Document, ZORDER_CAPABILITY } from "@agocraft/core";
import { createDesignFrameZOrderAdapter } from "./design-frame.zorder.js";

// WI-019 + WI-020 — z-order adapter applies uniformly across every
// top-level Frame kind (their z = position in doc.root.children).
// WI-032 Phase 3 — `frame` joins primitive kinds; legacy 4 retired.
const DESIGN_FRAME_KINDS = ["frame", "image", "video", "shape", "text"] as const;

export interface RegisterZOrderAdaptersDeps {
  readonly capabilityRegistry: CapabilityRegistry;
  readonly getDocument: () => Document;
}

/** Registers the design-frame ZOrderCapability adapter for all 4 top-level
 *  Frame kinds. Returns a single dispose handle that unregisters them in
 *  reverse registration order (LIFO). */
export function registerZOrderAdapters(deps: RegisterZOrderAdaptersDeps): () => void {
  const impl = createDesignFrameZOrderAdapter({ getDocument: deps.getDocument });

  const unsubs: Array<() => void> = [];
  for (const kind of DESIGN_FRAME_KINDS) {
    const unsub = deps.capabilityRegistry.registerAdapter({
      capability: ZORDER_CAPABILITY,
      target: { kind: "item", itemKind: kind },
      impl,
    });
    unsubs.push(unsub);
  }

  return () => {
    for (let i = unsubs.length - 1; i >= 0; i -= 1) {
      const u = unsubs[i];
      if (u) u();
    }
  };
}

export { DESIGN_FRAME_KINDS };
