// WI-239 Phase 1 — pure ephemeral ink store (reducer + selectors).
//
// No document round-trip (DR-154): strokes live only here, keyed by surface
// (one slide step or the blank board), with a bounded global undo/redo
// history. Pure functions so the whole store is unit-testable without a DOM.

import type { InkPoint, InkStroke, InkSurfaceKey } from "./types.js";

/** Per-surface stroke lists. */
type Surfaces = Readonly<Record<InkSurfaceKey, readonly InkStroke[]>>;

export interface InkState {
  readonly surfaces: Surfaces;
  /** Undo/redo are snapshots of `surfaces` (global across surfaces — the
   *  simplest model that still lets a presenter step back through their
   *  marks). Bounded by MAX_HISTORY so a long talk can't grow unbounded. */
  readonly past: readonly Surfaces[];
  readonly future: readonly Surfaces[];
}

export type InkAction =
  | { readonly type: "add"; readonly surface: InkSurfaceKey; readonly stroke: InkStroke }
  | { readonly type: "erase"; readonly surface: InkSurfaceKey; readonly at: InkPoint }
  | { readonly type: "clear"; readonly surface: InkSurfaceKey }
  | { readonly type: "undo" }
  | { readonly type: "redo" };

const MAX_HISTORY = 100;

export function initialInkState(): InkState {
  return { surfaces: {}, past: [], future: [] };
}

export function strokesOf(state: InkState, surface: InkSurfaceKey): readonly InkStroke[] {
  return state.surfaces[surface] ?? [];
}

/** True when the point lands within (½ stroke-width + slack) of any segment
 *  of the stroke — the eraser's hit test. Coordinates are in the surface's
 *  own space, so the slack is expressed there too. */
const ERASE_SLACK = 8;

export function strokeHitsPoint(stroke: InkStroke, at: InkPoint): boolean {
  return strokeHit(stroke, at);
}

function strokeHit(stroke: InkStroke, at: InkPoint): boolean {
  const tol = stroke.style.width / 2 + ERASE_SLACK;
  const tol2 = tol * tol;
  const pts = stroke.points;
  if (pts.length === 1) {
    const p = pts[0];
    return p !== undefined && dist2(p, at) <= tol2;
  }
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    if (a === undefined || b === undefined) continue;
    if (distToSegment2(at, a, b) <= tol2) return true;
  }
  return false;
}

function dist2(a: InkPoint, b: InkPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function distToSegment2(p: InkPoint, a: InkPoint, b: InkPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist2(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist2(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Push the current surfaces onto `past` (capped) and drop the redo stack —
 *  the shared prologue of every mutating action. */
function commit(state: InkState, nextSurfaces: Surfaces): InkState {
  const past = [...state.past, state.surfaces].slice(-MAX_HISTORY);
  return { surfaces: nextSurfaces, past, future: [] };
}

// One handler per action — a registry keyed by the action's tag, not a
// `switch (action.type)` (Rule 6). Each handler is total over its own
// variant; `InkActionFor<T>` narrows the action so handlers read their
// payload without re-discriminating. Adding an action = adding an entry.
type InkActionFor<T extends InkAction["type"]> = Extract<InkAction, { type: T }>;
type InkHandler<T extends InkAction["type"]> = (
  state: InkState,
  action: InkActionFor<T>,
) => InkState;

const INK_HANDLERS: { readonly [T in InkAction["type"]]: InkHandler<T> } = {
  add: (state, action) => {
    const current = state.surfaces[action.surface] ?? [];
    return commit(state, { ...state.surfaces, [action.surface]: [...current, action.stroke] });
  },
  erase: (state, action) => {
    const current = state.surfaces[action.surface] ?? [];
    const kept = current.filter((s) => !strokeHit(s, action.at));
    if (kept.length === current.length) return state; // nothing erased — no history entry
    return commit(state, { ...state.surfaces, [action.surface]: kept });
  },
  clear: (state, action) => {
    const current = state.surfaces[action.surface] ?? [];
    if (current.length === 0) return state;
    return commit(state, { ...state.surfaces, [action.surface]: [] });
  },
  undo: (state) => {
    const prev = state.past[state.past.length - 1];
    if (prev === undefined) return state;
    return {
      surfaces: prev,
      past: state.past.slice(0, -1),
      future: [state.surfaces, ...state.future].slice(0, MAX_HISTORY),
    };
  },
  redo: (state) => {
    const next = state.future[0];
    if (next === undefined) return state;
    return {
      surfaces: next,
      past: [...state.past, state.surfaces].slice(-MAX_HISTORY),
      future: state.future.slice(1),
    };
  },
};

export function inkReducer(state: InkState, action: InkAction): InkState {
  // Resolve the handler for this action's tag and apply it. The cast bridges
  // the per-variant handler signature to the union call site — TS can't prove
  // the lookup and the action share the same `T` through an index access.
  const handler = INK_HANDLERS[action.type] as InkHandler<InkAction["type"]>;
  return handler(state, action);
}

export function canUndo(state: InkState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: InkState): boolean {
  return state.future.length > 0;
}
