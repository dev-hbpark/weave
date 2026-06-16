// WI-240 Phase 2 — viewer-side ink: a read-only InkSession backed by a
// per-surface map that inbound relay messages drive. `InkLayer` renders it
// exactly like a local session (its capture is disabled for viewers), so no
// render changes are needed. Mutators that aren't fed by the relay are no-ops.

import { useCallback, useMemo, useRef, useState } from "react";
import { strokeHitsPoint } from "../ink-session.js";
import type { InkPoint, InkStroke, InkSurfaceKey } from "../types.js";
import type { InkSession } from "../use-ink-session.js";

export interface RemoteInkSession extends InkSession {
  /** Append a stroke (the `stroke` message). */
  applyStroke(surface: InkSurfaceKey, stroke: InkStroke): void;
  /** Erase at a point — same hit test as the presenter ran (the `erase` msg). */
  applyErase(surface: InkSurfaceKey, at: InkPoint): void;
  /** Empty a surface (the `clear` message). */
  applyClear(surface: InkSurfaceKey): void;
}

export function useRemoteInkSession(): RemoteInkSession {
  const [surfaces, setSurfaces] = useState<Readonly<Record<InkSurfaceKey, readonly InkStroke[]>>>(
    {},
  );
  const ref = useRef(surfaces);
  ref.current = surfaces;

  const strokes = useCallback(
    (surface: InkSurfaceKey): readonly InkStroke[] => ref.current[surface] ?? [],
    [],
  );
  const applyStroke = useCallback((surface: InkSurfaceKey, stroke: InkStroke) => {
    setSurfaces((prev) => ({ ...prev, [surface]: [...(prev[surface] ?? []), stroke] }));
  }, []);
  const applyErase = useCallback((surface: InkSurfaceKey, at: InkPoint) => {
    setSurfaces((prev) => {
      const cur = prev[surface] ?? [];
      const kept = cur.filter((s) => !strokeHitsPoint(s, at));
      return kept.length === cur.length ? prev : { ...prev, [surface]: kept };
    });
  }, []);
  const applyClear = useCallback((surface: InkSurfaceKey) => {
    setSurfaces((prev) => (prev[surface]?.length ? { ...prev, [surface]: [] } : prev));
  }, []);

  return useMemo<RemoteInkSession>(
    () => ({
      strokes,
      applyStroke,
      applyErase,
      applyClear,
      // Viewer surfaces are driven only by the relay; local mutators are inert.
      addStroke: () => {},
      eraseAt: () => {},
      clear: () => {},
      undo: () => {},
      redo: () => {},
      canUndo: false,
      canRedo: false,
    }),
    [strokes, applyStroke, applyErase, applyClear],
  );
}
