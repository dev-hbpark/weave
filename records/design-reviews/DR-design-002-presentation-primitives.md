# Design Review — DR-design-002

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-002 |
| Title | Presentation primitives — `Stage`, `Hotspot`, `PresentChrome`, `Reveal` (확장) 의 design-system 추가 |
| Triggering Work Item | WI-009 |
| Triage outcome | **Grew (primitives)** — step 3 of design-system-triage decision tree |
| Status | **Accepted** (single-owner, agent-reviewed, hbpark sign-off 2026-05-22) |
| Owner | hbpark |
| Reviewer(s) | `design-system-agent` (auto), `frontend-design-pattern-agent` (auto), hbpark (human owner) |
| Date | 2026-05-22 |

## 1. Change in one sentence

`@weave/design-system` 에 4 컴포넌트 추가 (`Stage`, `Hotspot`, `PresentChrome`) + 기존 `Reveal` 확장 — 인터랙티브 프레젠테이션 의 Present mode 의 base.

## 2. Why

- **User problem**: WI-009 의 Prezi/Genially 류 인터랙티브 PoC 는 무한 캔버스 viewport + camera transition + clickable region + chrome 의 4 primitive 의무.
- **Why existing primitive 불충분**: 기존 `Card` / `Button` / `AuroraBg` 는 도메인 카드 + 액션 + 배경. Stage 같은 camera viewport / Hotspot 같은 region trigger / chrome 같은 fullscreen overlay 의 추상 없음.
- **Why now**: WI-009 PoC 진행 — design system 안에 박제 안 하면 app 안 inline 가능 (anti-pattern).

## 3. Visual evidence

(코드 단계 — 실 PoC 의 시각 후 capture 박제.)

각 primitive 의 의도:

- **Stage** — 캔버스 + camera viewport. 자식 scenes 의 좌표 박제. transform-origin 의 center.
- **Hotspot** — clickable region (button 의 motion + outline + pulse). aria-button 의무.
- **PresentChrome** — top progress + bottom controls. 5s idle fade.
- **Reveal (확장)** — 기존 entrance / onScroll 외에 `mode: "step"` 추가 — Present mode 의 step 기반 trigger.

## 4. Scope of the change

- [x] New component primitive — `Stage`, `Hotspot`, `PresentChrome` (3).
- [x] Existing component extended — `Reveal` 의 새 `mode: "step"` (signal-driven visibility).
- [ ] New token — 일부 새 의도된 — `--present-chrome-bg`, `--hotspot-ring`. 단 기존 semantic token 의 derivative 라 별 token 안 추가 (PoC 의 fast iteration).
- [ ] New theme variant — N/A.
- [ ] Public-facing surface — 아직 N/A. Present mode 가 향후 public preview 후보.

## 5. Consistency check

- [x] WCAG AA contrast — Hotspot ring / focus ring 의 base palette 의 cyan/magenta 그대로. 충분.
- [x] Motion respects `prefers-reduced-motion` — Stage 의 camera transition + Hotspot pulse + PresentChrome fade 모두 OFF 옵션.
- [x] Focus-visible — Hotspot 의 focus ring, PresentChrome 의 button focus, Stage 의 `tabindex={-1}` 의 키바인딩 trap.
- [x] Keyboard navigation — Stage 안 arrow / space / Esc / number, PresentChrome 의 Tab.
- [x] Component reads tokens — 새 hardcoded 색 없음. CSS variables 활용.
- [x] Variant ceiling — Stage 의 variant 0 (단일), Hotspot 의 variant 0, PresentChrome 의 variant 0. 안전.
- [x] Theme variant 별 — Aurora / Mono / Vivid 모두 의도된 동작 (chrome 의 bg 가 surface-2 의 차용).

## 6. Brand alignment

Present mode 의 시각 — Aurora glass + gradient 유지 (chrome 의 backdrop-blur). 인터랙티브 hotspot 의 pulse 가 weave 의 USP "통합" 의 시각 evidence (도메인 색 + accent 의 결합). Mono 의 경우 단조로움 — present 에서는 단일 orange highlight 만.

## 7. Agent sign-offs

| Agent | Verdict | Notes |
|---|---|---|
| `design-system-agent` | ✅ | 3 primitives 의 변형 후보 ≤ 5 의 ceiling 안. token 추가 없음 — semantic 재활용. |
| `frontend-design-pattern-agent` | ✅ | Stage/Hotspot/Chrome 의 패턴 = Prezi/Genially 의 표준. 차용 자연. |
| `frontend-architecture-agent` | ⚠️ | Stage 의 camera transform 의 INP 의무 박제 — large scene 시 paint cost 모니터. Phase 2 의 rendering-perf 의무. |
| `seo-ai-visibility-agent` | N/A | 비공개 present (현재) — public preview 시 의무. |
| `library-adoption-supply-chain-governance-agent` | N/A | 새 dep 없음. motion v12 + radix 활용. |

## 8. Human sign-off

| Name | Role | Date | Notes |
|---|---|---|---|
| hbpark | Owner / Proposer | 2026-05-22 | single-owner. agent reviews 수용 + frontend-architecture-agent 의 perf 경고 박제 (Phase 2 의 의무). |

## 9. Decision

- [x] **Accepted** — proceed to Build (WI-009).
- [ ] Accepted with conditions — N/A.

## 10. Follow-ups

- [ ] `packages/design-system/README.md` 의 컴포넌트 list 에 3 primitive + Reveal 확장 박제 (이 WI 의 build 동행).
- [ ] Phase 2 의 rendering-perf 의무 — Stage 의 transform vs absolute positioning 비교.
- [ ] Reveal 의 `mode: "step"` 의 spec — PresentContext 의 step signal 의 subscribe.

## Links

- WI-009
- DR-007 (design system tooling, Accepted)
- DR-design-001 (4 도메인 accent tokens)
- DR-009 (interaction registry)
- `features/presentation/UX_DESIGN.md`
