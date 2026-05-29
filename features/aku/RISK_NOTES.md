# Aku — Risk Notes (WI-052)

## R1 — No-auth LLM endpoint = cost / abuse exposure (DEFERRED, blocks real launch)

weave deploys as an **anonymous, login-free, globally-shared** workspace
(`apps/web/CLAUDE.md` § Security model). A real `/api/aku` route that calls an
LLM would let any visitor spend the API budget and exfiltrate prompts/images.

- **Status:** accepted-and-deferred for v1 because v1 ships **no real endpoint**
  (mock transport only) — there is no key and no cost surface today.
- **Trigger (must resolve before the real route is exposed):** when wiring
  `createClaudeAkuTransport` + `apps/web/api/aku.ts`, add at minimum a per-session
  rate limit + a shared passphrase (or move Aku behind real auth), and keep
  `ANTHROPIC_API_KEY` server-only. Mandatory `_lib` guards still apply
  (`assertKvAvailable`, `enforceContentLength`, `enforceJsonContentType`, `apiError`).

## R2 — Image payload size on the real route

v1 caps attachments at 4 MB/image client-side and keeps them as data URLs. The
real route must enforce a server-side total-body cap (`enforceContentLength`)
before forwarding base64 image blocks to the model, or a large multi-image turn
will blow the function body limit / token budget.

## R3 — Design-aware edits are real mutations (mitigated)

Aku edits the live document. Mitigation: every edit routes through
`editor.exec("weave.*")` → undoable transaction (History contract), so any
unwanted edit is one Cmd+Z away; the e2e proves this. The mock's intent matching
is shallow (keyword heuristics) — a real model with the same tool registry
should still only act through these vetted commands (no raw doc access).

## R4 — Mock ≠ real fidelity (accepted)

The mock's replies/tool-calls are scripted; it does not reflect real model
latency, refusals, or multi-step tool loops. Accepted for v1 (UI/protocol/wire
validation). The transport interface + tool registry are the contract the real
model must satisfy.
