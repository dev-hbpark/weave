import { useCallback, useEffect, useRef, useState } from "react";
import type { NavigateFunction } from "react-router-dom";

// DR-027 / WI-071 Phase 1 — extracted from DesignPageBody (save cluster).
// Behavior-preserving: the manual-save 4-state machine + offline-conflict
// reconcile prompt. All mutation still flows through the injected
// `useDesign` callbacks (persistNowAwaitable / resolveLocalConflict) — this
// hook owns only the View-facing status state + the flash timer lifecycle.

// DR-design-017 — manual cloud save 4-state machine:
//   idle    → IconCloudUpload (default)
//   saving  → Spinner          (round-trip in flight)
//   saved   → IconCloudCheck   (success flash, 1500ms then idle)
//   failed  → IconCloudOff     (cloud round-trip failed, 4000ms then idle)
// Failure flash is longer than success because the user needs more time to
// register that the save did NOT land — and the button remains clickable in
// the `failed` state so the user can retry.
export type SaveStatus = "idle" | "saving" | "saved" | "failed";

export interface UseDesignSaveParams {
  /** `useDesign.persistNowAwaitable` — force-now cloud save, resolves ok flag. */
  readonly persistNowAwaitable: () => Promise<boolean>;
  /** `useDesign.resolveLocalConflict` — reconcile an unsynced offline copy. */
  readonly resolveLocalConflict: (
    choice: "save" | "discard",
  ) => Promise<{ ok: boolean; newDesignId?: string }>;
  /** react-router navigate — used to open the offline edit saved as a new design. */
  readonly navigate: NavigateFunction;
}

export interface UseDesignSave {
  readonly saveStatus: SaveStatus;
  readonly handleManualSave: () => Promise<void>;
  readonly conflictBusy: boolean;
  readonly handleConflictSave: () => Promise<void>;
  readonly handleConflictDiscard: () => Promise<void>;
}

export function useDesignSave({
  persistNowAwaitable,
  resolveLocalConflict,
  navigate,
}: UseDesignSaveParams): UseDesignSave {
  // DR-design-017 — manual cloud save. The ChangeStream debounced sink in
  // useWeaveEditor already mirrors every patch to the cloud via `persistNow`,
  // so this is a *force-now* affordance: the user wants to commit a
  // session-final state immediately (e.g. before closing the tab on a slow
  // network where the debounce window hasn't elapsed).
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveFlashTimerRef = useRef<number | null>(null);
  const handleManualSave = useCallback(async () => {
    if (saveFlashTimerRef.current !== null) {
      window.clearTimeout(saveFlashTimerRef.current);
      saveFlashTimerRef.current = null;
    }
    setSaveStatus("saving");
    const ok = await persistNowAwaitable();
    setSaveStatus(ok ? "saved" : "failed");
    const flashMs = ok ? 1500 : 4000;
    saveFlashTimerRef.current = window.setTimeout(() => {
      setSaveStatus("idle");
      saveFlashTimerRef.current = null;
    }, flashMs);
  }, [persistNowAwaitable]);
  useEffect(() => {
    return () => {
      if (saveFlashTimerRef.current !== null) {
        window.clearTimeout(saveFlashTimerRef.current);
      }
    };
  }, []);

  // Offline-edit reconcile prompt. `useDesign.localConflict` flips true when
  // the opened design has an unsynced offline copy in localStorage.
  const [conflictBusy, setConflictBusy] = useState(false);
  const handleConflictSave = useCallback(async () => {
    setConflictBusy(true);
    const { ok, newDesignId } = await resolveLocalConflict("save");
    setConflictBusy(false);
    if (ok && newDesignId !== undefined) {
      // The offline edit was saved as a new design — open it so the user
      // continues on the copy they just preserved.
      navigate(`/design/${newDesignId}`);
      return;
    }
    if (typeof window !== "undefined") {
      window.alert(
        "서버에 저장하지 못했습니다. 변경사항은 로컬에 보관되며 다음에 다시 저장을 시도할 수 있습니다.",
      );
    }
  }, [resolveLocalConflict, navigate]);
  const handleConflictDiscard = useCallback(async () => {
    setConflictBusy(true);
    await resolveLocalConflict("discard");
    setConflictBusy(false);
  }, [resolveLocalConflict]);

  return {
    saveStatus,
    handleManualSave,
    conflictBusy,
    handleConflictSave,
    handleConflictDiscard,
  };
}
