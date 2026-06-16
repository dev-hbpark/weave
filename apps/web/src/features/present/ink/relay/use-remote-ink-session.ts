// WI-240 Phase 2 — viewer-side ink: a read-only InkSession backed by a
// per-surface map that inbound relay messages drive. `InkLayer` renders it
// exactly like a local session (its capture is disabled for viewers), so no
// render changes are needed. Mutators that aren't fed by the relay are no-ops.

import { useCallback, useMemo, useRef, useState } from "react";
import type { InkStroke, InkSurfaceKey } from "../types.js";
import type { InkSession } from "../use-ink-session.js";

export interface RemoteInkSession extends InkSession {
  /** Apply an incremental append (the `stroke` message). */
  applyStroke(surface: InkSurfaceKey, stroke: InkStroke): void;
  /** Replace a surface wholesale (the `sync` message). */
  applySync(surface: InkSurfaceKey, strokes: readonly InkStroke[]): void;
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
  const applySync = useCallback((surface: InkSurfaceKey, next: readonly InkStroke[]) => {
    setSurfaces((prev) => ({ ...prev, [surface]: next }));
  }, []);

  return useMemo<RemoteInkSession>(
    () => ({
      strokes,
      applyStroke,
      applySync,
      // Viewer surfaces are driven only by the relay; local mutators are inert.
      addStroke: () => {},
      eraseAt: () => {},
      clear: () => {},
      undo: () => {},
      redo: () => {},
      canUndo: false,
      canRedo: false,
    }),
    [strokes, applyStroke, applySync],
  );
}
