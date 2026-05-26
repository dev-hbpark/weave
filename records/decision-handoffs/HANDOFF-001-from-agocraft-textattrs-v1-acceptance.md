# HANDOFF-001 (FROM agocraft) — TextAttrs v1 + `item.text` patch variant 수용 응답

## Metadata

| Field | Value |
|---|---|
| ID | HANDOFF-001 (weave 의 첫 inbox entry) |
| Direction | agocraft (sister) → **weave (this project)** |
| Sender | agocraft (sister service project, `workspace/agocraft/`) |
| Target | weave (this project) |
| Date sent | 2026-05-25 |
| Severity | P1 (weave 의 P1 HANDOFF-010 응답) |
| Status | **Accepted with phased delivery** — Phase 1 only depends on no other handoff; Phase 2 depends on HANDOFF-007 (Patch variant 확장) + HANDOFF-008 (stable error codes) |
| Originating request | agocraft `records/decision-handoffs/HANDOFF-010-text-attrs-v1-and-item-text-patch.md` (received 2026-05-25) |
| Related agocraft WI | WI-016 (created in same session, links back) |

---

## 1. 수용 / 거절 요약

HANDOFF-010 의 7 요청 항목 (A~G) 모두 수용. **단 2-phase 분할 전달**:

| 항목 | Phase | 결정 | 비고 |
|---|---|---|---|
| **A. TextAttrs v1 schema 확장** | **1** | ✅ 수용 | HANDOFF-007 의존 없음. 즉시 시작 가능. ETA 2026-06-01. |
| **B. 9번째 patch variant `item.text` (Quill Delta)** | **2** | ✅ 수용, but **delayed** | HANDOFF-007 (Patch variant 확장 fundamentals) 가 5 신규 variant 의 `invertPatch` + `ChangeStream` + serializer 마이그레이션 template 을 정의. 010 이 그 template 위에 9번째 variant 추가. → 007 완료 후 010 Phase 2. |
| **C. `@agocraft/sync` 의 Y.XmlText 통합** | **2** | ✅ 수용, but **delayed** | B 의존. 그러나 Y.XmlText 자체는 `@agocraft/sync` 가 처음 도입 (현재 Y.Map / Y.Array 만). 별도 unit + e2e 필요. |
| **D. Mutation rule 박제** | **1** | ✅ 수용 | TextAttrs schema 와 함께 박제. textRuns 는 `item.text` 경유 의무, 그 외 root style 은 `item.attrs` 그대로. |
| **E. Schema 마이그레이션 v6→v7** | **1** | ✅ 수용 | Phase 1 의 schema 와 함께 마이그레이션 코드. 단 현재 agocraft serializer 의 schemaVersion 이 명시값 없음 — 본 작업이 v0 → v7 (또는 latest 기준) 의 명시화도 함께. |
| **F. F1 vs F2 (Lexical 제약 흡수)** | **decision** | ✅ **F2 채택** (weave 선호 수용) | §2 결정 박제 |
| **G. 테스트 5종** | Phase 별 split | ✅ 수용 | text-attrs.spec (P1), patch.spec (P2), y-xmltext-bridge.spec (P2), concurrent-format.spec (P2), seed-idempotency.spec (P2) |

---

## 2. F1 vs F2 결정 (Lexical 제약 흡수)

**채택: F2 — root XmlText per-textbox**.

```
ydoc.getXmlText("text:" + itemId)   // 각 텍스트 박스가 자체 root XmlText
```

근거:
- weave 측 선호 (HANDOFF-010 §2.F)
- 기존 `@agocraft/sync` 의 single-Y.Doc-per-document 구조 유지 — WI-028 Phase 1-6 의 4-patch variant 매핑 영향 최소
- frame 모델 변경 없음 (frame-in-frame 구조 보존)
- Lexical `CollaborationPlugin` 의 `id` 매개변수 = textbox id 로 그대로 wire
- 단점 (Y.Doc namespace 가 textbox 수 만큼 늘어남) 은 FR-001 의 ≤ 200 Item ceiling 내 영향 미미. `frontend-performance-agent` 의 ≤ 1000 textbox 메모리 측정 의무 (별도 task).

F1 (per-frame Y.Doc) 거절 사유:
- cross-frame patch (item.move 등) 의 복잡도 ↑
- 현재 `@agocraft/sync` 구조 (single Y.Doc) 와 충돌
- WI-028 Phase 6 의 IndexedDB / Vercel API 매핑 재작성 필요

---

## 3. Phase 1 — TextAttrs v1 schema (HANDOFF-007 의존 없음, 즉시 시작)

### 3.1 Scope

- **TextAttrs v1 schema** — HANDOFF-010 §2.A 의 모든 신규 필드 + 기존 필드 정정 (`textAlign` → `textAlignHorizontal`, `lineHeight: number` → `lineHeight: LineHeightSpec`).
- **신규 helper types** — `TextAutoResize`, `TextTruncation`, `LineHeightSpec`, `PartialTextStyle`, `TextRun`, `TextDecoration`, `TextCase`, `TextAlignHorizontal`, `TextAlignVertical` (HANDOFF-010 §2.A 의 enum 전부).
- **Factory + helper** — `defaultTextAttrs(frame, text?)` 갱신 (기존 함수 시그니처 호환 유지, 새 필드 default 추가). 신규 `createTextAttrs(input?: Partial<TextAttrs>): TextAttrs` factory 및 `getPlainText(attrs: TextAttrs): string` helper export.
- **`packages/core/src/schema/builtin-kinds.ts`** — TextAttrs 정의 위치 (line 178-203 현재). HANDOFF-010 §2.A 가 `packages/core/src/types.ts` 라 적은 부분은 **정정**: 실제 위치는 builtin-kinds.ts.
- **`packages/core/src/index.ts`** — 신규 type / helper 들 export 추가.
- **Mutation rule 박제** — 새 helper `mutateTextRuns(currentAttrs, newRuns): TextAttrs` 가 textRuns 만 교체하는 stable API. weave 측 `weave.text.applyRange` 가 Phase 2 의 `item.text` patch 없이도 Phase 1 시점에 generic `item.attrs` patch 로 동작 가능 (textRuns 통째 교체). collaboration OFF 시 OK.
- **Migration v6→v7 (schemaVersion 명시화 포함)**:
  - 현재 agocraft serializer schemaVersion 명시값 없음 → 본 작업이 첫 명시 (v1 또는 latest 기준)
  - 마이그레이션 함수: `text: string` → `textRuns: [{insert: text}]`, `textAlign: "justify"` → `textAlignHorizontal: "JUSTIFIED"` (uppercase 통일), `lineHeight: 1.4` → `lineHeight: {value: 1.4, unit: "multiplier"}`, 신규 필드 default 부여, `text` 필드 제거
  - `onUnknown: "preserve"` 정책 그대로
  - vitest spec `text-attrs-migration.spec.ts` (round-trip 100+ fixture)

### 3.2 ETA

**2026-06-01** (5 영업일). HANDOFF-007/008 의존 없음 — 즉시 시작 가능.

### 3.3 weave 측 Phase 1 부분 unblock

Phase 1 완료 후 weave 가 다음을 build 진입 가능:

- TextAttrs v1 schema 의 모든 신규 필드를 사용한 PropertiesPanel UI (3-mode 토글, vertical-align, decoration, case, paragraph-spacing 등)
- 단일 사용자 rich text 편집 (Lexical PoC + 글자별 sparse override) — generic `item.attrs` patch 로 textRuns 통째 교체 (collaboration OFF 인 v1 launch 시점에서 OK)
- 모드 전환 + frame 재계산
- Overflow truncate + maxLines
- 마이그레이션 (v6 → v7)

여기까지가 v1 의 80% scope. **rich text + collaborative editing 동시 = Phase 2 완료 후**.

---

## 4. Phase 2 — `item.text` patch + Y.XmlText 통합 (HANDOFF-007/008 의존)

### 4.1 의존 순서

```
HANDOFF-008 (stable error codes, npm publish 블로커)
   ↓
HANDOFF-007 (Patch variant 5 신규 + Document.attrs + invertPatch + serializer migration template)
   ↓
HANDOFF-010 Phase 2 (item.text variant 추가, Y.XmlText 통합)
```

### 4.2 Scope

- **`packages/core/src/command/patch.ts`** 의 `Patch` union 에 `item.text` variant 추가 (HANDOFF-010 §2.B). HANDOFF-007 의 5 variant 가 먼저 머지된 후 그 template 위에 추가.
- **`packages/sync/src/ydoc-bridge.ts`** 가 Y.XmlText 를 yitems 의 attrs.textRuns 와 매핑. applyPatchToYDoc 의 `item.text` case + deriveDocumentFromYDoc 의 toDelta() 매핑 + seedYDocFromDocument 의 멱등 초기화 ([[feedback-yjs-bridge-subtle-invariants]] 회귀 방지).
- **5 patch variant 의 5 spec** (HANDOFF-010 §G): text-attrs, patch invert, y-xmltext-bridge, concurrent-format LWW, seed-idempotency. Phase 1 의 text-attrs.spec 은 schema 검증, Phase 2 의 spec 들은 sync semantics.

### 4.3 ETA

**HANDOFF-007 완료 + 5 영업일** = HANDOFF-007 SLA 2026-06-01 + 5 영업일 = **2026-06-08** (Phase 2 완료).

기존 HANDOFF-010 SLA (2026-06-08) 와 일치 — 단 Phase 1 은 그 전에 (~2026-06-01) 가능.

---

## 5. agocraft 측 WI 발행

본 응답에 따라 agocraft 측에서 다음 WI 박제:

**`workspace/agocraft/records/work-items/WI-016-textattrs-v1-and-item-text-patch.md`**

- Phase 1 / Phase 2 의 작업 분할 그대로 박제
- HANDOFF-007/008 의 dependency 명시
- weave HANDOFF-010 의 acceptance criteria 와 1:1 매핑
- Continuous Self-Verification (agocraft 의 step 7) 준수: 모든 schema / serializer 변경은 vitest round-trip + e2e 가 마지막에 GREEN

---

## 6. weave 측 응답 후속 작업

weave 가 본 응답을 받은 후:

- [x] HANDOFF-001 응답 수령 박제 (이 문서가 weave inbox 에 도착)
- [ ] WI-029 의 Status 갱신 — Phase 1 완료 시점에 `Blocked → In Progress` 부분 전환
- [ ] WI-029 의 Engineering Plan 작성 시 Phase 1 vs Phase 2 의 build 진입 시점 명시
- [ ] Lexical PoC (실행 중) — Phase 1/2 와 독립적 진행
- [ ] (Phase 1 완료 후) weave 측 PropertiesPanel + modes + textRuns 통째-교체 commands 구현
- [ ] (Phase 2 완료 후) weave 측 `weave.text.applyRange` command 를 `item.text` patch 로 wire 교체 + e2e 의 concurrent-format LWW spec 추가

---

## 7. 위험 / Trade-off (응답 측 박제)

### 7.1 Phase 1 단독 build 진입 시 collaboration 손실 risk

Phase 1 의 textRuns 통째-교체 (`item.attrs` patch) 는 single-user 시점에 OK 지만, collaboration 시 last-write-wins on 전체 textRuns — char-level CRDT 가 아님. 즉 **두 사용자가 동시 텍스트 입력 시 한 쪽이 통째 손실 가능**.

mitigation:
- v1 launch 시점에 `SYNC_ENABLED = false` ([[project-wi028-paused-2026-05-25]] 박제) — collaboration OFF 라 risk manifest 안 함
- Phase 2 의 `item.text` + Y.XmlText 가 머지되기 전까지 collaboration enable 금지 (gate)

### 7.2 builtin-kinds.ts:178 의 TextAttrs 변경이 downstream 깨뜨릴 risk

현재 TextAttrs 를 직접 import 하는 곳들:
- `packages/core/src/index.ts` (re-export)
- weave `apps/web/src/document/types.ts:191` (re-import)
- weave `apps/web/src/document/seed.ts:179-193` (default 값 사용)
- agocraft 의 renderer-html-canvas / renderer-canvas2d / domain-canvas-design 의 텍스트 렌더링 코드
- 그 외 e2e / unit spec

Phase 1 의 TextAttrs 변경 시 위 모두 type error. 해결:
- 기존 `text: string` 필드를 **deprecated 로 한 phase 유지** (textRuns 와 공존) — 호환성 보존
- 또는 `defaultTextAttrs` 만 갱신해서 호출 측 자동 마이그
- 또는 한 번에 모든 import 사이트 갱신

권장: **한 번에 모든 import 사이트 갱신 + 한 PR** (cross-project boundary 의 lift 된 정책 활용). weave 측 동시 수정.

### 7.3 HANDOFF-007/008 정체 시 Phase 2 지연

HANDOFF-008 (3 영업일 SLA, 2026-05-28) → HANDOFF-007 (5 영업일, 2026-06-01) → HANDOFF-010 Phase 2 (5 영업일, 2026-06-08). 008 정체 시 010 전체 지연.

mitigation:
- 008 의 우선순위 = npm publish 블로커 = 더 P1. 008 부터 시작.
- 007 의 invertPatch + ChangeStream + migration template 이 010 의 reference — 둘 다 같은 person owner 라 동시 작업 가능. 단 attention split 부담.

---

## 8. 변경 이력

- 2026-05-25 — agocraft 측 response 발행. Phase 1 / Phase 2 분할, F2 결정 박제.

## 9. Links

- 원천 요청: agocraft `records/decision-handoffs/HANDOFF-010-text-attrs-v1-and-item-text-patch.md`
- agocraft WI: `workspace/agocraft/records/work-items/WI-016-textattrs-v1-and-item-text-patch.md`
- weave WI: `records/work-items/WI-029-text-item-figma-equivalent.md`
- weave FR: `records/feasibility-reviews/FR-002-text-item-figma-equivalent.md`
- weave RISK: `records/risks/RISK-001-text-item-v1.md`
- weave DR: `records/decisions/DR-015-rich-text-editor-pick.md`, `DR-016-text-resize-paradigm.md`
- agocraft 현재 TextAttrs: `packages/core/src/schema/builtin-kinds.ts:178-203`
- agocraft 현재 defaultTextAttrs: `packages/core/src/schema/builtin-kinds.ts:274-289`
- 의존 HANDOFF: agocraft HANDOFF-007 (patch variant), HANDOFF-008 (error codes)
