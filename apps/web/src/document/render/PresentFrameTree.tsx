// Recursive present-mode renderer for a frame's content.
//
// In present mode each navigable frame (slide / canvas-design / block-doc /
// media) is its own Stage scene positioned at its absolute design coords.
// The scene body uses `<PresentFrameTree>` so the frame's renderer fires
// AND any non-frame children (image / video / shape) render at their
// relative position within the frame's bbox. Nested frames are skipped —
// they have their own scene and would otherwise render twice.
//
// Doc order = paint order = z-order. Recursion handles primitives nested
// inside primitives (rare but valid).

import type { Item as AgocraftItem } from "@agocraft/core";
import { isDomainItem } from "../agocraft-mirror.js";
import { FRAME_KINDS } from "../presentation-order.js";
import type { AgoItem, ItemFrame } from "../types.js";
import { FrameContent } from "./FrameContent.js";

export interface PresentFrameTreeProps {
  readonly item: AgocraftItem;
}

export function PresentFrameTree({ item }: PresentFrameTreeProps) {
  return (
    <>
      <FrameContent item={item as unknown as AgoItem} />
      {item.children.map((child) => {
        if (!isDomainItem(child)) return null;
        // Nested frames have their own Stage scene at absolute design coords.
        if (FRAME_KINDS.has(child.kind)) return null;
        const f = (child.attrs as { frame?: ItemFrame }).frame;
        if (f === undefined) return null;
        const rotation = f.rotation ?? 0;
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
            <PresentFrameTree item={child} />
          </div>
        );
      })}
    </>
  );
}
