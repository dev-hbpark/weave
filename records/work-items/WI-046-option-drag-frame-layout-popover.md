# WI-046 — Option+drag 추천 팝오버를 프레임 레이아웃 3종으로 단순화

## Metadata

| Field | Value |
|---|---|
| ID | WI-046 |
| Title | 디자인 배경 Option(⌥)+drag 후 팝오버를 프레임 / 플렉스 / 그리드 3개만 노출 + 디자인 개선 |
| Owner | hbpark |
| Status | **Implemented & verified green (2026-05-28).** typecheck/declarativecheck/build/lint + e2e(신규 2 + frame-in-frame-add 회귀 0). |
| Severity | P2 (UX 개선) |
| Created | 2026-05-28 |
| Closed | 2026-05-28 |
| Related | [WI-043](WI-043-frame-layout-ux.md)(layout spec), [WI-045](WI-045-contextual-toolbar-redesign.md)(ContextualToolbar 레이아웃 UX), [DR-design-021](../design-reviews/DR-design-021-toolbar-combobox-accordion-gridpicker.md) |

## Summary

**요청**: 디자인 배경에서 ⌥+drag 후 나오는 추천 팝오버를 **프레임 / 플렉스 / 그리드 3개만** 나오게. + 디자인 관점 개선 검토.

**변경 전**: `design-root.insertable.ts` 가 drag rect 의 aspect bucket(wide/tall/square) × kind(frame/image/text) 로 2~3개 추천을 만들고, 그 위에 **별도** Absolute/Flex/Grid 토글(SegmentedControl)을 또 얹었다. → 한 작은 팝오버에 결정 축이 둘(무엇을 만들지 × 레이아웃) 겹침.

## 디자인 검토 결론

- **결정 축 중복 제거**: "영역을 드래그한다 = 컨테이너(프레임)를 만든다"가 본질. 남는 유일한 질문은 "어떤 레이아웃 패러다임인가". → **3 레이아웃 패러다임 자체가 추천**이 되어야 하고, 별도 토글은 불필요.
- image/text/shape 는 드래그-생성 대상에서 제외(프레임 생성 후 QuickActionBar "+"로 추가하는 게 일관). aspect bucket 분기도 제거(드래그 크기는 commit 시 그대로 반영).
- **시각 개선**: 3개 항목에 패러다임 아이콘(IconLayoutAbsolute/Flex/Grid) + 짧은 설명. hover 시 가이드 박스의 **스켈레톤 미리보기를 패러다임별로** (absolute=자유 2칸 / flex=3열 / grid=2×2) — 무엇이 생길지 직관적으로 전달.

## Changes
- `apps/web/src/document/insertable/design-root.insertable.ts`: `recommend()` 가 항상 3개(`frame-absolute`/`frame-flex`/`frame-grid`) 반환. `commit()` 은 rec.id → 레이아웃(`layoutForRec`) → `attrsOverride.layout` 부착(생성 시점, staging race 회피). `renderSkeleton` 패러다임별. `describeHover` 프레임 중심으로 갱신. `supportsLayoutTypeToggle` 제거 → 팝오버의 레이아웃 토글이 더 이상 렌더되지 않음(코드는 inert 한 확장점으로 잔존).
- `apps/web/e2e/repeat-4corners.spec.ts`: stale 라벨("정사각 캔버스")→"프레임" 갱신(여전히 skip).

## Verification
- typecheck(web) / declarativecheck / build / lint: PASS.
- e2e 신규 `option-drag-frame-layouts.spec.ts` **2/2**: 팝오버가 정확히 3개(프레임/플렉스/그리드)·토글 0 / 그리드 선택 시 frame + `attrs.layout.kind==="auto-grid"`. `frame-in-frame-add` 회귀 0(첫 항목=프레임으로 자식 추가).

## Out of scope (future)
- `RecommendationPopover` 의 `LayoutTypeToggle` + `RubberBandLayer` 의 layoutType state 는 inert(확장점). 완전 제거는 별도 정리 PR.
