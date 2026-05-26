// WI-033 A4 — Layer Picker public exports.
//
// Right-click on a frame → ContextMenu opens with overlapping frames at
// the cursor as the first section. The hit-test is a pure function;
// the menu is an app-local composition over `@weave/design-system`'s
// ContextMenu primitive (DR-design-011 extension).

export { findFramesAtPoint, type LayerHit } from "./hit-test.js";
export { LayerPickerMenu, type LayerPickerMenuProps } from "./LayerPickerMenu.js";
