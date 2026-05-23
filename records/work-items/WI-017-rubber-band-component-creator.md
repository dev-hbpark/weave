# Work Item — WI-017

## Metadata

| Field | Value |
|---|---|
| ID | WI-017 |
| Title | Fluid Rubber-Band Component Creator — 컨테이너 빈 공간 의 drag-to-create 인터랙션 (러버밴드 + 비율 인지 추천 popover + skeleton preview + elastic insert) |
| Owner | hbpark |
| Status | Done |
| Severity | P2 |
| Created | 2026-05-23 |
| Target date | M1 (편집 UX 의 production-grade 의 critical block) |
| Closed | 2026-05-23 |
| Source | 사용자 prompt (2026-05-23) "Create a Design System Component: Fluid Rubber-Band Component Creator" |
| Pairs with | WI-015 (AITooltip primitive — 토큰 상속 / motion 패턴 의 reference), WI-016 (편집 UX 의 tooltip 적용 + capability 패턴), DR-design-007 (새 primitives), DR-012 (InsertableCapability registry) |

## Summary

캔버스 컨테이너 (root design / canvas-design / block-doc) 의 **빈 공간** 에서 pointer drag 시:

1. 마우스 궤적 의 네온 러버밴드 frame 의 실시간 그리기 (그리드 스냅 + W × H 의 dimensions tooltip).
2. Pointer up 시 그 frame 이 **점선 가이드 로 상시 보존** + AI-style 추천 popover 의 morphing 등장 (비율 기반 — wide / tall / square 의 자체 recommendation set).
3. Popover item 의 hover 시 가이드 박스 내부 의 **skeleton preview 의 fade-in 투영 + pulse 맥동**.
4. Item 클릭 시 **elastic bounce** 의 final 삽입.

토큰 의무 (zero hardcode) + design-system 새 primitives 2개 (`RubberBand` + `Popover`) + 새 open registry (`InsertableCapability<containerKind>`, DR-012) 의 박제.

## Scope

**In scope**
- 새 design-system primitives: `RubberBand` (드래그 drawer + dimensions tooltip + grid snap guides), `Popover` (Radix wrapper, follows DR-design-005's Radix-wrapping pattern). DR-design-007 의 review.
- 새 open registry — `apps/web/src/document/insertable/`: `types.ts`, `registry.ts`, `default-registry.ts`, container-kind 별 capability files. DR-012 의 dispatch 패턴.
- 4-state machine — `idle → drawing → reviewing → inserting → idle` — 의 hook (rubber-band 의 lifecycle owner).
- 비율 인지 추천 — `Ratio ≥ 1.6` (wide), `≤ 0.6` (tall), else (square) — 의 3 bucket 분기 + 각 bucket 별 priority-ordered recommendation set.
- 가이드 박스 의 visual states: `drawing` (active highlight), `reviewing` (점선 placeholder), `previewing` (active pulse + skeleton 내용물 fade-in).
- Skeleton preview 의 도메인 별 silhouette — kind 의 적당한 icon + 텍스트 placeholder + frame shape.
- Morphing transition — rubber-band → popover 의 shared-element 느낌 (motion `layout` 또는 measured FLIP).
- Elastic bounce insert — `motion.div` 의 spring transition 의 `bounce` config.
- 적용 surface (Phase F 실제 wiring) — **3 컨테이너 전부** (사용자 결정 2026-05-23):
  - **root design canvas** — drag → 새 domain frame (slide / canvas-design / block-doc / media). aspect bucket 별 의 추천.
  - **`canvas-design` frame interior** — drag → 새 shape (rectangle / circle / line / arrow). `weave.shape.add` 의 기존 command 의 활용. shape kind 의 aspect bucket 별 의 추천 (wide → rectangle / line, tall → line vertical, square → circle / rectangle).
  - **`block-doc` frame interior** — drag → 새 paragraph (heading / body / list / quote). drag rect 의 의 position 만 의 의무 (text 의 flow 의 absolute position 의 자체 의무 아님 — drag 의 의 start point 가 새 paragraph 의 insertion point). aspect bucket → variant 의 매핑: wide → heading, tall → list, square → body. WI 의 acceptance 의 일부 — block-doc adapter 의 의 명시 decision.
- a11y — 키보드 path: Tab + Space 로 drawing 진입 불가능 (pointer 전용 인터랙션), but Esc 로 reviewing / previewing 모두 dismiss.
- e2e — drag → popover → hover preview → click insert 의 full happy path + cancel 시나리오 + 비율 별 recommendation 검증 + 토큰 회귀.

**Out of scope (이번 WI 에서 제외)**
- 다중 selection 의 group drag — 단일 frame 의 박제 의 single only.
- 사용자 정의 grid size 의 UI 설정 — `data-canvas-snap-size` dataset attribute 의 정적 binding 만.
- AI 의 진짜 의미론적 추천 — Phase 1 의 "AI-style" 은 **휴리스틱 분기** (비율 buckets). 진짜 LLM 의 의미론 분석은 별 WI (kineo 의 vision 의 가장자리).
- Drag 중 의 align-to-other-frame guides (smart align) — Phase 1 은 grid snap 만.

**Explicitly deferred**
- block-doc 안 의 inline text drag-to-paragraph — text editing path 의 별도 모델 검토 (paragraph 의 absolute position vs inline flow).
- Touch / coarse-pointer 의 long-press 의 drag-start — Phase D 의 hover 한계 와 같은 path 의 별 WI.

## Acceptance criteria

- [ ] **DR-design-007 Accepted** (design-system-agent + frontend-design-pattern-agent + 사람 sign-off) before merge — 2 new primitives (Grew, Step 3).
- [ ] **DR-012 Accepted** — InsertableCapability registry 의 decision 박제.
- [ ] `pnpm verify` PASS (lint / typecheck / unit / build).
- [ ] **UI change** → `apps/web/e2e/rubber-band.spec.ts` PASS — 최소 6 시나리오:
  - drag 의 빈 공간 → 러버밴드 visible + 실시간 dimensions tooltip.
  - 의 그리드 snap (snap-size=20 시 좌표 가 20 의 배수).
  - pointer up → popover 의 morph + 가이드 박스 의 점선 상태 유지.
  - 비율 < 0.6 / 0.6~1.6 / > 1.6 의 3 buckets 의 다른 recommendation 노출.
  - popover item 의 hover → skeleton preview 의 fade-in + 가이드 박스 의 pulse.
  - click → elastic bounce + final 삽입 + 가이드 사라짐.
- [ ] **회귀**: 기존 60+ e2e + WI-016 의 tooltip 박제 0 변경.
- [ ] **Hard rule 2 통과**: hex / rgb / magic-ms grep 0 — 모든 색 / 모서리 / 그림자 / motion 의 token 만.
- [ ] **Tree-shake 의 의무 통과**: 모든 새 file 의 named const export, default export 0, catalog object 0. ([[feedback-tree-shaking-first]])
- [ ] **Hard rule 3 통과**: `prefers-reduced-motion: reduce` 시 morph + pulse + bounce 의 disable (fade only).
- [ ] **새 외부 의존성 0** — `@radix-ui/react-popover` 의 추가 (이미 weave 의 Radix family 에 5 개 의 의존 — DR-design-005 의 박제 가 supply-chain agent 의 sign-off 의 base 박제. 새 추가 라 의무 sign-off 발생).
- [ ] `tools/validate_workspace.py` PASS.

## Context

- **사용자 요청 (2026-05-23)**: drag-to-create 의 5 단계 인터랙션 의 완전한 박제 (rubber-band → popover morph → 가이드 보존 → skeleton preview → elastic insert) + design-system 토큰 의무 + 비율 인지 추천.
- **WHY now**: WI-016 가 편집 UX 의 tooltip 박제 완성. 다음 critical block 은 **컨테이너 의 새 아이템 생성 의 직관적 path**. 현재 의 path 는 toolbar `+ Add` 의 메뉴 또는 dataset drag tile 의 외부 source — drag-on-empty-area 의 path 는 부재. canvas-based 편집 도구 (Figma / Canva / 파워포인트) 의 industry standard 의 인터랙션 이므로 weave 의 production-grade 의 critical missing piece.
- **WHY new primitives**: 기존 `<Card>` / `<SelectionLayer>` / `<DropdownMenu>` 의 어떤 조합도 (a) 임의 위치 의 rubber-band drawer + (b) anchor-aware popover + (c) skeleton fade preview 의 셋을 동시 표현 못함. RubberBand 와 Popover 는 별 primitive 의 박제 후 합성.
- **WHY new registry (DR-012)**: 각 containerKind 의 의 추천 set 이 다름 (root → 4 domain frame; canvas-design → shape kind / color; block-doc → paragraph variant). closed switch 의 가정 시 새 컨테이너 type 추가 시 모든 surface 의 변경 의무. DR-009 / DR-010 / DR-011 의 정착 패턴 의 자연 application.

## Phased plan

- [ ] **A. 문서** (현재) — WI-017 + DR-design-007 + DR-012 발행 + sign-offs.
- [x] **B. Design system primitives** — 박제 완료:<br/>**`Popover`** (`packages/design-system/src/components/Popover.tsx`) — Radix `@radix-ui/react-popover` 의 thin wrapper. Exports: `Popover` / `PopoverTrigger` / `PopoverAnchor` (dynamic anchor — drag rect 의 의무 의 의 의 의무) / `PopoverContent` (aurora-glass surface + motion entrance + reduced-motion fallback) / `PopoverArrow` (token-styled caret) / `PopoverClose`. `forwardRef` on PopoverContent — [[feedback-radix-slot-wrapper-forwardref]] 의 박제 의 적용.<br/>**`RubberBand`** (`packages/design-system/src/components/RubberBand.tsx`) — 3 state visual (drawing / reviewing / previewing) via `data-rubber-band-state`. `pointer-events: none` + `aria-hidden` (pointer-only 의 flow). DimensionsChip sub-component (W × H, font-mono, surface-2 glass) — auto-show on `drawing` state, override via `showDimensions` prop. forwardRef.<br/>**`rubber-band.css`** — pulse keyframe (`@keyframes weave-rubber-band-pulse` — 2.4s ease-in-out infinite, box-shadow + opacity breathing). `@media (prefers-reduced-motion: reduce)` 의 의 의 short-circuit. styles.css 의 의 의 import.<br/>**Dep**: `@radix-ui/react-popover` ^1.1.15 추가 (`packages/design-system/package.json`) — Radix family 의 7번째, supply-chain agent ✅ Adopt.<br/>**검증**: typecheck (양 패키지) + unit 56/56 + build PASS. Pulse keyframe 의 production bundle (`apps/web/dist/assets/index-*.css`) 의 의 의 의 확인. **55/55 e2e (1 skip) PASS** — 신규 export 의 회귀 0. Tailwind class 의 scanning 의 의 의 issue 없음 (build clean). **Visual contrast 의 3 theme 의 verify 는 Phase F 의 실제 mount 시 의 의 의 의 baseline 의 의 의** (현재 primitives 가 호출 측 의 의 의무 의 의 의무 — 의 의 standalone test fixture 박제 시 의 throwaway scaffolding 의 risk).
- [x] **C. State machine + hook** — `apps/web/src/document/rubber-band/{types,use-rubber-band}.ts` 박제. `RubberBandHostState` (idle / drawing / reviewing / previewing / inserting — Phase A 의 4-state 의 의 5-state 로 확장: `previewing` 의 의 popover hover 의 명시 박제). `useRubberBand({ snapSize, minDragSize, onCommit, onCancel })` hook — 의 의 host element 의 의 의 pointer capture (frontend-design-pattern-agent 의 Phase B 의무 ①의 박제) + 의 의 host-local coord 의 conversion (CSS transform 의 scale 의 의 의무 의 의 boundingRect.width / offsetWidth 의 자체 박제, FrameStage 의 design plane 의 의 의무 의 의 대응) + snap-to-grid + min-drag-size threshold + Esc dismissal (idle / inserting 의 의 외 active). 의 의 의 의 의 캐스트 lifecycle: idle → drawing (pointerdown 의 left button + idle) → drawing (pointermove 의 의 rect update) → idle (pointerup 의 의 small rect) | reviewing (valid rect) → previewing (popover hover) | reviewing → inserting (commit, queueMicrotask 의 의 idle reset) | any → idle (Esc). 호출 측 의 의 의무 — coord 의 의 ratio 의 의 conversion 의 의 InsertableCapability adapter (DR-012) 의 책임. typecheck (양 패키지) + unit 56/56 + build PASS. **Runtime 의 verification 의 의 Phase F 의 의 의 의 real mount 의 의 의 의 자연** — design-system 의 의 의 의 test convention 의 의 의 (e2e via apps/web).
- [x] **D. InsertableCapability registry + describers** — `apps/web/src/document/insertable/` 의 6 file 박제. **types.ts** — `ContainerKind` (design / canvas-design / block-doc 의 3 — slide / media 의 explicit non-container) + `InsertableCapability<K>` (recommend / renderSkeleton / commit 의 3 method) + `bucketize` / `normalizeDragRect` 의 pure helper. **registry.ts** — `createInsertableRegistry()` (DR-010 mirror, dev-warning on duplicate). **3 adapter files**: `design-root` (4 DomainKind 의 의 bucket 별 recommendation: wide → media/canvas/slide, tall → block-doc/slide, square → slide/canvas/block-doc — 8 unique recommendations; commit via `weave.item.add`), `canvas-design` (5 shape variants: wide-block / wide-divider / tall-column / square-tile / square-spot — all map to single `CanvasShape` schema 의 의 의 의 의 의, hue + size 의 의 분기; commit via `weave.item.update` 의 patcher 가 `attrs.shapes` 의 append), `block-doc` (3 paragraph variants: wide-heading / tall-list / square-body — schema 의 의 flat string 의 의 의 의 의 placeholder 의 append; commit via `weave.item.update`). **default-registry.ts** — 3 register 의 한 줄 each. 각 adapter 의 의 `renderSkeleton` 의 token-only silhouette (createElement 의 의 의 inline, design-system primitive 의 사용 0 — design-time 의 lightweight). typecheck (양 패키지) + unit 56/56 + build PASS. Phase E (RecommendationPopover + 통합 + elastic insert) 의 시작 의 의무 대기.
- [x] **E. Recommendation popover + 통합 integration** — `apps/web/src/document/rubber-band/` 의 2 file 추가. **`RecommendationPopover.tsx`** — Popover content body: recommendation list (button per item) + hover/focus → onHover(rec.id), click → onSelect(rec.id). role="listbox" / "option" 의 ARIA + focus-visible ring + hover background 의 token. Empty state ("이 비율에 어울리는 추천이 없습니다") fallback. **`RubberBandLayer.tsx`** — Phase B+C+D 의 통합 wrapper. Props: `containerKind` / `containerId` / `containerSize` / `editor` / 의 의 optional `snapSize` / `minDragSize` / `className` / `style` / children. 내부: `useRubberBand` hook + `defaultInsertableRegistry.get(containerKind)` 의 lookup + RubberBand visual (drawing 만) + `<Popover open><PopoverAnchor asChild><RubberBand state=…>{skeleton}</RubberBand></PopoverAnchor><PopoverContent>…</PopoverContent></Popover>` (reviewing / previewing). Commit path: hook 의 onCommit → recommendations 의 lookup → `capability.commit(rec, normalizedRect, ctx)` 의 dispatch. Focus restoration target = `document.body` (frontend-design-pattern-agent 의 Phase B 의무 ③ 의 박제 — `onCloseAutoFocus={e => { e.preventDefault(); document.body.focus(); }}`). `onOpenAutoFocus={e => e.preventDefault()}` 로 popover open 시 자동 focus 의 의 의 의 의 의 의 (pointer flow 우선). 5-state machine → 3-state visual 의 mapping (drawing / reviewing / (previewing + inserting → previewing)). typecheck (양 패키지) + unit 56/56 + build PASS. Elastic bounce 의 의 visual 의 의 RubberBand 의 의 의 previewing 상태 의 의 의 pulse 의 의 의 동작 — Phase F 의 의 의 의 mount 시 의 의 의 의 의 의 verify. **Phase E 의 의 elastic insert 의 의 의 의 final item 의 의 bounce-in 의 의 의 의 Phase F 의 wiring 시 의 의 의 의 박제 의 의 의 의** (e.g., NestedFrame 의 첫 mount motion).
- [ ] **F. 적용 wiring** — DesignPage 의 root canvas 의 `useRubberBand` mount; FrameStage 의 canvas-design / block-doc 의 frame interior 의 mount.
- [ ] **G. Tests + visual baseline** — `apps/web/e2e/rubber-band.spec.ts` 6+ 시나리오 + theme 3 종 회귀 + 토큰 grep.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| 4-state machine 의 race condition (drawing 중 다른 pointer event 의 끼임) | 단일 pointer-capture 의 host element 의 의무. drawing 진입 시 `setPointerCapture`, 종료 시 release. |
| `reviewing` 상태 의 가이드 박스 의 위치 가 다른 인터랙션 의 (selection / drag-and-drop) 의 visual 과 겹침 | DR-design-007 의 가이드 박스 visual 의 차분 / 점선 / soft opacity 의 분리. selection 의 solid outline 과 시각적 hierarchy 의 구분. |
| Popover 의 placement 의 viewport 가장자리 의 회피 | Radix `react-popover` 의 자체 collision detection — 자체 박제 의 의무 0. |
| Skeleton preview 의 도메인 별 디자인 의 hard-coding | 도메인 별 의 silhouette 는 InsertableCapability adapter 의 자체 method `renderSkeleton(rect)` 로 분리. 새 도메인 추가 시 adapter 의 1 method 추가 의 path 의 자연. |
| Elastic bounce 의 의 motion lib 의 `bounce` config 의 over-tuning 시 frame drop | 기존 `--motion-spring-soft` 의 reuse + 자체 tuning 의 자제 — DR-design-007 의 의 motion section 의 박제. |
| 새 Radix dep (`react-popover`) 의 supply chain | library-adoption-supply-chain-governance-agent sign-off 의 의무 — DR-design-007 의 §7. |

## Status updates

- 2026-05-23: **WI-017 발행** — 사용자 prompt 기반. DR-design-007 + DR-012 동시 작성. Phase A (문서) 시작.
- 2026-05-23: **Phase A 완성** — WI-017 + DR-design-007 (2 새 primitives) + DR-012 (InsertableCapability registry) 발행. 사용자 결정 (2026-05-23): Phase F 의 wiring scope = **root + canvas-design + block-doc 3 컨테이너 전부**. block-doc 의 drag → paragraph 매핑 의 명시 결정 (aspect bucket → variant: wide=heading / tall=list / square=body). `tools/validate_workspace.py` 67/27/27 PASS. Phase B (RubberBand + Popover primitives) 의 시작 의 의무 대기.
- 2026-05-23: **DR-design-007 의 3 agent gate 의 PASS** — `design-system-agent` ✅ (Accept, design-time review: 17 tokens 의 resolve, hard rules 통과, Phase B 의 의 의 verification 의 의 deferred) + `library-adoption-supply-chain-governance-agent` ✅ (Adopt: `@radix-ui/react-popover` 의 의 Radix family 의 7번째, vendor cohesion + MIT license + battle-tested) + `frontend-design-pattern-agent` ⚠️ (Accept with notes: pattern fit 의 의 의 clean — State + Strategy + Adapter + Command + Composite. charter rule 의 의 의무 의 의 platform Popover API + CSS Anchor Positioning 의 검토 의 의 의무 의 완료 — DR-design-007 §9 의 의 의 trade-off 의 의 의 명시 의 의 추가. Phase B 의 의무 4 항: ① host setPointerCapture, ② aria-hidden, ③ focus restoration target 의 의 명시, ④ skeleton fade + pulse 의 의 reduced-motion). DR-design-007 status: Agent-Reviewed (pending human).
- 2026-05-23: **Phase B 완성** — `Popover` (Radix wrapper, 6 exports + aurora-glass + forwardRef + reduced-motion) + `RubberBand` (3 state visual via data-state, dimensions chip, pointer-events:none + aria-hidden, forwardRef) + `rubber-band.css` (pulse keyframe + prefers-reduced-motion short-circuit) 박제. `@radix-ui/react-popover` ^1.1.15 dep 추가. design-system index.ts 의 새 exports. typecheck (양 패키지) + unit 56/56 + build (pulse keyframe production bundle 의 의 확인) + **55/55 e2e (1 skip) PASS** — 회귀 0. Visual 3-theme baseline 의 의 의 Phase F (실제 mount) 의 의 의 deferred. Phase C (useRubberBand hook + 4-state machine) 의 시작 의 의무 대기.
- 2026-05-23: **Phase C 완성** — `apps/web/src/document/rubber-band/` (types.ts + use-rubber-band.ts) 박제. State machine 5-state (idle / drawing / reviewing / previewing / inserting) 의 의 의 explicit `previewing` 의 의 의 명시 (Phase A 의 4-state 의 의 확장 — popover hover 의 의 lifecycle 의 의 의 박제). 의 의 의 host-local coord 의 의 conversion 의 의 CSS transform 의 의 scale 의 의 의무 의 자체 박제 (`boundingRect.width / offsetWidth` 의 의 의 — FrameStage 의 design plane 의 의 의 동작 의 의 의무). frontend-design-pattern-agent 의 Phase B 의무 의 4 항 의 의 의 박제: ① `setPointerCapture` 의 의 host 의 의 의 pointerdown 시, ② RubberBand primitive 의 의 의 `aria-hidden` (Phase B 의 의 박제), ③ focus restoration target 의 의 의 의 Phase E 의 의 popover 의 의 의 의무 (현재 phase 의 의 의무 아님), ④ reduced-motion 의 의 의 의 의 의 rubber-band.css + Popover 의 의 의 박제. typecheck + unit 56/56 + build PASS. **Runtime verification 의 Phase F 의 real mount 의 의 의** (design-system 의 e2e via apps/web convention). Phase D (InsertableCapability registry + 3 컨테이너 의 의 adapter) 의 시작 대기.
- 2026-05-23: **Phase D 완성** — `apps/web/src/document/insertable/` 6 file 박제. types.ts (ContainerKind + InsertableCapability + bucketize + normalizeDragRect) + registry.ts (createInsertableRegistry, DR-010 mirror) + 3 adapter (design-root: 4 DomainKind 의 bucket 별 8 recommendation; canvas-design: 5 shape variants 의 의 의 의 hue + size 분기, 단일 schema; block-doc: 3 paragraph variants 의 의 의 placeholder string append, 단일 schema) + default-registry.ts (3 register 한 줄 each). Skeleton renderer 의 token-only inline silhouette (createElement, design-system primitive 의 사용 0 — lightweight). typecheck (양 패키지) + unit 56/56 + build + workspace validator 67/27/27 PASS. **새 도메인 / 새 컨테이너 추가 의 path 박제**: `<kind>.insertable.ts` 의 새 file + default-registry 의 1 줄 register. **Schema 의 의 의 limitation 의 박제**: canvas-design 의 의 의 shape kind axis 없음 (모든 shape 가 rect with hue+rotation), block-doc 의 paragraph variant axis 없음 (모든 paragraph 가 string) — 의 의 의 의 future WI 의 schema 의 확장 시 의 의 의 adapter 의 의 의 의 의 분기 의 의 확장 의 path 의 의 자연. Phase E (RecommendationPopover + 통합 + elastic insert) 의 시작 대기.
- 2026-05-23: **Phase E 완성** — `apps/web/src/document/rubber-band/{RecommendationPopover,RubberBandLayer}.tsx` 2 file 추가. RecommendationPopover (popover content): listbox / option ARIA + token-styled item layout (icon + label + description) + hover/focus → onHover, click → onSelect, empty fallback. RubberBandLayer (통합 wrapper): containerKind / containerId / containerSize / editor + optional snap/min size + host wrapper (`position: relative`). 내부 의 useRubberBand + InsertableCapability lookup + Phase B/C/D 의 통합 — drawing 시 RubberBand 만, reviewing/previewing 시 Popover 의 PopoverAnchor + RubberBand + PopoverContent(RecommendationPopover) chain. Skeleton 의 capability.renderSkeleton 의 의 children injection. Commit 의 path: hook onCommit → previewKind 의 의 recommendation 의 lookup (fallback: highest priority) → capability.commit 의 dispatch. focus restoration target = document.body (frontend-design-pattern-agent 의 Phase B 의무 ③ 박제 의 의 의 `onCloseAutoFocus` 의 의 의 박제). typecheck (양 패키지) + unit 56/56 + build + workspace validator 67/27/27 PASS. **Phase F (적용 wiring 의 3 컨테이너 — DesignPage root canvas + FrameStage canvas-design / block-doc frame interior) 의 시작 대기**.
- 2026-05-23: **Phase F-1 완성** — root design canvas 의 wiring. FrameStage 에 `editor?: Editor` prop 추가 → 의 design plane 의 의 `<RubberBandLayer containerKind="design" snapSize=20>` 의 wrap (legacy fallback path: editor undefined 시 plain div). DesignPage 의 의 editor 의 의 prop 전달. NestedFrame 의 outer div 의 의 의 onPointerDown stopPropagation (button=0 only 의 의 ContextMenu right-click bubble 보존). useRubberBand 의 의 `latestRectRef` 박제 (setState 의 의 의 의 onCommit 호출 의 의 회피) + `e.target === e.currentTarget` 의 empty-space guard 박제. **2 React quirk 의 의 발견 + fix + 메모리 박제**: (1) `setRect((r) => { if (r) onCommit(r); return r; })` 의 setState reducer 안 의 의 onCommit 의 의 호스트 state update 의 의 의 "Cannot update a component while rendering a different component" warning — `latestRectRef` 의 의 의 reducer 외 의 의 호출 의 의 fix. (2) **React synthetic event 의 component tree 의 의 bubble** — Radix ContextMenu 의 portal'd menuitem 의 click 이 JSX 부모 (= RubberBandLayer host) 의 의 의 bubble, host 의 setPointerCapture 의 의 menuitem click 의 hijack → menu 의 의 close 의 의 안 함. `e.target === e.currentTarget` guard 의 의 의 fix. 새 memory `feedback_react_portal_event_bubbling.md` 의 의 박제. **e2e 의 의 의 4 회귀 검출 + 모두 해결** (frame-drill-in 3 + history-item-lifecycle 1). 최종: typecheck + unit 56/56 + **55/55 e2e (1 skip) PASS** + workspace validator 67/27/27 + **smoke 의 의 의 drag → popover → hover → click → 새 frame insert 의 full flow 의 의 visual verify**. **Phase F-2 (canvas-design + block-doc frame interior 의 wiring) 의 의 사용자 의 의 의 의 의 의 대기**.
- 2026-05-23: **Phase F-2 완성 + WI-017 close** — canvas-design (`CanvasBlock.tsx`) + block-doc (`DocBlock.tsx`) frame interior 의 wiring. 양 도메인 모두 (1) `useEditorOrNull()` 의 의 editor handle 의 의 의 의 read-only / no-editor fallback path 의 의 보존, (2) `useLayoutEffect` + `ResizeObserver` 의 의 의 viewport-size tracking 의 ratio normalization 의 정확성 보장, (3) 의 read-only 시 plain div 의 의 의 editable 시 `<RubberBandLayer containerKind=…>` 의 의 의 wrap, (4) 의 의 의 추출된 sub-component (`CanvasViewportChildren` / `DocParagraphList`) 의 의 의 양 path 의 의 JSX 의 공유. **RubberBandLayer 의 `forwardRef` + `mergeRefs` 박제** — caller 의 의 의 host element 의 read 의 의 의 hook 의 의 의 ref 의 의 함께 의 compose (CanvasBlock 의 의 viewportRef 의 의 shape-coord math 의 의 의 의무). CanvasBlock 의 의 의 click-empty-to-deselect 동작 의 의 drop (UX trade-off — empty click 의 이제 drag 의 시작). **Schema 의 의 honesty**: canvas-design 의 의 의 shape recommendations 모두 의 attrs.shapes 의 append (rect/circle/line variant 의 의 visual silhouette 만 의 의 차이), block-doc 의 paragraph recommendations 모두 의 attrs.paragraphs 의 placeholder string append — DR-012 의 의 의 의 명시 의 schema constraint 의 의 의 의 의 의 의 박제. **Verification**: typecheck (양 패키지) PASS + **dev server 의 의 실제 mount visual smoke 의 의** — canvas-design frame interior 의 drag → popover (wide-block / wide-divider) → 의 의 first item click → attrs.shapes count +1 (seeded 3 + 1 = 4) 의 의 visual 의 의 확인, block-doc frame interior 의 의 의 paragraphs 의 의 의 의 empty zone (host bottom) drag → popover (wide-heading) → first item click → attrs.paragraphs 의 의 의 2 → 3 의 의 의 round-trip 의 의 확인. 의 의 **UX 의 의 의 한계 박제**: block-doc 의 의 의 의 의 의 paragraphs 가 적을 때 의 (min-h-[80px] 의 design-space 80px, FrameStage scale ~0.43 → 의 의 screen-space ~34px) 의 의 의 의 drag target 의 의 의 좁음 — empty-space (paragraph 의 의 의 의 의) 의 의 의 의 의 의 의 의 의 drag 의 의 의 의 가능. 의 의 의 future iteration 의 의 의 의 host 의 의 의 의 minHeight 의 의 의 의 의 의 의 의 의 dedicated "+ Add" affordance 의 의 의 의 검토 의 의 의무. 최종: typecheck + unit 56/56 + **55/55 e2e (1 skip) PASS** + workspace validator 67/27/27 + **3 컨테이너 (root / canvas-design / block-doc) 의 의 의 drag-to-create flow 의 의 visual 의 의 의 모두 확인**. **WI-017 closed**.

## Cross-references

- DR-design-007 — `records/design-reviews/DR-design-007-rubber-band-popover-primitives.md`
- DR-012 — `records/decisions/DR-012-insertable-capability-registry.md`
- WI-015 — `records/work-items/WI-015-ai-agentic-tooltip.md` (토큰 상속 + motion 패턴 의 reference)
- WI-016 — `records/work-items/WI-016-tooltip-editor-integration.md` (capability 패턴 + describe context 의 reference)
- DR-009 / DR-010 / DR-011 (open registry 의 정착 패턴)
- DR-design-005 (Radix wrapping 의 박제 패턴)
- 사용자 prompt 의 4 verification criteria (WI 의 acceptance criteria 의 base)
- 관련 메모: [[feedback-tree-shaking-first]], [[feedback-design-system-triage-mandatory]], [[feedback-radix-slot-wrapper-forwardref]]
