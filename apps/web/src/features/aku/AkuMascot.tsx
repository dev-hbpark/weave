// 아쿠 마스코트 이미지 (WI-053) — the brand character asset, used at two tiers:
//   - "mark" → the launcher (small, face bust)
//   - "full" → panel header / empty state / coachmark (whole character)
// Served statically from apps/web/public/aku/ (see features/aku/MASCOT.md).
// Decorative (aria-hidden): the surrounding button/heading carries the label.
// `draggable={false}` + `pointer-events-none` so a drag on the launcher never
// starts a native image drag and clicks always hit the button.

// Single brand hero asset (WI-104). Both tiers use the same /aku/mascot.png; the
// animated per-state sprite SHEETS live under /aku/sprites/ and are driven by the
// engine (gpu-sprite-renderer), not here. This component is the static fallback /
// panel-header / coachmark image.
const MASCOT_SRC = "/aku/mascot.png";

export function AkuMascot({
  variant: _variant = "mark",
  className,
}: {
  readonly variant?: "mark" | "full";
  readonly className?: string;
}): JSX.Element {
  return (
    <img
      src={MASCOT_SRC}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`pointer-events-none select-none object-contain ${className ?? ""}`}
    />
  );
}
