// 아쿠 new-slide camera (WI-125). When the agent CREATES a new top-level slide
// (root frame) during a turn, fit the camera to that slide at its creation moment so
// the user watches the deck build slide by slide. Distinct from WI-113's per-edit
// centering (removed in WI-116 because it hid the roaming): this fires ONLY when a
// brand-new root child appears, not on every edit of an existing slide.
//
// The fit math lives in the design page (FrameStage owns it), so we hand the new
// slide id to `onZoomToFrame` (DesignPage's zoom-to-frame = cameraFitBox @ 70%).
// Resolved from the document MODEL (not the DOM), so it works before the new slide
// has painted. Gated on `streaming` — manual slide creation fits via use-item-add.

import type { Document as AgocraftDocument } from "@agocraft/core";
import { useEffect, useRef } from "react";
import { isDomainItem } from "../../document/agocraft-mirror.js";

export function useAkuNewSlideCamera(opts: {
  readonly document: AgocraftDocument;
  readonly streaming: boolean;
  readonly onZoomToFrame?: ((frameId: string) => void) | undefined;
}): void {
  const { document, streaming, onZoomToFrame } = opts;
  const knownRef = useRef<ReadonlySet<string> | null>(null);
  const zoomRef = useRef(onZoomToFrame);
  zoomRef.current = onZoomToFrame;

  useEffect(() => {
    const ids = new Set(document.root.children.filter(isDomainItem).map((c) => String(c.id)));
    const prev = knownRef.current;
    knownRef.current = ids;
    if (prev === null) return; // first observation → adopt baseline, don't fit existing
    if (!streaming) return; // only agent-driven creations (manual adds fit elsewhere)
    let newest: string | null = null;
    for (const id of ids) if (!prev.has(id)) newest = id; // last new in child order
    if (newest !== null) zoomRef.current?.(newest);
  }, [document, streaming]);
}
