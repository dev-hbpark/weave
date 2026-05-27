// HoverDescriber — pure (hoverKind, state) → simple { text, kbd? } tooltip
// content for every canvas reactive surface.
//
// Replaces the older rich `{ context, actions[] }` shape.  The new contract
// matches `UnifiedTooltipData` exactly so a host bridge can write the
// resolved tip directly onto a `data-tip` attribute and the single
// UnifiedTooltip surface picks it up via its dataset scan.
//
// Adapters are looked up by `hoverKind` (CODE_STRUCTURE_DESIGN_RULES Rule 6 —
// no inline switch in business logic).  Each adapter is pure: given the same
// inputs it returns the same output, so callers can memoise against
// (kind, id, mode, …) keys without surprises.

import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import type { AITooltipHotkeyTable } from "@weave/design-system";
import { findItemDeep } from "../agocraft-mirror.js";
import type { InsertableRegistry } from "../insertable/types.js";
import type { HoverContext, HoverKind } from "../interactions/use-hover-context.js";
import type { InteractionMode } from "../interactions/interaction-mode.js";

export interface HoverDescribeContext {
  readonly hover: HoverContext;
  readonly mode: InteractionMode;
  readonly selectedIds: ReadonlySet<string>;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly doc: AgocraftDocument;
  readonly hotkeyTable: AITooltipHotkeyTable;
  /** InsertableCapability registry — describer queries this for any
   *  surface that doubles as a drop target (today: design root background;
   *  future: frame-as-container, group, …).  Single source of truth for
   *  add-drag policy so the tooltip text + the actual gesture gate
   *  (FrameStage's RubberBandLayer) stay in sync automatically as new
   *  containers register. */
  readonly insertable: InsertableRegistry;
}

export interface HoverDescription {
  readonly text: string;
  readonly kbd?: string;
}

type Describer = (ctx: HoverDescribeContext) => HoverDescription | null;

// Shared idle-vs-busy filter.  Tooltip chrome competing with an active
// gesture is the #1 cause of "flicker" users report.  Hand + text-editing
// are user-driven steady states; idle is the default.  Everything else
// stays silent.
const TOOLTIP_VISIBLE_MODES: ReadonlySet<InteractionMode> = new Set<InteractionMode>([
  "idle",
  "hand",
  "text-editing",
]);

export function isTooltipModeVisible(mode: InteractionMode): boolean {
  return TOOLTIP_VISIBLE_MODES.has(mode);
}

// --- helpers ---------------------------------------------------------------

function lookupItem(doc: AgocraftDocument, id: string | undefined): AgocraftItem | undefined {
  if (id === undefined) return undefined;
  return findItemDeep(doc, id);
}

function itemLabel(item: AgocraftItem): string {
  const attrs = item.attrs as {
    title?: string;
    caption?: string;
    heading?: string;
    summary?: string;
  };
  return attrs.title ?? attrs.caption ?? attrs.heading ?? attrs.summary ?? item.kind;
}

function hk(table: AITooltipHotkeyTable, id: string): string | undefined {
  return table[id]?.keys;
}

// --- adapters --------------------------------------------------------------

function withKbd(text: string, kbd: string | undefined): HoverDescription {
  return kbd !== undefined ? { text, kbd } : { text };
}

/** Render the cursor tooltip for the canvas background by reading the
 *  InsertableCapability of the "design" container.  This is the SSOT path:
 *  whatever the capability declares (modifier, hint, kinds) is what the
 *  user sees, no parallel string to maintain.  Falls back to a generic
 *  add-hint when no design capability is registered. */
const describeBackground: Describer = ({ mode, insertable, canUndo, canRedo }) => {
  if (!isTooltipModeVisible(mode)) return null;
  if (mode === "hand") {
    return { text: "캔버스 이동 — 끌어서 화면 이동", kbd: "V로 선택" };
  }
  const cap = insertable.get("design");
  if (cap === undefined) return { text: "빈 영역" };
  const hint = cap.describeHover?.({ containerId: "design", canUndo, canRedo });
  // Modifier is always derived from the capability's policy, never typed
  // by hand — adding a new container with `requireAltKey: true` lights up
  // the kbd chip automatically.
  const kbd = cap.requireAltKey === true ? "⌥ + 드래그" : "드래그";
  return { text: hint?.title ?? "빈 영역 — 아이템 추가", kbd };
};

const describeFrame: Describer = ({ hover, mode, selectedIds, doc, hotkeyTable }) => {
  if (!isTooltipModeVisible(mode)) return null;
  const item = lookupItem(doc, hover.hoveredId);
  const label = item ? itemLabel(item) : "프레임";
  const selected = hover.hoveredId !== undefined && selectedIds.has(hover.hoveredId);
  if (selected) return withKbd(`${label} — 끌어서 이동`, hk(hotkeyTable, "frame.delete"));
  return { text: `${label} — 클릭으로 선택` };
};

const describeImage: Describer = ({ hover, mode, selectedIds, doc, hotkeyTable }) => {
  if (!isTooltipModeVisible(mode)) return null;
  const item = lookupItem(doc, hover.hoveredId);
  const label = item ? `이미지 · ${itemLabel(item)}` : "이미지";
  const selected = hover.hoveredId !== undefined && selectedIds.has(hover.hoveredId);
  if (selected) return withKbd(`${label} — 소스 교체`, hk(hotkeyTable, "image.replaceSrc"));
  return { text: `${label} — 클릭으로 선택` };
};

const describeVideo: Describer = ({ hover, mode, selectedIds, doc, hotkeyTable }) => {
  if (!isTooltipModeVisible(mode)) return null;
  const item = lookupItem(doc, hover.hoveredId);
  const label = item ? `비디오 · ${itemLabel(item)}` : "비디오";
  const selected = hover.hoveredId !== undefined && selectedIds.has(hover.hoveredId);
  if (selected) return withKbd(`${label} — 소스 교체`, hk(hotkeyTable, "video.replaceSrc"));
  return { text: `${label} — 클릭으로 선택` };
};

const describeShape: Describer = ({ mode, selectedIds, hover, hotkeyTable }) => {
  if (!isTooltipModeVisible(mode)) return null;
  const selected = hover.hoveredId !== undefined && selectedIds.has(hover.hoveredId);
  if (selected) return withKbd("도형 — 핸들로 크기 조정", hk(hotkeyTable, "frame.delete"));
  return { text: "도형 — 클릭으로 선택" };
};

const describeText: Describer = ({ mode, selectedIds, hover }) => {
  if (mode === "text-editing") {
    return { text: "텍스트 편집 중 — Esc 로 종료", kbd: "⌘ B / I / U" };
  }
  if (!isTooltipModeVisible(mode)) return null;
  const selected = hover.hoveredId !== undefined && selectedIds.has(hover.hoveredId);
  if (selected) return { text: "텍스트 — 더블클릭으로 편집" };
  return { text: "텍스트 — 클릭으로 선택, 더블클릭으로 편집" };
};

const describeHandle: Describer = ({ mode, hover }) => {
  if (!isTooltipModeVisible(mode) && mode !== "frame-manipulating") return null;
  const role = hover.hoveredRole ?? "edge";
  if (role === "rotation") return { text: "끌어서 회전", kbd: "Shift 로 15° 스냅" };
  return { text: `크기 조정 (${role})`, kbd: "Shift 로 비율 유지" };
};

const describeHotspot: Describer = ({ mode }) => {
  if (!isTooltipModeVisible(mode)) return null;
  return { text: "핫스팟 — 클릭으로 편집" };
};

// --- registry --------------------------------------------------------------

const REGISTRY: Readonly<Record<HoverKind, Describer | undefined>> = {
  none: undefined,
  background: describeBackground,
  frame: describeFrame,
  image: describeImage,
  video: describeVideo,
  shape: describeShape,
  text: describeText,
  handle: describeHandle,
  hotspot: describeHotspot,
};

export function describeHover(ctx: HoverDescribeContext): HoverDescription | null {
  const adapter = REGISTRY[ctx.hover.hoveredKind];
  if (adapter === undefined) return null;
  return adapter(ctx);
}
