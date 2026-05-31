// Text item selection view-model (DR-023 — moved out of FrameStage's central
// resolveHandles). The text kind OWNS its resize-handle policy: which box edges
// are draggable depends on the auto-resize mode derived from `attrs.layoutChild`
// (WI-019 B4 / DR-016 / DR-022).
//
//   WIDTH_AND_HEIGHT (Auto-W) → n/s only  (width auto-fits content)
//   HEIGHT           (Auto-H) → e/w only  (height auto-fits)
//   NONE             (Fixed)  → all 8     (both axes user-set)
//
// Rule 6 — the mode→dirs decision is an adapter MAP, not a switch.

import type { LayoutChildPolicy } from "@agocraft/core";
import type { ItemSelectionViewModel } from "@agocraft/editor";
import type { SelectionHandleDir as HandleDir } from "@weave/design-system";
import {
  deriveTextAutoResize,
  type LegacyTextAutoResize,
} from "../domains/derive-text-auto-resize.js";
import { transformHandleSpecs } from "./frame-default-view-model.js";

const MODE_DIRS: Record<LegacyTextAutoResize, ReadonlyArray<HandleDir>> = {
  WIDTH_AND_HEIGHT: ["n", "s"],
  HEIGHT: ["e", "w"],
  NONE: ["n", "ne", "e", "se", "s", "sw", "w", "nw"],
};

export interface TextSelectionDeps {
  /** Read the item's live `attrs.layoutChild` (the mode source). */
  readonly getLayoutChild: (itemId: string) => LayoutChildPolicy | undefined;
}

export function createTextSelectionViewModel(deps: TextSelectionDeps): ItemSelectionViewModel {
  return {
    itemKind: "text",
    handles(info) {
      const mode = deriveTextAutoResize(deps.getLayoutChild(info.itemId));
      const dirs = MODE_DIRS[mode] ?? MODE_DIRS.HEIGHT;
      // Text keeps the rotate handle (Figma parity); layout-constraint filter
      // may still drop it for auto-layout children.
      return transformHandleSpecs(dirs, { rotate: true });
    },
    priority: 0,
  };
}
