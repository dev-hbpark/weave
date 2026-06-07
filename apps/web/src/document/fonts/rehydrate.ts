// WI-136 — Document font rehydration.
//
// The static bulk Google Fonts `<link>` is gone; fonts load on demand. When a
// saved document is opened (or a remote copy replaces the local one), its text
// items may reference catalog fonts that were never loaded this session. This
// walks the tree once, collects every stored `fontFamily` value, and asks the
// loader to ensure each catalog font is present. Theme-role values
// (`var(--font-*)`) and unknown literals are ignored by the loader.

import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import { ensureFontsForValues } from "./font-loader.js";

function collect(item: AgocraftItem, out: Set<string>): void {
  const attrs = item.attrs as {
    fontFamily?: unknown;
    textRuns?: ReadonlyArray<{ fontFamily?: unknown }>;
  };
  if (typeof attrs.fontFamily === "string") out.add(attrs.fontFamily);
  // Per-range overrides (DR-057 textRuns) may carry their own fontFamily.
  if (Array.isArray(attrs.textRuns)) {
    for (const run of attrs.textRuns) {
      if (typeof run?.fontFamily === "string") out.add(run.fontFamily);
    }
  }
  for (const child of item.children) collect(child, out);
}

/** Load every catalog webfont referenced by `doc`'s items. Deduped + idempotent
 *  (the loader guards against double injection), so calling it again after a
 *  remote replace is cheap. */
export function rehydrateDocumentFonts(doc: AgocraftDocument): void {
  const out = new Set<string>();
  for (const child of doc.root.children) collect(child, out);
  ensureFontsForValues(out);
}
