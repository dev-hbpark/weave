// Multi-edit helpers shared by every ContextualToolbar section.
//
// `MIXED` is a sentinel for "the selected items disagree on this value".
// Sections render a "Mixed" badge next to a control whose `value` is MIXED;
// committing a new value applies it to every selected item via `updateAll`,
// after which the badge clears (because the values now agree).

import type { Editor } from "@agocraft/editor";
import type { JSX } from "react";

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

/** Apply the same attrs patcher to every selected item id. Goes through the
 *  command pipeline so each item gets a real Patch and the history sees one
 *  transaction per item (the editor's TransactionRunner coalesces adjacent
 *  patches with the same `mergeKey` if the command provides one). */
export function updateAll(
  editor: Editor,
  ids: ReadonlyArray<string>,
  patcher: (prev: { attrs: Readonly<Record<string, unknown>> }) => {
    attrs: Readonly<Record<string, unknown>>;
  },
): void {
  for (const id of ids) {
    editor.exec("weave.item.update", { itemId: id, patch: patcher });
  }
}

export function MixedBadge({
  visible,
}: {
  readonly visible: boolean;
}): JSX.Element | null {
  if (!visible) return null;
  return (
    <span
      data-testid="mixed-badge"
      className="ml-1 text-[10px] uppercase tracking-wider text-[color:var(--text-soft)] border border-[color:var(--surface-overlay-border)] rounded px-1 py-0.5"
      aria-label="Mixed values"
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
