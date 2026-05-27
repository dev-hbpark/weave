// AI Agentic Tooltip — primitive that combines a one-line context, a list of
// actions, and per-action shortcut keycaps. Each of the three regions can be
// toggled independently and the layout collapses cleanly when a region is
// disabled. Provider hosts a single instance and renders it through a portal.
//
// Scope of THIS file (Phase B per WI-015):
//   - Provider + state machine (open / close, single active target).
//   - Floating positioning with viewport edge flip.
//   - Three conditional regions (context / actions / shortcut keycap).
//   - Hook API (`useAITooltipTarget`) and Slot-based wrapper (`AITooltip`).
//
// Out of scope for Phase B (deferred to later WI-015 phases):
//   - Phase C: smart debouncing (175 ms show, 100 ms hide) + dataset auto-discover.
//   - Phase D: shared-element morphing between adjacent targets.
//   - Phase E: full e2e timing tests + visual baseline.
//
// Token discipline: zero hard-coded colors / shadows / radii / motion values.
// All visuals read from `tokens.css` via `var(--*)` references — Hard rule 2.

import { Slot } from "@radix-ui/react-slot";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  createContext,
  forwardRef,
  type MutableRefObject,
  type ReactElement,
  type FocusEvent as ReactFocusEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  type RefCallback,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../cn.js";
import { TooltipCard } from "./TooltipCard.js";

/**
 * Compose multiple refs into a single callback ref. Mirrors Radix's
 * `composeRefs` so we don't have to add the dedicated package as a separate
 * dependency — we already use @radix-ui/react-slot here.
 */
function mergeRefs<T>(...refs: ReadonlyArray<Ref<T> | undefined>): RefCallback<T> {
  return (value: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") {
        ref(value);
      } else if (ref != null) {
        (ref as MutableRefObject<T | null>).current = value;
      }
    }
  };
}

export interface AITooltipAction {
  readonly action: string;
  /**
   * Literal display string for the keycap (e.g. `"⌘ + Z"`). Takes precedence
   * over `hotkeyId` — when both are supplied, the literal wins.
   */
  readonly shortcut?: string;
  /**
   * Reference into the provider's `hotkeyTable` — resolved at render time to
   * `table[hotkeyId].keys`. Lets the binding stay decoupled from key strings
   * (the hotkey registry is the single source of truth; if the user remaps a
   * binding, every tooltip auto-reflects).
   */
  readonly hotkeyId?: string;
}

export interface AITooltipHotkeyEntry {
  /** Canonical key string for display (e.g. `"⌘ + Z"` or `"ControlOrMeta+Z"`). */
  readonly keys: string;
  /** Optional human-readable label — currently unused for display, reserved
   *  for a future hotkey-help panel that lists all bound shortcuts. */
  readonly label?: string;
}

export type AITooltipHotkeyTable = Readonly<Record<string, AITooltipHotkeyEntry>>;

interface TooltipData {
  readonly context?: string;
  readonly actions?: ReadonlyArray<AITooltipAction>;
  readonly showContext: boolean;
  readonly showActions: boolean;
  readonly showShortcuts: boolean;
}

// Single stable id for the one tooltip surface a provider owns. Used by:
//   - the floating element (`id={TOOLTIP_ID}`),
//   - every bound target (`aria-describedby={TOOLTIP_ID}`),
// so a screen-reader walking the target announces the tooltip's content even
// when the visual surface is briefly hidden between the show / hide buffers.
const TOOLTIP_ID = "weave-ai-tooltip-surface";

interface ActiveTarget {
  readonly element: HTMLElement;
  readonly data: TooltipData;
}

interface AITooltipContextValue {
  readonly open: (target: HTMLElement, data: TooltipData) => void;
  readonly close: (target: HTMLElement) => void;
  /**
   * Live update of the *currently visible* tooltip's data. Called by the
   * binding hook when its describer output changes (e.g. selection state
   * flipped while the tooltip is on-screen). No-ops when the target isn't
   * the active one — caller doesn't need to check first.
   */
  readonly refresh: (target: HTMLElement, data: TooltipData) => void;
}

const AITooltipContext = createContext<AITooltipContextValue | null>(null);

// Separate context for the hotkey display table so the Floating element can
// read it without coupling to the open/close/refresh state value.
const HotkeyTableContext = createContext<AITooltipHotkeyTable>({});

export interface AITooltipProviderProps {
  /**
   * Show delay in ms — pointer must dwell on the target this long before the
   * tooltip appears. Default 1000 ms (matches CursorTooltip dwell — user-
   * confirmed 2026-05-27 that sub-second hovers on dense button rows feel
   * "어지러움"). Cheap to lower per-instance for surfaces where users
   * explicitly asked for a faster hint.
   */
  readonly showDelayMs?: number;
  /**
   * Hide-buffer delay in ms — when pointer leaves the target the tooltip stays
   * for this long so a small mouse jitter doesn't dismiss it; re-entering the
   * same (or any other tooltip) target within the buffer cancels the hide.
   * Default 100 ms.
   */
  readonly hideDelayMs?: number;
  /**
   * When `"dataset"`, the provider installs a single document-level pointer
   * listener and resolves `[data-ai-tooltip="true"]` ancestors of the pointer
   * target automatically — no per-element hook/wrapper required. Default
   * `"none"` (explicit binding via `useAITooltipTarget` or `<AITooltip>`).
   */
  readonly scan?: "dataset" | "none";
  /**
   * Hotkey display table. Maps a binding id to its canonical display string.
   * `AITooltipAction.hotkeyId` is resolved against this map at render time.
   * Hosts wire this from their hotkey registry (e.g. an editor's input bus).
   */
  readonly hotkeyTable?: AITooltipHotkeyTable;
  /**
   * Global suppression switch. When true, the provider refuses new tooltip
   * opens and immediately dismisses any visible / pending tooltip. Used by
   * hosts that own an editor-wide interaction-mode machine (rubber-band,
   * frame manipulation, context menu open, pan, etc.) to silence hover
   * chrome while a gesture owns the canvas.
   */
  readonly disabled?: boolean;
  readonly children: ReactNode;
}

type MachineStatus = "idle" | "pending-show" | "visible" | "pending-hide";

interface MachineState {
  readonly status: MachineStatus;
  readonly target: HTMLElement | null;
  readonly data: TooltipData | null;
}

/**
 * Top-level provider. Exactly one instance per app — render once near the root.
 * Owns the single tooltip surface; hook / wrapper consumers anywhere below
 * register a target and the provider portals one floating element.
 *
 * State machine (status × target × data):
 *
 *   idle          ──enter(t,d)──▶ pending-show(t,d)
 *   pending-show  ──showTimer──▶  visible(t,d)
 *   pending-show  ──leave(t)──▶   idle
 *   visible       ──leave(t)──▶   pending-hide(t,d)
 *   visible       ──enter(t',d')▶ visible(t',d')   // instant switch
 *   pending-hide  ──hideTimer──▶  idle
 *   pending-hide  ──enter(t,d)──▶ visible(t,d)     // cancel hide
 *
 * The machine state lives in a ref (timers don't re-render); only the public
 * `active` state — the *visible* target+data — drives React renders.
 */
export function AITooltipProvider({
  showDelayMs = 1000,
  hideDelayMs = 100,
  scan = "none",
  hotkeyTable,
  disabled = false,
  children,
}: AITooltipProviderProps): ReactElement {
  const [active, setActive] = useState<ActiveTarget | null>(null);

  const stateRef = useRef<MachineState>({
    status: "idle",
    target: null,
    data: null,
  });
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);
  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  // Live disabled flag in a ref so the document-level pointerover listener
  // (installed once on mount) can check the current value without restarting
  // when `disabled` toggles. The callback consumers below read this ref too.
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const open = useCallback(
    (element: HTMLElement, data: TooltipData) => {
      if (disabledRef.current) return;
      const st = stateRef.current;

      // Same target re-entering during pending-hide → cancel hide, restore.
      if (st.status === "pending-hide" && st.target === element) {
        clearHideTimer();
        stateRef.current = { status: "visible", target: element, data };
        setActive({ element, data });
        return;
      }

      // Same target, currently visible → refresh data (mode/selection flip
      // while pointer sits still). No timer reset, no flicker.
      if (st.status === "visible" && st.target === element) {
        stateRef.current = { status: "visible", target: element, data };
        setActive({ element, data });
        return;
      }

      // Different target while visible / pending-hide → dismiss the current
      // surface immediately and start a fresh show timer for the new one.
      // User-confirmed 2026-05-27: instant adjacent switching on dense
      // toolbar rows reads as "어지러움". Re-using the show delay (default
      // 1000 ms) buys the same dwell guarantee for follow-up targets as
      // for the first entry.
      if (st.status === "visible" || st.status === "pending-hide") {
        clearHideTimer();
        stateRef.current = { status: "idle", target: null, data: null };
        setActive(null);
        // Fall through to the pending-show branch below.
      }

      // Pending-show on the same target → keep timer running, refresh data.
      if (st.status === "pending-show" && st.target === element) {
        stateRef.current = { status: "pending-show", target: element, data };
        return;
      }

      // Pending-show for a different target OR idle → (re)start show timer.
      clearShowTimer();
      stateRef.current = { status: "pending-show", target: element, data };
      showTimerRef.current = setTimeout(() => {
        showTimerRef.current = null;
        const s = stateRef.current;
        if (s.status !== "pending-show" || s.target !== element) return;
        stateRef.current = { status: "visible", target: element, data };
        setActive({ element, data });
      }, showDelayMs);
    },
    [clearShowTimer, clearHideTimer, showDelayMs],
  );

  const close = useCallback(
    (element: HTMLElement) => {
      const st = stateRef.current;
      // Closing a target we don't currently hold — no-op.
      if (st.target !== element) return;

      if (st.status === "pending-show") {
        clearShowTimer();
        stateRef.current = { status: "idle", target: null, data: null };
        return;
      }

      if (st.status === "visible") {
        clearHideTimer();
        const currentData = st.data;
        stateRef.current = {
          status: "pending-hide",
          target: element,
          data: currentData,
        };
        hideTimerRef.current = setTimeout(() => {
          hideTimerRef.current = null;
          const s = stateRef.current;
          if (s.status !== "pending-hide" || s.target !== element) return;
          stateRef.current = { status: "idle", target: null, data: null };
          setActive(null);
        }, hideDelayMs);
      }
    },
    [clearShowTimer, clearHideTimer, hideDelayMs],
  );

  // Mount cleanup — clear any in-flight timers so we don't fire on a
  // disposed provider (React 18 StrictMode also exercises this path).
  useEffect(() => {
    return () => {
      clearShowTimer();
      clearHideTimer();
    };
  }, [clearShowTimer, clearHideTimer]);

  // When the host flips `disabled` to true mid-interaction, dismiss any
  // visible / pending tooltip immediately. Bypasses the hide buffer because
  // the new gesture (rubber-band, manipulation, menu) is now driving — a
  // 100 ms tail of stale chrome on top of a moving handle reads as a glitch.
  useEffect(() => {
    if (!disabled) return;
    clearShowTimer();
    clearHideTimer();
    if (stateRef.current.status !== "idle") {
      stateRef.current = { status: "idle", target: null, data: null };
      setActive(null);
    }
  }, [disabled, clearShowTimer, clearHideTimer]);

  // Esc dismissal — required by the WAI-ARIA tooltip pattern. Bypasses the
  // 100 ms hide buffer (an explicit dismissal should be immediate, not
  // accidental-leave-tolerant) by resetting the machine directly to idle.
  useEffect(() => {
    if (active === null || typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      clearShowTimer();
      clearHideTimer();
      stateRef.current = { status: "idle", target: null, data: null };
      setActive(null);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [active, clearShowTimer, clearHideTimer]);

  // Dataset auto-discover. Installs one document-level pointerover listener
  // that resolves the nearest `[data-ai-tooltip="true"]` ancestor for both
  // the event target and its relatedTarget; only fires open/close on actual
  // transitions between tooltip targets. The floating surface itself has
  // `pointer-events: none`, so we never receive pointerover on it.
  useEffect(() => {
    if (scan !== "dataset" || typeof document === "undefined") return;
    const onPointerOver = (e: PointerEvent) => {
      // `disabledRef` (set above on every render) gates the dataset listener
      // without restarting the document-level subscription each time the
      // flag flips. Without this, the host could end up reattaching the
      // listener mid-drag and miss a pointerout transition.
      if (disabledRef.current) return;
      const t = e.target as Element | null;
      const r = e.relatedTarget as Element | null;
      const next = (t?.closest?.('[data-ai-tooltip="true"]') as HTMLElement | null) ?? null;
      const prev = (r?.closest?.('[data-ai-tooltip="true"]') as HTMLElement | null) ?? null;
      if (next === prev) return;
      if (prev !== null) close(prev);
      if (next !== null) open(next, readTooltipDataset(next));
    };
    document.addEventListener("pointerover", onPointerOver);
    return () => {
      document.removeEventListener("pointerover", onPointerOver);
    };
  }, [scan, open, close]);

  const refresh = useCallback((element: HTMLElement, data: TooltipData) => {
    const st = stateRef.current;
    // Only the currently visible (or pending-hide) target's data is live.
    // Pending-show is harder: technically we could update the queued data so
    // when the timer fires the *latest* content shows — that's the right
    // behavior and costs nothing extra.
    if (st.target !== element) return;
    if (st.status === "idle") return;
    stateRef.current = { ...st, data };
    // The visible / pending-hide path drives the floating render; pending-
    // show defers the actual render until the timer fires. Only update
    // React state when we're currently displaying.
    if (st.status === "visible" || st.status === "pending-hide") {
      setActive({ element, data });
    }
  }, []);

  const value = useMemo<AITooltipContextValue>(
    () => ({ open, close, refresh }),
    [open, close, refresh],
  );

  return (
    <AITooltipContext.Provider value={value}>
      <HotkeyTableContext.Provider value={hotkeyTable ?? EMPTY_HOTKEY_TABLE}>
        {children}
        <FloatingLayer active={active} />
      </HotkeyTableContext.Provider>
    </AITooltipContext.Provider>
  );
}

// Stable empty reference so React doesn't see a new value every render when
// the host passes nothing.
const EMPTY_HOTKEY_TABLE: AITooltipHotkeyTable = Object.freeze({});

interface FloatingLayerProps {
  readonly active: ActiveTarget | null;
}

function FloatingLayer({ active }: FloatingLayerProps): ReactElement | null {
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {active !== null ? <Floating key="ai-tooltip" active={active} /> : null}
    </AnimatePresence>,
    document.body,
  );
}

interface FloatingProps {
  readonly active: ActiveTarget;
}

function Floating({ active }: FloatingProps): ReactElement | null {
  const reduce = useReducedMotion();
  const hotkeyTable = useContext(HotkeyTableContext);
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // Recompute on every active change. Position depends on the target's rect
  // and the tooltip's own rect, so we read both after first paint.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const tooltip = ref.current;
    if (tooltip === null) return;
    const targetRect = active.element.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 8;
    const edge = 8;

    let top = targetRect.bottom + gap;
    // Flip above if it would overflow the bottom edge.
    if (top + tooltipRect.height > vh - edge) {
      top = Math.max(edge, targetRect.top - tooltipRect.height - gap);
    }
    let left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
    left = Math.max(edge, Math.min(vw - tooltipRect.width - edge, left));
    setPosition({ top, left });
  }, [active]);

  const { data } = active;
  const showContext = data.showContext && data.context !== undefined && data.context.length > 0;
  const hasActions = (data.actions?.length ?? 0) > 0;
  const showActions = data.showActions && hasActions;
  const showShortcuts = data.showShortcuts;

  if (!showContext && !showActions) return null;

  return (
    <motion.div
      ref={ref}
      id={TOOLTIP_ID}
      role="tooltip"
      data-ai-tooltip-surface
      // Phase D — shared-element morph. `layout` tells motion to animate any
      // width/height/top/left changes via FLIP. We gate it on `active.element`
      // through `layoutDependency` so:
      //   - the initial mount + the internal -9999→real position handoff
      //     (driven by our useLayoutEffect on first render) do NOT animate,
      //   - target-to-target switches (active.element changes) DO animate.
      // Reduced motion zeros the layout duration so it snaps without morph.
      layout
      layoutDependency={active.element}
      className={cn(
        "fixed z-50 pointer-events-none",
        "min-w-[180px] max-w-[320px]",
        "rounded-[var(--radius-md)] border",
        // Theme-independent dark glass — readable on any canvas color the
        // user picks for `design.background`. See tokens.css §OVERLAY.
        "bg-[color:var(--surface-overlay)] border-[color:var(--surface-overlay-border)]",
        "shadow-[var(--shadow-overlay)]",
        "px-3 py-2.5",
        "backdrop-blur-[var(--surface-blur)]",
      )}
      style={{
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        visibility: position === null ? "hidden" : "visible",
      }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
      transition={{
        duration: reduce ? 0 : 0.14,
        ease: [0.22, 1, 0.36, 1],
        layout: reduce ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
      }}
    >
      <TooltipCard
        {...(showContext && data.context !== undefined ? { context: data.context } : {})}
        {...(showActions && data.actions !== undefined
          ? { actions: showShortcuts ? data.actions : data.actions.map((a) => ({ action: a.action })) }
          : {})}
        hotkeyTable={hotkeyTable}
      />
    </motion.div>
  );
}

export interface UseAITooltipTargetOptions {
  readonly context?: string;
  readonly actions?: ReadonlyArray<AITooltipAction>;
  readonly showContext?: boolean;
  readonly showActions?: boolean;
  readonly showShortcuts?: boolean;
}

export interface AITooltipBinding {
  readonly ref: RefCallback<HTMLElement>;
  /** Stable id of the provider's tooltip surface — points consumers' screen
   *  readers at the floating content per the WAI-ARIA tooltip pattern. */
  readonly "aria-describedby": string;
  readonly onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => void;
  readonly onFocus: (e: ReactFocusEvent<HTMLElement>) => void;
  readonly onBlur: (e: ReactFocusEvent<HTMLElement>) => void;
}

/**
 * Bind any element to the tooltip. Spread the returned object onto a host
 * element (`<button {...bind}>`). For React components, ensure they forward
 * `ref` and the pointer/focus handlers.
 *
 * Defaults: `show*` toggles are inferred from the presence of the matching
 * data. Explicit `showContext={false}` etc. always win.
 */
export function useAITooltipTarget(options: UseAITooltipTargetOptions): AITooltipBinding {
  const ctx = useContext(AITooltipContext);
  const elRef = useRef<HTMLElement | null>(null);

  const data = useMemo<TooltipData>(() => {
    const hasContext = options.context !== undefined && options.context.length > 0;
    const hasActions = (options.actions?.length ?? 0) > 0;
    const hasShortcut =
      options.actions?.some((a) => a.shortcut !== undefined || a.hotkeyId !== undefined) ?? false;
    // exactOptionalPropertyTypes — only attach `context`/`actions` keys when
    // they have a concrete value. Spread-merge avoids assigning `undefined` to
    // a `string | undefined` slot.
    return {
      ...(options.context !== undefined ? { context: options.context } : {}),
      ...(options.actions !== undefined ? { actions: options.actions } : {}),
      showContext: options.showContext ?? hasContext,
      showActions: options.showActions ?? hasActions,
      showShortcuts: options.showShortcuts ?? hasShortcut,
    };
  }, [
    options.context,
    options.actions,
    options.showContext,
    options.showActions,
    options.showShortcuts,
  ]);

  const setRef = useCallback<RefCallback<HTMLElement>>((el) => {
    elRef.current = el;
  }, []);

  // Live-update path — when `data` changes (e.g. caller passes a new
  // describer output because selection / state flipped) and *this* element
  // is the currently visible target, push the new data straight into the
  // provider. The provider's `refresh()` no-ops if we're not active, so this
  // is safe to fire on every data change.
  useEffect(() => {
    if (ctx === null || elRef.current === null) return;
    ctx.refresh(elRef.current, data);
  }, [ctx, data]);

  const onPointerEnter = useCallback(() => {
    if (ctx === null || elRef.current === null) return;
    ctx.open(elRef.current, data);
  }, [ctx, data]);

  const onPointerLeave = useCallback(() => {
    if (ctx === null || elRef.current === null) return;
    ctx.close(elRef.current);
  }, [ctx]);

  const onFocus = useCallback(() => {
    if (ctx === null || elRef.current === null) return;
    ctx.open(elRef.current, data);
  }, [ctx, data]);

  const onBlur = useCallback(() => {
    if (ctx === null || elRef.current === null) return;
    ctx.close(elRef.current);
  }, [ctx]);

  return useMemo(
    () => ({
      ref: setRef,
      "aria-describedby": TOOLTIP_ID,
      onPointerEnter,
      onPointerLeave,
      onFocus,
      onBlur,
    }),
    [setRef, onPointerEnter, onPointerLeave, onFocus, onBlur],
  );
}

export interface AITooltipProps extends UseAITooltipTargetOptions {
  /** Exactly one child. Composed via `@radix-ui/react-slot` — child must forward ref. */
  readonly children: ReactElement;
}

/**
 * Wrapper sugar over `useAITooltipTarget`. Uses Radix `Slot` so the child
 * receives the merged ref / pointer / focus handlers without an extra DOM
 * wrapper node.
 *
 * **Why forwardRef + ref composition** — when AITooltip is itself the child
 * of another `asChild` Slot (e.g. `<DropdownMenuTrigger asChild>`), the outer
 * Slot calls cloneElement on AITooltip with both the trigger props AND a
 * ref it needs back (to compute popover positioning, etc.). React only honors
 * a `ref` prop on forwardRef components, so we must accept the forwarded ref
 * and compose it with our own tooltip-binding ref before handing both down
 * to the child via Slot.
 *
 * **Why spread `...rest`** — the outer Slot also passes other props (onClick,
 * onKeyDown, data attrs, …) via cloneElement. Spreading them *before* our
 * bind props lets Slot's mergeProps compose both into the final child, with
 * our handlers winning on keys that overlap (intentional — bind owns
 * pointer/focus/aria-describedby semantics for tooltip behavior).
 */
export const AITooltip = forwardRef<HTMLElement, AITooltipProps>(
  function AITooltip(props, forwardedRef) {
    const { children, context, actions, showContext, showActions, showShortcuts, ...rest } =
      props as AITooltipProps & Record<string, unknown>;
    const targetOptions: UseAITooltipTargetOptions = {
      ...(context !== undefined ? { context } : {}),
      ...(actions !== undefined ? { actions } : {}),
      ...(showContext !== undefined ? { showContext } : {}),
      ...(showActions !== undefined ? { showActions } : {}),
      ...(showShortcuts !== undefined ? { showShortcuts } : {}),
    };
    const bind = useAITooltipTarget(targetOptions);
    const composedRef = useMemo(
      () => mergeRefs<HTMLElement>(forwardedRef, bind.ref),
      [forwardedRef, bind.ref],
    );
    return (
      <Slot
        {...rest}
        ref={composedRef}
        aria-describedby={bind["aria-describedby"]}
        onPointerEnter={bind.onPointerEnter}
        onPointerLeave={bind.onPointerLeave}
        onFocus={bind.onFocus}
        onBlur={bind.onBlur}
      >
        {children}
      </Slot>
    );
  },
);

/**
 * Read tooltip data from a DOM element's `data-*` attributes. Used by the
 * provider's dataset auto-discover mode (`scan="dataset"`).
 *
 * Semantics (matches the documented HTML API in DR-design-006 §3):
 *   - `data-tooltip-context`  → context string (any non-empty value).
 *   - `data-tooltip-actions`  → JSON array of `{action, shortcut?}` rows;
 *                                malformed JSON is ignored silently.
 *   - `data-tooltip-show-*`   → explicit "true" / "false" override the
 *                                presence-derived defaults. Anything else
 *                                (missing / empty / typo) falls through to
 *                                the default.
 *
 * Exported for unit / e2e tests via the package's deep path. NOT in the
 * public surface (index.ts) — host code should prefer the hook / wrapper.
 */
export function readTooltipDataset(el: HTMLElement): {
  context?: string;
  actions?: ReadonlyArray<AITooltipAction>;
  showContext: boolean;
  showActions: boolean;
  showShortcuts: boolean;
} {
  const context = el.getAttribute("data-tooltip-context");
  const actionsRaw = el.getAttribute("data-tooltip-actions");

  let actions: AITooltipAction[] | undefined;
  if (actionsRaw !== null) {
    try {
      const parsed: unknown = JSON.parse(actionsRaw);
      if (Array.isArray(parsed)) {
        actions = parsed
          .filter(
            (p): p is { action: string; shortcut?: string; hotkeyId?: string } =>
              typeof p === "object" &&
              p !== null &&
              typeof (p as { action: unknown }).action === "string",
          )
          .map((p) => {
            const shortcut = (p as { shortcut?: unknown }).shortcut;
            const hotkeyId = (p as { hotkeyId?: unknown }).hotkeyId;
            return {
              action: p.action,
              ...(typeof shortcut === "string" ? { shortcut } : {}),
              ...(typeof hotkeyId === "string" ? { hotkeyId } : {}),
            };
          });
      }
    } catch {
      // Silent — a malformed attribute shouldn't crash the whole hover path.
    }
  }

  const hasContext = context !== null && context.length > 0;
  const hasActions = (actions?.length ?? 0) > 0;
  const hasShortcut = actions?.some((a) => a.shortcut !== undefined) ?? false;

  const parseBool = (v: string | null): boolean | undefined => {
    if (v === "true") return true;
    if (v === "false") return false;
    return undefined;
  };

  return {
    ...(context !== null && context.length > 0 ? { context } : {}),
    ...(actions !== undefined ? { actions } : {}),
    showContext: parseBool(el.getAttribute("data-tooltip-show-context")) ?? hasContext,
    showActions: parseBool(el.getAttribute("data-tooltip-show-actions")) ?? hasActions,
    showShortcuts: parseBool(el.getAttribute("data-tooltip-show-shortcuts")) ?? hasShortcut,
  };
}
