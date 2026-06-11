// WI-183 — pure resize geometry, extracted from FrameStage's
// frameAccess.computeResize so the transform MODIFIERS (Shift = corner aspect
// lock, Alt = resize from center) can be unit-tested and applied BEFORE the
// DR-022 text font-scaling step (the glyph scale must read the FINAL height,
// not the pre-modifier height).
//
// Two call sites share this function:
//   • frameAccess.computeResize (FrameStage) — no modifiers (the agocraft
//     FrameAccess interface is 5-arg; base behavior unchanged).
//   • the resize handle sink (FrameStage) — passes modifiers read off the
//     HandlePointer (`p.shiftKey` / `p.altKey`).
//
// Modifier semantics (SLIDE_DECK_INTERACTION_SPEC §4 Batch 1, 5-tool consensus):
//   • Shift + CORNER drag → preserve the original aspect ratio. Both frame
//     ratios share the same parent, so aspect lock in ratio space is
//     `nw/nh == ow/oh` — parent factors cancel. The dominant axis (larger
//     relative change) drives the scale; the box re-anchors at the corner
//     opposite the handle. Shift + edge stays a plain edge drag.
//   • Alt + any drag → resize symmetrically about the center: each touched
//     axis grows by twice its delta and the center stays fixed.
//   • Shift+Alt compose: aspect lock first, then center doubling — both axes
//     double by the same factor, so the locked ratio survives.

import type { FontSizeSpec } from "@agocraft/core";
import type { ResizeDir } from "@agocraft/editor";
import type { ItemFrame } from "./types.js";

export interface ResizeModifiers {
  /** Shift — corner drags preserve the original aspect ratio. */
  readonly aspectLock: boolean;
  /** Alt/Option — resize symmetrically about the frame center. */
  readonly fromCenter: boolean;
}

/** The frame as readFrame stages it: ratio frame + text-resize dunders
 *  (`__origFontSize` et al — the DR-022 smuggling idiom). */
export type ResizeSourceFrame = ItemFrame & {
  readonly __origFontSize?: number;
  readonly __designWidth?: number;
  readonly __origFontSizeSpec?: FontSizeSpec;
};

export type ResizedFrame = ItemFrame & {
  readonly __newFontSize?: number;
  readonly __newFontSizeSpec?: FontSizeSpec;
};

export function computeResizeFrame(
  o: ResizeSourceFrame,
  dir: ResizeDir,
  dx: number,
  dy: number,
  parent: { width: number; height: number },
  modifiers?: ResizeModifiers,
): ResizedFrame {
  const w = parent.width > 0 ? parent.width : 1;
  const h = parent.height > 0 ? parent.height : 1;
  const ddx = dx / w;
  const ddy = dy / h;
  let nx = o.x;
  let ny = o.y;
  let nw = o.width;
  let nh = o.height;
  if (dir.includes("w")) {
    nx = o.x + ddx;
    nw = o.width - ddx;
  }
  if (dir.includes("e")) nw = o.width + ddx;
  if (dir.includes("n")) {
    ny = o.y + ddy;
    nh = o.height - ddy;
  }
  if (dir.includes("s")) nh = o.height + ddy;

  const isCorner = dir.length === 2;

  // WI-183 ③ — Shift corner aspect lock. Scale both axes by the dominant
  // relative change and re-anchor at the corner opposite the handle. The
  // scale is floored at 0.01 so dragging past the anchor can't flip the box.
  if (modifiers?.aspectLock === true && isCorner && o.width > 0 && o.height > 0) {
    const rw = nw / o.width;
    const rh = nh / o.height;
    const s = Math.max(Math.abs(rw - 1) >= Math.abs(rh - 1) ? rw : rh, 0.01);
    nw = o.width * s;
    nh = o.height * s;
    nx = dir.includes("w") ? o.x + o.width - nw : o.x;
    ny = dir.includes("n") ? o.y + o.height - nh : o.y;
  }

  // WI-183 ④ — Alt resize from center: double each touched axis's delta and
  // pin the center (nx = o.x − dw keeps cx = o.x + o.width/2 invariant).
  if (modifiers?.fromCenter === true) {
    const dw = nw - o.width;
    const dh = nh - o.height;
    nw = o.width + 2 * dw;
    nh = o.height + 2 * dh;
    nx = o.x - dw;
    ny = o.y - dh;
  }

  // Text-specific min-width clamp (one character). Applies to every
  // direction that changes width — kept after DR-016 because a box
  // narrower than ~1ch becomes visually unusable.
  const isText = o.__origFontSize !== undefined;
  if (isText && (dir.includes("e") || dir.includes("w"))) {
    const designW = o.__designWidth ?? 1920;
    const minWidthRatio = ((o.__origFontSize as number) * 0.6) / designW;
    if (nw < minWidthRatio) {
      nw = minWidthRatio;
      if (dir.includes("w")) nx = o.x + o.width - nw;
    }
  }

  // DR-022 — diagonal (corner) drag scales the glyph by the box HEIGHT
  // ratio. A corner is a two-letter dir (ne/nw/se/sw); pure edge drags
  // (length 1) never touch fontSize. The new px is mirrored onto the legacy
  // `fontSize`, and any explicit `fontSizeSpec` has its `value` scaled by
  // the same factor (px → new px, ratio → new fraction of the unchanged
  // parent height — both correct since the factor is unit-agnostic).
  // commitFrame dispatches both in one patch. Reads the FINAL nh, so the
  // modifiers above are reflected in the glyph scale.
  let fontExtra: {
    __newFontSize?: number;
    __newFontSizeSpec?: FontSizeSpec;
  } = {};
  if (isText && isCorner && o.height > 0) {
    const scaleFactor = Math.max(0.01, nh) / o.height;
    const spec = o.__origFontSizeSpec;
    fontExtra = {
      __newFontSize: (o.__origFontSize as number) * scaleFactor,
      ...(spec !== undefined
        ? {
            __newFontSizeSpec:
              spec.kind === "ratio"
                ? { kind: "ratio", value: spec.value * scaleFactor }
                : { kind: "px", value: spec.value * scaleFactor },
          }
        : {}),
    };
  }
  return {
    ...o,
    x: nx,
    y: ny,
    width: Math.max(0.01, nw),
    height: Math.max(0.01, nh),
    ...fontExtra,
  };
}
