// Reusable id-selection controller for the workspace landing lists
// (UI_COMPONENT_STRUCTURE.md Lens 1 — logic owner, no DOM).
//
// Both the "저장된 디자인" grid and the "리소스" panel need the same
// multi-select behaviour (toggle one, select-all / clear-all, bulk delete),
// so the selection state machine lives here once and is instantiated per list
// in `useLandingDesigns`. Composition over duplication.
//
// The raw selected set may transiently hold ids that have since left the list
// (e.g. another tab deleted a design). `selectedIds` is always derived as the
// intersection with the currently-present ids, so stale ids never leak into a
// count, a select-all check, or a bulk delete.

import { useCallback, useMemo, useState } from "react";

export interface IdSelection {
  /** Currently-selected ids that still exist in the present list. */
  readonly selectedIds: ReadonlySet<string>;
  readonly selectedCount: number;
  readonly isSelected: (id: string) => boolean;
  /** True when there is ≥1 present id and every one of them is selected. */
  readonly allSelected: boolean;
  /** True when some — but not all — present ids are selected. */
  readonly someSelected: boolean;
  readonly toggle: (id: string) => void;
  /** Select every present id, or clear them all when already all-selected. */
  readonly toggleAll: () => void;
  readonly clear: () => void;
}

export function useIdSelection(presentIds: ReadonlyArray<string>): IdSelection {
  const [raw, setRaw] = useState<ReadonlySet<string>>(() => new Set<string>());

  const present = useMemo(() => new Set(presentIds), [presentIds]);

  const selectedIds = useMemo(() => {
    const out = new Set<string>();
    for (const id of raw) if (present.has(id)) out.add(id);
    return out;
  }, [raw, present]);

  const selectedCount = selectedIds.size;
  const allSelected = present.size > 0 && selectedCount === present.size;
  const someSelected = selectedCount > 0 && !allSelected;

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const toggle = useCallback((id: string) => {
    setRaw((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setRaw((prev) => {
      // Are all present ids already selected? Then this is a clear-all.
      let everyPresentSelected = present.size > 0;
      for (const id of present) {
        if (!prev.has(id)) {
          everyPresentSelected = false;
          break;
        }
      }
      const next = new Set(prev);
      if (everyPresentSelected) {
        for (const id of present) next.delete(id);
      } else {
        for (const id of present) next.add(id);
      }
      return next;
    });
  }, [present]);

  const clear = useCallback(() => setRaw(new Set<string>()), []);

  return {
    selectedIds,
    selectedCount,
    isSelected,
    allSelected,
    someSelected,
    toggle,
    toggleAll,
    clear,
  };
}
