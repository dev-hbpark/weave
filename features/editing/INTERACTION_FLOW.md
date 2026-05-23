# features/editing/INTERACTION_FLOW.md

> 사용자 인터랙션 → model → view 의 의 의 실 코드 흐름. WI-011 Step 1 (canvas-shape resize) 의 의 의 의 의 trace. 다른 시나리오 (text edit, hotkey, hotspot click, etc.) 는 동일 패턴 의 의 의 의 의 의 의 의 의 의 의 의 의 의 따라감.

## 모듈 책임 매트릭스

| Layer | 의무 | Package |
|---|---|---|
| **Input normalization** | DOM 의 pointer/keyboard/wheel → unified payload + realtime modifier signal | `@agocraft/input/bus` |
| **Hotkey binding** | scope-tree 기반 dispatch + getCandidates query | `@agocraft/input/hotkey` |
| **Manipulation capability** | 도메인 별 의 move/resize/rotate math + dispatch registry | `apps/web/src/document/manipulation/` (DR-010, weave-local) |
| **Document model + state** | Items, attrs, behaviors, shapes. setDoc → React state. localStorage round-trip | `apps/web/src/document/{types, use-document, storage}` |
| **Domain renderers** | 도메인 시각 + onUpdate / onUpdateShape props. Edit mode 의 의 의 의 의 의 의 의 의 인터랙션 wiring | `apps/web/src/document/domains/` |
| **Selection / chrome primitives** | bbox overlay + handles + visual ring | `@weave/design-system` (SelectionLayer, SelectionHandle, EditableText, Stage, Hotspot, PresentChrome) |
| **Page orchestration** | doc.items.map → renderer + handler props | `apps/web/src/pages/{DemoDocPage, PresentPage}` |

## 시나리오 — E handle 의 5px drag

```
사용자 ────► SelectionHandle ────► CanvasBlock (startResize)
                                       │
                                       ├─ dragRef.current = { kind:"resize", dir:"e", … }
                                       │
                                  사용자가 손가락 / 마우스 이동
                                       │
                                       ▼
   window pointermove ──► @agocraft/input/bus (normalize)
                                       │
                                       ▼
                          CanvasBlock 의 bus.subscribe callback
                                       │
                                       ├─ pxToPercent(dx, dy)
                                       │
                                       ▼
                          capability.resize.apply(target, { dw, dh, dir })
                                       │
                                       ▼
                          resizeAnchored(shape, dx, dy, "e") → patch
                                       │
                                       ▼
                          deps.updateShape(itemId, shapeId, patch)
                                       │
                                       ▼
                          useDocument 의 setDoc → items.map → new doc snapshot
                                       │
                                       ├─ useEffect saveDocument → localStorage
                                       │
                                       ▼
                          React re-render: DemoDocPage → CanvasBlock
                                       │
                                       ├─ shape <button> 의 inline style 갱신
                                       └─ SelectionLayer 의 bbox 갱신
```

## 코드 경로 — file:line 별

### 1. Handle pointerdown

`packages/design-system/src/components/SelectionHandle.tsx`

```tsx
<button
  type="button"
  data-handle-dir={dir}
  onPointerDown={onPointerDown}
  …
/>
```

→ `onPointerDown` prop 의 `SelectionLayer` 의 의 의 `(e) => onResizeStart(dir, e)`.

### 2. CanvasBlock 의 startResize

`apps/web/src/document/domains/CanvasBlock.tsx:172`

```tsx
function startResize(dir: HandleDir, e: React.PointerEvent) {
  if (selectedShape === null) return;
  e.stopPropagation();
  (e.target as Element).setPointerCapture?.(e.pointerId);
  dragRef.current = {
    kind: "resize",
    dir,
    startX: e.clientX,
    startY: e.clientY,
    orig: selectedShape,
  };
}
```

`dragRef` 는 `useRef` 라 re-render 없이 mutable. `orig` 는 drag 시작 시점의 shape snapshot — pointer move 마다 절대 delta 계산.

### 3. Window pointer subscribe

`apps/web/src/document/domains/CanvasBlock.tsx:62`

```tsx
useEffect(() => {
  const bus = createInputBus({ target: window, origin: "canvas-block" });
  const off = bus.subscribe((ev) => {
    if (ev.kind !== "pointer") return;
    …
    if (ev.phase === "move" && drag.kind === "resize") {
      const { dxPct, dyPct } = pxToPercent(
        ev.position.x - drag.startX,
        ev.position.y - drag.startY,
      );
      const target = canvasShapeTargetFor(item, drag.orig);
      capability.resize?.apply(target, { dw: dxPct, dh: dyPct, dir: drag.dir });
    }
  });
  return () => { off(); bus.dispose(); };
}, [editable, item, capability, pxToPercent]);
```

**왜 window** — handle 의 자체 의 onPointerMove 만 사용하면 빠른 drag 시 pointer 가 handle 의 의 outside 로 escape 시 event 끊김. window 의 subscribe 가 drag-tracking 의 의 robust path.

### 4. agocraft bus 의 normalize

sister agocraft project 의 `packages/input/src/bus/input-bus.ts` (의 `onPointerMove` ≈ line 60)

```ts
function onPointerMove(e: Event): void {
  const pe = e as PointerEvent;
  updateModifiersFrom(pe);
  const prev = lastPositions.get(pe.pointerId);
  lastPositions.set(pe.pointerId, { x: pe.clientX, y: pe.clientY });
  emit(normalizePointer(pe, { phase: "move", previous: prev, origin }));
}
```

`normalizePointer` 의 의 output:

```ts
{
  kind: "pointer",
  phase: "move",
  pointerId, pointerType, position, delta, buttons, pressure,
  modifiers, target, timestamp, origin, raw
}
```

bus 의 다른 의무 — `bus.modifiers` Signal 의 의 keydown/keyup (window capture) 의 realtime update. 단 이 시나리오에선 미사용.

### 5. Capability dispatch

`apps/web/src/document/manipulation/capabilities/canvas-shape.ts:90`

```ts
resize: {
  kind: "free",
  handles: ALL_HANDLES,
  apply: (target, delta) => {
    const patch = resizeAnchored(target.shape, delta.dw, delta.dh, delta.dir);
    deps.updateShape(target.itemId, target.id, patch);
  },
},
```

→ 의 의 의 의 `resizeAnchored`:

```ts
function resizeAnchored(shape, dx, dy, dir): Partial<CanvasShape> {
  let { x, y, width, height } = shape;
  if (dir.includes("e")) width = Math.max(MIN_SIZE, shape.width + dx);
  if (dir.includes("w")) {
    const newWidth = Math.max(MIN_SIZE, shape.width - dx);
    x = shape.x + (shape.width - newWidth);
    width = newWidth;
  }
  …
  return { x, y, width, height };
}
```

→ `deps.updateShape(itemId, id, { width: shape.width + dxPct })` 호출.

### 6. useDocument 의 state update

`apps/web/src/document/use-document.ts:90`

```ts
const updateShape = useCallback(
  (itemId, shapeId, patch) => {
    setDoc((prev) => ({
      ...prev,
      items: prev.items.map((it) => {
        if (it.id !== itemId || it.kind !== "canvas-design") return it;
        return {
          ...it,
          attrs: {
            ...it.attrs,
            shapes: it.attrs.shapes.map((s) =>
              s.id === shapeId ? { ...s, ...patch } : s,
            ),
          },
        };
      }),
      updatedAt: new Date().toISOString(),
    }));
  },
  [],
);
```

React 의 `setDoc` 가 새 immutable snapshot 발행. doc identity 변경 → effect schedule.

### 7. localStorage 의 persist

`apps/web/src/document/use-document.ts:25`

```ts
const isFirst = useRef(true);
useEffect(() => {
  if (isFirst.current) { isFirst.current = false; return; }
  saveDocument(doc);
}, [doc]);
```

→ `storage.ts` 의 `saveDocument` → `localStorage.setItem("weave.doc.v3.demo", JSON.stringify(doc))`.

### 8. DemoDocPage 의 re-render

`apps/web/src/pages/DemoDocPage.tsx:88`

```tsx
{doc.items.map((item, idx) => {
  …
  return (
    <Renderer
      item={item}
      onUpdate={(patch) => updateItem(item.id, …)}
      {...(isCanvas ? {
        onUpdateShape: (shapeId, patch) => updateShape(item.id, shapeId, patch),
        onRemoveShape: (shapeId) => removeShape(item.id, shapeId),
      } : {})}
    />
  );
})}
```

doc identity 변경 → CanvasBlock 도 새 prop. React 의 reconciliation.

### 9. CanvasBlock 의 shape 의 DOM 갱신

`apps/web/src/document/domains/CanvasBlock.tsx:226`

```tsx
{item.attrs.shapes.map((shape) => (
  <button
    key={shape.id}
    onPointerDown={(e) => handleShapePointerDown(shape, e)}
    style={{
      left:   `${shape.x}%`,
      top:    `${shape.y}%`,
      width:  `${shape.width}%`,    ← 갱신
      height: `${shape.height}%`,
      transform: `rotate(${shape.rotation}rad)`,
      background: shape.hue,
    }}
  />
))}
```

inline style 의 의 width/height 직접 박힘 → 브라우저 의 paint 직접 갱신.

### 10. SelectionLayer 의 bbox 갱신

`apps/web/src/document/domains/CanvasBlock.tsx:248`

```tsx
{editable && selectedShape !== null && (
  <SelectionLayer
    box={{
      left:   `${selectedShape.x}%`,
      top:    `${selectedShape.y}%`,
      width:  `${selectedShape.width}%`,    ← 갱신
      height: `${selectedShape.height}%`,
      rotation: selectedShape.rotation,
    }}
    capability={selectionCapability}
    onMoveStart={startMove}
    onResizeStart={startResize}
    onRotateStart={startRotate}
  />
)}
```

`selectedShape` 는 `useMemo([selectedId, item.attrs.shapes])` 의 derived. shapes array identity 변경 → selectedShape 도 새 ref → SelectionLayer 의 새 box prop → handle 위치 갱신.

## 동일 패턴 — 다른 시나리오

| 시나리오 | Module 의 갈래 | 결과 |
|---|---|---|
| **Slide title edit** | `EditableText.onCommit` → `commitTitle(next)` → `onUpdate({ title })` → `updateItem(item.id, …)` | 동일 setDoc → re-render |
| **Hotspot click in Present** | `Hotspot onTrigger` → `hotspot adapter dispatchAction` → `ctx.goToStep(step+1)` → `setStep` → PresentPage re-render | 동일 React state path |
| **Esc in Present** | `@agocraft/input/bus` 의 window key event → `@agocraft/input/hotkey` 의 scope "present" matching → `binding.action` → `ctx.close()` → `navigate("/doc/:id")` | router 의 path 만 다름 |
| **reveal-on-step gating** | `setStep` → re-render PresentPage → `interactionRegistry.forItem(item).shouldRender(behavior, item, ctx)` → opacity 0/1 | dispatch + render only |
| **Theme switch** | `ThemeSwitcher onValueChange` → `useTheme.setTheme` → `document.startViewTransition(() => setThemeState)` → `<html data-theme="…">` → CSS variables 의 cascading swap | DOM attribute 만, doc 무관 |

## 박힘 — Anti-patterns

이 패턴 의 의 의 위반 신호:
- **shape data 의 직접 DOM mutation** (e.g., `element.style.width = "10%"`) — React 의 state 와 desync.
- **capability 의 의 의 의 setDoc 직접 호출** — capability 는 deps 를 통해서만 mutation, 직접 호출은 layer 분리 깨짐.
- **pointermove 의 의 의 useState 의 의 의 의 의 setState** — re-render 마다 listener attach + closure capture. 우리는 dragRef + ref 의 의 의 의 의 의 의 의 의 의 의 의 의.

## 관련

- WI-009 (interactive presentation PoC) — registry pattern 의 첫 사례
- WI-011 (selection + manipulation framework)
- DR-009 (interaction registry), DR-010 (manipulation capability registry)
- DR-design-002 (presentation primitives), DR-design-003 (EditableText), DR-design-004 (selection primitives)
- agocraft `@agocraft/input` (bus + hotkey)
