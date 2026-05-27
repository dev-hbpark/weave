# DR-design-015 — ContextualToolbar Tier-2 (kind chip · quick actions · More popover)

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-015 |
| Date | 2026-05-27 |
| Owner | hbpark |
| Component | `@weave/design-system` → `ContextualToolbar` + 11 new icons |
| Supersedes | DR-design-014 §"priority + dynamic fold" (Bar 가 더 이상 in-flow 컨트롤을 펼치지 않음 — fold 알고리즘 불요) |
| Triage Decision | **Step 3 — Grew** (primitive API 전면 교체 + 11 신규 icon primitive) |

## Triage Walk

| Step | Outcome |
|---|---|
| 1. Reuse | ❌ — 현재 primitive (Bar.Section + Divider + priority) 는 "선택된 아이템의 모든 컨트롤을 한 줄로 늘어놓는다" 컨셉. 사용자 명시: "아주 간결" (2026-05-27). 컨셉 자체 변경 필요. |
| 2. Extend | ❌ — Bar.Section 의 priority 만으로는 한계. NumberSlider 의 flex-1 트랙, Family 의 텍스트 trigger 등 inline 컨트롤 자체가 wide. |
| 3. Grew | ✅ — primitive API 전면 교체. compound `<Bar.Kind / Bar.Quick / Bar.More>`. 11 신규 icon primitive. |

## Context

연속된 fix 반복(DR-design-014 priority+fold, shrink-0, label drop, NumberSlider compact)에도 사용자가 "여전히 이상해"라고 보고. 본질 문제: **컨셉이 "all-inline"**. 컨트롤이 시각적으로 크고(Family 텍스트 / Size 슬라이더 / Align 4버튼 / etc.) 16개를 한 줄에 펼치면 어떤 폭에서도 빽빽. 사용자 요청: "아주 간결" + "확장하는 방식".

선택지 비교(2026-05-27 AskUserQuestion):
- Tier-1 (kind+Properties): 너무 극단적, 고빈도 액션도 2클릭
- **Tier-2 (kind + 1-4 quick + More)**: 고빈도 1클릭 유지, 나머지 2클릭. Figma/Canva/Notion 산업 표준.
- Sub-mode (semantic grouping): 1클릭 액션 사라짐, 그룹 관리 부담.

**사용자 확정: Tier-2.**

## Decision

### Primitive 새 API (compound)

```tsx
<ContextualToolbar
  aria-label="Text properties"
  data-testid="contextual-toolbar"
  data-kind={kind}
>
  <ContextualToolbar.Kind icon={<IconText />} label="Text" />
  <ContextualToolbar.Quick>
    {/* 1-4 high-frequency action icons */}
  </ContextualToolbar.Quick>
  <ContextualToolbar.More label="더보기">
    {/* full vertical property panel — rendered inside popover */}
  </ContextualToolbar.More>
</ContextualToolbar>
```

- `Bar.Kind`: 32×32 icon chip (kind 명시). 컨트롤 X. selection 정보 시각화 only.
- `Bar.Quick`: 1-4 icon button + (optional) color swatch row. shrink-0. 합쳐서 ~100-150px.
- `Bar.More`: 항상 mount, More 버튼 클릭 시 PopoverContent 안에서 보임. children 은 vertical stack (host 가 라벨 + 컨트롤 stack 직접 작성).

`Bar.Section / Bar.Divider / priority / fold` **전부 제거**. DR-design-014 의 ResizeObserver + recompute 머신 폐기. Bar 폭은 컨텐츠 fit (대략 200-260px).

### 신규 Icon 인벤토리 (11 개)

| Icon | 용도 | Status |
|---|---|---|
| `IconText` | text kind chip + (선택적) text 관련 | new |
| `IconBold` | quick: bold toggle | new |
| `IconItalic` | quick: italic toggle | new |
| `IconUnderline` | quick: underline toggle | new |
| `IconShape` | shape kind chip | new |
| `IconImage` | image kind chip | new |
| `IconVideo` | video kind chip | new |
| `IconFrame` | frame kind chip | new |
| `IconRefresh` | quick: image/video replace src | new |
| `IconVolume` | quick: video volume / mute | new |
| `IconMore` | "더보기" 3-dot trigger | new |

기존 `IconCursor / IconHand / IconLayers / IconPlay / IconPlus / IconChevron* / IconClose / IconUndo / IconRedo` 와 동일 패턴 — `forwardRef<SVGSVGElement, IconProps>`, `currentColor` stroke, `width/height` props.

### Kind → Quick action 매핑

| Kind | Bar.Quick 내용 (왼→오) | Bar.More 내용 |
|---|---|---|
| `text` | IconBold / IconItalic / IconUnderline / color-swatch | Family, Size, Align, V-Align, Decoration, Case, Background, Line height, Letter spacing, Truncate, Max lines, Hyperlink, Opacity, Mode |
| `shape` | fill-swatch / stroke-swatch | Shape variant, Opacity |
| `image` | IconRefresh (replace src) | Fit, Opacity, Border radius |
| `video` | IconRefresh (replace src) / IconVolume (mute toggle) | Fit, Loop, Volume slider |
| `frame` | bg-swatch | (없음 — 향후 Opacity/Shadow 추가 가능) |

### More popover 내부 레이아웃

```
[Property label]
[Inline control (full width of popover)]
─────────────────────
[Property label]
[Inline control]
...
```

- Popover width: `min(260px, 90vw)`.
- 각 row 는 label (small caption) + control. Vertical stack `gap-2`.
- Multi-edit Mixed badge / useResolveSharedColor 동작 그대로.

## Constraints

- **이모지 사용 금지** (`feedback_no_emoji_in_ui_use_icons`): 모든 trigger / glyph 가 SVG icon. ▭ ▶ 등 기존 shape-section / video-section 의 inline glyph 도 점진 정리 (별도 PR 가능).
- **a11y**: `Bar.Kind` 는 `role="img"` + `aria-label`. `Bar.Quick` 의 IconButton 은 항상 `aria-label`. More popover 는 Radix Popover 의 표준 a11y.
- **state preservation**: ColorPicker 가 More popover 내부에 nested 되어 있어도 Radix Popover-in-Popover 정상 동작. DR-design-013 의 capture-phase dismiss 백스톱이 nested overlay 차단 selector (`[data-state="open"]`) 로 적절히 동작.
- **multi-edit**: 기존 `useResolveSharedColor` / `MixedBadge` / `updateAll` 동작 보존. 옮기는 위치만 변경.

## Risks

| Risk | 완화 |
|---|---|
| 1클릭 action 이 줄어 사용성 저하 | Bold/Italic/Underline/Color 같은 진짜 고빈도는 quick 에 유지. Family/Size 는 2클릭이지만 빈도 낮음 (전체 디자인 1-2회). |
| Popover-in-Popover 중첩 | Radix Popover 가 nested 지원. 외부 popover 의 dismiss 가 inner picker 발화로 트리거되지 않도록 capture-phase 백스톱 (DR-design-013) 의 `[data-state="open"]` selector 가 자동 exempt. |
| 기존 e2e spec 회귀 (label / inline control 검색) | spec 일괄 갱신. selector 를 `role="group"` + name (aria-label) 으로. |
| 11 icon 추가의 bundle 영향 | 각 icon 가 simple SVG (path 1-3 개) → 미미. Estimate +~2 KB gz 총합. |

## Verification

1. `apps/web/e2e/toolbar-overflow.spec.ts` 갱신 — fold 검증은 폐기, 대신 Bar 의 폭이 viewport 와 무관하게 일정함 + More 버튼이 항상 노출 + More popover 내부에 expected sections 가 보이는지.
2. 기존 `text-item / shape-media-fill / background / multi-toolbar / item-primitives / media-src-dialog / add-menu` spec 의 selector 갱신.
3. 시각 검증: 사용자가 manual 확인.

## Cross-references

- Supersedes (partial): DR-design-014 (priority/fold 폐기), DR-design-009 (single horizontal flex bar)
- 의존: `feedback_radix_bubble_outside_dismiss_pitfall` / DR-design-013 (Popover dismiss 백스톱)
- 의존: `feedback_no_emoji_in_ui_use_icons` (mockup/UI 이모지 금지)
