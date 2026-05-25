// WI-025 — cloud sync helpers.
//
// The existing storage.ts / resource-storage.ts modules are SYNC and back
// onto localStorage. To get cross-device + persistent storage we add a
// thin cloud layer (API routes against Vercel KV / Blob) on top, glued
// together by this module:
//
//   • on app boot — fetch the cloud lists and merge into localStorage
//     so the existing sync APIs already see them on next render.
//   • on every save / delete — fire-and-forget mirror to the cloud so
//     other devices see the change after their next bootstrap.
//
// When the API is unreachable (offline, no env vars, dev without
// `vercel dev`) we silently fall back to localStorage-only. The user
// keeps working; nothing is lost.

import type { Design } from "./types.js";

const KEY_DESIGN_PREFIX = "weave.design.v5.";
const KEY_RESOURCE_PREFIX = "weave.resource.v1.";

/** Lightweight check — set to `false` when we hit a network/API error so
 *  subsequent calls skip the round-trip until the next bootstrap. */
let cloudAvailable = true;

export function isCloudAvailable(): boolean {
  return cloudAvailable;
}

async function safeFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response | null> {
  try {
    const resp = await fetch(input, {
      credentials: "same-origin",
      ...init,
    });
    if (!resp.ok && resp.status >= 500) {
      cloudAvailable = false;
      return null;
    }
    return resp;
  } catch {
    cloudAvailable = false;
    return null;
  }
}

// ── Designs ──────────────────────────────────────────────────────────────

interface CloudDesignSummary {
  readonly id: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly background: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export async function fetchAllDesignsCloud(): Promise<
  ReadonlyArray<CloudDesignSummary>
> {
  const resp = await safeFetch("/api/designs");
  if (resp === null) return [];
  const body = (await resp.json().catch(() => null)) as
    | { designs?: CloudDesignSummary[] }
    | null;
  return body?.designs ?? [];
}

export async function fetchDesignCloud(id: string): Promise<Design | null> {
  const resp = await safeFetch(`/api/designs/${encodeURIComponent(id)}`);
  if (resp === null || resp.status !== 200) return null;
  const body = (await resp.json().catch(() => null)) as
    | { design?: Design }
    | null;
  return body?.design ?? null;
}

// Cadence is owned by the consumer attaching to editor.changeStream via
// `scheduling.debounce(N)` (see use-weave-editor.ts). This function is
// the leaf write — it fires immediately and the caller is responsible
// for not calling it 60 times a second.
//
// We still flush on tab unload via sendBeacon so the last debounced
// snapshot survives a navigation that interrupts the in-flight POST.
let lastPushed: Design | null = null;

export function pushDesignCloud(design: Design): void {
  lastPushed = design;
  void safeFetch("/api/designs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(design),
  });
}

function beaconFlushLast(): void {
  if (lastPushed === null) return;
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
    return;
  }
  try {
    navigator.sendBeacon(
      "/api/designs",
      new Blob([JSON.stringify(lastPushed)], { type: "application/json" }),
    );
  } catch {
    // Beacon dispatch failures are unrecoverable here; localStorage still
    // holds the latest snapshot for the next bootstrap to reconcile.
  }
}

if (typeof window !== "undefined") {
  // Repeat the latest snapshot on tab close — the debounced storage sink
  // may have a pending Change that hasn't reached `pushDesignCloud` yet,
  // but anything that DID reach us is the latest in-memory state and is
  // worth re-asserting via sendBeacon in case the previous fetch was
  // racing the unload.
  window.addEventListener("pagehide", beaconFlushLast);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") beaconFlushLast();
  });
}

export function deleteDesignCloud(id: string): void {
  void safeFetch(`/api/designs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ── Resources ────────────────────────────────────────────────────────────

interface CloudResource {
  readonly id: string;
  readonly kind: "image" | "video";
  readonly src: string;
  readonly name: string;
  readonly addedAt: string;
  readonly sessionOnly: boolean;
}

export async function fetchAllResourcesCloud(): Promise<
  ReadonlyArray<CloudResource>
> {
  const resp = await safeFetch("/api/resources");
  if (resp === null) return [];
  const body = (await resp.json().catch(() => null)) as
    | { resources?: CloudResource[] }
    | null;
  return body?.resources ?? [];
}

/** Push a new resource to the cloud. Returns the persisted record (which
 *  carries the canonical `src` — for blob-backed uploads the URL is a
 *  public `*.public.blob.vercel-storage.com` href). */
export async function uploadResourceCloud(
  kind: "image" | "video",
  src: string,
  name: string,
): Promise<CloudResource | null> {
  // Images come in as data: URLs (we let the server transcode to Blob);
  // videos come in as blob: URLs (those die outside the browser, so we
  // pass src as-is + accept sessionOnly).
  const body =
    src.startsWith("data:")
      ? { kind, name, dataUrl: src }
      : { kind, name, src };
  const resp = await safeFetch("/api/resources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (resp === null || resp.status !== 200) return null;
  const parsed = (await resp.json().catch(() => null)) as
    | { resource?: CloudResource }
    | null;
  return parsed?.resource ?? null;
}

export function deleteResourceCloud(id: string): void {
  void safeFetch(`/api/resources/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ── Bootstrap ────────────────────────────────────────────────────────────

/** Pull the cloud lists into localStorage so the existing sync readers
 *  (listAllDesigns, listResources) see the same data. Called once on
 *  app mount. Returns the counts pulled so the caller can refresh state.
 *
 *  Concurrent callers (e.g. App.tsx's background prefetch and
 *  LandingPage's mount-time refresh) share the same in-flight promise,
 *  so the cloud is fetched at most once per render boundary. Once the
 *  in-flight call settles, the slot clears so a later refresh (manual
 *  refresh button, re-navigation) issues a fresh fetch. */
let inFlight: Promise<{ designs: number; resources: number }> | null = null;

export function bootstrapFromCloud(): Promise<{
  designs: number;
  resources: number;
}> {
  if (inFlight !== null) return inFlight;
  inFlight = bootstrapFromCloudImpl().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function bootstrapFromCloudImpl(): Promise<{
  designs: number;
  resources: number;
}> {
  if (typeof window === "undefined") return { designs: 0, resources: 0 };
  let designsCount = 0;
  let resourcesCount = 0;

  // Designs — for each summary, fetch the full document and write to LS.
  const summaries = await fetchAllDesignsCloud();
  for (const s of summaries) {
    if (window.localStorage.getItem(KEY_DESIGN_PREFIX + s.id) !== null) {
      // We already have a local copy. Skip the round-trip; on next save
      // the local copy will overwrite the cloud's stale snapshot.
      continue;
    }
    const full = await fetchDesignCloud(s.id);
    if (full === null) continue;
    window.localStorage.setItem(KEY_DESIGN_PREFIX + s.id, JSON.stringify(full));
    designsCount++;
  }

  // Resources — flat list.
  const cloudResources = await fetchAllResourcesCloud();
  for (const r of cloudResources) {
    const k = KEY_RESOURCE_PREFIX + r.id;
    if (window.localStorage.getItem(k) !== null) continue;
    window.localStorage.setItem(k, JSON.stringify(r));
    resourcesCount++;
  }

  return { designs: designsCount, resources: resourcesCount };
}
