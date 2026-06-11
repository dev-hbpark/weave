// WI-172 — render-layer backstop for the chart pipeline. ECharts validates its
// option LAZILY inside setOption / model init (e.g. "Invalid data provider"
// when a series receives non-array data), so a poisoned chart used to throw
// from EChartView's render/effect, and with no boundary above it React
// unmounted the ENTIRE DesignPage tree — killing the canvas and cascade-
// failing every subsequent agent exec ([aku exec ✗]).
//
// This boundary scopes that blast radius to the single chart item: a throwing
// chart renders the same dashed placeholder ChartBlock uses for "no data",
// the rest of the canvas stays alive, and the error + item id are logged so
// the next report carries the failing shape. It composes with the upstream
// layers (normalizeDatasetPayload shape gate at the command boundary,
// sanitizeRenderRows in buildChartOption, try/catch around setOption) — this
// is the last line, not the first.
//
// `extends React.Component` is the forced framework base for error boundaries
// (React has no hook equivalent) — allowed by the composition rule (≤ 1 level,
// framework-forced), same as LexicalErrorBoundary upstream.

import { Component, type JSX, type ReactNode } from "react";

interface ChartErrorBoundaryProps {
  /** The owning chart item's id, for the diagnostic log. */
  readonly chartItemId: string;
  readonly opacity: number;
  readonly children: ReactNode;
}

interface ChartErrorBoundaryState {
  readonly failed: boolean;
}

export class ChartErrorBoundary extends Component<
  ChartErrorBoundaryProps,
  ChartErrorBoundaryState
> {
  override state: ChartErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ChartErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error(
      `[chart] render failed — showing placeholder (item ${this.props.chartItemId})`,
      error,
    );
  }

  override render(): JSX.Element | ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        data-testid="chart-block"
        data-chart-error="true"
        className="absolute inset-0 grid place-items-center rounded-[var(--radius-sm)] border border-dashed border-[color:var(--surface-2-border)] text-[color:var(--text-soft)]"
        style={{ opacity: this.props.opacity }}
      >
        <span className="text-[11px]">차트 — 표시 오류</span>
      </div>
    );
  }
}
