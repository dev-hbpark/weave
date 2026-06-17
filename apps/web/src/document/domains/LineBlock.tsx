// DR-025 / WI-062 — line content View for the `line` item kind.
//
// WI-243 / DR-160 — split into ViewModel + pure View. Paint/marker/shadow/opacity
// resolution + the SVG prop bundles live in `line-item-view-model.ts`; `LineView`
// renders from `{ vm }` ONLY (never reads `item.*`). The container box is a DOM
// measurement the View owns (ResizeObserver) and feeds to `vm.geometryFor`.
//
// A line is STROKE-ONLY (no fill): `lineToSvgGeometry` returns a <polyline>
// (straight) or <path> (smooth) plus optional endpoint markers. Reuses
// ShapeBlock's `ArrowMarker` + `renderGeometryElement`.

import { type JSX, useEffect, useRef, useState } from "react";
import type { AgoItem, LineAttrs } from "../types.js";
import { type LineItemVm, useLineItemViewModel } from "./line-item-view-model.js";
import { ArrowMarker, renderGeometryElement } from "./ShapeBlock.js";

interface LineBlockProps {
  readonly item: AgoItem<"line">;
  readonly onUpdate?: (patch: Partial<LineAttrs>) => void;
}

/** Pure content View for a line item — renders from `{ vm }` ONLY. Owns the
 *  DOM-measured container box (the SVG viewBox needs pixel dimensions) and asks
 *  `vm.geometryFor(bbox)` for the projected geometry. */
export function LineView({ vm }: { readonly vm: LineItemVm }): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [bbox, setBbox] = useState<{ width: number; height: number }>({ width: 100, height: 100 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const apply = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(1, r.width);
      const h = Math.max(1, r.height);
      setBbox((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geom = vm.geometryFor(bbox);

  return (
    <div ref={containerRef} className="relative h-full w-full" style={vm.style}>
      <svg
        viewBox={`0 0 ${bbox.width} ${bbox.height}`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        aria-hidden="true"
        style={{ display: "block", overflow: "visible" }}
      >
        <defs>
          {geom.markers?.map((m) => (
            <ArrowMarker key={m.id} id={m.id} style={m.style} size={m.size} orient={m.orient} />
          ))}
        </defs>
        {renderGeometryElement(geom.element, geom.props, vm.fillProps, vm.strokeProps)}
      </svg>
    </div>
  );
}

/** Registered renderer. Thin shim: resolve the ViewModel, render the pure View.
 *  WI-243 transitional — Phase-0 facet will register `useViewModel`/`view`. */
export function LineBlock({ item }: LineBlockProps): JSX.Element {
  const vm = useLineItemViewModel(item);
  return <LineView vm={vm} />;
}
