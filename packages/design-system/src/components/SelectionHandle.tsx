import type { CSSProperties } from "react";
import { cn } from "../cn.js";

export type HandleKind = "corner" | "edge" | "rotation";
export type HandleDir = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

interface SelectionHandleProps {
  readonly kind: HandleKind;
  readonly dir?: HandleDir; // corner / edge 에는 의무. rotation 은 항상 top-center
  readonly onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly ariaLabel: string;
}

const CURSOR_BY_DIR: Record<HandleDir, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

export function SelectionHandle({
  kind,
  dir,
  onPointerDown,
  className,
  style,
  ariaLabel,
}: SelectionHandleProps) {
  const cursor = kind === "rotation" ? "crosshair" : dir ? CURSOR_BY_DIR[dir] : "default";
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      data-handle-kind={kind}
      data-handle-dir={dir}
      onPointerDown={onPointerDown}
      style={{ ...style, cursor }}
      className={cn(
        "absolute",
        kind === "rotation"
          ? "w-3 h-3 rounded-full bg-[color:var(--bg-page)] border-2 border-[color:var(--accent)] shadow-[var(--shadow-glow)]"
          : "w-2.5 h-2.5 rounded-[2px] bg-[color:var(--bg-page)] border border-[color:var(--accent)]",
        "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
        "hover:scale-110 transition-transform duration-[var(--motion-quick)]",
        className,
      )}
    />
  );
}
