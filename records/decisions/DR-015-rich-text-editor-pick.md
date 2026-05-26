# Decision Record — DR-015 Rich text editor 선택 (Lexical 1순위 + Slate fallback)

## Metadata

| Field | Value |
|---|---|
| ID | DR-015 |
| Title | weave 텍스트 아이템 v1 의 rich text 편집기 = Lexical 1순위, Slate fallback (한국어 IME e2e gate 통과 시) |
| Decision Level | **2 Cross-Team Consultation** — agocraft 의 `@agocraft/sync` 설계와 결합 (HANDOFF-010 의 F1/F2 결정과 짝) |
| Owner | hbpark |
| Required approvers | hbpark (responsible / accountable) |
| Consulted | `library-adoption-supply-chain-governance-agent` (pending sign-off — license + bus factor + tree-shaking 3-gate), `frontend-performance-agent` (pending — bundle + INP + reconcile cost) |
| Informed | agocraft (HANDOFF-010 응답자) |
| Status | **Accepted** (2026-05-25 hbpark manual IME 검증 정상 — Lexical 1순위 확정. Plan B Slate fallback 발동 안 됨) |
| Decided on | 2026-05-25 |
| Effective from | 2026-05-25 (Build 진입은 HANDOFF-010 응답 + PoC 통과 후) |
| Review-by | 2026-06-15 (Lexical PoC 2 주 + 결과 박제 후) |
| Triggering Work Item | WI-029 |
| Pairs with | agocraft HANDOFF-010 (TextAttrs v1 + `item.text` patch variant), weave FR-002 §4 trade-off #1 |

## Context

weave 텍스트 아이템 v1 이 **Figma 100% paradigm** 으로 재정의되면서 **글자별 sparse style override (rich text)** 가 v1 scope 에 포함되었다 (사용자 결정 2026-05-25, [[project-weave-text-item-v1-decision-2026-05-25]]). 현재의 `<EditableText>` (단일 스타일 contenteditable wrapper) 로는 character-level selection + per-range styling + Yjs 통합이 불가능 — 외부 rich text 편집기 도입이 강제. 이 DR 은 그 편집기의 선택을 박제한다.

핵심 제약 4가지가 결정의 입력:

1. **트리쉐이킹 3-gate** ([[feedback-tree-shaking-first]]) — ESM build, `"sideEffects": false`, reflect-metadata 비의존.
2. **한국어 IME 안정성** — weave 의 primary target 시장이 한국 + 미국. Galaxy Chrome / iOS Safari / Mac Chrome / Mac Safari 4 환경 100자 합성 입력 시 누락·중복 0%.
3. **Yjs 통합 성숙도** — `@agocraft/sync` 가 Y.Doc 기반 (WI-028 박제). 편집기가 Y.XmlText + format attribute 모델 (FR-002 §4 trade-off #4) 과 자연스럽게 연결되어야 함.
4. **React 18 + StrictMode** — weave 의 직전 박제 사례 ([[feedback-react-strictmode-singleton-dispose]]) 에서 dev mode 더블 마운트가 싱글톤 영구 disable 을 야기. editor 인스턴스가 mount → unmount → 재마운트 sequence 에 안전해야 함.

## Options considered

(research 입력 = FR-002 §2 capability + Q1 research agent 출력)

| Option | Bundle (gz) | 트리쉐이킹 3-gate | 한국어 IME | Yjs 통합 | StrictMode | 비용 / Trade-off |
|---|---|---|---|---|---|---|
| **A. Lexical 0.44 + @lexical/react + @lexical/yjs** | 22 KB core / 40-45 KB w/ 5 plugins | **PASS (best)** — dev/prod 분기 ESM map + sideEffects:false + reflect-metadata none | **best** — Meta facebook/whatsapp prod 검증 | **공식** `@lexical/yjs` (Meta 유지, 동버전 sync) | `LexicalComposer` `useMemo` 단일 인스턴스 보장 — 안전 | **single-editor-per-Y.Doc 제약** — agocraft 측 frame-per-Y.Doc 또는 multi-root XmlText 도입 필요 (HANDOFF-010 §2.F) |
| **B. Slate 0.124 + slate-react + @slate-yjs/core** | 75 KB (core + react) | PASS | **회귀 risk** — issues #1701 / #5989 / #2944 (Galaxy/iOS/Mac Hangul). 일부 fix 됨, 재발 패턴 | community + Liveblocks 검증 (default editor) | editor 인스턴스 props 로 받아 안전 | multi-root 자유 (Y.Doc 1개에 N editor) + decoration API 가 sparse override 자연 매핑 |
| **C. Tiptap 3.23 (ProseMirror)** | 130-150 KB (StarterKit) | PASS | best (ProseMirror) | `y-prosemirror` 공식 | `useEditor` hook 더블 마운트 회귀 다수 — [[feedback-react-strictmode-singleton-dispose]] 와 동형 risk | 번들 100KB+, schema 강제 → Figma 모델 매핑 시 schema 작성 부담 |
| **D. Plate (Slate wrapper)** | 200 KB+ (Slate + jotai + zustand + lodash) | PASS | Slate 의 IME risk 그대로 | Slate 의 yjs binding 그대로 | 동일 | jotai/zustand 동시 사용 → SSOT 충돌 가능. 추가 가치 없음 |
| **E. ProseMirror raw** | 75-90 KB | PASS | best | `y-prosemirror` 공식 | safe | Tiptap 대비 이득 없음 — ProseMirror 의 학습 곡선만 부담 |
| **F. contenteditable + 자체 selection 관리** | 0 (직접 구현) | N/A | **모든 IME/CJK 자력 구현** | 직접 Y.XmlText binding | 직접 lifecycle | IME / 접근성 / undo / paste / drag-drop / 다중 cursor 전부 자력 — 견적 6mo+ |
| **Do nothing** | — | — | — | — | — | rich text 자체가 v1 scope 에 없게 되어 spec §1 결정 (사용자 confirm) 위반 |

## Decision

**Option A — Lexical 1순위로 채택, Option B (Slate) 를 fallback** 으로 둔다. 채택은 2-week PoC (§Conditions) 후 다음 분기로 확정:

- PoC PASS → DR Status `Accepted` 로 전환, Lexical 확정.
- PoC FAIL (IME 또는 StrictMode 또는 Yjs 통합 중 하나라도) → Slate fallback. 단 Slate 채택 시 **한국어 IME e2e 4-browser PASS 가 무조건 의무** (별도 PoC e2e gate 추가).
- C/D/E/F 는 채택 안 됨.

## Why this option

1. **IME 안정성이 결정 변수**: 한국어가 1순위 시장. Lexical 은 Meta 의 글로벌 prod (facebook.com / whatsapp.com / messenger.com / instagram.com) 에서 한국어/일본어/중국어 합성 입력 검증을 1B+ DAU 규모로 통과 중 (출처: <https://lexical.dev>). Slate 의 미해결 회귀 (3개 issue, 8년 이상 재발 패턴) 는 weave 의 primary persona 에 직격타.
2. **번들 사이즈가 가장 경제적**: 40-45 KB gz w/ 5 plugins → FR-002 의 acceptance criteria "≤ 60 KB gz" 충족 + 여유 마진.
3. **트리쉐이킹 3-gate 가장 정교**: dev/prod 분기 ESM `exports` map + sideEffects:false + reflect-metadata none. weave 의 build pipeline (`puritycheck`, Rule 6) 과 잡음 없이 결합.
4. **StrictMode 안전**: `LexicalComposer` 의 `useMemo` 단일 인스턴스 보장 — weave 의 직전 박제 사례 ([[feedback-react-strictmode-singleton-dispose]]) 재발 가능성 가장 낮음.
5. **공식 `@lexical/yjs` 동버전 유지**: Meta 가 본체와 함께 maintained. `@slate-yjs/core` 의 npm 발행 정체 (2023-07 이후, GitHub 는 활발이지만 npm publish 없음) 리스크 회피.
6. **trade-off: single-editor-per-Y.Doc 제약**: Lexical 의 `CollaborationPlugin` 은 한 Y.Doc 에서 root XmlText id 를 하드코딩 → 여러 텍스트 박스 = 여러 Y.Doc 또는 여러 root XmlText. 이는 agocraft 측 HANDOFF-010 §2.F 의 F2 옵션 (root XmlText per-textbox) 으로 흡수 — weave 선호 박제, agocraft 응답 대기.

### Specialist consultation status

- `library-adoption-supply-chain-governance-agent` — **pending**. 필요 검증: Lexical = MIT license 확인 (research agent §1.1 = MIT 확인됨), Meta bus factor (단일 vendor risk vs prod 검증 가치), `@lexical/yjs` 의 maintenance commit cadence.
- `frontend-performance-agent` / `rendering-performance-architecture-agent` — **pending**. 필요 검증: 100 frame × 평균 50 char 캔버스에서 INP < 200ms 50%, ResizeObserver-backed mirror DOM 의 paint cost.
- `standards-runtime-platform-intelligence-agent` — N/A (편집기 선택은 library 영역, web platform 은 별도)

### Slate fallback 의 조건 (Plan B)

Lexical PoC 가 FAIL 일 경우만 발동:

- 한국어 IME e2e 4-browser (Galaxy Chrome / iOS Safari / Mac Chrome / Mac Safari) 100% PASS 가 PR-block 게이트로 추가
- multi-root 자유는 보존되므로 HANDOFF-010 §2.F 의 F2 옵션이 자동 OK (F1 도 가능)
- 번들 +30 KB 증가 수용 (75 KB w/ core+react)
- DR-015 supersede 발행, Slate 결정 박제

## Consequences

### 즉시 변화

- **Code / architecture**:
  - `apps/web/src/document/domains/TextBlock.tsx` 의 `<EditableText>` 가 Lexical `<LexicalComposer>` + `<RichTextPlugin>` + `<HistoryPlugin>` + `<CollaborationPlugin>` + `<OnChangePlugin>` 으로 교체.
  - `applyRange` command 가 Lexical 의 `$setSelection` + `$patchStyleText` API 위로 wire.
  - HANDOFF-010 §2.F 의 F2 채택 시: 각 텍스트 아이템에 `ydoc.getXmlText("text:" + itemId)` 로 root XmlText 부여, `<CollaborationPlugin id={itemId}>` 매핑.
- **Process / workflow**:
  - 신규 라이브러리 의존 추가 → `library-adoption-supply-chain-governance-agent` sign-off 박제 (DR-015 이 그 출력).
  - 편집기 lifecycle 은 PoC 결과에 따라 변경 가능 — `experiments/lexical-text-poc/` (또는 worktree) 에서 1-2주 안에 결정.
- **Cost / ops**:
  - 번들 +40-45 KB gz (lazy-loaded, 편집 모드 진입 시 dynamic import). 초기 LCP 영향 없음.
  - Yjs 의 binary update 가 그대로 통과 — 추가 server-side cost 없음 (WI-028 paused 상태 그대로).
- **User experience**:
  - 텍스트 편집 진입 시 ≤ 200ms 의 dynamic import 지연 (한 번만, 이후 cache).
  - 한국어 IME 합성이 native textarea 수준 안정성. 가시적 차이는 거의 없음 — improvement는 동시편집 / per-range 스타일 / 더 정확한 undo.
- **Risk posture (accepted residual risk)**:
  - **Meta 의 OSS 정책 변화 risk**: Lexical 은 Meta 의 OSS. 단일 vendor 의존이지만 (a) MIT license 로 fork 자유, (b) 23.4k stars + 활발 community, (c) PoC 통과 시 의존도 정당화. mitigation: lock file 박제 + 6mo 단위 dependency-audit.
  - **single-editor-per-Y.Doc 제약의 미래 영향**: 텍스트 아이템 수 ≥ 1000 시 root namespace polution 메모리 영향. mitigation: FR-001 의 ≤ 200 Item ceiling 그대로 (`frontend-performance-agent` 측정 검증 의무).

### 마이그레이션

- 기존 `<EditableText>` 사용자는 영향 없음 — 컴포넌트 내부 교체. props API 호환 유지 (text, onCommit, multiline).
- 기존 텍스트 아이템 데이터는 HANDOFF-010 §E 의 v6→v7 마이그레이션으로 자동 forward.

## Conditions / follow-ups

각 항목은 `WORK_ITEM.md` 또는 PoC artifact 가 됨.

- [ ] **PoC: `experiments/lexical-text-poc/`** (1-2주, owner hbpark):
  - Lexical + `@lexical/react` + `@lexical/yjs` + `yjs` 설치, 트리쉐이킹 3-gate 측정 (rollup-plugin-visualizer 또는 vite-plugin-bundle-analyzer)
  - 미니 텍스트 박스 (root XmlText + format attribute) 구현
  - 한국어 IME 4-browser e2e (Galaxy Chrome / iOS Safari / Mac Chrome / Mac Safari, 100자 합성 입력)
  - StrictMode 더블 마운트 → 재마운트 IME 안정성 e2e
  - 동시 편집 시뮬레이션 (2 Y.Doc + provider, applyRange 가 양쪽 동기화)
  - 결과를 `experiments/lexical-text-poc/RESULT.md` 로 박제
- [ ] **DR Status 전환**:
  - PoC PASS → DR-015 Status `Accepted`, 의존 추가 PR 발행
  - PoC FAIL → DR-015 Status `Superseded by DR-NNN-slate-editor-pick` (Slate fallback 박제)
- [ ] **`library-adoption-supply-chain-governance-agent` sign-off**: PoC 결과 + license 확인 + bus factor 분석 박제. PR-block 게이트.
- [ ] **`frontend-performance-agent` sign-off**: 100 frame × 평균 50 char 캔버스 INP 측정 박제. PR-block 게이트.
- [ ] **agocraft HANDOFF-010 응답**: F1 vs F2 옵션 결정. F2 채택 시 weave PoC 도 F2 가정으로 진행.

## Dissent

현 시점 없음. 단 `library-adoption-supply-chain-governance-agent` 가 (예) "Meta 의 단일 vendor risk 가 수용 불가" 라고 사인 거절할 경우 — 그때 dissent 박제 + DR 재논의.

## Links

- Triggering Work Item: WI-029
- Originating Handoff (cross-project): agocraft HANDOFF-010
- Related Risk reviews: RISK-text-item-v1 (planned)
- Related Feasibility Reviews: FR-002 §4 trade-off #1 (이 DR 의 evidence base)
- Product spec: `docs/product/TEXT_ITEM_SPEC.md` §8.1 (open question source)
- Related DRs:
  - DR-001 (agocraft dependency strategy) — Yjs 의존 채택 박제
  - DR-016 (text resize paradigm) — 본 DR 과 같은 WI 의 sibling decision
- Memory: [[project-weave-fr002-text-item-2026-05-25]], [[feedback-tree-shaking-first]], [[feedback-react-strictmode-singleton-dispose]]
- Research 출처: Lexical FAQ <https://lexical.dev/docs/react/faq>, Liveblocks 2025 비교 <https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025>, Slate IME issues <https://github.com/ianstormtaylor/slate/issues/1701>
- Superseded DRs: —
