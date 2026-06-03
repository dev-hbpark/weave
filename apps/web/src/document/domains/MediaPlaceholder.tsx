// Shared source-less media placeholder (WI-076). ImageBlock + VideoBlock render
// the SAME neutral framed surface — a centered glyph plus an optional `alt`
// caption — differing only in the glyph. This component is that surface.
//
// Proportional sizing: the glyph and caption scale to the frame's CONSTRAINING
// side (min of width/height), measured live via ResizeObserver. A bigger frame
// shows a bigger icon + larger text; a wide-thin or tall-narrow frame is driven
// by its short side so the glyph never overflows. All values are clamped so a
// thumbnail stays legible and a full-bleed frame doesn't get a comic-sized icon.

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

interface MediaPlaceholderProps {
  /** Stable hook for e2e (`image-placeholder` / `video-placeholder`). */
  readonly testId: string;
  /** Description drawn as a centered caption when the frame is large enough. */
  readonly alt: string;
  /** Inner SVG nodes for the glyph (viewBox 0 0 24 24, stroke currentColor). */
  readonly glyph: ReactNode;
}

/** The outer wrapper already applies borderRadius / shadow / opacity, so this
 *  fills the box with `inset: 0`. */
export function MediaPlaceholder({ testId, alt, glyph }: MediaPlaceholderProps): JSX.Element {
  const caption = alt.trim();
  const boxRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState(0);

  // useLayoutEffect → first measure lands before paint, so the proportional
  // sizes are correct on the initial frame (no flash of a default-sized glyph).
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (el === null) return;
    const update = (): void => {
      const r = el.getBoundingClientRect();
      setSide(Math.min(r.width, r.height));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Glyph ≈ 24% of the short side (16–96px); caption tracks the glyph (9–24px);
  // gap + padding scale too so the composition stays balanced at every size.
  const iconSize = clamp(Math.round(side * 0.24), 16, 96);
  const fontSize = clamp(Math.round(iconSize * 0.46), 9, 24);
  const gap = clamp(Math.round(side * 0.04), 2, 14);
  const pad = clamp(Math.round(side * 0.06), 6, 28);
  // Below ~80px the short side can't fit a legible multi-line caption — show the
  // glyph alone so a small slot stays clean.
  const showCaption = caption.length > 0 && side >= 80;

  return (
    <div
      ref={boxRef}
      data-testid={testId}
      className="absolute inset-0 flex flex-col items-center justify-center text-center"
      style={{
        gap,
        padding: pad,
        background: "rgba(148, 163, 184, 0.14)",
        color: "rgba(71, 85, 105, 0.85)",
        userSelect: "none",
      }}
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ opacity: 0.6, flexShrink: 0 }}
      >
        {glyph}
      </svg>
      {showCaption ? (
        <span
          className="max-w-full leading-snug"
          style={{
            fontSize,
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            wordBreak: "break-word",
          }}
        >
          {caption}
        </span>
      ) : null}
    </div>
  );
}
