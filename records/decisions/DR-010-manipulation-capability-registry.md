# Decision Record — DR-010 Manipulation Capability Registry (open extension point)

## Metadata

| Field | Value |
|---|---|
| ID | DR-010 |
| Title | 도메인 별 다른 manipulation (move / resize / rotate / reorder) 의 의무는 closed switch 아닌 open Capability Registry 의 dispatch. 새 도메인 추가 = adapter 정의 + register 한 곳. |
| Status | **Accepted** (2026-05-22) |
| Owner | hbpark |
| Triggering Work Item | WI-011 |
| Pairs with | agocraft DR-005 (capability registry — 원조), DR-009 (interaction registry — 같은 패턴 의 두 번째 적용) |

## Context

WI-011 의 사용자 명시: "도메인 별 의 의무가 모두 다름". 5 도메인 (canvas-shape / doc-paragraph / slide-bullet / slide-title / block-level) + media 의 자체 가 각자 다른 manipulation. closed switch 시 모든 도메인 코드 의 변경 필요. open registry 의 자연 path.

## Options

### Option A (Recommended): Open Capability Registry

```ts
interface ManipulationCapability {
  readonly targetKind: string;        // "canvas-shape" / "doc-paragraph" / ...
  readonly selectable: boolean;
  readonly move?: {
    readonly axis: "free" | "vertical" | "horizontal";
    readonly apply: (target, delta: { dx: number; dy: number }) => Patch;
  };
  readonly resize?: {
    readonly kind: "free" | "aspect-preserved" | "width-only" | "height-only" | "font-only" | "lines-count";
    readonly apply: (target, delta, dir: "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw") => Patch;
  };
  readonly rotate?: {
    readonly apply: (target, deltaRadians: number) => Patch;
  };
  readonly getBoundingBox: (target) => { x: number; y: number; width: number; height: number; rotation: number };
  readonly destroy?: (target) => Patch | null;
}

const registry = createManipulationRegistry();
registry.register(canvasShapeCapability);
registry.register(docParagraphCapability);
// ...
```

각 capability 는 자체 도메인 의 의도 — canvas-shape 의 move=free + resize=free + rotate, doc-paragraph 의 move=vertical + resize=font-only.

SelectionLayer (design-system) 가 capability 의 `move? / resize? / rotate?` 의 boolean 의 차원 — 시각 handles 가 capability 의 따른 visible.

### Option B: Closed switch

```ts
function manipulate(target, op) {
  switch (target.kind) {
    case "canvas-shape": ...;
    case "doc-paragraph": ...;
    // 새 도메인 추가 시 SelectionLayer / DemoDocPage / e2e 모두 변경 의무
  }
}
```

거부 — 사용자 의 의도 의 명확한 위반 (도메인 추가 의 cost 큼).

### Option C: Polymorphic Item 의 method

각 Item kind 의 자체 method `manipulate(op)` 박제. 단 Item 의 data shape (model) + behavior (manipulation) 의 결합 의 안티-패턴 (agocraft 의 DR-011 mirror types 와 충돌). 또 미래 의 server-side 의 unique manipulation 의 의무 (preview 의 read-only model) 분리 의 path 약화.

거부.

## Decision

**Option A — Open Capability Registry**.

근거:
1. agocraft DR-005 + DR-009 (interaction registry) 의 정착된 패턴 의 일관 application.
2. 도메인 추가 의 capability adapter 정의 + `registry.register(adapter)` 한 곳. SelectionLayer / CanvasBlock / DemoDocPage / agocraft hotkey 의 모두 변경 0.
3. tree-shake — 사용 안 하는 adapter 의 dead-code 제거 자연.
4. test 의 의 자연 — adapter 단위 test 의 분리.

## Capability shape — 정확 박제

```ts
import type { Patch } from "../types.js";

export interface SelectableTarget<K extends string = string> {
  readonly kind: K;       // "canvas-shape" / "doc-paragraph" / ...
  readonly id: string;    // unique within its parent Item
  readonly itemId: string;  // top-level Item id (the block)
}

export interface BoundingBox {
  readonly x: number;       // pixel within the block
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;  // radians, center-based
}

export interface ManipulationCapability<K extends string = string, T extends SelectableTarget<K> = SelectableTarget<K>> {
  readonly targetKind: K;
  readonly selectable: boolean;
  readonly move?: {
    readonly axis: "free" | "vertical" | "horizontal";
    readonly apply: (target: T, delta: { readonly dx: number; readonly dy: number }) => void;
  };
  readonly resize?: {
    readonly kind: "free" | "aspect-preserved" | "width-only" | "height-only" | "font-only" | "lines-count";
    readonly handles: ReadonlyArray<"n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw">;
    readonly apply: (target: T, delta: { dw: number; dh: number; dir: "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw" }) => void;
  };
  readonly rotate?: {
    readonly apply: (target: T, deltaRadians: number) => void;
  };
  readonly getBoundingBox: (target: T) => BoundingBox;
  readonly destroy?: (target: T) => void;
}
```

각 apply 함수 는 `useDocument.updateItem` 의 closure capture 의 mutation. ref-stable.

## SelectionLayer 의 dispatch

```tsx
<SelectionLayer
  targets={selectedTargets}
  registry={manipulationRegistry}
  onMove={(target, delta) => registry.get(target.kind).move?.apply(target, delta)}
  onResize={...}
  onRotate={...}
/>
```

handles 가 capability 의 `move? / resize? / rotate?` 의 있음 의 따라 visible.

## Step 1 의 첫 capability — canvas-shape

```ts
const canvasShapeCapability: ManipulationCapability<"canvas-shape", CanvasShapeTarget> = {
  targetKind: "canvas-shape",
  selectable: true,
  move: { axis: "free", apply: (t, d) => updateShape(t, { x: t.x + d.dx, y: t.y + d.dy }) },
  resize: {
    kind: "free",
    handles: ["nw", "n", "ne", "e", "se", "s", "sw", "w"],
    apply: (t, d) => updateShape(t, centerResize(t, d.dw, d.dh, d.dir)),
  },
  rotate: { apply: (t, dr) => updateShape(t, { rotation: t.rotation + dr }) },
  getBoundingBox: (t) => ({ x: t.x, y: t.y, width: t.width, height: t.height, rotation: t.rotation }),
  destroy: (t) => removeShape(t),
};
```

center-based resize 의 의무 — `centerResize(t, dw, dh, dir)` 의 의도 = corner drag 의 dx/dy 의 의무 mirror change (center 고정).

## Consequences

- `manipulation/` 의 새 폴더 + adapter file 의 새 추가 = 미래 도메인 의 자연 자리.
- SelectionLayer / SelectionHandle 의 design-system 의 새 primitives.
- Step 2-5 의 모든 새 도메인 = adapter 의 새 file + registry.register 의 한 줄.

## Mitigations

- capability 의 conflict — 같은 targetKind 의 다중 register 시 dev-warning (DR-009 의 패턴 동일).
- 다중 selection 의 group manipulation — Step 5 의 의도된 path. Step 1 의 single only.

## Links

- WI-011
- agocraft DR-005 (capability registry — 원조)
- DR-009 (interaction registry — 동일 패턴 의 두 번째 적용)
- (planned) DR-design-004 — SelectionLayer / SelectionHandle 의 박제
