# WI-249 — Declarative typed-error channel (Result<A,E> + WeaveError)

## Metadata

| Field | Value |
|---|---|
| ID | WI-249 |
| Date | 2026-06-17 |
| Owner | hbpark |
| Status | **DONE (introduced + used in the effect pipeline); broad command migration = follow-up** |
| Type | Architecture — typed error channel |
| Decision | [DR-165](../decisions/DR-165-declarative-typed-error-channel.md) |
| Related | WI-248/DR-164 (effect pipeline — first consumer), WI-247/DR-163 (unit models) |

## Problem (requested)

Operator: introduce the (A) declarative error-check structure and build the
transaction effect pipeline on it. Stringly `fail("code")` gives the compiler
nothing; want typed errors the compiler tracks + exhaustive handling — the
Effect-ts `E`-channel idea without the runtime.

## Done (`276cd21`)

- `document/result.ts`: `Result<A,E>` / `AsyncResult` / `WeaveError` tagged union
  (`code` == legacy string for back-compat) / constructors / exhaustive
  `matchError` / `withTrace` (sync+async logical call-path). `result.test.ts` (3).
- **Used in the effect pipeline** (WI-248): `TransactionEffect.derive` +
  `applyEffects` → `Result<Patch[], WeaveError>`; a failing effect propagates a
  typed error that `weave.item.update` maps to `fail`.
- tsc + biome clean; full unit suite 1524 passed.

## Follow-up

Migrate command `fail("code", msg)` sites to the typed constructors incrementally
(`_tag`/`code` preserved → no test/agent churn). Cross-cutting + overlaps the
group-hug session's `commands.ts`, so phased + coordinated.
