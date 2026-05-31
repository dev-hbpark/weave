# 텍스트 아이템 — Product Spec (Figma-equivalent)

| Field | Value |
|---|---|
| Status | **Living spec** (v1 scope 확정 — 2026-05-25) |
| Owner | hbpark |
| Last update | 2026-05-25 |
| Triggers update | resize 모드 추가/변경 / rich text 모델 변경 / 새 텍스트 속성 도입 |
| Source WIs | WI-023 (Phase 15 텍스트 도메인 초기화), WI-024 (Phase 18 auto-height), WI-TBD (Figma-equivalent v1) |
| 관련 spec | `INTERACTIVE_PRESENTATION_SPEC.md` (상위 product spec) |

---

## 0. 이 문서가 존재하는 이유

현재 weave 의 텍스트 아이템은 **"Auto-height 단일 모드 + 코너 드래그 시 fontSize 비례 스케일"** (Genially-식) 으로 구현되어 있다. 사용자 결정 (2026-05-25): **피그마와 100% 동일한 paradigm 으로 재정의**.

이 결정은 두 가지를 의미한다:

1. **현재의 "코너 = 글자 크기 스케일" 동작은 폐기**된다. 코너 드래그는 박스만 변경하고, 글자 크기는 별도 슬라이더로 분리한다.
2. **글자별 스타일 범위 (rich text)** 가 v1 에 포함된다. 한 텍스트 아이템 안에서 일부 글자만 bold/italic/color 가 다를 수 있어야 한다.

이 문서는 텍스트 아이템의 모델·동작·UX 의 single source of truth 다. 코드보다 이 문서가 먼저. 변경은 여기서 시작.

---

## 1. 결정 요약 (사용자 confirm: 2026-05-25)

| 결정 영역 | 선택 | 의미 |
|---|---|---|
| **Resize 모드** | 피그마 100% 동일 (Q1 → A) | `textAutoResize: WIDTH \| HEIGHT \| NONE` 3-mode enum. 코너 드래그는 박스만, 글자 크기 = 별도 슬라이더. **현재 corner-scale UX 폐기.** |
| **Rich text** | 글자별 스타일 범위 v1 포함 (Q2 → A) | `characterStyleOverrides[]` + `styleOverrideTable` 모델. 편집기는 Slate/Lexical 후보 (Engineering Plan 에서 선택). |
| **v1 필드 번들** | 4개 번들 전부 (Q3 → ALL) | 모드·overflow / vertical·paragraph / typography / 스키마 cleanup — 전부 v1. |

이 결정은 **breaking change** 다 — 기존 텍스트 아이템 5개의 e2e 테스트가 재작성된다 (`apps/web/e2e/text-item.spec.ts`). 마이그레이션 정책은 §6.

---

## 2. 피그마 텍스트 paradigm 요약

### 2.1 Resize 3-mode (핵심)

> **2026-05-31 결정 (Figma 대비 의도적 deviation):** `자동너비`/`자동높이`를
> **대칭 모델**로 재정의한다. 자동인 축은 ResizeObserver 가 소유(핸들 없음),
> 나머지 한 축은 사용자가 edge 핸들로 조절한다. 따라서 **자동너비 = width 자동 /
> height 수동(n·s 핸들)**, **자동높이 = height 자동 / width 수동(e·w 핸들)**.
> (Figma 의 Auto-Width 는 두 축 모두 자동이지만, 라벨 의미·대칭성·사용성 측면에서
> "자동너비면 높이는 내가 정한다" 가 더 자연스럽다는 사용자 결정.)

| 모드 | width | height | 노출 핸들 |
|---|---|---|---|
| **Auto-width** (`WIDTH_AND_HEIGHT`) | 컨텐츠에 맞춰 자동 확장 | 사용자 지정 | n, s |
| **Auto-height** (`HEIGHT`) | 사용자 지정 | 컨텐츠에 맞춰 자동 확장 | e, w |
| **Fixed** (`NONE`) | 사용자 지정 | 사용자 지정 | 전 8 방향 |

생성 시 default 모드:
- 더블클릭으로 만들면 → Auto-width
- 드래그로 만들면 → Auto-height
- 코너로 width·height 둘 다 강제 조정하면 → Fixed

모드 전환 규칙:
- **Fixed → Auto-width**: height = 1 line, width = 컨텐츠 길이로 즉시 수축
- **Fixed → Auto-height**: width 유지, height = 컨텐츠 높이로 즉시 조정
- **Auto-width → Auto-height**: 현재 visual width 를 layout width 로 박제하고 wrap 시작
- **Auto-height → Auto-width**: line break 무시, single line 으로 펼침

### 2.2 Bounds 모델 (Layout vs Visual)

- **Layout bounds** = 사용자가 선택 시 보는 박스 = `ItemFrame` (현재 모델 유지)
  - 선택 핸들 / 정렬 / Auto Layout 계산 / snap 의 기준
- **Visual bounds** = 실제 글자가 차지하는 axis-aligned 영역 (= 피그마 `absoluteRenderBounds`)
  - `letter-spacing` 음수 / descender / accent / `Fixed + overflow` 시 Layout 을 초과할 수 있음
  - 충돌 감지 / 캔버스 export / drop-shadow effect 영역 계산의 기준
  - **derived** (저장 X, 매번 measure)

### 2.3 글자별 스타일 (rich text)

```
characters         = "Hello world"     // 11 chars
characterStyleOverrides = [0,0,0,0,0,1,1,1,1,1,1]   // 글자별 styleId (0 = root)
styleOverrideTable = {
  "1": { fontWeight: "bold", color: "#f00" }
}
```

규칙:
- 루트 `TextAttrs` 의 스타일이 default
- `styleOverrideTable[id]` 는 sparse — 명시한 필드만 덮어씀
- 선택 영역이 mixed 면 PropertiesPanel 은 "Mixed" 배지
- copy/paste 시 override table 도 함께 이동
- **paragraph/block 단위 속성은 override 대상 아님** (alignment, lineHeight, paragraphSpacing, textAutoResize)

---

## 3. v1 스키마 (TextAttrs)

`@agocraft/core` 의 `TextAttrs` 를 다음 형태로 확장한다. **frame 의 단위 (0..1 ratio) 와 designToHost projection 규칙은 기존 그대로 유지.**

```typescript
interface TextAttrs {
  // ─── 위치 ────────────────────────────────────────────
  readonly frame: ItemFrame                       // layout bounds (parent-relative ratio)
  // visualBounds 는 derived — measure 시점에 계산, 저장 X

  // ─── Resize 모드 ─────────────────────────────────────
  readonly textAutoResize: "WIDTH_AND_HEIGHT" | "HEIGHT" | "NONE"

  // ─── Overflow (textAutoResize === "NONE" 에서만 의미) ─
  readonly textTruncation: "DISABLED" | "ENDING"
  readonly maxLines: number | null                // null = 무제한, ENDING + maxLines 로 "n줄까지" 표현

  // ─── 컨텐츠 + rich text ───────────────────────────────
  readonly text: string                           // \n 포함 plain text (UTF-16 code unit 기준)
  readonly characterStyleOverrides: readonly number[]  // length === [...text].length, 각 값은 styleOverrideTable 의 key (0 = root)
  readonly styleOverrideTable: Readonly<Record<string, PartialTextStyle>>

  // ─── 루트 TextStyle (override 가 0 인 글자에 적용) ────
  readonly fontFamily: string                     // CSS stack
  readonly fontSize: number                       // design-px
  readonly fontWeight: TextWeight                 // "normal" | "bold" (v2 에 numeric 100~900 확장)
  readonly fontStyle: TextStyleVariant            // "normal" | "italic"
  readonly color: string                          // CSS color
  readonly textDecoration: "NONE" | "UNDERLINE" | "STRIKETHROUGH"
  readonly textCase: "ORIGINAL" | "UPPER" | "LOWER" | "TITLE" | "SMALL_CAPS"
  readonly letterSpacing: number                  // design-px (음수 허용)

  // ─── Paragraph / block 속성 (override 불가) ───────────
  readonly textAlignHorizontal: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED"
  readonly textAlignVertical: "TOP" | "CENTER" | "BOTTOM"
  readonly lineHeight: { value: number; unit: "multiplier" | "px" }
  readonly paragraphSpacing: number               // design-px, 단락 사이
  readonly paragraphIndent: number                // design-px, 단락 첫 줄 들여쓰기

  // ─── 박스 단위 속성 ──────────────────────────────────
  readonly background?: string                    // 박스 fill (transparent = undefined)
  readonly opacity: number                        // 0..1
  readonly shadow: ShadowSpec | null
  readonly hyperlink: { url: string } | null      // v1: 박스 전체에 한 링크 (글자별은 v2)
  readonly rotation?: number                      // 라디안 (frame.rotation 과 동일, frame 우선)
}

// Sparse override — TextStyle 의 부분 집합만 명시
interface PartialTextStyle {
  readonly fontFamily?: string
  readonly fontSize?: number
  readonly fontWeight?: TextWeight
  readonly fontStyle?: TextStyleVariant
  readonly color?: string
  readonly textDecoration?: "NONE" | "UNDERLINE" | "STRIKETHROUGH"
  readonly textCase?: "ORIGINAL" | "UPPER" | "LOWER" | "TITLE" | "SMALL_CAPS"
  readonly letterSpacing?: number
  // ✗ lineHeight / paragraphSpacing / paragraphIndent / textAlign / textAutoResize / background / shadow
}
```

### v1 default (신규 텍스트 생성 시)

```
textAutoResize: "HEIGHT"   // 드래그 생성 시. 더블클릭이면 "WIDTH_AND_HEIGHT".
textTruncation: "DISABLED"
maxLines: null
text: ""
characterStyleOverrides: []
styleOverrideTable: {}
fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
fontSize: 24
fontWeight: "normal"
fontStyle: "normal"
color: "#1f2933"
textDecoration: "NONE"
textCase: "ORIGINAL"
letterSpacing: 0
textAlignHorizontal: "LEFT"
textAlignVertical: "TOP"
lineHeight: { value: 1.4, unit: "multiplier" }
paragraphSpacing: 0
paragraphIndent: 0
background: undefined
opacity: 1
shadow: null
hyperlink: null
```

### v2 로 미루는 것

- `fontWeight` numeric (100~900)
- OpenType flags (`opentypeFlags: { LIGA, CALT, ... }`)
- `hangingPunctuation`, `hangingList`
- `lineHeight.unit: "font_size_%"` (피그마의 3번째 단위)
- 리스트 (`lineTypes: ORDERED | UNORDERED | NONE`, `lineIndentations[]`)
- 글자별 hyperlink
- Variable text / Text on path

---

## 4. v1 동작 명세

### 4.1 Resize handle 동작

`textAutoResize` 에 따라 SelectionLayer 핸들이 다르게 노출된다 — Rule 6 (registry + adapter) 의 candidate.

| 모드 | 노출 핸들 | 드래그 결과 |
|---|---|---|
| `WIDTH_AND_HEIGHT` (Auto-W) | n, s 만 | height 만 사용자 지정, width 는 ResizeObserver 가 컨텐츠에 맞춰 자동. |
| `HEIGHT` (Auto-H) | e, w 만 | width 만 사용자 지정, height 는 ResizeObserver 자동. |
| `NONE` (Fixed) | e, w, n, s, ne, nw, se, sw (전 8 방향) | width·height 둘 다 사용자 지정. |

(2026-05-31 대칭 모델 — §2.1 의 deviation 주석 참조. 이전 "Auto-W = 핸들 없음" 규칙은 폐기.)

**코너 드래그 시 fontSize 스케일은 모든 모드에서 폐기**. 글자 크기는 PropertiesPanel 의 fontSize 슬라이더로만 변경. (현재의 `apps/web/src/pages/FrameStage.tsx:1300-1367` 로직 제거.)

선택 시 추가로 노출되는 UI:
- 좌상단 corner 위에 **모드 토글** (3-icon segment) — Figma 우측 패널의 텍스트 섹션 상단과 동일

### 4.2 Overflow 동작 (Fixed 모드)

`textTruncation` 에 따라:
- `DISABLED`: 컨텐츠가 박스를 넘으면 그냥 visible (밖으로 흘러나옴). 부모 frame 의 `clipsContent` 가 true 면 거기서 clip 됨.
- `ENDING`: 마지막 줄 끝에 ellipsis (`…`) 표시, 이후 글자는 hidden. `maxLines` 가 지정되면 그 줄 수에서 자르고 ellipsis.

CSS 매핑:
```css
.text-block[data-mode="NONE"][data-truncate="ENDING"] {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: <maxLines | derived from height>;
  -webkit-box-orient: vertical;
  text-overflow: ellipsis;
}
```

### 4.3 모드 전환

PropertiesPanel 토글 클릭 시 `weave.text.setAutoResize` 커맨드 발행. 커맨드는 다음을 한 atomic patch 로 묶어 emit:

1. `textAutoResize` 값 변경
2. 모드별 frame 재계산:
   - `NONE → HEIGHT`: width 유지, height = measure(visual.height)
   - `NONE → WIDTH_AND_HEIGHT`: width = measure(visual.width, 1 line), height = measure(1 line)
   - `HEIGHT → WIDTH_AND_HEIGHT`: width = measure(visual.width 단일줄), height = 1 line
   - `WIDTH_AND_HEIGHT → HEIGHT`: 현재 visual width 를 layout width 로 박제
   - `WIDTH_AND_HEIGHT → NONE`: 현재 visual 박스 박제
   - `HEIGHT → NONE`: 현재 visual 박스 박제

measure 함수는 `<EditableText>` 의 hidden mirror DOM 이나 OffscreenCanvas measure 로 구현 (Engineering Plan 에서 선택).

### 4.4 글자별 스타일 적용 (rich text)

편집기 (Slate / Lexical / 자체 구현 — Engineering Plan 결정) 가 선택 영역을 알고 있을 때:

```
weave.text.applyRange({
  itemId,
  range: { start: number, end: number },   // UTF-16 code unit
  styleDelta: PartialTextStyle              // 예: { fontWeight: "bold" }
})
```

커맨드의 책임:
1. 신규 styleId 생성 또는 기존 styleId 찾기 (동일 PartialTextStyle 가 이미 있으면 재사용)
2. `range` 범위의 `characterStyleOverrides[i]` 를 신규 styleId 로 교체
3. 더 이상 참조되지 않는 styleId 는 `styleOverrideTable` 에서 제거 (garbage collect)
4. atomic Patch 로 emit

mergeKey 정책: 글자 입력 중의 styleDelta 변경은 동일 mergeKey 로 묶어 한 undo step. 선택 후 toolbar 클릭은 별개 undo step.

### 4.5 PropertiesPanel — 텍스트 섹션 (v1)

현재 `text-section.tsx` 를 다음 구조로 확장:

```
┌─ 모드 ───────────────────────────────────────────────┐
│ [↔ Auto-W] [↕ Auto-H] [□ Fixed]                     │
│ (Fixed 일 때만) [Truncate ●○]  maxLines: [3 ▾]      │
├─ 폰트 ───────────────────────────────────────────────┤
│ Family: [Inter ▾]    Size: [24 ━━●━━ 200]           │
│ Weight: [B]  Style: [I]  Decoration: [U] [S]        │
│ Case: [aA] [AA] [aa] [Aa]                           │
├─ 단락 ───────────────────────────────────────────────┤
│ H-Align: [L] [C] [R] [J]                            │
│ V-Align: [⤒] [⤬] [⤓]                                │
│ Line height: [1.4 ━●━] [× | px]                     │
│ Letter spacing: [0 ━●━] px                          │
│ Paragraph spacing: [0 ━●━] px                       │
│ Paragraph indent: [0 ━●━] px                        │
├─ 박스 ───────────────────────────────────────────────┤
│ Color: [●]    Background: [●][×]                    │
│ Opacity: [100 ━━━●] %                               │
│ Shadow: [color][x][y][blur] [×]                     │
│ Hyperlink: [https://...] [×]                        │
└──────────────────────────────────────────────────────┘
```

다중 선택 시 mixed 값은 "Mixed" 배지. 글자별 선택 시 (편집 모드에서 일부 글자 선택) 그 글자들의 effective 스타일을 표시.

### 4.6 신규 텍스트 생성 UX

**2026-05-31 결정:** 모든 신규 텍스트는 **Auto-width** 로 생성된다. 생성 시점에
박스가 텍스트를 **양축 모두 hug** 한다 — width 는 ResizeObserver 가 컨텐츠에 맞춰
자동, height 는 **1 line (fontSizeRatio × lineHeight)** 으로 seed 한다. height 는
수동 축이므로, 사용자가 n·s 핸들을 드래그하면 그 값으로 **고정 유지**된다(자동
복귀 안 함). width 는 계속 컨텐츠를 따라간다.

- **추가 메뉴 "T 텍스트"**: 위 규칙대로 Auto-width + 1-line height 로 생성.
- (미구현) **드래그 생성**: 드래그 영역 기준 Auto-height 후보.
- (미구현) **더블클릭 빈 공간**: Auto-width 즉시 편집 진입.

### 4.7 Bounds 모델

`ItemFrame` 은 Layout bounds 로 그대로 유지. Visual bounds 는 **derived state** 로만 노출:

```typescript
// 신규 helper (apps/web/src/document/domains/text-measure.ts)
function measureTextVisualBounds(attrs: TextAttrs, designSize: Size): {
  x: number; y: number; width: number; height: number
}
```

- snap / collision / export 가 visual 을 필요로 할 때만 호출
- 저장하지 않음 (font 로딩 / window resize 시 재측정)
- React component 에서는 `useTextMeasure(attrs)` hook 으로 ResizeObserver-backed cache

---

## 5. 신규 / 변경 커맨드

| 커맨드 | input | 비고 |
|---|---|---|
| `weave.text.setAutoResize` | `{ itemId, mode }` | mode 전환 + frame 재계산 atomic |
| `weave.text.setTruncation` | `{ itemId, truncation, maxLines }` | NONE 모드에서만 의미 |
| `weave.text.setVerticalAlign` | `{ itemId, align }` | |
| `weave.text.setDecoration` | `{ itemId, decoration }` | range 없으면 root, 있으면 applyRange 로 위임 |
| `weave.text.setCase` | `{ itemId, case }` | 동일 |
| `weave.text.setLineHeight` | `{ itemId, lineHeight }` | block 단위 |
| `weave.text.setLetterSpacing` | `{ itemId, letterSpacing }` | range 가능 |
| `weave.text.setParagraphSpacing` | `{ itemId, spacing }` | block 단위 |
| `weave.text.setParagraphIndent` | `{ itemId, indent }` | block 단위 |
| `weave.text.setHyperlink` | `{ itemId, url }` | v1: 박스 전체 |
| `weave.text.setBackground` | `{ itemId, background }` | 이미 generic 으로 가능, 명시 alias |
| `weave.text.setShadow` | `{ itemId, shadow }` | |
| `weave.text.applyRange` | `{ itemId, range, styleDelta }` | rich text 핵심. styleId GC 포함. |

기존 `weave.item.update` 는 root-level 속성 (fontSize, color, etc.) 변경에 그대로 사용. range 가 관여하면 반드시 `applyRange` 경유.

---

## 6. 마이그레이션 (현재 → v1)

현재 저장된 텍스트 아이템은 다음 default 로 마이그레이션:

| 현재 필드 | v1 필드 | 변환 |
|---|---|---|
| `text` | `text` | 동일 |
| `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `color`, `letterSpacing`, `opacity`, `shadow`, `background`, `rotation` | 동일 이름 | 동일 |
| `textAlign` | `textAlignHorizontal` | rename. `"justify"` → `"JUSTIFIED"`, 나머지 UPPERCASE |
| `lineHeight: 1.4` (number) | `lineHeight: { value: 1.4, unit: "multiplier" }` | 항상 multiplier 로 해석 |
| — | `textAutoResize` | `"HEIGHT"` (현재 동작) |
| — | `textTruncation` | `"DISABLED"` |
| — | `maxLines` | `null` |
| — | `characterStyleOverrides` | `[...text].map(() => 0)` (전부 root) |
| — | `styleOverrideTable` | `{}` |
| — | `textAlignVertical` | `"TOP"` (현재 flex-start) |
| — | `textDecoration` | `"NONE"` |
| — | `textCase` | `"ORIGINAL"` |
| — | `paragraphSpacing` | `0` |
| — | `paragraphIndent` | `0` |
| — | `hyperlink` | `null` |

마이그레이션 함수는 `@agocraft/core` 의 deserialize hook 에 둔다. **`onUnknown: "preserve"`** 정책 (CLAUDE.md "Core Engineering Principles") 에 의해 v1 reader 가 unknown 필드 보존, v0 reader 도 새 필드 무시.

---

## 7. e2e / 테스트 영향

### 7.1 재작성되어야 하는 기존 e2e (`apps/web/e2e/text-item.spec.ts`)

- **"Corner resize scales fontSize proportionally"** → **삭제 또는 reverse 검증** (이제 코너는 박스만)
- **"Edge resize doesn't scale fontSize"** → 그대로 PASS, 단 검증 메시지 갱신
- 나머지 (font-family, multiline, auto-height, auto-wrap, min-width clamp) 는 모드 = `HEIGHT` 시나리오로 유지

### 7.2 신규 e2e (필수)

- **Mode toggle**: Auto-H → Auto-W 전환 시 width 가 컨텐츠로 수축
- **Mode toggle**: Auto-H → Fixed 전환 시 현재 박스 박제 + 핸들 8개 노출
- **Overflow visible**: Fixed + truncation DISABLED + 긴 텍스트 → 글자 박스 밖으로
- **Truncate ENDING**: Fixed + truncation ENDING + 긴 텍스트 → `…` 표시
- **Vertical align**: V-Align CENTER → 텍스트 박스 중앙 정렬
- **Decoration**: 텍스트 일부 선택 → Underline 적용 → 그 글자만 underline
- **Range style**: 일부 글자 bold → `characterStyleOverrides` 갱신 검증 (실제 DOM 또는 attrs snapshot)
- **Undo of range style**: applyRange 후 `Cmd+Z` → override 제거
- **Truncate + maxLines**: maxLines=2, 5줄 텍스트 → 2줄 + `…`
- **Hyperlink**: 박스 hyperlink 설정 → present mode 에서 클릭 시 navigate

### 7.3 신규 unit test (필수)

- `text-measure.ts` — measureTextVisualBounds 의 기본 케이스 (단일 줄 / 다줄 / letter-spacing 음수 / fontSize 다양)
- styleId GC — `applyRange` 후 더 이상 참조 없는 styleId 제거
- 마이그레이션 함수 — 현재 형식 → v1 형식 round-trip

---

## 8. Open questions (Engineering Plan 에서 결정)

1. **편집기 선택** — Slate / Lexical / `<EditableText>` 위에 자체 selection range 관리.
   - 트리쉐이킹 영향 (feedback memory: ESM + sideEffects:false + reflect-metadata 비의존)
   - CRDT 매핑 비용 (`@agocraft/sync` 의 patch 와 어떻게 통합?)
   - 기존 `EditableText` 코드 재사용성
2. **measure 구현** — hidden mirror DOM vs OffscreenCanvas vs canvas `measureText`.
3. **Rich text CRDT** — `characterStyleOverrides[]` 배열 변경을 패치 단위로 어떻게 표현? Y.Array vs 전체 snapshot?
4. **모드 전환 시 measure 호출** — synchronous 가능? font load 중이면?
5. **글자별 hyperlink** 를 v2 로 미뤄도 되는지 — 사용자 use case 확인 필요.
6. **textCase 의 SMALL_CAPS** — 폰트 OpenType 지원 없을 때 fallback (graceful degrade vs 명시 경고)?
7. **default 폰트 stack 의 한국어 fallback** — 현재 `Inter` 가 한국어 글자에 대해 fallback. CJK 폰트 명시 추가?

---

## 9. Decision Record 연결

이 spec 변경이 발효되려면 다음 record 들이 작성/갱신되어야 한다:

- `records/work-items/WI-NNN-text-item-figma-equivalent.md` (신규 WI)
- `records/decisions/DR-NNN-text-item-resize-paradigm.md` — 현재 corner-scale 폐기 결정 박제
- `records/decisions/DR-NNN-text-item-rich-text-editor.md` — Open question §8.1 선택 박제
- `records/feasibility-reviews/FR-NNN-rich-text-v1.md` — rich text + 편집기 교체의 기술적 feasibility (CRDT 매핑 핵심)
- `records/risks/RISK-NNN-text-item-migration.md` — 현재 데이터 migration 의 risk

`workspace/agocraft/` 측에는 다음이 필요:
- `agocraft/records/decision-handoffs/HANDOFF-NNN-text-attrs-v1-schema.md` — `TextAttrs` 확장 + 마이그레이션 hook 요청 (cross-project boundary 규칙)

---

## 10. v1 미포함 / v2 후보 정리

명시적 out-of-scope:

- 글자별 hyperlink (박스 단위만)
- 글자별 fontFamily mix 의 CJK 자동 fallback chain
- `fontWeight` numeric (100~900)
- OpenType flags (LIGA / CALT / etc.)
- `lineHeight.unit: "font_size_%"`
- 리스트 (`lineTypes`, `lineIndentations`)
- Variable text / data-binding
- Text on path
- 폰트 imports (Google Fonts dynamic load) — 현재 6 preset 만 유지
- 텍스트 자체에 대한 애니메이션 (reveal-on-step 은 generic, 텍스트 전용 단어/글자 단위 reveal 은 v2)

---

## 11. 참조

- Figma REST API spec: `TypeStyle`, `TEXT` node — Figma 공식 문서
- 현재 weave 구현: `apps/web/src/document/domains/TextBlock.tsx`, `apps/web/src/document/toolbar/sections/text-section.tsx`, `apps/web/src/pages/FrameStage.tsx:1300-1367`
- agocraft `TextAttrs`: `packages/core/src/types.ts` (agocraft 내부)
- 상위 product spec: `docs/product/INTERACTIVE_PRESENTATION_SPEC.md`
- 엔진 원칙: workspace OS `docs/04-specialized-engineering/CODE_STRUCTURE_DESIGN_RULES.md` (Rule 6 = handle dispatcher 의 registry 후보)
