// WI-020 Phase 3 — ImageBlock renderer.
//
// Reads ImageAttrs (DR-023) and renders an `<img>` filling the frame.
// Visual specs (FilterSpec → CSS filter, ShadowSpec → box-shadow) come from
// agocraft's `@agocraft/core/visual` helpers so the same conversion stays
// canonical across hosts.

import type { Item as AgocraftItem, FilterSpec, ShadowSpec } from "@agocraft/core";
import {
  FILTER_UNIT_KIND,
  filterToCss,
  findUnitInItem,
  OPACITY_UNIT_KIND,
  SHADOW_UNIT_KIND,
  shadowToCss,
} from "@agocraft/core";
import type { CSSProperties } from "react";
import { useIsCulled } from "../interactions/viewport-cull-context.js";
import type { AgoItem, ImageAttrs } from "../types.js";

interface ImageBlockProps {
  readonly item: AgoItem<"image">;
  readonly onUpdate?: (patch: Partial<ImageAttrs>) => void;
}

export function ImageBlock({ item, onUpdate }: ImageBlockProps): JSX.Element {
  void onUpdate; // editing happens via ContextualToolbar, not inline
  // WI-058 Phase 2a — when this frame is culled (off-screen), drop the `<img>`
  // so its decoded bitmap is released. The styled wrapper (size/shadow/radius)
  // stays so layout is unchanged; the frame itself is `visibility:hidden`
  // anyway. Restored when the frame re-enters the one-viewport buffer, so the
  // re-decode completes before it is actually on-screen.
  const culled = useIsCulled();
  const a = item.attrs;
  const objectFit: CSSProperties["objectFit"] =
    a.fit === "fill"
      ? "fill"
      : a.fit === "contain"
        ? "contain"
        : a.fit === "none"
          ? "none"
          : "cover";

  // DR-028 — shadow / filter / opacity are decoration UNITS (no legacy attr fallback).
  const shadowSpec = findUnitInItem(item as unknown as AgocraftItem, SHADOW_UNIT_KIND)?.attrs as
    | ShadowSpec
    | undefined;
  const shadow = shadowSpec ? shadowToCss(shadowSpec) : undefined;
  const filterSpec =
    (findUnitInItem(item as unknown as AgocraftItem, FILTER_UNIT_KIND)?.attrs as
      | FilterSpec
      | undefined) ?? {};
  const filterCss = filterToCss(filterSpec);
  const opacity =
    (
      findUnitInItem(item as unknown as AgocraftItem, OPACITY_UNIT_KIND)?.attrs as
        | { value: number }
        | undefined
    )?.value ?? 1;

  // Crop region (0..1 ratio) is implemented via `object-position` + an
  // inner wrapper that clips by overflow:hidden + a scaling transform on
  // the img to show only the cropped portion. v1 supports center-based
  // crop when `cropRatio` is set.
  const cropX = a.cropRatio?.x ?? 0;
  const cropY = a.cropRatio?.y ?? 0;
  const cropW = a.cropRatio?.w ?? 1;
  const cropH = a.cropRatio?.h ?? 1;
  const usesCrop = cropX !== 0 || cropY !== 0 || cropW !== 1 || cropH !== 1;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        borderRadius: a.borderRadius
          ? `${a.borderRadius * 50}%` // 0..1 → up to 50% of min(w,h)
          : 0,
        opacity,
        boxShadow: shadow,
      }}
    >
      {culled ? null : usesCrop ? (
        <div
          className="absolute"
          style={{
            left: `${-cropX * (1 / cropW) * 100}%`,
            top: `${-cropY * (1 / cropH) * 100}%`,
            width: `${(1 / cropW) * 100}%`,
            height: `${(1 / cropH) * 100}%`,
          }}
        >
          <img
            src={a.src}
            alt={a.alt}
            draggable={false}
            // WI-058 — defer decode for off-screen / not-yet-needed images.
            // Combined with FrameStage viewport culling this keeps the
            // decoded-bitmap + raster working set bounded on the infinite
            // canvas instead of decoding the whole document up front.
            loading="lazy"
            decoding="async"
            style={{
              width: "100%",
              height: "100%",
              objectFit,
              filter: filterCss,
              userSelect: "none",
            }}
          />
        </div>
      ) : (
        <img
          src={a.src}
          alt={a.alt}
          draggable={false}
          // WI-058 — see note above.
          loading="lazy"
          decoding="async"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit,
            filter: filterCss,
            userSelect: "none",
          }}
        />
      )}
    </div>
  );
}
