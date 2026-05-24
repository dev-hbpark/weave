// Default frame selection view-model (DR-018).
//
// Each domain item kind (slide / canvas-design / block-doc / media)
// authors its own selection view-model. This file is the default —
// the same 8-resize-handle + 1-rotate-handle catalog the editor has
// always shown for every frame kind.
//
// DR-017 phase 4 follow-up: handles are PURE VISUAL specs now —
// gesture lifecycle lives entirely on agocraft's
// `createFrameResizeBinding` / `createFrameRotateBinding`. The button
// emits `data-handle-kind` / `data-handle-dir` so the binding's
// `resolveResizeDir` / `resolveRotateHandle` can walk the click
// target's ancestors and dispatch.
//
// SOLID / GRASP:
//   • SRP — view-model = declarative spec (id, anchor, visual). The
//     gesture (resize delta math, mode claim, commit) is the
//     binding's concern.
//   • Information Expert — the kind defines its own handle set.
//   • Open / Closed — adding a new kind = new view-model. Existing
//     code unchanged.

import type {
  ItemSelectionViewModel,
  SelectionHandleSpec,
} from "@agocraft/editor";
import {
  type SelectionHandleDir as HandleDir,
  SelectionHandleButton,
} from "@weave/design-system";

const RESIZE_DIRS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;

export interface FrameDefaultDeps {
  readonly itemKind: string;
  /** Optional override — e.g., media frames might only want corners. */
  readonly resizeDirs?: ReadonlyArray<HandleDir>;
  /** Skip the rotate handle (e.g., text-only frames where rotation has
   *  no domain meaning). */
  readonly disableRotate?: boolean;
}

export function createFrameDefaultViewModel(
  deps: FrameDefaultDeps,
): ItemSelectionViewModel {
  const dirs = deps.resizeDirs ?? RESIZE_DIRS;

  return {
    itemKind: deps.itemKind,
    handles(_info): ReadonlyArray<SelectionHandleSpec> {
      const out: SelectionHandleSpec[] = [];
      for (const dir of dirs) {
        const isEdge = dir === "n" || dir === "e" || dir === "s" || dir === "w";
        out.push({
          id: `resize-${dir}`,
          anchor: isEdge
            ? { type: "edge", side: dir }
            : { type: "corner", corner: dir },
          render: () => (
            // GestureRouter intercepts at capture phase; the button's
            // React onPointerDown is a no-op safety net for the rare
            // case the router declines (e.g., another mode owns the
            // canvas), keeping the handle inert rather than firing
            // unrelated handlers.
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
      if (deps.disableRotate !== true) {
        out.push({
          id: "rotate",
          anchor: { type: "offset-from", from: "n", outwardPx: 24 },
          render: () => (
            <SelectionHandleButton
              kind="rotation"
              ariaLabel="Rotate selection"
              onPointerDown={NOOP}
            />
          ),
          order: 1,
        });
      }
      return out;
    },
    priority: 0,
  };
}

function NOOP() {}
