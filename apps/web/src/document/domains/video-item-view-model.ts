// WI-020 + WI-243/DR-160 + WI-244/DR-161 — video content ViewModel (per-item).
//
// Resolves VideoAttrs into the wrapper style/className, object-fit, the playback
// flags, and a `control` bundle (trim / loop / volume / playback-rate) the View's
// <video> effects apply imperatively. DR-161 — crop is a kind-agnostic
// `crop.window` + `crop.offset` unit, so a video crops exactly like an image: the
// VM reads the crop, exposes the crop-mode gate + enter intent, and the View
// renders the committed crop / crop editor through the shared media-crop component
// with a <video> media element. The View binds to `{ vm }` only.

import {
  type Item as AgocraftItem,
  findUnitInItem,
  OPACITY_UNIT_KIND,
  SHADOW_UNIT_KIND,
  type ShadowSpec,
  shadowToCss,
} from "@agocraft/core";
import { type CSSProperties, useEffect } from "react";
import { type CornerRadii, mediaBorderRadius } from "../corner-radius.js";
import { readCropWindow } from "../crop-window.js";
import { croppingState, useCroppingItemId } from "../interactions/cropping-state.js";
import { readCropOffset } from "../transform-crop-offset.js";
import type { AgoItem, VideoAttrs } from "../types.js";
import type { CropRect } from "./media/crop-editor.js";

/** Playback control the View applies imperatively to the <video> element. */
export interface VideoControl {
  readonly trimStartMs: number | undefined;
  readonly trimEndMs: number | null | undefined;
  readonly loop: boolean;
  readonly volume: number;
  readonly playbackRate: number;
}

export type VideoItemVm = {
  readonly wrapperClassName: string;
  readonly wrapperStyle: CSSProperties;
  readonly control: VideoControl;
  /** Enter crop mode on double-click — defined ONLY when editable + has a src. */
  readonly onEnterCrop: (() => void) | undefined;
} & (
  | {
      readonly status: "video";
      readonly src: string;
      readonly poster: string | undefined;
      readonly controls: boolean;
      readonly autoPlay: boolean;
      readonly loop: boolean;
      readonly muted: boolean;
      readonly objectFit: CSSProperties["objectFit"];
      readonly crop: CropRect;
    }
  | {
      readonly status: "crop";
      readonly src: string;
      readonly objectFit: CSSProperties["objectFit"];
      readonly crop: CropRect;
    }
  | {
      readonly status: "poster";
      readonly poster: string;
      readonly alt: string;
      readonly objectFit: CSSProperties["objectFit"];
    }
  | { readonly status: "placeholder"; readonly alt: string }
);

export function useVideoItemViewModel(
  item: AgoItem<"video">,
  onUpdate?: (patch: Partial<VideoAttrs>) => void,
): VideoItemVm {
  const a = item.attrs;
  const itemRef = item as unknown as AgocraftItem;
  const editable = onUpdate !== undefined;
  const itemId = String(item.id);
  // DR-161 — crop mode is the shared store, keyed by item id (kind-agnostic).
  const cropMode = useCroppingItemId() === itemId;
  useEffect(() => () => croppingState.exit(itemId), [itemId]);

  const objectFit: CSSProperties["objectFit"] =
    a.fit === "fill"
      ? "fill"
      : a.fit === "contain"
        ? "contain"
        : a.fit === "none"
          ? "none"
          : "cover";

  // DR-028 — shadow / opacity are decoration UNITS (no legacy attr fallback).
  const shadowSpec = findUnitInItem(itemRef, SHADOW_UNIT_KIND)?.attrs as ShadowSpec | undefined;
  const shadow = shadowSpec ? shadowToCss(shadowSpec) : undefined;
  const opacity =
    (findUnitInItem(itemRef, OPACITY_UNIT_KIND)?.attrs as { value: number } | undefined)?.value ??
    1;

  // DR-161 — crop window (`crop.window` unit, legacy attr fallback) + offset unit.
  const crop: CropRect = { ...readCropWindow(itemRef), ...readCropOffset(itemRef) };

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
  const control: VideoControl = {
    trimStartMs: a.trim?.startMs,
    trimEndMs: a.trim?.endMs,
    loop: a.loop,
    volume: a.volume,
    playbackRate: a.playbackRate,
  };

  // Source-less video (wireframe / layout draft): poster cover or icon placeholder
  // (mirrors the image source-less placeholder, WI-076). Crop needs a source.
  const hasSrc = a.src.trim().length > 0;
  const poster = a.poster?.trim() ?? "";
  const onEnterCrop = editable && hasSrc ? () => croppingState.enter(itemId, crop) : undefined;
  const common = { wrapperClassName, wrapperStyle, control, onEnterCrop };

  if (!hasSrc) {
    if (poster) return { ...common, status: "poster", poster, alt: a.alt ?? "", objectFit };
    return { ...common, status: "placeholder", alt: a.alt ?? "" };
  }
  if (cropMode) return { ...common, status: "crop", src: a.src, objectFit, crop };
  return {
    ...common,
    status: "video",
    src: a.src,
    poster: a.poster ?? undefined,
    controls: a.controls,
    autoPlay: a.autoplay && a.muted,
    loop: a.loop,
    muted: a.muted,
    objectFit,
    crop,
  };
}
