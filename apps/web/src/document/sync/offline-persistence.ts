// WI-028 Phase 6 — IndexedDB offline persistence for Y.Doc.
//
// Wires `y-indexeddb` as a SECONDARY provider so closing the tab and
// reopening immediately restores the local CRDT state — no need to
// pull from the HTTP poll provider before the editor is interactive.
// Offline edits (no network) accumulate in IndexedDB and replay to the
// server on the next push tick once connectivity returns.
//
// Browser-only — import this from contexts where `window` is available.

import type * as Y from "yjs";

export interface OfflinePersistenceHandle {
  /** Resolves once IndexedDB has finished hydrating the Y.Doc. */
  readonly whenSynced: Promise<void>;
  dispose(): Promise<void>;
}

export async function attachIndexedDbPersistence(
  yDoc: Y.Doc,
  roomId: string,
): Promise<OfflinePersistenceHandle> {
  // Dynamic import — y-indexeddb pulls indexedDB which doesn't exist
  // outside the browser. Vitest / SSR safely skip by never calling
  // this function.
  const { IndexeddbPersistence } = await import("y-indexeddb");
  const dbName = `weave-sync-${roomId}`;
  const provider = new IndexeddbPersistence(dbName, yDoc);
  const whenSynced = new Promise<void>((resolve) => {
    provider.on("synced", () => resolve());
  });
  return {
    whenSynced,
    async dispose() {
      await provider.destroy();
    },
  };
}
