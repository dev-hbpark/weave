// WI-024 — uploaded media resource library.
//
// Tracks images / videos the user has uploaded so they can be reused in
// future designs without re-uploading. Persistence model:
//
//   • Images   → data: URL (already a string; safe to put in
//                localStorage). Survives reloads.
//   • Videos   → blob: URL (session-scoped). On reload the URL is dead;
//                we keep the metadata entry but mark `sessionOnly: true`
//                and the picker grays it out.
//
// Storage keys: `weave.resource.v1.<resourceId>` — one entry per resource
// so a corrupt entry doesn't kill the whole library and so listing can
// stream via the iterator.

import {
  countPendingUploads,
  enqueueResourceUpload,
  listPendingUploads,
  removePendingUpload,
} from "./resource-outbox.js";

const KEY_PREFIX = "weave.resource.v1.";

export type ResourceKind = "image" | "video";

export interface MediaResource {
  readonly id: string;
  readonly kind: ResourceKind;
  /** data: URL (image) or blob: URL (video — session only). */
  readonly src: string;
  readonly name: string;
  /** ISO timestamp. */
  readonly addedAt: string;
  /** True for video blob URLs after a reload — the original blob is gone. */
  readonly sessionOnly: boolean;
}

function generateId(kind: ResourceKind): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${kind}-${ts}-${rand}`;
}

export interface AddResourceOptions {
  /** When supplied, skips the internal async cloud upload and stores
   *  the pre-uploaded values verbatim. Used by MediaSrcDialog after it
   *  awaits `uploadResourceCloud` synchronously — that path needs the
   *  canonical cloud URL surfaced *before* the user clicks Confirm,
   *  so the upload cannot stay fire-and-forget. The `id` is also
   *  taken from the cloud response so two passes through this
   *  function never dupe under different ids. */
  readonly preuploaded?: { readonly id: string; readonly src: string };
}

/** Swap the local LS record for the canonical cloud one: drop the
 *  locally-generated id and write the resource back under the cloud id so
 *  future bootstraps don't duplicate it. Shared by the immediate-success
 *  path and the outbox flusher. */
function reconcileUploadedResource(localId: string, cloud: MediaResource): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY_PREFIX + localId);
  window.localStorage.setItem(KEY_PREFIX + cloud.id, JSON.stringify(cloud));
}

/** Adds a new resource. Returns the persisted record. */
export function addResource(
  kind: ResourceKind,
  src: string,
  name: string,
  options?: AddResourceOptions,
): MediaResource {
  if (options?.preuploaded !== undefined) {
    // Caller already pushed to /api/resources and is handing us the
    // canonical (id, src) pair. Skip the internal upload and write
    // the cloud record straight into the library cache.
    const record: MediaResource = {
      id: options.preuploaded.id,
      kind,
      src: options.preuploaded.src,
      name,
      addedAt: new Date().toISOString(),
      sessionOnly: false,
    };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY_PREFIX + record.id, JSON.stringify(record));
    }
    return record;
  }
  const record: MediaResource = {
    id: generateId(kind),
    kind,
    src,
    name,
    addedAt: new Date().toISOString(),
    // Videos are blob: URLs which die on reload. Mark them at write-time
    // so listResources can preserve the user-facing distinction.
    sessionOnly: kind === "video",
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY_PREFIX + record.id, JSON.stringify(record));
  }
  // WI-025 — mirror to cloud. For images the server transcodes the
  // data: URL into a Blob URL and writes that back; we update the LS
  // entry with the canonical URL so future reads share state.
  //
  // When the mirror FAILS for an image (offline / server down), the bytes
  // are queued in the IndexedDB outbox so they upload when the connection
  // returns (see `flushResourceOutbox`). Only `data:` images are queued:
  // videos are session `blob:` URLs with no server-reachable bytes, and a
  // remote `http(s):` src needs no re-upload.
  const queueable = kind === "image" && src.startsWith("data:");
  void import("./cloud-sync.js")
    .then(async (m) => {
      const cloud = await m.uploadResourceCloud(kind, src, name);
      if (cloud !== null) {
        reconcileUploadedResource(record.id, cloud);
      } else if (queueable) {
        void enqueueResourceUpload({
          id: record.id,
          kind: "image",
          name,
          src,
          addedAt: record.addedAt,
        });
      }
    })
    .catch(() => {
      // Network threw — same durable retry as the explicit-null case.
      if (queueable) {
        void enqueueResourceUpload({
          id: record.id,
          kind: "image",
          name,
          src,
          addedAt: record.addedAt,
        });
      }
    });
  return record;
}

export function removeResource(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY_PREFIX + id);
  void import("./cloud-sync.js")
    .then((m) => m.deleteResourceCloud(id))
    .catch(() => {
      /* dev / offline — silently skip */
    });
}

/** Returns all resources, newest first. blob: URLs are stamped
 *  `sessionOnly: true` regardless of stored flag (we can't validate the
 *  URL without trying to fetch it). */
export function listResources(): ReadonlyArray<MediaResource> {
  if (typeof window === "undefined") return [];
  const out: MediaResource[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key === null) continue;
    if (!key.startsWith(KEY_PREFIX)) continue;
    const raw = window.localStorage.getItem(key);
    if (raw === null) continue;
    try {
      const parsed = JSON.parse(raw) as MediaResource;
      if (typeof parsed.id !== "string" || (parsed.kind !== "image" && parsed.kind !== "video")) {
        continue;
      }
      out.push({
        ...parsed,
        sessionOnly: !!parsed.src.startsWith("blob:"),
      });
    } catch {
      /* skip malformed */
    }
  }
  out.sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
  return out;
}

// ── Outbox flush (server-connection retry) ─────────────────────────────────

/** Guards against concurrent flushes — the app-boot trigger and the `online`
 *  event can both fire close together; without this the same queued entry
 *  could be uploaded twice. */
let flushing = false;

/** Re-upload every queued image whose cloud upload previously failed, in
 *  insertion order. On each success the LS resource record is reconciled from
 *  the local id to the cloud id and the queue entry is deleted ("upload, then
 *  delete"). Stops at the FIRST failure so a still-unreachable cloud doesn't
 *  burn through the queue — the next trigger (app boot / `online` event)
 *  retries from where it left off. Returns how many uploaded and how many
 *  remain queued.
 *
 *  Call this whenever the server may have become reachable: app boot and the
 *  window `online` event (wired in App.tsx). Safe to call when the queue is
 *  empty or IndexedDB is unavailable — both short-circuit to a no-op. */
export async function flushResourceOutbox(): Promise<{
  readonly uploaded: number;
  readonly remaining: number;
}> {
  if (flushing) return { uploaded: 0, remaining: await countPendingUploads() };
  flushing = true;
  try {
    const pending = await listPendingUploads();
    if (pending.length === 0) return { uploaded: 0, remaining: 0 };
    let cloudSync: typeof import("./cloud-sync.js");
    try {
      cloudSync = await import("./cloud-sync.js");
    } catch {
      return { uploaded: 0, remaining: pending.length };
    }
    let uploaded = 0;
    for (const entry of pending) {
      let cloud: Awaited<ReturnType<typeof cloudSync.uploadResourceCloud>> = null;
      try {
        cloud = await cloudSync.uploadResourceCloud(entry.kind, entry.src, entry.name);
      } catch {
        cloud = null;
      }
      if (cloud === null) break; // cloud still unreachable — retry on next trigger
      reconcileUploadedResource(entry.id, cloud as unknown as MediaResource);
      await removePendingUpload(entry.id);
      uploaded += 1;
    }
    return { uploaded, remaining: await countPendingUploads() };
  } finally {
    flushing = false;
  }
}

/** Remove every resource record. Used by tests to start fresh. */
export function clearAllResources(): void {
  if (typeof window === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k?.startsWith(KEY_PREFIX)) keys.push(k);
  }
  for (const k of keys) window.localStorage.removeItem(k);
}
