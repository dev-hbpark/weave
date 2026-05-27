# DR-019 — Clipboard paradigm (D1~D7)

## Metadata

| Field | Value |
|---|---|
| ID | DR-019 |
| WI | WI-041 |
| Date | 2026-05-27 |
| Owner | hbpark |
| Status | **Accepted** (사용자 권장안 채택, 2026-05-27 세션) |
| Supersedes | — |
| Related | FR-008, RISK-008, agocraft DR (TBD) — D2/D3 의존 |

## Context

복사 / 자르기 / 붙여넣기를 4 target × 같은 origin cross-tab 으로 만들기로 결정한 시점 (WI-041). 7 가지 결정점이 명확히 분리되어 각각 trade-off 가 다름. 본 DR 은 7 결정 (D1~D7) 을 한 문서에 정리.

## D1 — split (agocraft + weave) vs weave-only vs agocraft-only

### Options

| Option | 평가 |
|---|---|
| (A) **split** (agocraft = payload schema + patch + serialize, weave = UX wire) | agocraft 의 도메인 중립 reusable foundation 활용. payload schema 가 모든 agocraft 의존 product (현재 weave, 미래 다른 product) 에서 재사용 가능. |
| (B) weave-only | UX 빠름. 단: clipboard 가 weave 의 패치 모델을 우회 → agocraft 의 schema 보호 (`onUnknown: preserve`) 우회. cross-product 재사용 불가. |
| (C) agocraft-only | clipboard 가 UI / ContextMenu / hotkey 까지 다 떠안음 → 도메인 중립 위반 (host UI 종속). |

### Decision

**(A) split.** agocraft 가 `serializeItemSubtree` + `item.create` patch + `remapIds` 의 3 primitive 를 제공, weave 가 store + UX + cross-tab wire + Lexical 위임 분기.

### Rationale

- agocraft 는 platform-tier framework-free core — clipboard payload 는 정확히 그 layer 의 책임 (Document subtree 의 손실 없는 직렬화 + 무결성).
- weave 는 UX layer — Cmd+C/X/V hotkey, ContextMenu, BroadcastChannel, Paste Special dialog 의 UX 결정.
- 직접 박제: feedback `shared_utilities_to_agocraft` — cross-service reuse / platform-tier / framework-free / 표준 패턴 신호 ≥ 3 시 service-local 만들지 말고 agocraft 새 모듈 의무.

### Consequences

- agocraft major rc 갱신 1건 추가 (CURRENT_SCHEMA_VERSION 9→10).
- vendor refresh 1 round 필요 (P3 시작 전).
- HANDOFF-014/015/016 정식 channel.

---

## D2 — Item 구조 삽입 patch

### Options

| Option | 평가 |
|---|---|
| (A) **신규 variant `item.create` (subtree-aware)** | subtree 전체(attrs/units/children) 를 한 patch 로 삽입. invertPatch 자동 reverse, history 단일 transaction, CRDT bridge 의 명확한 텔러스 1개. CURRENT_SCHEMA_VERSION 9→10. |
| (B) `item.children` + `item.attrs` × N 조립 | 신규 variant 없이 기존 조합. paste 1 건이 N+1 patch 로 폭주, history granularity 깨짐 (Cmd+Z 가 부분 reverse), 원자성 없음, CRDT 재개 시 bridge 복잡도 증가. |
| (C) Hybrid — `item.children.added` 의 ItemId union (full SerializedItem 허용) | 기존 variant 확장. 단: 기존 코드/CRDT bridge 모두 union narrowing 필요, type safety 소폭 손실, 명시성 하락. |

### Decision

**(A) 신규 variant `item.create` (subtree-aware).**

### Rationale

- T6 (history 단일 transaction 보장) 의 본질 — Cmd+Z 가 paste 전체를 한 번에 reverse 해야 함. (B) 는 user trust 손상.
- invertPatch 가 단일 variant 의 deterministic reverse (`item.create` ↔ `item.remove`) — symmetric.
- CRDT bridge 에 1개의 명확한 텔러스 → variant union narrowing 부담 없음.
- agocraft 의 schema versioning (9→10) 은 이미 정착된 패턴 (Phase 1.5 additive migration 시리즈로 박제).

### Consequences

- HANDOFF-015 (agocraft) — 신규 variant + invertPatch + Yjs bridge 의무.
- weave 의 `weave.item.create` command 의 input shape 가 subtree 전체를 받는 형태로 확장 (기존 `item.create` 는 단일 Item 만 받음 → variant 확장 필요).
- 기존 production 데이터 호환: 신규 variant 는 additive — 기존 patch 모두 그대로 동작.

---

## D3 — Paste 시 ID 정책

### Options

| Option | 평가 |
|---|---|
| (A) **모든 ItemId/UnitId 재발급 + Relations topology 재매핑** | UUID v7 재발급 → 같은 doc 안 collision 0. Relations 의 topology (master/followers/members/source/targets) 가 idMap 으로 자동 갱신. |
| (B) 원본 ID 유지 (cross-doc 일 때만 재발급) | 같은 doc paste 시 collision → `RELATION_DUPLICATE_ID` exception 가능. user-facing crash. |
| (C) 옵션 (사용자가 선택) | UX 복잡도 증가 — Figma 도 안 함. |

### Decision

**(A) 항상 재발급.** 같은 doc, cross-tab, future cross-doc 모두 동일 정책.

### Rationale

- agocraft 의 UUID v7 는 78-bit entropy — 재발급 cost 무시 가능.
- Relations topology 재매핑이 정확하면 functional 변화 0 (Master/Follower, Hotspot 모두 정상).
- collision 회피의 단일 진실 — branch 없는 단순 정책.

### Consequences

- HANDOFF-016 (agocraft) — `remapIds(subtree, idGen, relMap) → { subtree, idMap, relations }` helper 의무.
- weave 의 paste 시 invoke 순서: `deserialize` → `remapIds` → `editor.exec("weave.item.create", { subtree, parentId, position })`.

---

## D4 — Cross-tab 채널

### Options

| Option | 평가 |
|---|---|
| (A) **BroadcastChannel + localStorage fallback** | 같은 origin 탭 최우선. payload 크기 제한 없음, structured clone, Safari 15.4+ Baseline. system clipboard 는 text/plain 보조만. v1 외부 앱 paste 거부. |
| (B) 시스템 클립보드만 (web custom format) | 외부 앱 paste 가능성. 단: web custom format Baseline limited (Safari 17.4+), focus/gesture 권한 까다로움, payload size 제한. |
| (C) BroadcastChannel 만 | 외부 앱 → weave text paste 가 안 됨 (이름/레이블 같은 텍스트 copy 시 외부에서 사용 불가). |

### Decision

**(A) BroadcastChannel + localStorage fallback.** system clipboard 에 `text/plain` 만 보조 write (label/text content 추출). External app → weave paste 는 v1 거부 (Paste Special 별도 진입점 미래 검토).

### Rationale

- T3 (external app paste 거부) 의 trade-off 수용 — Figma/Notion 도 v1 에서 같은 선택.
- Baseline 안전성 — Safari 15.4+ widely available 이미 사용자 base cover.
- BroadcastChannel 의 structured clone 이 우리 payload schema 와 자연스럽게 정합 (JSON serializable).

### Consequences

- payload 에 `schemaVersion: 1`, `appVersion: string`, `origin: string`, `timestamp: number` 의무 필드.
- schema version mismatch 시 silent drop + telemetry hook (toast 없음 — v1).
- private mode 브라우저 (Safari Private, Firefox Private) 에서 BroadcastChannel throw 시 localStorage fallback.

---

## D5 — Paste 좌표 결정

### Options

| Option | 평가 |
|---|---|
| (A) **마우스 커서 위치 (frame 좌표계) 우선 + 키보드 paste 시 selection center + 8px offset** | Figma 와 일치. 마우스 paste 의 자연스러운 위치, 키보드 paste 의 모호함 회피. |
| (B) 항상 원본 위치 | 같은 frame 안 paste 시 완전 겹침 → 사용자 혼란. |
| (C) 항상 frame 의 center | 마우스 paste 의 의도 무시. |

### Decision

**(A) 마우스 커서 위치 (frame 좌표계) 우선 + 키보드 paste 시 selection center + 8px offset.**

### Rationale

- 사용자의 paste 의도가 명시적 — pointer event 의 마지막 위치는 의도의 단일 진실.
- 키보드 paste 는 selection center + 8px offset → 겹침 회피 + 시각적 확인 즉시.

### Consequences

- `useHoverContext` 의 pointer 위치 추적이 frame-coord 변환과 연동 의무 (이미 일부 존재).
- paste 좌표 계산은 weave 단 — agocraft 는 좌표 무관 (Item.attrs 의 position 만 처리).

---

## D6 — Properties-only paste UI 진입점

### Options

| Option | 평가 |
|---|---|
| (A) **Cmd+Opt+V → Paste Special dialog** | Figma 식. dialog 안에서 radio 로 종류 선택 (Everything / Style only / Text only / Size only / Position only). DS Triage Step 3 Grew (radio-with-description). |
| (B) ContextMenu sub-menu 만 | 키보드 진입점 없음. keyboard-first 사용자 뚫림. DS 추가 0. |
| (C) 양쪽 | dialog + sub-menu. 상황 2 경로 유지 (label/i18n/test 소폭 증가). |

### Decision

**(A) Cmd+Opt+V → Paste Special dialog.** ContextMenu 의 "Paste Special..." 항목도 dialog 를 열도록 wiring (단일 UI 의 두 진입).

### Rationale

- Figma 와 일치 — 사용자 mental model 정통.
- dialog 의 radio-with-description 가 paste 종류의 차이를 explicit 하게 학습 — 발견성 + 학습성 양쪽 도움.
- DS Triage walk:
  - Step 1 Reused: Dialog primitive.
  - Step 2 Extended 또는 Step 3 Grew: RadioGroup primitive 확인 후 결정 — 존재 시 Extended (radio 의 description slot 추가), 부재 시 Grew (RadioGroup 신설). DR-design-017 발행 의무.

### Consequences

- DR-design-017 발행 (실제 walk 결과 박제).
- Cmd+Opt+V hotkey 박제 — Lexical 안에서는 비활성 (D7 의 isTextEditing gate).

---

## D7 — Lexical 위임 분기

### Options

| Option | 평가 |
|---|---|
| (A) **focused element 가 contenteditable 안이면 system clipboard + Lexical 핸들러로 위임. 외부면 우리 핸들러.** | 한글 IME 조합 안전. Lexical 의 paste rich-text 자연 동작. |
| (B) Always intercept (우리 핸들러 항상) | Lexical 의 paste plugin 비활성 → rich text paste 손상. IME 조합 중 Cmd+C 가 텍스트 손실 위험. |
| (C) Always Lexical (텍스트 안 outside 도 Lexical 가 처리) | Lexical 가 design plane 의 frame 을 모름. 의미 없음. |

### Decision

**(A) focused-context 분기.** `useEditAffordancesAllowed` 와 합성한 `isTextEditing` mode hook 을 신설, `weave.clipboard.*` command 의 `enabledWhen` 에 `!isTextEditing` 가드. Lexical 안의 hotkey 는 자연 동작.

### Rationale

- T4 (Lexical 분기) 의 trade-off 수용 — 분기 로직 e2e 박제 의무.
- 한글 IME 의 `composition*` event 동안 Cmd+C silent 정상 (브라우저 표준).
- Lexical 의 RichTextPlugin 가 paste 의 단일 진실 — override 없음.

### Consequences

- 신규 hook `useIsTextEditing()` — Lexical 의 focus state 와 InteractionMode 합성. Rule 6 단일 진실.
- e2e (`apps/web/e2e/clipboard-rich-text.spec.ts`) 의 IME 조합 케이스 의무.
- 4-browser 수동 IME smoke (한 / 일) — LG-002 condition.

---

## 종합 Consequences (전체)

| 영역 | 영향 |
|---|---|
| agocraft | major rc 갱신, HANDOFF 3건 land, vendor publish, CURRENT_SCHEMA_VERSION 9→10 |
| weave commands | `weave.clipboard.{copy,cut,paste,pasteSpecial}` 4개 신규 + `weave.item.create` variant input shape 확장 |
| weave UI | ContextMenu 4 항목 + Paste Special dialog (DR-design-017) |
| weave hooks | `useIsTextEditing()` 신규, `useEditAffordancesAllowed()` 합성 의무 |
| weave clipboard store | in-memory singleton (StrictMode safe) + BroadcastChannel + localStorage fallback |
| Lexical | override 없음, focus state read-only |
| QA | e2e 5 spec (P3 items / P4 frame-crosstab / P5 rich-text / P6 paste-special) |
| LG | LG-001 conditional close 또는 LG-002 별도 (P4~P6 포함 시) |

## Open questions (Build 중 결정)

- DS Triage 결과: RadioGroup primitive 존재 여부 → Extended or Grew → DR-design-017 발행.
- MAX_PASTE_NODES 기본값 (500) 의 적정선 — Phase 4 e2e 후 frontend-performance-agent 의 sign-off.
- Cmd+Opt+V hotkey 가 다른 OS (Linux/Windows) 에서 충돌 없는지 — Ctrl+Alt+V wire 동시 박제 의무.

## Links

- WI-041, FR-008, RISK-008.
- agocraft WI-018, HANDOFF-014/015/016.
- DR-design-017 (TBD — Paste Special dialog 의 RadioGroup walk).
- feedback `shared_utilities_to_agocraft` — D1 의 근거.
- feedback `react_strictmode_singleton_dispose` — clipboard store 의 StrictMode safe 의 근거.
- feedback `react_portal_event_bubbling` — ContextMenu 안 Paste 항목 의 event hijack 검증 의무.
