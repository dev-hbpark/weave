// ContextualToolbar — selection-driven bar with one section per DomainKind.
//
// This file is intentionally tiny: every kind's editor strip lives in its
// own file under `sections/` and is registered via `toolbarSectionRegistry`.
// Adding a new kind never touches this file — it adds `sections/<kind>-
// section.tsx` and one line in `sections/index.ts`. The toolbar resolves
// the section for the selected kind and renders it; it does not know
// which kinds exist.
//
// OS-root CODE_STRUCTURE_DESIGN_RULES Rule 6 — declarative branching via
// context dispatch. weave AUDIT-002 documents the 18-case `switch (firstKind)`
// this file replaced.
//
// Behaviour preserved from WI-020 Phase 5 + WI-021 Phase 11:
//   • selectedItems.length === 0 + design-background callbacks → "design"
//     variant (single Background picker for the canvas).
//   • Single kind selection (1+ items, all same kind) → kind's section
//     with Mixed-aware controls when multi.
//   • Mixed-kind selection (2+ items, different kinds) → no bar.

import { ColorPicker, ContextualToolbar as Bar } from "@weave/design-system";
import type { Editor } from "@agocraft/editor";
import type { JSX } from "react";
import type { ItemSnapshot } from "./multi-edit.js";
import { toolbarSectionRegistry } from "./sections/index.js";

interface ContextualToolbarProps {
  readonly editor: Editor;
  /** Selected items. Length 0 + `designBackground` set → "design" variant
   *  with a single Background picker for the canvas. Length 1 → single-
   *  select section. Length ≥ 2 with all same kind → multi-select section
   *  with mixed indicators on diverging props. Length ≥ 2 with mixed kinds
   *  → no bar. */
  readonly selectedItems: ReadonlyArray<ItemSnapshot>;
  /** Open the host's MediaSrcDialog pre-filled with the current src for the
   *  selected image / video. Host owns the dialog (DesignPage). */
  readonly onEditMediaSrc?: (kind: "image" | "video", current: string) => void;
  /** Open the host's MediaSrcDialog to fill the selected shape with an
   *  image / video paint. Host owns dialog state + dispatch. */
  readonly onEditShapeFill?: (
    kind: "image" | "video",
    current: string,
  ) => void;
  /** When provided AND no items are selected, the toolbar mounts a single
   *  "Background" picker that edits the overall design background. */
  readonly designBackground?: string;
  readonly onChangeDesignBackground?: (color: string) => void;
}

export function ContextualToolbar({
  editor,
  selectedItems,
  onEditMediaSrc,
  onEditShapeFill,
  designBackground,
  onChangeDesignBackground,
}: ContextualToolbarProps): JSX.Element | null {
  // No selection — render the "design" variant (overall canvas background)
  // when the host wires the design-background callbacks. Otherwise hide.
  if (selectedItems.length === 0) {
    if (
      designBackground === undefined ||
      onChangeDesignBackground === undefined
    ) {
      return null;
    }
    return (
      <Bar
        aria-label="Design properties"
        data-testid="contextual-toolbar"
        data-kind="design"
      >
        <Bar.Section label="Background">
          <ColorPicker
            value={designBackground}
            onValueCommit={(v) => onChangeDesignBackground(v)}
            onValueChange={() => { /* commit-only */ }}
          />
        </Bar.Section>
      </Bar>
    );
  }

  // Same-kind only — multi-selection of mixed kinds hides the bar.
  const firstKind = selectedItems[0]!.kind;
  for (const it of selectedItems) {
    if (it.kind !== firstKind) return null;
  }

  const section = toolbarSectionRegistry.resolve(firstKind);
  if (section === undefined) return null;

  const ids = selectedItems.map((it) => it.id);
  const multi = selectedItems.length > 1;

  return (
    <Bar
      aria-label={`${firstKind} properties${multi ? ` (${selectedItems.length})` : ""}`}
      data-testid="contextual-toolbar"
      data-kind={firstKind}
      data-multi={multi ? "true" : undefined}
      data-count={selectedItems.length}
    >
      <section.Component
        editor={editor}
        items={selectedItems}
        ids={ids}
        multi={multi}
        onEditMediaSrc={onEditMediaSrc}
        onEditShapeFill={onEditShapeFill}
      />
    </Bar>
  );
}
