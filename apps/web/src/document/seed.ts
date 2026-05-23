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
    slide: {
      frame: FULL_FRAME,
      title: "New slide",
      bullets: ["Headline point", "Supporting detail", "Closing thought"],
    },
    "canvas-design": {
      frame: FULL_FRAME,
      summary: "Free canvas — drop shapes, images, sticky notes here.",
      // x/y/width/height in 0..1 ratio of the canvas item's frame. Rotation in radians.
      shapes: [
        {
          id: nextId("shape"),
          x: 0.18,
          y: 0.24,
          width: 0.18,
          height: 0.18,
          rotation: 0,
          hue: "var(--domain-canvas-accent)",
        },
        {
          id: nextId("shape"),
          x: 0.5,
          y: 0.5,
          width: 0.22,
          height: 0.22,
          rotation: 0,
          hue: "var(--domain-slide-accent)",
        },
        {
          id: nextId("shape"),
          x: 0.76,
          y: 0.1,
          width: 0.12,
          height: 0.12,
          rotation: 0,
          hue: "var(--domain-media-accent)",
        },
      ],
    },
    "block-doc": {
      frame: FULL_FRAME,
      heading: "Untitled section",
      paragraphs: [
        "Block-doc captures the narrative — context, decisions, summary.",
        "It lives next to the slides and canvases that visualize the same story.",
      ],
    },
    media: {
      frame: FULL_FRAME,
      caption: "Untitled media",
      tone: "image",
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
  // Two items get a hotspot so the demo shows both A (camera nav) and B (hotspot click).
  return {
    id: DEMO_DOC_ID,
    title: "Demo: one doc, four worlds",
    items: [
      createDefaultItem("slide", 0, [
        defaultHotspot({ type: "next-camera" }, "Continue to the canvas"),
      ]),
      createDefaultItem("block-doc", 1),
      // The canvas reveals only after step 2 — Phase 2 demo of the reveal-on-step
      // adapter. Audience sees the doc narrative first, then the canvas appears.
      createDefaultItem("canvas-design", 2, [
        defaultHotspot({ type: "next-camera" }, "Continue to media"),
        revealOnStep(2, "Reveal canvas at step 2"),
      ]),
      createDefaultItem("media", 3, [revealOnStep(3, "Reveal media at step 3")]),
    ],
    updatedAt: now,
    schemaVersion: 3,
  };
}
