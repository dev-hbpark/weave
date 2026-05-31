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
// The input shapes mirror `document/commands.ts` exactly. Commands absorbed into
// the `@agocraft/core` / `@agocraft/layout` kits (remove / reparent / dissolve /
// duplicate / clipboard / reorder / layout / z-order) share their kit input
// shape — copied here from the kit's own AGENT_COMMAND_SCHEMAS so weave's
// `weave.*` names carry the identical contract.
//
// Two commands (`weave.item.update`, `weave.behavior.update`) take a function
// `patch` in their UI-facing signature, which an agent can't send over JSON.
// `document/commands.ts` accepts a declarative `attrs` / `behavior` alternative
// for exactly this surface (WI-054) — these schemas advertise only the
// declarative form.

import type { AgentCommandSpec } from "@agocraft/agent-client";

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
  "attrs.frame = { x, y, width, height, rotation }: x/y/width/height are 0..1 ratios of the " +
  "PARENT frame's box — a top-level item's parent is the whole DESIGN (canvas). x/y = top-left " +
  "corner (0 = parent's top-left edge, 1 = parent's bottom-right edge), width/height = size as a " +
  "fraction of the parent; rotation = radians about the box center. NEVER pixels.";

// Text attrs sizing note, shared by `weave.item.add` (attrsOverride) and
// `weave.item.update` (attrs). The detailed per-field model (units, defaults,
// resize modes, role-based fontSize guidance) lives in WEAVE_CAPABILITIES'
// `text` itemKind; this is the one-line reminder the agent sees on the command.
const TEXT_ATTRS_NOTE =
  "For text items, size via EITHER attrs.fontSize (absolute DESIGN-px number) OR " +
  "attrs.fontSizeSpec — { kind:'px', value } or { kind:'ratio', value } where value " +
  "is a 0..1 fraction of the parent frame height (root = design height; responsive). " +
  "NEVER put a fraction in the plain fontSize number (0.07 → sub-pixel); express ratios " +
  "only via fontSizeSpec {kind:'ratio'}. Roles: heading 48–96px (~ratio 0.05–0.09), " +
  "body ~24–32px (default 24) — canvas px is in the task's [디자인] line. A text box is " +
  "AUTO-HEIGHT by default, so set frame.width to control wrapping and let height auto-fit. " +
  "Other text fields: fontFamily, fontWeight, fontStyle, color, textAlignHorizontal/" +
  "Vertical, lineHeightSpec, letterSpacing. See the text itemKind capabilities for full detail.";

// WI-058 — data-driven QR. The code regenerates from `data` on every render.
const QR_ATTRS_NOTE =
  "For qr items: attrs.data is the encoded URL/text (the QR regenerates from it). " +
  "Optional: ecLevel ('L'|'M'|'Q'|'H', default M), moduleStyle ('square'|'dot'|'rounded'), " +
  "margin (quiet-zone modules, default 4), foreground/background (PaintSpec: " +
  "{type:'solid',color} or a linear/radial gradient; background null = transparent).";

/** Open attrs bag carrying the text + qr field notes in its description — used by
 *  the two attrs-editing commands so the hint rides along on `item.add` /
 *  `item.update` without bloating the shared `ATTRS` used elsewhere. */
// Shape attrs sizing/creation note. The full per-shape param model lives in
// WEAVE_CAPABILITIES' `shape` itemKind; this is the reminder on item.add/update.
const SHAPE_ATTRS_NOTE =
  "For shape items: set attrs.shape to the sub-kind " +
  "(rectangle|ellipse|line|arrow|triangle|star|polygon|poly|path|speech-bubble|heart). " +
  "Per-kind geometry lives in attrs.subAttrs (see its schema) and every geometry field is " +
  "OPTIONAL — anything you omit is auto-filled with a sensible default, so you CANNOT create " +
  "an invalid shape; include only the subAttrs fields you actually want to set (e.g. " +
  "star { points, innerRatio }, polygon { sides }, poly { points, closed }, rectangle " +
  "{ cornerRadii }). If you set subAttrs, set subAttrs.shape to the same sub-kind. Fill/shadow/" +
  "stroke/opacity/filter at CREATION go in this add call's `units` (e.g. units:[{ kind:" +
  "'decoration.fill', attrs:<PaintSpec> }]) so the shape is styled in one call; after creation, " +
  "edit them with weave.shape.setFill / weave.item.setDecoration.";

// Per-shape valid-field contract advertised to the agent (WI-062). A discriminated
// union on `shape`: each branch lists exactly the geometry fields that sub-kind
// accepts (`additionalProperties:false` → other fields are invalid for that kind),
// and geometry is OPTIONAL (only `shape` is required) because the host fills any
// missing field with a default. This tells the agent up-front which attributes are
// usable per shape; the host's normalization guarantees completeness regardless.
const ARROW_HEAD: Json = { type: "string", enum: ["none", "triangle", "open", "diamond", "circle"] };
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
    { type: "object", properties: { shape: { const: "ellipse" } }, required: ["shape"], additionalProperties: false },
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
      properties: { shape: { const: "heart" }, variant: { type: "string", enum: ["classic", "rounded"] } },
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
  description: `${FRAME_BASE_NOTE} ${TEXT_ATTRS_NOTE} ${QR_ATTRS_NOTE} ${SHAPE_ATTRS_NOTE}`,
};

// WI-063 — decoration units attached AT CREATION via weave.item.add, so an item
// is added FULLY STYLED in one call instead of fragmenting create → setFill →
// setDecoration across tool calls. Each { kind, attrs } overlays the seeded units
// (replacing any of the same kind). Decoration-only in v1; behaviors still use
// weave.item.addBehavior. `attrs` holds the spec for that kind (verbatim).
const CREATION_UNITS: Json = {
  type: "array",
  description:
    "Decoration units to attach AT CREATION so the new item is fully styled in this one call " +
    "(do NOT follow up with weave.shape.setFill / weave.item.setDecoration — use those only to " +
    "EDIT later). Each entry replaces any seeded unit of the same kind.",
  items: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: [
          "decoration.fill",
          "decoration.stroke",
          "decoration.shadow",
          "decoration.filter",
          "decoration.opacity",
        ],
      },
      attrs: {
        type: "object",
        additionalProperties: true,
        description:
          "The spec for `kind`: fill → PaintSpec ({type:'solid',color} | {type:'linear-gradient',angle,stops:[{offset,color},…]} | {type:'radial-gradient',cx,cy,stops} | {type:'image'|'video',src,fit?,opacity?} | {type:'none'}); " +
          "stroke → { paint:<PaintSpec>, width, dashArray?, lineCap?, lineJoin? }; " +
          "shadow → { x, y, blur, spread, color, inset? }; " +
          "filter → { brightness?, contrast?, saturate?, blur?, hueRotate? }; " +
          "opacity → { value:0..1 }.",
      },
    },
    required: ["kind", "attrs"],
    additionalProperties: false,
  },
};

function obj(properties: Readonly<Record<string, Json>>, required: ReadonlyArray<string>): Json {
  return { type: "object", properties, required: [...required], additionalProperties: false };
}

/** Outer frame box — 0..1 ratios of the PARENT frame (top-level item = the whole
 *  design). Figma-frame paradigm. Every field carries its base so the agent never
 *  guesses what the 0..1 is relative to. */
const FRAME: Json = {
  type: "object",
  description:
    "Bounding box in 0..1 ratios of the PARENT frame's box — a top-level item's parent is the " +
    "whole DESIGN (canvas). NEVER pixels.",
  properties: {
    x: {
      type: "number",
      description: "Left edge, 0..1 of the PARENT frame's width (top-level = the design width). 0 = parent left edge.",
    },
    y: {
      type: "number",
      description: "Top edge, 0..1 of the PARENT frame's height (top-level = the design height). 0 = parent top edge.",
    },
    width: { type: "number", description: "Width as 0..1 of the PARENT frame's width (1 = full parent width)." },
    height: { type: "number", description: "Height as 0..1 of the PARENT frame's height (1 = full parent height)." },
    rotation: { type: "number", description: "Rotation in radians about the box center (not a ratio)." },
  },
  required: ["x", "y", "width", "height"],
  additionalProperties: false,
};

/** The domain item kinds weave can create (`seed.ts`). */
const ITEM_KIND: Json = {
  type: "string",
  enum: ["frame", "image", "video", "shape", "line", "text", "qr"],
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
    "A LayoutSpec, discriminated on `kind` (like CSS flexbox / grid). One of:\n" +
    "• { kind:'absolute-constraints' } — free placement; each child keeps its own frame (default).\n" +
    "• { kind:'auto-flex', direction:'row'|'column', gap, justify, align, padding } — single-axis flow. " +
    "gap = child spacing as a 0..1 ratio of the frame's MAIN axis; " +
    "justify (main-axis) = 'start'|'center'|'end'|'space-between'|'space-around'; " +
    "align (cross-axis) = 'start'|'center'|'end'|'stretch'; " +
    "padding = { top, right, bottom, left } each a 0..1 ratio of the frame (top/bottom of its height, left/right of its width).\n" +
    "• { kind:'auto-grid', columns, rows, columnGap, rowGap, justify, align, padding } — track grid. " +
    "columns/rows = arrays of TrackSize, each { kind:'fr', value } (fractional share) | { kind:'ratio', value } (0..1 of the frame's track axis) | { kind:'auto' } (fit children); empty array = one full track. " +
    "columnGap/rowGap = 0..1 ratios of the frame (columnGap of its width, rowGap of its height); justify (column-axis) / align (row-axis) = 'start'|'center'|'end'|'stretch'; padding as above.",
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
    "• { kind:'auto-flex', grow, shrink, basis, alignSelf? } — grow/shrink are flex weights (≥0); " +
    "basis = main-axis base size (a 0..1 ratio of the parent frame's main axis, or 'auto' = use the child's own size); " +
    "alignSelf overrides the parent's cross-axis align for this child ('start'|'center'|'end'|'stretch').\n" +
    "• { kind:'auto-grid', column, row, columnSpan, rowSpan, alignSelf?, justifySelf? } — " +
    "column/row are 1-based cell indices; columnSpan/rowSpan (≥1) merge cells; " +
    "alignSelf (row-axis) / justifySelf (column-axis) override the parent align/justify for this child.",
};

/** Human labels for the transcript edit-chips (command name → Korean verb).
 *  Reused as each spec's `label`, so the two never drift. */
export const WEAVE_COMMAND_LABELS: Readonly<Record<string, string>> = {
  "weave.item.add": "아이템 추가",
  "weave.item.remove": "아이템 삭제",
  "weave.items.remove": "여러 아이템 삭제",
  "weave.item.update": "아이템 수정",
  "weave.shape.setCornerRadius": "모서리 둥글기",
  "weave.shape.setFill": "채우기 설정",
  "weave.shape.setVertices": "다각형 정점 편집",
  "weave.items.resizeMulti": "크기 조정",
  "weave.items.update": "여러 아이템 수정",
  "weave.items.align": "정렬/분배",
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
  "weave.frame.removeKeepingChildren": "프레임 해제(자식 유지)",
  "weave.item.addBehavior": "동작 추가",
  "weave.item.removeBehavior": "동작 제거",
  "weave.preset.insertSlide": "슬라이드 추가",
  "weave.clipboard.copy": "복사",
  "weave.clipboard.cut": "잘라내기",
  "weave.clipboard.paste": "붙여넣기",
  "weave.item.duplicate": "아이템 복제",
  "weave.items.duplicate": "여러 아이템 복제",
  "weave.frame.setLayout": "레이아웃 설정",
  "weave.item.setLayoutChild": "레이아웃 자식 정책",
  "weave.item.swapGridCells": "그리드 셀 교환",
  "weave.item.swapFlexOrder": "플렉스 순서 교환",
  "weave.item.dropGridCell": "그리드 셀 이동",
  "weave.item.setDecoration": "장식 설정",
};

const label = (name: string): string => WEAVE_COMMAND_LABELS[name] ?? name;

/** Every weave editing command, keyed by its `weave.*` registry name. */
export const WEAVE_COMMAND_SCHEMAS: Readonly<Record<string, AgentCommandSpec>> = {
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
    ),
  },
  "weave.item.remove": {
    label: label("weave.item.remove"),
    destructive: true,
    inputSchema: obj({ itemId: STR, containerId: STR }, ["itemId"]),
  },
  /* WI-064 — absorbed into weave.items.lifecycle { op:'remove' }; hidden from the
     agent (AGENT_HIDDEN_COMMANDS). Registered for UI use.
  "weave.items.remove": {
    label: label("weave.items.remove"),
    destructive: true,
    inputSchema: obj({ itemIds: STR_ARR }, ["itemIds"]),
  },
  */
  "weave.doc.reset": {
    label: label("weave.doc.reset"),
    destructive: true,
    inputSchema: obj({}, []),
  },

  // ── attrs editing (declarative form — see WI-054 note above) ──
  "weave.item.update": {
    label: label("weave.item.update"),
    // `attrs` is shallow-merged over the item's current attrs. Provide COMPLETE
    // sub-objects (e.g. the full `frame` { x, y, width, height }) — a partial
    // sub-object replaces the whole key. The snapshot gives current values.
    // For text items, `attrs` is the path for fontSize / color / alignment /
    // lineHeightSpec etc. (sizing rules in TEXT_ATTRS_NOTE).
    inputSchema: obj({ itemId: STR, attrs: ATTRS_WITH_TEXT_NOTE }, ["itemId", "attrs"]),
  },
  // ── rectangle corner radius (WI-055) ──
  // Rectangle-only (`shape` item with `subAttrs.shape === "rectangle"`). The
  // radius is in **absolute px** of the shape's rendered bbox — NOT a 0..1
  // ratio (unlike image/frame `borderRadius`). The renderer caps each corner at
  // min(width, height) / 2, so a large value is safe. Send EXACTLY ONE of:
  //   • `radius`  — uniform: all four corners set to this value (0 = square).
  //   • `radii`   — per-corner partial: only the supplied corners change; tl =
  //                 top-left, tr = top-right, br = bottom-right, bl = bottom-left.
  // Sending both, or neither, is rejected with `invalid-input`. A non-rectangle
  // target is rejected with `not-a-rectangle`. The edit is reversible (Cmd+Z).
  /* WI-063 — these per-property shape setters are SUBSUMED by weave.item.add /
     weave.item.update (attrs + units in one call) and are hidden from the agent
     command list (AGENT_HIDDEN_COMMANDS in use-aku-agent). Commented out here so
     the advertised schema set matches the two-command surface. They stay
     REGISTERED on the editor for the UI (toolbar) — only the agent loses them.
     setCornerRadius → update { attrs:{ subAttrs:{ shape:'rectangle', cornerRadii } } }
     setFill         → update { units:[{ kind:'decoration.fill', attrs:<PaintSpec> }] }
     setVertices     → update { attrs:{ subAttrs:{ shape:'poly', points, closed } } }

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
              description: "radial-gradient center X, 0..1 of THIS shape's bbox (0 = left edge, 1 = right edge).",
            },
            cy: {
              type: "number",
              description: "radial-gradient center Y, 0..1 of THIS shape's bbox (0 = top edge, 1 = bottom edge).",
            },
            // gradient stops (linear + radial)
            stops: {
              type: "array",
              items: obj(
                {
                  offset: {
                    type: "number",
                    description: "stop position, 0..1 along the gradient axis (0 = start, 1 = end).",
                  },
                  color: STR,
                },
                ["offset", "color"],
              ),
            },
            // image / video
            src: STR,
            fit: STR,
            opacity: { type: "number", description: "paint opacity, 0..1 scalar (1 = opaque, 0 = transparent)." },
            muted: { type: "boolean" },
            loop: { type: "boolean" },
          },
          required: ["type"],
          additionalProperties: false,
        },
      },
      ["itemId", "fill"],
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
    ),
  },
  */
  /* WI-064 — absorbed into weave.items.update `updates`; hidden from the agent
     (AGENT_HIDDEN_COMMANDS). Registered for UI use (DesignPage dispatches it).
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
                  x: { type: "number", description: "Left edge, 0..1 of the PARENT frame's width (top-level = design width)." },
                  y: { type: "number", description: "Top edge, 0..1 of the PARENT frame's height (top-level = design height)." },
                  width: { type: "number", description: "Width as 0..1 of the PARENT frame's width." },
                  height: { type: "number", description: "Height as 0..1 of the PARENT frame's height." },
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
    ),
  },
  */
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
        units: CREATION_UNITS,
        updates: {
          type: "array",
          description: "Per-item explicit frames (0..1 of each item's PARENT). One entry per item.",
          items: obj(
            {
              itemId: STR,
              frame: obj({ x: NUM, y: NUM, width: NUM, height: NUM }, ["x", "y", "width", "height"]),
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
    ),
  },
  "weave.behavior.update": {
    label: label("weave.behavior.update"),
    // declarative: `behavior` is shallow-merged over the current behavior payload.
    inputSchema: obj({ itemId: STR, behaviorId: STR, behavior: ATTRS }, [
      "itemId",
      "behaviorId",
      "behavior",
    ]),
  },

  // ── design-level ──
  "weave.design.setBackground": {
    label: label("weave.design.setBackground"),
    // null clears the background; a `var(--token)` literal is resolved to a StyleRef.
    inputSchema: obj({ color: { type: ["string", "null"] } }, ["color"]),
  },
  "weave.design.setPresentationOrder": {
    label: label("weave.design.setPresentationOrder"),
    inputSchema: obj({ order: STR_ARR }, ["order"]),
  },
  "weave.design.reorderChildren": {
    label: label("weave.design.reorderChildren"),
    inputSchema: obj({ containerId: STR, order: STR_ARR }, ["order"]),
  },

  // ── z-order ──
  "weave.item.bringForward": {
    label: label("weave.item.bringForward"),
    inputSchema: obj({ itemId: STR }, ["itemId"]),
  },
  "weave.item.sendBackward": {
    label: label("weave.item.sendBackward"),
    inputSchema: obj({ itemId: STR }, ["itemId"]),
  },
  "weave.item.bringToFront": {
    label: label("weave.item.bringToFront"),
    inputSchema: obj({ itemId: STR }, ["itemId"]),
  },
  "weave.item.sendToBack": {
    label: label("weave.item.sendToBack"),
    inputSchema: obj({ itemId: STR }, ["itemId"]),
  },

  // ── structure: reparent / dissolve ──
  "weave.item.reparent": {
    label: label("weave.item.reparent"),
    inputSchema: obj(
      {
        entries: {
          type: "array",
          items: obj({ itemId: STR, newParentId: STR }, ["itemId", "newParentId"]),
        },
        designWidth: NUM,
        designHeight: NUM,
      },
      ["entries"],
    ),
  },
  "weave.frame.removeKeepingChildren": {
    label: label("weave.frame.removeKeepingChildren"),
    destructive: true,
    inputSchema: obj({ frameId: STR, designWidth: NUM, designHeight: NUM }, ["frameId"]),
  },

  // ── behaviors (units) ──
  "weave.item.addBehavior": {
    label: label("weave.item.addBehavior"),
    inputSchema: obj({ itemId: STR, behavior: BEHAVIOR }, ["itemId", "behavior"]),
  },
  "weave.item.removeBehavior": {
    label: label("weave.item.removeBehavior"),
    inputSchema: obj({ itemId: STR, behaviorId: STR }, ["itemId", "behaviorId"]),
  },

  // ── presets ──
  "weave.preset.insertSlide": {
    label: label("weave.preset.insertSlide"),
    inputSchema: obj(
      { presetId: STR, containerId: STR, locale: { type: "string", enum: ["ko", "en"] } },
      ["presetId"],
    ),
  },

  // ── clipboard ──
  "weave.clipboard.copy": {
    label: label("weave.clipboard.copy"),
    inputSchema: obj({ itemIds: STR_ARR }, ["itemIds"]),
  },
  "weave.clipboard.cut": {
    label: label("weave.clipboard.cut"),
    destructive: true,
    inputSchema: obj({ itemIds: STR_ARR, containerId: STR }, ["itemIds"]),
  },
  "weave.clipboard.paste": {
    label: label("weave.clipboard.paste"),
    inputSchema: obj(
      { containerId: STR, containerSizePx: obj({ width: NUM, height: NUM }, ["width", "height"]) },
      ["containerSizePx"],
    ),
  },

  // ── duplicate ──
  "weave.item.duplicate": {
    label: label("weave.item.duplicate"),
    inputSchema: obj({ itemId: STR }, ["itemId"]),
  },
  /* WI-064 — absorbed into weave.items.lifecycle { op:'duplicate' }; hidden from
     the agent (AGENT_HIDDEN_COMMANDS). Registered for UI use.
  "weave.items.duplicate": {
    label: label("weave.items.duplicate"),
    inputSchema: obj({ itemIds: STR_ARR }, ["itemIds"]),
  },
  */

  // ── layout (WI-020 / WI-043) ──
  // Make the frame `itemId` auto-arrange its children like CSS flex/grid. Omit
  // `layout` to clear back to free (absolute-constraints) placement.
  "weave.frame.setLayout": {
    label: label("weave.frame.setLayout"),
    inputSchema: obj({ itemId: STR, layout: LAYOUT_SPEC }, ["itemId"]),
  },
  // Set how `itemId` behaves inside its parent frame's layout. Omit `policy` to
  // clear. The `kind` should match the parent frame's layout kind.
  "weave.item.setLayoutChild": {
    label: label("weave.item.setLayoutChild"),
    inputSchema: obj({ itemId: STR, policy: LAYOUT_CHILD_POLICY }, ["itemId"]),
  },
  "weave.item.swapGridCells": {
    label: label("weave.item.swapGridCells"),
    inputSchema: obj({ aId: STR, bId: STR }, ["aId", "bId"]),
  },
  "weave.item.swapFlexOrder": {
    label: label("weave.item.swapFlexOrder"),
    inputSchema: obj({ aId: STR, bId: STR }, ["aId", "bId"]),
  },
  "weave.item.dropGridCell": {
    label: label("weave.item.dropGridCell"),
    inputSchema: obj(
      {
        itemId: STR,
        x: { type: "number", description: "Target COLUMN — a 1-based grid cell index (NOT a ratio or px)." },
        y: { type: "number", description: "Target ROW — a 1-based grid cell index (NOT a ratio or px)." },
      },
      ["itemId", "x", "y"],
    ),
  },
  // DR-028 — decorations are units. One command sets/replaces/clears a decoration
  // unit; `attrs` IS the spec for that kind (null clears). Shadow:
  // { x, y, blur, spread, color }. Stroke: { paint:{type,color}, width, dashArray? }.
  // Fill: a PaintSpec ({type:"solid",color} | gradient | image). Filter:
  // { brightness?, contrast?, saturate?, blur?, hueRotate? }. Opacity: { value:0..1 }.
  /* WI-063 — subsumed by weave.item.add / weave.item.update `units`; hidden from
     the agent (AGENT_HIDDEN_COMMANDS in use-aku-agent). Registered for UI use.
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
    ),
  },
  */
};
