// Logic owner for the workspace landing page (UI_COMPONENT_STRUCTURE.md Lens 1).
// LandingPage is the view (pure render of this hook's output); all data — the
// cloud ∪ offline-outbox merge, single-flight duplicate, delete + refresh, and
// the cross-tab storage listener — lives here so the page tests without mounting
// providers and this hook tests with `renderHook` and no DOM.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  bootstrapFromCloud,
  duplicateDesignCloud,
  fetchAllDesignsCloud,
} from "../document/cloud-sync.js";
import { listResources, type MediaResource, removeResource } from "../document/resource-storage.js";
import { clearDesign, type DesignSummary, listAllDesigns } from "../document/storage.js";
import { type IdSelection, useIdSelection } from "./use-id-selection.js";

/** Same id shape as `NewDesignWizard.makeDesignId` — local copy avoids
 *  importing into the workspace mount path. Both call sites yield
 *  `design-<base36-now>-<6-char-random>`. */
function makeDuplicateDesignId(): string {
  return `design-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Source title → copy title. Appends "(복사본)" once; if the source is
 *  itself a copy (already ends with "(복사본)" or "(복사본 N)"), bumps to
 *  "(복사본 2)", "(복사본 3)", … so successive duplicates don't pile up
 *  identical names. Display only — uniqueness is enforced by the id,
 *  not the title. */
function duplicateTitleOf(sourceTitle: string): string {
  const trimmed = sourceTitle.trim();
  const reN = /\s*\(복사본\s*(\d+)\)\s*$/;
  const matchN = trimmed.match(reN);
  if (matchN !== null) {
    const next = Number.parseInt(matchN[1] ?? "1", 10) + 1;
    return `${trimmed.replace(reN, "")} (복사본 ${next})`;
  }
  if (/\(복사본\)\s*$/.test(trimmed)) {
    return `${trimmed.replace(/\s*\(복사본\)\s*$/, "")} (복사본 2)`;
  }
  return `${trimmed} (복사본)`;
}

export interface LandingDesigns {
  readonly designs: ReadonlyArray<DesignSummary>;
  readonly resources: ReadonlyArray<MediaResource>;
  /** Id of the design currently being duplicated (single-flight), else null. */
  readonly duplicatingId: string | null;
  /** Re-pull cloud ∪ offline-outbox + resources. */
  readonly refresh: () => Promise<void>;
  /** Cloud-only duplicate (no localStorage), then refresh. Single-flight. */
  readonly duplicate: (source: DesignSummary) => Promise<void>;
  readonly deleteDesign: (id: string) => void;
  readonly deleteResource: (id: string) => void;
  /** Multi-select controller for the saved-designs grid. */
  readonly designSelection: IdSelection;
  /** Multi-select controller for the resources panel. */
  readonly resourceSelection: IdSelection;
  /** Delete every currently-selected design, then clear + refresh. */
  readonly deleteSelectedDesigns: () => void;
  /** Delete every currently-selected resource, then clear + refresh. */
  readonly deleteSelectedResources: () => void;
}

export function useLandingDesigns(): LandingDesigns {
  const [designs, setDesigns] = useState<ReadonlyArray<DesignSummary>>([]);
  const [resources, setResources] = useState<ReadonlyArray<MediaResource>>([]);
  // Tracks the design id currently being duplicated so the per-card button can
  // show a "복제 중…" state and we can disable double-click. Cleared after the
  // cloud round-trip (fetch source + POST copy + summary re-pull) resolves.
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  // Cloud is the source of truth for the design list. We paint the offline
  // outbox (`listAllDesigns` — now only unsynced offline edits) instantly, then
  // pull the cloud list and merge. Offline entries win on id collision (they're
  // the unsynced-newer copy) and surface designs that only exist offline.
  // Resources still come from LS (bootstrap mirrors them there).
  const refresh = useCallback(async () => {
    const local = listAllDesigns();
    setResources(listResources());
    setDesigns(local); // instant paint from the offline outbox
    const cloud = await fetchAllDesignsCloud();
    const byId = new Map<string, DesignSummary>();
    for (const s of cloud) {
      byId.set(s.id, {
        id: s.id,
        title: s.title,
        width: s.width,
        height: s.height,
        background: s.background,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      });
    }
    for (const s of local) byId.set(s.id, s);
    setDesigns([...byId.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)));
  }, []);

  const duplicate = useCallback(
    async (source: DesignSummary): Promise<void> => {
      if (duplicatingId !== null) return; // single-flight per workspace
      setDuplicatingId(source.id);
      try {
        const newId = makeDuplicateDesignId();
        const newTitle = duplicateTitleOf(source.title);
        const ok = await duplicateDesignCloud(source.id, newId, newTitle);
        if (ok === null) {
          if (typeof window !== "undefined") {
            window.alert("복제에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.");
          }
          return;
        }
        // Pull the fresh list (cloud ∪ offline outbox) so the new entry appears.
        await refresh();
      } finally {
        setDuplicatingId(null);
      }
    },
    [duplicatingId, refresh],
  );

  const deleteDesign = useCallback(
    (id: string): void => {
      clearDesign(id);
      void refresh();
    },
    [refresh],
  );

  const deleteResource = useCallback(
    (id: string): void => {
      removeResource(id);
      void refresh();
    },
    [refresh],
  );

  // Selection controllers — one per list, fed the present ids so a deleted
  // item drops out of the selection automatically (see use-id-selection).
  const designIds = useMemo(() => designs.map((d) => d.id), [designs]);
  const resourceIds = useMemo(() => resources.map((r) => r.id), [resources]);
  const designSelection = useIdSelection(designIds);
  const resourceSelection = useIdSelection(resourceIds);

  const { selectedIds: selectedDesignIds, clear: clearDesignSelection } = designSelection;
  const deleteSelectedDesigns = useCallback((): void => {
    const ids = [...selectedDesignIds];
    if (ids.length === 0) return;
    for (const id of ids) clearDesign(id);
    clearDesignSelection();
    void refresh();
  }, [selectedDesignIds, clearDesignSelection, refresh]);

  const { selectedIds: selectedResourceIds, clear: clearResourceSelection } = resourceSelection;
  const deleteSelectedResources = useCallback((): void => {
    const ids = [...selectedResourceIds];
    if (ids.length === 0) return;
    for (const id of ids) removeResource(id);
    clearResourceSelection();
    void refresh();
  }, [selectedResourceIds, clearResourceSelection, refresh]);

  useEffect(() => {
    let cancelled = false;
    // Paint the offline outbox instantly, then pull the cloud list and merge
    // (inside `refresh`). Bootstrap mirrors cloud RESOURCES into LS; re-refresh
    // once it lands so any cloud-only resources appear.
    void refresh();
    void bootstrapFromCloud().then(({ resources: r }) => {
      if (cancelled) return;
      if (r > 0) void refresh();
    });
    // Same-tab `localStorage.setItem` doesn't dispatch `storage`; this listener
    // only catches *cross-tab* updates (e.g. another window saves a design
    // offline). Same-tab refresh after bootstrap is above.
    const onStorage = (e: StorageEvent) => {
      if (e.key === null) return;
      if (e.key.startsWith("weave.design.v5.") || e.key.startsWith("weave.resource.v1.")) {
        void refresh();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  return {
    designs,
    resources,
    duplicatingId,
    refresh,
    duplicate,
    deleteDesign,
    deleteResource,
    designSelection,
    resourceSelection,
    deleteSelectedDesigns,
    deleteSelectedResources,
  };
}
