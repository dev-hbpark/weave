// 아쿠 roaming + drag controller (WI-107 / WI-108 / WI-111). Owns the single
// launcher Aku's position AND its activity-driven phase:
//   - USER EDITING (pointer/keyboard activity on the doc) → sit IDLE at home,
//   - idle, < 1 min since the last edit → wander to random viewport points,
//   - idle, ≥ 1 min since the last edit → walk to screen centre, then doze (sleep),
//   - WORKING (agent streaming) → START at the screen centre (the turn visibly
//     begins centre-stage), THEN roam to each edited frame, AND keep hopping to a
//     fresh random point WITHIN the current frame every 2 sprite loops (WI-121),
//   - DRAG → follow the pointer (drag-struggle sprite), settling where dropped.
// `moving`/`dragging`/`sleeping` let the caller pick the sprite; a tap (no movement
// past threshold) calls `onTap`. `paused` (panel open / coachmark) and reduced
// motion freeze the auto behaviour; a drag always wins. The activity watcher is
// why this controller — not the expression layer — owns `sleeping`: only it sees
// real pointer/keyboard editing (Information Expert). `sleeping` is fed back into
// useAkuExpression so the mood table stays the single source of mood priority.

import type { Editor } from "@agocraft/editor";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { isAkuSurface } from "./interaction-lock.js";
import { randomViewportPoint, roamPointInRect, travelDir } from "./roam-target.js";

export const ROAM_TRAVEL_MS = 1100;
const IDLE_MS = 3600; // cadence of random wander hops while roaming
const DRAG_THRESHOLD = 4;
const EDIT_SETTLE_MS = 4000; // within this since the last edit gesture → "user is editing"
const SLEEP_AFTER_MS = 60_000; // no editing for ≥ 1 min → doze (blanket-sleep)
const TICK_MS = 1000; // phase-driver cadence
// While working, the wander cycle is MOVE → then PLAY 2 sprite loops at rest → MOVE.
// During the glide (ROAM_TRAVEL_MS) the locomotion sprite shows; once it settles the
// editing spell plays. Editing sprites are 6 frames @ 6fps → 1 loop 1000ms, so 2
// loops = 2000ms of rest-play. The hop interval = travel + 2-loop play, otherwise the
// next hop fires mid-play and the 2 plays aren't guaranteed (WI-122/WI-123).
const FRAME_PLAY_MS = 2000; // 2 loops of rest-play after arriving (6 frames @ 6fps)
const FRAME_HOP_MS = ROAM_TRAVEL_MS + FRAME_PLAY_MS;

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
  readonly editor: Editor;
  readonly streaming: boolean;
  readonly paused: boolean;
  readonly reduce: boolean;
  readonly boxW: number;
  readonly boxH: number;
  readonly home: { readonly x: number; readonly y: number };
  readonly onTap: () => void;
}): AkuRoam {
  const { editor, streaming, paused, reduce, boxW, boxH, home, onTap } = opts;
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
  // The frame (item id) the agent is currently editing — set from the changeStream,
  // read by the periodic intra-frame wander (WI-121). null = nothing being edited.
  const editFrameRef = useRef<string | null>(null);
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

  // Fly to a fresh RANDOM point inside the given item's on-screen frame (skip if it
  // can't be located or is off-screen / zero-size). Shared by the changeStream
  // (move on frame change) and the periodic intra-frame wander (WI-121).
  const flyToFrame = useCallback(
    (itemId: string): void => {
      const f = flags.current;
      if (f.reduce || f.paused || !f.streaming || draggingRef.current) return;
      const sel = `[data-frame-id="${CSS.escape(itemId)}"]`;
      const el = document.querySelector(`main ${sel}`) ?? document.querySelector(sel);
      const rect = el?.getBoundingClientRect();
      if (rect === undefined || rect.width === 0 || rect.height === 0) return;
      goTo(
        roamPointInRect(rect, f.boxW, f.boxH, window.innerWidth, window.innerHeight, Math.random),
      );
    },
    [goTo],
  );

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
        // agent working — the fly-to-frame effect owns position (Aku roams to each
        // edited frame). Here just keep the doze timer fresh and don't roam/sleep,
        // so the moment it finishes Aku is "editing" (home/idle), never instantly asleep.
        lastActivityRef.current = Date.now();
        wake();
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

  // Working START — glide to the screen centre once when a turn begins, so work
  // visibly starts centre-stage (WI-116). Clear the edit-frame so the wander below
  // doesn't chase a pre-turn frame until the agent's first edit lands.
  useEffect(() => {
    if (!streaming || draggingRef.current) return;
    editFrameRef.current = null;
    const f = flags.current;
    goTo(viewportCentre(f.boxW, f.boxH));
  }, [streaming, goTo]);

  // Working — RECORD the frame the agent is editing (latest target only). The wander
  // loop below is the SOLE mover; a frame change never moves Aku directly, so it can
  // never cancel an in-progress play. The move to a new target happens at the next
  // cycle boundary, i.e. only AFTER the current 2-loop play completes (WI-123).
  useEffect(() => {
    const off = editor.changeStream.subscribe(
      (change: unknown) => {
        const id = (change as { itemId?: unknown }).itemId;
        if (typeof id === "string") editFrameRef.current = id;
      },
      { origins: ["user-command"] },
    );
    return () => off?.();
  }, [editor]);

  // Working WANDER — the single move scheduler. Each cycle = MOVE (glide) → PLAY the
  // editing spell 2 loops at rest → next MOVE (FRAME_HOP_MS = travel + 2-loop play).
  // Moving only here guarantees every play runs to completion before the next hop,
  // whether the target is the same frame (intra-frame wander) or a newly-edited one
  // (WI-121/WI-122/WI-123: "재생 2번이 무조건 보장").
  useEffect(() => {
    if (!streaming) return;
    const id = setInterval(() => {
      const cur = editFrameRef.current;
      if (cur !== null) flyToFrame(cur);
    }, FRAME_HOP_MS);
    return () => {
      clearInterval(id);
      editFrameRef.current = null;
    };
  }, [streaming, flyToFrame]);

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
