// WI-058 — qr content View. Generates the QR module matrix + draws it as a
// single SVG <path> (square / dot / rounded), with foreground + background via
// `paintToSvgFill` (solid OR gradient). Kept SQUARE (preserveAspectRatio) so it
// stays scannable inside a non-square frame.
//
// WI-243 / DR-160 — split into ViewModel + pure View. The matrix, path, paints,
// and logo geometry live in `qr-item-view-model.ts`; `QrView` renders from
// `{ vm }` ONLY (never reads `item.*`), switching on the VM's `empty | ready`
// status.

import type { JSX } from "react";
import type { AgoItem, QrAttrs } from "../types.js";
import { type QrFill, type QrItemVm, useQrItemViewModel } from "./qr-item-view-model.js";

interface QrBlockProps {
  readonly item: AgoItem<"qr">;
  readonly onUpdate?: (patch: Partial<QrAttrs>) => void;
}

function GradientDefs({ defs }: { defs: QrFill["defs"] }): JSX.Element | null {
  if (!defs) return null;
  if (defs.type === "linear") {
    return (
      <linearGradient
        id={defs.id}
        gradientTransform={defs.angle !== undefined ? `rotate(${defs.angle} 0.5 0.5)` : undefined}
      >
        {defs.stops.map((st, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static list with stable order — the array index is a valid, stable key here
          <stop key={i} offset={`${st.offset * 100}%`} stopColor={st.color} />
        ))}
      </linearGradient>
    );
  }
  if (defs.type === "radial") {
    return (
      <radialGradient id={defs.id} cx={defs.cx} cy={defs.cy} r={0.5}>
        {defs.stops.map((st, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static list with stable order — the array index is a valid, stable key here
          <stop key={i} offset={`${st.offset * 100}%`} stopColor={st.color} />
        ))}
      </radialGradient>
    );
  }
  return null;
}

/** Pure content View for a qr item — renders from `{ vm }` ONLY. */
export function QrView({ vm }: { readonly vm: QrItemVm }): JSX.Element {
  if (vm.status === "empty") {
    return (
      <div
        data-testid="qr-block"
        data-qr-empty="true"
        className="absolute inset-0 grid place-items-center rounded-[var(--radius-sm)] border border-dashed border-[color:var(--surface-2-border)] text-[color:var(--text-soft)]"
        style={{ opacity: vm.opacity }}
      >
        <span className="text-[11px]">QR — set data</span>
      </div>
    );
  }

  const { logo } = vm;
  const LogoIcon = logo?.Icon;

  return (
    <div
      data-testid="qr-block"
      data-qr-modules={vm.modulesCount}
      data-qr-logo={vm.logoId}
      className="absolute inset-0"
      style={{ opacity: vm.opacity }}
    >
      <svg
        viewBox={`0 0 ${vm.total} ${vm.total}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        aria-label="QR code"
        style={{ display: "block" }}
      >
        <defs>
          <GradientDefs defs={vm.fg.defs} />
          {vm.bg ? <GradientDefs defs={vm.bg.defs} /> : null}
        </defs>
        {vm.bg ? <rect x={0} y={0} width={vm.total} height={vm.total} fill={vm.bg.value} /> : null}
        <path d={vm.pathD} {...vm.fgProps} shapeRendering={vm.shapeRendering} />
        {logo && LogoIcon ? (
          <>
            <rect
              x={logo.centre - logo.knockSide / 2}
              y={logo.centre - logo.knockSide / 2}
              width={logo.knockSide}
              height={logo.knockSide}
              rx={Math.min(logo.knockSide / 4, 0.8)}
              fill={logo.knockFill}
            />
            <LogoIcon
              x={logo.centre - logo.side / 2}
              y={logo.centre - logo.side / 2}
              width={logo.side}
              height={logo.side}
              stroke={logo.strokeColor}
            />
          </>
        ) : null}
      </svg>
    </div>
  );
}

/** Registered renderer. Thin shim: resolve the ViewModel, render the pure View.
 *  WI-243 transitional — Phase-0 facet will register `useViewModel`/`view`. */
export function QrBlock({ item }: QrBlockProps): JSX.Element {
  const vm = useQrItemViewModel(item);
  return <QrView vm={vm} />;
}
