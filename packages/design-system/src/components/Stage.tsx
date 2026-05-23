import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
  const scale = Math.pow(a.scale, 1 - p) * Math.pow(b.scale, p);
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
  className,
}: StageProps) {
  const reduce = useReducedMotion();
  const active = scenes.find((s) => s.id === activeId) ?? scenes[0];

  // Measure the outer container so the camera can compute a base scale that
  // fits the entire design plane to the viewport. The explicit `viewportSize`
  // prop wins if given.
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<
    { width: number; height: number } | undefined
  >(undefined);

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
  const baseScale = vp
    ? Math.min(vp.width / designSize.width, vp.height / designSize.height)
    : 1;
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
    const liveFrom = transitionCamera(
      fromRef.current,
      toRef.current,
      progressMV.get(),
    );
    fromRef.current = liveFrom;
    toRef.current = next;
    progressMV.set(0);
    if (reduce) {
      progressMV.set(1);
      return;
    }
    setAnimating(true);
    const controls = animate(progressMV, 1, {
      type: "spring",
      stiffness: 90,
      damping: 22,
      mass: 0.9,
      onComplete: () => setAnimating(false),
    });
    return () => {
      controls.stop();
    };
  }, [targetCx, targetCy, targetScale, reduce, vp, progressMV]);

  // Derive screen-space transform values from progress. Each useTransform
  // re-runs whenever progressMV changes; the ref reads inside the mapper
  // always see the latest from/to endpoints.
  const scaleMV = useTransform(progressMV, (p) =>
    transitionCamera(fromRef.current, toRef.current, p).scale,
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
        "bg-[color:var(--bg-page)]",
        className,
      )}
      style={
        viewportSize
          ? { width: viewportSize.width, height: viewportSize.height }
          : undefined
      }
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
          x: txMV,
          y: tyMV,
          scale: scaleMV,
        }}
      >
        {scenes.map((scene) => (
          <div
            key={scene.id}
            data-stage-scene-id={scene.id}
            className="absolute"
            style={{
              left: scene.position.x - scene.size.width / 2,
              top: scene.position.y - scene.size.height / 2,
              width: scene.size.width,
              height: scene.size.height,
              // Clip to the frame's actual aspect ratio — matches the editor
              // (FrameStage applies the same overflow:hidden per frame). Without
              // this, renderers with their own aspect-ratio rules (e.g. the
              // slide block's `aspect-[16/9]` inner card) bleed past the frame
              // bounds in present mode and the visible aspect ends up wider or
              // taller than the editor preview.
              overflow: "hidden",
            }}
          >
            {scene.children}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
