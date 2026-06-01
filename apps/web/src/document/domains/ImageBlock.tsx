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
//  • crop mode (double-click) — the full image is shown with a dim mask + outline
//    marking the current crop window, plus a STRAIGHTEN slider (content rotation).
//    Commit routes through `onUpdate({ cropRatio })` → weave.item.update → History.
//    v1 NOTE: interactive window drag/resize is deferred (inline handles are
//    swallowed by the design-plane gesture controllers — DR-029 D4 SelectionLayer
//    delegation). Set the window via weave.image.setCrop (toolbar / agent). Offset
//    windows + large rotation may expose minor edges (cover-zoom uses frame
//    aspect) — precise pixel crop is deferred (DR-029 D1).

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
import { croppingState } from "../interactions/cropping-state.js";
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

// ── crop-mode editor (WI-074) ────────────────────────────────────────────────
//
// v1 UI scope: STRAIGHTEN (content rotation, DR-029 D6) + a read-only view of the
// current crop window (dim mask + outline). Interactive window drag/resize is
// deferred: inline handles are swallowed by the design-plane's capture-phase
// gesture controllers (marquee / rubber-band / frame-move / handle dispatcher) —
// exactly the reason DR-029 D4 specifies SelectionLayer (body-portal) delegation.
// Until that lands, set the window via `weave.image.setCrop` (toolbar / agent).

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
  const [draft, setDraft] = useState<CropRect>(initial);
  const draftRef = useRef<CropRect>(draft);
  draftRef.current = draft;

  // ESC = cancel, Enter = commit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onCommit(draftRef.current);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel, onCommit]);

  const stop = (e: ReactPointerEvent<HTMLDivElement>) => e.stopPropagation();
  const deg = Math.round((draft.rotation * 180) / Math.PI);

  // dim mask = four rects around the current window (read-only view).
  const win = draft;
  const dim = "rgba(0,0,0,0.45)";
  const maskRects: ReadonlyArray<CSSProperties> = [
    { left: 0, top: 0, width: "100%", height: `${win.y * 100}%` },
    { left: 0, top: `${(win.y + win.h) * 100}%`, width: "100%", bottom: 0 },
    { left: 0, top: `${win.y * 100}%`, width: `${win.x * 100}%`, height: `${win.h * 100}%` },
    {
      left: `${(win.x + win.w) * 100}%`,
      top: `${win.y * 100}%`,
      right: 0,
      height: `${win.h * 100}%`,
    },
  ];

  return (
    <div
      data-testid="image-crop-editor"
      className="absolute inset-0"
      onPointerDown={stop}
      onDoubleClick={stop}
    >
      {/* full image (rotated) — the crop context */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        decoding="async"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit,
          filter: filterCss,
          userSelect: "none",
          ...rotationTransform(draft.rotation, aspect),
        }}
      />
      {/* dim mask outside the window */}
      {maskRects.map((s, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed 4-rect mask
          key={i}
          className="absolute"
          style={{ ...s, background: dim, pointerEvents: "none" }}
        />
      ))}
      {/* crop window — read-only outline of the current crop region */}
      <div
        data-testid="image-crop-window"
        className="absolute"
        style={{
          left: `${win.x * 100}%`,
          top: `${win.y * 100}%`,
          width: `${win.w * 100}%`,
          height: `${win.h * 100}%`,
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
            setDraft((d) => ({ ...d, rotation: (Number(e.target.value) * Math.PI) / 180 }))
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
          onClick={() => onCommit(draft)}
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
    croppingState.enter(itemId);
    return () => croppingState.exit(itemId);
  }, [cropMode, itemId]);

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
      className="relative h-full w-full overflow-hidden"
      style={{
        borderRadius: a.borderRadius ? `${a.borderRadius * 50}%` : 0,
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
