# Work Item — WI-004

## Metadata

| Field | Value |
|---|---|
| ID | WI-004 |
| Title | agocraft-integrated editing — Notion-like 기본 + 도메인별 변형 |
| Owner | hbpark |
| Status | Done (Phase 3 의 agocraft 통합은 WI-013 으로 분리·완성, 2026-05-22) |
| Severity | P1 (M1 의 본격 진입 — 첫 사용자 가치) |
| Created | 2026-05-22 |
| Target date | 2026-07-10 (3 phase 단계별 → 같은 날 완성) |
| Closed | 2026-05-22 |

## Summary

WI-003 의 mock 위에 **실제 편집 가능성** 부여. 사용자가 4 도메인 카드를 클릭 → 편집 → undo/redo → autosave 의 완전한 인터랙션. **Notion-like 기본 패턴 + 도메인 별 자연스러운 변형** (사용자 결정, 2026-05-22). 단계별 phase 로 진행: (1) UX Discovery + mock 인라인 편집 PoC, (2) agocraft publish 셋업, (3) agocraft 의존 swap + ChangeStream/History 통합. 사용자 의도 = UX 우선 + 원칙 (Option E publish) 준수.

## Scope — phased

### Phase 1 (이 WI 의 첫 단계, 2026-05-22 ~ 2026-06-05)

**Goal**: agocraft 없이 mock state 로 핵심 UX 입증. 사용자가 4 도메인의 텍스트를 인라인 편집 + undo/redo 동작.

- [x] **WI-004 발행** + UX_DESIGN.md (이 파일 동행)
- [ ] `features/editing/UX_DESIGN.md` — Notion-like 기본 + 도메인별 변형 명세
- [ ] **인라인 텍스트 편집** — SlideBlock.title + bullets, DocBlock.heading + paragraphs, MediaBlock.caption. click-to-edit + Enter/Esc + blur-to-save
- [ ] **호버 toolbar** — Move up / Move down / Duplicate / Remove (현재 ✕ remove 확장)
- [ ] **Undo/Redo (mock)** — `useState` + history stack. Cmd+Z / Cmd+Shift+Z. agocraft History 와 후속 swap 자연.
- [ ] **Autosave 인디케이터** — top-right "Saved" / "Saving…" 표시. localStorage 가 즉시.
- [ ] `pnpm verify` + dev server 5174 `/doc/demo` 의 시각 검증.

### Phase 2 (다음 라운드, cwd = sister agocraft project root)

**Goal**: agocraft 측 publish workflow + 12 packages prerelease publish.

- HANDOFF-001 응답 — agocraft 측 own `records/decisions/` 에 publish strategy 박제.
- GitHub Packages private registry 셋업 (또는 Verdaccio).
- agocraft 12 packages 의 `tsup` 또는 `vite-plugin-dts` build → `dist/` 생성.
- `@agocraft/*@1.0.0-rc.1` 의 첫 publish.
- weave 측 `.npmrc` 셋업 가이드 — `docs/engineering/AGOCRAFT_DEPENDENCY.md`.

### Phase 3 (Phase 2 후 cwd = this project root)

**Goal**: weave 의 mock model 을 agocraft 의 진짜 Composite tree + ChangeStream + History 로 swap.

- `apps/web/src/document/types.ts` → `@agocraft/core` 의 Item / Unit / Document type.
- `useDocument` hook → agocraft 의 ChangeStream + transaction id 활용.
- Undo/Redo → agocraft 의 History 시스템 (mergeWindow + propagation patches).
- 4 도메인 의 mock attr → agocraft 의 domain-* package 의 정식 schema.
- Capability dispatch — agocraft 의 RenderableAdapter / EditableAdapter 활용.
- e2e: round-trip — 편집 → undo → redo → reload → 유지.

### Cross-project handoff (2026-05-22 추가)

사용자 신규 요구 — agocraft 측 두 모듈 의무 발행:

- **HANDOFF-002 → agocraft `records/decision-handoffs/`** (발행 완료): Input Event Normalization + Hotkey Management 통합 모듈. weave Phase 3 의 의존. publish 시점에 함께 publish 의무.
- Phase 1 의 mock 이 두 모듈의 contract shape 을 mirror — Phase 3 의 swap 단순화 의무.

### Out of scope (별도 WI)

- 캔버스 의 direct manipulation (shape drag/resize/색 picker) — WI-005 candidate (M2).
- 슬래시 command palette — WI-006 candidate (M2).
- Drag-to-reorder block — WI-006 candidate (M2).
- Nested embed (slide 안 block-doc 등) — M3+.
- Real-time multi-cursor — M3+ 별도 WI (Yjs / Liveblocks).
- AI 자동화 — M5+.

## Acceptance criteria (Phase 1 의)

- [ ] `records/work-items/WI-004-agocraft-integrated-editing.md` (이 파일) Status=In Progress 의 Phase 1 부분 모두 ✅.
- [ ] `features/editing/UX_DESIGN.md` 의 명세 박제.
- [ ] SlideBlock title + bullets, DocBlock heading + paragraphs, MediaBlock caption 의 인라인 편집 동작 — 클릭 → 캐럿 활성 → 텍스트 변경 → Enter / blur → 저장.
- [ ] Cmd+Z / Cmd+Shift+Z 동작 — block 추가/제거/텍스트 변경 모두 undo.
- [ ] 호버 toolbar — Move up / down / Duplicate / Remove.
- [ ] `prefers-reduced-motion` 의 motion 비활성 유지.
- [ ] keyboard navigation — Tab 으로 다음 편집 영역 진입.
- [ ] localStorage round-trip — 편집 → undo → reload → 유지.
- [ ] `pnpm lint && pnpm typecheck && pnpm --filter @weave/web build` PASS.
- [ ] Dev server `/doc/demo` 시각 검증.

## Context

- 사용자 결정 (2026-05-22):
  - UX 우선 (구현 전).
  - Notion-like 기본 + 도메인별 변형 (4 도메인 통합 + 도메인 강점 살림).
  - DR-001 Option E (publish + npm 의존) 유지 — 원칙 준수.
- WI-003 의 mock model 이 이미 agocraft 의 Composite tree 패턴 (Item/Unit) 을 mirror 하여, Phase 3 의 swap 이 type 교체 수준.
- UX Discovery 결과는 향후 WI-005~006 의 base.

## Escalation triggers

- [x] **UI / UX change** — `frontend-design-pattern-agent` 의 Notion-like 패턴 사인 (Phase 1 의무).
- [x] **Design System Triage** — 새 컴포넌트 후보: `EditableText`, `BlockToolbar`, `KeyboardShortcut` indicator. ✅ Reused (기존 Card / Button) + 🔧 Extended (Card 의 hover state) + 🌱 Grew (EditableText 신규 primitive — Design Review DR-design-002 발행 의무).
- [ ] User data — localStorage 만 (M2 의 multi-tenant 진입 시 의무).
- [ ] Payment / AI / Library — Phase 1 에는 새 의존 없음. Phase 3 의 agocraft 의존 시 library-adoption-supply-chain-governance-agent 사인.

## Technical Feasibility verdict

- FR-001 안에 포함. 편집 capability 는 agocraft PoC 의 검증된 영역. 추가 review 없음.

## Links

- WI-003 (first prototype slice, In Progress)
- DR-001 (agocraft dependency, Accepted: Option E)
- DR-007 (design system tooling, Accepted)
- DR-design-001 (4 도메인 accent tokens, Accepted)
- DR-design-002 (planned: EditableText primitive)
- `features/editing/UX_DESIGN.md` (this WI 동행)
- HANDOFF-001 (agocraft publish, Open — Phase 2 의무)

## Status updates

- 2026-05-22: WI-004 발행. UX Discovery 결과 박제 (Notion-like 기본 + 도메인별 변형). 3 phase 단계별 path 명시. Phase 1 진입.
- 2026-05-22: 사용자 신규 요구 2 건 — agocraft 측 (a) Input Event Normalization 모듈, (b) Hotkey Management 모듈. HANDOFF-002 발행 (agocraft inbox). Phase 3 의 swap 의 의존. Phase 1 mock 의 keyboard / pointer 처리 가 두 모듈의 contract shape mirror 의무.
- 2026-05-22: **Phase 1 의 slide inline 편집 정식 구현** (WI-009 Phase 3 의 hotkey swap 동행 라운드). `DR-design-003` (EditableText primitive) Accepted, design-system 의 EditableText (contentEditable + uncontrolled + onCommit/onEnterCommit/onBackspaceEmpty + Esc 의 cancel + focus-visible ring + flash micro-feedback). `useDocument.updateItem` 추가. SlideBlock 의 editable prop + title + bullets 의 EditableText 활용. DOMAIN_RENDERERS 의 type 에 onUpdate optional 추가. DemoDocPage 의 호출 시 onUpdate 전달 (PresentPage 는 안 전달 — Present mode readonly). **SVL gate `pnpm verify` 8/8 PASS 9.1s** — 2 새 inline-edit 시나리오 (title commit + bullet add/remove + persist, Esc cancel). agocraft hotkey 의 scope swap (focus 시 slide.editing) 은 별 라운드 — EditableText 의 default keyboard (Tab/Enter/Esc/Backspace) 의 자연.
- 2026-05-22: **3 도메인 (block-doc / media / canvas-design) inline edit 추가**. DocBlock 의 heading + paragraphs (slide bullets 와 동일 Enter/Backspace 의무), MediaBlock 의 caption + tone toggle button (image↔video), CanvasBlock 의 summary (multiline). Design System Triage = **✅ Reused** (EditableText 만 활용, 새 primitive 없음). **SVL gate `pnpm verify` 11/11 PASS 10.7s** — 3 새 시나리오 (doc heading+paragraph add, media caption+tone, canvas summary). **첫 run 의 1 real bug 발견** — `multiline=true` 시 Enter 가 browser default soft-break, onEnterCommit 호출 안 됨. fix: DocBlock 의 paragraph 의 multiline=false (each paragraph = single line + CSS wrap, paragraph 배열 의 의도된 model). CanvasBlock summary 만 multiline=true (의도된 multi-line description). SVL 의 또 다른 실 효과 — 박제된 EditableText spec 의 cleaner 박제 (Notion 의 single-line vs multi-line 의 Enter 동작 의 의무 분리).
- 2026-05-22: **WI-004 Done (Closed)**. Phase 3 의 agocraft 통합은 별도 work item **WI-013 으로 분리·완성** (`records/work-items/WI-013-agocraft-document-swap.md`). WI-013 의 6 phase 가 agocraft dep adoption 부터 useDocument canonical state swap, real Patches + ChangeStream reducer, History UI (Cmd+Z/Cmd+Shift+Z), weave-shape projection 제거까지 모두 같은 날 완성. weave/apps/web 의 모든 mutation path 가 agocraft event-sourced. **WI-004 의 acceptance criteria 모두 충족** (인라인 편집 + Undo/Redo + autosave). 50 unit + 15 e2e PASS. Phase 2 (agocraft publish) 는 sister project agocraft 의 WI-008 + DR-015 (Verdaccio) 으로 박제·운영 중.
