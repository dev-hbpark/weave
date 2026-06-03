# DR-047 — Failed image uploads queue in an IndexedDB outbox and re-upload on reconnect

- **Date:** 2026-06-03 · **Status:** Accepted · **WI:** (small fix, no WI)
- **Relates:** DR-045 (present-mode local read-cache fallback — same "survive a cloud outage" theme), WI-024 (resource library), WI-025 (cloud sync), `use-migrate-inline-media.ts` (design-level inline→cloud migration)

## Context

`MediaSrcDialog` awaits `uploadResourceCloud` so an image lands on the server
before its URL flows into the design. On failure (offline / server down) it fell
back to inlining the `data:` URL and called `addResource(...)` as a "fire-and-
forget retry" — but there was **no actual retry**: `addResource`'s internal
upload simply swallowed the failure, so the bytes never reached the server even
after connectivity returned. The image lived only as inline base64 in the design.

## Decision

Add a durable **IndexedDB upload outbox** (images can be several MB — past the
localStorage string cap):

- `resource-outbox.ts` — a tiny raw-IndexedDB queue (`weave-resource-outbox` /
  `pending`): `enqueueResourceUpload`, `listPendingUploads`, `removePendingUpload`,
  `countPendingUploads`. Every export no-ops when `indexedDB` is unavailable
  (SSR / jsdom), so callers never guard. No new dependency.
- `resource-storage.ts` — `addResource`'s cloud mirror now **queues** the bytes
  on failure (only `kind === "image"` with a `data:` src; videos are session
  `blob:` URLs with no server-reachable bytes). The LS-swap on success is
  factored into `reconcileUploadedResource` and shared with the flusher.
- `flushResourceOutbox()` — re-uploads queued entries in order; on each success
  reconciles the LS record (local id → cloud id) and **deletes** the queue entry
  ("upload, then delete"). Stops at the first failure so a still-down cloud
  doesn't burn the queue; a `flushing` guard prevents concurrent drains.
- `App.tsx` — flush on **boot** (queue from a prior session) and on the window
  **`online`** event (connection restored mid-session).

The dialog copy now tells the truth: "로컬에 보관했다가 연결되면 자동으로 업로드할게요."

## Scope (edits)

- `apps/web/src/document/resource-outbox.ts` — new IndexedDB queue.
- `apps/web/src/document/resource-storage.ts` — enqueue-on-failure, `reconcileUploadedResource`, `flushResourceOutbox`.
- `apps/web/src/App.tsx` — boot + `online` flush triggers.
- `apps/web/src/document/toolbar/MediaSrcDialog.tsx` — honest fallback copy.
- `apps/web/e2e/image-upload-outbox.spec.ts` — new: queue fills on failure, drains on `online`, and survives a reload to drain on boot.

## Consequences

- An image uploaded during an outage is no longer stranded as inline base64: it
  reaches the cloud as soon as the server is reachable, then leaves the queue.
- Design-level rewrite of the inline `data:` src → cloud URL remains the job of
  `useMigrateInlineMedia` (separate concern); the outbox guarantees the resource
  exists server-side so that migration can succeed.
- Verification: typecheck green, 502 unit tests green, 2 new e2e green, media
  upload + add-menu regression suite green (18 passed).
