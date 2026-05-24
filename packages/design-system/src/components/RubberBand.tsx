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
  /**
   * Optional override for the chip's displayed dimensions. By default
   * the chip shows the visual `rect.width` / `rect.height` (viewport
   * pixels). Hosts whose drag is snapped to a domain grid (e.g.
   * 20-design-pixel rubber-band snap) should pass the SNAPPED domain
   * values so the chip text steps in recognisable increments. Without
   * this, viewport projection rounding hides the snap behaviour.
   */
  readonly displayDimensions?: { readonly width: number; readonly height: number };
  /** Skeleton silhouette for the `previewing` state — domain-aware, host-supplied. */
  readonly children?: ReactNode;
  readonly className?: string;
}

const stateStyles: Record<RubberBandState, string> = {
  drawing: [
    "border-[color:var(--accent)] border-solid border",
    "bg-[color:var(--accent-soft)]",
  ].join(" "),
  // Reviewing — dashed accent border for the "ready to pick" semantic,
  // PLUS a dual-stroke box-shadow stack so the rectangle is visible on
  // ANY canvas tone. The outer dark seam wins on light backgrounds; the
  // inner light highlight wins on dark backgrounds; at least one of the
  // three layers always contrasts the surface behind. (Previous single
  // `--text-soft` border washed out on white design planes — the
  // primary failure mode this avoids.)
  reviewing: [
    "border-[color:var(--accent)] border-dashed border",
    "shadow-[0_0_0_1px_rgba(0,0,0,0.55),inset_0_0_0_1px_rgba(255,255,255,0.85)]",
    "bg-transparent",
  ].join(" "),
  previewing: [
    "border-[color:var(--accent)] border-solid border-2",
    "shadow-[var(--shadow-glow)]",
    "bg-transparent",
  ].join(" "),
};

export const RubberBand = forwardRef<HTMLDivElement, RubberBandProps>(
  function RubberBand(
    { rect, state, showDimensions, displayDimensions, children, className },
    ref,
  ) {
    const showChip = showDimensions ?? state === "drawing";
    const chipDims = displayDimensions ?? { width: rect.width, height: rect.height };
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
        {showChip ? <DimensionsChip width={chipDims.width} height={chipDims.height} /> : null}
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
        // Floats over the canvas during a rubber-band drag — use the overlay
        // token so it stays readable on any design background.
        "bg-[color:var(--surface-overlay)] border-[color:var(--surface-overlay-border)]",
        "backdrop-blur-[var(--surface-blur)]",
        "text-[11px] font-mono tracking-[0.04em] text-[color:var(--text-overlay)]",
        "whitespace-nowrap select-none",
      )}
    >
      {Math.round(width)} × {Math.round(height)}
    </span>
  );
}
