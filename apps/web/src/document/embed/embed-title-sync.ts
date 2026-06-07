// WI-139 — embed title persistence (pure transforms for the convergent
// controller; see use-embed-title-sync.ts). oEmbed titles are fetched once and
// written to `attrs.title` via `reconcileDerived` (bypasses history, like the
// chart-label sync), so the title survives reload / export / offline and is
// never refetched.

import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import { resolveEmbed } from "./providers.js";

function isTitleless(attrs: { url?: unknown; title?: unknown }): boolean {
  return (
    typeof attrs.url === "string" &&
    attrs.url.trim() !== "" &&
    (attrs.title === undefined || attrs.title === "") &&
    resolveEmbed(attrs.url) !== null
  );
}

/** Every recognized embed url in `doc` that still lacks a title — the set the
 *  controller fetches oEmbed titles for. */
export function collectTitlelessEmbedUrls(doc: AgocraftDocument): ReadonlySet<string> {
  const out = new Set<string>();
  const walk = (item: AgocraftItem): void => {
    if (item.kind === "embed") {
      const attrs = item.attrs as { url?: string; title?: string };
      if (isTitleless(attrs)) out.add(attrs.url as string);
    }
    for (const child of item.children) walk(child);
  };
  walk(doc.root);
  return out;
}

/** Set `title` on every titleless embed item whose url === `url`. Returns the
 *  SAME doc reference when nothing changed, so `reconcileDerived` settles
 *  (no convergence loop). */
export function setEmbedTitle(doc: AgocraftDocument, url: string, title: string): AgocraftDocument {
  const visit = (item: AgocraftItem): AgocraftItem => {
    let next = item;
    if (item.kind === "embed") {
      const attrs = item.attrs as { url?: string; title?: string };
      if (attrs.url === url && (attrs.title === undefined || attrs.title === "")) {
        next = { ...item, attrs: { ...item.attrs, title } };
      }
    }
    const children = item.children.map(visit);
    const childrenChanged = children.some((c, i) => c !== item.children[i]);
    if (childrenChanged) next = { ...next, children };
    return next;
  };
  const root = visit(doc.root);
  return root === doc.root ? doc : { ...doc, root };
}
