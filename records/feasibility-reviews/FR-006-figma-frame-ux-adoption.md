# Feasibility Review — FR-006 Figma frame UX adoption

## Metadata

| Field | Value |
|---|---|
| ID | FR-006 |
| Title | weave 의 frame UX 를 Figma 모델로 정렬 (drill-in 폐기 + Selection 4종 흡수) 의 technical feasibility |
| Triggering Work Item | WI-033 |
| Reviewer agent | `technical-feasibility-agent` (proxy by Claude) |
| Date | 2026-05-26 |
| Verdict | **FEASIBLE WITH TRADE-OFFS** |

## 1. Outcome restated

WI-033 의 정의 그대로:

1. **Selection 강화 4종**: parent-first auto-select / Cmd(Ctrl)-click deep select / Enter·Shift+Enter·Tab·Shift+Tab keyboard navigation / right-click layer picker.
2. **Phase 12 drill-in mode 전체 폐기**: `enteredFrameStack` state + drill-in zoom transition + breadcrumb UI + ContextMenu "Enter frame" 모두 제거. 편집 모드의 navigation 은 selection 만으로.
3. **Spec 정정 + e2e 정정**: `INTERACTIVE_PRESENTATION_SPEC.md` 의 drill-in 박제 deprecation + 신규 `FIGMA_SELECTION_MODEL_SPEC.md` + `frame-drill-in.spec.ts` 폐기/재작성.

목표 일정: v1 launch (2026-06-08) 전, 약 2 주.

## 2. Current state of the art

### 2.1 Figma 의 selection 모델 (industry standard)

업계에서 frame-based 디자인 도구의 selection 모델은 Figma 가 **사실상 표준**:

- **Parent-first auto-select**: child 클릭 시 parent frame 먼저 선택. Cmd/Ctrl 로 bypass.
- **Cmd/Ctrl-click deep select**: nesting 깊이 무관 leaf 즉시 선택.
- **Keyboard navigation**: Enter (drill-down) / Shift+Enter (drill-up) / Tab (next sibling) / Shift+Tab (prev sibling).
- **Right-click layer picker**: cursor 아래 overlapping items list popup.

Figma 의 model 은 **selection 만으로 무한 nesting 을 navigate** 한다 — zoom mode / breadcrumb mode 같은 **explicit mode switch 없음**. 같은 viewport, 같은 도구, 같은 hotkey 가 모든 깊이에서 동일 작동.

### 2.2 비교: drill-in / zoom mode 를 가진 다른 도구

- **Sketch**: "Edit Symbol" 진입 시 별도 화면 — Symbol 한정, frame 은 selection-only (Figma 와 동일).
- **Adobe XD**: Symbol 더블클릭 → 별도 편집 화면 (Sketch 패턴). frame 자체는 selection-only.
- **Penpot**: Figma 모델 그대로 차용 (open-source Figma clone).
- **Prezi**: zoom drill-in 이 시그니처 — 그러나 **편집 모드가 아닌 present 모드**의 storytelling 인터랙션.

**핵심 결론**: 편집 모드의 drill-in zoom + breadcrumb 은 frame-based 디자인 도구의 표준 패턴이 **아니다**. Prezi 의 zoom drill-in 은 present 모드의 storytelling 메커니즘이고, 편집 모드는 spatial-flat (selection-only) 임. weave 가 Phase 12 에 채택한 "편집 모드 drill-in zoom" 은 **frame-based 디자인 도구의 mainstream 과 동떨어진 isolated 선택**이었음.

### 2.3 web 표준 / 기술 가용성

- 모든 selection 4종은 **순수 React state + DOM event 처리**만 필요. 새 API 의존 없음.
- `e.metaKey || e.ctrlKey` modifier 감지 = HTML5 표준 (Baseline Widely Available).
- ContextMenu = Radix UI 이미 weave 가 사용중 (`@radix-ui/react-context-menu`), 또는 design system 의 ContextMenu primitive (DR-design-005 박제).
- 키보드 hotkey = `EDITOR_HOTKEYS` registry (agocraft) + CommandMetadata (WI-026) 이미 인프라 존재.
- drill-in 제거 = state/effect/DOM 제거. 추가 의존성 0.

기술적 ceiling 없음.

## 3. Intrinsic limits

**없음.** 모든 기능이 현 아키텍처에서 구현 가능.

가능한 implementation 디테일 :

- Cmd-click deep select 의 hit-test = trail walk (agocraft-mirror.ts 의 findTrailDeep 이미 존재).
- keyboard navigation 의 sibling lookup = parent 의 children array index lookup. O(siblings).
- layer picker 의 hit-test = canvas 좌표 → 모든 ancestor frame 의 absolute frame 계산 → bbox 포함 여부. agocraft-mirror.ts 의 helper 재사용.

state 의존성 / async / race condition 위험 없음 — 모두 synchronous DOM event 처리.

## 4. Unavoidable trade-offs

### Trade-off ① Mental model 학습 비용 (사용자 1 명, hbpark)

- **무엇**: Phase 12 의 drill-in zoom 으로 익숙한 사용자 (hbpark 본인) 가 selection-only navigation 으로 전환.
- **불가피한 이유**: paradigm shift 의 본질. 두 paradigm 의 공존은 confusion 가중.
- **완화**: 신규 `FIGMA_SELECTION_MODEL_SPEC.md` 의 SSOT + 짧은 in-app launch note (1 주 노출 후 회수). DR-016 의 corner-fontSize-scale 폐기 때의 패턴 그대로.

### Trade-off ② 깊은 nesting 의 가독성 일시 후퇴

- **무엇**: drill-in zoom 은 깊은 nesting 의 child 가 viewport 가득 차서 편집 편의 ↑. selection-only 로 전환 시 깊은 child 는 viewport 의 작은 영역만 차지 → 편집 어려움.
- **불가피한 이유**: Figma 모델 자체의 trade-off. Figma 의 답 = **사용자 명시적 zoom (Ctrl+Wheel / Zoom to Selection hotkey)** + **layer picker** + **Cmd-click deep select**.
- **완화**: A4 (layer picker) + A2 (Cmd-click) + Zoom to Selection hotkey (Figma 의 `Shift+2`) 의 조합으로 대체. v1 의 selection 4종에 이미 포함. Zoom-to-selection 은 deferred 가능 (v1.x).

### Trade-off ③ v1 launch 일정 (2026-06-08, D-13) 빠듯

- **무엇**: WI-032 (frame-only) + WI-029 (text v1) + WI-030 (preset) + WI-031 (corner radius) + WI-033 (Figma frame UX) 가 모두 v1 안에 진행.
- **불가피한 이유**: paradigm shift 가 LG-001 의 design 의도 (Figma-aligned UX) 의 한 축. 누락 시 launch 의도가 incomplete.
- **완화**: P1 (Selection 4종) 만 critical, P2 (drill-in 제거) 는 RISK-005 에서 contingency 결정 (D11 시점에 P2 미완 시 v1.x 로 미루기 가능). Scope reduction option 으로 명시.

## 5. Scope-reduction options

| Option | 무엇을 빼나 | 효과 |
|---|---|---|
| **R1. Selection 4 → 3 (layer picker 제외)** | Right-click layer picker 만 v1.x | 노력 ↓ ~20%. mental model 학습 비용 ↑ (깊은 nesting 의 picker 부재 대체 → Cmd-click 의존도 ↑) |
| **R2. drill-in 제거를 v1.x 로 미룸** | Phase 12 의 enteredFrameStack/breadcrumb 유지, Selection 4종만 v1 | 노력 ↓ ~40%. 그러나 "Figma 흡수" 의도와 정렬 불완전. spec 모순 유지 |
| **R3. keyboard nav 의 Tab/Shift+Tab 제외** | Enter/Shift+Enter 만, Tab/Shift+Tab 은 v1.x | 노력 ↓ ~10%. sibling 순회 부재 → Figma 사용자에게 어색 |
| **R4. e2e 의 frame-drill-in.spec.ts 폐기를 늦춤** | 폐기 대신 test.skip + v1.x 에 재작성/삭제 | 노력 ↓ ~5%. e2e fail 회피만, 빠르게 unblock |

**R1 / R2 / R3 는 모두 권장 안 함** — 사용자 결정 (2026-05-26) 이 4종 모두 + drill-in 폐기를 명시. R4 만 채택 권장 (e2e 정정 의무는 보존, 일정 마진 확보).

## 6. Verdict

**FEASIBLE WITH TRADE-OFFS.**

이유:

1. 기술적 ceiling 없음 — 모든 selection 4종은 현 React/DOM/Radix/CommandMetadata 인프라에서 즉시 구현 가능. drill-in 제거는 state/effect 삭제만 필요.
2. Intrinsic limit 0.
3. Trade-off 3 종 모두 완화 가능 — ① launch note (1 주), ② Cmd-click + layer picker + (deferred) zoom-to-selection 조합, ③ R4 e2e 정정 일정 마진.
4. 일정: P1 (Selection 4종) ≈ 3 일, P2 (drill-in 제거) ≈ 4 일, P3 (Spec/Test 정정) ≈ 2 일, 합 ≈ 9 일. v1 launch D-13 안에 7-10 일 가능. WI-029/030/032 와 병렬 진행 가능 (selection 영역은 frame-only paradigm 위에 직교).

## 7. Specialist sign-offs required

- [ ] **`design-system-agent`** — Layer Picker 컴포넌트의 design system triage (Step 1-3 결정). 기존 ContextMenu primitive 재사용인지, 신규 LayerPickerMenu primitive 인지. PR-block.
- [ ] **`frontend-architecture-agent`** — selection state 의 ownership (현 SelectionContext 가 모든 4종을 흡수할 수 있는지). multi-frame selection API 의 활용 여부.
- [x] **`technical-feasibility-agent`** — 본 review (FEASIBLE WITH TRADE-OFFS).

권장: 위 2 specialist 가 v1 launch 전 sign-off. **frontend-architecture-agent 의 review 가 P1 build 전 의무** — selection model 의 architecture decision 이 잘못되면 4 spec 모두 재작성.

## 8. Acceptance signals (build 진입 전)

- [x] 사용자 결정 (2026-05-26) — paradigm shift + Selection 4종 + drill-in 폐기 모두 확정.
- [ ] DR-017 박제 — selection model 결정 + Phase 12 supersede 명시.
- [ ] RISK-005 박제 — GO WITH CONDITIONS 예상.
- [ ] Engineering Plan 박제 — P1/P2/P3 phasing 명시.
- [ ] LG-001 의 conditional 항목과의 정렬 확인 (R5 UI launch note 의 drill-in 안내 제거 등).

## 9. Links

- Triggering Work Item: WI-033
- Related Decision Records: DR-017 (이번 세션 박제)
- Related Risk reviews: RISK-005 (이번 세션 박제)
- Related Engineering Plan: `features/figma-frame-ux/ENGINEERING_PLAN.md`
- Product spec:
  - `docs/product/INTERACTIVE_PRESENTATION_SPEC.md` (drill-in deprecation 대상)
  - `docs/product/FIGMA_SELECTION_MODEL_SPEC.md` (신규)
- 비교 reference: Figma "Select layers and objects" Help Center / Sketch Symbol model / Penpot
- Memory: `project_weave_phase11_2026_05_23.md` + `project_weave_phase12_2026_05_23.md` (paradigm drift 의 증거)
