// ToolbarSection — one adapter per DomainKind that renders the
// kind's editor strip inside the ContextualToolbar. The toolbar itself
// is variant-free: it resolves the section for the selected kind via the
// registry and delegates rendering. Adding a new kind = a new section
// file + one bootstrap line. The toolbar is NOT edited.
//
// OS-root CODE_STRUCTURE_DESIGN_RULES Rule 6 (Declarative branching via
// context dispatch).

import type { Editor } from "@agocraft/editor";
import type { JSX } from "react";
import type { ItemSnapshot } from "../multi-edit.js";

export interface ToolbarSectionProps {
  readonly editor: Editor;
  /** Selected items of the SAME kind. Mixed-kind selections do not reach
   *  any section (the toolbar hides itself before dispatching). */
  readonly items: ReadonlyArray<ItemSnapshot>;
  /** Flattened item ids (cached for `updateAll` calls). */
  readonly ids: ReadonlyArray<string>;
  /** True when more than one item is selected. Sections use this to
   *  show Mixed badges + Mixed-aware default values for controls. */
  readonly multi: boolean;
  /** Image / video sections only. */
  readonly onEditMediaSrc: ((kind: "image" | "video", current: string) => void) | undefined;
  /** Shape section only — open the dialog with shape-fill semantics. */
  readonly onEditShapeFill: ((kind: "image" | "video", current: string) => void) | undefined;
}

export type ToolbarSectionComponent = (props: ToolbarSectionProps) => JSX.Element | null;

export interface ToolbarSection {
  readonly Component: ToolbarSectionComponent;
}

export interface ToolbarSectionRegistry {
  register(kind: string, section: ToolbarSection): () => void;
  resolve(kind: string): ToolbarSection | undefined;
  list(): ReadonlyArray<{ readonly kind: string; readonly section: ToolbarSection }>;
}

export function createToolbarSectionRegistry(): ToolbarSectionRegistry {
  const byKind = new Map<string, ToolbarSection>();
  return {
    register(kind, section) {
      byKind.set(kind, section);
      return () => {
        if (byKind.get(kind) === section) byKind.delete(kind);
      };
    },
    resolve(kind) {
      return byKind.get(kind);
    },
    list() {
      return Array.from(byKind, ([kind, section]) => ({ kind, section }));
    },
  };
}
