// DR-062 — bridge between the contextual toolbar's text controls and the live
// Lexical editor selection, so the whole-item controls can author PER-RANGE
// typography (color / size / family / spacing / case / decoration / outline)
// while a text item is being edited.
//
// Supersedes DR-060's outline-only `active-text-outline.ts`. A module-level
// store (the `cropping-state` / `history-replay-state` pattern), single active
// text editor at a time.
//
// Producer/consumer split (CLAUDE.md core principle): the editor plugin (the
// PRODUCER) owns the Lexical editor; on mount it registers an `applier`, and on
// every selection change it pushes a fresh `readout` of the selection's current
// style. The toolbar (the CONSUMER) reads the readout reactively and chooses its
// own render cadence via `useSyncExternalStore`. No consumer policy lives in the
// producer.

import { useSyncExternalStore } from "react";
import type { WeaveRunStyle } from "./types.js";

/** One property's value across the current selection. `value` present ⇒ the
 *  whole selection shares it; `mixed` ⇒ the selection spans differing values
 *  (Lexical's `$getSelectionStyleValueForProperty` returns "" in that case —
 *  the canonical multi-value signal). */
export interface PropReadout {
  readonly value?: string | number;
  readonly mixed: boolean;
}

/** A snapshot of the current selection's style — what the toolbar should
 *  DISPLAY while editing (vs. the whole-item attrs it shows otherwise). */
export interface SelectionStyleReadout {
  /** A real, non-collapsed range exists (something is actually selected). */
  readonly hasRange: boolean;
  /** Keyed by `WeaveRunStyle` attr key (color / fontSize / fontFamily /
   *  letterSpacing / textCase). Absent key ⇒ not read for this selection. */
  readonly props: Readonly<Partial<Record<string, PropReadout>>>;
  /** Paired outline readout (DR-060 `-webkit-text-stroke-*`). */
  readonly outline: {
    readonly color?: string;
    readonly width?: number;
    readonly mixed: boolean;
  };
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strikethrough: boolean;
}

export const EMPTY_READOUT: SelectionStyleReadout = {
  hasRange: false,
  props: {},
  outline: { mixed: false },
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
};

/** Per-range style applier — implemented by the editor's `TextStylePlugin`
 *  (which holds the live `editor`). Every method targets the editor SELECTION
 *  (restoring the last non-collapsed range if the toolbar's focus theft
 *  collapsed it). */
export interface ActiveTextStyle {
  /** The text item currently being edited (matched against the toolbar's id). */
  readonly itemId: string;
  /** Apply a CSS-declaration property (color / fontSize / fontFamily /
   *  letterSpacing / textCase) to the selection. `undefined` clears it.
   *  `continuous: true` (slider drags) keeps DOM focus on the toolbar control so
   *  the drag isn't interrupted; discrete applies (default) reconcile normally
   *  so focus returns to the editor and the selection follows any node split. */
  setStyleProp(
    attrKey: keyof WeaveRunStyle,
    value: string | number | undefined,
    opts?: { readonly continuous?: boolean },
  ): void;
  /** Toggle a Lexical FORMAT-bitmask property on the selection. */
  toggleFormat(format: "bold" | "italic" | "underline" | "strikethrough"): void;
  /** Apply outline color to the selection (preserves the current width, or
   *  seeds a default if none) — the paired `-webkit-text-stroke-*` (DR-060). */
  setOutlineColor(color: string): void;
  /** Apply outline width (design-px) to the selection (preserves the current
   *  color, or seeds a default). `<= 0` clears the outline. */
  setOutlineWidth(width: number): void;
  /** Remove the outline from the selection. */
  clearOutline(): void;
}

export interface ActiveTextStyleEntry {
  readonly applier: ActiveTextStyle;
  readonly readout: SelectionStyleReadout;
}

// `current` identity changes on every mutation so `useSyncExternalStore`
// re-renders consumers (registration, selection-change readout push, clear).
let current: ActiveTextStyleEntry | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
  // Dev / e2e diagnostic only (gated like the other `__weave*` globals).
  if (typeof window !== "undefined" && import.meta.env?.DEV) {
    const w = window as unknown as {
      __weaveActiveTextStyle?: ActiveTextStyle | null;
      __weaveActiveTextOutline?: ActiveTextStyle | null;
      __weaveActiveTextReadout?: SelectionStyleReadout | null;
    };
    w.__weaveActiveTextStyle = current?.applier ?? null;
    // Back-compat alias for the DR-060 era diagnostic.
    w.__weaveActiveTextOutline = current?.applier ?? null;
    w.__weaveActiveTextReadout = current?.readout ?? null;
  }
}

/** Register the applier for the editing item (called by the editor on mount). */
export function setActiveTextStyle(applier: ActiveTextStyle): void {
  current = { applier, readout: EMPTY_READOUT };
  emit();
}

/** Push a fresh selection readout (called by the editor on selection change).
 *  No-op if the registration changed under us. */
export function pushSelectionReadout(itemId: string, readout: SelectionStyleReadout): void {
  if (current?.applier.itemId !== itemId) return;
  current = { applier: current.applier, readout };
  emit();
}

/** Clear the registration, but only if it still belongs to `itemId` (guards a
 *  stale unmount from clobbering a newer editor's registration). */
export function clearActiveTextStyle(itemId: string): void {
  if (current?.applier.itemId === itemId) {
    current = null;
    emit();
  }
}

/** The applier for `itemId` if that item's editor is live, else null. */
export function getActiveTextStyle(itemId: string): ActiveTextStyle | null {
  return current?.applier.itemId === itemId ? current.applier : null;
}

/** React-reactive: the live entry (`{ applier, readout }`) for `itemId`, or
 *  null. Re-renders the consumer whenever an editor registers / unregisters OR
 *  the selection's style changes, so the toolbar both ROUTES to and DISPLAYS
 *  the live per-range selection. */
export function useActiveTextStyle(itemId: string | null): ActiveTextStyleEntry | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => (itemId !== null && current?.applier.itemId === itemId ? current : null),
    () => null,
  );
}
