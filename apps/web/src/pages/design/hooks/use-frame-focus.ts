import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  absoluteFrameBox,
  findItemDeep,
  findTrailDeep,
  isDomainItem,
} from "../../../document/agocraft-mirror.js";
import { cameraFitBox } from "../../frame-camera-bridge.js";

// DR-027 / WI-071 Phase 1 — extracted from DesignPageBody (WI-039 z-order
// focus cluster). Behavior-preserving: owns the two-stage focus state, the
// dim/isolate/disabled gate sets, the focus-stage indicator, and the camera
// fit handlers (zoom-to-frame + fit-all). Read-only over the document — it
// does not mutate, so no editor.exec path is involved.

/** WI-039 — z-order focus gate set computation.
 *
 *  Walks the trail from doc root to the focused frame and collects every
 *  frame id that should be visually + interactively suppressed for the given
 *  mode. Returns the empty set when the focused frame doesn't exist.
 *
 *  `mode = "above"` (stage 1): at every ancestor, take only the children whose
 *  paint order is AFTER the trail element (true z-order above across levels).
 *  `mode = "outside"` (stage 2): at every ancestor, take every child except the
 *  trail element (the entire complement of the focused frame's subtree).
 *
 *  Descendants of each collected sibling are added explicitly: opacity inherits
 *  through CSS, but `pointer-events` is re-applied per frame wrapper by
 *  FrameStage's hit gate, so every id must appear in the set for the per-frame
 *  gate to enforce the block uniformly. */
function collectFocusGateIds(
  doc: AgocraftDocument,
  focusedId: string,
  mode: "above" | "outside",
): ReadonlySet<string> {
  const trail = findTrailDeep(doc, focusedId);
  if (trail === undefined) return new Set<string>();
  const out = new Set<string>();
  const addSubtree = (item: AgocraftItem): void => {
    out.add(String(item.id));
    for (const c of item.children) addSubtree(c);
  };
  const collectLevel = (parent: AgocraftItem, trailChild: AgocraftItem): void => {
    const idx = parent.children.findIndex((c) => String(c.id) === String(trailChild.id));
    if (idx < 0) return;
    const start = mode === "above" ? idx + 1 : 0;
    for (let i = start; i < parent.children.length; i += 1) {
      if (mode === "outside" && i === idx) continue;
      const sibling = parent.children[i];
      if (sibling !== undefined) addSubtree(sibling);
    }
  };
  const firstTrail = trail[0];
  if (firstTrail !== undefined) collectLevel(doc.root, firstTrail);
  for (let k = 0; k < trail.length - 1; k += 1) {
    const ancestor = trail[k];
    const next = trail[k + 1];
    if (ancestor !== undefined && next !== undefined) collectLevel(ancestor, next);
  }
  return out;
}

type FocusedFrame = { readonly id: string; readonly stage: 1 | 2 };

export interface UseFrameFocusParams {
  readonly document: AgocraftDocument;
  readonly designWidth: number;
  readonly designHeight: number;
}

export interface UseFrameFocus {
  /** Currently-focused frame id (undefined when no focus). */
  readonly focusedId: string | undefined;
  /** Stage-1 "dim" set — frames painted ABOVE the focused frame in z-order. */
  readonly dimmedFrameIds: ReadonlySet<string>;
  /** Stage-2 "isolate" set — frames OUTSIDE the focused frame's subtree. */
  readonly isolatedFrameIds: ReadonlySet<string>;
  /** Union of dim + isolate — ThumbnailPanel tiles render these as disabled. */
  readonly disabledFrameIds: ReadonlySet<string>;
  /** 0 = no focus, 1 = dim, 2 = isolate. Always defined for `[data-focus-stage]`. */
  readonly focusStage: 0 | 1 | 2;
  readonly handleCycleFocus: (id: string, opts?: { readonly skipToIsolate?: boolean }) => void;
  readonly handleClearFocus: () => void;
  readonly handleZoomToFrame: (id: string) => void;
  readonly handleFitAll: () => void;
}

export function useFrameFocus({
  document,
  designWidth,
  designHeight,
}: UseFrameFocusParams): UseFrameFocus {
  // WI-039 — z-order focus, two-stage. Single-toggle: at most one frame is
  // focused at a time. Cycling a different tile resets the previous stage and
  // restarts the new tile at stage 1 (or jumps to stage 2 via shift-click).
  // Focus is independent of selection.
  const [focused, setFocused] = useState<FocusedFrame | undefined>(undefined);
  const handleCycleFocus = useCallback(
    (id: string, opts?: { readonly skipToIsolate?: boolean }) => {
      const skipToIsolate = opts?.skipToIsolate === true;
      setFocused((curr) => {
        if (curr === undefined || curr.id !== id) {
          return { id, stage: skipToIsolate ? 2 : 1 };
        }
        if (curr.stage === 1) return { id, stage: 2 };
        return undefined;
      });
    },
    [],
  );
  const handleClearFocus = useCallback(() => setFocused(undefined), []);

  // Double-clicking a thumbnail brings its frame full-screen. Like every camera
  // fit it uses cameraFitBox's shared FRAME_FIT_FILL (70%) for a consistent
  // size with breathing room (WI-065).
  const handleZoomToFrame = useCallback(
    (id: string) => {
      const box = absoluteFrameBox(document, id, designWidth, designHeight);
      if (box !== null) cameraFitBox(box);
    },
    [document, designWidth, designHeight],
  );
  // Double-clicking empty design space fits the camera to the union bounds of
  // every top-level item, at the same FRAME_FIT_FILL size as every other fit.
  const handleFitAll = useCallback(() => {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let found = false;
    for (const c of document.root.children) {
      if (!isDomainItem(c)) continue;
      const box = absoluteFrameBox(document, String(c.id), designWidth, designHeight);
      if (box === null) continue;
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.w);
      maxY = Math.max(maxY, box.y + box.h);
      found = true;
    }
    if (!found) return;
    cameraFitBox({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
  }, [document, designWidth, designHeight]);

  // Gate sets — `above` only takes later siblings at each ancestor; `outside`
  // takes every non-trail sibling at every level (with their subtrees).
  const dimmedFrameIds = useMemo<ReadonlySet<string>>(() => {
    if (focused?.stage !== 1) return new Set<string>();
    return collectFocusGateIds(document, focused.id, "above");
  }, [focused, document]);
  const isolatedFrameIds = useMemo<ReadonlySet<string>>(() => {
    if (focused?.stage !== 2) return new Set<string>();
    return collectFocusGateIds(document, focused.id, "outside");
  }, [focused, document]);
  // Tiles whose underlying frame is gated (dim OR isolate) get a "disabled"
  // treatment in ThumbnailPanel so the panel surface matches the canvas.
  const disabledFrameIds = useMemo<ReadonlySet<string>>(() => {
    if (dimmedFrameIds.size === 0 && isolatedFrameIds.size === 0) {
      return new Set<string>();
    }
    const merged = new Set<string>(dimmedFrameIds);
    for (const id of isolatedFrameIds) merged.add(id);
    return merged;
  }, [dimmedFrameIds, isolatedFrameIds]);
  // Stage indicator on the design root — `0` keeps the attribute always present
  // so CSS rules don't have to defend against `undefined`.
  const focusStage: 0 | 1 | 2 = focused?.stage ?? 0;
  // Clear focus when the focused frame is removed from the document.
  useEffect(() => {
    if (focused === undefined) return;
    if (findItemDeep(document, focused.id) === undefined) {
      setFocused(undefined);
    }
  }, [focused, document]);

  return {
    focusedId: focused?.id,
    dimmedFrameIds,
    isolatedFrameIds,
    disabledFrameIds,
    focusStage,
    handleCycleFocus,
    handleClearFocus,
    handleZoomToFrame,
    handleFitAll,
  };
}
