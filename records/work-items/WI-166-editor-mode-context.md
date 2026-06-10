# WI-166 — EditorModeContext: 모드별 정책 합성 아키텍처 (설계)

- **Status**: DESIGN APPROVED PENDING — 설계 산출물 완료, 구현 P1-P5 미착수
- **Date**: 2026-06-10
- **Decision Record**: DR-114
- **Engineering Plan**: features/editor-mode-context/ENGINEERING_PLAN.md
- **Origin**: 사용자 요청 3건 —
  1. 프레젠테이션 모드에서 페이지 내부 아이템은 원제스처 선택+이동(첫 번째
     자식처럼). 단, 모드별 분기 누적이 아니라 **모드별 컨텍스트 합성 +
     다형성 조각**으로.
  2. 인풋 상태머신의 상태 구성과 한페이지/무한캔버스 **뷰** 역시 에디터 모드
     컨텍스트 구성에 따라 세팅.
  3. **하단 패널도 선언적으로** — 믹스드는 새 페이지 추가 불필요,
     프레젠테이션은 페이지 외 프레임·슬라이드 토글·눈동자 불필요.

## Scope

- `EditorModeContext` = view / camera / input / hit / roles / insertion /
  rail 7개 정책의 합성체. `EDITOR_MODES` 레지스트리(모드당 합성 파일 1개)가
  유일한 모드 진실 원천 — 상세는 DR-114.
- 행동 변경 3건 포함: (P2) mixed 레일 addPage 제거 + page-bounded 레일
  non-slide/토글/눈동자 제거, (P3) page-bounded 원제스처 선택+이동.
  P1·P4는 행동 동일 리팩토링.
- 디커미션: `infiniteCanvas` prop(~20+), `isArtboardId`/`artboardIds` 산재
  술어, `visibleFrameIds !== undefined` 키잉, FORMAT_EDITOR_CONFIG
  `defaultContainer` — 각 phase의 같은 변경에서 제거.

## 설계 근거 조사 (이 세션에서 실측)

- 클릭 선택(selectFromHit parent-first) vs 드래그 이동(resolveTarget
  deepest→climbToMovable) 비대칭 확인 — HitPolicy 통합 지점.
- `commitFrame`의 `moveSelectionSessionRef`(제스처당 1회 선택-follows-move)
  확인 — move-target만 parent-first로 바꾸면 원제스처 선택+이동 성립.
- interaction-mode.tsx 단일 토큰 FSM + allowed-gate 하드코딩 4종 확인 —
  FSM 포크 없이 InputPolicy 구성 주입으로 충분.
- ThumbnailPanel은 optional-prop 슬롯 구조라 RailPolicy를 몰라도 됨 —
  호출부(DesignPage)가 정책을 읽어 prop을 채움/비움.
- 모드 분기 전수 지도: DesignPage ~20(infiniteCanvas) + ~15(isArtboard 계열),
  FrameStage 4+카메라/패딩/팬/컬링, NestedFrame 2, hover projector 7,
  selection-context 6, 레일 prop 삼항.

## Verification

- 설계 단계 — 코드 변경 없음. 게이트·e2e 계획은 ENGINEERING_PLAN 각 phase에
  명시(무회귀 phase는 기존 e2e green이 증명, 행동 변경 3건은 신규 e2e 고정).

## Next

사용자 승인 시 P1(RolePolicy)부터 착수.
