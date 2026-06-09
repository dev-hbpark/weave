// WI-153 / DR-111 — per-format editor behavior registry.
//
// The single seam the editor branches on for a design's format (root.attrs.flavor),
// replacing scattered `flavor === ...` inline checks (Rule 6 — one config per format,
// the caller reads policy from the registry instead of comparing discriminants).
//
// This is EDITOR BEHAVIOR — kept separate from `FLAVOR_REGISTRY` (types.ts), which is
// wizard marketing copy / iconography. mixed + canvas-board are free-placement infinite
// canvases (Figma-style); slide-deck + doc-page are page-bounded (Canva-style, one page
// at a time — DR-111 D3).
//
// P1 wires only `canvas` (reproducing the prior `infiniteCanvas` boolean with zero
// behavior change). The page-bounded fields (default container, clip, soft clamp, page
// navigator, agent-root-add) land in P2–P5 per features/presentation-page-editing/.

import type { DocFlavor } from "./types.js";

export interface FormatEditorConfig {
  /** "infinite" = Figma-style free-placement pannable surface (two-finger pan + user
   *  zoom). "page-bounded" = Canva-style one-page-at-a-time editing (P2+). */
  readonly canvas: "infinite" | "page-bounded";
}

const INFINITE: FormatEditorConfig = { canvas: "infinite" };
const PAGE_BOUNDED: FormatEditorConfig = { canvas: "page-bounded" };

/** flavor → editor policy. New flavors MUST be added here (exhaustive Record). */
export const FORMAT_EDITOR_CONFIG: Readonly<Record<DocFlavor, FormatEditorConfig>> = {
  mixed: INFINITE,
  "canvas-board": INFINITE,
  "slide-deck": PAGE_BOUNDED,
  "doc-page": PAGE_BOUNDED,
};

/** Resolve the editor config for a (possibly undefined/legacy) flavor; defaults to the
 *  infinite `mixed` policy so an unknown flavor never breaks the editor. */
export function formatEditorConfig(flavor: DocFlavor | undefined): FormatEditorConfig {
  return (flavor !== undefined && FORMAT_EDITOR_CONFIG[flavor]) || FORMAT_EDITOR_CONFIG.mixed;
}
