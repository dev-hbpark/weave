// WI-092 — chart-element selection view-model: the weave-owned drag handles for
// the currently selected chart DATUM.
//
// Counterpart to `poly-vertex-handle` but for charts: registers for itemKind
// "chart" (the registry MERGES it with the default frame resize / rotate chrome,
// so a selected chart still shows its box handles), and adds the geometry
// provider's handles for the element-selected datum. A family decides which
// handles exist (chart-geometry-provider):
//   • value handle — bar top / line·area point (vertical) / pie sweep (angular)
//     → writes the datum's DATASET cell (`weave.dataset.update` → setCell, the
//     SAME path the props-panel value field uses).
//   • bar-width handle — a bar's side edge (horizontal) → writes the chart's
//     `barWidth` attr (`weave.item.update`); ECharts barWidth is per-series, so
//     it thickens every bar together.
//
// Each handle's write strategy is resolved from a per-KIND registry (Rule 6 — no
// switch in the drag loop). Every drag is one undoable transaction: the 60 Hz
// burst folds into a single history entry via `mergeKeyOf` (same dataset/item
// attr target each move).
//
// The handles are self-contained reactive components (subscribe to the element +
// geometry stores, track the mark via rAF) and are PORTALED to `document.body`
// so `position: fixed` resolves against the viewport, not the canvas's
// CSS-transform containing block.

import type { Editor, ItemSelectionViewModel, SelectionBounds } from "@agocraft/editor";
import { type JSX, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { type DatasetPayload, setCell } from "../dataset/dataset-store.js";
import {
  type ChartElementRef,
  useSelectedChartElement,
} from "../domains/chart/chart-element-store.js";
import {
  type ChartElementBounds,
  type ChartGeometryProvider,
  type ChartHandleKind,
  type ChartHandleSpec,
  useChartGeometry,
} from "../domains/chart/chart-geometry-store.js";
import { useHoveredBarIndex } from "../domains/chart/chart-hover-store.js";
import { setDatumOverride } from "../domains/chart/chart-overrides.js";
import type { ChartOverrides } from "../types.js";
import { startHandleGesture, toHandlePointer } from "./handle-gesture-runner.js";

/** The chart's dataset binding, read live from the document by the host. */
export interface ChartDataBinding {
  readonly datasetId: string;
  /** First value column of the encoding — the fallback value column when the
   *  selected datum carries no series name (single-series chart). */
  readonly valueColumn: string;
}

export interface ChartElementViewModelDeps {
  readonly editor: Editor;
  /** Resolve a chart item's dataset id + default value column from live attrs. */
  readonly getBinding: (itemId: string) => ChartDataBinding | null;
}

/** Round a dataset value to 3 significant figures so dragged values read cleanly
 *  (41.7, not 41.68329) without snapping integer datasets to coarse steps. */
function roundNice(v: number): number {
  if (!Number.isFinite(v) || v === 0) return 0;
  const r = Number(v.toPrecision(3));
  return Number.isFinite(r) ? r : 0;
}

/** Round a barWidth fraction to whole percents (0.01 steps). */
function roundFrac(v: number): number {
  return Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
}

/** Context a per-kind write strategy needs. */
interface ApplyContext {
  readonly deps: ChartElementViewModelDeps;
  readonly chartItemId: string;
  /** The selected datum (null for chart-level handles like `global-bar-width`). */
  readonly ref: ChartElementRef | null;
}

/** Per-kind drag write strategy (Rule 6 — registry, no switch). A builder returns
 *  the `apply(rawScalar)` that commits ONE drag move, or null when the chart
 *  isn't bound for that kind. Each `apply` rounds + writes through a command, so
 *  `mergeKeyOf` folds the drag into one undo step. */
type ApplyBuilder = (c: ApplyContext) => ((raw: number) => void) | null;

const APPLY_BY_KIND: Readonly<Record<ChartHandleKind, ApplyBuilder>> = {
  // Datum value → the bound dataset cell (height / line point / pie sweep).
  value: ({ deps, chartItemId, ref }) => {
    if (ref === null) return null;
    const binding = deps.getBinding(chartItemId);
    const rowIndex = ref.rowIndex ?? -1;
    if (binding === null || binding.datasetId === "" || rowIndex < 0) return null;
    const valueColumn = ref.seriesName ?? binding.valueColumn;
    if (valueColumn === "") return null;
    return (raw) =>
      deps.editor.exec("weave.dataset.update", {
        id: binding.datasetId,
        patch: (ds: DatasetPayload) => setCell(ds, rowIndex, valueColumn, String(roundNice(raw))),
      });
  },
  // PER-BAR thickness → this datum's override (only this bar changes; the width
  // handle is offered only for single-series bars, so the key is the bare
  // category — matching the renderer's bare-category fallback lookup).
  "bar-width": ({ deps, chartItemId, ref }) => {
    const category = ref?.category;
    if (category === undefined) return null;
    return (raw) =>
      deps.editor.exec("weave.item.update", {
        itemId: chartItemId,
        patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
          attrs: {
            ...prev.attrs,
            overrides: setDatumOverride(
              prev.attrs.overrides as ChartOverrides | undefined,
              category,
              {
                barWidth: roundFrac(raw),
              },
            ),
          },
        }),
      });
  },
  // CHART-level thickness → the chart-wide `attrs.barWidth` (every bar's default).
  // Per-datum overrides still win, so this is the "all bars" knob at the parent
  // selection level (the per-bar handle is the exception at the drilled level).
  "global-bar-width": ({ deps, chartItemId }) => {
    return (raw) =>
      deps.editor.exec("weave.item.update", {
        itemId: chartItemId,
        attrs: { barWidth: roundFrac(raw) },
      });
  },
  // Donut hole → variant.innerRadius. Uses the patch form to MERGE into the
  // existing variant (the shallow `attrs` merge would drop sibling variant flags).
  "pie-inner-radius": ({ deps, chartItemId }) => {
    return (raw) =>
      deps.editor.exec("weave.item.update", {
        itemId: chartItemId,
        patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
          attrs: {
            ...prev.attrs,
            variant: {
              ...((prev.attrs.variant as Record<string, unknown> | undefined) ?? {}),
              innerRadius: roundFrac(raw),
            },
          },
        }),
      });
  },
};

const HANDLE_PX = 13;

const CURSOR_BY_AXIS: Readonly<Record<ChartHandleSpec["anchor"]["axis"], string>> = {
  y: "ns-resize",
  x: "ew-resize",
  angular: "ew-resize",
  radial: "move",
};

const LABEL_BY_KIND: Readonly<Record<ChartHandleKind, string>> = {
  value: "값 조절 (드래그로 데이터 변경)",
  "bar-width": "막대 두께 조절 (드래그로 너비 변경)",
  "global-bar-width": "전체 막대 두께 (드래그로 모든 막대 너비 변경)",
  "pie-inner-radius": "도넛 구멍 조절 (드래그로 안쪽 반지름 변경)",
};

const TESTID_BY_KIND: Readonly<Record<ChartHandleKind, string>> = {
  value: "chart-value-handle",
  "bar-width": "chart-width-handle",
  "global-bar-width": "chart-global-width-handle",
  "pie-inner-radius": "chart-inner-radius-handle",
};

interface ChartChrome {
  readonly specs: ReadonlyArray<ChartHandleSpec>;
  readonly bounds: ChartElementBounds | null;
}

const EMPTY_CHROME: ChartChrome = { specs: [], bounds: null };

/** Track the selected datum's handles + selection bound across pan / zoom / data
 *  changes. Read from the geometry provider every animation frame while a datum
 *  is selected (the canvas pans via CSS transform — no scroll/resize the store
 *  could hook), updating state only when the chrome actually moves. */
function useChartChrome(
  ref: ChartElementRef | null,
  provider: ChartGeometryProvider | undefined,
): ChartChrome {
  const [chrome, setChrome] = useState<ChartChrome>(EMPTY_CHROME);
  const active = ref !== null && ref.role === "datum" && provider !== undefined;
  useEffect(() => {
    if (!active || ref === null || provider === undefined) {
      setChrome(EMPTY_CHROME);
      return;
    }
    let raf = 0;
    let prevKey = "";
    const tick = (): void => {
      const specs = provider.handles(ref);
      const bounds = provider.bounds(ref);
      const key = `${specs
        .map((s) => `${s.kind}:${s.anchor.x.toFixed(1)},${s.anchor.y.toFixed(1)}`)
        .join("|")}#${
        bounds === null
          ? ""
          : `${bounds.left.toFixed(1)},${bounds.top.toFixed(1)},${bounds.width.toFixed(1)},${bounds.height.toFixed(1)}`
      }`;
      if (key !== prevKey) {
        prevKey = key;
        setChrome({ specs, bounds });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, ref, provider]);
  return chrome;
}

/** Start a drag for one handle: each move maps the pointer to this handle's new
 *  scalar (via the live spec) and commits it through the kind's write strategy.
 *  Near-identical scalars are skipped so a still pointer doesn't spam writes. */
function startHandleDrag(
  apply: (raw: number) => void,
  spec: ChartHandleSpec,
  chartItemId: string,
  e: {
    clientX: number;
    clientY: number;
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
  },
  onEnd?: () => void,
): void {
  let lastKey: number | null = null;
  const write = (clientX: number, clientY: number): void => {
    const raw = spec.valueAtClient(clientX, clientY);
    if (raw === null) return;
    const k = Math.round(raw * 1000);
    if (k === lastKey) return;
    lastKey = k;
    apply(raw);
  };
  startHandleGesture({
    kind: "chart-value-drag",
    handleId: `chart.${spec.kind}`,
    itemId: chartItemId,
    origin: toHandlePointer(e),
    sink: {
      update: (p) => write(p.clientX, p.clientY),
      commit: (p) => {
        write(p.clientX, p.clientY);
        onEnd?.();
      },
      cancel: () => onEnd?.(),
    },
  });
}

/** One portaled handle button at `spec.anchor` (client coords). `visible=false`
 *  (chart-level handles before hover) keeps it in the DOM but transparent +
 *  non-interactive, fading in on reveal; `onPin` reports its own hover / drag so
 *  the reveal survives moving the pointer from the bar onto the handle. */
function HandleButton({
  spec,
  chartItemId,
  apply,
  visible = true,
  onPin,
}: {
  readonly spec: ChartHandleSpec;
  readonly chartItemId: string;
  readonly apply: (raw: number) => void;
  readonly visible?: boolean;
  readonly onPin?: (pinned: boolean) => void;
}): JSX.Element {
  const { anchor, kind } = spec;
  return createPortal(
    <button
      type="button"
      aria-label={LABEL_BY_KIND[kind]}
      title={LABEL_BY_KIND[kind]}
      data-handle-kind="custom"
      data-handle-id={`chart.${kind}`}
      data-chart-handle={chartItemId}
      data-handle-hidden={visible ? undefined : "true"}
      data-testid={TESTID_BY_KIND[kind]}
      onPointerEnter={onPin ? () => onPin(true) : undefined}
      onPointerLeave={onPin ? () => onPin(false) : undefined}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.button !== 0) return;
        onPin?.(true);
        startHandleDrag(apply, spec, chartItemId, e, onPin ? () => onPin(false) : undefined);
      }}
      style={{
        position: "fixed",
        left: anchor.x,
        top: anchor.y,
        width: HANDLE_PX,
        height: HANDLE_PX,
        transform: "translate(-50%, -50%)",
        // width handles read as a pill (horizontal grip); others a disc.
        borderRadius: kind === "bar-width" || kind === "global-bar-width" ? "3px" : "50%",
        background: "var(--accent, #4f46e5)",
        border: "2px solid var(--surface-1, #fff)",
        boxShadow: "0 0 0 1px var(--accent, #4f46e5), 0 1px 4px rgba(0,0,0,0.3)",
        cursor: CURSOR_BY_AXIS[anchor.axis],
        padding: 0,
        touchAction: "none",
        zIndex: 50,
        // Hidden chart-level handles: invisible + click-through until revealed.
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 0.12s ease",
      }}
    />,
    document.body,
  );
}

/** A chart-level global width handle that stays HIDDEN until its bar is hovered
 *  (or the handle itself is hovered / dragged — `pinned`). */
function GlobalWidthHandle({
  spec,
  chartItemId,
  apply,
}: {
  readonly spec: ChartHandleSpec;
  readonly chartItemId: string;
  readonly apply: (raw: number) => void;
}): JSX.Element {
  const hovered = useHoveredBarIndex(chartItemId);
  const [pinned, setPinned] = useState(false);
  const visible = hovered === (spec.rowIndex ?? -1) || pinned;
  return (
    <HandleButton
      spec={spec}
      chartItemId={chartItemId}
      apply={apply}
      visible={visible}
      onPin={setPinned}
    />
  );
}

/** CHART-level width handles: one per bar (single-series bar), each dragging the
 *  GLOBAL barWidth. Tracked via rAF while the chart is selected with no bar
 *  drilled in. */
function useGlobalBarHandles(
  provider: ChartGeometryProvider | undefined,
  active: boolean,
): ReadonlyArray<ChartHandleSpec> {
  const [specs, setSpecs] = useState<ReadonlyArray<ChartHandleSpec>>([]);
  useEffect(() => {
    if (!active || provider === undefined) {
      setSpecs([]);
      return;
    }
    let raf = 0;
    let prevKey = "";
    const tick = (): void => {
      const next = provider.barWidthHandles();
      const key = next.map((s) => `${s.anchor.x.toFixed(1)},${s.anchor.y.toFixed(1)}`).join("|");
      if (key !== prevKey) {
        prevKey = key;
        setSpecs(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, provider]);
  return specs;
}

/** weave-owned chart handles, two levels:
 *   • a BAR (datum) is drilled in → that bar's bound + height + per-bar width
 *     (+ pie sweep / donut) handles.
 *   • only the CHART is selected → a width handle on EVERY bar, all dragging the
 *     chart-wide `barWidth` (single-series bar only). */
function ChartHandles({
  chartItemId,
  deps,
}: {
  readonly chartItemId: string;
  readonly deps: ChartElementViewModelDeps;
}): JSX.Element | null {
  const ref = useSelectedChartElement(chartItemId);
  const provider = useChartGeometry(chartItemId);
  const datumSelected = ref !== null && ref.role === "datum";
  const { specs, bounds } = useChartChrome(datumSelected ? ref : null, provider);
  const globalSpecs = useGlobalBarHandles(provider, !datumSelected);

  // Drilled into a bar → that bar's chrome.
  if (datumSelected) {
    if (specs.length === 0) return null;
    const rendered: JSX.Element[] = [];
    // The selection OUTLINE first (the "바운드" wrapping the mark) —
    // non-interactive so it never steals the handle's pointer.
    if (bounds !== null) rendered.push(<BoundOutline key="bound" bounds={bounds} />);
    for (const spec of specs) {
      const apply = APPLY_BY_KIND[spec.kind]({ deps, chartItemId, ref });
      if (apply === null) continue;
      rendered.push(
        <HandleButton key={spec.kind} spec={spec} chartItemId={chartItemId} apply={apply} />,
      );
    }
    // biome-ignore lint/complexity/noUselessFragments: coerces the JSX.Element[] into a single JSX.Element (this function returns JSX.Element | null)
    return rendered.length > 0 ? <>{rendered}</> : null;
  }

  // Chart level (no bar drilled) → a global width handle on every bar, each
  // HIDDEN until that bar is hovered.
  if (globalSpecs.length === 0) return null;
  const rendered: JSX.Element[] = [];
  globalSpecs.forEach((spec, i) => {
    const apply = APPLY_BY_KIND[spec.kind]({ deps, chartItemId, ref: null });
    if (apply !== null) {
      rendered.push(
        <GlobalWidthHandle
          key={`global-${i}`}
          spec={spec}
          chartItemId={chartItemId}
          apply={apply}
        />,
      );
    }
  });
  // biome-ignore lint/complexity/noUselessFragments: coerces the JSX.Element[] into a single JSX.Element (this function returns JSX.Element | null)
  return rendered.length > 0 ? <>{rendered}</> : null;
}

/** The portaled, non-interactive selection outline around the selected mark. */
function BoundOutline({ bounds }: { readonly bounds: ChartElementBounds }): JSX.Element {
  return createPortal(
    <div
      data-testid="chart-element-bound"
      style={{
        position: "fixed",
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        // High contrast against BOTH the (themed, often vivid) bar fill and the
        // dark canvas: a white outline with a dark halo (the accent reads as the
        // handles, which sit on this box's edges).
        border: "1.5px solid rgba(255,255,255,0.95)",
        boxShadow: "0 0 0 1.5px rgba(0,0,0,0.45)",
        borderRadius: 3,
        boxSizing: "border-box",
        pointerEvents: "none",
        zIndex: 49,
      }}
    />,
    document.body,
  );
}

export function createChartElementViewModel(
  deps: ChartElementViewModelDeps,
): ItemSelectionViewModel {
  return {
    itemKind: "chart",
    // Above the frame chrome so the value handles win the pointer when they
    // overlap a resize edge.
    priority: 10,
    handles(info) {
      return [
        {
          id: "chart-handles",
          order: 220,
          // The components self-position (portaled, fixed); keep the spec wrapper
          // offscreen so an inactive (null-render) handle never intercepts a click.
          anchor: {
            type: "freeform" as const,
            layout: (_bounds: SelectionBounds) => ({ x: -99999, y: -99999 }),
          },
          render: () => <ChartHandles chartItemId={info.itemId} deps={deps} />,
        },
      ];
    },
  };
}
