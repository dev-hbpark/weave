# Design Review — DR-design-003

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-003 |
| Title | `EditableText` design-system primitive — uncontrolled contentEditable wrapper with onCommit / onCancel / focus-visible ring |
| Triggering Work Item | WI-004 (Phase 1 inline 편집의 첫 정식 구현) + WI-009 (Phase 3 의 hotkey scope swap 동행) |
| Triage outcome | **Grew (new primitive)** — step 3 of design-system-triage decision tree |
| Status | **Accepted** (single-owner, agent-reviewed, hbpark sign-off 2026-05-22) |
| Owner | hbpark |
| Reviewer(s) | `design-system-agent` (auto), `frontend-design-pattern-agent` (auto), hbpark |
| Date | 2026-05-22 |

## 1. Change in one sentence

`@weave/design-system` 에 `EditableText` 추가 — click-to-edit inline text, uncontrolled (blur/Enter 의 commit), Esc 의 cancel, focus-visible ring, aria-multiline 옵션, 모든 theme 의 token 활용.

## 2. Why

- **User problem**: Slide 의 title + bullets 의 inline 편집 의무. WI-004 의 UX_DESIGN.md 의 Notion-like 패턴 박제.
- **Why existing primitive 불충분**: Card / Button 의 inline text 없음. 표준 `<input>` 의 다중 줄 / 자유 sizing 부족. `<textarea>` 의 자동 height 의 의무 보강 필요.
- **Why now**: WI-004 Phase 1 의 실 구현 진입. 미루면 SlideBlock 의 inline contentEditable 의 박제 — design system 안에 박제 안 하면 다른 도메인 (block-doc / media caption) 의 swap 시 중복 발생.

## 3. Visual evidence

- **Idle**: 텍스트 가 일반 시각 (Card 안 의 일부). 호버 시 의 미세 underline 또는 background tint.
- **Hover**: cursor=text, subtle background-tint (`var(--surface-1)` over 의 8% accent).
- **Focused (edit mode)**: focus-visible ring (`var(--focus-ring)`), caret 활성, 텍스트 placeholder 의 dimmer.
- **Committed**: 변경 직후 micro-feedback (subtle scale 1.005 의 spring once — 또는 reduce-motion 시 instant).

## 4. Scope of the change

- [x] New component primitive — `EditableText` (1).
- [ ] Existing primitive extended — N/A.
- [ ] New token — 없음. 기존 `--surface-1`, `--accent-soft`, `--focus-ring`, `--motion-spring-soft`, typography step 재활용.
- [ ] New theme variant — N/A.
- [ ] Public-facing surface — Edit mode 의 일부.

## 5. Consistency check

- [x] WCAG AA contrast — 기존 text color token 재활용. 충분.
- [x] Motion respects `prefers-reduced-motion` — commit 의 spring scale 1.005 (R-17 의 bounding-box-stable 영향 — 의도된 micro 의 OK 단 확인) → 더 안전 path: opacity flash 또는 underline 의 색 변경. 결정: **opacity flash** 의 micro-feedback (200ms). bounding-box 영향 0.
- [x] Focus-visible — `--focus-ring` 의 outline.
- [x] Keyboard navigation — Tab 의 자연 흐름, Enter / Esc 의 의무 (consumer 처리 옵션).
- [x] Component reads tokens — 새 하드코딩 색 없음.
- [x] Variant ceiling — variant 0 (단일 컴포넌트). 미래 의 `as="heading" | "paragraph"` 의 typography swap 가능.
- [x] Theme variant 별 동작 — Aurora / Mono / Vivid 모두 의도된 visual.

## 6. Brand alignment

Aurora 의 glass surface 안 의 inline edit — 사용자 의 직접 manipulation 의 강한 신호. focus-visible 의 ring 의 도메인 accent 색 차용. Mono / Vivid 의 자연 swap.

## 7. Agent sign-offs

| Agent | Verdict | Notes |
|---|---|---|
| `design-system-agent` | ✅ | new primitive 의무 — 다른 inline 편집 후보 (block-doc heading / paragraphs, media caption) 의 base. variant ceiling 안전 |
| `frontend-design-pattern-agent` | ✅ | contentEditable + uncontrolled + onCommit 의 패턴 = Notion / Linear / Figma 의 표준. React state 와 의 race 회피 의 의도된 design |
| `frontend-architecture-agent` | ⚠️ | contentEditable 의 React 와의 hostility 박제 — uncontrolled + ref 의 의무, controlled 안 함. innerText vs textContent 의 안전 path (textContent 사용). DR 박제 |
| `seo-ai-visibility-agent` | N/A | Edit mode 만 |
| `library-adoption-supply-chain-governance-agent` | N/A | 새 의존 없음. React + motion + (없을 수도) Slot 만 |

## 8. Human sign-off

| Name | Role | Date | Notes |
|---|---|---|---|
| hbpark | Owner | 2026-05-22 | single-owner. agent ⚠️ 박제 수용 (contentEditable 의 uncontrolled + textContent). |

## 9. Decision

- [x] **Accepted** — proceed to Build (Slide inline edit).
- [ ] Accepted with conditions — N/A.

## 10. Follow-ups

- [ ] `packages/design-system/README.md` 의 컴포넌트 list 에 EditableText 박제 (build 동행).
- [ ] block-doc 도메인 의 heading + paragraph 의 swap (Phase 2+ — 별 라운드).
- [ ] media caption 의 swap.
- [ ] 미래 — Heading vs paragraph 의 typography 변형 (variant: "heading" | "paragraph" | "label").

## Links

- WI-004 (Phase 1 inline 편집), WI-009 (Phase 3 hotkey scope swap)
- DR-007 (design system tooling)
- DR-design-001 (도메인 accent), DR-design-002 (presentation primitives)
- DR-009 (interaction registry — slide.editing 의 scope swap 동행)
- `features/editing/UX_DESIGN.md` § Slide 의 inline 편집
