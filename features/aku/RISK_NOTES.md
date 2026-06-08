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

## R7 — 의도 라우팅: 오분류 · 과편집 · 지연 (WI-148, 완화 설계)

- **오분류**(잘못된 파이프라인) — 완화: 하이브리드 보정칩 + 명시 슬래시 + `intentSource: client/off` +
  저확신 시 보정 묻기. 잔여: 자동추론 켜면 0 불가 → 교정 경로로 흡수.
- **범위 한정 편집 과편집**("선택만 수정"·"recolor만"이 프롬프트 준수 의존) — 완화: operation 지시문 +
  범위 리뷰 렌즈 + recolor 시 critique/prune/reflow OFF + 모든 편집 `editor.exec`→History(Cmd+Z).
  잔여: 하드 보장 아님 — 툴-스코프 itemId 제한은 별도 범위(Phase 3).
- **분류 지연**(server 모드 빌드 전 1턴) — 완화: 빠른/저토큰 모델, 명시 시 생략, client 모드 0턴.
- **교차 프로젝트 스큐** — 완화: `intent` 이벤트 additive(미지 타입 tolerate), client 모드는 task 증강만으로
  서버 무변경 빌드에서 동작, 서버는 명시 intent 없으면 기존 경로(회귀 없음). 상세 RISK-012.
