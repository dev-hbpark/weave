import type { Item as AgocraftItem } from "@agocraft/core";
import { createInputBus } from "@agocraft/input/bus";
import { createHotkeyRegistry } from "@agocraft/input/hotkey";
import { PresentChrome, Spinner, Stage, type StageScene } from "@weave/design-system";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  type AgoItem,
  type ButtonTriggerBehavior,
  type CameraTargetBehavior,
  type EntranceAnimationBehavior,
  effectivePresentationOrder,
  FRAME_KINDS,
  type HotspotAction,
  type HoverEffectBehavior,
  type ItemFrame,
  type PresentContext,
  useDesign,
} from "../document";
import { findItemDeep, findTrailDeep, isDomainItem } from "../document/agocraft-mirror.js";
import { PresentFrameTree } from "../document/render/PresentFrameTree.js";
import { DocumentForResolutionProvider } from "../document/style/resolver-context.js";

// Phase 13d-3 — entrance-animation Web Animations API keyframes per mode.
function entranceKeyframes(mode: EntranceAnimationBehavior["mode"]): Keyframe[] {
  switch (mode) {
    case "fade":
      return [{ opacity: 0 }, { opacity: 1 }];
    case "slide-up":
      return [
        { opacity: 0, transform: "translateY(24px)" },
        { opacity: 1, transform: "translateY(0)" },
      ];
    case "slide-down":
      return [
        { opacity: 0, transform: "translateY(-24px)" },
        { opacity: 1, transform: "translateY(0)" },
      ];
    case "zoom-in":
      return [
        { opacity: 0, transform: "scale(0.85)" },
        { opacity: 1, transform: "scale(1)" },
      ];
    default:
      return [{ opacity: 1 }, { opacity: 1 }];
  }
}

interface PresentSceneProps {
  readonly entryId: string;
  readonly entranceBehavior: EntranceAnimationBehavior | undefined;
  readonly hoverBehavior: HoverEffectBehavior | undefined;
  readonly buttonBehavior: ButtonTriggerBehavior | undefined;
  readonly isActiveStep: boolean;
  readonly ariaCurrent: "true" | undefined;
  /** Phase 13d-4 — cross-scene visibility effects. */
  readonly isDimmed: boolean;
  readonly isRevealedByHover: boolean;
  readonly onHoverChange: (
    next: { entryId: string; effect: HoverEffectBehavior } | undefined,
  ) => void;
  readonly onAction: (action: HotspotAction) => void;
  readonly children: React.ReactNode;
}

function PresentScene({
  entryId,
  entranceBehavior,
  hoverBehavior,
  buttonBehavior,
  isActiveStep,
  ariaCurrent,
  isDimmed,
  isRevealedByHover,
  onHoverChange,
  onAction,
  children,
}: PresentSceneProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  useEffect(() => {
    if (!isActiveStep) return;
    if (entranceBehavior === undefined) return;
    const el = ref.current;
    if (el === null) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    if (reduce) return;
    const anim = el.animate(entranceKeyframes(entranceBehavior.mode), {
      duration: entranceBehavior.durationMs,
      easing: "cubic-bezier(0.34, 1.20, 0.64, 1)",
      fill: "both",
    });
    return () => {
      anim.cancel();
    };
  }, [isActiveStep, entranceBehavior]);

  // Phase 13d-4 — hover-effect visuals.
  //   - "highlight"  → local scale + glow
  //   - "dim-others" → no local change (cross-scene effect propagates via isDimmed)
  //   - "reveal"     → no local change (target scene gets isRevealedByHover)
  // The cross-scene effects depend on the *PresentPage*'s hoveredEntry state,
  // which we drive through onHoverChange.
  const isHighlight = isHovering && hoverBehavior?.effect === "highlight";
  // A scene with `isRevealedByHover` is the *target* of someone else's reveal
  // — show it; otherwise stay invisible. (Frames without reveal-target role
  // are unaffected by this flag — defaults to "not a reveal target".)
  const revealedVisibility =
    isRevealedByHover === false && isHoverRevealTarget(entryId, hoverBehavior)
      ? { opacity: 0 }
      : null;

  return (
    <div
      ref={ref}
      className="relative w-full h-full transition-[opacity,transform,box-shadow] duration-[var(--motion-quick)] ease-[var(--motion-spring-soft)]"
      style={{
        opacity: isDimmed ? 0.3 : 1,
        transform: isHighlight ? "scale(1.04)" : undefined,
        boxShadow: isHighlight ? "var(--shadow-glow)" : undefined,
        ...(revealedVisibility ?? {}),
        cursor: buttonBehavior !== undefined ? "pointer" : undefined,
      }}
      aria-current={ariaCurrent}
      data-testid="present-scene"
      data-entry-id={entryId}
      data-entrance-mode={entranceBehavior?.mode}
      data-hover-effect={hoverBehavior?.effect}
      data-is-dimmed={isDimmed ? "true" : undefined}
      data-is-hovering={isHovering ? "true" : undefined}
      data-button-action={buttonBehavior?.action.type}
      onPointerEnter={() => {
        setIsHovering(true);
        if (hoverBehavior !== undefined) {
          onHoverChange({ entryId, effect: hoverBehavior });
        }
      }}
      onPointerLeave={() => {
        setIsHovering(false);
        if (hoverBehavior !== undefined) {
          onHoverChange(undefined);
        }
      }}
      onClick={() => {
        if (buttonBehavior !== undefined) onAction(buttonBehavior.action);
      }}
    >
      {children}
    </div>
  );
}

/** Phase 13d-4 — true when this scene is the target of someone *else*'s
 *  reveal hover effect (so it should default-hide). */
function isHoverRevealTarget(
  _entryId: string,
  _hoverBehavior: HoverEffectBehavior | undefined,
): boolean {
  // The "I am a reveal target" decision is made at the PresentPage level
  // (the source of the hover lives on a different scene). This function
  // exists as the local signal carrier; the actual flag flows through the
  // isRevealedByHover prop. Returning false keeps the local opacity at 1
  // unless the caller flipped the prop.
  return false;
}

export function PresentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // Presentation is read-only and server-first: always show the cloud copy,
  // falling back to a local offline copy only when the cloud is unreachable.
  const { design, docInAgocraft, isLoading } = useDesign(id ?? "", { preferCloud: true });
  const [step, setStep] = useState(0);
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set());
  // Phase 13d-4 — which scene's hover-effect is currently active. dim-others
  // and reveal effects need a global state because they affect *other*
  // scenes (dim them, or flip a target's visibility).
  const [hoveredEntry, setHoveredEntry] = useState<
    { entryId: string; effect: HoverEffectBehavior } | undefined
  >(undefined);

  // Phase 11e — step order follows `design.presentationOrder`. Each entry
  // (root or any frame, at any depth) becomes one step. PresentPage acts as
  // a *camera*: the whole design tree is rendered once in the scene, and
  // the step controls where the camera lands and how far it zooms in.
  //
  // Absolute frame in design-relative 0..1 ratio is computed by composing
  // the ItemFrame of each Item along the trail (root → … → entry). The
  // entry's center + 1/max-size becomes the camera's position + scale.
  const cameraTargets = useMemo(() => {
    const ids = effectivePresentationOrder(design);
    const out: {
      item: AgoItem;
      behavior: CameraTargetBehavior;
      absW: number;
      absH: number;
    }[] = [];
    const rootId = String(docInAgocraft.root.id);
    ids.forEach((entryId, idx) => {
      const found = entryId === rootId ? docInAgocraft.root : findItemDeep(docInAgocraft, entryId);
      if (found === undefined) return;
      // Compose the absolute frame: start full-design (x=0,y=0,w=1,h=1) and
      // multiply each frame along the trail. Root entry stays as the full
      // design.
      let absX = 0;
      let absY = 0;
      let absW = 1;
      let absH = 1;
      if (entryId !== rootId) {
        const trail = findTrailDeep(docInAgocraft, entryId) ?? [];
        for (const node of trail) {
          const f = (node.attrs as { frame?: ItemFrame }).frame;
          if (f === undefined) continue;
          absX = absX + f.x * absW;
          absY = absY + f.y * absH;
          absW = absW * f.width;
          absH = absH * f.height;
        }
      }
      const item = found as unknown as AgoItem;
      // Phase 13b — if the frame's camera-target unit declares `manual: true`,
      // honor its position/scale; otherwise compute the camera that fits the
      // frame's absolute frame to the viewport.
      const manualCam = (() => {
        const cam = (
          found as {
            units?: ReadonlyArray<{ kind: string; attrs: { behavior?: CameraTargetBehavior } }>;
          }
        ).units?.find((u) => u.kind === "camera-target");
        const b = cam?.attrs.behavior;
        if (b !== undefined && b.manual === true) return b;
        return undefined;
      })();
      const behavior: CameraTargetBehavior = {
        kind: "camera-target",
        id: `present-${entryId}`,
        position:
          manualCam !== undefined ? manualCam.position : { x: absX + absW / 2, y: absY + absH / 2 },
        scale: manualCam !== undefined ? manualCam.scale : 1 / Math.max(absW, absH, 0.01),
        order: idx,
        manual: manualCam !== undefined,
      };
      out.push({ item, behavior, absW, absH });
    });
    return out;
  }, [design, docInAgocraft]);

  const totalSteps = cameraTargets.length;
  const safeStep = Math.max(0, Math.min(step, totalSteps - 1));

  const close = useCallback(() => {
    navigate(`/design/${id ?? ""}`);
  }, [navigate, id]);

  const goToStep = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, totalSteps - 1));
      setStep(clamped);
    },
    [totalSteps],
  );

  const goToCameraId = useCallback(
    (cameraId: string) => {
      const idx = cameraTargets.findIndex((c) => c.behavior.id === cameraId);
      if (idx >= 0) setStep(idx);
    },
    [cameraTargets],
  );

  const reveal = useCallback((targetId: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(targetId)) next.delete(targetId);
      else next.add(targetId);
      return next;
    });
  }, []);

  // Keyboard navigation via @agocraft/input. Bus + registry are created once
  // (mount-stable) so React 18 strict mode's mount-unmount-mount cycle leaves
  // exactly one bus alive at any time — fixes R-18. Latest reducer closures are
  // read through a ref so registered actions never capture stale `safeStep` /
  // `goToStep`.
  const handlersRef = useRef({ goToStep, close, getStep: () => safeStep });
  handlersRef.current = { goToStep, close, getStep: () => safeStep };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const bus = createInputBus({ target: window, origin: "present" });
    const hotkeys = createHotkeyRegistry({ bus, initialScope: "present" });

    const offNext = hotkeys.register({
      keys: ["ArrowRight", "Space", "Enter"],
      scope: "present",
      label: "Next scene",
      action: () => {
        const { goToStep: g, getStep } = handlersRef.current;
        g(getStep() + 1);
      },
    });
    const offPrev = hotkeys.register({
      keys: "ArrowLeft",
      scope: "present",
      label: "Previous scene",
      action: () => {
        const { goToStep: g, getStep } = handlersRef.current;
        g(getStep() - 1);
      },
    });
    const offClose = hotkeys.register({
      keys: "Escape",
      scope: "present",
      label: "Exit present mode",
      action: () => handlersRef.current.close(),
    });
    const offNumbers: Array<() => void> = [];
    for (let i = 1; i <= 9; i += 1) {
      const target = i - 1;
      offNumbers.push(
        hotkeys.register({
          keys: String(i),
          scope: "present",
          label: `Jump to scene ${i}`,
          action: () => handlersRef.current.goToStep(target),
        }),
      );
    }

    return () => {
      offNext();
      offPrev();
      offClose();
      for (const off of offNumbers) off();
      hotkeys.dispose();
      bus.dispose();
    };
  }, []);

  // Phase 13d-4 — single action dispatcher reused by hotspot + button-trigger.
  const dispatchAction = useCallback(
    (action: HotspotAction) => {
      switch (action.type) {
        case "reveal":
          reveal(action.targetId);
          return;
        case "next-camera":
          setStep((s) => Math.min(s + 1, totalSteps - 1));
          return;
        case "jump-camera":
          goToCameraId(action.targetId);
          return;
        case "external":
          if (typeof window !== "undefined") {
            window.open(action.href, "_blank", "noopener,noreferrer");
          }
          return;
      }
    },
    [reveal, goToCameraId, totalSteps],
  );

  const ctx = useMemo<PresentContext>(
    () => ({
      doc: docInAgocraft,
      step: safeStep,
      totalSteps,
      cameraTargets,
      revealed,
      goToStep,
      goToCameraId,
      reveal,
      close,
    }),
    [
      docInAgocraft,
      safeStep,
      totalSteps,
      cameraTargets,
      revealed,
      goToStep,
      goToCameraId,
      reveal,
      close,
    ],
  );

  // Doc-order rank — DFS over the design tree assigns each Item id an
  // increasing integer. Doc order *is* z-order in this renderer (no
  // `z-index` is ever set), so the rank doubles as the paint-order key.
  // Used both to sort scenes (paint order) and to classify a scene's
  // visibility relative to the active frame (above / below / subtree).
  const docOrderRank = useMemo(() => {
    const out = new Map<string, number>();
    let rank = 0;
    function walk(item: AgocraftItem): void {
      out.set(String(item.id), rank);
      rank += 1;
      for (const c of item.children) walk(c);
    }
    walk(docInAgocraft.root);
    return out;
  }, [docInAgocraft]);

  // The Item id of the frame the camera is currently focused on. Used as
  // the anchor for the visibility classification below.
  const activeFrameId =
    cameraTargets[safeStep]?.item.id !== undefined
      ? String(cameraTargets[safeStep]?.item.id)
      : undefined;

  // Every id that should render *as if it's the active scene* — that is,
  // the active frame itself plus every descendant at any depth. The user-
  // visible rule says items *inside the visible frame's child tree* stay
  // visible (no blur, no hide); everything outside that subtree is then
  // classified by doc-order rank vs. the active frame's rank.
  const activeSubtreeIds = useMemo(() => {
    const out = new Set<string>();
    if (activeFrameId === undefined) return out;
    const root = findItemDeep(docInAgocraft, activeFrameId);
    if (root === undefined) return out;
    function collect(item: AgocraftItem): void {
      out.add(String(item.id));
      for (const c of item.children) collect(c);
    }
    collect(root);
    return out;
  }, [docInAgocraft, activeFrameId]);

  // Internal scene shape — carries the doc-order anchor so the visibility
  // classifier can rank scenes against the active frame. Stripped before
  // the scenes array reaches `<Stage>` (Stage only accepts `StageScene`).
  type LocalScene = StageScene & { readonly __docOrderId: string };

  // Phase 7b — root-level non-frame primitives (image / video / shape items
  // added directly to the design root, outside any slide-equivalent frame).
  // These aren't navigation targets, but they DO sit in the z-order and so
  // each one gets its own scene at its absolute design coords. Per-primitive
  // scenes (instead of one lumped design layer) are necessary so the
  // visibility classifier can rank them individually — a primitive that
  // happens to sit *between* two frames in doc order ends up "above" or
  // "below" the active frame on its own merits.
  const rootPrimitiveScenes = useMemo<LocalScene[]>(() => {
    const out: LocalScene[] = [];
    for (const child of docInAgocraft.root.children) {
      if (!isDomainItem(child)) continue;
      if (FRAME_KINDS.has(child.kind)) continue;
      const f = (child.attrs as { frame?: ItemFrame }).frame;
      if (f === undefined) continue;
      const absX = f.x * design.width;
      const absY = f.y * design.height;
      const absW = f.width * design.width;
      const absH = f.height * design.height;
      const rotation = f.rotation ?? 0;
      out.push({
        id: `present-primitive-${String(child.id)}`,
        __docOrderId: String(child.id),
        position: { x: absX + absW / 2, y: absY + absH / 2 },
        size: { width: absW, height: absH },
        scale: 1, // never the active scene; scale unused
        children: (
          <div
            data-testid="present-primitive"
            data-kind={child.kind}
            data-item-id={String(child.id)}
            style={{
              position: "absolute",
              inset: 0,
              ...(rotation
                ? { transform: `rotate(${rotation}rad)`, transformOrigin: "center center" }
                : {}),
            }}
          >
            <PresentFrameTree item={child} />
          </div>
        ),
      });
    }
    return out;
  }, [docInAgocraft, design.width, design.height]);

  const cameraTargetScenes = useMemo<LocalScene[]>(
    () =>
      cameraTargets.map(({ item, behavior, absW, absH }, idx) => {
        // Each navigable frame is its own scene. Body uses PresentFrameTree
        // so the frame's renderer fires AND any non-frame children render
        // at their relative position within the frame's bbox. Nested frames
        // skip themselves — they have their own scene.
        const sceneBody = (
          <PresentFrameTree key={String(item.id)} item={item as unknown as AgocraftItem} />
        );
        // Phase 13d-3 — entrance-animation behavior (if any) drives a Web
        // Animations API call when this entry becomes the active step.
        const units =
          (
            item as unknown as {
              units?: ReadonlyArray<{ kind: string; attrs: { behavior?: unknown } }>;
            }
          ).units ?? [];
        const findBehavior = <T,>(kind: string): T | undefined =>
          units.find((u) => u.kind === kind)?.attrs.behavior as T | undefined;
        const entranceBehavior = findBehavior<EntranceAnimationBehavior>("entrance-animation");
        const hoverBehavior = findBehavior<HoverEffectBehavior>("hover-effect");
        const buttonBehavior = findBehavior<ButtonTriggerBehavior>("button-trigger");
        const isActiveStep = idx === safeStep;
        const entryItemId = String(item.id);

        // Cross-scene hover effects: dim if someone *else* is hovering with
        // "dim-others"; revealed if I am the explicit reveal target.
        const isDimmed =
          hoveredEntry !== undefined &&
          hoveredEntry.effect.effect === "dim-others" &&
          hoveredEntry.entryId !== entryItemId;
        const isRevealedByHover =
          hoveredEntry !== undefined &&
          hoveredEntry.effect.effect === "reveal" &&
          hoveredEntry.effect.targetId === entryItemId;

        return {
          id: behavior.id,
          __docOrderId: entryItemId,
          position: {
            x: behavior.position.x * design.width,
            y: behavior.position.y * design.height,
          },
          size: { width: absW * design.width, height: absH * design.height },
          scale: behavior.scale,
          children: (
            <PresentScene
              entryId={entryItemId}
              entranceBehavior={entranceBehavior}
              hoverBehavior={hoverBehavior}
              buttonBehavior={buttonBehavior}
              isActiveStep={isActiveStep}
              ariaCurrent={
                behavior.id === activeCameraId(safeStep, cameraTargets) ? "true" : undefined
              }
              isDimmed={isDimmed}
              isRevealedByHover={isRevealedByHover}
              onHoverChange={setHoveredEntry}
              onAction={dispatchAction}
            >
              {sceneBody}
            </PresentScene>
          ),
        };
      }),
    [cameraTargets, ctx, safeStep, design.width, design.height, hoveredEntry, dispatchAction],
  );

  // Combined scenes — root primitives + camera-target frames, sorted by
  // doc-order rank so paint order matches z-order, and classified per
  // visibility relative to the active frame:
  //
  //   • In the active subtree (active itself + descendants) → render
  //     normally; visibility omitted.
  //   • doc-order rank *higher* than active AND not in subtree → "hidden"
  //     so the scene paints at opacity 0 (it would otherwise occlude the
  //     active frame).
  //   • doc-order rank *lower* than active AND not in subtree → "blur" so
  //     the scene reads as soft background context behind the active frame.
  const scenes = useMemo<StageScene[]>(() => {
    const combined: LocalScene[] = [...rootPrimitiveScenes, ...cameraTargetScenes];
    combined.sort((a, b) => {
      const ra = docOrderRank.get(a.__docOrderId);
      const rb = docOrderRank.get(b.__docOrderId);
      if (ra === undefined && rb === undefined) return 0;
      if (ra === undefined) return 1;
      if (rb === undefined) return -1;
      return ra - rb;
    });
    const activeRank = activeFrameId !== undefined ? docOrderRank.get(activeFrameId) : undefined;
    return combined.map(({ __docOrderId, ...rest }) => {
      if (activeFrameId === undefined || activeRank === undefined) return rest;
      if (activeSubtreeIds.has(__docOrderId)) return rest;
      const rank = docOrderRank.get(__docOrderId);
      if (rank === undefined) return rest;
      return rank > activeRank
        ? { ...rest, visibility: "hidden" as const }
        : { ...rest, visibility: "blur" as const };
    });
  }, [rootPrimitiveScenes, cameraTargetScenes, docOrderRank, activeFrameId, activeSubtreeIds]);

  // Match FrameStage's tone heuristic so document-scope tokens stay aligned
  // between edit and present. Same helper as in FrameStage — inline here to
  // avoid a cross-page import; identical 0.2126/0.7152/0.0722 weighting.
  //
  // MUST stay ABOVE the `totalSteps === 0` early return: every hook has to
  // run unconditionally. When the design loads asynchronously (blank first
  // paint → 0 camera targets → early return, then the cloud copy arrives and
  // camera targets appear) a hook placed after the return would be reached
  // only on the second render, throwing React #310 ("rendered more hooks
  // than during the previous render"). This bug surfaced once present mode
  // became server-first (`preferCloud`), which always paints blank first.
  const bgTone: "light" | "dark" = useMemo(() => {
    const color = design.background ?? "#ffffff";
    if (typeof document === "undefined") return "light";
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext("2d");
    if (ctx === null) return "light";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    const r = (d[0] ?? 0) / 255;
    const g = (d[1] ?? 0) / 255;
    const b = (d[2] ?? 0) / 255;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return l >= 0.5 ? "light" : "dark";
  }, [design.background]);

  // Server-first load (preferCloud) paints a blank design first, then the
  // cloud copy arrives. Show a loading screen during that fetch so the
  // "no camera targets" empty state below only appears for a design that
  // genuinely has none — not as a flash before the slides load.
  if (isLoading) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center bg-[color:var(--bg-page)]"
        data-testid="present-loading"
        role="status"
        aria-live="polite"
      >
        <Spinner size={32} className="text-[color:var(--text-strong)]" />
      </div>
    );
  }

  if (totalSteps === 0) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center bg-[color:var(--bg-page)] text-[color:var(--text-soft)]"
        data-testid="present-empty"
      >
        <div className="text-center max-w-md">
          <p className="text-[16px] mb-3">This doc has no camera targets to present.</p>
          <button
            type="button"
            onClick={close}
            className="text-[14px] text-[color:var(--accent-strong)] underline"
          >
            Back to edit
          </button>
        </div>
      </div>
    );
  }

  const activeId = cameraTargets[safeStep]?.behavior.id ?? cameraTargets[0]?.behavior.id ?? "";

  return (
    <div className="fixed inset-0">
      {/* WI-040 — the StyleResolver cascade (theme tokens written as
       *  `{ $ref: "color.accent" }` etc.) walks the document via
       *  `useResolveColor` deep inside FrameBlock / TextBlock. Without
       *  the provider present, every `$ref` collapses to its fallback
       *  ("transparent" / undefined) and theme colors disappear in
       *  present mode while looking fine in edit mode (which already
       *  mounts the provider inside DesignPage). */}
      <DocumentForResolutionProvider document={docInAgocraft}>
        <Stage
          designSize={{ width: design.width, height: design.height }}
          scenes={scenes}
          activeId={activeId}
          background={design.background}
          bgTone={bgTone}
        />
      </DocumentForResolutionProvider>
      <PresentChrome
        step={safeStep}
        total={totalSteps}
        onPrev={() => goToStep(safeStep - 1)}
        onNext={() => goToStep(safeStep + 1)}
        onClose={close}
        title={(docInAgocraft.root.attrs.title as string | undefined) ?? ""}
      />
    </div>
  );
}

function activeCameraId(
  step: number,
  targets: ReadonlyArray<{ behavior: CameraTargetBehavior }>,
): string | undefined {
  return targets[step]?.behavior.id;
}
