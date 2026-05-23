// Mock document model — mirrors the agocraft Composite tree shape (Item / Unit)
// so swap to @agocraft/core later is structural, not behavioral. Read-only for
// the WI-003 prototype; editing arrives with M2.
//
// Phase 10a (2026-05-23) — coordinate paradigm shift:
//   - Every domain Item now carries a `frame` (parent-relative 0..1 ratio).
//     Parent = the container the item lives in (the Design's root document,
//     or a sub-doc deeper in the tree). When the parent's pixel size changes
//     (resizing the design, or changing a sub-doc's frame), children re-flow
//     automatically — no model update needed.
//   - CanvasShape coordinates moved from 0..100 percent → 0..1 ratio of the
//     parent canvas item's frame.
//   - CameraTargetBehavior.position moved from absolute px → 0..1 ratio of the
//     Design.
//   - Sub-doc width/height were absolute px — now collapsed into the universal
//     `frame` on every Item.
//
// The only place we keep absolute px is the new top-level `Design` model
// (width × height), which acts as the canvas the entire tree paints onto.

// Phase 11 — Figma Frame paradigm. Every domain kind IS a frame (a sized
// rectangle inside its parent), and every frame can contain other frames as
// children. `sub-doc` was a redundant kind for "a frame that's just a
// container" — collapsed into the four real types, which now all support
// nesting. The choice of visual (slide layout, canvas freeform, doc blocks,
// media tone) is orthogonal to whether the frame has child frames inside.
export type DomainKind = "slide" | "canvas-design" | "block-doc" | "media";

// ── ItemFrame — universal parent-relative bounding box ──────────────────────
//
// Every domain Item gets a `frame` on its attrs. Numbers are 0..1 ratios of the
// parent container's *frame* (recursive composition gives absolute px once the
// chain bottoms out at the Design's width × height). Rotation is radians around
// the frame's center.

export interface ItemFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}

/** A full-container frame — useful for stacked layouts (slide-deck, doc-page)
 *  where each item is rendered at the parent's full size but in sequence. */
export const FULL_FRAME: ItemFrame = Object.freeze({
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  rotation: 0,
});

export interface DomainMeta {
  readonly kind: DomainKind;
  readonly label: string;
  readonly tagline: string;
  readonly accentVar: string; // CSS var name from DR-design-001
}

export const DOMAIN_REGISTRY: Readonly<Record<DomainKind, DomainMeta>> = {
  slide: {
    kind: "slide",
    label: "Slide",
    tagline: "Sequential presentation page",
    accentVar: "--domain-slide-accent",
  },
  "canvas-design": {
    kind: "canvas-design",
    label: "Canvas",
    tagline: "Free-form design surface",
    accentVar: "--domain-canvas-accent",
  },
  "block-doc": {
    kind: "block-doc",
    label: "Doc",
    tagline: "Block-based text document",
    accentVar: "--domain-block-accent",
  },
  media: {
    kind: "media",
    label: "Media",
    tagline: "Image or video block",
    accentVar: "--domain-media-accent",
  },
};

export const DOMAIN_KINDS: ReadonlyArray<DomainKind> = [
  "slide",
  "canvas-design",
  "block-doc",
  "media",
];

// agocraft mirror: an Item has a kind + attrs + units. Units are typed payloads
// that the renderer interprets. For WI-003 mock the payload is intentionally
// thin — text + optional list of bullet points — and grows with M2 editing.

export interface SlideAttrs {
  readonly frame: ItemFrame;
  readonly title: string;
  readonly bullets: ReadonlyArray<string>;
}

/** Canvas shape — coordinates in 0..1 ratio of the parent canvas item's frame.
 *  - id: stable identifier (selection key)
 *  - x/y: top-left position, 0..1
 *  - width/height: 0..1
 *  - rotation: radians, center-based
 *  - hue: CSS color value (var(...) or literal)
 *
 *  Phase 10a (schemaVersion 5): coords moved from 0..100 percent → 0..1 ratio,
 *  so the canvas can be embedded inside any-sized parent and shapes scale
 *  with it. */
export interface CanvasShape {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly hue: string;
}

export interface CanvasAttrs {
  readonly frame: ItemFrame;
  readonly summary: string;
  readonly shapes: ReadonlyArray<CanvasShape>;
}

export interface BlockDocAttrs {
  readonly frame: ItemFrame;
  readonly heading: string;
  readonly paragraphs: ReadonlyArray<string>;
}

export interface MediaAttrs {
  readonly frame: ItemFrame;
  readonly caption: string;
  readonly tone: "image" | "video";
}

export type ItemAttrsByKind = {
  slide: SlideAttrs;
  "canvas-design": CanvasAttrs;
  "block-doc": BlockDocAttrs;
  media: MediaAttrs;
};

// ── Doc flavor — the "kind" of the top-level document (root.attrs.flavor) ──
//
// Different flavors hint at *which* domain items make sense at the top
// level. They're a UX nudge; the underlying model is always `weave-doc`'s
// composite tree. New flavors land here + in `FLAVOR_REGISTRY` + the
// new-design wizard tiles.

export type DocFlavor = "mixed" | "slide-deck" | "canvas-board" | "doc-page";

export interface DocFlavorMeta {
  readonly flavor: DocFlavor;
  readonly label: string;
  readonly tagline: string;
  readonly accentVar: string;
  /** Default child kinds the toolbar's "Add" menu surfaces first. */
  readonly suggestedKinds: ReadonlyArray<DomainKind>;
}

export const FLAVOR_REGISTRY: Readonly<Record<DocFlavor, DocFlavorMeta>> = {
  mixed: {
    flavor: "mixed",
    label: "Mixed canvas",
    tagline: "Slides + canvas + doc + media in one place",
    accentVar: "--accent",
    // Every domain is a Frame post-Phase-11; suggest all four.
    suggestedKinds: ["slide", "canvas-design", "block-doc", "media"],
  },
  "slide-deck": {
    flavor: "slide-deck",
    label: "Slide deck",
    tagline: "Sequential slides for presenting",
    accentVar: "--domain-slide-accent",
    suggestedKinds: ["slide", "canvas-design", "block-doc", "media"],
  },
  "canvas-board": {
    flavor: "canvas-board",
    label: "Canvas board",
    tagline: "Free-form spatial canvases",
    accentVar: "--domain-canvas-accent",
    suggestedKinds: ["canvas-design", "media", "slide", "block-doc"],
  },
  "doc-page": {
    flavor: "doc-page",
    label: "Block document",
    tagline: "Text-first blocks (Notion-style)",
    accentVar: "--domain-block-accent",
    suggestedKinds: ["block-doc", "media", "slide", "canvas-design"],
  },
};

export const DOC_FLAVORS: ReadonlyArray<DocFlavor> = [
  "mixed",
  "slide-deck",
  "canvas-board",
  "doc-page",
];

/** Size preset — applies to top-level docs AND sub-docs. */
export interface DocSizePreset {
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

export const DOC_SIZE_PRESETS: ReadonlyArray<DocSizePreset> = [
  { id: "16:9", label: "Presentation 16:9", width: 1920, height: 1080 },
  { id: "4:3", label: "Classic 4:3", width: 1024, height: 768 },
  { id: "a4-p", label: "A4 portrait", width: 794, height: 1123 },
  { id: "a4-l", label: "A4 landscape", width: 1123, height: 794 },
  { id: "square", label: "Square", width: 1080, height: 1080 },
];

// InteractionBehavior — WI-009 / DR-009. Open registry pattern.
// PoC kinds: "camera-target" (Prezi nav), "hotspot" (Genially click).
// Future kinds (reveal-on-step / branch / embed-autoplay / timeline / poll / …)
// add adapters in apps/web/src/document/interactions/ — PresentPage code does
// not change. Behaviors are *typed* via a discriminated union here so authoring
// (seed, editor) is type-safe; the registry treats them as opaque at dispatch.

export interface CameraTargetBehavior {
  readonly kind: "camera-target";
  readonly id: string;
  /** Position 0..1 — ratio of the Design's width × height. Used by
   *  PresentPage when `manual === true`. Otherwise the position falls back
   *  to the frame's absolute-frame center (computed by PresentPage). */
  readonly position: { readonly x: number; readonly y: number };
  readonly scale: number;
  readonly order: number;
  readonly label?: string;
  /** Phase 13b — when `true`, PresentPage uses `position`+`scale` verbatim
   *  instead of the auto-computed frame-fit camera. Default false. */
  readonly manual?: boolean;
}

export type HotspotAction =
  | { readonly type: "reveal"; readonly targetId: string }
  | { readonly type: "next-camera" }
  | { readonly type: "jump-camera"; readonly targetId: string }
  | { readonly type: "external"; readonly href: string };

export interface HotspotBehavior {
  readonly kind: "hotspot";
  readonly id: string;
  /** Region in item-local 0..1 coordinates (so it scales with the item). */
  readonly region: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly trigger: "click" | "hover";
  readonly action: HotspotAction;
  readonly label?: string;
}

export interface RevealOnStepBehavior {
  readonly kind: "reveal-on-step";
  readonly id: string;
  /** Step (0-indexed camera-target order) at which the item becomes visible. Hidden before. */
  readonly step: number;
  /** Visual effect on reveal. PoC: fade only (bounding-box stable — R-17). */
  readonly mode: "fade";
  readonly label?: string;
}

// ── Phase 13d — Genially-inspired interaction kinds ────────────────────────

/** Hover-effect — visual change while the user is hovering the frame in
 *  presentation mode. Genially's "interactivity" panel pattern. */
export interface HoverEffectBehavior {
  readonly kind: "hover-effect";
  readonly id: string;
  readonly effect: "highlight" | "dim-others" | "reveal";
  /** When `effect === "reveal"`, this is the item id whose visibility flips. */
  readonly targetId?: string;
  readonly label?: string;
}

/** Button-trigger — the frame itself acts as a button. Same `HotspotAction`
 *  payload as `HotspotBehavior`, but without a sub-region (the whole frame
 *  is the click target). */
export interface ButtonTriggerBehavior {
  readonly kind: "button-trigger";
  readonly id: string;
  readonly action: HotspotAction;
  readonly label?: string;
}

/** Entrance-animation — when the frame's step is reached, the frame slides /
 *  fades / zooms into place. Mirrors Prezi's path-driven transition + Genially's
 *  per-element entrance animation. */
export interface EntranceAnimationBehavior {
  readonly kind: "entrance-animation";
  readonly id: string;
  readonly mode: "fade" | "slide-up" | "slide-down" | "zoom-in";
  /** Step index (0-based) at which the animation fires. */
  readonly step: number;
  /** Duration in ms. */
  readonly durationMs: number;
  readonly label?: string;
}

export type InteractionBehavior =
  | CameraTargetBehavior
  | HotspotBehavior
  | RevealOnStepBehavior
  | HoverEffectBehavior
  | ButtonTriggerBehavior
  | EntranceAnimationBehavior;

export interface Item<K extends DomainKind = DomainKind> {
  readonly id: string;
  readonly kind: K;
  readonly attrs: ItemAttrsByKind[K];
  readonly behaviors: ReadonlyArray<InteractionBehavior>;
  readonly createdAt: string; // ISO
}

// ── WI-013 Phase 3b — agocraft-shaped renderer / editor input ────────────
//
// `AgoItem<K>` is a typed *view* of an `@agocraft/core` Item with the kind
// narrowed to one of the weave DomainKinds and the attrs narrowed to the
// matching domain attrs type. Runtime values are real agocraft Items pulled
// from `docInAgocraft.root.children` — the cast lives in DemoDocPage /
// PresentPage where the narrowing happens.
//
// Behaviors are *not* a field on `AgoItem` — they live in `item.units` in
// agocraft. Use the `getBehaviors(item)` helper exported from
// `./agocraft-mirror.ts` to project them out.

import type { Item as AgocraftItemBase } from "@agocraft/core";

export type AgoItem<K extends DomainKind = DomainKind> = Omit<
  AgocraftItemBase,
  "kind" | "attrs"
> & {
  readonly kind: K;
  readonly attrs: ItemAttrsByKind[K];
};

export interface Document {
  readonly id: string;
  readonly title: string;
  readonly items: ReadonlyArray<Item>;
  readonly updatedAt: string; // ISO
  readonly schemaVersion: 3;
}

// ── Design — the top-level container that hosts an AgocraftDocument ─────────
//
// Phase 10a (schemaVersion 5):
//
//   Design (absolute px width × height)
//     └─ AgocraftDocument (the editable composite tree)
//          └─ root.children[] = top-level items + sub-docs
//               └─ sub-doc.children[] = nested items + sub-docs (unbounded depth)
//
// Every item carries an `ItemFrame` (0..1 ratio of its parent). The only
// absolute coords in the entire model are `Design.width` and `Design.height`.
// Resize the design, and everything composes naturally without any model
// update — that is the point of the shift.
//
// `presentationOrder` is the *display* order for the bottom thumbnail panel
// (Phase 10c) — a flat sequence of sub-doc ids, independent of parent-child
// tree position. The deepest sub-doc can be the first slide; the shallowest
// can be the last. Empty → fall back to depth-first tree order.

import type { Document as AgocraftDocument } from "@agocraft/core";

export interface Design {
  readonly id: string;
  readonly title: string;
  readonly width: number; // absolute px — the only absolute coord in the model
  readonly height: number; // absolute px
  readonly document: AgocraftDocument;
  readonly presentationOrder: ReadonlyArray<string>;
  readonly meta: {
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly schemaVersion: 5;
  };
}
