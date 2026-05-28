// Host bridge for camera "fit a design-px box to the viewport".
//
// The fit math needs FrameStage internals (base-fit scale/offset + the
// outer viewport size + the vm.camera channel), but the trigger lives in
// DesignPage (after an item is added into a selected frame). FrameStage
// registers the implementation via `setCameraFitBox`; DesignPage calls
// `cameraFitBox(box)`. Same single-slot pattern as the editor-hotkeys host
// slots, kept in its own module because it is a camera concern, not a
// command.

export interface DesignBox {
  /** All in design pixels (0..designWidth / 0..designHeight). */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

let fitImpl: ((box: DesignBox) => void) | undefined;

/** FrameStage registers the live fit implementation. Returns a disposer. */
export function setCameraFitBox(fn: (box: DesignBox) => void): () => void {
  fitImpl = fn;
  return () => {
    if (fitImpl === fn) fitImpl = undefined;
  };
}

/** Move + zoom the camera so `box` fills the viewport. No-op until a
 *  FrameStage has registered an implementation (e.g. read-only embeds). */
export function cameraFitBox(box: DesignBox): void {
  fitImpl?.(box);
}
