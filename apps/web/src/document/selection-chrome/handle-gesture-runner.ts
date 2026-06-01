// WI-067 / DR-032 — host side of the uniform handle-interaction pipeline.
//
//   handle pointerdown
//     → startHandleGesture(kind, …) resolves the interaction in HANDLE_INTERACTIONS
//     → createHandleGesture builds the per-handle state machine (core, DR-016)
//     → THIS runner feeds window pointer/key events to the gesture
//     → the gesture's states call the supplied HandleCommandSink (→ editor.exec).
//
// This is the SINGLE document-pointer dispatcher — it replaces the per-handle
// `beginVertexDrag` document loops that each view-model used to hand-roll. A new
// handle's input behavior is added by registering an interaction kind + passing
// a sink; no event-listener boilerplate per handle.

import type { Item as AgocraftItem } from "@agocraft/core";
import {
  createHandleGesture,
  createHandleInteractionRegistry,
  HANDLE_GESTURE_DONE,
  type HandleCommandSink,
  type HandleInteraction,
  type HandlePointer,
  handleSlots,
} from "@agocraft/editor";

// ───── Interaction registry (the polymorphism seam — externally extensible) ───

/** The host registry of handle interactions. Plugins / new handles register
 *  their kind here; the dispatcher resolves by `interaction.kind`. */
export const HANDLE_INTERACTIONS = createHandleInteractionRegistry();

/** Standard press → drag → release state machine, reused by every DRAG-type
 *  handle (vertex, endpoint, resize, rotate, midpoint-insert). The per-handle
 *  DIFFERENCE lives entirely in the sink the caller supplies:
 *    • pointer.move → sink.update (continuous; folds to one undo via mergeKey)
 *    • pointer.up   → sink.commit (optional finalize)
 *    • Escape / pointercancel → sink.cancel (optional revert)
 *  Discrete (click) handles register their own non-drag interaction instead. */
export function dragGestureStates(): ReturnType<HandleInteraction["buildStates"]> {
  return {
    initial: "dragging",
    states: [
      {
        name: "dragging",
        transitions: {
          "pointer.up": [
            {
              target: HANDLE_GESTURE_DONE,
              name: "commit",
              action: (ev, ctx) =>
                handleSlots(ctx.slots).sink.commit?.(ev.payload as HandlePointer),
            },
          ],
          "pointer.cancel": [
            {
              target: HANDLE_GESTURE_DONE,
              name: "cancel",
              action: (_ev, ctx) => handleSlots(ctx.slots).sink.cancel?.(),
            },
          ],
          "key.down": [
            {
              target: HANDLE_GESTURE_DONE,
              name: "escape",
              when: (ev) => (ev.payload as { key?: string }).key === "Escape",
              action: (_ev, ctx) => handleSlots(ctx.slots).sink.cancel?.(),
            },
          ],
        },
        effects: {
          "pointer.move": (ev, ctx) =>
            handleSlots(ctx.slots).sink.update?.(ev.payload as HandlePointer),
        },
      },
      { name: HANDLE_GESTURE_DONE },
    ],
  };
}

/** Press → release state machine for a DISCRETE (non-drag) handle: a press
 *  that ends in a release fires the sink's action; a move beyond intent or
 *  Escape / pointercancel aborts without firing. Used by click handles like the
 *  slide "add bullet" (+) button — proves the pipeline isn't drag-only. */
export function discreteActionStates(): ReturnType<HandleInteraction["buildStates"]> {
  return {
    initial: "pressed",
    states: [
      {
        name: "pressed",
        transitions: {
          "pointer.up": [
            {
              target: HANDLE_GESTURE_DONE,
              name: "fire",
              action: (ev, ctx) =>
                handleSlots(ctx.slots).sink.fire?.("activate", ev.payload as HandlePointer),
            },
          ],
          "pointer.cancel": [{ target: HANDLE_GESTURE_DONE, name: "abort" }],
          "key.down": [
            {
              target: HANDLE_GESTURE_DONE,
              name: "escape",
              when: (ev) => (ev.payload as { key?: string }).key === "Escape",
            },
          ],
        },
      },
      { name: HANDLE_GESTURE_DONE },
    ],
  };
}

// Built-in interactions. Drag-type handles share `dragGestureStates` (the sink
// differentiates); the discrete handle uses `discreteActionStates`. Every
// rubber-band handle resolves here — vertex/endpoint (P2), frame resize/rotate
// (P3), midpoint-insert + discrete (P4). External handles register new kinds.
HANDLE_INTERACTIONS.register({ kind: "vertex-drag", buildStates: dragGestureStates });
HANDLE_INTERACTIONS.register({ kind: "vertex-insert", buildStates: dragGestureStates });
HANDLE_INTERACTIONS.register({ kind: "frame-resize", buildStates: dragGestureStates });
HANDLE_INTERACTIONS.register({ kind: "frame-rotate", buildStates: dragGestureStates });
HANDLE_INTERACTIONS.register({ kind: "discrete-action", buildStates: discreteActionStates });

// ───── Dispatcher ─────────────────────────────────────────────────────────────

/** Handle gestures don't read the document through the FSM (their sinks read
 *  live state via the editor), so the per-gesture StateContext gets a frozen
 *  stub document — avoids threading a doc getter through every handle. */
const NO_DOC = {
  id: "",
  kind: "",
  attrs: {},
  units: [],
  children: [],
  meta: {},
} as unknown as AgocraftItem;

export interface StartHandleGestureArgs {
  /** Interaction kind registered in HANDLE_INTERACTIONS (e.g. "vertex-drag"). */
  readonly kind: string;
  readonly handleId: string;
  readonly itemId: string;
  /** The originating pointerdown. */
  readonly origin: HandlePointer;
  /** Host command bindings (call editor.exec). */
  readonly sink: HandleCommandSink;
  readonly params?: Readonly<Record<string, unknown>>;
  /** Optional live-document getter (most handles don't need it). */
  readonly activeDocument?: () => AgocraftItem;
}

/** Adapt a DOM/React pointer event to the framework's normalized pointer. */
export function toHandlePointer(e: {
  clientX: number;
  clientY: number;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}): HandlePointer {
  return {
    clientX: e.clientX,
    clientY: e.clientY,
    altKey: e.altKey,
    shiftKey: e.shiftKey,
    metaKey: e.metaKey,
    ctrlKey: e.ctrlKey,
  };
}

/** Start a handle gesture and wire window pointer/key events into it until it
 *  reaches its terminal state, then auto-detach. The ONE place document-level
 *  drag listeners live (DR-032). No-op when the kind is not registered. */
export function startHandleGesture(args: StartHandleGestureArgs): void {
  const interaction = HANDLE_INTERACTIONS.resolve(args.kind);
  if (interaction === undefined) {
    console.warn(`[handle-gesture] no interaction registered for kind "${args.kind}"`);
    return;
  }
  const gesture = createHandleGesture(
    interaction,
    {
      handleId: args.handleId,
      itemId: args.itemId,
      origin: args.origin,
      sink: args.sink,
      params: args.params ?? {},
    },
    args.activeDocument ?? (() => NO_DOC),
  );

  const move = (e: PointerEvent) => gesture.pointerMove(toHandlePointer(e));
  const up = (e: PointerEvent) => {
    gesture.pointerUp(toHandlePointer(e));
    cleanup();
  };
  const cancel = () => {
    gesture.pointerCancel();
    cleanup();
  };
  const key = (e: KeyboardEvent) => {
    gesture.keyDown(e.key);
    if (gesture.isDone()) cleanup();
  };
  function cleanup(): void {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", cancel);
    document.removeEventListener("keydown", key);
    gesture.dispose();
  }

  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", cancel);
  document.addEventListener("keydown", key);
}
