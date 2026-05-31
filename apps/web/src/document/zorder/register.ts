// WI-019 Phase 2 — register the design-frame ZOrderCapability adapter for
// each of the 4 top-level Frame kinds in the weave document model.
//
// The adapter is a singleton per editor; same impl serves all four kinds
// (their z-stacking storage is identical = root.children array index).

import { type CapabilityRegistry, type Document, ZORDER_CAPABILITY } from "@agocraft/core";
// AUDIT-005 (V-8) — the kind list is no longer a literal here; it derives from
// the single DomainKind registry (`participatesInZorder` flag). Re-exported
// below to keep the historical import path stable.
import { DESIGN_FRAME_KINDS } from "../domain-kinds.js";
import { createDesignFrameZOrderAdapter } from "./design-frame.zorder.js";

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
