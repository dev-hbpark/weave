# Presentation / Doc Page-Bounded Editing — Engineering Plan (WI-153)

레코드: WI-153 · FR-024 · DR-111. 확정 결정 7개는 DR-111 참조.

## Architecture: 단일 시임 = 포맷 에디터 설정 레지스트리

타입→에디터 행동을 **하나의 레지스트리**로 모은다(Rule 6). 현재 `DesignPage.tsx:1029`의
`infiniteCanvas = flavor === "mixed" || "canvas-board"` 인라인 분기를 대체:

```ts
// 예시 형태 (P1에서 확정)
interface FormatEditorConfig {
  canvas: "infinite" | "page-bounded";
  pan: "free" | "within-page";
  defaultContainer: "root" | "active-page";
  clampToPage: boolean;        // 소프트 min-overlap (D6)
  clipAtPage: boolean;         // 페이지 박스 클립 (D5/D9)
  pageNavigator: boolean;      // 썸네일 레일 (D7)
  agentRootAdd: boolean;       // 에이전트 root 배치 허용 (D5/P4)
}
const FORMAT_EDITOR_CONFIG: Record<DocFlavor, FormatEditorConfig> = { ... };
// slide-deck, doc-page → page-bounded preset (D3)
// mixed, canvas-board → infinite preset (현행 동작 그대로)
```

소비처는 레지스트리에서 설정을 읽기만 한다. `flavor === ...` 직접 비교 신규 추가 금지.

## Phases (touch points — file:line은 현재 기준, 진행 시 재확인)

### P1 — 포맷 레지스트리 (동작 변화 0)
- 신규 `FORMAT_EDITOR_CONFIG`(+ `useFormatConfig(flavor)` 훅 또는 파생값).
- `DesignPage.tsx:1018-1029` — `infiniteCanvas` 파생을 `config.canvas === "infinite"`로 치환. 기존 3개
  소비처(`useHandTool` `:1134`, `DesignHeader` `:2092`, `FrameStage` `:2230`)는 config 경유.
- **검증**: 타입체크 + 기존 editor/aku 테스트 green, mixed/slide-deck/doc-page 동작 불변(스냅샷·수동 확인).

### P2 — 한 페이지 캔버스 (D7)
- 활성 페이지 상태(activePageId; presentationOrder 기반 기본=첫 페이지).
- `cameraFitBox`/`zoomToBox`(`FrameStage.tsx:401-421`, `frame-camera-bridge.ts:40`)로 활성 페이지 박스에
  카메라 락. `infiniteCanvas` 팬 경로(`FrameStage.tsx:333-452`) 무력화 또는 within-page로 재스코프.
- ThumbnailPanel = 페이지 네비게이터(클릭 전환). `handleFitAll`(`use-frame-focus.ts:126-143`)의 전체-union
  가정은 page-bounded에서 비활성/대체.
- **검증**: 페이지 전환 시 카메라가 해당 페이지에 fit, 무한 팬 비활성. 브라우저 확인(SVL).

### P3 — 소속 + 클립 + 소프트 클램프 (D5/D6)
- 기본 추가 컨테이너 root→활성 페이지: `use-item-add.ts:127-131`(+ `:220-224`).
- 페이지 박스 클립: 활성 페이지 프레임이 subtree를 자기 박스로 클립(viewport-cull 경로
  `viewport-cull-context.ts` 확장 또는 페이지 컨테이너에 clip). bleed 허용(가장자리 잘림).
- 소프트 클램프: `FrameStage.tsx:852 computeMove`(+ `add-geometry.ts computeAddFrame`,
  `design-root.insertable.ts:88` 프레임 생성 rect)에 min-overlap 보장. 스냅 인터셉트(`frame-manip.ts:73`)가
  자연스러운 삽입점.
- **검증**: 페이지 밖 드래그 시 최소 일부 on-page 유지, 가장자리 클립. 비회전 우선.

### P4 — 추가/에이전트 흐름 (D5/P4)
- 툴바·드래그-드롭(`FrameStage.tsx:1428` onDropAdd) 추가가 활성 페이지 타깃.
- 에이전트: 프레젠테이션 포맷에서 root 배치 금지 — `config.agentRootAdd === false`일 때 containerId 기본을
  활성 페이지로(WI-150 `enforceContainerIsFrame` 가드와 결합) + 포맷별 프롬프트 변형(`weave-capabilities`).
- **검증**: Aku가 페이지 내부에만 배치(WI-150 가드 + 페이지 컨테이너 기본).

### P5 — 생성/크롬 + 발표·출력 클립 정합 (D9)
- 마법사(`NewDesignWizard.tsx`)에서 "프레젠테이션" 타입 부각(라벨/카피).
- 툴바 슬림화(슬라이드 저작용; Hand/Peek는 이미 게이트).
- Present/Export 클립을 편집과 일치(`PresentPage.tsx` 합성/Export 경로 클립 지점 = 페이지 박스).
- **검증**: 편집=발표=출력 동일 클립(WYSIWYG) 시각 확인.

## Design System Triage

- REUSE: ThumbnailPanel(페이지 레일), Badge/IconButton, 카메라 bridge(`cameraFitBox`).
- 신규 UI 최소화. "페이지 추가/복제" 액션은 기존 썸네일 컨텍스트/툴바 패턴 재사용 — 신규 primitive 불요로 예상.
  (P2에서 디자인 트리아지 재확인; 신규 primitive 필요 시 DR-design 발행.)

## 테스트 전략

- 순수 단위: `FORMAT_EDITOR_CONFIG` 룩업, 소프트 클램프 계산(min-overlap), 활성 페이지 박스 산출.
- 통합: 추가가 활성 페이지로 들어가는지(commands), 카메라 락.
- 회귀: mixed/canvas-board 무한 캔버스 불변(스냅샷). 기존 slide-deck bleed 디자인이 깨지지 않음.
- SVL: 각 단계 브라우저 확인(드래그 클램프·클립·페이지 전환).

## 미해결(진행 중 확정)
- 회전 박스 경계 정합(후순위).
- doc-page 툴바가 slide-deck과 동일/분리 여부(P5).
- 멀티셀렉트 이동 시 그룹 단위 min-overlap 처리.

## 진행 로그
- **P1 완료** (commit a2be8b1): `FORMAT_EDITOR_CONFIG` 레지스트리. 동작 변화 0.
- **P2.1 완료** (commit fad7e03): `useActivePage` + `FrameStage.visibleFrameIds` → page-bounded는 활성
  페이지 한 장만 렌더, 레일 single-click이 페이지 전환. 무한 캔버스 불변.
- **P2.2 완료**: 레일 "+" 빈 페이지 추가(`weave.item.add` FULL_FRAME) → 활성 페이지로. ThumbnailPanel에
  `onAddPage` + IconPlus 타일.
- **P2.3 (보류→다음) 페이지 복제**: `weave.item.duplicate`는 0.02 nudge가 있어 FULL_FRAME 페이지가 어긋남.
  `weave.batch`는 batch 중 생성된 id를 후속 op가 못 참조 → duplicate+frame-normalize 원자화 불가. 깔끔한
  복제는 **subtree를 source frame 그대로 한 트랜잭션에 클론하는 전용 명령**(예: page-scope duplicate)이 필요 →
  별도 slice.
- **P2.4 카메라 fit-to-active-page (보류)**: FULL_FRAME 스택 페이지는 디자인 박스=페이지 박스라 현재 fit이
  이미 정확. 비-풀프레임 페이지에서만 필요하며 base-fit 수학을 건드려 좌표/오버레이 정합 리스크 → 후순위.
- **P2.5 완료 — 카메라/크롬 정합**: ① `FrameStage.cameraEnabled` 신설 — 줌(ctrl/⌘휠·⌘±·⌘0)을
  `infiniteCanvas`(배치 모델)에서 분리, page-bounded도 줌 가능(기본값 `infiniteCanvas` → 무한 캔버스
  동작 불변). ② `fitInset` — 헤더 48px + 썸네일 레일 높이(ResizeObserver 측정)를 뺀 영역 안에 페이지
  fit(크롬 아래 숨던 문제 해소). SVL: fit top=65.7(≥48)·레일 위, ⌘= 1196→1435px·⌘0 복원, mixed 불변.
- **P3 선행 — 페이지 매트**: design plane에 `box-shadow` 100000px 헤일로로 페이지 밖을 회색 매트
  처리(paint-only, 포인터 불간섭, pan/zoom 추적). `visibleFrameIds` 있을 때만 → 무한 캔버스 무영향.
- **P3 완료 — 소속 + 클립 + 소프트 클램프 (D5/D6)**:
  - ① 기본 추가 컨테이너: `FORMAT_EDITOR_CONFIG`에 `defaultContainer: "root" | "active-page"` 신설.
    DesignPage가 정책을 해석해 `defaultAddContainerIdRef`(활성 페이지 id 미러)를 `useItemAdd`에 주입 —
    두 컨테이너 결정 블록 모두 `selIsFrame ? sel : (default ?? root)`. useItemAdd에 flavor 비교 없음(Rule 6).
  - ② 가장자리 클립: design plane(=FULL_FRAME 페이지 박스)에 `overflow: clip` — 매트와 동일하게
    `visibleFrameIds !== undefined` 키. 자기 box-shadow(매트)는 자기 overflow에 안 잘리고, 셀렉션
    크롬은 body 포털이라 안전. **설계 노트**: 플랜 스케치의 `clampToPage`/`clipAtPage` 필드는 추가하지
    않음 — page-scoped 렌더링의 귀결이라 `canvas: "page-bounded"`와 항상 일치해야 하는 죽은 설정이 됨.
  - ③ 소프트 클램프: 순수 수학을 `src/document/page-clamp.ts`(`clampAxis`/`clampFrameToPage`, 유닛 7건)로
    분리. `parentRectOf`가 "이동 아이템의 최근접 프레임 조상 = 활성 페이지"일 때 `__pageClamp`
    (min-overlap 비율, 48 design px를 라이브 plane scale로 환산 → 줌 불변)를 던더 관용구로 부모 rect에
    실어 보내고, `computeMove`가 회전 0일 때만 적용. vendored 바인딩에서 snap이 delta를 먼저 보정한 뒤
    computeMove가 실행되므로 클램프가 최종 결정권. 리사이즈/회전 경로 불변.
  - SVL 8/8: R 추가가 활성 페이지로(parent=page), plane overflow=clip(mixed는 미클립), 좌/우 오프페이지
    드래그가 경계값(0.9750 / -0.3750)에 정확히 핀, mixed 드래그는 x>1로 탈출(무클램프). 스크린샷으로
    가장자리 클립 + 핸들 비클립 확인. 유닛 914/914 · lint · 타입체크 green.
  - 잔여(P4로): 드래그-드롭 onDropAdd / 러버밴드 / 에이전트 추가 경로의 활성 페이지 타깃, 멀티셀렉트
    그룹 단위 min-overlap(현재는 페이지 직계 자식별 개별 클램프).
- **P4 선행 — phantom hover 억제**: 레일이 모든 페이지에 `data-frame-kind`를 게시 → 비활성 페이지 hover가
  `frameHoverStore`로 투영되던 것을 `visibleFrameIds` 기반 차단. SVL(스토어 직접 관찰): 비활성 레일
  hover=null, 활성 레일/캔버스 hover=정상.
- **P4 완료 — 추가/에이전트 흐름 (D5/P4)**:
  - ① 드롭 retarget: DesignPage `onDropAdd`가 stage 매트 드롭(containerId=root)을
    `defaultAddContainerIdRef`(활성 페이지)로 retarget. 명시적 프레임 타깃 드롭은 불변.
  - ② 에이전트 retarget + 프롬프트: 순수 변환 `agent-page-target.ts`(`retargetAgentRootAdd`) —
    `weave.item.add`의 non-frame leaf가 root(생략 포함)를 향하면 활성 페이지로 rewrite, `kind:"frame"`은
    면제(최상위 frame = 새 슬라이드). transformInput 파이프라인 **최선두**에서 실행(후속
    fixAgentTextBox가 containerId를 읽어 free-vs-layout 텍스트 크기를 결정하므로 순서 중요) →
    fixAgentTextBox → WI-150 containerGuard → WI-147 minSizeGuard. dep `getDefaultAddContainerId`는
    depsRef 규율(DR-030) 준수. 제출 시 per-task `[페이지 편집]` 프롬프트 라인(활성 페이지 id + root leaf
    금지 안내) — 변환이 정합성을 강제하고 프롬프트는 멘탈모델 동기화(심층 방어).
    **설계 노트**: 플랜 스케치의 `agentRootAdd` 레지스트리 필드는 추가하지 않음 — 항상
    `defaultContainer === "active-page"`와 일치해야 하는 죽은 설정(P3 ②와 동일 근거).
  - ③ 에이전트 줌 래퍼: `handleAgentZoomToFrame` — 에이전트 작업 카메라(WI-126)가 향하는 frame이
    `presentationOrder` 멤버일 때만 `setActivePageId`(비페이지 id는 resolveActivePage가 page 1로
    폴백하므로 멤버십 가드 필수) 후 줌. ThumbnailPanel은 기존 `handleZoomToFrame` 유지.
  - ④ 러버밴드 페이지 스코프: `page-scope.ts`(`scopeDocumentToPages`, 유닛 4건)로 RubberBandLayer
    `getDocument`를 visible 페이지로 스코프 — hit-test가 deepest-first 정렬이라 숨은 스택 페이지의
    중첩 프레임이 가로채던 실버그 수정. 매트에서의 alt-drag 시작은 `acceptWithinPage`(outer
    alt-override `acceptTarget` + `emptyRegionAccept`)로 차단 — 우발적 root 프레임(=새 페이지) 생성 방지.
  - ⑤ 마퀴 스코프: MarqueeSelectionLayer `getFrames`도 동일 스코프 — 전체 휩쓸기가 숨은 페이지를
    선택에 끌어들이지 않음.
  - SVL 9/9: 매트 드롭→활성 페이지(루트 자식 불변), 2페이지 스택에서 러버밴드 커밋→활성 page2(p1
    불변), 매트 alt-drag 무반응(팝오버/새 프레임 0), 마퀴가 숨은 page1 미선택, mixed 매트 드롭은
    여전히 root(회귀 0). 유닛 926/926(신규 agent-page-target 8 + page-scope 4) · gates green.
- **P5 완료 — 생성/크롬 + 발표 클립 정합 (D9)**:
  - ① 마법사 카피: `FLAVOR_REGISTRY["slide-deck"]` label "Slide deck"→**"Presentation"**, tagline
    "Slides, edited one page at a time" — 페이지 단위 편집이 헤드라인(카피는 레지스트리 단일 소스,
    마법사 코드 무변경).
  - ② 툴바 슬림화: **추가 작업 없음** — Select/Hand/Peek/그리드 스냅은 이미 `infiniteCanvas` 게이트
    뒤(P2), page-bounded 헤더는 추가/실행취소/파일/배경/테마/저장/Present만 노출(전부 슬라이드 저작
    적합). 기록으로 충족 처리.
  - ③ 발표 클립 정합: PresentPage가 `formatEditorConfig(flavor).canvas === "page-bounded"`일 때
    각 camera-target 씬(`PresentScene`)에 `overflow: clip` + `data-clip` — 편집기의 페이지 박스
    클립과 동일한 정책 시임(Rule 6, 인라인 flavor 비교 없음). 활성 페이지가 어느 깊이든 "그
    프레임이 활성일 때 박스에서 클립"이 편집과 1:1. 자기 transform(hover scale)/box-shadow는 자기
    overflow에 안 잘림. 루트 프리미티브/non-slide 씬은 무클립 유지(편집에선 아예 비표시 — 별개
    표면). **Export(PNG/PDF/인쇄) 경로는 현재 미존재** — 시각 출력 표면은 Present뿐이라 클립
    정합은 Present로 완결; export 기능이 생기면 같은 시임을 읽을 것.
  - 부수: 다른 세션 커밋(71e6d7a)이 깨뜨린 `reparent-font.test.ts` non-null assertion 린트 2건을
    biome safe-fix(`!`→`?.`)로 복구, `.declarative-allow`의 PresentPage entranceKeyframes 라인 핀
    28→30 갱신(import 추가로 시프트).
  - SVL 3/3: 마법사 타일 "Presentation" 카피, slide-deck present 씬 `data-clip`+`overflow:clip`,
    mixed present 씬 무클립(`overflow:visible`). 유닛 926/926 · gates green.
