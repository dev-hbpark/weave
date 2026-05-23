// WI-017 Phase B — RubberBand primitive (DR-design-007).
//
// Visual-only drag rectangle drawer. Three states (`data-state`):
//   - drawing    : 1 px solid accent border + soft accent fill + dimensions chip.
//   - reviewing  : 1 px dashed text-soft border, no fill, no chip.
//   - previewing : 2 px solid accent border + shadow-glow + pulse animation.
//
// Domain-free by design (DR-design-007 §9 trade-off):
//   - Skeleton silhouette for the `previewing` state is passed as `children`
//     by the host (it knows the domain). The primitive only provides the
//     frame, dimensions chip, and pulse keyframe.
//   - `pointer-events: none` — the primitive doesn't capture pointer; the
//     host (DesignPage / NestedFrame) sets pointer capture on its drag-host
//     element. The RubberBand is purely visual.
//   - `aria-hidden` — pointer-only flow; screen reader users do not draw
//     rubber bands, so this surface offers no semantic value to them.
//
// The pulse animation lives in `rubber-band.css` (selector matches the
// `data-rubber-band-state="previewing"` attribute below). The CSS file
// short-circuits the animation under `prefers-reduced-motion: reduce`.

import { forwardRef, type ReactNode } from "react";
import { cn } from "../cn.js";

export type RubberBandState = "drawing" | "reviewing" | "previewing";

export interface RubberBandRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface RubberBandProps {
  readonly rect: RubberBandRect;
  readonly state: RubberBandState;
  /**
   * Show the W × H chip in the top-right corner. Default `true` for the
   * `drawing` state (live measurement feedback), `false` otherwise.
   */
  readonly showDimensions?: boolean;
  /** Skeleton silhouette for the `previewing` state — domain-aware, host-supplied. */
  readonly children?: ReactNode;
  readonly className?: string;
}

const stateStyles: Record<RubberBandState, string> = {
  drawing: [
    "border-[color:var(--accent)] border-solid border",
    "bg-[color:var(--accent-soft)]",
  ].join(" "),
  reviewing: [
    "border-[color:var(--text-soft)] border-dashed border",
    "bg-transparent",
  ].join(" "),
  previewing: [
    "border-[color:var(--accent)] border-solid border-2",
    "shadow-[var(--shadow-glow)]",
    "bg-transparent",
  ].join(" "),
};

export const RubberBand = forwardRef<HTMLDivElement, RubberBandProps>(
  function RubberBand({ rect, state, showDimensions, children, className }, ref) {
    const showChip = showDimensions ?? state === "drawing";
    return (
      <div
        ref={ref}
        // The custom `data-rubber-band-state` attribute is what
        // `rubber-band.css` keys the pulse animation off. We keep `data-state`
        // too (matches Radix convention) for test selectors.
        data-state={state}
        data-rubber-band-state={state}
        data-testid="rubber-band"
        aria-hidden
        className={cn(
          "absolute pointer-events-none",
          "rounded-[var(--radius-sm)]",
          stateStyles[state],
          className,
        )}
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        }}
      >
        {children}
        {showChip ? <DimensionsChip width={rect.width} height={rect.height} /> : null}
      </div>
    );
  },
);

interface DimensionsChipProps {
  readonly width: number;
  readonly height: number;
}

/**
 * `W × H` chip pinned to the top-right outer corner of the band, slightly
 * offset so the chip doesn't overlap the border. Tokens only.
 */
function DimensionsChip({ width, height }: DimensionsChipProps) {
  return (
    <span
      data-testid="rubber-band-dimensions"
      className={cn(
        "absolute -top-6 right-0",
        "inline-flex items-center px-1.5 py-0.5",
        "rounded-[var(--radius-sm)] border",
        "bg-[color:var(--surface-2)] border-[color:var(--border-strong)]",
        "backdrop-blur-[var(--surface-blur)]",
        "text-[11px] font-mono tracking-[0.04em] text-[color:var(--text-strong)]",
        "whitespace-nowrap select-none",
      )}
    >
      {Math.round(width)} × {Math.round(height)}
    </span>
  );
}
