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
        // CSS Flexbox / Figma Auto-Layout, with multi-line wrap.
        "Auto row or column (faithful CSS flexbox / Figma Auto-Layout). The frame sizes & positions its children along one axis; each child's own attrs.frame is overridden by the layout.",
        "Set with weave.frame.setLayout { itemId, layout }, where layout = { kind:'auto-flex', direction:'row'|'column', gap, justify, align, padding, wrap?, alignContent? }:",
        "• direction — 'row' (horizontal) | 'column' (vertical).",
        "• gap — spacing between children, a 0..1 ratio of the frame's MAIN axis.",
        "• justify — main-axis distribution: 'start'|'center'|'end'|'space-between'|'space-around'|'space-evenly'.",
        "• align — cross-axis alignment: 'start'|'center'|'end'|'stretch'|'baseline' ('stretch' = child fills the cross axis; 'baseline' acts as 'start' — frames have no text baseline).",
        "• wrap — 'nowrap' (default) | 'wrap'. 'wrap' flows children that overflow the main axis onto NEW LINES — use for a chip/tag row, a reflowing card row, or any set that should wrap instead of shrink.",
        "• alignContent — distribution of the wrapped LINES on the cross axis: 'start'|'center'|'end'|'stretch'|'space-between'|'space-around'|'space-evenly' (only applies when wrap='wrap' and there are ≥2 lines; default 'start').",
        "• padding — { top, right, bottom, left }, each a 0..1 ratio of the frame.",
        "Per-child tuning via weave.item.setLayoutChild { itemId, policy:{ kind:'auto-flex', grow, shrink, basis, alignSelf? } }: grow/shrink are flex weights (≥0), basis is the main-axis base size (0..1 ratio of the parent frame's main axis, or 'auto' = use the child's own size), alignSelf overrides the parent align for that one child ('start'|'center'|'end'|'stretch'|'baseline').",
        // CONTAINER SIZING (Figma Hug / Fill / Fixed) — WI-042 / DR-055. Sizes the FRAME ITSELF, not its children.
        "CONTAINER SIZING (Figma-style — the FRAME's OWN box): give this layout frame a per-axis size mode with weave.frame.setSizing { itemId, sizing:{ width, height } }, each 'fixed' | 'hug' | 'fill'. 'fixed' (DEFAULT) = the frame keeps its own attrs.frame width/height ratio. 'hug' = the frame GROWS to exactly fit its children — reach for it when a container should be CONTENT-SIZED rather than a fixed ratio (a button/chip/badge/tag that wraps its label, a pill, an auto-height card that's exactly as tall as its stack); a Hug axis needs ≥1 child and re-grows whenever a child grows. 'fill' = the frame fills its parent's FREE space along that axis — a panel/region that should absorb the leftover width or height in its parent layout. gap, padding and track sizes stay 0..1 ratios regardless of sizing — sizing only decides whether the frame's box is fixed, derived-from-children (hug), or stretched-to-parent (fill). To give a CHILD an exact pixel size inside a Hug frame (so the hug resolves to a known px) use weave.item.resizeHug { itemId, sizePx:{ w, h } } — the Hug ancestor regrows and the subtree re-arranges in ONE undo step.",
        // ONE child per flex slot — group with a nested frame to put several together.
        "ONE ITEM PER SLOT: each direct child is its own slot along the axis. To put MULTIPLE items in a SINGLE slot (e.g. an icon + a label that should travel together as one flex item), add a NESTED frame as that slot's child (containerId = this frame, presentable:false), give the nested frame its OWN layout (auto-flex/auto-grid), and put the several items INSIDE it. Do NOT drop the multiple items directly into this frame — they would each become separate slots.",
      ].join(" "),
      childConstraints:
        "child attrs.frame is overridden by the flex layout; size/order it via weave.item.setLayoutChild (auto-flex policy) and weave.item.swapFlexOrder. ONE item per slot — to group several into one slot, nest a frame (its own layout) and put them inside it.",
    },
    {
      kind: "auto-grid",
      description: [
        // Faithful CSS Grid — explicit tracks + minmax + auto-fill/fit + areas + dense.
        "Auto grid (faithful CSS Grid). The frame lays children into column/row tracks; each child's own attrs.frame is overridden by the grid. USE auto-grid for ANY TABLE / matrix / comparison grid / card grid / calendar / spec sheet — do NOT fake a table by nesting auto-flex rows (columns won't align and it is painful to edit). Set justify+align:'stretch' (or per-child alignSelf/justifySelf:'stretch') so each child FILLS its cell instead of hugging its content.",
        "Set with weave.frame.setLayout { itemId, layout }, where layout = { kind:'auto-grid', columns, rows, columnGap, rowGap, justify, align, padding, columnsRepeat?, rowsRepeat?, autoFlow?, dense?, areas? }:",
        "• columns / rows — arrays of TrackSize. Each track is { kind:'fr', value } (fractional share, like CSS fr), { kind:'ratio', value } (fixed 0..1 ratio of the frame), { kind:'auto' } (fit the track's children), or { kind:'minmax', min, max } (size between two bounds; each bound is {kind:'ratio',value} | {kind:'fr',value} | {kind:'auto'} — the responsive idiom is minmax({kind:'ratio',value:0.2},{kind:'fr',value:1})). An empty array = a single full-size track.",
        "• columnsRepeat / rowsRepeat — { mode:'auto-fill'|'auto-fit', track } auto-generate as many copies of `track` as fit the axis (track needs a definite ratio base, e.g. {kind:'ratio',value:0.25}); when set it REPLACES that axis's columns/rows list. Use for a RESPONSIVE card grid that fills the frame.",
        "• autoFlow — 'row' (default) | 'column', and dense — true|false: placement order and hole-backfill for children that have no explicit cell.",
        "• areas — array of strings, one per row, space-separated area names ('.' = empty), e.g. ['header header','nav main']. Then place a child with policy.area:'header' to drop it into that named region (a classic app-shell / dashboard layout).",
        "• columnGap / rowGap — track spacing, 0..1 ratios of the frame.",
        "• justify (column-axis) / align (row-axis) — 'start'|'center'|'end'|'stretch' for children inside their cell.",
        "• padding — { top, right, bottom, left }, 0..1 ratios of the frame (top/bottom of its height, left/right of its width).",
        "Per-child placement via weave.item.setLayoutChild { itemId, policy:{ kind:'auto-grid', column, row, columnSpan, rowSpan, alignSelf?, justifySelf?, area? } }: column/row are 1-based cell indices, columnSpan/rowSpan (≥1) merge cells, area places the child into a named template region (overrides column/row/span). Also weave.item.swapGridCells / weave.item.dropGridCell move children between cells.",
        // CONTAINER SIZING applies to grids too (WI-042 P4).
        "CONTAINER SIZING (Figma Hug / Fill / Fixed) applies to a grid frame as well — weave.frame.setSizing { itemId, sizing:{ width, height } } with 'fixed' (DEFAULT — keep attrs.frame size) | 'hug' (the frame shrinks to fit content: every track sizes to its cell contents) | 'fill' (the frame fills its parent's free space along that axis). columnGap/rowGap/track sizes stay 0..1 ratios. See the auto-flex layout for the full sizing model.",
        // ONE child per cell — group with a nested frame to put several in one cell.
        "ONE ITEM PER CELL: each cell holds exactly ONE direct child (a joining child auto-takes the next free cell; two children can't share a cell — they'd land in different cells). To place MULTIPLE items in a SINGLE cell (e.g. a heading + body stacked inside one card cell), add a NESTED frame as that cell's child (containerId = this frame, presentable:false), give the nested frame its OWN layout (e.g. auto-flex column), and put the several items INSIDE it. columnSpan/rowSpan only MERGE cells for one child — they do NOT let two children share a cell.",
      ].join(" "),
      childConstraints:
        "child attrs.frame is overridden by the grid layout; place/size it via weave.item.setLayoutChild (auto-grid policy), weave.item.swapGridCells, weave.item.dropGridCell. ONE item per cell — to put several in one cell, nest a frame (its own layout) as that cell's single child and place them inside it.",
    },
  ],
  itemKinds: [
    {
      kind: "frame",
      description: [
        "A frame. A TOP-LEVEL frame (direct child of the design root) is a presentation SLIDE. A frame holds child items via weave.item.add with containerId = this frame's id; it has no text/image content of its own. NESTED FRAMES ARE YOUR LAYOUT TOOL FOR GROUPING: nest a frame (containerId = another frame's id), give it a layout via weave.frame.setLayout (auto-flex row/column or auto-grid), and it becomes a self-arranging container — a header band, a two-column split, a card, a card grid, a sidebar, a stat row. Reach for one to align/auto-arrange MULTIPLE related items, or to make a region reflow as a unit; it earns its place by doing real layout work. Do NOT wrap a SINGLE item (or a one-element region) in its own layout frame — a single-child frame is needless nesting; place that item directly on its parent instead. The defect to avoid is hand-placing a CLUSTER of related items by coordinate so they drift out of alignment — group THOSE; a lone well-placed item does not need a wrapper. CRITICAL RULE: a nested frame is a SLIDE by default, so on EVERY nested (non-top-level) frame set attrs.presentable:false — that makes it a LAYOUT GROUP, not an extra slide, so ONLY the top-level frame you intend as the slide lands in the deck. And use a plain SHAPE (rectangle) for a single coloured panel / divider / button background, never a frame.",
        // SLIDE SEMANTICS — load-bearing for this presentation tool.
        "SLIDE: a top-level frame (a direct child of the design root) IS one presentation slide. The deck = the ordered list of these root frames; Present mode shows them in order. Add each slide-frame with weave.item.add { kind:'frame', frame:{ x: i*1.1, y:0, width:1, height:1 } } (slide index i, 0-based) and NO containerId (→ the design root). Give each slide a DISTINCT x (a left-to-right filmstrip) — do NOT put them all at { x:0, y:0, width:1, height:1 }, which overlaps every slide on one spot. weave.design.setPresentationOrder reorders the deck, and weave.design.reorderChildren reorders siblings. NESTED frames (containerId = another frame's id) organise a slide's content into rows/columns/grids/cards via a layout — set attrs.presentable:false on EACH so it stays a layout group, never an extra slide. For a single coloured panel / box / divider / button, prefer a SHAPE (kind:'shape', rectangle); use a nested frame to group + auto-arrange multiple items.",
        "BACKGROUND/FILL: ACTIVELY use frame fills — a slide should NOT sit on bare default white, and grouping frames should NOT be left transparent when a surface would add structure or depth. Give the slide a deliberate base fill and give section / group / card frames their own colour panel, tonal band, or card surface (often with cornerRadius + a soft decoration.shadow). Set the background with a decoration.fill unit — weave.item.add { …, units:[{ kind:'decoration.fill', attrs:<PaintSpec> }] } at creation, or weave.item.update { itemId, units:[{ kind:'decoration.fill', attrs:<PaintSpec> }] } later — solid, gradient, or image/video paint (see the shape itemKind for the PaintSpec shape). For a photo background, prefer adding a kind:'image' child at frame {0,0,1,1} then weave.item.sendToBack. attrs.cornerRadius (ABSOLUTE design-px, drawn circular, auto-capped at min(width,height)/2 — ~12–24 for a soft round, large = pill) rounds the frame, and attrs.cornerRadii { tl, tr, br, bl } (px) rounds each corner independently; decoration.shadow/.stroke also apply (see decoration units).",
        "LAYOUT: a frame can auto-arrange its children — set attrs.layout (a LayoutSpec) via weave.frame.setLayout to get a CSS-flex row/column or CSS-grid. See layoutKinds for the full auto-flex / auto-grid spec.",
        // SIZING — Figma Hug / Fill / Fixed (WI-042 / DR-055).
        "SIZING (Figma Hug / Fill / Fixed): a frame that HAS an auto-flex or auto-grid layout can size ITSELF per axis with weave.frame.setSizing { itemId, sizing:{ width:'fixed'|'hug'|'fill', height:'fixed'|'hug'|'fill' } }. 'fixed' (default) keeps the frame's own attrs.frame size; 'hug' grows the frame to fit its children (content-sized chrome — buttons, chips, badges, auto-height cards; needs ≥1 child); 'fill' makes the frame fill its parent's free space along that axis (a region that absorbs leftover width/height). gap/padding/tracks remain 0..1 ratios. For an exact-px child inside a Hug frame use weave.item.resizeHug { itemId, sizePx:{ w, h } } (the Hug ancestor regrows, one undo).",
      ].join(" "),
      editableAttrs: ["frame", "layout", "sizing", "cornerRadius", "cornerRadii", "presentable"],
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
        "SIZING: give attrs.fontSizeSpec { kind:'px', value } — the ABSOLUTE design-px size (off the canvas px in the [디자인] line). It is FIXED (DR-101): the text renders at exactly that design-px and does NOT rescale when a frame / parent is resized — it scales only with the whole-canvas zoom. So pick the real px you want; it means the same everywhere (a 64px heading is 64px whether on a full slide or deep in a small card). SHARED-FRAME BUDGET — the #1 cause of overflow: when a frame holds MORE THAN ONE item the items SHARE its height, so a text does NOT get the whole frame. Before sizing, budget it: usable height = parent frame px height − padding(top+bottom) − the gaps between children; the SUM of the children's rendered heights (each ≈ fontSize × lineHeight × wrapped-line-count) + gaps must fit the usable height WITH MARGIN (≤ ~85%). Px role targets off the CANVAS height: heading ~6–9% (≈65–97px on a 1080px canvas), subheading ~4%, body ~3% (≈32px on 1080) — body is the readable BASELINE; real content (findings, agenda, bullets, descriptions) must NEVER be smaller than that. If a stack would crowd or overflow, CUT WORDS or enlarge the region (frame/track), do NOT shrink body below its minimum; never oversize. (A { kind:'ratio', value:0..1 } is still RENDERED (value × parent height) but NOT recommended — it rescales whenever the parent resizes; prefer px for stable, predictable size. NEVER put a fraction in the plain fontSize number — a 0..1 there renders as sub-pixel text.)",
        "SIZING ROLES (canvas px is in each task's [디자인] line): heading 48–96px (~5–9% of canvas height → ratio ~0.05–0.09), subheading 32–48px, body 28–40px, caption 18–22px. On 1920×1080 a heading ≈64px and body ≈34px; on 800×600 a heading ≈40px and body ≈22px. BODY MINIMUM (hard rule — agent slides keep coming out too small): real CONTENT text — KEY FINDINGS, agenda items, bullet phrases, descriptions, labels next to numbers — is BODY, and body must be ≥ ~3% of the canvas height (≈32px on 1080, ≈40px on 4K); NEVER size content below that. Caption sizes (18–22px) are ONLY for true footnotes / source notes / tiny meta lines, NOT for findings or any readable content. If text doesn't fit at the body minimum, CUT WORDS or enlarge its region (frame/track) — do NOT shrink body below the minimum to make it fit. These px→ratio numbers hold ONLY when the text's parent frame fills the slide — inside a nested frame that is only part of the slide, divide the target px by THAT frame's px height instead (e.g. a body line in a half-height card uses about double the body ratio).",
        // PLACEMENT — a text item is a CHILD of an auto-layout frame; the frame sets its
        // WIDTH and the box AUTO-FITS its height to the wrapped content (AUTO-HEIGHT).
        "PLACEMENT & SIZING: add text as a CHILD of an auto-layout frame (containerId = a layout frame); the frame sets the text's WIDTH and the box AUTO-FITS ITS HEIGHT to the wrapped content (auto-height). BIND THE TEXT'S WIDTH TO ITS CELL so it WRAPS and never overflows horizontally: in a flex COLUMN set the frame's align (or the child's alignSelf) to 'stretch' — in a column the cross axis IS the width, so the text fills the column width and wraps; in an auto-grid the column track already bounds the width. Do NOT leave a text in auto-width (hugging its content) inside a layout — a long line then spills past its cell. NEVER place WRAPPING body text as a DIRECT child of a flex ROW: in a row the MAIN axis is the width, so flex can SHRINK that text to a sliver (≈1ch) and it wraps into a one-glyph-per-line VERTICAL strip. For a row of text (e.g. label | value, or side-by-side paragraphs) wrap EACH side in its OWN flex-COLUMN sub-frame (the column then binds the text's width via stretch) or use an auto-grid whose tracks bound each cell — the text never competes for main-axis width. Only the WIDTH is layout-bound: do NOT give text main-axis grow or a vertical stretch (that inflates its HEIGHT) and do NOT pin a fixed height — a short title keeps its natural height, and spare room is taken up by the frame's justify / align / gap / padding. For equal-size OR deliberately ROOMY/FIXED regions inside a layout (e.g. comparison columns, a card with breathing room) size the CELL — grid ratio/fr tracks, flex grow/basis, or a wrapper FRAME — never a big leaf-text height; the text stays auto-height and aligns inside the roomy cell (textAlignVertical + the cell's align). CHOOSE A FONT SIZE THAT FITS: pick the fontSizeSpec ratio so the text sits inside its region with margin to spare — if it would crowd or overflow, bring the size DOWN and shorten the copy; never oversize. Position glyphs with textAlignHorizontal / textAlignVertical. ONLY when a text sits directly in an absolute-constraints frame (intentional free-form placement) give it an explicit frame and pin it: weave.item.setLayoutChild { itemId, policy:{ kind:'absolute-constraints', anchor:{ horizontal:'left', vertical:'top' } } }. DR-098: weave now applies this Fixed-box policy AUTOMATICALLY to text you ADD into a free-placement (root / absolute-constraints) parent — the box is FIXED size and does NOT auto-grow, so give frame.width AND frame.height enough room for the content and set attrs.textOverflow 'VISIBLE' if it might spill. When you pass an explicit frame, frame.width MUST be a real share of the parent — a 0-or-near-0 width text is invisible and the add is REJECTED (WI-212). (Text added into a flex/grid frame is unaffected — the layout still sizes it, auto-height.)",
        "STYLE: fontFamily (CSS stack), fontWeight ('normal' | 'bold'), fontStyle ('normal' | 'italic'), color, textDecoration ('NONE' | 'UNDERLINE' | 'STRIKETHROUGH'), textCase ('ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE'). These attrs style the WHOLE box.",
        // OUTLINE (외곽선) — DR-059 whole-item + DR-060 per-range.
        "OUTLINE (외곽선): attrs.textOutline = { color, width } draws a halo/stroke around the WHOLE text (color = hex or var(--token); width = VISIBLE halo thickness in design-px; omit or width<=0 = no outline) — use for a heading/number that must read over a busy image or a same-tone fill. For a PER-RANGE outline (just one word), put outlineColor / outlineWidth in that run's textRuns attributes instead (see PER-RANGE STYLE).",
        "OVERFLOW & LINK: attrs.textOverflow ('VISIBLE' | 'HIDDEN') — whether content past the box is clipped (HIDDEN) or spills (VISIBLE; default derives from the resize mode). attrs.hyperlink — a URL string makes the whole text a link in Present mode (or null = none); for a link on PART of the text use a per-range run, and for a link on a NON-text item use a button-trigger behavior.",
        // PER-RANGE typography (부분편집) — DR-062/DR-057. textRuns is the canonical
        // inline content; the plain `text` is a mirror derived from it.
        "PER-RANGE STYLE (부분편집 — style ONLY part of the text, e.g. one word/number a different color or bold): set attrs.textRuns = an ORDERED array of runs that, concatenated, form the full string. Each run is { insert:'<segment>', attributes?:{ color?, fontSize?(px), fontFamily?, fontWeight?:'bold', fontStyle?:'italic', textDecoration?:'UNDERLINE'|'STRIKETHROUGH', textCase?, letterSpacing?(px), outlineColor?, outlineWidth?(px) } }. A run with NO attributes inherits the box defaults. Use '\\n' as its own insert for a hard line break. Example — make 'sales' red+bold in 'Q3 sales up': textRuns:[{insert:'Q3 '},{insert:'sales',attributes:{color:'#e11',fontWeight:'bold'}},{insert:' up'}]. textRuns is the SINGLE SOURCE OF TRUTH: setting attrs.textRuns updates the visible text AND its styling; setting attrs.text alone REPLACES the whole string and RESETS every per-range style (use that for a plain whole-text rewrite). To recolor just one span on existing text, READ the current textRuns from the snapshot, change only the run(s) you want, and send the full textRuns back (the box keeps the others).",
        "COLOR — DEFAULT to a theme token by ROLE so text re-skins with the theme: title/heading → var(--text-strong); body/paragraph → var(--text-default); secondary/supporting → var(--text-soft); caption/footnote/label → var(--text-muted); EMPHASIZED word/number/KPI/highlight → var(--accent) (or var(--accent-strong)). If you set NO color it already defaults to var(--text-default) (never lazily hard-code a neutral dark/light hex). Override with a LITERAL color only when the content's MOOD wants a specific text color (mood > theme), or for brand/data-bound text.",
        "LAYOUT: textAlignHorizontal ('LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED'), textAlignVertical ('TOP' | 'CENTER' | 'BOTTOM'), lineHeightSpec ({ value, unit: 'multiplier' | 'px' }, default 1.4×), letterSpacing / paragraphSpacing / paragraphIndent (all design-px).",
        "Edit any of these with weave.item.update { itemId, attrs }.",
      ].join(" "),
      editableAttrs: [
        "frame",
        "text",
        "textRuns",
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
        "textOutline",
        "textOverflow",
        "hyperlink",
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
        "BOUNDS ARE NOT THE LINE — read `points`, not `frame`, to know where a line goes. Unlike a box / text / image / filled shape (whose `frame` IS the visible rectangle), a line's `attrs.frame` is ONLY the bounding box that ENCLOSES its `points`; the drawn stroke is the polyline through `points` (each {x,y} a 0..1 ratio of THAT bbox). So two lines with the SAME frame can look completely different: points [{0,0},{1,1}] runs ↘ (top-left→bottom-right) while [{0,1},{1,0}] runs ↗ — same box, opposite diagonals. To read a line's real endpoints / direction / slope from the snapshot, combine frame + points (endpoint design-pos = frame.x/y + point × frame.width/height); NEVER infer it from the frame alone. To EDIT: changing only `frame` translates / scales the whole stroke rigidly (the points keep their 0..1 positions); to change which corners it connects, its direction, angle, or a single endpoint, edit `points` — e.g. flip the diagonal with points:[{x:0,y:1},{x:1,y:0}], not by swapping the frame.",
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
        "An image. attrs.src is the URL/data-URL, attrs.alt the description, attrs.fit one of cover|contain|fill, attrs.borderRadius the corner radius in ABSOLUTE design-px (circular, auto-capped at min(width,height)/2), and attrs.borderRadii { tl, tr, br, bl } (px) rounds each corner independently. Size/position via attrs.frame. attrs.cropRatio = { x, y, w, h, rotation? } (all 0..1 except rotation radians) crops to a sub-window of the source (no-crop = { x:0,y:0,w:1,h:1 }); set it via weave.item.update or the dedicated weave.image.setCrop. " +
        'attrs.src is OPTIONAL: OMIT it (or pass "") to create a SOURCE-LESS PLACEHOLDER — a neutral framed box with an image glyph, NOT a broken image. Use this for wireframe/layout drafts where the real picture is added later. When src is empty, attrs.alt is rendered as CENTERED CAPTION TEXT inside the placeholder (so set a short alt like "제품 사진 자리" to label the slot); once a real src is set, alt reverts to its accessibility role and is no longer drawn.',
      editableAttrs: [
        "frame",
        "src",
        "alt",
        "fit",
        "opacity",
        "borderRadius",
        "borderRadii",
        "cropRatio",
      ],
    },
    {
      kind: "video",
      description:
        "A video. attrs.src is the URL; autoplay/loop/muted/controls are booleans; attrs.fit one of cover|contain|fill. Size/position via attrs.frame. " +
        'attrs.src is OPTIONAL, just like image: OMIT it (or pass "") to create a SOURCE-LESS PLACEHOLDER for wireframe/layout drafts — NOT an empty black player. When src is empty, the placeholder is either (a) attrs.poster rendered as a static COVER IMAGE with a play badge (set attrs.poster to a thumbnail/still URL), or (b) if no poster, a neutral framed box with a play/film glyph. ' +
        'attrs.alt is a short DESCRIPTION of the clip (e.g. "제품 데모 영상", "드론 항공 b-roll") — like image alt: when src is empty it is drawn as CENTERED CAPTION TEXT inside the placeholder so the slot says what KIND of video belongs there; once a real src is set, alt becomes the accessibility description. ALWAYS set attrs.alt on a video so the intent is clear even before a real clip is dropped in. ' +
        "attrs.volume (0..1) and attrs.playbackRate (1 = normal speed) tune playback; attrs.borderRadius (ABSOLUTE design-px, circular, auto-capped at min(w,h)/2) rounds the corners, and attrs.borderRadii { tl, tr, br, bl } (px) rounds each corner independently.",
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
        "volume",
        "playbackRate",
        "borderRadius",
        "borderRadii",
      ],
    },
    {
      // WI-058 — data-driven QR code (regenerates from `data` on every render).
      // WI-140 — optional built-in centre logo (attrs.logo).
      kind: "qr",
      description:
        "A QR code. attrs.data is the encoded URL/text (the matrix regenerates from it; empty → placeholder) — set it to the link you want scannable. attrs.ecLevel ('L'|'M'|'Q'|'H', default M) is the error-correction level. STYLE: attrs.foreground is the dark-module paint (a PaintSpec — { type:'solid', color } or a linear/radial gradient), attrs.background the light/background paint (PaintSpec or null = transparent), attrs.moduleStyle ('square'|'dot'|'rounded') the module glyph, attrs.margin the quiet-zone width in modules (default 4), attrs.opacity (0..1). LOGO: attrs.logo = { iconId, scale? } draws a built-in icon in the CENTRE — iconId is one of 'link'|'heart'|'star'|'play'|'camera'|'image'|'chart'|'sparkle'|'check'|'diamond' (built-in only, no image upload), scale is the logo width as a fraction of the code (clamped ≤0.25, default 0.2). A logo is auto-encoded at EC≥Q so it stays scannable — keep it small. Omit logo (or unset it) for no logo. Size/position via attrs.frame. Use for a scannable link/contact/Wi-Fi on a slide.",
      editableAttrs: [
        "frame",
        "data",
        "ecLevel",
        "foreground",
        "background",
        "margin",
        "moduleStyle",
        "logo",
        "opacity",
      ],
    },
    {
      // WI-098 — data-driven chart (DR-036/DR-035). Created via weave.chart.add, NOT
      // weave.item.add. Styled + re-typed via weave.item.update { attrs }.
      kind: "chart",
      description: [
        "A DATA-DRIVEN chart. It owns NO data inline — it references a dataset by attrs.datasetId; the visual is derived from the resolved rows. CREATE it with weave.chart.add (seeds a dataset AND the chart in one undoable step); do NOT use weave.item.add with kind:'chart' (empty placeholder). Edit the LOOK/type/encoding/style with weave.item.update { itemId, attrs }; edit the DATA with weave.dataset.update.",
        // ── DATA composition — get the dataset shape right for the type. ──
        "DATA (compose it well): a dataset is { columns:[{name,type}], rows:[{<col>:value}] }. Put the CATEGORY/label column FIRST and numeric SERIES columns after it. Pick the chartType that FITS the data, not just bar/line/pie: 14 types (bar·line·area·pie·funnel·gauge·scatter·bubble·radar·heatmap·candlestick·boxplot·treemap·sankey). attrs.encoding maps channels→columns, each { field:<column>, aggregate? }; `value` may be an ARRAY for multiple (wide-format) series. category+value[] → bar/line/area/pie/funnel/radar; x+y(+size) → scatter/bubble; x+y+value → heatmap; category+open/high/low/close → candlestick; category+lower/q1/median/q3/upper → boxplot; id+parent(+value) → treemap; source+target(+value) → sankey. Keep series legible (≈≤5); compare proportions with pie/treemap, trends with line/area, ranked magnitudes with bar.",
        // ── STYLING — make it beautiful, all via weave.item.update { attrs }. ──
        "STYLE (꾸미기 — all attrs via weave.item.update): attrs.palette = series colours (string[]) — use the theme-coordinated categorical tokens [var(--domain-slide-accent), var(--domain-canvas-accent), var(--domain-block-accent), var(--domain-media-accent)] so series stay distinct AND theme-reactive, or mood/brand literals when the content calls for it. attrs.variant = { stacked, normalized (100%), horizontal (bar), smooth (line/area), innerRadius (0..1 → pie becomes a DOUGHNUT) }. attrs.showLegend / attrs.showAxis (boolean), attrs.opacity (0..1), attrs.barWidth (0..1 of the band). EMPHASIS: attrs.overrides = { datum:{ '<category>':{ color?, borderWidth?, offset? } }, series:{ '<series>':{ color?, borderWidth? } } } — recolour or pull out the ONE hero bar/slice so the key number pops (partial-merge safe — send only the delta). GROUND the chart on a designed surface (a card frame behind it: decoration.fill + cornerRadius + soft shadow) instead of bare canvas; keep series/text contrast ≥ AA.",
        // ── TEXT IS RENDERED AS REAL TEXT ITEMS — the load-bearing thing to know. ──
        "TEXT / LABELS (IMPORTANT — charts show their text through REAL weave text Items, DR-035): for bar/line/area + pie, the CATEGORY/axis labels are AUTO-MANAGED `text` child Items of the chart, DERIVED from the dataset (each tagged chartLabelRef). So: (1) do NOT hand-add category/axis label text — the chart projects them automatically; adding your own duplicates them. (2) Editing a managed label's TEXT actually edits the DATASET (it's derived, not free text) — to change a label, edit the data via weave.dataset.update. (3) Their POSITION is auto-placed (re-derived) — don't reposition them. (4) You MAY RESTYLE them for beauty — set color / fontWeight / fontSize / fontFamily on those label text Items via weave.item.update and it PERSISTS across re-projection (only text+position re-derive). (5) For a chart TITLE, a takeaway headline, a callout/annotation, an axis caption, or a source note, ADD YOUR OWN separate `text` Items (these are NOT auto-managed) and place them around the chart — a chart almost always needs a human title + one-line takeaway that the data labels do not provide. (Other types — scatter/heatmap/radar/etc. — keep the chart engine's own labels, not text Items.)",
      ].join(" "),
      editableAttrs: [
        "frame",
        "datasetId",
        "chartType",
        "encoding",
        "variant",
        "palette",
        "showLegend",
        "showAxis",
        "opacity",
        "barWidth",
        "overrides",
      ],
    },
    {
      // WI-139 — oEmbed / iframe embed (YouTube first). Stores attrs.url; the
      // iframe src is derived per-render via the provider registry.
      kind: "embed",
      description:
        "An embedded video (YouTube, Vimeo, or Loom). attrs.url is the page URL the user wants embedded (YouTube watch / youtu.be / shorts / live, vimeo.com/<id>, loom.com/share/<id> all work — a YouTube `t`/`start` timestamp is carried through; the iframe src is derived from the url, and only recognized providers render, otherwise a placeholder). attrs.allowFullscreen (boolean, default true), attrs.autoplay (boolean — auto-plays MUTED in PRESENT mode only, default off), attrs.opacity (0..1). Size/position via attrs.frame (give it a 16:9-ish box). Use to drop a video onto a slide. Note: it plays in PRESENT mode and when selected in the editor; otherwise it shows the video thumbnail.",
      editableAttrs: ["frame", "url", "allowFullscreen", "autoplay", "opacity"],
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
    {
      // WI-074 / DR-029 D7 — kind-agnostic mirror. Set/clear via the `units` arg of
      // weave.item.update (or weave.item.flip). image / video / shape / line / frame.
      kind: "transform.flip",
      description:
        "Mirror the item's final composition. attrs = { flipH?:boolean (left/right), flipV?:boolean (up/down) }. Set via weave.item.update { units:[{ kind:'transform.flip', attrs:{ flipH:true } }] } (attrs:null clears it), or the shortcut weave.item.flip. image / video / shape / line / frame only (ignored on text / qr).",
      editableAttrs: ["flipH", "flipV"],
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
    {
      // WI-090 — item link. Any item becomes a clickable link in Present mode.
      kind: "button-trigger",
      description:
        "An ITEM LINK (WI-090) — makes the WHOLE item a clickable button in Present mode. Add via " +
        "weave.item.addBehavior { itemId, behavior:{ id, kind:'button-trigger', action } }; edit via " +
        "weave.behavior.update, remove via weave.item.removeBehavior. `action` is a HotspotAction: " +
        "{ type:'external', href:'https://…' } opens a URL in a new tab, or { type:'jump-camera', " +
        "targetId:'present-<frameId>' } jumps to that slide-frame in the deck (targetId = 'present-' + the " +
        "top-level frame's id). Use this for 'link this to …' / clickable buttons. For a link on PART of a " +
        "text run, use the text item's inline hyperlink instead (per-range), not this whole-item trigger.",
      editableAttrs: ["action", "label"],
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
  "- MOOD FIRST (top priority): infer the content's tone/subject and express it through layout, typography, spacing, imagery, shapes, density, contrast AND color — never a generic default layout; the design must read as 'about this topic' at a glance. Color follows the MOOD ahead of the active theme: structural/neutral roles → var(--token) (re-skins), mood/brand/data/status → a literal color. If the task carries a [디자인 톤] block, that IS the committed direction — apply its literal palette/typography/shape language to the expressive surfaces (background, hero, accent panels) and keep var(--token) only for structural body text; do NOT dilute it back toward the active theme's default look.",
  "- Frame COORDINATES are 0..1 of the immediate parent frame (NEVER pixels). FONT SIZE is the exception: give an ABSOLUTE px via fontSizeSpec { kind:'px', value } (off the canvas px in the [디자인] line). It is FIXED design-px (DR-101) — it does NOT rescale when a frame is resized and is the SAME px at any nesting depth, so do NOT shrink the px just because the parent frame is nested/short. Do NOT use a 0..1 ratio for fontSize.",
  "- One slide = its OWN top-level frame; place slides at DISTINCT x (filmstrip: slide i at { x: i*1.1, y:0, width:1, height:1 }), NEVER all at {0,0,1,1}. A Markdown document → ONE slide.",
  "- STRUCTURE EVERY SLIDE FROM NESTED LAYOUT FRAMES — REQUIRED, and the #1 rule to get wrong: do NOT hand-place content items on the slide root with absolute x/y. For EACH region (header, body, columns, card grid, stat row) FIRST add a nested frame (containerId = the slide, presentable:false) and give it weave.frame.setLayout (auto-flex row/column or auto-grid: direction, gap, padding, justify, align), THEN add the items as that frame's CHILDREN so the layout positions them. Nest frames inside frames for sub-structure. Absolute x/y on the slide root is ONLY for deliberate free-form composition, never the default.",
  "- TABLES / matrices → auto-grid with explicit tracks, NEVER nested flex rows. TEXT is AUTO-HEIGHT and must WRAP to its cell: BIND its WIDTH (flex COLUMN → align/alignSelf 'stretch' = the cross axis IS the width; grid → the column track) so a long line never overflows. Only the HEIGHT follows content — do NOT grow/vertically-stretch text or pin a height. Size equal regions with the FRAMES (tracks/grow), not the leaf text.",
  "- ONE ITEM PER CELL/SLOT: a grid cell or flex slot holds exactly ONE direct child (two children can't share one; columnSpan/rowSpan only merge cells for a single child). To put SEVERAL items in one cell/slot (card = title+body+button, stat = number+caption, icon+label), add ONE nested frame as that cell's child (presentable:false) with its OWN layout and place the items INSIDE it — never drop the multiple items straight into the grid/flex frame.",
  "- containerId IS THE PARENT FRAME, NEVER A LEAF (the bug that wrecks calendars/tables/lists): every weave.item.add's containerId must be the REGION'S LAYOUT FRAME (the frame you setLayout'd). ALL siblings of a grid/list — calendar dates, table cells, bullet rows — share the SAME grid/flex frame as containerId, so each flows into its own next-free cell/slot. Do NOT chain containerId onto the text/shape you JUST added: after the 'SAT' header, the dates' containerId is STILL the grid frame, not the SAT cell. Only a frame holds children — nesting items under a leaf balloons that one cell until it swallows the whole row (weave rejects a leaf containerId with `container-not-frame`). Re-state the grid frame's id as containerId on EVERY cell.",
  "- DISTRIBUTE AREA DELIBERATELY when the design wants it (don't default everything to equal fr): use UNEQUAL tracks for asymmetric structure — a sidebar + main as columns [{kind:'ratio',value:0.28},{kind:'fr',value:1}], a hero row taller than the rest, a 2:1 split as [fr 2, fr 1]. MERGE cells with columnSpan/rowSpan for a header band across all columns (columnSpan = column count), a featured/hero card (rowSpan 2), or a totals row. Tune gap/columnGap/rowGap for rhythm (tighter for dense tables, looser for airy cards). These are first-class via weave.frame.setLayout (tracks/gap) and weave.item.setLayoutChild (span) — reach for them instead of forcing a uniform grid.",
  "- VISUAL-FIRST, TEXT-MINIMAL (hard — agent slides keep coming out too wordy and under-decorated): text LABELS and headlines, it does NOT explain in sentences. Per slide: a short title + AT MOST ~3–5 short PHRASES (≈≤6 words each, NO full sentences, NO paragraphs); keep total body text to a few dozen words. If an idea needs explaining, SHOW it (a shape diagram, a chart, an icon + label, a big number + caption) — do NOT write the sentence; if you catch yourself writing one, convert it to a visual or cut it. VISUAL QUOTA: every content slide MUST carry ≥1 real non-text visual (chart / image-or-placeholder / shape diagram / icon / a deliberate graphic treatment — panels, bands, accents), never just text boxes on a background. Make the one key thing the HERO; size every text to FIT.",
  "- MATCH CONTENT TO THE SLIDE'S ROLE in the deck (mandatory): an overview/agenda/summary is a brief table of contents — just the section names, almost NO on-screen explanation; a section divider only names the part; the per-item DETAIL slide is the ONLY place that explains that item; a closing slide only closes. NEVER preview or dump a detail slide's explanation onto the overview — defer every explanation to the slide whose role owns it.",
  "- Pick the STRUCTURE that best communicates the content, and use MEDIA/SHAPES (source-less placeholders when you lack a real asset) instead of text-only slides.",
  "- VISUAL RICHNESS (required — a plain text-on-blank slide is a defect): ground content on DESIGNED SURFACES (give the slide a base fill; put colour panels / tonal bands / card surfaces — decoration.fill + cornerRadius + soft shadow — behind groups, never leave grouping frames transparent) and add tasteful ACCENT graphics from shapes/lines (a colour bar behind a title, a divider, a geometric accent on a focal number). Use the RIGHT visual for the content: kind:'chart' for data, image/video (or placeholder) for imagery, shapes for diagrams/icons. It's VISUAL polish (colour/shape/depth), never more text — every element earns its place, contrast ≥ AA, consistent across slides.",
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
  "   NESTED LAYOUT FRAMES ARE THE LAYOUT TOOL — use them WHERE THEY EARN THEIR PLACE: to GROUP and align/auto-arrange",
  "   MULTIPLE related items, or to make a region reflow as a unit. They are NOT required on every region — a frame",
  "   that would hold a SINGLE item (or a one-element region) adds nesting with no layout value, so place that item",
  "   directly on the slide instead. PROCEDURE per slide: (a) add the top-level slide frame; (b) for each region that",
  "   groups 2+ items — a header band (title + subtitle), a two-column split, a card / card grid, a sidebar, a stat",
  "   row — add a NESTED frame (containerId = the slide frame, attrs.presentable:false) and give it a layout via",
  "   weave.frame.setLayout (auto-flex row/column or auto-grid: direction, gap, padding, justify, align); (c) add",
  "   those items as CHILDREN of the frame so the layout positions and spaces them. Nest frames for REAL",
  "   sub-structure (a column that itself stacks a title + body), not for its own sake. The defect to avoid is",
  "   hand-placing a CLUSTER of related CONTENT items (text, content images, data, cards) on the slide root with",
  "   hand-picked x/y so they drift out of alignment — group THOSE into a layout frame. A single well-placed item,",
  "   or a deliberately simple composition, does NOT need a wrapper frame; do not over-nest to satisfy a rule.",
  "   This guidance governs CONTENT layout; it does NOT block graphics: a BACKDROP or",
  "   DECORATION layer is a deliberate, ENCOURAGED exception — a slide/frame background fill, a full-bleed or",
  "   background IMAGE / VIDEO (placed at {0,0,1,1} then weave.item.sendToBack), and accent SHAPES / lines that are",
  "   intentionally layered behind or over the content or bleed off an edge all legitimately use absolute / overlay",
  "   placement (often directly on the slide root). Add those FREELY; only the CONTENT must go through the layout",
  "   frames. Absolute placement of CONTENT itself is reserved for deliberate free-form composition.",
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
  "   ONE ITEM PER CELL / SLOT — and how to put SEVERAL in one: a layout frame gives each DIRECT child its own",
  "   cell (auto-grid) or slot (auto-flex); two children CANNOT share one cell/slot (a joining grid child auto-takes",
  "   the NEXT FREE cell, and columnSpan/rowSpan only MERGE cells for a single child — they don't let two children",
  "   co-occupy). So whenever a single cell/slot must hold MULTIPLE items (a card = heading + body + button; a",
  "   stat = big number + caption; an icon + label pair), do NOT drop those items straight into the grid/flex",
  "   frame — instead add ONE NESTED frame as that cell's/slot's child (containerId = the layout frame,",
  "   attrs.presentable:false), give the nested frame its OWN layout (usually an auto-flex column/row), and place",
  "   the several items INSIDE it. The nested frame is the single occupant of the cell/slot; its inner layout",
  "   arranges its contents. This is THE way to compose multi-item cells — plan for it before placing children.",
  "   CONTAINER SIZING (Figma Fixed / Hug / Fill): a layout frame (auto-flex OR auto-grid) can size ITS OWN box",
  "   per axis with weave.frame.setSizing { itemId, sizing:{ width, height } }, each 'fixed' | 'hug' | 'fill'.",
  "   'fixed' (DEFAULT) keeps the frame's own attrs.frame ratio. 'hug' makes the frame GROW to exactly fit its",
  "   children — use it when a container should be CONTENT-SIZED instead of a fixed ratio: a button / chip / badge /",
  "   tag that wraps its label, a pill, an auto-height card that is exactly as tall as its stack (a Hug axis needs",
  "   ≥1 child and re-grows when a child grows; a Hug auto-grid sizes every track to its cell contents). 'fill'",
  "   makes the frame fill its parent's FREE space along that axis — a panel / region that should absorb the",
  "   leftover width or height. gap, padding and track sizes stay 0..1 ratios either way — sizing only decides",
  "   whether the frame's box is fixed, derived-from-children (hug), or stretched-to-parent (fill); x/y placement",
  "   still comes from the layout. To give a CHILD an exact pixel size inside a Hug frame (so the hug resolves to a",
  "   known px) use weave.item.resizeHug { itemId, sizePx:{ w, h } } — the Hug ancestor regrows and the subtree",
  "   re-arranges in ONE undo step. (Default stays Fixed: most slide regions are fine with a ratio frame; reach for",
  "   Hug/Fill only when content-sized or space-filling behavior is actually wanted.)",
  "",
  "1) FRAME COORDINATES ARE RATIOS OF THE ITEM'S OWN PARENT FRAME, NEVER PIXELS. attrs.frame = { x, y, width,",
  "   height, rotation } where x / y / width / height are 0..1 RATIOS of the frame the item is a DIRECT CHILD of",
  "   (its containerId frame) — a top-level frame's parent is the whole design, but a NESTED item's parent is its",
  "   containing frame, NOT the slide or design root. e.g. { x:0.1, y:0.1, width:0.8, height:0.3 } = 'start 10% in,",
  "   80% wide, 30% tall' OF THAT PARENT FRAME. rotation is radians about the center. NEVER pass pixels into frame,",
  "   and always measure a child against its IMMEDIATE container — never against the slide unless the slide IS its",
  "   direct parent. (In an auto-flex/auto-grid frame the layout overrides a child's frame; the ratio basis still",
  "   matters for the frame's OWN box and for any absolute-constraints child.)",
  "   LINE / POLY EXCEPTION — for kind:'line' (and a kind:'shape' poly) the `frame` is NOT the drawn figure, only the",
  "   bounding box that ENCLOSES its `points`. The visible stroke is the polyline through attrs.points, each {x,y} a",
  "   0..1 ratio of THAT bbox — so to read where a line actually goes (its endpoints, direction, slope) you MUST read",
  "   `points`, not the frame: an endpoint's design position = frame.x/y + point × frame.width/height. Two lines with",
  "   the SAME frame can run opposite diagonals (points [{0,0},{1,1}] vs [{0,1},{1,0}]). Editing only the frame moves /",
  "   scales the whole stroke rigidly; to change which corners it connects, its angle, or one endpoint, edit `points`.",
  "   MIN SIZE FLOOR — every item you add must render at least 10px on its LONG side AND 20px² in area (for text:",
  "   width ≥ 10px, since height auto-fits; for a line: length ≥ 10px). A deliberately-thin element is fine (a",
  "   2px×400px divider passes); only a near-invisible speck is blocked. weave REJECTS an add below this floor and",
  "   returns the reason instead of creating an invisible speck — so size the frame ratio against its container's px",
  "   (canvas px on the [디자인] line × the parent's width/height ratios) and pick width/height that clear the floor.",
  "   If you get an 'item-too-small' rejection, enlarge frame.width/height or place the item in a bigger container,",
  "   then re-add — never retry the same tiny size.",
  "",
  "2) FONT SIZE — GIVE AN ABSOLUTE PX; it is FIXED (DR-101). Set attrs.fontSizeSpec =",
  "   { kind:'px', value } where value is the design-px size you want (read the canvas px off the [디자인]",
  "   line). It renders at exactly that design-px and does NOT rescale when a frame/parent is resized (only the",
  "   whole-canvas zoom scales it) — so the px means the same thing everywhere; no dividing by parent heights, no",
  "   per-nesting math. PICK THE PX BY ROLE off the CANVAS height: heading ~5–7% (≈60–84px on a 1080px canvas),",
  "   subheading ~4%, body ~3% (≈32px on 1080) — body is the readable BASELINE; real content (findings, agenda,",
  "   bullets, descriptions) must NEVER be below it. The px is the SAME whether the text sits on a full slide or deep",
  "   in a small nested card, so do NOT shrink it just because the parent frame is small.",
  "   SHARED-FRAME BUDGET (the #1 overflow cause): items in ONE frame SHARE its height (minus padding and the gaps",
  "   between them), so a text does NOT own the whole frame — keep the SUM of the children's rendered heights",
  "   (each ≈ fontSize × lineHeight × line-count) within the usable height WITH margin (stack + gaps ≤ ~85%); if it",
  "   would crowd, CUT WORDS or enlarge the region, do NOT shrink body below its minimum; never oversize. (A",
  "   { kind:'ratio', value:0..1 } still renders (value × parent height) but is NOT recommended — it rescales when",
  "   the parent resizes; prefer px. NEVER put a fraction into the plain fontSize number — sub-pixel, invisible text.)",
  "",
  "3) TEXT IS AUTO-HEIGHT — THE LAYOUT BOUNDS ITS WIDTH, THE CONTENT SETS ITS HEIGHT. Text is a CHILD of an",
  "   auto-flex / auto-grid frame. BIND ITS WIDTH to the cell so it WRAPS (never overflows): in a flex COLUMN set",
  "   align (or the child's alignSelf) to 'stretch' — the cross axis is the width — so the text fills the column",
  "   width and wraps; in an auto-grid the column track bounds it. Never leave layout text in auto-width (hugging",
  "   content), or a long line spills past its cell. Only the WIDTH is layout-bound: do NOT grow or vertically",
  "   stretch a text box and do NOT pin a fixed height — a short title keeps its natural content height; absorb",
  "   spare room with the frame's justify/align/gap/padding. For equal-size",
  "   regions (comparison columns, a card row) size the FRAMES via grid tracks / flex grow, never the leaf text.",
  "   CHOOSE A FONT SIZE THAT FITS the region with margin to spare — if content is long the size comes DOWN and",
  "   the copy gets shorter; never oversize so it crowds or overflows. (A non-text filler — a background shape or",
  "   image meant to cover its frame — may still stretch to fill.) Grid children follow track/gap/span changes via",
  "   weave.item.setLayoutChild (auto-grid policy: column/row/columnSpan/rowSpan/alignSelf/justifySelf). ONLY for a",
  "   text in an absolute-constraints frame (free-form) pin it: weave.item.setLayoutChild { itemId, policy:{",
  "   kind:'absolute-constraints', anchor:{ horizontal:'left', vertical:'top' } } }.",
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
  "   • MEDIA, CHARTS & SHAPES — a text-only slide is a DEFECT when a visual communicates better; reach for the",
  "     full vocabulary: kind:'chart' (via weave.chart.add) for ANY quantitative data — comparisons, trends,",
  "     proportions, KPIs (do not type numbers as a bullet list when a bar/line/pie lands it); kind:'image' for any",
  "     visual subject; kind:'video' for motion/demo/footage; kind:'shape' for diagrams, dividers, color blocks,",
  "     badges, callouts, icon-like glyphs (poly/path), backdrops; kind:'qr' for a scannable link/URL. When you",
  "     have no real asset URL, STILL place a source-less PLACEHOLDER (image: omit src + a descriptive alt like",
  "     '제품 사진 자리'; video: omit src + alt = clip description, optionally a poster URL) so the slot shows",
  "     instead of an empty/text-only slide. Always give image/video a descriptive alt. Match media to the topic.",
  "   • CHARTS — compose the DATA, then make it BEAUTIFUL, then TITLE it (see the `chart` itemKind for full detail):",
  "     (a) DATA: weave.chart.add seeds the dataset + chart together; category/label column FIRST, numeric series",
  "     after; pick the chartType that FITS (not just bar/line/pie) and keep series legible (≈≤5). Edit data via",
  "     weave.dataset.update, look/style via weave.item.update { attrs }. (b) STYLE: attrs.palette with the theme",
  "     categorical tokens (--domain-slide/canvas/block/media-accent) so series are distinct + theme-reactive;",
  "     attrs.variant (doughnut innerRadius / stacked / smooth / horizontal); attrs.overrides to emphasise the ONE",
  "     hero bar/slice; showLegend/showAxis as needed; GROUND the chart on a card frame (decoration.fill +",
  "     cornerRadius + soft shadow), AA contrast. (c) TEXT IS REAL TEXT ITEMS (DR-035): for bar/line/area + pie the",
  "     CATEGORY/axis labels are AUTO-MANAGED text child items derived from the dataset — do NOT hand-add or",
  "     reposition them, and editing a label's text edits the DATA (weave.dataset.update); you MAY restyle them",
  "     (color/weight/size, persists). ALWAYS add your OWN separate text items for the chart TITLE + a one-line",
  "     TAKEAWAY (and any callout / source note) — the data labels never supply those.",
  "   • VISUAL TREATMENT (raise visual satisfaction — REQUIRED; a plain run of text on a blank slide is a defect):",
  "     ground content on DESIGNED SURFACES and add graphic polish. This is VISUAL work (colour / shape / depth),",
  "     NEVER more text or data. (a) FRAME BACKGROUNDS: give the slide a deliberate base fill (a solid mood colour",
  "     or a subtle tonal/gradient ground — not bare default white) and put colour PANELS / tonal BANDS / CARD",
  "     surfaces (decoration.fill + cornerRadius + a soft decoration.shadow) behind groups, header bands, sidebars,",
  "     and stat cards — set the fill UNIT on the frame, do not leave grouping frames transparent. (b) ACCENT",
  "     GRAPHICS from shapes/lines: a colour block or bar behind a title, a divider / underline under a heading, a",
  "     geometric accent (circle / bar / corner shape) anchoring a focal number, an enclosing card or border around",
  "     a group. (c) RESTRAINT: every graphic must EARN its place by doing visual work — structure, grouping,",
  "     emphasis, or mood — keep text/background contrast ≥ WCAG AA, keep the treatment CONSISTENT across slides,",
  "     and never let decoration crowd or out-shout the focal point. Polish, not clutter — and not a licence to add text.",
  "   • MARKDOWN input → ONE slide: when the request's content arrives as Markdown, represent that whole document",
  "     on a SINGLE slide (one md doc = one slide), not a multi-slide deck.",
  "   • IMAGE AS BACKGROUND: add a kind:'image' child at frame { x:0, y:0, width:1, height:1 } with fit:'cover',",
  "     then weave.item.sendToBack so it sits behind the other items. This is the BACKDROP exception in rule 0 — a",
  "     background image is NOT 'hand-placed content', so place it absolutely and send it back; the layout frames",
  "     sit on top. Attached [첨부 이미지 에셋] URLs are real assets — use them as attrs.src.",
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
  "   • LOCKED items: ANY item kind may carry attrs.locked (boolean). A locked item rejects move / resize / rotate /",
  "     delete / text-edit / reparent (it stays selectable). Set attrs.locked:true (weave.item.update) to protect a",
  "     finished background or frame, false to unlock. Do NOT edit a locked item without unlocking it first.",
  ...THEME_REGISTRY_LINES,
].join("\n");
