# DR-070 — Aku expressive state layer: renderer seam + state→expression registry

- **Date:** 2026-06-06 · **Status:** Accepted · **WI:** WI-103 · **FR:** FR-020
- **Relates:** WI-052/DR-design-023 (Aku chat), DR-design-024 (Aku v2 + mascot
  redesign, in flight), small-think DR-010 (connection lifecycle separate from turn
  status), RPR principles (transform-only), 루트 CLAUDE.md Rule 6 (no switch on kind)
- **Operator directive (2026-06-06):** 아쿠를 고도화 — 편집 중 무슨 작업을 하는지
  캐릭터로 표시, 재미있는 문구를 말풍선으로, 스프라이트 애니메이션으로 움직임 표현.

## Context

아쿠는 현재 정적 PNG(`AkuMascot` `<img>`) + CSS `aku-bob`(translateY transform) 뿐.
하지만 에이전트 턴 상태(`AgentRunState`: thinking/streaming-text/tool-calling/applying/
queued + `activeTools[].caption`)와 연결 lifecycle은 이미 `use-aku-agent.ts`에서
완전히 흐르고 있고, `activityFor()`가 한국어 캡션으로 매핑 중 — **표현에 필요한
데이터는 이미 존재**(FR-020). 말풍선 인프라(`AkuTipBubble` Radix Popover + `useAkuTips`
안티-Clippy 가드)도 이미 있음.

## Decision

### D1 — 렌더 기술: Phase 1 = 의존성 0 (CSS 스프라이트 `steps()` + transform). Rive는 이연.

FR-020 4안 비교 결과. Lottie/Rive는 표현 천장이 높지만 (a) 오늘 `.riv`/`.lottie` 자산도
디자이너 파이프라인도 없고 (b) `library-adoption-review` + WASM/tree-shake 게이트가
별도로 필요 → **지금 도입 불가**. Phase 1은 **새 의존성 0**으로:
- **연속 모션**(bob 변주·tilt·squash/stretch·시선)은 **transform-only** (compositor-cheap, RPR-순수).
- **이산 포즈**(눈 깜빡임·입·표정 N종)는 **스프라이트 시트 + CSS `steps(n)`**
  (`background-position`, 소형·저FPS로 paint 비용 무시 수준).
- 사용자가 명시한 "스프라이트 애니메이션" 요구를 직접 충족하면서 게이트를 우회.

### D2 — `AkuExpressionRenderer` Strategy 시임 (DIP). 렌더 기술을 추상화.

`AkuTransport` 선례와 동일한 패턴. 표현 레이어는 **인터페이스에만 의존**:
```ts
interface AkuExpressionRenderer {
  render(mood: AkuMood, intensity: number, look?: {dx:number; dy:number}): JSX.Element;
}
// Phase 1: createCssSpriteRenderer()   (no dep)
// Phase 2: createRiveRenderer()        (deferred, gated)
```
→ Rive 업그레이드 시 **상태→표정 레지스트리·구독 훅을 한 줄도 바꾸지 않는다**
(Protected Variations). FR-020의 트레이드오프 1·2를 미래로 안전 이연.

### D3 — 상태→표정은 **레지스트리**, switch 금지 (Rule 6).

load-bearing 자산은 렌더 기술이 아니라 **상태→`AkuMood` 매핑**. 이건 렌더러와 독립.
```ts
type AkuMood = "idle" | "thinking" | "working" | "finalizing"
             | "celebrating" | "confused" | "sleeping" | "looking";
// resolveAkuMood(runState, connState, selection): AkuMood
// — Map/ordered-rule resolver, NEVER a switch on phase string.
```
- `thinking` ← phase==="thinking" · `working` ← tool-calling/applying(+활성 툴 caption) ·
  `finalizing` ← streaming-text · `confused` ← error/closed · `sleeping` ← 장시간 idle ·
  `celebrating` ← 큰 작업 완료 1회성 · `looking` ← idle + 선택 변화(시선).
- 우선순위 있는 규칙 테이블(첫 매치) — phase 추가 시 행 하나 추가(OCP).

### D4 — producer 불변, consumer만 추가 (구독 모델).

`use-aku-agent.ts`는 그대로. 새 `useAkuExpression(getRunState, getConn, getSelection)`
훅이 **구독**해서 mood를 파생 — 새 데이터 파이프라인 없음(Information Expert: 상태는
에이전트 훅이 소유, 표현은 소비자). consumer가 자기 스케줄(RAF/transition) 선택.

### D5 — 말풍선 2종 분리: "작업 캡션 버블"(턴-바운드) vs "재미 문구 버블"(가드).

- **작업 캡션 버블**: `activityFor()` 캡션을 캐릭터 위 말풍선으로 — **스트리밍 중에만**
  표시(턴 lifetime에 묶임) → 빈도 자연 제한, Clippy 아님. 패널 닫혀 있어도 "일하는 중" 인지.
- **재미 문구 버블**: mood→문구 레지스트리. **반드시 기존 `useAkuTips` 쿨다운/영구끄기
  가드 재사용**(7s 유휴·4h 쿨다운·off 플래그). 빈도 상향 금지 — 이게 성패 지점(FR-020 T4).

### D6 — Design System Triage = **escape (feature-local)**.

아쿠는 재사용 UI primitive가 아니라 **브랜드 자산**(WI-052 선례). 표현 레이어·스프라이트
CSS·mood 레지스트리는 전부 `apps/web/src/features/aku/` + `main.css`의 aku 블록 안.
`@weave/design-system` 오염 없음 → 신규 primitive/token/theme 없음 → 디자인 리뷰 불요.
단 **상태별 포즈 아트(스프라이트 시트) 자산 요구는 DR-design-024(마스코트 리디자인)에
합류** — placeholder 단일 PNG로는 Phase 1이 transform 모션 + (눈 슬라이스 시)깜빡임으로 한정.

## Consequences

- (+) 세 요청 즉시 충족, 의존성 0, 기존 상태머신 재사용으로 코드 변경 작음.
- (+) Rive 업그레이드 경로가 시임으로 열려 있음 — 미래 결정을 막지 않음.
- (+) reduced-motion: 모든 모션은 정지 프레임 폴백(기존 `aku-bob` 패턴 확장).
- (−) Phase 1 표현 풍부도는 CSS 한계 + placeholder 자산에 묶임(FR-020 T1/T2 수용).
- (−) 스프라이트 시트의 진짜 가치(다포즈 표정)는 design-team 자산 도착 전까지 부분적.
- **이연(Phase 2, 별도 WI + 게이트):** Rive 렌더러, 실제 `.riv` 자산, 셀러브레이션
  파티클, 시간대 인사 등 추가 위트. `library-adoption-review`가 하드 게이트.
