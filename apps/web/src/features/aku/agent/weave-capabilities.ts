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
// Coordinate model (load-bearing — stated here AND in the per-task primer): every
// item's `attrs.frame` is { x, y, width, height, rotation } where x/y/width/height
// are 0..1 RATIOS of the parent's box (root parent = the whole design) and
// rotation is radians about the center. There are no pixel coordinates.

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
        "Auto grid (a subset of CSS Grid). The frame lays children into explicit column/row tracks; each child's own attrs.frame is overridden by the grid.",
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
        "A SLIDE container. Frames are used ONLY as top-level slides (direct children of the design root). A slide holds its child items via weave.item.add with containerId = this slide's id; it has no text/image content of its own. NEVER add a frame inside another frame — for a rectangle inside a slide, use a SHAPE (see the shape itemKind), not a frame.",
        // SLIDE SEMANTICS — load-bearing for this presentation tool.
        "SLIDE: a top-level frame (a direct child of the design root) IS one presentation slide. The deck = the ordered list of these root frames; Present mode shows them in order. Add each slide-frame with weave.item.add { kind:'frame', frame:{ x: i*1.1, y:0, width:1, height:1 } } (slide index i, 0-based) and NO containerId (→ the design root). Give each slide a DISTINCT x (a left-to-right filmstrip) — do NOT put them all at { x:0, y:0, width:1, height:1 }, which overlaps every slide on one spot. weave.design.setPresentationOrder reorders the deck, and weave.design.reorderChildren reorders siblings. RULE: kind:'frame' is ONLY for these top-level slides — NEVER nest a frame inside a frame. For any rectangular panel, card, box, divider, or coloured block INSIDE a slide, add a SHAPE (kind:'shape', rectangle), not a frame.",
        "BACKGROUND/FILL: give a slide-frame a background by setting a decoration.fill unit (weave.item.setDecoration { itemId, kind:'decoration.fill', attrs:<PaintSpec> }) — solid, gradient, or image/video paint (see the shape itemKind for the PaintSpec shape). For a photo background, prefer adding a kind:'image' child at frame {0,0,1,1} then weave.item.sendToBack. attrs.cornerRadius (0..1 ratio of the frame's OWN min(width, height) — not the parent) rounds the frame; decoration.shadow/.stroke also apply (see decoration units).",
        "LAYOUT: a frame can auto-arrange its children — set attrs.layout (a LayoutSpec) via weave.frame.setLayout to get a CSS-flex row/column or CSS-grid. See layoutKinds for the full auto-flex / auto-grid spec.",
      ].join(" "),
      editableAttrs: ["frame", "layout", "cornerRadius"],
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
        "SIZING: size the font by RATIO — attrs.fontSizeSpec { kind:'ratio', value:0..1 } where value is a fraction of the PARENT FRAME's height (root = design height), so the text scales with the frame. Use ratio for ALL text (e.g. heading ~0.06–0.09, subheading ~0.04, body ~0.03). Do NOT use a fixed px size (a bare fontSize number or { kind:'px' }). NEVER put a fraction in the plain fontSize number — a 0..1 there renders as sub-pixel text; express ratios only via fontSizeSpec { kind:'ratio' }.",
        "SIZING ROLES (canvas px is in each task's [디자인] line): heading 48–96px (~5–9% of canvas height → ratio ~0.05–0.09), subheading 32–48px, body 24–32px (default 24), caption 14–18px. On 1920×1080 a heading ≈64px; on 800×600 ≈40px.",
        // RESIZE — a text box auto-fits its height by default, so the agent only
        // needs to choose width + fontSize; height is derived from wrapped text.
        "RESIZE: keep every text box FIXED — do NOT use auto-height or auto-width. A text box auto-grows its height by default; disable that. Give it an explicit frame (BOTH width and height) and pin it: weave.item.setLayoutChild { itemId, policy:{ kind:'absolute-constraints', anchor:{ horizontal:'left', vertical:'top' } } } (a non-scale anchor turns off auto-resize).",
        "STYLE: fontFamily (CSS stack), fontWeight ('normal' | 'bold'), fontStyle ('normal' | 'italic'), color (CSS color), textDecoration ('NONE' | 'UNDERLINE' | 'STRIKETHROUGH'), textCase ('ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE').",
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
        color: "#1f2933",
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
        "USE A RECTANGLE SHAPE for ANY rectangular element inside a slide — panels, cards, backgrounds, coloured blocks, dividers, button shapes. Frames are slides only, so these are ALWAYS shapes, never nested frames. Colour it with a decoration.fill unit (weave.item.setDecoration).",
        // SUB-KINDS — the full ShapeSubKind union (builtin-kinds.ts). The params
        // in subAttrs differ per kind; only those listed belong to each.
        "SUB-KINDS and their subAttrs params:",
        "• rectangle — { cornerRadii:{ tl, tr, br, bl } } (per-corner px; or edit later with weave.shape.setCornerRadius).",
        "• ellipse — (none).",
        "• line — { thickness? }.",
        "• arrow — { heads:{ start, end } each 'none'|'triangle'|'open'|'diamond'|'circle', headSize }.",
        "• triangle — { variant: 'equilateral'|'isosceles-up'|'isosceles-down'|'right-angle' }.",
        "• star — { points (number of points), innerRatio (0..1 inner/outer radius) }.",
        "• polygon — a REGULAR N-gon: { sides } (e.g. 6 = hexagon).",
        "• poly — a FREEFORM polygon from explicit vertices: { points:[{x,y},…] each a 0..1 ratio of THIS shape's OWN bbox (NOT the parent frame / design), closed:boolean (true = filled polygon, false = open polyline) }. Edit the vertices later with weave.shape.setVertices.",
        "CONVERT shape → line: weave.shape.breakToLine { itemId, vertexIndex? } opens a closed shape at one outline vertex into a stroke-only `line` (works for rectangle/triangle/polygon/star/ellipse/closed poly; the fill becomes the stroke).",
        "• path — opaque raw SVG path: { d:'<svg path data>' }.",
        "• speech-bubble — { tail:{ anchorX, anchorY (0..1 of THIS shape's OWN bbox), direction:'down'|'up'|'left'|'right'|'free' }, cornerRadius (px) }.",
        "• heart — { variant: 'classic'|'rounded' }.",
        // FILL — gradients are first-class, not solid-only.
        "FILL: set with weave.shape.setFill { itemId, fill } where fill is a PaintSpec discriminated on `type`: { type:'solid', color } | { type:'linear-gradient', angle (deg, 0=up 90=right — not a ratio), stops:[{offset:0..1 along the gradient axis, color},…] (≥2) } | { type:'radial-gradient', cx, cy (0..1 of the shape's OWN bbox — the gradient center), stops:[…] (≥2) } | { type:'image'|'video', src, fit?, opacity? } | { type:'none' } (transparent). color is any CSS color (#rrggbb/#rrggbbaa/rgb()/var(--token)).",
        // DECORATIONS — shadow / stroke / filter / opacity are units, not attrs.
        "DECORATIONS: stroke, shadow, blur/color filters and layer opacity are decoration UNITS set with weave.item.setDecoration (see the decoration unitKinds) — they are NOT attrs fields. Corner radius for rectangles is weave.shape.setCornerRadius (absolute px). Size/position/rotation via attrs.frame; this shape can also be a layout child or carry its own attrs.layout.",
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
        "COLOUR / WIDTH: the stroke is a `decoration.stroke` UNIT (weave.item.setDecoration { itemId, kind:'decoration.stroke', attrs:{ paint, width, lineCap?, lineJoin?, dashArray? } }). A line has NO fill.",
        "Use `line` for arrows, connectors, underlines, dividers, freeform strokes, and curves. Use a `shape` for filled / area elements (rectangle, ellipse, polygon, …).",
        "CONVERT line → shape: weave.line.closeToShape { itemId } fuses the two endpoints of a free line/curve into ONE vertex and closes it into a filled `poly` shape (needs ≥3 points; the stroke becomes the fill).",
      ].join(" "),
      editableAttrs: ["frame", "points", "smooth", "heads", "layoutChild"],
      units: ["decoration.stroke", "decoration.shadow", "decoration.opacity"],
    },
    {
      kind: "image",
      description:
        "An image. attrs.src is the URL/data-URL, attrs.alt the description, attrs.fit one of cover|contain|fill, attrs.borderRadius a 0..1 ratio of the image's OWN min(width, height) (not the parent). Size/position via attrs.frame.",
      editableAttrs: ["frame", "src", "alt", "fit", "opacity", "borderRadius"],
    },
    {
      kind: "video",
      description:
        "A video. attrs.src is the URL, attrs.poster the thumbnail; autoplay/loop/muted/controls are booleans. Size/position via attrs.frame.",
      editableAttrs: ["frame", "src", "poster", "autoplay", "loop", "muted", "controls", "fit"],
    },
  ],
  unitKinds: [
    // ── DECORATION units (DR-028) — visual styling attached to ANY visual item
    //    (shape / image / video / text / frame). Set/replace/clear with
    //    weave.item.setDecoration { itemId, kind, attrs } (attrs null = clear).
    //    DISTINCT from the behavior units below (those use weave.item.addBehavior).
    {
      kind: "decoration.fill",
      description:
        "Fill paint of the item (e.g. a shape's interior, a frame's background). attrs is a PaintSpec: { type:'solid', color } | { type:'linear-gradient', angle, stops:[{offset,color},…] } | { type:'radial-gradient', cx, cy, stops } | { type:'image'|'video', src, fit?, opacity? } | { type:'none' }. Shapes also have the weave.shape.setFill shortcut.",
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

/** Compact per-task primer for the cross-cutting rules the capabilities block
 *  can't express per-kind. Prepended to each task (small, but guarantees the
 *  coordinate model + id-discipline are seen even before the agent reads tools). */
export const WEAVE_TASK_PRIMER = [
  "[weave conventions]",
  "- Match the MOOD: infer the document's tone and subject from the request, and put real effort into reflecting that atmosphere in the design — color palette, typography, spacing, imagery, shapes and contrast should all evoke the content's mood (e.g. a finance/market deck → dark, restrained, data-forward; a children's invite → bright, playful, rounded). Never apply a generic default look; the design should read as 'about this topic' at a glance.",
  "- Markdown input → ONE slide: when the request's content arrives as Markdown, ALWAYS represent that whole Markdown document on a SINGLE slide (one md document = one slide), not a multi-slide deck.",
  "- Infer the best STRUCTURE: reason about which document/layout form most suits the given content and use it deliberately (e.g. title + bullet list, two-column comparison, hero statement, stat/number grid, timeline, step flow, big quote, image + caption) instead of stacking text top-to-bottom. Choose the structure that best communicates this specific content.",
  "- Coordinates: every attrs.frame is { x, y, width, height, rotation } with x/y/width/height as 0..1 RATIOS of the parent (root parent = the whole design). No pixels. rotation is radians about the center.",
  "- Units split: frame is a ratio (above), but text/typography sizes (fontSize, letterSpacing, paragraph spacing/indent, lineHeightSpec px) are absolute DESIGN-px. The canvas px size is in the [디자인] line below — size text relative to it (e.g. a heading ≈ 5–9% of canvas height).",
  "- Font sizing: size text by RATIO — attrs.fontSizeSpec { kind:'ratio', value:0..1 } (a fraction of the parent frame height; root = design height) so it scales with the slide (heading ~0.06–0.09, body ~0.03). Do NOT use a fixed px size; never put a fraction in the plain fontSize number (renders as sub-pixel text).",
  "- Text boxes are FIXED — no auto-height/auto-width. Give each text an explicit frame (width AND height), then pin it: weave.item.setLayoutChild { itemId, policy:{ kind:'absolute-constraints', anchor:{ horizontal:'left', vertical:'top' } } }.",
  "- Slides: each slide is its OWN top-level frame (direct child of the design root). Place them at DISTINCT positions — NEVER give every slide { x:0, y:0, width:1, height:1 }; that stacks all slides on the exact same spot. Lay them out LEFT-TO-RIGHT like a filmstrip: slide index i (0-based) at frame { x: i * 1.1, y: 0, width: 1, height: 1, rotation: 0 } — full canvas size, with a 0.1 gap. x is a 0..1 ratio of the design but is NOT capped at 1 (the board extends right), so x = i*1.1 places each slide to the right of the previous one. Create with weave.item.add { kind:'frame', frame:{ x: i*1.1, y:0, width:1, height:1 } } and NO containerId (→ the design root); the call returns the new frame's id — build that slide by adding items with containerId = that id. weave.design.setPresentationOrder reorders the deck.",
  "- Frames are SLIDES ONLY — never nest a frame inside a frame. For any rectangle inside a slide (panel, card, background block, divider, button), add a SHAPE (kind:'shape', rectangle) and colour it with a decoration.fill unit — NOT a sub-frame.",
  "- Multi-selection = TWO commands only, each ONE undo step (prefer over looping a singular command): weave.items.update { itemIds, attrs?, units?, updates?, op? } EDITS many items at once — shared attrs, shared decoration units, per-item frames (updates), and align/distribute (op = align-left|align-horizontal-center|align-right|align-top|align-vertical-center|align-bottom|distribute-horizontal|distribute-vertical, same parent); and weave.items.lifecycle { itemIds, op:'remove'|'duplicate' } for bulk delete/clone. Do NOT use weave.items.align / weave.items.resizeMulti / weave.items.remove / weave.items.duplicate — they are folded into these two.",
  "- Always target existing items by the id shown in the current document (already provided in the prompt — there is no separate fetch step).",
  "- TWO commands only for items: ADD an item with weave.item.add, and CHANGE any attribute/style with weave.item.update — these take attrs AND units (fill/shadow/stroke/cornerRadii/poly-points) in ONE call. Do NOT look for or use weave.shape.setFill, weave.shape.setCornerRadius, weave.shape.setVertices, or weave.item.setDecoration — they are not available; everything they did is done via weave.item.add / weave.item.update.",
  "- Create FULLY STYLED in ONE call: weave.item.add takes `units` (decoration.fill / .stroke / .shadow / .filter / .opacity) alongside attrsOverride — set fill/gradient/shadow/stroke AT creation in the SAME add call (e.g. units:[{ kind:'decoration.fill', attrs:{ type:'linear-gradient', angle:90, stops:[…] } }, { kind:'decoration.shadow', attrs:{ x:0,y:8,blur:24,spread:0,color:'#0008' } }]). Reach for weave.shape.setFill / weave.item.setDecoration only to EDIT an existing item, not right after adding one.",
  "- To create inside a frame, pass containerId = that frame's id to weave.item.add. New items default to a full-parent frame; adjust with weave.item.update afterwards.",
  '- Attached-image assets: when the request includes an [첨부 이미지 에셋] URL, USE that URL as a real asset — e.g. weave.item.add { kind: "image", attrs: { src: <url>, fit: "cover" } }. (The raw image is also shown to you for reference.)',
  '- To use an image as a frame/slide background: add a kind "image" item into that frame with attrs.fit "cover" and frame { x: 0, y: 0, width: 1, height: 1 }, then weave.item.sendToBack so it sits behind the other items.',
  "- Issue every edit the request needs (a full deck is many calls) — avoid only redundant ones; if a tool returns an error, read it and adjust.",
].join("\n");

/** Stable weave DESIGN-DOMAIN expertise, transferred ONCE at session init (the ctl
 *  hello → server's cached "# weave domain knowledge" prompt block). Unlike
 *  WEAVE_TASK_PRIMER (per-task, view-state-sensitive), this is the enduring "how
 *  weave's model works and how to design well in it" — cheap because it is cached. */
export const WEAVE_DOMAIN_KNOWLEDGE = [
  "weave STRUCTURE & SIZING RULES — get these exactly right. Follow them on every item:",
  "",
  "0) FRAMES ARE SLIDES ONLY. kind:'frame' is used ONLY for top-level slides (direct children of the design",
  "   root). NEVER nest a frame inside a frame. For ANY rectangle inside a slide — a panel, card, background",
  "   block, divider, button shape — add a SHAPE (kind:'shape', rectangle), NOT a frame. Slide content is",
  "   text / shape / image / video items, never sub-frames.",
  "",
  "1) FRAME COORDINATES ARE RATIOS, NEVER PIXELS. attrs.frame = { x, y, width, height, rotation } where",
  "   x / y / width / height are 0..1 RATIOS of the PARENT (a top-level frame's parent is the whole design;",
  "   a child item's parent is its containing frame). rotation is radians about the center. e.g. { x:0.1, y:0.1,",
  "   width:0.8, height:0.3 } = 'start 10% in, 80% wide, 30% tall' of the parent. NEVER pass pixels into frame;",
  "   always size children against THEIR parent.",
  "",
  "2) FONT SIZE IS A RATIO. Set the size with attrs.fontSizeSpec = { kind:'ratio', value: 0..1 } — value is a",
  "   FRACTION OF THE PARENT FRAME'S HEIGHT (e.g. 0.08 ≈ a heading at 8% of the frame height), so the text",
  "   SCALES with its frame. Do NOT use a fixed px size: avoid a bare fontSize number and avoid",
  "   fontSizeSpec { kind:'px' }. (Never put a fraction into the plain fontSize number — that renders as",
  "   sub-pixel, invisible text; ratios go ONLY in fontSizeSpec { kind:'ratio' }.)",
  "",
  "3) TEXT BOXES ARE FIXED — NO AUTO-RESIZE. A text box auto-grows its height by default; turn that OFF. Give",
  "   every text item an explicit frame with BOTH width and height, then PIN it fixed:",
  "   weave.item.setLayoutChild { itemId, policy:{ kind:'absolute-constraints', anchor:{ horizontal:'left',",
  "   vertical:'top' } } }. A non-scale anchor disables auto-height/auto-width. Never rely on auto-sizing.",
].join("\n");
