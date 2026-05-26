# Decision Record — DR-017 Frame UX = Figma selection model. Phase 12 의 drill-in mode 박제 폐기.

## Metadata

| Field | Value |
|---|---|
| ID | DR-017 |
| Title | weave 의 frame 편집 UX 를 Figma 의 selection model 로 정렬. `enteredFrameStack` + drill-in zoom + breadcrumb + ContextMenu "Enter frame" 박제 전체 폐기. Selection 강화 4종 (parent-first auto-select / Cmd-click deep select / Enter·Tab keyboard nav / right-click layer picker) 흡수. **편집 모드의 zoom 은 사용자 명시적 zoom 한정. Present 모드의 storytelling camera transition 은 유지**. |
| Decision Level | **1 Local** — weave 내부 UX/paradigm 결정. agocraft 측 영향 0 (selection state 는 weave-local). |
| Owner | hbpark |
| Required approvers | hbpark (responsible / accountable) |
| Consulted | 사용자 (Discovery owner) — AskUserQuestion 2026-05-26 에서 폐기 범위 3종 + Selection 4종 + WI-033 정식 워크플로 모두 확정 |
| Informed | `design-system-agent` (Layer Picker 컴포넌트 design triage 의무), `frontend-architecture-agent` (selection state ownership review 의무) |
| Status | **Accepted** (사용자 명시 confirm 박제) |
| Decided on | 2026-05-26 |
| Effective from | WI-033 Build 진입 시 |
| Review-by | 2026-09-30 (v1 launch 후 사용성 회고에서 재평가) |
| Triggering Work Item | WI-033 |
| Pairs with | FR-006 (FEASIBLE WITH TRADE-OFFS), RISK-005 (GO WITH CONDITIONS), `FIGMA_SELECTION_MODEL_SPEC.md` (신규 SSOT) |

## Context

weave 의 frame 편집 UX 는 WI-013 의 Phase 9~12 동안 paradigm 이 4 차례 흔들렸다. 메모리 박제:

> **Phase 11 (2026-05-23)** — *"Figma Frame paradigm 정정 (Phase 10 의 sub-doc 잘못 이해 정정 → 4 도메인이 모두 Frame, **drill 없이 한 화면에 frame-in-frame**, selection 기반 add)"*

> **Phase 12 (2026-05-23 같은 날)** — *"design plane 절대 px (frame 잘림 방지) + frame manipulation handles (이동/크기/회전) + **drill-in zoom (ContextMenu Enter + cubic-bezier transition + entered breadcrumb + add target swap)**"*

같은 날 Phase 11 의 *"drill 없이"* paradigm 이 Phase 12 의 *"drill-in zoom + breadcrumb"* 로 회귀. 그 후 spec/code/e2e 가 Phase 12 위에 쌓임.

`INTERACTIVE_PRESENTATION_SPEC.md` 가 자기-모순:

- §8 (L466) — *"drill-in 없이 한 화면에 모두 표시 — Figma 식 spatial, Notion 식 page navigation 아님"* ← 명시 의도
- §4.1 / §4.5 / §6.3 / §6.5 / §7 — drill-in zoom + breadcrumb + ContextMenu "Enter frame" 박제 ← Phase 12 의 implementation drift 가 spec 으로 leak

사용자 결정 (2026-05-26, 원문):

> "기존 weave 의 관련 기획은 제거하고 figma 의 기획을 흡수하면 좋겠어 우선순위가 높은걸 우선 적용하고 싶어"

AskUserQuestion 으로 confirm: 폐기 범위 = Phase 12 drill-in mode 전체 + `INTERACTIVE_PRESENTATION_SPEC.md` 의 drill-in 섹션 + `frame-drill-in.spec.ts` e2e — 3종 모두. Selection 강화 = parent-first / Cmd-click / keyboard nav / layer picker — 4종 모두 v1 (2026-06-08) 안에. 박제 = WI-033 + DR + Engineering Plan 정식 워크플로.

본 DR 은 그 결정을 박제하고 폐기되는 paradigm 의 범위를 명시한다. **이 DR 이 Phase 12 의 drill-in mode 결정 (별도 DR 미발행, 메모리 `project_weave_phase12_2026_05_23.md` 가 박제) 을 supersede 한다.**

## Options considered

(AskUserQuestion 의 옵션 그대로)

| Option | 설명 | 사용자 선택 |
|---|---|---|
| **A. Figma 100%** | drill-in mode 전체 폐기 (enteredFrameStack + zoom + breadcrumb + ContextMenu "Enter frame") + Selection 강화 4종 흡수. Phase 11 의 Figma 모델로 복원. | **✅ 선택** |
| B. 하이브리드 (drill-in 유지 + Selection 추가) | enteredFrameStack/zoom/breadcrumb 유지, Selection 강화 4종을 추가로 흡수. 사용자가 둘 다 사용 가능. | ✗ — paradigm 모순 유지, spec drift 재발 위험 |
| C. 보류 (Phase 12 paradigm 보존) | 폐기 없음. Selection 강화 4종만 v1.x 로 점진 흡수. | ✗ — "기존 기획 제거" 의도와 정면 충돌 |
| Do nothing | 현 Phase 12 paradigm 유지, Selection 강화도 안 함 | ✗ — LG-001 design 의도 (Figma-aligned UX) 와 불일치 |

## Decision

**Option A — Figma 100% paradigm 채택.** 즉:

### Selection 강화 4종 (v1 안에 모두)

1. **A1 Parent-first auto-select** — child frame 클릭 → 부모 frame 먼저 선택. 같은 frame 의 child 가 이미 선택된 상태에서 다시 그 child 클릭 → child 유지 (Figma 의 "already-in-context" 휴리스틱).
2. **A2 Cmd/Ctrl-click deep select** — modifier 키 + 클릭 시 nesting 깊이 무관 leaf 즉시 선택. macOS = Cmd, Win/Linux = Ctrl.
3. **A3 Keyboard navigation** — `Enter` = drill-down 1 level (first child), `Shift+Enter` = drill-up 1 level (parent), `Tab` = next sibling, `Shift+Tab` = prev sibling. text-edit 모드 (Lexical 진입) 에서 deactivate.
4. **A4 Right-click layer picker** — 우클릭 시 cursor 아래 overlapping frame/item list popup. Figma "Select layer" 패턴.

### Phase 12 drill-in mode 전체 폐기

1. **B1** `FrameStage.tsx` 의 `enteredFrameStack: ItemId[]` state + 관련 setter / effect 제거.
2. **B2** drill-in `animate()` (cubic-bezier scale/translate) 제거. design plane 의 transform 은 사용자 명시적 zoom 만.
3. **B3** `DesignPage.tsx` 의 breadcrumb mount (L607-611, L825, L834) 제거.
4. **B4** ContextMenu 의 "Enter frame" 항목 제거.
5. **B5** Commands 의 `weave.frame.enter` / `weave.frame.exit` (또는 동등) 제거. CommandMetadata registry 에서 사라짐.

### Present 모드는 그대로

- `PresentPage` 의 camera spring 520ms cubic-bezier(0.34, 1.20, 0.64, 1) **유지**.
- Prezi-style storytelling zoom = weave 의 USP 핵심. 편집 모드의 drill-in 폐기와 별건.

### Spec / Test 정정

1. **C1** `INTERACTIVE_PRESENTATION_SPEC.md` 의 drill-in 박제 deprecation 마킹 (§4.1 / §4.5 / §6.1 / §6.3 / §6.4 / §6.5 / §7).
2. **C2** 신규 `docs/product/FIGMA_SELECTION_MODEL_SPEC.md` 발행. selection model SSOT.
3. **D1** `frame-drill-in.spec.ts` 의 4 spec `test.skip` + v1.x 정식 정정 (R4 채택).
4. **D2** Selection 4종 신규 e2e 4 spec 추가.

## Why this option

1. **사용자 명시 결정** (AskUserQuestion 2026-05-26): 폐기 범위 3종 + Selection 4종 모두 확정. 옵션 B (하이브리드) / C (보류) 명시 거절.
2. **Phase 11 의 의도 복원**: 메모리 박제 `project_weave_phase11_2026_05_23.md` 가 *"Figma Frame paradigm 정정 → drill 없이 한 화면에 frame-in-frame, selection 기반"* 으로 같은 paradigm 의 첫 박제. Phase 12 가 그것을 회귀시킨 implementation drift. 본 DR 이 Phase 11 의 의도 복원.
3. **Industry standard 정렬**: FR-006 §2.2 — frame-based 디자인 도구의 mainstream (Figma / Sketch / Adobe XD / Penpot) 모두 편집 모드의 drill-in zoom 채택 안 함. weave 의 Phase 12 채택은 isolated 결정이었음. mainstream 정렬이 사용자 진입 장벽 ↓.
4. **Spec 자기-모순 해소**: `INTERACTIVE_PRESENTATION_SPEC.md` §8 (L466) 의 *"drill-in 없이 한 화면에 모두 표시 — Figma 식 spatial"* 가 정통 paradigm 임을 본 DR 이 확정. §4.x / §6.x 의 drill-in 박제는 deprecation 마킹.
5. **WI-029 (text v1) / DR-016 (Figma 100% paradigm) 과의 일관**: text 가 Figma 100% paradigm, frame UX 도 Figma 100% — paradigm 일관성. "weave 는 Figma-aligned 디자인 도구" 로의 메시지 명확.
6. **LG-001 의 design 의도와 정렬**: launch gate 의 conditional 항목 일부 close 가능.

### Specialist consultation status

- **사용자 (Discovery owner)** — confirm 박제 (2026-05-26 AskUserQuestion)
- `frontend-architecture-agent` — **pending**. selection state ownership review (현 SelectionContext 가 4종 모두 흡수 가능한지). P1 build 진입 전 의무.
- `design-system-agent` — **pending**. Layer Picker 컴포넌트 의 design system triage. ContextMenu primitive 재사용인지 신규 LayerPickerMenu 인지. PR-block.

## Consequences

### Breaking changes

- **`apps/web/src/pages/FrameStage.tsx` 의 `enteredFrameStack` / drill-in `animate()` 호출 / NestedFrame 의 zoom transform 완전 제거**.
- **`apps/web/src/pages/DesignPage.tsx` 의 breadcrumb mount 3 위치 (L607-611, L825, L834) 제거**.
- **ContextMenu 의 "Enter frame" 메뉴 항목 제거** — 메뉴 단축키 자체가 사라짐.
- **frame double-click 동작 변경**: 기존 = drill-in zoom 진입. 새 = drill-down selection (Enter hotkey 와 동일 — `Enter` 의 마우스 alternative).
- **기존 e2e 4 spec (`frame-drill-in.spec.ts`) test.skip** + v1.x 정식 정정 (폐기 또는 selection-only 로 재작성).
- **사용자 학습 곡선**: Phase 12 의 drill-in zoom 으로 익숙한 사용자 (hbpark) 가 selection-only navigation 으로 전환. 1주 launch note in-app 으로 완화.

### 즉시 변화

- **Code / architecture**:
  - `SelectionContext` 가 4 selection mode 모두 흡수. multi-frame selection API 와 단일 selection API 의 union.
  - keyboard nav hotkey 등록 = `EDITOR_HOTKEYS` (agocraft) + CommandMetadata (WI-026). text-edit 모드 deactivate guard 의무.
  - Layer Picker = design system primitive (ContextMenu reuse 권장). Design System Triage 거쳐 결정.
  - drill-in 관련 state/effect 제거로 FrameStage.tsx 의 LOC ↓ ≈ 100-150 줄 예상.
- **Process / workflow**:
  - design review (`design-system-agent` sign-off) 가 Layer Picker UI 결정에 의무.
  - frontend architecture review (`frontend-architecture-agent` sign-off) 가 selection state ownership 결정에 의무.
  - e2e 4 spec 신규 (selection 4 hotkey) + 4 spec test.skip (drill-in).
  - Engineering Plan 의 P1/P2/P3 phasing.
- **Cost / ops**: 없음. 순수 UX/code 변경.
- **User experience**:
  - 일시적 학습 비용 (drill-in zoom → selection-only navigation)
  - 장기적 일관 (Figma-aligned + text v1 의 Figma 100% paradigm 과 정렬)
  - 새 능력: deep select / keyboard nav / layer picker
  - Present 모드의 storytelling zoom 은 그대로 유지 (USP 보존)
- **Risk posture (accepted residual risk)**:
  - 깊은 nesting (3+ levels) design 의 가독성 일시 후퇴 — Cmd-click + layer picker + 사용자 명시 zoom 으로 대체. zoom-to-selection hotkey (`Shift+2`) 는 v1.x.
  - drill-in 의 가독성을 그리워하는 사용자 의견 가능 — 1 주 launch note + 회고 (T+7d 2026-06-15).

### 마이그레이션

- 기존 데이터 영향 0 (schema 변경 없음, selection state 는 transient).
- 기존 design 의 frame nesting 구조 그대로 유효. Selection 강화 4종이 그 위에 자연스럽게 작동.

## Conditions / follow-ups

- [ ] **`frontend-architecture-agent` sign-off**: P1 build 진입 전. selection state ownership 결정 박제. PR-block.
- [ ] **`design-system-agent` sign-off**: Layer Picker 컴포넌트 design system triage. ContextMenu primitive 재사용 vs 신규 LayerPickerMenu. `DR-design-NNN-*.md` 발행 가능. PR-block.
- [ ] **e2e 신규**: selection 4 spec (`figma-parent-first-select.spec.ts` / `figma-cmd-click-deep-select.spec.ts` / `figma-keyboard-selection-nav.spec.ts` / `figma-right-click-layer-picker.spec.ts`).
- [ ] **e2e 정정**: `frame-drill-in.spec.ts` 의 4 spec `test.skip` + v1.x todo 박제.
- [ ] **Spec 정정**: `INTERACTIVE_PRESENTATION_SPEC.md` 의 drill-in 박제 7 섹션 deprecation 마킹 + 신규 `FIGMA_SELECTION_MODEL_SPEC.md` 발행.
- [ ] **Launch note in-app**: 1주 노출. weave `apps/web/src/launch-notes/` (없으면 신규) — paradigm shift + 4 hotkey 시각화.
- [ ] **LG-001 재평가**: launch gate 의 conditional 항목 (R5 UI launch note 의 drill-in 안내 등) close.
- [ ] **마케팅 surface 확인**: D1 시점 LandingPage / 비교 페이지 / docs 의 drill-in 언급 grep.

## Dissent

없음. 사용자 명시 confirm 박제 (3 question 모두 Recommended 옵션 + 추가 선택).

## Links

- Triggering Work Item: WI-033
- Originating Handoff: 없음 (weave-local)
- Related Risk reviews: RISK-005 (GO WITH CONDITIONS, 6 risk)
- Related Feasibility Reviews: FR-006 (FEASIBLE WITH TRADE-OFFS, 3 trade-off)
- Product spec:
  - `docs/product/FIGMA_SELECTION_MODEL_SPEC.md` (신규 SSOT, 이번 세션 박제)
  - `docs/product/INTERACTIVE_PRESENTATION_SPEC.md` (drill-in 박제 deprecation 대상)
- Related DRs:
  - DR-016 (text resize Figma 100%) — 같은 "Figma 100% paradigm" 의 sibling. text + frame UX 모두 Figma 정렬.
  - DR-014 (ContextualToolbar) — Layer Picker 의 mount 위치 고려.
- Sibling Work Items:
  - WI-032 (frame-only paradigm) — frame UX 의 sibling. selection 강화는 frame-only 위에 자연 흡수.
  - WI-029 (text v1) — text 의 Figma 정렬. WI-033 와 paradigm 일관.
  - WI-030 (preset) / WI-031 (corner radius) — 같은 일정.
- Launch Gate: LG-001 (T-0 2026-06-08)
- Memory:
  - `project_weave_phase11_2026_05_23.md` (Figma paradigm 첫 박제 — 복원 대상)
  - `project_weave_phase12_2026_05_23.md` (drill-in 회귀 — **본 DR 이 supersede**)
  - `project_weave_interactive_presentation_spec_2026_05_23.md` (spec drift 의 박제 — deprecation 대상)
- **Superseded paradigm**: WI-013 Phase 12c (drill-in zoom + breadcrumb + ContextMenu "Enter frame") — 별도 DR 미발행. 메모리 `project_weave_phase12_2026_05_23.md` 가 박제. 본 DR-017 이 supersede.
