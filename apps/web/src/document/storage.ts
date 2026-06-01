import {
  type Document as AgocraftDocument,
  type Item as AgocraftItem,
  createFeatureRegistry,
  createSchema,
  createSerializer,
  DECORATION_ATTR_MIGRATIONS,
  itemId,
  migrateTextAutoResizeToLayoutChild,
} from "@agocraft/core";
import { ensureRootStyleProvider, toAgocraftDocument } from "./agocraft-mirror.js";
import { migrateLegacyKindsToFrame } from "./migrate-frame-only.js";
import type { CanvasShape, Design, Document, Item, ItemFrame } from "./types.js";
import { DEFAULT_DESIGN_BACKGROUND, FULL_FRAME } from "./types.js";

// localStorage persistence.
//
//   v1 → v2: behaviors[] added per item.
//   v2 → v3: CanvasShape grew id/width/height/rotation.
//   v3 → v4: weave Document projection swapped for agocraft canonical Document
//            via `@agocraft/core` Serializer.
//   v4 → v5: agocraft Document wrapped in a `Design` envelope. Design holds the
//            only absolute coords (width × height); every Item gets an
//            `ItemFrame` (0..1 parent-relative). CanvasShape coords moved from
//            0..100 percent → 0..1 ratio of the canvas item's frame. Camera
//            target positions moved from absolute px → 0..1 ratio of the design.

const KEY_PREFIX_V5 = "weave.design.v5.";
const KEY_PREFIX_V4 = "weave.doc.v4.";
// WI-032 — pre-migration backup. Saved before `migrateLegacyKindsToFrame`
// rewrites a legacy 4-domain doc. Kept for `BACKUP_TTL_MS` (1 week), then
// silently evicted by `evictStaleBackups()` on the next `loadDesign` call.
// RISK-004 condition #1 — guarantees a rollback path if the migration
// disagrees with the user's expectation.
const KEY_PREFIX_V9_BACKUP = "weave.design.v9-backup.";
const BACKUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// WI-032 — Phase 3c — `migrateLegacyKindsToFrame` is now active. The first
// load of any persisted legacy 4-domain doc rewrites it in memory; the next
// `saveDesign` persists the new shape, and the pre-migration v9 blob is
// stashed under `weave.design.v9-backup.<id>` for 1 week (RISK-004 §1).
const WI032_MIGRATE_ENABLED = true;

// Persistence model (2026-05-29) — offline-first, cloud-authoritative.
//
// The cloud (`apps/web/api/designs/*`) is the single source of truth. A
// `weave.design.v5.<id>` entry in localStorage means exactly one thing:
// an UNSYNCED OFFLINE EDIT (an "outbox"). It is written ONLY when a save
// can't reach the server, and removed the moment that edit syncs. This
// is the user's contract — "로컬스토리지에 저장하는 건 오프라인일 때만"
// (write LS only while offline). It replaces the earlier all-or-nothing
// gate, which left LS as a stale read-cache that shadowed newer cloud
// saves on reopen.
//
// Consequences:
//   • `bootstrapFromCloud` no longer caches cloud designs into LS — a
//     present LS entry is always an offline edit, never a sync cache.
//   • Opening a design that HAS an LS entry surfaces a reconcile prompt
//     (save the offline edit to the server, or discard it) instead of
//     silently using either copy. See `useDesign`'s `localConflict`.

/** True when the browser reports no network connection. The fire-and-
 *  forget save path writes the offline outbox only in this case; the
 *  awaitable save path keys off the actual cloud round-trip result. */
function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

const LEGACY_PREFIX_V3 = "weave.doc.v3.";
const LEGACY_PREFIX_V2 = "weave.doc.v2.";
const LEGACY_PREFIX_V1 = "weave.doc.v1.";

/** v4 size implied by the editor preset that shipped with the demo. We carry
 *  it as the default for v4 → v5 width/height when no explicit size hint
 *  survived the round-trip. */
const DEFAULT_DESIGN_WIDTH = 1920;
const DEFAULT_DESIGN_HEIGHT = 1080;

const serializer = createSerializer();

interface LegacyItemV1 {
  readonly id: string;
  readonly kind: string;
  readonly attrs: unknown;
  readonly createdAt: string;
}

interface LegacyDocumentV1 {
  readonly id: string;
  readonly title: string;
  readonly items: ReadonlyArray<LegacyItemV1>;
  readonly updatedAt: string;
  readonly schemaVersion: 1;
}

interface LegacyItemV2 {
  readonly id: string;
  readonly kind: string;
  readonly attrs: unknown;
  readonly behaviors: ReadonlyArray<unknown>;
  readonly createdAt: string;
}

interface LegacyDocumentV2 {
  readonly id: string;
  readonly title: string;
  readonly items: ReadonlyArray<LegacyItemV2>;
  readonly updatedAt: string;
  readonly schemaVersion: 2;
}

interface LegacyCanvasShapeV2 {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly hue: string;
}

export interface SerializedDesignV5 {
  readonly id: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  /** Optional in the persisted blob — older v5 blobs may not have it. Loader
   *  defaults to `DEFAULT_DESIGN_BACKGROUND` (white) when missing. */
  readonly background?: string;
  readonly document: unknown;
  readonly presentationOrder: ReadonlyArray<string>;
  readonly meta: {
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly schemaVersion: 5;
  };
}

let migrationCounter = 0;
function migratedShapeId(): string {
  migrationCounter += 1;
  return `shape-mig-${migrationCounter}`;
}

function migrateV1ToV2(legacy: LegacyDocumentV1): LegacyDocumentV2 {
  return {
    id: legacy.id,
    title: legacy.title,
    items: legacy.items.map((it) => ({
      id: it.id,
      kind: it.kind,
      attrs: it.attrs,
      behaviors: [],
      createdAt: it.createdAt,
    })),
    updatedAt: legacy.updatedAt,
    schemaVersion: 2,
  };
}

/** v2 → v3: CanvasShape grows id/width/height/rotation. The old `size` becomes
 *  both width and height (square). Rotation defaults to 0. */
function migrateV2ToV3(legacy: LegacyDocumentV2): Document {
  const items: Item[] = legacy.items.map((it) => {
    if (it.kind === "canvas-design") {
      const oldAttrs = it.attrs as { summary: string; shapes: ReadonlyArray<LegacyCanvasShapeV2> };
      const shapes: CanvasShape[] = oldAttrs.shapes.map((s) => ({
        id: migratedShapeId(),
        x: s.x,
        y: s.y,
        width: s.size / 4,
        height: s.size / 4,
        rotation: 0,
        hue: s.hue,
      }));
      // WI-032 Phase 3 — `canvas-design` is no longer a weave-domain kind;
      // we keep the legacy v2→v3 migration shape intact so old localStorage
      // blobs still parse, then `migrateLegacyKindsToFrame` (Phase 2)
      // rewrites the canvas-design Item into a `frame` + shape children on
      // the way out. The intermediate object has to be `unknown`-cast
      // because the post-migration DomainKind union no longer includes it.
      return {
        id: it.id,
        kind: "canvas-design",
        attrs: { frame: FULL_FRAME, summary: oldAttrs.summary, shapes },
        behaviors: it.behaviors as Item["behaviors"],
        createdAt: it.createdAt,
      } as unknown as Item;
    }
    return {
      id: it.id,
      kind: it.kind as Item["kind"],
      attrs: { frame: FULL_FRAME, ...(it.attrs as object) },
      behaviors: it.behaviors as Item["behaviors"],
      createdAt: it.createdAt,
    } as Item;
  });
  return {
    id: legacy.id,
    title: legacy.title,
    items,
    updatedAt: legacy.updatedAt,
    schemaVersion: 3,
  };
}

// ── v4 → v5 — wrap AgocraftDocument in a Design + normalize coordinates ────
//
// Items get a default `frame` (FULL_FRAME) so the existing layout stays
// visible. CanvasShape coords drop from 0..100 percent → 0..1 ratio (just
// divide by 100). Camera-target positions drop from absolute px → 0..1 ratio
// (divide by design width/height). Everything else is preserved.

function deepNormalizeItem(
  item: AgocraftItem,
  designWidth: number,
  designHeight: number,
): AgocraftItem {
  // Attach default frame if missing.
  const attrs = item.attrs as Readonly<Record<string, unknown>>;
  let nextAttrs: Readonly<Record<string, unknown>> = attrs;
  if ((attrs as { frame?: ItemFrame }).frame === undefined) {
    nextAttrs = { ...attrs, frame: FULL_FRAME };
  }
  // Canvas shapes — percent → ratio.
  if (item.kind === "canvas-design") {
    const a = nextAttrs as unknown as {
      readonly summary: string;
      readonly shapes: ReadonlyArray<CanvasShape>;
    };
    const looksPercent = a.shapes.some(
      (s) => s.x > 1.0001 || s.y > 1.0001 || s.width > 1.0001 || s.height > 1.0001,
    );
    if (looksPercent) {
      const shapes = a.shapes.map((s) => ({
        ...s,
        x: s.x / 100,
        y: s.y / 100,
        width: s.width / 100,
        height: s.height / 100,
      }));
      nextAttrs = { ...nextAttrs, shapes };
    }
  }
  // Phase 11 — legacy v4 sub-doc items get rewritten as plain slides (every
  // domain is now a frame; sub-doc was the redundant kind). attrs.width and
  // attrs.height drop in favor of the universal frame.
  let nextKind = item.kind;
  if (nextKind === "sub-doc") {
    // WI-032 Phase 3 — sub-doc → frame (the new canvas container). Legacy
    // sub-doc width/height/flavor are dropped; the universal frame stays.
    nextKind = "frame";
    const a = nextAttrs as { width?: unknown; height?: unknown; flavor?: unknown };
    if (a.width !== undefined || a.height !== undefined || a.flavor !== undefined) {
      const { width: _w, height: _h, flavor: _f, ...rest } = nextAttrs as Record<string, unknown>;
      nextAttrs = rest;
    }
  }
  // Camera-target units — absolute → ratio.
  const nextUnits = item.units.map((u) => {
    if (u.kind !== "camera-target") return u;
    const carried = u.attrs.behavior as { position?: { x: number; y: number } } | undefined;
    if (carried === undefined || carried.position === undefined) return u;
    const looksAbsolute =
      Math.abs(carried.position.x) > 1.0001 || Math.abs(carried.position.y) > 1.0001;
    if (!looksAbsolute) return u;
    return {
      ...u,
      attrs: {
        ...u.attrs,
        behavior: {
          ...carried,
          position: {
            x: carried.position.x / designWidth,
            y: carried.position.y / designHeight,
          },
        },
      },
    };
  });
  return {
    ...item,
    kind: nextKind,
    attrs: nextAttrs,
    units: nextUnits,
    children: item.children.map((c) => deepNormalizeItem(c, designWidth, designHeight)),
  };
}

function wrapDocumentInDesign(doc: AgocraftDocument): Design {
  const width = DEFAULT_DESIGN_WIDTH;
  const height = DEFAULT_DESIGN_HEIGHT;
  const normalizedRoot = deepNormalizeItem(doc.root, width, height);
  const normalizedDoc: AgocraftDocument = { ...doc, root: normalizedRoot };
  const title =
    (doc.root.attrs.title as string | undefined) ??
    (doc.meta.userMeta?.title as string | undefined) ??
    "";
  const docId = (doc.meta.userMeta?.weaveDocId as string | undefined) ?? doc.id;
  const now = doc.meta.updatedAt ?? new Date().toISOString();
  return {
    id: docId,
    title,
    width,
    height,
    background: DEFAULT_DESIGN_BACKGROUND,
    document: normalizedDoc,
    presentationOrder: [],
    meta: {
      createdAt: doc.meta.createdAt ?? now,
      updatedAt: now,
      schemaVersion: 5,
    },
  };
}

// ── Public surface ─────────────────────────────────────────────────────────

/** Pure transform: SerializedDesignV5 blob (e.g. fetched from the cloud)
 *  → runtime `Design`. Mirrors the v5-branch of `loadDesign` but with no
 *  LS side effects, so callers that already hold the JSON (e.g. cloud
 *  fetch responses) can hydrate without re-reading or re-writing
 *  localStorage. Returns `undefined` when the blob fails schema
 *  validation; callers fall back to whatever in-memory state they
 *  already have.
 *
 *  WI-032 frame-only migration runs the same way (in-place rewrite of
 *  legacy `slide` / `canvas-design` / `block-doc` / `media` kinds) so
 *  cloud blobs from before the migration land in a known-frame shape.
 *  The v9 backup *cannot* be written here — there's no original v5
 *  raw string to stash; the migration backup contract is LS-only. */
export function hydrateSerializedDesign(blob: SerializedDesignV5): Design | undefined {
  if (blob.meta?.schemaVersion !== 5) return undefined;
  let documentJson = blob.document;
  if (WI032_MIGRATE_ENABLED) {
    const rawAsAgo = documentJson as unknown as AgocraftDocument;
    const migrated = migrateLegacyKindsToFrame(rawAsAgo);
    if (migrated !== rawAsAgo) {
      documentJson = migrated as unknown as typeof documentJson;
    }
  }
  const result = serializer.fromJSON(documentJson, {
    schema: createSchema(),
    features: createFeatureRegistry(),
    // WI-042 / RISK-001 C1.1 — auto-upgrade v9 docs (textAutoResize) into
    // v10's layoutChild. The helper is a no-op on already-v10 input and
    // never clobbers a pre-existing layoutChild.
    migrations: [migrateTextAutoResizeToLayoutChild, ...DECORATION_ATTR_MIGRATIONS],
    onUnknown: "preserve",
  });
  if (!result.ok) return undefined;
  let document = result.document;
  if (WI032_MIGRATE_ENABLED) {
    document = migrateLegacyKindsToFrame(document);
  }
  document = ensureRootStyleProvider(document);
  return {
    id: blob.id,
    title: blob.title,
    width: blob.width,
    height: blob.height,
    background: blob.background ?? DEFAULT_DESIGN_BACKGROUND,
    document,
    presentationOrder: blob.presentationOrder ?? [],
    meta: blob.meta,
  };
}

// One-time migration for the offline-first switch (2026-05-29). Before
// this change, `weave.design.v5.*` was a cloud READ-CACHE that bootstrap
// populated for every design. Under the offline-first model that key
// means an unsynced offline edit — so a leftover read-cache entry would
// masquerade as one and trip the open-time reconcile prompt with stale
// data. No genuine offline edits can predate this change, so the first
// LS read purges every `weave.design.v5.*` once and records a flag; after
// that the key is left alone so real offline edits survive.
const OFFLINE_MODEL_MIGRATION_KEY = "weave.migration.offline-model.v1";

function purgeLegacyDesignCacheOnce(): void {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(OFFLINE_MODEL_MIGRATION_KEY) !== null) return;
  const toDelete: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key === null || !key.startsWith(KEY_PREFIX_V5)) continue;
    toDelete.push(key);
  }
  for (const k of toDelete) window.localStorage.removeItem(k);
  window.localStorage.setItem(OFFLINE_MODEL_MIGRATION_KEY, new Date().toISOString());
}

export function loadDesign(id: string): Design | undefined {
  if (typeof window === "undefined") return undefined;

  // Drop the pre-offline-first read-cache once so stale entries don't
  // masquerade as offline edits. Flag-guarded — no-op after the first run.
  purgeLegacyDesignCacheOnce();

  // WI-032 — sweep stale v9 backups (older than 1 week) before any read.
  evictStaleBackups();

  // v5 — canonical Design wrapper.
  const rawV5 = window.localStorage.getItem(KEY_PREFIX_V5 + id);
  if (rawV5 !== null) {
    try {
      const parsed = JSON.parse(rawV5) as SerializedDesignV5;
      if (parsed.meta?.schemaVersion === 5) {
        // WI-032 critical fix — run the legacy → frame migration on the
        // raw JSON BEFORE `serializer.fromJSON`. The agocraft schema no
        // longer registers slide / canvas-design / block-doc / media, and
        // `onUnknown: "preserve"` only protects unknown attrs — not whole
        // Items with unknown kinds. Migrating the raw doc first means
        // every Item that reaches fromJSON already has a known kind, so
        // no user data is dropped during validation. `AgocraftDocument`
        // and the serialized v5 doc shape are structurally compatible
        // (id is a brand string), making the cast safe.
        let documentJson = parsed.document;
        if (WI032_MIGRATE_ENABLED) {
          const rawAsAgo = documentJson as unknown as AgocraftDocument;
          const migrated = migrateLegacyKindsToFrame(rawAsAgo);
          if (migrated !== rawAsAgo) {
            // Save the v9 backup before the migrated shape is persisted
            // (RISK-004 §1 — rollback path).
            saveBackupBlob(id, rawV5);
            documentJson = migrated as unknown as typeof documentJson;
          }
        }
        const result = serializer.fromJSON(documentJson, {
          schema: createSchema(),
          features: createFeatureRegistry(),
          // WI-042 / RISK-001 C1.1 — v9 → v10 textAutoResize auto-migration.
          migrations: [migrateTextAutoResizeToLayoutChild, ...DECORATION_ATTR_MIGRATIONS],
          onUnknown: "preserve",
        });
        if (result.ok) {
          // Migration already ran above (or was no-op for frame-only
          // docs). Pass through directly.
          let document = result.document;
          if (WI032_MIGRATE_ENABLED) {
            // Defensive second pass — covers nested legacy Items that
            // somehow survived the raw-JSON pass (shouldn't happen in
            // practice, but kept for safety; no-op on frame-only docs).
            const migrated = migrateLegacyKindsToFrame(document);
            if (migrated !== document) saveBackupBlob(id, rawV5);
            document = migrated;
          }
          // WI-040 — back-fill the root `style.provider` Unit on docs
          // saved before the cascade landed. Existing items keep their
          // raw `var(--*)` colors; they'll resolve via the chrome scope
          // until the user touches a picker (which then writes a
          // StyleRef that walks through this provider's tokens map).
          document = ensureRootStyleProvider(document);
          return {
            id: parsed.id,
            title: parsed.title,
            width: parsed.width,
            height: parsed.height,
            background: parsed.background ?? DEFAULT_DESIGN_BACKGROUND,
            document,
            presentationOrder: parsed.presentationOrder ?? [],
            meta: parsed.meta,
          };
        }
      }
    } catch {
      // fall through to v4
    }
  }

  // v4 → v5 migration.
  const v4Doc = readV4Document(id);
  if (v4Doc !== undefined) {
    const wrapped = wrapDocumentInDesign(v4Doc);
    // v4 docs predate WI-032 paradigm — apply the same frame migration
    // when the WI-032 flag is enabled.
    return WI032_MIGRATE_ENABLED
      ? { ...wrapped, document: migrateLegacyKindsToFrame(wrapped.document) }
      : wrapped;
  }

  return undefined;
}

// ── WI-032 v9 backup helpers ──────────────────────────────────────────────

interface V9BackupBlob {
  /** Raw V5 serialized doc — the exact bytes that lived at
   *  `weave.design.v5.<id>` before the WI-032 migration rewrote it. */
  readonly v5: string;
  /** ISO timestamp the backup was saved. Used for TTL eviction. */
  readonly savedAt: string;
}

function saveBackupBlob(id: string, rawV5: string): void {
  // Skip if a backup already exists — the first migration wins so a re-load
  // after schema-only field changes doesn't overwrite the original snapshot.
  const key = KEY_PREFIX_V9_BACKUP + id;
  if (window.localStorage.getItem(key) !== null) return;
  const blob: V9BackupBlob = { v5: rawV5, savedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(key, JSON.stringify(blob));
  } catch {
    // localStorage quota — backup is best-effort, do not fail the load.
  }
}

function evictStaleBackups(): void {
  const now = Date.now();
  const toDelete: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key === null || !key.startsWith(KEY_PREFIX_V9_BACKUP)) continue;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) continue;
      const blob = JSON.parse(raw) as V9BackupBlob;
      const age = now - Date.parse(blob.savedAt);
      if (Number.isFinite(age) && age > BACKUP_TTL_MS) toDelete.push(key);
    } catch {
      toDelete.push(key); // corrupt entry — drop
    }
  }
  for (const k of toDelete) window.localStorage.removeItem(k);
}

/** Test-only — peek the backup blob for a given design id. Returns undefined
 *  when no backup exists. Exported so the migration unit test can assert
 *  RISK-004 condition #1 (a backup gets written when migration fires). */
export function readV9Backup(id: string): V9BackupBlob | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = window.localStorage.getItem(KEY_PREFIX_V9_BACKUP + id);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as V9BackupBlob;
  } catch {
    return undefined;
  }
}

/** Serialize a runtime `Design` into the persisted v5 blob shape (shared
 *  by the cloud push and the offline outbox so both see identical bytes). */
function toSerializedDesign(design: Design): SerializedDesignV5 {
  return {
    id: design.id,
    title: design.title,
    width: design.width,
    height: design.height,
    background: design.background,
    document: serializer.toJSON(design.document),
    presentationOrder: design.presentationOrder,
    meta: design.meta,
  };
}

/** Drop the offline outbox copy for `id`. Touches ONLY localStorage —
 *  unlike `clearDesign`, it never deletes the server entry. Used when an
 *  offline edit has been synced (or explicitly discarded) so a later
 *  open no longer prompts. */
export function removeLocalDesign(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY_PREFIX_V5 + id);
}

export function saveDesign(design: Design): void {
  if (typeof window === "undefined") return;
  const blob = toSerializedDesign(design);
  // Offline outbox — keep the work locally ONLY while the network is down
  // so nothing is lost. The fire-and-forget cloud push below still runs;
  // if it lands, the next successful awaitable save (or open-time sync)
  // clears this entry. While online we never touch LS.
  if (isOffline()) {
    window.localStorage.setItem(KEY_PREFIX_V5 + design.id, JSON.stringify(blob));
  }
  // Mirror to cloud (fire-and-forget). Loaded lazily so unit tests don't
  // pull the cloud module by default.
  void import("./cloud-sync.js")
    .then((m) => {
      m.pushDesignCloud(blob as unknown as Design);
    })
    .catch(() => {
      /* dev / offline — silently skip; the offline outbox above retains it */
    });
}

/** Awaitable cousin of `saveDesign`. Awaits the cloud round-trip and
 *  reconciles the offline outbox against the result: on success the
 *  outbox copy for this id is dropped (the server now has it); on failure
 *  the blob is parked in the outbox so the edit survives until the next
 *  successful save. Used by the manual save button (and the offline-
 *  reconcile prompt's "저장") so the UI can reflect the real outcome. */
export async function saveDesignAwaitable(design: Design): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const blob = toSerializedDesign(design);
  let ok = false;
  try {
    const m = await import("./cloud-sync.js");
    ok = await m.pushDesignCloudAwaitable(blob as unknown as Design);
  } catch {
    ok = false;
  }
  if (ok) {
    // Synced — drop any offline outbox copy so reopening won't prompt.
    window.localStorage.removeItem(KEY_PREFIX_V5 + design.id);
  } else {
    // Couldn't reach the server — retain the edit in the offline outbox.
    window.localStorage.setItem(KEY_PREFIX_V5 + design.id, JSON.stringify(blob));
  }
  return ok;
}

/** Lightweight summary used by the workspace listing — we don't fully
 *  deserialize the document for each entry. Reads each `weave.design.v5.*`
 *  key, parses the top-level metadata, returns the array. Newest first. */
export interface DesignSummary {
  readonly id: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly background: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function listAllDesigns(): ReadonlyArray<DesignSummary> {
  if (typeof window === "undefined") return [];
  // Same one-time purge as loadDesign — whichever LS read fires first wins.
  purgeLegacyDesignCacheOnce();
  const out: DesignSummary[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key === null) continue;
    if (!key.startsWith(KEY_PREFIX_V5)) continue;
    const raw = window.localStorage.getItem(key);
    if (raw === null) continue;
    try {
      const parsed = JSON.parse(raw) as Partial<SerializedDesignV5>;
      if (parsed.meta?.schemaVersion !== 5) continue;
      if (typeof parsed.id !== "string") continue;
      out.push({
        id: parsed.id,
        title: parsed.title ?? "Untitled",
        width: parsed.width ?? 1920,
        height: parsed.height ?? 1080,
        background: parsed.background ?? DEFAULT_DESIGN_BACKGROUND,
        createdAt: parsed.meta.createdAt,
        updatedAt: parsed.meta.updatedAt,
      });
    } catch {
      /* skip malformed entries */
    }
  }
  out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return out;
}

export function clearDesign(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY_PREFIX_V5 + id);
  window.localStorage.removeItem(KEY_PREFIX_V4 + id);
  window.localStorage.removeItem(LEGACY_PREFIX_V3 + id);
  window.localStorage.removeItem(LEGACY_PREFIX_V2 + id);
  window.localStorage.removeItem(LEGACY_PREFIX_V1 + id);
  void import("./cloud-sync.js")
    .then((m) => m.deleteDesignCloud(id))
    .catch(() => {
      /* dev / offline — silently skip */
    });
}

/** Read a v4 (AgocraftDocument) or any older legacy blob, returning an
 *  AgocraftDocument. Used internally by `loadDesign` for migration. */
function readV4Document(id: string): AgocraftDocument | undefined {
  if (typeof window === "undefined") return undefined;

  const rawV4 = window.localStorage.getItem(KEY_PREFIX_V4 + id);
  if (rawV4 !== null) {
    try {
      const parsed = JSON.parse(rawV4);
      const result = serializer.fromJSON(parsed, {
        schema: createSchema(),
        features: createFeatureRegistry(),
        // WI-042 / RISK-001 C1.1 — v9 → v10 textAutoResize auto-migration.
        migrations: [migrateTextAutoResizeToLayoutChild, ...DECORATION_ATTR_MIGRATIONS],
        onUnknown: "preserve",
      });
      if (result.ok) return result.document;
    } catch {
      // fall through
    }
  }

  const rawV3 = window.localStorage.getItem(LEGACY_PREFIX_V3 + id);
  if (rawV3 !== null) {
    try {
      const parsed = JSON.parse(rawV3) as Document;
      if (parsed.schemaVersion === 3) return toAgocraftDocument(parsed);
    } catch {
      // fall through
    }
  }

  const rawV2 = window.localStorage.getItem(LEGACY_PREFIX_V2 + id);
  if (rawV2 !== null) {
    try {
      const legacy = JSON.parse(rawV2) as LegacyDocumentV2;
      if (legacy.schemaVersion === 2) return toAgocraftDocument(migrateV2ToV3(legacy));
    } catch {
      // fall through
    }
  }

  const rawV1 = window.localStorage.getItem(LEGACY_PREFIX_V1 + id);
  if (rawV1 !== null) {
    try {
      const legacy = JSON.parse(rawV1) as LegacyDocumentV1;
      if (legacy.schemaVersion === 1) {
        return toAgocraftDocument(migrateV2ToV3(migrateV1ToV2(legacy)));
      }
    } catch {
      // give up
    }
  }

  return undefined;
}

// ── Deprecated — kept until Phase 10b removes the doc-page surface ─────────
//
// These export the v4 path that the legacy DemoDocPage uses. Phase 10b's
// DesignPage uses `loadDesign` / `saveDesign` / `clearDesign` exclusively.

/** @deprecated use `loadDesign(id)` instead. */
export function loadDocument(id: string): AgocraftDocument | undefined {
  return readV4Document(id);
}

/** @deprecated use `saveDesign(design)` instead. */
export function saveDocument(doc: AgocraftDocument): void {
  if (typeof window === "undefined") return;
  const serialized = serializer.toJSON(doc);
  window.localStorage.setItem(KEY_PREFIX_V4 + doc.id, JSON.stringify(serialized));
}

/** @deprecated use `clearDesign(id)` instead. */
export function clearDocument(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY_PREFIX_V4 + id);
  window.localStorage.removeItem(LEGACY_PREFIX_V3 + id);
  window.localStorage.removeItem(LEGACY_PREFIX_V2 + id);
  window.localStorage.removeItem(LEGACY_PREFIX_V1 + id);
}

// ── Exported helpers for Phase 10b's NewDesignWizard / DesignPage ──────────

/** Build a fresh Design — empty agocraft document with the given title / size.
 *  Phase 10b's NewDesignWizard uses this when the user clicks "Create".
 *  Items are added through `editor.exec("weave.item.add", ...)` afterwards. */
export function createBlankDesign(input: {
  readonly id: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly flavor?: string;
  readonly background?: string;
}): Design {
  const now = new Date().toISOString();
  const schema = createSchema();
  const document: AgocraftDocument = ensureRootStyleProvider({
    id: input.id,
    schema,
    root: {
      id: itemId(`${input.id}-root`),
      kind: "weave-doc",
      attrs: { title: input.title, flavor: input.flavor ?? "mixed" },
      units: [],
      children: [],
      meta: { createdAt: now, updatedAt: now, schemaVersion: 5 },
    },
    meta: {
      createdAt: now,
      updatedAt: now,
      schemaVersion: 5,
      schemaRefs: [
        // WI-032 Phase 3 — single canvas container + primitives.
        { kind: "weave-doc", schemaVersion: 5 },
        { kind: "frame", schemaVersion: 5 },
      ],
      userMeta: { title: input.title, weaveDocId: input.id },
    },
  });
  return {
    id: input.id,
    title: input.title,
    width: input.width,
    height: input.height,
    background: input.background ?? DEFAULT_DESIGN_BACKGROUND,
    document,
    presentationOrder: [],
    meta: { createdAt: now, updatedAt: now, schemaVersion: 5 },
  };
}
