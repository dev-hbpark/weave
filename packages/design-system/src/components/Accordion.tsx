// DR-design-021 — Accordion (disclosure) primitive for progressive
// disclosure inside the ContextualToolbar's "More" popover.
//
// Each AccordionItem is self-contained (owns its open state via defaultOpen),
// so MULTIPLE sections can be open at once — NN/g guidance: don't force a
// single-open accordion in a property panel, users compare across sections.
// One level only (no nested accordions). Header = full-width button with a
// caret that rotates on open; aria-expanded / aria-controls wired for a11y.
//
// Tree-shake: ESM, sideEffects:false, no decorators, named exports.

import { type ReactNode, useId, useState } from "react";
import { cn } from "../cn.js";
import { IconChevronRight } from "./Icon.js";

export interface AccordionProps {
  children?: ReactNode;
  readonly className?: string;
}

/** Layout wrapper — a vertical stack of AccordionItems with hairline
 *  dividers. Purely presentational; open state lives per-item. */
export function Accordion({ children, className }: AccordionProps): JSX.Element {
  return (
    <div
      data-testid="accordion"
      className={cn(
        "flex flex-col divide-y divide-[color:var(--surface-overlay-border)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface AccordionItemProps {
  readonly label: string;
  /** Optional leading icon in the header. */
  readonly icon?: ReactNode;
  /** Open on first render. Default false (collapsed). Put the most-used
   *  group's `defaultOpen` to true; keep advanced groups collapsed. */
  readonly defaultOpen?: boolean;
  children?: ReactNode;
  readonly className?: string;
  readonly "data-testid"?: string;
}

export function AccordionItem({
  label,
  icon,
  defaultOpen = false,
  children,
  className,
  "data-testid": testid,
}: AccordionItemProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div className={cn("py-1", className)} data-state={open ? "open" : "closed"}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((v) => !v)}
        {...(testid !== undefined ? { "data-testid": `${testid}-trigger` } : {})}
        className={cn(
          "flex w-full items-center gap-2 px-1 py-1.5 rounded-[var(--radius-sm)]",
          "text-[11px] font-mono uppercase tracking-[1.2px]",
          "text-[color:var(--text-overlay-muted)]",
          "hover:text-[color:var(--text-overlay)]",
          "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
          "transition-colors duration-[var(--motion-quick)]",
        )}
      >
        <IconChevronRight
          size={13}
          className={cn(
            "shrink-0 transition-transform duration-[var(--motion-quick)]",
            open && "rotate-90",
          )}
        />
        {icon !== undefined ? (
          <span aria-hidden className="inline-flex shrink-0">
            {icon}
          </span>
        ) : null}
        <span className="flex-1 text-left">{label}</span>
      </button>
      {open ? (
        <section
          id={contentId}
          aria-label={label}
          {...(testid !== undefined ? { "data-testid": `${testid}-content` } : {})}
          className="flex flex-col gap-2.5 px-1 pt-1.5 pb-1"
        >
          {children}
        </section>
      ) : null}
    </div>
  );
}
