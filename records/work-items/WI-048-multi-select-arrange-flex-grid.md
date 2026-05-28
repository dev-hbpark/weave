# WI-048 — 다중선택 Flex/Grid 자동 정렬 + 호버 미리보기

## Metadata

| Field | Value |
|---|---|
| ID | WI-048 |
| Title | 다중선택한 아이템을 Flex/Grid 형태로 자동 배치하는 QuickActionBar 버튼 + 배치 미리보기 |
| Owner | hbpark |
| Status | **Implemented & verified green (2026-05-28).** |
| Severity | P2 (기능 추가) |
| Created | 2026-05-28 |
| Closed | 2026-05-28 |
| Related | [WI-043](WI-043-frame-layout-ux.md)(layout), [WI-045](WI-045-contextual-toolbar-redesign.md), [WI-047](WI-047-layout-child-property-edit-revert.md), align-ops.ts(패턴 선례), agocraft `LayoutAdapter`/`LayoutEngine` |

## 요청 & 결정

요청: 다중선택 시 QuickActionBar에 버튼을 추가해 선택 아이템을 Flex/Grid로 자동 배치. 레이아웃 설정 코드를 재사용하는 구조. 레이아웃 뷰모델이 있으면 호버 시 배치 미리보기.

사용자 확정 결정:
- **그 자리에서 한 번 정렬(컨테이너 없음)** — 새 프레임으로 감싸지 않고 선택 아이템 위치만 flex/grid 형태로 재배치(align/distribute처럼 1회성).
- **호버 미리보기 같이 구현.**

## 뷰모델 feasibility (확인 결과: 가능)

`@agocraft/layout` 의 `LayoutAdapter.onParentResize(ctx, children)` 가 **순수 계산기**(부모 ratio in → 자식 frame out, mutation 없음) — 영속 프레임 레이아웃이 쓰는 바로 그 계산기. 이를 재사용해 apply와 preview가 **동일 함수**를 호출. (`LayoutEngine.onLayoutChange`/`resolveGridDropCell` 도 순수 — 드롭 프리뷰용으로 이미 설계됨.)

## 재사용 구조

- `apps/web/src/document/multi/layout-arrange.ts` (align-ops.ts 선례) — 순수 `computeArrangedFrames(items, "flex"|"grid")`:
  1. 선택 아이템 bbox(부모 ratio)를 가상 부모로 간주, 각 자식을 bbox 상대좌표로 변환.
  2. `getLayoutRegistry().resolve(spec.kind).onParentResize(ctx, children)` 호출 — flex/grid 배치 수학 **재사용**(중복 0). spec은 `createAutoFlexSpec`/`createAutoGridSpec` 재사용. grid는 cols=ceil(√n) 근사 정사각 + 자식별 cell 정책(`createAutoGridChildPolicy`) + **justify/align=stretch·gap 0** → 각 아이템이 cell 크기로 리사이즈되어 bbox 를 edge-to-edge 타일링(간격 없음).
  3. 결과(bbox 상대) → 부모 ratio로 역변환.
- **apply**: 호스트 슬롯 `setMultiLayoutArranger` → `computeArrangedFrames` → `weave.items.resizeMulti`(단일 undo). align 슬롯과 동형.
- **preview**: `ArrangePreviewOverlay` 가 동일 `computeArrangedFrames` 로 위치 계산 → 첫 자식 DOM rect + ratio frame 으로 부모 화면 rect 역산 → 고스트 사각형 투영(부모 root/중첩 무관). 색은 **고정 cyan**(`--arrange-preview-stroke`/`--arrange-preview-fill`, tokens.css base 정의·테마 무관) — 선택 핸들(--accent)과 hue 를 분리해 구분되게 함(사용자 피드백 반영).

## Changes
- `multi/layout-arrange.ts` (+ `layout-arrange.test.ts` 3 unit) 신규.
- `editor-hotkeys.ts`: 슬롯 `setMultiLayoutArranger` + 명령 `multi.layout-flex`/`multi.layout-grid`(visibleWhen multi, enabledWhen sameParent+count≥2, `multiAlignEnabled` 재사용).
- `DesignPage.tsx`: 슬롯 wiring(align 미러), QuickActionBar renderItem 에 Flex/Grid 버튼(IconLayoutFlex/Grid) + 호버→`onArrangeHover`, `ArrangePreviewOverlay` 컴포넌트 + `arrangePreview` state.

## Verification
- typecheck / declarativecheck(Rule 6 OK) / lint / build / web unit 215(신규 3): PASS.
- e2e 신규 `multi-arrange-layout.spec.ts` **2/2**: 다중선택→버튼 노출, 호버→고스트 오버레이, Grid→2×2(distinct 2×2), Flex→한 줄(3 distinct x, 1 y). 회귀 0: `figma-quickaction-add`(multi bar) 14/14, `layout-child-props` 3/3.

## Out of scope (future)
- Figma식 "auto-layout 프레임으로 감싸기"(영속 컨테이너) 는 별 옵션으로 추가 가능(이번엔 1회성 선택).
- 정렬 결과 fine-tune(간격/정렬)은 현재 ContextualToolbar(프레임 레이아웃)에서만 — 1회성 arrange엔 미적용.
