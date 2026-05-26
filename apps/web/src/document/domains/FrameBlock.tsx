// WI-032 — Frame block: the canvas container of the new paradigm.
//
// Renders no visible content of its own — just an optional background paint
// and an optional border-radius. All visible elements inside the frame come
// from primitive child Items (`text`, `shape`, `image`, `video`, nested
// `frame`). FrameSurface (agocraft) recurses into `item.children` and lays
// them out at their own `frame` rectangles.
//
// SOLID / GRASP:
//   • SRP — only paints the container chrome. Selection / handles / hover
//     affordance / drilling all live on the FrameSurface layer above.
//   • Information Expert — knows only its own background + corner radius;
//     never inspects children.
//   • OS Rule 6 — no kind/type switch. Single component for a single kind.

import type { Item as AgocraftItem } from "@agocraft/core";
import { useResolveColor } from "../style/resolver-context.js";
import type { AgoItem } from "../types.js";

interface FrameBlockProps {
  readonly item: AgoItem<"frame">;
}

export function FrameBlock({ item }: FrameBlockProps) {
  const { background, cornerRadius } = item.attrs;
  // WI-040 — `background` may be a raw CSS string OR a `StyleRef`
  // ({ $ref: "color.accent" }) written when the user picked a theme color.
  // Resolve via the cascade hook so per-frame / per-slide style.provider
  // Units could override the token. When no provider context is mounted
  // (tests, standalone embeds) the hook degrades to raw value.
  const resolvedBg = useResolveColor(background, item as unknown as AgocraftItem, "transparent");
  // borderRadius: 0..1 ratio of min(w,h). For most frames the actual `min`
  // is unknown here (we render via `inset: 0` so the box matches the
  // FrameSurface). Map to a percentage so 1.0 = a pill / circle.
  const radius =
    cornerRadius !== undefined && cornerRadius > 0 ? `${cornerRadius * 50}%` : undefined;
  return (
    <div
      data-testid="frame-block"
      data-frame-kind="frame"
      className="absolute inset-0 pointer-events-none"
      style={{
        background: resolvedBg ?? "transparent",
        borderRadius: radius,
      }}
    />
  );
}
