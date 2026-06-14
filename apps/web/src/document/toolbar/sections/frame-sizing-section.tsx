// WI-042 / DR-055 — per-CONTAINER sizing controls (Fixed / Hug).
//
// Shown for a single selected frame that HAS an `auto-flex` layout. Lets the
// user set the container's OWN size behavior per axis:
//   • Fixed — the frame keeps its explicit size; children lay out inside it.
//   • Hug   — the frame shrinks/grows to fit its children (Figma "hug contents").
//
// Writes `attrs.layout.sizing` via `weave.frame.setSizing`, which the engine
// reads on a child resize (`reflowHugOnResize`) to grow the container upward.
//
// Scope note (DR-055 P3 ①): FILL is intentionally NOT offered here. A frame
// FILLS its parent via the per-CHILD grow control (FlexChildSection's
// "Width/Height: Fill" → `layoutChild.grow`), which already works through the
// parent's flex layout. A container-level `sizing: "fill"` only takes effect
// inside a Hug reflow today (the fill basis/grow bridge is ② follow-up), so
// exposing it here would be a mostly-no-op duplicate of the working Grow
// control. The unified Figma 3-way (dual-routing Hug→layout.sizing /
// Fill→layoutChild) waits on the ② bridge.
//
// This is a cross-kind, single-item layout surface (mirrors FlexChildSection),
// rendered by ContextualToolbar — not a kind section.

import {
  type Document as AgocraftDocument,
  type AutoFlexSpec,
  type AxisSizing,
  type AxisSizingPair,
  DEFAULT_AXIS_SIZING,
  type LayoutSpec,
} from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import { ContextualToolbar as Bar, SegmentedControl } from "@weave/design-system";
import type { JSX } from "react";
import { nn } from "../../../lib/nn.js";
import { findItemDeep } from "../../agocraft-mirror.js";
import type { ItemSnapshot } from "../multi-edit.js";

// Only Fixed / Hug here (see file header — Fill is the per-child Grow control).
type ContainerSizing = Extract<AxisSizing, "fixed" | "hug">;

const FIXED_ONLY: ReadonlyArray<{ value: ContainerSizing; label: string }> = [
  { value: "fixed", label: "고정" },
];
const FIXED_HUG: ReadonlyArray<{ value: ContainerSizing; label: string }> = [
  { value: "fixed", label: "고정" },
  { value: "hug", label: "내용맞춤" },
];

interface FrameSizingSectionProps {
  readonly editor: Editor;
  readonly items: ReadonlyArray<ItemSnapshot>;
  /** Live document — needed to read the frame's children count (Hug needs ≥1). */
  readonly document: AgocraftDocument;
}

export function FrameSizingSection({
  editor,
  items,
  document,
}: FrameSizingSectionProps): JSX.Element | null {
  // Container sizing is a single-frame concern.
  if (items.length !== 1) return null;
  const item = nn(items[0]);
  const layout = (item.attrs as { layout?: LayoutSpec }).layout;
  // Hug is an auto-flex capability (grid container sizing = P4).
  if (layout === undefined || layout.kind !== "auto-flex") return null;

  // Children gate the Hug option — an empty container can't hug (and the command
  // rejects it). Read from the live doc (ItemSnapshot may not carry children).
  const live = findItemDeep(document, item.id);
  const hasChildren = live !== undefined && live.children.length > 0;
  const options = hasChildren ? FIXED_HUG : FIXED_ONLY;

  const sizing: AxisSizingPair = (layout as AutoFlexSpec).sizing ?? DEFAULT_AXIS_SIZING;
  // Display value, clamped to a selectable option (a stale "hug" with 0 children
  // would otherwise show no selection).
  const shown = (axis: AxisSizing): ContainerSizing =>
    axis === "hug" && hasChildren ? "hug" : "fixed";

  // Apply a single-axis change. The command takes the full pair, so carry the
  // OTHER axis forward — defensively clamping a stale "hug" to "fixed" when the
  // container has no children (else the command rejects the whole pair).
  const apply = (axis: "width" | "height", next: ContainerSizing) => {
    const safe = (v: AxisSizing): AxisSizing => (v === "hug" && !hasChildren ? "fixed" : v);
    const pair: AxisSizingPair = {
      width: axis === "width" ? next : safe(sizing.width),
      height: axis === "height" ? next : safe(sizing.height),
    };
    editor.exec("weave.frame.setSizing", { itemId: item.id, sizing: pair });
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: intentional non-semantic element for this composite/overlay surface
    <div
      role="group"
      aria-label="Frame sizing"
      data-testid="frame-sizing-controls"
      className="inline-flex items-end gap-2 ml-1 pl-2 border-l border-l-[color:var(--surface-overlay-border)]"
    >
      <Bar.Field label="너비">
        <SegmentedControl<ContainerSizing>
          value={shown(sizing.width)}
          onValueChange={(v) => apply("width", v)}
          options={options}
          aria-label="Container width sizing"
        />
      </Bar.Field>
      <Bar.Field label="높이">
        <SegmentedControl<ContainerSizing>
          value={shown(sizing.height)}
          onValueChange={(v) => apply("height", v)}
          options={options}
          aria-label="Container height sizing"
        />
      </Bar.Field>
    </div>
  );
}
