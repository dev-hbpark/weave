// WI-017 Phase C — rubber-band state types.

/**
 * 4-state lifecycle (WI-017 Phase C):
 *   - idle        : no drag in flight, no popover open.
 *   - drawing     : pointer is down, rect tracks the pointer.
 *   - reviewing   : pointer released, rect persists, popover is open.
 *   - previewing  : popover item is hovered, skeleton silhouette is showing.
 *   - inserting   : commit fired, brief transitional state before idle.
 *
 * Transitions are owned by `useRubberBand`:
 *   idle      ──pointerdown(empty)──▶ drawing
 *   drawing   ──pointermove──────────▶ drawing      (rect updates)
 *   drawing   ──pointerup(small)─────▶ idle
 *   drawing   ──pointerup(valid)─────▶ reviewing
 *   drawing   ──pointercancel────────▶ idle
 *   reviewing ──preview(kind)────────▶ previewing
 *   previewing──preview(null)────────▶ reviewing
 *   reviewing ──commit───────────────▶ inserting ──▶ idle (auto)
 *   previewing──commit───────────────▶ inserting ──▶ idle (auto)
 *   any (non-idle/inserting) ──Esc──▶ idle
 */
export type RubberBandHostState =
  | "idle"
  | "drawing"
  | "reviewing"
  | "previewing"
  | "inserting";

/**
 * Rect in host-local pixel coordinates (i.e. the host element's own pixel
 * space, *before* any CSS transform scaling applied to the host). Callers
 * convert to ratio (0..1) for `editor.exec` at commit time — that conversion
 * is container-specific and lives in the InsertableCapability adapter
 * (DR-012), not in this hook.
 */
export interface RubberBandHostRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}
