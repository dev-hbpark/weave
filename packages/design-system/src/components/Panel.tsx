// WI-019 Phase 1 — Panel primitive (DR-design-008).
//
// Sliding / docked side panel built from compound sub-components
// (Header / Title / Subtitle / Body / Footer / Statusbar). Mirrors the
// Dialog (DR-design-005) pattern: layout flexibility + token-only surface.
//
// Used by WI-019's Point Stack Inspector and intended to absorb the existing
// app-local ThumbnailPanel (Phase 10) + PropertiesPanel (Phase 13) in a
// follow-up PR.

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../cn.js";

type PanelPosition = "docked-right" | "docked-left" | "floating";
type PanelWidth = "sm" | "md" | "lg";

interface PanelProps extends HTMLAttributes<HTMLElement> {
  /** docked-right is the default — pins to the right viewport edge. */
  position?: PanelPosition;
  /** sm = 240px · md = 320px · lg = 480px */
  width?: PanelWidth;
  children?: ReactNode;
}

const widthClass: Record<PanelWidth, string> = {
  sm: "w-[240px]",
  md: "w-[320px]",
  lg: "w-[480px]",
};

const positionClass: Record<PanelPosition, string> = {
  "docked-right": "border-l",
  "docked-left": "border-r",
  // floating uses `--shadow-glass` and self-positions via inline style/parent
  floating: "rounded-[var(--radius-md)] border shadow-[var(--shadow-glass)]",
};

const baseClass = [
  // backdrop-filter under transform requires translateZ(0) + will-change to
  // avoid Chromium dropping it on the parent's transform-animating ancestor.
  // ([[feedback_backdrop_filter_under_transform]])
  "[transform:translateZ(0)] [will-change:backdrop-filter]",
  "flex flex-col min-h-0 overflow-hidden",
  "bg-[color:var(--surface-1)] backdrop-blur-[var(--surface-blur)]",
  "border-[color:var(--surface-1-border)]",
  "text-[color:var(--text-default)]",
].join(" ");

function PanelRoot(
  { position = "docked-right", width = "md", className, children, ...rest }: PanelProps,
  ref: React.Ref<HTMLElement>,
): JSX.Element {
  return (
    // biome-ignore lint/a11y/useSemanticElements: generic floating/docked panel — an explicit region landmark (labelled via aria-label) is intentional; no single HTML element fits all panel uses.
    <aside
      ref={ref}
      role="region"
      {...rest}
      className={cn(baseClass, widthClass[width], positionClass[position], className)}
    >
      {children}
    </aside>
  );
}

const ForwardedPanel = forwardRef<HTMLElement, PanelProps>(PanelRoot);

// ───── compound sub-components ────────────────────────────────────────────

interface SectionProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

const PanelHeader = forwardRef<HTMLDivElement, SectionProps>(function PanelHeader(
  { className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      {...rest}
      className={cn(
        "shrink-0 px-4 pt-4 pb-3",
        "border-b border-[color:var(--border-default)]",
        className,
      )}
    >
      {children}
    </div>
  );
});

const PanelTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function PanelTitle({ className, children, ...rest }, ref) {
    return (
      <h2
        ref={ref}
        {...rest}
        className={cn(
          "text-[13px] font-semibold tracking-[0.3px]",
          "text-[color:var(--text-strong)]",
          className,
        )}
      >
        {children}
      </h2>
    );
  },
);

const PanelSubtitle = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function PanelSubtitle({ className, children, ...rest }, ref) {
    return (
      <p
        ref={ref}
        {...rest}
        className={cn("mt-1 text-[11px] text-[color:var(--text-soft)] leading-5", className)}
      >
        {children}
      </p>
    );
  },
);

const PanelBody = forwardRef<HTMLDivElement, SectionProps>(function PanelBody(
  { className, children, ...rest },
  ref,
) {
  return (
    <div ref={ref} {...rest} className={cn("flex-1 min-h-0 overflow-y-auto px-3 py-2", className)}>
      {children}
    </div>
  );
});

const PanelFooter = forwardRef<HTMLDivElement, SectionProps>(function PanelFooter(
  { className, children, ...rest },
  ref,
) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: panel footer uses contentinfo within a region; no element-level equivalent for a nested contentinfo.
    <div
      ref={ref}
      role="contentinfo"
      {...rest}
      className={cn(
        "shrink-0 px-4 py-3",
        "border-t border-[color:var(--border-default)]",
        className,
      )}
    >
      {children}
    </div>
  );
});

const PanelStatusbar = forwardRef<HTMLDivElement, SectionProps>(function PanelStatusbar(
  { className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      {...rest}
      className={cn(
        "shrink-0 flex justify-between gap-2 px-4 py-2",
        "border-t border-[color:var(--border-default)]",
        "text-[11px] font-mono text-[color:var(--text-soft)]",
        className,
      )}
    >
      {children}
    </div>
  );
});

// ───── compound exposure ──────────────────────────────────────────────────

interface PanelCompound
  extends React.ForwardRefExoticComponent<PanelProps & React.RefAttributes<HTMLElement>> {
  Header: typeof PanelHeader;
  Title: typeof PanelTitle;
  Subtitle: typeof PanelSubtitle;
  Body: typeof PanelBody;
  Footer: typeof PanelFooter;
  Statusbar: typeof PanelStatusbar;
}

const Panel = ForwardedPanel as PanelCompound;
Panel.Header = PanelHeader;
Panel.Title = PanelTitle;
Panel.Subtitle = PanelSubtitle;
Panel.Body = PanelBody;
Panel.Footer = PanelFooter;
Panel.Statusbar = PanelStatusbar;

export { Panel, type PanelPosition, type PanelProps, type PanelWidth };
