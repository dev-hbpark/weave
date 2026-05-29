// WI-041 — weave clipboard payload schema.
//
// Phase 4 — MAX_PASTE_NODES gate. Total nodes counted at copy time (the
// root item plus every descendant Item). 500 is the FR-008 / RISK-008 R7
// agreed upper bound; copying a subtree above the cap is refused with
// a structured CommandError so the host can show a toast. Picked to
// match the order of magnitude of "a complex 6×6 dashboard frame with
// nested groups" — anything bigger is almost always an accidental
// nesting (e.g. self-pasting inside a recursive structure).
export const MAX_PASTE_NODES = 500;

//
// A clipboard entry travels through three layers:
//
//   1. The in-memory `ClipboardStore` (this Phase 2/3) — singleton per tab.
//   2. Cross-tab `BroadcastChannel("weave.clipboard.v1")` (Phase 4) — same
//      origin, all open tabs.
//   3. (v1.1+) System Clipboard `text/plain` fallback — out of scope for
//      the in-app paste path.
//
// The schemaVersion / appVersion / origin / timestamp fields exist for the
// cross-tab path: a tab on an older release MUST silently drop a payload
// whose schemaVersion it does not know (RISK-008 R4). The same shape is
// used in the in-memory layer so Phase 4 lights up without redefining a
// second envelope.

import type { SerializedItem, SerializedRelation } from "@agocraft/core";

/** Discriminator for known clipboard payload kinds. New kinds (e.g.
 *  `"weave/style.v1"` in Phase 6) add their own entry and adapter. */
export type ClipboardPayloadKind = "weave/items.v1" | "weave/style.v1";

export interface ClipboardPayload<TData = unknown> {
  /** Bump when ANY field shape changes — receivers drop unknown versions
   *  silently (RISK-008 R4). */
  readonly schemaVersion: 1;
  /** Free-form app version for telemetry; never used for compatibility
   *  decisions. */
  readonly appVersion: string;
  /** Per-tab UUID minted at app boot. Disambiguates self-receives on
   *  BroadcastChannel (Phase 4). */
  readonly origin: string;
  /** Unix milliseconds at copy/cut time. */
  readonly timestamp: number;
  /** Payload-kind discriminator — see `ClipboardPayloadKind`. */
  readonly kind: ClipboardPayloadKind;
  /** Adapter-defined data. */
  readonly data: TData;
}

/** Data shape for `kind: "weave/items.v1"` — the v1 clipboard scope. */
export interface ItemsPayloadData {
  /**
   * The primary copied subtree (already serialised). Always equals
   * `items[0]`. Kept as a distinct field because (a) Paste Special's
   * style / text / size / position modes read a single source's attrs,
   * and (b) a reader on an older release that doesn't know `items` still
   * pastes this one item instead of dropping the payload.
   */
  readonly item: SerializedItem;
  /**
   * Every copied subtree, in selection order. A multi-selection copy
   * stores all of them; a single copy stores one. `everything`-mode paste
   * clones each, preserving relative positions. Optional so payloads
   * written before this field (or by an older tab) still paste via the
   * `item` fallback.
   */
  readonly items?: ReadonlyArray<SerializedItem>;
  /**
   * Relations whose topology references the subtree's ItemIds, captured
   * from the source document at copy time. Pasted relations are re-mapped
   * through `remapIds` so they target the new ItemIds. v1 always sends an
   * empty array — relation cloning is a follow-up (DR-019 D3 cover).
   */
  readonly relations: ReadonlyArray<SerializedRelation>;
  /** Source container id at the moment of copy — informational only.
   *  Paste targets are decided by the host at paste time (D5). */
  readonly sourceParentId?: string;
}

export type ItemsClipboardPayload = ClipboardPayload<ItemsPayloadData>;

/** Result of a `read()` call when the underlying payload schema is one we
 *  understand. Callers narrow on `kind` before reading `data`. */
export type KnownClipboardPayload = ItemsClipboardPayload;

/** Total node count for a serialised subtree — root + every descendant.
 *  Linear DFS; pure. Used by the MAX_PASTE_NODES gate at copy time. */
export function countSubtreeNodes(item: SerializedItem): number {
  let n = 1;
  for (const c of item.children) n += countSubtreeNodes(c);
  return n;
}

/**
 * Paste Special — the five paste-mode flavours (DR-019 D6).
 *
 *   - `everything`: default Cmd+V. Insert the source as a new child
 *     under the destination container; the existing selection is not
 *     mutated.
 *   - `style`: copy visual style keys (color / border / shadow /
 *     typography) from the source onto every currently-selected target
 *     Item, leaving frame / text / children intact.
 *   - `text`: copy `text` / `textRuns` from the source's text node
 *     onto each currently-selected text target.
 *   - `size`: copy `frame.width` / `frame.height` from the source onto
 *     each currently-selected target; position is preserved.
 *   - `position`: copy `frame.x` / `frame.y` from the source onto each
 *     currently-selected target; size is preserved.
 */
export type PasteMode = "everything" | "style" | "text" | "size" | "position";

/** Whitelist of source-item attribute keys propagated by the
 *  `style`-mode paste. Keys absent from the source's `attrs` are simply
 *  skipped — the target keeps its existing value. */
export const STYLE_ATTRIBUTE_KEYS: ReadonlyArray<string> = [
  "color",
  "backgroundColor",
  "background",
  "border",
  "borderColor",
  "borderWidth",
  "borderRadius",
  "shadow",
  "opacity",
  "fill",
  "stroke",
  "strokeWidth",
  // Text-kind style — propagating these onto non-text targets is harmless
  // (the target's renderer ignores unknown attrs).
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "textDecoration",
  "textAlign",
  "textAlignHorizontal",
  "lineHeight",
  "lineHeightSpec",
  "letterSpacing",
];

/** Stable per-tab origin id, minted once when this module loads. Used
 *  by both the copy command (stamped into each payload) and the
 *  BroadcastChannel transport (drops self-receives by comparing
 *  `payload.origin` to this constant). A module-level constant is the
 *  right scope: it survives editor re-mounts, but a fresh tab gets a
 *  fresh value. */
export const SESSION_ORIGIN: string = (() => {
  if (typeof globalThis === "undefined") {
    return `session-${Date.now().toString(36)}`;
  }
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID !== undefined) return g.crypto.randomUUID();
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
})();
