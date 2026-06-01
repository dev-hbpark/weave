// WI-063 (AUDIT-006 F-1b) — pure item-add placement geometry.
//
// Extracted from DesignPage's `computeAddGeometry`. The View resolves the
// placement INPUTS (viewport corners via `screenToDesign`, or the
// containing frame's box via `absoluteFrameBox`) — those reads depend on
// the DOM / live document and stay in the component. This module owns the
// pure arithmetic that turns a resolved box placement into the new item's
// frame (ratio of its parent) plus, for text, the font that fills the box.
//
// Text rule: the box height is snapped to EXACTLY one line of the chosen
// font (rounded `fontSize × lineHeight`) so height tracks the font. The
// font is reported both as a ratio of the parent height (the spec the user
// chose) and as the derived px legacy mirror.

/** Box size + centre, expressed as ratios of the PARENT, plus the parent's
 *  height in design px (drives the font fill for text). */
export interface AddBoxPlacement {
  /** Box width as ratio of the parent (0..1). */
  readonly wRatio: number;
  /** Target box height as ratio of the parent (0..1), before font snap. */
  readonly hTargetRatio: number;
  /** Box centre X as ratio of the parent (0..1). */
  readonly cxRatio: number;
  /** Box centre Y as ratio of the parent (0..1). */
  readonly cyRatio: number;
  /** Parent height in design px. */
  readonly parentHeightPx: number;
}

export interface AddGeometry {
  readonly frame: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly rotation: number;
  };
  /** Present only for text: the font size in px (legacy mirror). */
  readonly fontSizePx?: number;
  /** Present only for text: the font size as a ratio of the parent height. */
  readonly fontSizeRatio?: number;
}

/** Turn a resolved box placement into the new item's frame. For text, the
 *  box height is snapped to one line of the fitted font. */
export function computeAddFrame(
  placement: AddBoxPlacement,
  isText: boolean,
  lineHeight: number,
): AddGeometry {
  const { wRatio, hTargetRatio, cxRatio, cyRatio, parentHeightPx } = placement;

  if (!isText) {
    return {
      frame: {
        x: cxRatio - wRatio / 2,
        y: cyRatio - hTargetRatio / 2,
        width: wRatio,
        height: hTargetRatio,
        rotation: 0,
      },
    };
  }

  // Font fills the target height (one line). Round the px, then snap the box
  // height to that font so height === one line of the font exactly.
  const targetHeightPx = hTargetRatio * parentHeightPx;
  const fontSizePx = Math.max(1, Math.round(targetHeightPx / lineHeight));
  const boxHeightPx = fontSizePx * lineHeight;
  const hRatio = boxHeightPx / parentHeightPx;
  const fontSizeRatio = fontSizePx / parentHeightPx;
  return {
    frame: {
      x: cxRatio - wRatio / 2,
      y: cyRatio - hRatio / 2,
      width: wRatio,
      height: hRatio,
      rotation: 0,
    },
    fontSizePx,
    fontSizeRatio,
  };
}
