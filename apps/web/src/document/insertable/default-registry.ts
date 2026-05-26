// WI-017 Phase D — default insertable registry composition.
//
// Wires every shipped ContainerKind adapter into a single registry instance.
// Adding a new container = new `*.insertable.ts` adapter + one line here.
// Adding a new recommendation within an existing container = edit that
// adapter only (the registry doesn't know about individual recommendations).
//
// WI-032 Phase 3 — the legacy `canvas-design` and `block-doc` containers
// were removed; only the design root remains. Future containers (frame
// drag-into, nested groups) attach here.

import { designRootInsertable } from "./design-root.insertable.js";
import { createInsertableRegistry } from "./registry.js";

export const defaultInsertableRegistry = (() => {
  const registry = createInsertableRegistry();
  registry.register(designRootInsertable);
  return registry;
})();
