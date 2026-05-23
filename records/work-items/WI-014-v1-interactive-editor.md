# Work Item — WI-014

## Metadata

| Field | Value |
|---|---|
| ID | WI-014 |
| Title | v1 — Properties panel + manual camera-target + hotspot visual editor + new interaction kinds |
| Owner | hbpark |
| Status | Done (Phase 13a~13d-4 모두 완성, 2026-05-23) |
| Severity | P1 |
| Created | 2026-05-23 |
| Source | `docs/product/INTERACTIVE_PRESENTATION_SPEC.md` §7 v1 |
| Target | M2 시점 (interactive 편집 완성) |

## Summary

Phase 12 까지 v0 (frame paradigm + 편집 + zoom drill-in + Present) 완성. v1 의 핵심 = **interactive 편집의 UI 박제**. spec §6.1 의 future zone "Right panel (Properties)" 를 토대로 camera-target 수동 / hotspot region visual editor / 새 trigger 도입.

## Phased plan

- [x] **13a** Properties panel skeleton — selected frame attrs + interactions list (4/4 e2e PASS)
- [x] **13b** camera-target 의 수동 position / scale + manual toggle (PresentPage 가 manual 시 그 값 사용)
- [x] **13c-1** hotspot add path (`useDesign.addBehavior`) + region.x/y/w/h / action.type / label number-input editor
- [x] **13c-2** hotspot region 의 visual overlay + drag-move (frame 안 SelectionLayer-style)
- [x] **13d-1+2** schema 확장 (hover-effect / button-trigger / entrance-animation) + PropertiesPanel add menu + 각 kind 의 edit row
- [x] **13d-3** PresentPage 의 entrance-animation visual 적용 (Web Animations API + 4 modes + prefers-reduced-motion)
- [x] **13d-4** hover-effect / button-trigger 의 PresentPage 동작 (PresentScene 의 hover state + cross-scene dim + click → action dispatch)

## Acceptance

- [x] `PropertiesPanel` selected frame 일 때만 mount, close button 으로 deselect
- [x] frame x/y/w/h/rotation 의 number input edit → attrs.frame 갱신
- [x] 도메인 별 title/heading/caption/summary edit
- [x] interactions list — kind / order / label / action 표시
- [x] camera-target 의 manual 토글 + position.x/y/scale edit → behavior 갱신 + PresentPage 가 사용
- [x] `+ Hotspot` 버튼 → 새 hotspot unit 박제
- [x] hotspot region.x/y/w/h / action.type / label 의 number-input edit
- [x] selected frame 안 hotspot 의 visual overlay (dashed border, click 으로 select, body drag 으로 region.x/y 갱신)
- [ ] 새 InteractionKind (hover-effect / button-trigger / entrance-animation) 박제 + Properties panel 의 "Add interaction" 메뉴 확장

## Status updates

- 2026-05-23: WI-014 발행. v0 (Phase 12) 다음 단계. spec §7 v1 의 의 의 구현.
- 2026-05-23: **Phase 13a 완성** — `PropertiesPanel.tsx` 박제 (floating fixed right, selected frame 일 때만 mount). Card + FieldGroup + TextField + IconButton 재사용. frame x/y/w/h/rotation number input + 도메인 attr (title/heading/caption/summary) input + interactions list (kind/order/label read). DesignPage 에서 `findItemDeep(docInAgocraft, selectedFrameId)` 으로 selected frame 의 AgocraftItem 전달. **3/3 e2e PASS** (properties-panel.spec.ts).
- 2026-05-23: **Phase 13b 완성** — `CameraTargetBehavior.manual?: boolean` schema 추가. PresentPage 의 cameraTargets useMemo 가 manual === true 시 behavior.position/scale 사용, 아니면 frame center auto. PropertiesPanel 의 InteractionRow 의 camera-target 분기에 position.x/y + scale number input + `manual ✓ / auto ✦` 토글. 어떤 값 변경 시 자동 manual=true. **4/4 e2e PASS**.
- 2026-05-23: **Phase 13c-1 완성** — `useDesign.addBehavior(itemId, behavior)` setter (새 Unit append + meta updatedAt). PropertiesPanel 의 "+ Hotspot" 버튼 → 새 hotspot { region:{0.4,0.4,0.2,0.2}, trigger:click, action:next-camera, label:"Hotspot" }. hotspot row 의 label / region.x/y/w/h 의 number input + action.type select (next-camera/jump-camera/reveal/external). **5/5 e2e PASS**.
- 2026-05-23: **Phase 13c-2 완성** — FrameStage 의 NestedFrame 안에 selected frame 일 때 모든 hotspot region overlay (dashed border + label badge). region click → setSelectedHotspotId (DesignPage state). selected hotspot 의 region body 의 pointerdown drag → parent rect 의 0..1 ratio 변환 → onCommitHotspotRegion → editor.exec("weave.behavior.update"). selected 상태 의 visual = solid accent border + body bg highlight. **6/6 e2e PASS** (drag-move 검증 포함).
- 2026-05-23: **현재 stage** — 13a/b/c-1/c-2 끝. 32/32 e2e (1 fixme) + 56/56 unit + typecheck + validate 67/27/27. Phase 13d (hover-effect / button-trigger / entrance-animation) 다음.
- 2026-05-23: **Phase 13d-1+2 완성** — `InteractionBehavior` union 에 `HoverEffectBehavior` (effect: highlight/dim-others/reveal), `ButtonTriggerBehavior` (HotspotAction 의 region 없는 버전), `EntranceAnimationBehavior` (mode: fade/slide-up/slide-down/zoom-in, step, durationMs) 추가. `unitToBehavior` 의 kind 검증 확장. PropertiesPanel 의 "Add interaction" 박제 4 버튼 (Hotspot/Hover/Button/Animation). 각 kind 의 InteractionRow edit UI (label / effect / action.type / mode / step / duration). **7/7 e2e PASS** (properties-panel.spec.ts).
- 2026-05-23: **Phase 13d-3 완성** — `PresentScene` wrapper 컴포넌트 (entranceBehavior + isActiveStep + ariaCurrent). useEffect 으로 활성 step 시 `element.animate(entranceKeyframes(mode), { duration, easing, fill })`. 4 modes (fade/slide-up/slide-down/zoom-in) 의 keyframes 박제. prefers-reduced-motion 시 skip. data-entrance-mode attribute 박제. **34/34 e2e + 56/56 unit PASS**. hover-effect / button-trigger 의 PresentPage 동작은 별 13d-4.
- 2026-05-23: **Phase 13d-4 완성** — `PresentScene` 의 hover state + button click. **(a) hover-effect**: `effect: highlight` → 자기 scene 의 scale 1.04 + shadow glow. `effect: dim-others` → PresentPage 의 `hoveredEntry` state 갱신 → 다른 scenes 의 `isDimmed` prop 으로 opacity 0.3. `effect: reveal` → target id scene 의 `isRevealedByHover` (hover 중에만 visible). **(b) button-trigger**: scene click → `dispatchAction(action)` 호출. PresentPage 의 통합 `dispatchAction` 함수 박제 (`next-camera` / `jump-camera` / `reveal` / `external`) — 기존 hotspot dispatch 와 동일 paradigm. data-is-hovering / data-hover-effect / data-is-dimmed / data-button-action attributes 박제 (e2e 검증). **35/35 e2e + 56/56 unit + typecheck + validate 67/27/27 PASS**. **WI-014 Done**.
