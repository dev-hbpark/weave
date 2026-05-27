// WI-033 A4 — Layer Picker app-local composition.
//
// Right-click on a frame opens the editor's ContextMenu. When the
// cursor sits over overlapping nested frames, the menu's first section
// is a "Select layer" list, deepest-first; the user clicks to move the
// selection to that exact layer. The rest of the menu (Delete,
// Duplicate / Move future) follows below a separator.
//
// This component is an *app-local composition*, NOT a design-system
// primitive — DR-design-011 §2 explicitly settles that growing
// LayerPickerMenu into `@weave/design-system` would race the
// ContextMenu primitive's contract (variant explosion). It consumes
// public design-system exports (ContextMenuLabel + ContextMenuGroup +
// ContextMenuItem with `tagline` / `icon` slots) added by DR-design-011.

import { ContextMenuGroup, ContextMenuItem, ContextMenuLabel } from "@weave/design-system";
import type { ReactNode } from "react";
import type { LayerHit } from "./hit-test.js";

export interface LayerPickerMenuProps {
  /** Frames covering the right-clicked point, deepest-first. The
   *  section is elided when there are fewer than 2 layers — a list
   *  of one (the frame the user already right-clicked) is pure noise.
   *  Figma elides on the same condition. */
  readonly layers: ReadonlyArray<LayerHit>;
  /** Called when the user clicks a layer row. Implementation routes to
   *  `selectionContext.selectFrame(id)` — selection state only, not a
   *  document mutation (so no `editor.exec` needed, per Engineering
   *  Plan §7). */
  readonly onPickLayer: (id: string) => void;
  /** Optional hover preview — fired with the hovered layer id while
   *  the menu is open, or null on row leave / menu close. Host wires
   *  this to a transient outline highlight on the FrameStage so the
   *  user can see which frame each row maps to. No-op when undefined. */
  readonly onHoverPreview?: (id: string | null) => void;
}

function LayerSwatch({ depth }: { readonly depth: number }) {
  // Tiny visual cue — the deeper the nesting, the smaller the inset.
  // Aria-hidden because the row label already carries depth context.
  const inset = Math.min(depth, 3) * 2;
  return (
    <span
      aria-hidden
      className="relative inline-block w-3 h-3 rounded-[2px] border border-[color:var(--text-overlay-soft)]"
      style={{
        boxShadow: `inset 0 0 0 ${inset}px var(--surface-overlay-2)`,
      }}
    />
  );
}

function sizeTagline(hit: LayerHit): string {
  return `${hit.widthPx} × ${hit.heightPx}`;
}

export function LayerPickerMenu({
  layers,
  onPickLayer,
  onHoverPreview,
}: LayerPickerMenuProps): ReactNode {
  if (layers.length < 2) return null;
  return (
    <>
      <ContextMenuLabel>Select layer</ContextMenuLabel>
      <ContextMenuGroup aria-label="Select layer">
        {layers.map((hit) => (
          <ContextMenuItem
            key={hit.id}
            icon={<LayerSwatch depth={hit.depth} />}
            tagline={sizeTagline(hit)}
            onSelect={() => onPickLayer(hit.id)}
            onMouseEnter={onHoverPreview === undefined ? undefined : () => onHoverPreview(hit.id)}
            onMouseLeave={onHoverPreview === undefined ? undefined : () => onHoverPreview(null)}
            data-testid={`layer-pick-${hit.id}`}
          >
            {hit.label}
          </ContextMenuItem>
        ))}
      </ContextMenuGroup>
    </>
  );
}
