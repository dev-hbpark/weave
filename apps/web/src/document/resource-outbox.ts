// IndexedDB-backed outbox for image uploads that could not reach the cloud.
//
// When `uploadResourceCloud` fails (offline / server down), the image bytes —
// the `data:` URL produced from the local file — are queued here so they
// survive a reload. `flushResourceOutbox` (in resource-storage.ts) re-uploads
// each queued entry once the cloud is reachable again and deletes it on
// success: "upload, then delete". Images run several MB, so IndexedDB (not
// localStorage, ~5 MB string cap) is the right durable store.
//
// Mirrors the design read-cache fallback (DR-045): there the deck survives a
// cloud outage; here the user's just-uploaded image survives one too.
//
// Browser-only. Every export degrades to a safe no-op / empty result when
// `indexedDB` is unavailable (SSR, jsdom unit tests), so callers never guard.

const DB_NAME = "weave-resource-outbox";
const DB_VERSION = 1;
const STORE = "pending";

export interface PendingResourceUpload {
  /** Local resource id — the `weave.resource.v1.<id>` LS key suffix assigned
   *  when the upload first failed. The cloud upload returns its OWN id; the
   *  flusher reconciles the LS record from this id to the cloud id. */
  readonly id: string;
  /** Only images take the await-upload-then-queue path. Videos are
   *  session-scoped `blob:` URLs with no server-reachable bytes. */
  readonly kind: "image";
  readonly name: string;
  /** `data:` URL bytes to re-upload. */
  readonly src: string;
  readonly addedAt: string;
}

function hasIdb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

/** Run one request inside a transaction and resolve with its result. The db
 *  handle is closed afterwards so connections don't leak across the many
 *  short-lived calls the flusher makes. */
async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("indexedDB op failed"));
    });
  } finally {
    db.close();
  }
}

/** Queue a failed image upload. Best-effort: a quota / IDB error never throws
 *  back into the upload path — the worst case is the retry isn't durable, and
 *  the localStorage resource record + design still hold the inline data URL. */
export async function enqueueResourceUpload(entry: PendingResourceUpload): Promise<void> {
  if (!hasIdb()) return;
  try {
    await withStore("readwrite", (s) => s.put(entry));
  } catch {
    /* best-effort durability */
  }
}

export async function listPendingUploads(): Promise<ReadonlyArray<PendingResourceUpload>> {
  if (!hasIdb()) return [];
  try {
    const all = await withStore<PendingResourceUpload[]>(
      "readonly",
      (s) => s.getAll() as IDBRequest<PendingResourceUpload[]>,
    );
    return all ?? [];
  } catch {
    return [];
  }
}

export async function removePendingUpload(id: string): Promise<void> {
  if (!hasIdb()) return;
  try {
    await withStore("readwrite", (s) => s.delete(id));
  } catch {
    /* ignore — a stale entry will simply be retried next flush */
  }
}

export async function countPendingUploads(): Promise<number> {
  if (!hasIdb()) return 0;
  try {
    return (await withStore<number>("readonly", (s) => s.count())) ?? 0;
  } catch {
    return 0;
  }
}
