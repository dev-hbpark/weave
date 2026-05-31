// V-11 (AUDIT-005) — per-behavior-kind row registry. Replaces the 5-branch
// `if (behavior.kind === "…")` chain that used to live inline in
// `PropertiesPanel.InteractionRow`. Each interaction behavior kind owns its
// editor row in its own module under this folder; the registry (built once in
// `./index.ts`) resolves `behavior.kind → renderer`. Adding a new editable
// behavior kind = drop a `<kind>.tsx` row + one line in the barrel — no edit
// to PropertiesPanel.
//
// Rule 6 (CODE_STRUCTURE_DESIGN_RULES § Declarative branching): the caller
// declares intent (`getInteractionRow(behavior.kind)`) and the registry
// resolves the adapter. The single `as` cast at the registration boundary is
// sound because the map key IS the discriminant — it is not an in-body branch.

import type { ReactElement } from "react";
import type { InteractionBehavior } from "../../document";

/** Mirror of `PropertiesPanelProps["onCommitBehavior"]` — committing a behavior
 *  edit routes through History via the weave command (see CLAUDE.md § Document
 *  mutation rule). The updater receives the union and re-narrows by kind. */
export type CommitBehavior = (
  itemId: string,
  behaviorId: string,
  patch: (b: InteractionBehavior) => InteractionBehavior,
) => void;

export interface InteractionRowProps<B extends InteractionBehavior = InteractionBehavior> {
  readonly behavior: B;
  readonly itemId: string;
  /** The interaction Unit's id (the behavior payload lives on a unit). */
  readonly unitId: string;
  readonly onCommitBehavior: CommitBehavior;
}

export type InteractionRowRenderer = (props: InteractionRowProps) => ReactElement;

const ROWS = new Map<string, InteractionRowRenderer>();

/** Register a kind-specific editor row. Called once per kind from `./index.ts`.
 *  `renderer` is typed against the narrowed behavior; the boundary cast is safe
 *  because lookup is keyed by the same discriminant. */
export function registerInteractionRow<B extends InteractionBehavior>(
  kind: B["kind"],
  renderer: (props: InteractionRowProps<B>) => ReactElement,
): void {
  ROWS.set(kind, renderer as InteractionRowRenderer);
}

/** Resolve the editor row for a behavior kind, or `undefined` when the kind has
 *  no dedicated editor (callers fall back to a read-only label). */
export function getInteractionRow(kind: string): InteractionRowRenderer | undefined {
  return ROWS.get(kind);
}
