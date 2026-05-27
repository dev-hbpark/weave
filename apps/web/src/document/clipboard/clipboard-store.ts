// WI-041 — in-memory clipboard store (singleton per tab).
//
// Phase 2/3 scope: same-tab clipboard only. The `subscribe()` slot will
// also fire on Phase 4's BroadcastChannel adapter when it lands — host
// code that wants "paste from another tab updated the menu enabled state"
// is wired here from day one.
//
// StrictMode safety: the store is a module-level singleton and does NOT
// dispose itself on React unmount. Calling `dispose()` from a `useEffect`
// cleanup would, in development, fire on the unmount half of StrictMode's
// double-invoke cycle and silently nuke the clipboard. The well-known
// failure mode is documented in memory `feedback_react_strictmode_singleton_dispose`.
// Tests can `__resetClipboardStoreForTests()` instead.

import type { ClipboardPayload, KnownClipboardPayload } from "./clipboard-types.js";

export interface ClipboardStore {
  /** Replace the current entry with a new payload. */
  write(payload: KnownClipboardPayload): void;
  /** Read the current entry, or `undefined` when empty / unknown schema. */
  read(): KnownClipboardPayload | undefined;
  /** Same as `read()` but never throws on schema mismatch — used by
   *  `enabledWhen` queries that must stay cheap. */
  peek(): KnownClipboardPayload | undefined;
  /** Drop the current entry. Used by tests and (future) "clear clipboard"
   *  affordances. */
  clear(): void;
  /** Subscribe to write / clear / cross-tab updates. Returns an unsub. */
  subscribe(listener: () => void): () => void;
}

const SUPPORTED_SCHEMA_VERSIONS = new Set<number>([1]);

let current: KnownClipboardPayload | undefined;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) {
    try {
      l();
    } catch (err) {
      // A misbehaving subscriber must NOT prevent others from learning
      // about the change.
      // eslint-disable-next-line no-console
      console.error("[clipboard] subscriber threw", err);
    }
  }
}

function isAcceptable(p: ClipboardPayload<unknown>): p is KnownClipboardPayload {
  if (!SUPPORTED_SCHEMA_VERSIONS.has(p.schemaVersion)) return false;
  if (p.kind === "weave/items.v1") return true;
  // `weave/style.v1` (Phase 6) — accept when the adapter ships. Until
  // then it survives transport but reads as undefined.
  return false;
}

export const clipboardStore: ClipboardStore = {
  write(payload) {
    if (!isAcceptable(payload)) return;
    current = payload;
    notify();
  },
  read() {
    if (current === undefined) return undefined;
    return isAcceptable(current) ? current : undefined;
  },
  peek() {
    return current !== undefined && isAcceptable(current) ? current : undefined;
  },
  clear() {
    if (current === undefined) return;
    current = undefined;
    notify();
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** Test-only reset. Production code MUST NOT call this — use `clear()`
 *  instead, which fires subscriptions. */
export function __resetClipboardStoreForTests(): void {
  current = undefined;
  listeners.clear();
}
