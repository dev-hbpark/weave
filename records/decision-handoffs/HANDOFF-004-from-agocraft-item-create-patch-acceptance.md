# HANDOFF-004 (FROM agocraft) — 11번째 Patch variant `item.create` 수용 응답

## Metadata

| Field | Value |
|---|---|
| ID | HANDOFF-004 (weave inbox) |
| Direction | agocraft (sister) → **weave (this project)** |
| Sender | agocraft (sister service project, `workspace/agocraft/`) |
| Target | weave (this project) |
| Date sent | 2026-05-27 |
| Severity | P1 (weave WI-041 clipboard Build 의존, DR-019 D2 의 근거) |
| Status | **Accepted with one shape correction** — invertPatch 가 `item.children { removed }` 로 매핑 (신규 `item.remove` variant 미신설). 의 이유 §2. |
| Originating request | weave `records/decision-handoffs/HANDOFF-015-item-create-patch-variant.md` (sent 2026-05-27) |
| Related agocraft WI | WI-018, FR-007 |
| Vendor version | `1.0.0-rc.20260527053735` |

---

## 1. 수용 / 정정 요약

HANDOFF-015 의 8 요청 (A~H + Q1~Q4) 거의 모두 수용. **1 정정**:

| 항목 | 결정 | 비고 |
|---|---|---|
| A. Patch union 의 11번째 variant `item.create` | ✅ | shape 그대로 — `{ parentId, position, item: SerializedItem }`. |
| B. Change union 의 같은 variant | ✅ | `changeItemId` case 도 추가 (`c.item.id as ItemId`). |
| C. **Reducer 구현** | ❌ **거절** (호출자 책임) | agocraft 의 10 variant 모두 reducer 가 host 책임 (WI-017 / HANDOFF-002 패턴 일관). agocraft 는 Patch shape + Change 변환 + invertPatch + Y.Doc 매핑만. parent 존재 / id collision / cycle / depth 검증 = 호출자 (weave). |
| D. **invertPatch — `{ type: "item.remove", itemId }`** | ⚠️ **shape 정정** | `item.remove` 라는 patch type 이 agocraft 에 존재하지 않음. 의 대신 기존 `item.children { itemId: parentId, added: [], removed: [item.id] }` 로 매핑. §2 참조. |
| E. `patchToChange` (transaction-runner + history) case | ✅ | 양쪽 case 추가, 단순 spread. |
| F. `applyPatchToYDoc` case + 멱등성 | ✅ | `seedSerializedItemTree` 신규 helper + 의 children Y.Array.insert. 멱등성 PASS. |
| G. `CURRENT_SCHEMA_VERSION 9→10` | ⚠️ **정정** | 실제 current = 8 (memory entry 의 9 는 오류). bump 결과 = **8→9**. |
| H. 7 신규 tests (4 patch + 2 ydoc + 1 history) | ✅ | 모두 PASS. |
| Q1: nested children depth 제한 | agocraft 0 (무제한). 호출자 (weave) 의 `MAX_PASTE_NODES` 가 상한. |
| Q2: position 의 의미 | `Math.max(0, Math.min(position, parent.children.length))` clamp. 음수면 0. |
| Q3: parent 가 leaf-only kind | 신규 error code 추가 **안 함** — 호출자 책임 (검증 위치 일관). weave 측 command body 가 거부. |
| Q4: `TransactionRunner` batch API | **현재 없음.** `exec` 의 multi-patch 가 같은 transactionId 로 묶일지는 후속 batch API 박제 필요. **현 라운드 미해결** — weave 측 cut = copy + remove 의 단일 transaction 묶기는 별도 PR 권장. §4 참조. |

---

## 2. invertPatch shape 정정 (asymmetric inverse)

HANDOFF-015 §D 는 `{ type: "item.remove", itemId: patch.item.id }` 를 제안했지만 **agocraft 의 Patch union 에 `item.remove` 가 존재하지 않음** (10 + 11 = `item.attrs`, `item.children`, `item.units`, `unit.attrs`, `document.attrs`, `item.children.reorder`, `relations.add`, `relations.remove`, `item.text`, `item.reparent`, **`item.create` 신설**). 의 신규 `item.remove` 도 만들 수 있지만, 기존 `item.children { removed: [id] }` 가 정확히 같은 의미 — 추가 variant 는 중복.

**채택한 inverse**:

```ts
// packages/editor/src/history.ts — invertPatch case
case "item.create":
  return {
    type: "item.children",
    itemId: p.parentId,
    added: [],
    removed: [p.item.id as ItemId],
  };
```

Round-trip 무결성:

| 단계 | 적용 patch | 결과 |
|---|---|---|
| forward | `item.create { parentId: P, position: K, item: I }` | parent P 의 children[K] 에 subtree I 삽입 (Y.Doc catalogue 도 시드) |
| undo (invert 적용) | `item.children { itemId: P, removed: [I.id] }` | parent P 의 children 에서 I.id 제거 (catalogue 에는 orphaned subtree 잔존) |
| redo (원본 forward 재적용) | 위와 같은 `item.create` 그대로 | catalogue 가 idempotent (i.e., `items.has(I.id)` 면 skip) → children 의 K 위치에 I.id 재삽입. round-trip 성공. |

→ Cmd+Z 1회 / Cmd+Shift+Z 1회 로 paste 전체 reverse / re-apply. weave 측 e2e 의 검증 의무 (WI-041 P3).

---

## 3. 의무 호출 패턴 (weave 측)

```ts
import { remapIds, deserializeItemSubtree } from "@agocraft/core";

function pasteItems(payload: ClipboardItemsPayload, ctx: PasteContext) {
  // 1) 검증 통과한 SerializedItem 확보 (HANDOFF-003 helper).
  const r = deserializeItemSubtree(payload.data.item, {
    schema: ctx.document.schema,
    features: ctx.features,
    onUnknown: "preserve",
  });
  if (!r.ok) return;

  // 2) ID 재발급 (HANDOFF-005 helper). 이 단계가 필수 — 같은 doc 안 collision 회피.
  //    remapIds 의 입력은 SerializedItem 이므로 deserialize → serialize 가 아니라
  //    payload.data.item 그대로 remapIds 에 넘기는 게 더 효율적. 의 효율 흐름:
  const { subtree, idMap } = remapIds(payload.data.item, ctx.idGen, payload.data.relations ?? []);

  // 3) cycle / parent valid / depth 검증 (weave 책임).
  //    - parent 가 doc 안에 있는지
  //    - subtree 가 parent 의 ancestor 가 아닌지 (cross-tab paste 시점)
  //    - subtree 노드 수 ≤ MAX_PASTE_NODES (500)
  if (!isValidPasteTarget(ctx.document, ctx.targetParentId, subtree)) {
    showToast({ kind: "warn", message: "Cannot paste here" });
    return;
  }

  // 4) 단일 patch — 단일 history transaction = 단일 Cmd+Z reverse.
  ctx.editor.exec("weave.item.create", {
    parentId: ctx.targetParentId,
    position: ctx.position,
    item: subtree,
  });
}
```

---

## 4. TransactionRunner batch API — 별 PR 권장 (Q4 후속)

cut = copy + remove 의 단일 transactionId 묶기에 대해:

- 현 `exec` 는 한 번의 command 호출 = 한 transactionId. 두 번 exec 호출 시 두 transactionId.
- batch API 박제 시점은 weave 의 cut 기능 build 시점 (WI-041 Phase 3) 에 별도 HANDOFF 권장.
- 임시 우회 — weave 의 cut command 가 두 patch (item.children { removed } + item.children.reorder 또는 single item.children 면 충분) 를 한 `run(ctx)` 안에서 emit. CommandResult.patches 의 ordered array 가 한 transaction 으로 처리됨. 검증 의무.

---

## 5. Acceptance evidence

- `pnpm verify` PASS (8 gate 모두).
- core: 384/384 PASS. editor: 145/145 PASS. sync: 26/26 PASS. (weave 156/156 PASS, 회귀 0)
- `CURRENT_SCHEMA_VERSION = 9` 의 wire-types.ts + serializer.ts.
- Vendor tarball 의 `dist/index.d.ts` 에 `Patch` union 의 `item.create` variant export.
- weave 측 `pnpm install` + `pnpm typecheck` PASS.

---

## 6. Links

- weave WI-041 / FR-008 / **DR-019 D2** / RISK-008 R2/R3.
- agocraft WI-018 / FR-007.
- agocraft **WI-017 (item.reparent)** — 패턴 정통.
- HANDOFF-003 (serialize helper 응답) / HANDOFF-005 (remapIds 응답).
- DR-002 (Tree-shake 3-gate).
