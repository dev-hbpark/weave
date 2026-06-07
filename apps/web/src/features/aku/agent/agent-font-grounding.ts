// 아쿠 (Aku) — agent font-size grounding (px target → responsive ratio).
//
// PROBLEM (root cause analysis): the renderer makes `fontSizeSpec` authoritative
// and ignores the legacy px `fontSize`; the agent is asked to emit a
// `{ kind:'ratio', value }` whose value = target px ÷ the IMMEDIATE parent
// frame's px height. The model must divide by a height it often doesn't know
// (nested / shared / auto-layout frames), so a px-correct intention becomes a
// wrong ratio — text renders the wrong size even though the px "looks right".
//
// FIX (DR-091, option 1): let the model emit a PX target and let WEAVE do the
// division using the real geometry it already knows. This module is a pure
// input transform applied ONLY on the agent's exec path (round-grouping proxy),
// so the toolbar's explicit px/% choice is untouched. It converts a px-intended
// fontSize on a text add/update into `{ kind:'ratio', value: px ÷ parentPxH }`
// and syncs the legacy `fontSize` mirror to the same px (no more contradiction).
//
// Backward compatible: a legitimate ratio the model still emits (value ≤ 1) is
// left as-is, so existing ratio-emitting behavior keeps working.

import type { Document as AgocraftDocument } from "@agocraft/core";
import { absoluteFrameBox, findItemDeep } from "../../../document/agocraft-mirror.js";

export interface DesignSizePx {
  readonly width: number;
  readonly height: number;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** A px target hidden in a `fontSizeSpec`, or null when the spec is a real ratio
 *  (value ≤ 1) / absent / malformed. `{kind:'px'}` is an explicit px target;
 *  `{kind:'ratio', value>1}` is a px magnitude the model mis-tagged as ratio. */
function pxTargetFromSpec(spec: unknown): number | null {
  if (!isObj(spec)) return null;
  const value = spec.value;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  if (spec.kind === "px") return value;
  if (spec.kind === "ratio" && value > 1) return value;
  return null;
}

/** Px height of the frame `id` itself (root → the full design height). */
function framePxHeight(doc: AgocraftDocument, id: string, design: DesignSizePx): number | null {
  const box = absoluteFrameBox(doc, id, design.width, design.height);
  return box !== null && box.h > 0 ? box.h : null;
}

/** Px height of the frame that DIRECTLY CONTAINS `itemId` — `item.box.h ÷
 *  item.frame.height` (the same identity the renderer's ParentFrameHeightContext
 *  uses). Works at any depth, incl. a root child (→ the design height). */
function parentPxHeightOfItem(
  doc: AgocraftDocument,
  itemId: string,
  design: DesignSizePx,
): number | null {
  const box = absoluteFrameBox(doc, itemId, design.width, design.height);
  const item = findItemDeep(doc, itemId);
  const fh = (item?.attrs as { frame?: { height?: number } } | undefined)?.frame?.height;
  if (box !== null && typeof fh === "number" && fh > 0) return box.h / fh;
  return null;
}

/** Rewrite a text attrs bag so a px-intended fontSize becomes a ratio spec
 *  against `parentPxH`, with the legacy `fontSize` mirror set to the px. Returns
 *  the same reference (no change) when there's nothing to ground. */
function groundTextAttrs(
  attrs: Record<string, unknown>,
  parentPxH: number | null,
): Record<string, unknown> {
  if (parentPxH === null || parentPxH <= 0) return attrs;
  const px = pxTargetFromSpec(attrs.fontSizeSpec);
  if (px === null) return attrs;
  return {
    ...attrs,
    fontSize: px,
    fontSizeSpec: { kind: "ratio", value: px / parentPxH },
  };
}

// Per-command grounding (a small router — each command knows where its text
// attrs live and which frame is the size denominator).
type Grounder = (
  input: Record<string, unknown>,
  doc: AgocraftDocument,
  design: DesignSizePx,
) => Record<string, unknown>;

const GROUNDERS: Record<string, Grounder> = {
  // add: text attrs ride on `attrsOverride`; the denominator is the container.
  "weave.item.add": (input, doc, design) => {
    if (input.kind !== "text" || !isObj(input.attrsOverride)) return input;
    const containerId =
      typeof input.containerId === "string" ? input.containerId : String(doc.root.id);
    const grounded = groundTextAttrs(input.attrsOverride, framePxHeight(doc, containerId, design));
    return grounded === input.attrsOverride ? input : { ...input, attrsOverride: grounded };
  },
  // update: declarative `attrs` only (the UI uses `patch`, never grounded). The
  // denominator is the edited text's current parent.
  "weave.item.update": (input, doc, design) => {
    if (!isObj(input.attrs) || typeof input.itemId !== "string") return input;
    const item = findItemDeep(doc, input.itemId);
    if (item?.kind !== "text") return input;
    const grounded = groundTextAttrs(input.attrs, parentPxHeightOfItem(doc, input.itemId, design));
    return grounded === input.attrs ? input : { ...input, attrs: grounded };
  },
  // NOTE: weave.items.update applies ONE attrs to MANY items that may have
  // different parent heights — a single ratio can't be correct for all — so it
  // is intentionally left to the >1 px-magnitude guard (sanitizeFontSizeSpec).
};

/** Ground a single agent tool call's input. Non-text / non-px-target / unknown
 *  commands pass through untouched. Pure; never throws on shape surprises. */
export function groundAgentFontSize(
  commandName: string,
  input: unknown,
  doc: AgocraftDocument,
  design: DesignSizePx,
): unknown {
  if (!isObj(input)) return input;
  const grounder = GROUNDERS[commandName];
  if (grounder === undefined) return input;
  if (design.width <= 0 || design.height <= 0) return input;
  try {
    return grounder(input, doc, design);
  } catch {
    return input;
  }
}
