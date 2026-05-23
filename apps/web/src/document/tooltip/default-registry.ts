// WI-016 Phase D — default tooltip registry composition.
//
// Wires every shipped domain describer into a single registry instance, so
// consumers don't have to register each adapter at call sites. Adding a new
// domain = new `*.tooltip.ts` adapter + one line here.

import { blockDocTooltipCapability } from "./block-doc.tooltip.js";
import { canvasDesignTooltipCapability } from "./canvas-design.tooltip.js";
import { mediaTooltipCapability } from "./media.tooltip.js";
import { createTooltipRegistry } from "./registry.js";
import { slideTooltipCapability } from "./slide.tooltip.js";

export const defaultTooltipRegistry = (() => {
  const registry = createTooltipRegistry();
  registry.register(slideTooltipCapability);
  registry.register(canvasDesignTooltipCapability);
  registry.register(blockDocTooltipCapability);
  registry.register(mediaTooltipCapability);
  return registry;
})();
