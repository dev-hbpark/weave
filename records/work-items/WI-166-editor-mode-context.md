# WI-166 — EditorModeContext: 모드별 정책 합성 아키텍처 (설계)

- **Status**: IN PROGRESS — P1·P2 완료 (2026-06-10), P3-P5 대기
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

## P2 구현 (2026-06-10)

- **정책 4종 추가** (types.ts에 REQUIRED로, 소비처와 같은 변경 — G1/G5):
  - `ViewPolicy` — `visibleFrames(doc, activePageId)`(infinite=undefined 전체,
    page-bounded=Set([activePage]); activePage 없으면 undefined = 빈 덱 매트
    에지 보존) + `pageChrome` + `viewportCulling`.
  - `CameraPolicy` — `fitBox(doc, activePageId, dw, dh)`(page-bounded만
    페이지 박스; pageFitBox 수식은 pages/page-fit.ts에서 pieces/camera.ts로
    **흡수** — document/가 pages/를 import하는 역방향 의존 차단) +
    `clampPan`(현재 전 flavor identity — 함수형 성장 자리, G2) +
    `paddingFactor`(0.9/0.95) + `userZoom`(전 flavor true — page-bounded도
    휠 줌 유지, 기존 동작) + `dragPan`(infinite만 — Space/hand).
  - `InsertionPolicy` — `containerFor(doc, activePageId)`:
    FORMAT_EDITOR_CONFIG.defaultContainer 흡수. use-item-add / DesignPage
    onDropAdd / agent retarget(retargetAgentRootAdd) 3경로 단일 정책 소스.
  - `RailPolicy` — 7필드 표(DR-114 §4): OVERVIEW_RAIL(mixed/canvas-board) vs
    PAGE_LIFECYCLE_RAIL(slide-deck/doc-page). ThumbnailPanel은 정책을 모름 —
    DesignPage가 정책을 읽어 optional prop을 채움/비움("no prop → no
    render") + 신규 `showNonSlideSection` prop(콜백 없는 섹션이라 명시 prop).
- **승인된 행동 변경 2건** (이 WI의 P2 스코프, 신규 e2e로 고정):
  ① mixed/canvas-board 레일 "+"(addPage) 제거 — 오버뷰 레일.
  ② slide-deck/doc-page 레일 non-slide 섹션·슬라이드 토글·눈동자(focus)
  제거 — 페이지 라이프사이클 레일. → `e2e/editor-mode-rail.spec.ts` 2 specs.
- **소비처 치환**: FrameStage props `infiniteCanvas`/`cameraEnabled` →
  `view`+`camera` 정책 주입(패딩/휠/핫키/Space/컬링/매트 전부 정책 키잉;
  휠 팬·줌과 ⌘± 제안은 `clampPan` 래핑, ⌘0 리셋·프로그램적 fit은 정책
  안전 상태라 비클램프; WI-157 page-fit 효과는 docRef로 fire-time 읽기
  유지 — doc 변경이 재fit 트리거하지 않음). DesignPage visibleFrameIds /
  defaultAddContainerId / fitInset / handTool / DesignHeader `panTools` /
  레일 prop 전부 editorMode에서 유도. PresentPage는 `editorModeFor` 직접
  호출(합성 루트 — `.editor-mode-roots` allowlist 등재).
- **디커미션 스윕 (같은 변경에서 삭제)**: `document/format-editor-config.ts`
  + 테스트, `pages/page-fit.ts` + 테스트(수식·테스트는 pieces/camera로
  이주), `infiniteCanvas` prop 전파 사슬(use-hand-tool / use-viewport-culling
  param 리네임 포함). 잔존 grep: 역사 서술 주석만(의도적).

## Verification (P2)

- 게이트 전수 green (2026-06-10): tsc --noEmit / vitest **997 pass (98
  files)** — editor-mode 단위 26(레지스트리+P1 RolePolicy+P2 View/Camera/
  Insertion/Rail 표 + pieces/camera.test.ts pageFitBox·fitActivePage 8) /
  tokencheck·declarativecheck·puritycheck·inheritancecheck·modeboundarycheck /
  biome errors 0 (잔존 warning은 기존 layout-*.spec noNonNullAssertion).
- 신규 e2e `editor-mode-rail.spec.ts` 2 passed (행동 변경 ①② 고정:
  mixed = add-page/duplicate 부재 + 토글/눈동자/non-slide 섹션 동작,
  slide-deck = 토글/눈동자/non-slide 부재 + add/duplicate 존재 + "+" 추가
  시 신규 페이지 활성화).
- e2e 무회귀 판정 (2026-06-10, 이 환경):
  - 비교가능 서브셋 11파일(P1 기준선 5파일 + P2 표면: thumbnail-panel /
    new-design / fit-camera / canvas-pan-backswipe / format-page-noun /
    editor-mode-rail) → **38 passed, 5 failed** = 기지 pre-existing red
    4건 + thumbnail-panel:216(dblclick 카메라 fit) 1건.
  - thumbnail-panel:216은 **pre-P2 베이스라인(46e87a7 워크트리)에서도 동일
    실패** 확인 — setup(prepareDesign) 단계에서 죽으며 dblclick에 도달조차
    안 함. P2 회귀 아님.
  - 전체 스위트는 이 환경에서 다수가 `prepareDesign`의
    `waitForLoadState("networkidle")`에서 타임아웃 — 프로브 실측: vite가
    vendored `@agocraft/sprite-engine` 모듈 `@fs` 요청 2건을 영구 미응답
    (offline 경로). 페이지/에디터는 정상 마운트, 네트워크 루프 없음(온라인
    프로브 inflight 0 안착). 에디터-모드 코드와 무관한 dev-서버/벤더링
    이슈 — 전체 스위트 green은 이 환경의 기준선이 아니다.

## Verification (설계 단계)

- 설계 단계 — 코드 변경 없음. 게이트·e2e 계획은 ENGINEERING_PLAN 각 phase에
  명시(무회귀 phase는 기존 e2e green이 증명, 행동 변경 3건은 신규 e2e 고정).

## Next

P3 — HitPolicy: page-bounded 원제스처 선택+이동(행동 변경 ③, 신규 e2e 고정).
이후 P4 InputPolicy(FSM 게이트 구성 주입), P5 최종 스윕.
