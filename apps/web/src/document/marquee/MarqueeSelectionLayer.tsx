// MarqueeSelectionLayer — Figma-style drag-to-select multi-selection.
//
// Plain drag (no Alt) on empty design-plane space → draws a marquee box
// and selects every top-level frame whose bbox intersects the box.
// Modifier-aware intent captured at pointerdown:
//
//   • no modifier  → replace selection
//   • Shift held   → add to selection (union)
//   • Cmd / Ctrl   → toggle each item in the box
//
// Alt is reserved for the frame-add rubber-band (RubberBandLayer with
// `requireAltKey={true}`). When Alt is held at pointerdown the marquee
// does NOT claim the gesture so the rubber-band layer (registered on a
// sibling/parent host via the gesture router) can take it instead.
//
// Implementation: a single capture-phase pointerdown listener on the
// host element. Once a marquee starts, it tracks pointermove / pointerup
// on `window` so the drag survives leaving the host's DOM region.

import {
  forwardRef,
  type MutableRefObject,
  type ReactNode,
  type Ref,
  type RefCallback,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type MarqueeIntent = "replace" | "add" | "toggle";

export interface MarqueeFrame {
  readonly id: string;
  /** Absolute design coords (pixels). */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MarqueeSelectionLayerProps {
  readonly containerSize: { readonly width: number; readonly height: number };
  readonly clientToLocal: (
    clientX: number,
    clientY: number,
  ) => { readonly x: number; readonly y: number };
  /** Returns the frames currently eligible for marquee selection at hit-test
   *  time. Called once on pointerup so it reads fresh document state. */
  readonly getFrames: () => ReadonlyArray<MarqueeFrame>;
  /** Filter for which pointerdown targets allow the marquee to start. */
  readonly acceptTarget?: (target: Element) => boolean;
  readonly onSelectIntent: (
    intent: MarqueeIntent,
    ids: ReadonlyArray<string>,
  ) => void;
  /** Portal target for the visual marquee box. Typically the design plane
   *  so the box rides the camera transform exactly like a frame. */
  readonly visualHost?: RefObject<HTMLElement | null> | null;
  /** Below this drag size in design pixels → treat as a click; no marquee.
   *  Default 4. */
  readonly minDragSize?: number;
  readonly className?: string;
  readonly style?: React.CSSProperties;
  readonly children: ReactNode;
}

function mergeRefs<T>(
  ...refs: ReadonlyArray<Ref<T> | undefined>
): RefCallback<T> {
  return (value: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") {
        ref(value);
      } else if (ref != null) {
        (ref as MutableRefObject<T | null>).current = value;
      }
    }
  };
}

interface MarqueeState {
  readonly intent: MarqueeIntent;
  readonly start: { readonly x: number; readonly y: number };
  readonly end: { readonly x: number; readonly y: number };
}

function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export const MarqueeSelectionLayer = forwardRef<
  HTMLDivElement,
  MarqueeSelectionLayerProps
>(function MarqueeSelectionLayer(
  {
    containerSize,
    clientToLocal,
    getFrames,
    acceptTarget,
    onSelectIntent,
    visualHost,
    minDragSize,
    className,
    style,
    children,
  },
  forwardedRef,
) {
  const hostElementRef = useRef<HTMLDivElement | null>(null);

  // Stable refs so listeners read the latest values without re-binding.
  const clientToLocalRef = useRef(clientToLocal);
  clientToLocalRef.current = clientToLocal;
  const getFramesRef = useRef(getFrames);
  getFramesRef.current = getFrames;
  const acceptTargetRef = useRef(acceptTarget);
  acceptTargetRef.current = acceptTarget;
  const onSelectIntentRef = useRef(onSelectIntent);
  onSelectIntentRef.current = onSelectIntent;
  const containerSizeRef = useRef(containerSize);
  containerSizeRef.current = containerSize;
  const minDragRef = useRef(minDragSize ?? 4);
  minDragRef.current = minDragSize ?? 4;

  // Local marquee state mirrors the in-flight drag.
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const dragRef = useRef<{
    intent: MarqueeIntent;
    start: { x: number; y: number };
    pointerId: number;
  } | null>(null);

  // Capture-phase pointerdown listener on the host element.
  useEffect(() => {
    const host = hostElementRef.current;
    if (host === null) return undefined;

    function onDown(e: PointerEvent): void {
      // Left-button only.
      if (e.button !== 0) return;
      // Alt reserved for the rubber-band add gesture — defer.
      if (e.altKey) return;
      // Sibling-/parent-binding region gate.
      const target = e.target;
      if (target instanceof Element && acceptTargetRef.current !== undefined) {
        if (!acceptTargetRef.current(target)) return;
      }
      const local = clientToLocalRef.current(e.clientX, e.clientY);
      const intent: MarqueeIntent =
        e.metaKey || e.ctrlKey
          ? "toggle"
          : e.shiftKey
            ? "add"
            : "replace";
      dragRef.current = {
        intent,
        start: { x: local.x, y: local.y },
        pointerId: e.pointerId,
      };
      setMarquee({ intent, start: local, end: local });
      // Stop here so inner bindings (frame-body click handlers, etc.)
      // don't also fire — we already decided this press is a marquee.
      e.stopPropagation();
      // Note: NOT preventDefault — we still want the browser's standard
      // focus-on-press behaviour for accessibility.
    }

    function onMove(e: PointerEvent): void {
      const d = dragRef.current;
      if (d === null) return;
      if (e.pointerId !== d.pointerId) return;
      const local = clientToLocalRef.current(e.clientX, e.clientY);
      setMarquee({ intent: d.intent, start: d.start, end: local });
    }

    function finish(e: PointerEvent | null): void {
      const d = dragRef.current;
      if (d === null) return;
      if (e !== null && e.pointerId !== d.pointerId) return;
      dragRef.current = null;
      const local =
        e !== null
          ? clientToLocalRef.current(e.clientX, e.clientY)
          : d.start;
      const dx = Math.abs(local.x - d.start.x);
      const dy = Math.abs(local.y - d.start.y);
      const min = minDragRef.current;
      setMarquee(null);
      if (dx < min && dy < min) return;
      const rect = {
        x: Math.min(d.start.x, local.x),
        y: Math.min(d.start.y, local.y),
        width: dx,
        height: dy,
      };
      const hit: string[] = [];
      for (const f of getFramesRef.current()) {
        if (rectsIntersect(rect, f)) hit.push(f.id);
      }
      // After a real (non-click) drag, the browser MAY synthesize a click
      // on pointerup that bubbles to the host's `handleBackgroundClick`
      // and clears the selection we just set. Install a one-shot capture
      // swallower — and ALSO clear it via setTimeout(0) so the swallower
      // has a single-task lifetime even if no click is actually fired
      // (big drags suppress the click). Without the timeout, the swallower
      // would stay attached and eat the user's NEXT intentional click —
      // including Shift+click for multi-toggle.
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
        window.removeEventListener("click", swallow, true);
      };
      window.addEventListener("click", swallow, true);
      setTimeout(() => window.removeEventListener("click", swallow, true), 0);
      onSelectIntentRef.current(d.intent, hit);
    }

    function onUp(e: PointerEvent): void {
      finish(e);
    }
    function onCancel(e: PointerEvent): void {
      finish(e);
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape" && dragRef.current !== null) {
        dragRef.current = null;
        setMarquee(null);
      }
    }

    // pointerdown on the host (capture phase so frame-body click handlers
    // see our stopPropagation before they run).
    host.addEventListener("pointerdown", onDown, true);
    // pointermove / pointerup at the window level so leaving the host
    // doesn't break tracking.
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      host.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // Visual rect — project local design coords back to viewport pixels via
  // the visualHost (same pattern as RubberBandLayer so the box rides the
  // camera transform).
  const localRectRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  if (marquee !== null) {
    localRectRef.current = {
      x: Math.min(marquee.start.x, marquee.end.x),
      y: Math.min(marquee.start.y, marquee.end.y),
      width: Math.abs(marquee.end.x - marquee.start.x),
      height: Math.abs(marquee.end.y - marquee.start.y),
    };
  } else {
    localRectRef.current = null;
  }

  const [viewportRect, setViewportRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const marqueeActive = marquee !== null;

  useEffect(() => {
    if (!marqueeActive) {
      setViewportRect(null);
      return;
    }
    let raf = 0;
    let lastKey = "";
    const tick = () => {
      const projector = visualHost?.current ?? hostElementRef.current;
      const rect = localRectRef.current;
      if (projector !== null && rect !== null) {
        const r = projector.getBoundingClientRect();
        const cs = containerSizeRef.current;
        const sx = visualHost
          ? r.width / cs.width
          : r.width / (projector.offsetWidth || cs.width);
        const sy = visualHost
          ? r.height / cs.height
          : r.height / (projector.offsetHeight || cs.height);
        const left = r.left + rect.x * sx;
        const top = r.top + rect.y * sy;
        const width = rect.width * sx;
        const height = rect.height * sy;
        const key = `${left.toFixed(1)}|${top.toFixed(
          1,
        )}|${width.toFixed(1)}|${height.toFixed(1)}`;
        if (key !== lastKey) {
          lastKey = key;
          setViewportRect({ left, top, width, height });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [marqueeActive, visualHost]);

  const composedRef = useCallback(
    mergeRefs<HTMLDivElement>(forwardedRef, hostElementRef),
    [forwardedRef],
  );

  const intent = marquee?.intent ?? null;

  return (
    <div
      ref={composedRef}
      className={className}
      style={{
        position: "relative",
        ...(marquee !== null ? { cursor: "crosshair" } : {}),
        ...style,
      }}
      data-testid="marquee-host"
      data-marquee-state={marquee !== null ? "drawing" : "idle"}
      data-marquee-intent={intent ?? undefined}
    >
      {children}
      {viewportRect !== null && typeof document !== "undefined"
        ? createPortal(
            <div
              data-testid="marquee-box"
              data-marquee-intent={intent ?? undefined}
              style={{
                position: "fixed",
                left: viewportRect.left,
                top: viewportRect.top,
                width: viewportRect.width,
                height: viewportRect.height,
                pointerEvents: "none",
                zIndex: 42,
                background:
                  intent === "toggle"
                    ? "rgba(255, 184, 108, 0.12)"
                    : intent === "add"
                      ? "rgba(168, 215, 255, 0.12)"
                      : "rgba(200, 200, 255, 0.10)",
                border:
                  intent === "toggle"
                    ? "1px solid rgba(255, 184, 108, 0.7)"
                    : intent === "add"
                      ? "1px solid rgba(168, 215, 255, 0.7)"
                      : "1px solid rgba(170, 170, 220, 0.7)",
                borderRadius: 2,
                boxSizing: "border-box",
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );
});
