// WI-020 + WI-074/DR-029 + WI-243/DR-160 — image content ViewModel (per-item).
//
// Resolves ImageAttrs into the wrapper style/className, object-fit, the visual
// specs (FilterSpec → CSS filter, ShadowSpec → box-shadow), opacity, and the
// committed crop (window + rotation + persisted image-offset). Owns the crop-mode
// gate (shared store), the culled gate (off-screen → drop the <img>), the
// unmount-safety effect, and the enter-crop intent. Surfaces a `culled |
// placeholder | crop | image` content status. The frame-box aspect is a DOM
// measurement the View owns; this VM stays DOM-less and the View binds to
// `{ vm }` only (plus its own measured aspect).

import {
  type Item as AgocraftItem,
  FILTER_UNIT_KIND,
  type FilterSpec,
  filterToCss,
  findUnitInItem,
  OPACITY_UNIT_KIND,
  SHADOW_UNIT_KIND,
  type ShadowSpec,
  shadowToCss,
} from "@agocraft/core";
import { type CSSProperties, useEffect } from "react";
import { type CornerRadii, mediaBorderRadius } from "../corner-radius.js";
import { croppingState, useCroppingItemId } from "../interactions/cropping-state.js";
import { useIsCulled } from "../interactions/viewport-cull-context.js";
import { readCropOffset } from "../transform-crop-offset.js";
import type { AgoItem, ImageAttrs } from "../types.js";

export interface CropRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** radians, content straighten (DR-029 D6) */
  readonly rotation: number;
  /** WI-074 D12 — image-offset (frame fractions) within the rotation magnification. */
  readonly ox: number;
  readonly oy: number;
}

const IDENTITY_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1, rotation: 0, ox: 0, oy: 0 };

function readCrop(a: ImageAttrs): CropRect {
  const c = a.cropRatio as
    | { x?: number; y?: number; w?: number; h?: number; rotation?: number }
    | undefined;
  if (c === undefined) return IDENTITY_CROP;
  return {
    x: c.x ?? 0,
    y: c.y ?? 0,
    w: c.w ?? 1,
    h: c.h ?? 1,
    rotation: c.rotation ?? 0,
    ox: 0,
    oy: 0,
  };
}

export type ImageItemVm = {
  readonly wrapperClassName: string;
  readonly wrapperStyle: CSSProperties;
  /** Enter crop mode on double-click — defined ONLY when editable + has a src. */
  readonly onEnterCrop: (() => void) | undefined;
} & (
  | { readonly status: "culled" }
  | { readonly status: "placeholder"; readonly alt: string }
  | {
      readonly status: "crop";
      readonly src: string;
      readonly alt: string;
      readonly objectFit: CSSProperties["objectFit"];
      readonly filterCss: string;
      readonly crop: CropRect;
    }
  | {
      readonly status: "image";
      readonly src: string;
      readonly alt: string;
      readonly objectFit: CSSProperties["objectFit"];
      readonly filterCss: string;
      readonly crop: CropRect;
    }
);

export function useImageItemViewModel(
  item: AgoItem<"image">,
  onUpdate?: (patch: Partial<ImageAttrs>) => void,
): ImageItemVm {
  // WI-058 Phase 2a — when culled (off-screen), drop the `<img>` (bitmap freed);
  // the styled wrapper stays so layout is unchanged.
  const culled = useIsCulled();
  const a = item.attrs;
  const itemRef = item as unknown as AgocraftItem;
  const editable = onUpdate !== undefined;
  // WI-076 — a source-less image renders a placeholder, not a broken <img>. Crop
  // mode is meaningless without a source.
  const hasSrc = a.src.trim().length > 0;
  const itemId = String(item.id);
  // WI-074 D8b — crop mode is driven by the shared store: entered on double-click,
  // exited externally (DesignPage 완료/취소 + Enter/ESC).
  const cropMode = useCroppingItemId() === itemId;
  // Safety: end this item's crop if it unmounts mid-crop.
  useEffect(() => () => croppingState.exit(itemId), [itemId]);

  const objectFit: CSSProperties["objectFit"] =
    a.fit === "fill"
      ? "fill"
      : a.fit === "contain"
        ? "contain"
        : a.fit === "none"
          ? "none"
          : "cover";

  // DR-028 — shadow / filter / opacity are decoration UNITS.
  const shadowSpec = findUnitInItem(itemRef, SHADOW_UNIT_KIND)?.attrs as ShadowSpec | undefined;
  const shadow = shadowSpec ? shadowToCss(shadowSpec) : undefined;
  const filterSpec =
    (findUnitInItem(itemRef, FILTER_UNIT_KIND)?.attrs as FilterSpec | undefined) ?? {};
  const filterCss = filterToCss(filterSpec);
  const opacity =
    (findUnitInItem(itemRef, OPACITY_UNIT_KIND)?.attrs as { value: number } | undefined)?.value ??
    1;

  // WI-074 D12 — merge the persisted crop image-offset into the committed crop.
  const crop: CropRect = { ...readCrop(a), ...readCropOffset(itemRef) };

  const wrapperClassName = cropMode
    ? "relative h-full w-full"
    : "relative h-full w-full overflow-hidden";
  const wrapperStyle: CSSProperties = {
    // borderRadius is an absolute design-px radius; WI-109 — a per-corner
    // `borderRadii` four-tuple overrides it. Crop mode drops the clip + radius.
    borderRadius: cropMode
      ? 0
      : mediaBorderRadius((a as { borderRadii?: CornerRadii }).borderRadii, a.borderRadius),
    opacity,
    boxShadow: shadow,
  };
  const onEnterCrop = editable && hasSrc ? () => croppingState.enter(itemId, crop) : undefined;

  const common = { wrapperClassName, wrapperStyle, onEnterCrop };
  if (culled) return { ...common, status: "culled" };
  if (!hasSrc) return { ...common, status: "placeholder", alt: a.alt };
  if (cropMode) {
    return { ...common, status: "crop", src: a.src, alt: a.alt, objectFit, filterCss, crop };
  }
  return { ...common, status: "image", src: a.src, alt: a.alt, objectFit, filterCss, crop };
}
