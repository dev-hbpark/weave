import type { CameraTargetBehavior } from "../types.js";
import type { InteractionAdapter } from "./types.js";

/** Camera-target adapter — A (Prezi). Returns the behavior's `order` for sequential
 *  navigation; no overlay (the camera transform itself is the "render"); no event
 *  handler in PoC (the Stage drives camera state, not adapters). */
export const cameraTargetAdapter: InteractionAdapter<CameraTargetBehavior> = {
  kind: "camera-target",
  getOrder: (behavior) => behavior.order,
  validate: (behavior) => {
    if (!Number.isFinite(behavior.scale) || behavior.scale <= 0) {
      throw new Error(`camera-target ${behavior.id}: scale must be a positive finite number`);
    }
    if (!Number.isInteger(behavior.order) || behavior.order < 0) {
      throw new Error(`camera-target ${behavior.id}: order must be a non-negative integer`);
    }
  },
};
