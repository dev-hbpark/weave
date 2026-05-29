// WI-041 Phase 4 — localStorage cross-tab fallback.
//
// When BroadcastChannel is unavailable (older Safari pre-15.4, certain
// Private Browsing configs, locked-down embeds), Web Storage's `storage`
// event still fires across same-origin tabs whenever a localStorage key
// is written. We piggy-back on it as a low-quality bus:
//
//   - Local write → JSON.stringify(payload) into a dedicated key.
//   - Remote `storage` event with `key === STORAGE_KEY` → parse and
//     forward to the local store (self-receive filtered by origin).
//
// The bus is intentionally minimal. It does NOT persist anything across
// reloads — the key is overwritten on every write and never read on
// boot. Quota is bounded by the payload size (which is itself bounded
// by MAX_PASTE_NODES). When BroadcastChannel is also active, we still
// run both transports: tabs that opened with the modern API receive via
// BroadcastChannel, the rest via storage events, and the receive guard
// in `clipboardStore.write` (origin equality) keeps the second fire
// from looping.

import { clipboardStore } from "./clipboard-store.js";
import type { ClipboardPayload, KnownClipboardPayload } from "./clipboard-types.js";

const STORAGE_KEY = "weave.clipboard.v1";
const SUPPORTED_SCHEMA_VERSIONS = new Set<number>([1]);

interface LocalStorageTransportControls {
  readonly isActive: boolean;
  dispose(): void;
}

function detectStorage(): Storage | undefined {
  if (typeof globalThis === "undefined") return undefined;
  const w = globalThis as { localStorage?: Storage };
  return w.localStorage;
}

function isValidIncoming(data: unknown): data is KnownClipboardPayload {
  if (data === null || typeof data !== "object") return false;
  const p = data as ClipboardPayload<unknown>;
  if (typeof p.schemaVersion !== "number") return false;
  if (!SUPPORTED_SCHEMA_VERSIONS.has(p.schemaVersion)) return false;
  if (typeof p.origin !== "string") return false;
  if (typeof p.kind !== "string") return false;
  return p.kind === "weave/items.v1";
}

export function mountLocalStorageTransport(sessionOrigin: string): LocalStorageTransportControls {
  const storage = detectStorage();
  // `storage` events fire on the WINDOW; if there's no window or no
  // localStorage at all (e.g. SSR), this transport is silently inert.
  if (storage === undefined || typeof globalThis === "undefined") {
    return { isActive: false, dispose: () => {} };
  }
  const g = globalThis as {
    addEventListener?: typeof window.addEventListener;
    removeEventListener?: typeof window.removeEventListener;
  };
  if (g.addEventListener === undefined || g.removeEventListener === undefined) {
    return { isActive: false, dispose: () => {} };
  }

  // Probe write — Safari Private Mode throws QuotaExceededError on the
  // very first set. We retreat to no-op rather than crash the host.
  try {
    storage.setItem(`${STORAGE_KEY}.probe`, "ok");
    storage.removeItem(`${STORAGE_KEY}.probe`);
  } catch {
    return { isActive: false, dispose: () => {} };
  }

  const handleStorage = (ev: StorageEvent): void => {
    if (ev.key !== STORAGE_KEY) return;
    if (ev.newValue === null) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(ev.newValue);
    } catch {
      return;
    }
    if (!isValidIncoming(parsed)) return;
    if (parsed.origin === sessionOrigin) return; // self-receive
    clipboardStore.write(parsed);
  };

  g.addEventListener("storage", handleStorage as EventListener);

  let lastBroadcastTimestamp = 0;
  const unsubscribeStore = clipboardStore.subscribe(() => {
    const snapshot = clipboardStore.peek();
    if (snapshot === undefined) return;
    if (snapshot.origin !== sessionOrigin) return;
    if (snapshot.timestamp === lastBroadcastTimestamp) return;
    lastBroadcastTimestamp = snapshot.timestamp;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch (err) {
      // Quota or serialisation failure — telemetry only.
      // eslint-disable-next-line no-console
      console.warn("[clipboard] localStorage write failed", err);
    }
  });

  return {
    isActive: true,
    dispose: () => {
      unsubscribeStore();
      g.removeEventListener!("storage", handleStorage as EventListener);
    },
  };
}
