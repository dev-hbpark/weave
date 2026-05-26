# Engineering Plan — reparent (WI-039)

| Field | Value |
|---|---|
| Feature | reparent |
| Owner | hbpark |
| Triggering Work Item | WI-039 |
| Related records | RISK-007 (GO WITH CONDITIONS, 10 risks / 7 conditions), HANDOFF-013 (agocraft 의 `item.reparent` patch variant 요청), LG-001 (conditional 추가 후보) |
| Status | **P1 + P2 (C/D/E) + P3 e2e 완료 (2026-05-27). 9 신규 e2e PASS, 전체 suite 회귀 0 (123 passed, 29 skipped, 0 failed). DR-design-013 발행 의무는 별도 follow-up. LG-001 conditional close-out 가능.** |
| Target | LG-001 (T-0 = 2026-06-08) 이전 v1 포함 — D-12 from 2026-05-27. deadline -3 = 2026-06-05. |
| Last update | 2026-05-27 |

---

## 0. 목적 — 한 줄

선택한 1+ 개 아이템 / 프레임의 **부모를 다른 frame 또는 디자인 루트로 이동**, 시각적 위치 보존 (ratio 재계산), 다중 단일-patch 단일-history, 3 surface (modifier drag · ThumbnailPanel drop · ContextMenu "Move to…").

---

## 1. Scope (WI-039 / RISK-007 와 일치)

### 1.1 In scope (v1)

- **A. agocraft 의존**: `item.reparent` patch variant + reducer + invertPatch + serializer + sync — HANDOFF-013 응답 후 vendor refresh.
- **B. weave 명령**: `weave.item.reparent` (entries[], ratio 자동 계산, cycle guard) + `findDescendantSet` helper (cycle 검증용).
- **C. Modifier drag surface**: FrameStage 의 pointer handler 가 시작 시점에 Cmd+Shift modifier 검사 → reparent mode 진입 → 원본 lock + ghost preview + drop target detection.
- **D. ThumbnailPanel drop target**: drop-zone 슬롯 + thumbnail outline highlight + disabled (cycle 후보) state. design-system primitive 신설 (`ThumbnailDropTarget`).
- **E. ContextMenu "Move to…" picker**: FrameContextMenu 의 신규 항목 + 트리 picker dialog (`TreePicker` design-system primitive 신설).
- **F. design-system**: 2 신규 primitive (TreePicker, ThumbnailDropTarget) + ghost preview 스타일 토큰. DR-design-013 발행 의무.
- **G. tests**: agocraft 7 unit + weave 7 unit + 4 e2e (modifier drag, thumbnail drop, ContextMenu picker, multi-selection 단일 Cmd+Z).

### 1.2 Out of scope (v1)

- 회전된 ancestor 의 정확한 bbox (axis-aligned only, WI-038 한계 공유)
- 새 부모 children 의 특정 z-index 위치 drop (v1 = 끝에 append)
- Auto-scroll / pan-while-drag
- ContextMenu picker 의 frame thumbnail preview (텍스트 라벨 only)
- Layers panel (weave 에 자체 UI 부재)

---

## 2. Phasing — P0 → P3

```
D1 (2026-05-27) ─────────────── D12 (2026-06-08, LG-001 T-0)
  │
  ├─ P0 (D1): Design + HANDOFF block — DONE 2026-05-27
  │     ├─ HANDOFF-013 발행 + HANDOFF-002 응답 도착 + vendor refresh (1.0.0-rc.20260526174124)
  │     └─ DR-design-013 발행 의무 (TreePicker + ThumbnailDropTarget + ghost preview tokens) — 별도 PR
  │
  ├─ P1 (D2-D5): weave.item.reparent 명령 통합
  │     ├─ B. weave.item.reparent 명령 (commands.ts) + ratio 계산 + oldState capture + cycle guard
  │     ├─ helper findDescendantSet (agocraft-mirror.ts)
  │     └─ commands.test.ts 의 7 신규 unit
  │
  ├─ P2 (D6-D9): Surface 3종 (병렬 가능)
  │     ├─ C. modifier drag (FrameStage)
  │     ├─ D. ThumbnailPanel drop target
  │     └─ E. ContextMenu "Move to…" picker
  │
  └─ P3 (D9-D12): e2e + 마무리
        ├─ G. 4 e2e spec
        ├─ visual smoke (ghost / outline / disabled state)
        ├─ 전체 e2e 재실행 (잔여 17 flaky 외 신규 fail 0 의무)
        └─ LG-001 conditional close-out 통보
```

**Contingency** (RISK-007 condition #2, #9): agocraft HANDOFF-013 가 D6 (2026-06-01) 까지 미응답 시 v1.1 로 미룸. weave-local patch 조합 (3-patch) 회피책은 거부 — atomicity / undo 회복 모두 깨짐.

---

## 3. P1 — `weave.item.reparent` 명령

### 3.1 명령 구조

**위치**: `apps/web/src/document/commands.ts`

HANDOFF-002 의 정정 사항 반영: agocraft 의 `ReparentEntry` shape 가 `{ itemId, oldParentId, oldIndex, oldFrameRatio, newParentId, newIndex, newFrameRatio }` 의무. weave command 가 패치 발행 전에 oldState (oldParentId / oldIndex / oldFrameRatio) 를 모두 미리 계산해야 invertPatch 의 z-order index 복원이 정상 동작.

```ts
type ReparentInput = {
  readonly entries: ReadonlyArray<{
    readonly itemId: string;
    readonly newParentId: string; // root 의 경우 doc.root.id
  }>;
};

createCommand<ReparentInput, void>({
  id: "weave.item.reparent",
  run(ctx, input) {
    const { entries } = input;
    if (entries.length === 0) return ok(undefined, []); // no-op

    // Step 1: dedupe (호출자 책임 — agocraft 검증 안 함). 같은 itemId 가
    // 2번 박제되면 마지막만 적용 (Map 으로 dedupe).
    const dedup = new Map<string, (typeof entries)[number]>();
    for (const e of entries) dedup.set(e.itemId, e);
    const uniqueEntries = [...dedup.values()];

    // Step 2: cycle guard — 3-tier 방어의 2번째 (1번째 = surface UI
    // disabled). agocraft 측은 검증 안 함 (HANDOFF-002 §3) 이므로 host
    // 가 PR-blocker.
    for (const e of uniqueEntries) {
      if (e.newParentId === e.itemId) {
        return err({ code: "weave.reparent.cycle", entry: e });
      }
      const descendants = findDescendantSet(ctx.document, e.itemId);
      if (descendants.has(e.newParentId)) {
        return err({ code: "weave.reparent.cycle", entry: e });
      }
    }

    // Step 3: 각 entry 의 oldState + newState 모두 계산.
    const designW = ctx.document.attrs?.background?.width ?? DEFAULT_DESIGN_W;
    const designH = ctx.document.attrs?.background?.height ?? DEFAULT_DESIGN_H;

    const patchEntries: ReparentEntry[] = [];
    for (const e of uniqueEntries) {
      const cur = findParentAndIndex(ctx.document, e.itemId);
      if (cur === undefined) continue; // unknown item — skip
      const item = findItemDeep(ctx.document, e.itemId);
      if (item === undefined) continue;
      const newParent = findItemDeep(ctx.document, e.newParentId);
      if (newParent === undefined) continue;

      const oldParentAbsBox = absoluteFrameBox(
        ctx.document, String(cur.parent.id), designW, designH);
      const newParentAbsBox = absoluteFrameBox(
        ctx.document, e.newParentId, designW, designH);
      const itemAbsBox = absoluteFrameBox(
        ctx.document, e.itemId, designW, designH);
      if (oldParentAbsBox === null || newParentAbsBox === null || itemAbsBox === null) {
        continue;
      }

      // 새 부모 기준 ratio = (itemAbsBox - newParentAbsBox) / newParentAbsBox.size
      const newFrameRatio = {
        x: (itemAbsBox.x - newParentAbsBox.x) / newParentAbsBox.w,
        y: (itemAbsBox.y - newParentAbsBox.y) / newParentAbsBox.h,
        width: itemAbsBox.w / newParentAbsBox.w,
        height: itemAbsBox.h / newParentAbsBox.h,
        // rotation 은 v1 = 부모/자식 모두 unchanged (axis-aligned only)
      };
      // 옛 부모 기준 ratio = item.attrs.frame (이미 그 형식, 직접 read)
      const oldFrameRatio = (
        item.attrs as { frame: FrameRatio }
      ).frame;

      patchEntries.push({
        itemId: itemId(e.itemId),
        oldParentId: cur.parent.id,
        oldIndex: cur.indexInParent,
        oldFrameRatio,
        newParentId: itemId(e.newParentId),
        newIndex: newParent.children.length, // v1 = 새 부모 children 끝에 append
        newFrameRatio,
      });
    }

    if (patchEntries.length === 0) return ok(undefined, []);

    // Step 4: 단일 patch 발행
    return ok(undefined, [{ type: "item.reparent", entries: patchEntries }]);
  },
});
```

**의존 helper** (agocraft-mirror.ts 의 기존 export):
- `findParentAndIndex(doc, itemId)` — 현재 부모 + index
- `findItemDeep(doc, itemId)` — item 본체
- `absoluteFrameBox(doc, itemId, designW, designH)` — design-space absolute box
- `findDescendantSet(doc, itemId)` — 신규 helper (cycle 검증용, P1 같이 구현)

### 3.2 helper `findDescendantSet`

**위치**: `apps/web/src/document/agocraft-mirror.ts` (기존 findTrailDeep / findItemDeep 와 같은 module)

```ts
export function findDescendantSet(
  doc: AgocraftDocument,
  itemId: string,
): ReadonlySet<string> {
  const item = findItemDeep(doc, itemId);
  if (item === undefined) return new Set();
  const ids = new Set<string>();
  function walk(node: AgocraftItem): void {
    ids.add(String(node.id));
    for (const c of node.children) walk(c);
  }
  walk(item);
  return ids; // 자기 자신 포함 — cycle 검증의 의미상 자기 자신도 차단
}
```

**의도**: cycle 검증 = "newParentId 가 itemId 의 descendant 인가" → 자기 자신도 descendant 로 간주해 단일 set 으로 검증. surface UI 도 동일 helper 로 disabled 결정.

### 3.3 단위 테스트 (commands.test.ts 의 7 신규)

| Test | Scenario |
|---|---|
| reparent / 단일 entry / 자식 frame → 다른 frame | ratio 변환 정확성 (sample bbox math), 단일 history entry |
| reparent / 다중 entry (2 items) | 단일 patch, 단일 Cmd+Z 가 doc deep-equal 회복 |
| reparent / root → frame | newParentId 가 doc.root.id 아닌 일반 frame, 정상 |
| reparent / frame → root | newParentId = doc.root.id, 정상 |
| reparent / cycle (자기 자신) | err REPARENT_CYCLE, patch 0 |
| reparent / cycle (자기 조상) | err REPARENT_CYCLE, patch 0 |
| reparent / 빈 entries | ok + patch 0 + state unchanged |

---

## 4. P2 — Surface 3종

### 4.1 C. Modifier drag (FrameStage)

**파일**: `apps/web/src/pages/FrameStage.tsx` (현재 pointer handler 에 modifier 분기 추가)

**아키텍처 (SRP 분리)**:

- FrameStage 의 pointer down → modifier read 만 (intent 식별)
- "intent = reparent" 시 별도 컨트롤러 `useReparentDragController(editor, designSize, selection)` 가 mode state + ghost render + drop target detection 소유
- 컨트롤러는 React-agnostic (pure controller + minimal hook wrapper). agocraft 의 `@agocraft/input/bus` 의 pointer event 구독 사용 가능 (기존 hotkey 모듈과 동일 dep)

**구현 요지**:

```tsx
// FrameStage.tsx 의 pointer down handler 안
const onPointerDown = (e: PointerEvent, itemId: string) => {
  const isReparentIntent = (e.metaKey || e.ctrlKey) && e.shiftKey;
  if (isReparentIntent && selection !== null) {
    // 시작 시점 결정 — hand-off 없음
    reparentController.begin({
      entries: selectionToEntries(selection),
      startPoint: { x: e.clientX, y: e.clientY },
    });
    e.preventDefault(); // 평소 translate 진입 차단
    return;
  }
  // 평소 처리 (translate / marquee / etc.)
};
```

**컨트롤러 의 상태**:

```
mode: "idle" | "reparent-active"
ghostPosition: { x, y } | null  // cursor 따라옴
hoveredDropTarget: { kind: "frame" | "thumbnail" | "root"; id: string } | null
```

**Drop target detection**:

- main canvas frame: `document.elementFromPoint` 로 cursor 아래 element → `[data-frame-id]` attribute 추적 → frame id
- ThumbnailPanel thumbnail: panel 영역 진입 시 panel 자체의 `onDragOver` 가 hoveredDropTarget 갱신 (panel 이 컨트롤러에 register)
- 자기 자신 + 자기 조상 frame 은 invalid drop — hover 시 cursor:not-allowed, drop 시 skip

**Drop 처리**:

```ts
const onPointerUp = (e: PointerEvent) => {
  if (controller.mode !== "reparent-active") return;
  const target = controller.hoveredDropTarget;
  if (target !== null && isValidDropTarget(target, entries)) {
    editor.exec("weave.item.reparent", {
      entries: entries.map(e => ({ itemId: e.itemId, newParentId: target.id })),
    });
  }
  controller.end();
};
```

**Ghost preview**:

- 별도 컴포넌트 `<ReparentGhostOverlay entries={...} position={...} />` — DOM 위치 `position: fixed`, opacity 0.5, 평소 selection 의 bbox outline + 색상 약화
- main canvas 의 selection chrome 은 reparent mode 중 그대로 (원본 위치 indicator)

### 4.2 D. ThumbnailPanel drop target

**파일**: `apps/web/src/pages/ThumbnailPanel.tsx`

**변경**:

```tsx
// ThumbnailPanel.tsx 의 frame thumbnail 렌더
<ThumbnailDropTarget
  frameId={entry.id}
  disabled={isInvalidReparentTarget(entry.id, reparentEntries)}
  onDrop={() => editor.exec("weave.item.reparent", { entries: reparentEntries.map(e => ({ ...e, newParentId: entry.id })) })}
>
  <FrameThumbnail entry={entry} ... />
</ThumbnailDropTarget>
```

**Drag source 분기**:

- panel 내부 drag 시작 = reorder (기존 동작 그대로) — indicator: thumbnail 사이 라인
- main canvas 외부 drag 시작 = reparent — indicator: thumbnail outline highlight

분기는 컨트롤러의 `mode` 가 `reparent-active` 인지로 판정. panel 의 `onDragOver` 가 컨트롤러 read.

**Disabled state**:

`isInvalidReparentTarget` = `findDescendantSet(doc, itemId).has(thumbnailFrameId)` for any entry. true 면 disabled.

### 4.3 E. ContextMenu "Move to…" picker

**파일**: `apps/web/src/document/contextmenu/FrameContextMenu.tsx` + 신규 `apps/web/src/document/contextmenu/MoveToPicker.tsx`

**ContextMenu 항목**:

```tsx
<ContextMenuItem
  testId="ctx-move-to"
  onSelect={() => setMoveToOpen(true)}
  shortcut={null}
>
  Move to…
</ContextMenuItem>
```

**Picker dialog** (별도 컴포넌트):

```tsx
<TreePicker
  open={moveToOpen}
  onOpenChange={setMoveToOpen}
  tree={designFrameTree(doc)} // 전체 frame + "Design root" 옵션
  disabled={(frameId) => isInvalidReparentTarget(frameId, entries)}
  onSelect={(frameId) => {
    editor.exec("weave.item.reparent", {
      entries: entries.map(e => ({ itemId: e.itemId, newParentId: frameId })),
    });
    setMoveToOpen(false);
  }}
  title="Move to…"
/>
```

**Tree 데이터**:

```ts
type FrameTreeNode = {
  readonly id: string;
  readonly label: string; // attrs.name ?? frame.{id 7자}
  readonly depth: number;
  readonly children: FrameTreeNode[];
};
function designFrameTree(doc: AgocraftDocument): FrameTreeNode { /* walk doc.root */ }
```

---

## 5. Modifier 결정 — `Cmd/Ctrl + Shift + drag`

**기존 modifier 박제 (대화 박제 2026-05-27)**:

| Modifier | 현재 의미 | 출처 |
|---|---|---|
| `Shift + click` | additive toggle 선택 | FrameStage.tsx:656 |
| `Cmd/Ctrl + click` | deep select (frame 내 자식 직접) | FrameStage.tsx:658 |
| `Alt (drag)` | rubber-band 의 copy mode (cursor: copy) | RubberBandLayer.tsx:402 |
| `Shift` (ThumbnailPanel) | skipToIsolate cycle focus | ThumbnailPanel.tsx:206 |
| `Cmd/Ctrl + wheel` | zoom | FrameStage.tsx:1267 |
| `Mod+Z / Mod+Shift+Z` | undo / redo | editor-hotkeys.ts |
| `Mod+] / Mod+[` | bring/send extreme | editor-hotkeys.ts |
| `Shift+Enter / Shift+Tab` | selection drillUp / prevSibling | editor-hotkeys.ts |

**Reparent 후보 평가**:

| 후보 | 충돌 / 인접 | 결정 |
|---|---|---|
| `Alt + drag` | Alt = copy mode 점유 | 거부 |
| `Cmd + drag` | Cmd+click 의 deep select 와 인접 (사용자 학습 부담) | 거부 |
| `Shift + drag` | Shift+click 의 additive selection 과 강한 충돌 | 거부 |
| **`Cmd + Shift + drag`** | 현재 미사용 (Mod+Shift+Z 외 drag/click 표면에 점유 X). 양손 자연 (왼손 Cmd+Shift / 오른손 drag). macOS 관습 = "확장된 의도적 동작" | **채택** |
| `Cmd + Alt + drag` | Alt = copy 의미 / Cmd 와 조합 시 모호 | 거부 |

**채택**: `Cmd/Ctrl + Shift + drag`.

플랫폼:
- macOS: `e.metaKey && e.shiftKey`
- Win/Linux: `e.ctrlKey && e.shiftKey`

---

## 6. Design System Triage

| Surface | Triage Step | Outcome | DR-design 발행 의무 |
|---|---|---|---|
| ContextMenu "Move to…" 항목 | Step 1 | Reused — 기존 ContextMenuItem + onSelect | 불필요 |
| TreePicker dialog | **Step 3 — Grew** | 신규 primitive (`@weave/design-system/TreePicker`). Dialog + TreeView + Search 합성. Radix 의 Dialog + 자체 트리 컴포넌트 | **필요 — DR-design-013** |
| ThumbnailDropTarget outline / disabled | **Step 3 — Grew** | 신규 state variant 또는 신규 primitive — 기존 FrameThumbnail 위 outline + cursor:not-allowed slot | **필요 — DR-design-013** |
| Ghost preview overlay | Step 2 — Extended | 기존 selection bbox outline + opacity / pointer-events:none 변형. design token 추가만 (예: `--reparent-ghost-opacity: 0.5`) | DR-design-013 안에 통합 박제 |
| Disabled thumbnail tooltip | Step 1 | 기존 Tooltip primitive + 라벨 | 불필요 |

**DR-design-013 발행 의무** — Build 진입 전. design-system-agent 의 sign-off 가 PR-block.

---

## 7. SOLID + GRASP 박제

| 원칙 | 적용 |
|---|---|
| **SRP** | FrameStage = intent 식별만. Controller = mode + ghost + detection. command = ratio 계산 + cycle guard + patch. surface 3 종은 dispatch 만. |
| **OCP (Rule 6)** | 3 surface 가 모두 `editor.exec("weave.item.reparent", entries)` 단일 진입점. 새 surface 추가 시 command body 변경 0. |
| **LSP** | TreePicker / ThumbnailDropTarget 는 design-system 의 일반 컴포넌트 — 다른 surface 가 같은 컴포넌트 import 시 동일 동작 보장. |
| **ISP** | command 입력 type 은 `{ entries }` 만 — surface 가 필요한 dispatch shape 만 노출. controller 의 API 도 `begin / end / hoveredDropTarget` 4 method 만. |
| **DIP** | Controller 가 editor / selection / designSize 를 인자로 받음. 구체 React state 의존 X. |
| **GRASP Info Expert** | ratio 변환 = doc + designSize 보유한 command body 의 책임. cycle 검증 = doc 트리 walk 보유한 helper / command 의 책임. |
| **GRASP Low Coupling** | agocraft 의 `item.reparent` patch 한 종류로 결합 점 단일화. surface 3 종은 patch shape 무관. |

**Rule 6 (declarative branching)**: surface 별 mode 분기 (translate / marquee / reparent) 는 FrameStage 의 pointer handler 의 *intent* registry 로 — 향후 추가 mode (e.g., zoom-pan) 시 같은 registry 확장. body 의 if-else 가 아닌 modifier → intent table.

---

## 8. 한계 / 알려진 갭 (v1)

| # | 한계 | trace |
|---|---|---|
| 1 | 회전된 ancestor 의 정확한 bbox = axis-aligned only | RISK-007 §10, WI-038 동일 한계 |
| 2 | 새 부모 children 의 z-index 지정 drop | v1 = 항상 끝에 append. v1.x |
| 3 | Auto-scroll / pan-while-drag | v1.x |
| 4 | TreePicker 의 큰 디자인 virtualization | v1 = flat list (≤ 500 frame 가정). RISK-007 §8 |
| 5 | Layers panel surface | weave 부재. v1.x |
| 6 | drag 중 viewport zoom 변화 시 ghost 위치 보정 | v1 = ghost position fixed in screen space (zoom 변화 무관). v1.x 의 design-space 추적 |

---

## 9. e2e

| Spec | 시나리오 |
|---|---|
| `reparent-modifier-drag.spec.ts` | Cmd+Shift+drag 가 item 의 reparent → 시각 위치 보존 + Cmd+Z 로 deep-equal 회복 |
| `reparent-thumbnail-drop.spec.ts` | 동일 동작이 ThumbnailPanel drop. 자기 자신 thumbnail disabled cursor + drop 무반응. |
| `reparent-context-menu.spec.ts` | "Move to…" picker → 트리 항목 클릭 → reparent. cycle 후보 disabled UI 확인. |
| `reparent-multi-selection.spec.ts` | 2+ 선택 후 한 번의 reparent → 단일 Cmd+Z 가 모두 복원. |

각 spec 의 **공통 의무**:

- 시각 위치 보존 — reparent 전/후 absoluteFrameBox 의 pixel ±0.5 tolerance.
- Cmd+Z 후 doc deep-equal (단일 entry) 또는 selection 보존 (다중 entry).
- 회귀 0: 잔여 17 flaky cluster 외 신규 fail 없음.

---

## 10. SLA / contingency

- **D6 (2026-06-01)** — agocraft HANDOFF-013 미응답 시 v1.1 미루기. weave-local patch 조합은 거부 (atomicity / undo 회복 깨짐).
- **D9 (2026-06-04)** — DR-design-013 미머지 시 design-system primitive 의 inline 임시 컴포넌트 시도하지 말 것. v1.1 미루기.
- **D11 (2026-06-06)** — P3 (e2e) 미완 시 v1 머지 거부. v1.1 미루기.
- **v1.1 미루기 시 회피 경로**: 사용자는 "지우고 다시 추가" 로 reparent 효과 흉내. RISK-007 §9 의 명시 박제.

---

## 11. Acceptance / Sign-offs

- [ ] HANDOFF-013 응답 도착 + vendor refresh
- [ ] DR-design-013 발행 + design-system primitive (TreePicker + ThumbnailDropTarget) 머지
- [ ] WI-039 의 acceptance criteria 13 항목 모두 PASS
- [ ] RISK-007 의 7 conditions 모두 충족
- [ ] frontend-architecture-agent sign-off (controller 분리 + Rule 6 modifier intent registry)
- [ ] frontend-performance-agent sign-off (ghost overlay 60Hz 무리 없음 + TreePicker ≤ 500 frame 무리 없음)
- [ ] design-system-agent sign-off (DR-design-013)
- [ ] LG-001 conditional close-out (선택사항 — 미달 시 v1.1)

---

## 12. Cross-references

- WI-039 (triggering work item)
- RISK-007 (10 risks / 7 conditions)
- HANDOFF-013 (agocraft 의 patch variant 요청)
- WI-038 (absoluteFrameBox helper 재사용, axis-aligned 한계 공유)
- WI-033 (figma-frame-ux selection model — Cmd-click deep / parent-first)
- WI-032 (frame-only paradigm — parent 의 의미 통일)
- LG-001 (conditional close-out 후보)
- DR-design-013 (발행 예정)
