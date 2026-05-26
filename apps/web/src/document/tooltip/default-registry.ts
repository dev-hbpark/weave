// WI-016 Phase D — default tooltip registry composition.
//
// Wires every shipped domain describer into a single registry instance, so
// consumers don't have to register each adapter at call sites. Adding a new
// domain = new `*.tooltip.ts` adapter + one line here.
//
// WI-032 Phase 3 — the legacy 4-domain tooltip capabilities were removed
// with their host *Block components. Future tooltip describers (primitive
// kinds, frame label hint) attach here.

import { createTooltipRegistry } from "./registry.js";

export const defaultTooltipRegistry = (() => {
  const registry = createTooltipRegistry();
  return registry;
})();
