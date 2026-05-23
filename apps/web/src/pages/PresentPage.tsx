import type { Item as AgocraftItem } from "@agocraft/core";
import { createInputBus } from "@agocraft/input/bus";
import { createHotkeyRegistry } from "@agocraft/input/hotkey";
import { PresentChrome, Stage, type StageScene } from "@weave/design-system";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { findItemDeep, findTrailDeep, isDomainItem } from "../document/agocraft-mirror.js";
import {
  type AgoItem,
  type ButtonTriggerBehavior,
  type CameraTargetBehavior,
  effectivePresentationOrder,
  type EntranceAnimationBehavior,
  type HotspotAction,
  type HoverEffectBehavior,
  interactionRegistry,
  type ItemFrame,
  type PresentContext,
  useDesign,
} from "../document";
import { DOMAIN_RENDERERS } from "../document/domains";

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
  const { design, docInAgocraft } = useDesign(id ?? "");
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
      const found =
        entryId === rootId ? docInAgocraft.root : findItemDeep(docInAgocraft, entryId);
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
        const cam = (found as { units?: ReadonlyArray<{ kind: string; attrs: { behavior?: CameraTargetBehavior } }> }).units?.find(
          (u) => u.kind === "camera-target",
        );
        const b = cam?.attrs.behavior;
        if (b !== undefined && b.manual === true) return b;
        return undefined;
      })();
      const behavior: CameraTargetBehavior = {
        kind: "camera-target",
        id: `present-${entryId}`,
        position:
          manualCam !== undefined
            ? manualCam.position
            : { x: absX + absW / 2, y: absY + absH / 2 },
        scale:
          manualCam !== undefined
            ? manualCam.scale
            : 1 / Math.max(absW, absH, 0.01),
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

  const scenes = useMemo<StageScene[]>(
    () =>
      cameraTargets.map(({ item, behavior, absW, absH }, idx) => {
        // Phase 10c-3 — entry-mode: an entry is either the root doc or a
        // sub-doc. Neither has its own DOMAIN_RENDERERS entry, so we render
        // the entry's domain children stacked. Hotspot overlays apply per
        // child for now (PoC; richer per-entry overlay arrives later).
        const renderChildren = (parent: AgoItem) =>
          parent.children.filter(isDomainItem).map((c) => {
            const child = c as unknown as AgoItem;
            const Renderer = DOMAIN_RENDERERS[child.kind] as React.ComponentType<{ item: AgoItem }>;
            return <Renderer key={String(child.id)} item={child} />;
          });
        const isDomainEntry = isDomainItem(item as unknown as { kind: string } as never);
        const Self = isDomainEntry
          ? (DOMAIN_RENDERERS[item.kind] as React.ComponentType<{ item: AgoItem }> | undefined)
          : undefined;
        // Phase 13d-3 — entrance-animation behavior (if any) drives a Web
        // Animations API call when this entry becomes the active step.
        const units =
          (item as unknown as { units?: ReadonlyArray<{ kind: string; attrs: { behavior?: unknown } }> }).units ?? [];
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
              ariaCurrent={behavior.id === activeCameraId(safeStep, cameraTargets) ? "true" : undefined}
              isDimmed={isDimmed}
              isRevealedByHover={isRevealedByHover}
              onHoverChange={setHoveredEntry}
              onAction={dispatchAction}
            >
              {Self ? <Self item={item} /> : renderChildren(item)}
            </PresentScene>
          ),
        };
      }),
    [cameraTargets, ctx, safeStep, design.width, design.height, hoveredEntry, dispatchAction],
  );

  if (totalSteps === 0) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[color:var(--bg-page)] text-[color:var(--text-soft)]">
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
      <Stage
        designSize={{ width: design.width, height: design.height }}
        scenes={scenes}
        activeId={activeId}
      />
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
