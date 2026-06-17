// WI-020 Phase 3 — video content View. Renders a `<video>` filling the frame;
// trim (startMs/endMs) is enforced via a timeupdate handler that loops or pauses
// past endMs. Autoplay is honoured only when muted (browser policy).
//
// WI-243/DR-160 — ViewModel + pure View ({ vm } only). WI-244/DR-161 — crop is a
// kind-agnostic unit, so a video crops like an image: the committed crop renders
// through the shared `CroppedMedia` and crop-mode through the shared `CropEditor`,
// both fed a `<video>` via the media render-prop. The <video> element + its
// imperative effects (trim/volume) are DOM concerns the View owns; the frame-box
// aspect (rotation cover-zoom) is measured here.

import { type CSSProperties, type JSX, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AgoItem, VideoAttrs } from "../types.js";
import { MediaPlaceholder } from "./MediaPlaceholder.js";
import { CropEditor, CroppedMedia } from "./media/crop-editor.js";
import { useVideoItemViewModel, type VideoItemVm } from "./video-item-view-model.js";

interface VideoBlockProps {
  readonly item: AgoItem<"video">;
  readonly onUpdate?: (patch: Partial<VideoAttrs>) => void;
}

/** Pure content View for a video item — renders from `{ vm }` ONLY. Owns the
 *  <video> DOM element + its imperative trim/volume effects (driven by the VM's
 *  `control` values) and the DOM-measured frame-box aspect for cropped render. */
export function VideoView({ vm }: { readonly vm: VideoItemVm }): JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [aspect, setAspect] = useState(1);
  const { trimStartMs, trimEndMs, loop, volume, playbackRate } = vm.control;

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

  // Sync trim: when current time exceeds endMs, loop back or pause. No-ops when no
  // ref'd <video> is mounted (poster / placeholder / crop status).
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return undefined;
    function handleTimeUpdate(): void {
      if (!el) return;
      const startS = (trimStartMs ?? 0) / 1000;
      const endS = trimEndMs != null ? trimEndMs / 1000 : Infinity;
      if (el.currentTime < startS) el.currentTime = startS;
      if (el.currentTime >= endS) {
        if (loop) el.currentTime = startS;
        else el.pause();
      }
    }
    el.addEventListener("timeupdate", handleTimeUpdate);
    if (trimStartMs) el.currentTime = trimStartMs / 1000;
    return () => el.removeEventListener("timeupdate", handleTimeUpdate);
  }, [trimStartMs, trimEndMs, loop]);

  // Volume / playback rate.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.volume = volume;
    el.playbackRate = playbackRate;
  }, [volume, playbackRate]);

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
      {vm.status === "placeholder" ? (
        <VideoPlaceholder alt={vm.alt} />
      ) : vm.status === "poster" ? (
        <VideoPosterCover poster={vm.poster} alt={vm.alt} objectFit={vm.objectFit} />
      ) : vm.status === "crop" ? (
        <CropEditor
          initial={vm.crop}
          aspect={aspect}
          objectFit={vm.objectFit}
          filterCss=""
          media={(style: CSSProperties) => (
            <video src={vm.src} muted playsInline draggable={false} style={style} />
          )}
        />
      ) : (
        <CroppedMedia
          crop={vm.crop}
          aspect={aspect}
          objectFit={vm.objectFit}
          filterCss=""
          media={(style: CSSProperties) => (
            <video
              ref={videoRef}
              src={vm.src}
              poster={vm.poster}
              controls={vm.controls}
              autoPlay={vm.autoPlay}
              loop={vm.loop}
              muted={vm.muted}
              playsInline
              draggable={false}
              style={style}
            />
          )}
        />
      )}
    </div>
  );
}

/** Source-less video with a poster: render the poster as a static COVER IMAGE,
 *  overlaid with a play badge so it still reads as "a video goes here". */
function VideoPosterCover({
  poster,
  alt,
  objectFit,
}: {
  readonly poster: string;
  readonly alt: string;
  readonly objectFit: CSSProperties["objectFit"];
}): JSX.Element {
  return (
    <div data-testid="video-poster-cover" className="absolute inset-0">
      <img
        src={poster}
        alt={alt}
        draggable={false}
        loading="lazy"
        decoding="async"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit }}
      />
      <PlayBadge />
    </div>
  );
}

/** Placeholder shown when a video item has no `src` and no `poster` — a neutral
 *  framed surface with a play/film glyph instead of an empty black <video>. */
function VideoPlaceholder({ alt }: { readonly alt: string }): JSX.Element {
  return (
    <MediaPlaceholder
      testId="video-placeholder"
      alt={alt}
      glyph={
        <>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" />
        </>
      }
    />
  );
}

/** Small centered play badge drawn over a poster-only video so the still frame
 *  still reads as a video placeholder. */
function PlayBadge(): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 flex items-center justify-center"
      style={{ pointerEvents: "none" }}
    >
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: 56,
          height: 56,
          background: "rgba(15, 23, 42, 0.55)",
          backdropFilter: "blur(2px)",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>
  );
}

/** Registered renderer. Thin shim: resolve the ViewModel, render the pure View.
 *  WI-243 transitional — Phase-0 facet will register `useViewModel`/`view`. */
export function VideoBlock({ item, onUpdate }: VideoBlockProps): JSX.Element {
  const vm = useVideoItemViewModel(item, onUpdate);
  return <VideoView vm={vm} />;
}
