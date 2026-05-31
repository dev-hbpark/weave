// V-11 (AUDIT-005) — interaction-row registry wiring. This barrel is the single
// place that maps each editable behavior kind to its row module. Registration
// is explicit here (not per-module import side-effects) so the row modules stay
// pure + tree-shakeable, matching the selection-chrome registration idiom
// (DesignPage registers view-models explicitly). Adding a kind = import its row
// + one `registerInteractionRow(...)` line below.

import { ButtonTriggerRow } from "./button-trigger.js";
import { CameraTargetRow } from "./camera-target.js";
import { EntranceAnimationRow } from "./entrance-animation.js";
import { HotspotRow } from "./hotspot.js";
import { HoverEffectRow } from "./hover-effect.js";
import { revealOnStepSummary } from "./reveal-on-step.js";
import { registerInteractionRow, registerInteractionSummary } from "./types.js";

registerInteractionRow("camera-target", CameraTargetRow);
registerInteractionRow("hotspot", HotspotRow);
registerInteractionRow("hover-effect", HoverEffectRow);
registerInteractionRow("button-trigger", ButtonTriggerRow);
registerInteractionRow("entrance-animation", EntranceAnimationRow);

// V6-1 (AUDIT-007) — read-only summaries for kinds without an editor row.
registerInteractionSummary("reveal-on-step", revealOnStepSummary);

export type {
  CommitBehavior,
  InteractionRowProps,
  InteractionRowRenderer,
  InteractionSummary,
} from "./types.js";
export { getInteractionRow, getInteractionSummary } from "./types.js";
