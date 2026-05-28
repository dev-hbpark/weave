# WI-045 — ContextualToolbar 직관·심플 재정리 (Combobox + Accordion + Grid drag-matrix)

## Metadata

| Field | Value |
|---|---|
| ID | WI-045 |
| Title | 선택 아이템 속성 편집(ContextualToolbar)을 직관적·심플·간결하게 — 다중옵션 선택=콤보박스, 세부속성=아코디언, 그리드 행열=드래그 매트릭스 |
| Owner | hbpark |
| Status | **Implemented & verified green (2026-05-28).** typecheck(DS+web)/declarativecheck/build/212 unit + e2e (redesign 3/3 신규 + 회귀 0, `background:165` 는 pre-existing). |
| Severity | P2 (UX 개선, LG 영향 0) |
| Created | 2026-05-28 |
| Closed | 2026-05-28 |
| Related | [DR-design-021](../design-reviews/DR-design-021-toolbar-combobox-accordion-gridpicker.md), [docs/research/CONTEXTUAL_TOOLBAR_UX_RESEARCH.md](../../docs/research/CONTEXTUAL_TOOLBAR_UX_RESEARCH.md), [WI-043](WI-043-frame-layout-ux.md)(layout spec 출처), DR-design-015(Tier-2 toolbar) |

## Summary

**요청(사용자)**: ① `absolute/flex/grid` 처럼 여러 값 중 선택 = **콤보박스**. ② 세부 속성 = **아코디언**으로 숨김(점진 노출). ③ 그리드 행/열 추가 = `add` 버튼 대신 **작은 사각형 매트릭스 드래그**. ④ 어떤 아이템을 선택해도 **심플·간결**.

**접근**: 구현 전 UX 리서치 수행(Figma 2025 grid picker, NN/g 아코디언, segmented vs combobox, Notion/Word 테이블 피커) → `docs/research/CONTEXTUAL_TOOLBAR_UX_RESEARCH.md`. 결정은 "사용자 경험 최적화" 위임받아 직접 수행.

## Decisions (UX-optimized)

- **다중옵션 enum → Combobox(Select)**: frame 레이아웃, shape sub-kind(8), flex/grid justify·align, image/video Fit. (≤4 아이콘 즉시토글 — Direction/Case/Decoration/Mode/Truncate — 은 SegmentedControl 유지: 1클릭 우위.)
- **세부 속성 → Accordion(다중 열기, 1단계)**: Text 14필드 → `타이포(기본열림)/정렬/스타일/배경·간격/줄바꿈/링크·기타`. Frame Flex → `레이아웃(열림)/여백`. Frame Grid → `격자(열림)/정렬/트랙 세부/여백`.
- **그리드 행열 → GridSizePicker 매트릭스**: `격자` 그룹 안에서 hover/클릭으로 행×열 개수. per-track 세부(fr/ratio/auto)는 `트랙 세부` 아코디언의 기존 TrackSizeEditor.
- **AlignmentPad(3×3) 도입(2026-05-28 후속 라운드)**: justify×align(text 는 align×valign)을 3×3 패드 1개로 통합. stretch/distribution/justify 는 보조 컨트롤(Switch/Select)이 소유. text/grid/flex 적용.
- **동반 정리**: flex/grid-child align-self·justify-self → Select; 상단 툴바 add 메뉴 이모지 → 아이콘.

## Changes

### Design system (DR-design-021)
- 신규 프리미티브 3: `Select`(Radix dropdown-menu RadioGroup 기반, 신규 dep 0) · `Accordion`/`AccordionItem` · `GridSizePicker`. 신규 아이콘 2: `IconCheck`, `IconChevronDown`.

### DS 프리미티브 (DR-design-021)
- 신규 4: `Select`(combobox) · `Accordion`/`AccordionItem` · `GridSizePicker` · `AlignmentPad`(3×3). 신규 아이콘 2: `IconCheck`, `IconChevronDown`. 모두 신규 dep 0(설치된 Radix 재사용 또는 커스텀).

### Toolbar 섹션 (`apps/web/src/document/toolbar/sections/`)
- `frame-background-section`: 레이아웃 SegmentedControl→Select. flex/grid `Bar.More`→Accordion 그룹. grid columns/rows→GridSizePicker(+`resizeTracks`). flex/grid justify×align→**AlignmentPad**(+stretch Switch, flex distribution Select).
- `shape-section`: sub-kind SegmentedControl(8)→Select(아이콘+라벨).
- `text-section`: 14필드 평면→Accordion 6그룹. Align+V-Align→**AlignmentPad**(+양쪽맞춤 Switch).
- `image-section`/`video-section`: Fit→Select.
- `flex-child-section`: align-self/justify-self SegmentedControl→Select(grow 2옵션은 Segmented 유지).
- `DesignPage` 상단 툴바 add 메뉴: 인라인 이모지→DropdownMenuItem `icon` prop(이모지 0).

## Verification
- typecheck(DS+web) / declarativecheck / build: PASS · 신규 DS 4파일 biome clean · web unit 212/212.
- e2e `contextual-toolbar-redesign.spec.ts` **5/5**: 레이아웃 콤보박스(absolute→auto-flex) / 그리드 매트릭스 3×2 / 텍스트 아코디언 / 텍스트 AlignmentPad(align=center·valign=BOTTOM) / flex AlignmentPad(justify=end·align=center). 회귀 0 (toolbar-overflow accordion+pad 반영 갱신).
- **pre-existing 실패 격리**: `background.spec.ts:165`(design background localStorage 재기록+reload) 는 HEAD stash 후에도 실패 — 본 변경 무관 박제.

### icons-only 전역 정리 (마지막 라운드)
- DS+app 전체 렌더 장식 글리프/이모지 → 아이콘 0화. 신규 아이콘 6(IconCamera/Diamond/DocLines/Sparkle/Check/ChevronDown). ContextMenu·TooltipCard·Hotspot·CursorTooltip·BehaviorEditor·PropertiesPanel·MediaSrcDialog·LandingPage·ThumbnailPanel·NewDesignWizard·insertable·런치배너·TextOnboardingHint·DesignPage QuickActionBar 전부 정리. 키보드 keycap(⌘⇧⌥↵⇥⌫)은 정상 표기로 유지. python 스캔 렌더 글리프 0.

## Out of scope (future)
- (없음 — icons-only sweep 완료.)
