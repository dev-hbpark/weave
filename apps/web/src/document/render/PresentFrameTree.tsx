// Recursive present-mode renderer for a frame's content.
//
// In present mode each navigable frame (slide / canvas-design / block-doc /
// media) is its own Stage scene positioned at its absolute design coords.
// The scene body uses `<PresentFrameTree>` so the frame's renderer fires
// AND any non-frame children (image / video / shape) render at their
// relative position within the frame's bbox.
//
// Nested-frame policy (WI-072 / WI-194):
//   • A nested frame that OWNS its own Stage scene is skipped here (rendering
//     it inline would paint it twice).
//   • A nested frame with NO scene of its own MUST still appear inside its
//     parent slide on the presentation screen, so it is rendered INLINE here.
//   WHICH nested frames own a scene is the flavor's DeckPolicy.childOwnsScene
//   (DR-127), injected by the composition root (PresentPage): free placement =
//   `isPresentableFrame` (the WI-072 model); page-bounded = never (only root
//   pages are scenes — skipping a nested frame there would punch a hole in
//   the slide).
//
// Font-size context (WI-059): a text item's `fontSizeSpec: { kind: "ratio" }`
// resolves to `value × the containing frame's height in design-px`. Edit mode
// supplies that height through `ParentFrameHeightContext` (FrameStage's
// NestedFrame); present mode must do the same or every ratio-sized text
// resolves to `value × 0 = 0px` and disappears. So this renderer threads the
// frame's own design-px height down and provides it to its children — exactly
// the height of the frame that directly contains them.
//
// Doc order = paint order = z-order. Recursion handles primitives nested
// inside primitives (rare but valid).

import type { Item as AgocraftItem } from "@agocraft/core";
import { isDomainItem } from "../agocraft-mirror.js";
import { ParentFrameHeightContext } from "../domains/parent-frame-context.js";
import { FRAME_KINDS } from "../presentation-order.js";
import type { AgoItem, ItemFrame } from "../types.js";
import { FrameContent } from "./FrameContent.js";
import { ItemInteractionLayer } from "./ItemInteractionLayer.js";

export interface PresentFrameTreeProps {
  readonly item: AgocraftItem;
  /** Design-px height of `item` itself. Provided to `item`'s children via
   *  `ParentFrameHeightContext` so a child text's `ratio` fontSize resolves
   *  against the height of the frame that directly contains it. */
  readonly frameHeightPx: number;
  /** WI-194 / DR-127 — DeckPolicy.childOwnsScene, injected by the composition
   *  root (PresentPage). True = the child frame has its own Stage scene, so
   *  this tree skips it; false = render it inline as part of this frame. */
  readonly childOwnsScene: (child: AgocraftItem) => boolean;
}

export function PresentFrameTree({ item, frameHeightPx, childOwnsScene }: PresentFrameTreeProps) {
  return (
    <>
      <FrameContent item={item as unknown as AgoItem} />
      {/* WI-090 — link / hotspot behaviors for THIS item. Rendered above the
       *  item's own content (so a shape / image link reliably catches clicks)
       *  but before its children (so a child's own link wins). */}
      <ItemInteractionLayer item={item} />
      <ParentFrameHeightContext.Provider value={frameHeightPx}>
        {item.children.map((child) => {
          if (!isDomainItem(child)) return null;
          // A scene-owning nested frame is painted by its own Stage scene at
          // absolute design coords — skip it here so it isn't painted twice.
          // A scene-less nested frame renders inline as part of this frame's
          // content (WI-072 / DR-127 — the predicate is the flavor's policy).
          if (FRAME_KINDS.has(child.kind) && childOwnsScene(child)) return null;
          const f = (child.attrs as { frame?: ItemFrame }).frame;
          if (f === undefined) return null;
          const rotation = f.rotation ?? 0;
          // The child's own design-px height = this frame's height × the
          // child's height ratio within it. Threaded down so the child's
          // descendants resolve their own ratio fonts correctly.
          const childHeightPx = frameHeightPx * f.height;
          return (
            <div
              key={String(child.id)}
              data-testid="present-primitive"
              data-kind={child.kind}
              data-item-id={String(child.id)}
              style={{
                position: "absolute",
                left: `${f.x * 100}%`,
                top: `${f.y * 100}%`,
                width: `${f.width * 100}%`,
                height: `${f.height * 100}%`,
                ...(rotation
                  ? {
                      transform: `rotate(${rotation}rad)`,
                      transformOrigin: "center center",
                    }
                  : {}),
              }}
            >
              <PresentFrameTree
                item={child}
                frameHeightPx={childHeightPx}
                childOwnsScene={childOwnsScene}
              />
            </div>
          );
        })}
      </ParentFrameHeightContext.Provider>
    </>
  );
}
