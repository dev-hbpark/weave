# WI-035 — Frame add UX 보강 (3 phase)

## Metadata

| Field | Value |
|---|---|
| ID | WI-035 |
| Title | WI-033 backlog 의 frame add UX 항목 3종 묶음 — Tool hotkey (R/T/L/F) + QuickActionBar "+" button + Toolbar drag-to-add tile. WI-034 의 frame-안-add 위에 multiple entry point 추가. |
| Owner | hbpark |
| Status | **Done** (P1 + P2 + P3 build + e2e PASS 2026-05-26) |
| Severity | P2 (user-affordance 보강, blocker 아님 — WI-034 가 minimum viable path 제공) |
| Created | 2026-05-26 |
| Target | v1.x (T-0 2026-06-08 후 또는 직전) |

## Scope

### P1 — Tool hotkey (R / T / L / F)

- **R** = Rectangle (shape sub-kind "rectangle")
- **T** = Text
- **L** = Line (shape sub-kind "line")
- **F** = Frame
- minimum viable = press hotkey → 현재 selected frame 의 center 영역 (또는 root center) 에 default-sized item 추가
- guard: text-edit 모드, ContextMenu open 등 — `commandContext.isTextEditing` 활용 (A3 와 같은 guard)

### P2 — QuickActionBar "+" button (WI-027 확장)

- WI-027 의 hover affordance — frame hover 시 visible action bar
- "+" button 추가 — click → menu 4 도메인 (frame / text / image / shape)
- 선택 시 hover 된 frame 의 center 에 add. 또는 menu 안 drag

### P3 — Toolbar drag-to-add tile (spec §4.2)

- Toolbar 의 horizontal row 의 4 tile (frame / text / image / shape)
- each tile = draggable, onDragStart 시 dataTransfer 의 mime `application/x-weave-add-kind` + kind
- frame 의 onDrop handler — drop 좌표의 inner frame 의 child 로 add (WI-034 의 hit-test 재사용)

## Acceptance

### P1 Acceptance — DONE

- [x] editor-hotkeys.ts 의 EDITOR_COMMANDS 에 4 신규 entry — tool.addRect / addText / addLine / addFrame
- [x] `setItemAdder` host slot — DesignPage 가 closure 등록 (selected frame center 의 add)
- [x] hotkey 의 enabledWhen = !isTextEditing (A3 와 같은 가드)
- [x] e2e: `figma-tool-hotkeys.spec.ts` — R/T/L/F + root fallback 5 spec PASS
- [x] WI-033 + WI-034 e2e 회귀 0

### P2 Acceptance — DONE

- [x] `frame.addChild` command — `visibleWhen` hover=frame + listVisible. QuickActionBar primitive (WI-027) 가 자동 mount.
- [x] `setHoverFrameChildAdder` host slot — DesignPage 가 closure 등록 (hovered frame 의 child 로 frame add).
- [x] glyph "+" — `cmd-frame-addChild` testid.
- [x] e2e: `figma-quickaction-add.spec.ts` — hover + click → child +1.

### P3 Acceptance — DONE

- [x] DropdownMenuItem (`add-text`, `add-shape-rectangle`) 의 `draggable + onDragStart` 가 `application/x-weave-add-kind` mime 박제 (text / shape).
- [x] `FrameStage.onDropAdd / onDragOver` 가 DesignPage 의 handler 로 wire — drop 시 frame element 의 `containerId` 가 routing.
- [x] handler 는 mime → kind 파싱 → 단일 `weave.item.add` SSOT 로 dispatch (P1/P2 와 같은 path).
- [x] e2e: `figma-drag-to-add.spec.ts` — text mime + shape mime 2 spec PASS (synthetic dragover + drop on frame element 으로 mime 계약 검증).
- [x] WI-033 + WI-034 + P1 + P2 의 e2e 회귀 0 — 23/23 PASS.

## Architecture

- 단일 SSOT = `weave.item.add` 명령. 모든 entry point 가 이 명령으로 dispatch.
- Tool hotkey: WI-026 의 CommandMetadata + WI-033 A3 의 `setSelectionNavigator` 패턴 차용 (`setItemAdder` host slot).
- QuickActionBar: WI-027 의 `visibleWhen` + `enabledWhen` registry 그대로. 새 `frame.addChild` command.
- Toolbar drag-to-add: dataTransfer mime + frame element 의 onDrop. WI-034 의 hit-test 재사용 가능.

## Risks

- Tool hotkey 의 single-press 동작: Figma 는 drag 의무. 우리는 single-press 의 center-add — simpler 의도. 사용자 piano 학습 비용 ↓.
- QuickActionBar 의 + button 의 menu — Layer Picker (WI-033 A4) 와 같은 ContextMenu primitive 재사용.
- drag-to-add tile 의 mime type collision — `application/x-weave-presentation-index` (ThumbnailPanel) 와 별. 새 mime 명확화 의무.

## Links

- Triggering: WI-033 backlog + WI-034 의 user-visible gap 확장.
- Spec: `docs/product/INTERACTIVE_PRESENTATION_SPEC.md` §4.2 (drag-to-add tile 의 의도된 path).
- 의존: WI-027 hover affordance (QuickActionBar primitive), WI-034 의 hit-test (frame add 의 dynamic containerId).
