// WI-020 Phase 1 — ContextualToolbar primitive (DR-design-009).
//
// Selection-driven floating bar — the host renders this when a single item
// is selected, with kind-appropriate editor sections inside. The container
// is a simple horizontal flex bar with the aurora-glass overlay surface.
// Positioning (top-center, near-header) is the host's responsibility — the
// primitive only defines the visual surface + layout.

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../cn.js";

interface ToolbarRootProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

const baseClass = [
  // backdrop-filter under transform — translateZ(0) + will-change keep
  // Chromium from dropping the filter during host transform animations.
  // [[feedback_backdrop_filter_under_transform]]
  "[transform:translateZ(0)] [will-change:backdrop-filter] isolate",
  "inline-flex items-stretch gap-0",
  "bg-[color:var(--surface-overlay)] backdrop-blur-[var(--surface-blur)]",
  "border border-[color:var(--surface-overlay-border)]",
  "rounded-[var(--radius-md)]",
  "shadow-[var(--shadow-overlay)]",
  "text-[color:var(--text-overlay)]",
  "px-1.5 py-1",
  "min-h-[40px]",
].join(" ");

function ToolbarRoot(
  { className, children, ...rest }: ToolbarRootProps,
  ref: React.Ref<HTMLDivElement>,
): JSX.Element {
  return (
    <div
      ref={ref}
      role="toolbar"
      {...rest}
      className={cn(baseClass, className)}
    >
      {children}
    </div>
  );
}

const ForwardedToolbarRoot = forwardRef<HTMLDivElement, ToolbarRootProps>(
  ToolbarRoot,
);

// ───── Section ────────────────────────────────────────────────────────────

interface ToolbarSectionProps extends HTMLAttributes<HTMLDivElement> {
  /** Visible label above the controls (uppercase tiny caption). */
  readonly label?: string;
  children?: ReactNode;
}

const ToolbarSection = forwardRef<HTMLDivElement, ToolbarSectionProps>(
  function ToolbarSection({ label, className, children, ...rest }, ref) {
    return (
      <div
        ref={ref}
        {...rest}
        className={cn("flex flex-col justify-center gap-1 px-2.5 py-0.5", className)}
        role="group"
        aria-label={label}
      >
        {label !== undefined ? (
          <span
            aria-hidden
            className="text-[9px] font-mono uppercase tracking-[1px] text-[color:var(--text-overlay-muted)] leading-none"
          >
            {label}
          </span>
        ) : null}
        <div className="flex items-center gap-1.5">{children}</div>
      </div>
    );
  },
);

// ───── Divider ────────────────────────────────────────────────────────────

const ToolbarDivider = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function ToolbarDivider({ className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        aria-hidden
        {...rest}
        className={cn(
          "self-stretch w-px my-1 bg-[color:var(--surface-overlay-border)]",
          className,
        )}
      />
    );
  },
);

// ───── Compound exposure ──────────────────────────────────────────────────

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
