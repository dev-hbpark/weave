# DR-design-021 — ContextualToolbar primitives: Select (combobox) + Accordion + GridSizePicker

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-021 |
| Date | 2026-05-28 |
| Owner | hbpark |
| Component | `@weave/design-system` → `Select` (combobox) + `Accordion` / `AccordionItem` + `GridSizePicker` + `AlignmentPad` (4 new primitives) + `IconCheck` / `IconChevronDown` (2 glyphs) |
| Work item | [WI-045](../work-items/WI-045-contextual-toolbar-redesign.md) — ContextualToolbar 직관·심플 재정리 |
| Research | [docs/research/CONTEXTUAL_TOOLBAR_UX_RESEARCH.md](../../docs/research/CONTEXTUAL_TOOLBAR_UX_RESEARCH.md) |
| Triage Decision | **Step 3 — Grew × 3 primitives + 2 icons** |

## Triage Walk

| Item | Step | Outcome |
|---|---|---|
| `Select` (combobox) | 3 Grew | ✅ — DS 에 단일선택 드롭다운 프리미티브 부재(SegmentedControl 만 존재, ≤6 옵션 한계). `@radix-ui/react-dropdown-menu` 의 RadioGroup/RadioItem 위에 구축 — **신규 dep 0**. API 는 SegmentedControl 미러(value/onValueChange/options) 로 섹션 교체 비용 최소. |
| `Accordion` / `AccordionItem` | 3 Grew | ✅ — disclosure 프리미티브 부재(`Reveal` 은 entrance 애니메이션). 커스텀(헤더 버튼 + caret rotate + aria-expanded/controls), **다중 열기**(NN/g), 1단계(중첩 금지). 신규 dep 0. |
| `GridSizePicker` | 3 Grew | ✅ — 행×열 개수를 hover/클릭 매트릭스로 설정(Word/Notion/Figma). `+ Add` 버튼 대체. 신규 dep 0. |
| `AlignmentPad` | 3 Grew | ✅ — justify×align(가로×세로)을 3×3 패드 1개로 통합(Figma auto-layout 패턴). text(align×valign)/grid/flex 공용. start/center/end 9칸 + 보조 컨트롤(stretch Switch / flex distribution Select). 신규 dep 0. |
| `IconCheck` / `IconChevronDown` | 3 Grew | ✅ — Select 의 체크 표시 + 트리거/아코디언 caret. SvgRoot 패턴. |

| Step | Considered? | Result |
|---|---|---|
| 1. Reuse | ✓ | SegmentedControl 은 ≤6 옵션·전옵션가시 전용 — 8옵션(Shape)·폭압박엔 부적합. Reveal≠disclosure. TrackSizeEditor 는 개수설정 UX 아님. |
| 2. Extend | ✓ | SegmentedControl 에 드롭다운 모드 끼우면 SRP 위반(전혀 다른 인터랙션). 별 프리미티브가 정합. |
| 3. Grew | ✅ | 3 프리미티브 모두 독립 책임. 설치된 Radix 재사용으로 dep 0. |
| 4. Escape | ✗ | 전 toolbar 섹션(frame/shape/text/image/video) 공용 — escape 보다 격상. |

## Decision

### Select (combobox)
```tsx
<Select<LayoutKindChoice>
  value={mixed ? "" : choice}        // "" → placeholder (Mixed)
  onValueChange={onLayoutChange}
  options={[{ value, label, icon? }]}
  placeholder="여러 레이아웃"
  triggerClassName="min-w-[104px]"
/>
```
- 트리거: 현재 옵션 아이콘+라벨 + `IconChevronDown`. 현재 값만 노출(폭 절약).
- 본문: RadioGroup/RadioItem + `IconCheck` ItemIndicator. 키보드/타입어헤드는 Radix 제공.
- DR-design-013 의 capture-phase outside-dismiss 백스톱(`useDismissOnOutsidePointer`) 재사용.
- **사용 규칙**: ≥5 옵션 / 긴 라벨 / 폭 압박 = Select. ≤4 아이콘 즉시토글 = SegmentedControl 유지. (리서치 §3.1)

### Accordion / AccordionItem
```tsx
<Accordion>
  <AccordionItem label="타이포" defaultOpen>…</AccordionItem>
  <AccordionItem label="정렬">…</AccordionItem>
</Accordion>
```
- 각 Item 자체 open 상태 → **다중 열기**(NN/g: 비교 위해 단일강제 금지).
- 헤더 = 풀폭 버튼 + `IconChevronRight` (open 시 rotate-90) + aria-expanded/controls. 콘텐츠 = `<section aria-label>` (collapsed 면 미렌더).
- **1단계만**(중첩 금지). 자주 쓰는 그룹 `defaultOpen`, 고급 접힘.

### GridSizePicker
```tsx
<GridSizePicker columns={n} rows={m} onChange={(c, r) => …} maxColumns={8} maxRows={8} />
```
- N×M 셀 매트릭스: hover/포커스 → `1..r × 1..c` 프리뷰, 클릭 → commit. `c × r` readout + 키보드(화살표+Enter) + 매트릭스 초과용 +/- 스테퍼.
- **count-based**: 호출측이 count → track 배열 reconcile(기존 보존/`fr(1)` 추가/truncate). per-track 세부(fr/ratio/auto)는 별도(TrackSizeEditor, "트랙 세부" 아코디언).

### Tree-shake (DR-002 3 gates)
ESM / `sideEffects:false` / no-decorator / named export — 전부 충족. 신규 런타임 dep 0(설치된 Radix dropdown-menu 재사용).

## Combobox vs Segmented — 적용표
| 컨트롤 | 채택 | 사유 |
|---|---|---|
| Frame 레이아웃(absolute/flex/grid) | Select | 사용자 명시 + 폭 절약 + 확장성 (3옵션이라 Segmented 도 타당 — 트레이드오프 박제) |
| Shape sub-kind(8) | Select | 8 > 6 한계 |
| Flex/Grid justify×align | **AlignmentPad(3×3)** | 2D 정렬 1컨트롤(Figma 패턴). stretch/distribution 은 보조 컨트롤 |
| Image/Video Fit(4) | Select | 일관성 |
| flex/grid-child align-self·justify-self(4) | Select | inline 폭 절약 |
| Font family | (기존 DropdownMenu 유지) | 폰트 프리뷰 보존 |
| Direction(2)/Case/Decoration/Mode/Truncate | SegmentedControl 유지 | ≤4 즉시토글, 1클릭 우위 |

## AlignmentPad — 적용 + 엣지케이스 처리 (2026-05-28 후속 라운드)
- **Text**: Align(4) + V-Align(3) 두 Segmented 행 → AlignmentPad 1개(가로 left/center/right × 세로 TOP/CENTER/BOTTOM) + "양쪽 맞춤(justify)" Switch.
- **Grid**: justify×align Select 2개 → AlignmentPad + "가로/세로 늘이기(stretch)" Switch 2개.
- **Flex**: justify×align Select 2개 → AlignmentPad + "분포(space-between/around)" Select + "늘이기(stretch)" Switch.
- 패드는 start/center/end 9칸; 그 외 값(stretch/distribution/justify)은 보조 컨트롤이 소유 → 해당 축 패드 하이라이트 없음. **2축 동시 변경은 단일 patch**(2회 호출 race 방지: `onFlexAlignPad`/`onGridAlignPad`, text 는 단일 updateAll).

## 동반 정리 (같은 라운드)
- flex-child/grid-child 의 align-self/justify-self(각 4옵션) → Select 전환(grow 2옵션은 Segmented 유지).
- 상단 툴바 add 메뉴(`toolbar-add`) 인라인 이모지(▭ T ◯ ─ → △ ★ ⬡ ♥ 💬) → DropdownMenuItem `icon` prop(IconFrame/Text/Image/Video + IconShape*). 이모지 0.

## 프로젝트 전역 글리프/이모지 → 아이콘 일괄 정리 (icons-only sweep)
DS+app 전체에서 **렌더되는** 장식 글리프/이모지를 0으로. 신규 아이콘 6: `IconCamera` `IconDiamond` `IconDocLines` `IconSparkle` `IconCheck` `IconChevronDown` (+ 기존 재사용).
- DS: `ContextMenuSubTrigger` ▸→IconChevronRight · `TooltipCard` ▸→IconChevronRight · `Hotspot` ✦→IconSparkle.
- app: `CursorTooltip` ▸ · `BehaviorEditor` ▾▸/📷/⏵ · `PropertiesPanel` ✕/✓✦ · `MediaSrcDialog` ⬆/🖱→없음·▶🖼→IconPlay/IconImage · `LandingPage` ▶→IconPlay · `ThumbnailPanel`+`NewDesignWizard` flavor ✦▭◇≡→IconSparkle/Frame/Diamond/DocLines · `design-root.insertable` ▢◉▶▲→createElement(Icon\*) · 런치 배너 💡✨🖱→IconSparkle/IconCursor · `TextOnboardingHint` ↔↕□ copy 제거 · `DesignPage` QuickActionBar ✕↻→IconClose/IconRefresh.
- **유지**: 키보드 keycap 기호(⌘ ⇧ ⌥ ↵ ⇥ ⌫)는 정상 표기라 보존. 코멘트 내 → 화살표 무관.
- python 스캔(주석 제외, keycap 제외): **렌더 글리프 0** 확인.

## Out of scope (future)
- (없음 — icons-only sweep 완료. 키보드 keycap 기호만 의도적으로 유지.)

## Verification
- typecheck(DS+web) / declarativecheck / build: PASS
- 신규 DS 4파일(Select/Accordion/GridSizePicker/AlignmentPad) biome: clean
- e2e `contextual-toolbar-redesign.spec.ts` **5/5 PASS** (레이아웃 콤보박스 전환 / 그리드 매트릭스 3×2 / 텍스트 아코디언 expand / 텍스트 AlignmentPad align×valign / flex AlignmentPad justify×align). icons-only sweep 후 broad e2e (contextual-toolbar-redesign·toolbar-overflow·item-primitives·figma-quickaction-add·shape-media-fill·text-v1-launch) **30 passed / 0 failed / 2 skip**. (`background:165` 는 pre-existing 실패 — HEAD stash 검증, 본 변경 무관.)
- web unit 212/212. icons-only python 스캔(렌더 글리프) = 0.

## Review-by
- `design-system-agent` — primitive promotion + Select/Accordion 토큰 일관성
- `frontend-architecture-agent` — Select dismiss 백스톱 + 키보드 내비, GridSizePicker a11y(role=grid 단일 위젯)
- `interaction-motion-philosophy-agent` — accordion caret rotate + grid hover 프리뷰 모션

## Status
**Decided & implemented 2026-05-28.** Lands with WI-045.
