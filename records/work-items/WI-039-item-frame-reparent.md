# Work Item — WI-039

## Metadata

| Field | Value |
|---|---|
| ID | WI-039 |
| Title | Item / Frame reparent — 부모 변경 (Cmd+Shift+drag · ThumbnailPanel drop · ContextMenu picker, 좌표 보존 + 다중) |
| Owner | hbpark |
| Status | Engineering Plan in draft |
| Severity | P2 (사용자 요청, missing core editor operation; non-blocking — 회피 가능 (지우고 다시 추가)) |
| Created | 2026-05-27 |
| Target date | LG-001 (2026-06-08) 이전 가능하면 포함; 미달 시 v1.1 |
| Closed | — |

## Summary

선택한 1+ 개의 아이템/프레임을 **다른 부모 frame 또는 디자인 루트로 이동** 시키는 기능. 시각적으로 사용자가 인식하는 위치는 변하지 않도록 (새 부모의 frame box 기준 0..1 ratio 재계산), 다중 선택을 단일 patch + 단일 history entry 로 처리. 현재 weave 에는 아이템을 다른 frame 으로 옮길 어떠한 표면도 없음 (지우고 다시 추가가 유일한 우회).

3 surface 로 사용자 의도 도달:

1. **Modifier drag** — `Cmd/Ctrl + Shift + drag` 으로 main canvas 의 선택 아이템들을 끌면 drag-source 위치 lock + ghost preview 만 cursor 추종. drop 가능 target (frame / ThumbnailPanel thumbnail) 위에서 release 시 reparent.
2. **ThumbnailPanel drop target** — 위 ghost 가 ThumbnailPanel 의 frame thumbnail 위로 진입하면 그 frame outline highlight (drop indicator), release 시 그 frame 의 자식으로. 자기 자신 + 자기 조상에 해당하는 thumbnail 은 disabled (cursor: not-allowed + outline 50% opacity).
3. **ContextMenu "Move to…" picker** — 선택 아이템 우클릭 → "Move to…" → 트리 picker (현재 디자인의 모든 frame + 디자인 루트, cycle 후보는 disabled). 깊게 중첩된 frame 이나 작은 target 용 명시 경로.

세 surface 모두 동일한 단일 명령 `weave.item.reparent` 발행 → 단일 patch (`item.reparent`, multi-entry) → 단일 history entry. Cmd+Z 한 번에 복원.

## Scope

**In scope (v1)**:

- **명령 / patch (agocraft 측 신설)** — HANDOFF-002 발행:
  - `Patch` discriminated union 에 `item.reparent` variant 추가. payload = `{ entries: { itemId, newParentId, newFrameRatio: { x, y, width, height, rotation? } }[] }`. 단일 patch 가 multi-entry — atomicity 보장.
  - reducer: 각 entry 의 itemId 를 기존 부모에서 detach → 새 부모 `children` 끝에 append → attrs.frame 을 newFrameRatio 로 update. 모든 entry 단일 트랜잭션.
  - `invertPatch` 구현 — 각 entry 의 oldParentId / oldIndex / oldFrameRatio 를 inverse payload 로. Cmd+Z 가 원위치 + 원래 z-order index 복원.
  - serializer round-trip + identity 보존 (item id 변경 X). schema version bump 미정 (additive — Patch variant 추가는 forward-compat).
- **weave 측 명령** `weave.item.reparent`:
  - 입력 `{ entries: { itemId, newParentId }[] }`.
  - command body: 각 entry 의 현재 절대 design-space bbox 계산 (`absoluteFrameBox(doc, itemId, designW, designH)` 재사용, WI-038 P2 가 도입) → 새 부모의 절대 frame box → ratio 변환 → 단일 `item.reparent` patch 발행.
  - cycle guard: command body 진입 시 각 entry 에 대해 `newParentId === itemId || isDescendant(itemId, newParentId)` 검사 → 위반 시 `err({ code: "reparent.cycle", entries: [...] })` 반환, patch 발행 0.
  - 회전된 ancestor 가 있는 경우는 v1 axis-aligned only (WI-038 의 hit-test 와 동일 한계). v1.x 별도 검토.
- **Modifier drag surface** (FrameStage.tsx):
  - 결정: `Mod + Shift + drag` (macOS `⌘+⇧`, Win/Linux `Ctrl+Shift`). EP §"Modifier 결정" 박제.
  - pointer down 시점에 `e.metaKey/ctrlKey && e.shiftKey` 가 모두 true 면 mode = "reparent", 아니면 평소대로 (translate / marquee 등). 시작 시점 결정 (hand-off 아님).
  - reparent mode 진입 시: 원본 아이템들 위치 lock (translate patch 발행 X), cursor 따라오는 ghost preview render (반투명, 평소 selection bbox 의 outline + 색상 약화).
  - drop target 후보: (a) main canvas 의 frame (cursor 가 frame 안에 있을 때), (b) ThumbnailPanel 의 thumbnail. 둘 다 hover highlight (outline 강조).
  - drop 성공: `editor.exec("weave.item.reparent", { entries })` 발행 1 회. drop 실패 (캔버스 빈 공간 or disabled target): ghost 사라짐, patch 발행 0.
- **ThumbnailPanel drop target** (ThumbnailPanel.tsx):
  - drag-over hand-off: panel 영역에 ghost 가 진입하면 panel 자체가 drop-zone 으로. 개별 thumbnail 위 hover 시 outline highlight (`design-system` 의 `<ThumbnailDropTarget>` 신규 슬롯 — Design System Triage Step 3 Grew).
  - reorder drag (기존 panel 내부 drag) 와 시각 분리: reorder = thumbnail "사이" 의 라인 indicator, reparent = thumbnail "자체" 의 outline highlight. 둘 다 panel 안에서 일어나지만 drag source 가 panel 내부냐 외부냐로 분기.
  - 자기 자신 + 자기 조상에 해당하는 thumbnail 은 disabled (drop 거부 + cursor:not-allowed). Hover 시 tooltip "자기 자신/조상으로 옮길 수 없음".
- **ContextMenu "Move to…" picker** (FrameContextMenu.tsx):
  - 선택 우클릭 → "Move to…" 하위 항목 추가. 클릭 시 `<MoveToPicker open={true} entries={selection} />` 모달 dialog open.
  - Picker = 디자인의 전체 frame 트리 + "Design root" 옵션. cycle 후보 disabled. 트리 항목 click 시 그 frame 을 newParentId 로 한 reparent 발행.
  - design-system: `<TreePicker>` (Triage Step 3 — Grew, 신규 primitive). DR-design 발행 의무.
- **단위 테스트**:
  - `commands.test.ts`: 단일 reparent / 다중 reparent (단일 history) / root → frame / frame → root / cycle 거부 / 빈 entries no-op / ratio 변환 정확성 (sample bbox math) — 7 신규.
  - `agocraft` 측 patch round-trip + invertPatch 단위 — agocraft 패키지에서 5 신규 (HANDOFF-002).
- **e2e**:
  - `reparent-modifier-drag.spec.ts` — Cmd+Shift+drag 로 item 을 다른 frame 위로 → reparent 발생 + 시각 위치 보존 + Cmd+Z 복원.
  - `reparent-thumbnail-drop.spec.ts` — 동일 동작 ThumbnailPanel drop. 자기 자신 thumbnail disabled 확인.
  - `reparent-context-menu.spec.ts` — "Move to…" picker → 트리 항목 클릭 → reparent. cycle 후보 disabled UI 확인.
  - `reparent-multi-selection.spec.ts` — 2+ 선택 후 한 번의 reparent → 단일 Cmd+Z 가 모두 복원.

**Out of scope (v1)**:

- 회전된 ancestor 가 있는 nested reparent 의 정확한 bbox (WI-038 axis-aligned only 한계와 동일). v1.x.
- Drag-during-reparent 가 새 부모 frame 안의 특정 z-index 위치에 drop (현재 v1 = 새 부모 children 의 끝에 append). v1.x.
- Auto-scroll / pan-while-drag (drag 중 ThumbnailPanel 또는 main canvas viewport 가 자동 스크롤). v1.x.
- ContextMenu picker 의 frame thumbnail preview (현재 텍스트 라벨 only). v1.x.
- ThumbnailPanel 외 layers panel — weave 에 아직 layers panel UI 자체가 없음. v1.x.

## Acceptance criteria

- [ ] `pnpm typecheck` PASS.
- [ ] `pnpm test` PASS (신규 7 + 회귀 0).
- [ ] `pnpm declarativecheck` + `pnpm puritycheck` PASS.
- [ ] `pnpm build` PASS.
- [ ] `pnpm e2e e2e/reparent-*.spec.ts` 4/4 PASS.
- [ ] 전체 e2e 재실행 — 신규 fail 없음 (잔여 17 알려진 flaky cluster 변화 없음 확인).
- [ ] Cmd+Shift+drag 가 main canvas 의 frame / item / multi-selection 에서 작동, ghost preview 시각 확인.
- [ ] ThumbnailPanel thumbnail 위로 drop → 그 frame 의 자식으로 reparent + 시각 위치 보존.
- [ ] 자기 자신 + 자기 조상 thumbnail 이 disabled outline + cursor 변화.
- [ ] FrameContextMenu "Move to…" 가 picker 열고 트리 항목 클릭으로 reparent 발생.
- [ ] 단일 Cmd+Z 가 다중 reparent 전체를 1 step 으로 revert.
- [ ] HANDOFF-002 응답 도착 + agocraft 의 신규 `item.reparent` patch variant publish (vendor refresh).
- [ ] DR-design 발행 (TreePicker primitive + ThumbnailDropTarget outline state).

## Context

사용자 요청 2026-05-27 (대화 박제): "아이템 또는 프레임을 다른 부모 프레임 또는 디자인루트로 이동할수있는 기능". 결정 세션:

1. 시각적 위치 보존을 위한 새 부모 ratio 재계산 — 의무.
2. 다중 선택 reparent — 같이 진행.
3. ThumbnailPanel 활용 — 좋은 생각. drag 동안 원본 위치 lock + ghost preview, cycle 후보 disable.
4. modifier `Cmd+Shift+drag` — 기존 modifier 충돌 검사 후 결정 (Alt = copy 점유, Cmd 단독 = deep select 인접, Shift 단독 = additive selection 충돌; Cmd+Shift 만 free).
5. drop indicator = thumbnail outline highlight (vs reorder = thumbnail 사이 line — 시각 분리).
6. drag 시작 즉시 mode 결정 (modifier read at pointer-down).

LG-001 (text v1 launch) T-0 = 2026-06-08, D-12. reparent 자체는 LG-001 의 conditional list 에 없으나 "core editor expectation 결락" 으로 launch 전 가능하면 포함이 이상적. paradigm shift (WI-032 frame-only) 이후 frame-in-frame 이 보편화되며 reparent 부재의 마찰이 더 커진 맥락.

## Escalation triggers (check before starting)

- [x] UI / UX change → **Design System Triage Step 3 Grew × 2 (TreePicker primitive, ThumbnailDropTarget outline state) + Step 1 Reused × 1 (ContextMenuItem with sub-menu trigger)**. Design Review 발행 의무. EP §"Design System Triage" 박제.
- [ ] User data — N/A
- [ ] Payment — N/A
- [ ] AI feature — N/A
- [ ] Public page — N/A
- [x] Library / dependency → agocraft 측 신규 patch variant + reducer + invertPatch. HANDOFF-002 발행 의무 (records/decision-handoffs/).
- [x] Release → LG-001 conditional 추가 close-out 후보 (deadline 미달 시 v1.1).

## Technical Feasibility verdict

- FR record: 생략 — paradigm 이 routine (parent change + coordinate transform 는 표준 캔버스 편집 패턴, weave 의 frame-only paradigm 위에 ratio recalc 만 추가). agocraft 의 patch / reducer / invertPatch 추가도 기존 `item.children.reorder` / `item.move` 패턴의 확장. intrinsic ceiling 미접촉.
- Verdict: **FEASIBLE**
- 한계 인지: 회전된 ancestor 가 있는 경우의 정확한 bbox 가 axis-aligned only — WI-038 의 hit-test 와 같은 v1 한계. EP §"한계 / 알려진 갭" 박제.

## Risk verdict

- RISK-007 (cycle / atomicity / ratio drift / modifier 충돌 / disabled affordance) — 발행 예정. GO WITH CONDITIONS 가정.

## SOLID + GRASP

- **SRP**: drag 의 mode 분기 (translate / marquee / reparent) 는 FrameStage 의 pointer handler 가 intent 식별만 담당. 실제 reparent 계산은 selection-context (좌표) + commands.ts (patch) 가 분담. ghost preview 는 별도 컴포넌트.
- **OCP / Rule 6**: 3 surface (drag / thumbnail drop / picker) 가 모두 같은 `weave.item.reparent` command dispatch → 새 surface 추가 시 command 본문 변경 0. cycle guard 도 command body 의 단일 책임 — 각 surface 는 cycle 가능 여부를 *display* 만 (disabled UI), 최종 검증은 command.
- **DIP**: TreePicker / ThumbnailDropTarget 은 design-system 의 추상 컴포넌트 — surface 가 구체 DOM 의존성을 가지지 않음.
- **GRASP Information Expert**: ratio 변환은 doc 트리 + viewport 정보를 가진 selection-context 의 책임 (이미 absoluteFrameBox 보유).

## Related records

- Spec: 별도 spec 신설 안 함 (단일 명령 / EP 안에 충분히 박제 가능).
- DR-019 (modifier 결정): 별도 DR 미발행 — EP §"Modifier 결정" 박제 + 본 WI 의 Context 7번. WI-038 도 동일하게 별도 DR 없이 박제.
- HANDOFF-002 (agocraft `item.reparent` patch variant): 발행 예정.
- RISK-007: 발행 예정.
- DR-design-013 (TreePicker + ThumbnailDropTarget outline): 발행 예정 (Triage Step 3 Grew × 2).
- LG-001: conditional close-out 후보.
- 관련 WI: WI-032 frame-only paradigm (parent 의 의미 통일), WI-033 figma-frame-ux selection model (Cmd-click deep / parent-first), WI-038 zorder-restore (absoluteFrameBox helper 재사용).
