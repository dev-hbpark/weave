// WI-039 — Reparent drag controller (modifier-gated, surface-agnostic).
//
// Cmd/Ctrl + Shift + drag on a frame inside the design plane enters
// "reparent" mode at pointer-down. While the mode is active the original
// items stay in place (no translate), a ghost overlay follows the cursor,
// and the frame under the cursor highlights as a drop target. On
// pointer-up the controller dispatches `weave.item.reparent` with a
// single multi-entry payload.
//
// Architecture (SOLID + GRASP, EP §7):
// - SRP: this hook owns gesture state only (mode, cursor, hovered target).
//   The cycle guard lives in `findDescendantSet`; the patch math is in
//   `weave.item.reparent`. The hook just intercepts the gesture and
//   dispatches.
// - OCP / Rule 6: surfaces (ThumbnailPanel drop, ContextMenu picker) will
//   eventually feed the same `editor.exec("weave.item.reparent", …)` —
//   this hook is the modifier-drag entry point, not the policy registry.
// - DIP: the hook receives `Editor`, document accessor, selection
//   accessor, and the design-plane element ref. It owns no React state
//   beyond the gesture, exposes a `state` snapshot for the overlay.
//
// Capture-phase note: agocraft's FrameMoveBinding claims frame body
// presses at the GestureRouter's capture phase (FrameStage.tsx:548).
// The router subscribes via `@agocraft/input` at window/document level.
// To intercept BEFORE the binding claims, this controller installs a
// `pointerdown` listener on the design-plane host with `capture: true`
// and calls `stopImmediatePropagation` when the modifier matches — that
// preempts the router and the synthetic React handlers underneath.

import type { Document as AgocraftDocument } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import { useCallback, useEffect, useRef, useState } from "react";
import { findDescendantSet } from "../agocraft-mirror.js";

const REPARENT_ACTIVE_ATTR = "data-reparent-drop-target";
const REPARENT_INVALID_ATTR = "data-reparent-drop-invalid";

export interface ReparentDragState {
  /** Whether a reparent gesture is currently in progress. */
  readonly active: boolean;
  /** Live cursor position in viewport (client) coordinates. */
  readonly cursor: { readonly x: number; readonly y: number } | null;
  /** Drop target under the cursor, or null if none / invalid. */
  readonly hoveredTarget: {
    readonly frameId: string;
    readonly valid: boolean;
  } | null;
  /** Entries the gesture started with. Each id is moved on commit. */
  readonly entries: ReadonlyArray<{ readonly itemId: string }>;
}

export interface UseReparentDragControllerDeps {
  /** Editor session, used for `editor.exec("weave.item.reparent", …)`. */
  readonly editor: Editor | null;
  /** Live document accessor — read each gesture frame, not memoized. */
  readonly getDocument: () => AgocraftDocument | null;
  /** Selected item ids the gesture should move. Read on pointer-down. */
  readonly getSelectedIds: () => ReadonlySet<string>;
  /** Whether the controller is enabled. Hosts gate this off in modes
   *  that own the canvas exclusively (peek, present, hand pan). */
  readonly enabled: boolean;
  /** Live design pixel size — forwarded to `weave.item.reparent` so its
   *  rotation-aware geometry stays correct across rotated, non-square
   *  ancestors. Optional; absent → the command assumes a unit square,
   *  which is exact for every non-(rotated-ancestor) case. */
  readonly getDesignSize?: () => { readonly width: number; readonly height: number };
}

const IDLE_STATE: ReparentDragState = {
  active: false,
  cursor: null,
  hoveredTarget: null,
  entries: [],
};

/** Detect the modifier combo that arms the reparent gesture. macOS uses
 *  Cmd+Shift, Windows/Linux uses Ctrl+Shift. EP §5 explains why the
 *  combo is free (existing single-modifier slots are taken). */
export function isReparentModifier(e: PointerEvent | MouseEvent): boolean {
  return (e.metaKey || e.ctrlKey) && e.shiftKey;
}

/** Walk up from `target` and return the first frame id discovered, or
 *  null if no frame ancestor exists. */
export function frameIdFromTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest("[data-frame-id]");
  if (el === null) return null;
  return el.getAttribute("data-frame-id");
}

/** Compute the set of frame ids that would create a cycle if any of
 *  `itemIds` were reparented into them. Includes the items themselves
 *  and every descendant. */
export function disabledDropTargets(
  doc: AgocraftDocument,
  itemIds: Iterable<string>,
): ReadonlySet<string> {
  const blocked = new Set<string>();
  for (const id of itemIds) {
    for (const d of findDescendantSet(doc, id)) blocked.add(d);
  }
  return blocked;
}

/** Walk up from `target` and confirm it sits inside a design plane
 *  (`[data-design-plane="true"]`). Returns the design plane element when
 *  yes, null when no. */
export function designPlaneFromTarget(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  return target.closest("[data-design-plane='true']");
}

export function useReparentDragController(deps: UseReparentDragControllerDeps): ReparentDragState {
  const { editor, getDocument, getSelectedIds, enabled, getDesignSize } = deps;
  const [state, setState] = useState<ReparentDragState>(IDLE_STATE);

  // Stale-proof the accessor callbacks so the pointerdown effect only
  // remounts when `enabled` flips, not on every parent re-render that
  // produces a new inline function.
  const getDocumentRef = useRef(getDocument);
  getDocumentRef.current = getDocument;
  const getSelectedIdsRef = useRef(getSelectedIds);
  getSelectedIdsRef.current = getSelectedIds;
  const getDesignSizeRef = useRef(getDesignSize);
  getDesignSizeRef.current = getDesignSize;

  // Mutable mirror of state used by the window-level pointermove /
  // pointerup handlers (kept off React state so re-render rate stays
  // bounded to the overlay's needs).
  const sessionRef = useRef<{
    entries: ReadonlyArray<{ itemId: string }>;
    blocked: ReadonlySet<string>;
    lastHighlightedEl: Element | null;
  } | null>(null);

  const endGesture = useCallback(() => {
    const session = sessionRef.current;
    if (session !== null && session.lastHighlightedEl !== null) {
      session.lastHighlightedEl.removeAttribute(REPARENT_ACTIVE_ATTR);
      session.lastHighlightedEl.removeAttribute(REPARENT_INVALID_ATTR);
    }
    sessionRef.current = null;
    setState(IDLE_STATE);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (!isReparentModifier(e)) return;
      // Only intercept presses inside an active design plane — otherwise
      // a Cmd+Shift+click in a side panel / dialog would arm the gesture.
      if (designPlaneFromTarget(e.target) === null) return;
      const hitFrameId = frameIdFromTarget(e.target);
      if (hitFrameId === null) return;
      const doc = getDocumentRef.current();
      if (doc === null) return;
      const selected = getSelectedIdsRef.current();
      // Selection must include the pressed frame — otherwise the press
      // wouldn't have been on a draggable item. Tolerate single-frame
      // gestures even if the modifier-down arrived before the selection
      // settled: synthesize an entries list from the pressed frame.
      const entries: Array<{ itemId: string }> = [];
      if (selected.size > 0 && selected.has(hitFrameId)) {
        for (const id of selected) entries.push({ itemId: id });
      } else {
        entries.push({ itemId: hitFrameId });
      }

      // Block the GestureRouter (frame-manip translate / marquee) from
      // claiming this press — see capture-phase note above.
      e.preventDefault();
      e.stopImmediatePropagation();

      const blocked = disabledDropTargets(
        doc,
        entries.map((x) => x.itemId),
      );
      sessionRef.current = {
        entries,
        blocked,
        lastHighlightedEl: null,
      };
      setState({
        active: true,
        cursor: { x: e.clientX, y: e.clientY },
        hoveredTarget: null,
        entries,
      });
    };

    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
    };
  }, [enabled]);

  // Window-level pointermove / pointerup while a gesture is in flight.
  useEffect(() => {
    if (!state.active) return undefined;
    const session = sessionRef.current;
    if (session === null) return undefined;

    // Resolve the drop target under the cursor: a frame when the pointer is
    // over one, otherwise the design ROOT when the pointer is over empty
    // design-plane area. The root has no `data-frame-id` (it's the
    // `[data-design-plane]` container), so `frameIdFromTarget` misses it —
    // map it explicitly so items can be pulled OUT of a frame back to the
    // top level (the ContextMenu does this via its `@root` row; the drag
    // gesture needs the same affordance). Returns the highlight element too.
    const resolveDropTarget = (
      clientX: number,
      clientY: number,
    ): { id: string; el: Element | null } | null => {
      const elUnder = document.elementFromPoint(clientX, clientY);
      const frameId = frameIdFromTarget(elUnder);
      if (frameId !== null) {
        return {
          id: frameId,
          el: document.querySelector(`[data-frame-id="${cssEscape(frameId)}"]`),
        };
      }
      const plane = designPlaneFromTarget(elUnder);
      if (plane !== null) {
        const doc = getDocumentRef.current();
        if (doc !== null) return { id: String(doc.root.id), el: plane };
      }
      return null;
    };

    const onMove = (e: PointerEvent) => {
      const target = resolveDropTarget(e.clientX, e.clientY);
      const candidateId = target?.id ?? null;
      const valid = candidateId !== null && !session.blocked.has(candidateId);
      // Move the visual highlight to the candidate's host element (a frame,
      // or the whole design plane when targeting the root).
      const candidateEl = target?.el ?? null;
      if (session.lastHighlightedEl !== candidateEl) {
        if (session.lastHighlightedEl !== null) {
          session.lastHighlightedEl.removeAttribute(REPARENT_ACTIVE_ATTR);
          session.lastHighlightedEl.removeAttribute(REPARENT_INVALID_ATTR);
        }
        if (candidateEl !== null) {
          candidateEl.setAttribute(valid ? REPARENT_ACTIVE_ATTR : REPARENT_INVALID_ATTR, "true");
        }
        session.lastHighlightedEl = candidateEl;
      }
      setState({
        active: true,
        cursor: { x: e.clientX, y: e.clientY },
        hoveredTarget: candidateId !== null ? { frameId: candidateId, valid } : null,
        entries: session.entries,
      });
    };

    const onUp = (e: PointerEvent) => {
      const target = resolveDropTarget(e.clientX, e.clientY);
      const candidateId = target?.id ?? null;
      const valid = candidateId !== null && !session.blocked.has(candidateId);
      if (valid && candidateId !== null && editor !== null) {
        const size = getDesignSizeRef.current?.();
        editor.exec("weave.item.reparent", {
          entries: session.entries.map((x) => ({
            itemId: x.itemId,
            newParentId: candidateId,
          })),
          ...(size !== undefined ? { designWidth: size.width, designHeight: size.height } : {}),
        });
      }
      endGesture();
    };

    const onCancel = () => endGesture();

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onCancel, true);
    return () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onCancel, true);
    };
  }, [state.active, editor, endGesture]);

  return state;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}
