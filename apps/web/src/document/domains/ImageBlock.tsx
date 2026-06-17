// WI-020 Phase 3 — image content View.  WI-074 / DR-029 — interactive crop.
//
// WI-243 / DR-160 — split into ViewModel + pure View. Attr resolution, the crop /
// culled gates, the enter-crop intent, and the wrapper style live in
// `image-item-view-model.ts`; `ImageView` renders from `{ vm }` ONLY (never reads
// `item.*`). The frame-box aspect (drives the rotation cover-zoom) is a DOM
// measurement the View owns and threads into the crop/image content.
//
// Crop (`cropRatio = { x, y, w, h, rotation? }`): committed render scales the
// window to fill the frame + rotates with a cover-zoom; crop mode (double-click)
// shows the full source dimmed with the kept region drawn bright. Drag to PAN;
// commit/cancel is external (DesignPage) via the shared store.

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { type JSX, useEffect, useLayoutEffect, useRef, useState } from "react";
import { coverZoom, panCropOffset, panCropWindow } from "../crop-geometry.js";
import { croppingState, useCropDraft } from "../interactions/cropping-state.js";
import type { AgoItem, ImageAttrs } from "../types.js";
import { type CropRect, type ImageItemVm, useImageItemViewModel } from "./image-item-view-model.js";
import { MediaPlaceholder } from "./MediaPlaceholder.js";

interface ImageBlockProps {
  readonly item: AgoItem<"image">;
  readonly onUpdate?: (patch: Partial<ImageAttrs>) => void;
}

const isIdentity = (c: CropRect): boolean =>
  c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1 && c.rotation === 0;

/** Rotate + cover-zoom the source image, pivoting around the CROP WINDOW center
 *  (= the frame box center on screen). Keeps the frame covered and the content
 *  spinning in place at ANY pan position (WI-074 D11). */
function rotationTransform(crop: CropRect, aspect: number): CSSProperties {
  if (crop.rotation === 0) return {};
  const ox = (crop.x + crop.w / 2) * 100;
  const oy = (crop.y + crop.h / 2) * 100;
  return {
    transform: `rotate(${crop.rotation}rad) scale(${coverZoom(crop.rotation, aspect)})`,
    transformOrigin: `${ox}% ${oy}%`,
  };
}

/** Wrapper that maps the crop window [x,x+w]x[y,y+h] onto the frame box; with the
 *  parent overflow visible, the rest of the (cover-displayed) image extends beyond.
 *  The (ox,oy) offset (WI-074 D12) translates the magnified image so the user can
 *  pan into the rotation cover-zoom overflow (frame-box fractions). */
function cropWindowWrapperStyle(c: CropRect): CSSProperties {
  return {
    position: "absolute",
    left: `${(-c.x * (1 / c.w) + c.ox) * 100}%`,
    top: `${(-c.y * (1 / c.h) + c.oy) * 100}%`,
    width: `${(1 / c.w) * 100}%`,
    height: `${(1 / c.h) * 100}%`,
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

/** Placeholder shown when an image item has no `src` (WI-076). */
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
// Shows the FULL source extending beyond the frame box, DIMMED, with the frame-box
// region drawn a SECOND time at full brightness. Drag to PAN; commit/cancel is
// external. The crop draft lives in the shared store so the SelectionLayer handles
// + the FrameStage dispatcher edit the SAME draft live.

function CropEditor(props: {
  readonly src: string;
  readonly alt: string;
  readonly objectFit: CSSProperties["objectFit"];
  readonly filterCss: string;
  readonly initial: CropRect;
  readonly aspect: number;
}): JSX.Element {
  const { src, alt, objectFit, filterCss, initial, aspect } = props;
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
      // WI-074 D12 — rotated: pan within the cover-zoom magnification (offset);
      // un-rotated: pan the crop window (source region).
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
    // biome-ignore lint/a11y/noStaticElementInteractions: interaction surface (canvas/overlay/affordance), not a control — keyboard & focus handled by dedicated controls elsewhere
    <div
      ref={boxRef}
      data-testid="image-crop-editor"
      className="absolute inset-0"
      style={{ overflow: "visible" }}
      onPointerDown={stop}
      onDoubleClick={stop}
    >
      {/* Draw 1 — the full source, extending beyond the frame box. Pan target. */}
      <div
        data-crop-pan
        data-testid="image-crop-pan"
        className="absolute"
        style={{ ...wrapper, cursor: "move" }}
      >
        <img src={src} alt={alt} draggable={false} decoding="async" style={imgStyle} />
      </div>
      {/* Spotlight dim — a single hole at the frame box dims the whole canvas. */}
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

/** Pure content View for an image item — renders from `{ vm }` ONLY. Owns the
 *  DOM-measured frame-box aspect (drives the rotation cover-zoom) and threads it
 *  into the crop/image content. */
export function ImageView({ vm }: { readonly vm: ImageItemVm }): JSX.Element {
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
      className={vm.wrapperClassName}
      style={vm.wrapperStyle}
      {...(vm.onEnterCrop !== undefined
        ? {
            onDoubleClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              vm.onEnterCrop?.();
            },
          }
        : {})}
    >
      {vm.status === "culled" ? null : vm.status === "placeholder" ? (
        <ImagePlaceholder alt={vm.alt} />
      ) : vm.status === "crop" ? (
        <CropEditor
          src={vm.src}
          alt={vm.alt}
          objectFit={vm.objectFit}
          filterCss={vm.filterCss}
          initial={vm.crop}
          aspect={aspect}
        />
      ) : (
        <ImageContent
          src={vm.src}
          alt={vm.alt}
          objectFit={vm.objectFit}
          filterCss={vm.filterCss}
          crop={vm.crop}
          aspect={aspect}
        />
      )}
    </div>
  );
}

/** Registered renderer. Thin shim: resolve the ViewModel, render the pure View.
 *  WI-243 transitional — Phase-0 facet will register `useViewModel`/`view`. */
export function ImageBlock({ item, onUpdate }: ImageBlockProps): JSX.Element {
  const vm = useImageItemViewModel(item, onUpdate);
  return <ImageView vm={vm} />;
}
