# WI-157 — 카메라 fit-to-active-page (비-FULL_FRAME 페이지)

Status: **Done** — 유닛 4건(전체 938/938) · gates green · SVL 9/9 · e2e 2건(`page-camera-fit.spec.ts`)
Owner: hbpark
Updated: 2026-06-10

관련: [WI-153](WI-153-presentation-page-bounded-editing.md)(P2.4 보류분) · [DR-111](../decisions/DR-111-format-editor-config-and-page-bounds.md) 결정 3(한 페이지 캔버스 + 카메라 락) · 플랜 `features/presentation-page-editing/ENGINEERING_PLAN.md`

## Problem

page-bounded 포맷의 베이스 핏은 **디자인 평면 전체**를 뷰포트(크롬 인셋 제외)에 맞춘다.
FULL_FRAME 페이지는 페이지 박스=디자인 박스라 이 핏이 곧 페이지 핏 — P2에서 충분했다.
그러나 **비-FULL_FRAME 페이지**(예: 툴바 frame 추가로 생긴 작은 top-level 프레임 = 새 슬라이드)로
전환하면 평면 한가운데 작은 페이지가 떠 있는 화면이 된다 — "한 번에 한 페이지" 모델이 깨져 보임.

P2.4에서 보류된 이유: base-fit 수학을 직접 바꾸면 좌표/오버레이 정합 리스크.

## 결정 (베이스 핏 비접촉 — 유저 카메라 레이어에서 fit)

base-fit(`baseScale/baseTx/baseTy`)은 그대로 두고, 이미 존재하는 **유저 카메라 위의 박스 핏**
(`zoomToBox` — thumbnail dblclick/에이전트 카메라와 같은 채널)으로 해결:

1. **`pageFitBox(frame, designW, designH)` 순수 헬퍼** (`src/pages/page-fit.ts`):
   FULL_FRAME(epsilon 비교, rotation 포함) → `undefined`(핏 불필요), 아니면 design-px `DesignBox`.
   `page-clamp.ts`와 같은 "순수 수학 분리 → 유닛 직접 검증" 패턴.
2. **FrameStage 페이지 전환 effect**: page-scoped(visibleFrameIds 단일)일 때 활성 페이지 id가
   바뀌면 — 비-FULL_FRAME이면 `zoomToBox(box, 1)`, FULL_FRAME 복귀이고 **직전 카메라가
   page-fit이었다면** `setPan({0,0,1})`(베이스 복원). FULL→FULL 전환은 카메라 불간섭(유저 줌
   보존 — 기존 동작). 페이지 박스는 ref로 읽어 **페이지 자체 리사이즈 제스처와 싸우지 않음**
   (deps는 페이지 id + stage ready만).
3. **`zoomToBox` 인셋 센터링**: 기존엔 풀 뷰포트 중심으로 센터링 — page-bounded에서 fit 결과가
   헤더/레일 아래로 일부 숨음(P2.5의 fitInset이 base-fit에만 적용). avail 영역(인셋 제외) 기준
   scale + 센터로 보정. 인셋 0(무한 캔버스)이면 수치 동일 → mixed 회귀 0.

스코프 가드: 무한 캔버스는 visibleFrameIds undefined → effect 자체가 무동작.

## 검증 (모두 green)

- 유닛 4건: `pageFitBox` — FULL_FRAME → undefined(epsilon 허용), 비-FULL → px 박스, rotation≠0 → 박스.
- SVL 9/9: 생성 시 베이스 카메라 → small page 전환 scale 4.74 + 페이지 박스 973px(>50% 뷰포트) →
  FULL 복귀 정확히 {0,0,1} → FULL→FULL 플립 유저 줌 1.44 보존 → 줌 상태에서 small 재전환 refit →
  fit top=78.4px(헤더 48px 인셋 준수) → mixed 타일 클릭 카메라 불간섭 → mixed dblclick fit 동작.
- e2e 2건(영구, `e2e/page-camera-fit.spec.ts`): 비-FULL 페이지 활성 → scale>1.5, FULL 복귀 →
  {0,0,1} 복원 / mixed 타일 클릭 카메라 불변.
- 전체 유닛 938/938 · gates green.

## 비고 — 동시 세션

본 작업 중 같은 repo에서 WI-156(delta-persistence) 세션이 동시 진행 중이었음. 파일 단위로
완전 분리(WI-157: FrameStage/page-fit, WI-156: commands/use-weave-editor/DesignPage)라 충돌
없음. 커밋은 WI-157 파일만 스테이징.
