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
        "Free placement — each child sits at its own attrs.frame box. The default; use it unless the user asks for an auto row/column/grid.",
    },
    {
      kind: "auto-flex",
      description:
        "Auto row or column — children flow and are sized by the frame's layout spec; their individual frames are managed by the layout.",
      childConstraints: "child attrs.frame is overridden by the flex layout",
    },
    {
      kind: "auto-grid",
      description:
        "Auto grid — children fill cells defined by the frame's layout spec (tracks/spans).",
      childConstraints: "child attrs.frame is overridden by the grid layout",
    },
  ],
  itemKinds: [
    {
      kind: "frame",
      description:
        "A container (like a Figma frame / a slide). Holds child items and has NO visual content of its own. To put items inside it, call weave.item.add with containerId set to this frame's id. Optionally carries attrs.layout (a LayoutSpec) to auto-arrange its children.",
      editableAttrs: ["frame", "layout", "fill", "cornerRadius"],
    },
    {
      kind: "text",
      description:
        "A text box. The visible string is attrs.text. Style via attrs.fontSize (px), fontWeight, fontStyle, fill, textAlignHorizontal. Size/position via attrs.frame.",
      editableAttrs: [
        "frame",
        "text",
        "fontSize",
        "fontWeight",
        "fontStyle",
        "fill",
        "textAlignHorizontal",
      ],
    },
    {
      kind: "shape",
      description:
        'A vector shape. attrs.shape is the kind ("rectangle" | "ellipse" | "triangle" | "star" | …); attrs.fill is { type: "solid", color: "#rrggbb" }; attrs.stroke / opacity optional. Size/position via attrs.frame.',
      editableAttrs: ["frame", "shape", "fill", "stroke", "opacity"],
    },
    {
      kind: "image",
      description:
        "An image. attrs.src is the URL/data-URL, attrs.alt the description, attrs.fit one of cover|contain|fill. Size/position via attrs.frame.",
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
    {
      kind: "camera-target",
      description:
        "A presentation step. Add to an item (weave.item.addBehavior) to make it a stop in Present mode. position { x, y } (0..1) and scale set the camera; order sets the sequence.",
      editableAttrs: ["position", "scale", "order", "label"],
    },
    {
      kind: "hotspot",
      description:
        'A clickable region that triggers an action (e.g. jump to a camera target). region { x, y, width, height } (0..1), trigger ("click"), action.',
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
  "- Coordinates: every attrs.frame is { x, y, width, height, rotation } with x/y/width/height as 0..1 RATIOS of the parent (root parent = the whole design). No pixels. rotation is radians about the center.",
  "- Always target existing items by the id shown in design.snapshot. Call design.snapshot first if you are unsure what exists.",
  "- To create inside a frame, pass containerId = that frame's id to weave.item.add. New items default to a full-parent frame; adjust with weave.item.update afterwards.",
  "- Make the smallest set of tool calls that satisfies the request; if a tool returns an error, read it and adjust.",
].join("\n");
