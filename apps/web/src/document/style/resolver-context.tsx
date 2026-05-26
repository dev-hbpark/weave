// WI-040 — React context bridge for the agocraft StyleResolver cascade.
//
// Renderers deep in the tree (FrameBlock, future TextBlock color reads, …)
// need to resolve `StyleRef` values against the document's `style.provider`
// Units. The cascade walker `resolveStoredColor` takes (doc, value, fromItem)
// — the renderer already has `item`, so we expose `doc` via context plus a
// thin hook that closes over both.
//
// `useResolveColor` is the only consumer-facing API. When the context is
// absent (standalone tests, mounted outside DesignPage), it gracefully
// degrades to returning the raw string or the fallback.

import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import { createContext, type ReactNode, useContext } from "react";
import { resolveStoredColor } from "./resolver.js";

const DocumentForResolutionContext = createContext<AgocraftDocument | null>(null);

export function DocumentForResolutionProvider({
  document,
  children,
}: {
  readonly document: AgocraftDocument;
  readonly children: ReactNode;
}) {
  return (
    <DocumentForResolutionContext.Provider value={document}>
      {children}
    </DocumentForResolutionContext.Provider>
  );
}

/** Resolve a stored color (CSS string OR `StyleRef`) into a CSS string the
 *  renderer can apply. When `value` is a `StyleRef`, walks the cascade from
 *  `fromItem` upward through ancestor `style.provider` Units; without a
 *  hosting provider context, falls back to the raw value or `fallback`.
 *
 *  Pass the item the color belongs to as `fromItem` so per-slide / per-
 *  frame `style.provider` overrides can intercept the lookup. */
export function useResolveColor(
  value: unknown,
  fromItem: AgocraftItem,
  fallback?: string,
): string | undefined {
  const doc = useContext(DocumentForResolutionContext);
  if (doc === null) {
    return typeof value === "string" ? value : fallback;
  }
  return resolveStoredColor(doc, value, fromItem, fallback);
}
