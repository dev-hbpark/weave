// UnifiedTooltip — the one and only tooltip surface in the app.
//
// Replaces three older mechanisms that grew side by side:
//   • native browser `title=` (simple, OS-styled, ~500 ms — what the user
//     said "feels right" for undo/redo).
//   • AITooltip (rich card with Context eyebrow + actions list + kbd chips).
//   • CursorTooltip (mode-aware describer with the same rich card).
//
// The new policy collapses all three into one consistent contract:
//   • Visual:  one line.  `text` + optional `[kbd]` chip.  No "Context"
//              eyebrow, no separator, no multi-row action list.  Same look
//              as the native title the user pointed to as "simple".
//   • Position: cursor-anchored (right + below offset).  Browser native
//              title behaves the same way; matching it keeps the muscle
//              memory.
//   • Trigger: single document-level pointerover listener resolves the
//              nearest `[data-tip]` ancestor.  One attribute lights up an
//              element; the same scan covers every surface in the app.
//   • Content discovery options:
//              `data-tip`        → required, the text line
//              `data-tip-kbd`    → optional, the kbd chip (e.g. "⌘ Z")
//              `data-tip-disabled` → if "true", the resolved tip is hidden
//   • Debounce: 1000 ms show dwell. No instant adjacent switch — moving
//              between dense buttons hides the current and restarts the
//              timer for the next (user-confirmed 2026-05-27 that instant
//              switching reads as "어지러움").
//   • Coverage: anything that needs a tooltip — toolbar button, canvas
//              frame, design background — sets `data-tip` and the unified
//              surface picks it up.  No per-component wiring.

import {
  type ReactElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../cn.js";

export interface UnifiedTooltipData {
  readonly text: string;
  readonly kbd?: string;
}

export interface UnifiedTooltipProps {
  /** Dwell time before the tooltip appears, in ms.  Default 1000.
   *  Hosts can lower per-instance for surfaces with explicit help intent. */
  readonly showDelayMs?: number;
  /** When true the entire surface refuses to open + dismisses any visible
   *  / pending tooltip.  Hosts wire this from their interaction-mode
   *  machine to silence the tooltip mid-drag / mid-rubber-band / mid-
   *  context-menu without each individual `data-tip` element having to
   *  check.  Default false. */
  readonly disabled?: boolean;
}

type Status = "idle" | "pending-show" | "visible";

interface MachineState {
  readonly status: Status;
  readonly key: string;
  readonly data: UnifiedTooltipData | null;
  readonly clientX: number;
  readonly clientY: number;
}

const INITIAL: MachineState = {
  status: "idle",
  key: "",
  data: null,
  clientX: 0,
  clientY: 0,
};

function readTip(el: Element | null): UnifiedTooltipData | null {
  if (el === null) return null;
  if (el.getAttribute("data-tip-disabled") === "true") return null;
  const text = el.getAttribute("data-tip");
  if (text === null || text.length === 0) return null;
  const kbd = el.getAttribute("data-tip-kbd");
  return {
    text,
    ...(kbd !== null && kbd.length > 0 ? { kbd } : {}),
  };
}

function tipKey(el: Element, data: UnifiedTooltipData): string {
  // Element identity + data content together — same element with shifted
  // data (e.g. mode/state flipped) refreshes in place; different element
  // forces a new pending-show cycle.
  // We don't have a stable element id, so use the in-DOM position as a
  // proxy via the closest [data-tip-id] override (when present) or fall
  // back to the data text — good enough for "same vs different" because
  // adjacent buttons always carry different labels anyway.
  const explicit = el.getAttribute("data-tip-id");
  const head = explicit ?? data.text;
  return `${head}|${data.kbd ?? ""}`;
}

export function UnifiedTooltip({
  showDelayMs = 1000,
  disabled = false,
}: UnifiedTooltipProps): ReactElement | null {
  const cursorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [state, setState] = useState<MachineState>(INITIAL);
  const stateRef = useRef<MachineState>(INITIAL);
  stateRef.current = state;
  const showTimerRef = useRef<number | null>(null);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const clearShow = (): void => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  };

  // Hard reset on disabled flip.
  useEffect(() => {
    if (!disabled) return;
    clearShow();
    if (stateRef.current.status !== "idle") setState(INITIAL);
  }, [disabled]);

  // Single document-level pointer listener handles every reactive surface.
  // Resolves the nearest [data-tip] ancestor on each pointermove and drives
  // the state machine.  Same target → maybe refresh data, different target
  // → cancel & restart show timer, no target → return to idle.
  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const onMove = (e: PointerEvent): void => {
      cursorRef.current = { x: e.clientX, y: e.clientY };

      if (disabledRef.current) return;
      const t = e.target;
      const el = t instanceof Element ? (t.closest("[data-tip]") as Element | null) : null;
      const data = readTip(el);
      const prev = stateRef.current;

      if (data === null || el === null) {
        clearShow();
        if (prev.status !== "idle") setState(INITIAL);
        return;
      }

      const key = tipKey(el, data);

      // Same target — only re-render if data changed (text/kbd shifted while
      // pointer sat still).  Status stays as-is; visible stays visible, a
      // pending-show keeps its timer.
      if (key === prev.key) {
        if (
          prev.status !== "idle" &&
          (prev.data?.text !== data.text || prev.data?.kbd !== data.kbd)
        ) {
          setState({ ...prev, data });
        }
        return;
      }

      // Different target.  Hide current (no instant switch) and restart
      // pending-show with a fresh 1 s timer.
      clearShow();
      if (prev.status === "visible") {
        setState(INITIAL);
      }
      const pendingKey = key;
      const pendingData = data;
      showTimerRef.current = window.setTimeout(() => {
        showTimerRef.current = null;
        if (disabledRef.current) return;
        const { x, y } = cursorRef.current;
        setState({
          status: "visible",
          key: pendingKey,
          data: pendingData,
          clientX: x,
          clientY: y,
        });
      }, showDelayMs);
      setState({
        status: "pending-show",
        key: pendingKey,
        data: pendingData,
        clientX: e.clientX,
        clientY: e.clientY,
      });
    };

    const onLeaveWindow = (e: MouseEvent): void => {
      if (e.relatedTarget !== null) return;
      clearShow();
      if (stateRef.current.status !== "idle") setState(INITIAL);
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("mouseout", onLeaveWindow);
    return () => {
      document.removeEventListener("pointermove", onMove);
      window.removeEventListener("mouseout", onLeaveWindow);
    };
  }, [showDelayMs]);

  // Follow the cursor while visible — re-render at rAF so the popover
  // glides smoothly with the pointer.
  const [cursorTick, setCursorTick] = useState(0);
  useEffect(() => {
    if (state.status !== "visible") return undefined;
    let raf = 0;
    let lastX = state.clientX;
    let lastY = state.clientY;
    const tick = (): void => {
      const { x, y } = cursorRef.current;
      if (x !== lastX || y !== lastY) {
        lastX = x;
        lastY = y;
        setCursorTick((t) => t + 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.status, state.clientX, state.clientY]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => clearShow();
  }, []);

  const position = useMemo(() => {
    if (state.status !== "visible") return null;
    void cursorTick;
    const { x, y } = cursorRef.current;
    // Offset to the right + below so the tip never sits under the pointer
    // (a tip under the pointer steals subsequent pointerover events and
    // collapses adjacent-hover detection).  16 px is enough room for the
    // OS cursor sprite + a small visual gap.
    return { left: x + 16, top: y + 18 };
  }, [state.status, cursorTick]);

  if (state.status !== "visible" || state.data === null || position === null) {
    return null;
  }
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="tooltip"
      data-testid="unified-tooltip"
      className={cn(
        // Single-line pill: dark glass, hairline border, soft shadow.
        // Sits above the chrome layer (header / panel at 46) so it floats
        // over every surface, just like the native title would.
        "fixed z-[60] pointer-events-none select-none",
        "flex items-center gap-2",
        "px-2 py-1 rounded-[var(--radius-sm)]",
        "bg-[color:var(--surface-overlay)] border border-[color:var(--surface-overlay-border)]",
        "shadow-[var(--shadow-overlay)] backdrop-blur-[var(--surface-blur)]",
        "text-[12px] leading-none text-[color:var(--text-overlay)]",
        "max-w-[320px]",
      )}
      style={{ left: position.left, top: position.top }}
    >
      <span className="truncate">{state.data.text}</span>
      {state.data.kbd !== undefined ? (
        <kbd
          className={cn(
            "inline-flex items-center px-1 py-0.5 rounded-[var(--radius-sm)] border",
            "bg-[color:var(--surface-overlay-2)] border-[color:var(--surface-overlay-border-strong)]",
            "text-[10px] font-mono tracking-[0.04em] text-[color:var(--text-overlay)]",
          )}
        >
          {state.data.kbd}
        </kbd>
      ) : null}
    </div>,
    document.body,
  );
}
