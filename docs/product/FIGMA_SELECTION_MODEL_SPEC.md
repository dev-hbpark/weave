# Figma Selection Model — Product Spec

| Field | Value |
|---|---|
| Status | **Living spec** (selection model SSOT — WI-033 / DR-017 박제) |
| Owner | hbpark |
| Last update | 2026-05-26 |
| Triggers update | selection model 결정 / 새 hotkey 추가 / 가드 변경 |
| Source records | WI-033, DR-017, FR-006, RISK-005 |
| Supersedes | `INTERACTIVE_PRESENTATION_SPEC.md` §4.1 / §4.5 / §6.1 / §6.3 / §6.4 / §6.5 / §7 의 drill-in 박제 (deprecation 마킹) |

---

## 0. 한 줄 paradigm

**선택만으로 무한 nesting 을 navigate한다. 편집 모드의 mode 전환 (drill-in zoom / breadcrumb) 없음.** Figma 의 selection model 그대로.

`INTERACTIVE_PRESENTATION_SPEC.md` §8 (L466) 의 명시 의도 *"drill-in 없이 한 화면에 모두 표시 — Figma 식 spatial"* 가 본 spec 의 정통 paradigm.

**편집 모드의 zoom 은 사용자 명시 zoom 한정** (Ctrl+Wheel, Zoom controls UI, future Shift+2 zoom-to-selection). Present 모드의 camera transition zoom 은 본 spec 의 scope 외 — PresentPage 의 storytelling zoom 은 별건 유지.

---

## 1. Selection state 모델

### 1.1 Single selection (v1 default)

```ts
type Selection =
  | null
  | { kind: "frame"; id: ItemId }
  | { kind: "shape"; frameId: ItemId; shapeId: ItemId };
```

- frame selection 과 shape selection 은 상호배타.
- selection 변경 시 add target 변경 (`selectedFrameId ?? root` 의 자식).

### 1.2 Multi-frame selection (API 존재, UI 부분)

- `selectedIds: Set<ItemId>` — 같은 parent 의 sibling frame 들만 (cross-parent multi-select 는 v1.x).
- API: `selectFrames(ids)` / `addFrames(ids)` / `toggleFrames(ids)` — `selection-context.tsx` 이미 존재.
- UI 활용 v1 = marquee + Shift-click. v1.x = layer panel 의 Shift-click.

### 1.3 Selection 변경 = state-only

selection 은 transient state. **document mutation 아님, History 통과 아님**. Figma 와 동일.

Layer Picker 의 menu click → selection 이동만, document 변경 0.

---

## 2. A1 Parent-first auto-select

### 2.1 정확한 동작

frame 을 클릭했을 때 (modifier 없음):

```
trail = findTrailDeep(doc.root, clickedFrameId)  // [root, ..., parent, clickedFrameId]
current = selection.frameId

if (current && trail.includes(current)):
  # 이미 그 context 안 — 한 level 더 깊이 또는 leaf 까지
  setSelection({ kind: "frame", id: clickedFrameId })
else:
  # 새로운 context — top-level frame 부터
  topLevelInTrail = trail[1] ?? clickedFrameId   # trail[0] = root
  setSelection({ kind: "frame", id: topLevelInTrail })
```

### 2.2 Edge cases

| 시나리오 | 결과 |
|---|---|
| 빈 영역 클릭 | selection clear |
| root 자체 클릭 (없음 — root 는 클릭 대상 아님) | N/A |
| 같은 frame 재클릭 | unchanged |
| 부모 frame 클릭 (현재 child 선택 중) | parent 로 이동 (drill-up 효과) |
| 다른 top-level frame 클릭 | 그 top-level frame 으로 |
| 깊은 nested frame 클릭 (현재 그 context 외) | top-level frame 으로 (drill 1 level only) |
| 같은 context 의 deeper nested 클릭 | leaf 까지 (drill 무제한) |

### 2.3 Rationale

Figma 의 "always 1 level deeper than current context" 휴리스틱. 사용자가 한 번 클릭 = 한 level drill-down. 깊은 leaf 는 여러 번 클릭으로 도달.

빠른 접근은 A2 (Cmd-click) + A4 (Layer Picker).

---

## 3. A2 Cmd/Ctrl-click deep select

### 3.1 정확한 동작

```
if (e.metaKey || e.ctrlKey):
  setSelection({ kind: "frame", id: clickedFrameId })  # 깊이 무관 leaf
```

### 3.2 플랫폼 가드

- macOS = `e.metaKey` (Cmd)
- Win/Linux = `e.ctrlKey` (Ctrl)
- 둘 다 cover (browser 의 표준 modifier).

### 3.3 Multi-modifier 조합

| Modifier | 동작 |
|---|---|
| (none) | A1 parent-first |
| Cmd/Ctrl | A2 deep select |
| Shift | multi-frame toggle (기존 selection 에 추가/제거) |
| Cmd+Shift | deep select + multi-frame toggle |

---

## 4. A3 Keyboard navigation

### 4.1 4 Hotkey

| Hotkey | 동작 | logic |
|---|---|---|
| `Enter` | drill-down 1 level | current selection 의 `children[0]` 로 |
| `Shift+Enter` | drill-up 1 level | current selection 의 parent 로 |
| `Tab` | next sibling | parent.children 의 next index |
| `Shift+Tab` | prev sibling | parent.children 의 prev index |

### 4.2 Guard

다음 상태에서 hotkey **deactivate**:

- text-edit 모드 (Lexical 진입) — `document.activeElement?.contentEditable === "true"` 또는 Lexical 의 focus state.
- input/textarea focus
- ContextMenu / Dialog / Popover open
- present 모드 (PresentPage active)

### 4.3 Wrap-around

- Tab 의 last sibling → first sibling (wrap)
- Shift+Tab 의 first → last (wrap)
- Enter 의 leaf → unchanged (children empty)
- Shift+Enter 의 root child → unchanged (root 의 parent 없음)

### 4.4 IME / a11y

- Lexical 의 IME composition state 안전. WI-029 의 LexicalTextEditor 가 이미 IME 검증.
- screen reader 호환 — hotkey 발화 시 selection 변경을 `aria-live` 로 announce 가능 (v1.x optional).

---

## 5. A4 Right-click Layer Picker

### 5.1 정확한 동작

frame 위 우클릭:

```
1. hit-test(canvas.x, canvas.y) → overlapping frames sorted by depth (deepest first)
2. Layer Picker menu 표시:
   ┌────────────────────────────┐
   │ Select layer               │
   │   • Frame 3 (deepest)      │
   │   • Frame 2                │
   │   • Frame 1 (top-level)    │
   ├────────────────────────────┤
   │ Delete                     │  ← 기존 ContextMenu 항목
   │ Duplicate (future)         │
   │ Move up / down (future)    │
   └────────────────────────────┘
3. user clicks a layer → setSelection({ kind: "frame", id: ... })
```

### 5.2 Hit-test 알고리즘

```ts
function hitTest(designPlaneX: number, designPlaneY: number, root: Item): Item[] {
  const hits: Array<{ item: Item; depth: number }> = [];
  
  function walk(item: Item, depth: number, absFrame: AbsFrame) {
    if (item.kind === "frame" && pointInRect(designPlaneX, designPlaneY, absFrame)) {
      hits.push({ item, depth });
    }
    for (const child of item.children ?? []) {
      const childAbsFrame = computeAbsFrame(absFrame, child.attrs.frame);
      walk(child, depth + 1, childAbsFrame);
    }
  }
  
  walk(root, 0, { x: 0, y: 0, w: designWidth, h: designHeight });
  hits.sort((a, b) => b.depth - a.depth);  // deepest first
  return hits.map(h => h.item);
}
```

좌표 변환:
- viewport (event.clientX, clientY) → design plane (transform inverse) — FrameStage 의 zoom/pan state 활용.

### 5.3 Menu UI

- 최상단 = "Select layer" section header
- 그 아래 = overlapping items list (depth 순)
  - 각 item 의 label = `frame.attrs.label` ?? "Frame" + position info
  - hover → 해당 frame 의 outline 강조 (preview)
- 구분선
- 기존 ContextMenu 항목 (Delete, Duplicate future, Move future)

### 5.4 Design System Triage

- ContextMenu primitive (DR-design-005) 재사용 우선.
- 신규 sub-section header / nested menu item 필요 시 `design-system-agent` review + `DR-design-NNN-*.md` 발행.

---

## 6. 사용자 명시 zoom (편집 모드)

selection 으로 인한 **자동 zoom 없음**. 다음 표준만:

| 입력 | 동작 |
|---|---|
| `Ctrl + mouse wheel` | zoom in / out at cursor |
| Zoom controls UI (우하단) | fit / 100% / + / − |
| (v1.x) `Shift + 2` | zoom-to-selection (Figma 표준) |
| (v1.x) `Shift + 1` | zoom-to-fit-design |

전부 사용자가 명시적으로 호출. selection 변경 시 viewport 변화 없음.

---

## 7. Text-edit 모드의 selection guard

Lexical text-edit 진입 시:

- 4 keyboard nav (Enter / Shift+Enter / Tab / Shift+Tab) deactivate.
- Parent-first / Cmd-click 의 frame onClick 도 deactivate (Lexical 이 click event 흡수).
- text-edit 종료 (focusout 또는 Esc) → selection model 회복.

WI-029 의 LexicalTextEditor 가 이미 focus state 노출. 그 state 를 guard 로 사용.

---

## 8. Accessibility

### 8.1 Focus

- selection 변경 시 그 frame 에 `tabIndex={0}` + `:focus-visible` outline.
- keyboard nav 4 hotkey 가 focus 변경 동반.
- focus ring = design system token `--focus-ring`.

### 8.2 ARIA

- frame 의 wrapper element `role="group"` + `aria-label={frame.attrs.label ?? "Frame"}`.
- Layer Picker menu `role="menu"` (Radix ContextMenu 표준).
- 선택 상태 `aria-selected="true"` (또는 frame 의 wrapper 의 `data-selected`).

### 8.3 prefers-reduced-motion

- selection 변경 시 zoom transition 없음 (paradigm 자체로 충족).
- focus ring 의 transition 만 — `@media (prefers-reduced-motion: reduce)` 시 `transition: none`.

---

## 9. E2E 의도

4 신규 spec (acceptance 의무):

### 9.1 `figma-parent-first-select.spec.ts`

- 중첩 frame 클릭 시 parent 먼저 선택 (level 1, 2, 3).
- 같은 context 의 child 재클릭 시 leaf.
- 다른 top-level frame 클릭 시 그 top-level 로 이동.

### 9.2 `figma-cmd-click-deep-select.spec.ts`

- Cmd-click 시 nesting 깊이 무관 leaf.
- 다양한 nesting 깊이 (2 / 3 / 4 levels).
- macOS = metaKey, 비-macOS = ctrlKey 가드.

### 9.3 `figma-keyboard-selection-nav.spec.ts`

- Enter / Shift+Enter / Tab / Shift+Tab 4 hotkey 동작.
- text-edit 모드 진입 시 deactivate.
- Lexical 의 IME composition 안전.
- wrap-around 동작.

### 9.4 `figma-right-click-layer-picker.spec.ts`

- 우클릭 시 Layer Picker popup 표시.
- overlapping items list 가 depth 순.
- 클릭 시 selection 이동.
- 기존 ContextMenu 항목 (Delete) 도 표시.

**Hygiene 의무** (RISK-005 condition #8):
- 각 spec 시작 `await clearAllDesigns()` (cursor reset + networkidle).
- StrictMode singleton dispose 금지.

---

## 10. 명시적으로 *하지 않는* 것

향후 paradigm drift 재방지를 위해:

- **드릴인 zoom mode 안 함** — 편집 모드에 자동 zoom 없음. Figma 정통 paradigm. Present 모드의 storytelling zoom 은 별건.
- **Breadcrumb UI 안 함** — selection state 만으로 충분. parent-trail 시각화는 Layers panel (v1.x) 이 별건 담당.
- **"Enter frame" mode-switch 메뉴 항목 안 함** — Enter hotkey = drill-down selection 만.
- **다중 selection 모드 (frame / shape 동시) 안 함 (v1)** — single selection 만. multi-frame 은 sibling 한정.
- **Right rail에 selection 전용 panel 안 함 (v1)** — 기존 PropertiesPanel 통합.

---

## 11. 변경의 책임

- 이 문서가 selection model 의 single source of truth.
- selection 패러다임 변경 시 이 문서 우선 갱신 → 코드.
- 새 hotkey 추가 시 §4.1 표 갱신.
- 새 modifier 조합 추가 시 §3.3 표 갱신.
- a11y / IME 변화 시 §7 / §8 갱신.
- v1.x deferred 항목 진행 시 §6 / §10 갱신.

---

## Appendix A — 박제 위치 (구현 시)

| 컴포넌트 | 역할 | 파일 |
|---|---|---|
| `SelectionContext` | selection state owner | `apps/web/src/document/interactions/selection-context.tsx` |
| `NestedFrame onClick` | A1 + A2 분기 | `apps/web/src/pages/FrameStage.tsx` |
| `hit-test service` | A4 의 overlapping items 조회 | `apps/web/src/document/layer-picker/hit-test.ts` (신규) |
| `LayerPickerMenu` | A4 menu UI | `apps/web/src/document/layer-picker/LayerPickerMenu.tsx` (신규) |
| `keyboard nav commands` | A3 의 4 hotkey | `apps/web/src/document/commands.ts` + CommandMetadata registry |
| `text-edit guard` | A3 의 deactivate | Lexical focus state hook reuse |

---

## Appendix B — 관련 records

- **WI-033** — figma frame UX adoption (본 spec 의 source)
- **DR-017** — Phase 12 drill-in 폐기 + Figma selection 채택
- **FR-006** — FEASIBLE WITH TRADE-OFFS
- **RISK-005** — GO WITH CONDITIONS, 10 conditions
- **DR-016** — text resize Figma 100% (sibling decision, 같은 "Figma 100%" paradigm)
- **DR-design-005** — editor chrome primitives (Layer Picker 의 ContextMenu primitive reuse 권장)
- **INTERACTIVE_PRESENTATION_SPEC.md** — 본 spec 이 supersede 한 drill-in 박제의 출처. §8 L466 의 *"drill-in 없이"* 만 정통 paradigm 유지.
