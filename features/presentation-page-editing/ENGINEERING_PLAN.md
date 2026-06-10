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
