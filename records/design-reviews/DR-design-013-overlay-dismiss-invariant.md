# DR-design-013 — Overlay dismiss invariant (capture-phase backstop)

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-013 |
| Date | 2026-05-27 |
| Owner | hbpark |
| Component | `@weave/design-system` — all Radix-backed overlays |
| Affected primitives | `Popover` · `ColorPicker` · `DropdownMenu` · `ContextMenu` · `Dialog` |
| Triage Decision | **Step 3 — Grew** (cross-cutting utility hook 신설) |

## Triage Walk

| Step | Outcome |
|---|---|
| 1. Reuse | ❌ — Radix 의 `onPointerDownOutside` 는 document bubble-phase 리스너에 의존. 호스트가 임의 영역에서 `e.stopPropagation()` 를 호출하면 발화 자체가 안 됨. 재사용 가능한 기존 utility 없음. |
| 2. Extend | ❌ — 각 overlay primitive 의 props 를 늘려도 본질 문제(stopPropagation 으로 document 리스너가 막힘) 가 해결되지 않음. |
| 3. Grew | ✅ — design-system 내 신규 utility 훅 `useDismissOnOutsidePointer` 을 도입하여 capture-phase document 리스너를 운영. 5 overlay primitive 가 이 훅을 일관 사용. |

## Context

ColorPicker, DropdownMenu, ContextMenu, Dialog, Popover 는 모두 `@radix-ui/react-*` primitive 위에 얹혀있고, Radix 의 outside-click dismiss 는 `document.addEventListener("pointerdown", handler)` (bubble phase) 로 동작한다. weave 의 canvas (`FrameStage.tsx`) 는 RubberBandLayer / FrameStage pan handler 등 ancestor 핸들러가 *추가로* 같은 press 를 받지 않도록 9개 위치에서 `e.stopPropagation()` 을 호출한다 (예: `:543`, `:565`, `:575`, `:613`, `:625`, `:636`, `:716`, `:854`, `:863`). React synthetic `stopPropagation()` 은 native `stopPropagation()` 도 호출하므로 — Radix 의 document-level 리스너에 도달하지 못해 **overlay 가 캔버스 클릭에 닫히지 않는 증상**.

증상은 사용자 보고로 확인됨 (2026-05-27, `f3f24dd refactor(toolbar)` 직후 header design-background ColorPicker 로 노출). ColorPicker 만의 문제가 아니라 **6 overlay primitive 공통 위험**.

## Decision

design-system 에 capture-phase 백스톱 훅을 도입하여 모든 portaled overlay 가 사용한다. 캔버스의 stopPropagation 의도(React 트리 안 ancestor 핸들러 차단) 는 그대로 유지하고, document-level dismiss 만 별도 보장한다.

### `useDismissOnOutsidePointer`

```ts
// packages/design-system/src/lib/use-dismiss-on-outside-pointer.ts

interface UseDismissOnOutsidePointerArgs {
  readonly open: boolean;
  readonly onDismiss: () => void;
  /** Trigger element ref. Pointer events landing inside this element
   *  do NOT dismiss. */
  readonly triggerRef: RefObject<HTMLElement | null>;
}

export function useDismissOnOutsidePointer(args: UseDismissOnOutsidePointerArgs): void;
```

동작 사양:

1. `args.open === true` 일 때만 `document.addEventListener("pointerdown", handler, { capture: true })` 등록. capture phase 라 어떤 React 핸들러의 bubble-phase `stopPropagation` 도 영향 없음.
2. handler 안에서 `event.composedPath()` walk:
   - `args.triggerRef.current` 와 그 descendant — dismiss 안 함.
   - `[data-radix-popper-content-wrapper]`, `[data-radix-portal]`, `[role="menu"]`, `[role="dialog"]`, `[role="tooltip"]` 의 ancestor — dismiss 안 함 (다른 overlay 와 nested overlay 공존).
   - `[data-dismiss-exempt="true"]` 의 ancestor — dismiss 안 함 (host 가 명시한 exempt 영역; e.g. global 토스트, 영구 chrome).
   - 위 모두 아니면 `args.onDismiss()` 호출.
3. cleanup 으로 listener 해제.

Radix 의 기본 `onPointerDownOutside` 는 그대로 두고, 본 훅은 **백스톱**: bubble 이 정상 도달하면 Radix 가 먼저 닫고, stopPropagation 시나리오에선 capture-phase 가 받아낸다. 두 채널이 중복 발화해도 `open === false` 이후엔 listener 가 해제되고 두 번째 호출은 no-op.

### Adoption matrix

| Primitive | 적용 | 비고 |
|---|---|---|
| `Popover` | ✅ | controlled-state wrapper + 훅 mount. trigger self-exempt via `[data-state="open"]`. |
| `ColorPicker` | ✅ | `PopoverPrimitive` 직접 사용 — 훅을 component 내부에서 직접 호출. trigger ref 합성. |
| `DropdownMenu` | ✅ | controlled-state wrapper + 훅 mount. trigger self-exempt via `[data-state="open"]`. |
| `ContextMenu` | ⏸ deferred | Radix `ContextMenu` 는 controlled `open` prop 부재 — 백스톱이 programmatic close 불가. 차후 needed 시 synthetic Escape keydown dispatch 경유로 처리. 현재 user-reported 증상 없음. |
| `Dialog` | ⏸ N/A | modal 사용 시 `DialogPrimitive.Overlay` 가 canvas 를 가려 `stopPropagation` 흐름이 발생하지 않음. 본 PR scope 외. |
| `Tooltip` | ❌ | hover-leave 모델. pointer dismiss 의미 없음. |

PR scope: **Popover + ColorPicker + DropdownMenu**. ContextMenu / Dialog 는 별도 트리거 시점에 후속.

## Exemption rules

특정 element 가 outside 클릭으로 인식되면 안 되는 케이스:

1. **Other portaled overlays** — `data-radix-popper-content-wrapper` 등 Radix 자체 mark 로 감지.
2. **Host's intentional always-open chrome** — host 가 `data-dismiss-exempt="true"` 를 mark 한 영역. 예: 영구 토스트 컨테이너, 시스템 status bar.
3. **Trigger 자기 자신** — 클릭으로 toggle 가능하도록 보장.

위 외 모든 경우 dismiss.

## Risks

| Risk | 완화 |
|---|---|
| 중복 dismiss (Radix + 백스톱 모두 발화) | 두 번째 호출은 `open === false` 후 listener 해제로 no-op. mount 시점이 다르므로 첫 발화 시 listener 해제 — 두 번째는 listener 자체 부재. |
| nested overlay 의 click 이 부모 overlay 를 닫음 | `data-radix-popper-content-wrapper` walk 으로 차단 (DropdownMenu 안 ColorPicker 같은 케이스). |
| `composedPath` 미지원 환경 | Baseline Widely Available (Chromium 53+, Safari 10+). polyfill 불필요. fallback 으로 `event.target.closest()` 로 대체 가능하나 shadow DOM 등에서 정확도 ↓. |
| capture-phase listener 가 React Portal 의 onClick handler 보다 먼저 fire → child handler 가 못 받음 | listener 는 dismiss `onDismiss()` 호출만 하고 stopPropagation/preventDefault 안 함. child 들은 정상 발화. |

## Verification

1. `apps/web/e2e/overlay-dismiss-on-canvas.spec.ts` 신규: header `ColorPicker` 열기 → 캔버스의 stopPropagation 영역(`[data-frame-id]` 의 빈 곳) 클릭 → ColorPicker popover 사라짐. DropdownMenu 도 같은 패턴 (Add 메뉴 → 캔버스 클릭 → 닫힘).
2. 기존 `background.spec.ts` 의 design-background mount 검증은 회귀 없이 PASS 유지.
3. typecheck / declarativecheck / build / unit 모두 PASS.

## Cross-references

- 원인: `apps/web/src/pages/FrameStage.tsx` — 9 `stopPropagation` 호출처.
- 관련 회피: `apps/web/src/document/interactions/use-hover-context.ts` 의 hover-target union (다른 cross-cutting overlay 정합성 사례).
- 메모리: `feedback_react_portal_event_bubbling` — portal pointer event 부모 hijack 의 반대 방향 사례. 두 사례 모두 "React 트리 vs document 트리" 분리의 미세 경계.
