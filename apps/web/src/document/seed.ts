import type {
  CameraTargetBehavior,
  Document,
  DomainKind,
  HotspotBehavior,
  InteractionBehavior,
  Item,
  ItemAttrsByKind,
  ItemFrame,
  RevealOnStepBehavior,
} from "./types.js";
import { FULL_FRAME } from "./types.js";

// Stable id for the demo doc — fixed slug, single record. Multi-doc lands at M2.
export const DEMO_DOC_ID = "demo";

let counter = 1;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

/** Lay out auto camera targets in a loose grid so the first Present run has a
 *  story (left-to-right, top-to-bottom). Positions are 0..1 ratios of the
 *  Design's width × height. Hand-tuning lands with the editor UI. */
const GRID: ReadonlyArray<{ readonly x: number; readonly y: number }> = [
  { x: 0.0, y: 0.0 },
  { x: 0.55, y: 0.1 },
  { x: 0.2, y: 0.45 },
  { x: 0.75, y: 0.55 },
  { x: 0.1, y: 0.7 },
  { x: 0.4, y: 0.9 },
];

function defaultCameraTarget(order: number): CameraTargetBehavior {
  const grid = GRID[order % GRID.length] ?? { x: 0, y: 0 };
  return {
    kind: "camera-target",
    id: nextId("cam"),
    position: { x: grid.x, y: grid.y },
    scale: 1,
    order,
    label: `Scene ${order + 1}`,
  };
}

/** A predictable stack frame — items rendered one-below-the-next take 1/N of
 *  the parent's height. Used by mixed/canvas-board's seed items, where each
 *  default item gets a tile of the design. The slide-deck / doc-page flavors
 *  use FULL_FRAME stacks rendered sequentially (presentation mode steps
 *  through them). */
export function tileFrame(order: number, count: number): ItemFrame {
  const safeCount = Math.max(1, count);
  const h = 1 / safeCount;
  return { x: 0, y: order * h, width: 1, height: h, rotation: 0 };
}

/** A demo hotspot — covers ~30% of the bottom-right of the slide, jumps to next camera. */
function defaultHotspot(action: HotspotBehavior["action"], label: string): HotspotBehavior {
  return {
    kind: "hotspot",
    id: nextId("hot"),
    region: { x: 0.62, y: 0.62, width: 0.32, height: 0.32 },
    trigger: "click",
    action,
    label,
  };
}

function revealOnStep(step: number, label: string): RevealOnStepBehavior {
  return {
    kind: "reveal-on-step",
    id: nextId("rev"),
    step,
    mode: "fade",
    label,
  };
}

export function createDefaultItem<K extends DomainKind>(
  kind: K,
  order: number,
  extraBehaviors: ReadonlyArray<InteractionBehavior> = [],
): Item<K> {
  const now = new Date().toISOString();
  const id = nextId(kind);
  const attrsByKind: ItemAttrsByKind = {
    // WI-032 — `frame` is the canvas container of the new paradigm. No
    // built-in content; primitive children carry every visible element.
    frame: {
      frame: FULL_FRAME,
    },
    // WI-020 — seeds for image / video / shape kinds. Hosts that need a
    // specific source override via the `add` command's input.
    image: {
      frame: FULL_FRAME,
      src: "",
      alt: "",
      fit: "cover",
      borderRadius: 0,
      opacity: 1,
      filter: {},
      shadow: null,
    },
    video: {
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
      opacity: 1,
      shadow: null,
    },
    shape: {
      frame: FULL_FRAME,
      shape: "rectangle",
      fill: { type: "solid", color: "#cbd5f5" },
      stroke: null,
      shadow: null,
      opacity: 1,
      subAttrs: { shape: "rectangle", cornerRadii: { tl: 0, tr: 0, br: 0, bl: 0 } },
    },
    // Phase 15 — text primitive default. Phase 1 (WI-016 / WI-029) adds
    // Figma-equivalent optional fields with sensible defaults: HEIGHT-mode
    // resize, no truncation, TOP vertical align, no decoration, ORIGINAL
    // case, paragraph spacing/indent 0, no hyperlink. Existing fields
    // unchanged (Phase 1.5 will rename textAlign / lineHeight unit).
    text: {
      frame: FULL_FRAME,
      text: "텍스트",
      fontFamily:
        "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      fontSize: 24,
      fontWeight: "normal",
      fontStyle: "normal",
      color: "#1f2933",
      textAlign: "left",
      lineHeight: 1.4,
      letterSpacing: 0,
      opacity: 1,
      shadow: null,
      // ─── Phase 1 (WI-016) additive defaults ─────────────────────────
      textAutoResize: "HEIGHT",
      textTruncation: "DISABLED",
      maxLines: null,
      textAlignVertical: "TOP",
      textDecoration: "NONE",
      textCase: "ORIGINAL",
      paragraphSpacing: 0,
      paragraphIndent: 0,
      hyperlink: null,
      // Phase 1.5 Phase A — UPPERCASE Figma-convention horizontal align
      // populated alongside legacy `textAlign`. weave readers prefer the
      // new field; legacy lowercase remains for backward compat.
      textAlignHorizontal: "LEFT",
      // Phase 1.5 Phase B — explicit-unit line height alongside legacy
      // `lineHeight: 1.4` (multiplier). New readers prefer this.
      lineHeightSpec: { value: 1.4, unit: "multiplier" },
    },
  };
  return {
    id,
    kind,
    attrs: attrsByKind[kind],
    behaviors: [defaultCameraTarget(order), ...extraBehaviors],
    createdAt: now,
  };
}

export function createDemoDocument(): Document {
  const now = new Date().toISOString();
  // WI-032 Phase 3 — the legacy 4-domain demo is collapsed to a single
  // frame container; the demo's "one doc, four worlds" narrative now plays
  // through nested primitive children once a real preset / drag-add is run
  // against this surface.
  return {
    id: DEMO_DOC_ID,
    title: "Demo document",
    items: [
      createDefaultItem("frame", 0, [
        defaultHotspot({ type: "next-camera" }, "Continue"),
        revealOnStep(1, "Reveal at step 1"),
      ]),
    ],
    updatedAt: now,
    schemaVersion: 3,
  };
}
