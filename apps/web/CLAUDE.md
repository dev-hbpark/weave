# Web App Context

## Security model — anonymous device-scoped only

**weave is NOT multi-user.** The deployed instance scopes all data
behind a `weave_did` cookie that is never signed and never bound to
identity. Anyone who presents the cookie sees and overwrites the data
in that scope. Two users on a shared browser share the same workspace.

Consequences for any work in `apps/web/api/*`:

- API routes MUST call `assertKvAvailable(res)` before touching `kv`
  so production deploys without KV env vars return 503 instead of
  silently falling back to in-memory (which loses data on cold-start).
- Input bodies MUST be validated via `_lib/validate.ts` helpers
  (`isValidId`, `enforceContentLength`, `enforceJsonContentType`) and
  responses MUST use `apiError(res, status, code, message)` so the
  stable error code surface remains consistent.
- Do NOT add an endpoint that reads or writes data without the device-id
  cookie. Do NOT change the cookie format without an HMAC signature.
- Do NOT promote this deployment to a public sign-up surface until §"Security
  model — explicit limitations" in `DEPLOY.md` is fully addressed.

## `window.__weave*` globals are development-only

Dev / e2e diagnostics expose `__weaveVm`, `__weaveEditor`, `__weaveDoc`,
`__weaveDesign`, `__weavePeek` on `window`. These MUST be gated behind
`import.meta.env.DEV` so production bundles never read or write them.
Production hot-path (`useInteractionMode`, `useSelection`) must rely on
React Context, not on the global.
