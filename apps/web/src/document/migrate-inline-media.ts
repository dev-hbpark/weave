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

/** Per-kind extractor that pulls the inline `data:` URL out of an
 *  item's attrs (if any). One adapter per source — Rule 6 declarative
 *  branching: the walker looks up the adapter for the item's kind
 *  instead of switching inline on the kind string. */
type InlineSrcExtractor = (attrs: unknown) => string | undefined;

const INLINE_SRC_EXTRACTORS: Readonly<Record<string, InlineSrcExtractor>> = {
  image: (attrs) => {
    const v = (attrs as { src?: unknown }).src;
    return typeof v === "string" && v.startsWith(DATA_URL_PREFIX) ? v : undefined;
  },
  // Shape fills with `type: "image"` carry the same `data:` URL pattern
  // when the user picked a shape image fill before MediaSrcDialog
  // awaited cloud upload. Migration covers them uniformly. Video paint
  // is excluded — `data:` video URLs are practically nonexistent.
  shape: (attrs) => {
    const fill = (attrs as { fill?: { type?: string; src?: unknown } }).fill;
    if (fill?.type !== "image") return undefined;
    const src = fill.src;
    return typeof src === "string" && src.startsWith(DATA_URL_PREFIX) ? src : undefined;
  },
};

/** Walks the document tree, returns every item with an inline `data:`
 *  URL the migration can re-upload. Each extractor handles one item
 *  kind (image item's `attrs.src`, shape item's `attrs.fill.src`). New
 *  inline-media kinds are added by registering another entry in
 *  `INLINE_SRC_EXTRACTORS` — no walker change needed.
 *
 *  Order is depth-first, root-first; callers should not rely on order
 *  for correctness but may use it for stable progress reporting. */
export function findInlineImageItems(doc: AgocraftDocument): ReadonlyArray<InlineImageItem> {
  const out: InlineImageItem[] = [];
  const walk = (item: AgocraftItem): void => {
    const extract = INLINE_SRC_EXTRACTORS[item.kind];
    if (extract !== undefined) {
      const src = extract(item.attrs);
      if (src !== undefined) {
        out.push({ itemId: String(item.id), src, mime: parseDataUrlMime(src) });
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

/** Per-kind in-place attrs rewriter: returns a NEW attrs record with
 *  the inline `data:` URL replaced by `newSrc`. Mirrors the
 *  `INLINE_SRC_EXTRACTORS` registry — one rewriter per kind, no
 *  inline switch. Returns `undefined` when this rewriter doesn't
 *  apply to the given attrs (e.g. shape with a non-image fill); the
 *  caller falls back to leaving the attrs untouched. */
type InlineSrcRewriter = (
  attrs: Record<string, unknown>,
  newSrc: string,
) => Record<string, unknown> | undefined;

const INLINE_SRC_REWRITERS: Readonly<Record<string, InlineSrcRewriter>> = {
  image: (attrs, newSrc) => ({ ...attrs, src: newSrc }),
  shape: (attrs, newSrc) => {
    const fill = attrs.fill as Record<string, unknown> | undefined;
    if (fill?.type !== "image") return undefined;
    return { ...attrs, fill: { ...fill, src: newSrc } };
  },
};

/** Walks a serialized agocraft document JSON (output of
 *  `serializer.toJSON`) and returns a NEW tree where every item whose
 *  id appears in `urlMap` has its inline `data:` URL replaced by the
 *  mapped cloud URL. Input is never mutated.
 *
 *  The rewriter per item kind is looked up from `INLINE_SRC_REWRITERS`
 *  (single source of truth shared with the walker). Unknown / non-
 *  matching kinds pass through verbatim, so schema additions don't
 *  break the migration — they just don't migrate until a rewriter is
 *  registered for them. */
export function replaceInlineImageSrcs(
  docBlob: unknown,
  urlMap: ReadonlyMap<string, string>,
): unknown {
  if (urlMap.size === 0) return docBlob;
  const transform = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(transform);
    if (value === null || typeof value !== "object") return value;
    const obj = value as Record<string, unknown>;
    if (typeof obj.id === "string" && typeof obj.kind === "string") {
      const newSrc = urlMap.get(obj.id);
      const rewriter = INLINE_SRC_REWRITERS[obj.kind];
      if (newSrc !== undefined && rewriter !== undefined) {
        const oldAttrs = (obj.attrs as Record<string, unknown> | undefined) ?? {};
        const nextAttrs = rewriter(oldAttrs, newSrc);
        if (nextAttrs !== undefined) {
          return {
            ...obj,
            attrs: nextAttrs,
            ...("children" in obj && Array.isArray(obj.children)
              ? { children: obj.children.map(transform) }
              : {}),
          };
        }
      }
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = transform(v);
    return out;
  };
  return transform(docBlob);
}
