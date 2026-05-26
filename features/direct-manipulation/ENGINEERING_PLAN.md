# Engineering Plan — Direct manipulation (PoC: corner radius drag) — WI-031

| Field | Value |
|---|---|
| Feature | `direct-manipulation` (theme; PoC = corner radius inward-drag) |
| Owner | hbpark |
| Triggering WI | WI-031 |
| Status | **Proposed** (2026-05-25) |
| FR verdict | FR-004 = **FEASIBLE** (no trade-off) |
| Risk verdict | RISK-003 = **GO WITH CONDITIONS** (3 condition) |
| Decisions | TBD (DR for propertyDrag slot generalization — after PoC) |
| Cross-project | none (PoC weave-local; pattern 정착 시 agocraft promotion) |
| Last updated | 2026-05-25 |

---

## 1. Scope

### In scope (PoC)

- `ManipulationCapability.propertyDrag` slot 신설 (single property at PoC scope).
- `canvas-shape` capability 에 cornerRadius propertyDrag 박제.
- `image` capability 신규 — 현재 `image` 는 manipulation capability 미보유 (검증 필요). 있으면 확장, 없으면 신규.
- Selection chrome: 코너마다 inner dot 핸들 4개 추가 (resize handle 외각 정사각 옆에).
- Gesture binding: 새 helper `createFramePropertyDragBinding`.
- Commands: `weave.shape.setCornerRadius` + `weave.image.setBorderRadius`.
- History: mergeKey 로 60Hz drag collapse.
- Keyboard: 핸들 focus 시 arrow keys 로 0.05 increment.
- Telemetry: drag vs. slider 사용 비율.
- e2e: 1 spec.

### Out of scope (PoC)

- 다른 속성 (opacity, padding, shadow, gradient).
- PropertiesPanel 의 슬라이더 제거 — 공존 유지.
- 코너별 개별 radius (`cornerRadii.tl/tr/br/bl` 분리) — 4-corner-uniform.
- 모바일 / 터치.

---

## 2. Surfaces and touchpoints

### 2.1 `apps/web/src/document/manipulation/types.ts`

추가:
```ts
readonly propertyDrag?: ReadonlyArray<{
  readonly id: string;                   // "cornerRadius" 등 식별자
  readonly axis: "inward-from-corner" | "vertical" | "horizontal" | "free";
  readonly anchor: "corner" | "edge" | "center";
  readonly range: readonly [number, number];   // 0..1 또는 0..1 등 정규화 단위
  readonly apply: (target: T, value: number) => void;
  readonly mergeKey: (target: T) => string;
}>;
```

SOLID/GRASP:
- [x] OCP — slot 자체가 array 라 PoC 외 속성 (opacity, padding…) 추가 시 array entry 추가만.
- [x] OS Rule 6 — 호출자는 `capability.propertyDrag?.find(p => p.id === handleId)` 로 lookup. `switch (propertyId)` 없음.

### 2.2 `apps/web/src/document/manipulation/capabilities/canvas-shape.ts`

기존 `move` / `resize` / `rotate` 옆에 `propertyDrag` 박제:
```ts
propertyDrag: [{
  id: "cornerRadius",
  axis: "inward-from-corner",
  anchor: "corner",
  range: [0, 0.5],   // shape.subAttrs.cornerRadii 의 ratio 단위
  mergeKey: (t) => `propertyDrag:cornerRadius:${t.itemId}`,
  apply: (target, value) => {
    editor.exec("weave.shape.setCornerRadius", {
      itemId: target.itemId,
      value,   // 4-corner-uniform
    });
  },
}],
```

### 2.3 (신규) `apps/web/src/document/manipulation/capabilities/image-frame.ts`

Image kind 용 capability 신규 (현재 image 의 manipulation 상태 확인 필요). cornerRadius 의 의미: `image.attrs.borderRadius`.

### 2.4 `apps/web/src/document/selection-chrome/frame-default-view-model.tsx`

handles() 에 추가 — capability.propertyDrag 가 있는 kind 만:
```ts
for (const corner of ["nw", "ne", "se", "sw"] as const) {
  out.push({
    id: `propertyDrag-cornerRadius-${corner}`,
    anchor: { type: "corner", corner, insetPx: 12 },  // 코너 안쪽
    render: () => <CornerRadiusHandle dir={corner} />,
    order: 20,   // resize(10) 보다 위 layer
  });
}
```

`CornerRadiusHandle` = 신규 host-local component. `SelectionHandleButton` 의 작은 dot variant. Design System Triage 시점에 design-system 확장 vs. host-local 결정.

### 2.5 (신규) Gesture binding helper

`apps/web/src/document/manipulation/property-drag-binding.ts`:
- pointerDown → cursor capture + mergeKey 시작.
- pointerMove → drag inward distance 측정 → normalized value → capability.propertyDrag[i].apply.
- pointerUp → release + history merge window close.
- Keyboard fallback (focused handle + arrow keys) — value ± 0.05.

### 2.6 `apps/web/src/document/commands.ts`

신규 2 command:
- `weave.shape.setCornerRadius({ itemId, value })` — `item.attrs.subAttrs.cornerRadii` (4 corner uniform) patch.
- `weave.image.setBorderRadius({ itemId, value })` — `item.attrs.borderRadius` patch.

둘 다 mergeKey 통해 history collapse.

### 2.7 PropertiesPanel — 변경 없음

`apps/web/src/document/toolbar/sections/image-section.tsx:112` 의 borderRadius slider 보존. 같은 attrs path 갱신 → 양방향 sync 자동.

### 2.8 Telemetry

`apps/web/src/document/telemetry.ts` (현재 위치 확인 필요) 에 2 event:
- `corner-radius:adjusted-via-drag` (canvas drag)
- `corner-radius:adjusted-via-panel` (PropertiesPanel slider)

---

## 3. Phase plan

### Phase 1 — Slot + Shape capability + Selection handle (3 일)

- [ ] `ManipulationCapability.propertyDrag` slot 정의 + types 갱신.
- [ ] `canvas-shape.ts` capability 에 propertyDrag entry.
- [ ] `frame-default-view-model.tsx` 에 cornerRadius 4 handle 추가 (capability 가 있는 kind 에만).
- [ ] `CornerRadiusHandle` 시각 컴포넌트 (Design System Triage 의무).
- [ ] `property-drag-binding.ts` gesture helper.
- [ ] `weave.shape.setCornerRadius` command + mergeKey + unit test (60 patch → history += 1).
- [ ] e2e: `apps/web/e2e/corner-radius-drag.spec.ts` — drag → assert visual change → Cmd+Z → assert revert.

**Exit**: shape 만 동작. image 미적용.

### Phase 2 — Image capability 확장 (1 일)

- [ ] image manipulation 의 현재 상태 확인 (capability 유무).
- [ ] `image-frame.ts` capability 신규 또는 기존 확장.
- [ ] `weave.image.setBorderRadius` command.
- [ ] e2e: 동일 spec 에 image kind case 추가.

### Phase 3 — Keyboard + telemetry (1 일)

- [ ] cornerRadius handle 의 `aria-label` + `role="slider"` + arrow-keys.
- [ ] Telemetry 2 event wire.
- [ ] e2e: keyboard arrow → value 변화 검증.

### Phase 4 — 30-일 telemetry observation + theme 판단

- [ ] T+30d 데이터 박제. drag 사용 비율 ≥ 30% 이면 Theme 의 다음 PoC (opacity drag) 진행.
- [ ] 데이터로 DR 발행 — Direct manipulation 의 호응이 v2 paradigm shift 의 근거인지.

---

## 4. CI gates

- 기존 `pnpm verify` chain 그대로.
- `declarativecheck` — 새 핸들 dispatch 가 registry + adapter (no switch).
- 신규 unit test — 60 patch → history += 1 (RISK-003 R2 condition).

---

## 5. Acceptance criteria

WI-031 § AC 그대로. 핵심:
- Shape + Image 두 kind 모두 동작.
- `Cmd+Z` 한 번 = 0 복귀.
- PropertiesPanel 슬라이더 양방향 sync.
- Keyboard arrow key support.
- Telemetry event 2종 emit.

---

## 6. Open questions

- **Q1**: `SelectionHandleButton` 에 `corner-inner` variant 추가 (design-system PR) vs. host-local 신규 컴포넌트. → Design System Triage 시점에 결정.
- **Q2**: 4-corner-uniform 의 cornerRadius 와 shape.subAttrs.cornerRadii (`{tl,tr,br,bl}`) 의 매핑. PoC 는 4 corner 동일 값으로 set; v1.x 에서 코너별 individual support 별도 WI.
- **Q3**: image 의 `borderRadius` 가 0..1 ratio 인데 shape 의 cornerRadii 도 같은 단위인가? 코드 확인 필요 — 다르면 capability adapter 가 매핑.
- **Q4**: agocraft 로 promotion 시점 — PoC 동작 후 Theme 의 2 번째 PoC 결정 시점에 검토. propertyDrag slot 이 frame binding 의 generic helper 로 자리잡을 가능성.

---

## 7. Dependencies

- DR-010 (ManipulationCapability) — 기존 인프라.
- DR-018 (selection view-model) — 기존 인프라.
- WI-029 (text v1) — 무관. Text 는 PoC scope 밖.
- WI-030 (slide presets) — 무관. 별도 line.

---

## 8. Specialist consultations

- `design-system-agent` — Phase 1 시작 시 Triage. `SelectionHandleButton` 확장 vs. host-local 결정.
- `accessibility-agent` — Phase 3 시작 시 review. arrow keys / aria roles.
- `frontend-perf-agent` — Phase 1 종료 시 60Hz drag 의 jank 검증.

---

## 9. Status updates

- 2026-05-25: Plan drafted. WI-031 + FR-004 + RISK-003 박제 완료. Build 는 별도 세션.
