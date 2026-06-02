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
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { panCropWindow, setStraighten } from "../crop-geometry.js";
import { croppingState, useCropDraft } from "../interactions/cropping-state.js";
import { useIsCulled } from "../interactions/viewport-cull-context.js";
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
}

const IDENTITY_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1, rotation: 0 };
const MAX_STRAIGHTEN_DEG = 45;

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
  };
}

const isIdentity = (c: CropRect): boolean =>
  c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1 && c.rotation === 0;

/** Cover-zoom so a θ-rotated element still covers an axis-aligned box of the
 *  given aspect (= width / height). θ = 0 → 1. */
function coverZoom(theta: number, aspect: number): number {
  if (theta === 0) return 1;
  const c = Math.abs(Math.cos(theta));
  const s = Math.abs(Math.sin(theta));
  return c + s * Math.max(aspect, 1 / aspect);
}

function rotationTransform(theta: number, aspect: number): CSSProperties {
  return theta === 0
    ? {}
    : {
        transform: `rotate(${theta}rad) scale(${coverZoom(theta, aspect)})`,
        transformOrigin: "center",
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
    <div
      className="absolute"
      style={{
        left: `${-crop.x * (1 / crop.w) * 100}%`,
        top: `${-crop.y * (1 / crop.h) * 100}%`,
        width: `${(1 / crop.w) * 100}%`,
        height: `${(1 / crop.h) * 100}%`,
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        loading="lazy"
        decoding="async"
        style={{ ...imgBase, ...rotationTransform(crop.rotation, aspect) }}
      />
    </div>
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
 *  parent overflow visible, the rest of the (cover-displayed) image extends beyond. */
function cropWindowWrapperStyle(c: CropRect): CSSProperties {
  return {
    position: "absolute",
    left: `${-c.x * (1 / c.w) * 100}%`,
    top: `${-c.y * (1 / c.h) * 100}%`,
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
  readonly onCommit: (crop: CropRect) => void;
  readonly onCancel: () => void;
}): JSX.Element {
  const { src, alt, objectFit, filterCss, initial, aspect, onCommit, onCancel } = props;
  // D8 P2 — the crop draft lives in the shared store so the SelectionLayer crop
  // handles (NestedFrame) + the FrameStage dispatcher edit the SAME draft live.
  const draft = useCropDraft() ?? initial;
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; start: CropRect } | null>(null);

  // ESC = cancel, Enter = commit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onCommit(croppingState.getDraft() ?? initial);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel, onCommit, initial]);

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
      croppingState.setDraft(panCropWindow(drag.start, dx, dy));
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
  const deg = Math.round((draft.rotation * 180) / Math.PI);
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
    ...rotationTransform(win.rotation, aspect),
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
      {/* Draw 1 — the full source, extending beyond the frame box, DIMMED. Pan target. */}
      <div
        data-crop-pan
        data-testid="image-crop-pan"
        className="absolute"
        style={{ ...wrapper, cursor: "move" }}
      >
        <img src={src} alt={alt} draggable={false} decoding="async" style={imgStyle} />
        <div
          className="absolute inset-0"
          style={{ background: "rgba(0,0,0,0.55)", pointerEvents: "none" }}
        />
      </div>
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
      {/* controls — straighten + done / cancel */}
      <div
        className="absolute flex items-center gap-2 rounded-md bg-black/70 px-2 py-1"
        style={{ left: "50%", top: 6, transform: "translateX(-50%)", pointerEvents: "auto" }}
        onPointerDown={stop}
      >
        <input
          aria-label="이미지 회전(스트레이튼)"
          data-testid="image-crop-straighten"
          type="range"
          min={-MAX_STRAIGHTEN_DEG}
          max={MAX_STRAIGHTEN_DEG}
          step={1}
          value={deg}
          onChange={(e) =>
            croppingState.setDraft(setStraighten(draft, (Number(e.target.value) * Math.PI) / 180))
          }
        />
        <span className="w-8 text-center text-xs text-white tabular-nums">{deg}°</span>
        <button
          type="button"
          data-testid="image-crop-cancel"
          className="rounded px-2 py-0.5 text-xs text-white hover:bg-white/20"
          onClick={onCancel}
        >
          취소
        </button>
        <button
          type="button"
          data-testid="image-crop-apply"
          className="rounded bg-white px-2 py-0.5 text-xs text-black hover:bg-white/90"
          onClick={() => onCommit(croppingState.getDraft() ?? initial)}
        >
          완료
        </button>
      </div>
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
  const [cropMode, setCropMode] = useState(false);

  // WI-074 Step 5 — publish crop-active to the global gate so editor hotkeys /
  // selection gestures suspend while this image is being cropped.
  const itemId = String(item.id);
  useEffect(() => {
    if (!cropMode) return;
    // D8 P2 — seed the shared draft with the current crop so handles/pan edit it.
    croppingState.enter(itemId, readCrop(item.attrs));
    return () => croppingState.exit(itemId);
  }, [cropMode, itemId, item.attrs]);

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

  const crop = readCrop(a);

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

  const commitCrop = useCallback(
    (next: CropRect) => {
      const cropRatio = isIdentity(next)
        ? undefined
        : {
            x: next.x,
            y: next.y,
            w: next.w,
            h: next.h,
            ...(next.rotation !== 0 ? { rotation: next.rotation } : {}),
          };
      onUpdate?.({ cropRatio } as Partial<ImageAttrs>);
      setCropMode(false);
    },
    [onUpdate],
  );

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
      {...(editable
        ? {
            onDoubleClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              setCropMode(true);
            },
          }
        : {})}
    >
      {culled ? null : cropMode ? (
        <CropEditor
          src={a.src}
          alt={a.alt}
          objectFit={objectFit}
          filterCss={filterCss}
          initial={crop}
          aspect={aspect}
          onCommit={commitCrop}
          onCancel={() => setCropMode(false)}
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
