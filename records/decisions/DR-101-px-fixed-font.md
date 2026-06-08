# DR-101 — 폰트 크기 px 고정 (px→ratio 그라운딩 폐지)

- 상태: ACCEPTED
- 날짜: 2026-06-08
- supersedes: [DR-091](DR-091-agent-font-size-grounding.md) (px→ratio 그라운딩)
- 관련: DR-082(ratio>1 px 재태깅 가드, 유지), DR-093(fontSizeSpec 단일 진실, 유지), WI-145/146(auto-height)
- 트리거: 사용자 — "프레임 리사이즈 순간 텍스트가 점점 작아진다 / 레이어에 의한 크기 보정 같다"

## 근본 원인

`resolveFontSize`: **ratio 폰트 px = ratio × 부모프레임 높이px**(`ParentFrameHeightContext`). DR-091이
에이전트 px를 ratio로 그라운딩해 "반응형"으로 만들었으나, **프레임 높이에 결합**되어:
- 수동으로 프레임을 리사이즈하면 그 안 텍스트가 비례해 재배율(사용자 보고: "점점 작아짐", 놓으면 멈춤 =
  루프 아님, 결합).
- 중첩/레이아웃 변경 시에도 의도치 않게 크기가 변함.
- `weave.batch`는 그라운딩 우회 → px/ratio 혼재(같은 슬라이드에 고정 px 카드 + 결합 ratio 사이드바).

슬라이드 에디터에선 **px 고정**(전체 캔버스 zoom으로만 스케일)이 예측 가능하고 사용자 기대(Figma류:
박스 리사이즈가 폰트를 안 바꿈)와 일치.

## 결정

1. **폰트는 fixed design-px가 표준.** 에이전트 px→ratio 그라운딩(`groundAgentFontSize`) **제거**(데코미션):
   에이전트가 낸 px가 리터럴로 유지 → 리사이즈/중첩에서 재배율 없음. (item.add/update가 batch와 동일하게
   px 유지 → px/ratio 혼재 해소.)
2. **렌더는 ratio도 계속 지원**(하위호환·기존 문서). 단 에이전트 가이드는 px를 권장, ratio는 "리사이즈에
   재배율됨, 비권장"으로 명시.
3. **WI-146 B(`a.frame.height` 재보정 트리거) 되돌림**: 리사이즈 중 매 프레임 measureCommit이 발화해
   제스처와 간섭. 에이전트 생성 정착은 **B-2(라운드 종료 펄스)**가 담당하므로 height 트리거 불필요.
4. **유지**: DR-082(ratio>1→px 가드), DR-093(fontSizeSpec 단일 진실), auto-height(박스 높이; 폰트와 무관),
   B-2 라운드 종료 펄스, WI-147 min-size 가드.

## Touch points

`use-aku-agent.ts`(transformInput에서 grounding 제거) · `agent-font-grounding.ts`+test 삭제 ·
`TextBlock.tsx`(reconcile deps에서 a.frame.height 제거) · capabilities/command-schemas 가이드(px 고정) ·
layout-text-autoheight e2e(B 의존 테스트 제거).

## 트레이드오프 / 결과

- (+) 프레임 리사이즈가 폰트를 안 바꿈 — 사용자 기대와 일치, 리사이즈 축소 사고 해소.
- (+) px/ratio 혼재 해소(모두 px) → 일관·예측 가능. 본문 최소치 가이드가 리터럴 px에 직접 적용돼 더 효과적.
- (−) DR-091의 "중첩 프레임 자동 반응형" 이점 상실(의도된 트레이드오프 — 안정성 우선).
- (−) **기존 ratio 문서**는 렌더는 되나 px-고정 이점은 재생성 전까지 없음(데이터 마이그레이션은 위험해
  미실시 — 필요 시 별도 작업으로 ratio→px 정규화).

## 검증

typecheck·biome 클린, 단위 233(commands 124 + agent/selection 등), agent-font-grounding 테스트는 모듈과
함께 데코미션. layout-text-autoheight e2e 2/2(B 제거 후에도 auto-height 정상). 실환경 재생성으로 폰트
고정·리사이즈 무변 최종 확인 권장.
