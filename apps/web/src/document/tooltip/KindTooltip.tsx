// WI-016 Phase D — KindTooltip wrapper + TooltipDescribeContext.
//
// `<KindTooltip>` is the per-frame entry point: given an item and its local
// state (selected / entered / hovered), it looks up the registered describer
// for the item's kind, merges in the global describe context (canUndo /
// canRedo / hotkeys), and spreads the result onto `<AITooltip>`.
//
// The describe context is React-context, mounted at DesignPage where the
// editor instance is available. Per-item state is prop-drilled (selected /
// entered / hovered) — that's the natural place for state that already lives
// in the parent (FrameStage / DesignPage selection state).

import { AITooltip, type AITooltipHotkeyTable } from "@weave/design-system";
import { createContext, forwardRef, type ReactElement, useContext, useMemo } from "react";
import type { AgoItem } from "../types.js";
import { defaultTooltipRegistry } from "./default-registry.js";
import type { TooltipDescribeContext, TooltipRegistry } from "./types.js";

interface DescribeContextValue {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly hotkeys: AITooltipHotkeyTable;
}

const EMPTY: DescribeContextValue = {
  canUndo: false,
  canRedo: false,
  hotkeys: {},
};

const Context = createContext<DescribeContextValue>(EMPTY);

export interface TooltipDescribeContextProviderProps extends DescribeContextValue {
  readonly children: ReactElement;
}

/**
 * Wraps the editor tree and exposes the global describe slices to every
 * `<KindTooltip>` below. DesignPage mounts this once with the live values
 * from the editor + the hotkey table from `useEditorHotkeys`.
 */
export function TooltipDescribeContextProvider({
  canUndo,
  canRedo,
  hotkeys,
  children,
}: TooltipDescribeContextProviderProps): ReactElement {
  const value = useMemo<DescribeContextValue>(
    () => ({ canUndo, canRedo, hotkeys }),
    [canUndo, canRedo, hotkeys],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export interface KindTooltipProps {
  readonly item: AgoItem;
  readonly selected: boolean;
  readonly entered: boolean;
  readonly hovered?: boolean;
  /** Allow tests / consumers to inject a custom registry. */
  readonly registry?: TooltipRegistry;
  readonly children: ReactElement;
}

/**
 * Per-frame tooltip. Polymorphism happens inside the registry — KindTooltip
 * itself is unconditional: same wiring for every item kind, the registered
 * adapter decides what to render. Adding a domain doesn't touch this file.
 *
 * **Why forwardRef + spread `...rest`** — when a parent Slot wraps
 * KindTooltip (e.g. `<ContextMenuTrigger asChild>`), Radix calls
 * `cloneElement(KindTooltip, { ref, onContextMenu, … })` to wire up the
 * trigger. A plain function component drops both. We forward ref + spread
 * all unrecognized props into the inner AITooltip — AITooltip's own
 * forwardRef + rest-forwarding chain (Phase B) carries them down to the
 * actual DOM element.
 */
export const KindTooltip = forwardRef<HTMLElement, KindTooltipProps>(
  function KindTooltip(props, forwardedRef) {
    const {
      item,
      selected,
      entered,
      hovered = false,
      registry = defaultTooltipRegistry,
      children,
      ...rest
    } = props as KindTooltipProps & Record<string, unknown>;
    const global = useContext(Context);
    const ctx = useMemo<TooltipDescribeContext>(
      () => ({
        selected,
        entered,
        hovered,
        canUndo: global.canUndo,
        canRedo: global.canRedo,
        hotkeys: global.hotkeys,
      }),
      [selected, entered, hovered, global.canUndo, global.canRedo, global.hotkeys],
    );

    // The describer is registered against the item's `kind` — the *narrow*
    // type. Cast inside useMemo so the closure captures a typed adapter
    // function. Runtime contract: registry.get(kind) is the adapter for that
    // kind, and `item.kind === kind` by construction.
    const describe = registry.get(item.kind)?.describe as
      | ((
          i: AgoItem,
          c: TooltipDescribeContext,
        ) => ReturnType<NonNullable<ReturnType<typeof registry.get>>["describe"]>)
      | undefined;
    const options = useMemo(() => (describe ? describe(item, ctx) : {}), [describe, item, ctx]);

    return (
      <AITooltip ref={forwardedRef} {...rest} {...options}>
        {children}
      </AITooltip>
    );
  },
);
