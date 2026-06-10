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
// P1 wired only `canvas` (reproducing the prior `infiniteCanvas` boolean with zero
// behavior change). P3 added `defaultContainer` (adds land in the active page when
// nothing is selected — DR-111 D5). The page-box CLIP and the soft min-overlap CLAMP
// (D5/D6) deliberately do NOT get their own fields: they are consequences of
// page-scoped rendering, keyed in FrameStage off `visibleFrameIds !== undefined`
// (the same key the page matte uses) — a separate boolean would be dead config that
// must always agree with `canvas: "page-bounded"`.

import type { DocFlavor } from "./types.js";

export interface FormatEditorConfig {
  /** "infinite" = Figma-style free-placement pannable surface (two-finger pan + user
   *  zoom). "page-bounded" = Canva-style one-page-at-a-time editing (P2+). */
  readonly canvas: "infinite" | "page-bounded";
  /** Where an add lands when nothing (or a non-frame item) is selected. "root" =
   *  design root (infinite canvas); "active-page" = the page currently shown
   *  (page-bounded — DR-111 D5: page membership is enforced, root is chrome). */
  readonly defaultContainer: "root" | "active-page";
}

const INFINITE: FormatEditorConfig = { canvas: "infinite", defaultContainer: "root" };
const PAGE_BOUNDED: FormatEditorConfig = {
  canvas: "page-bounded",
  defaultContainer: "active-page",
};

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
