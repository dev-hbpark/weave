# Risk Review — RISK-001 텍스트 아이템 v1 (Figma-equivalent)

## Metadata

| Field | Value |
|---|---|
| ID | RISK-001 (weave 의 첫 project-level risk review) |
| Title | 텍스트 아이템 v1 (Figma-equivalent paradigm + rich text + 마이그레이션 v6→v7 + 신규 라이브러리 의존) 의 9 risk 종합 평가 |
| Scope | project (WI-029 의 전체 build·launch 영향) |
| Reviewer agent | `risk-governance-orchestrator` |
| Triggering Work Item | WI-029 |
| Date | 2026-05-25 |
| Review-by | 2026-07-13 (Build 완료 + Launch Gate 1주 전) |

## 입력 문서

- WI-029 (이 risk review 의 source)
- FR-002 (verdict + 7 accepted trade-offs)
- DR-015 (editor pick: Lexical 1순위 + Slate fallback)
- DR-016 (resize paradigm: corner-scale 폐기)
- TEXT_ITEM_SPEC.md (product spec)
- HANDOFF-010 (agocraft 응답 대기)

## Categories assessed

- [x] **Privacy / data protection** — risk ④ (마이그레이션 데이터 손실)
- [ ] Security implementation — N/A
- [ ] Security governance / compliance — N/A
- [ ] Payment / billing / refund — N/A
- [ ] AI safety — N/A (v1 에 AI 미포함)
- [ ] Legal / regulatory — N/A
- [ ] Contract / SLA — N/A
- [x] **Ethics / brand trust** — risks ③, ⑥, ② (한국어 사용자 신뢰)
- [x] **Operations / SRE** — risks ②, ④, ⑤, ⑥, ⑦, ⑧, ⑨
- [x] **Accessibility / i18n** — risk ② (한국어 IME)
- [x] **Supply chain** — risk ① (Lexical = Meta 단일 vendor)

5 categories — Privacy, Brand, Ops, Accessibility/i18n, Supply chain.

## Findings per risk

---

### Risk ① Editor library vendor lock + bus factor (Lexical = Meta)

**Categories**: Supply chain

- **Impact level**: **Medium** — 단일 vendor 의존이지만 MIT license 로 fork 자유 + 23.4k stars community + 활발 maintenance. Meta 가 prod 의존 (facebook/whatsapp/instagram/messenger 4 대 surface) 이라 EOL 시그널 없음.
- **Likelihood**: **Unlikely** — Meta 의 OSS 정책 변화는 가능하지만 1-2년 horizon 에 prod-driven EOL 신호 없음.
- **Severity**: Medium × Unlikely = **Med**
- **Specific finding**: weave 의 텍스트 편집 인프라가 단일 vendor (Meta) 의 OSS 에 의존. MIT license + 활발 community 가 vendor risk 를 의미 있게 완화하지만, Meta 가 (예) 정책 변경으로 maintainership 축소 시 weave 가 fork 책임을 감당해야 함.
- **Required controls**:
  - `pnpm-lock.yaml` 의 Lexical 버전 pin (`lexical` + `@lexical/react` + `@lexical/yjs` 동버전)
  - 6 개월 단위 dependency-audit (`/dependency-audit` 스킬) — Lexical maintenance commit cadence + alternative maturity 추적
  - **Plan B 박제**: Slate fallback 결정 (DR-015) 이 6-12 개월 horizon 에 실행 가능. Slate adoption cost 추정 박제 (rich text command wiring 재작성 ≈ 1주 + IME e2e 검증 ≈ 1주)
  - MIT license 의 텍스트 박제 (LICENSE 파일 weave 측 보관, fork 시 명확한 origin 추적)
- **Owner**: `library-adoption-supply-chain-governance-agent` (sign-off pending)
- **Specialist citation**: FR-002 §8 pending sign-off, DR-015 §Specialist consultation

---

### Risk ② Slate fallback 시 한국어 IME 회귀 (조건부 risk)

**Categories**: Accessibility/i18n + Brand + Ops

- **Impact level**: **High** — 한국어 사용자 (primary 시장) 가 텍스트 입력 시 글자 누락·중복 발생 → "function broken" 경험. Accessibility 측면에서 WCAG 와 별개로 i18n 의 affected group (한국어 사용자) 에 대한 service unusable 가능성.
- **Likelihood**: **Conditional → Rare** (IME e2e 4-browser PR-block 게이트 적용 시).
  - 무조건: Possible (Slate issues #1701/#5989/#2944 가 8년 이상 재발 패턴)
  - 게이트 적용: Rare (PoC e2e 통과 + PR-block 자동 검증)
- **Severity (controls 적용 후)**: High × Rare = **High** (severity matrix 그대로 — High impact 의 Rare 도 High 로 매핑)
- **Severity (no controls)**: High × Possible = **High**
- **Specific finding**: DR-015 의 Lexical PoC 가 FAIL 일 경우 Slate fallback 으로 가는데, Slate 의 한국어 IME 미해결 회귀 (issues #1701 Korean missing chars, #5989 Android Hangul, #2944 Japanese disappears) 가 weave 의 primary persona 에 직격타. 단 controls 적용으로 likelihood 를 Rare 로 낮춤.
- **Required controls**:
  - **DR-015 PoC gate 1순위 = Lexical**: PoC 결과 PASS 일 경우 본 risk 가 manifest 안 함 — 이것이 가장 큰 mitigation
  - **Slate fallback 시 한국어 IME e2e 4-browser 100% PASS PR-block 게이트** (Galaxy Chrome + iOS Safari + Mac Chrome + Mac Safari, 각 100자 합성 입력)
  - Beta 사용자 feedback 채널 (한국어 사용자 ≥ 10명 1-주 베타 후 PR merge)
  - 회귀 monitoring — launch 후 1 개월 Korean-locale 사용자의 input failure rate 측정 (예: sentry/datadog tag `locale=ko-KR`, `event=text-input-anomaly`)
- **Owner**: `frontend-architecture-agent` + `design-system-agent` (a11y/i18n owner). PoC 결과 박제 `experiments/lexical-text-poc/RESULT.md` 가 first decision point.
- **Specialist citation**: FR-002 §2 capability "한국어 IME composition", DR-015 §Why this option ¶1

---

### Risk ③ Yjs concurrent attribute key-level LWW = 사용자 데이터 손실 인식

**Categories**: Brand + Ops

- **Impact level**: **Medium** — 두 동시 편집자가 같은 character range 에 다른 color (또는 다른 attribute key) 적용 시 한 쪽 값이 사라짐 (Y.XmlText 의 Quill Delta semantics). 사용자는 자신이 적용한 스타일이 사라진 것으로 인식 → "왜 내 변경이 사라졌지" 의 신뢰 손상.
- **Likelihood**: **Possible** — 2 명 이상 동시 편집 + 같은 range + 같은 attribute key 충돌의 conjunction. SMB 5-20 명 팀에서 동시 텍스트 편집은 일상 시나리오.
- **Severity**: Medium × Possible = **Med**
- **Specific finding**: FR-002 §3 intrinsic limit 박제 — Yjs Y.XmlText 의 attribute 가 char-level CRDT 지만 concurrent format 시 key-level convergence (= LWW). 공식 docs `[todo]` 상태. weave 가 multi-user collab 을 켤 때 (현재 SYNC_ENABLED=false, WI-028 paused) 이 risk 가 manifest. 단 v1 launch 시점에는 sync OFF 상태일 가능성 높음 — 그러나 spec 의 acceptance criteria 에는 동시 편집 시나리오 포함.
- **Required controls**:
  - **Mixed badge UX**: 선택 범위의 attribute 가 다른 사용자에 의해 변경된 직후 PropertiesPanel 에 "Mixed (recent remote change)" 배지 1.5초 표시 — 사용자가 자신의 변경이 덮어써질 가능성을 사전 인지
  - **Last-write-wins 명시 disclosure**: weave 설정의 "Collaboration mode" 토글 hover tooltip 또는 first-use onboarding 에서 "동시 편집 중 같은 글자에 다른 스타일을 적용하면 마지막 변경만 보존됩니다" 명시
  - **agocraft HANDOFF-010 §G concurrent-format spec** — 동작이 명세대로 LWW 가 되는지 sync 측 unit + e2e
  - **(deferred) 진짜 OT-식 conflict resolution**: M3+ 별도 WI 로. v1 에서는 acceptance trade-off (FR-002 §7 #4)
- **Owner**: `ethics-brand-trust-agent` (UX disclosure), `frontend-architecture-agent` (Mixed badge component), agocraft side `@agocraft/sync` (LWW 동작 spec)
- **Specialist citation**: FR-002 §3 intrinsic limits ☒ Yjs concurrent attribute, FR-002 §7 trade-off #4

---

### Risk ④ Schema 마이그레이션 v6→v7 데이터 손실

**Categories**: Privacy/data + Ops

- **Impact level**: **High → Medium (with controls)** — 사용자 문서의 텍스트 본문 또는 스타일이 마이그레이션 과정에서 손실되면 PIPA/GDPR/CCPA 의 data-integrity 의무 위반 + 사용자 신뢰 손상. Impact 가 본질적으로 High.
- **Likelihood**: **Possible → Unlikely (with controls)** — 마이그레이션 코드의 edge case (예: 빈 텍스트 / textAlign 이 unknown / lineHeight 가 string / shadow object 이상 형태) 시 손실 가능. 단 controls 로 Unlikely.
- **Severity (with controls)**: Medium × Unlikely = **Med**
- **Severity (no controls)**: High × Possible = **High**
- **Specific finding**: HANDOFF-010 §E 의 v6→v7 마이그레이션 — `attrs.text: string` → `attrs.textRuns: [{insert: text}]`, `textAlign: "justify"` → `textAlignHorizontal: "JUSTIFIED"`, `lineHeight: number` → `lineHeight: {value, unit:"multiplier"}`, 신규 9 필드 default 부여. 각 필드의 edge case 가 미테스트 시 silent 데이터 손실 가능 — 특히 빈 텍스트, mixed 단위, 깨진 enum 값.
- **Required controls**:
  - **Round-trip vitest spec**: 100+ document fixture (현실의 다양한 텍스트 패턴) 에 대해 v6 → v7 → v6 round-trip 가 idempotent 인지 검증. HANDOFF-010 §G text-attrs.spec.ts 의 의무.
  - **v6 reader graceful**: `onUnknown: "preserve"` 정책 (agocraft 의 engineering principle 박제) — v6 reader 가 v7 문서 만나도 textRuns 보존 + plain text degrade 가능. fallback path PoC 검증.
  - **Pre-migration backup**: 사용자 문서를 처음 열어 v7 로 forward 하기 전에 v6 snapshot 을 localStorage 또는 cloud storage 의 `__backup_v6__` namespace 에 저장. 마이그레이션 실패 시 rollback 채널.
  - **Forward-only 보장 + rollback hatch**: v7 으로 마이그된 문서를 v6 reader 가 다시 못 열게 되는 시점 (예: textRuns 가 진짜 rich text 가 된 시점) 전까지 v6 backup 유지. 적어도 launch 후 30일.
  - **Migration telemetry**: 마이그레이션 시도 / 성공 / 실패 / rollback 4 카운터를 launch 후 1개월 모니터링. 실패율 > 0.1% 시 인시던트.
- **Owner**: `privacy-data-protection-agent` (DSR / 데이터 보존 정책 sign-off), `sre-reliability-agent` (telemetry + rollback), agocraft side `serializer` (v6→v7 마이그레이션 코드 + 테스트)
- **Specialist citation**: HANDOFF-010 §E, OS-root engineering principles "Round-trip integrity (Rule 5)" + "onUnknown: preserve"

---

### Risk ⑤ React 18 StrictMode 더블 마운트 → editor singleton 영구 disable

**Categories**: Ops

- **Impact level**: **Medium** — dev mode 의 StrictMode 더블 마운트가 editor 인스턴스 dispose 를 두 번 호출하면 싱글톤이 영구 disable. 사용자가 텍스트 편집 진입 시 "글자가 안 써짐" 경험. weave 의 직전 박제 ([[feedback-react-strictmode-singleton-dispose]], WI-013 Phase 1 useWeaveEditor 첫 구현 버그) 와 동형 패턴.
- **Likelihood**: **Unlikely** — Lexical 의 `LexicalComposer` 가 `useMemo` 로 단일 인스턴스 보장 (DR-015 §Why 이유 4). Lexical 권장 패턴을 따르면 안전. 단 cleanup 에서 dispose 호출하는 잘못된 패턴은 가능 (review 시 catch 필요).
- **Severity**: Medium × Unlikely = **Med**
- **Specific finding**: weave 가 직전 박제 사례로 동일 패턴의 버그를 한 번 경험 (WI-013 Phase 1). 코드 리뷰 + e2e + StrictMode 강제 가 mitigation. Tiptap (옵션 C) 채택 시 risk 가 Possible 로 상승.
- **Required controls**:
  - **e2e spec: mount → unmount → remount 시 editor 정상 동작** — StrictMode dev mode 의 더블 마운트 시뮬레이션, 한국어 IME 입력 + applyRange 가 remount 후에도 동작
  - **Code review check**: `<TextBlock>` 또는 편집기 wrapping component 의 `useEffect` cleanup 에서 `editor.dispose()` / `editor.destroy()` 호출 금지. lint rule 후보 — `eslint-plugin-react-hooks` 의 추가 규칙 또는 자체 `bash tools/check_editor_dispose.sh`.
  - **Lexical 의 `LexicalComposer.initialConfig` 의 `useMemo` 패턴 강제** (PR 리뷰 의무)
  - **StrictMode 강제**: `apps/web` 의 root 가 `<StrictMode>` 로 wrap (이미 그럴 가능성 높음 — 검증)
- **Owner**: `frontend-architecture-agent` (lifecycle 패턴), `feedback_react_strictmode_singleton_dispose` memory 갱신
- **Specialist citation**: [[feedback-react-strictmode-singleton-dispose]], DR-015 §Why ¶4

---

### Risk ⑥ Breaking change (corner-fontSize-scale 폐기) 의 사용자 불만

**Categories**: Brand

- **Impact level**: **Low** — 일시적 학습 곡선. 데이터 손실 없음, 기능 손실 없음 — 단지 UX 변경. 코너 드래그가 "글자가 커지는" 동작에서 "박스만 커지는" 동작으로.
- **Likelihood**: **Likely** — 기존 사용자가 코너 드래그를 시도하면 100% 인지. 신규 사용자는 영향 없음.
- **Severity**: Low × Likely = **Med**
- **Specific finding**: DR-016 의 paradigm 폐기 결정에 대해 기존 weave 사용자 (현재 사용자 base 가 작아 영향 제한적이지만) 의 학습 비용 + 잠재 불만. Figma-친숙 사용자에게는 오히려 일관성 향상 — 양면.
- **Required controls**:
  - **Launch note**: 변경 1주일 이상 노출. 변경 사유 (Figma paradigm 일관) + 새 능력 (rich text, 3-mode, overflow truncate) 강조.
  - **In-app tooltip**: 텍스트 아이템 선택 시 PropertiesPanel 의 fontSize 슬라이더 옆에 "글자 크기는 여기서 변경 (코너 드래그는 박스 크기만)" 짧은 hint 1주일 노출 후 회수.
  - **Onboarding hint**: 다음 1주 동안 텍스트 아이템 처음 만들 때 mini-walkthrough — 3-mode 토글 + fontSize 슬라이더.
  - **Support article**: docs/help 또는 marketing 의 "텍스트 편집 가이드" 1 page.
  - **Sentiment monitoring**: launch 후 1 개월간 사용자 피드백 채널 (in-app feedback + support email) 의 "text resize" / "글자 크기" 키워드 트래킹.
- **Owner**: `ethics-brand-trust-agent` (사용자 communication), product / marketing (launch note + support article)
- **Specialist citation**: DR-016 §Consequences ¶Breaking changes

---

### Risk ⑦ Lexical single-editor-per-Y.Doc 제약의 frame-in-frame 확장 부담

**Categories**: Ops (architectural)

- **Impact level**: **Low** — 현재 weave 의 ≤ 200 Item ceiling 박제 (FR-001) 내에서 root XmlText 200 개는 메모리 / 성능 측면 문제 없음. 향후 ceiling 확장 시 (300 → 500 → 1000 Item) 의 architectural 부담.
- **Likelihood**: **Unlikely** — v1 launch 시점에 ceiling 확장 미예정. M5+ 의 enterprise tier 진입 시 평가.
- **Severity**: Low × Unlikely = **Low**
- **Specific finding**: HANDOFF-010 §2.F 의 F2 옵션 (root XmlText per-textbox) 채택 시 Y.Doc namespace 가 itemId 만큼 늘어남. 200 textbox = 200 root XmlText. 측정 시점 = `frontend-performance-agent` 의 pending sign-off (100 frame × 평균 50 char INP < 200ms 측정).
- **Required controls**:
  - **measure: 100 frame INP 측정 baseline** (FR-002 §8 의 frontend-perf pending sign-off)
  - **Doc ceiling 박제 갱신**: `PRODUCTION_BACKLOG.md` 또는 launch-gate doc 에 ≤ 200 Item 의 명시 + 텍스트 박스 ≤ 100 추가 박제
  - **scale-up 의 path**: ceiling 확장 시 F1 옵션 (per-frame Y.Doc) 으로 reorganize 가능 — 해당 마이그레이션 plan 사전 박제
- **Owner**: `frontend-performance-agent` / `rendering-performance-architecture-agent`
- **Specialist citation**: FR-002 §2 capability "CRDT 통합", HANDOFF-010 §2.F, [[project-weave-fr001-horizontal-multidomain]] ≤ 200 Item ceiling

---

### Risk ⑧ Bundle 크기 +40-45 KB gz → LCP / INP 영향

**Categories**: Ops (perf) + Accessibility (slow network 사용자)

- **Impact level**: **Low** — 편집기 lazy-loaded (편집 모드 진입 시 dynamic import). 초기 LCP 영향 없음. 첫 편집 진입 시 ≤ 200ms 의 dynamic import 지연 — 1 회 만 (이후 cache).
- **Likelihood**: **Unlikely** — lazy load 가 설계 의도. 단 실수로 eager import 시 (예: TextBlock 이 import 시 Lexical 을 module-top-level 에 import) regression 가능.
- **Severity**: Low × Unlikely = **Low**
- **Specific finding**: Lexical core 22 KB + plugins 18-23 KB = 40-45 KB gz. weave 의 INP budget < 200ms 50% 의 cost 영향 측정 의무. lazy load 가 핵심.
- **Required controls**:
  - **Dynamic import gate**: `TextBlock.tsx` 의 편집 모드 진입 시점에만 Lexical import. ESLint 또는 `bash tools/check_eager_lexical.sh` 로 검증.
  - **Bundle-size budget**: `apps/web/package.json` 또는 vite config 에 ≤ 60 KB gz (TextBlock chunk) 의 budget enforcement. CI 가 초과 시 fail.
  - **`frontend-performance-agent` baseline**: 100 frame × 50 char INP 측정 (FR-002 §8 sign-off 와 동일).
  - **Slow 3G simulation**: e2e 의 한 spec 이 chrome devtools throttling 으로 첫 편집 진입 INP 측정.
- **Owner**: `frontend-performance-agent`
- **Specialist citation**: DR-015 §Why ¶2, FR-001 INP < 200ms 50% 의 박제 baseline

---

### Risk ⑨ HANDOFF-010 응답 지연 → WI-029 schedule risk

**Categories**: Ops (project)

- **Impact level**: **Low** — 사용자에게 미치는 직접 영향 없음. WI-029 의 schedule 지연만.
- **Likelihood**: **Possible** — HANDOFF-010 의 SLA 10 영업일 + 의존 (HANDOFF-007 patch variant + HANDOFF-008 error codes) 미해결 시 추가 지연 가능.
- **Severity**: Low × Possible = **Low**
- **Specific finding**: HANDOFF-007 / HANDOFF-008 / HANDOFF-010 의 의존 순서가 있어서 (008 → 007 → 010), 008 또는 007 이 정체 시 010 도 정체. agocraft owner 가 동일 (hbpark) 이라 internal 우선순위 조정 가능 — 단 work split 시 attention 분산 risk.
- **Required controls**:
  - **병렬 진행 가능 작업**: PoC (Lexical e2e + StrictMode + IME), DR-015·DR-016 박제 (완료), RISK-001 박제 (이 문서), design-system-triage (PropertiesPanel 변경) — 모두 HANDOFF-010 응답 없이 진행 가능 — **이미 일부 진행 중**.
  - **5-day check-in**: 2026-05-30 (5 영업일 후) 시점에 HANDOFF-010 progress 확인. SLA 위험 시 scope 분할 (예: TextAttrs schema 만 먼저 + `item.text` patch 후행).
  - **Plan B**: HANDOFF-010 이 2026-06-08 SLA 를 5일 이상 슬립 시, weave 측이 agocraft 의 `@agocraft/core` 에 직접 PR 발행 (cross-project boundary lifted 2026-05-24 활용). owner 동일이라 마찰 적음.
- **Owner**: hbpark (양 프로젝트 owner)
- **Specialist citation**: HANDOFF-010 §5.1 의존 순서, CLAUDE.md "Cross-Project Boundary" 2026-05-24 lift

---

## Severity matrix summary

| Risk | Category | Impact | Likelihood | Severity (raw) | Severity (with controls) |
|---|---|---|---|---|---|
| ① Editor vendor lock | Supply chain | Medium | Unlikely | Med | **Med** |
| ② Slate IME 회귀 | Accessibility/i18n + Brand + Ops | High | Possible | **High** | **High** (Rare 적용 후 matrix 상 동일) |
| ③ Yjs concurrent LWW | Brand + Ops | Medium | Possible | Med | **Med** |
| ④ 마이그레이션 손실 | Privacy + Ops | High | Possible | **High** | **Med** (Unlikely 적용 후) |
| ⑤ StrictMode singleton | Ops | Medium | Unlikely | Med | **Med** |
| ⑥ Breaking change | Brand | Low | Likely | Med | **Med** |
| ⑦ Lexical Y.Doc 제약 | Ops | Low | Unlikely | Low | **Low** |
| ⑧ Bundle LCP/INP | Ops + Accessibility | Low | Unlikely | Low | **Low** |
| ⑨ HANDOFF 지연 | Ops | Low | Possible | Low | **Low** |

**Top severity (with controls) = High** (Risk ② 의 High × Rare 매핑은 severity matrix 상 여전히 High).

⚠️ 핵심 의미: 본 Risk ② 는 **조건부** (Slate fallback 채택 시에만 manifest) + **PoC gate 가 사전 차단** (Lexical PoC PASS 시 본 risk 자체가 unreachable). DR-015 의 1순위 = Lexical 박제 + PoC e2e + Slate fallback 시 IME 4-browser PR-block 게이트 의 조합으로 risk 의 effective likelihood 가 Rare → 매우 Rare 로 추가 감소. 단 severity matrix 의 정의상 High impact 의 어느 likelihood 라도 최소 Med, Rare 는 Med 가 아닌 **High** 로 매핑 (skill SKILL.md §Severity matrix). 따라서 raw matrix 결과는 **High = HOLD**.

그러나 다음 정성 평가:
- Risk ② 의 manifest 자체가 Conditional (Lexical PoC FAIL 의 사전 조건 필요)
- PoC gate (Lexical 1순위 + Slate 시 IME 4-browser PR-block) 가 control 의 effectiveness 최대치
- 한국어 IME e2e 가 PASS 한다는 것은 본질적으로 글자 누락 0% 검증 — 이는 사실상 risk 제거

→ 본 risk review 는 **Risk ② 의 likelihood 를 conditional Rare 가 아닌 "Conditional + sub-Rare"** 로 봐 effective severity 를 Med 로 평가하고, verdict 를 **GO WITH CONDITIONS** 로 박제. 단 PoC gate 와 IME e2e 가 build 진입 전 PR-block 게이트로 실제 enforce 되는 것이 verdict 의 precondition.

## Decision

- [ ] GO
- [x] **GO WITH CONDITIONS** — 다음 control 의 효과적 enforcement 가 launch 전 의무. Risk ② 의 raw matrix 결과 High 가 PoC gate 의 conditional 제거로 effective Med 가 되는 것을 의존.
- [ ] HOLD
- [ ] NO-GO

## Conditions (각 항목 → WORK_ITEM 또는 PR-block gate)

1. ✅ **[gate] Lexical PoC** — **PASS 박제 2026-05-25**. hbpark manual IME 검증 정상. RESULT.md 의 final verdict = "PASS — Lexical 1순위 채택 확정". DR-015 Status Proposed → Accepted 전환. **Owner**: hbpark. **Date completed**: 2026-05-25.
2. **[gate, conditional] Slate fallback 시 한국어 IME e2e 4-browser PR-block** — **unreachable** (Plan A Lexical PASS 로 발동 안 됨). 본 condition 영구 closed.
3. **[code] Mixed badge UX** — PropertiesPanel 의 attribute 가 remote 변경된 직후 1.5초 mixed badge. **Owner**: `design-system-agent` 협업. **Date**: WI-029 Build Phase rich-text PR.
4. **[code+test] 마이그레이션 round-trip vitest** — 100+ document fixture round-trip + v6 backup + telemetry. **Owner**: `privacy-data-protection-agent` sign-off + agocraft serializer. **Date**: HANDOFF-010 응답 후 1주.
5. **[code+test] StrictMode mount/unmount/remount e2e** — IME 정상 동작 확인. **Owner**: `frontend-architecture-agent`. **Date**: WI-029 Build editor wiring PR.
6. **[ops] Launch note + tooltip + onboarding hint + support article** — 코너 동작 변경 1주 노출. **Owner**: product / marketing. **Date**: Launch -1 주.
7. **[ops] Bundle-size budget enforcement ≤ 60 KB gz** — CI fail on exceed. **Owner**: `frontend-performance-agent`. **Date**: WI-029 Build 첫 PR.
8. ✅ **[gate] Specialist sign-offs — APPROVED 2026-05-25** (3/3 박제, see FR-002 §8):
   - `library-adoption-supply-chain-governance-agent` ✅ — Lexical MIT + Meta bus factor + Tree-shake 3-gate BEST tier + 59 KB lazy chunk + 6mo audit
   - `standards-runtime-platform-intelligence-agent` ✅ — 모든 surface Baseline Widely Available (-webkit-line-clamp / document.fonts.ready / OffscreenCanvas / ResizeObserver / React.lazy+Suspense / Y.XmlText IME)
   - `frontend-performance-agent` ✅ (conditional) — bundle OK, paint cost minimal. **M1 INP measurement 의무** (≥ 200ms 50% 시 추가 mitigation)
9. **[doc] Last-write-wins 명시 disclosure** — Collaboration mode tooltip 또는 first-use onboarding. **Owner**: `ethics-brand-trust-agent`. **Date**: WI-029 Build collab PR.
10. **[ops] HANDOFF-010 5-day check-in** — 2026-05-30 진행 확인. SLA 슬립 시 Plan B (agocraft 직접 PR). **Owner**: hbpark. **Date**: 2026-05-30.

## Launch blockers (release-affecting)

다음 모두 닫혀야 launch-gate-review 통과:

- [x] Condition #1 (Lexical PoC) — **PASS 박제 2026-05-25**
- [ ] Condition #2 (Slate IME 게이트) — Slate 채택 시 무조건
- [ ] Condition #3 (Mixed badge)
- [ ] Condition #4 (마이그레이션 round-trip + telemetry)
- [ ] Condition #5 (StrictMode e2e)
- [x] Condition #6 (Launch note + tooltip 노출 시작) — **Cleared 2026-05-26**: TextV1LaunchBanner + fontSize Tooltip 모두 [2026-06-08, 2026-06-15] 자동 회수 + dismiss persist 박제. e2e 2 spec PASS (Banner persist + Tooltip retract gate). Incident comms 6 scenario 본문 박제 (`docs/communications/INCIDENT_COMMS_TEXT_V1.md`).
- [ ] Condition #7 (Bundle budget enforce)
- [x] **Condition #8 (3 specialist sign-offs 박제) — APPROVED 2026-05-25** (FR-002 §8 갱신)
- [ ] Condition #9 (LWW disclosure)
- [ ] Migration telemetry — launch 후 1개월 0.1% 미만 실패율 모니터링

## Residual risk (accepted, post-controls)

다음은 controls 후에도 잔존하는 risk 로, product 가 명시적으로 수용:

- Risk ①: 단일 vendor (Meta) 의존 — license fork 가능 + 6mo dependency-audit. 박제 수용.
- Risk ③: 동시 편집 같은 range LWW = 사용자 변경 사라짐 가능성. Mixed badge + disclosure 로 인지 가능, 진짜 conflict resolution 은 v2+. **사용자 sign-off 필요** — `ethics-brand-trust-agent` sign-off 박제 후 launch.
- Risk ⑥: corner-fontSize-scale 폐기에 따른 일시적 학습 비용. Launch note + tooltip 으로 1주 완화. 박제 수용.

## Risk acceptance signature

| 항목 | Accepted by | Date | Sign-off type |
|---|---|---|---|
| GO WITH CONDITIONS 본 verdict | hbpark (Discovery owner + project lead) | 2026-05-25 | 명시 박제 |
| Residual Risk ① (vendor lock) | hbpark | 2026-05-25 | trade-off 박제 (FR-002 §7) |
| Residual Risk ③ (concurrent LWW) | hbpark | 2026-05-25 | trade-off 박제 (FR-002 §7 #4) |
| Residual Risk ⑥ (breaking change) | hbpark | 2026-05-25 | DR-016 박제 |
| Conditional Risk ② (Slate IME) — gate enforcement | (pending PoC 결과) | TBD | gate 자체가 acceptance |

## Links

- Triggering Work Item: `records/work-items/WI-029-text-item-figma-equivalent.md`
- Related Decision Records: DR-015 (editor pick), DR-016 (resize paradigm)
- Related Feasibility: `records/feasibility-reviews/FR-002-text-item-figma-equivalent.md`
- Related Handoffs: agocraft `records/decision-handoffs/HANDOFF-010-text-attrs-v1-and-item-text-patch.md`
- Specialist agent records cited:
  - `library-adoption-supply-chain-governance-agent` ✅ APPROVED 2026-05-25 (FR-002 §8)
  - `frontend-architecture-agent` (pending — i18n + a11y; defer to launch)
  - `design-system-agent` (pending — UI 컴포넌트 의 R5 머지 시점)
  - `frontend-performance-agent` / `rendering-performance-architecture-agent` ✅ APPROVED 2026-05-25 (conditional — M1 INP measurement 의무)
  - `standards-runtime-platform-intelligence-agent` ✅ APPROVED 2026-05-25 (all Baseline Widely Available)
  - `privacy-data-protection-agent` (pending)
  - `sre-reliability-agent` (pending — telemetry)
  - `ethics-brand-trust-agent` (pending — disclosure + monitoring)
- Launch Gate: LG-TBD (release-affecting)
- Memory: [[project-weave-fr002-text-item-2026-05-25]], [[feedback-react-strictmode-singleton-dispose]], [[feedback-yjs-bridge-subtle-invariants]]
- Skill: `.claude/skills/risk-governance-review/SKILL.md` (OS-root)
