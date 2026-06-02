// WI-074 / DR-029 D7 — generic content flip (mirror), applied to ANY supported
// item kind, not just images.
//
// Stored as a kind-agnostic UNIT (`transform.flip`, attrs `{ flipH?, flipV? }`),
// like the decoration units (DR-028) — weave's schema is empty + onUnknown:
// preserve, so the unit round-trips without an agocraft registration.
//
// Applied at NestedFrame (the common per-item wrapper) as a frame-centre mirror
// of the item's rendered content. Mirroring the FINAL composition keeps the same
// visible region for cropped content (image window untouched) — only the display
// flips (the crop-preservation requirement, generalized).

import type { Item as AgocraftItem } from "@agocraft/core";
import { findUnitInItem } from "@agocraft/core";
import type { CSSProperties } from "react";

export const FLIP_UNIT_KIND = "transform.flip";

/** Kinds for which a visual flip is meaningful. `frame` (container) is included
 *  as a DISPLAY-ONLY flip: NestedFrame mirrors the frame's content + children but
 *  marks them pointer-events:none so child manipulation (which would otherwise
 *  drag in inverted directions under the mirror) is suspended — the frame box
 *  itself stays editable; unflip to edit children. Excludes:
 *  - `qr`   — flipping breaks scannability (functional damage),
 *  - `text` — mirror-image text is unreadable. */
export const FLIP_ALLOWED_KINDS: ReadonlySet<string> = new Set([
  "image",
  "video",
  "shape",
  "line",
  "frame",
]);

export interface FlipState {
  readonly flipH: boolean;
  readonly flipV: boolean;
}

export function readFlip(item: AgocraftItem): FlipState {
  const attrs = findUnitInItem(item, FLIP_UNIT_KIND)?.attrs as
    | { flipH?: boolean; flipV?: boolean }
    | undefined;
  return { flipH: attrs?.flipH ?? false, flipV: attrs?.flipV ?? false };
}

/** Frame-centre mirror transform for the item's content wrapper (empty when no
 *  flip). Keeps the visible region identical — only the display is mirrored. */
export function flipTransform(flip: FlipState): CSSProperties {
  return flip.flipH || flip.flipV
    ? {
        transform: `scaleX(${flip.flipH ? -1 : 1}) scaleY(${flip.flipV ? -1 : 1})`,
        transformOrigin: "center",
      }
    : {};
}
