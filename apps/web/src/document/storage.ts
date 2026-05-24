import {
  type Document as AgocraftDocument,
  type Item as AgocraftItem,
  createFeatureRegistry,
  createSchema,
  createSerializer,
  itemId,
} from "@agocraft/core";
import { toAgocraftDocument } from "./agocraft-mirror.js";
import { DEFAULT_DESIGN_BACKGROUND, FULL_FRAME } from "./types.js";
import type { CanvasShape, Design, Document, Item, ItemFrame } from "./types.js";

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

interface SerializedDesignV5 {
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
      return {
        id: it.id,
        kind: "canvas-design",
        attrs: { frame: FULL_FRAME, summary: oldAttrs.summary, shapes },
        behaviors: it.behaviors as Item["behaviors"],
        createdAt: it.createdAt,
      } as Item;
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

function deepNormalizeItem(item: AgocraftItem, designWidth: number, designHeight: number): AgocraftItem {
  // Attach default frame if missing.
  const attrs = item.attrs as Readonly<Record<string, unknown>>;
  let nextAttrs: Readonly<Record<string, unknown>> = attrs;
  if ((attrs as { frame?: ItemFrame }).frame === undefined) {
    nextAttrs = { ...attrs, frame: FULL_FRAME };
  }
  // Canvas shapes — percent → ratio.
  if (item.kind === "canvas-design") {
    const a = nextAttrs as unknown as { readonly summary: string; readonly shapes: ReadonlyArray<CanvasShape> };
    const looksPercent = a.shapes.some((s) => s.x > 1.0001 || s.y > 1.0001 || s.width > 1.0001 || s.height > 1.0001);
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
    nextKind = "slide";
    const a = nextAttrs as { width?: unknown; height?: unknown; flavor?: unknown };
    if (a.width !== undefined || a.height !== undefined || a.flavor !== undefined) {
      const {
        width: _w,
        height: _h,
        flavor: _f,
        ...rest
      } = nextAttrs as Record<string, unknown>;
      nextAttrs = { ...rest, bullets: [], title: (a as { title?: string }).title ?? "Slide" };
    }
  }
  // Camera-target units — absolute → ratio.
  const nextUnits = item.units.map((u) => {
    if (u.kind !== "camera-target") return u;
    const carried = u.attrs.behavior as { position?: { x: number; y: number } } | undefined;
    if (carried === undefined || carried.position === undefined) return u;
    const looksAbsolute = Math.abs(carried.position.x) > 1.0001 || Math.abs(carried.position.y) > 1.0001;
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

export function loadDesign(id: string): Design | undefined {
  if (typeof window === "undefined") return undefined;

  // v5 — canonical Design wrapper.
  const rawV5 = window.localStorage.getItem(KEY_PREFIX_V5 + id);
  if (rawV5 !== null) {
    try {
      const parsed = JSON.parse(rawV5) as SerializedDesignV5;
      if (parsed.meta?.schemaVersion === 5) {
        const result = serializer.fromJSON(parsed.document, {
          schema: createSchema(),
          features: createFeatureRegistry(),
          onUnknown: "preserve",
        });
        if (result.ok) {
          return {
            id: parsed.id,
            title: parsed.title,
            width: parsed.width,
            height: parsed.height,
            background: parsed.background ?? DEFAULT_DESIGN_BACKGROUND,
            document: result.document,
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
  if (v4Doc !== undefined) return wrapDocumentInDesign(v4Doc);

  return undefined;
}

export function saveDesign(design: Design): void {
  if (typeof window === "undefined") return;
  const docBlob = serializer.toJSON(design.document);
  const blob: SerializedDesignV5 = {
    id: design.id,
    title: design.title,
    width: design.width,
    height: design.height,
    background: design.background,
    document: docBlob,
    presentationOrder: design.presentationOrder,
    meta: design.meta,
  };
  window.localStorage.setItem(KEY_PREFIX_V5 + design.id, JSON.stringify(blob));
  // WI-025 — mirror to cloud (fire-and-forget). The cloud sees the same
  // serialized blob as localStorage. Loaded lazily so unit tests don't
  // pull the cloud module by default.
  void import("./cloud-sync.js")
    .then((m) => {
      m.pushDesignCloud(blob as unknown as Design);
    })
    .catch(() => {
      /* dev / offline — silently skip */
    });
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
  const document: AgocraftDocument = {
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
        { kind: "weave-doc", schemaVersion: 5 },
        { kind: "slide", schemaVersion: 5 },
        { kind: "canvas-design", schemaVersion: 5 },
        { kind: "block-doc", schemaVersion: 5 },
        { kind: "media", schemaVersion: 5 },
      ],
      userMeta: { title: input.title, weaveDocId: input.id },
    },
  };
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
