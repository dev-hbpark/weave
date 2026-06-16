// WI-051 follow-up — re-hug a FREE-placed auto-resize text's frame on EDIT (text /
// font change), the live counterpart to use-item-add's add-time hug. Free / absolute
// text is NOT engine-managed (the Hug + content-auto engine paths only cover flex/
// grid), so the host re-fits the box to the measured content here, on every commit
// (convergent: measure → set frame → re-measure yields the same). Flag-gated via
// `measureFreeTextHugRatio` (off ⇒ attrs returned unchanged). Anchored TOP-LEFT so
// the box grows right/down as you type (Figma auto-width/height for left-aligned text).

import { resolveFontSize } from "@agocraft/core";
import { absoluteFrameBox, findItemDeep, findParentAndIndex } from "../agocraft-mirror.js";
import { deriveTextAutoResize } from "../domains/derive-text-auto-resize.js";
import { measureFreeTextHugRatio } from "./text-measurer.js";

type Doc = Parameters<typeof absoluteFrameBox>[0];
interface Frame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}

/** The NEXT attrs of a just-edited item, with `frame` re-hugged to the measured
 *  content WHEN it is a FREE-placed auto-resize text. Returns `nextAttrs` unchanged
 *  for non-text / Fixed (NONE) / engine-managed (flex/grid) / measurer-off / no
 *  container px. WIDTH_AND_HEIGHT fits both axes; HEIGHT fits height at the current
 *  width (wrap). */
export function hugFreeTextAttrs(
  doc: Doc,
  itemId: string,
  nextAttrs: Record<string, unknown>,
  designW: number,
  designH: number,
): Record<string, unknown> {
  const item = findItemDeep(doc, itemId);
  if (item === undefined || item.kind !== "text") return nextAttrs;

  const prevAttrs = item.attrs as Record<string, unknown>;
  const a = { ...prevAttrs, ...nextAttrs };
  const mode = deriveTextAutoResize(a.layoutChild as never);
  if (mode === "NONE") return nextAttrs; // Fixed → never auto-fit

  // Engine-managed (flex/grid parent) text is sized by the engine, not here.
  const parent = findParentAndIndex(doc, itemId)?.parent;
  const pLayout = (parent?.attrs as { layout?: { kind?: string } } | undefined)?.layout;
  if (pLayout !== undefined && pLayout.kind !== "absolute-constraints") return nextAttrs;

  const containerId = parent !== undefined ? String(parent.id) : String(doc.root.id);
  const box = absoluteFrameBox(doc, containerId, designW, designH);
  if (box === null) return nextAttrs;
  const curFrame = a.frame as Frame | undefined;
  if (curFrame === undefined) return nextAttrs;

  const text = typeof a.text === "string" ? a.text : "";
  const fontFamily = typeof a.fontFamily === "string" ? a.fontFamily : "sans-serif";
  // Match the renderer: a ratio fontSize resolves against the parent (container) px.
  const fontSizePx = resolveFontSize(a.fontSizeSpec as never, a.fontSize as never, box.h) as number;
  const lhSpec = a.lineHeightSpec as { value?: number; unit?: string } | undefined;
  const lineHeight =
    lhSpec?.unit === "multiplier" && typeof lhSpec.value === "number"
      ? lhSpec.value
      : typeof a.lineHeight === "number"
        ? a.lineHeight
        : 1.4;
  const letterSpacing = typeof a.letterSpacing === "number" ? a.letterSpacing : 0;

  const hug = measureFreeTextHugRatio(
    {
      text,
      fontFamily,
      fontSizePx,
      lineHeight,
      letterSpacing,
      // HEIGHT mode: fixed width, wrap to it → only the height re-fits.
      ...(mode === "HEIGHT" ? { maxWidthPx: curFrame.width * box.w } : {}),
    },
    box.w,
    box.h,
  );
  if (hug === undefined) return nextAttrs;

  // TOP-LEFT anchored: grow right (width) / down (height), keep x/y.
  const newFrame: Frame =
    mode === "WIDTH_AND_HEIGHT"
      ? { ...curFrame, width: hug.wRatio, height: hug.hRatio }
      : { ...curFrame, height: hug.hRatio };
  return { ...nextAttrs, frame: newFrame };
}
