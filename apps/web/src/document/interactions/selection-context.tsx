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
import type { EditorViewModel } from "@agocraft/editor";
import type { Document as AgocraftDocument } from "@agocraft/core";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { findItemDeep, findTrailDeep } from "../agocraft-mirror.js";

export type Selection =
  | { readonly kind: "frame"; readonly id: string }
  | {
      readonly kind: "shape";
      readonly frameId: string;
      readonly shapeId: string;
    };

/** Intent of a frame click — surfaces the user's modifier keys to the
 *  selection state machine. Figma's selection model: plain clicks walk
 *  one level deeper through nested frames (parent-first), Cmd/Ctrl
 *  bypasses depth entirely (deep), and Shift toggles multi-frame.
 *
 *  Closed list, frozen by the Figma model. Single dispatch site inside
 *  `selectFromHit` — kept file-internal so future modes go through the
 *  helper's signature, not a registry. */
export type ClickIntent = "plain" | "deep" | "toggle";

/** WI-033 A1 + A2 — pure resolver from a frame click hit to the next
 *  selection state. Caller is responsible for applying the result via
 *  `selectionContext.selectFrame(result.id)` (or equivalent vm setter
 *  for multi-frame toggle paths).
 *
 *  Algorithm (FIGMA_SELECTION_MODEL_SPEC §2.1):
 *  - `intent: "deep"` (Cmd/Ctrl-click) — return the leaf hit, depth-blind.
 *  - `intent: "toggle"` (Shift-click) — caller routes to multi-frame
 *    toggleFrames; this helper still returns the hit as the
 *    representative leaf so single-selection consumers stay coherent.
 *  - `intent: "plain"` — "already-in-context" heuristic. If the current
 *    selection is anywhere on the trail down to the hit, the user is
 *    drilling deeper within the same context → return the leaf hit. If
 *    the current selection is in a different branch, only walk one
 *    level in from the root → return the top-level frame on the trail.
 *
 *  Pure: no React, no vm, no DOM. Doc + current + hit + intent in,
 *  Selection|null out. Testable in isolation. */
export function selectFromHit(
  hitId: string,
  intent: ClickIntent,
  doc: AgocraftDocument,
  current: Selection | null,
): { readonly kind: "frame"; readonly id: string } | null {
  if (intent === "deep" || intent === "toggle") {
    return { kind: "frame", id: hitId };
  }
  const trail = findTrailDeep(doc, hitId);
  if (trail === undefined || trail.length === 0) {
    // hitId is the root itself or not in the doc — nothing to select.
    return null;
  }
  const currentId = current?.kind === "frame" ? current.id : undefined;
  const inCurrentContext =
    currentId !== undefined && trail.some((item) => String(item.id) === currentId);
  if (inCurrentContext) {
    // Same context — let the click drill all the way to the leaf hit.
    return { kind: "frame", id: hitId };
  }
  // Different context — A1 parent-first: walk one level in from the root.
  const topLevel = trail[0];
  return topLevel === undefined ? null : { kind: "frame", id: String(topLevel.id) };
}

/** WI-033 A3 — keyboard navigation helpers (`Enter`, `Shift+Enter`, `Tab`,
 *  `Shift+Tab`). Pure functions; caller routes the result to
 *  `selectionContext.selectFrame(...)`. Return `undefined` when navigation
 *  is a no-op (leaf has no children; root has no parent). Sibling
 *  navigation wraps around — last → first → last per Figma. */

export function firstChildOf(
  fromId: string,
  doc: AgocraftDocument,
): string | undefined {
  const item = findItemDeep(doc, fromId);
  if (item === undefined) return undefined;
  const first = item.children[0];
  return first === undefined ? undefined : String(first.id);
}

export function parentOf(
  fromId: string,
  doc: AgocraftDocument,
): string | undefined {
  const trail = findTrailDeep(doc, fromId);
  if (trail === undefined || trail.length === 0) return undefined;
  // trail is [topLevel, ..., fromId]. Parent of the last element is the
  // second-to-last, or the root (excluded from trail) when fromId is itself
  // a top-level frame. Top-level frames have no selectable parent — return
  // undefined so Shift+Enter is a no-op at the top.
  if (trail.length === 1) return undefined;
  const parent = trail[trail.length - 2];
  return parent === undefined ? undefined : String(parent.id);
}

function siblingsOf(
  fromId: string,
  doc: AgocraftDocument,
): { readonly siblings: ReadonlyArray<{ readonly id: string }>; readonly index: number } | undefined {
  const trail = findTrailDeep(doc, fromId);
  if (trail === undefined || trail.length === 0) return undefined;
  // Parent's children: if trail.length === 1, the frame is a top-level
  // and its siblings are root.children.
  const parent = trail.length === 1 ? doc.root : trail[trail.length - 2];
  if (parent === undefined) return undefined;
  const siblings = parent.children.map((c) => ({ id: String(c.id) }));
  const index = siblings.findIndex((s) => s.id === fromId);
  if (index === -1) return undefined;
  return { siblings, index };
}

export function nextSiblingOf(
  fromId: string,
  doc: AgocraftDocument,
): string | undefined {
  const found = siblingsOf(fromId, doc);
  if (found === undefined) return undefined;
  const { siblings, index } = found;
  if (siblings.length === 0) return undefined;
  const next = siblings[(index + 1) % siblings.length];
  return next?.id;
}

export function prevSiblingOf(
  fromId: string,
  doc: AgocraftDocument,
): string | undefined {
  const found = siblingsOf(fromId, doc);
  if (found === undefined) return undefined;
  const { siblings, index } = found;
  if (siblings.length === 0) return undefined;
  const prev = siblings[(index - 1 + siblings.length) % siblings.length];
  return prev?.id;
}

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

// Exported for WI-033 — NestedFrame onClick needs to query the vm's
// current selection synchronously (rather than reading the React-state
// `selectedId` prop, which may be stale within the same event batch
// when FrameMoveBinding's capture-phase `vm.itemSelection.set(...)`
// already mutated it). The vm signal's `state.get()` always returns
// the latest value regardless of React commit timing.
export const SelectionVmContext = createContext<EditorViewModel | undefined>(undefined);

/** Provider — wires the editor vm into the context so `useSelection()` can
 *  read selection state without touching `window`. PresentPage and other
 *  read-only consumers may omit `vm`; the hook then falls back to a no-op. */
export function SelectionProvider({
  children,
  vm,
}: {
  readonly children: ReactNode;
  readonly vm?: EditorViewModel | undefined;
}) {
  return <SelectionVmContext.Provider value={vm}>{children}</SelectionVmContext.Provider>;
}

/** Read the vm's selection slots. Outside an editor session (e.g.,
 *  read-only PresentPage with no vm wired) we return a no-op shape so
 *  callers don't have to branch.
 *
 *  `explicitVm` is for callers that hold the vm directly but are rendered
 *  *outside* the SelectionProvider — e.g. the DesignPageBody function
 *  body, whose own JSX defines the Provider it can't yet read. Pass the
 *  vm explicitly there. Children rendered inside the Provider's JSX
 *  should call `useSelection()` with no arg and pick up the context. */
export function useSelection(explicitVm?: EditorViewModel): SelectionContextValue {
  const ctxVm = useContext(SelectionVmContext);
  const vm = explicitVm ?? ctxVm;
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
