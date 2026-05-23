# features/presentation/UX_DESIGN.md

> WI-009 의 Discovery 산출물. **사용자 결정 (2026-05-22)**: Prezi camera nav (A) + Genially hotspot/reveal (B) 의 자유 결합 + 확장 가능한 InteractionBehavior registry + edit/present mode 분리.

## 두 mode

| Mode | URL | 핵심 |
|---|---|---|
| **Edit** | `/doc/:id` | block list + behaviors 시각 + "Present" 버튼 |
| **Present** | `/doc/:id/present` | fullscreen, UI chrome 최소, camera viewport + scenes, arrow / space / Esc, hotspot click |

전환:
- Edit → Present: `Present` 버튼 클릭 또는 `Cmd+Enter` / `F5`
- Present → Edit: `Esc` 또는 top-right 닫기 버튼

URL bookmark + 공유 모두 가능 (`/doc/demo/present?step=3` 미래 의무 — PoC 는 step 0 부터 시작).

## Interaction model — extension point pattern

각 `Item` 이 0+ `InteractionBehavior` 을 가짐. PoC 의 2 kinds + 미래 확장:

```ts
type InteractionKind = "camera-target" | "hotspot" | "reveal-on-step" | "branch" | "embed-autoplay" | ...;

interface InteractionBehavior<K extends InteractionKind = InteractionKind> {
  readonly kind: K;
  readonly id: string;
  // kind 별 attrs (e.g., camera-target 의 { x, y, scale, order })
}
```

**Registry 의 의무**:

```ts
const registry = createInteractionRegistry();
registry.register("camera-target", cameraTargetAdapter);
registry.register("hotspot", hotspotAdapter);
// 미래
registry.register("reveal-on-step", revealAdapter);
registry.register("branch", branchAdapter);
```

각 adapter:
- `getOrder(behavior, item, doc)` — sequential step 의 정렬 의무 (camera-target 의 path navigation)
- `render(behavior, item, ctx)` — Present mode 의 overlay 렌더 (hotspot 의 영역 표시, click handler)
- `onTrigger(behavior, item, ctx)` — 클릭 / 키 / step 의 dispatch (next camera target, reveal, branch select)
- `validate(behavior)` — schema 검증 (선택)

새 InteractionKind 추가 = adapter 정의 + register 한 곳. **`apps/web/src/pages/PresentPage.tsx` 의 코드는 변경 없음**.

## Camera Target (A — Prezi-like)

```ts
interface CameraTargetBehavior {
  kind: "camera-target";
  id: string;
  position: { x: number; y: number };  // 무한 캔버스의 좌표
  scale: number;                        // 1.0 = 100% default, 0.5 = 50%, 2.0 = 200%
  rotation?: number;                    // 미래 — radians. PoC 는 0.
  order: number;                        // sequential step 순서. arrow key 의 next/prev
  label?: string;                       // present chrome 의 thumbnail / breadcrumb
}
```

**Edit mode 시각**: 각 block 의 카드 상단에 작은 chip — `📷 camera 1 / 3` (order 표시). 클릭 시 좌표 편집 (PoC 는 hardcoded grid).

**Present mode 시각**: Stage 의 camera 가 active target 으로 zoom + pan animation (motion lib spring). arrow right / space = next order, arrow left = prev. number key (1-9) = jump to order.

**Camera transition**:
- spring physics — `transform: translate(...) scale(...)` 의 motion lib animation
- `prefers-reduced-motion` 시 instant snap (no animation)
- 500-700ms duration default, easing soft

## Hotspot (B — Genially-like)

```ts
interface HotspotBehavior {
  kind: "hotspot";
  id: string;
  region: { x: number; y: number; width: number; height: number };  // item-relative
  trigger: "click" | "hover";       // PoC 는 click.
  action:
    | { type: "reveal"; targetId: string }    // 다른 hotspot/element 의 visibility 토글
    | { type: "next-camera" }                 // 다음 camera-target 이동
    | { type: "jump-camera"; targetId: string } // 특정 camera target 이동
    | { type: "external"; href: string };     // 외부 link (target=_blank)
  label?: string;                   // aria-label 의무
}
```

**Edit mode 시각**: hotspot 영역의 outline + 우상단 chip — `✦ hotspot`. 클릭 시 region 편집 (PoC 는 hardcoded).

**Present mode 시각**: hotspot region 의 subtle pulse animation (`prefers-reduced-motion` 시 OFF). 마우스 hover 시 outline. click 시 action dispatch.

## Stage (design-system primitive)

```tsx
<Stage
  scenes={items}                              // Item with camera-target behavior
  activeOrder={3}                             // 현재 step
  onOrderChange={(order) => ...}             // arrow / button 의 callback
  renderItem={(item) => <SlideBlock />}      // domain renderer (mock state)
  overlays={hotspotOverlays}                  // hotspot 의 region + click handler
/>
```

내부:
- 무한 캔버스 (`position: fixed; inset: 0; overflow: hidden`)
- camera viewport (`transform-origin: center; transform: translate(...) scale(...)`)
- scenes 의 좌표 박제 (각 item 의 camera-target 으로)
- arrow keys / number keys subscribe (단순 React useEffect — Phase 3 의 `@agocraft/input` swap)

## PresentChrome (design-system primitive)

```tsx
<PresentChrome
  step={3}
  total={5}
  onPrev={...}
  onNext={...}
  onClose={...}       // → /doc/:id
  thumbnails={...}    // optional, scene picker
/>
```

- Top — progress bar (3 / 5) + close button
- Bottom — prev / next + (optional) thumbnail strip
- 5 초 idle 시 fade out, mouse move 시 fade in (Prezi 패턴)
- `prefers-reduced-motion` 시 항상 visible

## Edit mode 의 behaviors 시각

각 block 의 카드 footer:

```
┌────────────────────────────────────────────────────┐
│ Slide · 9:21 PM                          [✕]       │
│ ... slide content ...                              │
│                                                    │
│ 📷 camera 1/3        ✦ hotspot (1)                 │ ← behaviors footer
└────────────────────────────────────────────────────┘
```

PoC 의 편집은 최소 (PoC 단계). Phase 2 의 의무 — hotspot region drag, camera 좌표 visual edit.

## 키보드 (Present mode)

| 키 | 행위 |
|---|---|
| `→` / `Space` | next camera target |
| `←` | prev camera target |
| `1-9` | jump to order N |
| `Esc` | exit to edit mode |
| `F` | fullscreen toggle |
| `M` | mute audio (미래) |

(Phase 3 — `@agocraft/input/hotkey` 의 swap. scope = `"present"` + sub-scopes per active scene.)

## a11y

- **Stage** — `role="application"` (캔버스 의 의도된 키바인딩 trap).
- **Hotspot** — `role="button"` + `aria-label` (필수) + focus-visible ring.
- **PresentChrome** — `role="toolbar"` + Tab navigation.
- **prefers-reduced-motion** — camera transition + hotspot pulse 모두 OFF (즉시 snap, static outline).
- **WCAG AA contrast** — hotspot outline / focus ring 의무.

## 확장 path (미래 InteractionKind 후보)

| Kind | 추가 시 의도 | Phase |
|---|---|---|
| `reveal-on-step` | scene 안의 elements 가 step 별 sequential reveal | 2 |
| `branch` | hotspot → 선택지 → 다른 camera target (Genially 의 branching) | 2 |
| `embed-autoplay` | media block 의 video/iframe 자동 재생 시작 | 2 |
| `timeline` | 시간축 기반 키프레임 — agocraft 의 미래 timeline 도메인 | 3+ |
| `audio-narration` | scene 별 voiceover | 3+ |
| `poll` | 청자 응답 수집 (B2B 강의 / 미팅) | 4+ |

각 추가 = adapter 정의 + register 한 곳. PresentPage / Stage 코드 변경 없음 (capability dispatch).

## Phase 분리

| Phase | 작업 |
|---|---|
| **Phase 1 (이 WI)** | Registry + 2 kinds (camera-target + hotspot) + edit/present mode + design-system primitives |
| Phase 2 (별 WI) | InteractionKind 1-2 추가 (reveal-on-step / branch). behavior 의 inline 편집 UI (drag region). path-based camera animation (Prezi 의 의도된 path). |
| Phase 3 (별 WI) | agocraft `@agocraft/input/hotkey` 의 swap. `@agocraft/editor` 의 selection / focus. `@agocraft/core` ChangeStream + History. |
| Phase 4+ | M3+ 의 timeline / audio / poll / realtime collab |
