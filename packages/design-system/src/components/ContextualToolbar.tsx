// WI-020 Phase 1 — ContextualToolbar primitive (DR-design-009).
//
// Selection-driven floating bar — the host renders this when a single item
// is selected, with kind-appropriate editor sections inside. The container
// is a horizontal flex bar with the aurora-glass overlay surface.
// Positioning (top-center, near-header) is the host's responsibility — the
// primitive only defines the visual surface + layout.
//
// DR-design-014 — sections carry a `priority` number; the bar uses a
// ResizeObserver to fold low-priority sections into a `더보기` popover
// when total width exceeds the container's cap. `createPortal` preserves
// section state (e.g. an open ColorPicker) across visible↔folded moves —
// the same React component instance is reparented, not remounted.

import {
  createContext,
  forwardRef,
  type HTMLAttributes,
  type JSX,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../cn.js";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover.js";

// ─── Internal context ─────────────────────────────────────────────────────

interface SectionMeta {
  priority: number;
  /** Cached natural width in the bar's flex flow. Updated whenever the
   *  section is visible (in-flow). When folded, this cache is what the bar
   *  uses to decide if there's room to unfold. */
  width: number;
  /** Live DOM node — measured via getBoundingClientRect after layout. */
  el: HTMLElement | null;
}

interface ToolbarContextValue {
  /** Mount-time registration. Width cache is preserved if the key already
   *  exists (re-mounts under React StrictMode shouldn't lose measurements). */
  readonly registerSection: (key: string, priority: number) => void;
  /** Mid-life priority update — used when a section's `priority` prop
   *  changes. Width cache is untouched. */
  readonly updatePriority: (key: string, priority: number) => void;
  readonly unregisterSection: (key: string) => void;
  readonly reportWidth: (key: string, w: number, el: HTMLElement | null) => void;
  readonly isFolded: (key: string) => boolean;
  readonly moreContainerEl: HTMLDivElement | null;
}

const ToolbarContext = createContext<ToolbarContextValue | null>(null);

// More-button width reservation. Slightly over the actual chrome so the
// reservation absorbs sub-pixel jitter without ping-ponging fold decisions.
const MORE_BUTTON_RESERVE_PX = 88;
const SAFETY_GAP_PX = 12;
// Bar root max-width. The host can override via `style` / `className`,
// but the default keeps the bar centered + readable on any viewport.
const DEFAULT_MAX_WIDTH = "min(92vw, 1100px)";

// ─── Root ─────────────────────────────────────────────────────────────────

interface ToolbarRootProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  /** Override the bar's max-width CSS. Default: `min(92vw, 1100px)`. */
  readonly maxWidth?: string;
  /** Label for the overflow trigger button. Default: "더보기". */
  readonly moreLabel?: string;
}

const baseClass = [
  // backdrop-filter under transform — translateZ(0) + will-change keep
  // Chromium from dropping the filter during host transform animations.
  // [[feedback_backdrop_filter_under_transform]]
  "[transform:translateZ(0)] [will-change:backdrop-filter] isolate",
  "inline-flex items-stretch gap-0 flex-nowrap",
  "bg-[color:var(--surface-overlay)] backdrop-blur-[var(--surface-blur)]",
  "border border-[color:var(--surface-overlay-border)]",
  "rounded-[var(--radius-md)]",
  "shadow-[var(--shadow-overlay)]",
  "text-[color:var(--text-overlay)]",
  "px-1.5 py-1",
  "min-h-[40px]",
  // overflow-hidden prevents a transient single-row layout from showing the
  // unmeasured tail before the first fold computation completes.
  "overflow-hidden",
].join(" ");

function ToolbarRoot(
  { className, children, maxWidth = DEFAULT_MAX_WIDTH, moreLabel = "더보기", style, ...rest }: ToolbarRootProps,
  ref: React.Ref<HTMLDivElement>,
): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Compose the user-passed ref + internal containerRef.
  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref !== null && ref !== undefined) {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [ref],
  );

  // Sections registry — insertion order matters for the visible flow order.
  // A Map preserves insertion order in JS, so iterating gives declaration
  // order. Folding decisions are by priority; rendering order is by Map order.
  const sectionsRef = useRef<Map<string, SectionMeta>>(new Map());
  const [foldedKeys, setFoldedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [moreContainerEl, setMoreContainerEl] = useState<HTMLDivElement | null>(null);
  // Bump on register/unregister/width-change so the effect re-runs.
  const [version, bump] = useState(0);

  const registerSection = useCallback((key: string, priority: number) => {
    const existing = sectionsRef.current.get(key);
    if (existing !== undefined) {
      // Preserve width cache and `el`. Only refresh priority — re-mount
      // under StrictMode or a parent re-render shouldn't wipe measurements.
      existing.priority = priority;
      return;
    }
    sectionsRef.current.set(key, { priority, width: 0, el: null });
    bump((n) => n + 1);
  }, []);
  const updatePriority = useCallback((key: string, priority: number) => {
    const m = sectionsRef.current.get(key);
    if (m === undefined) return;
    if (m.priority === priority) return;
    m.priority = priority;
    bump((n) => n + 1);
  }, []);
  const unregisterSection = useCallback((key: string) => {
    sectionsRef.current.delete(key);
    bump((n) => n + 1);
  }, []);
  const reportWidth = useCallback(
    (key: string, w: number, el: HTMLElement | null) => {
      const m = sectionsRef.current.get(key);
      if (m === undefined) return;
      // Only update from in-flow measurement — when folded, `el` lives
      // inside the More popover and would give a stacked-layout width.
      if (w <= 0) return;
      // Stale-cache tolerance: update if the difference is meaningful
      // (>= 1px) to avoid pointless bumps on sub-pixel jitter.
      if (Math.abs(m.width - w) < 1 && m.el === el) return;
      m.width = w;
      m.el = el;
      bump((n) => n + 1);
    },
    [],
  );
  const isFolded = useCallback(
    (key: string) => foldedKeys.has(key),
    [foldedKeys],
  );

  // Recompute folding whenever sections / container width change.
  const recompute = useCallback(() => {
    const container = containerRef.current;
    if (container === null) return;
    const cw = container.clientWidth;
    const sections = Array.from(sectionsRef.current.entries());
    // Sort by descending priority — most-essential first.
    sections.sort((a, b) => b[1].priority - a[1].priority);

    // Decide visible set. Reserve room for the More button — but only if
    // we're going to need it (i.e. if anything was folded last time, or
    // if total > cw). The simplest correct rule: always reserve when more
    // than one section is registered; the reserved space is small enough
    // that the visual difference is acceptable.
    const willOverflow =
      sections.reduce((s, [, m]) => s + m.width, 0) > cw - SAFETY_GAP_PX;
    const budget = willOverflow ? cw - MORE_BUTTON_RESERVE_PX - SAFETY_GAP_PX : cw - SAFETY_GAP_PX;

    const visible = new Set<string>();
    let used = 0;
    for (const [key, m] of sections) {
      if (m.width === 0) {
        // Not measured yet — assume it fits so the first paint includes it
        // and the post-paint effect will recompute with real widths.
        visible.add(key);
        continue;
      }
      if (used + m.width <= budget) {
        visible.add(key);
        used += m.width;
      }
    }
    // Anything not visible is folded.
    const next = new Set<string>();
    for (const key of sectionsRef.current.keys()) {
      if (!visible.has(key)) next.add(key);
    }
    setFoldedKeys((prev) => {
      if (prev.size === next.size) {
        let same = true;
        for (const k of prev) if (!next.has(k)) { same = false; break; }
        if (same) return prev;
      }
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    recompute();
  }, [recompute, version]);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(container);
    return () => ro.disconnect();
  }, [recompute]);

  const ctx = useMemo<ToolbarContextValue>(
    () => ({
      registerSection,
      updatePriority,
      unregisterSection,
      reportWidth,
      isFolded,
      moreContainerEl,
    }),
    [registerSection, updatePriority, unregisterSection, reportWidth, isFolded, moreContainerEl],
  );

  const hasFolded = foldedKeys.size > 0;

  return (
    <ToolbarContext.Provider value={ctx}>
      <div
        ref={setContainerRef}
        role="toolbar"
        {...rest}
        style={{ maxWidth, ...style }}
        className={cn(baseClass, className)}
      >
        {children}
        {hasFolded ? (
          <MoreOverflow onContainerMount={setMoreContainerEl} moreLabel={moreLabel} />
        ) : null}
      </div>
    </ToolbarContext.Provider>
  );
}

const ForwardedToolbarRoot = forwardRef<HTMLDivElement, ToolbarRootProps>(
  ToolbarRoot,
);

// ─── More overflow trigger + popover ──────────────────────────────────────

function MoreOverflow({
  onContainerMount,
  moreLabel,
}: {
  readonly onContainerMount: (el: HTMLDivElement | null) => void;
  readonly moreLabel: string;
}): JSX.Element {
  return (
    <div className="flex items-stretch" data-toolbar-more>
      {/* Match the divider treatment used between regular sections. */}
      <div
        aria-hidden
        className="self-stretch w-px my-1 bg-[color:var(--surface-overlay-border)]"
      />
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 px-2.5 self-center",
              "text-[12px] text-[color:var(--text-overlay)]",
              "rounded-[var(--radius-sm)]",
              "hover:bg-[color:var(--surface-overlay-2)]",
              "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
            )}
            data-testid="toolbar-more-trigger"
            aria-label={moreLabel}
          >
            <span>{moreLabel}</span>
            <span aria-hidden className="text-[10px]">▾</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={6}
          className="min-w-[220px] p-2"
          data-testid="toolbar-more-content"
        >
          <div
            ref={onContainerMount}
            className="flex flex-col items-stretch gap-1"
            data-toolbar-more-stack="true"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────

interface ToolbarSectionProps extends HTMLAttributes<HTMLDivElement> {
  /** Visible label above the controls (uppercase tiny caption). */
  readonly label?: string;
  /** DR-design-014 — fold priority. Larger = more essential. Sections with
   *  the lowest priorities are folded into the "더보기" popover first when
   *  the bar exceeds its max width. Default 50. */
  readonly priority?: number;
  children?: ReactNode;
}

const sectionLayoutClass = "flex flex-col justify-center gap-1 px-2.5 py-0.5";
const sectionLayoutClassFolded = "flex flex-col gap-1 px-1 py-1.5";

const ToolbarSection = forwardRef<HTMLDivElement, ToolbarSectionProps>(
  function ToolbarSection({ label, className, children, priority = 50, ...rest }, ref) {
    const ctx = useContext(ToolbarContext);
    const key = useId();
    const localRef = useRef<HTMLDivElement | null>(null);
    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        localRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref !== null && ref !== undefined) {
          (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }
      },
      [ref],
    );

    // Pin ctx via a ref so the mount-only effect doesn't re-run whenever
    // ctx's identity changes (which it does on every fold decision). The
    // ctx provider is a stable ancestor for a section's lifetime, so
    // capturing latest via ref is safe.
    const ctxRef = useRef(ctx);
    ctxRef.current = ctx;

    // Register with the bar on mount, unregister on unmount. Width cache
    // is preserved across React StrictMode double-invocation thanks to
    // registerSection's get-existing-or-create semantics.
    useEffect(() => {
      ctxRef.current?.registerSection(key, priority);
      return () => ctxRef.current?.unregisterSection(key);
      // priority change is handled by the next effect; we intentionally
      // don't list `priority` here to keep this purely mount/unmount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    // Keep the bar's priority cache in sync if the prop changes — no
    // width reset.
    useEffect(() => {
      ctxRef.current?.updatePriority(key, priority);
    }, [key, priority]);

    const folded = ctx?.isFolded(key) ?? false;

    // Measure the section's natural width whenever it renders in-flow.
    // We skip measurement while folded because the popover stack layout
    // is vertical and would give a misleading width.
    useLayoutEffect(() => {
      if (folded) return;
      const node = localRef.current;
      if (node === null) return;
      const w = node.getBoundingClientRect().width;
      ctx?.reportWidth(key, w, node);
    });

    const content = (
      <div
        ref={setRefs}
        {...rest}
        className={cn(folded ? sectionLayoutClassFolded : sectionLayoutClass, className)}
        role="group"
        aria-label={label}
        data-toolbar-section-priority={priority}
        data-toolbar-section-folded={folded ? "true" : undefined}
      >
        {label !== undefined ? (
          <span
            aria-hidden
            className={cn(
              "font-mono uppercase leading-none text-[color:var(--text-overlay-muted)]",
              folded
                ? "text-[10px] tracking-[1.2px]"
                : "text-[9px] tracking-[1px]",
            )}
          >
            {label}
          </span>
        ) : null}
        <div className={folded ? "flex items-center gap-1.5 flex-wrap" : "flex items-center gap-1.5"}>
          {children}
        </div>
      </div>
    );

    if (folded && ctx?.moreContainerEl !== null && ctx?.moreContainerEl !== undefined) {
      return createPortal(content, ctx.moreContainerEl);
    }
    return content;
  },
);

// ─── Divider ──────────────────────────────────────────────────────────────

const ToolbarDivider = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function ToolbarDivider({ className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        aria-hidden
        {...rest}
        className={cn(
          "self-stretch w-px my-1 bg-[color:var(--surface-overlay-border)]",
          // Hidden inside the More popover (vertical stack) — the divider
          // is a horizontal-flow detail.
          "[[data-toolbar-more-stack]_&]:hidden",
          className,
        )}
      />
    );
  },
);

// ─── Compound exposure ────────────────────────────────────────────────────

interface ContextualToolbarCompound
  extends React.ForwardRefExoticComponent<
    ToolbarRootProps & React.RefAttributes<HTMLDivElement>
  > {
  Section: typeof ToolbarSection;
  Divider: typeof ToolbarDivider;
}

const ContextualToolbar = ForwardedToolbarRoot as ContextualToolbarCompound;
ContextualToolbar.Section = ToolbarSection;
ContextualToolbar.Divider = ToolbarDivider;

export { ContextualToolbar, type ToolbarRootProps as ContextualToolbarProps };
