// 아쿠 roaming + drag controller (WI-107 / WI-108 / WI-111). Owns the single
// launcher Aku's position AND its activity-driven phase:
//   - USER EDITING (pointer/keyboard activity on the doc) → sit IDLE at home,
//   - idle, < 1 min since the last edit → wander to random viewport points,
//   - idle, ≥ 1 min since the last edit → walk to screen centre, then doze (sleep),
//   - WORKING (agent streaming) → move to the screen CENTRE and stay (WI-115):
//     the camera brings the edited root frame to centre, so Aku works over it,
//   - DRAG → follow the pointer (drag-struggle sprite), settling where dropped.
// `moving`/`dragging`/`sleeping` let the caller pick the sprite; a tap (no movement
// past threshold) calls `onTap`. `paused` (panel open / coachmark) and reduced
// motion freeze the auto behaviour; a drag always wins. The activity watcher is
// why this controller — not the expression layer — owns `sleeping`: only it sees
// real pointer/keyboard editing (Information Expert). `sleeping` is fed back into
// useAkuExpression so the mood table stays the single source of mood priority.

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { isAkuSurface } from "./interaction-lock.js";
import { randomViewportPoint, travelDir } from "./roam-target.js";

export const ROAM_TRAVEL_MS = 1100;
const IDLE_MS = 3600; // cadence of random wander hops while roaming
const DRAG_THRESHOLD = 4;
const EDIT_SETTLE_MS = 4000; // within this since the last edit gesture → "user is editing"
const SLEEP_AFTER_MS = 60_000; // no editing for ≥ 1 min → doze (blanket-sleep)
const TICK_MS = 1000; // phase-driver cadence

/** The top-left for a boxW×boxH mascot centred in the current viewport. */
function viewportCentre(boxW: number, boxH: number): { x: number; y: number } {
  return {
    x: Math.max(4, (window.innerWidth - boxW) / 2),
    y: Math.max(4, (window.innerHeight - boxH) / 2),
  };
}

export interface AkuRoam {
  readonly x: number;
  readonly y: number;
  readonly moving: boolean;
  readonly dragging: boolean;
  readonly sleeping: boolean;
  readonly dir: "left" | "right";
  readonly onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
}

function clamp(v: number, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return Math.max(lo, Math.min(hi, v));
}

export function useAkuRoam(opts: {
  readonly streaming: boolean;
  readonly paused: boolean;
  readonly reduce: boolean;
  readonly boxW: number;
  readonly boxH: number;
  readonly home: { readonly x: number; readonly y: number };
  readonly onTap: () => void;
}): AkuRoam {
  const { streaming, paused, reduce, boxW, boxH, home, onTap } = opts;
  const [state, setState] = useState<{
    x: number;
    y: number;
    moving: boolean;
    dir: "left" | "right";
  }>({ x: home.x, y: home.y, moving: false, dir: "right" });
  const [dragging, setDragging] = useState(false);
  const [sleeping, setSleeping] = useState(false);
  const posRef = useRef({ x: home.x, y: home.y });
  const moveTimer = useRef<ReturnType<typeof setTimeout>>();
  const draggingRef = useRef(false);
  const sleepingRef = useRef(false);
  // Timestamp of the last real user EDIT gesture (pointer/keyboard on the doc) and
  // of the last random wander hop. Read by the long-lived phase driver.
  const lastActivityRef = useRef(Date.now());
  const lastRoamRef = useRef(0);

  // Live flags read by the long-lived schedulers (avoids reset-on-rerender).
  const flags = useRef({ streaming, paused, reduce, boxW, boxH, home });
  flags.current = { streaming, paused, reduce, boxW, boxH, home };

  const goTo = useCallback((p: { x: number; y: number }): void => {
    if (draggingRef.current) return;
    const dir = travelDir(posRef.current.x, p.x);
    posRef.current = p;
    setState({ x: p.x, y: p.y, moving: true, dir });
    if (moveTimer.current) clearTimeout(moveTimer.current);
    moveTimer.current = setTimeout(
      () => setState((s) => ({ ...s, moving: false })),
      ROAM_TRAVEL_MS,
    );
  }, []);

  // Drag — follow the pointer; a sub-threshold press is a tap (→ onTap / open).
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>): void => {
      const rect = e.currentTarget.getBoundingClientRect();
      const offX = e.clientX - rect.left;
      const offY = e.clientY - rect.top;
      const startX = e.clientX;
      const startY = e.clientY;
      let moved = false;

      const onMove = (ev: PointerEvent): void => {
        if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) > DRAG_THRESHOLD) {
          moved = true;
          draggingRef.current = true;
          setDragging(true);
        }
        if (!moved) return;
        const x = clamp(ev.clientX - offX, 4, window.innerWidth - boxW - 4);
        const y = clamp(ev.clientY - offY, 4, window.innerHeight - boxH - 4);
        posRef.current = { x, y };
        setState((s) => ({ ...s, x, y, moving: false }));
      };
      const onUp = (): void => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (!moved) {
          onTap();
          return;
        }
        draggingRef.current = false;
        setDragging(false); // roaming resumes from the drop position (posRef)
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [boxW, boxH, onTap],
  );

  // User-activity watcher — only REAL doc editing counts: a press, a key, a wheel,
  // or a buttoned drag. Bare hover (pointermove with no button), and anything on
  // the Aku surface itself (its own drag), are NOT editing. This is the signal the
  // phase driver uses to decide home-idle vs. roam vs. doze.
  useEffect(() => {
    const mark = (e: Event): void => {
      if (draggingRef.current) return; // dragging Aku ≠ editing the doc
      const t = e.target;
      if (t instanceof Element && isAkuSurface(t)) return;
      if (e.type === "pointermove" && (e as PointerEvent).buttons === 0) return;
      lastActivityRef.current = Date.now();
    };
    window.addEventListener("pointerdown", mark, true);
    window.addEventListener("pointermove", mark, true);
    window.addEventListener("keydown", mark, true);
    window.addEventListener("wheel", mark, true);
    return () => {
      window.removeEventListener("pointerdown", mark, true);
      window.removeEventListener("pointermove", mark, true);
      window.removeEventListener("keydown", mark, true);
      window.removeEventListener("wheel", mark, true);
    };
  }, []);

  // Phase driver — one interval, set once; each tick reads the live flags + the
  // time since the last edit and drives editing → roaming → sleeping.
  useEffect(() => {
    const wake = (): void => {
      if (sleepingRef.current) {
        sleepingRef.current = false;
        setSleeping(false);
      }
    };
    const id = setInterval(() => {
      const f = flags.current;
      if (draggingRef.current) return; // drag owns position
      if (f.reduce) return; // reduced-motion: pinned home by the return value
      if (f.paused) {
        // panel open / coachmark anchor — freeze in place, but the panel being open
        // IS user engagement: keep the doze timer fresh so closing it doesn't drop
        // straight into sleep (the time spent in the panel must not age the timer).
        lastActivityRef.current = Date.now();
        wake();
        return;
      }
      if (f.streaming) {
        // agent working — move to (and hold at) the screen centre; the camera brings
        // the edited root frame here so Aku works over it (WI-115). Counts as activity
        // so the moment it finishes Aku is "editing" (home/idle), never instantly asleep.
        lastActivityRef.current = Date.now();
        wake();
        const c = viewportCentre(f.boxW, f.boxH);
        if (Math.abs(posRef.current.x - c.x) > 1 || Math.abs(posRef.current.y - c.y) > 1) {
          goTo(c);
        }
        return;
      }
      const dt = Date.now() - lastActivityRef.current;

      if (dt < EDIT_SETTLE_MS) {
        // user editing → idle, waiting at home (glide back if it had wandered off).
        wake();
        const h = f.home;
        if (Math.abs(posRef.current.x - h.x) > 1 || Math.abs(posRef.current.y - h.y) > 1) {
          goTo(h);
        }
        return;
      }

      if (dt >= SLEEP_AFTER_MS) {
        // long quiet → walk to the screen centre, THEN doze (blanket-sleep; idle
        // sprite for now). goTo runs the move sprite during travel; once it settles
        // `moving` clears and the `sleeping` mood shows. Fires once on entry.
        if (!sleepingRef.current) {
          sleepingRef.current = true;
          setSleeping(true);
          goTo(viewportCentre(f.boxW, f.boxH));
        }
        return;
      }

      // roaming window — wander to a fresh random point every IDLE_MS.
      wake();
      if (Date.now() - lastRoamRef.current >= IDLE_MS) {
        lastRoamRef.current = Date.now();
        goTo(
          randomViewportPoint(f.boxW, f.boxH, window.innerWidth, window.innerHeight, Math.random),
        );
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [goTo]);

  // Working start — move to the screen centre immediately (don't wait a tick) so a
  // turn visibly begins with Aku gliding to centre, then "connecting" (WI-115). The
  // driver holds it there; the camera brings the edited frame to it.
  useEffect(() => {
    if (!streaming || draggingRef.current) return;
    const f = flags.current;
    goTo(viewportCentre(f.boxW, f.boxH));
  }, [streaming, goTo]);

  useEffect(
    () => () => {
      if (moveTimer.current) clearTimeout(moveTimer.current);
    },
    [],
  );

  if (reduce) {
    return {
      x: home.x,
      y: home.y,
      moving: false,
      dragging: false,
      sleeping: false,
      dir: "right",
      onPointerDown,
    };
  }
  return { ...state, dragging, sleeping, onPointerDown };
}
