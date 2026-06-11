// WI-074 — shared rotation snapping for the rotate handle (frame rotate AND crop
// straighten). Two behaviors:
//   • Shift held → quantize to 15° steps (WI-183/DR-119: 10°→15°, matching the
//     Figma/Keynote/Canva consensus so Shift lands on 45° diagonals).
//   • Otherwise → snap to the nearest cardinal (0/90/180/270) when within a small
//     threshold, so the handle "locks" to axis-aligned orientations.
// Returns the angle (radians) plus the cardinal degree it locked onto (for the
// on-screen guide), or null when free.

const D2R = Math.PI / 180;
export const ROTATION_STEP_RAD = 15 * D2R;
export const CARDINAL_SNAP_THRESHOLD_RAD = 5 * D2R;
const HALF_PI = Math.PI / 2;

/** 0/90/180/270 for an angle that is (within ε) a multiple of 90°, else null. */
function cardinalDegOf(rad: number): number | null {
  const k = Math.round(rad / HALF_PI);
  if (Math.abs(rad - k * HALF_PI) > 1e-6) return null;
  return (((k % 4) + 4) % 4) * 90;
}

export interface RotationSnap {
  /** Snapped angle, radians. */
  readonly rotation: number;
  /** 0/90/180/270 when locked to a cardinal (drives the guide), else null. */
  readonly cardinalDeg: number | null;
}

export function snapRotation(rad: number, shiftKey: boolean): RotationSnap {
  if (!Number.isFinite(rad)) return { rotation: 0, cardinalDeg: 0 };
  if (shiftKey) {
    const snapped = Math.round(rad / ROTATION_STEP_RAD) * ROTATION_STEP_RAD;
    return { rotation: snapped, cardinalDeg: cardinalDegOf(snapped) };
  }
  const k = Math.round(rad / HALF_PI);
  const cardinal = k * HALF_PI;
  if (Math.abs(rad - cardinal) <= CARDINAL_SNAP_THRESHOLD_RAD) {
    return { rotation: cardinal, cardinalDeg: (((k % 4) + 4) % 4) * 90 };
  }
  return { rotation: rad, cardinalDeg: null };
}
