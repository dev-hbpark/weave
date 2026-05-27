# Work Item — WI-041

## Metadata

| Field | Value |
|---|---|
| ID | WI-041 |
| Title | Clipboard — copy / cut / paste (4 target × in-app + cross-tab, split with agocraft WI-018) |
| Owner | hbpark |
| Status | FR/RISK/DR drafted, Engineering Plan in draft — agocraft HANDOFF-014/015/016 blocking |
| Severity | P1 (v1 launch missing-feature, 사용자 명시 요청 2026-05-27) |
| Created | 2026-05-27 |
| Target date | LG-001 (2026-06-08) 이전 P0~P3 (single-item) 필수. P4 (frame deep) / P5 (rich-text) / P6 (style-only) 는 LG-001 condition (Phase 우선순위 협의) — 최소 P0~P3 land 시 LG-001 가능 |
| Closed | — |
| Related | FR-008, DR-019, RISK-008, LG-001 (text v1 launch gate), WI-036 (multi-select), WI-040 (mode gate — paste 시 mode 가드 필요), HANDOFF-014/015/016 (agocraft 측), agocraft WI-018 |

## Summary

복사 / 자르기 / 붙여넣기를 4 target 으로 지원:

1. **Items** — frame 내부의 일반 Item(s) 다중 선택을 한 patch 로 copy/paste.
2. **Frame** — frame 한 개를 descendants 까지 통째로 deep-copy / cross-design paste.
3. **Rich text (Lexical 안)** — system clipboard + Lexical 내장 paste 위임 (별 layer).
4. **Properties-only (style paste)** — Figma 식 "Paste properties only" — Cmd+Opt+V → Paste Special dialog.

작동 범위:

- 같은 탭 내 in-app clipboard (in-memory).
- **같은 origin 의 다른 탭** 까지 BroadcastChannel + localStorage fallback (D4).
- system clipboard 는 text/plain fallback 만 동시 write (외부 앱 → weave paste 는 v1 거부, Paste Special 로 분리).

agocraft 측 의존 (split):

- subtree serializer (`serializeItemSubtree` / `deserializeItemSubtree`).
- 신규 patch variant `item.create` (subtree-aware, invertPatch 자동 reverse) — CURRENT_SCHEMA_VERSION 9→10.
- `remapIds` helper (Item/Unit/Relations topology).

위 3 건 모두 HANDOFF-014/015/016 으로 발행 — weave 측 P3+ Build 는 vendor refresh 후에만 가능.

## Background — 4 결정 요약 (DR-019 박제)

| # | 결정 | 내용 |
|---|---|---|
| D1 | Split | agocraft (payload schema + patch + serialize) + weave (UX wire). agocraft 가 도메인 중립 reusable foundation. |
| D2 | item.create variant | subtree 전체(attrs/units/children) 를 한 patch 로 삽입. invertPatch 자동 reverse, history 단일 transaction, CRDT bridge 의 명확한 텔러스. |
| D3 | ID 재발급 | Paste 시 모든 ItemId/UnitId 재발급 + Relations topology 재매핑 (idMap). 원본 ID 유지는 금지 (collision 위험). |
| D4 | BroadcastChannel | `weave.clipboard.v1` BroadcastChannel + localStorage fallback (private mode). system clipboard 는 text/plain 보조 write 만. |
| D5 | Paste 좌표 | 마우스 커서 위치 (frame 좌표계) 우선. 키보드 paste 시 selection center + 8px offset. |
| D6 | Paste Special UI | Cmd+Opt+V → Paste Special dialog (Figma 일치). DS Triage Step 3 Grew 가능성 (radio-with-description). DR-design-017 발행 의무. |
| D7 | Lexical 위임 | focused element 가 contenteditable 안이면 system clipboard + Lexical 핸들러로 위임. 외부면 우리 핸들러. IME 조합 중 손실 방지 의무. |

## Scope

### Phase 0 — 박제 (이 WI 와 함께 land)

**In scope**:

- WI-041 (이 문서), FR-008, DR-019, RISK-008, Engineering Plan (features/clipboard/ENGINEERING_PLAN.md), HANDOFF-014/015/016.
- agocraft WI-018 + FR-007 (별도 박제).

**Out of scope (P0)**: 코드 변경 0.

### Phase 1 — agocraft foundation (HANDOFF-014/015/016 land, **agocraft 책임**)

- HANDOFF-014 — `serializeItemSubtree(item, opts)` / `deserializeItemSubtree(json, idGen)` helper export.
- HANDOFF-015 — `item.create` patch variant + invertPatch + Yjs bridge 처리 + CURRENT_SCHEMA_VERSION 9→10.
- HANDOFF-016 — `remapIds(subtree, idGen, relMap)` helper (ItemId/UnitId/Relations topology).
- 의존: agocraft `@agocraft/core` major rc 갱신 + vendor publish.

### Phase 2 — weave UX skeleton (병행 가능, no-op stub)

**In scope**:

- 신규 commands in `apps/web/src/document/tooltip/editor-hotkeys.ts`:
  - `weave.clipboard.copy` (Cmd+C)
  - `weave.clipboard.cut` (Cmd+X)
  - `weave.clipboard.paste` (Cmd+V) — stub: console.warn until P3.
  - `weave.clipboard.pasteSpecial` (Cmd+Opt+V) — stub: dialog open only.
- `enabledWhen`: `hasSelection && mode === "idle" && !isTextEditing` (Rule 6 — useEditAffordancesAllowed 와 합성).
- ContextMenu 항목 wire (Copy / Cut / Paste / Paste Special...) — Lucide icons (Copy / Scissors / ClipboardPaste).
- DS Triage walk for Paste Special dialog:
  - **Step 1 Reused**: Dialog primitive.
  - **Step 2 Extended or Step 3 Grew**: radio-with-description list — 기존 design-system 의 RadioGroup 확인 후 분기. Grew 시 DR-design-017 발행.
- 모든 mutation 은 `editor.exec(...)` 경유 (CLAUDE.md Document mutation rule).

**Out of scope (P2)**: 실제 paste 동작.

### Phase 3 — Items copy/cut/paste (single-tab, in-memory, **단일 item 우선**)

**In scope**:

- `apps/web/src/document/clipboard/clipboard-store.ts` — in-memory clipboard (singleton, StrictMode safe — `useEffect` cleanup 에서 dispose 금지, `feedback_react_strictmode_singleton_dispose` 직접 박제).
- `weave.clipboard.copy` 동작: selected Item(s) 를 agocraft `serializeItemSubtree` 로 직렬화 → clipboard payload 작성.
- `weave.clipboard.cut` = copy + `editor.exec("weave.item.remove", {...})` — 단일 transaction 으로 묶기 (transactionId 공유).
- `weave.clipboard.paste` 동작: clipboard payload 로드 → `remapIds(...)` → `editor.exec("weave.item.create", { subtree, parentId, position })` — 단일 patch.
- Paste 좌표 (D5): pointer 의 마지막 frame-coord 추적 (useHoverContext + useEditPointer) → 키보드 paste 시 fallback 으로 selection center + 8px offset.
- History 단일 transaction 검증 — Cmd+Z 가 한 번에 paste 전체 reverse.
- e2e (`apps/web/e2e/clipboard-items.spec.ts`):
  1. shape 한 개 Cmd+C → Cmd+V → 위치 +8px offset, ID 재발급 확인.
  2. text 한 개 Cmd+X → frame 내에서 사라짐 → Cmd+V → 복귀, 단일 Cmd+Z 로 cut+paste 둘 다 reverse.
  3. shape Cmd+C → ContextMenu Paste → mouse 위치에 paste.
  4. shape Cmd+C → 다른 frame click → Cmd+V → 새 parent 안에 paste.
  5. (다중 선택은 WI-036 land 후 활성화) — 현재 단일만.

**Out of scope (P3)**: frame deep copy, cross-tab, properties-only, rich text 위임.

### Phase 4 — Frame deep copy + cross-tab BroadcastChannel

**In scope**:

- `weave.clipboard.copy` 가 selected target 이 frame 이면 children 까지 deep serialize.
- `MAX_PASTE_NODES` 게이트 (기본 500) — 초과 시 toast 로 거부.
- BroadcastChannel `weave.clipboard.v1` — copy 시 publish, paste 시 가장 최근 entry 우선.
- localStorage fallback (private mode 검출: `try { new BroadcastChannel(...) } catch`).
- payload schema version mismatch 시 silent drop + telemetry hook (toast 없음 — silent 정상).
- e2e (`apps/web/e2e/clipboard-frame-crosstab.spec.ts`):
  1. 두 탭에서 같은 doc open → 탭 A 에서 frame copy → 탭 B 에서 paste → 새 frame 추가.
  2. 한 탭에서 frame deep copy (children 5개) → paste → children 5개 모두 새 ID.
  3. MAX_PASTE_NODES 초과 frame → copy 시 거부 toast.

**Out of scope (P4)**: external app paste, web custom format.

### Phase 5 — Rich text (Lexical) 위임 (D7)

**In scope**:

- `LexicalTextEditor.tsx` 에 `CopyPastePlugin` 추가:
  - focused element 가 contenteditable 안일 때 우리 `weave.clipboard.*` command 의 enabledWhen 이 false 가 되도록 mode gate 추가 (`isTextEditing`).
  - Lexical 의 RichTextPlugin 기본 paste 가 그대로 동작.
- 한글 IME 조합 중 Cmd+C 시 텍스트 손실 회귀 방지 — `composition*` event 동안 우리 핸들러 비활성.
- e2e (`apps/web/e2e/clipboard-rich-text.spec.ts`):
  1. text 진입 → 단어 선택 → Cmd+C → focus 해제 → Cmd+V → 새 text 추가 아님, 기존 text 안에 paste 도 아님 (clipboard 가 비어있음 = 우리 store 미터치 확인).
  2. text 진입 → 한글 조합 중 Cmd+C → 조합 완료 후에만 system clipboard 동작 확인.
  3. text → Cmd+B 강조 후 Cmd+C → Cmd+V → 강조 유지 (Lexical 내장 paste).

### Phase 6 — Properties-only (style paste, Cmd+Opt+V)

**In scope**:

- payload kind `weave/clipboard.style.v1` — 별도 stack (items stack 과 공존).
- Cmd+Opt+V → Paste Special dialog (P2 의 stub 활성화).
- Dialog radio: "Everything (default)" / "Style only" / "Text only" / "Size only" / "Position only".
- "Style only" paste: target Item 의 attrs 중 visual style 키만 patch (color/border/shadow/textStyle 등 — kind 별 whitelist).
- e2e (`apps/web/e2e/clipboard-paste-special.spec.ts`):
  1. shape A color/border 변경 → Cmd+C → shape B 선택 → Cmd+Opt+V → "Style only" → B 의 size/position 유지, color/border 만 적용.
  2. text A textRuns 변경 → Cmd+Opt+V → "Text only" → B 의 text 만 교체.

### Phase 7 — LG-002 launch gate + AGENT_EVALUATION

- LG-002 발행 (clipboard 단독 launch gate). LG-001 의 conditional close 가 우선이면 LG-001 안에 P3 까지만 포함하고 P4~P6 는 LG-002.
- AGENT_EVALUATION — 이 WI 가 도메인 specialist (`clipboard-specialist`) 출현을 trigger 하는지 evidence 확인 (`/bootstrap-domain --refresh`).

## Acceptance

- [ ] Phase 0 박제 7건 land.
- [ ] HANDOFF-014/015/016 agocraft 측 land + vendor refresh.
- [ ] P2 commands + ContextMenu + Paste Special dialog (stub) — `pnpm verify` (typecheck + declarativecheck + puritycheck + tests + build) PASS.
- [ ] P3 single-item Cmd+C / X / V + e2e 5건 PASS. 단일 Cmd+Z 로 paste reverse.
- [ ] P4 cross-tab e2e 3건 PASS. MAX_PASTE_NODES 게이트 작동.
- [ ] P5 rich text 위임 e2e 3건 PASS. IME 한글 조합 시 silent.
- [ ] P6 Paste Special 5종 radio + e2e 2건 PASS.
- [ ] P7 LG-002 (또는 LG-001 conditional close).

## Anti-scope (이 WI 가 다루지 않는 것)

- 외부 앱 → weave paste (image PNG, text from web). v1.1 이후 web custom format Baseline 확보 시점.
- 다중 선택 copy/paste — WI-036 land 시 활성화 (commands 의 selection adapter 만 확장).
- Cross-design paste (다른 doc 사이) — Phase 4 의 cross-tab 으로 자동 cover. Cross-account 는 v1.x 이후.
- 실시간 collaborative clipboard (다른 사용자의 clipboard 공유) — out of scope, CRDT 재개 (WI-028) 이후.

## Links

- FR-008 — Feasibility verdict.
- DR-019 — D1~D7 결정.
- RISK-008 — risk + condition.
- features/clipboard/ENGINEERING_PLAN.md — Build plan + SOLID+GRASP.
- workspace/agocraft/records/decision-handoffs/HANDOFF-014/015/016 — cross-project requests.
- workspace/agocraft/records/work-items/WI-018 — agocraft 측 work item.
- LG-001 — text v1 launch gate (P3 까지 포함 시 close 가능).
- WI-040 — mode gate hardening (paste 의 enabledWhen 가 useEditAffordancesAllowed 합성에 의존).
