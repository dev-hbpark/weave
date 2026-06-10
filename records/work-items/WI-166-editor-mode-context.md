# WI-166 — EditorModeContext: 모드별 정책 합성 아키텍처 (설계)

- **Status**: IN PROGRESS — P1 완료 (2026-06-10), P2-P5 대기
- **Date**: 2026-06-10
- **Decision Record**: DR-114
- **Engineering Plan**: features/editor-mode-context/ENGINEERING_PLAN.md
- **Origin**: 사용자 요청 6건 —
  1. 프레젠테이션 모드에서 페이지 내부 아이템은 원제스처 선택+이동(첫 번째
     자식처럼). 단, 모드별 분기 누적이 아니라 **모드별 컨텍스트 합성 +
     다형성 조각**으로.
  2. 인풋 상태머신의 상태 구성과 한페이지/무한캔버스 **뷰** 역시 에디터 모드
     컨텍스트 구성에 따라 세팅.
  3. **하단 패널도 선언적으로** — 믹스드는 새 페이지 추가 불필요,
     프레젠테이션은 페이지 외 프레임·슬라이드 토글·눈동자 불필요.
  4. **성장 전제** — 지금 규칙은 일부일 뿐, 속성이 계속 늘어나며
     disabled(coming-soon) 모드들의 예상 모습까지 감안한 구조.
  5. **의존성 주입** — 모드별 구현체를 조립해 주입, 내부 구현은
     인터페이스만으로.

## Scope

- `EditorModeContext` = view / camera / input / hit / roles / insertion /
  rail 7개 정책(열린 집합)의 합성체. `EDITOR_MODES` 레지스트리
  (**DocFlavor당** 합성 파일 1개, 순수 정적 record — refs 없음)가 유일한
  모드 진실 원천. 소비처는 `types.ts` 인터페이스만 import(빌드-그래프
  게이트), 주입은 컴포지션 루트(Provider/`editorModeFor`)에서 수동으로 —
  상세는 DR-114 v2 (§2b 주입 모델, §6 성장 규칙 G1-G6, §7 disabled flavor
  예상 모습 스트레스 테스트).
- FORMAT_EDITOR_CONFIG는 레지스트리로 완전 해소(P2에서 파일 삭제).
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

## P1 구현 (2026-06-10)

- 골격: `apps/web/src/document/editor-mode/` — `types.ts`(소비처 유일
  import 표면: CanvasMode/ItemRole/ItemCapabilities 9필드/RolePolicy/
  `capabilityOf`/EditorModeContext), `pieces/item-roles.ts`(everyItemIsElement
  / rootDirectIsStage + ELEMENT/STAGE capabilities), `modes/{mixed,slide-deck,
  canvas-board,doc-page}.ts`(합성만), `registry.ts`(EDITOR_MODES +
  `editorModeFor`, mixed 폴백), `EditorModeProvider.tsx`(유일 React 파일).
- `EditorModeContext`는 P1에서 `mode`+`roles` 키만 — 나머지 정책 키는
  소비처와 **같은 변경**에서 REQUIRED로 추가(P2 view/camera/insertion/rail,
  P3 hit, P4 input). 소비처 없는 스텁은 G5가 금지하는 이중 진실 원천.
- 경계 게이트: `tools/check_editor_mode_boundary.sh`(+`.editor-mode-roots`
  allowlist) — 소비처는 types.ts만 / registry·Provider는 합성 루트만 /
  editor-mode 내부 React 금지. `pnpm modeboundarycheck`로 gates/verify에 편입.
  음성 테스트(위반 프로브 2건 검출) 후 clean.
- 술어 흡수 + 디커미션: DesignPage `isArtboardId` 콜백+`artboardIds` memo →
  `itemCapability()`+`hoverSuppressedIds`(roleOf 스캔), FrameStage 로컬
  isArtboardId → `roles` prop + `itemCapability()`(movable/rotatable/resizable
  게이트), NestedFrame isArtboard → `capabilityOf`(selectable/canvasHandles),
  hover projector `artboardIds` 입력 → `hoverSuppressedIds` 리네임(프로젝터는
  정책이 아닌 데이터를 받는 순수 함수 유지). 코드에서 isArtboardId/artboardIds
  잔존 0 (grep 확인).
- **에지 통일(문서화)**: 구 FrameStage isArtboardId는
  `visibleFrameIdsRef.current !== undefined` 키잉, 구 DesignPage는 flavor
  키잉 — 빈 presentationOrder slide-deck 에지에서 이미 서로 불일치했다.
  통일된 RolePolicy는 DR-114 승인 설계(page-bounded면 root-직계=stage,
  무조건)를 따른다. 해당 에지에서 구 FrameStage 동작과 다를 수 있으나
  이는 두 진실 원천의 모순 해소이며 승인된 설계 쪽으로 수렴.

## Verification

- P1 게이트 전수 green (2026-06-10): tsc --noEmit / vitest 989 pass
  (RolePolicy 단위 8 tests — 레지스트리 전수성, FORMAT_EDITOR_CONFIG mode
  패리티, 폴백, roleOf per flavor, STAGE caps=WI-163/164 게이트, fake-policy
  주입 DI 증명 포함) / tokencheck·declarativecheck·puritycheck·
  inheritancecheck·**modeboundarycheck(신규)** / biome clean.
- e2e (apps/web cwd): page-artboard·mode-gate-hardening·frame-handles·
  hover-affordance·peek-mode → 20 passed, 4 failed = 기지 pre-existing red
  4건과 정확히 일치(frame-handles:32, hover-affordance:58/:87,
  mode-gate-hardening:110 — 배너 오버랩). 악화 없음 → P1 합격 기준
  "행동 변화 0" 충족.

## Verification (설계 단계)

- 설계 단계 — 코드 변경 없음. 게이트·e2e 계획은 ENGINEERING_PLAN 각 phase에
  명시(무회귀 phase는 기존 e2e green이 증명, 행동 변경 3건은 신규 e2e 고정).

## Next

P2 — ViewPolicy/CameraPolicy/RailPolicy/InsertionPolicy 도입 +
FORMAT_EDITOR_CONFIG 해소(파일 삭제) + 레일 행동 변경 2건(신규 e2e 고정).
