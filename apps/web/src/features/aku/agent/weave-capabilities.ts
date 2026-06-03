// 아쿠 (Aku) — design capabilities advertised to the agent (WI-054 hardening).
//
// `connectAgocraftAgent`'s auto-derived capabilities label every kind with just
// its name (no semantics), so the agent learns the SHAPE of attrs but not what
// they MEAN or weave's conventions. This curated object replaces them: it is
// rendered into the agent's CACHED system prompt (small-think design/prompt.ts
// `renderCapabilities`), grounding the model in weave's actual model so it picks
// the right kind + attrs instead of guessing.
//
// Shape matches @small-think/design `DesignCapabilities` (kept as a plain object
// — weave has no dependency on that server package; the field names are a wire
// contract consumed by the prompt renderer):
//   layoutKinds: { kind; description; childConstraints? }[]
//   itemKinds:   { kind; description; editableAttrs?; defaultAttrs?; units?; defaultUnits? }[]
//   unitKinds?:  { kind; description?; editableAttrs?; defaultAttrs? }[]
//
// Coordinate model (load-bearing — stated here AND in the cached WEAVE_DOMAIN_KNOWLEDGE
// §1): every item's `attrs.frame` is { x, y, width, height, rotation } where
// x/y/width/height are 0..1 RATIOS of the parent's box (root parent = the whole design)
// and rotation is radians about the center. There are no pixel coordinates.
//
// Token model (WI-078): the per-turn WEAVE_TASK_PRIMER is a COMPACT recall pointer —
// the full, stable structural/sizing/color/authoring/command rules live ONCE in the
// CACHED WEAVE_DOMAIN_KNOWLEDGE block (transferred at session init, prompt-cached
// server-side), not restated on every task. Add a new stable rule to the domain block,
// not the primer.

import { THEMES } from "@weave/design-system";

export const WEAVE_CAPABILITIES = {
  layoutKinds: [
    {
      kind: "absolute-constraints",
      description:
        "Free placement — each child sits at its own attrs.frame box. The default; use it unless the user asks for an auto row/column/grid. Set on a frame with weave.frame.setLayout { itemId, layout:{ kind:'absolute-constraints' } } (or omit layout to clear back to this).",
    },
    {
      kind: "auto-flex",
      description: [
        // CSS Flexbox / Figma Auto-Layout, single axis (no wrap in v1.1).
        "Auto row or column (like CSS flexbox / Figma Auto-Layout). The frame sizes & positions its children along one axis; each child's own attrs.frame is overridden by the layout.",
        "Set with weave.frame.setLayout { itemId, layout }, where layout = { kind:'auto-flex', direction:'row'|'column', gap, justify, align, padding }:",
        "• direction — 'row' (horizontal) | 'column' (vertical).",
        "• gap — spacing between children, a 0..1 ratio of the frame's MAIN axis.",
        "• justify — main-axis distribution: 'start'|'center'|'end'|'space-between'|'space-around'.",
        "• align — cross-axis alignment: 'start'|'center'|'end'|'stretch' ('stretch' = child fills the cross axis).",
        "• padding — { top, right, bottom, left }, each a 0..1 ratio of the frame.",
        "Per-child tuning via weave.item.setLayoutChild { itemId, policy:{ kind:'auto-flex', grow, shrink, basis, alignSelf? } }: grow/shrink are flex weights (≥0), basis is the main-axis base size (0..1 ratio of the parent frame's main axis, or 'auto' = use the child's own size), alignSelf overrides the parent align for that one child.",
      ].join(" "),
      childConstraints:
        "child attrs.frame is overridden by the flex layout; size/order it via weave.item.setLayoutChild (auto-flex policy) and weave.item.swapFlexOrder",
    },
    {
      kind: "auto-grid",
      description: [
        // CSS Grid subset — explicit tracks, no auto-fill / minmax / areas in v1.1.
        "Auto grid (a subset of CSS Grid). The frame lays children into explicit column/row tracks; each child's own attrs.frame is overridden by the grid. USE auto-grid for ANY TABLE / matrix / comparison grid / card grid / calendar / spec sheet — do NOT fake a table by nesting auto-flex rows (columns won't align and it is painful to edit). Set justify+align:'stretch' (or per-child alignSelf/justifySelf:'stretch') so each child FILLS its cell instead of hugging its content.",
        "Set with weave.frame.setLayout { itemId, layout }, where layout = { kind:'auto-grid', columns, rows, columnGap, rowGap, justify, align, padding }:",
        "• columns / rows — arrays of TrackSize. Each track is { kind:'fr', value } (fractional share, like CSS fr), { kind:'ratio', value } (fixed 0..1 ratio of the frame), or { kind:'auto' } (fit the track's children). An empty array = a single full-size track. Example 3 equal columns: columns:[{kind:'fr',value:1},{kind:'fr',value:1},{kind:'fr',value:1}].",
        "• columnGap / rowGap — track spacing, 0..1 ratios of the frame.",
        "• justify (column-axis) / align (row-axis) — 'start'|'center'|'end'|'stretch' for children inside their cell.",
        "• padding — { top, right, bottom, left }, 0..1 ratios of the frame (top/bottom of its height, left/right of its width).",
        "Per-child placement via weave.item.setLayoutChild { itemId, policy:{ kind:'auto-grid', column, row, columnSpan, rowSpan, alignSelf?, justifySelf? } }: column/row are 1-based cell indices, columnSpan/rowSpan (≥1) merge cells. Also weave.item.swapGridCells / weave.item.dropGridCell move children between cells.",
      ].join(" "),
      childConstraints:
        "child attrs.frame is overridden by the grid layout; place/size it via weave.item.setLayoutChild (auto-grid policy), weave.item.swapGridCells, weave.item.dropGridCell",
    },
  ],
  itemKinds: [
    {
      kind: "frame",
      description: [
        "A frame. A TOP-LEVEL frame (direct child of the design root) is a presentation SLIDE. A frame holds child items via weave.item.add with containerId = this frame's id; it has no text/image content of its own. NESTED FRAMES ARE YOUR PRIMARY LAYOUT TOOL: nest a frame (containerId = another frame's id), give it a layout via weave.frame.setLayout (auto-flex row/column or auto-grid), and it becomes a self-arranging container — a header band, a two-column split, a card, a card grid, a sidebar, a stat row. Build clean aligned layouts by composing nested layout frames, NOT by hand-placing every item. CRITICAL RULE: a nested frame is a SLIDE by default, so on EVERY nested (non-top-level) frame set attrs.presentable:false — that makes it a LAYOUT GROUP, not an extra slide, so ONLY the top-level frame you intend as the slide lands in the deck. Still use a plain SHAPE (rectangle) for a single coloured panel / divider / button background; reach for a nested frame when you want to GROUP and auto-arrange multiple items.",
        // SLIDE SEMANTICS — load-bearing for this presentation tool.
        "SLIDE: a top-level frame (a direct child of the design root) IS one presentation slide. The deck = the ordered list of these root frames; Present mode shows them in order. Add each slide-frame with weave.item.add { kind:'frame', frame:{ x: i*1.1, y:0, width:1, height:1 } } (slide index i, 0-based) and NO containerId (→ the design root). Give each slide a DISTINCT x (a left-to-right filmstrip) — do NOT put them all at { x:0, y:0, width:1, height:1 }, which overlaps every slide on one spot. weave.design.setPresentationOrder reorders the deck, and weave.design.reorderChildren reorders siblings. NESTED frames (containerId = another frame's id) organise a slide's content into rows/columns/grids/cards via a layout — set attrs.presentable:false on EACH so it stays a layout group, never an extra slide. For a single coloured panel / box / divider / button, prefer a SHAPE (kind:'shape', rectangle); use a nested frame to group + auto-arrange multiple items.",
        "BACKGROUND/FILL: give a slide-frame a background by setting a decoration.fill unit — weave.item.add { …, units:[{ kind:'decoration.fill', attrs:<PaintSpec> }] } at creation, or weave.item.update { itemId, units:[{ kind:'decoration.fill', attrs:<PaintSpec> }] } later — solid, gradient, or image/video paint (see the shape itemKind for the PaintSpec shape). For a photo background, prefer adding a kind:'image' child at frame {0,0,1,1} then weave.item.sendToBack. attrs.cornerRadius (0..1 ratio of the frame's OWN min(width, height) — not the parent) rounds the frame; decoration.shadow/.stroke also apply (see decoration units).",
        "LAYOUT: a frame can auto-arrange its children — set attrs.layout (a LayoutSpec) via weave.frame.setLayout to get a CSS-flex row/column or CSS-grid. See layoutKinds for the full auto-flex / auto-grid spec.",
      ].join(" "),
      editableAttrs: ["frame", "layout", "cornerRadius", "presentable"],
      units: ["decoration.fill", "decoration.shadow", "decoration.stroke", "decoration.opacity"],
    },
    {
      kind: "text",
      description: [
        "A text box. The visible string is attrs.text ('\\n' = line break).",
        // SIZING — the load-bearing part. fontSize is absolute design-px, NOT a
        // ratio, while attrs.frame is a 0..1 ratio of the parent. The two are
        // bridged by the canvas px size, given in each task's [디자인] line — use
        // it to pick a size that reads at the canvas scale.
        "SIZING: size the font by RATIO — attrs.fontSizeSpec { kind:'ratio', value:0..1 } where value is a fraction of the height of the frame THIS TEXT IS A DIRECT CHILD OF (its containerId frame), NOT the slide or canvas unless the slide is its direct parent. The ratio resolves against the IMMEDIATE parent frame, so the SAME ratio is bigger in a tall frame and smaller in a short nested frame. Use ratio for ALL text (e.g. heading ~0.06–0.09, subheading ~0.04, body ~0.03) — but those numbers assume the parent FILLS the slide; inside a shorter nested frame, raise the ratio so the rendered px stays right (ratio = target px ÷ the parent frame's px height). Do NOT use a fixed px size (a bare fontSize number or { kind:'px' }). NEVER put a fraction in the plain fontSize number — a 0..1 there renders as sub-pixel text; express ratios only via fontSizeSpec { kind:'ratio' }.",
        "SIZING ROLES (canvas px is in each task's [디자인] line): heading 48–96px (~5–9% of canvas height → ratio ~0.05–0.09), subheading 32–48px, body 24–32px (default 24), caption 14–18px. On 1920×1080 a heading ≈64px; on 800×600 ≈40px. These px→ratio numbers hold ONLY when the text's parent frame fills the slide — inside a nested frame that is only part of the slide, divide the target px by THAT frame's px height instead (e.g. a body line in a half-height card uses about double the body ratio).",
        // PLACEMENT — a text item is normally a CHILD of an auto-layout frame; its box
        // is LAYOUT-SIZED (fills its cell via stretch/grow), not self-sized to content.
        "PLACEMENT & SIZING: add text as a CHILD of an auto-layout frame (containerId = a layout frame) and let that frame (auto-flex / auto-grid) size and position it — set the frame's layout (direction, gap, padding, justify, align) deliberately rather than hand-placing the text. The text box is LAYOUT-SIZED, not self-sized: make it FILL its cell — set the frame's align:'stretch' (auto-flex cross axis) and justify+align:'stretch' (auto-grid both axes), give an auto-flex child grow so it fills the main axis (or equal basis / fr tracks for equal cells), or alignSelf/justifySelf:'stretch' per child — so even a SHORT title occupies its WHOLE cell instead of hugging its text and leaving the cell half-empty. Position the glyphs inside the filled box with textAlignHorizontal / textAlignVertical. Do NOT pin a guessed px height, and do NOT detach a layout child with absolute-constraints (that removes it from the flow). ONLY when a text sits directly in an absolute-constraints frame (intentional free-form placement) give it an explicit frame and pin it: weave.item.setLayoutChild { itemId, policy:{ kind:'absolute-constraints', anchor:{ horizontal:'left', vertical:'top' } } }.",
        "STYLE: fontFamily (CSS stack), fontWeight ('normal' | 'bold'), fontStyle ('normal' | 'italic'), color, textDecoration ('NONE' | 'UNDERLINE' | 'STRIKETHROUGH'), textCase ('ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE').",
        "COLOR — DEFAULT to a theme token by ROLE so text re-skins with the theme: title/heading → var(--text-strong); body/paragraph → var(--text-default); secondary/supporting → var(--text-soft); caption/footnote/label → var(--text-muted); EMPHASIZED word/number/KPI/highlight → var(--accent) (or var(--accent-strong)). If you set NO color it already defaults to var(--text-default) (never lazily hard-code a neutral dark/light hex). Override with a LITERAL color only when the content's MOOD wants a specific text color (mood > theme), or for brand/data-bound text.",
        "LAYOUT: textAlignHorizontal ('LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED'), textAlignVertical ('TOP' | 'CENTER' | 'BOTTOM'), lineHeightSpec ({ value, unit: 'multiplier' | 'px' }, default 1.4×), letterSpacing / paragraphSpacing / paragraphIndent (all design-px).",
        "Edit any of these with weave.item.update { itemId, attrs }.",
      ].join(" "),
      editableAttrs: [
        "frame",
        "text",
        "fontFamily",
        "fontSize",
        "fontSizeSpec",
        "fontWeight",
        "fontStyle",
        "color",
        "textDecoration",
        "textCase",
        "textAlignHorizontal",
        "textAlignVertical",
        "lineHeightSpec",
        "letterSpacing",
        "paragraphSpacing",
        "paragraphIndent",
        "opacity",
      ],
      // Baseline for a freshly-added text item — mirrors seed.ts `text` defaults
      // (apps/web/src/document/seed.ts:134-167). Keep in sync if seed changes.
      defaultAttrs: {
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        fontSize: 24,
        fontSizeSpec: { kind: "px", value: 24 },
        fontWeight: "normal",
        fontStyle: "normal",
        color: "var(--text-default)",
        textAlignHorizontal: "LEFT",
        textAlignVertical: "TOP",
        lineHeightSpec: { value: 1.4, unit: "multiplier" },
        letterSpacing: 0,
        opacity: 1,
      },
    },
    {
      kind: "shape",
      description: [
        "A vector shape. Create with weave.item.add { kind:'shape', frame, attrsOverride:{ shape:<subKind>, subAttrs:{ shape:<subKind>, …params } } } — the subKind appears in BOTH attrs.shape and attrs.subAttrs.shape (the subAttrs carries the kind's geometry params). Defaults to a rectangle if you omit it.",
        "PREFER A RECTANGLE SHAPE for a rectangular element inside a slide — panels, cards, backgrounds, coloured blocks, dividers, button shapes — colour it with a decoration.fill unit (weave.item.add/update `units`). Use a nested frame ONLY when you want to group several items into one movable/clippable unit (not for a single coloured rectangle).",
        // SUB-KINDS — the full ShapeSubKind union (builtin-kinds.ts). The params
        // in subAttrs differ per kind; only those listed belong to each.
        "SUB-KINDS and their subAttrs params:",
        "• rectangle — { cornerRadii:{ tl, tr, br, bl } } (per-corner px; set/edit via weave.item.update { attrs:{ subAttrs:{ shape:'rectangle', cornerRadii } } }).",
        "• ellipse — (none).",
        "• line — { thickness? }.",
        "• arrow — { heads:{ start, end } each 'none'|'triangle'|'open'|'diamond'|'circle', headSize }.",
        "• triangle — { variant: 'equilateral'|'isosceles-up'|'isosceles-down'|'right-angle' }.",
        "• star — { points (number of points), innerRatio (0..1 inner/outer radius) }.",
        "• polygon — a REGULAR N-gon: { sides } (e.g. 6 = hexagon).",
        "• poly — a FREEFORM polygon from explicit vertices: { points:[{x,y},…] each a 0..1 ratio of THIS shape's OWN bbox (NOT the parent frame / design), closed:boolean (true = filled polygon, false = open polyline) }. Edit the vertices later with weave.item.update { attrs:{ subAttrs:{ shape:'poly', points, closed } } }.",
        "CONVERT shape → line: weave.shape.breakToLine { itemId, vertexIndex? } opens a closed shape at one outline vertex into a stroke-only `line` (works for rectangle/triangle/polygon/star/ellipse/closed poly; the fill becomes the stroke).",
        "• path — opaque raw SVG path: { d:'<svg path data>' }.",
        "• speech-bubble — { tail:{ anchorX, anchorY (0..1 of THIS shape's OWN bbox), direction:'down'|'up'|'left'|'right'|'free' }, cornerRadius (px) }.",
        "• heart — { variant: 'classic'|'rounded' }.",
        // FILL — gradients are first-class, not solid-only.
        "FILL: set a decoration.fill unit via weave.item.add/update { units:[{ kind:'decoration.fill', attrs:<PaintSpec> }] }, where PaintSpec is discriminated on `type`: { type:'solid', color } | { type:'linear-gradient', angle (deg, 0=up 90=right — not a ratio), stops:[{offset:0..1 along the gradient axis, color},…] (≥2) } | { type:'radial-gradient', cx, cy (0..1 of the shape's OWN bbox — the gradient center), stops:[…] (≥2) } | { type:'image', src, fit?, opacity? } | { type:'video', src, fit?, muted?, loop?, opacity? } | { type:'none' } (transparent). Paint fit = cover|contain|fill|tile. color is any CSS color (#rrggbb/#rrggbbaa/rgb()/var(--token)).",
        // DECORATIONS — shadow / stroke / filter / opacity are units, not attrs.
        "DECORATIONS: stroke, shadow, blur/color filters and layer opacity are decoration UNITS set via weave.item.add/update `units` (see the decoration unitKinds) — they are NOT attrs fields. Corner radius for rectangles goes in attrs.subAttrs.cornerRadii (absolute px) via weave.item.update. Size/position/rotation via attrs.frame; this shape can also be a layout child or carry its own attrs.layout.",
      ].join(" "),
      editableAttrs: ["frame", "shape", "subAttrs", "layout", "layoutChild"],
      units: [
        "decoration.fill",
        "decoration.stroke",
        "decoration.shadow",
        "decoration.filter",
        "decoration.opacity",
      ],
    },
    {
      kind: "line",
      description: [
        "A stroke-only LINE / curve — a DISTINCT kind from `shape` (NO fill, no area). Create with weave.item.add { kind:'line', frame, attrsOverride:{ points:[{x,y},…] (≥2, each a 0..1 ratio of the line's OWN bbox), smooth?:boolean, heads?:{ start, end } } }.",
        "`points` define the polyline; `smooth:true` renders a Catmull-Rom curve through them. The bounding box follows the points (vertex / endpoint editing). A 2-point line = 직선; many points = 자유선; smooth = 곡선/자유곡선.",
        "ENDPOINT MARKERS: `heads:{ start, end }` — each 'none'|'triangle'|'open'|'diamond'|'circle' (arrow / dot ends).",
        "COLOUR / WIDTH: the stroke is a `decoration.stroke` UNIT — set via weave.item.add/update { units:[{ kind:'decoration.stroke', attrs:{ paint, width, lineCap?, lineJoin?, dashArray? } }] }. A line has NO fill.",
        "Use `line` for arrows, connectors, underlines, dividers, freeform strokes, and curves. Use a `shape` for filled / area elements (rectangle, ellipse, polygon, …).",
        "CONVERT line → shape: weave.line.closeToShape { itemId } fuses the two endpoints of a free line/curve into ONE vertex and closes it into a filled `poly` shape (needs ≥3 points; the stroke becomes the fill).",
      ].join(" "),
      editableAttrs: ["frame", "points", "smooth", "heads", "layoutChild"],
      units: ["decoration.stroke", "decoration.shadow", "decoration.opacity"],
    },
    {
      kind: "image",
      description:
        "An image. attrs.src is the URL/data-URL, attrs.alt the description, attrs.fit one of cover|contain|fill, attrs.borderRadius a 0..1 ratio of the image's OWN min(width, height) (not the parent). Size/position via attrs.frame. " +
        'attrs.src is OPTIONAL: OMIT it (or pass "") to create a SOURCE-LESS PLACEHOLDER — a neutral framed box with an image glyph, NOT a broken image. Use this for wireframe/layout drafts where the real picture is added later. When src is empty, attrs.alt is rendered as CENTERED CAPTION TEXT inside the placeholder (so set a short alt like "제품 사진 자리" to label the slot); once a real src is set, alt reverts to its accessibility role and is no longer drawn.',
      editableAttrs: ["frame", "src", "alt", "fit", "opacity", "borderRadius"],
    },
    {
      kind: "video",
      description:
        "A video. attrs.src is the URL; autoplay/loop/muted/controls are booleans; attrs.fit one of cover|contain|fill. Size/position via attrs.frame. " +
        'attrs.src is OPTIONAL, just like image: OMIT it (or pass "") to create a SOURCE-LESS PLACEHOLDER for wireframe/layout drafts — NOT an empty black player. When src is empty, the placeholder is either (a) attrs.poster rendered as a static COVER IMAGE with a play badge (set attrs.poster to a thumbnail/still URL), or (b) if no poster, a neutral framed box with a play/film glyph. ' +
        'attrs.alt is a short DESCRIPTION of the clip (e.g. "제품 데모 영상", "드론 항공 b-roll") — like image alt: when src is empty it is drawn as CENTERED CAPTION TEXT inside the placeholder so the slot says what KIND of video belongs there; once a real src is set, alt becomes the accessibility description. ALWAYS set attrs.alt on a video so the intent is clear even before a real clip is dropped in.',
      editableAttrs: [
        "frame",
        "src",
        "alt",
        "poster",
        "autoplay",
        "loop",
        "muted",
        "controls",
        "fit",
      ],
    },
  ],
  unitKinds: [
    // ── DECORATION units (DR-028) — visual styling attached to ANY visual item
    //    (shape / image / video / text / frame). Set/replace/clear via the `units`
    //    arg of weave.item.add / weave.item.update (attrs null = clear on update).
    //    DISTINCT from the behavior units below (those use weave.item.addBehavior).
    {
      kind: "decoration.fill",
      description:
        "Fill paint of the item (e.g. a shape's interior, a frame's background). attrs is a PaintSpec: { type:'solid', color } | { type:'linear-gradient', angle, stops:[{offset,color},…] } | { type:'radial-gradient', cx, cy, stops } | { type:'image', src, fit?, opacity? } | { type:'video', src, fit?, muted?, loop?, opacity? } | { type:'none' }. Paint fit = cover|contain|fill|tile.",
      editableAttrs: ["type", "color", "angle", "cx", "cy", "stops", "src", "fit", "opacity"],
    },
    {
      kind: "decoration.stroke",
      description:
        "Outline/border. attrs = { paint:<PaintSpec>, width (design-px), dashArray?:[dash,gap,…], lineCap?:'butt'|'round'|'square', lineJoin?:'miter'|'round'|'bevel' }.",
      editableAttrs: ["paint", "width", "dashArray", "lineCap", "lineJoin"],
    },
    {
      kind: "decoration.shadow",
      description:
        "Drop/inner shadow. attrs = { x, y (offset, design-px), blur, spread (design-px), color (CSS color, use rgba()/#rrggbbaa for soft shadows), inset?:boolean (true = inner shadow) }.",
      editableAttrs: ["x", "y", "blur", "spread", "color", "inset"],
    },
    {
      kind: "decoration.filter",
      description:
        "CSS-like filter. attrs = { brightness?, contrast?, saturate? (1.0 = identity), blur? (px), hueRotate? (deg) }. Only the supplied keys apply.",
      editableAttrs: ["brightness", "contrast", "saturate", "blur", "hueRotate"],
    },
    {
      kind: "decoration.opacity",
      description: "Layer opacity. attrs = { value: 0..1 } (1 = opaque, 0 = invisible).",
      editableAttrs: ["value"],
    },
    // ── BEHAVIOR units — presentation interactivity. Set with
    //    weave.item.addBehavior / weave.item.removeBehavior / weave.behavior.update.
    {
      kind: "camera-target",
      description:
        "A presentation step. Add to an item (weave.item.addBehavior) to make it a stop in Present mode. position { x, y } (0..1 of the WHOLE DESIGN / canvas — not the item or its parent) and scale set the camera; order sets the sequence.",
      editableAttrs: ["position", "scale", "order", "label"],
    },
    {
      kind: "hotspot",
      description:
        "A clickable region that triggers an action (e.g. jump to a camera target). region { x, y, width, height } (0..1 of the ITEM's OWN box — item-local, so it rides the item's resize; NOT the parent frame or design), trigger (\"click\"), action.",
      editableAttrs: ["region", "trigger", "action", "label"],
    },
    {
      kind: "reveal-on-step",
      description:
        'Hides the item until a given presentation step. step (0-indexed camera order), mode ("fade" | …).',
      editableAttrs: ["step", "mode", "label"],
    },
  ],
} as const;

/** COMPACT per-task primer (WI-078). The full, stable rules — structure, sizing,
 *  color tokens, slide layout, command discipline — live ONCE in the cached
 *  WEAVE_DOMAIN_KNOWLEDGE block (session-init, prompt-cached server-side). This
 *  per-turn text is only a short recall of the few highest-leverage, most-error-prone
 *  rules, kept here (in the task message, not the cached prompt) because their recency
 *  on each task measurably helps adherence. Do NOT re-expand it — add stable rules to
 *  the domain block instead. */
export const WEAVE_TASK_PRIMER = [
  "[weave conventions] Your cached weave domain knowledge + capabilities hold the FULL structural, sizing, color and command rules — follow them on every item. Highest-leverage reminders for THIS task:",
  "- MOOD FIRST (top priority): infer the content's tone/subject and express it through layout, typography, spacing, imagery, shapes, density, contrast AND color — never a generic default layout; the design must read as 'about this topic' at a glance. Color follows the MOOD ahead of the active theme: structural/neutral roles → var(--token) (re-skins), mood/brand/data/status → a literal color.",
  "- Coordinates AND fontSizeSpec ratios are 0..1 of the IMMEDIATE PARENT FRAME (the item's containerId frame), NEVER pixels and NOT relative to the slide/canvas: a font ratio resolves against the frame the text directly sits in, so the SAME ratio is smaller inside a shorter nested frame. Use the canvas px in the [디자인] line to pick the TARGET px, then divide by the parent frame's px height to get the ratio.",
  "- One slide = its OWN top-level frame; place slides at DISTINCT x (filmstrip: slide i at { x: i*1.1, y:0, width:1, height:1 }), NEVER all at {0,0,1,1}. A Markdown document → ONE slide.",
  "- STRUCTURE EVERY SLIDE FROM NESTED LAYOUT FRAMES — REQUIRED, and the #1 rule to get wrong: do NOT hand-place content items on the slide root with absolute x/y. For EACH region (header, body, columns, card grid, stat row) FIRST add a nested frame (containerId = the slide, presentable:false) and give it weave.frame.setLayout (auto-flex row/column or auto-grid: direction, gap, padding, justify, align), THEN add the items as that frame's CHILDREN so the layout positions them. Nest frames inside frames for sub-structure. Absolute x/y on the slide root is ONLY for deliberate free-form composition, never the default.",
  "- TABLES / matrices → auto-grid with explicit tracks, NEVER nested flex rows. Every layout child FILLS its cell (frame align:'stretch' + grid justify/align:'stretch', flex grow) — a short title still occupies its whole cell; the LAYOUT sizes items, text just aligns inside (textAlign) and never hugs its content.",
  "- Pick the STRUCTURE that best communicates the content, and use MEDIA/SHAPES (source-less placeholders when you lack a real asset) instead of text-only slides.",
].join("\n");

/** The registered theme set, formatted for the agent prompt — derived from the
 *  design-system `THEMES` registry so it can never drift from the real list. One
 *  line per tone group: "Label (hint) · Label (hint) · …". */
const THEME_REGISTRY_LINES: readonly string[] = (() => {
  const byTone = (tone: "dark" | "light") =>
    THEMES.filter((t) => t.tone === tone)
      .map((t) => `${t.label} (${t.hint})`)
      .join(" · ");
  return [
    "",
    "7) AVAILABLE THEMES — the user can switch the editor theme at any time, and a token-built design re-skins to",
    "   whichever is active. You CANNOT switch it yourself (the user picks it) — but you MAY recommend one that",
    "   fits the content's mood. Registered themes:",
    `     • dark  — ${byTone("dark")}`,
    `     • light — ${byTone("light")}`,
    "   Mood → theme hints: B2B / finance / data-forward → Mono or Ocean; playful / kids / comic → Vivid or",
    "   Webtoon; editorial / warm / print → Paper; nature / calm → Forest; premium / hero → Aurora or Sunset.",
    "   The CURRENTLY-ACTIVE theme (name + light/dark tone) is given in each task's [현재 테마] line — use its",
    "   tone to keep any LITERAL colors (chart series, status) readable on that surface; structural color stays",
    "   in var(--token) so it follows whatever theme the user has on.",
  ];
})();

/** Stable weave DESIGN-DOMAIN expertise, transferred ONCE at session init (the ctl
 *  hello → server's cached "# weave domain knowledge" prompt block). Unlike
 *  WEAVE_TASK_PRIMER (per-task, view-state-sensitive), this is the enduring "how
 *  weave's model works and how to design well in it" — cheap because it is cached. */
export const WEAVE_DOMAIN_KNOWLEDGE = [
  "weave STRUCTURE & SIZING RULES — get these exactly right. Follow them on every item:",
  "",
  "0) TOP-LEVEL FRAMES ARE SLIDES. kind:'frame' as a direct child of the design root is a presentation slide.",
  "   NESTED LAYOUT FRAMES ARE MANDATORY — build EVERY slide's structure from them. This is the rule most often",
  "   broken; treat it as a hard requirement, not a preference. PROCEDURE for each slide: (a) add the top-level",
  "   slide frame; (b) for EACH region — header band, body, a two-column split, a card / card grid, a sidebar, a",
  "   stat row — add a NESTED frame (containerId = the slide frame, attrs.presentable:false) and give it a layout",
  "   via weave.frame.setLayout (auto-flex row/column or auto-grid: direction, gap, padding, justify, align);",
  "   (c) add the content items as CHILDREN of those nested frames so the layout positions and spaces them. Nest",
  "   frames inside frames for sub-structure (a column that itself stacks a title + body). DO NOT drop text /",
  "   images / shapes straight onto the slide frame with hand-picked x/y — absolute placement on the slide root",
  "   is ONLY for deliberate free-form composition, never the default way to lay out a slide.",
  "   CRITICAL: a nested frame is a SLIDE by default, so on EVERY nested (non-top-level) frame set",
  "   attrs.presentable:false — it then counts as a LAYOUT GROUP, not an extra slide, so ONLY the top-level",
  "   frame you intend as the slide lands in the deck. Set it at creation (weave.item.add attrsOverride:",
  "   { presentable:false }) or later (weave.item.update attrs:{ presentable:false }).",
  "   For a single coloured panel / divider / button background, still prefer a SHAPE (kind:'shape',",
  "   rectangle); reach for a nested frame to GROUP and auto-arrange multiple items.",
  "   TABLES ARE GRIDS: for ANY table / matrix / comparison grid / card grid / calendar / spec sheet, the region",
  "   frame MUST be auto-grid with explicit column/row tracks (weave.frame.setLayout { kind:'auto-grid', columns,",
  "   rows }), each cell placed by { column, row, columnSpan?, rowSpan? } — NEVER fake a table with a stack of",
  "   nested auto-flex rows; columns won't line up and it is painful to edit.",
  "",
  "1) FRAME COORDINATES ARE RATIOS OF THE ITEM'S OWN PARENT FRAME, NEVER PIXELS. attrs.frame = { x, y, width,",
  "   height, rotation } where x / y / width / height are 0..1 RATIOS of the frame the item is a DIRECT CHILD of",
  "   (its containerId frame) — a top-level frame's parent is the whole design, but a NESTED item's parent is its",
  "   containing frame, NOT the slide or design root. e.g. { x:0.1, y:0.1, width:0.8, height:0.3 } = 'start 10% in,",
  "   80% wide, 30% tall' OF THAT PARENT FRAME. rotation is radians about the center. NEVER pass pixels into frame,",
  "   and always measure a child against its IMMEDIATE container — never against the slide unless the slide IS its",
  "   direct parent. (In an auto-flex/auto-grid frame the layout overrides a child's frame; the ratio basis still",
  "   matters for the frame's OWN box and for any absolute-constraints child.)",
  "",
  "2) FONT SIZE IS A RATIO OF THE TEXT'S OWN PARENT FRAME. Set the size with attrs.fontSizeSpec =",
  "   { kind:'ratio', value: 0..1 } — value is a FRACTION OF THE HEIGHT OF THE FRAME THE TEXT IS A DIRECT CHILD OF",
  "   (its containerId frame), NOT the slide and NOT the canvas (unless the slide IS its direct parent). So the",
  "   SAME ratio renders at different px in different frames: 0.1 fills a tenth of a full-height slide, but 0.1 in",
  "   a half-height nested frame is only half as tall. When text sits inside a nested layout frame, compute the",
  "   ratio against THAT frame: ratio = target px ÷ the parent frame's px height (parent px height = canvas height",
  "   × the parent frame's own height ratio, chained through every level of nesting). A heading that should fill a",
  "   small card needs a LARGER ratio than the same heading on a full slide. Do NOT use a fixed px size: avoid a",
  "   bare fontSize number and avoid fontSizeSpec { kind:'px' }. (Never put a fraction into the plain fontSize",
  "   number — that renders as sub-pixel, invisible text; ratios go ONLY in fontSizeSpec { kind:'ratio' }.)",
  "",
  "3) ITEMS ARE LAYOUT-SIZED — FILL THE CELL, DON'T HUG. Text and other items are normally CHILDREN of an",
  "   auto-flex / auto-grid frame: add them with containerId = a layout frame and the frame sizes + positions",
  "   them. Make every child FILL its allocated cell — set the frame's align:'stretch' (auto-flex cross axis) and",
  "   justify+align:'stretch' (auto-grid both axes), give auto-flex children grow (or equal basis / fr tracks for",
  "   equal cells), or alignSelf/justifySelf:'stretch' per child — so even a SHORT title occupies its WHOLE cell",
  "   instead of hugging its content and leaving dead space. A text box's size is owned by the LAYOUT, not by the",
  "   text; place the glyphs inside the filled box with textAlignHorizontal/textAlignVertical. Grid children must",
  "   follow layout changes the same way (track size, gap, span) — set them via weave.item.setLayoutChild",
  "   (auto-grid policy: column/row/columnSpan/rowSpan/alignSelf/justifySelf). Do NOT pin a guessed px height and",
  "   do NOT detach a layout child with absolute-constraints (that removes it from the flow). ONLY for an item",
  "   placed directly in an absolute-constraints frame (intentional free-form placement) give it an explicit",
  "   frame and pin it: weave.item.setLayoutChild { itemId, policy:{ kind:'absolute-constraints', anchor:{",
  "   horizontal:'left', vertical:'top' } } }.",
  "",
  "4) COLOR — the CONTENT'S MOOD comes FIRST, ahead of the currently-active theme. Read the atmosphere the",
  "   content should convey (finance → restrained/serious; kids → bright/playful; luxury → deep/elegant) and",
  "   build the palette to express THAT — do NOT let whatever theme is currently active dictate the design's",
  "   look. Use var(--token) strings for STRUCTURAL / NEUTRAL roles only (page background, body & heading text,",
  "   generic panels, a primary accent) so those re-skin when the user switches theme (weave ships 10 themes,",
  "   each publishing the SAME semantic token set; the string is stored verbatim and CSS resolves it per the",
  "   active [data-theme]). Do NOT blanket the whole design in tokens just because they re-skin — that makes",
  "   every design look identical to the current theme; the design's color CHARACTER should come from the",
  "   content. When the content's mood calls for a colour the theme can't express (a brand palette, an evocative",
  "   scheme, a signature accent), USE A LITERAL colour. (Only avoid the LAZY literal — a hand-picked grey",
  "   background where var(--bg-page) would do; a deliberate, mood-driven literal is correct.)",
  "",
  "   STRUCTURAL color → token is the default (backgrounds, text, emphasis, panels):",
  "     • backgrounds  — var(--bg-page) (base) · var(--bg-page-soft) (slightly raised / solid card)",
  "     • text         — var(--text-strong) headings · var(--text-default) body ·",
  "                      var(--text-soft) secondary · var(--text-muted) caption/disabled",
  "     • emphasis     — var(--accent) primary · var(--accent-strong) stronger ·",
  "                      var(--accent-soft) LOW-ALPHA tint (badge / highlighted-section background)",
  "     • panels/cards — var(--surface-1) · var(--surface-2) — TRANSLUCENT glass (the page bg shows",
  "                      THROUGH; NOT an opaque card). For a solid card panel use var(--bg-page-soft).",
  "     • multi-hue    — var(--domain-slide-accent) / --domain-canvas-accent / --domain-block-accent /",
  "                      --domain-media-accent: four DISTINCT, theme-coordinated hues. Use as a categorical",
  "                      palette — chart series, category chips, up to 4 groups that should read as different.",
  "     • gradient     — SOLID fill is the DEFAULT; reach for a gradient only as an occasional, deliberate",
  "                      accent (a hero or section backdrop where the mood wants depth), NOT for ordinary",
  "                      panels, cards, text, or every background. When you do, keep it subtle and let token",
  "                      stops keep it theme-reactive — e.g. a hero background units:[{ kind:'decoration.fill',",
  "                      attrs:{ type:'linear-gradient', angle:135, stops:[{offset:0,color:'var(--accent)'},",
  "                      {offset:1,color:'var(--accent-strong)'}] } }], or a subtle var(--bg-page)→",
  "                      var(--bg-page-soft). A literal-stop gradient is fine when the mood needs a blend.",
  "",
  "   LITERAL hex/rgb → when it serves the content's MOOD better than any token, AND for: brand / logo colors ·",
  "   data values bound to a specific color · photographic content · universal status (green / amber / red).",
  "",
  "   Tokens (and literals) work in EVERY color field — text attrs.color, decoration.fill / .stroke PaintSpec",
  "   `color` (solid or gradient stops), and the slide/frame background. Beyond color, MOOD is ALSO carried by",
  "   LAYOUT, typography, spacing, imagery, density and contrast — so the deck reads as 'about this topic'",
  "   whether you colored it with tokens (re-skins) or with mood-driven literals.",
  "",
  "5) AUTHORING — translate content into the right form:",
  "   • SLIDE PLACEMENT: each slide is its OWN top-level frame (direct child of the design root). Place them at",
  "     DISTINCT positions — NEVER give every slide { x:0, y:0, width:1, height:1 } (that stacks them all on one",
  "     spot). Lay them LEFT-TO-RIGHT like a filmstrip: slide index i (0-based) at frame",
  "     { x: i*1.1, y:0, width:1, height:1, rotation:0 } — full canvas, 0.1 gap. x is a 0..1 ratio of the design",
  "     but is NOT capped at 1 (the board extends right). Create with weave.item.add { kind:'frame',",
  "     frame:{ x:i*1.1, y:0, width:1, height:1 } } and NO containerId (→ the design root); the call returns the",
  "     new frame's id — build that slide by adding items with containerId = that id. weave.design.setPresentationOrder",
  "     reorders the deck.",
  "   • STRUCTURE: pick the document/layout form that suits the content (title + bullet list, two-column",
  "     comparison, hero statement, stat/number grid, timeline, step flow, big quote, image + caption) instead of",
  "     stacking text top-to-bottom. Choose what communicates THIS content best.",
  "   • MEDIA & SHAPES — do NOT make text-only slides when a visual communicates better: kind:'image' for any",
  "     visual subject; kind:'video' for motion/demo/footage; kind:'shape' for diagrams, dividers, color blocks,",
  "     badges, callouts, icon-like glyphs (poly/path), backdrops; kind:'qr' for a scannable link/URL. When you",
  "     have no real asset URL, STILL place a source-less PLACEHOLDER (image: omit src + a descriptive alt like",
  "     '제품 사진 자리'; video: omit src + alt = clip description, optionally a poster URL) so the slot shows",
  "     instead of an empty/text-only slide. Always give image/video a descriptive alt. Match media to the topic.",
  "   • MARKDOWN input → ONE slide: when the request's content arrives as Markdown, represent that whole document",
  "     on a SINGLE slide (one md doc = one slide), not a multi-slide deck.",
  "   • IMAGE AS BACKGROUND: add a kind:'image' child at frame { x:0, y:0, width:1, height:1 } with fit:'cover',",
  "     then weave.item.sendToBack so it sits behind the other items. Attached [첨부 이미지 에셋] URLs are real",
  "     assets — use them as attrs.src.",
  "",
  "6) COMMANDS & TOOLING DISCIPLINE:",
  "   • TWO commands for items: weave.item.add to ADD, weave.item.update to CHANGE any attribute/style — BOTH",
  "     take attrs AND units (fill/shadow/stroke/cornerRadii/poly-points) in ONE call. Do NOT look for",
  "     weave.shape.setFill / setCornerRadius / setVertices / weave.item.setDecoration — they do not exist;",
  "     everything they did is done via weave.item.add / weave.item.update.",
  "   • CREATE FULLY STYLED in ONE call: weave.item.add takes `units` (decoration.fill/.stroke/.shadow/.filter/",
  "     .opacity) alongside attrsOverride — set fill/gradient/shadow/stroke AT creation in the same add call",
  "     (e.g. units:[{ kind:'decoration.fill', attrs:{ type:'linear-gradient', angle:90, stops:[…] } }]). Use",
  "     update's `units` only to EDIT an existing item, not right after adding one.",
  "   • CREATE INSIDE A FRAME: pass containerId = that frame's id to weave.item.add (new items default to a",
  "     full-parent frame; adjust afterwards with weave.item.update).",
  "   • MULTI-SELECTION = TWO commands, each ONE undo step (prefer over looping a singular command):",
  "     weave.items.update { itemIds, attrs?, units?, updates?, op? } edits many at once — shared attrs, shared",
  "     units, per-item frames (updates), and align/distribute (op = align-left|align-horizontal-center|align-right|",
  "     align-top|align-vertical-center|align-bottom|distribute-horizontal|distribute-vertical, same parent); and",
  "     weave.items.lifecycle { itemIds, op:'remove'|'duplicate' } for bulk delete/clone. Do NOT use",
  "     weave.items.align / resizeMulti / remove / duplicate — they are folded into these two.",
  "   • FLIP / MIRROR via the transform.flip unit: weave.item.update { itemId, units:[{ kind:'transform.flip',",
  "     attrs:{ flipH:true } }] } (flipH = left/right, flipV = up/down; image/video/shape/line/frame only). On",
  "     weave.item.update / weave.items.update, pass a unit's attrs:null to CLEAR it (remove a shadow, or un-flip",
  "     with flipH:false).",
  "   • Target existing items by the id shown in the current document (already in the prompt — no separate fetch",
  "     step). Issue every edit the request needs (a full deck is many calls); avoid only redundant ones, and if a",
  "     tool returns an error, read it and adjust.",
  ...THEME_REGISTRY_LINES,
].join("\n");
