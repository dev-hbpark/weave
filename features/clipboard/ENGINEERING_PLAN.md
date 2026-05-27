# Engineering Plan — Clipboard (copy / cut / paste) — WI-041

| Field | Value |
|---|---|
| Feature | `clipboard` (4 target — Items / Frame / Rich text / Properties-only; same-origin cross-tab) |
| Owner | hbpark |
| Triggering WI | WI-041 |
| Status | **Draft** — Phase 0 박제 in progress (FR-008 / DR-019 / RISK-008 land 후 P1 의무) |
| FR verdict | FR-008 = **FEASIBLE WITH TRADE-OFFS** (7 trade-offs, 3 specialist pending) |
| Risk verdict | RISK-008 = **GO WITH CONDITIONS** (10 conditions, 3 cross-project) |
| Decisions | DR-019 (D1~D7 Accepted 2026-05-27) |
| Cross-project | agocraft WI-018 + HANDOFF-014/015/016 (blocking P3+) |
| Last updated | 2026-05-27 |

---

## 1. Feature scope and risks

### Scope (in)

User-facing capabilities at v1 launch (P3 land 기준 LG-001 conditional close 가능):

- `Cmd+C` / `Cmd+X` / `Cmd+V` 단일 Item copy / cut / paste (frame 내부).
- ContextMenu 항목 (Copy / Cut / Paste / Paste Special...).
- mouse 위치 paste + 키보드 paste 시 selection center + 8px offset (D5).
- 같은 doc 안 paste 시 ID 재발급 (D3).
- 단일 Cmd+Z 로 paste 전체 reverse (D2 의 item.create variant — 단일 transaction).
- v1 의 enabledWhen 합성: `hasSelection && mode === "idle" && !isTextEditing`.

### Scope (P4+ — LG-002 별도)

- Frame deep copy (children 포함) + MAX_PASTE_NODES 게이트.
- Cross-tab BroadcastChannel + localStorage fallback (D4).
- Rich text Lexical 위임 (D7) — `useIsTextEditing` 분기.
- Properties-only paste (D6) — Cmd+Opt+V → Paste Special dialog (DR-design-017).

### Scope (out / deferred to v1.x)

- 외부 앱 → weave paste (web custom format Baseline 확보 후).
- 다중 선택 paste (WI-036 land 후 자동).
- Cross-account paste (CRDT 재개 WI-028 후).
- Real-time collaborative clipboard.

---

## 2. SOLID + GRASP review (mandatory)

각 신규 surface 별 (`.claude/skills/solid-grasp-review/SKILL.md` 결과 박제):

### S2.1 — `clipboard-store.ts` (in-memory singleton)

- **SRP**: clipboard payload 의 store. 한 가지 책임 — 의 read/write/clear.
- **OCP**: 신규 payload kind 추가 시 store 변경 0 — kind 별 adapter (`ItemsPayloadAdapter`, `StylePayloadAdapter`) 가 등록.
- **LSP**: 모든 payload 가 공통 `ClipboardPayload` 인터페이스 (schemaVersion / appVersion / kind / data) — substitution safe.
- **ISP**: store 의 public API 는 4 메서드 (`write`, `read`, `peek`, `clear`).
- **DIP**: store 가 BroadcastChannel / localStorage 의 구체 의존 안 함 — `ClipboardTransport` 인터페이스 + 2 adapter (BroadcastChannel / localStorage).
- **High Cohesion / Low Coupling**: store 가 agocraft serializer 직접 의존 0 — payload 의 `data` 는 이미 직렬화된 JSON.
- **Information Expert**: kind 별 adapter 가 자신의 직렬화 책임.

### S2.2 — `weave.clipboard.{copy,cut,paste,pasteSpecial}` commands

- **SRP**: 각 command 가 한 verb 만.
- **OCP**: paste 의 target kind 분기는 registry — `PasteHandler` 가 kind 별 등록. `weave.clipboard.paste` 의 run 안에 `switch (payload.kind)` 금지 (Rule 6).
- **DIP**: command 가 store / serializer / remapIds 의 구체 의존 안 함 — DI ctx 경유.
- **Rule 6 (declarative branching)**: kind 분기는 registry 만. inline switch 금지.

### S2.3 — `useIsTextEditing()` hook (Lexical 위임 분기)

- **SRP**: 단일 진실 — 현재 focus 가 contenteditable 안인가?
- **Rule 6 (single-source mode hook)**: 이 hook 이 단일 진실. 다른 모든 곳에서 `document.activeElement` 직접 체크 금지.
- **High Cohesion**: Lexical focus + InteractionMode 합성을 한 곳에서.

### S2.4 — `BroadcastChannelTransport`

- **SRP**: BroadcastChannel 의 추상화 — payload publish / subscribe.
- **OCP**: 신규 transport (e.g., `SharedWorkerTransport` 미래) 추가 시 변경 0.
- **DIP**: store 가 의존 안 함 — `ClipboardTransport` 인터페이스 경유.
- **LSP**: BroadcastChannel throw 시 (private mode) localStorage adapter 로 fallback — interface 동일.

### S2.5 — Paste Special Dialog

- **SRP**: paste 의 종류 선택 UI 만.
- **OCP**: 신규 radio option 추가 시 dialog 변경 0 — `PasteSpecialMode[]` 배열 + i18n.
- **Composition over inheritance**: Dialog primitive 의 children 으로 RadioGroup 합성.

---

## 3. File structure

```
apps/web/src/document/clipboard/
  clipboard-store.ts                      # S2.1 singleton store
  clipboard-types.ts                      # ClipboardPayload / ClipboardTransport / PasteSpecialMode
  transports/
    broadcast-channel-transport.ts        # S2.4
    local-storage-transport.ts            # private mode fallback
    in-memory-transport.ts                # same-tab default
  adapters/
    items-payload-adapter.ts              # kind: "weave/items.v1"
    style-payload-adapter.ts              # kind: "weave/style.v1" (P6)
  paste-handlers/
    items-paste-handler.ts                # kind: "weave/items.v1" → editor.exec("weave.item.create", ...)
    style-paste-handler.ts                # kind: "weave/style.v1" → editor.exec("weave.item.update", attrs only)
  paste-coord.ts                          # D5 좌표 결정 (pointer-last → selection center + 8px)

apps/web/src/document/hooks/
  use-is-text-editing.ts                  # S2.3 단일 진실

apps/web/src/document/tooltip/editor-hotkeys.ts  # 신규 4 commands 추가

apps/web/src/document/clipboard-context-menu/
  PasteSpecialDialog.tsx                  # D6, DR-design-017

apps/web/e2e/
  clipboard-items.spec.ts                 # P3
  clipboard-frame-crosstab.spec.ts        # P4
  clipboard-rich-text.spec.ts             # P5
  clipboard-paste-special.spec.ts         # P6
```

---

## 4. Public interface — `ClipboardPayload`

```ts
// apps/web/src/document/clipboard/clipboard-types.ts (예시)
export interface ClipboardPayload<TData = unknown> {
  /** Schema version of the payload format. Mismatch → silent drop. */
  schemaVersion: 1;
  /** App version (semver). Telemetry only — does not affect compatibility. */
  appVersion: string;
  /** Origin tab id (uuid v7) — disambiguate cross-tab self-receive. */
  origin: string;
  /** Unix ms. */
  timestamp: number;
  /** Payload kind discriminator. Registered via adapter registry. */
  kind: "weave/items.v1" | "weave/style.v1";
  /** Adapter-defined data. */
  data: TData;
}
```

D2 의 `item.create` patch input shape (agocraft HANDOFF-015):

```ts
// agocraft 측 — HANDOFF-015 에서 박제
interface ItemCreatePatch {
  type: "item.create";
  parentId: ItemId;
  position: number;                       // index in parent.children
  item: SerializedItem;                   // attrs / units / children 모두 포함
}

invertPatch(itemCreate) === { type: "item.remove", itemId: item.id };
```

D3 의 `remapIds` 결과 shape (agocraft HANDOFF-016):

```ts
interface RemapResult {
  subtree: SerializedItem;                // 새 ID 적용된 sub-tree
  idMap: Map<OldItemId, NewItemId>;       // Master/Follower 등 reference 복원 용
  relations: SerializedRelation[];        // topology 가 idMap 으로 재매핑된 relations
}
```

---

## 5. Phase plan (P0~P7, 단일 거대 PR 금지)

| Phase | Scope | 의존 | Estimate | PR |
|---|---|---|---|---|
| **P0** | 박제 7건 (WI-041, FR-008, DR-019, RISK-008, 이 plan, agocraft WI-018+FR-007, HANDOFF-014/015/016) | — | 0.5d (이 세션) | weave 1 + agocraft 1 |
| **P1 (agocraft)** | HANDOFF-014: serializeItemSubtree + deserializeItemSubtree | — | 0.5d | agocraft #1 |
| **P1 (agocraft)** | HANDOFF-015: item.create variant + invertPatch + Yjs bridge + SCHEMA 9→10 | HANDOFF-014 | 1.0d | agocraft #2 |
| **P1 (agocraft)** | HANDOFF-016: remapIds (Item/Unit/Relations topology) + unit test | HANDOFF-014 | 0.5d | agocraft #3 |
| **P1 (agocraft)** | vendor publish (`@agocraft/core@1.0.0-rc.<ts>`) | P1 모두 | 0.1d | agocraft #4 |
| **P2 (weave skel)** | 4 commands + ContextMenu 4 항목 + Paste Special dialog stub (DS Triage walk 박제) + useIsTextEditing hook | — (병행) | 0.5d | weave #1 |
| **P3 (weave items)** | clipboard-store + in-memory transport + items adapter + items paste handler + paste-coord (D5) + e2e 5 spec | P1 + P2 | 1.0d | weave #2 |
| **P4 (weave frame+crosstab)** | frame deep copy + MAX_PASTE_NODES 게이트 + BroadcastChannel transport + localStorage fallback + e2e 3 spec | P3 | 1.0d | weave #3 |
| **P5 (rich text)** | useIsTextEditing 합성 + composition* guard + e2e 3 spec + 4-browser IME smoke | P2 | 0.5d | weave #4 |
| **P6 (paste special)** | style payload adapter + style paste handler + Paste Special dialog 활성화 + DR-design-017 + e2e 2 spec | P3 + P2 | 1.0d | weave #5 |
| **P7** | LG-002 (또는 LG-001 conditional close 시 P3 만 포함) + AGENT_EVALUATION | P3~P6 | 0.3d | weave #6 |

총 estimate: **6~7 working day** (cross-project + 단일 owner 일 때). LG-001 (2026-06-08) 까지 최소 P0~P3 land 가능 (3d) — P4~P6 는 LG-002.

---

## 6. Verification gates (`pnpm verify` 의무)

- **typecheck** — TS strict, exactOptional 안전.
- **declarativecheck** (Rule 6) — `.declarative-allow` 등록 0 신규 (paste handler 의 kind 분기는 registry, useIsTextEditing 은 단일 진실).
- **puritycheck** — clipboard-store 가 weave 의 framework 의존 (React) 만 사용, agocraft host-domain leak 0.
- **unit tests** — paste-coord, ClipboardPayload schemaVersion mismatch drop, remapIds idempotency.
- **e2e** — 위 5 spec PASS.
- **build** — bundle size 변화 ≤ 5 KB gz (FR-008 의 condition).
- **tree-shake 3-gate** — design-system 의 신규 RadioGroup primitive (P6 시) 만 영향.

---

## 7. CLAUDE.md 의 Document mutation rule 준수

paste / cut 의 모든 mutation 은 `editor.exec("weave.item.create" | "weave.item.remove" | "weave.item.update", input)` 경유:

- `editor.exec` → command run → patches 계산 → TransactionRunner → ChangeStream → applyChange → setAgoDoc → editor.history record.
- direct `setAgoDoc` 호출 금지.
- cut = copy + remove 를 단일 transactionId 로 묶기 (TransactionRunner 의 batch API 사용 — HANDOFF-015 의 추가 의무 확인 필요).

---

## 8. e2e 의 paste 시나리오 (P3 5 spec 상세)

```
clipboard-items.spec.ts:
  1. shape Cmd+C → Cmd+V → 위치 +8px offset, ID 재발급 확인, single-tx Cmd+Z 로 paste reverse.
  2. text Cmd+X → frame 내 사라짐, single-tx Cmd+Z 로 cut reverse, Cmd+V 후 동일 ID 재발급.
  3. shape Cmd+C → 다른 frame click + Cmd+V → 새 parent 안에 paste.
  4. shape Cmd+C → ContextMenu Paste 클릭 → mouse 위치에 paste.
  5. shape Cmd+C → Cmd+V → Cmd+V → 두 번째 paste 도 ID 재발급 (collision 0).
```

---

## 9. Open items (Build 중 결정)

- DS Triage 결과: RadioGroup primitive 존재 여부 → Extended or Grew → DR-design-017 발행.
- MAX_PASTE_NODES 기본값 (500) 의 적정선 — Phase 4 e2e 후 frontend-performance-agent sign-off.
- Cmd+Opt+V hotkey 의 다른 OS 충돌 — Ctrl+Alt+V 박제 의무.
- `applicationsetText` 의 외부 앱 copy 시 text label 형식 — kind 별 표준.
- agocraft `TransactionRunner` 의 batch API (cut 의 단일 transactionId 보장) — HANDOFF-015 에 추가 명시 필요.

---

## 10. Links

- WI-041, FR-008, DR-019, RISK-008.
- agocraft WI-018, HANDOFF-014/015/016.
- DR-design-017 (TBD — Paste Special dialog).
- LG-001 (text v1) / LG-002 (TBD — clipboard 별도).
- CLAUDE.md (workspace/weave/) — Document mutation rule.
- `docs/04-specialized-engineering/CODE_STRUCTURE_DESIGN_RULES.md` (OS-root) — Rule 6 declarative branching.
- features/text/ENGINEERING_PLAN.md — 의 형식 참고.
