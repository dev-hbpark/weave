import { PeekOverlay, PointStackInspector } from "../../../document/peek-mode/index.js";
import type { UsePeekModeResult } from "../../../document/peek-mode/use-peek-mode.js";

// DR-027 / WI-071 Phase 2 — peek-mode interaction surface extracted from the
// canvas. Cohesive: owns the z-above capture div (pointer → controller cursor +
// drag-to-reorder on lifted frames), the PeekOverlay (CSS lift effect on the
// real frame DOM), and the PointStackInspector. Mounted only while peek is
// active. The shared canvas refs / projection fns are injected (DR-027 Surface
// E) — this is the live editing surface, intrinsically host-coupled.

type PeekDrag = {
  itemId: string;
  startClientY: number;
  startRank: number;
  pointerId: number;
};

export interface PeekCaptureLayerProps {
  readonly peek: UsePeekModeResult;
  readonly screenToDesign: (clientX: number, clientY: number) => { x: number; y: number } | null;
  readonly hitTestLifted: (designX: number, designY: number) => string | null;
  readonly canvasHostRef: React.RefObject<HTMLElement | null>;
  readonly canvasHostEl: HTMLElement | null;
  readonly hostRect: DOMRect | null;
  readonly peekDragRef: React.MutableRefObject<PeekDrag | null>;
  readonly peekCursor: { x: number; y: number } | null;
  readonly setPeekCursor: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  readonly peekDraggingId: string | null;
  readonly setPeekDraggingId: React.Dispatch<React.SetStateAction<string | null>>;
  readonly colorFor: (id: string) => string;
  readonly labelFor: (id: string) => string;
}

export function PeekCaptureLayer({
  peek,
  screenToDesign,
  hitTestLifted,
  canvasHostRef,
  canvasHostEl,
  hostRect,
  peekDragRef,
  peekCursor,
  setPeekCursor,
  peekDraggingId,
  setPeekDraggingId,
  colorFor,
  labelFor,
}: PeekCaptureLayerProps): React.ReactNode {
  if (!peek.isActive) return null;
  return (
    <>
      {/* WI-019 Phase 3 (rev2) — Peek capture layer. Sits z-above FrameStage,
          mounted only while peek is active, intercepting pointer events to
          (a) report cursor → controller, (b) drag-to-reorder lifted frames.
          PeekOverlay drives the CSS lift on the real frame DOM via data attrs. */}
      <div
        data-testid="peek-capture"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 30,
          cursor: peekDragRef.current ? "grabbing" : "crosshair",
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const p = screenToDesign(e.clientX, e.clientY);
          if (!p) return;
          const id = hitTestLifted(p.x, p.y);
          if (!id) return;
          const liftSet = peek.controller.liftSet.get();
          if (!liftSet) return;
          const startRank = liftSet.orderedIds.indexOf(id);
          if (startRank < 0) return;
          if (!peek.controller.startDrag(id)) return;
          peekDragRef.current = {
            itemId: id,
            startClientY: e.clientY,
            startRank,
            pointerId: e.pointerId,
          };
          setPeekDraggingId(id);
          // Mark the dragging frame for the stronger lifted style.
          const el = canvasHostRef.current?.querySelector(`[data-frame-id="${id}"]`);
          if (el instanceof HTMLElement) el.setAttribute("data-peek-dragging", "");
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* setPointerCapture may throw on detached pointers — safe ignore. */
          }
        }}
        onPointerMove={(e) => {
          const p = screenToDesign(e.clientX, e.clientY);
          if (p) {
            peek.setCursor(p.x, p.y, true);
            setPeekCursor({
              x: e.clientX - (hostRect?.left ?? 0),
              y: e.clientY - (hostRect?.top ?? 0),
            });
          }
          // Drag preview — vertical pointer delta → rank delta.
          const drag = peekDragRef.current;
          if (drag) {
            const liftSet = peek.controller.liftSet.get();
            if (!liftSet) return;
            const dy = drag.startClientY - e.clientY;
            const STEP_PX = 28;
            const deltaRank = Math.round(dy / STEP_PX);
            const max = liftSet.orderedIds.length - 1;
            const newRank = Math.max(0, Math.min(max, drag.startRank + deltaRank));
            peek.controller.updateDrag(newRank);
          }
        }}
        onPointerUp={(e) => {
          const drag = peekDragRef.current;
          if (drag) {
            peek.controller.endDrag(true);
            const el = canvasHostRef.current?.querySelector(`[data-frame-id="${drag.itemId}"]`);
            if (el instanceof HTMLElement) el.removeAttribute("data-peek-dragging");
            peekDragRef.current = null;
            setPeekDraggingId(null);
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
              /* safe ignore */
            }
          }
        }}
        onPointerCancel={() => {
          const drag = peekDragRef.current;
          if (drag) {
            peek.controller.endDrag(false);
            const el = canvasHostRef.current?.querySelector(`[data-frame-id="${drag.itemId}"]`);
            if (el instanceof HTMLElement) el.removeAttribute("data-peek-dragging");
            peekDragRef.current = null;
            setPeekDraggingId(null);
          }
        }}
        onPointerLeave={() => {
          peek.setCursor(-9999, -9999, false);
          setPeekCursor(null);
        }}
      >
        <PeekOverlay
          controller={peek.controller}
          canvasHost={canvasHostEl}
          cursor={peekCursor}
          colorFor={colorFor}
          draggingId={peekDraggingId}
        />
      </div>
      <PointStackInspector controller={peek.controller} labelFor={labelFor} swatchFor={colorFor} />
    </>
  );
}
