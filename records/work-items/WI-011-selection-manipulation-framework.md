# Work Item — WI-011

## Metadata

| Field | Value |
|---|---|
| ID | WI-011 |
| Title | Selection + Manipulation capability framework — open registry of per-target adapters + canvas-shape 의 첫 적용 |
| Owner | hbpark |
| Status | In Progress |
| Severity | P1 (사용자 명시 — 모든 아이템 의 선택 + 도메인 별 다른 manipulation) |
| Created | 2026-05-22 |
| Target date | 2026-06-19 (5 step 의 단계별) |
| Closed | — |

## Summary

사용자 가 모든 도메인 (canvas / slide / doc / media / block-level) 의 아이템 의 선택 + manipulation 을 원함, **단 도메인 별 의 동작이 다름** (canvas=자유, doc paragraph=라인 reorder + font-size, slide bullet=동일, block-level=reorder 만). agocraft 의 `DR-005` (capability registry) + 우리의 `DR-009` (interaction registry) 패턴 의 정확 application — **ManipulationCapability registry** 의 의도된 open extension point.

## Scope — phased

### Step 1 (이 라운드)

- WI-011 발행 + DR-010 (Manipulation Capability Registry) + DR-design-004 (SelectionLayer + SelectionHandle)
- Shape schema 확장 — `{ id, x, y, width, height, rotation, hue }`. storage v2 → v3 migration.
- Capability framework — `apps/web/src/document/manipulation/{types, registry, capabilities}.ts`
- `canvas-shape` capability adapter — free move + free resize (center 기준) + rotation (center 기준)
- Design-system 의 `SelectionLayer` + `SelectionHandle` 새 primitives
- `@agocraft/input/bus` 의 pointer drag 의 실 활용 (Phase 3 의 두 번째 swap)
- CanvasBlock 의 Edit mode 의 selection state + visual ring + 8 handles + rotation handle
- single click selection (Shift+click multi 의 visual ring 박제 — group manipulation 은 별 라운드 deferred)
- Hotkey scope `canvas.editing` 의 register — Esc (선택 해제), Backspace/Delete (shape 제거)
- e2e — 첫 4-5 시나리오 (click select / move drag / resize / rotate / hotkey)
- SVL gate `pnpm verify` 자동 PASS

### Step 2 (별 라운드)

- doc-paragraph capability adapter — vertical move (line reorder), font-size resize, line add/remove
- DocBlock 의 selection 의 적용

### Step 3 (별 라운드)

- slide-bullet capability adapter (Step 2 와 동일 패턴)
- slide-title capability adapter (font-size only)

### Step 4 (별 라운드)

- block-level (top-level Item) capability — vertical reorder (drag-and-drop block move), delete

### Step 5 (별 라운드)

- drag-rect multi-select + group move (모든 도메인 통합)
- agocraft hotkey 의 Cmd+A / Shift+click 의 multi-add 의무
- Group resize / rotate (canvas 안 multi-shape) — 더 큰 의도

### Out of scope (영구)

- Pixel-perfect snapping (smart guides) — production stage M5+
- Z-order (bring to front / send to back) — Step 4 후 의 별 WI
- Group / ungroup operation — production stage
- Constrain (Shift 의 의도된 axis lock) — Phase 2 의 의도된 의무. PoC narrow 의 의도 안
- 회전 의 의도된 keyboard arrow 등 의 ergonomics — production

## Acceptance criteria (Step 1)

- [ ] `records/work-items/WI-011-selection-manipulation-framework.md` (이 파일) Status=Done.
- [ ] `records/decisions/DR-010-manipulation-capability-registry.md` Accepted.
- [ ] `records/design-reviews/DR-design-004-selection-primitives.md` Accepted.
- [ ] `apps/web/src/document/types.ts` 의 `CanvasShape` 확장 (id, width, height, rotation). `schemaVersion 3`.
- [ ] `apps/web/src/document/storage.ts` 의 v2 → v3 migration.
- [ ] `apps/web/src/document/manipulation/{types, registry, capabilities/canvas-shape.ts}` 박제.
- [ ] `packages/design-system/src/components/{SelectionLayer, SelectionHandle}.tsx` 추가.
- [ ] `@agocraft/input/bus` 의 pointer subscribe 의 실 활용 (CanvasBlock 안).
- [ ] CanvasBlock 의 editable 시 — single shape click + ring + move drag + 4 corner resize + rotation handle + Esc deselect + Delete remove.
- [ ] `pnpm verify` PASS (e2e ≥ 4 새 시나리오).
- [ ] WI-011 의 status update — Step 1 완성.

## Context

사용자 명시 (2026-05-22): "모든 아이템 선택 가능 + 도메인 별 동작이 다름". capability dispatch pattern 의 정확 application — open registry 의 미래 도메인 추가 가 register 한 곳.

agocraft 의 의 의도된 `@agocraft/editor` 의 selection capability — Step 5+ 의 swap 의 의도된 path. PoC 의 narrow — 자체 구현.

## Escalation triggers

- [x] **UI / UX change** — `frontend-design-pattern-agent` 의 selection / manipulation UI 패턴 사인. `frontend-performance-agent` 의 pointer drag 의 INP 사인.
- [x] **Design System Triage** — SelectionLayer + SelectionHandle = 🌱 Grew (primitives). DR-design-004 발행.
- [x] **Library / dependency** — `@agocraft/input/bus` 의 두 번째 실 활용. 새 의존 없음.
- [ ] User data — localStorage v3 의 migration. 다음 진입 시 자동.

## Links

- WI-004 / WI-009 / WI-009 Phase 3
- DR-005 (agocraft) — capability registry 의 패턴 원조
- DR-009 (interaction registry) — 동일 패턴 의 두 번째 적용
- (planned) DR-010 — manipulation capability registry
- (planned) DR-design-004 — selection primitives

## Status updates

- 2026-05-22: WI-011 발행. 사용자 결정 (모든 도메인, 도메인 별 의무). 5 step 의 단계 분리. Step 1 진입.
- 2026-05-22: **Step 1 완성**. DR-010 + DR-design-004 Accepted. CanvasShape schema 확장 (id/width/height/rotation, schemaVersion 3, v2→v3 migration 박제). Manipulation framework `apps/web/src/document/manipulation/{types, registry, capabilities/canvas-shape}` (capability dispatch). useDocument 의 updateShape/removeShape 추가. design-system 의 SelectionLayer + SelectionHandle 추가 (8 corner/edge + rotation handle, capability 의 따른 visibility). CanvasBlock 의 editable — `@agocraft/input/bus` 의 pointer drag (window scope) + move drag + resize 8 dir (center 기준) + rotation handle (atan2 center 기준). Esc / Delete hotkey. **SVL gate `pnpm verify` 13/13 PASS 13.9s** — 2 새 시나리오 (canvas shape select + ring, 8 resize handles + rotation). **첫 run 의 1 test bug 발견** — `getByRole(name:"Resize n")` non-exact 의 "Resize ne/nw" match. fix: `{ exact: true }`. Step 2-5 별 라운드.
