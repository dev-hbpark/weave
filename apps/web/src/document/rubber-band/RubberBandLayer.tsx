// WI-017 Phase E — RubberBandLayer.
//
// The integration component that ties Phases B + C + D together. Mount this
// around the content of any container that should accept drag-to-create:
//   - DesignPage root canvas (containerKind="design", Phase F).
//   - FrameStage NestedFrame for canvas-design / block-doc (Phase F).
//
// Lifecycle:
//   1. Pointer down on empty space → `useRubberBand` enters `drawing`.
//   2. RubberBand visual follows the pointer until pointer up.
//   3. Pointer up with valid rect → `reviewing`. RubberBand stays as a dashed
//      placeholder; Popover opens anchored to it, listing
//      `InsertableCapability.recommend(...)` results.
//   4. Hovering a recommendation → `previewing`. RubberBand pulses; the
//      capability's `renderSkeleton` is injected as children.
//   5. Clicking a recommendation → `commit` → capability's `commit` fires
//      `editor.exec(...)` and the hook resets to `idle`.
//   6. Esc / outside click → cancel → `idle`.
//
// The host element receives `useRubberBand`'s `hostProps`, including pointer-
// down/move/up/cancel. Children (frames, shapes, etc.) inside the host MUST
// stopPropagation on their own pointerdown so the rubber band only fires on
// truly empty space.

import type { Editor } from "@agocraft/editor";
import { Popover, PopoverAnchor, PopoverContent, RubberBand } from "@weave/design-system";
import {
  forwardRef,
  type MutableRefObject,
  type ReactNode,
  type Ref,
  type RefCallback,
  useCallback,
  useMemo,
} from "react";
import { defaultInsertableRegistry } from "../insertable/default-registry.js";
import {
  type InsertableRecommendation,
  type NormalizedDragRect,
  normalizeDragRect,
  type ContainerKind,
} from "../insertable/types.js";
import { RecommendationPopover } from "./RecommendationPopover.js";
import { useRubberBand } from "./use-rubber-band.js";

export interface RubberBandLayerProps {
  readonly containerKind: ContainerKind;
  readonly containerId: string;
  /** Host element's coordinate space in pixels — used to normalize the drag
   *  rect into the 0..1 ratio space the InsertableCapability expects. */
  readonly containerSize: { readonly width: number; readonly height: number };
  readonly editor: Editor;
  readonly snapSize?: number;
  readonly minDragSize?: number;
  /** Class for the host wrapper. Caller must ensure `position: relative`
   *  (or absolute) so the rubber band's `position: absolute` anchors here. */
  readonly className?: string;
  /** Optional inline style for the host wrapper (e.g. width/height). */
  readonly style?: React.CSSProperties;
  /** The canvas content. Children that should NOT trigger drag-create
   *  (frames, shapes, text editors) must stopPropagation on pointerdown. */
  readonly children: ReactNode;
}

/** Compose a forwarded ref with our hook's internal ref so callers (e.g.
 *  CanvasBlock keeping a `viewportRef` for shape-coord math) can read the
 *  same host element the hook uses. Mirrors Radix's compose-refs without
 *  pulling the package. */
function mergeRefs<T>(
  ...refs: ReadonlyArray<Ref<T> | undefined>
): RefCallback<T> {
  return (value: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") {
        ref(value);
      } else if (ref != null) {
        (ref as MutableRefObject<T | null>).current = value;
      }
    }
  };
}

export const RubberBandLayer = forwardRef<HTMLDivElement, RubberBandLayerProps>(
  function RubberBandLayer(
    {
      containerKind,
      containerId,
      containerSize,
      editor,
      snapSize,
      minDragSize,
      className,
      style,
      children,
    },
    forwardedRef,
  ) {
  const capability = useMemo(
    () => defaultInsertableRegistry.get(containerKind),
    [containerKind],
  );

  const rb = useRubberBand({
    ...(snapSize !== undefined ? { snapSize } : {}),
    ...(minDragSize !== undefined ? { minDragSize } : {}),
    onCommit: (rect) => {
      if (capability === undefined) return;
      // The committed recommendation is whichever was last `previewKind`.
      // If user clicked without hovering first (keyboard / very fast click
      // path), we fall back to the highest-priority recommendation for the
      // rect's bucket.
      const normalized = normalizeDragRect(rect, containerSize);
      const recommendations = capability.recommend(normalized, {
        containerId,
        canUndo: editor.history.canUndo(),
        canRedo: editor.history.canRedo(),
      });
      const id = rb.previewKind ?? recommendations[0]?.id;
      if (id === undefined) return;
      const rec = recommendations.find((r) => r.id === id);
      if (rec === undefined) return;
      capability.commit(rec, normalized, { containerId, editor });
    },
  });

  // Normalize rect + look up recommendations for the popover content. Both
  // are pure — they re-derive on every render but the inputs are stable
  // between renders during reviewing/previewing.
  const normalized: NormalizedDragRect | null =
    rb.rect !== null ? normalizeDragRect(rb.rect, containerSize) : null;
  const recommendations: ReadonlyArray<InsertableRecommendation> =
    normalized !== null && capability !== undefined
      ? capability.recommend(normalized, {
          containerId,
          canUndo: editor.history.canUndo(),
          canRedo: editor.history.canRedo(),
        })
      : [];

  // Skeleton for the previewing state — rendered inside RubberBand as
  // children. Domain-aware silhouette lives in the capability adapter.
  const skeleton: ReactNode =
    rb.state === "previewing" &&
    rb.previewKind !== null &&
    capability !== undefined &&
    normalized !== null
      ? (() => {
          const rec = recommendations.find((r) => r.id === rb.previewKind);
          if (rec === undefined) return null;
          return capability.renderSkeleton(rec, normalized);
        })()
      : null;

  // Map our 5-state machine onto RubberBand's 3 visual states. `inserting`
  // looks the same as `previewing` for the brief moment it's on-screen
  // before the hook resets to idle.
  const visualState =
    rb.state === "drawing"
      ? "drawing"
      : rb.state === "previewing" || rb.state === "inserting"
        ? "previewing"
        : "reviewing";

  const popoverOpen = rb.state === "reviewing" || rb.state === "previewing";

  const composedRef = useCallback(
    mergeRefs<HTMLDivElement>(forwardedRef, rb.hostProps.ref as Ref<HTMLDivElement>),
    [forwardedRef, rb.hostProps.ref],
  );

  return (
    <div
      ref={composedRef}
      onPointerDown={rb.hostProps.onPointerDown}
      onPointerMove={rb.hostProps.onPointerMove}
      onPointerUp={rb.hostProps.onPointerUp}
      onPointerCancel={rb.hostProps.onPointerCancel}
      className={className}
      style={{ position: "relative", ...style }}
      data-testid="rubber-band-host"
      data-rubber-band-host-state={rb.state}
    >
      {children}

      {/* Drawing state — RubberBand only, no popover yet. */}
      {rb.state === "drawing" && rb.rect !== null ? (
        <RubberBand rect={rb.rect} state="drawing" />
      ) : null}

      {/* Reviewing / previewing — Popover anchored on the persistent rubber
          band. PopoverAnchor's `virtualRef` lets us anchor on an arbitrary
          rect without making the RubberBand itself a Radix trigger (which
          would conflict with its `pointer-events: none`). */}
      {popoverOpen && rb.rect !== null ? (
        <Popover
          open
          onOpenChange={(o) => {
            if (!o) rb.cancel();
          }}
        >
          {/* The RubberBand visual is rendered inside PopoverAnchor so Radix
              positions the content relative to it. asChild composes Anchor's
              props onto RubberBand. */}
          <PopoverAnchor asChild>
            <RubberBand rect={rb.rect} state={visualState}>
              {skeleton}
            </RubberBand>
          </PopoverAnchor>
          <PopoverContent
            side="right"
            align="start"
            sideOffset={12}
            collisionPadding={16}
            // Prevent Radix's default behavior of auto-focusing the first
            // focusable element on open — keeps the popover dismissable via
            // the user's pointer flow without yanking focus from the canvas.
            onOpenAutoFocus={(e) => e.preventDefault()}
            // Focus restoration target on close: hand to the document body
            // (per frontend-design-pattern-agent's Phase B note #3). Radix's
            // default would point at the synthetic anchor, which is wrong
            // because there's no trigger to return focus to.
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              if (typeof document !== "undefined") {
                document.body.focus?.();
              }
            }}
          >
            <RecommendationPopover
              recommendations={recommendations}
              onHover={(id) => rb.preview(id)}
              onSelect={(_id) => rb.commit()}
            />
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
});
