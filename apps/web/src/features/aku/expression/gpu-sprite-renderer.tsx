// 아쿠 expression — GPU/engine renderer (WI-104, consumer of @agocraft/sprite-engine).
//
// Plugs the reusable sprite engine into the AkuExpressionRenderer seam (DR-070 D2):
// mounts a <canvas>, creates the engine (best tier: WebGPU→WebGL2→Canvas2D), and
// per mood loads the matching 6-frame sprite SHEET (/aku/sprites/*) — so each
// agent-server state plays its own animation (생각/적용/정리/완료/연결 …). When no
// tier binds (createSpriteEngine → null), it degrades to cssSpriteRenderer (the
// 4th, CSS, fallback tier — static mascot + transform motion). Aku's mood registry
// + useAkuExpression are untouched (seam payback).

import { createSpriteEngine, type SpriteEngine } from "@agocraft/sprite-engine";
import { useEffect, useRef, useState } from "react";
import { cssSpriteRenderer } from "./css-sprite-renderer.js";
import type { AkuMood } from "./mood.js";
import type { AkuExpressionRenderer, AkuExpressionState } from "./renderer-types.js";

interface SpriteSpec {
  readonly src: string;
  readonly frames: number;
  readonly fps: number;
  readonly looping: boolean;
}

// mood → agent-server behavior sprite sheet (each /aku/sprites/* is a 6-frame strip).
const SPRITES: Readonly<Record<AkuMood, SpriteSpec>> = {
  idle: { src: "/aku/sprites/idle.png", frames: 6, fps: 6, looping: true },
  connecting: { src: "/aku/sprites/move-left.png", frames: 6, fps: 10, looping: true }, // 연결 중
  thinking: { src: "/aku/sprites/thinking.png", frames: 6, fps: 6, looping: true }, // 생각 중
  adding: { src: "/aku/sprites/spell-right.png", frames: 6, fps: 6, looping: true }, // 아이템 추가 (오른쪽 spell) — 6프레임@6fps = 1초/루프
  updating: { src: "/aku/sprites/spell-left.png", frames: 6, fps: 6, looping: true }, // 아이템 수정 (왼쪽 spell) — 1초/루프
  // WI-119: working/celebrating are REMAPPED to a random spell in useAkuExpression
  // (idea.png retired), so these entries are dead fallbacks kept for type exhaustiveness.
  working: { src: "/aku/sprites/idea.png", frames: 6, fps: 9, looping: true },
  // paint brush cast — an edit spell in the random pool (WI-129). 6 frames @ 6fps =
  // 1s/loop so the roam wander's 2-loop (2000ms) rest-play stays aligned with the casts.
  painting: { src: "/aku/sprites/paint.png", frames: 6, fps: 6, looping: true }, // 편집 (paint)
  finalizing: { src: "/aku/sprites/puff.png", frames: 6, fps: 9, looping: true }, // 정리 중 (puff)
  celebrating: { src: "/aku/sprites/idea.png", frames: 6, fps: 10, looping: true },
  confused: { src: "/aku/sprites/thinking.png", frames: 6, fps: 8, looping: true }, // 오류 (?)
  sleeping: { src: "/aku/sprites/idle.png", frames: 6, fps: 3, looping: true }, // 졸음
  looking: { src: "/aku/sprites/move-right.png", frames: 6, fps: 9, looping: true }, // 선택 주목
  dragging: { src: "/aku/sprites/drag.png", frames: 6, fps: 12, looping: true }, // 드래그 중(버둥)
};

// Shared image cache so swapping moods (and remounts) never re-downloads a sheet.
const imgCache = new Map<string, HTMLImageElement>();
function loadImage(src: string): Promise<HTMLImageElement> {
  const hit = imgCache.get(src);
  if (hit?.complete) return Promise.resolve(hit);
  const img = hit ?? new Image();
  if (hit === undefined) {
    imgCache.set(src, img);
    img.src = src;
  }
  return new Promise((resolve, reject) => {
    if (img.complete) resolve(img);
    else {
      img.addEventListener("load", () => resolve(img), { once: true });
      img.addEventListener("error", reject, { once: true });
    }
  });
}

function EngineMascot({ mood, intensity }: AkuExpressionState): JSX.Element {
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const engineRef = useRef<SpriteEngine | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  // Create the engine on a FRESH, imperatively-managed canvas (not a JSX child):
  // the GPU tier calls transferControlToOffscreen(), which permanently consumes a
  // canvas — reusing one (StrictMode double-invoke, launcher branch swaps) would
  // throw. A new canvas per session sidesteps that; React never reconciles it away
  // because the wrapper has no JSX children. The atlas/clip are owned by [mood].
  useEffect(() => {
    const wrap = wrapRef.current;
    if (wrap === null) return;
    const canvas = document.createElement("canvas");
    canvas.className = "block h-full w-full";
    wrap.appendChild(canvas);

    const engine = createSpriteEngine(canvas, { tiers: ["webgpu", "webgl2", "canvas2d"] });
    if (engine === null) {
      canvas.remove();
      setUnavailable(true);
      return;
    }
    engineRef.current = engine;
    setTier(engine.tier);
    const dpr = window.devicePixelRatio || 1;
    const box = wrap.getBoundingClientRect();
    engine.resize(box.width || 120, box.height || 120, dpr);
    engine.play(); // loops; draws nothing until the [mood] effect binds an atlas

    // Mirror the engine's frame count onto the wrapper (tier-agnostic motion
    // telemetry — the worker tier transfers the canvas, so pixels aren't readable).
    let raf = 0;
    const pump = (): void => {
      wrap.dataset.frame = String(engine.frames());
      raf = requestAnimationFrame(pump);
    };
    raf = requestAnimationFrame(pump);
    return () => {
      cancelAnimationFrame(raf);
      engine.dispose();
      engineRef.current = null;
      canvas.remove();
    };
  }, []);

  // Load the mood's sprite sheet + clip — at mount (initial mood) and on change.
  useEffect(() => {
    const engine = engineRef.current;
    if (engine === null) return;
    const spec = SPRITES[mood];
    let cancelled = false;
    void loadImage(spec.src).then((img) => {
      if (cancelled || engineRef.current !== engine) return; // stale mood / disposed
      engine.loadAtlas({ source: img, cols: spec.frames, rows: 1 });
      engine.setClip({ frameCount: spec.frames, fps: spec.fps, looping: spec.looping });
    });
    return () => {
      cancelled = true;
    };
  }, [mood]);

  // No tier could bind → CSS fallback tier (DR-044 D2 tier 4).
  if (unavailable) return <>{cssSpriteRenderer.render({ mood, intensity })}</>;

  // Wrapper carries data-mood/-engine/-frame; the <canvas> is appended imperatively.
  return (
    <span
      ref={wrapRef}
      data-mood={mood}
      data-aku-engine={tier ?? "init"}
      className="relative block h-full w-full drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)]"
    />
  );
}

export function createGpuSpriteRenderer(): AkuExpressionRenderer {
  return {
    render: (state) => <EngineMascot mood={state.mood} intensity={state.intensity} />,
  };
}

/** Default engine renderer instance (composition root wires it). */
export const gpuSpriteRenderer = createGpuSpriteRenderer();
