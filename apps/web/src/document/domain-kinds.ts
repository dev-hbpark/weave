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
import { ChartBlock } from "./domains/ChartBlock.js";
import { EmbedBlock } from "./domains/EmbedBlock.js";
import { FrameBlock } from "./domains/FrameBlock.js";
import { ImageBlock } from "./domains/ImageBlock.js";
import { LineBlock } from "./domains/LineBlock.js";
import { QrBlock } from "./domains/QrBlock.js";
import { ShapeBlock } from "./domains/ShapeBlock.js";
import { TextBlock } from "./domains/TextBlock.js";
import { VideoBlock } from "./domains/VideoBlock.js";
import { DEFAULT_TEXT_FONT_FAMILY } from "./fonts/catalog.js";
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
      alt: "",
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
      // WI-136 — theme body-role font. Like the theme-reactive color default
      // (`var(--text-default)`), a new text box adapts to the active
      // [data-theme]'s `--font-sans` with no document mutation. Pick a specific
      // catalog font in the toolbar to override. (DR-088)
      fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      // DR-093 — fontSizeSpec is the single source of truth and is ALWAYS
      // present; `fontSize` is the synced legacy mirror (never read as source).
      fontSize: 24,
      fontSizeSpec: { kind: "px", value: 24 },
      fontWeight: "normal",
      fontStyle: "normal",
      // Theme-reactive default (D15): content text reads as the theme's body-ink
      // token instead of a fixed dark hex, so a freshly-created text box adapts to
      // the active [data-theme] AND the canvas bg-tone (light → dark ink, dark →
      // light ink). The agent overrides per role (var(--text-strong) for titles,
      // var(--accent) for emphasis); this is the safety-net default. Rendered via
      // TextBlock's inline `style.color` so CSS resolves the var() per theme.
      color: "var(--text-default)",
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
  chart: {
    kind: "chart",
    meta: {
      kind: "chart",
      label: "Chart",
      tagline: "Data-driven chart — references a dataset; bar / line / pie",
      accentVar: "--domain-canvas-accent",
    },
    renderer: ChartBlock,
    // WI-077 — chart participates in z-order like every other visual primitive
    // (unlike qr). Its referenced dataset is non-visual (root-unit store).
    participatesInZorder: true,
    // Empty `datasetId` → placeholder until a dataset is attached. The
    // add-menu (Phase 4) seeds a dataset and fills this in one step.
    defaultAttrs: () => ({
      frame: FULL_FRAME,
      datasetId: "",
      chartType: "bar",
      // DR-036 — channel encoding (empty until a dataset is attached).
      encoding: {},
      showLegend: true,
      showAxis: true,
      opacity: 1,
    }),
  },
  embed: {
    kind: "embed",
    meta: {
      kind: "embed",
      label: "임베드",
      tagline: "YouTube 등 영상 임베드 — URL을 붙여넣으세요",
      accentVar: "--domain-media-accent",
    },
    renderer: EmbedBlock,
    // WI-139 — an embed is a visual media primitive; participates in z-order.
    participatesInZorder: true,
    // Empty `url` → placeholder until the user pastes a recognized URL. The
    // iframe src is derived per-render via the provider registry (no stored src).
    defaultAttrs: () => ({
      frame: FULL_FRAME,
      url: "",
      allowFullscreen: true,
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
