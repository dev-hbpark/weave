// WI-245 / DR-162 — crop.window UNIT MODEL.
//
// Makes the crop window the expert on its own state: VALIDATION (0..1 range +
// finite rotation), the canonical attrs projection, and its MANIPULATION
// operations (pan / pan-offset / resize / straighten — pure draft transforms,
// previously imported piecemeal from crop-geometry by the command + drag
// handlers). `appliesTo` is always true — crop is kind-agnostic (only media
// renderers read it). The command + the FrameStage/CropEditor drag dispatchers
// ORCHESTRATE through this model; none of them re-implements validation or
// reaches for a raw attrs setter.

import { panCropOffset, panCropWindow, resizeCropWindow, setStraighten } from "../crop-geometry.js";
import {
  CROP_WINDOW_UNIT_KIND,
  type CropWindow,
  IDENTITY_CROP_WINDOW,
  readCropWindow,
} from "../crop-window.js";
import { type UnitModel, type UnitResult, unitErr, unitOk } from "./unit-model.js";

/** Persisted crop-window value — `rotation` is OPTIONAL (omitted = straight), so
 *  a re-save without a rotation does not write a `rotation: 0` key. */
export interface CropWindowInput {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly rotation?: number;
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

function validate(candidate: unknown): UnitResult<CropWindowInput> {
  const c = candidate as Partial<CropWindowInput> | undefined;
  const EPS = 1e-6;
  if (
    c === undefined ||
    !finite(c.x) ||
    !finite(c.y) ||
    !finite(c.w) ||
    !finite(c.h) ||
    c.w <= 0 ||
    c.h <= 0 ||
    c.x < 0 ||
    c.y < 0 ||
    c.x + c.w > 1 + EPS ||
    c.y + c.h > 1 + EPS
  ) {
    return unitErr("invalid-input", "crop must be 0..1 with w,h>0 and x+w<=1, y+h<=1");
  }
  if (c.rotation !== undefined && !finite(c.rotation)) {
    return unitErr("invalid-input", "rotation must be a finite number");
  }
  return unitOk({
    x: c.x,
    y: c.y,
    w: c.w,
    h: c.h,
    ...(c.rotation !== undefined ? { rotation: c.rotation } : {}),
  });
}

/** The crop-window unit model — base contract + its manipulation operations. */
export const cropWindowUnit: UnitModel<CropWindowInput> & {
  readonly identity: CropWindow;
  readonly pan: typeof panCropWindow;
  readonly panOffset: typeof panCropOffset;
  readonly resize: typeof resizeCropWindow;
  readonly straighten: typeof setStraighten;
} = {
  kind: CROP_WINDOW_UNIT_KIND,
  read: readCropWindow,
  validate,
  // Crop is kind-agnostic at the data layer; only image/video renderers read it.
  appliesTo: () => true,
  toAttrs: (v) => ({
    x: v.x,
    y: v.y,
    w: v.w,
    h: v.h,
    ...(v.rotation !== undefined ? { rotation: v.rotation } : {}),
  }),
  identity: IDENTITY_CROP_WINDOW,
  // ── manipulation (pure draft transforms) ──
  pan: panCropWindow,
  panOffset: panCropOffset,
  resize: resizeCropWindow,
  straighten: setStraighten,
};
