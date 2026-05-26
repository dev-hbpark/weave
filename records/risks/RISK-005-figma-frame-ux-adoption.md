# Risk Review — RISK-005 Figma frame UX adoption + Phase 12 drill-in 폐기

## Metadata

| Field | Value |
|---|---|
| ID | RISK-005 |
| Title | Figma frame UX 흡수 + Phase 12 drill-in 폐기의 5 risk |
| Scope | project (WI-033 의 v1 launch 영향) |
| Reviewer agent | `risk-governance-orchestrator` (proxy by Claude) |
| Triggering Work Item | WI-033 |
| Date | 2026-05-26 |
| Review-by | 2026-06-08 (T-0) |

## 입력 문서

- WI-033 (이 risk review 의 source)
- FR-006 (FEASIBLE WITH TRADE-OFFS — 3 trade-off, R4 scope reduction 권장)
- `docs/product/INTERACTIVE_PRESENTATION_SPEC.md` (drill-in 박제 deprecation 대상)
- WI-032 / RISK-004 (frame-only paradigm — sibling work, 일정 병렬)
- LG-001 (v1 launch gate — T-0 2026-06-08, conditional ready)

## Categories assessed

- [ ] Privacy / data protection — N/A (schema 변경 0, selection state 만)
- [ ] Security implementation — N/A
- [ ] Payment / billing — N/A
- [ ] AI safety — N/A
- [x] **Legal / regulatory** — risk ⑤ (광고 surface 의 drill-in 약속 변경 가능성)
- [x] **Ethics / brand trust** — risk ② (사용자 학습 곡선), risk ③ (UX 일시 후퇴)
- [x] **Operations / SRE** — risks ①, ④
- [x] **Accessibility / i18n** — risk ② (keyboard nav 의 IME / a11y 영향)
- [ ] Supply chain — N/A

## Findings

---

### Risk ① v1 launch (2026-06-08) 일정 위반 — 5 WI 병렬 + paradigm shift

**Categories**: Ops / SRE

- **Impact**: **High** — LG-001 의 T-0 가 미뤄지면 WI-029 (text v1) + WI-032 (frame-only) + WI-030 (preset) + WI-031 (corner radius) + WI-033 (이 RISK 의 source) 모두 영향. 마케팅/사용자 약속/Ops 연쇄.
- **Likelihood**: **Possible** — FR-006 §6 의 9 일 예상은 WI-032 의 잔여 작업 (Phase 3c 의 12 fail spec / Phase 4-7 의 마이그레이션 활성화) 과 병렬. WI-029 의 R1-R5 잔여도 진행 중. 5 WI 의 critical path 가 동일 D-13 안에 모두 close 되어야.
- **Severity (no controls)**: High × Possible = **High**
- **Controls**:
  - **R4 채택 (의무)** — FR-006 §5 의 R4: `frame-drill-in.spec.ts` 의 4 spec 을 즉시 폐기/재작성 대신 `test.skip` + v1.x 에 정식 정정. 일정 마진 ≈ 1-2 일 확보. 단 v1 launch 시점에 그 e2e 가 dead code 임은 spec/comment 에 박제.
  - **Phasing 의 강제 순서** — P1 (Selection 4종) → P2 (drill-in 제거) → P3 (Spec/Test 정정) — Engineering Plan 박제. P1 만 완료해도 사용자 가치 ≈ 70% 확보 (selection 강화는 즉시 효용, drill-in 잔존은 backward-compatible).
  - **일일 checkpoint** — D1-D14 의 daily standup (self-review or 1 agent review). D11 (2026-06-04) 시점에 P2 미완 시 contingency 결정.
  - **Contingency** — D11 시점에 P2 (drill-in 제거) 가 미완이면 P1 만 v1, P2 는 v1.1 로 미룸. paradigm shift 의 incremental rollout.
  - **WI 간 의존성 확인** — WI-029 의 text + WI-032 의 frame-only + WI-033 의 selection 은 모두 직교. WI-033 의 selection 변경이 WI-032 의 frame-only paradigm 위에 자연 흡수. 일정 충돌 없음 확인.
- **Severity (with controls)**: Medium × Possible = **Med**.

---

### Risk ② 사용자 mental model 학습 곡선 — drill-in zoom 익숙

**Categories**: Brand / a11y

- **Impact**: **Medium** — Phase 12 의 drill-in zoom + breadcrumb 으로 익숙한 사용자 (hbpark 본인) 가 selection-only navigation 으로 전환. 첫 1-2 회 사용에서 "왜 zoom 안 되지?" 인식. 깊은 nesting 의 child 가 viewport 의 작은 영역만 차지 → 편집 어려움 일시 발생.
- **Likelihood**: **Certain** — paradigm shift 의 직접 결과.
- **Severity (no controls)**: Medium × Certain = **Med**
- **Controls**:
  - **Selection 4종의 동시 흡수 의무** — A2 (Cmd-click) + A4 (layer picker) + A3 (keyboard nav) 가 drill-in 의 대체. 깊은 nesting 의 leaf 접근이 Cmd-click 한 번에 가능.
  - **Launch note in-app** (1 주 노출) — DR-016 의 corner-fontSize-scale 폐기 때의 패턴 그대로. "drill-in 대신 selection 으로" 의 짧은 안내 + 4 selection hotkey 의 시각화.
  - **신규 SPEC SSOT 박제** — `FIGMA_SELECTION_MODEL_SPEC.md` 가 정통 reference. 사용자가 의문 시 spec 직접 참조 가능.
  - **a11y** — keyboard nav (A3) 가 IME / screen reader 와 충돌하지 않게 — Lexical text-edit 모드에서는 deactivate. 이는 acceptance criteria 에 박제.
  - **사용자 (hbpark) 명시 결정** — paradigm shift 자체가 사용자 의도. churn 위험 ≈ 0.
- **Severity (with controls)**: Low.

---

### Risk ③ 깊은 nesting 의 가독성 일시 후퇴

**Categories**: Brand / UX

- **Impact**: **Medium** — drill-in zoom 의 가장 큰 효용 = 깊은 child 가 viewport 가득 차서 편집 편의. 폐기 시 그 효용 손실. 대체 메커니즘 (Cmd-click + layer picker + 사용자 명시 zoom) 의 학습 + 도구 사용량 ↑.
- **Likelihood**: **Conditional** — 깊은 nesting (3+ levels) 의 design 이 v1 launch 시점에 실제로 만들어졌을 때. 현재 alpha 단계 + 사용자 1 명이라 실 사용 design 의 nesting 깊이 ≤ 2 가 대부분.
- **Severity (no controls)**: Medium × Conditional → **Med**
- **Controls**:
  - **Cmd-click deep select (A2) + layer picker (A4)** — 깊은 leaf 접근의 기본 도구.
  - **사용자 명시 zoom controls** (Ctrl+Wheel 또는 Zoom controls UI) — Figma 의 표준. weave 의 design plane 이 transform: scale 을 이미 지원 (FrameStage). zoom-to-selection hotkey (`Shift+2` 같은 Figma 표준) 는 v1.x 의 정식 추가 권장 (defer 가능).
  - **Mini-map / Left rail design tree** — INTERACTIVE_PRESENTATION_SPEC §6.1 의 향후 zone. v1 에 deferred 이나 사용자 피드백 보고 v1.x 에 우선순위 ↑ 가능.
- **Severity (with controls)**: Low.

---

### Risk ④ frame-drill-in.spec.ts 폐기 + 신규 4 spec 의 e2e regression

**Categories**: Ops / SRE

- **Impact**: **Medium** — 기존 4 spec (drill-in) 폐기 + 신규 4 spec (selection 4 종) 추가. 폐기 시 cover 가 빠지는 region 이 selection-only 로 cover 되는지 검증 필요. 신규 spec 의 IME / timing race / StrictMode singleton 같은 helper-level 함정 (메모리 박제됨) 재발 가능.
- **Likelihood**: **Possible** — WI-032 Phase 3c 의 e2e 정정에서 같은 패턴 (76→102 spec PASS) 의 함정 박제. 신규 spec 도 같은 함정 가능.
- **Severity (no controls)**: Medium × Possible → **Med**
- **Controls**:
  - **R4 채택 (FR-006 §5)** — `frame-drill-in.spec.ts` 의 4 spec 을 `test.skip` + v1.x 정식 정정. 일정 마진 + regression 회피.
  - **신규 spec 작성 시 helper.ts 의 hygiene effect 의무** — cursor reset (`page.mouse.move(0, 0)`) + networkidle. 메모리 `project_weave_wi032_phase3c_final_2026_05_26.md` 박제.
  - **StrictMode singleton dispose 금지** — selection state 가 useEffect cleanup 에서 dispose 하지 않게. 메모리 `feedback_react_strictmode_singleton_dispose.md` 박제.
  - **single-PASS / group-fail 의 timing flaky 사전 점검** — WI-032 Phase 3c 의 12 fail spec (ai-tooltip × 5, text-item × 4, tooltip-editor × 3) 의 학습. 신규 4 selection spec 도 같은 위험.
- **Severity (with controls)**: Low.

---

### Risk ⑤ Spec 정정 부족 시 paradigm drift 재발

**Categories**: Brand / Ops

- **Impact**: **Low-Medium** — `INTERACTIVE_PRESENTATION_SPEC.md` 의 drill-in 박제 deprecation 마킹이 불완전하면 미래의 build phase 가 다시 spec 의 stale 부분을 reference 하여 drill-in 으로 회귀. Phase 9~12 의 paradigm drift 가 정확히 이 패턴이었음.
- **Likelihood**: **Possible** — spec 이 506 줄, drill-in 박제가 8+ 위치. 누락 가능.
- **Severity (no controls)**: Low × Possible → **Low**
- **Controls**:
  - **C2 신규 spec 우선** — `FIGMA_SELECTION_MODEL_SPEC.md` 가 selection model 의 SSOT. INTERACTIVE_PRESENTATION_SPEC 은 cross-ref 만.
  - **§8 안 함 list 의 명시** — INTERACTIVE_PRESENTATION_SPEC §8 의 L466 *"drill-in 없이 한 화면에 모두 표시"* 가 정통 paradigm 임을 명시화. *"drill-in zoom 은 present 모드 한정"* 명시 추가.
  - **DR-017 의 supersede 명시** — Phase 12 의 drill-in 결정을 DR-017 이 명시적으로 supersede. 미래 build 가 spec 의 stale 부분 참조 시 DR-017 의 cross-ref 가 paradigm 진실 회복.
  - **PR-block** — spec 정정이 acceptance criteria 의무. PR 머지 전 spec 갱신 완료 확인.
- **Severity (with controls)**: Low.

---

### Risk ⑥ LandingPage / 마케팅 surface 의 drill-in 광고 변경

**Categories**: Legal / 광고 정확성, Brand

- **Impact**: **Low** — LandingPage / 비교 페이지 / blog 가 "drill-in zoom" 또는 "Prezi-style spatial drill-in" 을 광고하면 v1 launch 시 광고와 실제 product 불일치. weave 의 현재 마케팅 surface 의 정확한 상태 확인 필요.
- **Likelihood**: **Conditional** — 메모리 박제 (`project_kineo_marketing_surface_2026_05_20.md`) 는 kineo 의 것. weave 의 LandingPage 가 drill-in 을 광고하는지 별건 확인 필요.
- **Severity (no controls)**: Low × Conditional → **Low**
- **Controls**:
  - **D1 시점 마케팅 surface 확인** — weave 의 LandingPage / 비교 페이지 / docs 의 drill-in 언급 grep. 발견 시 launch 전 갱신.
  - **Present 모드의 zoom 광고는 그대로 유효** — Prezi-style storytelling zoom 은 PresentPage 에서 유지. "Prezi-like presentation" 광고는 그대로.
- **Severity (with controls)**: Low.

---

## Severity matrix

| ID | Risk | Severity (no controls) | Severity (with controls) |
|---|---|---|---|
| ① | v1 일정 위반 | High | Med |
| ② | 사용자 학습 곡선 | Med | Low |
| ③ | 깊은 nesting 가독성 | Med | Low |
| ④ | e2e regression | Med | Low |
| ⑤ | spec drift 재발 | Low | Low |
| ⑥ | 마케팅 surface | Low | Low |

**Aggregate verdict** = **GO WITH CONDITIONS**. 6 risk 중 controls 적용 후:
- Severity High → 0
- Severity Medium → 1 (risk ① 일정)
- Severity Low → 5

## Conditions for GO

1. **R4 채택 의무** (R1①, R4): `frame-drill-in.spec.ts` 의 4 spec `test.skip` + v1.x 정식 정정 박제.
2. **Phasing 순서 의무** (R1①): P1 (Selection 4종) → P2 (drill-in 제거) → P3 (Spec/Test 정정). Engineering Plan 박제.
3. **D11 contingency 결정 point** (R1①): D11 (2026-06-04) 시점에 P2 미완 시 P1 만 v1, P2 는 v1.1 로 미룸.
4. **Selection 4종 동시 흡수 의무** (R1②③): A1/A2/A3/A4 가 v1 안에 같이. R1 / R3 scope reduction 거절 박제.
5. **Launch note in-app 1주 노출** (R1②): DR-016 패턴 그대로. paradigm shift 안내 + 4 selection hotkey 시각화.
6. **`FIGMA_SELECTION_MODEL_SPEC.md` 발행** (R1⑤): selection model SSOT. INTERACTIVE_PRESENTATION_SPEC §8 의 *"drill-in 없이"* 명시 + DR-017 의 supersede 박제.
7. **a11y 의무** (R1②): keyboard nav (A3) 가 Lexical text-edit 모드에서 deactivate. IME 충돌 회피.
8. **e2e hygiene 의무** (R1④): cursor reset + networkidle + StrictMode singleton dispose 금지. WI-032 Phase 3c 의 학습 적용.
9. **마케팅 surface 확인** (R1⑥): D1 시점 LandingPage / 비교 페이지 / docs grep. 발견 시 launch 전 갱신.
10. **PR-block design system triage** (R1⑤): Layer Picker 컴포넌트의 design system 결정 (`DR-design-NNN-*.md` 또는 reuse 박제).

## Review checkpoints

- D1 (2026-05-27): WI-033 build 시작 + 마케팅 surface 확인.
- D5 (2026-05-31): P1 (Selection 4종) 완료 확인. 4 신규 e2e PASS.
- D11 (2026-06-04): P2 (drill-in 제거) 완료 확인. **contingency 결정 point**.
- D13 (2026-06-07): P3 (Spec/Test 정정) 완료 확인. launch note in-app 노출.
- T-0 (2026-06-08): LG-001 launch. conditional 10 항목 close 확인.
- T+7d (2026-06-15): launch note 회수. 사용자 mental model 피드백 회고.

## Links

- Triggering Work Item: WI-033
- Related FR: FR-006 (FEASIBLE WITH TRADE-OFFS)
- Related DR: DR-017 (이번 세션 박제)
- Related Engineering Plan: `features/figma-frame-ux/ENGINEERING_PLAN.md`
- Related Launch Gate: LG-001
- Sibling Risk: RISK-004 (frame-only paradigm — 같은 일정, 같은 LG-001)
- Pattern reference: DR-016 (corner-fontSize-scale 폐기 + launch note 패턴)
- e2e hygiene reference: 메모리 `project_weave_wi032_phase3c_final_2026_05_26.md`
