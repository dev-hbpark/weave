// WI-239 Phase 1 — pointer capture → tool strategy → emit seam.
//
// The hook owns the live draft buffer and converts pointer events into the
// surface's coordinate space (the event target is sized in that space, so
// `offsetX/offsetY` ARE the surface coordinates — design pixels for the
// slide overlay, viewport pixels for the blank board; no manual projection).
//
// It does NOT know what happens to a finished stroke: it calls the
// `onCommitStroke` / `onErase` callbacks. That is the producer/consumer seam
// (DR-154 §3). Phase 1 wires those to the local session; Phase 2 adds an
// awareness-broadcast consumer here WITHOUT touching capture.

import { type PointerEvent as ReactPointerEvent, useRef, useState } from "react";
import type { InkTool, InkToolContext } from "./ink-tools.js";
import type { InkPoint, InkStroke, InkStrokeStyle } from "./types.js";

export interface InkCaptureHandlers {
  onPointerDown(e: ReactPointerEvent): void;
  onPointerMove(e: ReactPointerEvent): void;
  onPointerUp(e: ReactPointerEvent): void;
}

export interface UseInkCaptureArgs {
  readonly tool: InkTool;
  /** Effective style (toolbar color/width merged with tool opacity/blend). */
  readonly style: InkStrokeStyle;
  readonly onCommitStroke: (stroke: InkStroke) => void;
  readonly onErase: (at: InkPoint) => void;
}

export interface UseInkCaptureResult {
  readonly handlers: InkCaptureHandlers;
  /** The in-progress stroke, for live preview. null when not drawing. */
  readonly draft: InkStroke | null;
}

let strokeCounter = 0;
function nextStrokeId(): string {
  strokeCounter += 1;
  return `ink-${Date.now().toString(36)}-${strokeCounter}`;
}

function pointOf(e: ReactPointerEvent): InkPoint {
  const ne = e.nativeEvent as PointerEvent;
  return { x: ne.offsetX, y: ne.offsetY };
}

export function useInkCapture({
  tool,
  style,
  onCommitStroke,
  onErase,
}: UseInkCaptureArgs): UseInkCaptureResult {
  const draftRef = useRef<InkStroke | null>(null);
  const [draft, setDraft] = useState<InkStroke | null>(null);
  const pressedRef = useRef(false);

  const buildContext = (point: InkPoint, pressed: boolean): InkToolContext => ({
    point,
    style,
    pressed,
    beginDraft: () => {
      const stroke: InkStroke = {
        id: nextStrokeId(),
        toolId: tool.id,
        style,
        points: [point],
      };
      draftRef.current = stroke;
      setDraft(stroke);
    },
    extendDraft: () => {
      const cur = draftRef.current;
      if (cur === null) return;
      const next: InkStroke = { ...cur, points: [...cur.points, point] };
      draftRef.current = next;
      setDraft(next);
    },
    commitDraft: () => {
      const cur = draftRef.current;
      draftRef.current = null;
      setDraft(null);
      // Drop zero-length taps that produced no visible mark.
      if (cur !== null && cur.points.length >= 1) onCommitStroke(cur);
    },
    eraseAt: () => onErase(point),
  });

  // Handlers are recreated each render (cheap — they're DOM event props on a
  // single layer, not a memo-sensitive hot path) so they always close over the
  // latest tool/style/callbacks without a dependency array to keep in sync.
  const onPointerDown = (e: ReactPointerEvent): void => {
    e.preventDefault();
    pressedRef.current = true;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    tool.onDown(buildContext(pointOf(e), true));
  };

  const onPointerMove = (e: ReactPointerEvent): void => {
    tool.onMove(buildContext(pointOf(e), pressedRef.current));
  };

  const onPointerUp = (e: ReactPointerEvent): void => {
    tool.onUp(buildContext(pointOf(e), false));
    pressedRef.current = false;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };

  return { handlers: { onPointerDown, onPointerMove, onPointerUp }, draft };
}
