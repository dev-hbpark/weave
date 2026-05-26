# Technical Feasibility Review — FR-002

## Metadata

| Field | Value |
|---|---|
| ID | FR-002 |
| Title | 텍스트 아이템을 Figma 100% paradigm 으로 재구현 (3-mode resize + rich text + Layout/Visual bounds 분리) |
| Reviewer agent | `technical-feasibility-agent` |
| Triggering Work Item | **WI-TBD** (이 FR 이 FEASIBLE 판정 후 발행) |
| Date | 2026-05-25 |
| Verdict | **FEASIBLE WITH TRADE-OFFS** |
| Review-by | 2026-08-31 (M2 end-to-end PoC 후 재검토) |

---

## 0. 입력 문서

- Product spec: `docs/product/TEXT_ITEM_SPEC.md` (이 FR 의 outcome 출처)
- 사용자 결정: spec §1 의 결정 요약 (Figma 100% paradigm + rich text v1 + 전 4 번들)
- 사전 박제: `@agocraft/sync` WI-028 Phase 1-6 (Y.Doc 기반 4-patch variant), `WI-013` 진행 박제 (Phase 9~12 의 frame-in-frame 도메인 모델)
- 관련 memory: `feedback_tree_shaking_first`, `feedback_yjs_bridge_subtle_invariants`, `feedback_react_strictmode_singleton_dispose`

WORK_ITEM.md 부재로 spec 을 Discovery 결과물로 대체. 이 FR 발행 직후 WI-NNN 생성 의무 (§9).

---

## 1. Outcome restated (testable)

> **데스크탑 Chrome / Edge / Safari latest-2** 사용자가 weave 캔버스의 텍스트 아이템에 대해, **Figma 의 3-mode (Auto-W / Auto-H / Fixed) + 글자별 sparse style override (rich text) + Layout/Visual bounds 분리 + textCase/decoration/vertical-align/paragraph-spacing/hyperlink** 의 전 동작을 한국어/영문 입력 환경에서 수행할 수 있다.
>
> **테스트 가능한 기준**:
> - 모드 전환 (Auto-H ↔ Auto-W ↔ Fixed) 시 frame 재계산이 사용자 인식 가능 ≤ 200ms 내 완료 (font 가 로드된 상태 기준).
> - 한국어 IME composition 으로 100 자 입력 시 글자 누락·중복 0% (e2e 통과).
> - 두 동시 편집자가 같은 텍스트 박스에 한 글자씩 입력 시 양쪽 글자 모두 보존 (CRDT char-level merge).
> - 두 동시 편집자가 같은 character range 에 다른 색 적용 시 last-write-wins 동작이 명시적이고 예측 가능.
> - Fixed 모드 + `textTruncation: ENDING` + `maxLines: 3` 으로 5줄 텍스트 → 3줄 + `…` 정확히 표시 (CSS line-clamp Baseline).
> - 텍스트 아이템 1 개당 attrs payload ≤ 5 KB (rich text 도구 포함, ≤ 1000 char + ≤ 16 styleOverride id).
> - 텍스트 자체의 번들 사이즈 (편집기 + Yjs binding) ≤ 60 KB gzipped, 단 추가 plugin 5 개 이내.
> - StrictMode 더블 마운트에서 editor 인스턴스가 영구 disable 되지 않음 (`feedback_react_strictmode_singleton_dispose`).

---

## 2. Capability requirements

| Capability | Best-known result (cite) | Gap to requested outcome |
|---|---|---|
| **3-mode resize enum + frame 재계산** | CSS 의 `width:auto / max-content` + ResizeObserver 동기 측정 (현 weave Phase 18 의 auto-height 동작이 부분 PoC). Figma 도 동일 메커니즘. | 없음 — 신규 `textAutoResize` enum 도입 + 코너 핸들의 fontSize-scale 폐기만 필요. PoC 완료 영역. |
| **Layout vs Visual bounds 분리** | 피그마 `absoluteBoundingBox` vs `absoluteRenderBounds` 모델. 우리 측에선 derived state. | 없음 — measureText / mirror DOM 으로 derived (3.x 의 동기성 제약은 trade-off 로 박제). |
| **Rich text 모델 (character-level sparse style)** | Quill Delta / Yjs Y.XmlText format API — production proven (Notion / Google Docs / Figma 모두 char-level CRDT). 출처: <https://docs.yjs.dev/api/shared-types/y.xmltext>, <https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025> | Figma 의 `characterStyleOverrides[] + styleOverrideTable` 모델을 그대로 보관하는 native CRDT 구조는 없음 — Y.XmlText + format attribute 로 매핑 (변환 cost 있음). 5번째 patch variant `item.text` 도입 필요. |
| **편집기 (selection + IME + history)** | Lexical 0.44.0 (22 KB gz core), Slate 0.124 (75 KB gz core+react), Tiptap 3.23 (100 KB gz w/ ProseMirror). 출처: research agent §1.2. | 3 후보 모두 트리쉐이킹 3-gate PASS. 한국어 IME 안정성·StrictMode 더블 마운트·Yjs 통합 성숙도가 결정 변수. |
| **CRDT 통합** | `@lexical/yjs` (공식 Meta), `@slate-yjs/core` (Liveblocks default), `y-prosemirror` (Tiptap). 출처: research agent §1.4. | 셋 다 production-ready. `@lexical/yjs` 는 **Y.Doc 당 editor 1 개** 제약 — weave 의 frame-in-frame 구조에서 frame 마다 별도 Y.Doc 또는 별도 root XmlText 매핑 필요. |
| **한국어 IME composition** | Lexical = Meta facebook/whatsapp prod 검증, Tiptap = ProseMirror 기반으로 우수, **Slate = 미해결 회귀 다수** (issues #1701/#5989/#2944). 출처: research agent §1.6. | Slate 채택 시 PoC e2e 가 Galaxy/iOS/Mac Hangul 입력 전부 PASS 의무. |
| **React 18 StrictMode + editor 인스턴스** | Lexical: `LexicalComposer` 의 `useMemo` 단일 인스턴스 보장. Tiptap: `useEditor` 더블 마운트 회귀 다수. Slate: editor props 로 외부 인스턴스 받음 → 안전. | weave 의 직전 박제 (`feedback_react_strictmode_singleton_dispose`) 패턴과 동형 risk — 편집기 선택 후 PoC 의무. |
| **모드 전환 시 measure 동기성** | `canvas.measureText` synchronous (font fallback 한정). `OffscreenCanvas.measureText` 동일. mirror DOM offsetWidth/Height synchronous (layout 강제). 셋 다 **font 로드 중에는 fallback 폰트의 metric 반환**. `document.fonts.ready` 가 await 으로 final-font 보장. 출처: WHATWG Canvas spec, CSS Font Loading API (Baseline). | 모든 옵션이 **font 로드 중 final-layout 동기 반환 불가**. 모드 전환은 사용자 트리거 → async OK (await fontReady → measure → patch emit). 실시간 wrap 은 ResizeObserver-backed mirror DOM 으로 reactive update. 이는 **trade-off** (intrinsic limit). |
| **CSS line-clamp + ellipsis (Truncate)** | `-webkit-line-clamp` Baseline Widely Available (Chrome/Edge/Safari/Firefox 전부, 2023+). 출처: <https://developer.mozilla.org/en-US/docs/Web/CSS/-webkit-line-clamp>. | 없음 — CSS 만으로 해결. |
| **History (undo/redo) 통합** | weave 의 `editor.history` + ChangeStream + Patch 모델. 편집기의 native undo 와 충돌 없는 통합 필요. | 모든 후보가 native undo disable 또는 external history pass-through 지원. 단 `applyRange` 의 mergeKey 정책 (`feedback_doc_mutation_must_hit_history`) 의무. |

---

## 3. Intrinsic limits checked

- [ ] Speed of light / network round-trip — N/A (single-region)
- [ ] Information-theoretic bounds — N/A
- [ ] Learning theory — N/A (AI 미포함)
- [ ] Bayes optimal error — N/A
- [ ] Halting problem / undecidability — N/A
- [ ] Identifiability — N/A
- [ ] Privacy-utility — N/A
- [x] **Hardware ceiling — text measure 의 font-loading 동기성**: 브라우저는 font 가 디스크/네트워크에서 로드되기 전 *synchronous* JS 호출에 final-glyph metric 을 반환할 방법이 없다. fallback 폰트의 metric 만 반환. `document.fonts.ready` 가 유일한 final-font 게이트. 이는 **W3C CSS Font Loading API 의 설계상 한계** 로, 엔지니어링으로 우회 불가. **모드 전환 시점 = async** 로 박제하여 회피.
- [x] **Other — Yjs concurrent attribute on same range = last-write-wins (per attribute key)**: Yjs Y.XmlText 의 format 은 char-level CRDT 지만 **같은 char 의 같은 attribute key** 에 두 사용자가 동시 다른 값을 쓰면 명시적 보장 부재 (공식 docs `[todo]` 상태). Quill Delta semantics 위임. <https://docs.yjs.dev/api/shared-types/y.xmltext> 출처. 이는 **CRDT 이론의 본질적 한계** (key-level convergence). weave 는 last-write-wins 를 명시적으로 박제하고 (M0–M2 협업 정책과 동형), 양쪽 사용자에게 mixed badge 표시 같은 UX 보완.
- [ ] Quantum / cryptographic floor — N/A

---

## 4. Unavoidable trade-offs

| Axis | 텍스트 아이템 v1 lands at | Cost of moving |
|---|---|---|
| **Editor library: 한국어 IME 안정성 ↔ Y.Doc 자유도** | **Lexical 채택 권장** — Meta prod 검증된 IME + 공식 `@lexical/yjs`. 단 single-editor-per-Y.Doc 제약 수용. | Slate 로 가면 multi-root 자유 + Liveblocks 검증된 `@slate-yjs/core` 얻지만 **한국어 IME 미해결 회귀** 위험 (`feedback` 등록 의무). Tiptap 으로 가면 IME + 자유도 둘 다 OK 지만 **번들 100KB+** + StrictMode dispose risk. |
| **Frame-per-Y.Doc vs Single Y.Doc (Lexical 제약)** | weave 의 frame-in-frame 도메인 모델 (`INTERACTIVE_PRESENTATION_SPEC.md` Phase 11) 에서 **각 frame 이 별도 Y.Doc** 으로 분리되거나 **각 텍스트 박스마다 별도 root XmlText**. 후자가 `@agocraft/sync` 의 4-patch variant 와 자연스럽게 합쳐짐. | Lexical 외 후보로 가면 단일 Y.Doc 으로 다 묶을 수 있어 도메인 모델 변경 불필요. 다만 IME 또는 번들 trade. |
| **Bundle size: 기능 ↔ 다운로드** | **Lexical ≈ 40-45 KB gzipped** (core + React + plain-text/rich-text/history/selection 5 plugin). | Slate ≈ 75 KB, Tiptap ≈ 130-150 KB (StarterKit). 모두 weave 의 nuxious INP 영향 미미 (코드 분할 후 lazy). 단 PWA / 모바일 view-only 시 critical. |
| **CRDT semantics: char-level 안전 ↔ 모델 충실도** | **Y.XmlText + format attribute** (패턴 1, research §2.5). char-level concurrent insert/format 자동 안전. styleId 식별성은 사이드 Y.Map 으로 보강 가능. | 패턴 2 (Y.Array sparse) 는 길이 invariant 깨짐 risk → 채택 안 됨. 패턴 3 (snapshot) 은 CRDT 자체 포기 → 채택 안 됨. |
| **Measure 동기성 ↔ font 로딩 정확도** | **모드 전환은 async** (await `document.fonts.ready` → measure → patch). 실시간 wrap 은 mirror DOM + ResizeObserver. font 로드 중 사용자가 모드 전환 시도 시 spinner ≤ 500ms. | 동기 force-measure 는 fallback 폰트로 잘못된 frame 박제 risk. 현재 박제된 우회 없음. |
| **Concurrent format: 정확도 ↔ 단순성** | **last-write-wins per attribute key** (intrinsic limit). 두 사용자가 동시 같은 글자에 다른 색 쓰면 한 쪽만 남음. mixed badge UX 로 보완. | 진짜 정확한 multi-user format conflict 해결은 OT 기반 또는 별도 conflict-list — 6mo+ 추가 빌드. M3+ 별도 WI. |
| **Rich text scope: v1 ↔ v2** | **v1 = bold/italic/color/underline/strikethrough/textCase/letterSpacing per range** (Figma core). v2 = numeric fontWeight / OpenType flags / 리스트 / variable text / 글자별 hyperlink. | spec §10 박제. v1 끝까지 가는데 그 시점에 v2 의 우선순위 재평가. |
| **Migration: 자동 ↔ 손실 허용** | **자동 forward migration** (현재 attrs → v1 schema). lineHeight number → `{value, unit:"multiplier"}`, textAlign → textAlignHorizontal rename, 신규 필드는 default. `onUnknown:"preserve"` 정책 (OS-root engineering principles) 으로 v0 reader 도 안전. | 무손실. 손실 risk 없음. |

---

## 5. Scope-reduction options

verdict 가 FEASIBLE WITH TRADE-OFFS 이라 의무 아님. 단 product 가 명시 수용해야 할 reduction:

- [x] **Narrow input class to**: 데스크탑 Chrome/Edge/Safari latest-2 + 한국어/영문. 모바일 편집 / Firefox / 기타 언어는 v1.x.
- [x] **Lower quality bar to**: 두 사용자가 동시에 같은 글자에 다른 color/decoration 적용 시 **last-write-wins per attribute key + mixed badge** (진짜 multi-user format conflict 해결 X).
- [x] **Restrict modality to**: rich text 의 v1 범위 = bold/italic/color/underline/strikethrough/textCase/letterSpacing per range. 글자별 hyperlink·OpenType·리스트·variable text 는 v2.
- [x] **Defer until**: 모드 전환 시 async (≤ 500ms spinner) — synchronous 모드 전환은 web platform 한계로 deferred indefinitely.
- [x] **Editor 선택의 PoC gate**: 1st choice = Lexical. Slate 로 fallback 시 한국어/일본어 IME e2e (Galaxy/iOS/Mac) PASS 무조건. 미달 시 Lexical 강제 채택.

---

## 6. Verdict

- [ ] FEASIBLE
- [x] **FEASIBLE WITH TRADE-OFFS** — 모든 capability 가 production-proven library + Baseline web platform 으로 도달 가능. 다만 (a) Lexical 의 single-editor-per-Y.Doc 제약을 `@agocraft/sync` 가 frame-per-Y.Doc 또는 multi-root XmlText 로 흡수, (b) font 로딩 중 모드 전환은 async (intrinsic limit), (c) concurrent format = last-write-wins per attribute (Y.XmlText semantics) — 3 trade-off 를 product 가 명시 수용해야 plan 진입 가능.
- [ ] PARTIALLY FEASIBLE
- [ ] NOT FEASIBLE

**Justification**: §2 capability matrix 의 9/9 capability 가 기존 SOTA 라이브러리/web platform 으로 흡수됨. §3 intrinsic limit 2 개 (font-loading 동기성 + Yjs key-level convergence) 가 명시되었지만 둘 다 사용자 인식 가능 UX 보완 (async spinner + mixed badge) 으로 회피 가능. §4 의 7 trade-off 중 가장 큰 cost-mover 는 editor 선택 — Lexical 채택 시 frame 도메인 모델에 single-editor-per-Y.Doc 제약을 흡수해야 함. 이는 `@agocraft/sync` 의 자연스러운 확장 (per-frame Y.Doc 또는 per-textbox root XmlText) 으로 처리 가능하고, WI-028 의 4-patch variant 에 5번째 `item.text` (= Quill Delta) 를 추가하는 형태로 매끈하게 연결됨.

---

## 7. Accepted trade-offs (Product sign-off)

| Trade-off | Accepted by | Date |
|---|---|---|
| 편집기 1순위 = Lexical, fallback = Slate (단 한국어 IME e2e PASS 의무) | hbpark (Discovery owner) | 2026-05-25 |
| `@agocraft/sync` 에 frame-per-Y.Doc 또는 multi-root XmlText 도입 (HANDOFF 의무) | hbpark | 2026-05-25 |
| 모드 전환은 async (≤ 500ms spinner) — font 로딩 중 synchronous 보장 X | hbpark | 2026-05-25 |
| Concurrent format conflict = last-write-wins per attribute key + mixed badge (진짜 OT 형 conflict 해결은 v2+) | hbpark | 2026-05-25 |
| Rich text v1 = bold/italic/color/underline/strikethrough/textCase/letterSpacing per range. 글자별 hyperlink / OpenType / 리스트 / variable text = v2 | hbpark | 2026-05-25 |
| 모바일 편집 미지원 (view-only, FR-001 과 동형) | hbpark | 2026-05-25 |
| 텍스트 1 개당 attrs payload ≤ 5 KB (≤ 1000 char + ≤ 16 styleOverride id) | hbpark | 2026-05-25 |

---

## 8. Pair sign-offs (specialist agents)

| Domain | Specialist | Sign-off | Notes |
|---|---|---|---|
| AI / model | `ai-safety-agent` | N/A | 텍스트 v1 에 AI 미포함. v2 의 변형/요약 AI 기능 시 의무. |
| Web Platform / runtime | `standards-runtime-platform-intelligence-agent` | **✅ APPROVED 2026-05-25** | (a) `-webkit-line-clamp` Baseline Widely Available (Chromium/WebKit/Gecko 모두 1y+ stable, [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/-webkit-line-clamp)), (b) `document.fonts.ready` Baseline Widely Available (CSS Font Loading API, 2017+), (c) `OffscreenCanvas` Widely Available (Chromium 69+, Safari 16.4+, Firefox 105+), (d) Y.XmlText IME composition — Meta facebook/whatsapp/messenger prod 검증 (hbpark manual 2026-05-25 PASS 박제 `experiments/lexical-text-poc/RESULT.md`), (e) `ResizeObserver` Widely Available, (f) `React.lazy + Suspense` Widely Available (React 16.6+). 모든 surface 가 v1 launch target browser (latest-2 Chrome/Edge/Safari) 에서 Baseline. |
| Cloud / scale / cost | `infrastructure-cost-optimization-agent` | N/A | text item 은 storage 측 추가 cost 없음 (attrs ≤ 5 KB). |
| Real-time / SLO | `sre-reliability-agent` | N/A | M0–M2 협업 정책 (FR-001 last-write-wins) 그대로 흡수. |
| Privacy / data | `privacy-data-protection-agent` | N/A | 텍스트 본문 = user content, FR-001 per-tenant 격리 그대로. 별도 처리 없음. |
| **Library / supply chain** | `library-adoption-supply-chain-governance-agent` | **✅ APPROVED 2026-05-25** | (a) Lexical **MIT license** 확인 (research agent §1.1 + npm pack 직접 inspection), (b) `@lexical/react` + `@lexical/selection` + `@lexical/yjs` 모두 MIT + Meta-maintained, (c) Bus factor: Meta — facebook/whatsapp/messenger/instagram 4-prop prod (1B+ DAU 규모), 23.4k stars active community, **MIT 로 fork 자유** (mitigation), 6mo dependency-audit 의무 박제, (d) Tree-shake 3-gate **PASS BEST tier** (모든 4 패키지 ESM + sideEffects:false + reflect-metadata 없음, `experiments/lexical-text-poc/RESULT.md` 박제), (e) Bundle: 59.13 KB gz lazy chunk (편집 모드 진입 시점에만 download — R3 lazy-load 머지). FR-002 의 ≤ 80 KB criterion 충족. Plan B (Slate fallback) 발동 안 됨 (DR-015 Accepted). |
| **Frontend performance** | `frontend-performance-agent` / `rendering-performance-architecture-agent` | **✅ APPROVED 2026-05-25** | (a) **Bundle**: main 272.21 KB gz (Lexical lazy-load 후 정상화) + Lexical 59.13 KB gz lazy chunk (편집 진입 시 only), (b) **초기 LCP/INP 영향 0** (lazy 가 첫 paint 에 무관), (c) **편집 모드 진입 latency**: Lexical chunk import + LexicalComposer mount, Lexical's 자체 reconcile (Meta prod 검증된 60Hz 안정성), (d) **ResizeObserver paint cost**: Phase 18 의 height-only auto-fit 가 minimal (no n/s handle, scrollHeight 한 차원 read), (e) **DR-016 corner-fontSize-scale 제거** 로 corner drag 시 paint cost 더 줄어듬 (fontSize 변경 무, layout/paint 만), (f) Render path 가 unchanged for non-edit 모드 (TextBlock plain `<>{a.text}</>` + textRuns rendering only in edit-init seed). **Formal INP measurement (100 frame × 50 char) 는 M1 운영 시점에 측정 의무** (gate 가 conditional approve — 만약 측정 > 200ms 50% 시 lazy-load 추가 + chunk split + virtualization 추가 검토). |

---

## 9. Downstream gates

- [x] Risk & Governance Review may start. 핵심 risk:
  - editor library bus factor + license + vendor lock (Lexical = Meta 의존도)
  - Slate 채택 시 한국어 IME 회귀 risk
  - Yjs concurrent attribute key-level 의 last-write-wins 가 사용자 데이터 손실로 인식될 risk (UX 보완 필수)
  - 마이그레이션 시 v0 → v1 데이터 손실 risk (자동 forward 가 모든 케이스 cover 하는지 검증)
  - StrictMode 더블 마운트 시 editor singleton dispose 회귀 risk (`feedback_react_strictmode_singleton_dispose` 박제)
- [x] Engineering Plan may start (FEASIBLE WITH TRADE-OFFS, 7 trade-off 사인 박제). **Engineering Plan 박제 2026-05-25** `features/text/ENGINEERING_PLAN.md`. **3 specialist sign-offs APPROVED 2026-05-25** (§8 갱신) — provisional 해소.
- [ ] Discovery 재스코프 불필요.

다음 단계 순서 (사용자 확인 후 진행):
1. **WI-NNN 발행** — `records/work-items/WI-NNN-text-item-figma-equivalent.md`. 이 FR + spec 을 입력.
2. **DR-NNN-editor-pick** — Lexical 1순위 / Slate fallback 의 명시 박제. License + bus factor 첨부.
3. **DR-NNN-text-resize-paradigm** — corner-fontSize-scale 폐기 결정 박제 (`TEXT_ITEM_SPEC.md` §1 의 source).
4. **HANDOFF-NNN to agocraft** — `TextAttrs` v1 확장 + frame-per-Y.Doc 또는 multi-root XmlText 도입 요청.
5. **RISK-NNN-text-item-migration** — 마이그레이션 + IME + LWW + StrictMode + bus factor 5 risk.
6. **Risk Review (skill)** → **Engineering Plan (skill)** → Build.

---

## 10. Links

- Triggering Work Item: **WI-TBD** (이 FR 의 결과로 발행)
- Discovery output: `docs/product/TEXT_ITEM_SPEC.md`
- Related Decision Records: DR-editor-pick (planned), DR-text-resize-paradigm (planned)
- Related Risk reviews: `records/risks/RISK-text-item-migration.md` (planned)
- Related Engineering Plan: `features/<feature>/ENGINEERING_PLAN.md` (planned)
- Related Handoffs: `records/decision-handoffs/HANDOFF-TextAttrs-v1.md` → agocraft (planned)
- 이전 FR: `FR-001-horizontal-multidomain-workspace.md` (M0–M2 협업 정책의 source)
- WI-028 박제: `reference_wi028_sync_phase1.md`, `reference_wi028_sync_phase2to6.md` (`@agocraft/sync` 4-patch variant 의 source)
- Research 입력 (Q1·Q2): research agent 결과 (이 FR 의 §2·§4 인용 출처)

---

## 11. Research 출처 요약 (research agent 인용)

- Lexical: <https://raw.githubusercontent.com/facebook/lexical/main/packages/lexical/package.json>, <https://lexical.dev/docs/react/faq>
- Slate: <https://raw.githubusercontent.com/ianstormtaylor/slate/main/packages/slate/package.json>, IME issues #1701/#5989/#2944
- @slate-yjs/core: <https://github.com/BitPhinix/slate-yjs>, Liveblocks default 채택 사례
- @lexical/yjs single-root 제약: <https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025>
- Y.XmlText API: <https://docs.yjs.dev/api/shared-types/y.xmltext>
- y-prosemirror: <https://github.com/yjs/y-prosemirror>
- 2026 비교 자료: <https://www.pkgpulse.com/guides/tiptap-vs-lexical-vs-slate-vs-quill-rich-text-editor-2026>
- CSS line-clamp Baseline: <https://developer.mozilla.org/en-US/docs/Web/CSS/-webkit-line-clamp>
- CSS Font Loading API (Baseline) — `document.fonts.ready` 의 final-font 게이트로서의 역할
