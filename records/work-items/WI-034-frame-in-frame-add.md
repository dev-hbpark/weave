# WI-034 — Frame-in-frame add UX (drag → frame's child)

## Metadata

| Field | Value |
|---|---|
| ID | WI-034 |
| Title | frame 안의 빈 영역에서 Alt+drag → 그 frame 의 child 로 새 item 추가. 현재는 frame 위 drag 가 rubber-band 에서 reject 되어 root.children 만 add 가능. |
| Owner | hbpark |
| Status | **Done** (2026-05-26 — Option A 채택 + 구현 + e2e PASS) |
| Severity | P1 (WI-033 의 user-visible gap — frame 안 add 의 UI path 부재) |
| Created | 2026-05-26 |
| Target | v1 patch (T-0 2026-06-08 이후, post-launch hotfix 가능) |

## Summary

WI-033 의 Figma selection model + drill-in 폐기 후, **frame 의 child item 을 사용자가 추가할 수 있는 UI 경로가 없다**:

- **현재 작동**: design plane 의 빈 영역 (frame 외부) 에서 **Alt+drag** → `weave.item.add` → `containerId = root.id`. 즉 root.children 의 새 frame 만 추가.
- **frame 안 drag**: `RubberBandLayer` 의 `acceptTarget = emptyRegionAccept` (`FrameStage.tsx:1803`) 가 `target.closest("[data-frame-id]") === null` 검사 — **frame 위는 reject**.
- **결과**: frame 안에 item 을 넣을 UI path = **없음**.

WI-033 의 Out-of-scope (`Toolbar drag-to-add tile`, `Tool hotkey R/T/L`) + drill-in 폐기 (entered frame 의 add target 사용 불가) 의 cumulative 결과로 발생한 user-visible gap.

## Scope

### In scope

1. **`RubberBandLayer` 의 `acceptTarget` 확장** — `target.closest("[data-frame-id]") === null` 조건 제거 (frame body 의 빈 영역 OK). 단 다른 inner element 의 reject 는 유지:
   - `[data-shape-id]` (canvas shape) — reject
   - `[data-selection-layer]` (chrome) — reject
   - `[data-selection-handle-item-id]` (resize/rotate handle) — reject
   - `[data-handle-kind]` (handle type) — reject
   - `[data-hotspot-id]` — reject
   - `[contenteditable="true"]`, `input/textarea/button/a` — reject
2. **`containerId` 의 dynamic 결정** — drag 시점의 frame 위치에 따라 containerId = 가장 inner frame 의 id. (현재 RubberBandLayer props 의 containerId = root.id 고정.)
3. **e2e** — frame-in-frame-add.spec.ts 신규. parent frame 안 drag → child frame 생성 검증.

### Out of scope (v1.x)

- Toolbar drag-to-add tile (별건 backlog)
- Tool hotkey (R/T/L/F) Figma 표준 (별건 backlog)
- QuickActionBar "+" button (WI-027 hover affordance 확장)

## Architecture options (사용자 결정 필요)

### Option A — `adaptWeaveCapabilityToAgocraft` adapter 에 hit-test

- agocraft binding 의 capability.commit 호출 시 ctx.containerId = RubberBandLayer props 의 closure (root.id). adapter 가 그 ctx.containerId 를 override — 인자 rect 좌표 + doc + design size 로 hit-test → 가장 깊은 frame id.
- 의존: editor.getDocument() (이미 존재), designWidth/Height (host closure).
- **장점**: minimal change, 단일 RubberBandLayer mount 유지.
- **단점**: adapter 의 책임 확장 (도메인 layer 의 hit-test). doc / dimensions 의 closure 의무.

### Option B — Per-NestedFrame RubberBandLayer mount

- NestedFrame 의 inner 에 RubberBandLayer 추가. 각 mount 의 containerId = 자기 frame.id. acceptTarget = 자기 frame 의 body 의 빈 영역.
- **장점**: 정통, 각 frame 의 own scope. containerId 정적 (closure).
- **단점**: N frames × N RubberBandLayer mount. 다중 binding 의 priority 충돌 가능 (capture phase 의 competition).

### Option C — Outer RubberBandLayer 의 capability wrap

- FrameStage 가 default capability 를 wrap. wrap.commit 의 closure 안 doc + dimensions ref 보유 + hit-test. agocraft binding 의 commit ctx.containerId 무시.
- **장점**: single mount, wrap 의 책임 명확.
- **단점**: capability 의 shape 가 host 책임 — coupling.

**권장 = Option A** — adapter 가 이미 weave-local bridge (host-domain leak 책임), hit-test 의 추가는 자연. `editor.getDocument()` ref-based read 로 closure 안 dynamic.

## Acceptance criteria

- [x] `RubberBandLayer.acceptTarget` (= `emptyRegionAccept` in FrameStage L1810) 의 `[data-frame-id]` reject 제거.
- [x] `createFrameMoveBinding` 의 `modifiers: { alt: "forbidden", button: 0 }` — Alt+drag 시 frame move 안 함 (RubberBand 양보).
- [x] adapter (`adaptWeaveCapabilityToAgocraft`) 의 `RubberBandHitTestContext` + `resolveContainerId` — drag rect center → `findFramesAtPoint` → deepest frame 의 id 가 containerId. fallback = binding 의 static containerId.
- [x] `RubberBandLayer.getDocument` prop 추가; FrameStage mount 시 `docRef.current` closure 전달.
- [x] `pnpm verify` PASS — typecheck ✓ / declarativecheck ✓ / 105/105 unit test ✓ / build ✓.
- [x] e2e `frame-in-frame-add.spec.ts` — Alt+drag inside parent → parent.children.length +1, PASS.
- [x] WI-033 의 기존 14/14 e2e PASS 유지 (회귀 0). **합산 그룹 15/15 PASS**.
- [x] LG-002 의 v1 launch impact — WI-033 의 user-visible gap 해소. post-launch hotfix 가능했지만 launch 전 머지 가능 (Option A 의 minimal change + e2e PASS).

## Risks

- frame 안 drag 의 rubber-band 가 frame move 와 competing — priority 의 careful (FrameMove = 50 ELEMENT_BODY, RubberBand = REGION_GESTURE). agocraft binding 의 priority semantics 확인 의무.
- multi-frame multi-band 시 acceptTarget 의 boundary 정확성 (frame 의 가장자리 click 시 ambiguous).

## Links

- Triggering: WI-033 (Figma selection model 흡수 + drill-in 폐기 후 발견된 gap)
- Code site: `apps/web/src/pages/FrameStage.tsx:1803` (emptyRegionAccept), `apps/web/src/document/rubber-band/RubberBandLayer.tsx:122-221` (binding register), `apps/web/src/document/rubber-band/agocraft-adapter.ts:74` (adapter commit)
- Spec: `docs/product/INTERACTIVE_PRESENTATION_SPEC.md` §4.2 의 의도된 add path (현재 spec / 코드 mismatch)
- LG-002: post-launch hotfix candidate
