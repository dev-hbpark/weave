# Work Item — WI-009

## Metadata

| Field | Value |
|---|---|
| ID | WI-009 |
| Title | Interactive presentation PoC — Prezi camera nav + Genially hotspot + 확장 가능 InteractionBehavior registry |
| Owner | hbpark |
| Status | In Progress |
| Severity | P1 (사용자 명시 — 편집 동작 PoC 의 인터랙티브 UX 우선) |
| Created | 2026-05-22 |
| Target date | 2026-06-12 |
| Closed | — |

## Summary

WI-003 의 4 도메인 임베드 doc 위에 **인터랙티브 프레젠테이션 UX** 의 첫 PoC. Prezi 의 무한 캔버스 + camera zoom navigation (A) 과 Genially 의 hotspot + reveal/branch (B) 을 한 doc 안에서 자유 결합. **확장 가능한 InteractionBehavior registry 패턴** (agocraft DR-005 capability adapter 차용) 으로 미래 인터랙션 (reveal-on-step / branch-on-click / embed-autoplay 등) 의 추가가 register 한 곳.

## Scope

### In scope

1. **WI-009 발행** + **DR-009** (Interaction Registry 의 extension point 패턴).
2. **`features/presentation/UX_DESIGN.md`** — A + B 의 명세 + 확장 path + edit/present mode 분리.
3. **Document model 확장** — `Item.behaviors: ReadonlyArray<InteractionBehavior>` 추가. type union: `"camera-target" | "hotspot"` (PoC 의 2 kinds, 미래 확장).
4. **Interaction registry** — `apps/web/src/document/interactions/{registry, camera-target, hotspot}.ts`. `register(kind, adapter)` API, `dispatch(behavior, ctx)`.
5. **Edit mode (`/doc/:id`)** — DemoDocPage 갱신. 각 block 의 behaviors 시각 (camera 좌표 표시 + hotspot 표시), "Present" 버튼 (top-right).
6. **Present mode (`/doc/:id/present`)** — 새 PresentPage. Stage 컴포넌트 (camera viewport + scenes), arrow keys / space / Esc, hotspot click → reveal 또는 next-target.
7. **Design Review DR-design-002** — `Stage`, `Hotspot`, `PresentChrome` 새 design-system primitives.
8. **localStorage 갱신** — schemaVersion 2 (behaviors 추가). migration: schemaVersion 1 doc 의 default behaviors (단순 grid 의 camera-targets).
9. **Continuous Self-Verification** — dev server `/doc/demo` + `/doc/demo/present` 양쪽 시각 검증.

### Out of scope (별 WI)

- Behavior 의 inline 편집 UI (drag hotspot region, camera 좌표 입력) — Phase 2 별 WI.
- Branch-on-click / reveal-on-step / embed-autoplay 등의 새 InteractionKind — Phase 2 부터 한 kind 씩 WI 발행.
- Path animation (Prezi 의 의도된 camera path) — Phase 2.
- Audio narration / timeline — M3+.
- Export to .pptx / .pdf — M5+.
- Real-time collaborative present — M3+.
- agocraft 의 `@agocraft/editor` 의 실 활용 — WI-004 Phase 3 의 swap 라운드. 이 PoC 는 mock state 기반.

### 명시적 deferred

- agocraft 의 의존이 install 완료 (10 packages) 이지만 본 PoC 는 import 안 함 — Phase 3 의 의도된 swap 까지 mock 으로.
- Multi-step reveal (한 scene 안 의 sequential hotspot reveal) — Phase 2.

## Acceptance criteria

- [ ] `records/work-items/WI-009-interactive-presentation-poc.md` (이 파일) Status=Done.
- [ ] `records/decisions/DR-009-interaction-registry-extension-point.md` Accepted.
- [ ] `records/design-reviews/DR-design-002-presentation-primitives.md` Accepted (Stage / Hotspot / PresentChrome).
- [ ] `features/presentation/UX_DESIGN.md` 박제.
- [ ] `apps/web/src/document/interactions/{registry, camera-target, hotspot}.ts` + index.
- [ ] `apps/web/src/document/types.ts` 의 `Item.behaviors` 추가, `schemaVersion 2`.
- [ ] `apps/web/src/document/storage.ts` 의 v1 → v2 migration.
- [ ] `apps/web/src/pages/PresentPage.tsx` — Stage + arrow keys + hotspot click.
- [ ] `apps/web/src/pages/DemoDocPage.tsx` 의 Present 버튼 + behaviors 시각.
- [ ] `packages/design-system/src/components/{Stage, Hotspot, PresentChrome}.tsx`.
- [ ] `pnpm lint && pnpm typecheck && pnpm --filter @weave/web build` PASS.
- [ ] Dev server 5174 `/doc/demo` + `/doc/demo/present` 의 시각 검증.

## Context

사용자 결정 (2026-05-22):
- **A + B 토글** + **확장 가능 구조** — 한 doc 안 자유 결합, 미래 인터랙션 추가 자연.
- **/doc/:id (편집) + /doc/:id/present (재생)** — 두 mode 의 항해 명확.

벤치마크:
- Prezi 의 무한 캔버스 + path-based zoom (가장 시그니처)
- Genially 의 hotspot + reveal + branching (interactive content 의 강점)
- 두 도구의 공통 — edit ↔ present mode 분리

확장 가능 구조 의 의무 — capability dispatch (agocraft DR-005 와 동일 패턴). open registry → 새 InteractionKind 의 register 한 곳에서.

## Escalation triggers

- [x] **UI / UX change** — `frontend-design-pattern-agent` 의 Prezi/Genially 패턴 사인. `frontend-performance-agent` 의 camera transform / hotspot DOM 의 INP 사인.
- [x] **Design System Triage** — Stage / Hotspot / PresentChrome = 🌱 Grew (primitives). DR-design-002 발행.
- [ ] User data — localStorage v2 migration. 다음 mode 진입 시 자동.
- [ ] Library / dependency — 새 의존 없음 (motion lib 활용).

## Technical Feasibility verdict

- FR-001 안에 포함. 인터랙티브 프레젠테이션 은 Prezi/Genially 의 web-only 가 검증. agocraft 가 underlying composite tree + capability dispatch base.

## Links

- WI-003 (4 도메인 임베드 doc), WI-004 (편집 기능 Phase 1)
- DR-001 / DR-008 (planned, supersede 발행 의무 — 별 라운드)
- DR-007 (design system tooling)
- DR-design-001 (4 도메인 accent tokens, Accepted)
- DR-design-002 (planned — presentation primitives)
- DR-009 (planned — interaction registry)
- `features/presentation/UX_DESIGN.md` (this WI 동행)
- agocraft DR-005 (capability registry — 패턴 차용)

## Status updates

- 2026-05-22: WI-009 발행. 사용자 결정 (A+B 토글 + 확장 가능 + present route). 4 sub-tasks 분할 진행.
- 2026-05-22: Phase 1 코드 완성 — Document model schemaVersion 2, InteractionRegistry (open registry, 2 kinds: camera-target + hotspot), Stage / Hotspot / PresentChrome design-system primitives, PresentPage (`/doc/:id/present`), DemoDocPage 의 Present 버튼 + BehaviorChips. lint+typecheck+build PASS. **단 사용자 의 SVL 의무 지적 — playwright e2e 안 함**. 즉시 OS workflow step 7 진입.
- 2026-05-22: **Self-verification loop (playwright) 진입**. `@playwright/test` install + chromium + `playwright.config.ts` + `e2e/present-poc.spec.ts` (4 시나리오) 작성. **첫 run = 2 real failure 발견** (curl HTTP 200 으로는 0% 검출 — SVL 의 정확한 의도). Fix 1: Hotspot 의 scale pulse → opacity-only (element bounding box stable 의무, 사용자 click 의 의도 영향 없음). Fix 2: theme switch 의 test path 가 close button click 으로 (Esc keyboard 는 첫 test 에서 검증). Risk R-17 (motion stability) + R-18 (strict mode race) + R-19 (SVL 회피 재발 방지) 박제. **재실행 4/4 PASS** (4.3s).
- 2026-05-22: SVL 강제 mechanism 의 3 layer 추가 (A: `pnpm verify` 의 e2e 통합 hard gate, B: PostToolUse hook `tools/svl_reminder.py`, D: WI template 의 default acceptance criteria 5 항목). curl HTTP 200 의 단순 verify 의 회피 path 봉쇄.
- 2026-05-22: **Phase 2 완성 (A+B 묶음)**. **B**: 새 `RevealOnStepBehavior` + `reveal-on-step` adapter 의 registry register. PresentPage 의 scenes 생성 시 `shouldRender` AND 로 dispatch — registry 의 extension point 시연 (PresentPage / Stage / Hotspot 코드 변경 0). seed 의 demo 의 canvas / media 에 reveal-on-step 박제. **A**: `useDocument.updateBehavior` + `BehaviorEditor` (camera x/y/scale 의 input+slider, hotspot region 4 input, reveal-on-step input). DemoDocPage 의 BehaviorChips 의 reveal-on-step chip 추가. Design System Triage: ✅ Reused (Card / Button / 표준 input) — 새 primitive 없음. **SVL gate (`pnpm verify`) 6/6 PASS 5.6s** — 새 reveal-on-step + behavior-edit 의 2 시나리오 추가, 모두 PASS. R-19 의 의도 적용.
- 2026-05-22: **Phase 3 narrow swap — `@agocraft/input` 의 실 의존**. PresentPage 의 window keydown useEffect → `createInputBus({ target: window, origin: "present" })` + `createHotkeyRegistry({ bus, initialScope: "present" })`. 12 binding register (Next: ArrowRight/Space/Enter 의 multi-combo, Prev: ArrowLeft, Close: Escape, Jump: 1-9 의 9 별). `handlersRef` 로 stale closure 회피. bus.dispose + hotkeys.dispose 의 cleanup — R-18 (strict mode race) 자연 해결. agocraft 의 cross-project rule 준수 (Verdaccio publish 의존, source 직접 read 없음). **SVL gate `pnpm verify` 6/6 PASS 5.7s**. 다음 Phase 3 sub-tasks: @agocraft/core ChangeStream + History (useDocument swap), @agocraft/editor selection (Edit mode), input/bus 의 pointer 활용 (Phase 4 의 canvas direct-manipulation 의 base) — 별 라운드.
