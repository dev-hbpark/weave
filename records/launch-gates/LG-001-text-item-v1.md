# Launch Gate — LG-001 텍스트 아이템 v1 (Figma-equivalent)

| Field | Value |
|---|---|
| ID | LG-001 (weave 의 첫 project-level launch gate) |
| Launch | **Feature 머지 + 사용자 가시화** (weave 가 SMB beta 단계라 GA / Public beta 의 정식 ramp 아님, 점진적 사용자 노출) |
| Audience | weave 의 현재 anonymous shared workspace 사용자 (FR-001 §1 정의) — 한국·미국 데스크탑 latest-2 Chrome/Edge/Safari |
| Scheduled T-0 | (제안) **2026-06-08** — R4 + R5 잔여 작업 + 1주 launch note 노출 후. weave 측 final acceptance 시 확정. |
| Owner | hbpark (single accountable) |
| Incident Commander on standby | hbpark (single owner project 단계, M3+ 에서 oncall 회전제 도입 의무) |

## Scope

WI-029 의 v1 텍스트 경험을 사용자에게 가시화. **점진적 노출** — feature flag 없이 additive merge (Phase 1.5 schema 가 backward-compat 이라 기존 v6 docs 자동 OK).

**Ramp 계획**: 단일 PR 머지 → 즉시 모든 사용자 노출 (단, weave 자체가 small SMB scale 이라 "ramp" 가 실질적으로 의미 작음). Canary route 없음.

**Reversibility**:
- 코드 revert PR (Lexical / 3-mode / Phase 1.5 변경 모두 단일 revert 가능)
- agocraft vendor tgz 를 이전 버전 (1.0.0-rc.20260525044428) 으로 swap 가능 — backward-compat 보장
- Phase 1.5 additive 라 schema downgrade 자체로 데이터 손실 없음

---

## Pillar 1 — Product

- [x] Acceptance criteria from `WORK_ITEM.md` met and verified — WI-029 의 user-visible scope 100% (9 PropertiesPanel controls + Lexical RichText + 3-mode + 정적 렌더링 + lazy-load + Cmd+B/I/U + Truncate/Hyperlink)
- [x] User-facing copy reviewed — `docs/launch/TEXT_V1_LAUNCH_NOTE.md` 박제 (한국어 + English) + tooltip + onboarding hint 본문 + support article
- [x] Onboarding / empty state / error states **wired** — R5 UI 머지 (2026-05-26): design-system 3 신규 primitive (Banner / Tooltip / OnboardingCoachmark, DR-design-010 박제) + apps/web 의 TextV1LaunchBanner / fontSize Tooltip / TextOnboardingHint 모두 mount + 한국어/영어 로케일 detection + 1주 자동 회수 + dismiss persist + e2e 4 spec (2 PASS 박제 / 2 skip flaky)
- N/A Pricing / disclosures — text v1 은 commerce surface 아님

**Status: Ready** — R5 UI 머지 완료 (DR-design-010 + 3 primitive + 3 apps/web surface + e2e 박제). Tooltip / Coachmark e2e 2 spec 은 headless mode race 로 skip (manual verified 2026-05-26).

---

## Pillar 2 — Risk & governance

- [x] `risk-governance-review` verdict = **GO WITH CONDITIONS** (RISK-001). 10 conditions 중 7 cleared / 1 unreachable / 1 conditional / 1 pending.
- [x] No open Critical or High severity items (Risk ② High 가 conditional Lexical fallback gate — Plan A 성공으로 unreachable)
- [x] Privacy disclosures — 텍스트 본문은 user content, FR-001 의 per-tenant 격리 그대로 (text v1 이 새 privacy surface 추가 안 함)
- N/A Security review (no auth/secret/network change in text v1)
- N/A AI safety (no AI in v1)
- [x] Legal / policy / terms — launch note 의 paradigm 변경 안내 (corner-fontSize-scale 폐기) + LWW disclosure 박제. 외부 publish 채널 시 legal 재검토 의무.

**Status: Ready** — RISK-001 condition #6 (launch note in-app 노출 1주, R5 UI 의무) **Cleared** 2026-05-26: TextV1LaunchBanner + fontSize Tooltip 모두 [LAUNCH_AT, LAUNCH_AT+7days] 자동 회수 박제, dismiss persist 박제 (e2e PASS).

---

## Pillar 3 — Engineering

- [x] `ENGINEERING_PLAN.md` items 머지: R3 (lazy-load) ✅ + R1 Step 1+2 (wrapper-mirror + DesignPage wire) ✅ + R2 (addBehavior commands + reducer) ✅ + R1 Step 3 Phase A+B+C (schema rename series) ✅ + R5 doc ✅
- [ ] **R4 4 deferred e2e specs** — Korean IME CDP / Cmd+B/I/U range style / StrictMode mount cycle / 2-actor concurrent. Pre-launch 의무 (안전망)
- [x] Feature flag 없음 — Phase 1.5 additive 라 flag 불필요. 기존 사용자 자동 마이그 backward-compat
- [x] Kill-switch — revert PR + vendor tgz swap (tested via vendor 갱신 reproducibility)
- [x] Migrations — Phase 1.5 schema rename series A+B+C 모두 additive. v6 ~ v9 reader 모두 호환. round-trip vitest 366/366 PASS
- [x] Dependencies — Lexical MIT (library-adoption sign-off APPROVED), no Critical CVEs open
- [x] Bundle — main 272.21 KB gz + Lexical 59.13 KB gz lazy. Initial LCP 영향 0.
- [ ] **LCP / INP / CLS on canary route** — 정식 measurement 안 됨. frontend-perf sign-off conditional approve (M1 INP < 200ms 50% 측정 의무).
- N/A Error budget / SLO — weave 가 prod SLO 운영 안 됨 (FR-001 M0-M2 single SMB-tier baseline)

**Status: Conditional** — R4 e2e 4 specs + M1 INP measurement.

---

## Pillar 4 — QA

- [x] `QA_PLAN.md` 박제 (2026-05-26) — `features/text/QA_PLAN.md`: scope, test pyramid (unit/e2e/manual), a11y checklist, perf smoke target, regression green-gate, exit criteria
- [x] Regression suite green — 모든 verify gate PASS (typecheck + test + build + declarativecheck + lint)
- [ ] **Accessibility (WCAG 2.2 AA on core flows)** — `QA_PLAN.md` §3 self-audit checklist 박제. 실제 audit 실행은 T-0 -2주 진행 예정. Lighthouse a11y ≥ 95 목표
- [ ] **Performance smoke test (mid-tier device + Slow-4G)** — `QA_PLAN.md` §4 measurement plan 박제. LCP/CLS는 T-0 -1주, INP는 M1 (launch + 1mo) 측정
- [x] Manual exploratory — Lexical PoC Korean IME 4-browser PASS (hbpark 2026-05-25) + R5 launch comm UI 4-theme PASS (2026-05-26)

**Status: Conditional** — QA_PLAN.md ✅ Cleared (2026-05-26). 잔여 accessibility audit + perf smoke 는 plan 박제 완료, 실행만 남음.

---

## Pillar 5 — Operations

- [x] **Runbook** — `docs/operations/RUNBOOK_TEXT_V1.md` 박제 (2026-05-26): 7 failure mode + symptom signature + triage + mitigation + rollback steps + escalation path + telemetry watch
- [ ] **Monitoring + alerts** — weave 자체가 prod telemetry 부재 (M0-M2 SMB-tier baseline). sentry/datadog 미통합. text input failure rate / locale=ko-KR anomaly tracking 미설정 (RISK-001 condition #4 telemetry). Runbook §8 에 watch signals 박제 — telemetry 통합은 launch + 1주 ETA
- N/A Oncall — single owner (hbpark) project 단계
- [ ] **Rollback plan tested in staging** — staging environment 미존재. Code revert + vendor tgz swap path 가 Runbook §1-§7 의 각 mitigation 에 박제. tested 는 production hotfix 1회 후 paper trail 박제 의무
- N/A Capacity headroom (3× peak) — weave 의 small scale 단계
- N/A Cost cap (no new line item — text v1 이 storage/network/AI cost 추가 안 함)

**Status: Conditional** — Runbook ✅ Cleared (2026-05-26). 잔여 monitoring 통합 + staging rollback test 는 weave broader Ops maturity 와 묶음 (launch + 1주 ETA).

---

## Pillar 6 — Communications

- [x] Internal announcement — hbpark single team (informal)
- [x] External announcement drafted — `docs/launch/TEXT_V1_LAUNCH_NOTE.md` 박제 (한국어 + English, in-app banner + tooltip + onboarding hint + support article)
- [x] **In-app announcement wired** — R5 UI 머지 (2026-05-26): TextV1LaunchBanner 가 DesignPage 에 mount, 한국어/영어 자동 detection, [2026-06-08, 2026-06-15] 노출 + dismiss persist
- [ ] **External announcement embargoed + 발행 채널** — 아직 marketing 채널 (blog / social / status page) 미연동
- [x] Support team briefed — `docs/help/text-editing.md` 사용자 가이드 본문 박제 (launch note 안에 포함)
- [x] **Incident-scenario comms pre-written** — `docs/communications/INCIDENT_COMMS_TEXT_V1.md` 박제 (2026-05-26): 6 scenario × ko/en 본문 + status page + email template + 일반 support reply template + tone guidelines

**Status: Conditional** — R5 UI ✅ Cleared + Incident comms ✅ Cleared. 잔여: external 채널 (blog/social/status page wire) — weave broader marketing maturity.

---

## Verdict

- [ ] **READY** — 6 pillar 중 Ready 6
- [x] **CONDITIONAL READY** — 6 pillar 중 0 Blocked / 2 Ready (Pillar 1 Product + Pillar 2 Risk) / 4 Conditional. **모든 conditional 이 critical 아님** — text v1 자체의 user-visible scope + paper trail (plan/runbook/incident comms) 모두 박제 완료. R5 UI 머지 (2026-05-26) 로 Pillar 1 + 2 close, Doc 트리플 (2026-05-26) 로 Pillar 4 QA_PLAN + Pillar 5 Runbook + Pillar 6 Incident comms 부분 close. 잔여 conditional 은 (1) R4 e2e 안전망 / (2) accessibility audit + perf smoke 실행 / (3) monitoring 통합 + staging rollback test / (4) external comm 채널. Launch T-0 직전 re-check 의무.
- [ ] BLOCKED

**Justification**:
- Risk verdict GO WITH CONDITIONS — gate 자동 BLOCKED 아님 (HOLD/NO-GO 아님)
- No Critical/High severity open
- User-visible feature 100% merged
- Code quality gates 모두 PASS (typecheck/test/build/declarativecheck/lint)
- Specialist sign-offs 3/3 APPROVED (library-adoption / standards-runtime / frontend-perf conditional)
- Reversibility 보장 (additive + vendor swap)

남은 conditional 은 marketing communication (R5 UI) + 안전망 (R4 e2e) + weave broader Ops maturity. 텍스트 v1 만의 blocker 가 아니라, weave service 의 overall production-readiness 와 묶임 (FR-001 M0-M2 SMB-tier).

---

## Open blockers (T-0 까지 close 의무)

| Item | Pillar | Owner | ETA |
|---|---|---|---|
| ~~**R5 UI 컴포넌트** (in-app banner + tooltip wire + onboarding mount)~~ ✅ Closed 2026-05-26 | ~~Product + Communications~~ | ~~hbpark + design-system~~ | ~~launch -1주~~ |
| ~~**Runbook** (text-v1 specific failure modes + mitigation + rollback)~~ ✅ Closed 2026-05-26 | ~~Operations~~ | ~~hbpark~~ | ~~launch -1주~~ |
| ~~**Incident-scenario comms pre-write**~~ ✅ Closed 2026-05-26 | ~~Communications~~ | ~~hbpark~~ | ~~launch -3일~~ |
| ~~**QA_PLAN.md**~~ ✅ Closed 2026-05-26 | ~~QA~~ | ~~hbpark~~ | ~~launch -1주~~ |
| R4 e2e 4 deferred specs (Korean IME CDP / Cmd+B/I/U range style / StrictMode mount / 2-actor concurrent) | Engineering + QA | hbpark | launch -1주 권장 (안전망) |
| Accessibility audit (WCAG 2.2 AA on text editing flow) — plan 박제, 실행만 | QA | hbpark / external | launch -2주 |
| Performance smoke test (mid-tier + Slow-4G + INP measurement) — plan 박제, 실행만 | QA + Engineering | hbpark / frontend-perf | launch -1주 |
| **M1 INP measurement (frontend-perf conditional)** | Engineering | hbpark / frontend-perf | **launch + 1개월** (post-launch 의무) |
| Migration telemetry (sentry/datadog tag locale=ko-KR text-input-anomaly) | Operations | hbpark / sre | launch + 1주 |
| Monitoring + alerts (broader weave telemetry) | Operations | hbpark / sre | broader weave WI 와 묶음 |
| Rollback test in staging | Operations | hbpark | staging 존재 시 의무 |
| External announcement 채널 (blog / social / status page) | Communications | hbpark / marketing | broader weave maturity 와 묶음 |

---

## Sign-off list

| Role | Agent / human | Signed | Timestamp |
|---|---|---|---|
| Product | hbpark (R5 UI 머지 2026-05-26 — Pillar 1 Ready) | ✅ Ready | 2026-05-26 |
| Risk & governance | `risk-governance-orchestrator` (via RISK-001 GO WITH CONDITIONS, condition #6 cleared 2026-05-26) | ✅ Ready | 2026-05-26 |
| Engineering | hbpark (via Engineering Plan 박제 + 3 specialist sign-offs APPROVED) | ✅ Conditional | 2026-05-25 |
| QA | hbpark (via QA_PLAN.md 박제 2026-05-26 + 68/68 weave + 366/366 agocraft tests + PoC manual IME PASS + R5 e2e 2/4 PASS / 2 skip; accessibility/perf 실행 잔여) | ✅ Conditional | 2026-05-26 |
| Operations / SRE | hbpark (Runbook 박제 2026-05-26; monitoring 통합 + staging rollback test 잔여 — broader Ops maturity 와 묶임) | ⚠️ Conditional | 2026-05-26 |
| Communications | hbpark (launch note doc + R5 UI in-app banner + Incident comms 6 scenario 박제 2026-05-26; external 채널 잔여) | ⚠️ Conditional | 2026-05-26 |

---

## Conditions and T-0 re-check protocol

T-0 (제안: 2026-06-08) 직전 24h 안에 다음 모두 close 확인:
1. R5 UI 컴포넌트 (banner + tooltip + onboarding) 머지 + 첫 사용자 노출 시작
2. R4 e2e 4 specs GREEN 또는 명시 deferred + justification
3. Performance smoke test 결과 박제 (INP < 200ms 50% 또는 conditional approve)
4. Runbook 박제 in `records/launch-gates/RUNBOOK-text-v1.md`
5. Incident comms (텍스트 입력/IME/Cmd+Z 회복) pre-written + support team 박제

**T-0 re-check 결과**:
- 모든 close → CONDITIONAL READY → READY 전환 → launch 진행
- 1개 이상 close 안 됨 → launch 연기 + 본 LG-001 re-run

---

## Post-launch (launch + 1개월 의무)

- M1 INP measurement (100 frame × 50 char, frontend-perf conditional gate)
- Migration telemetry — text-input-anomaly + locale=ko-KR failure rate 모니터링
- Sentiment monitoring — "코너 드래그" / "글자 크기" 관련 support 키워드 추적 (RISK-001 condition #6)
- Lexical 6mo dependency-audit 첫 점검 = 2026-11-25 (calendar 박제)

---

## Links

- Triggering Work Item: `records/work-items/WI-029-text-item-figma-equivalent.md`
- Related Risk reviews: `records/risks/RISK-001-text-item-v1.md` (GO WITH CONDITIONS)
- Related Feasibility: `records/feasibility-reviews/FR-002-text-item-figma-equivalent.md` (FEASIBLE WITH TRADE-OFFS)
- Related Decisions: `records/decisions/DR-015` (Lexical) + `DR-016` (resize paradigm)
- Engineering Plan: `features/text/ENGINEERING_PLAN.md`
- Launch note: `docs/launch/TEXT_V1_LAUNCH_NOTE.md`
- PoC RESULT: `experiments/lexical-text-poc/RESULT.md`
- agocraft cross-project: `agocraft/records/work-items/WI-016` + `HANDOFF-007/008` (all Closed)
- Runbook: (planned — launch -1주)
- Rollback test trace: (planned — staging 존재 시)

---

## Addendum — WI-040 Cross-WI dependency (2026-05-27)

**Scope**: WI-040 = canvas hover affordance (3-tier) + InteractionMode 가드 통합. Text v1 (WI-029) 자체의 acceptance 항목 아님 — 그러나 같은 DesignPage 위에서 동작하므로 launch 시점에 함께 살아 있어야 함. WI-040 Phase 1-3 모두 머지 (weave `a9458de` / `54fbe7d` / `f5a28b0` / `34e4270`, OS-root `d8bfba2` / `5175b41` / `2c5b712` / `88c3255`).

**Pillar별 영향**

| Pillar | 영향 | 상태 |
|---|---|---|
| 1 Product | + Hand/Pan, LayerPicker, Peek 모드 leak (select/move/chrome) 3종 fix. text 편집 중 다른 frame 선택 누락이 더 이상 잠재 회귀 vector 아님. | **개선** — 기존 Ready 유지 |
| 3 Engineering | + 단일-소스 게이트 hook 3개 (`useEditAffordancesAllowed` / `useSelectionChromeVisible` / `useFrameDragBindingsAllowed`) + Rule 6 (선언적 분기) 보강. Phase 3 의 projector 는 순수 함수 + 11 unit. | **개선** — 기존 Conditional 유지 (R4 e2e + INP 잔여) |
| 4 QA | + WI-040 신규 e2e 9 spec PASS (mode-gate 5 + demo 3 + hover-affordance 4 — 중 1 layer-picker ESC flake은 회귀 X). 회귀 0. | **개선** — 기존 Conditional 유지 |
| 그 외 | 변화 없음 — privacy / security / payment / legal / SRE 영역 0. | — |

**Bundle 영향**: 270 KB gz (Phase 1) → 298.52 (Phase 2) → 299.57 (Phase 3). text v1 의 frontend-perf conditional approve 의 30 KB threshold 안 (FR-002 §8).

**판정**: WI-040 은 LG-001 의 새 blocker 추가 X. 오히려 Pillar 1 의 "non-text mode leak" 잠재 회귀 vector 를 줄여줌 → text v1 launch 안정성 ▲. Hover affordance 자체는 신규 UX 였으므로 LG-001 의 Pillar 1 Acceptance Criteria 가 아닌 *adjacent* feature.

**별도 Launch Gate 필요 여부**: 미발행. WI-040 자체가 high-blast-radius 변경 아니고 (additive overlay + 게이트 hook + e2e 박제), text v1 launch 와 같이 운영 단계 진입.

**Post-launch 모니터링 추가 항목** (text v1 모니터링과 합쳐 추적):
- hover affordance 가 dense 디자인 (≥ 20 형제) 에서 시각 노이즈 — 사용자 피드백 채널 (RISK-004 §3)
- `useFrameDragBindingsAllowed` 의 register/unregister race 가 frame-manipulating 모드 직후 발생 시 incident 보고 (WI-040 R1)

**Cross-ref**:
- `records/work-items/WI-040-hover-affordance-and-mode-gate.md`
- `records/design-reviews/DR-design-016-hover-affordance-layer.md`
- `features/hover-affordance/ENGINEERING_PLAN.md`
- e2e: `apps/web/e2e/mode-gate-hardening.spec.ts`, `hover-affordance.spec.ts`, `hover-affordance-layer-demo.spec.ts`
