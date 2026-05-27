// WI-041 Phase 5 follow-up — reactive `isTextEditing` source (DR-019 D7).
//
// The hotkey path already short-circuits when an event originates inside
// a text-editing surface (editor-hotkeys.ts:576 `isTextEditingTarget`).
// This hook surfaces the *same* axis as a React-reactive boolean so
// `commandContext.isTextEditing` flips live — which in turn drives
// `EDITOR_COMMANDS[*].enabledWhen` for any clipboard surface that
// re-reads the context (ContextMenu's "Paste" disabled state, future
// CommandButtons, the Paste Special dialog's gate).
//
// Implementation: window-level `focusin` / `focusout` listeners. The
// browser fires both whenever the active element changes — we recompute
// `document.activeElement.isContentEditable` and bump React state when
// the answer flips. A single subscription per editor mount (DesignPage)
// is enough; no per-component listener fan-out.
//
// StrictMode safety: each effect mount creates a fresh listener pair
// and the cleanup tears them down. No module-level singleton — see
// `feedback_react_strictmode_singleton_dispose` for the inverse
// failure mode we are avoiding.

import { useEffect, useState } from "react";

function readIsTextEditing(): boolean {
  if (typeof document === "undefined") return false;
  const ae = document.activeElement;
  if (ae === null) return false;
  if (!(ae instanceof HTMLElement)) return false;
  // Matches `isTextEditingTarget` in editor-hotkeys.ts so the hotkey
  // gate and the React-reactive surface agree by construction.
  if (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA") return true;
  return ae.isContentEditable;
}

export function useIsTextEditing(): boolean {
  // The initial snapshot is read once for SSR / first paint; the effect
  // recomputes on mount in case focus changed between render and effect
  // commit.
  const [editing, setEditing] = useState<boolean>(readIsTextEditing);

  useEffect(() => {
    const update = (): void => {
      const next = readIsTextEditing();
      setEditing((prev) => (prev === next ? prev : next));
    };
    update();
    window.addEventListener("focusin", update);
    window.addEventListener("focusout", update);
    return () => {
      window.removeEventListener("focusin", update);
      window.removeEventListener("focusout", update);
    };
  }, []);

  return editing;
}
