import type { Document as AgocraftDocument } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import { createPortal } from "react-dom";
import { findItemDeep } from "../../../document/agocraft-mirror.js";
import {
  useSelectionChromeInteractive,
  useSelectionChromeVisible,
} from "../../../document/interactions/interaction-mode.js";
import { ContextualToolbar } from "../../../document/toolbar/ContextualToolbar.js";
import { SelectionBreadcrumbBar } from "./SelectionBreadcrumbBar.js";

// DR-027 / WI-071 Phase 2 — selection-driven contextual toolbar overlay
// extracted from the canvas. Self-gates via useSelectionChromeVisible (must
// render inside the InteractionMode + PeekActive providers, same as the inline
// SelectionChromeGate it replaces). Portal'd to document.body so it shares the
// header's z-tier above the body-portal'd selection chrome. The selectedItems
// derivation walks the full tree (findItemDeep) so nested items surface.
//
// WI-214 / DR-137 — also hosts the selection breadcrumb as the top row of a
// centered vertical stack (breadcrumb over the property toolbar). Co-locating
// here keeps both bars under one portal, one visible/interactive gate, and one
// pointer-events policy — and centered placement keeps the breadcrumb out of
// the roaming Aku launcher's top-corner path (a separate left-aligned bar
// would collide with it).

export interface SelectionToolbarOverlayProps {
  readonly editor: Editor;
  readonly document: AgocraftDocument;
  readonly selectedIds: ReadonlySet<string>;
  /** Single selected frame id (or null when 0 / many selected) — drives the
   *  breadcrumb (DR-137 §2). */
  readonly selectedId: string | null;
  /** Select an ancestor frame from a breadcrumb segment click. */
  readonly onSelectFrame: (id: string) => void;
  readonly onEditMediaSrc: (kind: "image" | "video") => void;
  readonly onEditShapeFill: (kind: "image" | "video", current: string) => void;
}

export function SelectionToolbarOverlay({
  editor,
  document: doc,
  selectedIds,
  selectedId,
  onSelectFrame,
  onEditMediaSrc,
  onEditShapeFill,
}: SelectionToolbarOverlayProps): React.ReactNode {
  const visible = useSelectionChromeVisible();
  const interactive = useSelectionChromeInteractive();
  if (!visible) return null;
  if (typeof document === "undefined") return null;

  const selectedItems: Array<{
    id: string;
    kind: string;
    attrs: Readonly<Record<string, unknown>>;
  }> = [];
  for (const id of selectedIds) {
    const it = findItemDeep(doc, id);
    if (it === undefined) continue;
    selectedItems.push({ id: String(it.id), kind: it.kind, attrs: it.attrs });
  }

  return createPortal(
    <div
      style={{
        // Portal'd to document.body — the outer `fixed inset-0` wrapper traps
        // z-index below the body-portal'd SelectionLayer (40) / Marquee (42) /
        // RubberBand (45); hoisting lets the toolbar share the header's z-tier.
        position: "fixed",
        // 48 (h-12 header) + 12 gap = 60 from top.
        top: 60,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 46,
        // Centered vertical stack: breadcrumb (DR-137) over the property bar.
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        // WI-200 — inert while a manipulation gesture is in flight. The bar
        // mounts MID-DRAG (commitFrame's first-commit selection) and, with
        // pointer events on, becomes the pointermove target whenever the drag
        // path crosses it — starving the canvas router's move binding (no
        // pointer capture in the gesture transport). See
        // useSelectionChromeInteractive.
        pointerEvents: interactive ? "auto" : "none",
      }}
    >
      <SelectionBreadcrumbBar document={doc} selectedId={selectedId} onSelect={onSelectFrame} />
      <ContextualToolbar
        editor={editor}
        document={doc}
        selectedItems={selectedItems}
        onEditMediaSrc={onEditMediaSrc}
        onEditShapeFill={onEditShapeFill}
      />
    </div>,
    document.body,
  );
}
