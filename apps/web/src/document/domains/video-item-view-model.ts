// WI-020 + WI-243 / DR-160 — video content ViewModel (per-item, content surface).
//
// Resolves VideoAttrs (DR-023) into the wrapper style (border-radius / opacity /
// shadow), the object-fit, the playback flags, and a `control` bundle (trim /
// loop / volume / playback-rate) the View's <video> effects apply imperatively.
// Source-less video shows a poster cover (if set) or an icon placeholder, never
// an empty black <video> (WI-076) — surfaced as an `video | poster | placeholder`
// status. The <video> element + its imperative effects are DOM concerns the View
// owns; this VM stays DOM-less and the View binds to `{ vm }` only.

import {
  type Item as AgocraftItem,
  findUnitInItem,
  OPACITY_UNIT_KIND,
  SHADOW_UNIT_KIND,
  type ShadowSpec,
  shadowToCss,
} from "@agocraft/core";
import type { CSSProperties } from "react";
import { type CornerRadii, mediaBorderRadius } from "../corner-radius.js";
import type { AgoItem } from "../types.js";

/** Playback control the View applies imperatively to the <video> element. */
export interface VideoControl {
  readonly trimStartMs: number | undefined;
  readonly trimEndMs: number | null | undefined;
  readonly loop: boolean;
  readonly volume: number;
  readonly playbackRate: number;
}

export type VideoItemVm = {
  readonly wrapperStyle: CSSProperties;
  readonly control: VideoControl;
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
    }
  | {
      readonly status: "poster";
      readonly poster: string;
      readonly alt: string;
      readonly objectFit: CSSProperties["objectFit"];
    }
  | { readonly status: "placeholder"; readonly alt: string }
);

export function useVideoItemViewModel(item: AgoItem<"video">): VideoItemVm {
  const a = item.attrs;
  const itemRef = item as unknown as AgocraftItem;

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

  const wrapperStyle: CSSProperties = {
    // borderRadius is an absolute design-px radius (CSS clamps + circular).
    // WI-109 — a per-corner `borderRadii` four-tuple overrides it.
    borderRadius: mediaBorderRadius(
      (a as { borderRadii?: CornerRadii }).borderRadii,
      a.borderRadius,
    ),
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

  // Source-less video (wireframe / layout draft): show the cover image if a
  // poster is set, otherwise an icon placeholder (mirrors the image source-less
  // placeholder, WI-076).
  const hasSrc = a.src.trim().length > 0;
  const poster = a.poster?.trim() ?? "";

  if (hasSrc) {
    return {
      status: "video",
      wrapperStyle,
      control,
      src: a.src,
      poster: a.poster ?? undefined,
      controls: a.controls,
      autoPlay: a.autoplay && a.muted,
      loop: a.loop,
      muted: a.muted,
      objectFit,
    };
  }
  if (poster) {
    return { status: "poster", wrapperStyle, control, poster, alt: a.alt ?? "", objectFit };
  }
  return { status: "placeholder", wrapperStyle, control, alt: a.alt ?? "" };
}
