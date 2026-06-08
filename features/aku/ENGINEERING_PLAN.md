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

---

# WI-148 — 의도 기반 파이프라인 라우팅 (Aku intent-routed pipeline)

FR-023 (FEASIBLE WITH TRADE-OFFS) · DR-102 · RISK-012 · HANDOFF-027(→small-think).
**설계/계획만 — 구현 미착수.**

## 전제: 단일 경로 → 의도별 라우팅

현재 `runTurn`은 입력을 단일 task로 조립해 한 번 submit하고 서버 에이전트가 추가/수정/삭제/교체를
같은 경로로 처리한다(의도 구분 0). 이 WI는 그 앞에 **의도 분류 + 의도별 라우팅** 레이어를 둔다.

## 의도 모델: Operation × Target × Tone (평면 9개 아님)

```ts
type Operation = "create" | "add" | "edit" | "delete" | "replace" | "recolor" | "retone";
type Target    = "none" | "selected" | "referenced" | "deck";
type TonePolicy = "inherit" | "ignore" | "match";
interface IntentPlan { operation: Operation; target: Target; tonePolicy: TonePolicy; referencePhrase?: string }
```

요청 9개 → 3축 매핑은 DR-102 D1 표 참조. 신규 의도 = 행 하나(OCP/Rule 6), `switch(operation)` 금지.

## 분류 위치: `intentSource` 설정 (server / client / off)

`AkuSettings.intentSource` 추가(기본 `server`). `aku-settings.ts`에 필드 + `AkuSettingsMenu`에 토글.

- **server** — 서버 `withIntentRouting` 데코레이터가 분류 + 라우팅. 자동추론 + 보정칩.
- **client** — 클라이언트가 의도 결정(명시 칩/슬래시 또는 클라이언트 휴리스틱) → **서버 분류 턴 생략**.
  `runTurn`이 지시문 절·톤 컨텍스트를 task에 직접 조립 + `SubmitOptions.intent` 라벨 전달.
  서버 무변경 빌드에서도 task 증강만으로 동작(graceful degradation) → **클라이언트 선착륙 가능**.
- **off** — 라우팅 비활성, 현재 단일 경로(회귀 안전망).

## 아키텍처: 네 번째 swappable 시임 (AkuTransport / tool-registry / Expression 선례)

- **Intent classifier (Strategy / DIP).** `classify(input, ctx): Promise<IntentPlan>`.
  - `client` 모드 = `createHeuristicClassifier()`(키워드/선택상태 규칙, 모델 0) + 명시 신호 우선.
  - `server` 모드 = 서버 `withIntentRouting`(모델 분류 턴). 클라는 결과 이벤트만 소비.
  - 분류 위치 교체 = `intentSource` 뒤(Protected Variations). `agent/intent/classifier.ts`.
- **Operation→Plan registry (Rule 6).** `INTENT_ROUTES: Record<Operation, RouteSpec>` —
  `RouteSpec = { runnerKind, directive(plan, ctx), toneContext, register?, passOverrides }`.
  분기는 Map/record 조회, `switch` 금지. weave 측은 `directive`+`toneContext`(클라 라우팅용),
  서버 측은 `passOverrides`(하니스 pass)까지. `agent/intent/routes.ts`.
- **Target resolver (Strategy).** none/selected/referenced/deck → 대상 id 집합 + 컨텍스트 라인.
  selected = 기존 `getSelection()`; referenced = 스냅샷에서 해소(모호 시 clarify); deck = 전 슬라이드.
  `agent/intent/target-resolver.ts`.
- **Tone policy (record).** inherit/ignore/match → `design.tone` 컨텍스트 주입 여부/방식.

## weave 측 변경 (레이어 SRP)

1. **설정** — `aku-settings.ts`: `intentSource` + `intentConfirm`("저확신 시 보정 묻기") 필드.
   `AkuSettingsMenu.tsx`: 3-모드 셀렉트 + 토글(기존 토글 패턴 재사용).
2. **분류/라우팅** — `agent/intent/{classifier,routes,target-resolver}.ts`(상기 시임).
3. **task 조립** — `use-aku-agent.ts` `runTurn`: `intentSource!=="off"`면 plan 해소 →
   `routes[op].directive(plan)` + tone 컨텍스트 라인을 기존 라인 조립에 합류, `SubmitOptions.intent` 전달.
4. **컨텍스트 툴** — `design.tone` 컨텍스트 툴 추가(해석된 테마 토큰·폰트·코너/그림자/스페이싱 프로파일).
   `getDesignInfo` 주입과 동형, edit 툴 아님(DESIGN_CONTEXT_TOOLS 합류).
5. **보정칩 UX** — `intent` AgentEvent를 run-state로 reduce → 어시스턴트 버블에 의도 칩.
   클릭 → operation/target 피커(`ClarifyPicker` 패턴) → reverse 채널(`kind:"intent"`)로 보정 또는
   명시 intent 재submit. `types.ts`에 `AkuAssistantMessage.intent` 필드(`onUnknown` 안전).
6. **명시 슬래시** — `SlashCommandMenu`에 의도 커맨드(`/수정 /추가 /교체 /삭제 /팔레트 /톤유지
   /톤무시 /톤맞춤`) → submit에 명시 intent(서버 분류 생략, 모드 무관).

## small-think 측 변경 (HANDOFF-027 — 서버 팀 픽업)

- `withIntentRouting(ctx, runner)` TaskRunner 데코레이터(`withItemElicitation` 동형). elicit **앞**에 래핑.
- **명시 intent 게이팅:** `SubmitOptions.intent`가 오면 분류 턴 생략, 플랜 직접 적용(elicit이 명시 답 시
  skip하는 선례). 없고 클라가 server 모드면 분류 턴 1회(빠른 모델·저토큰·structured output).
- **additive `intent` AgentEvent** 방출(contracts `agent-event.ts`에 타입 추가) → 보정칩.
- **pass 오버라이드:** operation별로 `DesignHarness`의 message/critique/prune/reflow/review pass 수 +
  register를 조정해 `editDesign`/`designFromContent` 실행(harness override는 `{...base, ...}` 패턴).
- **register clause** 재사용(이미 record). recolor 전용 리뷰 렌즈는 review-tasks에 1항목 추가.

## SOLID-GRASP first-pass

- OCP/Rule 6: operation→route = record, target = 전략, tone/mode = record. 신규 = 항목 하나.
- SRP: 분류 / 플래닝 / 타깃해소 / 톤컨텍스트 / task조립 / 칩UX / 설정 분리.
- DIP: weave↔서버 = `AgentEvent`·`SubmitOptions.intent`·`IntentPlan` 계약 의존. deps-guard 유지.
- Information Expert: weave가 뷰-상태 톤(`design.tone`) 소유, 서버가 분류+pass 소유.
- Protected Variations: 분류 위치가 `intentSource` 뒤로 교체. client 라우팅은 서버 무변경에서 동작.

## 검증 계획 (SVL 게이트 — 구현 시)

- 단위: `INTENT_ROUTES` 커버리지(모든 op 라우트 보유) · target 리졸버 · 휴리스틱 분류기 ·
  `intentSource` 모드 분기(client=서버분류 생략, off=현재경로) · deps-guard(분류기/라우트가 concrete UI 비-import).
- e2e `aku-intent.spec.ts`: 각 의도가 의도된 러너/지시문으로 라우팅 · 보정칩 교정이 재라우팅 ·
  `off`가 현재 동작 보존 · `client` 모드가 서버 분류 턴 없이 동작 · 모든 편집 Cmd+Z 회귀.

## 단계화 (구현 시 — 본 사이클 외)

- **Phase 1 (클라이언트 선착륙):** `intentSource: client|off` + 명시 슬래시/칩 + 클라 task 증강 +
  `design.tone` 툴. 서버 무변경. 오분류 0(명시), 데모 가능.
- **Phase 2 (+서버 자동):** `server` 모드 + `withIntentRouting` 분류 턴 + additive intent 이벤트 + 보정칩.
- **Phase 3 (확장):** 툴-스코프 하드 가드(과편집 차단, RISK-012 R2) · 지칭 디스앰비규에이션 ·
  recolor 전용 리뷰 렌즈.

## Phase 1 구현 완료 (2026-06-08)

클라이언트 선착륙 슬라이스 구현 — **서버 무변경**으로 동작.

**추가 파일** (`apps/web/src/features/aku/agent/intent/`):
- `types.ts` — Operation/Target/TonePolicy/IntentPlan + 라벨 레코드 + `describeIntent`.
- `classifier.ts` — 휴리스틱 분류기(우선순위 규칙 리스트) + `intentFromOperation`/`resolveTarget`/`withOperation`.
- `routes.ts` — `INTENT_ROUTES` 레지스트리(operation별 지시문 + 톤 컨텍스트 정책).
- `tone-profile.ts` — 문서에서 덱 톤/팔레트 추출(`deckToneLine`/`currentPaletteLine`) — 클라 측 `design.tone` 대체.
- `compose-intent-task.ts` — plan+doc → task 증강 블록.
- `classifier.test.ts`(17) + `routing.test.ts`(13) — 단위 30건.

**기존 파일 변경:**
- `aku-settings.ts` — `intentSource`(server/client/off, 기본 client) + `showIntentChip` + 옵션/섹션.
- `AkuSettingsMenu.tsx` — 의도 인식 위치 세그먼트 컨트롤(`data-testid=aku-intent-source`).
- `use-aku-agent.ts` — runTurn 의도 분류·라우팅(task 증강), `send.opts.intent/intentOp`, `correctIntent`.
- `AkuComposer.tsx` — 명시 의도 슬래시(`/수정 /추가 /교체 /삭제 /팔레트 /톤맞춤`) + 대기-의도 칩.
- `MessageList.tsx` — 어시스턴트 턴의 보정칩(`IntentChip`, 최신·정착 턴은 operation 교정 가능).
- `AkuPanel.tsx` / `AkuAssistant.tsx` — `onCorrectIntent` 배선.
- `types.ts` — `AkuAssistantMessage.intent`.

**모드 동작(Phase 1):** client=브라우저 분류+task 증강(서버 분류 생략) · server=서버 위임(Phase 2 전엔 현재 경로) · off=단일 경로. 명시 슬래시/칩은 모드와 무관히 분류 생략.

**검증(SVL 게이트 — 전부 green):** typecheck 0 · biome lint clean · declarativecheck(Rule 6) OK · 단위 144(아쿠 전체, 신규 30 포함) · vite build OK · e2e `aku-intent.spec.ts` 3건 실제 Chromium 통과(설정 컨트롤 · 슬래시→대기칩 · persisted 보정칩→옵션). 대화형 "전송→분류칩→교정 재실행"은 에이전트 서버 의존이라 server-dependent 스위트로 분리.

## Phase 2 + 2b 완료 (2026-06-08) — 서버 pass 라우팅 + 와이어

**Phase 2 (small-think 서버, WI-033/DR-051):** operation별 리뷰 pass 오버라이드 — 클라가 못 하는
서버 고유 레버. `@small-think/design` `INTENT_PASS_OVERRIDES`(recolor=substantive/critique/prune/reflow
OFF 등) + `classifyEditIntent` + `applyIntentToHarness` + `DesignTaskOptions.harnessOverride`.
agent-server api/byo-apikey 러너가 `SMALL_THINK_INTENT_ROUTING=1`(기본 OFF)일 때 적용.

**Phase 2b (와이어):** `@small-think/contracts` additive `intent` AgentEvent(+reduceAgentState no-op) +
`@small-think/client` `SubmitOptions.intent` + 서버 `TaskRequest.intent`/`intentOf`/명시 honor/이벤트 emit.
**client-only 재vendor 숏컷**(client 0.1.2→0.1.3): agent-client가 `@small-think/client`를 external로
by-ref re-export하므로 client tgz만 재vendor(재빌드 불필요). weave override 2곳 갱신 + `pnpm install`(클린 +1 -1).
weave `use-aku-agent.ts`: `intentSource==="server"`면 `submit({intent:{operation}})` 전송 — 클라 분류는
지시문+칩에 계속 사용(서버=pass, 클라=지시문 상보).

**검증:** small-think typecheck(contracts/client/design/agent-server)·Rule6·purity·lint·단위 162(신규
intent 11+intentOf 2) green. weave typecheck·lint·단위 144·build·e2e 3(Chromium) green.

**남음:** byo-ssh(headless) 경로 라우팅 · LLM 분류(시임 `classifyEditIntent`) · weave가 서버 `intent`
이벤트를 칩에 반영(현재 클라 분류 칩이 이미 표시) · 라이브 end-to-end(서버 플래그 ON + 실 연결, server-dependent).
P2b D21 보강은 DECISION_LOG 참조.
