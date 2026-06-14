// WI-042 / DR-055 — unified per-axis sizing control (Fixed / Hug / Fill).
//
// Shown for a single selected frame that HAS an `auto-flex` layout. One control
// per axis, mirroring Figma's width/height resizing modes:
//   • Fixed — the frame keeps its explicit size.
//   • Hug   — the frame shrinks/grows to fit its children ("hug contents").
//             Available only with ≥1 child (an empty container can't hug).
//   • Fill  — the frame fills its parent on that axis. Available only when the
//             parent is itself auto-flex (Figma: Fill needs an auto-layout
//             parent).
//
// DUAL ROUTING — the two modes write to two different homes, batched into ONE
// undoable transaction (`weave.batch`):
//   • Hug / Fixed → the frame's OWN `layout.sizing` (`weave.frame.setSizing`),
//     read by the Hug reflow (`reflowHugOnResize`).
//   • Fill        → the frame's child-role in its parent
//     (`weave.item.setLayoutChild`): grow=1 on the parent's MAIN axis, or
//     alignSelf="stretch" on the CROSS axis — the same policy the engine's flex
//     arrange already honors. Picking Fill also sets that axis's own sizing to
//     Fixed (a filling frame isn't hugging).
//
// The per-child grow control (FlexChildSection) is suppressed for auto-flex
// frames (this control owns their sizing); FlexChildSection keeps align-self and
// still owns sizing for NON-frame children (which have no Hug).
//
// This is a single-item layout surface (mirrors FlexChildSection), rendered by
// ContextualToolbar — not a kind section.

import {
  type Document as AgocraftDocument,
  type AutoFlexChildPolicy,
  type AutoFlexSpec,
  type AxisSizing,
  type AxisSizingPair,
  createAutoFlexChildPolicy,
  DEFAULT_AXIS_SIZING,
  type FlexAlign,
  type LayoutChildPolicy,
  type LayoutSpec,
} from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import { ContextualToolbar as Bar, Select } from "@weave/design-system";
import type { JSX } from "react";
import { nn } from "../../../lib/nn.js";
import { findItemDeep, findParentAndIndex } from "../../agocraft-mirror.js";
import { useDesignDims } from "../../style/resolver-context.js";
import type { ItemSnapshot } from "../multi-edit.js";

type Sizing3 = AxisSizing; // "fixed" | "hug" | "fill"

const LABELS: Record<Sizing3, string> = { fixed: "고정", hug: "내용맞춤", fill: "채움" };
const opt = (v: Sizing3) => ({ value: v, label: LABELS[v] });

interface FrameSizingSectionProps {
  readonly editor: Editor;
  readonly items: ReadonlyArray<ItemSnapshot>;
  /** Live document — child count (Hug needs ≥1) + parent layout (Fill needs an
   *  auto-flex parent). */
  readonly document: AgocraftDocument;
}

/** The parent's auto-flex spec, or undefined when the parent isn't a flex frame. */
function parentFlexOf(doc: AgocraftDocument, itemId: string): AutoFlexSpec | undefined {
  const found = findParentAndIndex(doc, itemId);
  if (found === undefined) return undefined;
  const layout = (found.parent.attrs as { layout?: LayoutSpec }).layout;
  return layout !== undefined && layout.kind === "auto-flex" ? layout : undefined;
}

/** The parent CONTAINER's own per-axis sizing (auto-flex / auto-grid), or
 *  undefined when the parent isn't a sizing container. Used to suppress **Fill**
 *  on an axis the parent **Hugs** (DR-058 / WI-045 — Figma parity: Fill is
 *  unavailable on a hugged axis; authoring it produced a 0px disappearing
 *  child). */
function parentSizingOf(doc: AgocraftDocument, itemId: string): AxisSizingPair | undefined {
  const found = findParentAndIndex(doc, itemId);
  if (found === undefined) return undefined;
  const layout = (found.parent.attrs as { layout?: LayoutSpec }).layout;
  if (layout === undefined || (layout.kind !== "auto-flex" && layout.kind !== "auto-grid")) {
    return undefined;
  }
  return (layout as { sizing?: AxisSizingPair }).sizing ?? DEFAULT_AXIS_SIZING;
}

export function FrameSizingSection({
  editor,
  items,
  document,
}: FrameSizingSectionProps): JSX.Element | null {
  // WI-047 — design dims → EXACT re-fit on a sizing change (must precede the
  // early returns: Rules of Hooks).
  const dims = useDesignDims();
  // Sizing is a single-frame concern.
  if (items.length !== 1) return null;
  const item = nn(items[0]);
  const layout = (item.attrs as { layout?: LayoutSpec }).layout;
  // WI-042 P4 — Hug applies to auto-flex AND auto-grid containers (a Hug grid
  // sizes its tracks to cell content). Other kinds have no container sizing.
  if (layout === undefined || (layout.kind !== "auto-flex" && layout.kind !== "auto-grid")) {
    return null;
  }

  const live = findItemDeep(document, item.id);
  const hasChildren = live !== undefined && live.children.length > 0;
  const parentFlex = parentFlexOf(document, item.id);
  const parentSizing = parentSizingOf(document, item.id);

  // DR-058 — Fill on an axis the PARENT Hugs is contradictory (it produced a
  // 0px disappearing frame, WI-045). Figma disables Fill there; we omit the
  // option so it can't be authored. The engine also demotes any such legacy
  // state to content, so a frame still filling a now-hugged axis shows Fixed.
  const parentHugsAxis = (axis: "width" | "height"): boolean =>
    parentSizing !== undefined && parentSizing[axis] === "hug";

  // Available options per axis: Fixed always; Hug with children; Fill with a
  // flex parent that does NOT Hug that axis.
  const optionsFor = (axis: "width" | "height"): ReadonlyArray<{ value: Sizing3; label: string }> => [
    opt("fixed"),
    ...(hasChildren ? [opt("hug")] : []),
    ...(parentFlex !== undefined && !parentHugsAxis(axis) ? [opt("fill")] : []),
  ];

  const ownSizing: AxisSizingPair =
    (layout as { sizing?: AxisSizingPair }).sizing ?? DEFAULT_AXIS_SIZING;
  const policy = (item.attrs as { layoutChild?: LayoutChildPolicy }).layoutChild;
  const flexPolicy = policy !== undefined && policy.kind === "auto-flex" ? policy : undefined;
  const grow = flexPolicy?.grow ?? 0;
  const alignSelf: FlexAlign = flexPolicy?.alignSelf ?? parentFlex?.align ?? "start";

  const axisIsMain = (axis: "width" | "height"): boolean =>
    parentFlex !== undefined && (axis === "width") === (parentFlex.direction === "row");

  /** Whether the frame currently FILLS its parent on `axis` (child-role truth:
   *  grow on the main axis, stretch on the cross). */
  const isFill = (axis: "width" | "height"): boolean => {
    if (parentFlex === undefined) return false;
    return axisIsMain(axis) ? grow > 0 : alignSelf === "stretch";
  };

  /** Display value — Fill (child-role) wins, UNLESS the parent Hugs that axis
   *  (then Fill isn't offered and the engine demotes it → show Fixed); else own
   *  Hug (with children); else Fixed. Clamped to a selectable option. */
  const axisValue = (axis: "width" | "height"): Sizing3 => {
    if (isFill(axis) && !parentHugsAxis(axis)) return "fill";
    return ownSizing[axis] === "hug" && hasChildren ? "hug" : "fixed";
  };

  const apply = (axis: "width" | "height", choice: Sizing3) => {
    // ── 1. own sizing pair: Hug → hug; Fixed/Fill → fixed on that axis. Carry
    // the OTHER axis's own sizing forward, clamping a stale hug (no children).
    const ownFor = (c: Sizing3): AxisSizing => (c === "hug" ? "hug" : "fixed");
    const safe = (v: AxisSizing): AxisSizing => (v === "hug" && !hasChildren ? "fixed" : v);
    const pair: AxisSizingPair = {
      width: axis === "width" ? ownFor(choice) : safe(ownSizing.width),
      height: axis === "height" ? ownFor(choice) : safe(ownSizing.height),
    };

    const ops: Array<{ command: string; input: unknown }> = [
      { command: "weave.frame.setSizing", input: { itemId: item.id, sizing: pair } },
    ];

    // ── 2. child-role fill (only meaningful with a flex parent). MAIN axis →
    // grow; CROSS axis → alignSelf stretch. Preserve the rest of the policy.
    if (parentFlex !== undefined) {
      const main = axisIsMain(axis);
      const nextGrow = main ? (choice === "fill" ? 1 : 0) : grow;
      let nextAlignSelf = flexPolicy?.alignSelf;
      if (!main) {
        if (choice === "fill") nextAlignSelf = "stretch";
        else if (alignSelf === "stretch") nextAlignSelf = "start"; // leaving cross-fill
      }
      const base: Partial<Omit<AutoFlexChildPolicy, "kind">> =
        flexPolicy !== undefined
          ? {
              grow: flexPolicy.grow,
              shrink: flexPolicy.shrink,
              basis: flexPolicy.basis,
              ...(flexPolicy.crossSize !== undefined ? { crossSize: flexPolicy.crossSize } : {}),
              ...(flexPolicy.sizePx !== undefined ? { sizePx: flexPolicy.sizePx } : {}),
            }
          : {};
      const next = createAutoFlexChildPolicy({
        ...base,
        grow: nextGrow,
        ...(nextAlignSelf !== undefined ? { alignSelf: nextAlignSelf } : {}),
      });
      ops.push({ command: "weave.item.setLayoutChild", input: { itemId: item.id, policy: next } });
    }

    // One transaction → one undo. A single op (no flex parent) dispatches direct.
    if (ops.length === 1) {
      const only = nn(ops[0]);
      editor.exec(only.command, only.input);
    } else {
      editor.exec("weave.batch", { ops });
    }
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
        <Select<Sizing3>
          value={axisValue("width")}
          onValueChange={(v) => apply("width", v)}
          options={optionsFor("width")}
          aria-label="Container width sizing"
          data-testid="frame-sizing-width"
        />
      </Bar.Field>
      <Bar.Field label="높이">
        <Select<Sizing3>
          value={axisValue("height")}
          onValueChange={(v) => apply("height", v)}
          options={optionsFor("height")}
          aria-label="Container height sizing"
          data-testid="frame-sizing-height"
        />
      </Bar.Field>
    </div>
  );
}
