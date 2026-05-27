import {
  animate,
  type MotionValue,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../cn.js";

export interface StageScene {
  readonly id: string;
  /** Center of the scene in design-pixel coordinates (origin = design top-left). */
  readonly position: { readonly x: number; readonly y: number };
  /** Scene's footprint in design-pixel coordinates. */
  readonly size: { readonly width: number; readonly height: number };
  /**
   * Camera scale to apply when this scene is active. `1` means "design plane fits
   * the viewport"; `> 1` zooms in. Computed by the caller as `1 / max(absW, absH)`
   * to fit the scene's frame to the viewport, or as a manual override.
   */
  readonly scale: number;
  readonly children: ReactNode;
}

interface StageProps {
  /** Master coordinate system. All scene positions/sizes are in these pixels. */
  readonly designSize: { readonly width: number; readonly height: number };
  /** Viewport size override. If omitted, Stage measures its own container. */
  readonly viewportSize?: { readonly width: number; readonly height: number };
  readonly scenes: ReadonlyArray<StageScene>;
  /** ID of the scene the camera is currently focused on. */
  readonly activeId: string;
  /** CSS color for the design plane background. Defaults to the theme's
   *  page bg. The matching `bgTone` is propagated to descendants via
   *  `data-bg-tone` so document-context text/surface tokens stay readable. */
  readonly background?: string;
  /** "light" or "dark" — perceived tone of `background`. Caller computes
   *  it (FrameStage / PresentPage share the same helper) and passes it in
   *  so Stage doesn't have to bundle a canvas-luminance probe. */
  readonly bgTone?: "light" | "dark";
  readonly className?: string;
}

interface CameraState {
  /** Design coordinate that lands at viewport center. */
  readonly cx: number;
  readonly cy: number;
  /** Total on-screen scale (baseScale × per-scene cameraScale). */
  readonly scale: number;
}

/**
 * Interpolate the camera between two states. p ∈ [0, 1].
 *
 * Two design choices govern this curve:
 *
 *   1. **Logarithmic scale interpolation.** Perceived "size growth" is
 *      log-proportional to the scale factor — going from 1× to 2× looks like
 *      the same magnitude of change as going from 2× to 4×. Linear scale
 *      interpolation therefore *feels* front-loaded: at p=0.5 the user has
 *      already perceived ~70% of the zoom. By interpolating log(scale)
 *      linearly we restore a constant perceived zoom rate.
 *
 *   2. **cx, cy follow scale.** With linear cx/cy and log-scale, the active
 *      scene's screen position would swing *away* from the viewport center
 *      mid-transition (because scale grows faster than cx catches up). To
 *      prevent that, cx/cy are derived so the active scene's on-screen offset
 *      decreases linearly with p:
 *
 *        offset(p) = (1 − p) · a.scale · (b.cx − a.cx)
 *
 *      Solving for cx(p) gives the formula below. When a.scale == b.scale it
 *      collapses to plain linear lerp.
 */
function transitionCamera(a: CameraState, b: CameraState, p: number): CameraState {
  if (p <= 0) return a;
  if (p >= 1) return b;
  const scale = a.scale ** (1 - p) * b.scale ** p;
  const ratio = scale === 0 ? 0 : a.scale / scale;
  const cx = b.cx - (1 - p) * (b.cx - a.cx) * ratio;
  const cy = b.cy - (1 - p) * (b.cy - a.cy) * ratio;
  return { cx, cy, scale };
}

export function Stage({
  designSize,
  viewportSize,
  scenes,
  activeId,
  background,
  bgTone,
  className,
}: StageProps) {
  const reduce = useReducedMotion();
  const active = scenes.find((s) => s.id === activeId) ?? scenes[0];

  // Measure the outer container so the camera can compute a base scale that
  // fits the entire design plane to the viewport. The explicit `viewportSize`
  // prop wins if given.
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<{ width: number; height: number } | undefined>(
    undefined,
  );

  useLayoutEffect(() => {
    if (viewportSize !== undefined) return;
    const el = outerRef.current;
    if (el === null) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      setMeasured({ width: r.width, height: r.height });
    }
  }, [viewportSize]);

  useEffect(() => {
    if (viewportSize !== undefined) return;
    const el = outerRef.current;
    if (el === null) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r === undefined) return;
      if (r.width > 0 && r.height > 0) {
        setMeasured({ width: r.width, height: r.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewportSize]);

  const vp = viewportSize ?? measured;
  const baseScale = vp ? Math.min(vp.width / designSize.width, vp.height / designSize.height) : 1;
  const targetScale = Math.max((active ? active.scale : 1) * baseScale, 0.0001);
  const targetCx = active ? active.position.x : designSize.width / 2;
  const targetCy = active ? active.position.y : designSize.height / 2;
  const vpWidth = vp?.width ?? 0;
  const vpHeight = vp?.height ?? 0;

  // One spring drives a single `progress` motion value 0 → 1. cx, cy and scale
  // are derived from it via `transitionCamera`, so zoom and pan literally
  // share a timeline — they cannot desync. See `transitionCamera` for why this
  // matters for perceived motion.
  const progressMV = useMotionValue(1);
  const fromRef = useRef<CameraState>({
    cx: targetCx,
    cy: targetCy,
    scale: targetScale,
  });
  const toRef = useRef<CameraState>({
    cx: targetCx,
    cy: targetCy,
    scale: targetScale,
  });
  const [animating, setAnimating] = useState(false);
  const initRef = useRef(true);

  useEffect(() => {
    if (vp === undefined) return;
    const next: CameraState = { cx: targetCx, cy: targetCy, scale: targetScale };
    if (initRef.current) {
      initRef.current = false;
      fromRef.current = next;
      toRef.current = next;
      progressMV.set(1);
      return;
    }
    // If a previous animation is still in flight, freeze the camera at its
    // current spot so the new tween starts smoothly from wherever we are.
    const liveFrom = transitionCamera(fromRef.current, toRef.current, progressMV.get());
    fromRef.current = liveFrom;
    toRef.current = next;
    progressMV.set(0);
    if (reduce) {
      progressMV.set(1);
      return;
    }
    setAnimating(true);
    // Duration scales with the magnitude of the camera move so a far hop
    // genuinely takes longer than a tiny one — same easing shape, more
    // time. A spring with fixed stiffness/damping settles in roughly the
    // same wall-clock regardless of magnitude (it just moves faster for
    // bigger displacements), which the user perceived as "far hops move
    // faster". This tween restores the constant-speed-ish reading: more
    // ground to cover = more time, with one shared ease-out shape.
    //
    // Magnitude has two terms because the camera changes two perceptual
    // axes simultaneously:
    //   - positionMag: design-pixel distance the camera pans (Euclidean).
    //   - scaleMag: log of the scale ratio. Perceived "zoom" is log-
    //     proportional, so log-distance is the natural metric here.
    const positionMag = Math.hypot(toRef.current.cx - liveFrom.cx, toRef.current.cy - liveFrom.cy);
    const scaleMag = Math.abs(
      Math.log(Math.max(toRef.current.scale, 0.0001) / Math.max(liveFrom.scale, 0.0001)),
    );
    const duration = Math.max(0.45, Math.min(1.8, 0.4 + positionMag / 1500 + scaleMag * 0.55));
    const controls = animate(progressMV, 1, {
      type: "tween",
      duration,
      // Smooth ease-out — no overshoot. The shape stays constant; only
      // the duration adapts to distance.
      ease: [0.22, 1, 0.36, 1],
      onComplete: () => setAnimating(false),
    });
    return () => {
      controls.stop();
    };
  }, [targetCx, targetCy, targetScale, reduce, vp, progressMV]);

  // Derive screen-space transform values from progress. Each useTransform
  // re-runs whenever progressMV changes; the ref reads inside the mapper
  // always see the latest from/to endpoints.
  const scaleMV = useTransform(
    progressMV,
    (p) => transitionCamera(fromRef.current, toRef.current, p).scale,
  );
  const txMV = useTransform(progressMV, (p) => {
    const c = transitionCamera(fromRef.current, toRef.current, p);
    return vpWidth / 2 - c.cx * c.scale;
  });
  const tyMV = useTransform(progressMV, (p) => {
    const c = transitionCamera(fromRef.current, toRef.current, p);
    return vpHeight / 2 - c.cy * c.scale;
  });

  return (
    <div
      ref={outerRef}
      className={cn(
        "relative w-full h-full overflow-hidden",
        background === undefined ? "bg-[color:var(--bg-page)]" : undefined,
        className,
      )}
      data-canvas="document"
      data-bg-tone={bgTone}
      style={{
        ...(background !== undefined ? { background } : {}),
        ...(viewportSize ? { width: viewportSize.width, height: viewportSize.height } : {}),
      }}
    >
      <motion.div
        className="absolute"
        style={{
          left: 0,
          top: 0,
          width: designSize.width,
          height: designSize.height,
          transformOrigin: "0 0",
          // `will-change: transform` pins the element on a compositor layer.
          // While the layer is in-flight (animating) that's a win — but once
          // the camera settles we drop the hint so the browser can flatten
          // the layer and re-rasterize text at the parent's pixel density,
          // restoring crisp glyphs after a zoom-in.
          willChange: animating ? "transform" : "auto",
          // Create a new stacking context so descendant `backdrop-filter`
          // (the glass cards) samples the camera's own children, not the
          // global page composition. Without isolation Chromium would
          // re-compute backdrop-filter against the constantly-shifting
          // root composition during a camera transform and drop the
          // filter mid-animation as an optimization — the user sees the
          // glass effect "snap on" after settle. `isolation: isolate`
          // gives the filter a stable, transform-shared backdrop.
          isolation: "isolate",
          x: txMV,
          y: tyMV,
          scale: scaleMV,
        }}
      >
        {(() => {
          // Z-order dim: anything later in the scenes array paints above
          // earlier ones (DOM source order = z-order with no z-index set).
          //
          // **Each scene's opacity is derived from `progressMV` via
          // `useTransform`** — the same motion value that drives the
          // camera spring. Two consequences:
          //
          //   1. Opacity timing literally IS the camera timing. There's no
          //      separate animation scheduler that could start late or
          //      finish at a different beat. When the camera spring is at
          //      progress p, the opacity is also at progress p (after the
          //      stagger map below).
          //   2. Distance-independent quality, distance-dependent duration.
          //      A spring with the same stiffness/damping/mass settles in
          //      effectively the same *normalized* time regardless of the
          //      camera-displacement magnitude — but bigger displacements
          //      take longer absolute time because progressMV is throttled
          //      by the spring physics, not a fixed duration tween. Short
          //      hops feel quick, long hops feel deliberate, with the same
          //      curve shape.
          //
          // **Stagger**: leaving alpha (fade-out) finishes by p≈0.65,
          // arriving alpha (fade-in) starts at p≈0.35. The two windows
          // overlap in the middle 30% so the perceived flow is
          //   "leaving first → both mid-transition → arriving last".
          const activeIdx = scenes.findIndex((s) => s.id === activeId);
          return scenes.map((scene, idx) => {
            const dimmed = activeIdx >= 0 && idx > activeIdx;
            return (
              <SceneItem
                key={scene.id}
                scene={scene}
                dimmed={dimmed}
                progressMV={progressMV}
                reduce={reduce === true}
                activeKey={activeId}
              />
            );
          });
        })()}
      </motion.div>
    </div>
  );
}

interface SceneItemProps {
  readonly scene: StageScene;
  readonly dimmed: boolean;
  readonly progressMV: MotionValue<number>;
  readonly reduce: boolean;
  /** The currently active scene's id. Threaded down only so SceneItem's
   *  effect can re-fire on *every* step change — even when this scene's
   *  own `dimmed` didn't flip — to re-snapshot from/to refs before the
   *  parent resets `progressMV` to 0. Without this, scenes whose dimmed
   *  state is unchanged keep stale refs (e.g. from=1 / to=0 from a prior
   *  fade-out) and their opacity jumps to 1 when `progressMV` resets,
   *  visible as a one-frame "z-order flash". */
  readonly activeKey: string;
}

/** A single Stage scene whose opacity rides the camera spring's
 *  `progressMV`. The component owns from/to refs so a step change captures
 *  whatever the live opacity is *at that instant* (handling rapid step
 *  changes that interrupt a mid-flight transition) and re-targets to the
 *  new dimmed state. */
function SceneItem({ scene, dimmed, progressMV, reduce, activeKey }: SceneItemProps) {
  // The opacity the scene started this transition at, and the one it's
  // heading toward. On the very first render they match — no animation,
  // just the static initial state.
  const fromRef = useRef<number>(dimmed ? 0 : 1);
  const toRef = useRef<number>(dimmed ? 0 : 1);

  // On `dimmed` change: snapshot the current interpolated opacity (so a
  // mid-flight interrupt continues smoothly), then aim at the new target.
  // Effect runs *before* the parent's camera spring reset, because child
  // effects run before parent effects on the same commit — so by the time
  // the parent calls `progressMV.set(0)` our refs are already updated.
  useEffect(() => {
    if (reduce) {
      fromRef.current = dimmed ? 0 : 1;
      toRef.current = dimmed ? 0 : 1;
      return;
    }
    // Re-sync from/to on EVERY step change (activeKey is in deps), not
    // just when this scene's own `dimmed` flips. The parent's effect
    // resets `progressMV` to 0 each step; if our refs are stale, the
    // useTransform output snaps from the prior settled value to whatever
    // computeStaggered(staleFrom, staleTo, 0) returns — a visible flash.
    const p = progressMV.get();
    const live = computeStaggered(fromRef.current, toRef.current, p);
    fromRef.current = live;
    toRef.current = dimmed ? 0 : 1;
  }, [dimmed, progressMV, reduce, activeKey]);

  // Opacity derived from progressMV with the leaving-first / arriving-last
  // stagger map. The useTransform's read function runs every animation
  // frame while progressMV is moving — refs are stable by then.
  const opacity = useTransform(progressMV, (p) =>
    reduce ? toRef.current : computeStaggered(fromRef.current, toRef.current, p),
  );

  return (
    <motion.div
      data-stage-scene-id={scene.id}
      data-stage-scene-dimmed={dimmed ? "true" : "false"}
      className="absolute"
      style={{
        left: scene.position.x - scene.size.width / 2,
        top: scene.position.y - scene.size.height / 2,
        width: scene.size.width,
        height: scene.size.height,
        // Match the editor's frame-overflow policy: the per-scene wrapper
        // does NOT clip its content. Frames are layout markers, not
        // viewport masks — inner items (slide bullets bleeding below,
        // canvas shapes drawn past the frame, doc paragraphs that wrap
        // longer than the frame) show where the author placed them. The
        // outer Stage container still clips to the viewport so off-stage
        // content doesn't leak past the present surface. Mode-shared
        // overflow rule lives at
        // apps/web/src/document/render/FrameContent.tsx (FRAME_OVERFLOW).
        overflow: "visible",
        opacity,
      }}
    >
      {scene.children}
    </motion.div>
  );
}

/** Staggered opacity interpolation.
 *
 *  - Fade OUT (`to < from`): the leaving scene's alpha drops first. We
 *    compress the change into `[0, 0.65]` — by the time the camera is 65%
 *    through its spring the leaving alpha has reached its target.
 *  - Fade IN (`to > from`): the arriving scene's alpha rises last. We
 *    delay the change until `[0.35, 1]` — for the first 35% of the
 *    progress nothing happens, then the alpha climbs to its target by
 *    settle time.
 *  - No change: short-circuit.
 *
 *  The two windows overlap in `[0.35, 0.65]` so a crossfade-style step
 *  (one scene leaving + one scene arriving) reads as a single, blended
 *  motion rather than two sequential effects. */
function computeStaggered(from: number, to: number, p: number): number {
  if (to === from) return from;
  if (to > from) {
    // fade IN — arriving alpha trails
    const start = 0.35;
    const adjusted = Math.max(0, (p - start) / (1 - start));
    return from + (to - from) * adjusted;
  }
  // fade OUT — leaving alpha leads
  const end = 0.65;
  const adjusted = Math.min(1, p / end);
  return from + (to - from) * adjusted;
}
