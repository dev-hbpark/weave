// WI-090 Phase 2 (DR-052) — pure policy for the "link unit" authoring control.
//
// Separating the decision (which History command + input) from the dispatch
// (`editor.exec`) keeps the toolbar section thin and the mapping testable
// without rendering. Every returned descriptor names a registered weave command
// so the mutation routes through History (CLAUDE.md § Document mutation rule).

import type { ButtonTriggerBehavior } from "../../types.js";

export type LinkMode = "none" | "url" | "slide";

/** A weave command call: `editor.exec(cmd, input)`. */
export interface ExecCall {
  readonly cmd: string;
  readonly input: Record<string, unknown>;
}

type LinkAction = ButtonTriggerBehavior["action"];

/** Classify the current link Unit's action into the three authoring modes.
 *  Any other action kind (next-camera / reveal) or no behavior → "none". */
export function linkModeOf(action: LinkAction | undefined): LinkMode {
  if (action?.type === "external") return "url";
  if (action?.type === "jump-camera") return "slide";
  return "none";
}

/** Build the exec to set the link's action — update the existing Unit when one
 *  is present (any button-trigger, so we never create a duplicate), else create
 *  it. */
export function planSetAction(args: {
  readonly itemId: string;
  readonly linkId: string;
  readonly unitId: string | undefined;
  readonly action: LinkAction;
}): ExecCall {
  if (args.unitId !== undefined) {
    return {
      cmd: "weave.behavior.update",
      input: { itemId: args.itemId, behaviorId: args.unitId, behavior: { action: args.action } },
    };
  }
  return {
    cmd: "weave.item.addBehavior",
    input: {
      itemId: args.itemId,
      behavior: { kind: "button-trigger", id: args.linkId, action: args.action },
    },
  };
}

/** Build the exec for switching the link MODE. Returns `null` for a no-op
 *  (already in that mode, or "none" with no existing link). */
export function planSetMode(args: {
  readonly itemId: string;
  readonly linkId: string;
  readonly unitId: string | undefined;
  readonly currentAction: LinkAction | undefined;
  readonly nextMode: LinkMode;
  readonly firstSlideTarget: string | undefined;
}): ExecCall | null {
  const { itemId, linkId, unitId, currentAction, nextMode } = args;
  if (nextMode === linkModeOf(currentAction)) return null;

  if (nextMode === "none") {
    if (unitId === undefined) return null;
    return { cmd: "weave.item.removeBehavior", input: { itemId, behaviorId: unitId } };
  }

  if (nextMode === "url") {
    // Preserve an existing href when toggling back to URL.
    const href = currentAction?.type === "external" ? currentAction.href : "https://";
    return planSetAction({ itemId, linkId, unitId, action: { type: "external", href } });
  }

  // slide — preserve an existing target, else default to the first slide.
  const targetId =
    currentAction?.type === "jump-camera" && currentAction.targetId.length > 0
      ? currentAction.targetId
      : (args.firstSlideTarget ?? "");
  return planSetAction({ itemId, linkId, unitId, action: { type: "jump-camera", targetId } });
}
