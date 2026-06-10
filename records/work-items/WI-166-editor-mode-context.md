# WI-166 — EditorModeContext: 모드별 정책 합성 아키텍처 (설계)

- **Status**: DONE — P1-P5 전체 완료 (2026-06-10)
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

## P3 구현 (2026-06-10)

- **`HitPolicy` 추가** (types.ts REQUIRED 키, 소비처와 같은 변경 — G1/G5):
  `selectTarget(hitId, doc, HitSelectContext)` /
  `moveTarget(hitId, doc, HitMoveContext)`. `ClickIntent`("plain"/"deep"/
  "toggle")는 interactions/selection-context에서 types.ts로 이주 — 정책
  입력 어휘. 두 ctx 분리: select는 순수 데이터(intent/currentId/
  activePageId), move는 데이터 + **주입 함수 심 2개**(`climbToMovable` =
  agocraft LayoutEngine canMove 클라임, `admit` = RolePolicy.movable ∩
  DR-061 잠금) — 정책은 "어느 아이템"만 결정, 스테이지가 "움직여도 되는가"
  소유권 유지(엔진/잠금 로직이 document/로 새지 않음).
- **`pieces/hit-resolution.ts`**: `parentFirstSelect`(기존 selectFromHit
  알고리즘 원형 이주 — deep/toggle 조기 반환, in-context 드릴, rootId
  기준 parent-first 한 단계 진입) + `deepestMovable`(climb→admit) +
  `parentFirstMovable`(= parentFirstSelect(intent:"plain", currentId) →
  climb→admit — 클릭과 드래그 move-target의 해석 완전 동등, in-context
  드릴 패리티 포함). 합성: `DOC_ROOT_HIT`(mixed/canvas-board: select=
  parentFirst(docRoot), move=deepestMovable — 무회귀) /
  `ACTIVE_PAGE_HIT`(slide-deck/doc-page: select=move=
  parentFirst(activePage)).
- **행동 변경 ③** (DR-114 §3 승인): page-bounded에서 비선택 깊은 자식 위
  드래그 시작 → 페이지 직속 조상이 move target → commitFrame의
  제스처당-1회 선택 전환(WI-019/021, 무변경)이 자동으로 **원제스처
  선택+이동** 산출. 선택된-프레임 리다이렉트(선택 내부 press → 선택
  이동)는 flavor 무관 스테이지 소유 — 정책에 도달하지 않음.
- **소비처 치환**: NestedFrame onClick `selectFromHit` →
  `ctx.hit.selectTarget`(null+페이지hit → clear, WI-163 이스케이프 해치
  보존), FrameStage resolveTarget 비선택 레그 `movableTargetOrNull` →
  `hitRef.current.moveTarget`(admitMoveTarget 분리, currentId는 vm 동기
  파생 — 중첩 삼항, Rule 6 게이트 통과형), DesignPage `hit={editorMode.hit}`.
- **디커미션 스윕**: selection-context의 `selectFromHit`+`ClickIntent`
  (~100줄) 삭제(키보드 내비 헬퍼 4종은 잔존), interactions/index 배럴
  export 제거, `selection-from-hit.test.ts` 삭제 — 전 스위트
  `hit-resolution.test.ts`(35 tests)로 이주 + moveTarget 신규 스위트.

## Verification (P3)

- 게이트 전수 green (2026-06-10): tsc --noEmit / vitest **1009 pass (98
  files)** (+12: hit-resolution 35 − 이주분 + editor-mode 레지스트리 합성
  3) / tokencheck·declarativecheck·puritycheck·inheritancecheck·
  modeboundarycheck / biome 0 errors.
- 신규 e2e `editor-mode-hit.spec.ts` 2 passed (retries 0):
  slide-deck 깊은 자식 드래그 → 페이지 직속 조상 선택+이동(geometry 단언,
  손자 부모-상대 rect 불변) / mixed 깊은 자식 직접 이동+선택 무회귀.
- e2e 무회귀 판정 (비교가능 서브셋 13파일: P2 기준선 + figma-* 선택 계열
  + reparent-multi-selection + text-v1-launch): **40 passed, 3 failed**
  = 전부 기지 pre-existing red(frame-handles:32 / mode-gate-hardening:110
  / thumbnail-panel:216). hover-affordance:58/:87 2건은 **green 전환**
  (아래 배너 원인 — P2 당시 known-red가 환경 요인이었음이 판명).
- **환경 triage 2건** (P3 코드와 무관, 같은 변경에서 수리):
  - figma-selection 런치 배너 캘린더 창(2026-06-08~06-15, LG-001 1주
    자동철회)이 **검증일에 열려 있어** clearAllDesigns의 weave.* 전삭이
    배너를 재소생 → 캔버스 상단(top-12 z-30) 클릭/드래그 6 spec 가로채기.
    수리: clearAllDesigns가 dismissal 키 2종을 재시드(helpers.ts),
    배너 자체를 검증하는 text-v1-launch.spec은 키를 명시 제거로 옵트인.
  - `page.emulateMedia(reducedMotion)`를 prepareDesign **앞**에 호출하면
    이 샌드박스에서 design 페이지 networkidle이 영원히 미안착(이분 실측).
    수리: editor-mode-hit/selection-follows-drag에서 prepareDesign 뒤로
    이동(reduced motion은 드래그 중에만 유의미).
  - figma-cmd-click-deep-select/right-click-layer-picker 4 spec의
    `[data-frame-id=…]` 락레이터가 WI-072(06-01) 이후 썸네일 타일과 strict
    mode 충돌(중첩 frame이 타일로도 노출) — `[data-testid="block-frame"]`
    스코핑으로 수리, 5 passed.

## P4 구현 (2026-06-10)

- **InputPolicy 추가** (필수 키, G1/G5 — 소비처와 같은 변경):
  `gates: Record<InteractionGateKey, ReadonlySet<InteractionMode>>` —
  interaction-mode.tsx 게이트 훅 5종(tooltips / frameSelection /
  editAffordances / selectionChrome / frameDragBindings)의 하드코딩 모드
  리스트를 정책 테이블 조회로 치환. **FSM은 단일 기계 유지** — 전이 로직·
  토큰 부기 불변, 도달 가능 집합만 정책이 결정.
- `InteractionMode` 유니온을 editor-mode/types.ts로 이동(InputPolicy의
  게이트 어휘 — ClickIntent가 HitPolicy 어휘로 거기 사는 것과 동형).
  interaction-mode.tsx가 type 재export → 기존 call site 무변경.
- `pieces/input.ts` STANDARD_INPUT 1조각을 4 flavor 공유(오늘 게이트는
  flavor 무변동; page-bounded는 hand/panning에 도달 자체를 못 함 —
  camera.dragPan=false). frameDragBindings는 구 블록리스트의 allow-set
  전사 — 자기-claim 모드(rubber-band/frame-manipulating/text-editing)가
  admit set에 남아야 하는 closure-orphan 주의를 types.ts에 명문화.
- 주입: InteractionModeProvider에 **required** `input` prop(DesignPage
  컴포지션 루트가 `editorMode.input` 전달) — 옵션이면 하드코딩 폴백이
  제2 진실이 됨(G5). 무프로바이더 렌더는 vm도 부재라 mode가 idle 고정 →
  모든 게이트 open 반환(레거시 동일; "idle은 모든 게이트 통과" 불변식을
  레지스트리 테스트로 고정).
- **계획의 `bindings` 절반은 접음(G5 판정)**: pan 계열 마운트는 P2에서
  이미 `CameraPolicy.dragPan` 단일 진실로 착지(useHandTool enabled) —
  InputPolicy로 미러링하면 진실 2개. rubber-band/marquee 레이어는 전
  flavor 마운트이고 flavor 인지는 START 수용(emptyRegionAccept =
  frameSelection 게이트 + ViewPolicy 페이지 경계)에 이미 있음. 레이어를
  "마운트하지 않는" flavor가 생기는 순간이 bindings 키가 소비처와 함께
  착지하는 시점(types.ts InputPolicy doc + dragPan doc 정정에 기록).
- 디커미션 스윕: `useRubberBandAllowed` 삭제(소비처 0 — rubber-band 시작
  게이트는 emptyRegionAccept의 frameSelection 경유가 실 진실) + index 2곳
  재export 제거.

## Verification (P4)

- 게이트 전수 green (2026-06-10): tsc --noEmit / vitest **1015 pass (99
  files)** (+6: InputPolicy 레지스트리 합성 3 + 가짜정책 주입 훅 테스트 3
  — interaction-mode.test.tsx 신설, createRoot+act 패턴) /
  tokencheck·declarativecheck·puritycheck·inheritancecheck·
  modeboundarycheck / biome 0 errors(38 기존 warnings).
- e2e 무회귀 판정 (비교가능 서브셋 13파일, P3과 동일 기준): **40 passed,
  3 failed** = 전부 기지 pre-existing red(frame-handles:32 /
  mode-gate-hardening:110 / thumbnail-panel:216 env flake) — P3 기준선과
  동일, P4 회귀 0.

## P5 스윕 (2026-06-10)

- 흡수 완료 검증: `grep -rn "infiniteCanvas\|isArtboardId\|artboardIds\|
  formatEditorConfig\|FORMAT_EDITOR_CONFIG"` → **라이브 코드 0** (잔존
  히트는 전부 흡수 이력을 서술하는 주석/테스트 설명문).
- 소비처의 `pieces/`·`registry` import 0 — modeboundarycheck green.
- **G4 게이트 추가**: `tools/check_editor_mode_boundary.sh`에 Rule 4 —
  소비처의 `ctx.mode === "infinite"|"page-bounded"` 비교를 빌드-그래프
  위반으로 승격(CanvasMode 리터럴 2종은 유일해서 grep 정밀; 모듈 자신·
  테스트 면제). 위반 형태 2종 매치 + 유사문(`"infinite-scroll"`) 비매치
  self-test 통과. declarativecheck가 아닌 경계 게이트에 넣은 이유: G4는
  DR-114 고유 계약이고 이 스크립트가 그 계약의 단일 거처.
- PROJECT_MAP 검토 — 제네릭 네비게이션 스켈레톤(피처별 색인 없음)이라
  갱신 불요. 디커미션(useRubberBandAllowed 등)은 P4에서 같은 변경으로 완료.

## Verification (설계 단계)

- 설계 단계 — 코드 변경 없음. 게이트·e2e 계획은 ENGINEERING_PLAN 각 phase에
  명시(무회귀 phase는 기존 e2e green이 증명, 행동 변경 3건은 신규 e2e 고정).

## Next

없음 — WI-166 완결. 후속은 flavor 제품화 시 해당 modes/ 합성 파일 +
필요 조각 추가(DR-114 §7)로 진행.
