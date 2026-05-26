# Work Item — WI-038

## Metadata

| Field | Value |
|---|---|
| ID | WI-038 |
| Title | Z-order restore — selection-driven hotkeys + ContextMenu (frame-only paradigm regression fix) |
| Owner | hbpark |
| Status | Done (Phase 1 + Phase 2) |
| Severity | P1 (broken core editor operation; visible to every user; not data-loss) |
| Created | 2026-05-26 |
| Target date | 2026-05-26 |
| Closed | 2026-05-26 |

## Summary

WI-032 frame-only paradigm 이후 z-order(레이어 이동) 가 사실상 동작 안함. 유일한 표면이 Peek mode 의 PointStackInspector 였고, 그 컨트롤러가 `doc.root.children` 만 인덱싱하는데 frame-only 이후 root.children 은 wrapping frame 하나뿐이라 reorder 할 stack 자체가 없음. 또한 선택된 아이템에 대한 키보드 / ContextMenu 표면이 처음부터 부재. 결과 = 사용자는 z-order 를 트리거할 방법이 사실상 없음.

이 WI 는 추가 표면을 도입해 z-order 가 "아이템·프레임 상관없이" 작동하도록 회복.

## Scope

**In scope**:

- 4 신규 weave 명령 `weave.item.bringForward / sendBackward / bringToFront / sendToBack` (`apps/web/src/document/commands.ts`). 각 명령은 입력 `{ itemId }` 를 받아 해당 아이템의 *직접 부모 컨테이너* 를 lookup, `item.children.reorder` 단일 patch 를 발행. 부모 lookup 헬퍼 `findParentAndIndex` 를 `agocraft-mirror.ts` 에 추가 (기존 `findTrailDeep` 재사용).
- 4 신규 EditorCommand metadata + hotkey binding (Figma 표준: `]` / `[` / `⌘+]` / `⌘+[`) + `category: "arrange"`. host slot `setZOrderDispatcher` 를 통해 React-agnostic 으로 wiring.
- DesignPage 에서 `setZOrderDispatcher` 닫힘 closure 등록 (현재 선택 frame id 를 `selectedFrameIdRef` 로 resolve).
- FrameContextMenu 에 4 ContextMenuItem 추가 ("맨 앞으로 / 앞으로 / 뒤로 / 맨 뒤로", shortcut 라벨 + `ctx-bring-to-front|forward|send-backward|send-to-back` testid). 우클릭한 frame.id 를 직접 dispatch 하므로 선택 상태 의존 없음.
- 단위 테스트 12 (root-level 4 방향 + no-op 4 boundary + 중첩 2 + 에러 1 + parent itemId 1).
- e2e spec 1 (`zorder-restore.spec.ts`) — editor.exec / hotkey `]` / 중첩 컨테이너 3 시나리오 + 각각 Cmd+Z 회복.

**In scope (Phase 2 — 사용자 요청 2026-05-26)**:

- Peek mode (PointStackInspector + capture-layer drag) 가 root.children 만 인덱싱하던 WI-019 의 가정을 폐기. `usePeekMode` 가 새 prop `containerId: string | undefined` (default = root) 를 받아 그 컨테이너의 children 을 인덱싱.
- `agocraft-mirror.ts` 에 helper `absoluteFrameBox(doc, itemId, designW, designH)` 추가 — 부모 trail 을 따라 attrs.frame ratio 를 합성, 중첩 아이템의 design-space absolute axis-aligned bbox 계산 (rotation 무시 — axis-aligned hit-test 가정).
- DesignPage: `[peekContainerId, setPeekContainerId]` state + selectedFrameId 의 부모를 lookup 하는 useEffect 추가. 선택된 아이템의 부모 컨테이너가 peek 의 container 가 됨. 선택 없으면 root.
- DesignPage: 새 `reorderChildrenInContainerViaEditor(localOrderAsc, containerId)` — PeekModeController 의 onCommit 이 LOCAL stack 의 새 순서만 주는 것을 받아, 컨테이너의 un-lifted children 과 merge 후 단일 permutation 으로 `weave.design.reorderChildren` dispatch. WI-019 의 reorderRootChildren 머지 의미와 동일, 어떤 컨테이너에도 일반화.
- DesignPage `hitTestLifted` / `labelFor` / `swatchFor` 가 root.children 만 보던 부분 → `findItemDeep` + `absoluteFrameBox` 사용으로 중첩 아이템 지원.
- e2e 2 신규 spec: peek L+drag 가 root 레벨 + 선택된 nested frame 안에서 commit 후 Cmd+Z 회복.

**Out of scope (deferred)**:

- agocraft 의 표준 `registerZOrderCommands` (`moveAboveCommand` / `moveBelowCommand` / `moveToTopCommand` / `moveToBottomCommand`) 채택 — 이미 `ZORDER_CAPABILITY` 어댑터가 root.children 에만 매핑되어 있어 별도 refactor 필요. weave-local 명령 4 개로 동일 효과 + 더 단순.
- 다중 선택 z-order — `multi.*` 카테고리에서 별도 추가 (현재 single-id 입력만).
- Command palette 노출 — 이미 `editorCommandMetadata` 자동 등록으로 palette 가 enable 되면 함께 보임.
- Rotated parent 의 nested bbox — 현재 axis-aligned only. 회전된 ancestor 가 있는 경우 hit-test 가 어긋남. v1 launch 후 별도 검토.

## Acceptance criteria

- [x] `pnpm typecheck` PASS.
- [x] `pnpm test` PASS (117/117 unit, 22 in commands.test.ts 중 신규 12).
- [x] `pnpm declarativecheck` + `pnpm puritycheck` PASS.
- [x] `pnpm build` PASS.
- [x] `pnpm e2e e2e/zorder-restore.spec.ts` 3/3 PASS.
- [x] 전체 e2e 재실행 — 신규 fail 없음 (잔여 17 fail 모두 시작점 기준의 알려진 flaky cluster: ai-tooltip × 5 / text-item × 4 / tooltip-editor × 3 / multi-marquee × 4 / multi-select-click × 1; 베이스라인에서도 동일).
- [x] 우클릭 ContextMenu 에 "맨 앞으로 / 앞으로 / 뒤로 / 맨 뒤로" 4 항목 표시 + 단축키 라벨 (`⌘ ]` / `]` / `[` / `⌘ [`).
- [x] 선택 frame 에 `]` / `[` / `⌘+]` / `⌘+[` hotkey 발사 시 부모 컨테이너 children 안에서 즉시 reorder.
- [x] Cmd+Z 가 모든 z-order 이동을 1 step 으로 revert.

## Context

사용자 보고 2026-05-26: "현재 레이어이동(z-order) 기능이 동작하지 않고있어 아이템 프레임 상관없이 잘 동작해야해". 진단 = WI-032 paradigm shift 후 peek mode 단독 surface 의 회귀 + 처음부터 부족했던 selection-driven surface.

LG-001 (text-item v1 launch) 2026-06-08, 13일 전 — z-order 회복은 core editor expectation 으로 launch blocker 잠재성. 이 WI 로 close.

## Escalation triggers (check before starting)

- [x] UI / UX change → ContextMenu primitive 와 hotkey 만 사용, design-system 새 컴포넌트 0. Triage Step 1 (Reused, ContextMenuItem `shortcut` slot 기존 사용). Design Review 불필요.
- [ ] User data — N/A
- [ ] Payment — N/A
- [ ] AI feature — N/A
- [ ] Public page — N/A
- [ ] Library / dependency — N/A
- [x] Release → LG-001 conditional 추가 close-out 항목.

## Technical Feasibility verdict

- FR record: 생략 (표준 paradigm — 4 명령 + 단일 patch type 이미 존재 `item.children.reorder`)
- Verdict: FEASIBLE
- Accepted trade-offs: hotkey `]` / `[` 는 plain 키라 영어 키보드 외 layout 에서 일부 IME 와 race 가능. KeyboardEvent.code (BracketRight / BracketLeft) 가 아닌 key 매칭. 한국어 IME 는 punctuation 통과 확인됨 (e2e 환경). 향후 IME 충돌 보고 시 `IME_SAFE_TOOL_BINDINGS` 패턴 따라 code-based 로 이전 가능.

## Links

- Related Decision Records (DR-*): 본 WI 내 § Scope 가 결정 명세를 흡수 (단일 PR 묶음).
- Related Risk reviews (RISK-*): 없음 (no data risk; UI-only restoration).
- Related Feasibility Reviews (FR-*): 없음.
- Related Handoffs (HANDOFF-*): 없음.
- Related Incidents (INC-*): 없음.
- Related Engineering Plan: 본 WI 내 § Scope 가 plan 대체 (4 명령 + 4 metadata + 1 ContextMenu 블록 + 1 host slot, ~200 LOC scope).
- Related Launch Gate (LG-*): LG-001 close-out 항목으로 등록.

## Implementation notes

- Patch type 은 HANDOFF-007 (agocraft 신규 4 patch variant) 의 `item.children.reorder` 를 그대로 재사용. 따라서 agocraft 측 변경 0.
- `weave.design.reorderChildren` (기존) 는 그대로 유지 — peek mode 가 여전히 사용. WI-038 의 4 명령은 단일 아이템 입력 → 자동 부모 lookup 이라 호출 표면이 다름.
- z-stacking 컨벤션: paint order = doc order. `children[0]` = 가장 뒤(bottom), `children[N-1]` = 가장 앞(top). "Bring forward" = index+1 swap, "Send backward" = index-1 swap, "Bring to front" = splice to end, "Send to back" = splice to start.
- No-op (boundary 도달 or 1-element parent) 는 `ok(undefined, [])` 반환 → history entry 발생 안 함.
- ContextMenu 가 우클릭한 frame id 를 직접 dispatch 하므로 (선택 상태 의존 안 함), 우클릭으로 즉시 reorder 가능 — Figma parity.

## Status updates

- 2026-05-26: WI 생성. 1 세션에 Build + Verify + Test + e2e + 레코드 박제 모두 완료.
- 2026-05-26: Phase 1 — 117/117 unit, 3/3 신규 e2e, typecheck/declarativecheck/puritycheck/build 모두 PASS.
- 2026-05-26: Phase 2 — 사용자 후속 보고 "L 모드 진입 후 드래그 변경이 아직 동작 안함". 진단: WI-019 의 PeekModeController 가 root.children 만 인덱싱했고, WI-029 R1 Step 2 가 onCommit 을 partial-permutation 을 거부하는 `weave.design.reorderChildren` 으로 교체하면서 두 번째 잠재 회귀가 생김. usePeekMode + DesignPage 를 컨테이너-인식으로 확장. 117/117 unit + 5/5 신규 e2e (3 Phase 1 + 2 Phase 2) PASS. typecheck/declarativecheck/puritycheck/build PASS. 전체 e2e 잔여 18 fail (baseline 17 + figma-quickaction-add timing flaky 1; standalone PASS). WI Done.
