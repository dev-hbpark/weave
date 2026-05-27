// DR-design-015 — ContextualToolbar Tier-2 rewrite.
//
// Selection-driven floating bar: a compact icon chip identifying the
// selected item's kind, 1-4 quick-action icons, and a "더보기" button that
// opens a popover with the full property panel. No inline labels, no flex
// fold algorithm, no measurement — the bar's natural width is small and
// fixed (~200-260px) by design.
//
// Compound API:
//   <ContextualToolbar aria-label="..." data-kind="...">
//     <ContextualToolbar.Kind icon={<IconText />} label="Text" />
//     <ContextualToolbar.Quick>
//       <IconBoldToggle /> <IconItalicToggle /> <ColorSwatch />
//     </ContextualToolbar.Quick>
//     <ContextualToolbar.More label="더보기">
//       {/* full vertical property panel */}
//       <ContextualToolbar.Field label="Family">{...}</ContextualToolbar.Field>
//       <ContextualToolbar.Field label="Size">{...}</ContextualToolbar.Field>
//       ...
//     </ContextualToolbar.More>
//   </ContextualToolbar>
//
// Supersedes DR-design-014's priority/fold machinery — that whole algorithm
// is gone. Fixed compact layout instead.

import { forwardRef, type HTMLAttributes, type JSX, type ReactNode } from "react";
import { cn } from "../cn.js";
import { IconMore } from "./Icon.js";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover.js";

// ─── Root ─────────────────────────────────────────────────────────────────

interface ToolbarRootProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

const baseClass = [
  // backdrop-filter under transform — translateZ(0) + will-change keep
  // Chromium from dropping the filter during host transform animations.
  // [[feedback_backdrop_filter_under_transform]]
  "[transform:translateZ(0)] [will-change:backdrop-filter] isolate",
  "inline-flex items-center gap-1 flex-nowrap",
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
    <div ref={ref} role="toolbar" {...rest} className={cn(baseClass, className)}>
      {children}
    </div>
  );
}

const ForwardedToolbarRoot = forwardRef<HTMLDivElement, ToolbarRootProps>(ToolbarRoot);

// ─── Kind chip ────────────────────────────────────────────────────────────

interface ToolbarKindProps {
  /** Icon glyph identifying the selected item's kind. */
  readonly icon: ReactNode;
  /** Aria/tooltip label (e.g., "Text", "Shape"). Localized by host. */
  readonly label: string;
  readonly className?: string;
}

function ToolbarKind({ icon, label, className }: ToolbarKindProps): JSX.Element {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-toolbar-kind
      className={cn(
        "inline-flex items-center justify-center w-8 h-8 shrink-0",
        "rounded-[var(--radius-sm)]",
        "bg-[color:var(--surface-overlay-2)]",
        "text-[color:var(--text-overlay)]",
        className,
      )}
    >
      {icon}
    </span>
  );
}

// ─── Quick action slot ────────────────────────────────────────────────────

interface ToolbarQuickProps {
  /** 1-4 icon buttons + (optional) color swatches. Host supplies the
   *  actual <IconButton> / <ColorPicker> components — the slot is just
   *  layout. */
  children?: ReactNode;
  readonly className?: string;
}

function ToolbarQuick({ children, className }: ToolbarQuickProps): JSX.Element {
  return (
    <div
      role="group"
      aria-label="Quick actions"
      data-toolbar-quick
      className={cn(
        "inline-flex items-center gap-0.5 px-1 shrink-0",
        // Vertical divider between kind chip and quick actions, between
        // quick actions and More, via sibling combinators.
        "[&:not(:first-child)]:border-l [&:not(:first-child)]:border-l-[color:var(--surface-overlay-border)] [&:not(:first-child)]:ml-1 [&:not(:first-child)]:pl-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ─── More popover ─────────────────────────────────────────────────────────

interface ToolbarMoreProps {
  /** Label for the trigger button. Default "더보기". */
  readonly label?: string;
  /** Popover content — vertical stack of fields. Use `Bar.Field` for
   *  consistent label + control rows. */
  children?: ReactNode;
}

function ToolbarMore({ label = "더보기", children }: ToolbarMoreProps): JSX.Element | null {
  // No content → no button. Lets kinds with no overflow (frame today) opt
  // out by simply omitting <Bar.More>.
  if (children === undefined || children === null || children === false) return null;
  return (
    <div className="inline-flex items-center shrink-0 ml-auto border-l border-l-[color:var(--surface-overlay-border)] pl-1.5">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="toolbar-more-trigger"
            aria-label={label}
            title={label}
            className={cn(
              "inline-flex items-center justify-center w-8 h-8",
              "rounded-[var(--radius-sm)]",
              "text-[color:var(--text-overlay)]",
              "hover:bg-[color:var(--surface-overlay-2)]",
              "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
            )}
          >
            <IconMore />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="min-w-[240px] max-w-[300px] p-2.5"
          data-testid="toolbar-more-content"
        >
          <div className="flex flex-col gap-2.5" data-toolbar-more-stack>
            {children}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─── Field row (used inside More popover) ─────────────────────────────────

interface ToolbarFieldProps {
  readonly label: string;
  children?: ReactNode;
  readonly className?: string;
}

function ToolbarField({ label, children, className }: ToolbarFieldProps): JSX.Element {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-col gap-1", className)}>
      <span
        aria-hidden
        className="font-mono uppercase leading-none text-[color:var(--text-overlay-muted)] text-[10px] tracking-[1.2px]"
      >
        {label}
      </span>
      <div className="flex items-center gap-1.5 flex-wrap">{children}</div>
    </div>
  );
}

// ─── Compound exposure ────────────────────────────────────────────────────

interface ContextualToolbarCompound
  extends React.ForwardRefExoticComponent<ToolbarRootProps & React.RefAttributes<HTMLDivElement>> {
  Kind: typeof ToolbarKind;
  Quick: typeof ToolbarQuick;
  More: typeof ToolbarMore;
  Field: typeof ToolbarField;
}

const ContextualToolbar = ForwardedToolbarRoot as ContextualToolbarCompound;
ContextualToolbar.Kind = ToolbarKind;
ContextualToolbar.Quick = ToolbarQuick;
ContextualToolbar.More = ToolbarMore;
ContextualToolbar.Field = ToolbarField;

export {
  ContextualToolbar,
  type ToolbarFieldProps as ContextualToolbarFieldProps,
  type ToolbarKindProps as ContextualToolbarKindProps,
  type ToolbarMoreProps as ContextualToolbarMoreProps,
  type ToolbarQuickProps as ContextualToolbarQuickProps,
  type ToolbarRootProps as ContextualToolbarProps,
};
