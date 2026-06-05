# DR-065 — weave.batch: run several commands as one atomic transaction

- **Date:** 2026-06-05 · **Status:** Accepted · **WI:** WI-096
- **Relates:** WI-060 (round-grouping editor — per-round single undo), DR-064 /
  WI-095 (full agent command exposure), DR-003 (Command = pure fn → patches),
  WI-024 (self-contained patches)
- **Operator directive (2026-06-05):** "에이전트가 커맨드 호출을 병합해서 호출할 수
  있는 방법이 필요해 — 여러 커맨드를 트랜잭션으로 묶어서 호출하는 커맨드를 추가로
  공개할 수 있을까?"

## Context

The agent edits via one `weave.*` command per tool call. Two existing mechanisms
already help, but neither gives an explicit, atomic bundle:

- **Round-grouping** (WI-060) wraps all of a model round's tool calls in one
  `beginBatch`/`endBatch` group → ONE Cmd+Z. But it is undo-grouping only: the
  calls are still independent execs, so a mid-round failure leaves the earlier
  edits applied (no all-or-nothing).
- **Consolidated commands** (item.update / items.update / items.lifecycle) bundle
  many *attrs/units/items* per call, but only within one command's verb.

There was no way to bundle DIFFERENT commands into ONE atomic transaction.

## Decision

Add **`weave.batch { ops: [{ command, input }] }`** — exposed to the agent.

- Dispatches each op via the existing command set against an **evolving working
  document** (`applyChangeToDocument` after each op), so op N+1 sees op N's effects
  on existing items/state — exactly the semantics of today's sequential round
  execs. All ops' patches are concatenated and returned as ONE `CommandResult`, so
  the transaction runner emits a single ChangeStream transaction → one Cmd+Z.
- **Atomic:** any op failing (unknown command / validation / command error) aborts
  the whole batch with that error and returns NO patches — nothing applies. This is
  the key gain over N parallel tool calls.
- Returns each op's result value (in order), so created ids etc. are surfaced.
- **Guards (Rule 6 — a Map registry + a small disallow Set, no switch):**
  `weave.batch` cannot nest, and `weave.doc.reset` is disallowed inside a batch
  (its non-patch `targets.reset()` side effect would fire even if a later op aborts
  the batch, breaking atomicity).

### Known limitation

An item CREATED in one op is not addressable by id in a LATER op of the same batch
(the agent writes every input up-front; ids are assigned on apply). Create-then-edit
on a brand-new item stays a follow-up call (still one undo via the round group).
Documented in the command description.

## Scope (edits)

- `commands.ts` — import `applyChangeToDocument`; split the return into `base` +
  the `weave.batch` command built over a `byName` map; `return [...base, batch]`.
- `weave-command-schemas.ts` — `WEAVE_COMMAND_LABELS["weave.batch"]` + a curated
  schema (ops array, each `{ command, input }`) with a top-level description.
- `commands.test.ts` — 6 cases (order/concatenation, atomic abort, evolving-doc
  same-item merge, unknown/nesting/reset rejection, empty ops).

## Consequences

- (+) The agent can fire a set of edits as ONE atomic, single-undo transaction —
  cleaner than N parallel calls and safe against partial application.
- (+) Sequential edits on existing items compute correctly (evolving doc).
- (+) Reuses every existing command (and their validation) — zero per-command work.
- (−) New-id-in-same-batch is unsupported (documented).
- (−) Two ways to group now exist (round-grouping vs batch); batch is the explicit/
  atomic one, round-grouping the implicit per-round undo. Both compose (a batch is
  one exec inside the round group).

## Verification (SVL gate)

`@weave/web`: typecheck clean; `commands.test.ts` 98 pass (incl. 6 batch) + aku
suites; coverage guard confirms `weave.batch` carries a schema + top-level
description. biome clean on changed files. Rule-6 gate: pre-existing 3 only, none
added (batch dispatches via a Map, not a switch).
