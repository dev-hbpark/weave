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

import type { ClaimToken, EditorViewModel } from "@agocraft/editor";
import { useEditorVM } from "@agocraft/editor/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { InputPolicy, InteractionGateKey, InteractionMode } from "../editor-mode/types.js";

// WI-166 P4 — the mode union moved to editor-mode/types.ts (it is the
// InputPolicy's gate vocabulary, the way ClickIntent is HitPolicy's).
// Re-exported so the legacy call sites keep compiling unchanged.
export type { InteractionMode } from "../editor-mode/types.js";

/** WI-040 — Peek ("Layers") inspector active state. Tracked as a
 *  separate axis from `InteractionMode` because the vendor's
 *  InteractionMode is a closed union and peek is a weave-only product
 *  surface (not in agocraft's contract). Gate hooks read both axes;
 *  treat `peekActive === true` as a hard owner of the canvas — frame
 *  chrome, rubber-band, hover affordance, and frame drag bindings all
 *  stand down. */
const PeekActiveContext = createContext<boolean>(false);

export function PeekActiveProvider({
  active,
  children,
}: {
  readonly active: boolean;
  readonly children: ReactNode;
}) {
  return <PeekActiveContext.Provider value={active}>{children}</PeekActiveContext.Provider>;
}

export function usePeekActive(): boolean {
  return useContext(PeekActiveContext);
}

interface InteractionModeContextValue {
  readonly mode: InteractionMode;
  readonly setMode: (next: InteractionMode) => void;
  readonly transitionFrom: (
    expected: InteractionMode | ReadonlyArray<InteractionMode>,
    next: InteractionMode,
  ) => boolean;
  readonly restoreIdleFrom: (expected: InteractionMode | ReadonlyArray<InteractionMode>) => boolean;
}

const tokensByMode = new Map<InteractionMode, ClaimToken>();

const InteractionVmContext = createContext<EditorViewModel | undefined>(undefined);

/** WI-166 P4 — the injected InputPolicy (DR-114 §2b manual injection: the
 *  composition root passes `editorMode.input` as a REQUIRED provider prop;
 *  the gate hooks below are the policy's only readers). `undefined` =
 *  rendered without the provider — there the vm is absent too, so the FSM
 *  is pinned to `idle`, where every gate has always been open. */
const InputPolicyContext = createContext<InputPolicy | undefined>(undefined);

export function InteractionModeProvider({
  children,
  vm,
  input,
}: {
  readonly children: ReactNode;
  readonly vm?: EditorViewModel | undefined;
  /** Per-flavor gate tables (EditorModeContext.input) — required so the
   *  gates can never silently fall back to a second hardcoded truth
   *  (DR-114 §6-G5). */
  readonly input: InputPolicy;
}) {
  return (
    <InteractionVmContext.Provider value={vm}>
      <InputPolicyContext.Provider value={input}>{children}</InputPolicyContext.Provider>
    </InteractionVmContext.Provider>
  );
}

export function useInteractionMode(): InteractionModeContextValue {
  const vm = useContext(InteractionVmContext);
  const stableNoOpVm = useStableNoOpVm();
  const activeVm = vm ?? stableNoOpVm;

  const mode = useEditorVM<InteractionMode>(activeVm, (v) => v.mode.get() as InteractionMode);

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
    (expected: InteractionMode | ReadonlyArray<InteractionMode>): boolean => {
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
    (expected: InteractionMode | ReadonlyArray<InteractionMode>): boolean => {
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

/** WI-166 P4 — shared lookup behind every gate hook: the admissible-set
 *  decision lives in the injected InputPolicy (per-flavor table), the FSM
 *  stays a single machine. Without a provider the vm is absent and the
 *  mode is pinned `idle` — every gate is open there, matching the pre-P4
 *  hardcoded hooks. */
function useInteractionGate(key: InteractionGateKey): boolean {
  const { mode } = useInteractionMode();
  const input = useContext(InputPolicyContext);
  if (input === undefined) return true;
  return input.gates[key].has(mode);
}

export function useTooltipsAllowed(): boolean {
  return useInteractionGate("tooltips");
}

/** Frame selection (click-to-pick, marquee, multi-select toggle) —
 *  admitted only in idle today: hand/panning own pointer events
 *  exclusively while active; rubber-band / frame-manipulating /
 *  text-editing / context-menu each carry their own selection
 *  semantics and would conflict with a plain click-to-select. */
export function useFrameSelectionAllowed(): boolean {
  return useInteractionGate("frameSelection");
}

/** WI-040 — affordance-eligibility gate. A canvas affordance (hover
 *  outline, parent/sibling highlight, quick-action surfacing) renders
 *  only in true edit-idle AND with peek inspector off. Mid-drag
 *  (`frame-manipulating`), text edit, rubber-band, hand/pan, context-
 *  menu, and peek all stand down so the user's current intent owns
 *  the surface without competing chrome.
 *
 *  Semantically narrower than `useFrameSelectionAllowed`: kept separate
 *  so the boolean's call site reads as "are we showing affordances?"
 *  rather than "is a click allowed?". The two happen to coincide today;
 *  diverging later (e.g., affordances during a hovered context-menu
 *  preview) won't ripple through selection logic. */
export function useEditAffordancesAllowed(): boolean {
  const peekActive = usePeekActive();
  return useInteractionGate("editAffordances") && !peekActive;
}

/** WI-040 — selection chrome (resize / rotate handles, outline) visible
 *  whenever the selection is *meaningful* to the user. Includes:
 *    • `idle`               — default edit state
 *    • `frame-manipulating` — chrome must persist mid-drag so handles
 *      don't disappear under the user's pointer
 *    • `text-editing`       — text frame can still be resized while
 *      editing (user-confirmed UX, WI-040)
 *
 *  Hidden in `hand`, `panning`, `rubber-band`, `context-menu`, and
 *  whenever the peek inspector is active — those states own the canvas
 *  exclusively or open a popover that competes with selection chrome
 *  for attention. */
export function useSelectionChromeVisible(): boolean {
  const peekActive = usePeekActive();
  return useInteractionGate("selectionChrome") && !peekActive;
}

/** WI-040 — frame-body / handle gesture bindings (move, resize, rotate)
 *  may be *registered* only when the mode is NOT one that owns the
 *  canvas exclusively.
 *
 *  Excluded states (everything else is in the policy's admit set):
 *    • mode `hand` / `panning` — user explicitly armed the pan tool
 *    • mode `context-menu`     — LayerPicker or a frame's context menu
 *      open; competing gestures must stand down so dismissal flows
 *      reach the menu first.
 *    • peek active             — Layers / peek inspector owns the
 *      canvas (sticky button or hold-L). Frame drag must not compete
 *      with the layer-stack drag-to-reorder.
 *
 *  Several active-gesture modes (`frame-manipulating`, `rubber-band`,
 *  `text-editing`) are entered *by* a claim these bindings made —
 *  unregistering during the binding's own in-flight gesture would orphan
 *  its closure and silently drop the remaining pointermove / pointerup,
 *  so those modes MUST stay in the gate's admit set (see the
 *  `frameDragBindings` caveat on InteractionGateKey). Text-editing also
 *  keeps a click on another frame's resize handle starting the resize
 *  gesture; focus loss handles the text-edit exit independently. */
export function useFrameDragBindingsAllowed(): boolean {
  const peekActive = usePeekActive();
  return useInteractionGate("frameDragBindings") && !peekActive;
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
