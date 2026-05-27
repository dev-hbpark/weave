// Inline-media migration (retro-active resource extraction).
//
// Older designs (and any design built before MediaSrcDialog awaits its
// cloud upload) carry image item `attrs.src` values that look like
//   "data:image/png;base64,iVBOR…"
// — the raw bytes inlined in a data URL. That bloats the design JSON
// (each megabyte of image becomes ~1.35 MB of base64 in the design
// blob) and prevents cross-design dedup. This module walks the
// document tree, finds every such item, and exposes the targets so a
// host hook can stream them to `/api/resources` and patch each item's
// `src` to the returned cloud URL.
//
// Scope is intentionally narrow:
//   • Only `kind === "image"`. Video data URLs are practically unheard
//     of (size); video `blob:` URLs are session-scoped — by the time
//     we're reading after a reload the bytes are already gone, so
//     there's nothing to upload.
//   • Shape fills with embedded image paint are NOT covered yet (the
//     same data-URL shape can appear under `attrs.fill`); a follow-up
//     can extend `findInlineImageItems` to descend into those.

import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";

export interface InlineImageItem {
  readonly itemId: string;
  /** The full data: URL — passed verbatim to `uploadResourceCloud`. */
  readonly src: string;
  /** MIME extracted from the data URL header. Used to synthesise a
   *  filename when the resource catalog needs one — the original
   *  upload filename is not stored on the item. */
  readonly mime: string;
}

const DATA_URL_PREFIX = "data:";

/** Extract the MIME type from a data URL. Returns "image/png" as a
 *  conservative fallback when the header is malformed or missing. */
function parseDataUrlMime(src: string): string {
  const head = src.slice(DATA_URL_PREFIX.length).split(/[;,]/, 1)[0];
  if (head === undefined || head.length === 0) return "image/png";
  return head;
}

/** Walks the document tree, returns every image item whose attrs.src is
 *  a data: URL. Order is depth-first, root-first; callers should not
 *  rely on order for correctness but may use it for stable progress
 *  reporting. */
export function findInlineImageItems(doc: AgocraftDocument): ReadonlyArray<InlineImageItem> {
  const out: InlineImageItem[] = [];
  const walk = (item: AgocraftItem): void => {
    if (item.kind === "image") {
      const attrs = item.attrs as { src?: unknown };
      if (typeof attrs.src === "string" && attrs.src.startsWith(DATA_URL_PREFIX)) {
        out.push({
          itemId: String(item.id),
          src: attrs.src,
          mime: parseDataUrlMime(attrs.src),
        });
      }
    }
    for (const child of item.children) walk(child);
  };
  walk(doc.root);
  return out;
}

/** Derive a sane filename for the resource catalog from the item id +
 *  MIME. Example: `migrated-img-abc123.png`. Multipart MIMEs like
 *  `image/svg+xml` are collapsed to the base extension (`svg`). */
export function synthesiseResourceName(itemId: string, mime: string): string {
  const sub = mime.split("/")[1] ?? "png";
  const ext = sub.split("+")[0] ?? "png";
  return `migrated-${itemId}.${ext}`;
}

/** Walks a serialized agocraft document JSON (output of
 *  `serializer.toJSON`) and returns a NEW tree where every `image`-kind
 *  item whose id appears in `urlMap` has its `attrs.src` replaced by
 *  the mapped URL. Input is never mutated.
 *
 *  Implementation is shape-agnostic on purpose — it inspects each
 *  object for the structural marker `{ id: string, kind: "image" }`
 *  and ignores everything else. This means the function is tolerant
 *  of schema additions: any new field on Item flows through unchanged
 *  as long as it serializes to JSON. */
export function replaceInlineImageSrcs(
  docBlob: unknown,
  urlMap: ReadonlyMap<string, string>,
): unknown {
  if (urlMap.size === 0) return docBlob;
  const transform = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(transform);
    if (value === null || typeof value !== "object") return value;
    const obj = value as Record<string, unknown>;
    if (typeof obj.id === "string" && obj.kind === "image") {
      const newSrc = urlMap.get(obj.id);
      if (newSrc !== undefined) {
        const oldAttrs = (obj.attrs as Record<string, unknown> | undefined) ?? {};
        return {
          ...obj,
          attrs: { ...oldAttrs, src: newSrc },
          ...("children" in obj && Array.isArray(obj.children)
            ? { children: obj.children.map(transform) }
            : {}),
        };
      }
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = transform(v);
    return out;
  };
  return transform(docBlob);
}
