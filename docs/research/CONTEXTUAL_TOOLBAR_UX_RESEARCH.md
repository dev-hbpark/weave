# ContextualToolbar UX/UI Research — 직관적·심플·간결한 속성 편집

> Goal: 선택한 아이템의 속성 편집(ContextualToolbar)을 "직관적이고 심플하고 간결하게" 재정리하기 위한 사전 리서치. 구현 전 의사결정 근거.
> Date: 2026-05-28 · Owner: hbpark · Status: Research complete → **구현 완료** ([DR-design-021](../../records/design-reviews/DR-design-021-toolbar-combobox-accordion-gridpicker.md) · [WI-045](../../records/work-items/WI-045-contextual-toolbar-redesign.md)). Combobox·Accordion·GridSizePicker·**AlignmentPad(3×3)** 4종 전부 도입 완료.

---

## 1. 사용자 요청 (정리)

1. **여러 속성값 중 선택**(예: `absolute` / `flex` / `grid`)은 **콤보박스**로.
2. **세부 속성 설정**은 **아코디언**처럼 숨길 수 있게(점진적 노출).
3. **그리드 행/열 추가**는 `add` 버튼이 아니라 **작은 사각형 행렬을 드래그**하는 직관적 방식으로.
4. **모든 아이템 선택 시** 일관되게 **심플·간결**한 느낌.

---

## 2. 현재 상태 감사 (as-is)

ContextualToolbar = 선택 기반 floating bar. 구조: `Bar.Kind`(아이콘 칩) + `Bar.Quick`(1–4 고빈도 액션) + `Bar.More`(팝오버 안에 `Bar.Field` 세로 스택). kind별 섹션은 registry 로 분리(Rule 6).

| Kind | Quick | More (팝오버) 필드 | 문제 |
|---|---|---|---|
| Frame | 배경색 + 비우기 + **레이아웃 SegmentedControl(absolute/flex/grid)** | flex: Direction·Gap·Justify·Align·Padding(4슬라이더) / grid: Columns·Rows(**TrackSizeEditor+Add버튼**)·ColGap·RowGap·Justify·Align·Padding(4) | 평면 나열 길다. Justify+Align 별도 2행. 그리드 track 추가가 `+ Add` 버튼. |
| Flex/Grid child | — | Width/Height(grow)·Align self·Justify self | OK(작음) |
| Shape | fill·stroke 스와치 | Shape(Segmented 8개)·Fill·Stroke·Opacity | Shape 8-옵션을 Segmented 로 — 6 초과(가이드 위반). |
| Text | B/I/U + 색 | **14개 필드 평면 나열**: Family(dropdown)·Size·Align·V-Align·Mode·Decoration·Case·Background·Line height·Letter spacing·Truncate·Max lines·Hyperlink·Opacity | **인지부하 최악**. 그룹핑 0. 스크롤 팝오버. |
| Image | 교체 | Source·Fit·… | 보통 |
| Video | 교체 | Source·Fit·Loop(Switch)·… | 보통 |

**핵심 진단**: (a) 옵션 선택 컨트롤이 Segmented 일변도라 옵션 多(Shape 8, Text 여러) 시 가로 폭발 / 6-옵션 가이드 위반. (b) `Bar.More` 안이 평면 — 그룹·점진노출 없음(특히 Text 14필드). (c) Justify·Align 이 별도 2행(2D 정렬을 1D 2개로). (d) 그리드 dimension 설정이 `+ Add` 버튼 반복.

---

## 3. 벤치마크 & 원칙 (근거)

### 3.1 Segmented vs Combobox(드롭다운/Select)
- **2–5개**(아이콘은 6개)까지가 Segmented 권장 상한. **그 이상은 드롭다운/Select** 로. (Mobbin / Primer / Mobiscroll)
- Segmented 장점: **1클릭·즉시·전 옵션 가시**. 드롭다운: 2클릭+스크롤이지만 **공간 절약·옵션 확장성·긴 라벨**에 유리. (UX Movement)
- → **규칙**: 옵션 ≤4 & 짧은 라벨/아이콘 & 즉시효과 = Segmented(또는 IconToggleGroup). **옵션 ≥5 or 긴 텍스트 라벨 or 폭 압박 = Combobox/Select.**
- 사용자 요청의 `absolute/flex/grid`(3개)는 가이드상 Segmented 도 타당하나, **항상 보이는 Quick 영역의 폭을 줄여 "간결"하게** 만들고 사용자가 명시적으로 콤보박스를 원함 → **아이콘+라벨 Combobox** 채택(현재 값만 칩으로 노출, 폭 최소).

### 3.2 점진적 노출 / 아코디언 (NN/g, IxDF, UXPin)
- 아코디언 = 인지부하↓ 의도. **단, interaction cost 를 늘리면 역효과**.
- **여러 섹션 동시 열기 허용**(비교 필요). 1개만 열리게 강제 X.
- **헤더는 내용을 정확히 설명** + caret/▸ 아이콘(둘 다 클릭 가능).
- **깊은 중첩 금지**(아코디언 안 아코디언 X). 1단계만.
- 자주 쓰는 섹션은 **기본 펼침**, 고급은 **기본 접힘**.

### 3.3 그리드 dimension 설정 (Figma 2025 Grid, Notion, Word)
- Figma(Config 2025)·Notion·Word 모두 **인터랙티브 셀 매트릭스**로 행×열 수를 시각 설정 + 보조로 숫자 입력. Notion 은 우하단 코너 드래그로 행/열 동시 증감.
- Figma 그리드 셀 내 자식 정렬은 **Position 섹션의 정렬 버튼(방향 패드/3×3 매트릭스 형태)**.
- → **GridSizePicker(드래그 매트릭스)** 로 columns×rows **개수** 설정, 세부 track 크기(ratio/fr/auto)는 "고급" 아코디언의 TrackSizeEditor 로.

### 3.4 정렬은 2D 패드 1개로 (Figma auto layout)
- Figma 는 justify+align 을 **하나의 정렬 패드**로 묶음(2D). weave 는 현재 Justify·Align 별도 2 Segmented 행.
- → **AlignmentPad(3×3)** 1컨트롤로 justify(가로)×align(세로) 동시 — 행 수↓, 직관성↑. Text 의 Align+V-Align 에도 적용 가능.

### 3.5 Floating bar vs 고정 패널 (Figma 2024 redesign 반례)
- Floating 은 캔버스 몰입↑·공간 유연. 그러나 **"플로팅+접힘" 과용은 도구/캔버스 경계 흐려 혼란**(Figma redesign 최대 논란).
- → weave 는 floating bar 유지하되 **깊이는 "More 팝오버 1단계 + 그 안 아코디언"** 으로 한정. 추가 떠다니는 패널 신설 금지.

---

## 4. 권장안 (to-be)

### 4.1 컨트롤 매핑 규칙(전 kind 공통)
| 속성 유형 | 컨트롤 | 예 |
|---|---|---|
| 즉시효과 ≤4 옵션, 아이콘/짧은 라벨 | SegmentedControl / IconToggleGroup | B·I·U, Direction(row/col), Case |
| 5+ 옵션 or 긴 라벨 or 폭 압박 | **Combobox/Select** | Layout(absolute/flex/grid), Shape(8), Font family, Fit |
| 가로×세로 정렬 | **AlignmentPad(3×3)** | Flex/Grid justify+align, Text align+v-align |
| 그리드 행·열 개수 | **GridSizePicker(드래그 매트릭스)** | Grid columns×rows |
| track 세부 크기 | TrackSizeEditor(고급 아코디언) | ratio/fr/auto |
| 수치 | NumberSlider | gap, opacity, size, padding |
| 색 | ColorPicker | fill/stroke/background |
| 켜기/끄기 | Switch | loop, mute |

### 4.2 `Bar.More` 팝오버 = 아코디언 그룹 (1단계, 다중 열기)
- **Frame/Flex**: `레이아웃`(direction·gap·정렬패드, 기본 펼침) · `여백`(padding, 접힘).
- **Frame/Grid**: `격자`(GridSizePicker·gap, 기본 펼침) · `정렬`(정렬패드, 접힘) · `트랙 세부`(TrackSizeEditor, 접힘) · `여백`(접힘).
- **Text**: `타이포`(Family·Size·Weight, 펼침) · `문단`(정렬패드·line height·letter spacing·case·decoration, 접힘) · `상자`(Mode·Truncate·Max lines·Background·Opacity, 접힘) · `링크`(Hyperlink, 접힘). → 14평면 → 4그룹.
- **Shape**: Quick 유지. More = `모양`(Shape Combobox) · `채우기/윤곽선`(색·미디어) · `기타`(Opacity). Shape Segmented(8) → **Combobox(아이콘+라벨)**.

### 4.3 "간결" 원칙(전 kind)
- Quick 은 **최대 4**개 고빈도만. 나머지는 More.
- More 헤더 라벨은 한국어 명사 1–2어 + caret.
- 기본: 가장 자주 쓰는 1그룹만 펼침. 고급 접힘.
- 모든 enum 칩은 **현재 값만** 노출(Combobox), 비교 필요한 정렬만 2D 패드로 전 옵션 노출.

---

## 5. 신규 디자인 시스템 프리미티브 (필요)

설치된 Radix: dropdown-menu·popover·radio-group·toggle-group·slider·switch·dialog·tooltip·context-menu·slot. **select·accordion·collapsible 미설치** → 신규 dep 없이 구현.

1. **`Select` (Combobox)** — `@radix-ui/react-dropdown-menu` 의 RadioGroup/RadioItem 위에 트리거(현재값+chevron)로 구축. 단일선택·체크표시·키보드. 신규 dep 0.
2. **`Accordion` (Disclosure)** — 커스텀(버튼 헤더 aria-expanded/controls + caret + 콘텐츠 영역). 다중 열기 기본, 중첩 금지. 신규 dep 0.
3. **`GridSizePicker`** — N×M 셀 hover/드래그로 columns×rows 설정, 보조 숫자 입력, 라이브 프리뷰. Notion/Word/Figma 패턴. 신규 dep 0.
4. **`AlignmentPad` (3×3)** — justify×align 동시 선택(9칸). flex/grid/text 공유. (선택 사항, 高가치) 신규 dep 0.

모두 트리셰이크 3-gate(ESM·sideEffects:false·no-decorator·named export) 준수, Aurora-glass 토큰 재사용, 아이콘 전용(이모지 금지).

---

## 6. 리스크 / 오픈 이슈

- **Combobox vs Segmented 마찰**: 3-옵션 즉시효과는 교과서상 Segmented 우위(1클릭). 콤보박스는 1클릭 더 든다. → 사용자 선호(콤보박스) 채택하되, **layout 같은 초고빈도 토글은 Segmented 유지 옵션**도 표에 남김(DR-design 에서 최종 결정).
- **AlignmentPad 신규 학습비용**: Figma 사용자는 익숙하나 신규 사용자는 패드 의미 학습 필요 → tooltip + 9칸 호버 라벨.
- **GridSizePicker 상한**: 드래그 매트릭스는 보통 ~8×8 까지. 그 이상은 숫자 입력 보조. track 세부(fr/ratio)는 매트릭스로 표현 불가 → 고급 아코디언 분리 필수.
- **회귀**: 기존 e2e 가 SegmentedControl/`Bar.Field` testid 에 의존 → 컨트롤 교체 시 테스트 동반 갱신.
- **접근성**: 정렬 패드/그리드 매트릭스는 드래그 외 키보드 경로 필수(화살표 이동 + Enter).

---

## 7. 다음 단계 (제안)

1. **DR-design** 발행 — 신규 프리미티브 4종(Select·Accordion·GridSizePicker·(AlignmentPad)) Triage(Grew) + Combobox/Segmented 최종 규칙.
2. **Engineering Plan** — DS 프리미티브 → 섹션별 리팩토링 순서(영향 작은 Shape/Image/Video 먼저, Text/Grid 마지막).
3. 단계별 Continuous Self-Verification(e2e 동반 갱신) + 브라우저 검증.

---

## Sources

- [Segmented control — Primer](https://primer.style/components/segmented-control/)
- [Segmented Control UI Design — Mobbin](https://mobbin.com/glossary/segmented-control)
- [Why Segmented Buttons Are Better Filters Than Dropdowns — UX Movement](https://uxmovement.com/buttons/why-segmented-buttons-are-better-filters-than-dropdowns/)
- [UI for single value selection — Mobiscroll](https://blog.mobiscroll.com/ui-for-single-value-selection/)
- [Accordions on Desktop: When and How to Use — NN/g](https://www.nngroup.com/articles/accordions-on-desktop/)
- [What Is Progressive Disclosure in UX? — UXPin](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/)
- [Use the grid auto layout flow — Figma Learn](https://help.figma.com/hc/en-us/articles/31289469907863-Use-the-grid-auto-layout-flow)
- [Guide to auto layout — Figma Learn](https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout)
- [Figma's new grid — UX Collective](https://uxdesign.cc/figmas-new-grid-you-must-understand-css-grid-as-a-designer-fbb00416e1cc)
- [Format your page (simple tables) — Notion Help](https://www.notion.com/help/columns-headings-and-dividers)
- [Why Figma's Floating Panels Fell Short — Bits Kingdom](https://bitskingdom.com/blog/figma-floating-panels-ux-lesson/)
- [Webflow vs Framer 2025 — toools.design](https://www.toools.design/blog-posts/webflow-vs-framer-in-2025-an-honest-in-depth-comparison)
