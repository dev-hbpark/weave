// WI-032 Phase 2 — Legacy 4-domain → `frame` migration.
//
// Recursively rewrites every legacy domain Item in an AgocraftDocument:
//
//   slide          → frame + text(title) + N×text("• "+bullet)
//   canvas-design  → frame + N×shape(rectangle, paintSolid(hue)) + text(summary)?
//   block-doc      → frame + text(heading) + text(paragraphs joined)
//   media          → frame + image|video(empty src) + text(caption)?
//
// The visual semantic is preserved — same frame box, same approximate text
// positions, same shape colors. Migration is idempotent: a doc that already
// uses `frame` is returned unchanged (deep equality via reference where
// possible).
//
// RISK-004 condition #1+#2 gate this module — every conversion has a
// round-trip unit test in `migrate-frame-only.test.ts`.

import {
  type Document as AgocraftDocument,
  type Item as AgocraftItem,
  FILL_UNIT_KIND,
  type BuiltinItemFrame as ItemFrame,
  type ItemMeta,
  itemId as makeItemId,
  unitId as makeUnitId,
  type PaintSpec,
  paintSolid,
  type Unit,
} from "@agocraft/core";

/** Keep in sync with `agocraft-mirror.ts:31` `SCHEMA_VERSION`. */
const SCHEMA_VERSION = 3;

type LegacyKind = "slide" | "canvas-design" | "block-doc" | "media";

/** Public entry point — walk the doc's tree and rewrite legacy domain Items
 *  to `frame` + primitive children. Idempotent: docs already free of legacy
 *  kinds are returned with `===` identity. */
export function migrateLegacyKindsToFrame(doc: AgocraftDocument): AgocraftDocument {
  const nextRoot = migrateItem(doc.root);
  if (nextRoot === doc.root) return doc;
  return { ...doc, root: nextRoot };
}

/** Per-Item walker. Recurses into children first, then converts this Item
 *  if its kind is one of the legacy 4. Returns the original reference when
 *  nothing inside changed (cheap upstream identity check). */
function migrateItem(item: AgocraftItem): AgocraftItem {
  // Walk children first.
  let childrenChanged = false;
  const nextChildren: AgocraftItem[] = item.children.map((c) => {
    const n = migrateItem(c);
    if (n !== c) childrenChanged = true;
    return n;
  });

  const kind = item.kind;
  if (!isLegacyKind(kind)) {
    const base = childrenChanged ? { ...item, children: nextChildren } : item;
    // WI-095 follow-up — an already-`frame` item that still carries a legacy
    // `attrs.background` gets it lifted to a decoration.fill unit on load.
    return kind === "frame" ? liftFrameBackground(base) : base;
  }

  // Compose the new frame + primitive children from the legacy attrs.
  const ts = item.meta.updatedAt ?? item.meta.createdAt ?? new Date().toISOString();
  const ctx: BuildCtx = {
    parentId: String(item.id),
    now: ts,
  };
  const frameAttrs = pickFrame(item.attrs);
  const seeded = convertLegacy(kind, item.attrs, ctx);
  // Existing children (any nested legacy doc the user previously dropped in)
  // are preserved alongside the seeded primitive children. Recursion above
  // already migrated them.
  const allChildren = [...seeded, ...nextChildren];
  // Legacy units (camera-target etc.) are dropped during v1 migration.
  // The legacy `attrs.background` is lifted to a decoration.fill unit
  // (frame backgrounds are units now, not an attr) by `liftFrameBackground`.
  return liftFrameBackground({
    id: item.id, // preserve id so undo / sync / refs stay valid
    kind: "frame",
    attrs: frameAttrs,
    units: [],
    children: allChildren,
    meta: item.meta as ItemMeta,
  });
}

/** WI-095 follow-up — frame backgrounds are `decoration.fill` UNITS, not
 *  `attrs.background`. Lift any legacy `attrs.background` (a CSS string OR a
 *  `StyleRef` theme token) on a frame into a solid `decoration.fill` unit and
 *  strip the attr. Idempotent: a frame with no background is returned as-is;
 *  a frame that already has a fill unit keeps it (the unit wins) and only the
 *  dead attr is removed. */
function liftFrameBackground(item: AgocraftItem): AgocraftItem {
  const attrs = item.attrs as Readonly<Record<string, unknown>>;
  const background = attrs.background;
  if (background === undefined) return item;
  const rest = { ...attrs };
  delete (rest as Record<string, unknown>).background;
  const hasFill = item.units.some((u) => u.kind === FILL_UNIT_KIND);
  const units = hasFill ? item.units : [...item.units, makeBackgroundFillUnit(item, background)];
  return { ...item, attrs: rest, units };
}

/** Build the solid `decoration.fill` unit for a lifted frame background. The
 *  value (CSS string or `StyleRef`) lives in the PaintSpec `color` slot — the
 *  StyleResolver cascade reads it at render time, same as a shape fill. The
 *  unit id is deterministic from the frame id so re-running the migration is
 *  idempotent. */
function makeBackgroundFillUnit(item: AgocraftItem, color: unknown): Unit {
  const paint = { type: "solid", color } as unknown as PaintSpec;
  return {
    id: makeUnitId(`${String(item.id)}--bgfill`),
    kind: FILL_UNIT_KIND,
    attrs: paint as unknown as Readonly<Record<string, unknown>>,
    meta: { schemaVersion: SCHEMA_VERSION },
  };
}

interface BuildCtx {
  readonly parentId: string;
  readonly now: string;
}

/** Dispatch — one factory per legacy kind. Open-Closed: adding a new legacy
 *  kind = add one entry to this table. No `switch` inside business code. */
const CONVERTERS: Readonly<
  Record<LegacyKind, (attrs: Readonly<Record<string, unknown>>, ctx: BuildCtx) => AgocraftItem[]>
> = {
  slide: (attrs, ctx) => {
    const title = (attrs.title as string | undefined) ?? "";
    const bullets = (attrs.bullets as ReadonlyArray<string> | undefined) ?? [];
    const out: AgocraftItem[] = [];
    if (title.length > 0) {
      out.push(
        buildText(ctx, "title", title, {
          frame: rectFrame(0.06, 0.1, 0.88, 0.18),
          fontSize: 32,
          fontWeight: "bold",
          color: "var(--text-strong)",
        }),
      );
    }
    bullets.forEach((b, i) => {
      out.push(
        buildText(ctx, `bullet-${i}`, `• ${b}`, {
          frame: rectFrame(0.06, 0.32 + i * 0.13, 0.88, 0.1),
          fontSize: 18,
          color: "var(--text-default)",
        }),
      );
    });
    return out;
  },
  "canvas-design": (attrs, ctx) => {
    const summary = (attrs.summary as string | undefined) ?? "";
    const shapes =
      (attrs.shapes as
        | ReadonlyArray<{
            readonly id: string;
            readonly x: number;
            readonly y: number;
            readonly width: number;
            readonly height: number;
            readonly rotation: number;
            readonly hue: string;
          }>
        | undefined) ?? [];
    const out: AgocraftItem[] = shapes.map((s, i) =>
      buildShape(ctx, `shape-${s.id ?? i}`, paintSolid(s.hue ?? "var(--accent)"), {
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        rotation: s.rotation ?? 0,
      }),
    );
    if (summary.length > 0) {
      out.push(
        buildText(ctx, "summary", summary, {
          frame: rectFrame(0.05, 0.9, 0.9, 0.08),
          fontSize: 16,
          color: "var(--text-soft)",
        }),
      );
    }
    return out;
  },
  "block-doc": (attrs, ctx) => {
    const heading = (attrs.heading as string | undefined) ?? "";
    const paragraphs = (attrs.paragraphs as ReadonlyArray<string> | undefined) ?? [];
    const out: AgocraftItem[] = [];
    if (heading.length > 0) {
      out.push(
        buildText(ctx, "heading", heading, {
          frame: rectFrame(0.06, 0.06, 0.88, 0.12),
          fontSize: 28,
          fontWeight: "bold",
          color: "var(--text-strong)",
        }),
      );
    }
    if (paragraphs.length > 0) {
      out.push(
        buildText(ctx, "paragraphs", paragraphs.join("\n"), {
          frame: rectFrame(0.06, 0.22, 0.88, 0.72),
          fontSize: 16,
          color: "var(--text-default)",
        }),
      );
    }
    return out;
  },
  media: (attrs, ctx) => {
    const caption = (attrs.caption as string | undefined) ?? "";
    const tone = (attrs.tone as "image" | "video" | undefined) ?? "image";
    const out: AgocraftItem[] = [buildMedia(ctx, "media", tone, rectFrame(0.05, 0.05, 0.9, 0.85))];
    if (caption.length > 0) {
      out.push(
        buildText(ctx, "caption", caption, {
          frame: rectFrame(0.05, 0.92, 0.9, 0.06),
          fontSize: 14,
          color: "var(--text-soft)",
        }),
      );
    }
    return out;
  },
};

function convertLegacy(
  kind: LegacyKind,
  attrs: Readonly<Record<string, unknown>>,
  ctx: BuildCtx,
): AgocraftItem[] {
  return CONVERTERS[kind](attrs, ctx);
}

// ── helpers ─────────────────────────────────────────────────────────────

function isLegacyKind(kind: string): kind is LegacyKind {
  return kind === "slide" || kind === "canvas-design" || kind === "block-doc" || kind === "media";
}

function rectFrame(x: number, y: number, width: number, height: number): ItemFrame {
  return { x, y, width, height, rotation: 0 };
}

function pickFrame(
  attrs: Readonly<Record<string, unknown>>,
): Readonly<{ frame: ItemFrame; background?: string }> {
  const frame = (attrs.frame as ItemFrame | undefined) ?? rectFrame(0, 0, 1, 1);
  const background = attrs.background as string | undefined;
  if (background === undefined) return { frame };
  return { frame, background };
}

interface TextOverrides {
  readonly frame: ItemFrame;
  readonly fontSize: number;
  readonly fontWeight?: "bold" | "normal";
  readonly color: string;
}

function buildText(
  ctx: BuildCtx,
  suffix: string,
  text: string,
  override: TextOverrides,
): AgocraftItem {
  const attrs: Readonly<Record<string, unknown>> = {
    frame: override.frame,
    text,
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    fontSize: override.fontSize,
    fontWeight: override.fontWeight ?? "normal",
    fontStyle: "normal",
    color: override.color,
    textAlign: "left",
    textAlignHorizontal: "LEFT",
    lineHeight: 1.4,
    lineHeightSpec: { value: 1.4, unit: "multiplier" },
    letterSpacing: 0,
    opacity: 1,
    shadow: null,
    // textAutoResize removed in agocraft schema v10 (WI-019 B4, T3 Modify).
    // Layout intent moves to attrs.layoutChild. Legacy designs are auto-
    // migrated by migrateTextAutoResizeToLayoutChild; new seeds leave
    // layoutChild undefined and rely on derive-from-policy at render time.
    textTruncation: "DISABLED",
    maxLines: null,
    textAlignVertical: "TOP",
    textDecoration: "NONE",
    textCase: "ORIGINAL",
    paragraphSpacing: 0,
    paragraphIndent: 0,
    hyperlink: null,
    textRuns: [{ insert: text }],
  };
  return makeChild(ctx, "text", suffix, attrs);
}

function buildShape(
  ctx: BuildCtx,
  suffix: string,
  fill: PaintSpec,
  frame: ItemFrame,
): AgocraftItem {
  const attrs: Readonly<Record<string, unknown>> = {
    frame,
    shape: "rectangle",
    fill,
    stroke: null,
    shadow: null,
    opacity: 1,
    subAttrs: { shape: "rectangle", cornerRadii: { tl: 0, tr: 0, br: 0, bl: 0 } },
  };
  return makeChild(ctx, "shape", suffix, attrs);
}

function buildMedia(
  ctx: BuildCtx,
  suffix: string,
  tone: "image" | "video",
  frame: ItemFrame,
): AgocraftItem {
  if (tone === "video") {
    const attrs: Readonly<Record<string, unknown>> = {
      frame,
      src: "",
      poster: null,
      autoplay: false,
      loop: false,
      muted: true,
      controls: true,
      fit: "cover",
      volume: 1,
      playbackRate: 1,
      borderRadius: 0,
      opacity: 1,
      shadow: null,
    };
    return makeChild(ctx, "video", suffix, attrs);
  }
  const attrs: Readonly<Record<string, unknown>> = {
    frame,
    src: "",
    alt: "",
    fit: "cover",
    borderRadius: 0,
    opacity: 1,
    filter: {},
    shadow: null,
  };
  return makeChild(ctx, "image", suffix, attrs);
}

function makeChild(
  ctx: BuildCtx,
  kind: "text" | "shape" | "image" | "video",
  suffix: string,
  attrs: Readonly<Record<string, unknown>>,
): AgocraftItem {
  // Deterministic id derived from parent — same input doc produces the same
  // output ids, which keeps history / sync / refs stable across migration
  // re-runs.
  const id = makeItemId(`${ctx.parentId}--${suffix}`);
  return {
    id,
    kind,
    attrs,
    units: [],
    children: [],
    meta: {
      createdAt: ctx.now,
      updatedAt: ctx.now,
      schemaVersion: SCHEMA_VERSION,
    },
  };
}
