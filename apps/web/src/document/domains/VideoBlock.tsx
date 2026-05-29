// WI-020 Phase 3 — VideoBlock renderer.
//
// Reads VideoAttrs (DR-023) and renders a `<video>` filling the frame.
// Trim (startMs/endMs) is enforced via timeupdate handler that loops or
// pauses past endMs. Autoplay is honoured only when muted is true
// (browsers reject autoplay+sound combinations).

import type { Item as AgocraftItem, ShadowSpec } from "@agocraft/core";
import { findUnitInItem, SHADOW_UNIT_KIND, shadowToCss } from "@agocraft/core";
import { type CSSProperties, useEffect, useRef } from "react";
import type { AgoItem, VideoAttrs } from "../types.js";

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

  // DR-028 — prefer the decoration.shadow UNIT; fall back to legacy attrs.shadow.
  const shadowSpec =
    (findUnitInItem(item as unknown as AgocraftItem, SHADOW_UNIT_KIND)?.attrs as
      | ShadowSpec
      | undefined) ??
    a.shadow ??
    undefined;
  const shadow = shadowSpec ? shadowToCss(shadowSpec) : undefined;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        borderRadius: a.borderRadius ? `${a.borderRadius * 50}%` : 0,
        opacity: a.opacity,
        boxShadow: shadow,
      }}
    >
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
    </div>
  );
}
