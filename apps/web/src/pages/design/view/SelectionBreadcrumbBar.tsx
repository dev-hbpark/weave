import type { Document as AgocraftDocument } from "@agocraft/core";
import { cn, Toolbar } from "@weave/design-system";
import { Fragment } from "react";
import { buildBreadcrumb } from "../../../document/selection-breadcrumb/breadcrumb-trail.js";

// WI-214 / DR-137 — selection breadcrumb bar. Renders the ancestor path of
// the currently-selected frame (Top › Row › Cell); clicking a segment
// selects that ancestor.
//
// Why: when a nested frame is fully tiled by its children there is no empty
// pixel to click for the container itself (spatial selection can't reach
// it). The breadcrumb is hierarchy-based, so it reaches any covering
// ancestor regardless of packing — and surfaces the otherwise-hidden
// Shift+Enter "select parent" affordance.
//
// Presentational only: no portal, no fixed positioning, no visibility gate.
// It is rendered as the top row of the centered selection-chrome stack
// inside SelectionToolbarOverlay, which owns the portal, the
// visible/interactive gating, and the pointer-events policy (DR-137 §1 —
// centered so it never sits in the roaming Aku launcher's top-corner path,
// unlike a separate left-aligned bar would).

export interface SelectionBreadcrumbBarProps {
  readonly document: AgocraftDocument;
  /** The single selected frame id, or null when nothing / multiple are
   *  selected (the breadcrumb is a single-path concept — DR-137 §2). */
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}

export function SelectionBreadcrumbBar({
  document: doc,
  selectedId,
  onSelect,
}: SelectionBreadcrumbBarProps): React.ReactNode {
  // Empty unless the selection is genuinely nested (trail ≥ 2) — DR-137 §2.
  const segments = buildBreadcrumb(doc, selectedId);
  if (segments.length === 0) return null;

  return (
    <Toolbar
      aria-label="선택 경로"
      // Match the floating-menu surface used by the property bar and other
      // overlays (--surface-overlay, near-opaque + shadow) — the bare Toolbar
      // primitive defaults to the subtle --surface-1 (alpha ~0.05) which reads
      // as transparent against the canvas. DR-137 §1 keeps both stacked bars
      // visually consistent.
      className={cn(
        "max-w-[min(70vw,640px)] flex-nowrap overflow-x-auto",
        "bg-[color:var(--surface-overlay)] border-[color:var(--surface-overlay-border)]",
        "text-[color:var(--text-overlay)] shadow-[var(--shadow-overlay)]",
      )}
      data-testid="selection-breadcrumb"
    >
      {segments.map((seg, i) => (
        <Fragment key={seg.id}>
          {i > 0 ? (
            <span
              aria-hidden
              className="select-none px-0.5 text-[12px] text-[color:var(--text-muted)]"
            >
              ›
            </span>
          ) : null}
          <button
            type="button"
            aria-current={seg.isCurrent ? "true" : undefined}
            title={seg.label}
            data-testid={`breadcrumb-seg-${seg.id}`}
            onClick={() => onSelect(seg.id)}
            className={cn(
              "max-w-[14ch] truncate rounded-[var(--radius-sm)] px-2 py-1",
              "text-[12px] font-medium tracking-tight",
              "transition-[background,color] duration-[var(--motion-quick)]",
              "hover:bg-[color:var(--surface-2)] focus-visible:outline-none",
              "focus-visible:shadow-[var(--focus-ring)]",
              seg.isCurrent
                ? "text-[color:var(--text-strong)]"
                : "text-[color:var(--text-muted)] hover:text-[color:var(--text-strong)]",
            )}
          >
            {seg.label}
          </button>
        </Fragment>
      ))}
    </Toolbar>
  );
}
