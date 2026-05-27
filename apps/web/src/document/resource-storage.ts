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

/** Adds a new resource. Returns the persisted record. */
export function addResource(kind: ResourceKind, src: string, name: string): MediaResource {
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
  void import("./cloud-sync.js")
    .then(async (m) => {
      const cloud = await m.uploadResourceCloud(kind, src, name);
      if (cloud !== null && typeof window !== "undefined") {
        // Persist under the cloud's id so future bootstraps don't dupe.
        window.localStorage.removeItem(KEY_PREFIX + record.id);
        window.localStorage.setItem(KEY_PREFIX + cloud.id, JSON.stringify(cloud));
      }
    })
    .catch(() => {
      /* dev / offline — silently skip */
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
        sessionOnly: parsed.src.startsWith("blob:") ? true : false,
      });
    } catch {
      /* skip malformed */
    }
  }
  out.sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
  return out;
}

/** Remove every resource record. Used by tests to start fresh. */
export function clearAllResources(): void {
  if (typeof window === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k !== null && k.startsWith(KEY_PREFIX)) keys.push(k);
  }
  for (const k of keys) window.localStorage.removeItem(k);
}
