// WI-017 Phase D — Insertable capability types (DR-012).
//
// Open registry pattern. One adapter per `ContainerKind`. Each adapter owns
// three concerns:
//   1. `recommend(rect, ctx)` — what items can be inserted, ordered by
//      relevance for the rect's aspect bucket.
//   2. `renderSkeleton(rec, rect)` — domain-aware silhouette shown inside
//      the persistent guide box during popover-item hover.
//   3. `commit(rec, rect, ctx)` — dispatch the editor command that actually
//      inserts the item.

import type { Editor } from "@agocraft/editor";
import type { ReactNode } from "react";
import type { DomainKind } from "../types.js";

/**
 * Which item kinds qualify as containers for the drag-to-create flow.
 * Not the same as DomainKind:
 *   - `"design"` — the root canvas itself (not any DomainKind).
 *   - `"canvas-design"` — a canvas frame's interior (holds shapes).
 *   - `"block-doc"` — a doc frame's interior (holds paragraphs).
 * `slide` and `media` are explicitly NOT containers (their interiors are
 * structured, not free-form).
 */
export type ContainerKind = "design" | Extract<DomainKind, "canvas-design" | "block-doc">;

export type AspectBucket = "wide" | "square" | "tall";

export interface NormalizedDragRect {
  /** 0..1 ratio of the container's coordinate space. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** width / height — kept for readability alongside `bucket`. */
  readonly aspectRatio: number;
  readonly bucket: AspectBucket;
}

export interface InsertableRecommendation {
  /** Unique within the container kind. Used as React key + commit dispatch. */
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly icon?: ReactNode;
  /** Lower number = higher in the list. Ties broken by id ordering. */
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

/** Content surfaced on empty-space hover (Phase G). Tells the user what
 *  they can build by dragging here. `kinds` is the unfiltered catalog —
 *  no bucket has been applied yet because no drag has happened. */
export interface InsertableHoverHint {
  readonly title: string;
  readonly hint: string;
  readonly kinds: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly icon?: ReactNode;
  }>;
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
  /** Phase G — empty-space hover hint. Optional; layer falls back to a
   *  generic message when undefined. */
  readonly describeHover?: (ctx: InsertableDescribeContext) => InsertableHoverHint;
}

export interface InsertableRegistry {
  readonly register: <K extends ContainerKind>(capability: InsertableCapability<K>) => () => void;
  readonly get: <K extends ContainerKind>(kind: K) => InsertableCapability<K> | undefined;
  readonly list: () => ReadonlyArray<InsertableCapability>;
}

/**
 * Pure helper — classify an aspect ratio into one of the 3 buckets. Used by
 * both adapters (to branch their recommendations) and consumers (to build
 * a `NormalizedDragRect` from raw host coords).
 */
export function bucketize(width: number, height: number): AspectBucket {
  const ratio = width / Math.max(height, 0.0001);
  if (ratio >= 1.6) return "wide";
  if (ratio <= 0.6) return "tall";
  return "square";
}

/**
 * Build a `NormalizedDragRect` from host-local pixel coords + container
 * dimensions. Centralizes the ratio + bucket math so adapters never see
 * raw pixels.
 */
export function normalizeDragRect(
  hostRect: { left: number; top: number; width: number; height: number },
  containerSize: { width: number; height: number },
): NormalizedDragRect {
  const x = hostRect.left / Math.max(containerSize.width, 0.0001);
  const y = hostRect.top / Math.max(containerSize.height, 0.0001);
  const width = hostRect.width / Math.max(containerSize.width, 0.0001);
  const height = hostRect.height / Math.max(containerSize.height, 0.0001);
  const aspectRatio = hostRect.width / Math.max(hostRect.height, 0.0001);
  return {
    x,
    y,
    width,
    height,
    aspectRatio,
    bucket: bucketize(hostRect.width, hostRect.height),
  };
}
