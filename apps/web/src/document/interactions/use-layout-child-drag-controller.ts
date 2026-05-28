// WI-043 — layout-child move drag (selection-state based).
//
// When a SINGLE layout CHILD (auto-flex or auto-grid) is selected and the user
// plain-drags it (no modifier), this controller intercepts the press at the
// window capture phase — BEFORE the GestureRouter's frame-move binding — and
// repositions the dragged item. The interaction matches the paradigm:
//   • auto-grid → DROP at the cell under the cursor (weave.item.dropGridCell):
//       occupied cell → swap, EMPTY cell → move there. The empty-cell case is
//       why this is point-based: an empty cell has no element, so the frame
//       (not a sibling) is under the cursor — the cell is resolved from the
//       cursor's ratio within the frame via the layout engine.
//   • auto-flex → swap SEQUENCE order with the sibling under the cursor
//       (weave.item.swapFlexOrder).
//
// Why selection-state based: if a layout child's plain drag always moved it,
// you could no longer move the PARENT frame when its slots are full. So:
//   • FRAME selected → drag moves the frame (router frame-move; works even
//     when the layout is full, via the selected-frame redirect in FrameAccess).
//   • layout CHILD selected → drag repositions the child (this controller).
// The controller therefore arms ONLY when the press lands on the currently
// selected layout child.

import type { Editor } from "@agocraft/editor";
import type { Document as AgocraftDocument, ItemId, LayoutSpec } from "@agocraft/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { findParentAndIndex } from "../agocraft-mirror.js";
import { getLayoutEngine } from "../layout/registry.js";
import {
  designPlaneFromTarget,
  frameIdFromTarget,
} from "./use-reparent-drag-controller.js";

const SWAP_TARGET_ATTR = "data-layout-swap-target";

/** A screen-space rectangle (CSS px) for the grid drop-cell preview overlay. */
export interface DropPreviewRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface LayoutChildDragState {
  readonly active: boolean;
  readonly cursor: { readonly x: number; readonly y: number } | null;
  /** Sibling id under the cursor a FLEX child would swap order with. */
  readonly swapTargetId: string | null;
  /** Target-cell rectangle a GRID child would drop into (empty or occupied). */
  readonly dropPreview: DropPreviewRect | null;
}

const IDLE: LayoutChildDragState = {
  active: false,
  cursor: null,
  swapTargetId: null,
  dropPreview: null,
};

export interface UseLayoutChildDragControllerDeps {
  readonly editor: Editor | null;
  readonly getDocument: () => AgocraftDocument | null;
  readonly getSelectedIds: () => ReadonlySet<string>;
  readonly enabled: boolean;
}

interface DragSession {
  readonly draggedId: string;
  readonly parentId: string;
  readonly parentKind: string;
  lastHighlightedEl: Element | null;
}

/** What a drag resolves to at a given cursor position: a flex swap target to
 *  highlight, a grid cell rect to preview, and the mutation to run on drop. */
interface DropResolution {
  readonly swapTargetId: string | null;
  readonly preview: DropPreviewRect | null;
  readonly commit: ((editor: Editor) => void) | null;
}

const EMPTY_RESOLUTION: DropResolution = { swapTargetId: null, preview: null, commit: null };

function cssEscape(v: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(v);
  return v.replace(/["\\]/g, "\\$&");
}

function frameElement(frameId: string): Element | null {
  return document.querySelector(`[data-frame-id="${cssEscape(frameId)}"]`);
}

/** Cursor as a ratio (0..1) within the parent frame element's box — the space
 *  the layout engine lays cells out in. Null if the frame isn't in the DOM. */
function pointInParent(
  parentId: string,
  clientX: number,
  clientY: number,
): { readonly x: number; readonly y: number } | null {
  const el = frameElement(parentId);
  if (el === null) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height };
}

/** A valid flex swap target = a DIFFERENT child of the SAME parent under the
 *  cursor (an occupied position; flex has no empty slots to drop into). */
function siblingUnderCursor(
  session: DragSession,
  clientX: number,
  clientY: number,
  doc: AgocraftDocument | null,
): string | null {
  if (doc === null) return null;
  const cand = frameIdFromTarget(document.elementFromPoint(clientX, clientY));
  if (cand === null || cand === session.draggedId) return null;
  const found = findParentAndIndex(doc, cand);
  return found !== undefined && String(found.parent.id) === session.parentId ? cand : null;
}

// ── per-paradigm drop resolution (lookup table keeps the kind→behavior
//    dispatch declarative — Rule 6, no switch) ──────────────────────────────

function resolveGridDrop(
  session: DragSession,
  clientX: number,
  clientY: number,
  doc: AgocraftDocument | null,
): DropResolution {
  if (doc === null) return EMPTY_RESOLUTION;
  const point = pointInParent(session.parentId, clientX, clientY);
  if (point === null) return EMPTY_RESOLUTION;
  // The engine owns the geometry: point → target cell + the cell's frame.
  const hit = getLayoutEngine().resolveGridDropCell({
    root: doc.root,
    itemId: session.draggedId as ItemId,
    point,
  });
  const el = frameElement(session.parentId);
  let preview: DropPreviewRect | null = null;
  if (hit !== null && el !== null) {
    const r = el.getBoundingClientRect();
    preview = {
      left: r.left + hit.cellFrame.x * r.width,
      top: r.top + hit.cellFrame.y * r.height,
      width: hit.cellFrame.width * r.width,
      height: hit.cellFrame.height * r.height,
    };
  }
  const { x, y } = point;
  return {
    swapTargetId: null,
    preview,
    commit: (editor) =>
      editor.exec("weave.item.dropGridCell", { itemId: session.draggedId, x, y }),
  };
}

function resolveFlexDrop(
  session: DragSession,
  clientX: number,
  clientY: number,
  doc: AgocraftDocument | null,
): DropResolution {
  const targetId = siblingUnderCursor(session, clientX, clientY, doc);
  return {
    swapTargetId: targetId,
    preview: null,
    commit:
      targetId !== null
        ? (editor) =>
            editor.exec("weave.item.swapFlexOrder", { aId: session.draggedId, bId: targetId })
        : null,
  };
}

type DropResolver = (
  session: DragSession,
  clientX: number,
  clientY: number,
  doc: AgocraftDocument | null,
) => DropResolution;

const RESOLVE_BY_KIND: Readonly<Record<string, DropResolver>> = {
  "auto-grid": resolveGridDrop,
  "auto-flex": resolveFlexDrop,
};

/** The parent of `itemId` + its layout kind, when that parent supports
 *  drag-to-move (a resolver exists for its kind). Undefined otherwise. */
function draggableParent(
  doc: AgocraftDocument,
  itemId: string,
): { readonly parentId: string; readonly kind: string } | undefined {
  const found = findParentAndIndex(doc, itemId);
  if (found === undefined) return undefined;
  const layout = (found.parent.attrs as { layout?: LayoutSpec }).layout;
  if (layout === undefined || RESOLVE_BY_KIND[layout.kind] === undefined) return undefined;
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

  const sessionRef = useRef<DragSession | null>(null);

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
      const parent = draggableParent(doc, hit);
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
      setState({
        active: true,
        cursor: { x: e.clientX, y: e.clientY },
        swapTargetId: null,
        dropPreview: null,
      });
    };
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => window.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [enabled]);

  useEffect(() => {
    if (!state.active) return undefined;
    const session = sessionRef.current;
    if (session === null) return undefined;
    const resolver = RESOLVE_BY_KIND[session.parentKind] ?? null;
    const resolve = (clientX: number, clientY: number): DropResolution =>
      resolver !== null
        ? resolver(session, clientX, clientY, getDocumentRef.current())
        : EMPTY_RESOLUTION;

    const onMove = (e: PointerEvent) => {
      const r = resolve(e.clientX, e.clientY);
      // Flex highlights the swap-target sibling via a data attr; grid uses the
      // cell-rect overlay (swapTargetId stays null for grid).
      const el = r.swapTargetId !== null ? frameElement(r.swapTargetId) : null;
      if (session.lastHighlightedEl !== el) {
        session.lastHighlightedEl?.removeAttribute(SWAP_TARGET_ATTR);
        el?.setAttribute(SWAP_TARGET_ATTR, "true");
        session.lastHighlightedEl = el;
      }
      setState({
        active: true,
        cursor: { x: e.clientX, y: e.clientY },
        swapTargetId: r.swapTargetId,
        dropPreview: r.preview,
      });
    };
    const onUp = (e: PointerEvent) => {
      const r = resolve(e.clientX, e.clientY);
      if (r.commit !== null && editor !== null) r.commit(editor);
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
