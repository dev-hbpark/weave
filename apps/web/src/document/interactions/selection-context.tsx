// Selection — DR-017 vm shim.
//
// Previously: a SelectionContext with its own `useState<Selection|null>`,
// duplicated across multiple Providers and components. Pre-DR-017 weave
// owned the full state machine here; today the vm
// (`@agocraft/editor` → `EditorViewModel.itemSelection` + `subSelection`)
// is the single source of truth, and this file is a thin shim that
// preserves the `useSelection()` / `<SelectionProvider>` API surface so
// existing call sites compile unchanged.
//
// Storage:
//   - "frame" selection → vm.itemSelection (Selection store, single mode).
//   - "shape" selection → vm.subSelection slot, kind: "canvas-shape".
//
// API parity: a shape selection in this shim drops any prior frame
// selection (single-selection-at-once invariant); selecting a frame
// drops any subSelection. Matches the pre-DR-017 semantics exactly so
// no consumer needs to change.

import { useEditorVM } from "@agocraft/editor/react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

export type Selection =
  | { readonly kind: "frame"; readonly id: string }
  | {
      readonly kind: "shape";
      readonly frameId: string;
      readonly shapeId: string;
    };

interface SelectionContextValue {
  readonly selection: Selection | null;
  /** Multi-frame selection (Figma marquee parity). Always a set —
   *  empty when nothing is selected, one element for single mode.
   *  Single-frame paths read from `selection` for back-compat. */
  readonly selectedIds: ReadonlySet<string>;
  readonly selectFrame: (id: string | null) => void;
  readonly selectShape: (frameId: string, shapeId: string | null) => void;
  /** Replace the frame selection with this set of ids. Empty = clear. */
  readonly selectFrames: (ids: Iterable<string>) => void;
  /** Add ids to the frame selection (union). */
  readonly addFrames: (ids: Iterable<string>) => void;
  /** Toggle each id in the frame selection. */
  readonly toggleFrames: (ids: Iterable<string>) => void;
  readonly clear: () => void;
}

/** Provider — preserves the old surface, no-op underneath since the vm
 *  is the actual store. Kept so existing JSX trees that wrap with
 *  `<SelectionProvider>` keep compiling. */
export function SelectionProvider({ children }: { readonly children: ReactNode }) {
  return <>{children}</>;
}

/** Read the vm's selection slots. Outside an editor session (e.g.,
 *  read-only PresentPage with no vm wired) we return a no-op shape so
 *  callers don't have to branch. */
export function useSelection(): SelectionContextValue {
  const vm = (typeof window !== "undefined"
    ? (window as unknown as { __weaveVm?: import("@agocraft/editor").EditorViewModel }).__weaveVm
    : undefined);
  // Always call the hook (with a fallback no-op vm) to satisfy rules of
  // hooks even when the editor session isn't mounted yet.
  const stableNoOpVm = useStableNoOpVm();
  const activeVm = vm ?? stableNoOpVm;

  const selection = useEditorVM<Selection | null>(
    activeVm,
    (v) => {
      // Prefer the most-recent selection. Item-level selection wins when
      // present so that the FrameMoveBinding's `vm.itemSelection.set(...)`
      // is reflected even if a stale subSelection lingers from a prior
      // shape pick (the binding only sets itemSelection, doesn't clear
      // subSelection). When itemSelection is "none", fall through to
      // subSelection.
      //
      // Multi-selection: `selection.kind` stays "frame" with the FIRST
      // id (so single-select consumers keep working); use `selectedIds`
      // below to read the full set.
      const s = v.itemSelection.state.get();
      if (s.kind === "single") return { kind: "frame", id: String(s.itemId) };
      if (s.kind === "multi") {
        const first = s.items.values().next().value;
        if (first !== undefined) return { kind: "frame", id: String(first) };
      }
      const sub = v.subSelection.get();
      if (sub !== null && sub.kind === "canvas-shape") {
        return { kind: "shape", frameId: String(sub.frameId), shapeId: sub.shapeId };
      }
      return null;
    },
  );

  const selectedIds = useEditorVM<ReadonlySet<string>>(activeVm, (v) => {
    const s = v.itemSelection.state.get();
    if (s.kind === "single") return new Set([String(s.itemId)]);
    if (s.kind === "multi") {
      const out = new Set<string>();
      for (const id of s.items) out.add(String(id));
      return out;
    }
    return new Set<string>();
  });

  const selectFrame = useCallback(
    (id: string | null) => {
      if (vm === undefined) return;
      vm.subSelection.set(null);
      if (id === null) vm.itemSelection.clear();
      else vm.itemSelection.set(id as never);
    },
    [vm],
  );

  const selectShape = useCallback(
    (frameId: string, shapeId: string | null) => {
      if (vm === undefined) return;
      if (shapeId === null) {
        const cur = vm.subSelection.get();
        if (
          cur !== null &&
          cur.kind === "canvas-shape" &&
          String(cur.frameId) === frameId
        ) {
          vm.subSelection.set(null);
        }
        return;
      }
      // Single-selection invariant: a shape selection drops any prior
      // frame selection.
      vm.itemSelection.clear();
      vm.subSelection.set({
        kind: "canvas-shape",
        frameId: frameId as never,
        shapeId,
      });
    },
    [vm],
  );

  const clear = useCallback(() => {
    if (vm === undefined) return;
    vm.itemSelection.clear();
    vm.subSelection.set(null);
  }, [vm]);

  const selectFrames = useCallback(
    (ids: Iterable<string>) => {
      if (vm === undefined) return;
      vm.subSelection.set(null);
      vm.itemSelection.setMany(ids as unknown as Iterable<never>);
    },
    [vm],
  );

  const addFrames = useCallback(
    (ids: Iterable<string>) => {
      if (vm === undefined) return;
      vm.subSelection.set(null);
      for (const id of ids) vm.itemSelection.add(id as never);
    },
    [vm],
  );

  const toggleFrames = useCallback(
    (ids: Iterable<string>) => {
      if (vm === undefined) return;
      vm.subSelection.set(null);
      for (const id of ids) vm.itemSelection.toggle(id as never);
    },
    [vm],
  );

  return useMemo(
    () => ({
      selection,
      selectedIds,
      selectFrame,
      selectShape,
      selectFrames,
      addFrames,
      toggleFrames,
      clear,
    }),
    [
      selection,
      selectedIds,
      selectFrame,
      selectShape,
      selectFrames,
      addFrames,
      toggleFrames,
      clear,
    ],
  );
}

// Internal — a stable no-op vm used when no real one is bound (PresentPage
// read-only path, tests). Lets the `useEditorVM` call remain at the top
// of `useSelection` regardless of session presence.
function useStableNoOpVm(): import("@agocraft/editor").EditorViewModel {
  const [vm] = useState(() => {
    // Lazily construct an empty vm-shaped object. We never read its
    // signals when `__weaveVm` is undefined — this is just to satisfy
    // the hook's contract. The activeVm switch above will favor the
    // real one once it lands.
    return {
      subSelection: { get: () => null, set: () => {}, update: () => {}, subscribe: () => () => {} },
      itemSelection: { state: { get: () => ({ kind: "none" }), subscribe: () => () => {} } },
    } as unknown as import("@agocraft/editor").EditorViewModel;
  });
  // Sanity: linter happy
  useEffect(() => undefined, []);
  return vm;
}
