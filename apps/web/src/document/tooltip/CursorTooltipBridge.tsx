// CursorTooltipBridge — wires the canvas hover-describer registry into the
// UnifiedTooltip surface.
//
// Toolbar / chrome buttons declare their tooltip with a plain `data-tip`
// attribute and UnifiedTooltip picks them up via the dataset scan.  Canvas
// surfaces (frames, shapes, handles, background) need mode-/selection-/
// document-aware content the describer registry produces.  This bridge
// is the glue: it watches the live `useHoverContext` / InteractionMode /
// selection / document mirror, runs the describer, and stamps the
// resolved `{ text, kbd? }` onto the hovered DOM element's
// `data-tip` / `data-tip-kbd` attributes so the unified scan picks it up.
//
// Why imperative stamping?  The unified tooltip uses a document-level
// pointer scan so a single source of truth handles all surfaces.  We
// could fork the scan with a parallel "describer mode" path, but that
// duplicates the show-debounce + cursor-follow + portal logic that
// UnifiedTooltip already owns.  Stamping the same `data-tip` API the
// chrome uses keeps a single contract.
//
// The bridge clears the previously-stamped element on every hover change
// so a stale `data-tip` never lingers when the pointer leaves.

import type { Document as AgocraftDocument } from "@agocraft/core";
import type { AITooltipHotkeyTable } from "@weave/design-system";
import { useEffect, useRef } from "react";
import { defaultInsertableRegistry } from "../insertable/default-registry.js";
import type { InsertableRegistry } from "../insertable/types.js";
import { useInteractionMode } from "../interactions/interaction-mode.js";
import type { HoverContext, HoverKind } from "../interactions/use-hover-context.js";
import { describeHover } from "./hover-describer.js";

export interface CursorTooltipBridgeProps {
  readonly hover: HoverContext;
  readonly selectedIds: ReadonlySet<string>;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly doc: AgocraftDocument;
  readonly hotkeyTable: AITooltipHotkeyTable;
  /** Optional override for tests / custom hosts.  Defaults to the shipped
   *  default insertable registry — keeps the common DesignPage mount
   *  prop-free. */
  readonly insertable?: InsertableRegistry;
}

const ATTR_TEXT = "data-tip";
const ATTR_KBD = "data-tip-kbd";
// `data-tip-id` carries the surface identity so UnifiedTooltip's tipKey
// dedup recognises a frame-and-the-same-frame as the same target even when
// describer text shifts (e.g. selection flipped). Stops a mode-only flip
// from restarting the show timer.
const ATTR_TIP_ID = "data-tip-id";
// Marker so we know which attributes WE stamped — never strip a `data-tip`
// the host element declared statically.
const ATTR_OWN = "data-tip-from-describer";

// V6-2 (AUDIT-007) — kind→target-selector dispatch as a compiler-exhaustive
// table instead of a `switch (hover.hoveredKind)`. `HoverKind` is a closed,
// weave-owned union, so omitting a kind is a compile error (Rule 6: the caller
// declares intent, the table resolves). Each entry returns the CSS selector for
// the hovered surface, or `null` when there is no stampable element (`none`,
// `line`, or an id-bearing kind hovered without an id yet). The lookup by the
// data-* attributes mirrors the probe order `useHoverContext` resolves against.
type HoverTargetSelector = (hover: HoverContext) => string | null;

// CSS.escape covers ids with special chars in agocraft (uuid hyphens are safe
// but we stay defensive). `byId` short-circuits to null when the kind is hover-
// resolved but the id has not landed yet — preserving the old `hoveredId ===
// undefined → null` guard per id-bearing kind.
const byId =
  (template: (safe: string) => string): HoverTargetSelector =>
  (hover) =>
    hover.hoveredId === undefined ? null : template(CSS.escape(hover.hoveredId));

const HOVER_TARGET_SELECTOR: Readonly<Record<HoverKind, HoverTargetSelector>> = {
  none: () => null,
  // `line` carried no `case` in the old switch → fell through to `null`.
  line: () => null,
  background: () => '[data-design-plane="true"]',
  handle: byId((safe) => `[data-handle-kind][data-frame-id="${safe}"]`),
  hotspot: byId((safe) => `[data-hotspot-id="${safe}"]`),
  shape: byId((safe) => `[data-shape-id="${safe}"]`),
  text: byId((safe) => `[data-textbox-id="${safe}"]`),
  frame: byId((safe) => `[data-frame-id="${safe}"]`),
  image: byId((safe) => `[data-frame-id="${safe}"]`),
  video: byId((safe) => `[data-frame-id="${safe}"]`),
};

function resolveTargetElement(hover: HoverContext): HTMLElement | null {
  const selector = HOVER_TARGET_SELECTOR[hover.hoveredKind](hover);
  return selector === null ? null : document.querySelector<HTMLElement>(selector);
}

export function CursorTooltipBridge({
  hover,
  selectedIds,
  canUndo,
  canRedo,
  doc,
  hotkeyTable,
  insertable = defaultInsertableRegistry,
}: CursorTooltipBridgeProps): null {
  const { mode } = useInteractionMode();
  const lastStampedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Strip the previous stamp first so the unified scan never sees stale
    // content (e.g. cursor moved off the frame; selection cleared).
    const prev = lastStampedRef.current;
    if (prev !== null) {
      if (prev.getAttribute(ATTR_OWN) === "true") {
        prev.removeAttribute(ATTR_TEXT);
        prev.removeAttribute(ATTR_KBD);
        prev.removeAttribute(ATTR_TIP_ID);
        prev.removeAttribute(ATTR_OWN);
      }
      lastStampedRef.current = null;
    }

    const description = describeHover({
      hover,
      mode,
      selectedIds,
      canUndo,
      canRedo,
      doc,
      hotkeyTable,
      insertable,
    });
    if (description === null) return;

    const target = resolveTargetElement(hover);
    if (target === null) return;

    // Never clobber an existing chrome-owned `data-tip` (e.g. a frame might
    // get an explicit tooltip from a future host wire).
    if (target.hasAttribute(ATTR_TEXT) && target.getAttribute(ATTR_OWN) !== "true") return;

    target.setAttribute(ATTR_TEXT, description.text);
    if (description.kbd !== undefined) {
      target.setAttribute(ATTR_KBD, description.kbd);
    } else {
      target.removeAttribute(ATTR_KBD);
    }
    // tipKey = kind + id keeps the surface identity stable across mode /
    // selection flips, so refresh-in-place fires instead of a full show
    // timer restart.
    target.setAttribute(ATTR_TIP_ID, `hover:${hover.hoveredKind}:${hover.hoveredId ?? ""}`);
    target.setAttribute(ATTR_OWN, "true");
    lastStampedRef.current = target;
  }, [hover, mode, selectedIds, canUndo, canRedo, doc, hotkeyTable, insertable]);

  // Cleanup on unmount — always strip.
  useEffect(() => {
    return () => {
      const prev = lastStampedRef.current;
      if (prev !== null && prev.getAttribute(ATTR_OWN) === "true") {
        prev.removeAttribute(ATTR_TEXT);
        prev.removeAttribute(ATTR_KBD);
        prev.removeAttribute(ATTR_TIP_ID);
        prev.removeAttribute(ATTR_OWN);
      }
    };
  }, []);

  return null;
}
