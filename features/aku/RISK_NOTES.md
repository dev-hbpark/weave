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

## R5 — Expression layer can regress to Clippy / RPR / motion-sickness (WI-103, mitigated)

표현 레이어(WI-103)의 3대 리스크:
- **Clippy화** — 능동 말풍선이 잦으면 즉시 짜증 유발. 완화: 재미 문구 버블은 **기존
  `useAkuTips` 쿨다운/영구끄기 가드만** 사용(빈도 미상향); 작업 캡션 버블은 스트리밍 중
  (turn-bound)에만 → 자연 제한. 수동적 표정/모션은 비차단이라 무제한 허용.
- **RPR(렌더 비용)** — 스프라이트는 `background-position`=paint(비-compositor). 완화:
  소형(≤128px)·저FPS(`steps()` 8–12fps)·`contain:paint`; 연속 모션은 transform-only.
  `rendering-performance-review` 대상.
- **전정 자극/접근성** — 과한 모션은 멀미. 완화: 모든 신규 모션 `prefers-reduced-motion:
  reduce`에서 정지(하드 게이트, 기존 `.aku-bob` 패턴 확장) + e2e로 검증.

## R6 — Asset dependency limits Phase 1 (WI-103, accepted)

상태별 포즈 스프라이트 시트가 없으면(현재 placeholder 단일 PNG) Phase 1 표현은 transform
모션 + (눈 슬라이스 시)깜빡임으로 한정. 수용 — 자산 요구는 DR-design-024(마스코트
리디자인)에 합류, 풍부한 다포즈 표정은 자산 도착 후. 렌더러 시임(DR-070 D2) 덕에 Rive
업그레이드는 mood 레지스트리/구독 훅 변경 없이 가능.
