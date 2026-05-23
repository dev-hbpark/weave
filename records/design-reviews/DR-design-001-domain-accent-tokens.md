# Design Review — DR-design-001

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-001 |
| Title | Add 4 domain accent tokens (`--domain-{slide,canvas,block,media}-accent`) to all 3 theme variants |
| Triggering Work Item | WI-003 |
| Triage outcome | **Grew (new token)** — step 4 of design-system-triage decision tree |
| Status | **Accepted** (single-owner, agent-reviewed, hbpark sign-off 2026-05-22) |
| Owner (proposer) | hbpark |
| Reviewer(s) | `design-system-agent` (auto), hbpark (human owner — pre-team) |
| Date | 2026-05-22 |
| Target SLA | — (single owner) |

## 1. Change in one sentence

4 도메인 (slide / canvas-design / block-doc / media) 의 시각 정체성을 위한 4 개의 semantic accent token 을 design system 에 추가, 3 theme variant 모두에 매핑.

## 2. Why

- **User problem**: 한 doc 안에 4 도메인이 혼재될 때, 사용자가 어떤 block 이 어떤 도메인인지 시각 즉시 구분 의무. text label 만으로는 scan 비효율.
- **Why existing palette 불충분**: base palette 의 magenta/cyan/violet/amber 는 있음. 단 "도메인 → 색" 의 semantic 매핑 미박제. component 마다 직접 `var(--color-cyan-500)` 하드코딩 하면 향후 theme variant 의 일관성 깨짐 + 도메인 색 변경 시 모든 component 수정.
- **Why now**: WI-003 첫 prototype 진입. token 부재 시 즉시 inline 색 박힘 — 청산 비용 큼.

## 3. Visual evidence

(코드 단계 — 실제 mock 렌더 후 capture 박제.)

도메인 매핑:

| 도메인 | 색 | rationale |
|---|---|---|
| **slide** | cyan | clear / structural — 발표 의 명료함 |
| **canvas-design** | magenta | vibrant / creative — 자유 디자인의 활기 |
| **block-doc** | violet | thoughtful / textual — 사색의 톤 |
| **media** | amber | warmth / visual — 이미지/비디오의 따뜻함 |

Base palette 그대로 활용 (이미 4 가지). new color 없음 — semantic 매핑만 새로 박힘.

## 4. Scope of the change

- [x] New semantic token — `--domain-slide-accent`, `--domain-canvas-accent`, `--domain-block-accent`, `--domain-media-accent` (4 개).
- [ ] Modified existing token — N/A.
- [ ] New component primitive — N/A (이 review 의 scope 안 아님; mock renderer 는 별도 cleanup).
- [ ] New variant on an existing component — N/A.
- [ ] New theme variant — N/A.
- [ ] Public-facing surface — 아직 N/A (demo page 가 미래 public preview 후보).

## 5. Consistency check

- [x] All new color/text combinations meet WCAG AA contrast — base palette 의 500 step 은 black bg 에 충분 (≥ 4.5:1). text 가 아닌 보더/라벨/아이콘 색이라 더 lenient.
- [x] Motion respects `prefers-reduced-motion` — token 만 추가, motion 변경 없음.
- [x] Focus-visible ring — 영향 없음 (`--focus-ring` 유지).
- [x] Keyboard navigation — 영향 없음.
- [x] Component reads tokens — mock renderer 는 새 token 직접 참조 의무.
- [x] Variant ceiling — N/A.
- [x] Theme variant 별 정의 — Aurora / Mono / Vivid 모두에 4 token 정의 의무.
- [x] Token registry — 4 도메인 = 4 token. 향후 5번째 도메인 추가 시 동일 review 필요.

## 6. Brand alignment

도메인 정체성 = weave 의 USP "통합" 의 시각 evidence. Aurora base palette 의 4 색이 이미 brand DNA → 도메인 매핑이 자연스러운 확장. Mono 에서는 단일 orange accent 유지 (도메인 구분 없음 — sharp 진중함 우선). Vivid 에서는 더 강한 saturation.

## 7. Agent sign-offs

| Agent | Verdict | Notes |
|---|---|---|
| `design-system-agent` | ✅ | semantic token 매핑이 component API 와 결합 안 됨 — 도메인 추가/제거 시 lokal 변경. variant 폭발 없음. WCAG AA 충족. |
| `frontend-design-pattern-agent` | ✅ | 도메인-색 1:1 매핑 = 표준 패턴. 색 의존이 도메인 추가 시 확장 가능. |
| `frontend-architecture-agent` | N/A | token-only, 아키텍처 영향 없음. |
| `seo-ai-visibility-agent` | N/A | 비공개 demo page. |
| `library-adoption-supply-chain-governance-agent` | N/A | 새 library 없음. |

## 8. Human sign-off (design team)

| Name | Role | Date | Notes |
|---|---|---|---|
| hbpark | Owner / Proposer | 2026-05-22 | single-owner stage; design team 미형성. design-system-agent review 의 결과 그대로 수용. |

## 9. Decision

- [x] **Accepted** — proceed to Build (WI-003).
- [ ] Accepted with conditions — N/A.
- [ ] Rejected — N/A.
- [ ] Deferred — N/A.

## 10. Follow-ups

- [ ] `packages/design-system/README.md` 의 token list 에 도메인 token 4 개 박제 (M1 build 동행).
- [ ] mock renderer 가 `var(--domain-*-accent)` 직접 참조 (하드코딩 색 금지).
- [ ] 5번째 도메인 추가 시 동일 review 의무 (DR-design-NNN 발행).
- [ ] Mono theme 에서 도메인 구분 의도 약화 — Mono 사용 시 도메인 라벨 (텍스트) 의 가독성 강화 의무.

## Links

- WI-003
- DR-007 (design system tooling, Accepted)
- WI-002 (design system foundation, In Progress)
- SKILL: `.claude/skills/design-system-triage/SKILL.md`
- Template: `docs/06-templates/DESIGN_REVIEW.md`
