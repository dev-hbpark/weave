// Default frame selection view-model (DR-018) + shared transform-handle
// builder (DR-023).
//
// Each domain item kind authors its own selection view-model and registers it
// with the SelectionChromeRegistry (DR-023 — kind-owned chrome, no central
// god-resolver in FrameStage). This file provides:
//   • `transformHandleSpecs(dirs, opts)` — the shared resize/rotate spec
//     builder every kind VM reuses, so handle ids (`resize-<dir>` / `rotate`)
//     and visuals stay identical across kinds (the layout-constraint filter
//     keys off those ids).
//   • `createFrameDefaultViewModel({ itemKind })` — the plain 8-resize + rotate
//     set for kinds with no special policy (frame / image / video / qr).
//
// DR-017 phase 4: handles are PURE VISUAL specs — gesture lifecycle lives on
// agocraft's `createFrameResizeBinding` / `createFrameRotateBinding`. The button
// emits `data-handle-kind` / `data-handle-dir` so the binding's
// `resolveResizeDir` / `resolveRotateHandle` can dispatch.
//
// SOLID / GRASP:
//   • SRP — view-model = declarative spec; gesture is the binding's concern.
//   • Information Expert — the kind defines its own handle set.
//   • Open / Closed — a new kind = a new view-model + one registration.

import type { ItemSelectionViewModel, SelectionHandleSpec } from "@agocraft/editor";
import { type SelectionHandleDir as HandleDir, SelectionHandleButton } from "@weave/design-system";

export const ALL_RESIZE_DIRS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;

function NOOP() {}

/** Build the resize (per `dirs`) + optional rotate handle specs. Handle ids are
 *  the canonical `resize-<dir>` / `rotate` — the layout-constraint filter and
 *  the agocraft resize/rotate bindings both rely on these. */
export function transformHandleSpecs(
  dirs: ReadonlyArray<HandleDir>,
  opts?: { readonly rotate?: boolean },
): ReadonlyArray<SelectionHandleSpec> {
  const out: SelectionHandleSpec[] = [];
  for (const dir of dirs) {
    const isEdge = dir === "n" || dir === "e" || dir === "s" || dir === "w";
    out.push({
      id: `resize-${dir}`,
      anchor: isEdge ? { type: "edge", side: dir } : { type: "corner", corner: dir },
      // GestureRouter intercepts at capture phase; the button's React
      // onPointerDown is an inert safety net for when the router declines.
      render: () => (
        <SelectionHandleButton
          kind={isEdge ? "edge" : "corner"}
          dir={dir}
          ariaLabel={`Resize ${dir}`}
          onPointerDown={NOOP}
        />
      ),
      order: 10,
    });
  }
  if (opts?.rotate !== false) {
    out.push({
      id: "rotate",
      anchor: { type: "offset-from", from: "n", outwardPx: 24 },
      render: () => (
        <SelectionHandleButton kind="rotation" ariaLabel="Rotate selection" onPointerDown={NOOP} />
      ),
      order: 1,
    });
  }
  return out;
}

export interface FrameDefaultDeps {
  readonly itemKind: string;
  /** Optional override — e.g., media frames might only want corners. */
  readonly resizeDirs?: ReadonlyArray<HandleDir>;
  /** Skip the rotate handle. */
  readonly disableRotate?: boolean;
}

/** The plain transform chrome (8 resize + rotate) for kinds with no special
 *  per-instance policy. Register one per such kind. */
export function createFrameDefaultViewModel(deps: FrameDefaultDeps): ItemSelectionViewModel {
  const dirs = deps.resizeDirs ?? ALL_RESIZE_DIRS;
  return {
    itemKind: deps.itemKind,
    handles: () => transformHandleSpecs(dirs, { rotate: deps.disableRotate !== true }),
    priority: 0,
  };
}
