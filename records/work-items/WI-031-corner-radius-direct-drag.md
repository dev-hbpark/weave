# WI-031 — Corner radius direct-drag (PoC for "Direct manipulation 완성도")

## Metadata

| Field | Value |
|---|---|
| ID | WI-031 |
| Title | Selection 코너 안쪽으로 드래그 → border-radius 직접 조절 — Direct manipulation 완성도 theme 의 첫 PoC |
| Owner | hbpark |
| Status | **Proposed** (PoC 결정 박제 2026-05-25 — Direct manipulation theme + 1 항목 실험 scope) |
| Severity | P3 (single PoC. 결과로 theme 의 진행/중단 판단) |
| Created | 2026-05-25 |
| Target date | 2026-06-01 (단일 surface, ~3-5 일 작업 추정) |
| Closed | — |

## Summary

weave 의 편집 UX 가 multiple surface (ContextualToolbar / PropertiesPanel / ContextMenu / ThumbnailPanel) 로 분산돼 있다. "Direct manipulation 완성도" theme — **속성을 캔버스에서 직접 잡고 끌어서 바꿀 수 있는 idiom 확장** — 의 첫 실험으로, **shape 와 image kind 의 코너를 안쪽으로 드래그하면 border-radius 가 증가**하는 Figma signature interaction 을 박제한다. PropertiesPanel 의 "Border Radius" 입력란을 제거하지 않고 **공존**시켜 사용자 행동을 측정 (캔버스 드래그 사용 vs. 패널 슬라이더 사용 비율). 결과로 theme 의 향후 surface (opacity, padding, shadow 등) 추가 여부 판단.

## Scope

### In scope (PoC)

- **ManipulationCapability 의 `propertyDrag` slot** 신설 — 기존 `move` / `resize` / `rotate` 옆에 4번째 핸들 카테고리. (`apps/web/src/document/manipulation/types.ts`)
- **Shape capability 에 cornerRadius drag** 추가 — `apps/web/src/document/manipulation/capabilities/canvas-shape.ts` 의 인접 위치에 신규 capability 추가.
- **Image kind 에도 동일 drag** — `image.attrs.borderRadius` (0..1 ratio of min(w,h)) 사용.
- **Selection chrome 의 새 핸들** — `frame-default-view-model.tsx` 의 8 resize handle 옆에 4개 cornerRadius handle (코너마다, resize handle 보다 작은 inner-side dot). 시각적으로 구분 (resize = 외각 square, cornerRadius = 내각 dot).
- **Gesture binding** — agocraft 의 `createFrameResizeBinding` 패턴 참고하여 `createPropertyDragBinding` (이름은 PoC 단계에서 weave-local). pointer down → drag inward distance 측정 → cornerRadius (0..1) 갱신.
- **History 통합** — drag 종료 시 단일 `weave.shape.setCornerRadius` / `weave.image.setBorderRadius` command 발행, 단일 history entry. 진행 중에는 mergeKey 로 60Hz drag 를 collapse.
- **PropertiesPanel 슬라이더 공존** — 제거하지 않음. 두 surface 가 동일 attrs 갱신.
- **Telemetry**: `cornerRadius:adjusted-via-drag` vs. `cornerRadius:adjusted-via-panel` 사용 비율 측정.
- **e2e**: playwright spec 1 — "shape 선택 → 코너 inward drag 30px → borderRadius 가 0 → 0.x 로 변화 → Cmd+Z 회복".

### Out of scope (PoC)

- 다른 속성 (opacity / padding / shadow / gradient) 의 direct-drag — Theme 의 후속 PoC.
- PropertiesPanel 의 borderRadius UI 제거 — A/B 데이터 수집 후 별도 결정.
- 다른 kind (text / canvas-design / block-doc / slide / media / video) 의 코너 드래그 — shape + image 로 한정.
- 도형별 코너별 개별 radius (shape 의 `cornerRadii: {tl, tr, br, bl}`) — v1 PoC = 4-corner-uniform.
- 모바일 / 터치 — desktop pointer 만.

### Explicitly deferred

- ManipulationCapability slot 의 정식 design (open registry vs. switch) — PoC 후 패턴 굳히고 DR 발행.
- Theme 의 v2 plan — PoC telemetry 데이터 후 product decision.

## Acceptance criteria

### Default mandatory

- [ ] `pnpm verify` PASS — `lint`, `tokencheck`, `declarativecheck`, `puritycheck`, `typecheck`, `test`, `build`.
- [ ] `pnpm e2e` PASS — 신규 spec `apps/web/e2e/corner-radius-drag.spec.ts` GREEN.
- [ ] `declarativecheck` — 새 핸들 dispatch 가 registry + adapter (no `switch (handleKind)`).

### Feature-specific

- [ ] Shape Item 선택 시 코너에 작은 inner dot 핸들 표시 (resize handle 과 시각적으로 구분).
- [ ] Dot 핸들 안쪽 드래그 → borderRadius (또는 shape.subAttrs.cornerRadii) 가 비례 증가.
- [ ] 드래그 중 실시간 시각 반영 (60 Hz, jitter 없음).
- [ ] 드래그 종료 → 단일 history entry. `Cmd+Z` 한 번에 0 으로 복귀.
- [ ] Image Item 도 동일 동작 (`image.attrs.borderRadius` 갱신).
- [ ] PropertiesPanel 의 borderRadius 슬라이더와 양방향 sync (캔버스 드래그 → 슬라이더 값 갱신, 슬라이더 → 캔버스 시각 갱신).
- [ ] Telemetry event 2종 emit.
- [ ] 30-일 telemetry 결과 (캔버스 드래그 vs. 슬라이더 사용 비율) 박제 후 Theme 다음 PoC 진행 판단.

## Context

- 사용자 (hbpark) 2026-05-25 명시: "기존 다큐먼트의 수정 방식을 전면 개선" + "PoC 먼저 — 1 항목 실험" + "Corner radius 안쪽-드래그".
- 현재 weave 의 편집 surface 가 ContextualToolbar / PropertiesPanel / ContextMenu / ThumbnailPanel / hover-affordance / RubberBand / inline-edit 7+ 개로 분산. 마우스 동선 비용 큼.
- Figma 의 signature direct-manipulation idiom (코너 안쪽 드래그 = radius) 은 user education 비용이 거의 0 (이미 친숙). 첫 PoC 로 안전.
- weave 의 manipulation 인프라 (DR-010 ManipulationCapability + selection chrome 의 view-model 패턴) 이 이미 성숙. 새 핸들 추가는 기존 패턴의 단순 확장.
- LG-001 의 conditional 항목 중 "broader Ops maturity" 와 직접 관련 없음 — 별도 v1.x 영역.

## Escalation triggers

- [ ] User data → 없음
- [ ] Payment / billing → 없음
- [ ] AI feature → 없음
- [x] UI / UX change → Design System Triage 진행. Step 1 (Reused, `SelectionHandleButton` 신규 variant 추가) 또는 Step 3 (Grew, 새 handle kind) 판단 필요.
- [ ] Public page → 없음
- [ ] Library / dependency → 없음
- [ ] Release → v1 launch 의 conditional close item 아님 (post-v1 candidate).

## Technical Feasibility verdict

- FR record: FR-004 (issue 예정 — lightweight)
- Verdict: TBD (FEASIBLE 예상; 기존 manipulation 인프라 단순 확장)
- 의존:
  - agocraft 의 frame resize/rotate binding 패턴이 propertyDrag 에도 재사용 가능한지.
  - SelectionHandleButton 의 신규 variant 추가가 design-system 변경인지 host-local 합성인지.

## Links

- Related Decision Records (DR-*): DR-010 (Manipulation Capability), DR-018 (selection view-model)
- Related Risk reviews (RISK-*): RISK-003 (issue 예정 — lightweight)
- Related Feasibility Reviews (FR-*): FR-004 (issue 예정)
- Related Handoffs (HANDOFF-*): 없음 (v1 weave-local; pattern 굳으면 agocraft 로 promotion 검토)
- Related Engineering Plan: `features/direct-manipulation/ENGINEERING_PLAN.md` (issue 예정)
- Related Launch Gate (LG-*): 없음 (post-v1)
- Related WI: WI-027 (Hover affordance — Direct manipulation theme 의 인접 작업), WI-029 (Text v1 — 코너 = box only paradigm 의 정렬)

## Status updates

- 2026-05-25: WI 박제. 사용자 결정 = Direct manipulation 완성도 theme + PoC scope + corner radius 첫 항목. FR-004 + RISK-003 + Engineering Plan 후속.
