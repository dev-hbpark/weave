// 아쿠 마스코트 이미지 (WI-053) — the brand character asset, used at two tiers:
//   - "mark" → the launcher (small, face bust)
//   - "full" → panel header / empty state / coachmark (whole character)
// Served statically from apps/web/public/aku/ (see features/aku/MASCOT.md).
// Decorative (aria-hidden): the surrounding button/heading carries the label.
// `draggable={false}` + `pointer-events-none` so a drag on the launcher never
// starts a native image drag and clicks always hit the button.

const SRC = {
  mark: "/aku/mascot-full",
  full: "/aku/mascot-full",
} as const;

export function AkuMascot({
  variant = "mark",
  className,
}: {
  readonly variant?: "mark" | "full";
  readonly className?: string;
}): JSX.Element {
  const base = SRC[variant];
  return (
    <img
      src={`${base}.png`}
      srcSet={`${base}.png 1x, ${base}@2x.png 2x`}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`pointer-events-none select-none object-contain ${className ?? ""}`}
    />
  );
}
