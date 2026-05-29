// Multi-edit helpers shared by every ContextualToolbar section.
//
// `MIXED` is a sentinel for "the selected items disagree on this value".
// Sections render a "Mixed" badge next to a control whose `value` is MIXED;
// committing a new value applies it to every selected item via `updateAll`,
// after which the badge clears (because the values now agree).

import { type StyleRef, ref as styleRef } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import type { JSX } from "react";
import { findItemDeep } from "../agocraft-mirror.js";
import { resolveStoredColor } from "../style/resolver.js";
import { useDocumentForResolution } from "../style/resolver-context.js";
import { parseVarRef } from "../style/theme-tokens.js";

export type ItemSnapshot = {
  readonly id: string;
  readonly kind: string;
  readonly attrs: Readonly<Record<string, unknown>>;
};

export const MIXED: unique symbol = Symbol("mixed");
export type MixedOr<T> = T | typeof MIXED;

/** Pick a shared value across all items via `read`. Returns the value if
 *  every item agrees (compared by `eq`, default Object.is); returns the
 *  sentinel `MIXED` otherwise. */
export function sharedValue<T>(
  items: ReadonlyArray<ItemSnapshot>,
  read: (item: ItemSnapshot) => T,
  eq: (a: T, b: T) => boolean = Object.is,
): MixedOr<T> {
  if (items.length === 0) return MIXED;
  const first = read(items[0]!);
  for (let i = 1; i < items.length; i++) {
    if (!eq(first, read(items[i]!))) return MIXED;
  }
  return first;
}

export function isMixed<T>(v: MixedOr<T>): v is typeof MIXED {
  return v === MIXED;
}

// ─── WI-040 — theme cascade integration for color toolbar sections ──────
//
// Two helpers shared by `frame-background-section`, `text-section`, and
// `shape-section` so every color picker:
//
//   • on **read** — resolves any `StyleRef` value (or `var(--*)` literal)
//     into a CSS string the picker can display, walking the agocraft
//     style.provider cascade from the item upward.
//   • on **commit** — converts a `var(--<token>)` literal emit from the
//     ColorPicker theme swatch into a `StyleRef` (`{$ref: "color.accent"}`)
//     so the cascade keeps semantic identity and any intermediate
//     `style.provider` Unit can override the token.

/** Picker → command value translator. When the user picked a theme swatch
 *  the ColorPicker emits `var(--accent)` (string); convert to a `StyleRef`
 *  object so the agocraft StyleResolver cascade can walk ancestor
 *  `style.provider` Units on read. Custom hex / rgb / arbitrary var
 *  strings round-trip verbatim. */
export function pickerValueToStored(v: string): string | StyleRef {
  const tokenInfo = parseVarRef(v);
  return tokenInfo !== null ? styleRef(tokenInfo.tokenName) : v;
}

/** Multi-item shared-value helper that resolves `StyleRef` values via the
 *  agocraft cascade into CSS strings BEFORE running through `sharedValue`.
 *  Two reasons resolution must happen before the equality check:
 *
 *    1. The ColorPicker's `value` prop expects a CSS string; passing a
 *       raw `StyleRef` object renders `"[object Object]"` on the trigger
 *       and breaks `parseColor` inside the popover.
 *    2. `sharedValue`'s default `Object.is` equality reports two distinct
 *       `StyleRef` references pointing at the same token as "Mixed" even
 *       when they're semantically identical. Resolving to the underlying
 *       CSS string first collapses identity to semantic equality.
 *
 *  Falls back to the raw value (when string) when no provider context is
 *  mounted (standalone tests / preview hosts). */
export function useResolveSharedColor(
  items: ReadonlyArray<ItemSnapshot>,
  read: (item: ItemSnapshot) => unknown,
): MixedOr<string | undefined> {
  const doc = useDocumentForResolution();
  return sharedValue<string | undefined>(items, (it) => {
    const raw = read(it);
    if (doc === null) {
      return typeof raw === "string" ? raw : undefined;
    }
    const item = findItemDeep(doc, it.id);
    if (item === undefined) {
      return typeof raw === "string" ? raw : undefined;
    }
    return resolveStoredColor(doc, raw, item, undefined);
  });
}

/** Run `perItem` for every selected id so a multi-selection edit lands as ONE
 *  undoable step.
 *
 *  Why this is needed: the editor's `mergeKey` coalescing keys off the patch's
 *  per-item target identity (`item.attrs#<id>`), so the 500ms history window
 *  only folds repeated edits to the SAME item (e.g. a 60Hz drag). It NEVER
 *  merges patches across different items — so a plain `for (id of ids) exec()`
 *  loop produces N separate undo entries, forcing N Cmd+Z presses to revert a
 *  single multi-selection change.
 *
 *  `editor.runBatch` makes every nested `exec()` share one transaction id, and
 *  the history groups a transaction into one entry regardless of mergeKey. We
 *  only batch when there are 2+ ids: a single-item edit runs directly so its
 *  per-item mergeKey still merges rapid same-item commits (e.g. dragging a
 *  slider) into one step. */
export function batchPerItem(
  editor: Editor,
  ids: ReadonlyArray<string>,
  perItem: (id: string) => void,
): void {
  if (ids.length === 0) return;
  if (ids.length === 1) {
    perItem(ids[0]!);
    return;
  }
  editor.runBatch(() => {
    for (const id of ids) perItem(id);
  });
}

/** Apply the same attrs patcher to every selected item id. Goes through the
 *  command pipeline so each item gets a real Patch; `batchPerItem` groups a
 *  multi-selection change into a single undo step. */
export function updateAll(
  editor: Editor,
  ids: ReadonlyArray<string>,
  patcher: (prev: { attrs: Readonly<Record<string, unknown>> }) => {
    attrs: Readonly<Record<string, unknown>>;
  },
): void {
  batchPerItem(editor, ids, (id) =>
    editor.exec("weave.item.update", { itemId: id, patch: patcher }),
  );
}

export function MixedBadge({ visible }: { readonly visible: boolean }): JSX.Element | null {
  if (!visible) return null;
  return (
    <span
      data-testid="mixed-badge"
      className="ml-1 text-[10px] uppercase tracking-wider text-[color:var(--text-soft)] border border-[color:var(--surface-overlay-border)] rounded px-1 py-0.5"
      title="Mixed values"
    >
      Mixed
    </span>
  );
}

/** Visual-truncate URL to fit the toolbar (long URLs would blow up the bar). */
export function truncateUrl(url: string): string {
  if (url.length <= 24) return url;
  return `…${url.slice(url.length - 22)}`;
}
