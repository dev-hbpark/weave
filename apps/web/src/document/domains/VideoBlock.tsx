// WI-020 Phase 3 — video content View. Renders a `<video>` filling the frame;
// trim (startMs/endMs) is enforced via a timeupdate handler that loops or pauses
// past endMs. Autoplay is honoured only when muted (browser policy).
//
// WI-243 / DR-160 — split into ViewModel + pure View. Style/objectFit/flags + the
// `control` bundle live in `video-item-view-model.ts`; `VideoView` renders from
// `{ vm }` ONLY (never reads `item.*`). The <video> element + its imperative
// effects (trim seek/loop, volume, playbackRate) are DOM concerns the View owns,
// driven by the VM's projected `control` values.

import type { CSSProperties } from "react";
import { type JSX, useEffect, useRef } from "react";
import type { AgoItem, VideoAttrs } from "../types.js";
import { MediaPlaceholder } from "./MediaPlaceholder.js";
import { useVideoItemViewModel, type VideoItemVm } from "./video-item-view-model.js";

interface VideoBlockProps {
  readonly item: AgoItem<"video">;
  readonly onUpdate?: (patch: Partial<VideoAttrs>) => void;
}

/** Pure content View for a video item — renders from `{ vm }` ONLY. Owns the
 *  <video> DOM element + its imperative trim/volume effects, driven by the VM's
 *  `control` values. */
export function VideoView({ vm }: { readonly vm: VideoItemVm }): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { trimStartMs, trimEndMs, loop, volume, playbackRate } = vm.control;

  // Sync trim: when current time exceeds endMs, loop back or pause. No-ops when
  // no <video> is mounted (poster / placeholder status).
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
    // Seek to start on first mount.
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
    <div className="relative h-full w-full overflow-hidden" style={vm.wrapperStyle}>
      {vm.status === "video" ? (
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
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: vm.objectFit,
            userSelect: "none",
          }}
        />
      ) : vm.status === "poster" ? (
        <VideoPosterCover poster={vm.poster} alt={vm.alt} objectFit={vm.objectFit} />
      ) : (
        <VideoPlaceholder alt={vm.alt} />
      )}
    </div>
  );
}

/** Source-less video with a poster: render the poster as a static COVER IMAGE,
 *  overlaid with a play badge so it still reads as "a video goes here". The outer
 *  wrapper already applies borderRadius / shadow / opacity. */
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
export function VideoBlock({ item }: VideoBlockProps): JSX.Element {
  const vm = useVideoItemViewModel(item);
  return <VideoView vm={vm} />;
}
