// WI-043 — layout-child move drag (selection-state based).
//
// When a SINGLE layout CHILD (auto-flex or auto-grid) is selected and the user
// plain-drags it (no modifier), this controller intercepts the press at the
// window capture phase — BEFORE the GestureRouter's frame-move binding — and
// repositions the dragged item by exchanging it with the sibling it is dropped
// on. The operation is the layout paradigm's natural one:
//   • auto-grid → swap CELLS (weave.item.swapGridCells)
//   • auto-flex → swap SEQUENCE order (weave.item.swapFlexOrder)
//
// Why selection-state based: if a layout child's plain drag always reordered,
// you could no longer move the PARENT frame when its slots are full. So:
//   • FRAME selected → drag moves the frame (router frame-move; works even
//     when the layout is full, via the selected-frame redirect in FrameAccess).
//   • layout CHILD selected → drag swaps positions (this controller).
// The controller therefore arms ONLY when the press lands on the currently
// selected layout child.

import type { Editor } from "@agocraft/editor";
import type { Document as AgocraftDocument, LayoutSpec } from "@agocraft/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { findParentAndIndex } from "../agocraft-mirror.js";
import {
  designPlaneFromTarget,
  frameIdFromTarget,
} from "./use-reparent-drag-controller.js";

const SWAP_TARGET_ATTR = "data-layout-swap-target";

/** Which weave command performs the swap for each layout paradigm. A lookup
 *  table (not a switch) keeps the kind→behavior dispatch declarative — only
 *  the paradigms that support drag-to-swap appear here. */
const SWAP_COMMAND_BY_KIND: Readonly<Record<string, string>> = {
  "auto-grid": "weave.item.swapGridCells",
  "auto-flex": "weave.item.swapFlexOrder",
};

export interface LayoutChildDragState {
  readonly active: boolean;
  readonly cursor: { readonly x: number; readonly y: number } | null;
  /** Item id under the cursor that the dragged item would swap with. */
  readonly swapTargetId: string | null;
}

const IDLE: LayoutChildDragState = { active: false, cursor: null, swapTargetId: null };

export interface UseLayoutChildDragControllerDeps {
  readonly editor: Editor | null;
  readonly getDocument: () => AgocraftDocument | null;
  readonly getSelectedIds: () => ReadonlySet<string>;
  readonly enabled: boolean;
}

function cssEscape(v: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(v);
  return v.replace(/["\\]/g, "\\$&");
}

/** The parent of `itemId` together with its layout kind, when that parent is a
 *  drag-to-swap layout (auto-flex / auto-grid). Undefined otherwise. */
function swappableParent(
  doc: AgocraftDocument,
  itemId: string,
): { readonly parentId: string; readonly kind: string } | undefined {
  const found = findParentAndIndex(doc, itemId);
  if (found === undefined) return undefined;
  const layout = (found.parent.attrs as { layout?: LayoutSpec }).layout;
  if (layout === undefined || SWAP_COMMAND_BY_KIND[layout.kind] === undefined) return undefined;
  return { parentId: String(found.parent.id), kind: layout.kind };
}

export function useLayoutChildDragController(
  deps: UseLayoutChildDragControllerDeps,
): LayoutChildDragState {
  const { editor, getDocument, getSelectedIds, enabled } = deps;
  const [state, setState] = useState<LayoutChildDragState>(IDLE);

  const getDocumentRef = useRef(getDocument);
  getDocumentRef.current = getDocument;
  const getSelectedIdsRef = useRef(getSelectedIds);
  getSelectedIdsRef.current = getSelectedIds;

  const sessionRef = useRef<{
    draggedId: string;
    parentId: string;
    parentKind: string;
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
      const parent = swappableParent(doc, hit);
      if (parent === undefined) return; // not a flex/grid child

      // Block the GestureRouter (frame-move) from claiming this press.
      e.preventDefault();
      e.stopImmediatePropagation();
      sessionRef.current = {
        draggedId: hit,
        parentId: parent.parentId,
        parentKind: parent.kind,
        lastHighlightedEl: null,
      };
      setState({ active: true, cursor: { x: e.clientX, y: e.clientY }, swapTargetId: null });
    };
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => window.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [enabled]);

  useEffect(() => {
    if (!state.active) return undefined;
    const session = sessionRef.current;
    if (session === null) return undefined;

    /** A valid swap target = a DIFFERENT child of the SAME layout parent. */
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
      const command = SWAP_COMMAND_BY_KIND[session.parentKind];
      if (targetId !== null && command !== undefined && editor !== null) {
        editor.exec(command, { aId: session.draggedId, bId: targetId });
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
