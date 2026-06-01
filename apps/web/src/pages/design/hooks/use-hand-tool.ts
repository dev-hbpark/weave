import type { EditorViewModel } from "@agocraft/editor";
import { useEditorVM } from "@agocraft/editor/react";
import { useCallback, useEffect } from "react";

// DR-027 / WI-071 Phase 1 — extracted from DesignPageBody (hand/select tool
// toggle). Behavior-preserving: the V/H tool mode lives on vm.handTool (single
// source the FrameStage pan binding consults), and the V/H hotkeys bind only
// when the infinite-canvas flavor is active. Other hotkey registrations
// (selection navigator, item adder, Cmd+S bridge, editor hotkeys) stay in the
// orchestrator until their owning clusters are extracted — they interleave
// with not-yet-moved state.

export interface UseHandToolParams {
  readonly vm: EditorViewModel;
  /** Mixed / infinite-canvas flavor — V/H hotkeys only bind when true. */
  readonly infiniteCanvas: boolean;
}

export interface UseHandTool {
  /** True when the hand (pan) tool is active. Stored on vm.handTool. */
  readonly handMode: boolean;
  readonly setHandMode: (next: boolean) => void;
}

export function useHandTool({ vm, infiniteCanvas }: UseHandToolParams): UseHandTool {
  // V / H tool toggle (Figma parity). Stored on vm.handTool so the FrameStage
  // pan binding consults a single flag.
  const handMode = useEditorVM(vm, (v) => v.handTool.get());
  const setHandMode = useCallback(
    (next: boolean) => {
      vm.handTool.set(next);
    },
    [vm],
  );

  // V / H hotkeys for select / hand modes (Figma parity).
  useEffect(() => {
    if (!infiniteCanvas) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && t.matches('input, textarea, [contenteditable="true"]')) {
        return;
      }
      if (e.key === "v" || e.key === "V") setHandMode(false);
      else if (e.key === "h" || e.key === "H") setHandMode(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [infiniteCanvas, setHandMode]);

  return { handMode, setHandMode };
}
