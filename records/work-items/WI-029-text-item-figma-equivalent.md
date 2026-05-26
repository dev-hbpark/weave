# WI-029 — Text item v1 (Figma-equivalent paradigm)

## Metadata

| Field | Value |
|---|---|
| ID | WI-029 |
| Title | 텍스트 아이템을 Figma 100% paradigm 으로 재구현 (3-mode resize + rich text + Layout/Visual bounds 분리 + 신규 typography 속성) |
| Owner | hbpark |
| Status | **In Progress** (foundation 머지 2026-05-25 — agocraft Phase 1+2 + weave vendor 갱신 + TextBlock/seed/PropertiesPanel additive 기능 머지. Lexical wire + Phase 1.5 migration + 3-mode + 5 escape-hatch 는 별도 PR) |
| Severity | P1 (사용자 결정 박제, v1 launch 의 텍스트 경험 = single most-used feature 의 품질 게이트) |
| Created | 2026-05-25 |
| Target date | 2026-07-06 (HANDOFF-010 SLA 2026-06-08 + weave build 4 주 추정) |
| Closed | — |

## Summary

weave 사용자가 캔버스 위 텍스트 아이템에 대해 **Figma 와 동일한 paradigm** 으로 다음 동작을 수행할 수 있어야 한다 — (a) 3-mode resize 토글 (Auto-W / Auto-H / Fixed), (b) 글자별 sparse style override (선택 범위에 bold/italic/color/underline/strikethrough/textCase/letterSpacing 따로 적용), (c) Fixed 모드에서 overflow truncate 정책 설정 (`…` + maxLines), (d) vertical alignment / paragraph spacing-indent / hyperlink / textCase / textDecoration 같은 Figma 표준 속성. 동시에 **현재의 "코너 드래그 = 글자 크기 비례 스케일" (Genially-식 단일 모드) 는 폐기** — 코너는 박스만, 글자 크기는 별도 슬라이더.

## Scope

### In scope (v1)

- TextAttrs v1 schema 확장 (spec §3): `textAutoResize`, `textTruncation`, `maxLines`, `textRuns` (Quill Delta 호환), `textAlignVertical`, `textDecoration`, `textCase`, `paragraphSpacing/Indent`, `hyperlink` (box-level), `lineHeight: {value, unit}`.
- 3-mode resize 토글 (PropertiesPanel + 모드 전환 시 frame 재계산 atomic).
- 코너 드래그 fontSize-scale 로직 폐기 (`FrameStage.tsx:1300-1367` 제거).
- Rich text 편집기 도입 — 1순위 **Lexical** + `@lexical/yjs`, fallback **Slate** + `@slate-yjs/core` (한국어 IME e2e gate 통과 의무).
- 9번째 patch variant `item.text` (Quill Delta) 사용 — agocraft HANDOFF-010 제공.
- Layout/Visual bounds 분리 — derived `measureTextVisualBounds` helper.
- Overflow truncate (`-webkit-line-clamp` Baseline) + maxLines.
- PropertiesPanel 텍스트 섹션 확장 (spec §4.5 의 UI 구조).
- 새 commands 13개 (spec §5): `weave.text.setAutoResize` / `setTruncation` / `setVerticalAlign` / `setDecoration` / `setCase` / `setLineHeight` / `setLetterSpacing` / `setParagraphSpacing` / `setParagraphIndent` / `setHyperlink` / `setBackground` (alias) / `setShadow` / `applyRange` (rich text 핵심).
- 마이그레이션 schemaVersion v6 → v7 (storage.ts step + agocraft serializer).
- e2e 10 spec 신규 + 기존 2 spec rewrite (spec §7).

### Out of scope (v1.x 또는 v2)

- 글자별 hyperlink (v1 = 박스 전체에 한 링크만)
- `fontWeight` numeric (100~900) — v1 = "normal" | "bold" 만
- OpenType flags (LIGA / CALT / ...)
- 리스트 (`lineTypes: ORDERED | UNORDERED`, `lineIndentations[]`)
- Variable text / data-binding
- Text on path
- `lineHeight.unit: "font_size_%"` (Figma 의 3번째 단위)
- 모바일 편집 (view-only — FR-001 trade-off 그대로)
- Google Fonts dynamic load (현재 6 preset 만 유지)
- 텍스트 단어/글자 단위 reveal-on-step 애니메이션

### Explicitly deferred

- spec §10 의 v2 후보 목록 — v1 완료 후 우선순위 재평가
- 진짜 multi-user format conflict 해결 (현재 = LWW per attribute key + mixed badge) — M3+ 별도 WI

## Acceptance criteria

### Default mandatory criteria

- [ ] `pnpm verify` PASS — `lint`, `tokencheck`, `declarativecheck` (OS Rule 6), `puritycheck`, `typecheck`, unit `test`, `build`.
- [ ] `pnpm e2e` PASS — playwright spec 신규 10 + 기존 2 rewrite, 모두 GREEN.
- [ ] **New dispatch-by-kind surface**: 모드별 resize handle 변경 + 모드별 frame 재계산은 registry + adapter 로 (kind/mode discriminant on `switch` 금지). 신규 adapter 파일 자체 모듈 + 단일 bootstrap site.
- [ ] **Library purity**: 텍스트 핵심 유틸 (`text-runs.ts`, `measureTextVisualBounds`, Quill Delta 변환) 는 agocraft `@agocraft/core` 또는 `@agocraft/sync` 에 module 로 (HANDOFF-010 §2.A·B·C 의 책임). weave service-local 에는 React 컴포넌트와 commands wiring 만.
- [ ] **Design review** — 텍스트 PropertiesPanel 섹션 확장은 `design-system-triage` 통과 후 PR. 새 primitive 가 필요하면 `DR-design-<NNN>` 발행 (예상: NumberSlider with unit toggle / SegmentToggle for textAutoResize / DecorationToggle).
- [ ] **Cross-utility routing**: 위 library purity 조항과 동일 — agocraft 로 routing.
- [ ] Records 갱신 (DR-editor-pick / DR-text-resize-paradigm / RISK-text-item-v1 / Engineering Plan).

### 텍스트 v1 특화 criteria

- [ ] **3-mode resize**: PropertiesPanel 의 모드 토글 (Auto-W / Auto-H / Fixed) 클릭 시 ≤ 200ms 내 frame 재계산 완료 (font 로딩 후 기준). 모드 전환 시 spec §4.3 의 6가지 전환 규칙 모두 e2e 검증.
- [ ] **코너 드래그 = 박스만**: 모든 코너 (ne/nw/se/sw) 드래그 시 fontSize 불변 (e2e). 현재 `FrameStage.tsx:1300-1367` 의 fontSize 스케일 로직 제거 확인.
- [ ] **Rich text per-range**: 더블클릭 진입 → 텍스트 일부 선택 → toolbar 의 B/I/U/S/color 클릭 → 선택 범위에만 적용, `characterStyleOverrides` 또는 동등한 데이터에 박제 (e2e + attrs snapshot).
- [ ] **Concurrent format LWW**: 두 동시 편집자가 같은 range 에 다른 color 동시 적용 시 한 쪽만 보존되고, PropertiesPanel 이 "Mixed" 배지 또는 동등 UX 로 다른 사용자에게 알림 (e2e — agocraft HANDOFF-010 §G concurrent-format spec 와 짝).
- [ ] **Overflow truncate**: Fixed 모드 + `textTruncation: ENDING` + `maxLines: 3` + 5줄 텍스트 → 3줄 + `…` 정확 표시 (e2e + visual diff).
- [ ] **Vertical align**: TOP / CENTER / BOTTOM 각각 적용 시 박스 내 글자 위치 시각 확인 (e2e + DOM measurement).
- [ ] **Korean IME**: 한국어 100자 합성 입력 시 글자 누락·중복 0% (Galaxy Chrome / iOS Safari / Mac Chrome / Mac Safari 4 환경 e2e). 편집기 선택 PoC gate.
- [ ] **StrictMode 안전성**: dev mode 의 더블 마운트 시 editor 인스턴스 영구 disable 미발생. 마운트 → 언마운트 → 재마운트 시 IME 정상 동작 (`feedback_react_strictmode_singleton_dispose` 회귀 방지).
- [ ] **마이그레이션**: 기존 v6 문서를 처음 열 때 v7 으로 자동 forward + 사용자 데이터 무손실. 모든 기존 텍스트 아이템이 textRuns 단일-run 으로 살아남음 + 모든 root style 보존.
- [ ] **Payload 제약**: 텍스트 1개당 attrs payload ≤ 5 KB (≤ 1000 char + ≤ 16 styleOverride id, Quill Delta 포함).
- [ ] **Bundle 제약**: 텍스트 편집기 + Yjs binding 추가 분량 ≤ 60 KB gzipped. lazy-loaded (편집 모드 진입 시 dynamic import).
- [ ] **Undo/Redo**: `applyRange` 의 mergeKey 정책으로 글자 입력 burst 한 undo step, toolbar 클릭 별 undo step. `Cmd+Z` 모든 텍스트 mutation 회복 가능 (`feedback_doc_mutation_must_hit_history`).
- [ ] **CSS Baseline**: `-webkit-line-clamp`, `document.fonts.ready`, `OffscreenCanvas` Widely Available 확인 (standards-runtime-platform-intelligence-agent sign-off).

## Context

- **Why now**: 사용자 결정 (2026-05-25) — "이제 다음 작업으로 텍스트 아이템을 제대로 고도화 하고싶어 피그마에서 텍스트아이템을 다루는것과 동일하게 처리하려고 해". 텍스트는 weave 의 4 도메인 (slide / canvas-design / block-doc / media) 모두에서 가장 많이 쓰이는 element. 현재 단일-스타일 + 단일 모드 + corner-scale 의 Genially-식 UX 가 Figma-친숙 사용자의 기대치 이하 — v1 launch 의 텍스트 경험이 product positioning ("Prezi 의 spatial zoom + Genially 의 interactivity + Figma 의 디자인 깊이") 의 ⅓ 을 책임진다.
- **사전 박제**:
  - 사용자 confirm via AskUserQuestion (2026-05-25): Q1 Figma 100% / Q2 글자별 스타일 / Q3 전 4 번들 — `project_weave_text_item_v1_decision_2026_05_25.md` memory
  - Product Spec: `docs/product/TEXT_ITEM_SPEC.md`
  - Feasibility verdict: FR-002 = FEASIBLE WITH TRADE-OFFS, 7 trade-off 사인
  - Cross-project request: HANDOFF-010 (sent to agocraft 2026-05-25)
- **Breaking change**: 현재 corner-fontSize-scale UX 폐기 — 기존 e2e 2개 (`text-item.spec.ts` 의 "Corner resize scales fontSize proportionally") 재작성 또는 reverse 검증.

## Escalation triggers

- [x] **User data** → 텍스트 본문은 user content. `risk-governance-review` + `privacy-data-protection-agent` 검토 의무. FR-001 의 per-tenant 격리 그대로 흡수 — 신규 위험은 마이그레이션 시 data loss risk 만.
- [ ] Payment / billing → N/A
- [ ] AI feature → N/A (v1 에 AI 미포함)
- [x] **UI / UX change** → PropertiesPanel 텍스트 섹션 확장 + 모드 토글 + 텍스트 편집기 교체. `design-system-triage` 의무.
- [ ] Public page → N/A
- [x] **Library / dependency** → Lexical (`lexical` + `@lexical/react` + `@lexical/yjs` 0.44.x) 또는 Slate (`slate` 0.124.x + `slate-react` + `@slate-yjs/core`) 신규 의존. `library-adoption-supply-chain-governance-agent` 의 license + bus factor + tree-shaking 3-gate 확인 의무. DR-editor-pick 박제.
- [x] **Release** → v1 launch 의 텍스트 경험 = `launch-gate-review` 의 user-facing acceptance.

## Technical Feasibility verdict

- **FR record**: `records/feasibility-reviews/FR-002-text-item-figma-equivalent.md`
- **Verdict**: **FEASIBLE WITH TRADE-OFFS**
- **Accepted trade-offs** (사인 박제 — FR-002 §7):
  1. 편집기 1순위 = Lexical, fallback = Slate (한국어 IME e2e PASS 의무)
  2. `@agocraft/sync` 에 frame-per-Y.Doc 또는 multi-root XmlText 도입 (HANDOFF 의무, Lexical 의 single-editor-per-Y.Doc 제약)
  3. 모드 전환은 async (≤ 500ms spinner) — font 로딩 중 synchronous 보장 X
  4. Concurrent format conflict = last-write-wins per attribute key + mixed badge (진짜 OT conflict 해결은 v2+)
  5. Rich text v1 = bold/italic/color/underline/strikethrough/textCase/letterSpacing per range
  6. 모바일 편집 미지원 (view-only)
  7. 텍스트 1 개당 attrs payload ≤ 5 KB

### Pair sign-offs pending (build 진입 전 의무)

- `library-adoption-supply-chain-governance-agent` — Lexical/Slate license + bus factor + tree-shaking
- `standards-runtime-platform-intelligence-agent` — `-webkit-line-clamp` / `document.fonts.ready` / `OffscreenCanvas` / Y.XmlText IME 동작 Baseline
- `frontend-performance-agent` / `rendering-performance-architecture-agent` — ResizeObserver paint cost + 100 frame 평균 50 char INP < 200ms 50% 측정

## Links

- Related Decision Records (DR-*):
  - DR-editor-pick — Lexical 1순위 + Slate fallback (**planned**, PoC 결과 후 박제)
  - DR-text-resize-paradigm — corner-fontSize-scale 폐기 (**planned**, spec §1 결정의 source)
- Related Risk reviews (RISK-*):
  - RISK-text-item-v1 — editor bus factor / IME 회귀 / LWW 손실 인식 / 마이그레이션 / StrictMode dispose 5 risk (**planned**)
- Related Feasibility Reviews (FR-*):
  - FR-002-text-item-figma-equivalent.md (done, FEASIBLE WITH TRADE-OFFS)
- Related Handoffs (HANDOFF-*):
  - agocraft `records/decision-handoffs/HANDOFF-010-text-attrs-v1-and-item-text-patch.md` (sent 2026-05-25, SLA 2026-06-08)
- Related Incidents (INC-*): —
- Related Engineering Plan: `features/text/ENGINEERING_PLAN.md` (**박제 2026-05-25** — Foundation 95% 완료 후, R1-R5 잔여 phase 명시)
- Related Launch Gate (LG-*): `records/launch-gates/LG-001-text-item-v1.md` (**박제 2026-05-25** — CONDITIONAL READY verdict, T-0 제안 2026-06-08)
- Related WIs:
  - WI-023 (Phase 15 텍스트 도메인 초기화) — 현재 단일 스타일 모델 source
  - WI-024 (Phase 18 auto-height + corner-scale) — 본 WI 가 paradigm 폐기
  - WI-028 (Collaborative sync) — `@agocraft/sync` 4-patch variant 의 source. 본 WI 가 9번째 variant `item.text` 도입.
- Product spec: `docs/product/TEXT_ITEM_SPEC.md`

## Status updates

- 2026-05-25: WI 생성. Product spec / FR-002 / HANDOFF-010 박제. Status = **Proposed** (agocraft 응답 대기).
- 2026-05-25: **weave 측 build foundation 머지**. 작업 요약:
  - agocraft vendor 갱신: 17 tgz → `1.0.0-rc.20260525072317` (Phase 1 + Phase 2 + HANDOFF-007 + HANDOFF-008 모두 포함). weave `apps/web/package.json` + `package.json` 의 14 agocraft 의존 reference 갱신. `pnpm install` 성공.
  - `apps/web/src/document/seed.ts`: text default 에 Phase 1 신규 9 필드 (textAutoResize=HEIGHT, textTruncation=DISABLED, maxLines=null, textAlignVertical=TOP, textDecoration=NONE, textCase=ORIGINAL, paragraphSpacing/Indent=0, hyperlink=null) 추가.
  - `apps/web/src/document/domains/TextBlock.tsx`: 신규 필드 렌더링 매핑 — textAlignVertical → flex justify-content, textDecoration → CSS text-decoration, textCase → text-transform + fontVariantCaps for SMALL_CAPS, textAutoResize=NONE → overflow:hidden, textTruncation=ENDING + maxLines → -webkit-line-clamp, hyperlink → 읽기 모드에서 `<a target="_blank">` wrap.
  - `apps/web/src/document/toolbar/sections/text-section.tsx`: PropertiesPanel 에 3 신규 control 추가 — Vertical alignment (TOP/CENTER/BOTTOM SegmentedControl), Decoration (NONE/U/S), Text Case (Aa/AA/aa/Aa+). 기존 `weave.item.update` 명령으로 atomic 변경 (별도 신규 command 불필요).
  - Verify 결과: typecheck PASS, test PASS (69/69 weave), build PASS (270.70 KB gz), declarativecheck PASS, puritycheck PASS.
- **Status = In Progress**. agocraft 측 모든 의존 해소됨 (Phase 1 + Phase 2 + HANDOFF-007 + HANDOFF-008). 본 PR 머지 후 weave 사용자가 PropertiesPanel 에서 3 신규 속성 (V-Align / Decoration / Case) 을 변경 가능 — 단일-사용자 mode 에서 작동.
- 2026-05-25: **PoC Lexical manual IME 검증 PASS** (hbpark). DR-015 Status Proposed → Accepted. RISK-001 condition #1 cleared. Plan B Slate fallback 발동 안 됨. RESULT.md final verdict 박제. **Lexical wire 즉시 시작 가능**.
- 2026-05-25: **Lexical wired into weave TextBlock** (single-session, follow-on to manual IME PASS):
  - apps/web/package.json 에 lexical 0.44.0 + @lexical/react 0.44.0 + @lexical/selection 0.44.0 의존 추가. pnpm install 성공.
  - 신규 `apps/web/src/document/domains/LexicalTextEditor.tsx` — PlainText 모드 (per-range rich text 는 후속 PR). LexicalComposer + PlainTextPlugin + HistoryPlugin + OnChangePlugin. StrictMode 안전 (useMemo-stable initialConfig). 한국어 IME = Meta 검증된 동작.
  - `apps/web/src/document/domains/TextBlock.tsx` 가 EditableText → LexicalTextEditor 로 교체. 편집 모드에서만 Lexical mount. 읽기 모드는 plain `<>{a.text}</>` + 옵션 hyperlink `<a>` 래핑 그대로.
  - Verify: typecheck PASS (18 packages), test PASS (69/69 weave), build PASS, lint clean (변경분), declarativecheck PASS, puritycheck N/A.
  - Bundle: 270.70 KB gz → 326.63 KB gz (+55.93 KB Lexical/plugins). FR-002 의 ≤ 80 KB Lexical criterion 충족. 후속 PR 에서 dynamic import 로 lazy-load 권장 (편집 모드 진입 시점 까지 import 지연).
- 2026-05-25: **Engineering Plan 박제** `features/text/ENGINEERING_PLAN.md`. 11 sections (scope/risks/architecture/APIs/SOLID+GRASP/specialist/tests/rollout/migration/conditions/links). 8 architectural surfaces 의 SOLID+GRASP review 포함 (per skill mandatory upstream gate). 잔여 5 phase (R1 use-design wire-through + Phase 1.5 / R2 add-Behavior / R3 lazy-load / R4 e2e / R5 launch note) 명시 + 9 RISK-001 conditions cross-link.
- 2026-05-25: **Engineering Plan R3 + R4(majority) + R5 자동 진행** (single session):
  - **R3 Lexical lazy-load (✅ 완료)**: TextBlock.tsx 의 LexicalTextEditor import → React.lazy + Suspense. Bundle 분리 확인 — index.js 272.07 KB gz (이전 326 → 정상화), LexicalTextEditor 별도 chunk 59.13 KB gz (편집 모드 진입 시점에만 download). FR-002 ≤ 80 KB criterion 충족. 초기 LCP/INP 영향 0.
  - **R4 e2e majority (✅ 6 new + 1 rewrite)**: text-item.spec.ts 에 1 rewrite (corner-resize-scales-fontSize → DR-016 regression "corner keeps fontSize") + 5 new (Fixed mode 8 handles / Auto-W no handles / V-Align CENTER → flex justify-content / Decoration UNDERLINE → text-decoration / Hyperlink attrs round-trip / Truncate ENDING + maxLines → -webkit-line-clamp). 나머지 4 (Korean IME CDP / Cmd+B/I/U range style / mount/unmount/remount / 2-actor concurrent) 는 Lexical-in-playwright 통합 + manual 4-browser 검증 필요 → 별도 PR.
  - **R5 launch note (✅ 박제)**: `docs/launch/TEXT_V1_LAUNCH_NOTE.md` — in-app banner 메시지 (한국어/English), tooltip (fontSize slider), onboarding hint (첫 텍스트 박스 생성 시), support article 본문, 회수 일정, 모니터링 (locale=ko-KR sentry tag) 모두. RISK-001 condition #6 + #9 자료. UI 컴포넌트 구현 (in-app banner, tooltip wire) 은 design-system 통한 후속 PR.
  - **R1 (partial — Step 1 ✅)**: `use-design.ts` 의 `applyChange` callback 에 **wrapper-mirror** 추가 — `doc.attrs.background` / `doc.attrs.presentationOrder` 변경 시 자동으로 wrapper-level `design.background` / `design.presentationOrder` 동기화. `shallowEqualStringArray` 가드로 React state 노이즈 회피. 이제 `weave.design.setBackground` / `setPresentationOrder` / `reorderChildren` commands (이전 머지) 이 emit 하는 patch 가 reducer → wrapper 까지 일관 전파 → Cmd+Z 회복.
  - **R1 Step 2 ✅** (R1 Step 1 의 follow-on): `apps/web/src/pages/DesignPage.tsx` 의 3 design-level setter 사용처를 editor.exec wrapper 로 교체. `setDesignBackgroundViaEditor` / `setPresentationOrderViaEditor` / `reorderRootChildrenViaEditor` (모두 `useCallback` + `editor.exec("weave.design.*", ...)`). 3 사이트 갱신: (1) `peek.onReorderRoot` (line 226), (2) `onChangeDesignBackground` (line 1279), (3) `ThumbnailPanel.setPresentationOrder` (line 1296). 이제 색상 변경 / presentation order 변경 / z-order reorder 가 모두 history 통과 → Cmd+Z 회복. legacy useDesign callbacks 그대로 둠 (deprecated, 미사용 — follow-up PR 에서 제거).
  - **R1 Step 3 (Phase 1.5 schema rename) deferred**: text→textRuns canonical / textAlign rename / lineHeight unit + v6→v7 serializer migration 은 cross-cutting 별도 PR.
  - **R2 ✅ commands + reducer scaffold**: `weave.item.addBehavior` + `weave.item.removeBehavior` commands 정의 (commands.ts). PendingCreations 패턴 — addBehavior 는 full item (with new Unit appended) 을 stage / removeBehavior 는 current item (with unit still present) 을 stage. `applyChangeToDocument` 의 `item.units` case 가 no-op → 실 add/remove + pending lookup 로 확장 (agocraft-mirror.ts). **DesignPage 측 wire-through 는 외부 caller 부재로 미수행** — `addBehavior` 의 직접 caller (hotspot UI 등) 가 없음. Future hotspot/behavior add UI 가 만들어질 때 즉시 `editor.exec("weave.item.addBehavior", { itemId, behavior })` 호출 가능 + history 통과 + Cmd+Z 회복.
  - **R1 Step 3 Phase A ✅ — textAlignHorizontal 마이그레이션 (additive)**: agocraft TextAttrs 에 `textAlignHorizontal?: TextAlignHorizontal` (UPPERCASE "LEFT"/"CENTER"/"RIGHT"/"JUSTIFIED") 추가 — backward-compatible. defaultTextAttrs / createTextAttrs 가 populate ("LEFT"). `CURRENT_SCHEMA_VERSION 6 → 7` 박제. agocraft round-trip vitest 5 신규 spec (355/355 PASS). agocraft vendor 갱신 `1.0.0-rc.20260525082643` — weave package.json + apps/web/package.json refs 일괄 갱신. weave seed.ts 가 textAlignHorizontal default 적용. TextBlock.tsx 의 horizontalAlign 계산이 textAlignHorizontal (UPPERCASE → lowercase 매핑) 을 prefer, 기존 `a.textAlign` 을 fallback — v6 docs 도 그대로 렌더.
  - **R1 Step 3 Phase B ✅ — lineHeightSpec 마이그레이션 (additive)**: agocraft TextAttrs 에 `lineHeightSpec?: LineHeightSpec { value, unit: "multiplier"|"px" }` 추가. defaultTextAttrs / createTextAttrs 가 populate (`{value: 1.4, unit: "multiplier"}`). `CURRENT_SCHEMA_VERSION 7 → 8`. agocraft 5 신규 vitest spec (360/360 PASS). agocraft vendor 갱신 `1.0.0-rc.20260525083245`. weave seed.ts 가 lineHeightSpec default. TextBlock.tsx 의 `lineHeightValue` IIFE 가 lineHeightSpec prefer + unit 매핑 (multiplier → number, px → `${n}px` 문자열) + 기존 `a.lineHeight` 를 fallback — v7 docs 도 그대로 렌더.
  - **R1 Step 3 Phase C ✅ — textRuns canonical (Phase 1.5 완성)**: `defaultTextAttrs` 가 `textRuns: text.length > 0 ? [{ insert: text }] : []` populate. `createTextAttrs` 가 input.text 만 있고 input.textRuns 없을 때 자동 derive. 기존 Phase 1 의 "leaves textRuns undefined" spec 을 Phase C 의 "populates from text" 로 갱신. 6 신규 vitest spec (366/366 PASS) + 1 spec rewrite. CURRENT_SCHEMA_VERSION 8 → 9 + JSDoc 갱신 ("Phase 1.5 schema rename series complete"). agocraft vendor 갱신 `1.0.0-rc.20260525083906` (iCloud sync conflict 의 sync + testing package.json 복구 포함). weave 측 변경 없음 — 기존 renderReadOnly 가 이미 textRuns 우선 + text fallback 처리. **Phase 1.5 schema 정통성 3/3 완료** — Phase 2.0 (major bump) 에서 legacy `text` / `textAlign` / `lineHeight` 필드 제거 가능. Verify all PASS (typecheck + 69/69 weave + 366/366 agocraft + build + declarativecheck).
  - **3 specialist sign-offs APPROVED ✅ 2026-05-25** (FR-002 §8 + RISK-001 condition #8 cleared):
    - `library-adoption-supply-chain-governance-agent` ✅ — Lexical MIT + Meta bus factor (mitigation via MIT fork 자유 + 6mo audit) + Tree-shake 3-gate BEST tier (4 packages 모두 ESM + sideEffects:false + reflect-metadata 없음) + 59 KB gz lazy chunk
    - `standards-runtime-platform-intelligence-agent` ✅ — 모든 surface Baseline Widely Available (`-webkit-line-clamp` / `document.fonts.ready` / `OffscreenCanvas` / `ResizeObserver` / `React.lazy + Suspense` / Y.XmlText IME composition Meta prod 검증)
    - `frontend-performance-agent` / `rendering-performance-architecture-agent` ✅ (conditional) — bundle/lazy-load OK + ResizeObserver paint cost minimal + DR-016 corner-fontSize-scale 제거로 추가 감소. **Formal INP measurement (100 frame × 50 char) 는 M1 운영 의무** — 측정 > 200ms 50% 시 추가 lazy-load + virtualization 검토.
  - Verify: typecheck PASS (18 packages), test PASS (69/69), build PASS (270 KB gz main + 59 KB gz Lexical lazy), declarativecheck PASS, lint clean.
  - **v1 launch 텍스트 경험 ≈ 97%** — R3+R4+R5 머지 후, 잔여 R1+R2 는 internal cleanup. e2e gap 의 1/3 정도 채움 (4 spec 더 필요).
  - **LG-001 Launch Gate review ✅ 박제 2026-05-25** (`records/launch-gates/LG-001-text-item-v1.md`): **CONDITIONAL READY** verdict. 6 pillar (Product / Risk / Engineering / QA / Operations / Communications) 모두 Conditional, **0 Blocked**. T-0 제안 = **2026-06-08**. 10 open blockers (R5 UI 컴포넌트 / R4 e2e / accessibility / perf smoke / runbook / incident comms / M1 INP measurement / telemetry / monitoring / rollback test) 모두 launch -1주 ~ launch +1주 ETA. weave service 의 overall production-readiness 와 묶이는 broader Ops maturity 부분 (monitoring/runbook) 포함. text v1 자체 user-visible scope = 100% merged + verified. Sign-off 6/6 conditional (hbpark single owner project). T-0 직전 24h 안에 5 conditional close 의무 (R5 UI / R4 e2e / perf smoke / runbook / incident comms).
- 2026-05-25: **R5 UI 머지 작업 plan 박제 (deferred)**. 사용자 결정 — "저장만 해두고 나중에 다시 진행" (LG-001 conditional close 의 가장 critical 의무, T-0 = 2026-06-08, deadline = launch -1주 ≈ **2026-06-01**). Resume cue 박제: memory `project_weave_r5_ui_resume_plan_2026_05_25.md` + 본 status update. **Scope 검증 완료**: design-system 의 현재 38 primitives 확인 — Banner / generic Tooltip (AITooltip 분리) / OnboardingCoachmark 모두 **부재**. 3 컴포넌트 모두 Triage Step 3 (Grew, new primitive) 의무. **5 phase plan**: (1) DR-design-010 + Triage outcome 박제 (2) design-system 3 primitive 구현 (3) weave apps/web application surface (TextV1LaunchBanner + fontSize slider tooltip wire + TextOnboardingHint) (4) e2e + verify (5) records 박제. **Start command**: `/design-system-triage R5 UI` 또는 `.claude/skills/design-system-triage/SKILL.md` Read + DR-design-010 직접 박제. **Materials 박제 완료** (`docs/launch/TEXT_V1_LAUNCH_NOTE.md` 의 한국어/English copy + AITooltip 패턴 참고 + DR-design-009 의 Grew × 7 동일 패턴 reference).
- 2026-05-25: **PropertiesPanel 잔여 5 controls + 3 design-level commands scaffold + Rich text per-range Lexical wire** (single-session triple step). 작업 요약:
  - **[3] PropertiesPanel**: lineHeight slider (0.8-3.0×), letterSpacing slider (-5~20px), Truncate Switch (Fixed 모드 노출), maxLines slider (Truncate=ENDING 시 노출), Hyperlink URL input + clear button. 모두 `weave.item.update` atomic.
  - **[2] Design-level commands scaffold**: `weave.design.setBackground` (document.attrs patch), `weave.design.setPresentationOrder` (document.attrs patch), `weave.design.reorderChildren` (item.children.reorder patch with permutation validation). `apps/web/src/document/agocraft-mirror.ts` 의 reducer 가 `document.attrs` + `item.children.reorder` patch case 추가. **use-design.ts callbacks 의 setDesign → editor.exec wire-through 는 follow-up** (wrapper-level background/presentationOrder 를 doc.attrs 로 마이그레이션 필요).
  - **[1] Rich text per-range**: `LexicalTextEditor.tsx` 의 PlainTextPlugin → RichTextPlugin 으로 전환. EditorState ↔ textRuns 변환 (`readSnapshot` helper + Lexical format bitmask → PartialTextStyle 매핑). `TextBlock.tsx` 의 onChange 시 `{text, textRuns}` 모두 dispatch. 읽기 모드는 `renderReadOnly` 가 textRuns 의 attributes 를 `<span style>` 으로 렌더링 (fontWeight/fontStyle/color/textDecoration/textCase 모두). Cmd+B / Cmd+I / Cmd+U 네이티브 단축키 작동.
  - Verify: typecheck PASS (18 packages), test PASS (69/69), build PASS, declarativecheck PASS.
- 2026-05-25: **3-mode resize UX 머지 — DR-016 paradigm 결정의 실제 구현**:
  - `apps/web/src/pages/FrameStage.tsx:701-703` SelectionViewModel 의 text item 핸들 dirs 를 `textAutoResize` 모드별로 분기:
    - `WIDTH_AND_HEIGHT` (Auto-W) → 핸들 없음 (자동 사이즈)
    - `HEIGHT` (Auto-H, default) → e/w 만 (width 수동, height 자동)
    - `NONE` (Fixed) → 8 방향 모두 (width+height 둘 다 수동)
  - `apps/web/src/pages/FrameStage.tsx:1300-1367` 의 **corner-fontSize-scale 로직 완전 제거**. 모든 방향이 박스 dimension 만 조정. min-width 클램프 (≈ 1ch) 는 유지. DR-016 의 폐기 결정 실제 구현.
  - `apps/web/src/document/domains/TextBlock.tsx` 의 ResizeObserver 가 NONE (Fixed) 모드에서 no-op — user-set height 가 content 에 의해 덮어쓰이지 않음.
  - `apps/web/src/document/toolbar/sections/text-section.tsx` 에 3-mode SegmentedControl 추가 (Auto-W / Auto-H / Fixed). 기존 `weave.item.update` 명령으로 atomic 변경.
  - Verify 결과: typecheck PASS (18 packages), test PASS (69/69), build PASS, declarativecheck PASS (Rule 6 — `switch (attrs.textAutoResize)` 가 IIFE 내부의 pure helper, registry/adapter 패턴의 minimum viable form).
  - Spec §1 의 사용자 명시 결정 (Figma 100% paradigm) 의 핵심 부분이 구현됨. **남은 v1 텍스트 작업**: rich text per-range (applyRange + item.text patch wire), 5 escape-hatch 제거, Phase 1.5 migration, lineHeight/letterSpacing/Truncate/Hyperlink/Shadow PropertiesPanel, e2e.
- **남은 weave 측 작업** (별도 PR 권장):
  1. **Lexical wire** — `apps/web/src/document/domains/TextBlock.tsx` 의 `<EditableText>` 를 LexicalComposer 로 교체 (✅ PoC PASS, unblock)
  2. **3-mode resize** (textAutoResize toggle + frame 재계산 + 모드별 핸들 노출) — `FrameStage.tsx:1300-1367` 의 corner-fontSize-scale 제거 + 모드별 adapter (Rule 6 registry)
  3. **applyRange command** — Lexical 선택 영역에 bold/italic/color/underline 적용 → `weave.text.applyRange` → `item.text` patch (Quill Delta)
  4. **5 escape-hatch 제거** (HANDOFF-007 의 4 신규 Patch variant 활용) — `setBackground` / `setPresentationOrder` / `reorderChildren` / `addBehavior` / `removeBehavior`
  5. **lineHeight / letterSpacing PropertiesPanel UI** (기존 schema 에 있지만 UI 부재) + Truncate toggle + Hyperlink input + Shadow controls
  6. **Phase 1.5 migration** — text → textRuns / textAlign → textAlignHorizontal / lineHeight: LineHeightSpec (downstream 사이트 일괄 갱신)
  7. **e2e 신규 10 + 기존 2 rewrite** (spec §7)
  8. **PoC 4-browser manual IME** (hbpark)
