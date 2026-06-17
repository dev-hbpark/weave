// WI-241 — Group block: the second container kind (after frame).
//
// A group renders NO chrome of its own. It is a transparent bounding box around
// its children; agocraft's FrameSurface creates the positioned container (with
// the group's `data-frame-id` for hit-testing / selection) and recurses into
// `item.children`, laying each out at its own `frame` — exactly like a frame,
// minus the fill / stroke / corner-radius paint a frame owns. Selection chrome
// (8-resize + rotate) comes from the frame-default view-model registered for
// "group" in use-selection-chrome-registry.
//
// The containment difference from `frame` (≥2 children, dissolve-on-underflow)
// lives entirely in the kind's `structure` spec — not here. This renderer is a
// pure view with no props read, by design (a group has no own visual state).
//
// SOLID / GRASP:
//   • SRP — paints nothing; child layout is FrameSurface's job (composition).
//   • OS Rule 6 — no kind/type switch; the renderer is selected by the
//     DOMAIN_RENDERERS registry keyed on item.kind.

import type { JSX } from "react";
import type { AgoItem } from "../types.js";

interface GroupBlockProps {
  readonly item: AgoItem<"group">;
}

export function GroupBlock(_props: GroupBlockProps): JSX.Element | null {
  // Transparent — children render via FrameSurface recursion, not here.
  return null;
}
