// WI-239 Phase 1 — React binding over the pure ink reducer.
//
// Owns the ephemeral store and exposes bound action dispatchers + selectors.
// Testable with `renderHook` (no DOM): the logic lives in `ink-session.ts`.

import { useCallback, useMemo, useReducer } from "react";
import { canRedo, canUndo, initialInkState, inkReducer, strokesOf } from "./ink-session.js";
import type { InkPoint, InkStroke, InkSurfaceKey } from "./types.js";

export interface InkSession {
  strokes(surface: InkSurfaceKey): readonly InkStroke[];
  addStroke(surface: InkSurfaceKey, stroke: InkStroke): void;
  eraseAt(surface: InkSurfaceKey, at: InkPoint): void;
  clear(surface: InkSurfaceKey): void;
  undo(): void;
  redo(): void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export function useInkSession(): InkSession {
  const [state, dispatch] = useReducer(inkReducer, undefined, initialInkState);

  const addStroke = useCallback(
    (surface: InkSurfaceKey, stroke: InkStroke) => dispatch({ type: "add", surface, stroke }),
    [],
  );
  const eraseAt = useCallback(
    (surface: InkSurfaceKey, at: InkPoint) => dispatch({ type: "erase", surface, at }),
    [],
  );
  const clear = useCallback((surface: InkSurfaceKey) => dispatch({ type: "clear", surface }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const strokes = useCallback((surface: InkSurfaceKey) => strokesOf(state, surface), [state]);

  return useMemo(
    () => ({
      strokes,
      addStroke,
      eraseAt,
      clear,
      undo,
      redo,
      canUndo: canUndo(state),
      canRedo: canRedo(state),
    }),
    [strokes, addStroke, eraseAt, clear, undo, redo, state],
  );
}
