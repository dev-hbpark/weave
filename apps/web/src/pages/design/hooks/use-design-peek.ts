import type { Document as AgocraftDocument } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import { useCallback, useState } from "react";
import { findItemDeep } from "../../../document/agocraft-mirror.js";
import { usePeekMode } from "../../../document/peek-mode/index.js";
import type { Design } from "../../../document/types.js";

// DR-027 / WI-071 Phase 2 — extracted from DesignPageBody (peek controller
// cluster). Behavior-preserving. Cooperating hook (DR-027 Surface E): the
// peek controller must be built BEFORE selection state exists (the orchestrator
// hit-tests lifted frames before useSelection runs), so the selection→container
// derivation cannot live here. Instead this hook owns the controller, the
// permutation-merge reorder (the only doc mutation, via editor.exec), and the
// container-id state — and RETURNS `setPeekContainerId` for the orchestrator's
// selection effect to drive. The render-coupled drag handlers stay in the
// orchestrator (they read the shared canvasHostRef / hostRect) and consume the
// returned `peek`.

export interface UseDesignPeekParams {
  readonly design: Design;
  readonly editor: Editor;
  /** Live document getter — read at gesture/commit time (mirrors docInAgocraftRef). */
  readonly getDocument: () => AgocraftDocument | null;
}

export interface UseDesignPeek {
  readonly peek: ReturnType<typeof usePeekMode>;
  /** Driven by the orchestrator's selection→container derivation effect. */
  readonly setPeekContainerId: React.Dispatch<React.SetStateAction<string | undefined>>;
}

export function useDesignPeek({ design, editor, getDocument }: UseDesignPeekParams): UseDesignPeek {
  // WI-038 Phase 2 — peek-driven reorder routes through editor.exec with the
  // active peek container id. The PeekModeController fires `onCommit(orderedAsc)`
  // with the LOCAL lift stack's new order, but `weave.design.reorderChildren`
  // validates as a full permutation of the container's children. We merge here:
  // walk the container's children, replace each lifted slot with the next id
  // from the new local order; un-lifted children keep their positions.
  const reorderChildrenInContainerViaEditor = useCallback(
    (localOrderAsc: ReadonlyArray<string>, containerId: string) => {
      const doc = getDocument();
      if (!doc) return;
      const container =
        String(doc.root.id) === containerId
          ? doc.root
          : (findItemDeep(doc, containerId) ?? doc.root);
      const currentIds = container.children.map((c) => String(c.id));
      const localSet = new Set(localOrderAsc);
      const liftedPositions: number[] = [];
      currentIds.forEach((id, i) => {
        if (localSet.has(id)) liftedPositions.push(i);
      });
      if (liftedPositions.length !== localOrderAsc.length) {
        // One of the lifted ids is no longer a child of `containerId` (stale
        // lift set after a remove). Skip silently — peek refreshes on the next
        // cursor probe.
        return;
      }
      const merged = [...currentIds];
      // liftedPositions.length === localOrderAsc.length (guarded above), so
      // localOrderAsc[i] is always defined for each lifted slot.
      liftedPositions.forEach((pos, i) => {
        const next = localOrderAsc[i];
        if (next !== undefined) merged[pos] = next;
      });
      // Guard against no-op commits (defense-in-depth; the controller already
      // filters those).
      const changed = merged.some((id, i) => id !== currentIds[i]);
      if (!changed) return;
      editor.exec("weave.design.reorderChildren", {
        order: merged,
        containerId,
      });
    },
    [editor, getDocument],
  );

  // WI-038 Phase 2 — the container peek indexes + reorders. Initial value is
  // undefined → usePeekMode falls back to root. The orchestrator recomputes it
  // from selection via `setPeekContainerId`.
  const [peekContainerId, setPeekContainerId] = useState<string | undefined>(undefined);

  const peek = usePeekMode({
    design,
    subscribeToChanges: (h) => editor.changeStream.subscribe(h),
    onReorder: reorderChildrenInContainerViaEditor,
    ...(peekContainerId !== undefined ? { containerId: peekContainerId } : {}),
  });

  // Expose peek controller for e2e diagnostics + dev tools only — never read in
  // production hot-path (use React Context for that).
  if (import.meta.env.DEV && typeof window !== "undefined") {
    (window as unknown as { __weavePeek?: typeof peek }).__weavePeek = peek;
  }

  return { peek, setPeekContainerId };
}
