# HANDOFF-005 (FROM agocraft) — `remapIds` helper 수용 응답

## Metadata

| Field | Value |
|---|---|
| ID | HANDOFF-005 (weave inbox) |
| Direction | agocraft (sister) → **weave (this project)** |
| Sender | agocraft (sister service project, `workspace/agocraft/`) |
| Target | weave (this project) |
| Date sent | 2026-05-27 |
| Severity | P1 (weave WI-041 / DR-019 D3 / RISK-008 R1 의 근거) |
| Status | **Accepted as requested** — Relations topology 의 known kind switch 채택 (HANDOFF-016 의 Q1 권장 (A) self-describing metadata 는 별 PR 권장). |
| Originating request | weave `records/decision-handoffs/HANDOFF-016-remap-ids.md` (sent 2026-05-27) |
| Related agocraft WI | WI-018, FR-007 |
| Vendor version | `1.0.0-rc.20260527053735` |

---

## 1. 수용 요약

HANDOFF-016 의 5 요청 (A~E + Q1~Q4) 모두 수용. **1 정정**:

| 항목 | 결정 | 비고 |
|---|---|---|
| A. `remapIds(subtree, idGen, relations)` module + `RemapIdsResult` | ✅ | `packages/core/src/services/id-remap.ts` 신규. |
| B. Relations topology shape lookup | ⚠️ **정정** — Q1 의 권장 (A) self-describing metadata 대신 의 **known kind switch** 채택. 의 이유 §2. | 3 kind (follow / peer / snapshot) 모두 cover. 신규 kind 등장 시 별 PR. |
| C. 6 신규 test | ✅ | `id-remap.test.ts` 의 7 test (single / nested DFS / no-mutation / follow remap / drop external / unit remap / idempotency) 모두 PASS. |
| D. Index re-export | ✅ | `packages/core/src/index.ts` 에 `remapIds`, `RemapIdsResult` 추가. |
| E. DR-013 예외 (factory 미사용) | ✅ | id-remap.ts 의 top comment 에 명시. 순수 함수 — closure-private state / DI 없음. |
| Q1: self-describing metadata vs known kind switch | known kind switch — DR-004 의 RelationTopology 는 closed union (3 kind). 신규 kind 등장 = DR-004 amend 의 별 사건 — 그 시점에 remapIds 도 cover. |
| Q2: 외부 ItemId reference | model 상 nested children 만 — 외부 reference 자체 model 부재. relation topology 의 외부 ItemId 만 drop. |
| Q3: 결정론 (test) | 같은 idGen → 같은 결과. unit-tests 의 `seqGen` 으로 검증. |
| Q4: input deep-frozen 검증 | No — structurally pure (input mutate 안 함만 self-test). |

---

## 2. Q1 정정 — known kind switch 채택 이유

HANDOFF-016 의 권장 (A) 는 relation-registry 가 topology-ItemId-fields 의 self-describing metadata 노출 → remapIds 가 generic 으로 cover.

**채택 안함** — 의 이유:

1. **agocraft 의 RelationTopology 는 closed union** (DR-004 § 의 topology 정의). 의 3 kind 외 신규 추가는 DR-004 amend 의 *큰* 사건 — self-describing metadata 의 동적 lookup 보다 새 kind 등장 시 의 review 자체가 필요.
2. **Rule 6 의 본질은 business logic 의 switch 회피** — library wiring (Patch / Change / RelationTopology) 의 switch 는 정통. 신규 추가 시 TypeScript 가 exhaustive check (default 없음) — silent skip 없음.
3. self-describing metadata 의 cost = relation registry 의 신규 API + 모든 기존 relation 의 migration. v1 의 cost-vs-benefit 미달.

**미래 plan**: 만약 plugin 이 자체 RelationTopology kind 정의 (현재 model 상 불가) 시점에 (A) 패턴 의 별 PR. 의 trigger 는 plugin 의 third-party relation 도입 의 시점.

---

## 3. 의무 호출 패턴 (weave 측)

```ts
import { remapIds, type RemapIdsResult } from "@agocraft/core";

const { subtree, idMap, unitIdMap, relations }: RemapIdsResult = remapIds(
  payload.data.item,           // SerializedItem from clipboard
  ctx.idGen,                   // ctx.editor.idGenerator
  payload.data.relations ?? [],// SerializedRelation[] from clipboard
);

// subtree.id 는 새 UUID v7 — 같은 doc 안 collision 0.
// relations 의 topology 의 ItemId 도 idMap 으로 자동 재매핑.
// 외부 ItemId 가 topology 에 있으면 그 relation 자체 drop (safe default).

// idMap / unitIdMap 은 weave 가 향후 external reference 복원 (cross-doc weak ref 등)
// 에 사용 가능. v1 에선 무시.

ctx.editor.exec("weave.item.create", {
  parentId: ctx.targetParentId,
  position: ctx.position,
  item: subtree,
});

// Relations 별 patch (relations.add) — agocraft 는 단일 patch 의 multi-add 안 지원
// (HANDOFF-007 의 relations.add 가 single relation). 의 weave 측 command:
for (const rel of relations) {
  ctx.editor.exec("weave.relations.add", { relation: rel });
}
// (의 N+1 patch — Q4 의 TransactionRunner batch API 가 land 되면 단일 transaction 으로
//  묶기 가능. 현재는 N+1 history entry — 한 paste 의 reverse 가 multi-Cmd+Z 가 됨.
//  weave 측 v1 의 trade-off — relations 없는 일반 paste 는 단일 Cmd+Z OK.)
```

**경고**: relations 가 있는 paste 의 history granularity 가 현재 N+1 — TransactionRunner batch API land 까지 사용자 경험상 sub-optimal. v1 의 가장 흔한 paste (단일 Item, relations 없음) 는 단일 Cmd+Z 정상.

---

## 4. Acceptance evidence

- `pnpm verify` PASS — 8 gate 모두.
- 7 신규 test in `id-remap.test.ts` PASS.
- core: 384/384 PASS (이 helper 의 6/7 test 포함).
- Vendor tarball 의 `dist/index.d.ts` 에 `remapIds`, `RemapIdsResult` export.
- weave 측 `pnpm typecheck` PASS.

---

## 5. Links

- weave WI-041 / FR-008 / **DR-019 D3** / **RISK-008 R1**.
- agocraft WI-018 / FR-007.
- HANDOFF-003 (serialize helper) / HANDOFF-004 (item.create variant).
- DR-013 (Factory functions over classes — remapIds 예외).
- DR-004 (RelationTopology closed union — Q1 의 근거).
