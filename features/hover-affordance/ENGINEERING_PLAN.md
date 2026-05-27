# Engineering Plan — Hover affordance + InteractionMode 가드 통합 (WI-040)

## 0. 컨텍스트 + 결정 요약

3-tier hover overlay 도입과 함께 현재 누락된 InteractionMode 가드를 한 번에 정리. **편집 모드 = `InteractionMode === "idle"`** 로 확정 (기존 enum 그대로 유지). 새 hook `useEditAffordancesAllowed()` 단일 출처.

3 phase 모두 별도 PR. Phase 1 (bug fix) 우선 머지 — LG-001 일정에 영향.

## 1. SOLID + GRASP 1차 필터

| 원칙 | 결정 |
|---|---|
| **SRP** | `useEditAffordancesAllowed()` 는 affordance 가능 여부 단일 결정. `useFrameSelectionAllowed()` 는 backward-compat 유지 (alias). Mode publish 책임은 FrameStage 의 기존 `transitionFrom` 호출 사이트 (변경 없음). |
| **OCP (Rule 6)** | InteractionMode 분기는 hook 내부 단일 출처. UI 콜사이트는 boolean 만 받음 (kind 분기 없음). 추후 mode 추가 시 hook 만 수정. |
| **LSP** | `HoverAffordanceLayer` 는 `SelectionLayer` 와 *대체 관계 아님* — 시각적 동급 overlay 지만 책임 다름. 같은 부모 컴포넌트(host overlay subtree) 안에 형제로 배치. |
| **ISP** | `HoverAffordanceLayer` props 는 `{ hovered, siblings, parent }` 만. 좌표 변환 / 데이터 조회 책임은 host (DesignPage). 컴포넌트는 dumb. |
| **DIP** | Hook 이 React Context (`InteractionVmContext`) 의존, 구현 (`EditorViewModel`) 비의존. |
| **Information Expert** | 부모/형제 traversal 은 `agocraft-mirror.ts` 의 `findParentAndIndex` (이미 정통). 새 헬퍼 안 만듦. |
| **Pure Fabrication** | `useEditAffordancesAllowed` 는 의도 표현용 hook — 그 자체로는 새 mode 를 도입하지 않음. fabrication 인정. |

## 2. Phase 1 — Mode gate hardening

### 2.1 신규 / 수정 파일

| 파일 | 변경 |
|---|---|
| `apps/web/src/document/interactions/interaction-mode.tsx` | + `useEditAffordancesAllowed()` (= mode === "idle"), + `useSelectionChromeVisible()` (= mode === "idle" \|\| mode === "frame-manipulating") |
| `apps/web/src/document/index.ts` | + 두 hook export |
| `apps/web/src/pages/FrameStage.tsx` | binding-registration useEffect: `mode` 의존성 추가, mode === "idle" \|\| "frame-manipulating" 일 때만 frame-move/resize/rotate/rubber-band register |
| `apps/web/src/document/selection-chrome/SelectionLayerHost.tsx` (또는 SelectionLayer 의 host 위치) | render 게이트 = `useSelectionChromeVisible()` |
| `apps/web/src/document/rubber-band/RubberBandLayer.tsx` | overlay div render 게이트 = `mode === "rubber-band"` (이미 그렇지만 명시; 잔류 케이스 진단) |
| `apps/web/e2e/mode-gate-hardening.spec.ts` | 신규 — 5 spec |

### 2.2 구현 순서

1. `useEditAffordancesAllowed` / `useSelectionChromeVisible` hook 추가 + unit test (선택, 단순 derived).
2. FrameStage useEffect 의존성 `mode` 추가 + binding 등록을 `if (mode === "idle" || mode === "frame-manipulating")` 으로 감쌈. **각 binding 별로 따로 감싸지 않고 한 줄로 모두 처리** (race 방지).
3. SelectionLayer host render 게이트 (간단 prop 추가 or 부모에서 conditional mount).
4. RubberBandLayer overlay 잔류 케이스 재현 시도 → 잔류 시 cleanup (mode change effect 추가).
5. e2e 5 spec 작성.
6. `pnpm verify` (declarativecheck + puritycheck + typecheck + build + unit + e2e).
7. Continuous Self-Verification — Playwright 로 hand-mode-drag 시나리오 직접 확인.

### 2.3 가드 매트릭스

| Mode | frame-move | resize | rotate | rubber-band | pan | sel chrome | hover overlay (Phase 3) |
|---|---|---|---|---|---|---|---|
| `idle` | ✓ register | ✓ | ✓ | ✓ | (panActive=true 시) | ✓ | ✓ |
| `frame-manipulating` | ✓ (drag 중) | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ |
| `hand` / `panning` | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ (보기만) | ✗ |
| `rubber-band` | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| `context-menu` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `text-editing` | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (텍스트 frame chrome) | ✗ |

### 2.4 회귀 위험

- `text-editing` mode 에서 SelectionLayer 가 사라지면 텍스트 frame 의 resize handle 없어짐 → 사용자가 frame 크기 조절 못 함. 대안: `useSelectionChromeVisible` 가 `text-editing` 도 포함. 박제 결정.
- `frame-manipulating` 진입 시 binding 이 unregister 되면 drag 가 도중에 끊김. 위의 가드 매트릭스대로 `idle | frame-manipulating` 둘 다 register 유지로 회피.

## 3. Phase 2 — DR-design-016 + HoverAffordanceLayer

### 3.1 Design System Triage 박제 (DR-design-016)

- **Step 1 Reuse**: SelectionLayer 로 3 종 overlay 표현 불가. selection 단일 상태만 처리. **거부**.
- **Step 2 Extend**: SelectionLayer 에 hover 슬롯 추가? selection 과 hover 는 책임 분리 (selection = 선택된 것, hover = 마우스 추적). 한 컴포넌트에 합치면 SRP 위반. **거부**.
- **Step 3 Grew**: 새 primitive `HoverAffordanceLayer`. 3 종 outline render 책임. **채택**.
- **Step 4 Escape (앱-로컬)**: hover overlay 는 추후 다른 weave 페이지 / 또는 agocraft consumer 서비스에서 재사용 가능 (canvas-based 모든 도구의 공통 UX). 앱-로컬 X. **거부**.

### 3.2 3-tier 시각 토큰 명세

| Tier | 시각 |
|---|---|
| **hovered** | `outline: 2px solid var(--accent); box-shadow: 0 0 0 4px color-mix(in oklch, var(--accent) 12%, transparent);` |
| **siblings** | `outline: 1px dashed color-mix(in oklch, var(--accent) 55%, transparent); outline-offset: -1px;` |
| **parent** | `outline: 1px solid color-mix(in oklch, var(--accent) 35%, transparent); background: color-mix(in oklch, var(--accent) 4%, transparent);` |

- 모두 `var(--accent)` 단일 hue → 한 그룹의 관계로 인지.
- `prefers-reduced-motion: reduce` 시 box-shadow glow 제거 + transition 0.
- 토큰명 후보: `--hover-affordance-stroke-strong/muted-dashed/muted-solid`, `--hover-affordance-tint-parent`, `--hover-affordance-glow-hovered`.

### 3.3 컴포넌트 API

```ts
interface HoverAffordanceLayerProps {
  readonly hovered: Rect | null;
  readonly siblings: ReadonlyArray<Rect>;
  readonly parent: Rect | null;
  readonly visible: boolean;
}
interface Rect {
  readonly x: number; // design-plane absolute px
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation?: number; // radians, optional
}
```

- `pointer-events: none` 강제.
- `aria-hidden="true"` (visual-only).
- `position: absolute; inset: 0;` design-plane subtree 안에서 좌표 그대로.
- Tree-shake gate: ESM, `sideEffects: false`, no decorators. design-system 의 다른 export 와 동일.

### 3.4 Dev demo route

- `apps/web/src/dev/HoverAffordanceLayerDemo.tsx` (DEV-only — `import.meta.env.DEV` 게이트).
- 3 종 toggle button + 정지 디자인 mockup. Design review 의 visual evidence 출처.

## 4. Phase 3 — DesignPage wiring + e2e

### 4.1 신규 / 수정 파일

| 파일 | 변경 |
|---|---|
| `apps/web/src/pages/DesignPage.tsx` | `useHoverContext` 결과 → `findParentAndIndex` → rect 3 종 derive → `<HoverAffordanceLayer />` mount |
| `apps/web/src/document/render/hover-affordance-projector.ts` (신규, 작은 유틸) | `projectHoverAffordance(doc, hoveredId, designW, designH): { hovered, siblings, parent }`. 순수함수. unit test. |
| `apps/web/e2e/hover-affordance.spec.ts` | 신규 — 5 spec |

### 4.2 좌표 변환

- `absoluteFrameBox(doc, id, designW, designH)` 재사용 (WI-038 P2). itemId 가 frame 아닌 child item 인 경우 — `findItemDeep` 후 frame ancestor 를 찾아 ratio 변환. 단, **v1 hover affordance 는 frame kind 만 대상으로 함 (canvas-shape child 는 hover 대상 X)** — Phase 3 acceptance 박제.

### 4.3 Performance

- `useHoverContext` 가 이미 dedup (kind/id/role unchanged 시 setState 안 함). overlay 가 hover id 변경 시점에만 rebuild.
- `projectHoverAffordance` 결과를 `useMemo(..., [doc, hoveredId])` 로 캐시.
- pointermove 가 짧은 시간 안에 같은 frame 안에서 움직이는 동안은 hoveredId 가 stable → setState 0 → re-render 0.
- 60fps M1 Chromium 측정 의무 (Phase 3 acceptance).

### 4.4 Mount 순서

DesignPage 의 overlay subtree 안에서:

```
<DesignPlane>
  <FrameStage />
  <HoverAffordanceLayer />     ← Phase 3 신규, SelectionLayer 아래
  <SelectionLayer />            ← 기존
  <RubberBandLayer />           ← 기존
  <QuickActionBar />            ← 기존
</DesignPlane>
```

— SelectionLayer 가 위에 그려져야 selection chrome 이 hover overlay 위에 시인성 우선.

## 5. Acceptance / Launch Gate

- Phase 1: `pnpm verify` all-green + e2e 5 spec PASS + Continuous Self-Verification PASS.
- Phase 2: DR-design-016 발행, demo route 시각 evidence 박제, primitive unit test PASS.
- Phase 3: e2e 5 spec PASS + 60fps M1 Chromium 측정 + LG-001 row 갱신.

## 6. Out of scope (이 WI 에서 안 함)

- Vendor agocraft 의 `createFrameMoveBinding` 에 mode-aware `enabled` predicate 추가 — 별도 HANDOFF.
- Hover persistence (sticky / pinned hover) — 사용자 별도 요청 시.
- Keyboard navigation 으로 hover preview 트리거 — A11y backlog.
- Canvas-shape child hover affordance — v1.x.

## 7. History

- 2026-05-27 — 초안 + Phase 1 audit 박제.
