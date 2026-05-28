// WI-020 / WI-043 — per-child flex controls.
//
// Cross-kind surface: shown for ANY single selected item whose PARENT frame
// has an `auto-flex` layout. Lets the user set the two per-child properties
// that drive flex sizing:
//   • Grow (main axis): Fixed (grow 0, keep current size) ↔ Fill (grow 1,
//     take the remaining space; multiple Fill children share it).
//   • Align self (cross axis): Start / Center / End / Stretch — overrides the
//     frame's `align` for this child (Stretch = fill the cross axis).
//
// Both write `attrs.layoutChild` via `weave.item.setLayoutChild`, which routes
// through the agocraft LayoutEngine so the parent re-lays-out immediately.
//
// This is NOT a kind section (those dispatch by the selected item's kind);
// it is rendered by the ContextualToolbar alongside the kind section because
// per-child layout applies to every kind equally.

import type { Editor } from "@agocraft/editor";
import {
  type AutoFlexChildPolicy,
  type AutoFlexSpec,
  createAutoFlexChildPolicy,
  type Document as AgocraftDocument,
  type FlexAlign,
  type LayoutChildPolicy,
  type LayoutSpec,
} from "@agocraft/core";
import { ContextualToolbar as Bar, SegmentedControl } from "@weave/design-system";
import type { JSX } from "react";
import { findParentAndIndex } from "../../agocraft-mirror.js";
import type { ItemSnapshot } from "../multi-edit.js";

type GrowChoice = "fixed" | "fill";

const GROW_OPTIONS: ReadonlyArray<{ value: GrowChoice; label: string }> = [
  { value: "fixed", label: "Fixed" },
  { value: "fill", label: "Fill" },
];

const ALIGN_SELF_OPTIONS: ReadonlyArray<{ value: FlexAlign; label: string }> = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
  { value: "stretch", label: "Stretch" },
];

interface FlexChildSectionProps {
  readonly editor: Editor;
  readonly items: ReadonlyArray<ItemSnapshot>;
  /** Live document — used to resolve the selected item's PARENT layout. */
  readonly document: AgocraftDocument;
}

/** The parent `auto-flex` spec for `itemId`, or undefined when the item isn't
 *  a child of a flex frame. */
function parentFlexSpec(doc: AgocraftDocument, itemId: string): AutoFlexSpec | undefined {
  const found = findParentAndIndex(doc, itemId);
  if (found === undefined) return undefined;
  const layout = (found.parent.attrs as { layout?: LayoutSpec }).layout;
  return layout !== undefined && layout.kind === "auto-flex" ? layout : undefined;
}

export function FlexChildSection({ editor, items, document }: FlexChildSectionProps): JSX.Element | null {
  // Per-child layout is a single-item concern (each child has its own policy).
  if (items.length !== 1) return null;
  const item = items[0]!;
  const parentSpec = parentFlexSpec(document, item.id);
  if (parentSpec === undefined) return null;

  const policy = (item.attrs as { layoutChild?: LayoutChildPolicy }).layoutChild;
  const flexPolicy = policy !== undefined && policy.kind === "auto-flex" ? policy : undefined;
  const grow: GrowChoice = (flexPolicy?.grow ?? 0) > 0 ? "fill" : "fixed";
  // Displayed cross alignment: the child's own alignSelf, else the frame's align.
  const alignSelf: FlexAlign = flexPolicy?.alignSelf ?? parentSpec.align;

  const frame = (item.attrs as { frame?: { width: number; height: number } }).frame;
  const mainIsWidth = parentSpec.direction === "row";
  const currentMain = frame !== undefined ? (mainIsWidth ? frame.width : frame.height) : 0;

  /** Rebuild the policy from the current one with `overrides` applied, then
   *  dispatch through the command (which reflows the parent). */
  const apply = (overrides: Partial<Omit<AutoFlexChildPolicy, "kind">>) => {
    // Carry the current policy forward (omitting undefined optionals — strict
    // exactOptionalPropertyTypes), then apply the changed field(s).
    const base: Partial<Omit<AutoFlexChildPolicy, "kind">> =
      flexPolicy !== undefined
        ? {
            grow: flexPolicy.grow,
            shrink: flexPolicy.shrink,
            basis: flexPolicy.basis,
            ...(flexPolicy.alignSelf !== undefined ? { alignSelf: flexPolicy.alignSelf } : {}),
            // Preserve the intrinsic cross size across grow / align-self edits
            // so the child's own size survives (reversible).
            ...(flexPolicy.crossSize !== undefined ? { crossSize: flexPolicy.crossSize } : {}),
          }
        : {};
    const next = createAutoFlexChildPolicy({ ...base, ...overrides });
    editor.exec("weave.item.setLayoutChild", { itemId: item.id, policy: next });
  };

  // Rendered INLINE (not in a second More popover — that would add a confusing
  // second "더보기" trigger). Always visible while a flex child is selected.
  return (
    <div
      role="group"
      aria-label="Flex child layout"
      data-testid="flex-child-controls"
      className="inline-flex items-end gap-2 ml-1 pl-2 border-l border-l-[color:var(--surface-overlay-border)]"
    >
      <Bar.Field label={mainIsWidth ? "Width" : "Height"}>
        <SegmentedControl<GrowChoice>
          value={grow}
          onValueChange={(v) =>
            // Fixed → keep the current main size as an explicit basis (so it
            // doesn't collapse); Fill → grow to take the remaining space.
            v === "fill" ? apply({ grow: 1, basis: 0 }) : apply({ grow: 0, basis: currentMain })
          }
          options={GROW_OPTIONS}
          aria-label="Flex child grow"
        />
      </Bar.Field>
      <Bar.Field label="Align self">
        <SegmentedControl<FlexAlign>
          value={alignSelf}
          onValueChange={(v) => apply({ alignSelf: v })}
          options={ALIGN_SELF_OPTIONS}
          aria-label="Flex child align-self"
        />
      </Bar.Field>
    </div>
  );
}
