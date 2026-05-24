// InteractionMode — DR-017 vm shim.
//
// Previously: an `InteractionModeContext` with its own
// `useState<InteractionMode>`. Today the vm's `mode` Signal is the single
// source of truth (driven by `vm.requestMode` / `vm.releaseMode`
// claims). This file preserves the legacy hook API so existing call
// sites compile unchanged.
//
// The vm's mode coordination is *exclusive* — `requestMode("X")` is the
// only way to enter a non-idle mode, and it refuses to flip when
// another mode owns the canvas. This shim's `transitionFrom` /
// `restoreIdleFrom` wraps that contract:
//
//   - `transitionFrom("idle", "rubber-band")` → calls `requestMode` and
//     remembers the returned token internally so a later
//     `restoreIdleFrom("rubber-band")` can release symmetrically.
//
// The shim keeps per-mode token bookkeeping in a module-level Map keyed
// by the mode name. Today most callers re-enter the same mode without a
// matching release (e.g., a context menu opens, then the user clicks
// outside which causes Radix to close — the close path isn't always a
// `restoreIdleFrom`). We tolerate this by overwriting the prior token
// for the same mode and treating the latest one as canonical.

import { useEditorVM } from "@agocraft/editor/react";
import type { ClaimToken, EditorViewModel } from "@agocraft/editor";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type InteractionMode =
  | "idle"
  | "hand"
  | "panning"
  | "rubber-band"
  | "frame-manipulating"
  | "context-menu"
  | "text-editing";

interface InteractionModeContextValue {
  readonly mode: InteractionMode;
  readonly setMode: (next: InteractionMode) => void;
  readonly transitionFrom: (
    expected: InteractionMode | ReadonlyArray<InteractionMode>,
    next: InteractionMode,
  ) => boolean;
  readonly restoreIdleFrom: (
    expected: InteractionMode | ReadonlyArray<InteractionMode>,
  ) => boolean;
}

const tokensByMode = new Map<InteractionMode, ClaimToken>();

const InteractionVmContext = createContext<EditorViewModel | undefined>(undefined);

export function InteractionModeProvider({
  children,
  vm,
}: {
  readonly children: ReactNode;
  readonly vm?: EditorViewModel | undefined;
}) {
  return <InteractionVmContext.Provider value={vm}>{children}</InteractionVmContext.Provider>;
}

export function useInteractionMode(): InteractionModeContextValue {
  const vm = useContext(InteractionVmContext);
  const stableNoOpVm = useStableNoOpVm();
  const activeVm = vm ?? stableNoOpVm;

  const mode = useEditorVM<InteractionMode>(
    activeVm,
    (v) => v.mode.get() as InteractionMode,
  );

  const setMode = useCallback(
    (next: InteractionMode) => {
      if (vm === undefined) return;
      // Direct set bypasses the claim machinery — used only as an escape
      // hatch by legacy callers; new code should go through
      // requestMode/releaseMode.
      vm.mode.set(next);
      if (next === "idle") tokensByMode.clear();
    },
    [vm],
  );

  const matches = useCallback(
    (
      expected: InteractionMode | ReadonlyArray<InteractionMode>,
    ): boolean => {
      const cur = vm?.mode.get() as InteractionMode | undefined;
      if (cur === undefined) return false;
      return Array.isArray(expected) ? expected.includes(cur) : cur === expected;
    },
    [vm],
  );

  const transitionFrom = useCallback(
    (
      expected: InteractionMode | ReadonlyArray<InteractionMode>,
      next: InteractionMode,
    ): boolean => {
      if (vm === undefined) return false;
      if (!matches(expected)) return false;
      const token = vm.requestMode(next);
      if (token === null) return false;
      tokensByMode.set(next, token);
      return true;
    },
    [vm, matches],
  );

  const restoreIdleFrom = useCallback(
    (
      expected: InteractionMode | ReadonlyArray<InteractionMode>,
    ): boolean => {
      if (vm === undefined) return false;
      if (!matches(expected)) return false;
      const list = Array.isArray(expected) ? expected : [expected];
      for (const m of list) {
        const token = tokensByMode.get(m);
        if (token !== undefined) {
          vm.releaseMode(token);
          tokensByMode.delete(m);
        }
      }
      // Defensive — if no token was tracked for the current mode, snap
      // to idle directly (legacy callers that called `setMode("idle")`
      // skipped the bookkeeping).
      if (vm.mode.get() !== "idle") vm.mode.set("idle");
      return true;
    },
    [vm, matches],
  );

  return useMemo(
    () => ({ mode, setMode, transitionFrom, restoreIdleFrom }),
    [mode, setMode, transitionFrom, restoreIdleFrom],
  );
}

export function useTooltipsAllowed(): boolean {
  const { mode } = useInteractionMode();
  return mode === "idle" || mode === "hand";
}

export function useRubberBandAllowed(): boolean {
  const { mode } = useInteractionMode();
  return mode === "idle";
}

export function useFrameSelectionAllowed(): boolean {
  const { mode } = useInteractionMode();
  return mode === "idle" || mode === "hand";
}

function useStableNoOpVm(): EditorViewModel {
  const [vm] = useState(() => {
    return {
      mode: { get: () => "idle", set: () => {}, update: () => {}, subscribe: () => () => {} },
      requestMode: () => null,
      releaseMode: () => {},
    } as unknown as EditorViewModel;
  });
  useEffect(() => undefined, []);
  return vm;
}
