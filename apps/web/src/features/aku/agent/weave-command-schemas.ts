// 아쿠 (Aku) — agent command schemas for every weave editing command (WI-054).
//
// weave registers ~29 `weave.*` commands on its CommandRegistry
// (`document/commands.ts`). When that registry is handed to
// `connectAgocraftAgent`, the bridge (`describeCommands` → `createCommandTools`)
// turns EVERY command into an agent tool — so coverage is automatic. These
// schemas are the argument contracts the agent reasons against: passed as
// `connectAgocraftAgent({ schemas })`, they are the highest-precedence layer
// (over `AGENT_COMMAND_SCHEMAS` + any valibot-derived schemas).
//
// The input shapes mirror `document/commands.ts` exactly. Kit commands whose
// `weave.*` name is just the canonical name under our prefix AND whose contract is
// byte-identical (item.remove / item.reparent / clipboard.copy / clipboard.cut /
// item.duplicate) are re-exposed BY IMPORT via `retargetCommandSchemas` (KIT_SCHEMAS
// below, DR-039) — not hand-copied — so an upstream kit-contract change surfaces as a
// build break instead of silent drift. The remaining kit-derived commands stay inline
// because they either RENAME the key (z-order bringToFront ← agocraft.zOrder.moveToTop,
// design.reorderChildren ← children.reorder, frame.removeKeepingChildren ← frame.dissolve)
// or EXTEND the shape (clipboard.paste paste-special) — prefix-retarget covers neither.
//
// Two commands (`weave.item.update`, `weave.behavior.update`) take a function
// `patch` in their UI-facing signature, which an agent can't send over JSON.
// `document/commands.ts` accepts a declarative `attrs` / `behavior` alternative
// for exactly this surface (WI-054) — these schemas advertise only the
// declarative form.

import { type AgentCommandSpec, retargetCommandSchemas } from "@agocraft/agent-client";

// `JsonSchema` is `Readonly<Record<string, unknown>>` (the small-think contract);
// alias it locally so we need no direct @small-think/client dependency.
type Json = Readonly<Record<string, unknown>>;

// ── JSON Schema helpers (mirror the kit's own builders) ──────────────────────
const STR: Json = { type: "string" };
const NUM: Json = { type: "number" };
const STR_ARR: Json = { type: "array", items: { type: "string" } };
/** Open object — the agent supplies a partial attrs/policy bag. */
const ATTRS: Json = { type: "object", additionalProperties: true };

// Frame coordinate-base note. `weave.item.add` advertises `frame` as a typed
// schema (the FRAME const, with per-field descriptions), but the attrs-editing
// commands (`weave.item.update` / `weave.items.update`) take an OPEN attrs bag
// where `frame` is not a typed field — so the base reaches the agent only via
// this note folded into the bag's description.
const FRAME_BASE_NOTE =
  "attrs.frame = { x, y, width, height, rotation }: x/y/width/height are 0..1 ratios of the item's OWN " +
  "PARENT box (a top-level item's parent = the whole DESIGN; a nested item's parent = its containing " +
  "frame, NOT the slide/design); x/y = top-left corner, rotation = radians about the center. NEVER pixels.";

// Frame attrs note. Nested frames are the primary layout tool — but a nested
// frame is a SLIDE by default, so the agent must opt it out of the deck.
const FRAME_ATTRS_NOTE =
  "For frame items: a TOP-LEVEL frame (no containerId) is a SLIDE; a NESTED frame (containerId set) is a " +
  "layout container — give it attrs.layout via weave.frame.setLayout (auto-flex / auto-grid) and set " +
  "attrs.presentable:false so it stays a LAYOUT GROUP, not an extra slide. attrs.cornerRadius = corner radius " +
  "in ABSOLUTE design-px (drawn circular, auto-capped at min(w,h)/2; ~12–24 for a soft round, a large value = " +
  "pill). Per-corner: attrs.cornerRadii { tl, tr, br, bl } (px) overrides the uniform value.";

// Text attrs sizing note, shared by `weave.item.add` (attrsOverride) and
// `weave.item.update` (attrs). The detailed per-field model (units, defaults,
// resize modes, role-based fontSize guidance) lives in WEAVE_CAPABILITIES'
// `text` itemKind; this is the one-line reminder the agent sees on the command.
const TEXT_ATTRS_NOTE =
  "For text items: size with attrs.fontSizeSpec { kind:'px', value } — the ABSOLUTE design-px size (e.g. 64 for " +
  "a heading, 32 for body, off the canvas px in the [디자인] line). It is FIXED (DR-101): the text renders at " +
  "exactly that design-px and does NOT rescale when a frame/parent is resized (only the whole-canvas zoom scales " +
  "it), so the px means the same everywhere — no per-nesting math. Body/content (findings, bullets, descriptions) " +
  "must be ≥ ~3% of canvas height (≈32px on 1080); caption sizes are for footnotes only. ({ kind:'ratio', value } " +
  "still renders (value × parent height) but is NOT recommended — it rescales on resize; prefer px. NEVER put a " +
  "fraction in the plain fontSize number (0.07 → sub-pixel text).) Other WHOLE-BOX fields: text, fontFamily, fontWeight, fontStyle, color, " +
  "textAlignHorizontal/Vertical, lineHeightSpec, letterSpacing. " +
  "PARTIAL/PER-RANGE styling (부분편집 — color/bold/etc. on PART of the text, e.g. one emphasized word or " +
  "number): set attrs.textRuns = ordered [{ insert:'<segment>', attributes?:{ color?, fontSize?(px), " +
  "fontFamily?, fontWeight?:'bold', fontStyle?:'italic', textDecoration?, textCase?, letterSpacing?(px), " +
  "outlineColor?, outlineWidth? } }, …] whose inserts concatenate to the full string (a no-attributes run = " +
  "box defaults; '\\n' = line break). textRuns is canonical: it sets the visible text AND its inline styling; " +
  "setting attrs.text alone replaces the whole string and RESETS per-range style. To restyle one span on " +
  "existing text, read the current textRuns from the snapshot, edit only the run(s) you want, and resend the " +
  "full array. " +
  "OUTLINE (외곽선): attrs.textOutline = { color, width(px) } draws a halo around the WHOLE text (omit / width<=0 " +
  "= none) — use it for a heading/number over a busy image or same-tone fill; for ONE word use outlineColor/" +
  "outlineWidth inside that textRuns run. attrs.textOverflow = 'VISIBLE'|'HIDDEN' (clip vs spill). attrs.hyperlink " +
  "= a URL makes the whole text a link (null = none; per-range link → a run; non-text item link → a button-trigger " +
  "behavior). " +
  // DR-098 — match the box-sizing lever to the text's context (3 cases).
  "BOX SIZING — pick by context: (1) FREE-PLACED text (added to the root or an absolute-constraints frame) is a " +
  "FIXED box that does NOT auto-grow — give frame.width AND frame.height enough room at the chosen fontSize and " +
  "set attrs.textOverflow 'VISIBLE' if it may spill. (2) Text added into a FLEX/GRID frame is AUTO-HEIGHT — do NOT " +
  "set or pin frame.height (the layout + content own the height; a guessed height makes the box occupy excessive " +
  "area). (3) For a deliberately ROOMY/FIXED region inside a layout, size the CELL — a grid ratio/fr row track, a " +
  "flex grow/basis on a FRAME, or a wrapper frame — and let the text auto-fit and align inside it " +
  "(textAlignVertical + the cell's align), NEVER a big leaf-text height. " +
  "See the text itemKind capabilities for roles, defaults and full detail.";

// WI-058 — data-driven QR. The code regenerates from `data` on every render.
const QR_ATTRS_NOTE =
  "For qr items: attrs.data is the encoded URL/text (the QR regenerates from it). " +
  "Optional: ecLevel ('L'|'M'|'Q'|'H', default M), moduleStyle ('square'|'dot'|'rounded'), " +
  "margin (quiet-zone modules, default 4), foreground/background (PaintSpec: " +
  "{type:'solid',color} or a linear/radial gradient; background null = transparent). " +
  // WI-140 — built-in centre logo (no upload).
  "Optional logo: {iconId, scale?} centre overlay; iconId is one of " +
  "'link'|'heart'|'star'|'play'|'camera'|'image'|'chart'|'sparkle'|'check'|'diamond'; " +
  "scale is the logo width as a fraction of the code (clamped <=0.25, default 0.2). " +
  "A logo is encoded at EC>=Q automatically so it stays scannable — keep it small.";

// WI-077 — chart items are DATA-DRIVEN and reference a dataset by id; they own
// no data inline. Creation is its own tool (weave.chart.add), so the note steers
// the agent away from the empty-placeholder footgun of weave.item.add+kind:chart.
const CHART_ATTRS_NOTE =
  "For chart items (data-driven): a chart REFERENCES a dataset by attrs.datasetId — it owns NO data inline. " +
  "To CREATE use weave.chart.add (seeds a dataset AND the chart in ONE step — pass dataset:{columns,rows}, " +
  "chartType, and for non-category/value types an explicit encoding + variant); do NOT use weave.item.add with " +
  "kind 'chart' (empty placeholder). " +
  "14 CHART TYPES (attrs.chartType): bar · line · area · pie · funnel · gauge · scatter · bubble · radar · " +
  "heatmap · candlestick · boxplot · treemap · sankey — pick the one that fits the data, not just bar/line/pie. " +
  "ENCODING (attrs.encoding) maps visual channels → dataset columns, each { field:<column>, aggregate? } (value " +
  "may be an ARRAY for multi-series): category+value[] for bar/line/area/pie/funnel/radar; x+y(+size) for " +
  "scatter/bubble; x+y+value for heatmap; category+open/high/low/close for candlestick; category+lower/q1/median/" +
  "q3/upper for boxplot; id+parent(+value) for treemap; source+target(+value) for sankey. " +
  "VARIANT (attrs.variant): { stacked, normalized (100%), horizontal, smooth, innerRadius (pie→doughnut) }. " +
  "STYLE detail, all via weave.item.update { itemId, attrs:{…} }: attrs.palette (series colors, string[]), " +
  "attrs.showLegend / attrs.showAxis (boolean), attrs.opacity (0..1), and attrs.overrides for per-element emphasis " +
  "— { datum:{ '<category>':{ color?, borderWidth?, offset? } }, series:{ '<series>':{ color?, borderWidth? } } } " +
  "(highlight one bar/slice or a whole series). Edit the look/type/encoding/variant/style with weave.item.update; " +
  "edit the DATA with weave.dataset.update. " +
  "PARTIAL chart edits are NON-DESTRUCTIVE: attrs.variant, attrs.encoding and attrs.overrides are DEEP-MERGED " +
  "over the chart's current values, so you may send ONLY the delta — e.g. attrs:{ variant:{ stacked:true } } " +
  "keeps the other variant flags, and attrs:{ overrides:{ datum:{ 'B':{ color:'#e11' } } } } emphasizes ONE bar " +
  "without dropping other datum/series overrides. To CLEAR a key, set its value to null (e.g. " +
  "overrides:{ datum:{ 'B':null } } removes B's emphasis). attrs.palette is a full array (replaced wholesale). " +
  "DATA: put the category/label column FIRST, numeric series after; keep series legible (≈≤5). For colours prefer " +
  "the theme categorical tokens [var(--domain-slide-accent)/--domain-canvas-accent/--domain-block-accent/" +
  "--domain-media-accent] in attrs.palette (distinct + theme-reactive), and GROUND the chart on a card surface " +
  "(a frame behind it with decoration.fill + cornerRadius + soft shadow), not bare canvas. " +
  "TEXT IS REAL TEXT ITEMS (DR-035): for bar/line/area + pie the CATEGORY/axis labels are AUTO-MANAGED text child " +
  "items derived from the dataset — do NOT hand-add them (duplicates), do NOT reposition them, and editing a " +
  "label's TEXT means editing the DATA (use weave.dataset.update). You MAY restyle those label items (color/" +
  "fontWeight/fontSize via weave.item.update — persists across re-projection). ADD YOUR OWN separate text items " +
  "for the chart TITLE, the one-line takeaway, callouts/annotations and a source note — a chart almost always " +
  "needs a human title + takeaway the data labels don't supply.";

// WI-077 — tabular dataset payload, shared by weave.chart.add / weave.dataset.*.
const DATASET_PAYLOAD: Json = {
  type: "object",
  description:
    "Tabular data. `columns` = ordered column names; `rows` = array of row objects keyed by column " +
    "name (cell value string or number). The first column is typically the category/label; numeric " +
    "columns become the chart series. `name` is an optional human label.",
  properties: {
    name: STR,
    columns: STR_ARR,
    rows: { type: "array", items: { type: "object", additionalProperties: true } },
  },
};

// WI-076 — image attrs, incl. the source-less placeholder. The full model lives
// in WEAVE_CAPABILITIES' `image` itemKind; this is the reminder on item.add/update.
const IMAGE_ATTRS_NOTE =
  "For image items: attrs.src (URL/data-URL) is OPTIONAL — OMIT it (or '') for a SOURCE-LESS PLACEHOLDER, " +
  "and set a short attrs.alt (e.g. '제품 사진 자리') which is then drawn as a centered caption to label the " +
  "slot. attrs.fit = cover|contain|fill; attrs.borderRadius = corner radius in ABSOLUTE design-px (circular, " +
  "auto-capped at min(w,h)/2). Per-corner: attrs.borderRadii { tl, tr, br, bl } (px) overrides it. See the " +
  "image itemKind capabilities for full detail.";

// Video attrs, incl. the source-less placeholder (mirrors IMAGE_ATTRS_NOTE). The
// full model lives in WEAVE_CAPABILITIES' `video` itemKind; this is the reminder.
const VIDEO_ATTRS_NOTE =
  "For video items: attrs.src (URL) is OPTIONAL — OMIT it (or '') for a SOURCE-LESS PLACEHOLDER " +
  "(attrs.poster renders as a cover still + play badge, else a play glyph). attrs.alt = short clip " +
  "description (e.g. '제품 데모 영상'), drawn as a centered caption when src is empty — ALWAYS set it. " +
  "attrs.fit = cover|contain|fill; autoplay/loop/muted/controls boolean. See the video itemKind capabilities.";

// WI-139 — oEmbed / iframe embed (YouTube / Vimeo / Loom). Stores attrs.url; the
// iframe src is DERIVED per-render via the provider registry. Full model in
// WEAVE_CAPABILITIES' `embed` itemKind; this is the reminder on item.add/update.
const EMBED_ATTRS_NOTE =
  "For embed items (kind:'embed' — an embedded YouTube/Vimeo/Loom video): attrs.url is the page URL " +
  "(YouTube watch / youtu.be / shorts / live, vimeo.com/<id>, loom.com/share/<id>; a YouTube t/start " +
  "timestamp is carried through). The iframe src is DERIVED from the url — only recognized providers " +
  "render, else a placeholder. attrs.allowFullscreen (boolean, default true), attrs.autoplay (boolean — " +
  "auto-plays MUTED in PRESENT mode only, default off), attrs.opacity (0..1). Give it a 16:9-ish frame. " +
  "Plays in PRESENT mode / when selected in the editor; otherwise shows the thumbnail. See the embed itemKind capabilities.";

// WI-077 — `line` kind attrs (직선 / 자유선 / 곡선 / 자유곡선). The `line` kind is
// STROKE-ONLY (no fill, distinct from shape); colour/width is a decoration.stroke
// unit, not an attr. Full model in WEAVE_CAPABILITIES' `line` itemKind.
const LINE_ATTRS_NOTE =
  "For line items (kind:'line', a STROKE-ONLY line/curve with NO fill): attrs.points = ≥2 {x,y}, each a " +
  "0..1 ratio of the line's OWN bbox; attrs.smooth draws a Catmull-Rom curve (2 points = 직선, many = " +
  "자유선, smooth:true = 곡선/자유곡선) — use this kind for hand-drawn strokes/curves, NOT the parametric " +
  "shape:'line' sub-kind. attrs.heads = { start, end } endpoint markers ('none'|'triangle'|'open'|'diamond'|" +
  "'circle'). Stroke colour/width is a decoration.stroke UNIT (this add call's `units`), NOT an attr. See " +
  "the line itemKind capabilities.";

/** Open attrs bag carrying the text + qr field notes in its description — used by
 *  the two attrs-editing commands so the hint rides along on `item.add` /
 *  `item.update` without bloating the shared `ATTRS` used elsewhere. */
// Shape attrs sizing/creation note. The full per-shape param model lives in
// WEAVE_CAPABILITIES' `shape` itemKind; this is the reminder on item.add/update.
const SHAPE_ATTRS_NOTE =
  "For shape items: set attrs.shape to the sub-kind " +
  "(rectangle|ellipse|line|arrow|triangle|star|polygon|poly|path|speech-bubble|heart); per-kind geometry " +
  "goes in attrs.subAttrs and every field is OPTIONAL (omitted ones auto-fill, so you cannot create an " +
  "invalid shape; if you set subAttrs, set subAttrs.shape to the same sub-kind). Fill/shadow/stroke/opacity/" +
  "filter at CREATION go in this add call's `units`. See the shape itemKind capabilities for the per-kind params.";

// Per-shape valid-field contract advertised to the agent (WI-062). A discriminated
// union on `shape`: each branch lists exactly the geometry fields that sub-kind
// accepts (`additionalProperties:false` → other fields are invalid for that kind),
// and geometry is OPTIONAL (only `shape` is required) because the host fills any
// missing field with a default. This tells the agent up-front which attributes are
// usable per shape; the host's normalization guarantees completeness regardless.
const ARROW_HEAD: Json = {
  type: "string",
  enum: ["none", "triangle", "open", "diamond", "circle"],
};
const SHAPE_SUBATTRS_SCHEMA: Json = {
  type: "object",
  description:
    "Shape geometry, discriminated on `shape`. Geometry fields are OPTIONAL (defaults are " +
    "auto-filled); set only what you want to change. Each sub-kind accepts only the fields shown.",
  oneOf: [
    {
      type: "object",
      properties: {
        shape: { const: "rectangle" },
        cornerRadii: {
          type: "object",
          properties: { tl: NUM, tr: NUM, br: NUM, bl: NUM },
          additionalProperties: false,
        },
      },
      required: ["shape"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { shape: { const: "ellipse" } },
      required: ["shape"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { shape: { const: "line" }, thickness: NUM },
      required: ["shape"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        shape: { const: "arrow" },
        heads: {
          type: "object",
          properties: { start: ARROW_HEAD, end: ARROW_HEAD },
          additionalProperties: false,
        },
        headSize: NUM,
      },
      required: ["shape"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        shape: { const: "triangle" },
        variant: {
          type: "string",
          enum: ["equilateral", "isosceles-up", "isosceles-down", "right-angle"],
        },
      },
      required: ["shape"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { shape: { const: "star" }, points: NUM, innerRatio: NUM },
      required: ["shape"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { shape: { const: "polygon" }, sides: NUM },
      required: ["shape"],
      additionalProperties: false,
    },
    {
      type: "object",
      description:
        "자유 다각형 (freeform polygon) from explicit vertices. points = each a 0..1 ratio of THIS " +
        "shape's OWN bbox; closed:true = filled polygon (default), false = open polyline. " +
        "(For a STROKE-only free line/curve with no fill, use kind:'line' instead.)",
      properties: {
        shape: { const: "poly" },
        points: { type: "array", items: obj({ x: NUM, y: NUM }, ["x", "y"]) },
        closed: { type: "boolean" },
      },
      required: ["shape"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { shape: { const: "path" }, d: STR },
      required: ["shape"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        shape: { const: "speech-bubble" },
        tail: {
          type: "object",
          properties: {
            anchorX: NUM,
            anchorY: NUM,
            direction: { type: "string", enum: ["down", "up", "left", "right", "free"] },
          },
          additionalProperties: false,
        },
        cornerRadius: NUM,
      },
      required: ["shape"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        shape: { const: "heart" },
        variant: { type: "string", enum: ["classic", "rounded"] },
      },
      required: ["shape"],
      additionalProperties: false,
    },
  ],
};

// Open attrs bag, but with the load-bearing structured properties spelled out so
// the agent sees valid fields up-front: `shape` (the sub-kind) + `subAttrs` (the
// per-kind geometry contract above). `additionalProperties: true` keeps the bag
// open for the other kinds' attrs (text / image / qr fields, frame, etc.).
const ATTRS_WITH_TEXT_NOTE: Json = {
  type: "object",
  additionalProperties: true,
  properties: {
    shape: {
      type: "string",
      enum: [
        "rectangle",
        "ellipse",
        "line",
        "arrow",
        "triangle",
        "star",
        "polygon",
        "poly",
        "path",
        "speech-bubble",
        "heart",
      ],
      description: "Shape sub-kind (shape items only). Geometry goes in subAttrs.",
    },
    subAttrs: SHAPE_SUBATTRS_SCHEMA,
  },
  description: `${FRAME_BASE_NOTE} ${FRAME_ATTRS_NOTE} ${TEXT_ATTRS_NOTE} ${QR_ATTRS_NOTE} ${CHART_ATTRS_NOTE} ${SHAPE_ATTRS_NOTE} ${IMAGE_ATTRS_NOTE} ${VIDEO_ATTRS_NOTE} ${EMBED_ATTRS_NOTE} ${LINE_ATTRS_NOTE}`,
};

// WI-063 / WI-078 — units (decoration + transform) attached in ONE call so an item
// is added/edited FULLY STYLED instead of fragmenting create → setFill → setDecoration
// across tool calls. Each { kind, attrs } overlays the unit of that kind (replacing it).
//
// `UNIT_ATTRS_DESC` is the per-kind spec contract, shared by the creation
// (weave.item.add) and edit (weave.item.update / weave.items.update) commands so the
// two never drift. Verified field-for-field against the host Spec types
// (@agocraft/core visual/types.ts; weave transform-flip.ts).
const UNIT_ATTRS_DESC =
  "The spec for `kind`: " +
  "fill → PaintSpec ({type:'solid',color} | {type:'linear-gradient',angle(deg),stops:[{offset:0..1,color},…]} | " +
  "{type:'radial-gradient',cx:0..1,cy:0..1,stops} | {type:'image',src,fit?,opacity?} | " +
  "{type:'video',src,fit?,muted?,loop?,opacity?} | {type:'none'}; paint fit = cover|contain|fill|tile); " +
  "stroke → { paint:<PaintSpec>, width(px), dashArray?:[number,…], lineCap?:'butt'|'round'|'square', " +
  "lineJoin?:'miter'|'round'|'bevel' } (stroke is always centered — NO inside/outside option); " +
  "shadow → { x, y, blur, spread, color, inset? }; " +
  "filter → { brightness?, contrast?, saturate?, blur?(px), hueRotate?(deg) } (ONLY these 5 — " +
  "grayscale/sepia/invert are NOT supported); " +
  "opacity → { value:0..1 }; " +
  "transform.flip → { flipH?:boolean, flipV?:boolean } (mirror the final composition; " +
  "image/video/shape/line/frame only — ignored on text/qr).";

const DECORATION_UNIT_KIND_ENUM = [
  "decoration.fill",
  "decoration.stroke",
  "decoration.shadow",
  "decoration.filter",
  "decoration.opacity",
];

const CREATION_UNITS: Json = {
  type: "array",
  description:
    "Decoration units to attach AT CREATION so the new item is fully styled in this one call " +
    "(do NOT follow up with weave.item.update right after — set them here). Each entry replaces " +
    "any seeded unit of the same kind.",
  items: {
    type: "object",
    properties: {
      kind: { type: "string", enum: DECORATION_UNIT_KIND_ENUM },
      attrs: { type: "object", additionalProperties: true, description: UNIT_ATTRS_DESC },
    },
    required: ["kind", "attrs"],
    additionalProperties: false,
  },
};

// Units on the EDIT commands (weave.item.update / weave.items.update): same decoration
// kinds PLUS transform.flip (mirror), and `attrs: null` CLEARS the unit (e.g. remove a
// shadow). The host routes each entry through the same setDecoration kit (commands.ts).
const EDIT_UNITS: Json = {
  type: "array",
  description:
    "Decoration / transform units to set on the item in this call. Each entry replaces the unit " +
    "of that kind; pass attrs:null to CLEAR it (e.g. remove a shadow, un-flip). Covers fill / " +
    "gradient / shadow / stroke / filter / opacity AND flip (transform.flip).",
  items: {
    type: "object",
    properties: {
      kind: { type: "string", enum: [...DECORATION_UNIT_KIND_ENUM, "transform.flip"] },
      attrs: {
        type: ["object", "null"],
        additionalProperties: true,
        description: `${UNIT_ATTRS_DESC} Pass null to remove the unit.`,
      },
    },
    required: ["kind", "attrs"],
    additionalProperties: false,
  },
};

function obj(
  properties: Readonly<Record<string, Json>>,
  required: ReadonlyArray<string>,
  description?: string,
): Json {
  return {
    type: "object",
    properties,
    required: [...required],
    additionalProperties: false,
    // WI-095 (DR-064) — a top-level `description` on the input schema is the ONLY
    // per-command guidance that reaches the agent: the reverse-MCP tool's own
    // `description` falls back to the bare command NAME (AgentCommandSpec carries no
    // description field), so every command states what it does + when to use it here.
    ...(description !== undefined && description !== "" ? { description } : {}),
  };
}

/** Outer frame box — 0..1 ratios of the PARENT frame (top-level item = the whole
 *  design). Figma-frame paradigm. Every field carries its base so the agent never
 *  guesses what the 0..1 is relative to. */
const FRAME: Json = {
  type: "object",
  description:
    "Bounding box in 0..1 ratios of the PARENT frame's box — a top-level item's parent is the " +
    "whole DESIGN (canvas). NEVER pixels. width and height MUST be > 0: a zero or omitted size " +
    "renders the item at zero area, which makes it invisible AND unselectable (uneditable). " +
    "(Text auto-fits its height from its content, so for text the WIDTH is what matters.)",
  properties: {
    x: {
      type: "number",
      description:
        "Left edge, 0..1 of the PARENT frame's width (top-level = the design width). 0 = parent left edge.",
    },
    y: {
      type: "number",
      description:
        "Top edge, 0..1 of the PARENT frame's height (top-level = the design height). 0 = parent top edge.",
    },
    width: {
      type: "number",
      description: "Width as 0..1 of the PARENT frame's width (1 = full parent width).",
    },
    height: {
      type: "number",
      description: "Height as 0..1 of the PARENT frame's height (1 = full parent height).",
    },
    rotation: {
      type: "number",
      description: "Rotation in radians about the box center (not a ratio).",
    },
  },
  required: ["x", "y", "width", "height"],
  additionalProperties: false,
};

/** The domain item kinds weave can create (`seed.ts`). */
const ITEM_KIND: Json = {
  type: "string",
  enum: ["frame", "image", "video", "shape", "line", "text", "qr", "embed"],
};

/** An interaction behavior payload (camera-target / hotspot / …). Open beyond
 *  the required identity fields so new behavior kinds need no schema change. */
const BEHAVIOR: Json = {
  type: "object",
  properties: { id: STR, kind: STR },
  required: ["id", "kind"],
  additionalProperties: true,
};

/** Frame layout policy (LayoutSpec). Open object — the variant is discriminated
 *  on `kind`, which JSON Schema can't gate cleanly, so the shape rides in the
 *  description (mirrors @agocraft/layout's AutoFlexSpec / AutoGridSpec). Omit
 *  `layout` on the command to CLEAR the frame's layout (back to free placement). */
const LAYOUT_SPEC: Json = {
  type: "object",
  additionalProperties: true,
  description:
    "A LayoutSpec, discriminated on `kind` (faithful CSS flexbox / grid). One of:\n" +
    "• { kind:'absolute-constraints' } — free placement; each child keeps its own frame (default).\n" +
    "• { kind:'auto-flex', direction:'row'|'column', gap, justify, align, padding, wrap?, alignContent? } — flexbox. " +
    "gap = child spacing as a 0..1 ratio of the frame's MAIN axis; " +
    "justify (main-axis) = 'start'|'center'|'end'|'space-between'|'space-around'|'space-evenly'; " +
    "align (cross-axis) = 'start'|'center'|'end'|'stretch'|'baseline' — 'stretch' makes a child FILL the cross axis; for a TEXT child in a COLUMN this is what BOUNDS its WIDTH so it WRAPS (use 'stretch' for text) and it does NOT change the text's height (the main axis); 'baseline' behaves as 'start' here (frames have no text baseline); " +
    "wrap = 'nowrap' (default) | 'wrap' — 'wrap' flows children that overflow the main axis onto NEW LINES (e.g. a tag cloud / chip row / responsive card row that should reflow instead of shrink); " +
    "alignContent = 'start'|'center'|'end'|'stretch'|'space-between'|'space-around'|'space-evenly' — how the wrapped LINES are distributed on the cross axis (only when wrap='wrap' AND there are ≥2 lines; default 'start'); " +
    "padding = { top, right, bottom, left } each a 0..1 ratio of the frame (top/bottom of its height, left/right of its width).\n" +
    "• { kind:'auto-grid', columns, rows, columnGap, rowGap, justify, align, padding, columnsRepeat?, rowsRepeat?, autoFlow?, dense?, areas? } — track grid; the right layout for ANY table / matrix / comparison or card grid (NOT a stack of nested auto-flex rows). " +
    "columns/rows = arrays of TrackSize: { kind:'fr', value } (fractional share) | { kind:'ratio', value } (0..1 of the track axis) | { kind:'auto' } (fit children — use for a row of auto-height text) | { kind:'minmax', min, max } (size between two bounds; each bound is { kind:'ratio', value } | { kind:'fr', value } | { kind:'auto' } — the responsive idiom is minmax({kind:'ratio',value:0.2}, {kind:'fr',value:1})); empty array = one full track. " +
    "columnsRepeat/rowsRepeat = { mode:'auto-fill'|'auto-fit', track:TrackSize } — auto-generate as many copies of `track` as fit the axis (track needs a definite ratio base, e.g. {kind:'ratio',value:0.25}); when set it REPLACES that axis's columns/rows list (responsive card grids). " +
    "autoFlow = 'row' (default) | 'column' and dense = true|false control auto-placement order / hole backfill for children without an explicit cell. " +
    "areas = array of strings, one per row, each space-separated area names ('.' = empty cell) e.g. ['header header','nav main'] — name regions, then place a child with policy.area:'header'. " +
    "columnGap/rowGap = 0..1 ratios of the frame; justify (column-axis) / align (row-axis) = 'start'|'center'|'end'|'stretch' — for a TEXT cell the column track bounds the WIDTH (text wraps to it) so keep an 'auto' row track so the HEIGHT follows content; 'stretch' fills the cell — handy for backgrounds/panels; padding as above.",
};

/** Child policy inside a parent's layout (LayoutChildPolicy). `kind` SHOULD
 *  match the parent frame's layout kind (mismatch falls back to
 *  absolute-constraints, lossless). Omit `policy` to CLEAR it. */
const LAYOUT_CHILD_POLICY: Json = {
  type: "object",
  additionalProperties: true,
  description:
    "A LayoutChildPolicy, discriminated on `kind` (match the parent frame's layout kind). One of:\n" +
    "• { kind:'absolute-constraints', anchor:{ horizontal, vertical } } — pin within the parent.\n" +
    "• { kind:'auto-flex', grow, shrink, basis, alignSelf? } — grow/shrink are flex weights (≥0): grow ≥1 makes the child EXPAND to fill free space on the main axis (use on FRAMES for equal-size regions, NOT on auto-height text — text keeps its content height); " +
    "basis = main-axis base size (a 0..1 ratio of the parent frame's main axis, or 'auto' = use the child's own size — the default for auto-height text); " +
    "alignSelf overrides the parent's cross-axis align for this child ('start'|'center'|'end'|'stretch'|'baseline'; 'stretch' = fill the cross axis — for TEXT in a COLUMN this bounds its WIDTH so it wraps).\n" +
    "• { kind:'auto-grid', column, row, columnSpan, rowSpan, alignSelf?, justifySelf?, area? } — " +
    "column/row are 1-based cell indices; columnSpan/rowSpan (≥1) merge cells; " +
    "area = a name from the parent's `areas` template (e.g. 'header') — when set it PLACES the child into that named region, overriding column/row/span; " +
    "alignSelf (row-axis) / justifySelf (column-axis) override the parent align/justify for this child. The column track bounds a TEXT cell's WIDTH (text wraps to it); keep an 'auto' row track so its HEIGHT follows content — don't vertically stretch text. 'stretch' fully fills the cell — handy for backgrounds/panels.",
};

/** Human labels for the transcript edit-chips (command name → Korean verb).
 *  Reused as each spec's `label`, so the two never drift. */
export const WEAVE_COMMAND_LABELS: Readonly<Record<string, string>> = {
  "weave.item.add": "아이템 추가",
  "weave.item.remove": "아이템 삭제",
  "weave.items.remove": "여러 아이템 삭제",
  "weave.item.update": "아이템 수정",
  "weave.shape.setCornerRadius": "모서리 둥글기",
  "weave.image.setCrop": "이미지 자르기",
  "weave.item.flip": "뒤집기",
  "weave.shape.setFill": "채우기 설정",
  "weave.shape.setVertices": "다각형 정점 편집",
  "weave.items.resizeMulti": "크기 조정",
  "weave.items.update": "여러 아이템 수정",
  "weave.items.lifecycle": "여러 아이템 삭제/복제",
  "weave.behavior.update": "동작 수정",
  "weave.doc.reset": "문서 초기화",
  "weave.design.setBackground": "배경색 변경",
  "weave.design.setPresentationOrder": "발표 순서 변경",
  "weave.design.reorderChildren": "순서 변경",
  "weave.item.bringForward": "앞으로",
  "weave.item.sendBackward": "뒤로",
  "weave.item.bringToFront": "맨 앞으로",
  "weave.item.sendToBack": "맨 뒤로",
  "weave.item.reparent": "부모 변경",
  "weave.shape.breakToLine": "도형을 선으로 끊기",
  "weave.line.closeToShape": "선 끝점 이어 도형으로",
  "weave.frame.removeKeepingChildren": "프레임 해제(자식 유지)",
  "weave.item.addBehavior": "동작 추가",
  "weave.item.removeBehavior": "동작 제거",
  "weave.chart.add": "차트 추가",
  "weave.dataset.add": "데이터셋 추가",
  "weave.dataset.update": "데이터셋 수정",
  "weave.dataset.remove": "데이터셋 삭제",
  "weave.preset.insertSlide": "슬라이드 추가",
  "weave.clipboard.copy": "복사",
  "weave.clipboard.cut": "잘라내기",
  "weave.clipboard.paste": "붙여넣기",
  "weave.item.duplicate": "아이템 복제",
  "weave.items.duplicate": "여러 아이템 복제",
  "weave.page.duplicate": "페이지 복제",
  "weave.frame.setLayout": "레이아웃 설정",
  "weave.item.setLayoutChild": "레이아웃 자식 정책",
  "weave.item.swapGridCells": "그리드 셀 교환",
  "weave.item.swapFlexOrder": "플렉스 순서 교환",
  "weave.item.dropGridCell": "그리드 셀 이동",
  "weave.item.setDecoration": "장식 설정",
  "weave.batch": "일괄 실행",
};

const label = (name: string): string => WEAVE_COMMAND_LABELS[name] ?? name;

/** Patch a retargeted kit schema with the weave label AND a top-level
 *  `inputSchema.description` (the only per-command text that reaches the agent —
 *  see the `obj` helper note). The argument shape stays the kit's by import. */
function withKitDesc(spec: AgentCommandSpec, name: string, description: string): AgentCommandSpec {
  return {
    ...spec,
    label: label(name),
    inputSchema: { ...spec.inputSchema, description },
  };
}

// Kit commands whose argument contract is OWNED by @agocraft/core and whose
// weave.* name is just the canonical name under our prefix — re-exposed BY IMPORT
// (DR-039) instead of hand-copied, so an upstream kit-contract change surfaces here
// as a build break, not silent drift (DR-038 was exactly such a change). Only the
// label is weave-owned, so we patch it back in. The retargeted inputSchema/
// destructive come verbatim from AGENT_COMMAND_SCHEMAS.
//
// Kit commands NOT retargeted here, and why (kept inline below):
//  • z-order (bringForward / sendBackward / bringToFront / sendToBack): weave RENAMES
//    them off agocraft.zOrder.move*, and bringForward/sendBackward are step-relative
//    with no kit equivalent — prefix-retarget can't rename a key.
//  • weave.design.reorderChildren ← children.reorder, weave.frame.removeKeepingChildren
//    ← frame.dissolve: identical contract but a RENAMED key (prefix-retarget can't rename).
//  • weave.clipboard.paste: weave EXTENDS the kit shape with paste-special (mode/targetIds).
const KIT_SCHEMAS = retargetCommandSchemas({
  prefix: "weave.",
  only: ["item.remove", "item.reparent", "clipboard.copy", "clipboard.cut", "item.duplicate"],
  patch: {
    // Patch in BOTH the weave label AND a top-level inputSchema.description — the
    // retargeted kit schemas carry neither, so without this the agent would see
    // only the command name (WI-095). `withKitDesc` spreads the description onto
    // the imported inputSchema without touching its argument shape (still by import).
    "weave.item.remove": (s) =>
      withKitDesc(s, "weave.item.remove", "DELETE one item by id (and its children)."),
    "weave.item.reparent": (s) =>
      withKitDesc(
        s,
        "weave.item.reparent",
        "Move an item under a different parent container, preserving its on-screen position. Use to regroup an item into another frame.",
      ),
    "weave.clipboard.copy": (s) =>
      withKitDesc(
        s,
        "weave.clipboard.copy",
        "Copy the given items to the clipboard for a later weave.clipboard.paste.",
      ),
    "weave.clipboard.cut": (s) =>
      withKitDesc(
        s,
        "weave.clipboard.cut",
        "Cut the given items (copy + remove) for a later weave.clipboard.paste.",
      ),
    "weave.item.duplicate": (s) =>
      withKitDesc(
        s,
        "weave.item.duplicate",
        "Clone one item in place (offset slightly), as a new item.",
      ),
  },
});

/** Every weave editing command, keyed by its `weave.*` registry name. */
export const WEAVE_COMMAND_SCHEMAS: Readonly<Record<string, AgentCommandSpec>> = {
  // Kit commands re-exposed from @agocraft/agent-client under weave.* (see KIT_SCHEMAS).
  ...KIT_SCHEMAS,
  // ── lifecycle ──
  // For `kind: "text"`, `attrsOverride` seeds the new box's text attrs. Pick a
  // `fontSize` (absolute design-px) relative to the canvas px size in the task's
  // [디자인] line; the box is AUTO-HEIGHT, so `frame.width` (a 0..1 ratio) drives
  // wrapping while height auto-fits. See TEXT_ATTRS_NOTE / the text capabilities.
  "weave.item.add": {
    label: label("weave.item.add"),
    inputSchema: obj(
      {
        kind: ITEM_KIND,
        containerId: STR,
        frame: FRAME,
        attrsOverride: ATTRS_WITH_TEXT_NOTE,
        units: CREATION_UNITS,
      },
      ["kind"],
      "ADD a new item (frame / text / image / video / shape / line / qr / embed) into the design or a container frame. Pass containerId for a parent frame (omit → design root), frame for the 0..1 box, attrsOverride for per-kind content/style, and units to style it (fill/shadow/…) in the SAME call. For a chart use weave.chart.add instead. This is the primary creation tool. CHECK THE TARGET CONTAINER'S LAYOUT FIRST (read it from the snapshot): if the container is ABSOLUTE (no auto-layout) you MUST pass a frame with width>0 AND height>0 — an absolute parent does NOT auto-position its children, so a missing/zero frame lands the item at zero size = invisible & uneditable. If the container has an AUTO-LAYOUT (flex/grid), OMIT the frame — the layout positions and sizes the child; do not fight it with an absolute frame. Do not assume a container is grid; verify.",
    ),
  },
  // weave.item.remove → retargeted from kit (see KIT_SCHEMAS).
  // ── WI-077 — data-driven chart + dataset (데이터 관리 아이템) ──
  // weave.chart.add is the PRIMARY chart-creation tool: it seeds a dataset AND
  // the chart in one undoable step (NOT weave.item.add+kind:chart, which makes
  // an empty placeholder). `dataset` is optional — omit it for sample data.
  "weave.chart.add": {
    label: label("weave.chart.add"),
    inputSchema: obj(
      {
        containerId: STR,
        frame: FRAME,
        chartType: {
          type: "string",
          enum: [
            "bar",
            "line",
            "area",
            "pie",
            "funnel",
            "gauge",
            "scatter",
            "bubble",
            "radar",
            "heatmap",
            "candlestick",
            "boxplot",
            "treemap",
            "sankey",
          ],
        },
        encoding: {
          type: "object",
          additionalProperties: true,
          description:
            "Channel→column map (DR-036). Each channel is { field:<dataset column name>, aggregate? }; `value` may be an ARRAY for multiple wide-format series. Provide the channels the chartType needs: bar/line/area/pie/funnel/radar → category + value[]; scatter/bubble → x + y (+ size for bubble); heatmap → x + y + value; candlestick → category + open/high/low/close; boxplot → category + lower/q1/median/q3/upper; treemap → id + parent (+ value); sankey → source + target (+ value). OMIT only for category/value types (then category = first column, value = the rest is auto-derived); REQUIRED for scatter/bubble/heatmap/candlestick/boxplot/treemap/sankey or they render a placeholder.",
        },
        variant: {
          type: "object",
          additionalProperties: true,
          description:
            "Presentation flags: { stacked?, normalized? (100% stacked), horizontal? (bar), smooth? (line/area), innerRadius? (0..1 → turns a pie into a doughnut) }.",
        },
        dataset: DATASET_PAYLOAD,
      },
      [],
      "CREATE a data-driven chart — seeds a dataset AND the chart in ONE undoable step. Use this for ANY quantitative data (comparisons, trends, proportions, KPIs); do NOT use weave.item.add with kind 'chart' (empty placeholder). Pick chartType from the 14 families, give encoding (required for non-category/value types), optional variant, and dataset:{columns,rows} (omit → sample data).",
    ),
  },
  // Datasets are the data SOURCE charts reference by id. Create a shared one
  // explicitly only when several charts must read the same data; otherwise
  // weave.chart.add's seeded dataset is enough.
  "weave.dataset.add": {
    label: label("weave.dataset.add"),
    inputSchema: obj(
      { id: STR, dataset: DATASET_PAYLOAD },
      [],
      "CREATE a standalone dataset (the data SOURCE charts reference by id). Use only when several charts must share ONE dataset; otherwise weave.chart.add's seeded dataset is enough. Returns the new dataset id.",
    ),
  },
  // Declarative form only (the UI's `patch` function is not agent-reachable).
  // `dataset` is shallow-merged over the current payload — pass just the fields
  // you change (e.g. only `rows`). Every referencing chart reflows.
  "weave.dataset.update": {
    label: label("weave.dataset.update"),
    inputSchema: obj(
      { id: STR, dataset: DATASET_PAYLOAD },
      ["id"],
      "EDIT a chart's underlying DATA. `dataset` is shallow-merged over the current payload — pass just what changes (e.g. only `rows`, or only `columns`). Every chart referencing this dataset id reflows. Use this for the numbers; use weave.item.update for the chart's look/type/encoding/style.",
    ),
  },
  "weave.dataset.remove": {
    label: label("weave.dataset.remove"),
    destructive: true,
    inputSchema: obj(
      { id: STR },
      ["id"],
      "DELETE a dataset by id. Charts still referencing it render a graceful placeholder. Rarely needed directly.",
    ),
  },
  // WI-095 (DR-064) — re-exposed to the agent. Bulk remove; weave.items.lifecycle
  // { op:'remove' } covers the same ground. Registered for UI + agent.
  "weave.items.remove": {
    label: label("weave.items.remove"),
    destructive: true,
    inputSchema: obj(
      { itemIds: STR_ARR },
      ["itemIds"],
      "DELETE several items in ONE undo step. Equivalent to weave.items.lifecycle { op:'remove' }. Each id may live under a different parent.",
    ),
  },
  "weave.doc.reset": {
    label: label("weave.doc.reset"),
    destructive: true,
    inputSchema: obj(
      {},
      [],
      "DANGER: wipe the ENTIRE document back to empty (removes ALL slides + items). Irreversible-feeling for the user — only use on an explicit 'start over / clear everything' request, never as a step inside a normal edit.",
    ),
  },

  // ── attrs editing (declarative form — see WI-054 note above) ──
  "weave.item.update": {
    label: label("weave.item.update"),
    // `attrs` is shallow-merged over the item's current attrs. Provide COMPLETE
    // sub-objects (e.g. the full `frame` { x, y, width, height }) — a partial
    // sub-object replaces the whole key. The snapshot gives current values.
    // EXCEPTIONS (partial-edit safe, see notes): for CHART items attrs.variant /
    // encoding / overrides are DEEP-MERGED (send only the delta; null clears a
    // key); for TEXT items attrs.textRuns carries per-range styling and stays
    // coherent with attrs.text.
    // For text items, `attrs` is the path for fontSize / color / alignment /
    // lineHeightSpec etc. (sizing rules in TEXT_ATTRS_NOTE).
    // `units` sets/clears decoration + transform.flip units (fill / shadow / stroke /
    // filter / opacity / flip) in the SAME call — attrs:null clears a unit.
    // Provide attrs and/or units (at least one); only `itemId` is required.
    inputSchema: obj(
      { itemId: STR, attrs: ATTRS_WITH_TEXT_NOTE, units: EDIT_UNITS },
      ["itemId"],
      "EDIT one existing item — the primary change tool. `attrs` changes any attribute (text/textRuns, fontSize, color, frame, chart encoding/variant/overrides, …) and `units` sets/clears decoration + flip; give either or both. attrs is shallow-merged (send COMPLETE sub-objects) EXCEPT chart variant/encoding/overrides are deep-merged and text text↔textRuns stay coherent. Target by the itemId in the snapshot.",
    ),
  },
  // ── rectangle corner radius (WI-055) ──
  // Rectangle-only (`shape` item with `subAttrs.shape === "rectangle"`). The
  // radius is in **absolute design-px** of the shape's rendered bbox — the SAME
  // unit as frame `cornerRadius` and image/video `borderRadius` (all px since
  // DR-075; no 0..1 ratios anywhere). The renderer caps each corner at
  // min(width, height) / 2, so a large value is safe. Send EXACTLY ONE of:
  //   • `radius`  — uniform: all four corners set to this value (0 = square).
  //   • `radii`   — per-corner partial: only the supplied corners change; tl =
  //                 top-left, tr = top-right, br = bottom-right, bl = bottom-left.
  // Sending both, or neither, is rejected with `invalid-input`. A non-rectangle
  // target is rejected with `not-a-rectangle`. The edit is reversible (Cmd+Z).
  // WI-095 (DR-064) — re-exposed to the agent. These per-property setters are ALSO
  // reachable via weave.item.add / weave.item.update (attrs + units in one call);
  // kept available as direct setters for targeted edits:
  //   setCornerRadius → update { attrs:{ subAttrs:{ shape:'rectangle', cornerRadii } } }
  //   setFill         → update { units:[{ kind:'decoration.fill', attrs:<PaintSpec> }] }
  //   setVertices     → update { attrs:{ subAttrs:{ shape:'poly', points, closed } } }
  "weave.shape.setCornerRadius": {
    label: label("weave.shape.setCornerRadius"),
    inputSchema: obj(
      {
        itemId: STR,
        radius: { type: "number", minimum: 0 },
        radii: {
          type: "object",
          properties: {
            tl: { type: "number", minimum: 0 },
            tr: { type: "number", minimum: 0 },
            br: { type: "number", minimum: 0 },
            bl: { type: "number", minimum: 0 },
          },
          additionalProperties: false,
        },
      },
      // `radius` XOR `radii` is enforced at runtime by the command, not by JSON
      // Schema (which can't express "exactly one of these optional keys").
      ["itemId"],
      "Round a RECTANGLE shape's corners (absolute px, not a ratio). Send EXACTLY ONE of `radius` (uniform, all four) or `radii` (per-corner partial: tl/tr/br/bl). Rectangle-only. Also doable via weave.item.update { attrs:{ subAttrs:{ shape:'rectangle', cornerRadii } } }.",
    ),
  },
  // ── shape fill incl. gradient (WI-056) ──
  // Shape-only. Replaces `attrs.fill` with a `PaintSpec`. The `fill` is a
  // discriminated union on `type`:
  //   • solid           — { type:"solid", color:"#rrggbb" | "#rrggbbaa" | "var(--token)" }
  //   • linear-gradient — { type:"linear-gradient", angle:<deg 0..360, 0=up 90=right>,
  //                         stops:[{ offset:0..1, color:"#rrggbbaa" }, …] }  (≥2 stops)
  //   • radial-gradient — { type:"radial-gradient", cx:0..1, cy:0..1, stops:[…] }  (≥2 stops)
  //   • none            — { type:"none" }  (transparent)
  //   • image | video   — { type:"image"|"video", src:"<url>", fit?, opacity? }
  // Gradient `offset`/`stops[].color` are absolute values, NOT theme tokens.
  // The renderer materializes every variant; a non-shape target → `not-a-shape`.
  "weave.shape.setFill": {
    label: label("weave.shape.setFill"),
    inputSchema: obj(
      {
        itemId: STR,
        fill: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["solid", "linear-gradient", "radial-gradient", "none", "image", "video"],
            },
            // solid
            color: STR,
            // linear-gradient
            angle: {
              type: "number",
              description: "linear-gradient angle in DEGREES (0 = up, 90 = right). Not a ratio.",
            },
            // radial-gradient
            cx: {
              type: "number",
              description:
                "radial-gradient center X, 0..1 of THIS shape's bbox (0 = left edge, 1 = right edge).",
            },
            cy: {
              type: "number",
              description:
                "radial-gradient center Y, 0..1 of THIS shape's bbox (0 = top edge, 1 = bottom edge).",
            },
            // gradient stops (linear + radial)
            stops: {
              type: "array",
              items: obj(
                {
                  offset: {
                    type: "number",
                    description:
                      "stop position, 0..1 along the gradient axis (0 = start, 1 = end).",
                  },
                  color: STR,
                },
                ["offset", "color"],
              ),
            },
            // image / video
            src: STR,
            fit: STR,
            opacity: {
              type: "number",
              description: "paint opacity, 0..1 scalar (1 = opaque, 0 = transparent).",
            },
            muted: { type: "boolean" },
            loop: { type: "boolean" },
          },
          required: ["type"],
          additionalProperties: false,
        },
      },
      ["itemId", "fill"],
      "Set a SHAPE's fill paint (`PaintSpec`): solid / linear-gradient / radial-gradient / image / video / none. Shape-only. Also doable via weave.item.update { units:[{ kind:'decoration.fill', attrs:<PaintSpec> }] }, which works for any item kind.",
    ),
  },
  // ── freeform polygon vertices (WI-057) ──
  // Target a `shape` item whose `subAttrs.shape === "poly"` (a freeform polygon,
  // distinct from the parametric regular "polygon"/sides and the opaque "path").
  // `points` is the COMPLETE replacement vertex list — each {x,y} is a 0..1 ratio
  // of the shape's bbox (NOT px), so the polygon rides the item's resize/rotate.
  // `closed` (optional) toggles filled polygon (true, ≥3 pts) vs open polyline
  // (false, ≥2 pts); omit to keep the current value. Coords clamp to [0,1].
  // Rejects: not-a-poly (wrong target), invalid-points (too few / non-finite).
  "weave.shape.setVertices": {
    label: label("weave.shape.setVertices"),
    inputSchema: obj(
      {
        itemId: STR,
        points: {
          type: "array",
          items: obj({ x: NUM, y: NUM }, ["x", "y"]),
          description:
            "Vertices, each {x,y} a 0..1 ratio of THIS shape's OWN bbox (NOT the parent frame / design) — so they ride the shape's resize & rotate.",
        },
        closed: { type: "boolean" },
      },
      ["itemId", "points"],
      "Replace a FREEFORM polygon's (subAttrs.shape === 'poly') vertices. `points` is the COMPLETE new list, each {x,y} a 0..1 ratio of the shape's own bbox; `closed` toggles filled vs open. Poly-shape only. Also doable via weave.item.update { attrs:{ subAttrs:{ shape:'poly', points, closed } } }.",
    ),
  },
  // ── image crop (WI-074 / DR-029) — image items only ──
  // WI-095 (DR-064) — re-exposed to the agent. `crop` = the visible window in
  // 0..1 of the image's box ({x,y} top-left, {w,h} size; no-crop = {0,0,1,1}).
  // `rotation` (radians) straightens the CONTENT (frame stays put); `offset`
  // (frame-box fractions) pans within the rotation cover-zoom. Also reachable via
  // weave.item.update { attrs:{ cropRatio:{ x,y,w,h, rotation? } } }.
  "weave.image.setCrop": {
    label: label("weave.image.setCrop"),
    inputSchema: obj(
      {
        itemId: STR,
        crop: obj({ x: NUM, y: NUM, w: NUM, h: NUM }, ["x", "y", "w", "h"]),
        rotation: { type: "number", description: "Content rotation in radians. Omit = 0." },
        offset: obj({ ox: NUM, oy: NUM }, ["ox", "oy"]),
      },
      ["itemId", "crop"],
      "CROP an image — `crop` is the visible window in 0..1 of the image box ({x,y} top-left, {w,h} size; no-crop = {0,0,1,1}). `rotation` straightens the content; `offset` pans within the cover-zoom. Image-only. Also doable via weave.item.update { attrs:{ cropRatio } }.",
    ),
  },
  // ── flip / mirror (WI-074 / DR-029 D7) — image / video / shape / line ──
  // WI-095 (DR-064) — re-exposed to the agent. Toggles a horizontal/vertical
  // mirror (stored as a transform.flip unit). Also reachable via weave.item.update
  // { units:[{ kind:'transform.flip', attrs:{ flipH?, flipV? } }] }.
  "weave.item.flip": {
    label: label("weave.item.flip"),
    inputSchema: obj(
      { itemId: STR, axis: { type: "string", enum: ["horizontal", "vertical"] } },
      ["itemId", "axis"],
      "MIRROR an item horizontally or vertically (image / video / shape / line). Toggles a transform.flip unit. Also doable via weave.item.update { units:[{ kind:'transform.flip', attrs:{ flipH?, flipV? } }] }.",
    ),
  },
  // WI-095 (DR-064) — re-exposed to the agent. Per-item explicit frames; also
  // reachable via weave.items.update { updates }. Registered for UI + agent.
  "weave.items.resizeMulti": {
    label: label("weave.items.resizeMulti"),
    inputSchema: obj(
      {
        updates: {
          type: "array",
          items: obj(
            {
              itemId: STR,
              frame: {
                type: "object",
                description:
                  "New box in 0..1 ratios of the item's PARENT frame (top-level item = the whole design). NEVER pixels.",
                properties: {
                  x: {
                    type: "number",
                    description:
                      "Left edge, 0..1 of the PARENT frame's width (top-level = design width).",
                  },
                  y: {
                    type: "number",
                    description:
                      "Top edge, 0..1 of the PARENT frame's height (top-level = design height).",
                  },
                  width: {
                    type: "number",
                    description: "Width as 0..1 of the PARENT frame's width.",
                  },
                  height: {
                    type: "number",
                    description: "Height as 0..1 of the PARENT frame's height.",
                  },
                },
                required: ["x", "y", "width", "height"],
                additionalProperties: false,
              },
            },
            ["itemId", "frame"],
          ),
        },
      },
      ["updates"],
      "RESIZE/REPOSITION several items at once, each to its own explicit frame (0..1 of its parent), in ONE undo step. Equivalent to weave.items.update { updates }.",
    ),
  },
  // ── THE multi-selection EDIT command (WI-061/063/064) ──
  // One verb to modify many items in ONE undo step. Supply any combination:
  //   • attrs   — shared attrs merged over EACH itemId (COMPLETE sub-objects; same
  //               rules + text/shape notes as weave.item.update)
  //   • units   — shared decoration units set on EACH itemId (fill/shadow/stroke/…)
  //   • updates — per-item explicit frames [{ itemId, frame }] (was items.resizeMulti)
  //   • op      — align/distribute across itemIds (was items.align): snap to a shared
  //               edge/center, or equalize spacing (distribute needs ≥3). ALL itemIds
  //               must share ONE parent frame, else `cross-parent-selection`.
  // `itemIds` is required when attrs / units / op are present. At least one of
  // attrs / units / updates / op must be given.
  "weave.items.update": {
    label: label("weave.items.update"),
    inputSchema: obj(
      {
        itemIds: STR_ARR,
        attrs: ATTRS_WITH_TEXT_NOTE,
        units: EDIT_UNITS,
        updates: {
          type: "array",
          description: "Per-item explicit frames (0..1 of each item's PARENT). One entry per item.",
          items: obj(
            {
              itemId: STR,
              frame: obj({ x: NUM, y: NUM, width: NUM, height: NUM }, [
                "x",
                "y",
                "width",
                "height",
              ]),
            },
            ["itemId", "frame"],
          ),
        },
        op: {
          type: "string",
          enum: [
            "align-left",
            "align-horizontal-center",
            "align-right",
            "align-top",
            "align-vertical-center",
            "align-bottom",
            "distribute-horizontal",
            "distribute-vertical",
          ],
          description:
            "align-* snaps every item to that edge/center of the selection bbox; distribute-* equalizes spacing along the axis (≥3 items). Operates on `itemIds`.",
        },
      },
      [],
      "EDIT MANY items in ONE undo step — the preferred multi-select tool. Supply any combination: `attrs` (shared attrs merged over each itemId), `units` (shared decoration), `updates` (per-item explicit frames), or `op` (align/distribute across the selection). `itemIds` is required when attrs/units/op are used.",
    ),
  },
  // ── THE multi-selection LIFECYCLE command (WI-064) ──
  // Bulk structural op over a selection: remove or duplicate. One undo step.
  "weave.items.lifecycle": {
    label: label("weave.items.lifecycle"),
    destructive: true,
    inputSchema: obj(
      {
        itemIds: STR_ARR,
        op: {
          type: "string",
          enum: ["remove", "duplicate"],
          description: "remove = delete the items; duplicate = clone them.",
        },
      },
      ["itemIds", "op"],
      "Bulk STRUCTURAL op over several items in ONE undo step: op:'remove' deletes them, op:'duplicate' clones them.",
    ),
  },
  "weave.behavior.update": {
    label: label("weave.behavior.update"),
    // declarative: `behavior` is shallow-merged over the current behavior payload.
    inputSchema: obj(
      { itemId: STR, behaviorId: STR, behavior: ATTRS },
      ["itemId", "behaviorId", "behavior"],
      "EDIT an existing behavior/interaction unit on an item (e.g. retarget an item link, rename a camera step). `behavior` is shallow-merged over the current payload. Add new behaviors with weave.item.addBehavior, remove with weave.item.removeBehavior.",
    ),
  },

  // ── design-level ──
  "weave.design.setBackground": {
    label: label("weave.design.setBackground"),
    // null clears the background; a `var(--token)` literal is resolved to a StyleRef.
    inputSchema: obj(
      { color: { type: ["string", "null"] } },
      ["color"],
      "Set the WHOLE DESIGN's background color (behind every slide). Accepts a hex/rgb or a var(--token) literal; null clears it. For a single slide's fill use a decoration.fill unit on that frame instead.",
    ),
  },
  "weave.design.setPresentationOrder": {
    label: label("weave.design.setPresentationOrder"),
    inputSchema: obj(
      { order: STR_ARR },
      ["order"],
      "Reorder the DECK — `order` is the full list of top-level slide-frame ids in presentation sequence. Use to rearrange which slide comes first/next in Present mode.",
    ),
  },
  // WI-155 — page-scope duplicate. Differs from weave.item.duplicate: the
  // clone lands EXACTLY on the source frame (no nudge) and the SAME undo step
  // inserts it right after the source in the presentation order.
  "weave.page.duplicate": {
    label: label("weave.page.duplicate"),
    inputSchema: obj(
      { itemId: STR },
      ["itemId"],
      "Duplicate a PAGE (a slide frame) in place: deep-clones the frame with its content, keeps the exact same position/size (no offset), and slots the copy right after the source in the deck order. Use this — not weave.item.duplicate — when copying a slide/page.",
    ),
  },
  "weave.design.reorderChildren": {
    label: label("weave.design.reorderChildren"),
    inputSchema: obj(
      { containerId: STR, order: STR_ARR },
      ["order"],
      "Reorder the children of a container (or the design root if containerId omitted) — `order` is the full id list in the new sibling order. Also changes paint/z order among siblings.",
    ),
  },

  // ── z-order ──
  "weave.item.bringForward": {
    label: label("weave.item.bringForward"),
    inputSchema: obj(
      { itemId: STR },
      ["itemId"],
      "Move an item ONE step forward (up) in its sibling paint/z order.",
    ),
  },
  "weave.item.sendBackward": {
    label: label("weave.item.sendBackward"),
    inputSchema: obj(
      { itemId: STR },
      ["itemId"],
      "Move an item ONE step backward (down) in its sibling paint/z order.",
    ),
  },
  "weave.item.bringToFront": {
    label: label("weave.item.bringToFront"),
    inputSchema: obj(
      { itemId: STR },
      ["itemId"],
      "Move an item to the FRONT (top) of its sibling paint/z order — drawn over all siblings.",
    ),
  },
  "weave.item.sendToBack": {
    label: label("weave.item.sendToBack"),
    inputSchema: obj(
      { itemId: STR },
      ["itemId"],
      "Move an item to the BACK (bottom) of its sibling paint/z order — e.g. push a background image behind the content.",
    ),
  },

  // ── structure: reparent / dissolve ──
  // weave.item.reparent → retargeted from kit (see KIT_SCHEMAS).
  "weave.frame.removeKeepingChildren": {
    label: label("weave.frame.removeKeepingChildren"),
    destructive: true,
    inputSchema: obj(
      { frameId: STR, designWidth: NUM, designHeight: NUM },
      ["frameId"],
      "Dissolve a frame: reparent its children up to the frame's parent (preserving their on-screen position), then remove the now-empty frame. Use to ungroup a layout frame without deleting its contents.",
    ),
  },

  // ── shape ↔ line conversion (WI-065 / DR-031) ──
  // breakToLine: open a CLOSED shape into an open `line` at outline-vertex
  // `vertexIndex` (default 0). Works for every shape with a polygon/ellipse
  // outline (rectangle / triangle / polygon / star / ellipse / closed poly);
  // rejects line/arrow/path/heart/speech-bubble (not-convertible). The shape's
  // fill becomes the line's stroke. Replaces the item with a NEW id.
  "weave.shape.breakToLine": {
    label: label("weave.shape.breakToLine"),
    inputSchema: obj(
      {
        itemId: STR,
        vertexIndex: {
          type: "number",
          description:
            "Outline-vertex index to open the ring at (0 = first/top vertex). Default 0.",
        },
      },
      ["itemId"],
      "Convert a CLOSED shape (rectangle/triangle/polygon/star/ellipse/closed poly) into an open stroke-only `line`, cut at outline vertex `vertexIndex`. The fill becomes the stroke. Replaces the item with a new id.",
    ),
  },
  // closeToShape: fuse the two endpoints of an open `line` / free-curve (or an
  // open poly) into ONE vertex and close it into a filled `poly` shape. Needs
  // ≥3 points (not-convertible otherwise). The line's stroke becomes the
  // shape's fill. Replaces the item with a NEW id.
  "weave.line.closeToShape": {
    label: label("weave.line.closeToShape"),
    inputSchema: obj(
      { itemId: STR },
      ["itemId"],
      "Convert an open `line` / free-curve (≥3 points) into a filled `poly` shape by fusing its endpoints. The stroke becomes the fill. Replaces the item with a new id.",
    ),
  },

  // ── behaviors (units) ──
  "weave.item.addBehavior": {
    label: label("weave.item.addBehavior"),
    inputSchema: obj(
      { itemId: STR, behavior: BEHAVIOR },
      ["itemId", "behavior"],
      "ADD a behavior/interaction unit to an item. `behavior` = { id, kind, …payload }. Kinds include 'button-trigger' (ITEM LINK — action:{type:'external',href} opens a URL, {type:'jump-camera',targetId:'present-<frameId>'} jumps to a slide), 'camera-target' (a Present step), 'hotspot' (clickable sub-region), 'reveal-on-step'. See the unitKinds capabilities for each kind's shape.",
    ),
  },
  "weave.item.removeBehavior": {
    label: label("weave.item.removeBehavior"),
    inputSchema: obj(
      { itemId: STR, behaviorId: STR },
      ["itemId", "behaviorId"],
      "REMOVE a behavior/interaction unit from an item by its behaviorId (e.g. delete an item link or a Present step).",
    ),
  },

  // ── presets ──
  // WI-095 (DR-064) — re-exposed to the agent. Inserts a READY-MADE slide from the
  // 25-preset catalog (cover / agenda / divider / content / closing). presetId is a
  // closed enum (the agent previously guessed ids → preset-not-found, why presets
  // were hidden). containerId omitted → the design root; locale picks the seed copy.
  // Building a slide manually with weave.item.add { kind:'frame' } + layout frames
  // stays the flexible alternative; a preset is the quick start.
  "weave.preset.insertSlide": {
    label: label("weave.preset.insertSlide"),
    inputSchema: obj(
      {
        presetId: {
          type: "string",
          enum: [
            "cover.hero",
            "cover.bold",
            "cover.minimal",
            "cover.split",
            "cover.asymmetric",
            "agenda.bullets",
            "agenda.numbered",
            "agenda.timeline",
            "agenda.three-column",
            "agenda.minimal",
            "divider.chapter",
            "divider.section-number",
            "divider.quote",
            "divider.left-accent",
            "divider.fullbleed",
            "content.title-body",
            "content.bullet-list",
            "content.two-column",
            "content.stat-headline",
            "content.image-caption",
            "closing.thanks",
            "closing.summary",
            "closing.cta",
            "closing.qa",
            "closing.contact",
          ],
          description:
            "Preset slide id (category.variant). One of the 25 built-in starting points.",
        },
        containerId: STR,
        locale: { type: "string", enum: ["ko", "en"] },
      },
      ["presetId"],
      "INSERT a ready-made slide from the 25-preset catalog (cover / agenda / divider / content / closing) — a fast starting point. presetId is a closed enum; containerId omitted → design root; locale picks ko/en seed copy. For full control, build the slide manually with weave.item.add { kind:'frame' } + layout frames instead.",
    ),
  },

  // ── clipboard ──
  // weave.clipboard.copy / weave.clipboard.cut → retargeted from kit (see KIT_SCHEMAS).
  // weave.clipboard.paste stays inline — weave EXTENDS the kit shape with paste-special.
  "weave.clipboard.paste": {
    label: label("weave.clipboard.paste"),
    inputSchema: obj(
      {
        containerId: STR,
        containerSizePx: obj({ width: NUM, height: NUM }, ["width", "height"]),
        mode: {
          type: "string",
          enum: ["everything", "style", "text", "size", "position"],
          description:
            "Paste-special mode (default 'everything' = clone the copied items). 'style' applies " +
            "the copied item's style/decoration to the current selection (targetIds); 'text' / " +
            "'size' / 'position' apply just that facet. Non-'everything' modes need a selection.",
        },
        targetIds: STR_ARR,
      },
      ["containerSizePx"],
      "PASTE clipboard items into a container. Default mode 'everything' clones the copied items; 'style'/'text'/'size'/'position' apply just that facet of the copied item to the current selection (targetIds). Pair with weave.clipboard.copy / weave.clipboard.cut.",
    ),
  },

  // ── duplicate ──
  // weave.item.duplicate → retargeted from kit (see KIT_SCHEMAS).
  // WI-095 (DR-064) — re-exposed to the agent. Bulk duplicate; weave.items.lifecycle
  // { op:'duplicate' } covers the same ground. Registered for UI + agent.
  "weave.items.duplicate": {
    label: label("weave.items.duplicate"),
    inputSchema: obj(
      { itemIds: STR_ARR },
      ["itemIds"],
      "Clone several items in ONE undo step. Equivalent to weave.items.lifecycle { op:'duplicate' }.",
    ),
  },

  // ── layout (WI-020 / WI-043) ──
  // Make the frame `itemId` auto-arrange its children like CSS flex/grid. Omit
  // `layout` to clear back to free (absolute-constraints) placement.
  "weave.frame.setLayout": {
    label: label("weave.frame.setLayout"),
    inputSchema: obj(
      { itemId: STR, layout: LAYOUT_SPEC },
      ["itemId"],
      "Make a FRAME auto-arrange its children like CSS flex/grid. `layout` = an auto-flex (row/column) or auto-grid spec (see layoutKinds). Omit `layout` to clear back to free (absolute) placement. This is the primary layout tool — group items in a nested frame, then set its layout.",
    ),
  },
  // Set how `itemId` behaves inside its parent frame's layout. Omit `policy` to
  // clear. The `kind` should match the parent frame's layout kind.
  "weave.item.setLayoutChild": {
    label: label("weave.item.setLayoutChild"),
    inputSchema: obj(
      { itemId: STR, policy: LAYOUT_CHILD_POLICY },
      ["itemId"],
      "Tune how ONE child behaves inside its parent frame's layout (flex grow/shrink/basis/alignSelf, or grid column/row/span). `policy.kind` should match the parent's layout kind. Omit `policy` to clear. For TEXT, alignSelf:'stretch' in a column binds its width so it wraps.",
    ),
  },
  "weave.item.swapGridCells": {
    label: label("weave.item.swapGridCells"),
    inputSchema: obj(
      { aId: STR, bId: STR },
      ["aId", "bId"],
      "Swap two grid children's cell positions (both in the same auto-grid frame).",
    ),
  },
  "weave.item.swapFlexOrder": {
    label: label("weave.item.swapFlexOrder"),
    inputSchema: obj(
      { aId: STR, bId: STR },
      ["aId", "bId"],
      "Swap two flex children's sequence order (both in the same auto-flex frame).",
    ),
  },
  "weave.item.dropGridCell": {
    label: label("weave.item.dropGridCell"),
    inputSchema: obj(
      {
        itemId: STR,
        x: {
          type: "number",
          description: "Target COLUMN — a 1-based grid cell index (NOT a ratio or px).",
        },
        y: {
          type: "number",
          description: "Target ROW — a 1-based grid cell index (NOT a ratio or px).",
        },
      },
      ["itemId", "x", "y"],
      "Move a grid child to the cell at 1-based column `x` / row `y`: an occupied cell swaps, an empty cell relocates. The item's frame must be in an auto-grid parent.",
    ),
  },
  // DR-028 — decorations are units. One command sets/replaces/clears a decoration
  // unit; `attrs` IS the spec for that kind (null clears). Shadow:
  // { x, y, blur, spread, color }. Stroke: { paint:{type,color}, width, dashArray? }.
  // Fill: a PaintSpec ({type:"solid",color} | gradient | image). Filter:
  // { brightness?, contrast?, saturate?, blur?, hueRotate? }. Opacity: { value:0..1 }.
  // WI-095 (DR-064) — re-exposed to the agent. Single-unit setter; also reachable
  // via weave.item.add / weave.item.update `units`. Registered for UI + agent.
  "weave.item.setDecoration": {
    label: label("weave.item.setDecoration"),
    inputSchema: obj(
      {
        itemId: STR,
        kind: {
          type: "string",
          enum: [
            "decoration.shadow",
            "decoration.stroke",
            "decoration.fill",
            "decoration.filter",
            "decoration.opacity",
          ],
        },
        attrs: { type: ["object", "null"], additionalProperties: true },
      },
      ["itemId", "kind", "attrs"],
      "Set/replace/clear ONE decoration unit on an item: kind = decoration.fill/.stroke/.shadow/.filter/.opacity; `attrs` IS that kind's spec (PaintSpec for fill, { x,y,blur,spread,color } for shadow, …), or null to clear it. weave.item.update { units } does the same (and several at once) — prefer that for multi-unit edits.",
    ),
  },
  // WI-096 (DR-065) — atomic multi-command transaction.
  "weave.batch": {
    label: label("weave.batch"),
    inputSchema: obj(
      {
        ops: {
          type: "array",
          description:
            "Ordered list of operations. Each is { command:<a weave.* command name>, input:<that command's arguments object> }. Ops apply in sequence and a later op SEES earlier ops' effects on EXISTING items/document state (e.g. set a frame's layout, then move its existing children). A NEW item's id from an earlier op is NOT yet known, so it cannot be targeted later in the same batch. Cannot contain weave.batch (no nesting) or weave.doc.reset.",
          items: obj(
            {
              command: {
                type: "string",
                description:
                  "The weave.* command to run for this op (e.g. 'weave.item.add', 'weave.item.update', 'weave.items.update'). Not 'weave.batch' / 'weave.doc.reset'.",
              },
              input: {
                type: "object",
                additionalProperties: true,
                description:
                  "The argument object for `command` (same shape as calling it directly).",
              },
            },
            ["command", "input"],
          ),
        },
      },
      ["ops"],
      "Run SEVERAL commands as ONE ATOMIC transaction (single Cmd+Z). Prefer this to fire many edits together: ops apply in order, each sees the previous ops' effects, and if ANY op fails NOTHING is applied (all-or-nothing — unlike separate calls where some land and some don't). Returns each op's result value in order. LIMITATION: an item created in one op cannot be targeted by id in a LATER op of the same batch (ids are assigned on apply) — do that creation, then a follow-up edit.",
    ),
  },
};
