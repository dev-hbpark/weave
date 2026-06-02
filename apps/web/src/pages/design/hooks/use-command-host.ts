import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import { useCallback, useEffect, useMemo, useState } from "react";
import { findParentAndIndex } from "../../../document/agocraft-mirror.js";
import { useIsTextEditing } from "../../../document/clipboard/use-is-text-editing.js";
import { useIsCropping } from "../../../document/interactions/cropping-state.js";
import type { HoverContext } from "../../../document/interactions/use-hover-context.js";
import {
  dispatchEditorCommand,
  setPaletteOpener,
} from "../../../document/tooltip/editor-hotkeys.js";

// DR-027 / WI-071 Phase 1 — extracted from DesignPageBody (command-host
// cluster, WI-026/WI-027/WI-036/WI-041). Behavior-preserving: derives the
// `commandContext` consumed by CommandHostProvider + QuickActionBar, the
// `dispatchCommand` executor, and owns the command-palette open state.
// All command execution still routes through `dispatchEditorCommand` (the
// host-supplied action slots) — no doc mutation bypasses that path.

export interface UseDesignCommandHostParams {
  readonly document: AgocraftDocument;
  readonly selectedFrameId: string | undefined;
  readonly selectedIds: ReadonlySet<string>;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly hoverContext: HoverContext;
  /** `clipboardCommands.hasItems` — drives the Paste row enabled state. */
  readonly clipboardHasItems: boolean;
  readonly editor: Editor;
  /** Manual history-tick bump so canUndo/canRedo re-read after a dispatch. */
  readonly bumpHistoryTick: () => void;
}

export interface UseDesignCommandHost {
  /** Reference-stable context object; identity controls CommandButton re-renders. */
  readonly commandContext: Readonly<Record<string, unknown>>;
  readonly dispatchCommand: (id: string) => void;
  /** Multi-selection same-parent invariant — also read by MultiSelectionOverlay. */
  readonly multiSameParent: boolean;
  readonly paletteOpen: boolean;
  readonly setPaletteOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useDesignCommandHost({
  document,
  selectedFrameId,
  selectedIds,
  canUndo,
  canRedo,
  hoverContext,
  clipboardHasItems,
  editor,
  bumpHistoryTick,
}: UseDesignCommandHostParams): UseDesignCommandHost {
  // WI-074 D8b — reactive crop-active flag drives the crop-only QuickActionBar
  // commands (완료/취소) via their visibleWhen.
  const isCropping = useIsCropping();
  // WI-036 follow-up — selection-driven QuickActionBar reads `selectedKind`.
  // Multi-selection (size > 1) reports `selectedKind = "multi"` so visibleWhen
  // filters surface the `multi.*` command set instead of per-kind ones.
  const selectedKind = useMemo<string | undefined>(() => {
    if (selectedIds.size > 1) return "multi";
    if (selectedFrameId === undefined) return undefined;
    function walk(item: AgocraftItem): string | undefined {
      if (String(item.id) === selectedFrameId) return item.kind;
      for (const c of item.children) {
        const r = walk(c);
        if (r !== undefined) return r;
      }
      return undefined;
    }
    return walk(document.root);
  }, [document, selectedFrameId, selectedIds]);

  // WI-041 Phase 5 — reactive `isTextEditing` axis (DR-019 D7). Flips when
  // focus enters / leaves Lexical or any input / textarea so clipboard
  // surfaces grey out without a separate poll loop.
  const isTextEditing = useIsTextEditing();

  // Multi-selection same-parent invariant — drives enabledWhen for every
  // `multi.align-*` / `multi.distribute-*` command (v1 align is same-parent-
  // only). Straddling parents greys the buttons out instead of running a
  // wrong-coordinate-space operation.
  const multiSameParent = useMemo(() => {
    if (selectedIds.size < 2) return true;
    let firstParentId: string | undefined;
    for (const id of selectedIds) {
      const found = findParentAndIndex(document, id);
      if (found === undefined) return false;
      const pid = String(found.parent.id);
      if (firstParentId === undefined) firstParentId = pid;
      else if (pid !== firstParentId) return false;
    }
    return true;
  }, [selectedIds, document]);

  // WI-026 Phase 5 + WI-027 — host context for CommandMetadata.isEnabled AND
  // CommandMetadata.visibleWhen. Reference equality on `context` controls
  // re-renders.
  const commandContext = useMemo<Readonly<Record<string, unknown>>>(
    () => ({
      canUndo,
      canRedo,
      hasSelection: selectedIds.size > 0,
      selectionCount: selectedIds.size,
      // WI-033 A3 — selection.* hotkeys read this to enable Enter / Tab only
      // when a frame is currently selected.
      hasFrameSelection: selectedFrameId !== undefined,
      selectedFrameId,
      selectedKind,
      selectedId: selectedFrameId,
      hoveredKind: hoverContext.hoveredKind,
      hoveredId: hoverContext.hoveredId,
      hoveredRole: hoverContext.hoveredRole,
      // WI-041 — paste button + hotkey enabled state.
      clipboardHasItems,
      // WI-041 Phase 5 — reactive text-edit gate.
      isTextEditing,
      // WI-074 D8b — crop.apply / crop.cancel visibleWhen gate.
      isCropping,
      // multi.align-* / multi.distribute-* enabledWhen gate.
      multiSameParent,
    }),
    [
      canUndo,
      canRedo,
      selectedIds.size,
      selectedFrameId,
      selectedKind,
      hoverContext.hoveredKind,
      hoverContext.hoveredId,
      hoverContext.hoveredRole,
      clipboardHasItems,
      isTextEditing,
      isCropping,
      multiSameParent,
    ],
  );

  // WI-026 Phase 4 + WI-027 Phase D — dispatch is the host-supplied executor.
  // Passes the full commandContext (hover + selection) so the host slot
  // dispatcher can resolve the target from whichever paradigm the command uses.
  const dispatchCommand = useCallback(
    (id: string) => {
      dispatchEditorCommand(id, { editor }, commandContext);
      bumpHistoryTick();
    },
    [editor, bumpHistoryTick, commandContext],
  );

  // WI-026 Phase 6 — command palette state. The hotkey "palette.open" calls
  // into setPaletteOpener's registered opener (this effect wires it), so
  // opening the palette goes through the same dispatch path as a header click.
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => setPaletteOpener(() => setPaletteOpen(true)), []);

  return { commandContext, dispatchCommand, multiSameParent, paletteOpen, setPaletteOpen };
}
