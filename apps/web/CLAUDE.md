# Web App Context

## Security model — globally shared anonymous workspace

**weave currently has NO accounts and NO per-user scoping.** The deployed
instance is a single shared workspace — every client (every browser, every
device, every visitor) reads and writes the same KV keys under the
`shared:` prefix. Whoever opens the URL sees everything anyone else has
created and can overwrite or delete it.

Consequences for any work in `apps/web/api/*`:

- API routes MUST call `assertKvAvailable(res)` before touching `kv` so
  production deploys without KV env vars return 503 instead of silently
  falling back to in-memory (which loses data on cold-start).
- Input bodies MUST be validated via `_lib/validate.ts` helpers
  (`isValidId`, `enforceContentLength`, `enforceJsonContentType`) and
  responses MUST use `apiError(res, status, code, message)` so the
  stable error code surface remains consistent.
- KV key construction MUST go through `_lib/keys.ts`
  (`designKey`, `designIndexKey`, `resourceKey`, `resourceIndexKey`,
  `blobPath`). Do NOT hardcode the `shared:` prefix in handlers — the
  module is the single source of truth for the namespace.
- Do NOT promote this deployment to a public sign-up surface until §
  "Security model" in `DEPLOY.md` is fully addressed (real auth + KV
  key namespacing under `user:<uid>:` + rate-limit + quota).

## `window.__weave*` globals are development-only

Dev / e2e diagnostics expose `__weaveVm`, `__weaveEditor`, `__weaveDoc`,
`__weaveDesign`, `__weavePeek` on `window`. These MUST be gated behind
`import.meta.env.DEV` so production bundles never read or write them.
Production hot-path (`useInteractionMode`, `useSelection`) must rely on
React Context, not on the global.
