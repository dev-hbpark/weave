# Decision Record — DR-012 Insertable Capability Registry (open extension point)

## Metadata

| Field | Value |
|---|---|
| ID | DR-012 |
| Title | "이 컨테이너 안 의 빈 공간 에 무엇 을 추가 가능 한가" 는 closed switch 아닌 open Capability Registry 의 dispatch (containerKind × dragRect aspect ratio). 새 컨테이너 / 새 추천 추가 = adapter 1 개 추가. |
| Status | Proposed |
| Owner | hbpark |
| Triggering Work Item | WI-017 |
| Pairs with | agocraft DR-005 (capability registry — 원조), DR-009 (interaction registry), DR-010 (manipulation registry), DR-011 (tooltip registry — 같은 패턴 의 세 번째 적용) |

## Context

WI-017 의 drag-to-create 인터랙션 의 5 단계 의 가운데 **3 단계: "비율 별 추천 popover"** — 의 핵심 의무: 컨테이너 의 종류 (root design / canvas-design / block-doc) 별 의 추가 가능 한 item 의 set + 그 set 의 의 drag rect 의 aspect ratio 별 priority 의 다름.

- **Root design canvas** → 4 domain frame (slide / canvas-design / block-doc / media) 의 자체. wide ratio (≥ 1.6) → media (wide image) + canvas-design (wide layout) 우선; tall ratio (≤ 0.6) → block-doc (long-form text) + slide (vertical bullet list) 우선; square → slide + canvas-design.
- **`canvas-design` frame interior** → shape (rectangle / circle / line / arrow). aspect ratio + 위치 의 의무 다름.
- **`block-doc` frame interior** → paragraph variant (text / heading / quote / list). aspect ratio 의 약함 (text 는 layout 의 free-form 의 의무 없음); 위치 만 의무.
- **`slide` frame interior** → NOT a container (구조화 된 title + bullets 의 자체). drag-on-empty-area 의 path 의 미적용.
- **`media` frame interior** → NOT a container.

이 5 의 분기 가 closed switch 안 의 의 의무 시 (a) 새 컨테이너 추가 시 (예: 미래 의 "freeform-canvas" 의 자체) 모든 surface 의 변경 의무 발생, (b) 새 추천 의 도메인 (예: AI generated component) 의 추가 시 도메인 별 의 의무 의 자체 변경 의 path 의 없음. agocraft DR-005 + 본 프로젝트 DR-009 / DR-010 / DR-011 의 동일 의도 패턴 의 자연 application.

## Options

### Option A (Recommended): Open Insertable Capability Registry

```ts
interface InsertableCapability<K extends ContainerKind = ContainerKind> {
  readonly containerKind: K;
  /**
   * Drag rect (in container-relative 0..1 ratio coords) + container-level
   * context → recommendation list. Pure function — referentially transparent
   * for memoization at the popover render site.
   */
  readonly recommend: (
    rect: NormalizedDragRect,
    ctx: InsertableDescribeContext,
  ) => ReadonlyArray<InsertableRecommendation>;
  /**
   * Per-recommendation skeleton renderer — used during popover-item hover
   * to fade-in the silhouette inside the persistent guide box. Domain-aware
   * silhouette stays here, NOT in the design-system primitive (RubberBand
   * is domain-free).
   */
  readonly renderSkeleton: (
    recommendation: InsertableRecommendation,
    rect: NormalizedDragRect,
  ) => ReactNode;
  /**
   * Commit — given the recommendation + rect, build the editor.exec input
   * and dispatch. Adapter knows how to translate a recommendation into the
   * domain's specific "weave.X.add" command.
   */
  readonly commit: (
    recommendation: InsertableRecommendation,
    rect: NormalizedDragRect,
    ctx: InsertableCommitContext,
  ) => void;
}

interface NormalizedDragRect {
  /** 0..1 of container's frame. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** width / height — same as derived but kept for readability. */
  readonly aspectRatio: number;
  /** "wide" (>=1.6) | "square" (0.6..1.6) | "tall" (<=0.6) */
  readonly bucket: AspectBucket;
}

type AspectBucket = "wide" | "square" | "tall";

interface InsertableRecommendation {
  readonly id: string;         // unique within container kind
  readonly label: string;      // UI label
  readonly description?: string;
  readonly icon?: ReactNode;
  readonly priority: number;   // sort order; ties broken by id
}

interface InsertableDescribeContext {
  readonly containerId: string;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

interface InsertableCommitContext {
  readonly containerId: string;
  readonly editor: Editor;
}

const registry = createInsertableRegistry();
registry.register(designRootInsertable);
registry.register(canvasDesignInsertable);
registry.register(blockDocInsertable);
```

### Option B: Closed switch per containerKind

```ts
function recommendForRect(containerKind, rect, ctx) {
  switch (containerKind) {
    case "design": ...;
    case "canvas-design": ...;
    case "block-doc": ...;
  }
}
```

거부 — DR-009 / DR-010 / DR-011 의 정착 패턴 의 같은 위반.

### Option C: Hard-coded recommendation list per call site

각 호출 측 (DesignPage / NestedFrame) 의 자체 recommend 박제. 거부 — (a) 도메인 별 의 자체 분기 가 호출 측 의 자체 의 의무 의 spread, (b) 추가 시 모든 surface 의 변경.

### Option D: Composing with the existing tooltip registry (DR-011)

Tooltip 의 의 같은 시그니처 의 자체 의 재 활용. 거부 — Tooltip 의 의 의무 는 "이 item 의 visual hint", Insertable 의 의무 는 "이 container 의 의 추가 가능 한 item set". 완전 다른 polymorphism axis (item kind vs container kind) — DR-011 의 의 의무 의 의 confusion 의 risk.

## Decision

**Option A — Open Insertable Capability Registry**.

근거:
1. **정착 패턴 의 일관 application** — agocraft DR-005 + DR-009 + DR-010 + DR-011 의 동일 shape. 새 reader 의 학습 비용 0.
2. **새 컨테이너 추가 의 단일 변경 지점** — adapter file + `registry.register(adapter)` 한 곳. UI / RubberBand / Popover 의 변경 0.
3. **Aspect-ratio 분기 의 capability 안 의 내부 의 책임** — `recommend(rect, ctx)` 가 자체 의 bucket 별 분기 박제. UI 의 branching 0.
4. **Skeleton 의 도메인-aware 박제 의 위치** — `renderSkeleton` 의 adapter 안 — design-system primitive 의 domain-free 의 유지.
5. **Commit 의 도메인-aware 박제 의 위치** — `commit` 의 adapter 안 — "weave.X.add" 의 도메인 별 command 의 의무 의 호출 측 의 자체 박제 0.

## Capability shape — 정확 박제

```ts
// apps/web/src/document/insertable/types.ts

import type { Editor } from "@agocraft/editor";
import type { ReactNode } from "react";
import type { DomainKind } from "../types.js";

/**
 * Which item kinds qualify as containers for the drag-to-create flow.
 * Not the same as DomainKind — `slide` and `media` are *not* containers
 * (their interiors are not free-form). The literal `"design"` represents
 * the root canvas itself (not any DomainKind).
 */
export type ContainerKind = "design" | Extract<DomainKind, "canvas-design" | "block-doc">;

export type AspectBucket = "wide" | "square" | "tall";

export interface NormalizedDragRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: number;
  readonly bucket: AspectBucket;
}

export interface InsertableRecommendation {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly icon?: ReactNode;
  readonly priority: number;
}

export interface InsertableDescribeContext {
  readonly containerId: string;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export interface InsertableCommitContext {
  readonly containerId: string;
  readonly editor: Editor;
}

export interface InsertableCapability<K extends ContainerKind = ContainerKind> {
  readonly containerKind: K;
  readonly recommend: (
    rect: NormalizedDragRect,
    ctx: InsertableDescribeContext,
  ) => ReadonlyArray<InsertableRecommendation>;
  readonly renderSkeleton: (
    recommendation: InsertableRecommendation,
    rect: NormalizedDragRect,
  ) => ReactNode;
  readonly commit: (
    recommendation: InsertableRecommendation,
    rect: NormalizedDragRect,
    ctx: InsertableCommitContext,
  ) => void;
}

export interface InsertableRegistry {
  readonly register: <K extends ContainerKind>(
    capability: InsertableCapability<K>,
  ) => () => void;
  readonly get: <K extends ContainerKind>(
    kind: K,
  ) => InsertableCapability<K> | undefined;
  readonly list: () => ReadonlyArray<InsertableCapability>;
}
```

Aspect bucket 의 계산 의 helper (registry 의 외부 의 pure function — DRY):

```ts
export function bucketize(width: number, height: number): AspectBucket {
  const ratio = width / Math.max(height, 0.0001);
  if (ratio >= 1.6) return "wide";
  if (ratio <= 0.6) return "tall";
  return "square";
}
```

## File layout — 정확 박제

```
apps/web/src/document/insertable/
  types.ts                      — 위 의 interfaces + AspectBucket helper
  registry.ts                   — createInsertableRegistry() (DR-010 의 같은 shape)
  default-registry.ts           — 3 capability 의 register
  design-root.insertable.ts     — root canvas 의 4 domain frame 추천
  canvas-design.insertable.ts   — canvas-design frame 의 shape 추천
  block-doc.insertable.ts       — block-doc frame 의 paragraph variant 추천
```

새 container 추가 시 = `<kind>.insertable.ts` 의 새 file + `default-registry.ts` 의 1 줄 register.

## Aspect bucket 의 의 분기 의 예 (design-root.insertable.ts)

```ts
export const designRootInsertable: InsertableCapability<"design"> = {
  containerKind: "design",
  recommend: (rect, _ctx) => {
    switch (rect.bucket) {
      case "wide":
        return [
          { id: "wide-media",        label: "와이드 미디어",       priority: 1 },
          { id: "wide-canvas",       label: "가로 캔버스 디자인",   priority: 2 },
          { id: "wide-slide",        label: "가로 슬라이드",       priority: 3 },
        ];
      case "tall":
        return [
          { id: "tall-block-doc",    label: "세로 문서",           priority: 1 },
          { id: "tall-slide",        label: "세로 슬라이드 목록",   priority: 2 },
        ];
      case "square":
        return [
          { id: "square-slide",      label: "기본 슬라이드 카드",   priority: 1 },
          { id: "square-canvas",     label: "정사각 캔버스 디자인", priority: 2 },
          { id: "square-block-doc",  label: "정사각 문서 블록",     priority: 3 },
        ];
    }
  },
  renderSkeleton: (rec, _rect) => { /* 도메인 별 skeleton React node */ },
  commit: (rec, rect, ctx) => {
    const kindMap = {
      "wide-media": "media", "wide-canvas": "canvas-design", "wide-slide": "slide",
      "tall-block-doc": "block-doc", "tall-slide": "slide",
      "square-slide": "slide", "square-canvas": "canvas-design", "square-block-doc": "block-doc",
    } as const;
    const kind = kindMap[rec.id as keyof typeof kindMap];
    ctx.editor.exec("weave.item.add", {
      kind,
      containerId: ctx.containerId,
      frame: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, rotation: 0 },
    });
  },
};
```

## Consequences

- `apps/web/src/document/insertable/` 의 새 폴더 + adapter file 의 새 추가 = 미래 컨테이너 의 자연 자리.
- WI-017 의 popover 의 호출 = `registry.get(containerKind)?.recommend(rect, ctx)` 의 한 줄. closed switch 0.
- 새 도메인 (예: 향후 의 "freeform-canvas") 의 추가 = adapter file + register 한 줄. UI / RubberBand / Popover 의 변경 0.
- Skeleton + commit 의 도메인-aware 박제 가 capability 의 자체 method — RubberBand / Popover 의 visual primitive 의 domain-free 의 유지 (design-system-agent 의 charter rule).

## Mitigations

- **Capability conflict** — 같은 containerKind 의 다중 register 시 dev-warning (DR-009 / DR-010 / DR-011 의 패턴 동일).
- **Recommendation id collision across containers** — id 의 의 의 unique scope 는 containerKind 안 — 다른 컨테이너 의 같은 id ok.
- **Empty recommendation list 의 edge case** — `recommend(...)` 의 empty 시 popover 의 fallback 의 "No suggestions" 노출. UI 의 박제 의무.
- **rect 의 의 너무 작은 의 의 case** — bucket helper 의 `Math.max(height, 0.0001)` 의 0 div 의 회피. UI 의 의 min-drag-size threshold (예: ≥ 10 × 10 px) 의 별 박제 — 의 의 의 capability registry 의 외부 의 책임.

## Links

- WI-017 — `records/work-items/WI-017-rubber-band-component-creator.md`
- DR-design-007 — `records/design-reviews/DR-design-007-rubber-band-popover-primitives.md`
- DR-009 (interaction registry — 같은 패턴)
- DR-010 (manipulation registry — 같은 패턴)
- DR-011 (tooltip registry — 같은 패턴 의 세 번째 application)
- agocraft DR-005 (capability registry — 원조)
- Code structure 규칙: [[feedback-tree-shaking-first]] + extension-point 의 의무 (CLAUDE.md "Core Engineering Principles")
