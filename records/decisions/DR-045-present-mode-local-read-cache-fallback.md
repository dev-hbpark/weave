# DR-045 — Present mode falls back to a prompt-free local read-cache when the cloud is unreachable

- **Date:** 2026-06-03 · **Status:** Accepted · **WI:** (small fix, no WI)
- **Relates:** offline-first persistence model (2026-05-29, `storage.ts` header + `apps/web/CLAUDE.md`), `cloud-only-reopen.spec.ts`

## Context

Present mode (`PresentPage`) opens designs server-first via `useDesign(id, { preferCloud: true })`.
Under the offline-first model a `weave.design.v5.<id>` localStorage entry means an *unsynced
offline edit* — a normally-synced design has **no** local copy. So when the cloud fetch failed
(network down, dev with no `/api`, 5xx), present mode had nothing to fall back to and showed the
empty stage even for a deck the user had just been viewing.

The offline outbox key could **not** double as the fallback cache: a present entry there would
masquerade as an offline edit and trip the editor's reconcile prompt — the exact regression the
offline-first switch removed.

## Decision

Add a **separate, prompt-free read-cache** under `weave.design.cache.v5.<id>`:

- `cacheDesignLocally(blob)` / `loadCachedDesign(id)` in `storage.ts`. Best-effort write
  (quota-safe), validated read via `hydrateSerializedDesign`.
- `useDesign` writes the cache on **every successful cloud load** (edit and present paths), and
  reads it as the initial paint **only in `preferCloud` mode** when no offline edit exists
  (`initialDesign` source `"cache"`). The editor never reads it — an offline edit there must still
  go through the reconcile prompt, not silently adopt a stale mirror.
- Fallback chain in present mode: **cloud → offline outbox copy → read-cache → blank**. Cloud
  always wins when reachable and refreshes the cache; staleness is bounded to cloud-outage windows.
- `clearDesign(id)` now also drops the cache key.

The `"cache"` source never sets `isLoading` (paints immediately) and never sets `localConflict`.

## Scope (edits)

- `apps/web/src/document/storage.ts` — `KEY_PREFIX_CACHE_V5`, `cacheDesignLocally`,
  `loadCachedDesign`, `clearDesign` cleanup, persistence-model comment note.
- `apps/web/src/document/use-design.ts` — `initialDesign(id, preferCloud)` with `"cache"` source,
  cache write in the cloud-fetch success branch.
- `apps/web/e2e/present-offline-fallback.spec.ts` — new: cloud-down present falls back to cache;
  and stays empty when nothing was ever cached.

## Consequences

- A deck the user has loaded at least once presents offline / through a cloud blip instead of
  going blank. A deck never loaded on this client (cloud down, no cache) still shows the empty
  stage — correct, there is nothing local.
- Read-cache is invisible to the outbox/reconcile contract (distinct key, never gates a save).
- Verification: typecheck green, 502 unit tests green, present + cloud-only-reopen e2e green
  (12 passed / 9 pre-existing skips), 2 new e2e green.
