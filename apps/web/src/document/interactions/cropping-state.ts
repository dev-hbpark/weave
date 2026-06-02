// WI-074 — global crop state.
//
// (Step 5) A gate so editor hotkeys / selection gestures suspend while a crop is
// open. (D8 P2) ALSO holds the in-progress crop draft, so the SAME draft is shared
// by three surfaces: ImageBlock's CropEditor render, the SelectionLayer crop
// handles (NestedFrame), and the FrameStage handle dispatcher's crop sink. A tiny
// subscribable store (snap-feedback / vertex-selection pattern):
//   • imperative reads (`isCroppingNow`, `cropActiveId`, `getCropDraft`) for the
//     dispatcher / hotkey gate,
//   • React reads (`useIsCropping`, `useCroppingItemId`, `useCropDraft`) for UI.
// Single active crop at a time.

import { useSyncExternalStore } from "react";

export interface CropDraft {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly rotation: number;
  /** WI-074 D12 — image-offset (frame-box fractions) for panning within the
   *  rotation cover-zoom magnification. 0 when not rotated. */
  readonly ox: number;
  readonly oy: number;
}

let activeId: string | null = null;
let draft: CropDraft | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export const croppingState = {
  enter: (id: string, initial: CropDraft): void => {
    if (activeId !== id || draft !== initial) {
      activeId = id;
      draft = initial;
      emit();
    }
  },
  exit: (id: string): void => {
    if (activeId === id) {
      activeId = null;
      draft = null;
      emit();
    }
  },
  setDraft: (next: CropDraft): void => {
    if (activeId === null) return;
    draft = next;
    emit();
  },
  getDraft: (): CropDraft | null => draft,
  activeId: (): string | null => activeId,
  isActive: (): boolean => activeId !== null,
  subscribe: (l: () => void): (() => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

/** Synchronous read for imperative gates (editor hotkeys, window keydown). */
export function isCroppingNow(): boolean {
  return activeId !== null;
}

/** React-reactive: is ANY crop active. */
export function useIsCropping(): boolean {
  return useSyncExternalStore(croppingState.subscribe, croppingState.isActive, () => false);
}

/** React-reactive: the id of the item being cropped (or null). */
export function useCroppingItemId(): string | null {
  return useSyncExternalStore(croppingState.subscribe, croppingState.activeId, () => null);
}

/** React-reactive: the live crop draft (or null). */
export function useCropDraft(): CropDraft | null {
  return useSyncExternalStore(croppingState.subscribe, croppingState.getDraft, () => null);
}
