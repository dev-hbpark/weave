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

import type { ContentAutoAxes } from "@agocraft/layout";
import { createContext } from "react";

/** Height (in design-px) of the frame that directly contains the rendered item.
 *  Consumed by `TextBlock` to resolve a `kind: "ratio"` fontSize. */
export const ParentFrameHeightContext = createContext<number>(0);

/** Which of THIS item's axes are content-auto (host may size to content) vs
 *  layout-owned (fill/fixed/grow). WI-216 / DR-053 Stage 2 — computed by the
 *  agocraft engine (`getContentAutoAxes`) in `NestedFrame` and read by
 *  `TextBlock`, so the renderer carries NO layout reasoning of its own. Default
 *  `managed:false` (no provider / not in a layout) → the host keeps its own
 *  text-kind auto-size behaviour. */
export const ContentAutoAxesContext = createContext<ContentAutoAxes>({
  managed: false,
  width: false,
  height: false,
});

/** Commit a host-measured CONTENT size for `itemId` to the engine
 *  (`weave.layout.contentMeasured` → `onContentMeasured`). Provided once by
 *  `DesignPage` (which owns the editor); read by `TextBlock`'s auto-size
 *  observer for laid-out (engine-managed) text. `null` = no provider (tests /
 *  preview) → the observer falls back to its own `onUpdate` frame write. */
export const MeasureContentContext = createContext<
  ((itemId: string, content: { readonly width?: number; readonly height?: number }) => void) | null
>(null);
