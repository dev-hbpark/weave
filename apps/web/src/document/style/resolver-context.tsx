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
import { findItemDeep } from "../agocraft-mirror.js";
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

/** The design plane's intrinsic pixel size (design-space, NOT viewport).
 *  Toolbar sections that convert between design-px and parent-relative
 *  ratios (e.g. the text px/% font-size toggle) need this to match the
 *  renderer, which scales every ratio by the design dimensions down the
 *  frame tree. The design size is a per-document canvas preset (16:9,
 *  A4, square, …) — NOT the fixed editor coordSystem — so it must come
 *  from the live `design` object, not `editor.coordSystem`. */
export interface DesignDims {
  readonly width: number;
  readonly height: number;
}

const DesignDimsContext = createContext<DesignDims | null>(null);

export function DesignDimsProvider({
  width,
  height,
  children,
}: {
  readonly width: number;
  readonly height: number;
  readonly children: ReactNode;
}) {
  return (
    <DesignDimsContext.Provider value={{ width, height }}>{children}</DesignDimsContext.Provider>
  );
}

/** The live design plane's design-space size, or `null` when mounted
 *  outside DesignPage (standalone tests / preview hosts). */
export function useDesignDims(): DesignDims | null {
  return useContext(DesignDimsContext);
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

/** Toolbar-section variant — takes the item's id (from an `ItemSnapshot`,
 *  which doesn't carry a reference to the agocraft Item in the doc tree)
 *  and looks the actual item up before walking the cascade. Falls back to
 *  the raw value or `fallback` when the doc context is absent or the id
 *  can no longer be found in the tree (e.g., mid-delete). */
export function useResolveColorById(
  value: unknown,
  itemId: string,
  fallback?: string,
): string | undefined {
  const doc = useContext(DocumentForResolutionContext);
  if (doc === null) {
    return typeof value === "string" ? value : fallback;
  }
  const item = findItemDeep(doc, itemId);
  if (item === undefined) {
    return typeof value === "string" ? value : fallback;
  }
  return resolveStoredColor(doc, value, item, fallback);
}

/** Direct accessor — sections that read multiple items in one pass (e.g.,
 *  via `sharedValue`) can call this once at the top and resolve per-item
 *  inside the read callback without violating the hooks rule. Returns
 *  `null` when no provider is mounted (tests / standalone). */
export function useDocumentForResolution(): AgocraftDocument | null {
  return useContext(DocumentForResolutionContext);
}
