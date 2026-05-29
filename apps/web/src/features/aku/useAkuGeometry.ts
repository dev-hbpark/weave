// Aku panel geometry (WI-052) — user-positioned + resizable, persisted.
//
// Holds {x,y,w,h} (viewport px, top-left origin). Default = top-left, below the
// app header. `beginMove` drags the surface (with tap-vs-drag detection so the
// collapsed launcher can be both dragged AND clicked); `beginResize` resizes
// from the bottom-right corner. Everything is clamped to the viewport and
// persisted to localStorage so position + size survive collapse/expand/reload.

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export interface AkuGeometry {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const STORAGE_KEY = "weave.aku.geometry";
const DEFAULT: AkuGeometry = { x: 16, y: 72, w: 360, h: 560 };
const MIN_W = 300;
const MIN_H = 360;
const KEEP_ON_SCREEN = 56; // always leave at least this much grabbable

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);
const vw = (): number => (typeof window !== "undefined" ? window.innerWidth : 1280);
const vh = (): number => (typeof window !== "undefined" ? window.innerHeight : 800);

function clampGeom(g: AkuGeometry): AkuGeometry {
  const w = clamp(g.w, MIN_W, Math.max(MIN_W, vw()));
  const h = clamp(g.h, MIN_H, Math.max(MIN_H, vh()));
  return {
    w,
    h,
    x: clamp(g.x, 0, Math.max(0, vw() - KEEP_ON_SCREEN)),
    y: clamp(g.y, 0, Math.max(0, vh() - KEEP_ON_SCREEN)),
  };
}

function load(): AkuGeometry {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const p = JSON.parse(raw) as Partial<AkuGeometry>;
      if (
        typeof p.x === "number" &&
        typeof p.y === "number" &&
        typeof p.w === "number" &&
        typeof p.h === "number"
      ) {
        return clampGeom({ x: p.x, y: p.y, w: p.w, h: p.h });
      }
    }
  } catch {
    // ignore corrupt/locked storage — fall back to default
  }
  return { ...DEFAULT };
}

export interface UseAkuGeometry {
  readonly geometry: AkuGeometry;
  /** Drag the surface. `onTap` fires when released without moving (so a
   *  draggable launcher still opens on click). */
  beginMove(e: ReactPointerEvent, opts?: { readonly onTap?: () => void }): void;
  /** Resize from the bottom-right corner. */
  beginResize(e: ReactPointerEvent): void;
}

export function useAkuGeometry(): UseAkuGeometry {
  const [geometry, setGeometry] = useState<AkuGeometry>(load);
  const ref = useRef(geometry);
  ref.current = geometry;

  const persist = useCallback((g: AkuGeometry): void => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(g));
    } catch {
      // ignore locked storage (Safari private mode) — position just won't survive reload
    }
  }, []);

  useEffect(() => {
    const onResize = (): void => setGeometry((g) => clampGeom(g));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const beginMove = useCallback(
    (e: ReactPointerEvent, opts?: { readonly onTap?: () => void }): void => {
      if (e.button !== 0) return;
      const sx = e.clientX;
      const sy = e.clientY;
      const orig = ref.current;
      let moved = false;
      const onMove = (ev: PointerEvent): void => {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        if (!moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) moved = true;
        if (moved) setGeometry(clampGeom({ ...orig, x: orig.x + dx, y: orig.y + dy }));
      };
      const onUp = (): void => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (moved) persist(ref.current);
        else opts?.onTap?.();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [persist],
  );

  const beginResize = useCallback(
    (e: ReactPointerEvent): void => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const sx = e.clientX;
      const sy = e.clientY;
      const orig = ref.current;
      const onMove = (ev: PointerEvent): void => {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        setGeometry(clampGeom({ ...orig, w: orig.w + dx, h: orig.h + dy }));
      };
      const onUp = (): void => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        persist(ref.current);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [persist],
  );

  return { geometry, beginMove, beginResize };
}
