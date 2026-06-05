# FR-020 — Aku expressive state layer (작업상태 표정 · 말풍선 · 스프라이트)

- **Date:** 2026-06-06 · **WI:** WI-103 · **Decision:** DR-070
- **Verdict:** **FEASIBLE WITH TRADE-OFFS**

## Question

아쿠 캐릭터를 고도화해 (1) **편집 영역에서 지금 무슨 작업을 하는지** 캐릭터로
표시하고, (2) 재미있는 문구를 **말풍선**으로 띄우며, (3) **스프라이트 애니메이션**으로
움직임을 표현할 수 있는가? 현재 자산(정적 PNG `<img>` + CSS `aku-bob`)과 workspace
규율(transform-only / reduced-motion / 라이브러리 게이트 / 안티-Clippy)을 지키면서,
**새 데이터 파이프라인이나 무거운 의존성 없이** 도달 가능한가?

## Assessment — "작업 상태" 신호는 이미 존재한다

핵심 발견: *"무슨 작업 중인지"를 아는 데이터는 이미 흐르고 있고, 패널 안 텍스트
캡션으로만 소비되고 있다.* 고도화의 본질은 **새 신호 생성이 아니라 기존 신호를
캐릭터 표현으로 끌어올리는 것**이다 → 데이터 비용이 거의 없다.

- `@agocraft/agent-client`의 `AgentRunState`가 턴 phase를 이미 노출:
  `thinking` / `streaming-text` / `tool-calling` / `applying` / `queued`, 그리고
  `activeTools[].status === "running"` + 각 툴의 **self-caption**("배경색 변경 적용 중…").
  `use-aku-agent.ts:180 activityFor(st)`가 이를 한국어 캡션으로 매핑 중
  (생각 중… / 정리 중… / 편집 적용 중… / 연결 중…).
- 연결 lifecycle은 별도 상태로 존재: `connecting / open / reconnecting / closed / error`
  (small-think DR-010), `AkuStatus = "idle" | "streaming"`.
- 선택/문서 컨텍스트도 이미 ref로 살아있음(`getSelection()` / `getDocument()`) →
  "시선 추적"·"선택 N개" 류 표현의 입력이 이미 준비됨.

즉 표정/말풍선/모션은 **이 상태머신을 구독(subscribe)** 하기만 하면 된다.
producer(에이전트 훅)는 그대로, consumer(표현 레이어)만 추가 — workspace의
"producer는 동기 emit, consumer가 스케줄 선택" 원칙과 정확히 일치.

## Rendering tech — 4안 비교

| 안 | 표현 한계 | 의존성/번들 | 자산 요구 | RPR(렌더 비용) | 상태머신 적합도 |
|---|---|---|---|---|---|
| **A. 스프라이트 시트 + CSS `steps()`** | 이산 포즈(눈깜빡·입·표정 N종) | **0 (no lib)** | 프레임 시트 PNG | `background-position`=paint, 소형·저FPS면 무시할 수준 | 보통(상태당 시트/구간) |
| **B. Lottie** (`lottie-web`/dotLottie) | 부드러운 벡터, 마커 구간 | ~250KB+/WASM, tree-shake 취약 | AE/LottieFiles `.json/.lottie` | canvas 렌더면 격리 paint | 좋음(마커→구간) |
| **C. Rive** (`@rive-app/canvas`) | 최상, **입력→상태머신** | WASM + 수백KB | `.riv` + Rive 툴링/디자이너 | 자체 canvas, GPU, 격리 | **최상(개념적 1:1)** |
| **D. 레이어 PNG + transform 합성** | 중간(눈/팔 분리 transform) | **0 (no lib)** | 레이어 분리 PNG | **transform-only, RPR 최순수** | 보통 |

### 현실 제약 (선택을 좌우)

- **자산이 없다.** 오늘 있는 건 placeholder PNG 2종뿐이며, 최종 마스코트 리디자인은
  아직 진행 중(`MASCOT.md`, DR-design-024). Lottie/Rive를 authoring할 파이프라인·
  디자이너 산출물이 없음 → B/C는 자산 의존성이 즉시 블로커.
- **라이브러리 게이트**(루트 CLAUDE.md): 신규 의존성은 ESM·`sideEffects:false`·
  no-reflect-metadata 3관문 + `library-adoption-review` 필요. B는 tree-shaking 취약,
  C는 WASM — 둘 다 게이트 통과에 별도 라운드가 필요.
- **transform-only / reduced-motion**은 하드 게이트. 모든 안이 reduced-motion에서
  정지 프레임으로 폴백 가능(공통 충족).

### 결정을 가능케 하는 핵심 분리

표현의 **load-bearing 자산은 렌더 기술이 아니라 "상태→표정 매핑 레지스트리"** 다.
이 매핑은 어떤 렌더러를 쓰든 동일하다. 따라서 `AkuTransport`(Strategy/DIP) 선례처럼
**`AkuExpressionRenderer` 시임**으로 렌더 기술을 추상화하면:
지금은 의존성 0의 CSS 렌더러로 가치를 내보내고, 나중에 Rive로 **상태 레이어 변경 없이**
업그레이드할 수 있다. → B/C를 "지금 도입"이 아니라 "나중 교체 가능"으로 미룰 수 있게 됨.

## Trade-offs (DR-070에서 수용)

1. **Phase 1 표현 풍부도 상한** = CSS transform + 선택적 스프라이트 프레임. 진짜 유체
   캐릭터 애니메이션은 Phase 2(Rive)로 이연.
2. **자산 의존성.** placeholder 단일 PNG로는 Phase 1이 *기존 이미지의 transform 모션*
   (squash/stretch·tilt·bob 변주·시선) + (눈을 슬라이스하면) 깜빡임까지로 한정.
   상태별 포즈 아트(스프라이트 시트)는 design-team 의존 → DR-design-024 마스코트
   리디자인에 **expression sheet 요구를 합류**시켜 해결.
3. **스프라이트는 paint다.** `background-position` 애니메이션은 compositor 가속이 아님.
   완화: 소형(≤128px)·저FPS(`steps(n)` 8–12fps)·`contain:paint`·연속 모션은 transform로,
   이산 프레임만 시트로. `rendering-performance-review` 대상.
4. **말풍선 빈도.** 능동 말풍선(재미 문구)은 기존 `useAkuTips` 쿨다운/영구끄기 가드 안에서만.
   작업상태 캡션 버블은 턴 lifetime에 묶여(스트리밍 중에만) Clippy화하지 않음.

## Verdict rationale

세 요청 모두 — 작업상태 표시·말풍선·스프라이트 — 기존 상태머신 구독 + 의존성 0의
CSS 렌더러로 **지금 도달 가능**(FEASIBLE). 단 (a) 풍부한 캐릭터 애니메이션의 천장과
(b) 상태별 포즈 아트는 각각 Rive 이연과 design-team 자산에 의존하므로
**WITH TRADE-OFFS**. 렌더러 시임으로 두 트레이드오프를 미래로 안전하게 이연한다.

→ **Phase 1 (WI-103): 의존성 0 — CSS 스프라이트(`steps()`) + transform 표현 레이어 +
상태→표정 레지스트리 + 렌더러 시임.** Phase 2 (deferred): Rive, `library-adoption-review`
+ 실제 `.riv` 자산 + 디자이너 파이프라인을 하드 게이트로.
