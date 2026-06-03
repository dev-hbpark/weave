// WI-020 Phase 3 — ImageBlock renderer.  WI-074 / DR-029 — interactive crop.
//
// Reads ImageAttrs (DR-023) and renders an `<img>` filling the frame. Visual
// specs (FilterSpec → CSS filter, ShadowSpec → box-shadow) come from agocraft's
// `@agocraft/core/visual` helpers so the same conversion stays canonical.
//
// Crop (`cropRatio = { x, y, w, h, rotation? }`, agocraft DR-037):
//  • committed render — the window (x,y,w,h) is scaled to fill the frame; the
//    content is rotated by `rotation` (DR-029 D6 straighten) with a cover-zoom so
//    the frame never shows empty corners.
//  • crop mode (double-click, DR-029 D8 redesign) — the FULL source is shown
//    extending beyond the frame box, DIMMED; the frame-box region is drawn a SECOND
//    time at full brightness (the kept crop) so you can see how much is cropped out.
//    Drag to PAN (cropRatio x/y); a STRAIGHTEN slider rotates content (D6). Commit →
//    `onUpdate({ cropRatio })` → weave.item.update → History. Crop-window RESIZE +
//    image-scale handles move to the SelectionLayer overlay in Phase 2/3.

import type { Item as AgocraftItem, FilterSpec, ShadowSpec } from "@agocraft/core";
import {
  FILTER_UNIT_KIND,
  filterToCss,
  findUnitInItem,
  OPACITY_UNIT_KIND,
  SHADOW_UNIT_KIND,
  shadowToCss,
} from "@agocraft/core";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { coverZoom, panCropOffset, panCropWindow } from "../crop-geometry.js";
import { MediaPlaceholder } from "./MediaPlaceholder.js";
import { croppingState, useCropDraft, useCroppingItemId } from "../interactions/cropping-state.js";
import { useIsCulled } from "../interactions/viewport-cull-context.js";
import { readCropOffset } from "../transform-crop-offset.js";
import type { AgoItem, ImageAttrs } from "../types.js";

interface ImageBlockProps {
  readonly item: AgoItem<"image">;
  readonly onUpdate?: (patch: Partial<ImageAttrs>) => void;
}

interface CropRect {
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

const isIdentity = (c: CropRect): boolean =>
  c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1 && c.rotation === 0;

/** Rotate + cover-zoom the source image, pivoting around the CROP WINDOW center
 *  (= the frame box center on screen), not the source center. This keeps the frame
 *  covered and the content spinning in place at ANY pan position (WI-074 D11). The
 *  origin is given in the img's own box (which spans the source [0,1]); the window
 *  center in that box is (x + w/2, y + h/2). */
function rotationTransform(crop: CropRect, aspect: number): CSSProperties {
  if (crop.rotation === 0) return {};
  const ox = (crop.x + crop.w / 2) * 100;
  const oy = (crop.y + crop.h / 2) * 100;
  return {
    transform: `rotate(${crop.rotation}rad) scale(${coverZoom(crop.rotation, aspect)})`,
    transformOrigin: `${ox}% ${oy}%`,
  };
}

/** Committed image content for a given crop (window + rotation). */
function ImageContent(props: {
  readonly src: string;
  readonly alt: string;
  readonly objectFit: CSSProperties["objectFit"];
  readonly filterCss: string;
  readonly crop: CropRect;
  readonly aspect: number;
}): JSX.Element {
  const { src, alt, objectFit, filterCss, crop, aspect } = props;
  const imgBase: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit,
    filter: filterCss,
    userSelect: "none",
  };
  if (isIdentity(crop)) {
    return (
      <img
        src={src}
        alt={alt}
        draggable={false}
        loading="lazy"
        decoding="async"
        style={{ position: "absolute", inset: 0, ...imgBase }}
      />
    );
  }
  return (
    <div className="absolute" style={cropWindowWrapperStyle(crop)}>
      <img
        src={src}
        alt={alt}
        draggable={false}
        loading="lazy"
        decoding="async"
        style={{ ...imgBase, ...rotationTransform(crop, aspect) }}
      />
    </div>
  );
}

/** Placeholder shown when an image item has no `src` (WI-076). Replaces the
 *  browser's broken-`<img>` glyph with a neutral framed surface; when `alt` is
 *  set it is rendered as a centered caption so the slot can describe what image
 *  belongs here. Glyph + caption scale to the frame size (see MediaPlaceholder). */
function ImagePlaceholder({ alt }: { readonly alt: string }): JSX.Element {
  return (
    <MediaPlaceholder
      testId="image-placeholder"
      alt={alt}
      glyph={
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-4.5-4.5L5 21" />
        </>
      }
    />
  );
}

// ── crop-mode editor (WI-074 / DR-029 D8 redesign — Phase 1) ─────────────────
//
// Crop mode shows the FULL source extending beyond the frame box, DIMMED, with the
// frame-box region drawn a SECOND time at full brightness — so you can see how much
// of the original is cropped out. Drag to PAN (cropRatio x/y); the straighten slider
// rotates content (DR-029 D6). Crop-window RESIZE + image-scale handles move to the
// SelectionLayer overlay in Phase 2/3. The document capture-phase pointerdown
// bypasses the design-plane gesture controllers that swallow React onPointerDown.

/** Wrapper that maps the crop window [x,x+w]x[y,y+h] onto the frame box; with the
 *  parent overflow visible, the rest of the (cover-displayed) image extends beyond.
 *  The (ox,oy) offset (WI-074 D12) additionally translates the magnified image so
 *  the user can pan into the rotation cover-zoom overflow (frame-box fractions). */
function cropWindowWrapperStyle(c: CropRect): CSSProperties {
  return {
    position: "absolute",
    left: `${(-c.x * (1 / c.w) + c.ox) * 100}%`,
    top: `${(-c.y * (1 / c.h) + c.oy) * 100}%`,
    width: `${(1 / c.w) * 100}%`,
    height: `${(1 / c.h) * 100}%`,
  };
}

function CropEditor(props: {
  readonly src: string;
  readonly alt: string;
  readonly objectFit: CSSProperties["objectFit"];
  readonly filterCss: string;
  readonly initial: CropRect;
  readonly aspect: number;
}): JSX.Element {
  const { src, alt, objectFit, filterCss, initial, aspect } = props;
  // D8 P2 — the crop draft lives in the shared store so the SelectionLayer crop
  // handles (NestedFrame) + the FrameStage dispatcher edit the SAME draft live.
  // D8b — straighten + apply/cancel UI moved out (rotate handle + QuickActionBar);
  // commit/cancel is driven externally (DesignPage) via the store.
  const draft = useCropDraft() ?? initial;
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; start: CropRect } | null>(null);

  // Pan: drag the image to choose which part fills the frame box (cropRatio x/y).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target;
      const box = boxRef.current;
      if (!(target instanceof Element) || box === null) return;
      if (target.closest("[data-crop-pan]") === null) return;
      e.preventDefault();
      e.stopPropagation();
      const start = croppingState.getDraft();
      if (start === null) return;
      dragRef.current = { startX: e.clientX, startY: e.clientY, start };
    };
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      const box = boxRef.current;
      if (drag === null || box === null) return;
      const r = box.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const dx = (e.clientX - drag.startX) / r.width;
      const dy = (e.clientY - drag.startY) / r.height;
      // WI-074 D12 — rotated: pan the image WITHIN the cover-zoom magnification
      // (offset), so the magnified overflow is reachable. Un-rotated: pan the
      // crop window (source region) as before.
      const next =
        (drag.start.rotation ?? 0) === 0
          ? panCropWindow(drag.start, dx, dy)
          : panCropOffset(drag.start, dx, dy, r.width / r.height);
      croppingState.setDraft(next);
    };
    const onUp = () => {
      dragRef.current = null;
    };
    document.addEventListener("pointerdown", onDown, { capture: true });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const stop = (e: ReactPointerEvent<HTMLDivElement>) => e.stopPropagation();
  const win = draft;
  const wrapper = cropWindowWrapperStyle(win);
  const imgStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit,
    filter: filterCss,
    userSelect: "none",
    ...rotationTransform(win, aspect),
  };

  return (
    <div
      ref={boxRef}
      data-testid="image-crop-editor"
      className="absolute inset-0"
      style={{ overflow: "visible" }}
      onPointerDown={stop}
      onDoubleClick={stop}
    >
      {/* Draw 1 — the full source, extending beyond the frame box. Pan target.
          Drawn bright; the spotlight below dims everything outside the window. */}
      <div
        data-crop-pan
        data-testid="image-crop-pan"
        className="absolute"
        style={{ ...wrapper, cursor: "move" }}
      >
        <img src={src} alt={alt} draggable={false} decoding="async" style={imgStyle} />
      </div>
      {/* Spotlight dim — a single hole at the frame box (= the crop window). Its
          huge box-shadow dims the WHOLE canvas around the window in one pass:
          the cropped-out source, sibling items, everything. No seam, no leak
          (replaces the old Draw1-local + plane-level two-dim scheme, DR-029 D8c). */}
      <div
        data-testid="crop-dim"
        className="absolute inset-0"
        style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)", pointerEvents: "none" }}
      />
      {/* Draw 2 — the frame-box region drawn again, BRIGHT (the kept crop). */}
      <div className="absolute inset-0" style={{ overflow: "hidden", pointerEvents: "none" }}>
        <div className="absolute" style={wrapper}>
          <img src={src} alt={alt} draggable={false} decoding="async" style={imgStyle} />
        </div>
      </div>
      {/* crop boundary outline = the frame box */}
      <div
        data-testid="image-crop-window"
        data-crop-w={win.w.toFixed(4)}
        data-crop-h={win.h.toFixed(4)}
        className="absolute inset-0"
        style={{
          outline: "1px solid rgba(255,255,255,0.95)",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

export function ImageBlock({ item, onUpdate }: ImageBlockProps): JSX.Element {
  // WI-058 Phase 2a — when this frame is culled (off-screen), drop the `<img>`
  // so its decoded bitmap is released. The styled wrapper (size/shadow/radius)
  // stays so layout is unchanged. Restored when the frame re-enters the buffer.
  const culled = useIsCulled();
  const a = item.attrs;
  const editable = onUpdate !== undefined;
  // WI-076 — a source-less image renders a placeholder (see ImagePlaceholder)
  // instead of a broken `<img>`. Crop mode is meaningless without a source, so
  // it (and the double-click that enters it) is gated on this.
  const hasSrc = a.src.trim().length > 0;
  const itemId = String(item.id);
  // WI-074 D8b — crop mode is driven by the shared store: entered on double-click,
  // exited EXTERNALLY (DesignPage 완료/취소 + Enter/ESC) so the QuickActionBar /
  // keyboard can end a crop. Also the Step 5 gate (suspends hotkeys + gestures).
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

  // WI-074 D12 — merge the persisted crop image-offset (weave-local unit) into the
  // committed crop so the rendered image reflects the in-magnification pan.
  const crop = { ...readCrop(a), ...readCropOffset(item as unknown as AgocraftItem) };

  // Frame-box aspect (width / height) — drives the rotation cover-zoom.
  const boxRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(1);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (el === null) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.height > 0) setAspect(r.width / r.height);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={boxRef}
      // WI-074 D8 — crop mode shows the full source beyond the frame box, so drop
      // the overflow clip while cropping.
      className={cropMode ? "relative h-full w-full" : "relative h-full w-full overflow-hidden"}
      style={{
        borderRadius: cropMode || !a.borderRadius ? 0 : `${a.borderRadius * 50}%`,
        opacity,
        boxShadow: shadow,
      }}
      {...(editable && hasSrc
        ? {
            onDoubleClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              // D8b — enter crop via the shared store; commit/cancel is external.
              croppingState.enter(itemId, {
                ...readCrop(item.attrs),
                ...readCropOffset(item as unknown as AgocraftItem),
              });
            },
          }
        : {})}
    >
      {culled ? null : !hasSrc ? (
        <ImagePlaceholder alt={a.alt} />
      ) : cropMode ? (
        <CropEditor
          src={a.src}
          alt={a.alt}
          objectFit={objectFit}
          filterCss={filterCss}
          initial={crop}
          aspect={aspect}
        />
      ) : (
        <ImageContent
          src={a.src}
          alt={a.alt}
          objectFit={objectFit}
          filterCss={filterCss}
          crop={crop}
          aspect={aspect}
        />
      )}
    </div>
  );
}
