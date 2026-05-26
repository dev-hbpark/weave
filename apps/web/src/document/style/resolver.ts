// WI-040 — weave's StyleResolver instance.
//
// Thin wrapper over agocraft's `createStyleResolver` that builds the
// `getParent` walker against a `Document` snapshot. The walker rebuilds a
// `WeakMap<Item, Item>` on each document mutation — cheap because the tree
// is small and the resolver caches nothing beyond the input doc.
//
// Two entry points:
//
//   • createWeaveStyleResolver(doc) — full agocraft Resolver, for code that
//     wants the cascade semantics (own → token → inherited → default).
//   • resolveThemeRef(doc, ref) — direct shortcut that pulls a single
//     token value from the root's style.provider Unit. Sufficient for
//     "give me the CSS value for color.accent" reads that don't need the
//     ancestor walk.
//
// Both are stateless given the input doc — no React hooks here so non-
// React callers (commands, host adapters) can use them too.

import {
  type Document as AgocraftDocument,
  type Item as AgocraftItem,
  createStyleResolver as createAgocraftStyleResolver,
  isStyleRef,
  STYLE_PROVIDER_UNIT_KIND,
  type StyleProviderAttrs,
  type StyleRef,
  type StyleResolver,
} from "@agocraft/core";

/** Build a parent map for `doc` so the resolver can walk ancestors.
 *  Rebuilt per resolver instantiation — callers create a resolver per
 *  read pass (or whenever the doc reference changes). */
function buildParentMap(doc: AgocraftDocument): WeakMap<AgocraftItem, AgocraftItem> {
  const map = new WeakMap<AgocraftItem, AgocraftItem>();
  function walk(parent: AgocraftItem) {
    for (const c of parent.children) {
      map.set(c, parent);
      walk(c);
    }
  }
  walk(doc.root);
  return map;
}

/** Construct a StyleResolver scoped to the given document snapshot. */
export function createWeaveStyleResolver(doc: AgocraftDocument): StyleResolver {
  const parentMap = buildParentMap(doc);
  return createAgocraftStyleResolver({
    getParent: (item) => parentMap.get(item),
  });
}

/** Resolve a token name directly off the document root's style.provider
 *  Unit. Returns `undefined` when the token isn't published. Fast path for
 *  reads anchored at root — for per-item / per-slide overrides use
 *  `resolveTokenFromItem` instead so ancestor providers participate. */
export function resolveTokenValue(doc: AgocraftDocument, tokenName: string): string | undefined {
  const root = doc.root;
  const provider = root.units.find((u) => u.kind === STYLE_PROVIDER_UNIT_KIND);
  if (provider === undefined) return undefined;
  const tokens = (provider.attrs as StyleProviderAttrs).tokens;
  const v = tokens[tokenName];
  return typeof v === "string" ? v : undefined;
}

/** Cascade walker — starts at `fromItem` and walks up the parent chain,
 *  returning the first `style.provider` Unit's matching token value.
 *  This is what makes agocraft's cascade useful for theming: an
 *  individual slide / frame can attach its own `style.provider` Unit
 *  overriding `color.accent`, and descendants resolve to the override
 *  without the root being touched. When no ancestor publishes the token
 *  the function returns `undefined`. */
export function resolveTokenFromItem(
  doc: AgocraftDocument,
  fromItem: AgocraftItem,
  tokenName: string,
): string | undefined {
  const parentMap = buildParentMap(doc);
  let cur: AgocraftItem | undefined = fromItem;
  while (cur !== undefined) {
    const provider = cur.units.find((u) => u.kind === STYLE_PROVIDER_UNIT_KIND);
    if (provider !== undefined) {
      const tokens = (provider.attrs as StyleProviderAttrs).tokens;
      if (Object.hasOwn(tokens, tokenName)) {
        const v = tokens[tokenName];
        if (typeof v === "string") return v;
      }
    }
    cur = parentMap.get(cur);
  }
  return undefined;
}

/** Convert a stored color (raw string OR `StyleRef`) into a CSS string the
 *  renderer can apply directly. StyleRefs are resolved against the
 *  starting item's ancestor chain (cascade), so an item that lives inside
 *  a slide whose own `style.provider` overrides `color.accent` reads the
 *  override. Falls back to `fallback` when the ref can't be resolved.
 *
 *  Pass `doc.root` as `fromItem` when the value lives on the document
 *  itself (not on any specific item). */
export function resolveStoredColor(
  doc: AgocraftDocument,
  value: unknown,
  fromItem: AgocraftItem = doc.root,
  fallback?: string,
): string | undefined {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string") return value;
  if (isStyleRef(value)) {
    return resolveTokenFromItem(doc, fromItem, (value as StyleRef).$ref) ?? fallback;
  }
  return fallback;
}
