# Launch Gate — LG-002 Figma frame UX adoption (WI-033)

| Field | Value |
|---|---|
| ID | LG-002 (weave 의 두 번째 launch gate, LG-001 sibling) |
| Launch | **Feature 머지 + 사용자 가시화** — same T-0 as LG-001 (weave 의 multi-WI launch event) |
| Audience | weave 의 현재 anonymous shared workspace 사용자 (FR-001 §1) — 한국·미국 데스크탑 latest-2 Chrome/Edge/Safari |
| Scheduled T-0 | **2026-06-08** (LG-001 T-0 와 동일, multi-WI launch) |
| Owner | hbpark (single accountable) |
| Incident Commander on standby | hbpark (single owner project 단계) |

## Scope

WI-033 의 Figma-aligned frame UX 를 사용자에게 가시화. **점진적 노출** — feature flag 없이 additive merge. 기존 사용자의 design 의 schema 영향 0 (selection / UI 만 변경, document mutation 없음).

**Ramp 계획**: 단일 launch event (LG-001 + LG-002 합쳐) — feature 머지 → 즉시 모든 사용자 노출 + 1주 launch note in-app (FigmaSelectionLaunchBanner).

**Reversibility**:
- 코드 revert PR (selection model + drill-in 제거 + Layer Picker + onContextMenuCapture 의 single revert 가능)
- agocraft vendor tgz: `disableSelectionSet` 옵션 (HANDOFF-011) 의 in-place dist 갱신. 이전 build 로 vendor swap 가능 (옵션 default false → 기존 동작)
- DR-017 supersede 의 reverse 박제 가능 (Phase 12 drill-in 복원)

---

## Pillar 1 — Product

- [x] Acceptance criteria from `WI-033` met and verified — A1 parent-first / A2 Cmd-click deep / A3 keyboard nav (4 hotkey) / A4 right-click Layer Picker 모두 functional + e2e 14/14 PASS (그룹)
- [x] User-facing copy reviewed — `FigmaSelectionLaunchBanner.tsx` 한국어 + English locale
- [x] Onboarding / empty state / error states wired — FigmaSelectionLaunchBanner mount in DesignPage (TextV1LaunchBanner 옆 stack)
- N/A Pricing / disclosures

**Status: Ready** — Selection 4종 wiring 완성 + Layer Picker 작동 + drill-in user-visible 차단 + launch banner 박제.

---

## Pillar 2 — Risk & governance

- [x] `risk-governance-review` verdict = **GO WITH CONDITIONS** (RISK-005). 10 conditions 중 9 cleared / 1 pending (마케팅 surface)
- [x] No open Critical or High severity items
- [x] Privacy: schema 변경 0, document mutation 0 — privacy surface 영향 없음
- N/A Security review
- N/A AI safety
- [x] Legal / policy / terms — launch note 의 paradigm 변경 안내 박제 (drill-in 제거 + Figma 정렬)

**Status: Ready** — RISK-005 의 9/10 condition cleared (§ "RISK-005 condition status" 참조).

---

## Pillar 3 — Engineering

- [x] Specialist sign-offs: `frontend-architecture-agent` (CONDITIONAL APPROVAL, C1-C4 PR-block applied) + `design-system-agent` (CONDITIONAL APPROVAL, Triage=Extended, DR-design-011 발행)
- [x] HANDOFF-011 (agocraft `disableSelectionSet`) — applied in-place to dist
- [x] HANDOFF-012 (vm.enteredFrameStack retirement) — 박제 (agocraft 측 응답 launch 후 의무 아님)
- [x] Code quality gates: typecheck ✓ / declarativecheck ✓ / puritycheck ✓ / 105/105 unit test ✓ / build ✓
- [x] Drill chain dead-code cleanup step 1+2+3 (FrameStageProps + NestedFrame body + main body) 완료

**Status: Ready** — wiring + cleanup + sign-offs 모두 완료.

---

## Pillar 4 — QA

- [x] **E2E coverage**: 14 신규 spec — A1 × 3 / A2 × 2 / A3 × 6 / A4 × 3
- [x] **그룹 14/14 PASS** with `retries: 1` (단독 실행도 14/14 PASS)
- [x] **Unit test**: 105/105 PASS (helpers: selection-from-hit × 12, selection-nav × 16, hit-test × 9)
- [x] **frame-drill-in.spec.ts** 의 deprecated 4 spec → `test.describe.skip` + WI-033 P2 todo 박제 (RISK-005 R4)
- [ ] Accessibility audit (keyboard nav focus / aria roles) — plan 박제, 실행 잔여 (LG-001 의 broader Ops 와 묶임)
- [ ] Performance smoke test (selection-heavy 시나리오) — plan 박제, 실행 잔여 (LG-001 broader Ops 와 묶임)

**Status: Conditional** — e2e + unit 의무 100%, accessibility / perf smoke 실행은 broader Ops maturity 와 묶임.

---

## Pillar 5 — Operations / SRE

- N/A Migration telemetry — schema 변경 0
- [ ] Monitoring + alerts (selection-related telemetry) — broader weave WI 와 묶음 (LG-001 와 같은 conditional)
- [ ] Rollback test in staging — staging 존재 시 의무
- [x] Runbook — drill-in regression 의 manual recovery 절차 박제 (FrameStage drill chain backout PR 의 reverse 의 매뉴얼)

**Status: Conditional** — runbook 박제 OK, monitoring + staging rollback test 가 broader Ops maturity 와 묶임.

---

## Pillar 6 — Communications

- [x] Launch note in-app — `FigmaSelectionLaunchBanner` 박제 (ko/en locale, [LAUNCH_AT, LAUNCH_AT+7days] auto-retract)
- [x] DR-017 박제 — Phase 12 drill-in supersede 의 정통 paper trail
- [x] FIGMA_SELECTION_MODEL_SPEC.md — selection model 의 single source of truth
- [x] Incident comms — RISK-005 의 6 risk + controls 박제 (사용자 학습 곡선 등의 응답 시나리오)
- [ ] External announcement (blog / social) — broader weave maturity 와 묶음

**Status: Conditional** — in-app 의무 100%, external 채널 broader maturity 와 묶임.

---

## Verdict

- [ ] **READY** — 6 pillar 중 Ready 6
- [x] **CONDITIONAL READY** — 6 pillar 중 0 Blocked / 3 Ready (Pillar 1 Product + Pillar 2 Risk + Pillar 3 Engineering) / 3 Conditional. 모든 conditional 이 critical 아님 — frame UX 의 user-visible scope + paper trail (DR-017 + RISK-005 + spec + launch note) 모두 박제 완료. 잔여 conditional 은 (1) accessibility audit + perf smoke 실행 / (2) monitoring 통합 + staging rollback test / (3) external comm 채널 — LG-001 와 같이 broader weave Ops maturity 와 묶임.
- [ ] BLOCKED

**Justification**:
- Risk verdict GO WITH CONDITIONS — gate 자동 BLOCKED 아님
- No Critical/High severity open
- User-visible feature 100% merged (Selection 4종 + Layer Picker + drill-in 차단)
- Code quality gates 모두 PASS + e2e 그룹 14/14 PASS
- 2 specialist sign-offs CONDITIONAL APPROVAL (PR-block conditions 적용 완료)
- Reversibility 보장 (revert PR + vendor swap)

---

## RISK-005 condition status (10 conditions)

| # | Condition | Status | Note |
|---|---|---|---|
| 1 | R4 채택 (frame-drill-in.spec.ts test.skip + v1.x 정정) | ✅ Closed | `test.describe.skip` + inline 박제 |
| 2 | Phasing 순서 (P1 → P2 → P3) | ✅ Closed | Engineering Plan + 박제 순서대로 완료 |
| 3 | D11 contingency point | N/A | P1+P2+P3 모두 D-13 안에 완료 — contingency 불필요 |
| 4 | Selection 4종 동시 흡수 | ✅ Closed | A1+A2+A3+A4 wiring 완성 + e2e 14/14 PASS |
| 5 | Launch note in-app 1주 노출 | ✅ Closed | FigmaSelectionLaunchBanner 박제, [2026-06-08, 2026-06-15] auto-retract |
| 6 | FIGMA_SELECTION_MODEL_SPEC.md 발행 | ✅ Closed | `docs/product/FIGMA_SELECTION_MODEL_SPEC.md` 박제 |
| 7 | a11y (A3 hotkey deactivate in text-edit) | ✅ Closed | commandContext.isTextEditing + e2e PASS |
| 8 | e2e hygiene (cursor reset + networkidle) | ✅ Closed | helpers.ts 의 prepareDesign + clearAllDesigns 박제 (WI-032 Phase 3c 학습 적용) |
| 9 | 마케팅 surface grep 확인 | ✅ Closed (2026-05-26) | `grep -i "drill\|드릴\|Enter frame\|breadcrumb-entered"` on `apps/web/src/pages/LandingPage.tsx` + `docs/launch/*.md` returned 0 marketing-surface hits. Only `docs/product/{FIGMA_SELECTION_MODEL_SPEC,INTERACTIVE_PRESENTATION_SPEC}.md` mention drill-in — both are deprecation paper-trail (intentional). No user-visible marketing surface promises drill-in. |
| 10 | Design system triage (Layer Picker) | ✅ Closed | DR-design-011 박제, ContextMenu primitive extension |

**10/10 closed** (2026-05-26 #9 grep result PASS — marketing-surface hits 0).

---

## Open blockers (T-0 까지 close 의무)

| Item | Pillar | Owner | ETA |
|---|---|---|---|
| ~~RISK-005 #9 마케팅 surface grep~~ ✅ Closed 2026-05-26 | ~~Communications~~ | ~~hbpark~~ | ~~launch -3 일~~ |
| ~~Accessibility audit (keyboard nav focus / aria)~~ ✅ **Path A complete 2026-05-28** ([AUDIT-003](../audits/AUDIT-003-2026-05-28-a11y-smoke-wcag22aa.md)) — V2 nested-interactive fixed in `ThumbnailPanel.tsx` (role="listbox"+role="option" demoted to role="group"; tile-activation moved to a sibling inner `<button>` so the focus-toggle button no longer nests). axe-core smoke 3/3 PASS. Regression gate active. | ~~QA~~ | ~~hbpark~~ | ~~launch -2주~~ |
| Performance smoke test — plan 박제, 실행만 | QA + Engineering | hbpark / frontend-perf | launch -1주 (broader Ops 와 묶음) |
| Monitoring + alerts (broader weave telemetry) | Operations | hbpark / sre | broader weave WI 와 묶음 |
| Rollback test in staging | Operations | hbpark | staging 존재 시 의무 |
| External announcement 채널 (blog / social / status page) | Communications | hbpark / marketing | broader weave maturity 와 묶음 |

---

## Sign-off list

| Role | Agent / human | Signed | Timestamp |
|---|---|---|---|
| Product | hbpark (Selection 4종 wiring + Layer Picker + launch banner 박제) | ✅ Ready | 2026-05-26 |
| Risk & governance | `risk-governance-orchestrator` (via RISK-005 GO WITH CONDITIONS, 9/10 cleared) | ✅ Ready | 2026-05-26 |
| Engineering | `frontend-architecture-agent` (CONDITIONAL APPROVAL, C1-C7) + `design-system-agent` (CONDITIONAL APPROVAL, Extended) | ✅ Ready | 2026-05-26 |
| QA | hbpark (via e2e 14/14 PASS + 105/105 unit + helpers PoC) | ✅ Conditional | 2026-05-26 |
| Operations / SRE | hbpark (Runbook reverse path 박제, monitoring + staging rollback test 잔여 — broader Ops maturity 와 묶임) | ⚠️ Conditional | 2026-05-26 |
| Communications | hbpark (launch note in-app + DR-017 + spec 박제, external 채널 잔여) | ⚠️ Conditional | 2026-05-26 |

---

## Conditions and T-0 re-check protocol

T-0 (제안: 2026-06-08) 직전 24h 안에 다음 모두 close 확인:

1. ~~RISK-005 #9 마케팅 surface grep~~ ✅ Closed 2026-05-26 (grep 결과 0 hits)
2. E2E 그룹 14/14 PASS 재실행 + 안정성 확인
3. ~~agocraft vendor tarball 의 disableSelectionSet 옵션 + HANDOFF-012 응답~~ ✅ Closed 2026-05-26 — 2단계 vendor rebuild 완료. (1) timestamp `20260526140000`: HANDOFF-011 `disableSelectionSet` 옵션 정통화. (2) timestamp `20260526143000`: HANDOFF-012 응답으로 `vm.enteredFrameStack` slot 제거 (agocraft `EditorViewModel.types.ts` + `create-editor-view-model.ts`, 141/141 unit test PASS). weave reinstall + 새 dist 의 `enteredFrameStack` grep = 0 ✓. 모든 gate PASS + e2e 14/14 PASS (1 retry 흡수).

**T-0 re-check 결과**:
- 모든 close → CONDITIONAL READY → READY 전환 → launch 진행
- 1개 이상 close 안 됨 → launch 연기 + 본 LG-002 re-run

---

## Post-launch (launch + 1개월 의무)

- selection-related user feedback 수집 (drill-in 부재의 mental model 학습 곡선)
- A3 keyboard nav 사용 빈도 telemetry (4 hotkey 별)
- A4 Layer Picker 사용 빈도 telemetry (overlapping nesting 의 깊이 분포)
- agocraft HANDOFF-012 (vm.enteredFrameStack slot retirement) 응답 + vendor rebuild
- planeTxMV/TyMV/scaleMV motion value 단순화 (drill chain cleanup step 4, optional polish)
- INTERACTIVE_PRESENTATION_SPEC.md 잔여 drill-in 박제 의 최종 정리 (deprecation note 만 남고 본문 정리)

---

## Follow-up Work Items (post-2026-05-26)

| Item | Status | 영향 |
|---|---|---|
| WI-034 (Alt+drag frame-in-frame) | Done — adapter rebase + ratio 재변환 | user-visible gap close |
| WI-035 P1+P2+P3 (R/T/F hotkey + QuickActionBar "+" + DropdownMenu drag) | Done — IME-safe sidecar + 4 follow-up fix | 4 entry points active |
| WI-036 (QuickActionBar UX 재설계) | Done — anchored mount + hover target union + 200ms grace | **P2 UX conditional CLOSE** |

## Links

- Triggering Work Item: `records/work-items/WI-033-figma-frame-ux-adoption.md`
- Related Risk reviews: `records/risks/RISK-005-figma-frame-ux-adoption.md` (GO WITH CONDITIONS, 9/10 cleared)
- Related Feasibility: `records/feasibility-reviews/FR-006-figma-frame-ux-adoption.md` (FEASIBLE WITH TRADE-OFFS)
- Related Decisions: `records/decisions/DR-017-figma-selection-model.md` (Phase 12 drill-in supersede)
- Engineering Plan: `features/figma-frame-ux/ENGINEERING_PLAN.md`
- Sibling Launch Gate: `records/launch-gates/LG-001-text-item-v1.md` (text v1, same T-0)
- Spec SSOT: `docs/product/FIGMA_SELECTION_MODEL_SPEC.md`
- Launch banner: `apps/web/src/launch/FigmaSelectionLaunchBanner.tsx`
- Related Handoffs (cross-project):
  - `workspace/agocraft/records/decision-handoffs/HANDOFF-011-disable-selection-set-in-frame-move.md` (in-place dist applied)
  - `workspace/agocraft/records/decision-handoffs/HANDOFF-012-retire-entered-frame-stack-slot.md` (pending agocraft response)
- Related design review: `records/design-reviews/DR-design-011-context-menu-label-and-group.md`
- Memory: `project_weave_wi033_figma_frame_ux_2026_05_26.md`
