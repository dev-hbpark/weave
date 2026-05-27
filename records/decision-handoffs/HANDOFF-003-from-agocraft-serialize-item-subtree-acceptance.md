# HANDOFF-003 (FROM agocraft) — `serializeItemSubtree` / `deserializeItemSubtree` 수용 응답

## Metadata

| Field | Value |
|---|---|
| ID | HANDOFF-003 (weave inbox) |
| Direction | agocraft (sister) → **weave (this project)** |
| Sender | agocraft (sister service project, `workspace/agocraft/`) |
| Target | weave (this project) |
| Date sent | 2026-05-27 |
| Severity | P1 (weave WI-041 clipboard Build 의존) |
| Status | **Accepted as requested** (모든 항목 수용) |
| Originating request | weave `records/decision-handoffs/HANDOFF-014-serialize-item-subtree.md` (sent 2026-05-27) |
| Related agocraft WI | WI-018 (created in same session — `records/work-items/WI-018-clipboard-subtree-foundation.md`) |
| Vendor version | `1.0.0-rc.20260527053735` (this round) |

---

## 1. 수용 요약

HANDOFF-014 의 3 요청 모두 그대로 수용:

| 요청 | 결정 | 위치 |
|---|---|---|
| A. `serializeItemSubtree(item, opts?)` export | ✅ | `packages/core/src/serialize/serializer.ts:232+` |
| B. `deserializeItemSubtree(data, opts)` export | ✅ — `DeserializeItemSubtreeResult` discriminated union 반환 (`{ ok: true; item; warnings }` / `{ ok: false; error }`) | 같은 파일 |
| C. 3 신규 test | ✅ — `serializer.test.ts` 의 "WI-018 — subtree helpers" describe block | round-trip identity / unknown preserve / deserialize error path 모두 PASS |

추가 변경 (HANDOFF-014 에 명시되지 않았지만 의무):

- `CURRENT_SCHEMA_VERSION 8 → 9` — 신규 patch variant `item.create` (HANDOFF-015) 와 같은 round 에서. wire format 자체는 backward compatible.
- `packages/core/src/serialize/wire-types.ts` 신규 파일 — `SerializedItem`/`SerializedUnit`/`SerializedRelation`/`SerializedDocument` 의 type 정의를 분리. 이유는 `patch.ts`/`change.ts` 가 `SerializedItem` 을 import 하면서 `serializer.ts → feature-registry → change-stream → change` 의 순환 생성됨 → wire-types 가 의존성 사슬을 끊는다. `serializer.ts` 가 re-export 하므로 호출자 입장에선 변화 0.

---

## 2. 정정 사항

**없음** — HANDOFF-014 spec 그대로.

---

## 3. Open questions 답

| Q | 답 |
|---|---|
| Q1: `serializeItemSubtree` 가 schema version 박제? | **No.** 호출자 (weave clipboard payload) 가 wrap 의 `schemaVersion` 박제. agocraft 는 내부 const `CURRENT_SCHEMA_VERSION` 만 사용. |
| Q2: relations 가 subtree 직렬화 결과에 포함? | **No.** Item 자체만. Relations cross-doc 처리는 HANDOFF-016 (`remapIds`) 의 책임. |
| Q3: `serializeItem` private 그대로 노출 vs wrap? | wrap 형태 채택 — `serializeItemSubtree(item: Item): SerializedItem` 가 private `serializeItem` 을 직접 호출. opts (예: onUnknown) 는 deserialize 단계만 의미 — serialize 는 옵션 받지 않음. |

---

## 4. 호출 패턴 (weave 측 의무)

```ts
import {
  serializeItemSubtree,
  deserializeItemSubtree,
  type SerializedItem,
} from "@agocraft/core";

// Copy
const wire: SerializedItem = serializeItemSubtree(selectedItem);
// 안전한 JSON-roundtrip
const json = JSON.parse(JSON.stringify(wire));

// Paste
const r = deserializeItemSubtree(json, {
  schema: editor.document.schema,
  features: editor.features,
  onUnknown: "preserve",  // 권장 default
});
if (!r.ok) {
  // r.error.code = DESERIALIZE_INVALID_SHAPE | DESERIALIZE_MISSING_FIELD | ...
  showToast({ kind: "error", message: "Clipboard payload invalid" });
  return;
}
// r.item: Item — 다음 단계에서 remapIds 통과시켜 새 ID 발급 후 editor.exec(...)
```

---

## 5. Acceptance evidence

- `pnpm verify` PASS — lint / tokencheck / declarativecheck / puritycheck / typecheck / depcheck / test / build 8/8.
- core unit test count: **374 → 384** (+10; serializer 의 3 신규 + 4 patch + id-remap 의 6, 일부 같은 describe).
- vendor tarball `agocraft-core-1.0.0-rc.20260527053735.tgz` 의 `dist/index.d.ts` 에 `serializeItemSubtree` / `deserializeItemSubtree` / `DeserializeItemSubtreeResult` 모두 export 확인.
- weave 측 `pnpm install` + `pnpm typecheck` PASS, 156/156 weave unit tests 회귀 0.

---

## 6. Links

- weave WI-041 / FR-008 / DR-019 (D1) / RISK-008.
- agocraft WI-018 / FR-007.
- HANDOFF-004 (item.create variant 응답 — 같은 round) / HANDOFF-005 (remapIds 응답 — 같은 round).
- DR-002 (Tree-shake 3-gate).
