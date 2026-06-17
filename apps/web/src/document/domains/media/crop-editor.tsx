// WI-074 / DR-029 / DR-161 — media-generic crop UI (relocated from ImageBlock).
//
// The crop framing — committed render (`CroppedMedia`) + the interactive crop
// editor (`CropEditor`) — is media-AGNOSTIC: the inner media element is supplied
// by the caller via a `media: (style) => ReactNode` render-prop, so an image
// passes an `<img>` and a video passes a `<video>` while the window-mapping / pan
// / rotation cover-zoom / dim / two-draw logic is shared. DR-161 made the crop
// window a kind-agnostic unit, so any croppable media reuses this component.

import type { CSSProperties, ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { type JSX, useEffect, useRef } from "react";
import { coverZoom } from "../../crop-geometry.js";
import { croppingState, useCropDraft } from "../../interactions/cropping-state.js";
import { cropWindowUnit } from "../../units/crop-window-unit.js";

/** Crop window (0..1) + content rotation (radians, DR-029 D6) + the WI-074 D12
 *  image-offset (frame-box fractions) within the rotation cover-zoom. */
export interface CropRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly rotation: number;
  readonly ox: number;
  readonly oy: number;
}

/** Renders the inner media element with the crop-computed style applied. The
 *  caller owns the element + its attributes (img: loading/decoding; video:
 *  muted/loop/poster). */
export type MediaRender = (style: CSSProperties) => ReactNode;

const isIdentity = (c: CropRect): boolean =>
  c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1 && c.rotation === 0;

/** Rotate + cover-zoom the source, pivoting around the CROP WINDOW center (= the
 *  frame box center on screen). Keeps the frame covered and the content spinning
 *  in place at ANY pan position (WI-074 D11). */
function rotationTransform(crop: CropRect, aspect: number): CSSProperties {
  if (crop.rotation === 0) return {};
  const ox = (crop.x + crop.w / 2) * 100;
  const oy = (crop.y + crop.h / 2) * 100;
  return {
    transform: `rotate(${crop.rotation}rad) scale(${coverZoom(crop.rotation, aspect)})`,
    transformOrigin: `${ox}% ${oy}%`,
  };
}

/** Maps the crop window [x,x+w]x[y,y+h] onto the frame box; with the parent
 *  overflow visible, the rest of the (cover-displayed) media extends beyond. The
 *  (ox,oy) offset (WI-074 D12) translates the magnified media so the user can pan
 *  into the rotation cover-zoom overflow (frame-box fractions). */
function cropWindowWrapperStyle(c: CropRect): CSSProperties {
  return {
    position: "absolute",
    left: `${(-c.x * (1 / c.w) + c.ox) * 100}%`,
    top: `${(-c.y * (1 / c.h) + c.oy) * 100}%`,
    width: `${(1 / c.w) * 100}%`,
    height: `${(1 / c.h) * 100}%`,
  };
}

/** Committed media content for a given crop (window + rotation). Media-agnostic. */
export function CroppedMedia({
  crop,
  aspect,
  objectFit,
  filterCss,
  media,
}: {
  readonly crop: CropRect;
  readonly aspect: number;
  readonly objectFit: CSSProperties["objectFit"];
  readonly filterCss: string;
  readonly media: MediaRender;
}): JSX.Element {
  const base: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit,
    filter: filterCss,
    userSelect: "none",
  };
  if (isIdentity(crop)) {
    return <>{media({ position: "absolute", inset: 0, ...base })}</>;
  }
  return (
    <div className="absolute" style={cropWindowWrapperStyle(crop)}>
      {media({ ...base, ...rotationTransform(crop, aspect) })}
    </div>
  );
}

// ── crop-mode editor (WI-074 / DR-029 D8 redesign — Phase 1) ─────────────────
//
// Shows the FULL source extending beyond the frame box, DIMMED, with the frame-box
// region drawn a SECOND time at full brightness. Drag to PAN; commit/cancel is
// external (DesignPage) via the shared store, which the SelectionLayer handles +
// the FrameStage dispatcher edit live.

export function CropEditor({
  initial,
  aspect,
  objectFit,
  filterCss,
  media,
}: {
  readonly initial: CropRect;
  readonly aspect: number;
  readonly objectFit: CSSProperties["objectFit"];
  readonly filterCss: string;
  readonly media: MediaRender;
}): JSX.Element {
  const draft = useCropDraft() ?? initial;
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; start: CropRect } | null>(null);

  // Pan: drag the media to choose which part fills the frame box (cropRatio x/y).
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
          ? cropWindowUnit.pan(drag.start, dx, dy)
          : cropWindowUnit.panOffset(drag.start, dx, dy, r.width / r.height);
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
  const mediaStyle: CSSProperties = {
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
        {media(mediaStyle)}
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
          {media(mediaStyle)}
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
