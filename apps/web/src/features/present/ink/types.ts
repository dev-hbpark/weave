// WI-239 Phase 1 — ephemeral presentation ink: shared data shapes.
//
// Ink is NEVER persisted to the document (DR-154 — present mode stays
// strictly read-only). These types describe the in-session, in-memory
// stroke model only.

/** A point in the host surface's own coordinate space.
 *  - Slide surface: design-pixel coordinates (origin = design top-left).
 *  - Blank board:   viewport-pixel coordinates.
 *  The surface decides the space; the stroke model is agnostic. */
export interface InkPoint {
  readonly x: number;
  readonly y: number;
}

/** Visual style of a stroke. `blend: "multiply"` gives the highlighter its
 *  see-through-marker look over content. */
export interface InkStrokeStyle {
  readonly color: string;
  readonly width: number;
  readonly opacity: number;
  readonly blend: "normal" | "multiply";
}

export interface InkStroke {
  readonly id: string;
  readonly toolId: string;
  readonly style: InkStrokeStyle;
  readonly points: readonly InkPoint[];
}

/** A surface key namespaces strokes so each slide step (and the blank board)
 *  keeps its own annotations independently within the session. */
export type InkSurfaceKey = string;
