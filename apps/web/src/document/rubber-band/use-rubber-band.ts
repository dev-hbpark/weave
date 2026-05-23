// WI-017 Phase C — `useRubberBand` hook.
//
// Owns the 4-state machine, pointer capture on the host element, snap-to-
// grid math, min-drag-size threshold, and Esc dismissal. The host element
// (caller-supplied via the returned `ref`) is the *coordinate frame* — all
// rects are in that element's local pixel space, untransformed.
//
// The hook is design-system-free: the visual rendering happens in the
// caller's JSX using `<RubberBand>` + a `<Popover>` (DR-design-007). The
// hook only emits state + rect; the caller composes the surface.
//
// Pointer capture (per frontend-design-pattern-agent's Phase B obligation):
// on pointerdown we call `setPointerCapture` so subsequent move/up events
// stick to the host even when the pointer drifts off — RubberBand itself
// is `pointer-events: none`, so without capture the events would otherwise
// reach whatever lies beneath.

import {
  type PointerEvent as ReactPointerEvent,
  type RefCallback,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { RubberBandHostRect, RubberBandHostState } from "./types.js";

export interface UseRubberBandOptions {
  /**
   * Grid snap size in host-local pixels. `0` disables snapping. Coordinates
   * are rounded to the nearest multiple as the pointer moves — both the
   * start point and the live edge.
   */
  readonly snapSize?: number;
  /**
   * Minimum width AND height (host-local pixels) the drag must exceed for
   * `drawing → reviewing`. Below the threshold, pointerup returns to `idle`
   * without opening the popover. Default `10`.
   */
  readonly minDragSize?: number;
  /** Fired when the user clicks a recommendation. Receives the final rect. */
  readonly onCommit?: (rect: RubberBandHostRect) => void;
  /** Fired when the user dismisses (Esc, click outside, etc.). */
  readonly onCancel?: () => void;
}

export interface UseRubberBandReturn {
  readonly state: RubberBandHostState;
  /** Non-null whenever `state !== "idle"`. */
  readonly rect: RubberBandHostRect | null;
  /** Free-form identifier the popover layer sets via `preview()`. */
  readonly previewKind: string | null;
  /** True whenever Option(Alt) is held over the host — layer can change the
   *  cursor / show an inline mode hint. */
  readonly altActive: boolean;
  /** Cursor position in viewport (client) px while hovering empty space
   *  (or Alt-held over any child) in idle. Null otherwise. Used to anchor
   *  the empty-space hover hint popover via a Radix virtual ref. Client
   *  coords (not host-local) so the popover portal — which mounts to
   *  document.body and is unaffected by the host's CSS transform — can
   *  position correctly. */
  readonly hoverPoint: { readonly clientX: number; readonly clientY: number } | null;
  /**
   * Spread onto the host element (the container that should accept the
   * rubber-band drag — e.g. a design canvas or a frame's interior).
   * Frames / shapes / other interactive children inside the host should
   * stopPropagation on their own pointerdown so the drag only fires from
   * empty space.
   */
  readonly hostProps: {
    readonly ref: RefCallback<HTMLElement>;
    /** Capture-phase intercept — fires *before* children. Used to honor
     *  Option(Alt) modifier so the drag wins even when the pointer lands on
     *  a child (frame / shape / selection handle). */
    readonly onPointerDownCapture: (e: ReactPointerEvent<HTMLElement>) => void;
    readonly onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
    readonly onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
    readonly onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
    readonly onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
    readonly onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => void;
  };
  /**
   * Popover layer calls this on item hover / hover-out. `kind` is an opaque
   * string the InsertableCapability (DR-012) understands. Passing `null`
   * returns to the plain reviewing state.
   */
  readonly preview: (kind: string | null) => void;
  /**
   * Commit the current rect. Fires `onCommit(rect)`, then auto-resets to
   * idle on the next tick (so the caller can dispatch `editor.exec(...)`
   * within the same React batch without racing the state reset).
   */
  readonly commit: () => void;
  readonly cancel: () => void;
}

export function useRubberBand(
  options: UseRubberBandOptions = {},
): UseRubberBandReturn {
  const { snapSize = 0, minDragSize = 10, onCommit, onCancel } = options;

  const hostRef = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<RubberBandHostState>("idle");
  const [rect, setRect] = useState<RubberBandHostRect | null>(null);
  const [previewKind, setPreviewKind] = useState<string | null>(null);
  const [altActive, setAltActive] = useState<boolean>(false);
  const [hoverPoint, setHoverPoint] = useState<
    { readonly clientX: number; readonly clientY: number } | null
  >(null);

  const startPointRef = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  /**
   * Mirror of `rect` in a ref — `commit()` reads from here so we can fire
   * `onCommit(rect)` *outside* a `setState` reducer (calling host setState
   * from inside another component's setState reducer triggers React's
   * "Cannot update a component while rendering a different component"
   * warning).
   */
  const latestRectRef = useRef<RubberBandHostRect | null>(null);

  const snap = useCallback(
    (n: number): number =>
      snapSize > 0 ? Math.round(n / snapSize) * snapSize : n,
    [snapSize],
  );

  /**
   * Convert a pointer's screen coordinate to host-local pixels. Reads the
   * host's current bounding rect each call so the math survives layout
   * shifts mid-drag (e.g. a scroll). When the host has a CSS transform that
   * scales it (FrameStage's design plane), `boundingRect.width /
   * offsetWidth` is the visual scale we divide out.
   */
  const toLocal = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const host = hostRef.current;
      if (host === null) return { x: 0, y: 0 };
      const r = host.getBoundingClientRect();
      const scale = host.offsetWidth > 0 ? r.width / host.offsetWidth : 1;
      return {
        x: (clientX - r.left) / scale,
        y: (clientY - r.top) / scale,
      };
    },
    [],
  );

  /** Internal — actually start the drawing state. Shared between bubble
   *  (empty-space) and capture (Alt-held) paths. */
  const startDrawing = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const host = hostRef.current;
      if (host === null) return;
      const { x, y } = toLocal(e.clientX, e.clientY);
      const sx = snap(x);
      const sy = snap(y);
      startPointRef.current = { x: sx, y: sy };
      pointerIdRef.current = e.pointerId;
      host.setPointerCapture(e.pointerId);
      setState("drawing");
      setRect({ left: sx, top: sy, width: 0, height: 0 });
      setHoverPoint(null);
    },
    [toLocal, snap],
  );

  /** Capture-phase intercept — runs *before* descendant handlers (item
   *  selection, frame drag). When Option(Alt) is held we hijack the gesture
   *  for drag-to-add so the user can start a drag even while pointing at an
   *  existing item. */
  const onPointerDownCapture = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!e.altKey) return;
      if (e.button !== 0) return;
      if (state !== "idle") return;
      // Block all descendant handlers (selection, drag-to-move) from acting
      // on this event — they would otherwise fire in bubble phase after
      // capture finishes propagating down.
      e.stopPropagation();
      e.preventDefault();
      startDrawing(e);
    },
    [state, startDrawing],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      // Empty-space guard — React's synthetic events bubble through the
      // *component tree*, not the DOM tree. That means portal'd descendants
      // (e.g. a Radix ContextMenu's menuitem rendered into document.body but
      // declared inside one of our frame components) still surface their
      // pointerdown here. Without this check the host would capture the
      // pointer on a menuitem click, hijacking the menu's own click flow.
      // `e.target === e.currentTarget` is true only when the pointerdown
      // actually lands on the host element itself — i.e. genuine empty
      // space between children. Option(Alt) bypass is handled in
      // `onPointerDownCapture` above (fires before this).
      if (e.target !== e.currentTarget) return;
      if (e.button !== 0) return; // left button only
      if (state !== "idle") return; // re-entry guard
      startDrawing(e);
    },
    [state, startDrawing],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      // Surface Alt state for visual mode hint (cursor change in the layer).
      setAltActive(e.altKey);
      if (state === "drawing") {
        const start = startPointRef.current;
        if (start === null) return;
        const { x, y } = toLocal(e.clientX, e.clientY);
        const sx = snap(x);
        const sy = snap(y);
        const left = Math.min(start.x, sx);
        const top = Math.min(start.y, sy);
        const width = Math.abs(sx - start.x);
        const height = Math.abs(sy - start.y);
        setRect({ left, top, width, height });
        return;
      }
      // Idle hover tracking — only emit a hoverPoint when the cursor is on
      // the host itself (genuine empty space) OR Option is held. Children
      // (frames, shapes) shadow the hover hint so they can show their own
      // tooltip without conflict.
      if (state !== "idle") return;
      const onEmpty = e.target === e.currentTarget;
      if (!onEmpty && !e.altKey) {
        setHoverPoint(null);
        return;
      }
      setHoverPoint({ clientX: e.clientX, clientY: e.clientY });
    },
    [state, toLocal, snap],
  );

  const onPointerLeave = useCallback(
    (_e: ReactPointerEvent<HTMLElement>) => {
      setHoverPoint(null);
      setAltActive(false);
    },
    [],
  );

  const releaseCapture = useCallback(() => {
    const host = hostRef.current;
    const id = pointerIdRef.current;
    if (host !== null && id !== null) {
      try {
        host.releasePointerCapture(id);
      } catch {
        // Pointer capture may already have been released — ignore.
      }
    }
    pointerIdRef.current = null;
    startPointRef.current = null;
  }, []);

  const onPointerUp = useCallback(
    (_e: ReactPointerEvent<HTMLElement>) => {
      if (state !== "drawing") return;
      releaseCapture();
      // Snapshot the latest rect synchronously so a too-small drag resets
      // without leaving the rect dangling.
      setRect((r) => {
        if (r === null || r.width < minDragSize || r.height < minDragSize) {
          setState("idle");
          return null;
        }
        setState("reviewing");
        return r;
      });
    },
    [state, releaseCapture, minDragSize],
  );

  const onPointerCancel = useCallback(
    (_e: ReactPointerEvent<HTMLElement>) => {
      if (state !== "drawing") return;
      releaseCapture();
      setState("idle");
      setRect(null);
    },
    [state, releaseCapture],
  );

  const preview = useCallback((kind: string | null) => {
    setPreviewKind(kind);
    // Only toggle state if we're in a popover-open phase. From idle / drawing
    // / inserting we ignore (caller bug). The state machine never goes
    // backwards from previewing → reviewing except via this call.
    setState((s) => {
      if (s !== "reviewing" && s !== "previewing") return s;
      return kind === null ? "reviewing" : "previewing";
    });
  }, []);

  const commit = useCallback(() => {
    const r = latestRectRef.current;
    setState((s) => {
      if (s !== "reviewing" && s !== "previewing") return s;
      return "inserting";
    });
    // Fire onCommit *outside* any setState reducer — the host's onCommit
    // dispatches editor.exec, which sets state in DesignPage. Calling it
    // from inside `setRect((r) => …)` would trigger React's "Cannot update
    // a component while rendering a different component" warning.
    if (r !== null && onCommit) onCommit(r);
    // Next-tick reset — gives React time to commit the inserting state
    // and the host's editor mutation before we tear the rubber band down.
    queueMicrotask(() => {
      setState("idle");
      setRect(null);
      setPreviewKind(null);
    });
  }, [onCommit]);

  const cancel = useCallback(() => {
    releaseCapture();
    setState("idle");
    setRect(null);
    setPreviewKind(null);
    onCancel?.();
  }, [releaseCapture, onCancel]);

  // Keep `latestRectRef` synced after every render so `commit()` can read
  // the current rect without entering a setState reducer.
  useEffect(() => {
    latestRectRef.current = rect;
  }, [rect]);

  // Esc dismissal — active outside idle / inserting (the two terminal
  // states the user can't dismiss). Mirrors the AITooltipProvider's Esc
  // path from WI-015 Phase E.
  useEffect(() => {
    if (state === "idle" || state === "inserting") return;
    if (typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [state, cancel]);

  // Track Option(Alt) globally so the layer can switch its cursor / mode
  // hint the moment the key is pressed, even before the user moves the
  // pointer. Only active in idle — once a drag starts, the `altActive`
  // state is frozen at whatever the drag's modifier was.
  useEffect(() => {
    if (state !== "idle") return;
    if (typeof window === "undefined") return;
    const onDown = (e: KeyboardEvent) => {
      if (e.altKey) setAltActive(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (!e.altKey) setAltActive(false);
    };
    const onBlur = () => setAltActive(false);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [state]);

  const setRef = useCallback<RefCallback<HTMLElement>>((el) => {
    hostRef.current = el;
  }, []);

  return {
    state,
    rect,
    previewKind,
    altActive,
    hoverPoint,
    hostProps: {
      ref: setRef,
      onPointerDownCapture,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onPointerLeave,
    },
    preview,
    commit,
    cancel,
  };
}
