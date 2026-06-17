# DR-165 — Declarative typed-error channel (Effect-ts E-channel idea, no runtime)

## Metadata

| Field | Value |
|---|---|
| ID | DR-165 |
| Date | 2026-06-17 |
| Owner | hbpark |
| Status | **ACCEPTED** (introduced + used in the effect pipeline; broad command migration is follow-up) |
| Work Item | [WI-249](../work-items/WI-249-declarative-typed-error-channel.md) |
| Related | DR-164 (effect pipeline — the first consumer), DR-163 (unit models), the Effect-ts/RxJS evaluation (rejected wholesale; borrow the ideas) |

## Context

The operator asked whether to re-architect on Effect-ts / RxJS. Verdict
(prior turn): no wholesale adoption — the sync-transaction/undo core, bundle, and
the existing signals + `CommandResult` already cover those domains; borrow the
*ideas* with lightweight primitives. The most valuable borrowable idea is
Effect-ts's typed **error channel** (`E`): make the errors a producer can yield
part of the TYPE, and force handlers to address each variant (declarative error
checking). Today weave uses stringly `fail("code", msg)` — the compiler tracks
nothing.

## Decision — `Result<A, E>` + `WeaveError` tagged union + exhaustive `matchError`

`document/result.ts`:

- `Result<A, E = WeaveError>` = `{ok:true,value} | {ok:false,error}`.
- `AsyncResult<A,E> = Promise<Result<A,E>>` — async edges share the SAME error
  channel, so a boundary handles one union regardless of sync/async origin.
- `WeaveError` = a discriminated union (`NotFound` / `Invalid` / `NotApplicable` /
  `Other`). Each variant keeps a stable **`code` string == the existing command
  error code**, so tests / the agent error surface are back-compatible while the
  type gains exhaustiveness. `Other` bridges the many legacy codes not yet modeled.
- Constructors `notFound` / `invalid` / `notApplicable` / `otherError`.
- `matchError(e, handlers)` — exhaustive on `_tag` (no `default`; an unhandled
  variant is a compile error — that is the declarative-checking property).
- `withTrace(op, error)` — prepends a logical op to `error.trace` (+ keeps the
  original as `cause`): a lightweight cross-sync/async call-path without a fiber
  runtime (the "(B)" traceability idea, bounded).

## Where it is used now

The transaction effect pipeline (DR-164): `TransactionEffect.derive` and
`applyEffects` return `Result<Patch[], WeaveError>`; a failing effect
short-circuits with a typed error and the command maps it to `fail(code, message)`
(`computeAttrsPatches` → `weave.item.update`). So the channel is load-bearing,
not just defined.

## Scope boundary

NOT migrating all ~80 commands' `fail("code")` calls to typed constructors in this
DR — that is a broad, cross-cutting follow-up (and overlaps the concurrent
group-hug session's `commands.ts`). The structure is introduced + proven in the
pipeline + unit layer; commands adopt it incrementally (each `fail("x")` → a typed
constructor, `_tag`/`code` preserved so tests don't churn).

## Alternatives considered

- **Effect-ts wholesale** — rejected (prior turn): runtime weight, async-default
  vs sync core, paradigm split. This captures the `E`-channel value without it.
- **Keep stringly codes** — rejected: no compile-time tracking; the operator wants
  declarative checking ([[foolproof-structure-over-brevity]]).
- **Open string-coded errors only** — rejected: defeats exhaustive `match`; the
  tagged union + `Other` bridge gives exhaustiveness AND a migration ramp.

## Consequences

- Producers declare their error type; `matchError` forces handling every variant.
- Sync + async share one error union (uniform boundary handling).
- `code` back-compat → zero test/agent churn on introduction.
- Adoption across commands is incremental, not a big-bang rewrite.

## Verification

- `result.test.ts` — constructors keep `code`, `matchError` dispatches, `withTrace`
  builds the path. `tsc` clean; full unit suite green.
