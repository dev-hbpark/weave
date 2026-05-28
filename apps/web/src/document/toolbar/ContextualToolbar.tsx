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
// Behaviour:
//   • Selection 비어 있음        → bar mount X. design.background 편집은
//     header 우 cluster 의 ColorPicker 가 담당 (file-level chrome).
//   • Single kind selection (1+ items, all same kind) → kind's section
//     with Mixed-aware controls when multi.
//   • Mixed-kind selection (2+ items, different kinds) → no bar.

import type { Document as AgocraftDocument } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import { ContextualToolbar as Bar } from "@weave/design-system";
import type { JSX } from "react";
import type { ItemSnapshot } from "./multi-edit.js";
import { FlexChildSection } from "./sections/flex-child-section.js";
import { toolbarSectionRegistry } from "./sections/index.js";

interface ContextualToolbarProps {
  readonly editor: Editor;
  /** Selected items. Length 0 → bar hidden (design.background lives in the
   *  header). Length 1 → single-select section. Length ≥ 2 with all same
   *  kind → multi-select section with mixed indicators on diverging props.
   *  Length ≥ 2 with mixed kinds → no bar. */
  readonly selectedItems: ReadonlyArray<ItemSnapshot>;
  /** Live document — used by the per-child flex controls to resolve a
   *  selected item's PARENT layout. */
  readonly document: AgocraftDocument;
  /** Open the host's MediaSrcDialog pre-filled with the current src for the
   *  selected image / video. Host owns the dialog (DesignPage). */
  readonly onEditMediaSrc?: (kind: "image" | "video", current: string) => void;
  /** Open the host's MediaSrcDialog to fill the selected shape with an
   *  image / video paint. Host owns dialog state + dispatch. */
  readonly onEditShapeFill?: (kind: "image" | "video", current: string) => void;
}

export function ContextualToolbar({
  editor,
  selectedItems,
  document,
  onEditMediaSrc,
  onEditShapeFill,
}: ContextualToolbarProps): JSX.Element | null {
  // No selection — bar stays unmounted. Design background editing moved to
  // the header's right cluster (file-level chrome).
  if (selectedItems.length === 0) return null;

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
      {/* Cross-kind per-child layout controls — shown only when the single
          selected item is a child of an auto-flex frame. Renders nothing
          otherwise (any kind, any non-flex parent). */}
      <FlexChildSection editor={editor} items={selectedItems} document={document} />
    </Bar>
  );
}
