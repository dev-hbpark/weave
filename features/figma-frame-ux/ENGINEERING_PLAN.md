# Engineering Plan — figma-frame-ux (WI-033)

| Field | Value |
|---|---|
| Feature | figma-frame-ux |
| Owner | hbpark |
| Triggering Work Item | WI-033 |
| Related records | DR-017 (Figma selection model), FR-006 (FEASIBLE WITH TRADE-OFFS), RISK-005 (GO WITH CONDITIONS, 10 conditions), LG-001 |
| Status | **CONDITIONAL APPROVAL — both sign-offs done 2026-05-26 (FE: 7 conditions C1-C7, DS: 10 conditions, Triage=Extended)**. C1-C4 (FE) PR-block applied. DR-design-011 발행 의무 (DS C1). Build 진입 ready. |
| Target | v1 launch (LG-001 T-0 = 2026-06-08, D-13 from 2026-05-26) |
| Last update | 2026-05-26 |

---

## 0. 목적 — 한 줄

weave 의 frame 편집 UX 를 Figma 의 selection model 로 정렬. Phase 12 의 drill-in mode (enteredFrameStack + zoom + breadcrumb + ContextMenu "Enter frame") 전체 폐기, Selection 강화 4종 흡수.

---

## 1. Scope (DR-017 / WI-033 와 일치)

### 1.1 In scope (v1)

- **A. Selection 강화 4종**: A1 parent-first / A2 Cmd-click deep / A3 keyboard nav (Enter/Shift+Enter/Tab/Shift+Tab) / A4 layer picker.
- **B. drill-in mode 제거**: B1 state / B2 zoom / B3 breadcrumb / B4 ContextMenu menu / B5 commands.
- **C. Spec 정정**: C1 INTERACTIVE_PRESENTATION_SPEC deprecation / C2 신규 FIGMA_SELECTION_MODEL_SPEC.
- **D. e2e 정정**: D1 frame-drill-in.spec.ts test.skip / D2 신규 4 spec.
- **E. Launch note in-app**: 1 주 노출 + 회수.

### 1.2 Out of scope (v1)

- Frame styling (stroke / effects / clipContent / layout grid / auto layout) — v1.1
- Constraints / Auto Layout — v2
- Component / Variant — v2
- Tool hotkeys (R/E/L/T) — v1.x
- Zoom-to-selection hotkey (`Shift+2`) — v1.x
- Mini-map / Left rail design tree — v1.x

---

## 2. Phasing — P1 → P2 → P3

```
D1 (2026-05-27) ────────────── D13 (2026-06-07)
  │
  ├─ P1 (D1-D5): Selection 강화 4종
  │     ├─ A1 parent-first auto-select
  │     ├─ A2 Cmd-click deep select
  │     ├─ A3 keyboard navigation (4 hotkey)
  │     └─ A4 right-click layer picker
  │
  ├─ P2 (D5-D11): drill-in mode 전체 제거 ← contingency point at D11
  │     ├─ B1 state 제거 (enteredFrameStack + setter + effect)
  │     ├─ B2 zoom transition 제거
  │     ├─ B3 breadcrumb mount 제거
  │     ├─ B4 ContextMenu "Enter frame" 제거
  │     └─ B5 commands 정리
  │
  └─ P3 (D11-D13): Spec/Test 정정
        ├─ C1 INTERACTIVE_PRESENTATION_SPEC deprecation 마킹
        ├─ C2 FIGMA_SELECTION_MODEL_SPEC 발행
        ├─ D1 frame-drill-in.spec.ts test.skip + v1.x todo
        ├─ D2 selection 4 spec 신규
        └─ E  launch note in-app
```

**Contingency** (RISK-005 condition #3): D11 (2026-06-04) 시점에 P2 미완 시 P1 + P3 만 v1, P2 (drill-in 제거) 는 v1.1 로 미룸. paradigm shift incremental rollout.

---

## 3. P1 — Selection 강화 4종

### 3.1 A1 Parent-first auto-select

**무엇**: child frame 클릭 → 부모 frame 먼저 선택. 같은 frame 의 child 가 이미 선택된 상태에서 다시 그 child 클릭 → child 유지 ("already-in-context" 휴리스틱).

**Architecture (FE sign-off C1 적용)**:

> **helper 의 위치 = `SelectionContext` 의 export (pure function)**, NestedFrame body 가 아님. NestedFrame onClick 의 책임 = DOM event → intent translation 까지. SelectionContext 가 selection state machine (SRP). 현 SelectionContext 는 이미 vm shim — vm.itemSelection (agocraft EditorViewModel slot) 이 SSOT, 리팩토링 0.

**파일**:
- `apps/web/src/document/interactions/selection-context.tsx` — 신규 export `selectFromHit(hitId, intent, doc, current): Selection | null` (pure function)
- `apps/web/src/pages/FrameStage.tsx` — NestedFrame `onClick` handler 의 modifier read + helper 호출만
- `apps/web/src/document/agocraft-mirror.ts` — `findTrailDeep` 재사용 (FrameStage.tsx:31 import 확인)

**구현 요지 (정정)**:

```ts
// selection-context.tsx (신규 export, pure)
type ClickIntent = "plain" | "deep" | "toggle";

export function selectFromHit(
  hitId: ItemId,
  intent: ClickIntent,
  doc: AgocraftDocument,
  current: Selection | null
): Selection | null {
  if (intent === "deep") {
    return { kind: "frame", id: hitId };
  }
  if (intent === "toggle") {
    // multi-frame toggle path (기존 toggleFrames 위임)
    return { kind: "frame", id: hitId };
  }
  // plain — A1 parent-first
  const trail = findTrailDeep(doc.root, hitId); // [root, ..., hitId]
  const currentId = current?.kind === "frame" ? current.id : undefined;
  const inCurrentContext = currentId && trail.some(t => t.id === currentId);
  if (inCurrentContext) {
    return { kind: "frame", id: hitId }; // 이미 그 context — leaf 까지
  }
  const topLevelInTrail = trail[1]?.id ?? hitId; // trail[0] = root
  return { kind: "frame", id: topLevelInTrail };
}
```

```tsx
// FrameStage.tsx NestedFrame onClick (intent translation 만)
const onClick = (e: MouseEvent) => {
  const intent: ClickIntent =
    e.metaKey || e.ctrlKey ? "deep" :
    e.shiftKey ? "toggle" :
    "plain";
  const next = selectFromHit(itemId, intent, doc, selection);
  if (next) selectionContext.selectFrame(next.id);
};
```

**Edge cases**:
- root 자체 클릭 → selection clear (NestedFrame onClick 의 호출 안 됨, stage background onClick 이 처리).
- trail 의 첫 frame 이 이미 selected → 다음 level 까지 (drill-down 효과).
- multi-frame selection 활성 시: Shift = toggle (기존 `toggleFrames`), Cmd = deep. Cmd+Shift = deep + toggle (helper 가 union 처리).
- selection type narrowing: `current?.kind === "frame" ? current.id : undefined` — `selection.frameId` 직접 access 금지 (Selection 은 discriminated union).

### 3.2 A2 Cmd/Ctrl-click deep select

A1 의 분기에서 처리. modifier 키 = nesting 깊이 무관 leaf 즉시 선택.

**플랫폼 가드**:
- macOS: `e.metaKey` (Cmd)
- Win/Linux: `e.ctrlKey` (Ctrl)
- 동시에 `e.shiftKey` 면 multi-select 모드 (기존 multi-frame API 활용)

### 3.3 A3 Keyboard navigation

**무엇**: `Enter` = drill-down (first child 로), `Shift+Enter` = drill-up (parent 로), `Tab` = next sibling, `Shift+Tab` = prev sibling.

**Architecture (FE sign-off C2 적용)**:

> **위치 = `apps/web/src/document/tooltip/editor-hotkeys.ts:245` 의 `editorCommandMetadata.register(meta)`**. WI-026 의 CommandMetadata SSOT — 정통 hotkey 경로. inline `if (key === "Enter")` 또는 action body 안의 `if (activeElement)` **절대 금지** (Rule 6).

**파일**:
- `apps/web/src/document/tooltip/editor-hotkeys.ts:245` — `editorCommandMetadata.register(...)` 로 4 신규 entry
- `apps/web/src/pages/DesignPage.tsx:691-709` — `commandContext` useMemo 에 `isTextEditing: boolean` 추가
- selection-context.tsx — sibling/parent 조회 helper export (`nextSiblingOf`, `prevSiblingOf`, `parentOf`, `firstChildOf` — 모두 pure)

**4 CommandMetadata entry**:

```ts
// editor-hotkeys.ts:245 부근
editorCommandMetadata.register({
  id: "weave.selection.drillDown",
  hotkey: "Enter",
  enabledWhen: ctx => !ctx.isTextEditing && ctx.selection?.kind === "frame",
  action: (ctx) => {
    const next = firstChildOf(ctx.selection!.id, ctx.doc);
    if (next) ctx.selectFrame(next);
  },
});
editorCommandMetadata.register({
  id: "weave.selection.drillUp",
  hotkey: "Shift+Enter",
  enabledWhen: ctx => !ctx.isTextEditing && ctx.selection?.kind === "frame",
  action: (ctx) => {
    const parent = parentOf(ctx.selection!.id, ctx.doc);
    if (parent) ctx.selectFrame(parent);
  },
});
editorCommandMetadata.register({
  id: "weave.selection.nextSibling",
  hotkey: "Tab",
  enabledWhen: ctx => !ctx.isTextEditing && ctx.selection?.kind === "frame",
  action: (ctx) => {
    const next = nextSiblingOf(ctx.selection!.id, ctx.doc); // wrap-around
    if (next) ctx.selectFrame(next);
  },
});
editorCommandMetadata.register({
  id: "weave.selection.prevSibling",
  hotkey: "Shift+Tab",
  enabledWhen: ctx => !ctx.isTextEditing && ctx.selection?.kind === "frame",
  action: (ctx) => {
    const prev = prevSiblingOf(ctx.selection!.id, ctx.doc); // wrap-around
    if (prev) ctx.selectFrame(prev);
  },
});
```

**text-edit guard (commandContext.isTextEditing)**:

```ts
// DesignPage.tsx:691-709 commandContext useMemo 에 추가
const [isTextEditing, setIsTextEditing] = useState(false);

useEffect(() => {
  const onFocusIn = (e: FocusEvent) => {
    const t = e.target;
    if (t instanceof HTMLElement && t.matches('[contenteditable="true"], input, textarea')) {
      setIsTextEditing(true);
    }
  };
  const onFocusOut = (e: FocusEvent) => {
    // focusout 이 또 다른 contenteditable 로 이동했는지 활용 (e.relatedTarget)
    const t = e.relatedTarget;
    if (!(t instanceof HTMLElement && t.matches('[contenteditable="true"], input, textarea'))) {
      setIsTextEditing(false);
    }
  };
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  return () => {
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", onFocusOut);
  };
}, []);

const commandContext = useMemo(() => ({
  // ... existing fields
  isTextEditing,
  // ... selection, doc, selectFrame
}), [/* ..., */ isTextEditing]);
```

**Edge cases / wrap-around**:
- Tab last sibling → first sibling (wrap).
- Shift+Tab first → last (wrap).
- Enter leaf (children empty) → unchanged (no-op).
- Shift+Enter root child → unchanged (root 의 parent 없음).
- ContextMenu / Dialog open 시 deactivate = Radix 의 default focus trap 이 처리 (commandContext 의 `isTextEditing` 외 추가 가드 불필요).

### 3.4 A4 Right-click layer picker

**무엇**: 우클릭 시 cursor 아래 overlapping frame/item list popup. 클릭 시 그 item 으로 선택 이동.

**파일**:
- 신규 컴포넌트: `apps/web/src/document/layer-picker/LayerPickerMenu.tsx` 또는 ContextualToolbar 안에 통합 (Design System Triage 후 결정)
- `apps/web/src/pages/FrameStage.tsx` — NestedFrame `onContextMenu` handler 의 hit-test
- `apps/web/src/document/agocraft-mirror.ts` — canvas 좌표 → 모든 ancestor frame 의 absolute frame 계산 → bbox 포함 여부 (helper 신규)

**Hit-test**:
- canvas 좌표 (event.clientX, clientY) → design plane 좌표 (transform inverse)
- 모든 frame 의 absolute frame 계산 (trail walk × ratio)
- bbox 포함 list 수집 + nesting 깊이 sort (가장 깊은 frame 먼저, root 가 마지막)

**Menu UI**:
- 메뉴 상단 = "Select layer" section (overlapping list)
- 메뉴 하단 = 기존 ContextMenu 항목 (Delete, Duplicate future, Move up/down)
- Design System Triage: ContextMenu primitive 재사용 (DR-design-005 박제) 우선 + 신규 SubmenuItem 필요 시 design review.

### 3.5 P1 Acceptance

- [ ] A1 e2e: child frame 클릭 시 parent 먼저 선택. 같은 context 의 child 재클릭 시 child 유지.
- [ ] A2 e2e: Cmd-click 시 nesting 깊이 무관 leaf 즉시 선택.
- [ ] A3 e2e: 4 hotkey 동작 + text-edit 모드 deactivate.
- [ ] A4 e2e: 우클릭 시 layer picker popup 표시 + 선택 가능.
- [ ] `frontend-architecture-agent` sign-off (selection state ownership).
- [ ] `design-system-agent` sign-off (Layer Picker UI).

---

## 4. P2 — drill-in mode 전체 제거

### 4.1 제거 대상 (정확한 위치 — FE sign-off C3 / C4 적용)

> **FE sign-off 발견**: enteredFrameStack 의 실제 owner = agocraft `EditorViewModel.enteredFrameStack` slot. DesignPage 가 consumer. FrameStage 는 props receiver. `weave.frame.enter/exit` command **존재하지 않음** — React state setter 로 직접 발사.

| 영역 | 파일 | 정확 라인 | 처리 |
|---|---|---|---|
| **vm slot consumer** | `apps/web/src/pages/DesignPage.tsx` | L609 (consumer) + L612-623 (setter wire) + L636-648 (Esc effect) + L1105-L1107 + L1129-L1130 (props pass-through) | 모두 제거. `vm.enteredFrameStack` 사용 site 0 |
| **breadcrumb mount** | `apps/web/src/pages/DesignPage.tsx` | L813-844 (전체 `<nav aria-label="Breadcrumb">` block) + L824 setEnteredFrameId(undefined) onClick | 전체 block 제거 |
| **FrameStage drill chain** | `apps/web/src/pages/FrameStage.tsx` | L31 (findTrailDeep import 유지), L192-221 (`computeDrillStaggered` / `computeDrillDimFlags` helpers), L399-429 (NestedFrame `drillOpacityMV` / `drillDimmed` chain), L589-602 (NestedFrame onClick 의 manual 2-click counter `clickCountRef` + `onEnter?.(itemId)` 분기), L840-862 (`absoluteFrameFor` 함수), L910 (`enteredId` prop), L932-944 (`enteredTrailIds` useMemo + `absFrame`), L946-965 (`drillProgressMV` useMotionValue + `zoom` useMemo), L1088-1091 (pan reset effect), L1683-1692 (outer double-click `onFitAll` handler), L1765 (NestedFrame `onEnter` chain) | drill chain 전체 제거. NestedFrame 더블클릭 = text-edit 만 (L585 `data-double-click-edit="true"` 가드 유지). outer double-click = 단순 deselect 또는 분리 |
| **FrameContextMenu** | `apps/web/src/pages/DesignPage.tsx` | L98-133 (`FrameContextMenu` inline component) + L120 `ctx-enter-frame` ContextMenuItem + L1127-L1139 mount + L1129-L1130 onEnter callback | "Enter frame" 항목 + callback 제거. 잔여 항목 (Delete + future Duplicate/Move) 유지. P1 A4 의 LayerPickerMenu 와 결합 |
| ~~commands~~ | ~~commands.ts~~ | **N/A** | `weave.frame.enter/exit` 라는 command 는 코드에 존재하지 않음. React state setter (`setEnteredFrameId`) 로 직접 발사. 제거 대상 0 |
| ~~CommandMetadata~~ | ~~weave registry~~ | **N/A** | 위와 같은 이유로 N/A |
| **agocraft vm slot 자체** | `agocraft EditorViewModel.enteredFrameStack` | TBD (agocraft 별 PR) | weave 의존 deprecation 후 launch +24h handoff (FE sign-off C5). v1 launch 전 의무 아님 |
| **e2e 잔여 grep** | `apps/web/e2e/helpers.ts` + `apps/web/e2e/*` | grep `enteredFrameId\|__weaveVm\.enteredFrameStack` | 모든 잔여 사용 제거 (FE sign-off C6) |

### 4.2 의존성 정리

- `useDesign` / `use-weave-editor` 의 entered frame 의존성 → selection 의존성으로 대체 (Add target = selected frame ?? root).
- ThumbnailPanel 의 entered frame 의존 (있다면) → selected frame 의존.
- e2e helpers.ts 의 entered frame readiness gate (있다면) → 제거.

### 4.3 Present 모드 보존 확인

- `PresentPage` 의 camera spring 520ms cubic-bezier(0.34, 1.20, 0.64, 1) — **제거 대상 아님**.
- present 의 storytelling zoom 은 USP 핵심. e2e (`present-*.spec.ts`) PASS 유지 확인.

### 4.4 Add target 변경

- 기존: `enteredFrameId ?? selectedFrameId ?? root`
- 새: `selectedFrameId ?? root`
- 동일한 의도 (deepest active context), drill-in 한 단계 없을 뿐.

### 4.5 P2 Acceptance

- [ ] grep `enteredFrameStack` — 0 hits.
- [ ] grep `drill-in` (코드 comment 포함) — 0 hits (편집 모드 한정. present 의 zoom 은 다른 단어).
- [ ] grep `breadcrumb` (편집 모드 한정) — 0 hits.
- [ ] grep `"Enter frame"` — 0 hits.
- [ ] `weave.frame.enter` / `weave.frame.exit` commands — CommandMetadata registry 에서 사라짐.
- [ ] Present 모드 e2e PASS 유지.
- [ ] Add 의 target 이 selected frame 으로 변경. e2e PASS.

---

## 5. P3 — Spec / Test / Launch note 정정

### 5.1 C1 INTERACTIVE_PRESENTATION_SPEC.md 정정

| 섹션 | 처리 |
|---|---|
| §4.1 view 상태 — "entered frame" 행 | deprecation note + DR-017 cross-ref. selection state 만 남김 |
| §4.5 ContextMenu — "Enter frame" | deprecation, 항목 제거 명시 |
| §6.1 layout 의 breadcrumb 부분 | deprecation note. selection-only navigation 명시 |
| §6.3 인터랙션 표 — `double-click on frame → Enter (drill-in zoom)` | "drill-down selection (no zoom)" 으로 갱신 |
| §6.4 단축키 — Enter/Esc/Tab | 새 의미 (drill-down/up selection) 명시 |
| §6.5 visual — drill-in zoom transition (cubic-bezier spring) | "Present 모드 한정, 편집 모드는 사용 안 함" 명시 |
| §7 v0 roadmap — [x] drill-in zoom + breadcrumb | ~~deprecated WI-033~~ 마킹 |
| §8 안 함 list — L466 "drill-in 없이" | 현재 paradigm 임을 명시화 강화 |

### 5.2 C2 신규 FIGMA_SELECTION_MODEL_SPEC.md

**위치**: `docs/product/FIGMA_SELECTION_MODEL_SPEC.md`

**목차**:
1. 목적 + paradigm 한 줄
2. selection state 모델 (single / multi)
3. parent-first auto-select 의 정확한 동작 + edge case
4. Cmd-click deep select 의 정확한 동작
5. keyboard navigation 4 hotkey + guard
6. Layer picker UI + hit-test 알고리즘
7. 사용자 명시 zoom 의 표준 (Ctrl+Wheel, Zoom controls)
8. text-edit 모드의 selection guard
9. accessibility (focus / aria / IME)
10. e2e 의도 (4 신규 spec)
11. 안 함 list (drill-in zoom / breadcrumb / etc)

### 5.3 D1 frame-drill-in.spec.ts test.skip

- 4 spec 모두 `test.skip` 으로 wrap + 상단 comment 에 "WI-033 supersede, v1.x 정식 정정 todo" 박제.

### 5.4 D2 selection 4 신규 spec

| spec 파일 | 검증 |
|---|---|
| `apps/web/e2e/figma-parent-first-select.spec.ts` | A1. 중첩 frame 클릭 시 parent 먼저 선택. 같은 context 재클릭 시 leaf. |
| `apps/web/e2e/figma-cmd-click-deep-select.spec.ts` | A2. Cmd-click 시 nesting 무관 leaf. 다양한 nesting 깊이 (2/3/4 levels). |
| `apps/web/e2e/figma-keyboard-selection-nav.spec.ts` | A3. Enter/Shift+Enter/Tab/Shift+Tab 4 hotkey. text-edit 모드 deactivate 가드. |
| `apps/web/e2e/figma-right-click-layer-picker.spec.ts` | A4. 우클릭 시 layer picker popup. overlapping items list. 선택 시 selection 이동. |

**Hygiene 의무** (RISK-005 condition #8):
- 각 spec 시작 시 `await clearAllDesigns()` (cursor reset + networkidle).
- StrictMode singleton dispose 금지 — selection state 가 useEffect cleanup 에서 dispose 하지 않게.
- group 실행 시 timing race 회피 — single PASS / group fail 패턴 사전 확인.

### 5.5 E Launch note in-app

**파일**: `apps/web/src/launch-notes/wi-033-figma-selection.tsx` (또는 기존 launch-notes 디렉터리)

**노출 조건**:
- v1 launch 직후 1주 (2026-06-08 → 2026-06-15)
- 첫 frame 클릭 시 1회 표시 + dismiss
- localStorage `weave.launch-note.wi033-dismissed` 으로 추적

**내용**:
- Headline: "Figma-style 선택 모델"
- 4 hotkey 시각화 (Cmd-click / Enter / Tab / 우클릭)
- "1주 후 회수" 안내

---

## 6. SOLID + GRASP review (8 surfaces)

CLAUDE.md 의 의무. 8 surface 별 review.

| Surface | SOLID + GRASP 적용 |
|---|---|
| **SelectionContext** | SRP — selection state 만. multi-frame API 와 단일 API 의 union 은 internal. ISP — drill-down / drill-up / sibling 의 4 method 는 같은 interface. OCP — keyboard hotkey 추가는 EDITOR_HOTKEYS registry 의 entry 추가만. |
| **NestedFrame onClick** | SRP — click → selection 변경만. 분기 로직 (parent-first / deep select) 은 helper function 로 추출. Information Expert — trail walk 은 agocraft-mirror 의 helper 가 expert. |
| **LayerPickerMenu** | SRP — menu rendering 만. hit-test 는 별도 service. OCP — Layer Picker 의 menu item 추가는 registry 패턴. Liskov — ContextMenu primitive 와 정확히 같은 contract (Radix). |
| **Hit-test service** | SRP — 좌표 → frame list 만. Pure function (no side effect). High Cohesion — trail walk + bbox 포함 + sort 의 함께 묶이는 책임. |
| **CommandMetadata 의 keyboard nav** | OCP — 4 hotkey 의 entry 추가만. ISP — `weave.selection.*` namespace 분리. Polymorphism — 모든 selection command 가 동일 input/output. |
| **drill-in 제거 후 FrameStage** | SRP 회복 — Phase 12 의 FrameStage 가 selection + drill-in + zoom + manipulation 다중 책임. drill-in 제거 후 selection + manipulation 만. LOC ↓ 100-150 줄. |
| **Add target 결정** | DIP — Add 명령이 selection state 에 의존 (entered state 의존 제거). selection 의 abstract interface 만. Low Coupling. |
| **Spec SSOT** | SRP — `FIGMA_SELECTION_MODEL_SPEC.md` 가 selection model 만. INTERACTIVE_PRESENTATION_SPEC 은 frame + present + 전체 paradigm. Cross-ref. High Cohesion. |

**Rule 6 (declarative branching) 준수**:
- selection mode 분기 (parent-first / deep / sibling / drill) = modifier guard + helper function. `switch (mode)` 없음.
- keyboard hotkey 분기 = CommandMetadata registry. inline `if (hotkey === "Enter")` 없음.
- Layer Picker 의 menu item = registry 패턴 (기존 ContextMenu 와 일관).

---

## 7. Document mutation rule 준수

CLAUDE.md 의 의무. selection 변경은 commands 가 아니라 SelectionContext 직접 변경 (state-only, History 통과 아님). 단:

- **Layer Picker 의 click → selection 이동 + add target 변경**: selection state 만 변경. document mutation 없음.
- **selection 변경 자체는 History 통과 아님**: Figma 도 동일. selection 은 transient state.
- **keyboard nav 의 4 hotkey** 도 동일: state 만, document mutation 없음.

→ Document mutation rule 영향 0. WI-033 이 mutation 을 추가하지 않음.

---

## 8. Dependencies / Blockers

### 8.1 Sign-offs (build 진입 전 의무) — **DONE 2026-05-26**

- [x] **`frontend-architecture-agent` sign-off** — **CONDITIONAL APPROVAL**, 7 conditions (C1-C4 PR-block — Engineering Plan 정정 적용, C5-C7 launch-block).
  - 핵심 발견: enteredFrameStack 의 실제 owner = agocraft `EditorViewModel`. `weave.frame.enter/exit` command 존재 안 함. SelectionContext 가 vm shim 으로 이미 정렬.
- [x] **`design-system-agent` sign-off** — **CONDITIONAL APPROVAL**, Triage = **Extended (Step 2)**.
  - DR-design-005 §10 의 open question 이 본 review 에서 closed. DR-design-011 발행 의무 (ContextMenu Label/Group parity).
  - LayerPickerMenu = app-local composition (design-system primitive 아님 — variant explosion 방지).
- DR-design-011 발행 = P1 A4 build 진입 전 PR-block.

### 8.2 의존 WI

- **WI-032 (frame-only paradigm)** — selection 강화는 frame-only 위에 자연 흡수. Phase 3c 의 잔여 (12 fail spec) 와 직교. 일정 충돌 없음.
- **WI-029 (text v1)** — keyboard nav guard 가 Lexical text-edit 모드 detect 의존. WI-029 의 LexicalTextEditor 이미 머지됨 (메모리 박제). 의존 ready.
- **WI-030 (preset)** — preset 의 add target 이 selection 의존으로 변경. 자연 흡수.
- **WI-031 (corner radius)** — selection 강화 후 corner-radius 핸들의 selection-only display 와 일관.

### 8.3 외부 의존

- 없음. agocraft / Lexical / Radix 모두 현 버전 그대로.

---

## 9. Bundle / Performance

### 9.1 Bundle 영향

- selection helper function 추가: ≈ +1 KB gz
- LayerPickerMenu 컴포넌트: ≈ +2 KB gz (ContextMenu primitive 재사용 시) 또는 +4 KB gz (신규)
- drill-in 코드 제거: ≈ -3-5 KB gz
- **Net**: ≈ -1 ~ +2 KB gz. Bundle budget 영향 미미.

### 9.2 Runtime 영향

- selection mode 분기: O(trail.length) — trail walk = O(nesting depth). 보통 ≤ 5.
- hit-test (layer picker): O(N × trail.length) — N = frame count. 보통 ≤ 50, trail ≤ 5. 250 ops, < 1 ms.
- drill-in zoom animate() 제거: 매 selection 변경 시 ≈ 16 ms × 30 frame 의 animation cost 절감.
- keyboard nav: O(siblings.length) — sibling lookup. ≤ 20. negligible.

**Performance 향상 예상** — drill-in zoom 의 매 변경 시 animation cost 제거.

---

## 10. Rollout / Telemetry

### 10.1 Launch note in-app

§5.5 참조. 1 주 노출 + 회수.

### 10.2 Telemetry (optional, M1 INP measurement 와 함께)

- selection hotkey 사용 빈도 (Enter / Shift+Enter / Tab / Shift+Tab)
- Cmd-click deep select 사용 빈도
- Layer picker 사용 빈도
- → 사용자 mental model 채택 속도 측정. T+7d 회고에서 reference.

WI-029 의 frontend-perf condition #8 (INP measurement) 와 함께 추가 가능.

### 10.3 회고 checkpoint

- **T+1d (2026-06-09)**: launch note 노출 정상 확인.
- **T+3d (2026-06-11)**: 사용자 (hbpark) 첫 mental model 피드백.
- **T+7d (2026-06-15)**: launch note 회수 + 회고 박제. paradigm shift 성공 여부 평가.
- **review-by 2026-09-30**: DR-017 의 review-by. v1 launch 후 사용성 회고.

---

## 11. Open questions — 일부 closed by sign-off

- [x] `Enter` hotkey 의 drill-down 의미가 다른 기존 hotkey 와 충돌하는지 — **closed by FE sign-off**. editor-hotkeys.ts:245 의 `editorCommandMetadata.register` 가 conflict detection. P1 A3 build 시 register conflict 시 즉시 detect.
- [x] Layer Picker 의 menu structure / contract — **closed by DS sign-off**. DR-design-011 발행, `ContextMenuLabel` + `ContextMenuGroup` + `ContextMenuItem.icon/tagline` slot. 자세한 spec = DR-design-011.
- [ ] Layer Picker 의 menu width / max items (UX detail) — DR-design-011 §3.1 권장값 적용 후 P1 A4 build 시 visual snapshot 으로 검증.
- [ ] Zoom-to-selection hotkey (`Shift+2`) 의 v1 포함 여부 — 현재 deferred. paradigm shift 학습 비용이 v1 launch 후 관측 가능 시 v1.x 우선 흡수.
- [ ] LandingPage / 비교 페이지 / docs 의 drill-in 언급 grep — D1 시점 (P1 build 시작 직전) 의무.

---

## 12. Links

- Triggering Work Item: WI-033
- Related Decision Records: DR-017 (Phase 12 drill-in supersede)
- Related Risk reviews: RISK-005 (GO WITH CONDITIONS, 10 conditions)
- Related Feasibility Reviews: FR-006 (FEASIBLE WITH TRADE-OFFS)
- Product spec:
  - `docs/product/FIGMA_SELECTION_MODEL_SPEC.md` (신규 SSOT — 별건 박제)
  - `docs/product/INTERACTIVE_PRESENTATION_SPEC.md` (drill-in deprecation 대상)
- Launch Gate: LG-001 (T-0 2026-06-08)
- Sibling features:
  - `features/frame-only/` (WI-032)
  - `features/text/` (WI-029)
  - `features/slide-presets/` (WI-030)
  - `features/direct-manipulation/` (WI-031)
