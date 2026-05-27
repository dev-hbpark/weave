// DR-design-013 — Capture-phase backstop for outside-click dismiss.
//
// Radix's built-in `onPointerDownOutside` registers a `document` listener
// in the **bubble** phase. Any consumer that calls `e.stopPropagation()` in
// the React tree (e.g. weave's FrameStage canvas, which does it in 9 spots
// to prevent ancestor RubberBandLayer / pan handlers from re-firing on the
// same press) also blocks the document-level listener — so the overlay
// never receives the "outside click" signal and stays open.
//
// This hook registers a parallel `pointerdown` listener in the **capture**
// phase. Capture phase runs BEFORE any bubble-phase React handler can call
// stopPropagation, so it always fires regardless of consumer behaviour.
// The hook does NOT prevent the original event from continuing — it just
// observes and calls `onDismiss` when the press lands outside the trigger
// and outside any portaled overlay content.
//
// Exemptions (do NOT dismiss):
//   • Trigger element + its descendants.
//   • Any element under a Radix portal wrapper / overlay role.
//   • Any element marked `data-dismiss-exempt="true"`.

import { type RefObject, useEffect } from "react";

export interface UseDismissOnOutsidePointerArgs {
  /** Listener is mounted only while this is true. */
  readonly open: boolean;
  /** Called when a pointerdown lands outside the trigger + any portaled
   *  overlay content + any exempt area. */
  readonly onDismiss: () => void;
  /** Trigger element. Pointer events inside this element do NOT dismiss
   *  (so a click on the trigger can keep its own toggle semantics). For
   *  trigger-less overlays (e.g. ContextMenu with virtual anchor) pass an
   *  object whose `.current` is null — the hook then skips the trigger
   *  check. */
  readonly triggerRef: RefObject<HTMLElement | null>;
}

// Selectors that identify "do not dismiss" elements in the pointer path:
// - Radix portal wrappers carry their own markers.
// - role-based ARIA markers catch any other overlay primitive.
// - `[data-state="open"]` is Radix's standard mark for an open Popover /
//   DropdownMenu / ContextMenu / Dialog / Select trigger (and content);
//   matching it lets a click on the trigger itself self-exempt, so toggling
//   open→closed via Radix's own logic still works when consumers pass
//   custom trigger children that bypass our ref capture.
// - `[data-dismiss-exempt="true"]` is the host's escape hatch.
const OVERLAY_ROLE_SELECTOR =
  '[data-radix-popper-content-wrapper], [data-radix-portal], [role="menu"], [role="dialog"], [role="tooltip"], [data-state="open"], [data-dismiss-exempt="true"]';

function pathIncludesExempt(
  path: ReadonlyArray<EventTarget>,
  trigger: HTMLElement | null,
): boolean {
  for (const node of path) {
    if (!(node instanceof Element)) continue;
    if (trigger !== null && (node === trigger || trigger.contains(node))) {
      return true;
    }
    if (node.matches?.(OVERLAY_ROLE_SELECTOR)) return true;
  }
  return false;
}

export function useDismissOnOutsidePointer({
  open,
  onDismiss,
  triggerRef,
}: UseDismissOnOutsidePointerArgs): void {
  useEffect(() => {
    if (!open) return;
    const handler = (event: PointerEvent): void => {
      // Only primary button + only direct pointer interactions. Synthetic
      // pointerdowns dispatched programmatically (e.g. from focus management)
      // shouldn't trigger dismiss.
      if (event.button !== 0) return;
      const path = event.composedPath();
      if (pathIncludesExempt(path, triggerRef.current)) return;
      onDismiss();
    };
    document.addEventListener("pointerdown", handler, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", handler, { capture: true });
    };
  }, [open, onDismiss, triggerRef]);
}
