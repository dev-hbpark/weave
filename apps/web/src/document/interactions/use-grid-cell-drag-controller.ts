// WI-043 — grid cell-swap drag (selection-state based).
//
// When a SINGLE grid CHILD is selected and the user plain-drags it (no
// modifier), this controller intercepts the press at the window capture phase
// — BEFORE the GestureRouter's frame-move binding — and runs a cell swap: the
// dragged item exchanges grid cells with the item it is dropped on.
//
// Why selection-state based: if a layout child's plain drag always reordered,
// you could no longer move the PARENT frame when its cells are full. So:
//   • FRAME selected → drag moves the frame (router frame-move; works even
//     when the grid is full, via the selected-frame redirect in FrameAccess).
//   • grid CHILD selected → drag swaps cells (this controller).
// The controller therefore arms ONLY when the press lands on the currently
// selected grid child.
//
// v1 = swap on drop (drag A onto B → A and B trade cells). Empty-cell drops
// and flex reorder are follow-ups.

import type { Editor } from "@agocraft/editor";
import type { Document as AgocraftDocument, LayoutSpec } from "@agocraft/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { findParentAndIndex } from "../agocraft-mirror.js";
import {
  designPlaneFromTarget,
  frameIdFromTarget,
} from "./use-reparent-drag-controller.js";

const SWAP_TARGET_ATTR = "data-grid-swap-target";

export interface GridCellDragState {
  readonly active: boolean;
  readonly cursor: { readonly x: number; readonly y: number } | null;
  /** Item id under the cursor that the dragged item would swap with. */
  readonly swapTargetId: string | null;
}

const IDLE: GridCellDragState = { active: false, cursor: null, swapTargetId: null };

export interface UseGridCellDragControllerDeps {
  readonly editor: Editor | null;
  readonly getDocument: () => AgocraftDocument | null;
  readonly getSelectedIds: () => ReadonlySet<string>;
  readonly enabled: boolean;
}

function cssEscape(v: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(v);
  return v.replace(/["\\]/g, "\\$&");
}

/** The parent item id of `itemId` when its parent is an auto-grid frame. */
function gridParentId(doc: AgocraftDocument, itemId: string): string | undefined {
  const found = findParentAndIndex(doc, itemId);
  if (found === undefined) return undefined;
  const layout = (found.parent.attrs as { layout?: LayoutSpec }).layout;
  return layout !== undefined && layout.kind === "auto-grid" ? String(found.parent.id) : undefined;
}

export function useGridCellDragController(
  deps: UseGridCellDragControllerDeps,
): GridCellDragState {
  const { editor, getDocument, getSelectedIds, enabled } = deps;
  const [state, setState] = useState<GridCellDragState>(IDLE);

  const getDocumentRef = useRef(getDocument);
  getDocumentRef.current = getDocument;
  const getSelectedIdsRef = useRef(getSelectedIds);
  getSelectedIdsRef.current = getSelectedIds;

  const sessionRef = useRef<{
    draggedId: string;
    parentId: string;
    lastHighlightedEl: Element | null;
  } | null>(null);

  const endGesture = useCallback(() => {
    const s = sessionRef.current;
    if (s !== null && s.lastHighlightedEl !== null) {
      s.lastHighlightedEl.removeAttribute(SWAP_TARGET_ATTR);
    }
    sessionRef.current = null;
    setState(IDLE);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // Plain drag only — modifiers belong to reparent (Cmd/Ctrl+Shift) etc.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (designPlaneFromTarget(e.target) === null) return;
      const hit = frameIdFromTarget(e.target);
      if (hit === null) return;
      const sel = getSelectedIdsRef.current();
      // Must press the CURRENTLY-SELECTED item (so a frame-selected drag still
      // moves the frame, and pressing a non-selected child just re-selects).
      if (sel.size !== 1 || !sel.has(hit)) return;
      const doc = getDocumentRef.current();
      if (doc === null) return;
      const parentId = gridParentId(doc, hit);
      if (parentId === undefined) return; // not a grid child

      // Block the GestureRouter (frame-move) from claiming this press.
      e.preventDefault();
      e.stopImmediatePropagation();
      sessionRef.current = { draggedId: hit, parentId, lastHighlightedEl: null };
      setState({ active: true, cursor: { x: e.clientX, y: e.clientY }, swapTargetId: null });
    };
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => window.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [enabled]);

  useEffect(() => {
    if (!state.active) return undefined;
    const session = sessionRef.current;
    if (session === null) return undefined;

    /** A valid swap target = a DIFFERENT child of the SAME grid parent. */
    const resolveTarget = (clientX: number, clientY: number): string | null => {
      const elUnder = document.elementFromPoint(clientX, clientY);
      const cand = frameIdFromTarget(elUnder);
      if (cand === null || cand === session.draggedId) return null;
      const doc = getDocumentRef.current();
      if (doc === null) return null;
      const found = findParentAndIndex(doc, cand);
      return found !== undefined && String(found.parent.id) === session.parentId ? cand : null;
    };

    const onMove = (e: PointerEvent) => {
      const targetId = resolveTarget(e.clientX, e.clientY);
      const el =
        targetId !== null
          ? document.querySelector(`[data-frame-id="${cssEscape(targetId)}"]`)
          : null;
      if (session.lastHighlightedEl !== el) {
        session.lastHighlightedEl?.removeAttribute(SWAP_TARGET_ATTR);
        el?.setAttribute(SWAP_TARGET_ATTR, "true");
        session.lastHighlightedEl = el;
      }
      setState({ active: true, cursor: { x: e.clientX, y: e.clientY }, swapTargetId: targetId });
    };
    const onUp = (e: PointerEvent) => {
      const targetId = resolveTarget(e.clientX, e.clientY);
      if (targetId !== null && editor !== null) {
        editor.exec("weave.item.swapGridCells", { aId: session.draggedId, bId: targetId });
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
