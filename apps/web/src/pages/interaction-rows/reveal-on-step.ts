// V6-1 (AUDIT-007) — read-only summary for the `reveal-on-step` behavior.
// `reveal-on-step` has no dedicated editor row, so PropertiesPanel renders a
// read-only label; this module owns the one-line summary for that label. The
// `step` is a 0-indexed camera-target order, surfaced 1-indexed to the user.
import type { RevealOnStepBehavior } from "../../document";
import type { InteractionSummary } from "./types.js";

export const revealOnStepSummary: InteractionSummary<RevealOnStepBehavior> = (behavior) =>
  `reveal at step ${behavior.step + 1}`;
