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

import type { Document as AgocraftDocument, Change, Item } from "@agocraft/core";
import { createPeekModeController, type PeekModeController } from "@agocraft/interaction";
import { createFrameSpatialIndex, type FrameSpatialIndex } from "@agocraft/spatial";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { absoluteFrameBox, findItemDeep } from "../agocraft-mirror.js";
import type { Design } from "../types.js";

export interface UsePeekModeDeps {
  /** The current Design. We read `document.root.children` for z-order and
   *  `width` × `height` for ratio→absolute bbox conversion. */
  readonly design: Design;
  /** Editor's change stream subscriber. The hook normalizes to a tick-only
   *  signature internally (the spatial index doesn't need change payload). */
  readonly subscribeToChanges: (handler: (change: Change) => void) => () => void;
  /** WI-038 Phase 2 — z-order reorder callback. Invoked once on drag commit
   *  with the new ordering of `containerId.children` (z-ascending) plus the
   *  container id so the host can dispatch
   *  `weave.design.reorderChildren({ containerId, order })`. The container
   *  id is whatever was passed via `containerId` at the time of the drag;
   *  defaults to the document root id when omitted. */
  readonly onReorder: (orderedIds: ReadonlyArray<string>, containerId: string) => void;
  /** WI-038 Phase 2 — the container Item id whose children peek indexes
   *  + reorders. Defaults to the document root. The host typically resolves
   *  this from the current selection (`selectedItem.parent ?? root`) so the
   *  same L+drag works both for top-level frames and items nested inside
   *  a frame. */
  readonly containerId?: string;
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

interface AbsoluteBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function usePeekMode(deps: UsePeekModeDeps): UsePeekModeResult {
  const designRef = useRef<Design>(deps.design);
  designRef.current = deps.design;

  const containerIdRef = useRef<string>(deps.containerId ?? String(deps.design.document.root.id));

  const [stickyActive, setStickyActive] = useState(false);
  const [holdActive, setHoldActive] = useState(false);
  const effectiveActive = stickyActive || holdActive;

  // Resolve the active container Item via the shared `findItemDeep` /
  // `absoluteFrameBox` helpers. Falls back to the document root when the
  // id is unknown (e.g., the selected item was just removed) so peek
  // never silently disables itself on a stale id.
  const resolveContainer = useCallback((): {
    container: Item;
    absBox: AbsoluteBox;
  } => {
    const doc = designRef.current.document;
    const root = doc.root;
    const designW = designRef.current.width;
    const designH = designRef.current.height;
    const rootAbsBox: AbsoluteBox = { x: 0, y: 0, w: designW, h: designH };
    const id = containerIdRef.current;
    if (id === String(root.id)) {
      return { container: root, absBox: rootAbsBox };
    }
    const found = findItemDeep(doc, id);
    if (found === undefined) {
      return { container: root, absBox: rootAbsBox };
    }
    const absBox = absoluteFrameBox(doc, id, designW, designH);
    return { container: found, absBox: absBox ?? rootAbsBox };
  }, []);

  // FrameSpatialIndex — built once, but `listItems` / `resolveBbox` look
  // through `containerIdRef` so a container change just requires a
  // `markDirty()` + the next query rebuilds from the new container.
  const index = useMemo<FrameSpatialIndex<unknown>>(() => {
    return createFrameSpatialIndex<unknown>({
      onChange: (h) => deps.subscribeToChanges(() => h()),
      frameId: "peek-container",
      listItems: () => resolveContainer().container.children.map((c: Item) => String(c.id)),
      resolveBbox: (itemId) => {
        const { container, absBox } = resolveContainer();
        const item = container.children.find((c: Item) => String(c.id) === itemId);
        if (!item) return null;
        const frame = (
          item.attrs as { frame?: { x: number; y: number; width: number; height: number } }
        ).frame;
        if (!frame) return null;
        return {
          x: absBox.x + frame.x * absBox.w,
          y: absBox.y + frame.y * absBox.h,
          w: frame.width * absBox.w,
          h: frame.height * absBox.h,
        };
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the caller swaps the containerId, mark the index dirty so the
  // next query rebuilds against the new container's children list.
  useEffect(() => {
    const next = deps.containerId ?? String(designRef.current.document.root.id);
    if (next === containerIdRef.current) return;
    containerIdRef.current = next;
    index.markDirty();
    // Re-seed the controller's cursor probe — the cached lift set targets
    // the previous container's coords. A no-op `setCursor` clears it.
    // Caller's next pointer move will re-query against the new container.
  }, [deps.containerId, index]);

  // PeekModeController — built once.
  const controller = useMemo<PeekModeController>(() => {
    return createPeekModeController({
      resolveIndex: () => index,
      readZ: (itemId) =>
        resolveContainer().container.children.findIndex((c: Item) => String(c.id) === itemId),
      onCommit: (orderedAsc) => {
        deps.onReorder(orderedAsc, containerIdRef.current);
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
