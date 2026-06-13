// WI-fontsize-spec — parent frame height context.
//
// A text item's `fontSizeSpec` may be `{ kind: "ratio", value }`, meaning the
// font size is `value × the parent frame's height in design-px` (root parent =
// the design height). The renderer (`TextBlock`) needs that parent height to
// resolve the ratio, but it's rendered through agocraft's FrameSurface dispatch
// and only receives `{ item }` — not its container's px box.
//
// `FrameStage`'s `NestedFrame` already computes each frame's px footprint and
// knows its own `parentHeightPx` prop (= the enclosing frame's height; the root
// passes `designHeight`). It provides that value here, around the `<FrameContent>`
// it renders, so the item's renderer can read the height of the frame that
// directly contains it. Default 0 → ratio resolves to 0 px when no provider is
// mounted (tests / preview); px-kind and legacy-number fonts ignore the context.

import type { LayoutSpec } from "@agocraft/core";
import { createContext } from "react";

/** Height (in design-px) of the frame that directly contains the rendered item.
 *  Consumed by `TextBlock` to resolve a `kind: "ratio"` fontSize. */
export const ParentFrameHeightContext = createContext<number>(0);

/** Layout spec of the frame that DIRECTLY contains the rendered item (undefined =
 *  free / absolute parent). WI-216 / DR-053 Stage 2 — `TextBlock` reads this to
 *  know whether its HEIGHT is layout-governed (a flex-ROW cross axis, or a grid
 *  cell): in that case the agocraft layout owns the height (alignSelf stretch =
 *  fill, crossSize = fixed) and the auto-height observer must NOT overwrite it.
 *  Only when the height is the genuine content-auto axis does the observer fit. */
export const ParentLayoutContext = createContext<LayoutSpec | undefined>(undefined);
