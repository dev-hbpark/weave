# DR-077 — Aku 디자인 다양성: 닫힌 톤 카탈로그 → 축 registry + 톤-내 변주 + 수렴 가드

- **Date:** 2026-06-06 · **Status:** Accepted · **WI:** WI-112 · **FR:** 인라인(아래 Feasibility)
- **Relates:** DR-070(expressive state layer), `aku-styles.ts`(AKU_STYLES/COMMIT_TAIL),
  `aku-settings.ts`(creativity→temperature), `use-aku-agent.ts:537-575`(task 빌더),
  small-think `packages/design`(review-pipeline·profiles·personalization),
  루트 CLAUDE.md Rule 6(no switch on kind) · Core Eng(producer 무수정·DIP 시임)
- **Operator directive (2026-06-06):** 타이틀·배경 영역을 강화된 디자인 톤/테마
  추천으로 꾸며도 다양한 디자인이 안 나온다 — 다양성을 더 강화할 방법.

## Context

다양성이 죽는 원인은 추천 레이어가 아니라 **생성 파이프라인의 천장**이다(WI-112 근거):
(1) 톤이 닫힌 7-리스트이고 각 톤에 리터럴 hex가 박혀 톤-내 분산이 0,
(2) temperature가 creativity 설정에 1:1 고정 — 같은 톤이면 입력·샘플링이 모두 동일,
(3) small-think review 파이프라인이 모든 출력을 "절제된 올바른 디자인"으로 다림질.
주석(`aku-styles.ts:3-7`)이 "입력을 바꿔라(VARY THE INPUT)"고 하지만, 실제로는 톤
블록 한 줄만 교체하고 그 *안*은 고정이라 같은 톤에서 입력 변주가 없다.

**Feasibility (인라인): FEASIBLE.** 새 모델·새 능력 불요 — 이미 검증된 변주 메커니즘
(톤 주입 + temperature)을 한 단계 아래로 내려 확장하는 것. 서버 샘플링이 고정이라는
제약은 입력 다양화로 우회 가능(현 설계의 전제와 동일). 트레이드오프는 합성기 복잡도와
큐레이션 품질 관리(아래 Consequences).

## Decision

핵심: **닫힌 톤 카탈로그를 독립 축들의 registry로 분해**(천장 ↑)하고, **팔레트를
고정값에서 생성 규칙으로** 바꾸고, **분산을 per-request로** 내리고, **수렴 파이프라인이
의도적 quirk를 깎지 않게** 막고, **다양성을 수치로 측정**한다. producer(에이전트 서버)
무수정 — 변경은 task 빌더와 small-think 프롬프트 메타에만.

### D1 — 톤을 닫힌 7-리스트 → 축(axis) registry로 분해. (천장 7 → 곱집합)

`AKU_STYLES`(단일 prompt 문자열)를 독립 축 registry로:
`PaletteAxis · TypographyAxis · LayoutAxis · DecorAxis · ShapeAxis`.
각 축 = `ReadonlyArray<{ id; label; prompt }>`(한 축 = 한 파일). 합성기
`composeToneTask(picks)`가 fragment를 조립해 `[디자인 톤]` 블록을 만든다.
**기존 7 named 톤(에디토리얼·볼드·…)은 축 조합의 프리셋으로 보존** — 하위호환 +
큐레이션된 진입점. Rule 6 정합: 축별 registry, `switch (kind)` 없음, 축 추가는 한 파일.
천장이 `|Palette|×|Typo|×|Layout|×|Decor|×|Shape|`로 폭발.

> **DecorAxis가 타이틀·배경 직접 해결.** 장식 *전략*을 별도 축으로:
> gradient / 기하패턴 / 그레인텍스처 / 풀블리드 컬러블록 / 라인워크 / 이미지오버레이.
> 같은 팔레트라도 배경·타이틀 처리가 매번 달라진다.

### D2 — 팔레트를 리터럴 hex → 생성 규칙으로. (톤-내 변주의 원천)

PaletteAxis fragment가 고정 hex 대신 **hue/채도/명도 범위 + 관계**(단색/유사색/보색)
규칙. `COMMIT_TAIL`은 "이 범위에서 *이번* 디자인의 팔레트를 새로 정하라"로 재서술.
구조 텍스트 색은 여전히 `var(--token)`(테마 스위칭 보존). 명시 색이 필요한 큐레이션
프리셋은 "앵커 색 + 변주 허용 범위"(예: 테라코타 ±hue/채도)로 표현해, 정체성은 유지하되
복제는 막는다.

### D3 — per-request 변주 시드 + temperature jitter. (분산을 per-request로)

매 submit에 짧은 **variation 토큰**(세션 누적 카운터 + 축 회전 인덱스 기반; 이 런타임은
`Math.random()`/`Date.now()` 제약이 있으므로 카운터/전달 시드로 결정)을 task에 주입 →
같은 톤이라도 입력이 매번 다름. `temperature`는 creativity base에서 per-request로 약하게
jitter(예: balanced 0.6 ± 0.15, 서버가 0..1 클램프). 설정 한 칸에 고정되던 분산을 요청
단위로 푼다.

### D4 — anti-convergence regenerate. (재생성이 진짜 달라지게)

직전 생성의 축 picks를 ref에 보관하고, "regenerate"는 그 picks를 **배제 리스트**로 넘겨
"직전과 다른 팔레트·레이아웃·장식 축을 쓰라"고 지시. 재생성이 미세 변주가 아니라 다른
방향으로 점프.

### D5 — review 파이프라인의 수렴 압력 완화. (small-think, handoff)

톤 메타(`register` + `intensity`)를 design task와 함께 small-think로 전달. critique/
reduction/layout review가 톤의 *의도적* quirk(고채도·비대칭·과한 여백)를 "교정"하지
않도록 가드. `profiles.ts`의 "RESTRAINED palette" 기본값을 register에 조건화(bold/playful은
절제 가드 해제). **cross-project 변경** → small-think `records/decision-handoffs/`에 handoff
작성, 그쪽 owner가 자체 DR로 수용. weave 측 D1–D4는 이 핸드오프와 독립적으로 진행 가능.

### D6 — 다양성 메트릭 회귀 가드. ("강화했다"를 체감이 아닌 수치로)

같은 입력 N회 생성 → 오프라인 평가 하네스가 측정:
- **색 분산:** 배경·타이틀 영역의 지배색 추출 → 페어와이즈 ΔE(CIEDE2000) 평균/최소.
- **레이아웃 엔트로피:** 정렬·컬럼 수·여백·장식전략을 bucket화한 시그니처의 분포 엔트로피.
임계 미만이면 "수렴"으로 플래그. 서버 샘플링 의존이라 결정론적 CI 게이트는 불가 → **주기
측정**(하네스)으로 운용. 단위 검증은 순수함수에: `composeToneTask`(합성), 배제 로직(D4),
시드 회전(D3).

## Consequences

- (+) 다양성 천장이 7 → 축 곱집합으로 폭발. 같은 톤도 매 생성 변주(D2/D3), 재생성이 진짜
  다름(D4), 배경·타이틀이 장식 축으로 직접 다양화(D1 DecorAxis).
- (+) producer(서버) 무수정 · Rule 6/OCP 정합(축 추가가 한 파일) · 기존 7 톤은 프리셋으로
  하위호환 · `var(--token)` 구조색 유지로 테마 스위칭 보존.
- (+) 다양성이 측정 가능(D6) — 다음 리팩터에서 재수렴해도 잡힘.
- (−) 합성기 복잡도 ↑, 충돌하는 축 조합 가능(예: 미니멀 팔레트 × 과밀 장식) → 프리셋/축
  제약으로 완화, D6로 품질 모니터.
- (−) D5는 small-think 의존(handoff) — weave 단독으론 수렴 파이프라인을 못 푼다. D1–D4만으로도
  체감 개선은 크지만, 파이프라인 다림질의 상한은 D5 수용 후 풀림.
- (−) 평가 하네스(D6) 유지비 + 서버 샘플링 비결정성으로 CI 게이트 아닌 주기 측정.

## Engineering plan (단계)

- **Phase 1 (weave, 의존성 0):** D2(팔레트 규칙화) + D3(시드·jitter). 기존 7 톤 구조를
  유지한 채 톤 *안* 변주 — 가장 빠른 체감, 최소 변경(`aku-styles.ts`·`use-aku-agent.ts`).
- **Phase 2 (weave):** D1(축 registry + 프리셋 재정의) + D4(anti-convergence). 천장 올림.
  `features/aku/agent/`에 축 파일 + `composeToneTask` 합성기 + 순수함수 단위 테스트.
- **Phase 3 (cross):** D5 handoff(small-think) + D6 평가 하네스. 하네스로 Phase 1–2 효과를
  사후 수치 검증.

**구현 상태 (2026-06-06):** Phase 1·2·3 전부 weave에 랜딩(WI-112 참조).
- P1: `aku-styles.ts`(팔레트 계열화 + 변주) → 이후 P2에서 축으로 흡수·폐기.
- P2: `tone-axes.ts`(5축 registry) + `compose-tone.ts`(프리셋·`resolveTonePicks`·D4) +
  `use-aku-agent.ts`/`AkuComposer.tsx` 재배선. `aku-styles.ts` Decommission Sweep.
- P3: D6 `features/aku/diversity/{color-metrics,diversity-metric}.ts`(ΔE00 + 엔트로피);
  D5는 small-think `HANDOFF-024` 발신(응답 대기). aku 피처 97 테스트 + tsc + biome green.

SOLID/GRASP: 축 registry = OCP(축 추가 = 한 파일) · 합성기 = 단일 책임 · Rule 6 준수
(switch 없음) · DIP 시임은 task 빌더 한정 · producer 무수정.

## Verification

- 순수함수 단위: `composeToneTask`(프리셋→블록 round-trip), D4 배제 로직, D3 시드 회전.
- 통합: 설정 조합별 task 문자열 스냅샷(톤 주입/배제/시드 토큰 존재).
- 다양성: D6 오프라인 하네스 N회 수집 → ΔE·엔트로피 리포트(전/후 비교).
- 전체 turn(실제 생성물 다양성)은 서버 샘플링 의존 — 하네스 측정으로 대체.
