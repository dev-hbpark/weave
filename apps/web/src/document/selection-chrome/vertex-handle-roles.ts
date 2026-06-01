// WI-066 — vertex-handle ROLE registry (Rule 6: one adapter per kind, no inline
// `isEndpoint ? … : …` branching in the handle logic).
//
// A point handle on an open/closed poly or line plays one of two ROLES, and each
// role owns its polymorphic behavior:
//   • "vertex"   — an interior point. Drag = free-move that one point.
//   • "endpoint" — first/last point of an OPEN poly/line. Drag = stretch the
//                  whole polyline (similarity about the opposite end); holding
//                  the FREE-MOVE modifier (Alt) substitutes the free-move
//                  strategy. Renders SQUARE (stretch) / ROUND (free) to signal
//                  which behavior a drag will use.
//
// The drag behavior is a STRATEGY (its own small registry); a role declares its
// default strategy + an optional modifier-override strategy. `resolveDragStrategy`
// is the SINGLE-SOURCE gate that maps (role, modifier) → strategy — callers never
// compare the discriminant inline. Both registries are compiler-exhaustive mapped
// records (omitting a member is a type error), mirroring `SHAPE_KIND_ADAPTERS`.
//
// This module is pure (no React / DOM beyond the geometry kernel) so the policy
// is unit-testable in isolation; `poly-vertex-handle.tsx` wires it to the VM.

import {
  endpointSimilarityScreen,
  type FrameGeom,
  type PolyVertex,
  screenToLocal,
} from "./poly-vertex-geometry.js";

// ───── Role classification (caller declares intent) ──────────────────────────

export type PointHandleRole = "vertex" | "endpoint";

/** The role of `points[idx]` given the point count and closed flag. Endpoints
 *  exist only on an OPEN poly/line (closed rings have no first/last). */
export function classifyPointHandle(idx: number, count: number, closed: boolean): PointHandleRole {
  return !closed && count >= 2 && (idx === 0 || idx === count - 1) ? "endpoint" : "vertex";
}

// ───── Drag strategies (one impl per strategy) ───────────────────────────────

export type DragStrategyId = "free-move" | "endpoint-stretch";

export interface DragArgs {
  /** Base local vertices captured at drag start (0..1 of bbox). */
  readonly basePoints: ReadonlyArray<PolyVertex>;
  /** Base vertices projected to screen px (for the similarity transform). */
  readonly baseScreen: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  readonly idx: number;
  /** The opposite endpoint's index — the similarity transform's fixed point. */
  readonly anchorIdx: number;
  readonly geom: FrameGeom;
  readonly clientX: number;
  readonly clientY: number;
}

/** Move a single point to the cursor; all others stay put. */
function freeMoveStrategy(a: DragArgs): ReadonlyArray<PolyVertex> {
  const loc = screenToLocal(a.geom, a.clientX, a.clientY);
  return a.basePoints.map((p, i) => (i === a.idx ? loc : { x: p.x, y: p.y }));
}

/** Uniform similarity (scale + rotate) of the whole polyline about the opposite
 *  endpoint — the line stretches keeping its shape (DR-024 §B). A degenerate
 *  vector (e.g. a 2-point line collapsing) delegates to free-move. */
function endpointStretchStrategy(a: DragArgs): ReadonlyArray<PolyVertex> {
  const sim = endpointSimilarityScreen(a.baseScreen, a.anchorIdx, a.clientX, a.clientY, a.idx);
  if (sim === null) return freeMoveStrategy(a);
  return sim.map((s) => screenToLocal(a.geom, s.x, s.y));
}

const DRAG_STRATEGIES: {
  readonly [S in DragStrategyId]: (a: DragArgs) => ReadonlyArray<PolyVertex>;
} = {
  "free-move": freeMoveStrategy,
  "endpoint-stretch": endpointStretchStrategy,
};

/** Run the named drag strategy. The only call site for the strategy registry. */
export function applyDragStrategy(id: DragStrategyId, args: DragArgs): ReadonlyArray<PolyVertex> {
  return DRAG_STRATEGIES[id](args);
}

// ───── Role registry (visual + drag policy per role) ─────────────────────────

/** Visual the handle renders for the current modifier state. */
export interface HandleVisual {
  /** CSS border-radius (px number or string). Square endpoint vs round vertex. */
  readonly borderRadius: number | string;
  /** `data-handle-mode` value, or undefined when the role has no modes. */
  readonly mode?: string;
}

export interface PointHandleAdapter {
  readonly role: PointHandleRole;
  /** Drag strategy with NO modifier held. */
  readonly strategy: DragStrategyId;
  /** Strategy when the free-move modifier (Alt) is held; undefined = the role
   *  ignores the modifier (its visual + behavior never change). */
  readonly modifierStrategy?: DragStrategyId;
  /** Visual for the current modifier state. */
  readonly visual: (modifierActive: boolean) => HandleVisual;
  /** Accessible label (1-based index). */
  readonly label: (idx: number) => string;
  /** Tooltip, or undefined. */
  readonly title?: string;
}

const POINT_HANDLE_ADAPTERS: { readonly [R in PointHandleRole]: PointHandleAdapter } = {
  vertex: {
    role: "vertex",
    strategy: "free-move",
    visual: () => ({ borderRadius: "50%" }),
    label: (idx) => `정점 ${idx + 1}`,
  },
  endpoint: {
    role: "endpoint",
    strategy: "endpoint-stretch",
    modifierStrategy: "free-move",
    visual: (modifierActive) =>
      modifierActive ? { borderRadius: "50%", mode: "free" } : { borderRadius: 2, mode: "stretch" },
    label: (idx) => `끝점 ${idx + 1}`,
    title: "드래그: 선 늘이기 · Alt+드래그: 점 자유 이동",
  },
};

/** Resolve the adapter for a role (the indexer; no `switch`). */
export function resolvePointHandle(role: PointHandleRole): PointHandleAdapter {
  return POINT_HANDLE_ADAPTERS[role];
}

/** Single-source mode gate: (role adapter, modifier held) → the strategy to run.
 *  The only place role + modifier combine to pick a behavior. */
export function resolveDragStrategy(
  adapter: PointHandleAdapter,
  modifierActive: boolean,
): DragStrategyId {
  return modifierActive && adapter.modifierStrategy !== undefined
    ? adapter.modifierStrategy
    : adapter.strategy;
}

/** Whether the role's behavior/visual depends on the free-move modifier. */
export function isModifierSensitive(adapter: PointHandleAdapter): boolean {
  return adapter.modifierStrategy !== undefined;
}
