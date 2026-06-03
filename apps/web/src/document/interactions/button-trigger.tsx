import type { ButtonTriggerBehavior } from "../types.js";
import { dispatchHotspotAction, openExternalHref } from "./hotspot-action.js";
import type { InteractionAdapter, PresentContext } from "./types.js";

// WI-090 (DR-052) — the "link unit". A `button-trigger` makes the WHOLE item a
// clickable link in Present mode. Its `HotspotAction` decides what the click
// does — `external` opens a URL in a new tab, `jump-camera` navigates to a
// slide (camera id `present-${frameId}`), plus the shared reveal / next-camera
// operations. Unlike `hotspot` (a sub-region), the trigger covers the item's
// full box, so the overlay is an `inset:0` surface.
//
// Reviving the registry's `renderOverlay` path (DR-052 §3): this adapter is the
// single source of the link click for EVERY item kind. PresentPage no longer
// special-cases button-trigger on slide frames — `ItemInteractionLayer` renders
// this overlay uniformly for root primitives, nested children, and frames.

function runAction(behavior: ButtonTriggerBehavior, ctx: PresentContext): void {
  dispatchHotspotAction(behavior.action, {
    reveal: (id) => ctx.reveal(id),
    nextStep: () => ctx.goToStep(Math.min(ctx.step + 1, ctx.totalSteps - 1)),
    jumpToCamera: (id) => ctx.goToCameraId(id),
    openExternal: openExternalHref,
  });
}

export const buttonTriggerAdapter: InteractionAdapter<ButtonTriggerBehavior> = {
  kind: "button-trigger",
  renderOverlay: (behavior, _item, ctx) => (
    <button
      key={behavior.id}
      type="button"
      data-testid="present-link"
      data-button-action={behavior.action.type}
      aria-label={behavior.label ?? "Link"}
      onClick={(e) => {
        // Stop the click from bubbling to ancestor scenes / frame overlays so a
        // child link wins over a frame-level link cleanly.
        e.stopPropagation();
        runAction(behavior, ctx);
      }}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        margin: 0,
        padding: 0,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        appearance: "none",
        // Above the item's own content (shape fill / image / text glyphs, all
        // z-auto) so the link reliably catches clicks — but BELOW a text item's
        // inline `<a>` (z-index 2, DR-052 §2) so inline hyperlinks win their glyphs.
        zIndex: 1,
      }}
    />
  ),
};
