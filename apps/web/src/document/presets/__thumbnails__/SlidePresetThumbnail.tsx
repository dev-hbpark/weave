// WI-030 — Preset thumbnail. Token-DOM silhouette derived from the preset's
// own factory output so the preview always matches what the user will get
// when they click. Lower-fidelity than the actual canvas render (no font
// loading, no shape SVG geometry) — token-colored rectangles approximate
// each child's footprint.
//
// SOLID/GRASP: this component is a pure projection of `preset.factory()` —
// no preset-id branching. Adding a new preset = nothing here changes.

import type { Item as AgocraftItem } from "@agocraft/core";
import { type CSSProperties, useMemo } from "react";
import type { Preset } from "../types.js";

const NOW_ISO = "1970-01-01T00:00:00.000Z";

/** Deterministic id generator used only for thumbnail factory runs. The
 *  thumbnail never reaches the document or the network, so collision with
 *  real Item ids is impossible. */
function makeDeterministicIdFactory() {
  let n = 0;
  return (prefix: string) => `thumb-${prefix}-${++n}`;
}

export interface SlidePresetThumbnailProps {
  readonly preset: Preset;
  readonly locale: "ko" | "en";
}

export function SlidePresetThumbnail({ preset, locale }: SlidePresetThumbnailProps) {
  // Memoize — preset.factory is pure given the same locale + id factory, so
  // the thumbnail's silhouette is stable across re-renders.
  const slide = useMemo(
    () =>
      preset.factory({
        locale,
        newId: makeDeterministicIdFactory(),
        now: NOW_ISO,
      }),
    [preset, locale],
  );

  return (
    <div
      data-testid={`preset-thumbnail-${preset.id}`}
      className="relative w-full aspect-[16/9] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] rounded-[var(--radius-sm)] overflow-hidden"
      aria-hidden
    >
      {slide.children.map((child) => (
        <ChildSilhouette key={String(child.id)} item={child} />
      ))}
    </div>
  );
}

function ChildSilhouette({ item }: { item: AgocraftItem }) {
  const attrs = item.attrs as {
    readonly frame?: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
    readonly fill?: unknown;
    readonly color?: string;
    readonly shape?: string;
  };

  const frame = attrs.frame;
  if (frame === undefined) return null;

  const baseStyle: CSSProperties = {
    position: "absolute",
    left: `${frame.x * 100}%`,
    top: `${frame.y * 100}%`,
    width: `${frame.width * 100}%`,
    height: `${frame.height * 100}%`,
    borderRadius: 2,
  };

  if (item.kind === "shape") {
    // Read the solid color out of the PaintSpec — the silhouette uses it
    // directly so the thumbnail picks up the preset's accent.
    const fill = attrs.fill as { readonly type?: string; readonly color?: string } | undefined;
    const cssColor =
      fill?.type === "solid" && typeof fill.color === "string"
        ? fill.color
        : "var(--surface-3, rgba(255,255,255,0.15))";
    const isEllipse = attrs.shape === "ellipse";
    return (
      <div
        style={{
          ...baseStyle,
          background: cssColor,
          borderRadius: isEllipse ? "50%" : baseStyle.borderRadius,
          opacity: 0.85,
        }}
      />
    );
  }

  if (item.kind === "text") {
    // Approximate the text as 2-3 stacked token-soft lines whose total
    // height matches the text frame's vertical span.
    const lineHeightPx = Math.max(2, frame.height * 28);
    return (
      <div
        style={{
          ...baseStyle,
          display: "flex",
          flexDirection: "column",
          gap: 3,
          justifyContent: "center",
        }}
      >
        <div
          style={{
            height: lineHeightPx,
            width: "92%",
            borderRadius: 1.5,
            background: attrs.color ?? "var(--text-soft)",
            opacity: 0.45,
          }}
        />
        <div
          style={{
            height: lineHeightPx * 0.7,
            width: "70%",
            borderRadius: 1.5,
            background: attrs.color ?? "var(--text-soft)",
            opacity: 0.3,
          }}
        />
      </div>
    );
  }

  return null;
}
