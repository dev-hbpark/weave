// WI-020 Phase 3 — VideoBlock renderer.
//
// Reads VideoAttrs (DR-023) and renders a `<video>` filling the frame.
// Trim (startMs/endMs) is enforced via timeupdate handler that loops or
// pauses past endMs. Autoplay is honoured only when muted is true
// (browsers reject autoplay+sound combinations).

import type { Item as AgocraftItem, ShadowSpec } from "@agocraft/core";
import { findUnitInItem, OPACITY_UNIT_KIND, SHADOW_UNIT_KIND, shadowToCss } from "@agocraft/core";
import { type CSSProperties, useEffect, useRef } from "react";
import { type CornerRadii, mediaBorderRadius } from "../corner-radius.js";
import type { AgoItem, VideoAttrs } from "../types.js";
import { MediaPlaceholder } from "./MediaPlaceholder.js";

interface VideoBlockProps {
  readonly item: AgoItem<"video">;
  readonly onUpdate?: (patch: Partial<VideoAttrs>) => void;
}

export function VideoBlock({ item, onUpdate }: VideoBlockProps): JSX.Element {
  void onUpdate;
  const a = item.attrs;
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Sync trim: when current time exceeds endMs, loop back or pause.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return undefined;
    function handleTimeUpdate(): void {
      if (!el) return;
      const startS = (a.trim?.startMs ?? 0) / 1000;
      const endS = a.trim?.endMs != null ? a.trim.endMs / 1000 : Infinity;
      if (el.currentTime < startS) el.currentTime = startS;
      if (el.currentTime >= endS) {
        if (a.loop) el.currentTime = startS;
        else el.pause();
      }
    }
    el.addEventListener("timeupdate", handleTimeUpdate);
    // Seek to start on first mount.
    if (a.trim?.startMs) el.currentTime = a.trim.startMs / 1000;
    return () => el.removeEventListener("timeupdate", handleTimeUpdate);
  }, [a.trim?.startMs, a.trim?.endMs, a.loop]);

  // Volume / playback rate.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.volume = a.volume;
    el.playbackRate = a.playbackRate;
  }, [a.volume, a.playbackRate]);

  const objectFit: CSSProperties["objectFit"] =
    a.fit === "fill"
      ? "fill"
      : a.fit === "contain"
        ? "contain"
        : a.fit === "none"
          ? "none"
          : "cover";

  // DR-028 — shadow / opacity are decoration UNITS (no legacy attr fallback).
  const shadowSpec = findUnitInItem(item as unknown as AgocraftItem, SHADOW_UNIT_KIND)?.attrs as
    | ShadowSpec
    | undefined;
  const shadow = shadowSpec ? shadowToCss(shadowSpec) : undefined;
  const opacity =
    (
      findUnitInItem(item as unknown as AgocraftItem, OPACITY_UNIT_KIND)?.attrs as
        | { value: number }
        | undefined
    )?.value ?? 1;

  // Source-less video (wireframe / layout draft): show the COVER IMAGE if a
  // poster is set, otherwise an icon placeholder — never an empty/black <video>
  // (mirrors the image source-less placeholder, WI-076).
  const hasSrc = a.src.trim().length > 0;
  const poster = a.poster?.trim() ?? "";

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        // borderRadius is an absolute design-px radius (CSS clamps + circular).
        // WI-109 — a per-corner `borderRadii` four-tuple overrides it.
        borderRadius: mediaBorderRadius(
          (a as { borderRadii?: CornerRadii }).borderRadii,
          a.borderRadius,
        ),
        opacity,
        boxShadow: shadow,
      }}
    >
      {hasSrc ? (
        <video
          ref={videoRef}
          src={a.src}
          poster={a.poster ?? undefined}
          controls={a.controls}
          autoPlay={a.autoplay && a.muted}
          loop={a.loop}
          muted={a.muted}
          playsInline
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit,
            userSelect: "none",
          }}
        />
      ) : poster ? (
        <VideoPosterCover poster={poster} alt={a.alt ?? ""} objectFit={objectFit} />
      ) : (
        <VideoPlaceholder alt={a.alt ?? ""} />
      )}
    </div>
  );
}

/** Source-less video with a poster: render the poster as a static COVER IMAGE,
 *  overlaid with a play badge so it still reads as "a video goes here". The
 *  outer wrapper already applies borderRadius / shadow / opacity. */
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
 *  framed surface with a play/film glyph instead of an empty black <video>. When
 *  `alt` is set it is drawn as a centered caption so the slot can describe what
 *  KIND of video belongs here. Glyph + caption scale to the frame size (mirrors
 *  ImagePlaceholder via the shared MediaPlaceholder, WI-076). */
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
