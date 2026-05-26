# FR-004 — Corner radius direct-drag (PoC)

## Metadata

| Field | Value |
|---|---|
| ID | FR-004 |
| Title | Selection 코너 inward drag → border-radius 직접 조절. 기존 ManipulationCapability + selection chrome 인프라로 가능한가 |
| Author | claude (technical-feasibility-agent role) |
| Status | Draft |
| Created | 2026-05-25 |
| Related WI | WI-031 |

## Verdict

**FEASIBLE**. 추가 trade-off 없음. PoC scope 가 좁아 검증해야 할 boundary 도 좁다.

## Boundaries checked

### B1 — `ManipulationCapability` 에 propertyDrag slot 추가 가능?

**답: 가능. 기존 패턴 그대로 확장.**

근거:
- `apps/web/src/document/manipulation/types.ts:31-55` 에 `move?` / `resize?` / `rotate?` 세 optional slot 이 있다. 4번째 `propertyDrag?` 슬롯 추가 = 단일 인터페이스 확장. 기존 capability (canvas-shape) 는 그대로.
- Registry (`registry.ts`) 는 capability 자체를 키-값으로 보관할 뿐 슬롯 종류를 알지 않음. 변경 0.
- selection chrome 의 view-model 이 자기 핸들 카탈로그를 렌더하는 패턴 (`frame-default-view-model.tsx:50-89`) 이 이미 OCP 준수. 새 view-model 또는 기존 view-model 에 4 코너 dot 추가 가능.

### B2 — Gesture binding 재사용 가능?

**답: 부분 가능. resize binding 패턴 참고 + property-drag 전용 helper 신규.**

근거:
- agocraft 의 `createFrameResizeBinding` 는 pointer down → drag delta (dw, dh, dir) → `apply()` 호출. 동일한 lifecycle 을 cornerRadius 에 그대로 쓸 수 있지만 delta 의 의미가 다름 (drag inward distance → radius value, not size).
- 새 helper `createFramePropertyDragBinding({ axis: "inward-from-corner", apply: (delta01) => …, mergeKey })` 를 작성. agocraft 으로 promote 는 PoC 가 정식 패턴화된 후.
- mergeKey = `"propertyDrag:cornerRadius:" + itemId` → 60Hz drag 가 단일 history entry 로 collapse (CLAUDE.md mutation rule § historyMergeWindowMs).

### B3 — Shape 의 cornerRadii 와 Image 의 borderRadius schema 가 다른데 어떻게?

**답: capability adapter 가 kind 별로 정확한 attrs 키를 알고 갱신.**

근거:
- Shape: `shape.subAttrs.cornerRadii: { tl, tr, br, bl }` (seed.ts:174). PoC 는 4-corner-uniform 이므로 모두 같은 값 set.
- Image: `image.attrs.borderRadius: number` (0..1 ratio, seed.ts:147). 단일 값.
- capability 가 `apply(delta01)` 를 받아 자기 kind 의 schema 로 매핑. 호출자는 schema 모름. **Information Expert (GRASP)** 그대로.

### B4 — 명령 + 단일 history entry?

**답: 가능. WI-029 R2 의 `weave.item.addBehavior` 와 동일 패턴.**

근거:
- 신규 command `weave.shape.setCornerRadius({ itemId, value })` 와 `weave.image.setBorderRadius({ itemId, value })`. 각 command 가 `item.attrs` patch 반환.
- mergeKey 로 60Hz drag 가 한 history entry 로 collapse. WI-029 의 텍스트 input 처럼 검증된 패턴.

### B5 — PropertiesPanel 슬라이더와 양방향 sync 자동?

**답: 자동.**

근거:
- 슬라이더가 갱신하는 attrs path (image-section.tsx:115 `attrs: { ..., borderRadius: v }`) 와 캔버스 드래그가 갱신하는 path 가 동일. Document state 가 single source of truth, slider 가 `sharedValue` 로 읽음 (`image-section.tsx:39`). 캔버스 드래그가 attrs 변경 → slider 자동 re-render.

### B6 — Design System Triage 결과?

**답: Step 1 (Reused) + 작은 Step 2 (Extended) 가능성.**

근거:
- `SelectionHandleButton` (memory based) 가 `kind: "edge" | "corner" | "rotation"` 3 종을 노출. 4번째 kind `"corner-inner"` (코너 안쪽 dot) 추가가 필요할 수 있음.
- Step 1 (Reused) — existing handle 의 size/color variant 로 합성 가능하면 design-system 변경 0.
- Step 2 (Extended) — 새 variant prop 필요하면 design-system PR 1개 (작은 변경).
- Step 3 (Grew, 새 primitive) 는 불필요. Triage 결과는 코드 시점에서 명확화.

## Trade-offs

없음. PoC scope 좁아 의도적 trade-off 가 등장하지 않는다.

## Open dependencies

- agocraft 의 frame binding API 가 weave-local helper 로 wrap 가능한지 확인 (Build 시점 검증).

## Decision

**FR-004 verdict = FEASIBLE**. WI-031 그대로 진행. Engineering Plan 으로 넘어가도 무방.
