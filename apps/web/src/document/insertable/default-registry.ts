// WI-017 Phase D — default insertable registry composition.
//
// Wires every shipped ContainerKind adapter into a single registry instance.
// Adding a new container = new `*.insertable.ts` adapter + one line here.
// Adding a new recommendation within an existing container = edit that
// adapter only (the registry doesn't know about individual recommendations).

import { blockDocInsertable } from "./block-doc.insertable.js";
import { canvasDesignInsertable } from "./canvas-design.insertable.js";
import { designRootInsertable } from "./design-root.insertable.js";
import { createInsertableRegistry } from "./registry.js";

export const defaultInsertableRegistry = (() => {
  const registry = createInsertableRegistry();
  registry.register(designRootInsertable);
  registry.register(canvasDesignInsertable);
  registry.register(blockDocInsertable);
  return registry;
})();
