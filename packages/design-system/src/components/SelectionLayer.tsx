import type { PointerEvent as ReactPointerEvent } from "react";
import { cn } from "../cn.js";
import { type HandleDir, SelectionHandle } from "./SelectionHandle.js";

/** Render-only selection overlay. Position + rotation come from the host so it
 *  can mirror whatever coordinate system the underlying surface uses. Capability
 *  flags decide which handles are visible — center-based math + state lives in
 *  the host's pointer-drag handler. */

export interface SelectionLayerCapability {
  readonly moveable: boolean;
  readonly resizable: boolean;
  readonly rotatable: boolean;
  readonly resizeHandles: ReadonlyArray<HandleDir>;
}

interface SelectionLayerProps {
  /** Box position + rotation in the parent surface's units (px or percent). */
  readonly box: {
    readonly left: number | string;
    readonly top: number | string;
    readonly width: number | string;
    readonly height: number | string;
    readonly rotation: number; // radians
  };
  readonly capability: SelectionLayerCapability;
  /** Pointer-down on the body (used for move drag). */
  readonly onMoveStart?: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  /** Pointer-down on a resize handle. */
  readonly onResizeStart?: (dir: HandleDir, e: ReactPointerEvent<HTMLButtonElement>) => void;
  /** Pointer-down on the rotation handle. */
  readonly onRotateStart?: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  readonly className?: string;
}

const CORNER_POS: Record<HandleDir, { left: string; top: string; translate: string }> = {
  nw: { left: "0%", top: "0%", translate: "-50% -50%" },
  n: { left: "50%", top: "0%", translate: "-50% -50%" },
  ne: { left: "100%", top: "0%", translate: "-50% -50%" },
  e: { left: "100%", top: "50%", translate: "-50% -50%" },
  se: { left: "100%", top: "100%", translate: "-50% -50%" },
  s: { left: "50%", top: "100%", translate: "-50% -50%" },
  sw: { left: "0%", top: "100%", translate: "-50% -50%" },
  w: { left: "0%", top: "50%", translate: "-50% -50%" },
};

export function SelectionLayer({
  box,
  capability,
  onMoveStart,
  onResizeStart,
  onRotateStart,
  className,
}: SelectionLayerProps) {
  const wrapperStyle = {
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    transform: `rotate(${box.rotation}rad)`,
    transformOrigin: "center center",
  } as const;

  return (
    <div
      className={cn(
        "absolute pointer-events-none",
        // ring
        "outline outline-2 outline-offset-0 outline-[color:var(--accent)]",
        "shadow-[var(--shadow-glow)]",
        className,
      )}
      style={wrapperStyle}
      data-selection-layer
    >
      {/* Body — moves on pointer drag if moveable. */}
      {capability.moveable && onMoveStart ? (
        <button
          type="button"
          aria-label="Move selection"
          onPointerDown={onMoveStart}
          className="absolute inset-0 cursor-move pointer-events-auto bg-transparent border-0 p-0 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        />
      ) : null}

      {/* Resize handles. */}
      {capability.resizable && onResizeStart
        ? capability.resizeHandles.map((dir) => (
            <span key={dir} className="absolute pointer-events-auto" style={CORNER_POS[dir]}>
              <SelectionHandle
                kind={dir === "n" || dir === "e" || dir === "s" || dir === "w" ? "edge" : "corner"}
                dir={dir}
                ariaLabel={`Resize ${dir}`}
                onPointerDown={(e) => onResizeStart(dir, e)}
              />
            </span>
          ))
        : null}

      {/* Rotation handle — short stem above top-center. */}
      {capability.rotatable && onRotateStart ? (
        <>
          <span
            aria-hidden
            className="absolute pointer-events-none bg-[color:var(--accent)]"
            style={{
              left: "50%",
              top: "-24px",
              width: 2,
              height: 18,
              transform: "translateX(-50%)",
            }}
          />
          <span
            className="absolute pointer-events-auto"
            style={{ left: "50%", top: "-28px", transform: "translate(-50%, -50%)" }}
          >
            <SelectionHandle
              kind="rotation"
              ariaLabel="Rotate selection"
              onPointerDown={onRotateStart}
            />
          </span>
        </>
      ) : null}
    </div>
  );
}
