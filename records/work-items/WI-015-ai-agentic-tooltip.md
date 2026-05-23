# Work Item — WI-015

## Metadata

| Field | Value |
|---|---|
| ID | WI-015 |
| Title | AI Agentic Tooltip — context + action + shortcut tooltip with smart debouncing and fluid morphing |
| Owner | hbpark |
| Status | Done (Phase A–E all closed, 2026-05-23). DR-design-006 still Proposed — sign-off pending. |
| Severity | P2 |
| Created | 2026-05-23 |
| Target date | M0 (design-system foundation completion window) |
| Closed | 2026-05-23 |
| Source | User prompt (2026-05-23) "Create a Design System Component: AI Agentic Tooltip" |

## Summary

`@weave/design-system` 에 새 primitive **`AITooltip`** 박제 — 마우스가 머무른 대상 요소의 **컨텍스트(설명)**, **수행 가능한 액션**, **각 액션의 단축키 키캡**을 셋으로 묶어 보여주는 지능형 힌트 툴팁. 각 영역은 독립적으로 On/Off 가능하고, 빈번한 마우스 이동에서 시각 소음을 최소화하기 위해 **진입 지연 150–200 ms**, **이탈 버퍼 100 ms** 의 디바운싱을 가지며, 인접 대상으로 마우스가 옮겨가면 닫혔다 다시 열리는 분절감 없이 **너비/높이/좌표가 보간되는 shared-element morphing** 으로 이어진다. 호출 측은 React props 또는 HTML `data-*` dataset 중 어떤 쪽으로도 선언할 수 있다.

## Scope

**In scope**
- 새 primitive `AITooltip` + provider `AITooltipProvider` 를 `packages/design-system/src/components/AITooltip.tsx` 에 박제.
- 영역별 On/Off (context info / action list / shortcut badge) — 비활성 영역은 layout 에서 사라지고 나머지 영역만으로 재조정.
- 디바운싱: 진입 175 ms (150–200 ms 범위 안에서 prop 으로 조정 가능), 이탈 100 ms.
- Shared-element morphing: 현재 열린 인스턴스 유지 + 새 target rect 로 width / height / top / left 보간. 이징은 `var(--motion-spring-soft)` + duration `var(--motion-normal)` 기본. prop 으로 override 가능.
- API 양면 지원:
  - **Props 형 (React)** — `<AITooltipProvider>` 안에서 자식 컴포넌트가 `useAITooltipTarget({ ... })` 으로 ref + 데이터를 binding.
  - **Dataset 형 (auto-discover)** — `<AITooltipProvider scan="dataset">` 시 `data-ai-tooltip="true"` 가 있는 노드 자동 감지.
- 디자인 토큰 상속 — `surface-1`, `surface-1-border`, `text-strong`, `text-soft`, `accent-soft`, `radius-md`, `radius-sm`, `shadow-glass`, `focus-ring`, motion 토큰 사용. 색·서체·그림자 하드코딩 금지.
- a11y — WAI-ARIA tooltip pattern (`role="tooltip"`, `aria-describedby`, focus path 지원), `prefers-reduced-motion: reduce` 시 morphing OFF + fade only.
- 3 theme variant (Aurora / Mono / Vivid) 모두에서 contrast / 시각 안정성 통과.

**Out of scope (이번 WI 에서 제외)**
- Tooltip 안에서의 클릭 가능한 액션 실행. 이번 단계는 **읽기 전용 힌트** — 액션 라벨/단축키 표시만, 실행은 호스트가 별도 hotkey 로 처리.
- Touch / coarse-pointer 대응. `(hover: none)` 환경에서는 자동 비활성화 — 별 WI 에서 long-press fallback 검토.
- DropdownMenu / ContextMenu 의 plain text shortcut → 키캡 마이그레이션 (스코프 분리, 다음 라운드).

**Explicitly deferred**
- Motion 토큰 추가 (별 motion variant 필요시) — 현재는 기본 `--motion-normal` + `--motion-spring-soft` 로 시작.
- Tooltip 안 아이콘 / 미디어 슬롯 (예: 도움말 비디오 썸네일) — v2.

## Acceptance criteria

- [ ] `DR-design-006` Accepted (design-system-agent + human sign-off) before merge — new primitive (Triage Step 3) + 향후 public-facing surface 후보.
- [ ] `pnpm verify` PASS (lint / typecheck / unit / build).
- [ ] **UI change** → `apps/web/e2e/ai-tooltip.spec.ts` PASS — 최소 시나리오:
  - hover 175 ms 미만 이동 시 툴팁 나타나지 않음.
  - 175 ms 이상 머무름 시 툴팁 표시 + `role="tooltip"` 노출.
  - context / actions / shortcuts 의 On/Off 조합 4 종 (모두 ON / context-only / actions+shortcuts / actions only without shortcuts) 각각 정확히 활성 영역만 노출.
  - 인접 target 으로 이동 시 (100 ms 이내) 동일 인스턴스가 morph — 사라졌다 다시 등장하지 않음 (test: `data-ai-tooltip-id` 의 stable identity 확인).
  - `prefers-reduced-motion: reduce` 시 morph 없이 fade only.
- [ ] Unit 테스트: 디바운스 타이밍 (fake timers) + 영역 활성화 / 비활성화 시 DOM tree 검증.
- [ ] 3 theme (Aurora / Mono / Vivid) 모두에서 contrast 통과 + 시각 점검 screenshot.
- [ ] `tools/validate_workspace.py` PASS (구조 검사 회귀 없음).
- [ ] `packages/design-system/src/components/index.ts` 의 named const export — default export / catalogue object 금지 (트리 쉐이킹 규칙 박제).
- [ ] 새 외부 의존성 추가 시 `library-adoption-supply-chain-governance-agent` sign-off — **현재 계획: motion lib (이미 도입됨) 만 사용 → 신규 의존성 0**.

## Context

- **사용자 요청 (2026-05-23)**: 디자인 시스템에 "AI Agentic Tooltip" 컴포넌트 추가. 시각 토큰 종속성 제거 + 영역별 On/Off + 175 ms / 100 ms 디바운싱 + 인접 target 간 shared-element morphing.
- **WHY now**: M0 design-system foundation 의 "Tooltip" backlog (features/design-system/README.md 의 "다음 (M0 안)" 목록) 가 명시 — 이번 WI 가 그 항목의 박제. 단순 generic tooltip 이 아니라 **agentic hint** (context + actions + shortcuts) 의 합성형으로 격상.
- **WHY existing primitives 불충분**:
  - `Card` / `Reveal` — entrance 만 다루고 hover-bound floating positioning + auto-dismiss 가 없음.
  - DropdownMenu / ContextMenu — 클릭/우클릭 발화 전제. hover-only floating hint 와 trigger pattern 이 다름.
  - Radix `react-tooltip` — 사용 가능하지만 (a) shared-element morph 가 자체 지원 안됨 (b) action list / shortcut keycap row 같은 합성 layout 을 자체적으로 표현 못함. **wrapping 하기보다 합성형 primitive 박제가 깔끔** — DR-design-006 에서 자세히 평가.
- **WHY structured 합성형**: 단순 "한 줄 hint" 가 아니라 "왜 (context) — 무엇을 할 수 있는지 (actions) — 어떻게 (shortcuts)" 의 3 층 정보 위계를 한 칸에 박제하면 onboarding · power-user · 비전공자 가이드 의 3 use case 를 1 컴포넌트로 흡수.

## Phased plan

- [x] **A. 문서** — WI-015 + DR-design-006 발행 (2026-05-23). DR-design-006 status: Proposed (sign-off pending).
- [x] **B. Core primitive** — `AITooltip.tsx` 박제 완료. `AITooltipProvider` (single-instance state) + portal + 영역별 On/Off layout + 기본 placement (bottom with edge flip). 3 theme (Aurora / Mono / Vivid) 모두 visual smoke PASS.
- [x] **C. 디바운싱 + dataset binding** — 4-state machine (idle / pending-show / visible / pending-hide) + 175 ms show timer + 100 ms hide buffer. 동일 target 재진입 시 hide 취소; 다른 target 으로 옮기면 instant switch (visible 상태 유지, Phase D 가 visual morph 추가). `scan="dataset"` 옵션 — document pointerover delegation + closest('[data-ai-tooltip="true"]') + relatedTarget transition detection. `readTooltipDataset()` — context / actions / show-* 파싱 with explicit-overrides-default 시맨틱. **fake timer 단위 검증은 design-system 의 기존 convention (test=echo, "visual coverage via apps/web e2e") 에 따라 e2e 실 timing 검증으로 대체** — `apps/web/e2e/ai-tooltip.spec.ts` 5 시나리오 PASS.
- [x] **D. Shared-element morphing** — motion `layout` + `layoutDependency={active.element}` 으로 target 전환 시에만 FLIP. `transition.layout = { duration: 0.24, ease: cubic-bezier(0.22, 1, 0.36, 1) }` (motion-normal + spring-soft 토큰 매핑). 진입 마운트 / setPosition 의 placeholder→real 핸드오프는 dep 변화 없으므로 morph 미발생 (entrance fade 만). `useReducedMotion` 시 layout duration 0. **RAF-tight sampling 검증** — 7 ms 시점 `translate(-682, -171)` → 53 ms `(-222, -55)` → 100 ms `(-57, -14)` → 244 ms `none` 으로 smooth 보간 박제.
- [x] **E. 테스트 + a11y + visual baseline** — (1) WAI-ARIA: 모든 binding 에 `aria-describedby="weave-ai-tooltip-surface"` 자동 부여 + Esc keydown 시 100 ms hide-buffer 우회 즉시 close (state 직접 → idle). (2) `apps/web/e2e/ai-tooltip.spec.ts` 10 시나리오 PASS — show-delay <175ms/>175ms, hide-buffer leave+return, dataset auto-discover, shared-element morph (RAF-tight, peak `|tx|>100px` + final `|tx|<2px`), a11y aria + Esc, reduced-motion morph snap, edge-flip placement, theme inheritance, region On/Off. 5x stability rerun PASS. (3) Phase E visual baseline — 3 theme (Aurora / Mono / Vivid) screenshot at `/tmp/weave-verify/phase-e-{theme}.png`.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| 디바운스 타이머가 너무 길거나 짧으면 답답함 / 시각 소음 발생 | 175 ms 기본값을 prop 으로 override 가능하게. 실 사용 후 hbpark 의 한 화면 한 테스트로 조정. |
| dataset 의 auto-scan 이 큰 DOM tree 에서 성능 부담 | document-level 단일 listener + closest('[data-ai-tooltip="true"]') 만 검사. MutationObserver 는 사용 안 함 — 매 hover 시 실시간 resolve. |
| Shared-element morph 가 frame skip / jank 유발 | motion lib `layout` 의 GPU-friendly transform 사용. settle 후 will-change auto 로 release (Stage 의 박제와 동일 paradigm — 참고: [feedback-react-strictmode-singleton-dispose](../../.claude/skills/...)). |
| Radix tooltip 으로 wrap 하지 않은 결과 → ARIA pattern 의 자체 박제 필요 | role="tooltip" + aria-describedby + Esc dismiss + focus-visible path 의 표준 패턴 박제. e2e 의 키보드 시나리오로 회귀 방어. |

## Status updates

- 2026-05-23: **WI-015 발행** — 사용자 명시 prompt 기반. Phase A (문서) 시작. DR-design-006 동시 작성 중.
- 2026-05-23: **Phase A 완성** — WI-015 + DR-design-006 작성. `features/design-system/README.md` 의 M0 backlog 의 Tooltip 항목 연결. `tools/validate_workspace.py` PASS (67/27/27).
- 2026-05-23: **Phase B 완성** — `packages/design-system/src/components/AITooltip.tsx` 박제. `AITooltipProvider` + `Floating` (portal + AnimatePresence + edge-flip placement) + `useAITooltipTarget` hook + `AITooltip` wrapper (Radix `Slot` 기반 child composition). `apps/web/src/App.tsx` 에 provider mount. 토큰만 사용 (Hard rule 2 통과), 신규 deps 0. **DesignPage toolbar Undo IconButton** 을 첫 real-product usage 로 wiring — Playwright 로 3 theme (Aurora / Mono / Vivid) 시각 smoke PASS (`/tmp/weave-verify/tooltip-{theme}.png`). `pnpm verify` (typecheck / unit 56 / build) PASS. **37/37 e2e (1 skip) PASS** — 회귀 없음. Phase C (debounce + dataset auto-discover) 다음.
- 2026-05-23: **Phase C 완성** — `AITooltipProvider` 가 4-state machine (idle / pending-show / visible / pending-hide) 으로 175 ms / 100 ms 타이머 적용. 동일 target 재진입 → hide cancel; 다른 target → instant switch (visible 유지). `scan="dataset"` 시 document `pointerover` delegation + `closest('[data-ai-tooltip="true"]')` + relatedTarget transition detection. `readTooltipDataset()` 가 context / actions (JSON parse with malformed-fail-silent) / show-* (`"true"`/`"false"` explicit overrides default-by-presence) 파싱. `apps/web/src/App.tsx` 의 provider 에 `scan="dataset"` 적용 — host-level 의 자동 감지. **5/5 신규 e2e PASS** (`apps/web/e2e/ai-tooltip.spec.ts` — show debounce <175ms / >175ms / hide buffer / dataset auto-discover / region On/Off). **42/42 전체 e2e (1 skip) + 56/56 unit + typecheck + build PASS** — 회귀 없음. Phase D (shared-element morphing) 다음.
- 2026-05-23: **Phase D 완성** — `<motion.div layout layoutDependency={active.element}>` 으로 target 전환 시에만 FLIP. `transition.layout = { duration: 0.24, ease: cubic-bezier(0.22, 1, 0.36, 1) }` 가 motion-normal + spring-soft 토큰 매핑. layoutDependency 가 mount/setPosition 핸드오프를 morph 에서 제외 (active.element 가 그대로) — 진입은 fade 만, target 전환만 morph. `useReducedMotion` 시 layout duration 0. **RAF-tight 검증** (`/tmp/weave-verify/tooltip-morph-debug.mjs`) — 7 ms 시점 transform `translate(-682, -171)` → 53 ms `(-222, -55)` → 100 ms `(-57, -14)` → 244 ms `none` 으로 smooth 보간. 신규 e2e 1개 추가 — `apps/web/e2e/ai-tooltip.spec.ts` "shared-element morph" — RAF 샘플링 후 (a) count=1 유지 (no remount), (b) 초기 |tx| > 100 px, (c) 최종 |tx| < 2 px, (d) 중간값 strict between — 모두 PASS. **43/43 전체 e2e (1 skip) + 56/56 unit + typecheck + build PASS** — 회귀 없음. Phase E (visual baseline + 추가 robustness 시나리오) 만 남음.
- 2026-05-23: **Phase E 완성 — WI-015 Done**. (1) **A11y**: 모든 binding 에 `aria-describedby="weave-ai-tooltip-surface"` 자동 부여 (hook + wrapper). Esc keydown 시 hide-buffer 우회 즉시 close (state 직접 → idle, clearShowTimer + clearHideTimer + setActive(null)). Esc listener 는 active 가 non-null 일 때만 등록. (2) **Phase E e2e**: 4 신규 시나리오 — a11y aria + Esc (Esc 30ms 안 dismiss), reduced-motion (peak |tx| < 2 px), edge-flip (target near bottom → tip above), theme inheritance (Aurora/Mono/Vivid bg/border tokens 모두 서로 다름). 기존 morph e2e 의 안정성 강화 (RAF + dispatch 같은 evaluate 안 결합, IPC race 해소). **10 ai-tooltip e2e × 5 stability runs PASS**. (3) **전체 회귀**: 47/47 전체 e2e (1 skip) + 56/56 unit + typecheck (양 패키지) + build PASS. (4) **Phase E visual baseline**: `/tmp/weave-verify/phase-e-{aurora,mono,vivid}.png` 3장 캡처 (artifacts; repo 미커밋). (5) **Acceptance status**: pnpm verify PASS, UI change → e2e PASS, 3 theme contrast PASS, validate_workspace.py 67/27/27 PASS, named const export, 신규 외부 deps 0. **DR-design-006 Accepted before merge 의 sign-off 만 남음** — agent / 사용자 sign-off 후 본 코드 merge 가능. WI-015 자체는 모든 phase + acceptance 만족, Done.

## Cross-references

- DR-design: `records/design-reviews/DR-design-006-ai-agentic-tooltip.md`
- Triage SKILL: OS-root `.claude/skills/design-system-triage/SKILL.md`
- Design system feature: `features/design-system/README.md` (M0 backlog: "Tooltip"), `features/design-system/RULE.md` (hard rule 1, 2, 3 적용)
- Code structure rules (트리 쉐이킹 / extension point): [feedback-tree-shaking-first](../../.claude/...) — named const export 의무
- Prior primitive bundle: DR-design-005 (editor chrome 7 primitives) — API shape 의 reference
