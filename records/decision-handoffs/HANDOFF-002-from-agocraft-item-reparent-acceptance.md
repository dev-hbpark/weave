# HANDOFF-002 (FROM agocraft) — `item.reparent` patch variant 수용 응답

## Metadata

| Field | Value |
|---|---|
| ID | HANDOFF-002 (weave inbox) |
| Direction | agocraft (sister) → **weave (this project)** |
| Sender | agocraft (sister service project, `workspace/agocraft/`) |
| Target | weave (this project) |
| Date sent | 2026-05-27 |
| Severity | P2 (weave WI-039 Build 의존) |
| Status | **Accepted with pattern adjustment** — patch shape 는 `forward+inverse self-contained` 로 정정 (agocraft 9 variant 패턴 일관). 검증 책임 = 호출자 (weave). |
| Originating request | weave `records/decision-handoffs/HANDOFF-013-item-reparent-patch-variant.md` (sent 2026-05-27) |
| Related agocraft WI | WI-017 (created in same session, links back) |

---

## 1. 수용 / 거절 요약

HANDOFF-013 의 7 요청 (A~G) 부분 수용. **2 정정**:

| 항목 | 결정 | 비고 |
|---|---|---|
| **A. Patch union 의 신규 variant** | ✅ 수용 | shape 정정 — entries 에 oldState 까지 박제 (forward+inverse self-contained). §2 참조. |
| **B. Reducer 구현 + cycle 검증** | ❌ **거절** (패턴 불일치) | agocraft 의 9 variant 모두 reducer 가 host 책임. agocraft 는 Patch shape + Change 변환 + invertPatch + Y.Doc 매핑만. cycle 검증 = 호출자 (weave) surface UI + command body. §3 명시. |
| **C. invertPatch 구현** | ✅ 수용 | 단순 swap (entries 의 old↔new). doc 인자 없음 — patch 자체가 self-contained. |
| **D. Serializer round-trip** | ✅ 수용 | 기존 9 variant 와 동일 패턴. |
| **E. 에러 코드 추가** | ❌ **거절** (호출자 책임) | 검증이 호출자 책임이므로 cycle / duplicate / unknown 코드도 호출자 (weave) 가 정의. agocraft 는 이번 PR 에 코드 추가 안 함. |
| **F. Y.Doc 매핑** | ✅ 수용 | detach + append + frame Y.Map update. yDoc.transact 안에서 entries 직렬. 멱등성 의무. |
| **G. 7 unit tests** | ✅ 수용 (조정) | agocraft 측 7 = core 5 (single / multi / to-root / invert symmetry / patchItemId) + sync 2 (applyPatchToYDoc / 멱등). cycle / duplicate / unknown 의 negative test 는 weave 측 commands.test.ts 에 위치 — 검증 책임 따라 분배. |

---

## 2. Patch shape — 정정 (forward+inverse self-contained)

agocraft 의 9 variant 가 모두 *patch 자체에 inverse 정보 박제* (item.attrs 의 before+after, item.text 의 ops+inverseOps, item.children.reorder 의 before+after). 본 variant 도 동일 패턴 유지.

```ts
// packages/core/src/command/patch.ts — Patch union 의 10번째 case
| {
    readonly type: "item.reparent";
    readonly entries: ReadonlyArray<{
      readonly itemId: ItemId;
      readonly oldParentId: ItemId;
      readonly oldIndex: number;
      readonly oldFrameRatio: FrameRatio;
      readonly newParentId: ItemId; // root 의 경우 = doc.root.id
      readonly newFrameRatio: FrameRatio;
    }>;
  }

type FrameRatio = Readonly<{
  x: number;       // 0..1, ratio of parent frame width
  y: number;       // 0..1
  width: number;   // 0..1
  height: number;  // 0..1
  rotation?: number; // radians, optional
}>;
```

**invertPatch**:

```ts
case "item.reparent":
  return {
    type: "item.reparent",
    entries: p.entries.map(e => ({
      itemId: e.itemId,
      oldParentId: e.newParentId,
      oldIndex: -1, // 호출자 책임 — newParent's children 끝에 append 이므로 invert 의 oldIndex 는 의미 없음
      oldFrameRatio: e.newFrameRatio,
      newParentId: e.oldParentId,
      newFrameRatio: e.oldFrameRatio,
      // newIndex: e.oldIndex 처럼 entries shape 에 newIndex 도 박제할까? — 아래 §4 참조
    })),
  };
```

→ **호출자 (weave) 의 의무**: command body 가 patch 발행 시 `oldParentId / oldIndex / oldFrameRatio` 모두 미리 계산 (agocraft-mirror 의 findParentAndIndex + absoluteFrameBox 합성).

---

## 3. 검증 책임 = 호출자 (weave)

agocraft 패턴 박제:

- **9 variant 모두**: agocraft 의 transaction-runner / applyPatchToYDoc 가 patch validity 를 검증 안 함. 호출자가 valid patch 만 발행한다고 신뢰. e.g., `item.children.reorder` 의 before/after permutation 유효성 검증 안 함.
- **Reducer 가 agocraft 에 없음**: 실제 doc state 의 mutation (트리 update) 은 host (weave 의 agocraft-mirror) 가 책임. agocraft 는 Patch → Change 변환 + ChangeStream emit + Y.Doc 매핑.

따라서 본 variant 의 cycle / duplicate / unknown 검증도 weave 책임:

| 검증 | 위치 | 시점 |
|---|---|---|
| Cycle (자기 자신 / 자기 조상) | weave surface UI (disabled thumbnail / picker option) + weave.item.reparent command body (`findDescendantSet`) | drag 중 + dispatch 직전 |
| Duplicate itemId in entries | weave command body (Set dedupe) | dispatch 직전 |
| Unknown itemId / newParentId | weave command body (findItemDeep 의 undefined check) | dispatch 직전 |
| Old state capture (oldParentId / oldIndex / oldFrameRatio) | weave command body (findParentAndIndex + absoluteFrameBox) | dispatch 직전 |

→ agocraft 의 applyPatchToYDoc 가 cycle patch 받으면 Y.Array detach+append 만 발생 (logical infinite tree 위험). v1 의 acceptance e2e 가 negative test 로 cover. 마지막 safety net 으로 agocraft 가 cycle 검증을 미래 PR 에 추가하는 옵션은 열어둠 — 그러나 본 WI 의 스코프 아님.

---

## 4. Q1-Q4 답 (HANDOFF-013 §7)

| # | 질문 | 답 |
|---|---|---|
| Q1 | reducer 의 entries 순서 처리: 같은 itemId 가 2번 → err 가 맞는가, dedupe 가 맞는가? | **호출자 책임**. agocraft 는 entries 가 valid 라 가정. 같은 itemId 가 2번 = 마지막 entry win (entries 순차 적용 후 net effect). 호출자 (weave command) 가 dedupe. |
| Q2 | newParentId 가 자기 자신 (entry.itemId 와 동일) 도 REPARENT_CYCLE 의 케이스에 합치는가? | **호출자 책임**. agocraft 검증 안 함. weave 측의 cycle 검증이 자기 자신 + 자기 조상 통합 처리. |
| Q3 | `attrs.frame` 외의 다른 attrs (예: text rich-text override) 가 reparent 시 보존? | **보존**. Patch 가 entries 의 newFrameRatio 만 update — item 의 다른 attrs / units / children / meta 모두 unchanged. invertPatch 도 동일 (oldFrameRatio 만 update). |
| Q4 | invertPatch 의 oldFrameRatio 가 absolute 가 아닌 oldParent 기준 ratio 인 점 명시? | **명시**. forward entries 의 oldFrameRatio = oldParent 기준 0..1. forward entries 의 newFrameRatio = newParent 기준 0..1. invertPatch 의 entries = forward 의 old↔new swap (oldParentId ↔ newParentId, oldFrameRatio ↔ newFrameRatio). weave 측은 absoluteFrameBox 의 trail 합성으로 두 ratio 모두 dispatch 직전에 계산. |

추가 결정 (응답 중 정정):

- **oldIndex 의 의미**: forward patch 의 oldIndex = 기존 부모 children 안의 index. 새 부모 children 에 append 시 항상 **끝** 에 (length-1 위치). invertPatch 의 entries 가 의미하는 "newIndex" 는 명시 X — 호출자 가 invertPatch 적용 시 새 부모의 children 끝에 push (또는 host reducer 가 처리). v1 = 항상 끝에 append, 향후 v1.x 에 특정 index drop 옵션 시 `newIndex?: number` 필드 추가.

---

## 5. 의무 / 일정

agocraft 측:

- WI-017 (이번 세션) — Patch + Change + invertPatch + transaction-runner + Y.Doc 매핑 + 7 unit test
- SLA 2026-06-03 — verify all PASS + vendor publish (rc tag)
- vendor publish 후 weave 측에 통보 (HANDOFF 응답으로)

weave 측 (HANDOFF-013 §6 기반):

- HANDOFF-002 (본 paper) 박제 후 vendor refresh
- `weave.item.reparent` command 의 구현 — patch entries 의 oldState 까지 계산
- cycle 검증 (surface UI + command body)
- 3 surface (modifier drag / ThumbnailPanel drop / ContextMenu picker)
- 4 e2e spec
- design-system primitive (TreePicker + ThumbnailDropTarget) DR-design-013 머지 후
- features/reparent/ENGINEERING_PLAN.md 의 §3.1 명령 body 가 oldState capture 까지 처리하도록 정정

---

## 6. Cross-references

- weave HANDOFF-013 (원 요청), weave WI-039, weave RISK-007, weave features/reparent/ENGINEERING_PLAN
- agocraft WI-017, agocraft 의 9 variant 패턴 (WI-016 Phase 2 의 item.text invert template)
- agocraft 의 검증-호출자-책임 패턴 — DR-003 § 8 (Patch 단의 atomicity), DR-013 (factory + host 책임 분리)
