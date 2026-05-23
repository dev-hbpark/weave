// WI-013 Phase 3 (minimal) — bridge weave's local manipulation registry into
// `@agocraft/editor`'s `editor.manipulations` so plugins / future SelectionLayer
// state-machine integration can resolve capabilities through the agocraft surface.
//
// Scope (intentional):
//   - Only the canvas-shape "move" / "resize" / "rotate" capabilities are
//     bridged. block-level manipulation lands when the local types.ts → agocraft
//     migration is complete (Phase 3 full).
//   - The bridged agocraft capability's lifecycle callbacks (`update` /
//     `commit`) delegate to the weave-local apply functions. weave's local
//     registry remains the SelectionLayer's source of truth for now; agocraft
//     gets an observable mirror of the same capabilities.

import type {
  ManipulationCapability as AgocraftCapability,
  ManipulationContext,
  ManipulationRegistry as AgocraftRegistry,
} from "@agocraft/editor";
import type { CanvasShapeTarget } from "./capabilities/canvas-shape.js";
import type { ManipulationCapability as WeaveCapability } from "./types.js";

type MovePayload = { readonly target: CanvasShapeTarget; readonly dx: number; readonly dy: number };
type ResizePayload = {
  readonly target: CanvasShapeTarget;
  readonly dw: number;
  readonly dh: number;
  readonly dir: Parameters<NonNullable<WeaveCapability["resize"]>["apply"]>[1]["dir"];
};
type RotatePayload = { readonly target: CanvasShapeTarget; readonly deltaRadians: number };

interface BridgeDeps {
  /** weave's local capability for `canvas-shape`. */
  readonly weaveCanvasShape: WeaveCapability<"canvas-shape", CanvasShapeTarget>;
  /** The agocraft Editor's manipulation registry. */
  readonly agocraftRegistry: AgocraftRegistry;
}

/** Register agocraft-side manipulation capabilities mirrored from weave's
 *  canvas-shape capability. Returns a single teardown that unregisters all
 *  bridged entries. */
export function bridgeCanvasShapeIntoAgocraft(deps: BridgeDeps): () => void {
  const { weaveCanvasShape, agocraftRegistry } = deps;
  const offs: Array<() => void> = [];

  // weave's apply is immediate (each call mutates state via setter), so both
  // `update` and `commit` route to the same apply. A future Phase 2b would
  // separate update (provisional) from commit (final transaction).
  if (weaveCanvasShape.move !== undefined) {
    const applyMove = (payload: MovePayload) => {
      weaveCanvasShape.move?.apply(payload.target, { dx: payload.dx, dy: payload.dy });
    };
    const move: AgocraftCapability<MovePayload> = {
      id: "canvas-shape.move",
      targetKind: "canvas-shape",
      category: "move",
      update: applyMove,
      commit: applyMove,
    };
    offs.push(agocraftRegistry.register(move as AgocraftCapability));
  }

  if (weaveCanvasShape.resize !== undefined) {
    const applyResize = (payload: ResizePayload) => {
      weaveCanvasShape.resize?.apply(payload.target, {
        dw: payload.dw,
        dh: payload.dh,
        dir: payload.dir,
      });
    };
    const resize: AgocraftCapability<ResizePayload> = {
      id: "canvas-shape.resize",
      targetKind: "canvas-shape",
      category: "resize",
      update: applyResize,
      commit: applyResize,
    };
    offs.push(agocraftRegistry.register(resize as AgocraftCapability));
  }

  if (weaveCanvasShape.rotate !== undefined) {
    const applyRotate = (payload: RotatePayload) => {
      weaveCanvasShape.rotate?.apply(payload.target, payload.deltaRadians);
    };
    const rotate: AgocraftCapability<RotatePayload> = {
      id: "canvas-shape.rotate",
      targetKind: "canvas-shape",
      category: "rotate",
      update: applyRotate,
      commit: applyRotate,
    };
    offs.push(agocraftRegistry.register(rotate as AgocraftCapability));
  }

  return () => {
    for (const off of offs) off();
  };
}
