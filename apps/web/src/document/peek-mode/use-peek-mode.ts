// WI-019 Phase 3 — usePeekMode hook.
//
// Composes the agocraft PeekModeController + FrameSpatialIndex + a dual
// activation model (L hotkey hold + button toggle) into a React-ergonomic
// surface.
//
// Activation model:
//   - **Hold**: press L (KeyL) and hold → peek active until release.
//   - **Sticky**: click the header Peek button → toggles a sticky activation
//     that persists until clicked again (or Escape).
//   - effectiveActive = sticky || hold. Whichever activated, the
//     PeekModeController.isActive Signal reflects it. Inspector + overlay
//     subscribe to that Signal directly.
//
// Hotkey choice (L):
//   - Not conflicting with V (Select), H (Hand), Space (Pan), Esc (drill out).
//   - L = "Layers" — semantic match for the layer-stack peek visual.
//   - No modifier combinations (Cmd+L, Ctrl+L would clash with browser
//     address bar in some platforms; we deliberately ignore modifiers).

import {
  createFrameSpatialIndex,
  type FrameSpatialIndex,
} from "@agocraft/spatial";
import {
  createPeekModeController,
  type PeekModeController,
} from "@agocraft/interaction";
import type { Change, Document as AgocraftDocument, Item } from "@agocraft/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Design } from "../types.js";

export interface UsePeekModeDeps {
  /** The current Design. We read `document.root.children` for z-order and
   *  `width` × `height` for ratio→absolute bbox conversion. */
  readonly design: Design;
  /** Editor's change stream subscriber. The hook normalizes to a tick-only
   *  signature internally (the spatial index doesn't need change payload). */
  readonly subscribeToChanges: (handler: (change: Change) => void) => () => void;
  /** Direct reorder callback (Phase 3 bypass). When the user drops a peek
   *  drag, this is invoked with the new full ordering of root.children ids
   *  in z-ascending order. See `design-frame.zorder.ts` file header. */
  readonly onReorderRoot: (orderedIds: ReadonlyArray<string>) => void;
  /** Cursor radius in design-space pixels. Default 24. */
  readonly hitRadius?: number;
}

export interface UsePeekModeResult {
  readonly controller: PeekModeController;
  /** Effective active = sticky OR hold. Drives the header button's
   *  `aria-pressed` and `data-active` markers. */
  readonly isActive: boolean;
  /** Toggles the sticky activation (header button click). */
  readonly toggle: () => void;
  /** Forces sticky activation OFF. Used when another mutually-exclusive
   *  tool (Select / Hand) is selected — peek yields to the tool. The hold
   *  activation is not affected (only sticky). */
  readonly deactivateSticky: () => void;
  /** Imperative cursor reporter — host calls with design-space coords. */
  readonly setCursor: (x: number, y: number, inside: boolean) => void;
}

/** Convert a weave `ItemFrame` (0..1 ratio) to absolute design-space bbox. */
function frameToBBox(
  frame: { x: number; y: number; width: number; height: number },
  designWidth: number,
  designHeight: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: frame.x * designWidth,
    y: frame.y * designHeight,
    w: frame.width * designWidth,
    h: frame.height * designHeight,
  };
}

export function usePeekMode(deps: UsePeekModeDeps): UsePeekModeResult {
  const designRef = useRef<Design>(deps.design);
  designRef.current = deps.design;

  const [stickyActive, setStickyActive] = useState(false);
  const [holdActive, setHoldActive] = useState(false);
  const effectiveActive = stickyActive || holdActive;

  // FrameSpatialIndex — built once, reads through designRef.
  const index = useMemo<FrameSpatialIndex<unknown>>(() => {
    return createFrameSpatialIndex<unknown>({
      onChange: (h) => deps.subscribeToChanges(() => h()),
      frameId: "root",
      listItems: () =>
        designRef.current.document.root.children.map((c: Item) => String(c.id)),
      resolveBbox: (itemId) => {
        const root = designRef.current.document.root;
        const item = root.children.find((c: Item) => String(c.id) === itemId);
        if (!item) return null;
        const frame = (item.attrs as { frame?: { x: number; y: number; width: number; height: number } })
          .frame;
        if (!frame) return null;
        return frameToBBox(frame, designRef.current.width, designRef.current.height);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PeekModeController — built once.
  const controller = useMemo<PeekModeController>(() => {
    return createPeekModeController({
      resolveIndex: () => index,
      readZ: (itemId) => {
        const root = designRef.current.document.root;
        return root.children.findIndex((c: Item) => String(c.id) === itemId);
      },
      onCommit: (orderedAsc) => {
        deps.onReorderRoot(orderedAsc);
      },
      ...(deps.hitRadius !== undefined ? { hitRadius: deps.hitRadius } : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Sync controller.isActive with effectiveActive.
  useEffect(() => {
    if (effectiveActive) controller.activate();
    else controller.deactivate();
  }, [effectiveActive, controller]);

  // L key listener — hold-to-peek.
  useEffect(() => {
    function shouldIgnore(e: KeyboardEvent): boolean {
      const t = e.target as HTMLElement | null;
      if (!t) return false;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return true;
      if (t.isContentEditable) return true;
      return false;
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.code !== "KeyL") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (shouldIgnore(e)) return;
      if (e.repeat) return;
      e.preventDefault();
      setHoldActive(true);
    }
    function onKeyUp(e: KeyboardEvent): void {
      if (e.code !== "KeyL") return;
      if (shouldIgnore(e)) return;
      e.preventDefault();
      setHoldActive(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Escape exits sticky mode too (matches drill-out and dialog conventions).
  useEffect(() => {
    if (!stickyActive) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      setStickyActive(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stickyActive]);

  const toggle = useCallback(() => {
    setStickyActive((v) => !v);
  }, []);

  const deactivateSticky = useCallback(() => {
    setStickyActive(false);
  }, []);

  const setCursor = useCallback(
    (x: number, y: number, inside: boolean) => {
      controller.setCursor(x, y, inside);
    },
    [controller],
  );

  // NOTE: deliberately not calling `controller.dispose()` or `index.dispose()`
  // in cleanup — [[feedback_react_strictmode_singleton_dispose]] — under
  // StrictMode dev double-mount, that would permanently kill the controller.

  return {
    controller,
    isActive: effectiveActive,
    toggle,
    deactivateSticky,
    setCursor,
  };
}

export type { AgocraftDocument };
