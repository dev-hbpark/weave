// WI-017 Phase E + DR-017 Phase 3 — RubberBandLayer.
//
// The integration surface for drag-to-add. Lifecycle is now owned by
// agocraft's GestureRouter + `createRubberBandBinding`, with state on
// `vm.rubberBand`. This component is purely presentational + popover
// orchestration:
//
//   1. Pointer down on empty space → binding (registered via router)
//      enters `vm.rubberBand = { phase: "drawing", ... }`.
//   2. RubberBand visual mirrors vm.rubberBand and follows the pointer.
//   3. Pointer up with valid rect → binding flips to `phase:
//      "reviewing"`; the Popover renders the InsertableCapability's
//      recommendations.
//   4. Hovering a recommendation → `phase: "previewing"`; skeleton
//      silhouette renders inside the band.
//   5. Click recommendation → `commitRubberBandRecommendation(...)` →
//      capability.commit fires `editor.exec(...)`; vm.rubberBand→null.
//   6. Esc / outside click → vm.rubberBand→null directly.
//
// The capability passed to agocraft is wrapped via
// `adaptWeaveCapabilityToAgocraft` (this folder) so weave's domain-
// specific recommend/commit shape (bucket-aware + history-aware)
// projects onto agocraft's minimal contract. Per WI-018: agocraft stays
// domain-agnostic, weave owns the bridge.

import type { Editor, RubberBandState as VmRubberBandState } from "@agocraft/editor";
import {
  commitRubberBandRecommendation,
  createRubberBandBinding,
  GESTURE_PRIORITY,
} from "@agocraft/editor";
import { Popover, PopoverAnchor, PopoverContent, RubberBand } from "@weave/design-system";
import {
  forwardRef,
  type MutableRefObject,
  type ReactNode,
  type Ref,
  type RefCallback,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTooltipsAllowed } from "../interactions/interaction-mode.js";
import { useEditorVMOrNull } from "../interactions/editor-vm-context.js";
import { useRouterOrNull } from "../interactions/router-context.js";
import { defaultInsertableRegistry } from "../insertable/default-registry.js";
import {
  type ContainerKind,
  type InsertableHoverHint,
  type InsertableRecommendation,
  type NormalizedDragRect,
  normalizeDragRect,
} from "../insertable/types.js";
import { adaptWeaveCapabilityToAgocraft } from "./agocraft-adapter.js";
import { EmptySpaceHint } from "./EmptySpaceHint.js";
import { RecommendationPopover } from "./RecommendationPopover.js";

export interface RubberBandLayerProps {
  readonly containerKind: ContainerKind;
  readonly containerId: string;
  /** Coordinate space (in pixels) the rect should land in — used by
   *  `normalizeDragRect` to produce the 0..1 ratio the InsertableCapability
   *  expects. When `clientToLocal` is supplied the rect lives in *that*
   *  space (e.g. design pixels), and `containerSize` should match. */
  readonly containerSize: { readonly width: number; readonly height: number };
  readonly editor: Editor;
  readonly snapSize?: number;
  readonly minDragSize?: number;
  /** Override the host-based viewport→local conversion. */
  readonly clientToLocal?: (
    clientX: number,
    clientY: number,
  ) => { readonly x: number; readonly y: number };
  /** Optional portal target for the rubber-band visual. */
  readonly visualHost?: RefObject<HTMLElement | null> | null;
  /** When `true`, plain empty-space drags do NOT start the add gesture —
   *  only Option(Alt)-held drags do. */
  readonly requireAltKey?: boolean;
  /** Optional target-acceptance gate (forwarded to the binding's
   *  `acceptTarget`). Return `false` to yield the press so an inner /
   *  sibling binding can claim it (e.g. clicks on frame bodies,
   *  shapes, selection handles, or hotspots when this host is the
   *  outer design-plane). */
  readonly acceptTarget?: (target: Element) => boolean;
  /** When `true`, this layer becomes visual-only: it does NOT register
   *  a router binding. Some other host (typically the outer FrameStage
   *  router) is expected to own the rubber-band gesture and write
   *  `vm.rubberBand`; this layer subscribes to the same slot for
   *  rendering. Use this when the binding's host needs to sit ABOVE
   *  this layer in the DOM so its priority can win over sibling
   *  bindings on the same router. */
  readonly bindingExternal?: boolean;
  readonly className?: string;
  readonly style?: React.CSSProperties;
  /** The canvas content. Children that should NOT trigger drag-create
   *  (frames, shapes, text editors) must stopPropagation on pointerdown. */
  readonly children: ReactNode;
}

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
      clientToLocal,
      visualHost,
      requireAltKey,
      acceptTarget,
      bindingExternal,
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

  const vm = useEditorVMOrNull();
  const router = useRouterOrNull();
  const hostElementRef = useRef<HTMLDivElement | null>(null);

  // Adapt weave's product-specific capability to agocraft's minimal contract
  // before handing it to the binding (DR-017 bridge).
  const adaptedCapability = useMemo(
    () =>
      capability === undefined
        ? undefined
        : adaptWeaveCapabilityToAgocraft(capability, editor),
    [capability, editor],
  );

  // Stable refs so the binding closure observes the latest clientToLocal
  // without re-registering (re-registration would tear off / re-bind the
  // capture listener mid-session and lose any in-flight gesture).
  const containerSizeRef = useRef(containerSize);
  containerSizeRef.current = containerSize;
  const clientToLocalRef = useRef(clientToLocal);
  clientToLocalRef.current = clientToLocal;
  const acceptTargetRef = useRef(acceptTarget);
  acceptTargetRef.current = acceptTarget;

  // Register RubberBandBinding via router. The binding owns the gesture
  // lifecycle (pointerdown/move/up → vm.rubberBand transitions). When
  // `bindingExternal` is true, an outer host owns the gesture; we skip
  // registration and only render visuals.
  useEffect(() => {
    if (bindingExternal === true) return undefined;
    if (router === null || vm === null) return undefined;
    if (adaptedCapability === undefined) return undefined;
    const teardownRouter = router.register({
      host: hostElementRef,
      bindings: [
        createRubberBandBinding({
          hostId: containerId,
          containerId,
          containerSize,
          clientToLocal:
            clientToLocalRef.current ??
            ((cx, cy) => {
              const host = hostElementRef.current;
              if (host === null) return { x: 0, y: 0 };
              const r = host.getBoundingClientRect();
              const cs = containerSizeRef.current;
              const sx = host.offsetWidth > 0 ? r.width / host.offsetWidth : 1;
              const sy = host.offsetHeight > 0 ? r.height / host.offsetHeight : 1;
              return {
                x: (cx - r.left) / sx,
                y: (cy - r.top) / sy,
              };
              // (Note: when an explicit clientToLocal is supplied — typically
              //  the design-plane host that targets `cs.width × cs.height`
              //  design coords — that closure handles the conversion.)
              void cs;
            }),
          capability: adaptedCapability,
          modifiers: requireAltKey === true ? { alt: "required", button: 0 } : { button: 0 },
          // Latest acceptTarget read via ref so the binding doesn't
          // need to be re-registered when the host updates its filter.
          acceptTarget: (t) => {
            const fn = acceptTargetRef.current;
            return fn === undefined ? true : fn(t);
          },
          priority: GESTURE_PRIORITY.REGION_GESTURE,
          ...(snapSize !== undefined ? { snapSize } : {}),
          ...(minDragSize !== undefined ? { minDragSize } : {}),
        }),
      ],
    });
    return teardownRouter;
    // IMPORTANT: depend on the primitive width / height — NOT the
    // containerSize object identity. The parent typically passes a
    // fresh `{width, height}` object each render, which would otherwise
    // teardown + re-register the binding every paint. Mid-drag that
    // would GC the binding closure and silently drop pointermove /
    // pointerup, leaving vm.rubberBand stuck in "drawing".
  }, [bindingExternal, router, vm, adaptedCapability, containerId, containerSize.width, containerSize.height, requireAltKey, snapSize, minDragSize]);

  // Mirror vm.rubberBand to a local rb-shaped value so the existing render
  // code (visual / popover / chrome) doesn't have to learn new field names.
  // Only this host's slot owns the visual — other hosts' rubber-bands are
  // ignored.
  const [rbSlot, setRbSlot] = useState<VmRubberBandState | null>(null);
  useEffect(() => {
    if (vm === null) return undefined;
    const sub = () => {
      const slot = vm.rubberBand.get();
      if (slot !== null && slot.hostId === containerId) {
        setRbSlot(slot);
      } else {
        setRbSlot(null);
      }
    };
    sub();
    return vm.rubberBand.subscribe(sub);
  }, [vm, containerId]);

  // Outside-press dismissal — window-level capture pointerdown
  // listener that closes this host's popover when the press lands
  // OUTSIDE the popover content. Radix's own outside-click detector
  // misses these presses because the gesture router calls
  // `stopImmediatePropagation` before Radix's listener runs. We
  // attach at window capture phase, which fires strictly BEFORE any
  // host-level listener, so we see every pointerdown unconditionally.
  //
  // Only acts while THIS host's popover is in reviewing/previewing.
  // The "outside" check looks for the popover content via
  // `[data-side]` (Radix marks the rendered content with the chosen
  // side). Inside-content / inside-rect presses keep the popover.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (vm === null) return undefined;
    const onDown = (e: PointerEvent) => {
      const slot = vm.rubberBand.get();
      if (slot === null) return;
      if (slot.hostId !== containerId) return;
      if (slot.phase !== "reviewing" && slot.phase !== "previewing") return;
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      // Inside the popover content (Radix marks with data-side), an
      // explicit option button, OR the rubber-band rect itself — all
      // count as "still interacting with the same popover".
      if (
        t.closest("[data-side]") !== null ||
        t.closest('[role="option"]') !== null ||
        t.closest('[data-testid="rubber-band"]') !== null
      ) {
        return;
      }
      vm.rubberBand.set(null);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [vm, containerId]);

  const rb = useMemo(() => {
    if (rbSlot === null) {
      return { state: "idle" as const, rect: null, previewKind: null as string | null };
    }
    return {
      state: rbSlot.phase,
      rect: rbSlot.rectLocal,
      previewKind:
        rbSlot.phase === "reviewing" || rbSlot.phase === "previewing"
          ? rbSlot.previewKind
          : null,
    };
  }, [rbSlot]);

  // Capture the pointerup position so the recommendation popover can
  // open on the side of the rect that's CLOSEST to where the user
  // released. Without this we'd have to default to a fixed side
  // (currently "right"), which forces a long mouse trip on left-side
  // releases.
  //
  // Attached at WINDOW capture phase — the gesture router stops
  // immediate propagation on the host AFTER claiming, which prevents
  // any host-level capture listener from running. window-capture fires
  // strictly before host-capture in DOM order, so we still see the
  // release position before the router consumes the event.
  //
  // CRITICAL: only snapshot when vm.rubberBand is currently in
  // "drawing" phase — i.e. this pointerup IS the end of a drag-add.
  // Without that guard, every subsequent pointerup (clicking a rec in
  // the popover, clicking another frame, etc.) would re-write
  // releasePoint and the popover would re-position itself near the
  // new cursor — to the user it looks like the menu is being
  // recreated every click.
  const [releasePoint, setReleasePoint] = useState<
    { readonly x: number; readonly y: number } | null
  >(null);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (vm === null) return undefined;
    const onUp = (e: PointerEvent) => {
      const slot = vm.rubberBand.get();
      // Only snapshot if a drag is currently in "drawing" — that's the
      // pointerup that ends the drag. Any other pointerup (rec click,
      // frame click, etc.) leaves releasePoint untouched.
      if (slot === null || slot.phase !== "drawing") return;
      if (slot.hostId !== containerId) return;
      setReleasePoint({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("pointerup", onUp, true);
    return () => window.removeEventListener("pointerup", onUp, true);
  }, [vm, containerId]);
  // Drop the captured release point once the popover closes so a stale
  // value never feeds the NEXT drag's side decision.
  useEffect(() => {
    if (rb.state === "idle") setReleasePoint(null);
  }, [rb.state]);

  // Local hoverPoint tracking — vm doesn't track per-host hover; the
  // legacy useRubberBand attached pointermove on its own host element
  // and stored client coords for the EmptySpaceHint popover anchor.
  // We do the same here via a small pointermove listener on the host.
  const [hoverPoint, setHoverPoint] = useState<
    { readonly clientX: number; readonly clientY: number } | null
  >(null);
  useEffect(() => {
    const host = hostElementRef.current;
    if (host === null) return undefined;
    const onMove = (e: PointerEvent) => {
      // Only when our host is idle (no drag in flight). hostId guard
      // already gates rbSlot, so rb.state reflects this host only.
      if (rb.state !== "idle") {
        if (hoverPoint !== null) setHoverPoint(null);
        return;
      }
      const target = e.target as Element | null;
      if (target === null) {
        setHoverPoint(null);
        return;
      }
      // Don't hint when over a frame child — frames carry their own
      // item-level affordances.
      if (target.closest("[data-frame-id]") !== null) {
        setHoverPoint(null);
        return;
      }
      setHoverPoint({ clientX: e.clientX, clientY: e.clientY });
    };
    const onLeave = () => setHoverPoint(null);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, [rb.state, hoverPoint]);

  // Track Alt globally so the cursor / hover hint can reflect the mode
  // switch the moment the key is pressed, even before any pointer event.
  const [altActive, setAltActive] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const down = (e: KeyboardEvent) => {
      if (e.altKey) setAltActive(true);
    };
    const up = (e: KeyboardEvent) => {
      if (!e.altKey) setAltActive(false);
    };
    const blur = () => setAltActive(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // Recommendation list for popover content (re-derived each render — the
  // input is stable while in reviewing/previewing).
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

  // Skeleton for the previewing state.
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

  const visualState =
    rb.state === "drawing"
      ? "drawing"
      : rb.state === "previewing"
        ? "previewing"
        : "reviewing";

  const popoverOpen = rb.state === "reviewing" || rb.state === "previewing";

  // Preview / commit / cancel — operate directly on vm.rubberBand and the
  // adapted capability.
  const preview = useCallback(
    (kind: string | null) => {
      if (vm === null) return;
      const slot = vm.rubberBand.get();
      if (slot === null) return;
      if (slot.hostId !== containerId) return;
      if (slot.phase !== "reviewing" && slot.phase !== "previewing") return;
      // Idempotent — skip when the requested state matches the current
      // slot. Pre-fix bug: every pointer event over a rec fired
      // preview() with the SAME kind, each call constructing a new
      // object and calling vm.rubberBand.set, triggering a re-render
      // storm. The storm racing against pointerdown/up made click
      // events drop their target (the rec button moved between down
      // and up) — to the user the menu button stopped responding at
      // some positions. Also surfaces as the React DevTools warning
      // "showPopover on disconnected popover elements".
      if (kind === null && slot.phase === "reviewing") return;
      if (kind !== null && slot.phase === "previewing" && slot.previewKind === kind) return;
      vm.rubberBand.set(
        kind === null
          ? { phase: "reviewing", rectLocal: slot.rectLocal, hostId: slot.hostId, previewKind: null }
          : { phase: "previewing", rectLocal: slot.rectLocal, hostId: slot.hostId, previewKind: kind },
      );
    },
    [vm, containerId],
  );

  const commitFn = useCallback(() => {
    if (vm === null || adaptedCapability === undefined) return;
    const slot = vm.rubberBand.get();
    if (slot === null) return;
    if (slot.hostId !== containerId) return;
    const recId =
      (slot.phase === "reviewing" || slot.phase === "previewing"
        ? slot.previewKind
        : null) ?? recommendations[0]?.id;
    if (recId === undefined) {
      vm.rubberBand.set(null);
      return;
    }
    commitRubberBandRecommendation(
      {
        vm,
        capability: adaptedCapability,
        editor,
        containerId,
        containerSize,
      },
      recId,
    );
  }, [vm, adaptedCapability, editor, containerId, containerSize, recommendations]);

  const cancel = useCallback(() => {
    if (vm === null) return;
    const slot = vm.rubberBand.get();
    if (slot === null || slot.hostId !== containerId) return;
    vm.rubberBand.set(null);
  }, [vm, containerId]);

  // Pick the popover side (top / right / bottom / left) so the menu
  // opens NEXT TO the side of the rubber-band rect closest to where
  // the user released the pointer. If that side has insufficient
  // viewport space (popover would clip), fall through in cursor-
  // distance order to the next-closest side that DOES fit. Align
  // (start / end) follows the cursor along the chosen side so the
  // menu lands near the corner the user just left, not at the side's
  // dead centre.
  //
  // Output is a `{ side, align }` pair fed straight to Radix's
  // PopoverContent. We only recompute when reviewing actually opens
  // — once chosen, the side stays put for the duration of the
  // popover so the menu doesn't jump as the cursor moves.
  type PopSide = "top" | "right" | "bottom" | "left";
  type PopAlign = "start" | "center" | "end";
  const [popoverSide, popoverAlign] = useMemo<[PopSide, PopAlign]>(() => {
    // Approximate popover footprint — better than a fixed guess
    // because it scales with the recommendation count.
    const POP_W = 320;
    const POP_H = Math.min(400, 80 + 64 * Math.max(1, recommendations.length));
    if (typeof window === "undefined") return ["right", "start"];
    if (rb.rect === null) return ["right", "start"];
    // Convert the local rect to viewport pixels via the active
    // visualHost projector so the side comparison uses on-screen
    // distances.
    const projector = visualHost?.current ?? hostElementRef.current;
    if (projector === null) return ["right", "start"];
    const r = projector.getBoundingClientRect();
    const sx = visualHost
      ? r.width / containerSize.width
      : r.width / (projector.offsetWidth || containerSize.width);
    const sy = visualHost
      ? r.height / containerSize.height
      : r.height / (projector.offsetHeight || containerSize.height);
    const L = r.left + rb.rect.left * sx;
    const T = r.top + rb.rect.top * sy;
    const R = L + rb.rect.width * sx;
    const B = T + rb.rect.height * sy;
    const cx = releasePoint?.x ?? (L + R) / 2;
    const cy = releasePoint?.y ?? (T + B) / 2;
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    const SIDES: ReadonlyArray<PopSide> = ["top", "right", "bottom", "left"];
    const dist: Record<PopSide, number> = {
      top: Math.abs(cy - T),
      right: Math.abs(cx - R),
      bottom: Math.abs(cy - B),
      left: Math.abs(cx - L),
    };
    const space: Record<PopSide, number> = {
      top: T,
      right: vpW - R,
      bottom: vpH - B,
      left: L,
    };
    const need: Record<PopSide, number> = {
      top: POP_H,
      right: POP_W,
      bottom: POP_H,
      left: POP_W,
    };
    const ranked = [...SIDES].sort((a, b) => dist[a] - dist[b]);
    const chosen = ranked.find((s) => space[s] >= need[s]) ?? ranked[0]!;
    // Pick align so the popover hugs the corner closer to the cursor.
    // For vertical sides (left/right) align governs the y axis; for
    // horizontal sides (top/bottom) align governs the x axis.
    let align: PopAlign = "start";
    if (chosen === "left" || chosen === "right") {
      const midY = (T + B) / 2;
      align = cy < midY ? "start" : "end";
    } else {
      const midX = (L + R) / 2;
      align = cx < midX ? "start" : "end";
    }
    return [chosen, align];
    // Recompute when reviewing OPENS (popoverOpen flips true) or when
    // the captured release point arrives (set by the window pointerup
    // listener — may resolve a frame after rb.state due to React
    // scheduling). Once both are present the result locks: subsequent
    // hover/preview state changes don't move the popover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rb.state === "reviewing" || rb.state === "previewing",
    releasePoint,
  ]);

  // Esc dismissal is owned at the editor level (FrameStage's single
  // Esc handler routes through `router.cancelActive()`, which clears
  // vm.rubberBand alongside any in-flight binding). The
  // per-RubberBandLayer Esc listener used to cancel ONLY the
  // popover/visual state — it left an in-flight drag binding alive,
  // so a subsequent pointerup re-opened the popover. See DR-021.

  // Viewport-projected rect — same projection logic as before, but the
  // rect input is from `rb` (mirrored from vm.rubberBand).
  const localRectRef = useRef(rb.rect);
  localRectRef.current = rb.rect;
  const [viewportRect, setViewportRect] = useState<{
    left: number; top: number; width: number; height: number;
  } | null>(null);
  const bandActive = rb.rect !== null;
  useEffect(() => {
    if (!bandActive) {
      setViewportRect(null);
      return;
    }
    let raf = 0;
    let lastKey = "";
    const tick = () => {
      const projector = visualHost?.current ?? hostElementRef.current;
      const rect = localRectRef.current;
      if (projector !== null && rect !== null) {
        const r = projector.getBoundingClientRect();
        const sx = visualHost
          ? r.width / containerSize.width
          : r.width / (projector.offsetWidth || containerSize.width);
        const sy = visualHost
          ? r.height / containerSize.height
          : r.height / (projector.offsetHeight || containerSize.height);
        const left = r.left + rect.left * sx;
        const top = r.top + rect.top * sy;
        const width = rect.width * sx;
        const height = rect.height * sy;
        const key = `${left.toFixed(1)}|${top.toFixed(1)}|${width.toFixed(
          1,
        )}|${height.toFixed(1)}`;
        if (key !== lastKey) {
          lastKey = key;
          setViewportRect({ left, top, width, height });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bandActive, visualHost, containerSize]);

  // Virtual anchor for the recommendation popover.
  const popoverVirtualRef = useMemo(() => {
    if (rb.rect === null) return null;
    const rect = rb.rect;
    return {
      current: {
        getBoundingClientRect: (): DOMRect => {
          const projector = visualHost?.current ?? hostElementRef.current;
          if (projector === null) {
            return {
              x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0,
              width: 0, height: 0, toJSON: () => ({}),
            } as DOMRect;
          }
          const r = projector.getBoundingClientRect();
          const sx = visualHost
            ? r.width / containerSize.width
            : r.width / (projector.offsetWidth || containerSize.width);
          const sy = visualHost
            ? r.height / containerSize.height
            : r.height / (projector.offsetHeight || containerSize.height);
          const left = r.left + rect.left * sx;
          const top = r.top + rect.top * sy;
          const width = rect.width * sx;
          const height = rect.height * sy;
          return {
            x: left, y: top, left, top,
            right: left + width, bottom: top + height,
            width, height, toJSON: () => ({}),
          } as DOMRect;
        },
      },
    };
  }, [rb.rect, visualHost, containerSize]);

  // Empty-space hover hint content.
  const hoverHint: InsertableHoverHint | null = useMemo(() => {
    if (capability === undefined) return null;
    const described = capability.describeHover?.({
      containerId,
      canUndo: editor.history.canUndo(),
      canRedo: editor.history.canRedo(),
    });
    if (described !== undefined) return described;
    return requireAltKey === true
      ? {
          title: "여기에 추가",
          hint: "⌥ 드래그 — 새 아이템 추가.",
          kinds: [],
        }
      : {
          title: "여기에 추가",
          hint: "드래그 — 새 아이템 추가. ⌥ 드래그 — 다른 아이템 위에서도 추가.",
          kinds: [],
        };
  }, [capability, containerId, editor, requireAltKey]);

  const tooltipsAllowed = useTooltipsAllowed();
  const hintOpen = rb.state === "idle" && hoverPoint !== null && tooltipsAllowed;

  const composedRef = useCallback(
    mergeRefs<HTMLDivElement>(forwardedRef, hostElementRef),
    [forwardedRef],
  );

  return (
    <div
      ref={composedRef}
      className={className}
      style={{
        position: "relative",
        ...(rb.state === "drawing"
          ? { cursor: "crosshair" }
          : altActive
            ? { cursor: "copy" }
            : {}),
        ...style,
      }}
      data-testid="rubber-band-host"
      data-rubber-band-host-state={rb.state}
      data-rubber-band-alt-active={altActive ? "true" : "false"}
      data-rubber-band-pop-side={popoverSide}
      data-rubber-band-pop-align={popoverAlign}
    >
      {children}

      <EmptySpaceHint
        open={hintOpen}
        clientPoint={hoverPoint}
        hint={hoverHint}
        altActive={altActive}
      />

      {viewportRect !== null
        ? (() => {
            const rectV = viewportRect;
            const hasDragArea = rectV.width >= 1 || rectV.height >= 1;
            // Dimensions chip should show the SNAPPED domain values so
            // snap behaviour is visible (viewport projection otherwise
            // hides the 20-design-px steps). rb.rect lives in the
            // container's coordinate space (design pixels for the
            // design plane; viewport-equivalent for canvas/doc inner).
            const chipDims =
              rb.rect !== null
                ? { width: rb.rect.width, height: rb.rect.height }
                : undefined;
            const visual =
              !hasDragArea ? null : rb.state === "drawing" ? (
                <RubberBand
                  rect={rectV}
                  state="drawing"
                  {...(chipDims !== undefined ? { displayDimensions: chipDims } : {})}
                />
              ) : popoverOpen ? (
                <RubberBand
                  rect={rectV}
                  state={visualState}
                  {...(chipDims !== undefined ? { displayDimensions: chipDims } : {})}
                >
                  {skeleton}
                </RubberBand>
              ) : null;
            if (visual === null) return null;
            return createPortal(
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  pointerEvents: "none",
                  zIndex: 45,
                }}
              >
                {visual}
              </div>,
              document.body,
            );
          })()
        : null}

      {popoverOpen && rb.rect !== null ? (
        <Popover
          open
          onOpenChange={(o) => {
            if (!o) cancel();
          }}
        >
          {popoverVirtualRef !== null ? (
            <PopoverAnchor virtualRef={popoverVirtualRef} />
          ) : null}
          <PopoverContent
            side={popoverSide}
            align={popoverAlign}
            sideOffset={12}
            collisionPadding={16}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              if (typeof document !== "undefined") {
                document.body.focus?.();
              }
            }}
          >
            <RecommendationPopover
              recommendations={recommendations}
              onHover={(id) => preview(id)}
              onSelect={(_id) => commitFn()}
            />
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
});
