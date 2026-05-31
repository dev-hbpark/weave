// AUDIT-005 (V-4 / V-8 / V-12) — single source of truth for every DomainKind.
//
// Before this module the per-kind facts were scattered across ≥5 sites that
// drifted independently: `DOMAIN_RENDERERS` (domains/index.ts, anti-pattern
// #189 catalogue), `DOMAIN_REGISTRY` meta (types.ts), the `isDomainItem`
// `||`-membership chain (agocraft-mirror.ts), `DESIGN_FRAME_KINDS`
// (zorder/register.ts), and the `attrsByKind` seed map (seed.ts). Adding the
// `line` kind in WI-062 forced an edit to all of them — exactly the
// "kind-add = N-file sweep" Rule 6 prevents.
//
// `DomainKind` is a CLOSED, weave-owned union (not an open plugin surface like
// the DR-009 InteractionBehavior registry), so the registry here is a single
// compiler-exhaustive `Record<DomainKind, DomainKindSpec>`. Adding a kind is
// ONE entry below — TypeScript forces it — and every consumer derives from
// this map generically (no per-kind branch anywhere downstream).

import type { ComponentType } from "react";
import { FrameBlock } from "./domains/FrameBlock.js";
import { ImageBlock } from "./domains/ImageBlock.js";
import { LineBlock } from "./domains/LineBlock.js";
import { QrBlock } from "./domains/QrBlock.js";
import { ShapeBlock } from "./domains/ShapeBlock.js";
import { TextBlock } from "./domains/TextBlock.js";
import { VideoBlock } from "./domains/VideoBlock.js";
import {
  type AgoItem,
  type DomainKind,
  type DomainMeta,
  FULL_FRAME,
  type ItemAttrsByKind,
} from "./types.js";

export type DomainRendererProps<K extends DomainKind> = {
  readonly item: AgoItem<K>;
  readonly onUpdate?: (patch: Partial<ItemAttrsByKind[K]>) => void;
};

export interface DomainKindSpec<K extends DomainKind> {
  readonly kind: K;
  /** Marketing / panel metadata (label, tagline, accent var). */
  readonly meta: DomainMeta;
  /** The React renderer agocraft's FrameSurface looks up by `item.kind`. */
  readonly renderer: ComponentType<DomainRendererProps<K>>;
  /** Attrs for a freshly-created item of this kind (seed). Returns a fresh
   *  object each call so callers never share a mutable reference. */
  readonly defaultAttrs: () => ItemAttrsByKind[K];
  /** Registers the design-frame ZOrderCapability adapter (z = index in
   *  root.children). `qr` opts out (WI-058 — it carries no z-order adapter);
   *  preserved here so the refactor changes no runtime behaviour. */
  readonly participatesInZorder: boolean;
}

// One entry per DomainKind. The mapped type makes the map exhaustive: omitting
// a kind is a compile error.
const SPECS: { readonly [K in DomainKind]: DomainKindSpec<K> } = {
  frame: {
    kind: "frame",
    meta: {
      kind: "frame",
      label: "Frame",
      tagline: "Empty canvas container — drop primitives inside",
      accentVar: "--accent",
    },
    renderer: FrameBlock,
    participatesInZorder: true,
    defaultAttrs: () => ({ frame: FULL_FRAME }),
  },
  image: {
    kind: "image",
    meta: {
      kind: "image",
      label: "Image",
      tagline: "Photo, illustration, or other still picture",
      accentVar: "--domain-media-accent",
    },
    renderer: ImageBlock,
    participatesInZorder: true,
    defaultAttrs: () => ({ frame: FULL_FRAME, src: "", alt: "", fit: "cover", borderRadius: 0 }),
  },
  video: {
    kind: "video",
    meta: {
      kind: "video",
      label: "Video",
      tagline: "Video clip with controls + trim",
      accentVar: "--domain-media-accent",
    },
    renderer: VideoBlock,
    participatesInZorder: true,
    defaultAttrs: () => ({
      frame: FULL_FRAME,
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
    }),
  },
  shape: {
    kind: "shape",
    meta: {
      kind: "shape",
      label: "Shape",
      tagline: "Geometric primitive (rect / ellipse / star / polygon / …)",
      accentVar: "--domain-canvas-accent",
    },
    renderer: ShapeBlock,
    participatesInZorder: true,
    // DR-028 — decoration (fill / stroke / …) seeds as a `decoration.fill`
    // unit in toAgocraftItem, not as an attr.
    defaultAttrs: () => ({
      frame: FULL_FRAME,
      shape: "rectangle",
      subAttrs: { shape: "rectangle", cornerRadii: { tl: 0, tr: 0, br: 0, bl: 0 } },
    }),
  },
  line: {
    kind: "line",
    meta: {
      kind: "line",
      label: "Line",
      tagline: "Stroke-only line / curve with endpoint markers (no fill)",
      accentVar: "--domain-canvas-accent",
    },
    renderer: LineBlock,
    participatesInZorder: true,
    // DR-025 / WI-062 — 2-point horizontal stroke, no markers.
    defaultAttrs: () => ({
      frame: FULL_FRAME,
      points: [
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 },
      ],
      smooth: false,
      heads: { start: "none", end: "none" },
    }),
  },
  text: {
    kind: "text",
    meta: {
      kind: "text",
      label: "Text",
      tagline: "Text box with font family / size / color controls",
      accentVar: "--domain-block-accent",
    },
    renderer: TextBlock,
    participatesInZorder: true,
    // Phase 15 + Phase 1/1.5 additive defaults — see types.ts TextAttrs.
    defaultAttrs: () => ({
      frame: FULL_FRAME,
      text: "텍스트",
      fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      fontSize: 24,
      fontWeight: "normal",
      fontStyle: "normal",
      color: "#1f2933",
      textAlign: "left",
      lineHeight: 1.4,
      letterSpacing: 0,
      textTruncation: "DISABLED",
      maxLines: null,
      textAlignVertical: "TOP",
      textDecoration: "NONE",
      textCase: "ORIGINAL",
      paragraphSpacing: 0,
      paragraphIndent: 0,
      hyperlink: null,
      textAlignHorizontal: "LEFT",
      lineHeightSpec: { value: 1.4, unit: "multiplier" },
    }),
  },
  qr: {
    kind: "qr",
    meta: {
      kind: "qr",
      label: "QR Code",
      tagline: "Data-driven QR — set the data string, error level, colors",
      accentVar: "--domain-media-accent",
    },
    renderer: QrBlock,
    // WI-058 — qr historically registers no z-order adapter.
    participatesInZorder: false,
    defaultAttrs: () => ({
      frame: FULL_FRAME,
      data: "https://example.com",
      ecLevel: "M",
      foreground: { type: "solid", color: "#111827" },
      background: { type: "solid", color: "#ffffff" },
      margin: 4,
      moduleStyle: "square",
      opacity: 1,
    }),
  },
};

const ALL_KINDS = Object.keys(SPECS) as DomainKind[];

/** The full spec registry — primarily for tests / introspection. */
export const DOMAIN_KIND_SPECS = SPECS;

/** Fast membership test — replaces the `isDomainItem` `||` chain (V-12). */
export const KNOWN_DOMAIN_KINDS: ReadonlySet<string> = new Set(ALL_KINDS);

/** Renderer per kind — replaces the `DOMAIN_RENDERERS` catalogue (V-4). */
export const DOMAIN_RENDERERS = Object.fromEntries(
  ALL_KINDS.map((k) => [k, SPECS[k].renderer]),
) as { readonly [K in DomainKind]: ComponentType<DomainRendererProps<K>> };

/** Marketing / panel metadata per kind (was DOMAIN_REGISTRY in types.ts). */
export const DOMAIN_REGISTRY: Readonly<Record<DomainKind, DomainMeta>> = Object.fromEntries(
  ALL_KINDS.map((k) => [k, SPECS[k].meta]),
) as Record<DomainKind, DomainMeta>;

/** Kinds that get a design-frame z-order adapter — replaces the
 *  `DESIGN_FRAME_KINDS` literal (V-8). Excludes `qr` (see spec). */
export const DESIGN_FRAME_KINDS: ReadonlyArray<DomainKind> = ALL_KINDS.filter(
  (k) => SPECS[k].participatesInZorder,
);

/** Seed attrs for a new item of `kind` — replaces seed.ts's `attrsByKind`. */
export function defaultAttrsFor<K extends DomainKind>(kind: K): ItemAttrsByKind[K] {
  return SPECS[kind].defaultAttrs();
}
