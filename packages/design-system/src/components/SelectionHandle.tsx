// Center-positioned selection handle. The button's left/top fall on the
// owning SelectionLayer's corner / edge / above-top anchor *and* it gets
// `transform: translate(-50%, -50%)` so the visible square is centred on
// that point — half inside, half outside the box. Sizes are CSS pixels so
// the handle stays the same on-screen size regardless of how the canvas
// has been zoomed.

import type { CSSProperties } from "react";

export type HandleKind = "corner" | "edge" | "rotation";
export type HandleDir = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

interface SelectionHandleProps {
  readonly kind: HandleKind;
  /** Required for corner / edge handles, omitted for rotation. */
  readonly dir?: HandleDir;
  readonly onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  readonly ariaLabel: string;
}

const CORNER_POS: Record<HandleDir, { left: string; top: string }> = {
  nw: { left: "0%", top: "0%" },
  n: { left: "50%", top: "0%" },
  ne: { left: "100%", top: "0%" },
  e: { left: "100%", top: "50%" },
  se: { left: "100%", top: "100%" },
  s: { left: "50%", top: "100%" },
  sw: { left: "0%", top: "100%" },
  w: { left: "0%", top: "50%" },
};

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

/** DR-018 — positionless visual button. Use when SelectionLayer's
 *  external-handles path already positions the wrapper via the
 *  registry's anchor math. Same shape / color / hover behavior as
 *  SelectionHandle, just without absolute left/top/translate. */
export interface SelectionHandleButtonProps {
  readonly kind: HandleKind;
  readonly dir?: HandleDir;
  readonly onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  readonly ariaLabel: string;
}

export function SelectionHandleButton({
  kind,
  dir,
  onPointerDown,
  ariaLabel,
}: SelectionHandleButtonProps) {
  const cursor =
    kind === "rotation"
      ? "grab"
      : dir !== undefined
        ? CURSOR_BY_DIR[dir]
        : "default";
  const sizePx = kind === "edge" ? 8 : 10;
  const style: CSSProperties = {
    width: sizePx,
    height: sizePx,
    cursor,
    background: "#ffffff",
    border: "1.5px solid var(--accent)",
    borderRadius: kind === "rotation" ? "50%" : "2px",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.18)",
    padding: 0,
    boxSizing: "border-box",
    display: "block",
  };
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      data-handle-kind={kind}
      data-handle-dir={dir}
      onPointerDown={onPointerDown}
      style={style}
      className="focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] hover:scale-110 transition-transform duration-[var(--motion-quick)]"
    />
  );
}

export function SelectionHandle({
  kind,
  dir,
  onPointerDown,
  ariaLabel,
}: SelectionHandleProps) {
  const cursor =
    kind === "rotation"
      ? "grab"
      : dir !== undefined
        ? CURSOR_BY_DIR[dir]
        : "default";

  // Position: corner/edge from CORNER_POS; rotation sits 22px above top
  // centre with a stem rendered via box-shadow on a pseudo-strategy
  // (handled below via a separate <span> when needed).
  let left: string;
  let top: string;
  if (kind === "rotation") {
    left = "50%";
    top = "-22px";
  } else if (dir !== undefined) {
    left = CORNER_POS[dir].left;
    top = CORNER_POS[dir].top;
  } else {
    left = "0%";
    top = "0%";
  }

  // Sizes (CSS pixels). Corners get a slightly larger hit area than edges
  // — corners read as "resize both axes" handles and benefit from a bit
  // more visual weight. Rotation is a circle, sized to match corners.
  const sizePx = kind === "edge" ? 8 : 10;

  const style: CSSProperties = {
    position: "absolute",
    left,
    top,
    transform: "translate(-50%, -50%)",
    width: sizePx,
    height: sizePx,
    cursor,
    background: "#ffffff",
    border: "1.5px solid var(--accent)",
    borderRadius: kind === "rotation" ? "50%" : "2px",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.18)",
    padding: 0,
    pointerEvents: "auto",
    boxSizing: "border-box",
  };

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      data-handle-kind={kind}
      data-handle-dir={dir}
      onPointerDown={onPointerDown}
      style={style}
      className="focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] hover:scale-110 transition-transform duration-[var(--motion-quick)]"
    />
  );
}
