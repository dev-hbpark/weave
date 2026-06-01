// DR-027 / WI-071 Phase 2 — shared `line` creation seeds. Used by both the
// header Add menu (DesignHeader) and the in-frame FrameAddSubmenu, so they live
// in one module instead of being duplicated / imported across view files.

/** Seed for the "자유선" (freeform line) add — an OPEN `poly` (renders as an
 *  SVG <polyline>) that the user reshapes via vertex handles. Distinct from the
 *  closed-by-default "자유 다각형" (`poly`, closed:true → filled polygon). */
// DR-025 / WI-062 — `line` kind creation seeds (points 0..1 of bbox + smooth).
// The 선 menu items create a `line` item (NOT a shape/poly). heads default none.
export type LineSeed = {
  readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  readonly smooth?: boolean;
};

/** 직선 — 2-point straight line (endpoints freely repositioned). */
export const LINE_STRAIGHT: LineSeed = {
  points: [
    { x: 0, y: 0.5 },
    { x: 1, y: 0.5 },
  ],
};
/** 자유선 — open multi-point polyline (zigzag the user reshapes). */
export const LINE_FREE: LineSeed = {
  points: [
    { x: 0, y: 0.7 },
    { x: 0.34, y: 0.3 },
    { x: 0.66, y: 0.6 },
    { x: 1, y: 0.25 },
  ],
};
/** 곡선 — smooth (Catmull-Rom) arc through 3 control points. */
export const LINE_CURVE: LineSeed = {
  points: [
    { x: 0, y: 0.75 },
    { x: 0.5, y: 0.2 },
    { x: 1, y: 0.75 },
  ],
  smooth: true,
};
/** 자유곡선 — smooth freehand wave (more control points). */
export const LINE_CURVE_FREE: LineSeed = {
  points: [
    { x: 0, y: 0.6 },
    { x: 0.2, y: 0.32 },
    { x: 0.4, y: 0.62 },
    { x: 0.6, y: 0.34 },
    { x: 0.8, y: 0.64 },
    { x: 1, y: 0.4 },
  ],
  smooth: true,
};
