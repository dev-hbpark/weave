# Aku — Engineering Plan (WI-052)

## Architecture: two swappable seams

The design centers on two seams so "mock now → real Claude later" is a drop-in,
and so design-awareness is a registry (not branching):

- **`AkuTransport` (Strategy / DIP).** `send(req, signal): AsyncIterable<AkuEvent>`,
  `AkuEvent = text-delta | tool-call | done | error`. The conversation hook depends
  on the interface only. v1 = `createMockAkuTransport`; later = `createClaudeAkuTransport`
  (fetch `/api/aku` → parse stream → same events). `transport/types.ts`, `transport/mock-transport.ts`.
- **Tool registry (Rule 6).** `createAkuTools({editor,getDocument,getSelection})` → `{ snapshot(), executors: Map<name, executor> }`. Each executor delegates to a `weave.*` command via `editor.exec` (Information Expert: the editor owns mutation; edits are undoable). Dispatch is a Map lookup, never a `switch`. `tools/aku-tools.ts`, `tools/types.ts`.

## Layers (SRP)

- Rendering: `AkuLauncher` / `AkuPanel` / `MessageList` / `AkuComposer` — feature-local, token-styled.
- State + loop: `useAkuConversation` — transcript + send→stream→tool loop; never mutates the doc itself.
- Transport: mock (real later).
- Tools: editor.exec bridge + snapshot.
- Entry: `AkuAssistant` (mounted in `DesignPage` providers) wires editor+document → toolset (refs for freshness) + transport + hook; portals launcher/panel to `<body>` (z-48).

## Design System Triage (DR-design-023)

- Reuse: `Panel`(floating), `IconButton`/`Button`, `Spinner`, `Icon`(`IconSparkle`/`IconClose`/`IconImage`), tokens.
- Grew: `Textarea` primitive (multiline; `TextField` is input-only). Extend: `IconArrowUp` (send).
- Feature-local: chat bubbles / streaming caret / edit chips / image thumbnails (app-specific, not DS primitives).

## SOLID-GRASP first-pass

- DIP: hook → `AkuTransport` interface, not concrete transport.
- OCP / Rule 6: tools = Map lookup; new capability = one entry.
- SRP: rendering / state / transport / tool-execution separated; edits only via `editor.exec`.
- Protected Variations: real model swaps behind the transport seam with zero UI/loop change.

## Verification

- weave typecheck 0; Aku files biome-clean.
- e2e `apps/web/e2e/aku-chat.spec.ts` (4): launcher open/close · streamed reply · **design-aware edit ("배경을 파랑으로") applies to document.attrs.background AND Cmd+Z reverts** · composer typing does not fire canvas hotkeys.

## Deferred

- `apps/web/api/aku.ts` (Vercel) → `@anthropic-ai/sdk` streaming + vision + tool-use loop (`createClaudeAkuTransport`).
- Access hardening before the real route ships on the shared deploy (see RISK_NOTES).

---

# WI-103 — Expressive state layer (작업상태 표정 · 작업 말풍선 · 스프라이트)

FR-020 (FEASIBLE WITH TRADE-OFFS) · DR-070. Phase 1 = **new dependency 0**.

## Premise: subscribe, don't generate

"무슨 작업 중인지" 신호는 이미 흐른다 — `AgentRunState`(thinking / streaming-text /
tool-calling / applying / queued) + `activeTools[].caption`, `activityFor()`가 한국어
캡션으로 매핑 중(`agent/use-aku-agent.ts:180`). 연결 lifecycle(connecting/open/
reconnecting/closed/error)·선택/문서 ref도 이미 존재. 표현 레이어는 **producer를 건드리지
않고 구독만** 한다(Information Expert: 상태는 에이전트 훅 소유, 표현은 소비자).

## Architecture: third swappable seam (mirrors AkuTransport / tool-registry)

- **`AkuExpressionRenderer` (Strategy / DIP).** `render(mood, intensity, look?) → JSX`.
  표현 레이어는 인터페이스에만 의존. Phase 1 = `createCssSpriteRenderer()` (no dep);
  Phase 2 = `createRiveRenderer()` (deferred, gated). Rive 교체 시 mood 레지스트리/구독
  훅 변경 0 (Protected Variations). `expression/renderer-types.ts`,
  `expression/css-sprite-renderer.tsx`.
- **State→mood registry (Rule 6).** `resolveAkuMood(runState, connState, selection): AkuMood`
  — 우선순위 규칙 테이블(첫 매치), phase 문자열 `switch` 금지. mood = idle / thinking /
  working / finalizing / celebrating / confused / sleeping / looking.
  `expression/mood-registry.ts`.
- **Phrase registry.** `moodPhrases: Map<AkuMood, readonly string[]>` — 재미 문구.
  index는 prompt/turn으로 변주(no `Math.random` in shared paths). `expression/phrases.ts`.

## Layers (SRP)

- Subscribe + derive: `useAkuExpression(getRunState, getConn, getSelection)` → `{mood, intensity, look}`. consumer가 스케줄(transition/RAF) 소유; doc은 절대 안 건드림.
- Render: `AkuExpression` wraps `AkuMascot` 영역, 선택된 renderer로 mood 시각화. 연속 모션(bob 변주·tilt·squash·시선 translate) = transform-only; 이산 포즈(blink·mouth·표정) = CSS sprite `steps()`.
- Bubbles (2종, 분리):
  - **작업 캡션 버블** — `activityFor()` 캡션, 스트리밍 중에만(turn-bound → 빈도 자연제한). `AkuTipBubble` Popover 재사용.
  - **재미 문구 버블** — `moodPhrases`, **기존 `useAkuTips` 쿨다운/영구끄기 가드 재사용**. 빈도 미상향(성패 지점).
- CSS: `main.css` aku 블록에 sprite `steps()` 키프레임 + mood 전이; 전부 `prefers-reduced-motion: reduce` 정지 폴백(기존 `.aku-bob` 패턴 확장).

## Design System Triage (DR-070 D6) = **escape (feature-local)**

아쿠 = 브랜드 자산(WI-052 선례), 재사용 primitive 아님. 표현 레이어·sprite CSS·레지스트리
전부 `features/aku/` + `main.css` aku 블록. `@weave/design-system` 무변경 → 신규
primitive/token/theme 0 → 디자인 리뷰 불요. 단 **상태별 포즈 스프라이트 시트 자산 요구는
DR-design-024(마스코트 리디자인)에 합류** — placeholder 단일 PNG로는 Phase 1이 transform
모션 + (눈 슬라이스 시)깜빡임으로 한정.

## SOLID-GRASP first-pass

- DIP: 표현 레이어 → `AkuExpressionRenderer` 인터페이스(concrete 렌더러 import 금지, deps-guard).
- OCP / Rule 6: mood = 규칙 테이블, phrase/renderer = Map; 신규 phase/표정 = 행/항목 하나.
- SRP: 구독(derive) / 렌더 / 버블 / 매핑 분리. producer(에이전트 훅) 불변.
- Protected Variations: Rive가 시임 뒤에서 교체 — UI/구독/레지스트리 무변경.
- Information Expert: 상태는 에이전트 훅이 소유, 표현은 순수 소비자(새 데이터 파이프라인 0).

## Verification (SVL gate)

- typecheck 0; Aku files biome-clean.
- 단위: `resolveAkuMood` 규칙테이블(상태 조합 → mood 전이) · 렌더러 deps-guard(표현
  레이어가 concrete 렌더러 비-import) · `moodPhrases` 커버리지(모든 mood 문구 보유).
- e2e `apps/web/e2e/aku-expression.spec.ts`: 턴 구동 시 `data-mood`가
  thinking→working→finalizing→idle 전이 · 작업 캡션 버블 표시/소멸 · reduced-motion
  에뮬레이션에서 애니메이션 정지.

## Deferred (Phase 2 — 별도 WI + 게이트)

- `createRiveRenderer` + 실제 `.riv` 자산 + 디자이너 파이프라인 → **`library-adoption-review`
  하드 게이트**(WASM/번들/tree-shake 3관문).
- 완료 셀러브레이션 파티클, 시간대 인사, 드래그 휘청/하품 등 추가 위트.
- 최종 마스코트 아트 + 상태별 포즈 시트(DR-design-024).
