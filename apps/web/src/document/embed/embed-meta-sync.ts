// WI-139 — embed metadata persistence (pure transforms for the convergent
// controller; see use-embed-meta-sync.ts). oEmbed gives a TITLE + THUMBNAIL in
// one fetch; both are written to the embed item via `reconcileDerived` (bypasses
// history, like the chart-label sync) so they survive reload / export / offline
// and are never refetched. The poster is persisted ONLY for providers with no
// derivable thumbnail (Vimeo / Loom) — YouTube derives its own.

import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import { resolveEmbed } from "./providers.js";

export interface PersistedEmbedMeta {
  readonly title?: string;
  readonly posterUrl?: string;
}

interface EmbedAttrsShape {
  url?: string;
  title?: string;
  posterUrl?: string;
}

function missing(value: unknown): boolean {
  return value === undefined || value === "";
}

/** Whether `attrs` (a recognized embed) still needs an oEmbed fetch: it lacks a
 *  title, OR it lacks a poster AND its provider has no derivable one. */
function needsMeta(attrs: EmbedAttrsShape): boolean {
  if (typeof attrs.url !== "string" || attrs.url.trim() === "") return false;
  const resolved = resolveEmbed(attrs.url);
  if (resolved === null) return false;
  const titleMissing = missing(attrs.title);
  const posterMissing = resolved.thumbnailUrl === null && missing(attrs.posterUrl);
  return titleMissing || posterMissing;
}

/** Every recognized embed url in `doc` that still needs oEmbed metadata. */
export function collectEmbedUrlsNeedingMeta(doc: AgocraftDocument): ReadonlySet<string> {
  const out = new Set<string>();
  const walk = (item: AgocraftItem): void => {
    if (item.kind === "embed" && needsMeta(item.attrs as EmbedAttrsShape)) {
      out.add((item.attrs as EmbedAttrsShape).url as string);
    }
    for (const child of item.children) walk(child);
  };
  walk(doc.root);
  return out;
}

/** Fill `title` / `posterUrl` (only the ones currently MISSING) on every embed
 *  with `url`. Returns the SAME doc reference when nothing changed, so
 *  `reconcileDerived` settles (no convergence loop). */
export function setEmbedMeta(
  doc: AgocraftDocument,
  url: string,
  meta: PersistedEmbedMeta,
): AgocraftDocument {
  const visit = (item: AgocraftItem): AgocraftItem => {
    let next = item;
    if (item.kind === "embed") {
      const attrs = item.attrs as EmbedAttrsShape;
      if (attrs.url === url) {
        const patch: EmbedAttrsShape = {};
        if (meta.title !== undefined && missing(attrs.title)) patch.title = meta.title;
        if (meta.posterUrl !== undefined && missing(attrs.posterUrl)) {
          patch.posterUrl = meta.posterUrl;
        }
        if (Object.keys(patch).length > 0) next = { ...item, attrs: { ...item.attrs, ...patch } };
      }
    }
    const children = item.children.map(visit);
    if (children.some((c, i) => c !== item.children[i])) next = { ...next, children };
    return next;
  };
  const root = visit(doc.root);
  return root === doc.root ? doc : { ...doc, root };
}
