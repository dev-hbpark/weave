# WI-033 — Figma-aligned frame UX 흡수 + Phase 12 drill-in 박제 폐기

## Metadata

| Field | Value |
|---|---|
| ID | WI-033 |
| Title | weave 의 frame UX 를 Figma 모델로 정렬. Selection 강화 4종 (parent-first auto-select / Cmd-click deep select / Enter·Tab keyboard nav / right-click layer picker) 흡수, **Phase 12 의 drill-in mode (enteredFrameStack + zoom transition + breadcrumb + ContextMenu "Enter frame")** 박제 폐기. |
| Owner | hbpark |
| Status | **Proposed** (사용자 결정 박제 2026-05-26 — paradigm shift 확정, 폐기 범위 3종 + Selection 4종 모두) |
| Severity | P0 (Phase 11 ↔ Phase 12 의 paradigm drift 의 정정. LG-001 의 "Figma-aligned UX" design 의도와 직접 충돌하는 Phase 12 박제의 supersede) |
| Created | 2026-05-26 |
| Target date | 2026-06-08 (LG-001 T-0 와 동일. 약 2 주. WI-032 와 같은 일정) |
| Closed | — |

## Summary

weave 의 frame UX 는 WI-013 Phase 11 (2026-05-23) 에서 한 번 **"Figma Frame paradigm — drill 없이 한 화면에 frame-in-frame, selection 기반"** 으로 정렬되었으나, **같은 날 Phase 12 에서 drill-in zoom + breadcrumb + ContextMenu "Enter frame" + enteredFrameStack 으로 회귀**했다 — 메모리/박제에 `project_weave_phase11_2026_05_23.md` 와 `project_weave_phase12_2026_05_23.md` 로 두 paradigm 이 같은 날 박제되어 있는 모순이 그 증거다.

`INTERACTIVE_PRESENTATION_SPEC.md` §8 (L466) 은 *"drill-in 없이 한 화면에 모두 표시 — Figma 식 spatial"* 를 명시적으로 박제 (안 함 list) 하면서, 동시에 §4.1 / §4.5 / §6.3 / §6.5 / §7 에는 drill-in zoom + breadcrumb 박제가 살아있다 — spec 자체에 paradigm 모순이 존재.

본 WI 는 다음을 v1 launch (2026-06-08) 전에 정정한다:

1. **Selection 강화 4종 흡수** — Figma 의 parent-first auto-select / Cmd(Ctrl)-click deep-select / Enter·Shift+Enter·Tab·Shift+Tab keyboard navigation / right-click layer picker 4 종 모두 v1 안에 흡수.
2. **Phase 12 의 drill-in mode 전체 폐기** — `enteredFrameStack: ItemId[]` state + drill-in zoom (`cubic-bezier` `animate()`) + breadcrumb UI + ContextMenu "Enter frame" 항목을 모두 제거. 편집 모드의 navigation 은 **selection 만으로** — Figma 식.
3. **Spec 정정** — `INTERACTIVE_PRESENTATION_SPEC.md` 의 drill-in 박제 섹션 deprecation 마킹 + 신규 `docs/product/FIGMA_SELECTION_MODEL_SPEC.md` 발행 (selection model SSOT).
4. **e2e 정정** — `apps/web/e2e/frame-drill-in.spec.ts` 폐기 또는 selection-only 로 재작성. Selection 4종의 신규 e2e 추가.

**present 모드의 camera zoom transition (PresentPage 의 spring 520ms cubic-bezier) 는 그대로 유지** — drill-in 폐기는 **편집 모드** 한정. Present 모드의 storytelling zoom 은 weave 의 USP (Prezi 차용) 의 핵심이므로 보존.

## Scope

### In scope (v1)

#### A. Selection 강화 4종 (Selection model)

- **A1. Parent-first auto-select**
  - 현재: child frame 클릭 → child 가 선택됨 (`SelectionContext.selectFrame(childId)`).
  - 변경: child frame 클릭 → **부모 frame 먼저 선택** (Figma 의 mental model). Cmd/Ctrl-click 으로 bypass.
  - 구현 위치: `apps/web/src/document/interactions/selection-context.tsx`, `apps/web/src/pages/FrameStage.tsx` 의 NestedFrame onClick handler.
  - selection-aware: 이미 같은 frame 의 child 가 선택된 상태에서 다시 그 child 클릭 → 그대로 child 유지 (Figma 의 "already-in-context" 휴리스틱).

- **A2. Cmd/Ctrl-click deep select**
  - 현재: 없음.
  - 변경: modifier 키 누르고 클릭 시 — nesting 깊이 무관하게 **클릭한 leaf 까지 즉시 선택**.
  - 구현 위치: NestedFrame onClick handler 의 modifier 분기 (`e.metaKey || e.ctrlKey`).
  - macOS = Cmd, Windows/Linux = Ctrl.

- **A3. Keyboard navigation (Enter / Shift+Enter / Tab / Shift+Tab)**
  - 현재: 없음 (Enter 는 editor hotkey 에서 다른 의미 가능).
  - 변경:
    - **Enter** = drill-down 1 level (현재 선택의 first child 로 selection 이동)
    - **Shift+Enter** = drill-up 1 level (현재 선택의 parent 로)
    - **Tab** = 같은 parent 안의 next sibling
    - **Shift+Tab** = previous sibling
  - 구현 위치: `EDITOR_HOTKEYS` registry (agocraft) + weave-local hotkey binding.
  - 가드: text-edit 모드 (Lexical 진입 시) 에서는 hotkey deactivate.

- **A4. Right-click layer picker**
  - 현재: ContextMenu 가 "Enter frame" + "Delete" 정도. layer picker 없음.
  - 변경: 우클릭 시 **커서 아래의 모든 (overlapping) frame/item 의 list** 를 메뉴 상단에 표시 → 선택 시 그 item 으로 선택 이동. Figma 의 "Select layer" 메뉴 패턴.
  - 구현 위치: `ContextualToolbar` / 또는 별도 `LayerPickerMenu` (design system 기존 컴포넌트 재사용 우선 — Design System Triage 의무).
  - 좌표 조회: 캔버스 좌표 → trail walk 으로 hit-test (`agocraft-mirror.ts` 의 findTrailDeep 류).

#### B. Phase 12 drill-in mode 전체 제거

- **B1. State 제거**
  - `FrameStage.tsx` 의 `enteredFrameStack: ItemId[]` 상태 + 관련 setter/effect 모두 제거.
  - `DesignPage.tsx` 의 breadcrumb mount (L607-611, L825, L834) 제거.
  - `useDesign` / `use-weave-editor` 의 entered frame 의존성 제거.

- **B2. Zoom transition 제거**
  - `FrameStage.tsx` 의 drill-in `animate()` (cubic-bezier scale + translate) 제거.
  - design plane 의 transform 은 **사용자 명시적 zoom (Ctrl+Wheel / Zoom controls)** 만 반영. Selection 변화에 의한 자동 zoom 없음.
  - **Present 모드의 camera zoom (PresentPage spring transition) 은 유지** — 편집 모드 한정 제거.

- **B3. ContextMenu 갱신**
  - "Enter frame" 항목 제거. Selection 만으로 동일 목적 달성.
  - 잔여 항목 (Delete, Duplicate future, Move up/down) 유지.

- **B4. Commands 정리**
  - `weave.frame.enter` / `weave.frame.exit` (또는 동등) 명령 제거 (CommandMetadata registry 에서).
  - hotkey binding 에서 drill-in 관련 entry 제거.

#### C. Spec 정정

- **C1. `INTERACTIVE_PRESENTATION_SPEC.md` 의 drill-in 박제 deprecation 마킹**
  - §4.1 의 "entered frame" 행 → deprecation note + DR-017 cross-ref.
  - §4.5 의 "Enter frame" — drill in (zoom 진입) → deprecation, "drill-down selection" 으로 갱신.
  - §6.1 의 breadcrumb layout 부분 → deprecation note.
  - §6.3 인터랙션 표 의 `double-click on frame → Enter (drill-in zoom)` 행 → "drill-down selection (no zoom)" 으로 갱신.
  - §6.4 단축키 표 의 Enter/Esc — drill-in zoom 의미 → drill-down selection 의미로 갱신.
  - §6.5 visual 표 의 "drill-in zoom transition (cubic-bezier spring) — Prezi 의 시그니처" 행 → "Present 모드 한정, 편집 모드는 사용 안 함" 명시.
  - §7 v0 roadmap 의 `[x] drill-in zoom + breadcrumb + Esc / segment click exit (Phase 12c)` → "[~~deprecated WI-033~~] " 마킹.
  - §8 안 함 list 의 *"drill-in 없이 한 화면에 모두 표시 — Figma 식 spatial"* — **현재 paradigm 이라고 명시** (이미 의도된 패러다임).

- **C2. 신규 `docs/product/FIGMA_SELECTION_MODEL_SPEC.md` 발행**
  - selection model 4종의 SSOT.
  - parent-first / Cmd-click / keyboard nav / layer picker 의 정확한 동작 + edge case + e2e 의도.
  - INTERACTIVE_PRESENTATION_SPEC.md 가 cross-ref.

#### D. e2e 정정

- **D1. `frame-drill-in.spec.ts` 폐기 또는 재작성**
  - 4 spec 모두 drill-in 의 Enter/Esc/breadcrumb 검증.
  - 폐기 vs 재작성 판단:
    - "Enter frame menu" → 메뉴 항목 자체가 사라지므로 **삭제**.
    - "drill 후 add target 변경" → "selection 후 add target 변경" 으로 **재작성** (selected frame 의 child 로 add).
    - "breadcrumb 표시" → **삭제** (breadcrumb 자체 폐기).
    - "Esc 로 exit entered" → "Esc 로 deselect" 로 **재작성**.

- **D2. Selection 4종 신규 e2e**
  - `figma-parent-first-select.spec.ts` (A1)
  - `figma-cmd-click-deep-select.spec.ts` (A2)
  - `figma-keyboard-selection-nav.spec.ts` (A3, 4 hotkey)
  - `figma-right-click-layer-picker.spec.ts` (A4)

#### E. Records

- **DR-017** — drill-in mode → Figma selection model 정렬 결정 박제 + Phase 12 supersede.
- **FR-006** — feasibility (FEASIBLE WITH TRADE-OFFS 예상).
- **RISK-005** — GO WITH CONDITIONS 예상 (v1 launch 임박 + paradigm shift).
- **Engineering Plan** — `features/figma-frame-ux/ENGINEERING_PLAN.md`.

### Out of scope (v1)

- **Frame styling 확장 (stroke / effects / clipContent / layout grid / auto layout)** — v1.1 별도 WI.
- **Constraints (Top/Left/Right/Bottom)** — v2 별도 WI. ItemFrame ratio 모델과의 상충 해결 별건.
- **Auto Layout (Hug/Fill/Fixed)** — v2 별도 WI.
- **Component / Variant 시스템** — v2 별도 WI.
- **Tool hotkeys (R/E/L/T 등)** — v1.x 별도 WI. 흡수가 자연스러운 시점에.
- **Mid-click panning / Trackpad 2-finger pan** — v1.x.
- **Multi-frame selection 의 UI 확장** — API 는 이미 있음. v1 의 selection 강화 4종 PR 안에서 자연 흡수 가능하나 별도 acceptance 추가 안 함.
- **Vector edit mode (Pen tool sub-mode)** — v2+.

### Explicitly deferred

- **breadcrumb UI 의 대체 (sticky parent-trail indicator)** — Figma 는 breadcrumb 없음. v1.x 에 사용자 피드백 보고 결정.
- **Mini-map (좌측 rail 의 design tree)** — INTERACTIVE_PRESENTATION_SPEC §6.1 의 "향후 v1" 항목. v1 launch 후 사용자 피드백 보고.
- **Cmd+\\ 또는 dedicated key 로 "frame chrome 일시 hide"** — Figma 의 power user feature. v1.x.

## Acceptance criteria

### Default mandatory

- [ ] `pnpm verify` PASS — lint, tokencheck, declarativecheck (Rule 6), puritycheck, typecheck, test, build.
- [ ] `pnpm e2e` PASS — 신규 selection 4 spec + 기존 e2e 의 drill-in 의존 spec 폐기/재작성 모두 GREEN.
- [ ] `declarativecheck` — selection branching 의 `switch (mode)` 없음. parent-first ↔ deep-select 는 modifier guard, mode 가 아님.
- [ ] **드릴인 코드 grep 결과 0** — `enteredFrameStack` / `entered` (frame context 한정) / `drillIn` / "Enter frame" (메뉴 항목) / breadcrumb 라는 단어 (편집 모드 한정).
- [ ] Design System Triage — Layer Picker 컴포넌트 결정 박제 (`records/design-reviews/DR-design-NNN-*.md` 또는 reuse 박제).
- [ ] Document mutation rule 준수 — selection 변경은 commands 가 아니라 SelectionContext 직접 변경 (state-only, History 통과 아님). frame state 변경 없음. 단 layer picker 가 선택과 더불어 add target 변경 등을 동반하면 그 부분만 `editor.exec`.

### Feature-specific

- [ ] **A1 Parent-first auto-select** — child frame 클릭 시 parent frame 먼저 선택 (현재 selection 이 그 child 인 경우 제외). e2e PASS.
- [ ] **A2 Cmd-click deep select** — modifier 키 누르고 클릭 시 nesting 깊이 무관 leaf 즉시 선택. e2e PASS.
- [ ] **A3 Keyboard navigation** — Enter / Shift+Enter / Tab / Shift+Tab 4 hotkey 동작. text-edit 모드에서는 deactivate. e2e PASS.
- [ ] **A4 Layer picker** — 우클릭 시 cursor 아래 overlapping frame/item list 표시 + 선택 가능. e2e PASS.
- [ ] **B1 enteredFrameStack 제거** — FrameStage.tsx / DesignPage.tsx 의 state + breadcrumb mount 모두 제거.
- [ ] **B2 Zoom transition 제거** — drill-in animate() 호출 제거. Present 모드의 camera spring 은 유지 확인.
- [ ] **B3 ContextMenu 갱신** — "Enter frame" 항목 제거. 잔여 항목 PASS.
- [ ] **B4 Commands 정리** — `weave.frame.enter/exit` (또는 동등) 제거. CommandMetadata registry 에서 사라짐.
- [ ] **C1 Spec deprecation** — INTERACTIVE_PRESENTATION_SPEC.md 의 drill-in 박제 4 섹션 deprecation 마킹 완료.
- [ ] **C2 FIGMA_SELECTION_MODEL_SPEC.md** 신규 발행 — 4 selection feature 의 정확한 동작 + edge case.
- [ ] **D1 frame-drill-in.spec.ts** 폐기 또는 재작성 완료.
- [ ] **D2 Selection 4 spec** 신규 추가 + PASS.
- [ ] LG-001 의 design 의도 (Figma-aligned UX) 만족 — launch gate 재평가 시 conditional 일부 close 가능.

## Context

### 사용자 결정 박제 (2026-05-26)

사용자 hbpark 명시 (2026-05-26 세션, AskUserQuestion):

**Q1 — 폐기 범위**: "Phase 12 drill-in mode 전체 (Recommended)" + "INTERACTIVE_PRESENTATION_SPEC.md 의 drill-in 섹션" + "frame-drill-in.spec.ts e2e" — 3종 모두 폐기 확정.

**Q2 — Selection 강화 v1 scope**: "Parent-first auto-select (Recommended)" + "Cmd/Ctrl-click deep select (Recommended)" + "Right-click layer picker" + "Enter / Shift+Enter / Tab / Shift+Tab keyboard nav (Recommended)" — 4종 모두 v1 포함 확정.

**Q3 — 박제 워크플로**: "WI-033 신규 + DR + Engineering Plan 정식 박제 (Recommended)" — 정식 워크플로 박제 확정.

원문 의도: "기존 weave 의 관련 기획은 제거하고 figma 의 기획을 흡수하면 좋겠어 우선순위가 높은걸 우선 적용하고 싶어."

### Paradigm 모순의 증거 (Phase 11 ↔ Phase 12 drift)

메모리 박제:

> **Phase 11 (2026-05-23)** — *"Figma Frame paradigm 정정 (Phase 10 의 sub-doc 잘못 이해 정정 → 4 도메인이 모두 Frame, drill 없이 한 화면에 frame-in-frame, selection 기반 add, ThumbnailPanel click=select, PresentPage frame zoom-in)"*

> **Phase 12 (2026-05-23 같은 날)** — *"design plane 절대 px (frame 잘림 방지) + frame manipulation handles (이동/크기/회전) + drill-in zoom (ContextMenu Enter + cubic-bezier transition + entered breadcrumb + add target swap)"*

같은 날 Phase 11 의 *"drill 없이"* 와 Phase 12 의 *"drill-in zoom + breadcrumb"* 가 동시에 박제. 그 후로 메모리 (Phase 13 / Interactive Presentation Spec 2026-05-23) 가 Phase 12 paradigm 위에 쌓여 spec / 코드 / e2e 가 모두 drill-in 으로 고정.

### Spec 자체의 모순

`INTERACTIVE_PRESENTATION_SPEC.md` L466:

> "drill-in 없이 한 화면에 모두 표시 — Figma 식 spatial, Notion 식 page navigation 아님"

§8 "명시적으로 *하지 않는* 것" 에 박제. 그러나 같은 문서의 §4.1 / §4.5 / §6.3 / §6.5 / §7 은 drill-in zoom + breadcrumb 를 박제. **spec 자체가 self-contradictory** 한 상태.

본 WI 의 결정은 §8 의 명시 의도 (Figma 식 spatial, drill 없이) 가 정통이라 판정. §4.x / §6.x 의 drill-in 박제는 Phase 12 의 implementation drift 가 spec 에 leak 된 것.

### v1 launch (LG-001 2026-06-08) 와의 정렬

LG-001 의 launch gate 의 design 의도는 "Figma-aligned 텍스트/도형 paradigm" 이 한 축. WI-029 의 텍스트 = Figma 100% paradigm (DR-015 / DR-016) 결정과 같은 축. frame UX 만 Phase 12 의 drill-in mode 로 남아있는 것이 unbalance.

본 WI 가 v1 안에 머지되면 LG-001 의 conditional 항목 일부 close 가능 (R5 UI launch note 의 drill-in 안내 제거 등).

## Escalation triggers

- [ ] User data → 영향 없음 (selection / UI 변경만, schema 변경 없음).
- [ ] Payment / billing → N/A.
- [ ] AI feature → N/A.
- [x] **UI / UX change** → 매우 큼. 모든 사용자 인터랙션의 mental model 변경. Design System Triage 필수 (Layer Picker 컴포넌트).
- [x] **Public page** → LandingPage / 마케팅 surface 의 "drill-in zoom" 광고 부분 (있다면) 갱신 필요. 확인 필요.
- [ ] Library / dependency → 없음 (agocraft 영향 0).
- [x] **Release** → LG-001 의 T-0 와 같은 일정. WI-032 + WI-029 와 병렬 진행. 일정 충돌 가능성 RISK-005 에서 평가.

## Technical Feasibility verdict

- FR record: **FR-006** (이번 세션 박제)
- Verdict: **FEASIBLE WITH TRADE-OFFS** (예상)
- 예상 Accepted trade-offs:
  - 기존 Phase 12 의 drill-in 으로 익숙해진 mental model 사용자 (hbpark 본인) 의 learning curve — selection-only navigation 으로 전환.
  - drill-in 폐기로 깊은 nesting 의 가독성 일시 후퇴 (Cmd-click deep select + layer picker 가 대체).
  - v1 launch 일정 (2026-06-08) 빠듯 — 2 주 안에 selection 4 + drill-in 제거 + e2e 정정.

## Links

- Related Decision Records (DR-*): **DR-017** (이번 세션 박제)
- Related Risk reviews (RISK-*): **RISK-005** (이번 세션 박제)
- Related Feasibility Reviews (FR-*): **FR-006** (이번 세션 박제)
- Related Handoffs (HANDOFF-*): 없음 (weave-local)
- Related Engineering Plan: `features/figma-frame-ux/ENGINEERING_PLAN.md` (이번 세션 박제)
- Related Launch Gate (LG-*): LG-001 (T-0 정렬, sibling), **LG-002 (WI-033 own launch gate, CONDITIONAL READY, 9/10 RISK-005 conditions cleared, 박제 2026-05-26)**
- Related product spec:
  - `docs/product/INTERACTIVE_PRESENTATION_SPEC.md` — drill-in 박제 deprecation 대상
  - `docs/product/FIGMA_SELECTION_MODEL_SPEC.md` — 신규 (이번 세션 박제)
- Superseded paradigm:
  - WI-013 Phase 12c (drill-in zoom + breadcrumb + ContextMenu "Enter frame") — DR 미발행, 메모리 `project_weave_phase12_2026_05_23.md` 가 박제. 본 WI / DR-017 이 supersede.
- 영향 WI:
  - WI-032 (frame-only paradigm) — frame UX 의 sibling. selection 강화는 frame-only 위에 자연스럽게 얹힘.
  - WI-029 (text v1) — text 의 Figma 정렬 (DR-016) 과 일관. 모든 도메인이 Figma 정렬.
  - WI-013 Phase 12 — 박제 supersede.

## Status updates

- 2026-05-26: WI 박제. 사용자 결정 = Phase 12 drill-in 전체 폐기 + Selection 강화 4종 흡수 + v1 launch (2026-06-08) 전 완료. FR-006 + RISK-005 + DR-017 + Engineering Plan 후속.
