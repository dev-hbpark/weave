// Design-diversity metric harness (DR-077 D6).
//
// Turns a set of generated weave designs into a numeric verdict on whether the
// agent's output is CONVERGING (the user's complaint) or genuinely varied. Two
// independent signals, matching the DR:
//
//   • color diversity — pairwise CIEDE2000 (ΔE00) between each design's dominant
//     background/title color. Low mean ΔE = "every design is the same palette".
//   • layout entropy — Shannon entropy over a categorical layout signature
//     (alignment · density · item-count · decor strategy). Low entropy = "every
//     design has the same structure".
//
// This runs OFFLINE on collected outputs (the full agent turn is server-sampled,
// so it can't be a deterministic CI gate — it's a periodic measurement, DR-077
// D6). The signature extractor is duck-typed against the serialized document
// JSON (kind / attrs / units / children), so it works on raw agent output
// without constructing @agocraft/core instances. Pure & unit-tested.

import { colorDeltaE, parseColor } from "./color-metrics.js";

// ── Structural input (a subset of the agocraft Document/Item JSON) ────────────
export interface SigUnit {
  readonly kind: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
}
export interface SigItem {
  readonly kind: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly units?: ReadonlyArray<SigUnit>;
  readonly children?: ReadonlyArray<SigItem>;
}
export interface SigDocument {
  readonly root: SigItem;
  readonly attrs?: Readonly<Record<string, unknown>>;
}

interface Frame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One design reduced to its diversity-relevant features. */
export interface DesignSignature {
  /** Every concrete-or-token color string found, in traversal order. */
  readonly colors: ReadonlyArray<string>;
  /** The dominant background color (full-bleed fill / doc background), or null. */
  readonly bgColor: string | null;
  /** Categorical layout key — designs with the same structure share this. */
  readonly layoutKey: string;
}

const FILL_UNIT = "decoration.fill";
const STROKE_UNIT = "decoration.stroke";

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Pull color strings out of a PaintSpec-shaped value (solid / gradient). */
function paintColors(paint: unknown): string[] {
  if (paint === null || typeof paint !== "object") return [];
  const p = paint as Record<string, unknown>;
  const out: string[] = [];
  const solid = asString(p.color);
  if (solid !== undefined) out.push(solid);
  if (Array.isArray(p.stops)) {
    for (const stop of p.stops) {
      const c = asString((stop as Record<string, unknown>)?.color);
      if (c !== undefined) out.push(c);
    }
  }
  return out;
}

/** All colors an item declares (text/qr/chart attrs + fill/stroke units). */
function itemColors(item: SigItem): string[] {
  const a = item.attrs ?? {};
  const out: string[] = [];
  if (item.kind === "text") {
    const c = asString(a.color);
    if (c !== undefined) out.push(c);
    const bg = asString(a.background);
    if (bg !== undefined) out.push(bg);
  }
  if (item.kind === "qr") {
    out.push(...paintColors(a.foreground), ...paintColors(a.background));
  }
  if (item.kind === "chart" && Array.isArray(a.palette)) {
    for (const c of a.palette) {
      const s = asString(c);
      if (s !== undefined) out.push(s);
    }
  }
  for (const u of item.units ?? []) {
    if (u.kind === FILL_UNIT) out.push(...paintColors(u.attrs));
    if (u.kind === STROKE_UNIT)
      out.push(...paintColors((u.attrs as Record<string, unknown>)?.paint));
  }
  return out;
}

function frameOf(item: SigItem): Frame | null {
  const f = item.attrs?.frame;
  if (f === null || typeof f !== "object") return null;
  const r = f as Record<string, unknown>;
  if (
    typeof r.x === "number" &&
    typeof r.y === "number" &&
    typeof r.width === "number" &&
    typeof r.height === "number"
  ) {
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  return null;
}

const isFullBleed = (f: Frame): boolean =>
  f.x <= 0.02 && f.y <= 0.02 && f.width >= 0.96 && f.height >= 0.96;

interface WalkAcc {
  readonly colors: string[];
  readonly frames: Frame[];
  bg: { color: string; area: number } | null;
  hasGradient: boolean;
  fullBleedFills: number;
}

function walk(item: SigItem, acc: WalkAcc, depth: number): void {
  const colors = itemColors(item);
  acc.colors.push(...colors);
  const frame = frameOf(item);
  if (frame !== null && depth > 0) acc.frames.push(frame);

  // Background candidate: a full-bleed fill. Prefer the larger area; the root
  // frame's fill usually wins. depth 0 (root) is eligible too.
  for (const u of item.units ?? []) {
    if (u.kind !== FILL_UNIT) continue;
    const paint = (u.attrs ?? {}) as Record<string, unknown>;
    if (typeof paint.type === "string" && paint.type.endsWith("gradient")) acc.hasGradient = true;
    const f = frame ?? (depth === 0 ? { x: 0, y: 0, width: 1, height: 1 } : null);
    if (f !== null && isFullBleed(f)) {
      acc.fullBleedFills += 1;
      const c = paintColors(paint)[0];
      if (c !== undefined) {
        const area = f.width * f.height;
        if (acc.bg === null || area >= acc.bg.area) acc.bg = { color: c, area };
      }
    }
  }
  for (const child of item.children ?? []) walk(child, acc, depth + 1);
}

function alignBucket(frames: ReadonlyArray<Frame>): string {
  if (frames.length === 0) return "none";
  const meanCx = frames.reduce((s, f) => s + (f.x + f.width / 2), 0) / frames.length;
  if (meanCx < 0.42) return "left";
  if (meanCx > 0.58) return "right";
  return "center";
}

function densityBucket(frames: ReadonlyArray<Frame>): string {
  const coverage = frames.reduce((s, f) => s + f.width * f.height, 0);
  if (coverage < 0.6) return "airy";
  if (coverage < 1.4) return "medium";
  return "dense";
}

function countBucket(n: number): string {
  if (n <= 3) return "few";
  if (n <= 8) return "some";
  return "many";
}

function decorBucket(acc: WalkAcc): string {
  if (acc.hasGradient) return "gradient";
  // A full-bleed fill that ISN'T just the single background = a color block.
  if (acc.fullBleedFills > 1) return "colorblock";
  return "flat";
}

/** Reduce a generated design document to its diversity signature. `bgHint` is the
 *  view-model background (use-aku-agent's `design.background`) used when the
 *  document declares no full-bleed fill. */
export function documentToSignature(doc: SigDocument, bgHint?: string): DesignSignature {
  const acc: WalkAcc = {
    colors: [],
    frames: [],
    bg: null,
    hasGradient: false,
    fullBleedFills: 0,
  };
  walk(doc.root, acc, 0);
  const bgColor =
    acc.bg?.color ?? asString(doc.attrs?.background) ?? (bgHint !== undefined ? bgHint : null);
  const layoutKey = [
    alignBucket(acc.frames),
    densityBucket(acc.frames),
    countBucket(acc.frames.length),
    decorBucket(acc),
  ].join("|");
  return { colors: acc.colors, bgColor, layoutKey };
}

// ── Aggregate report across N designs ─────────────────────────────────────────
export interface DiversityThresholds {
  /** Below this mean ΔE00, the palette is "converged". */
  readonly minMeanDeltaE: number;
  /** Below this layout entropy (bits), the structure is "converged". */
  readonly minLayoutEntropyBits: number;
}

export const DEFAULT_THRESHOLDS: DiversityThresholds = {
  minMeanDeltaE: 8,
  minLayoutEntropyBits: 1,
};

export interface DiversityReport {
  readonly n: number;
  /** Designs whose representative background color was resolvable for ΔE. */
  readonly colorSamples: number;
  readonly meanDeltaE: number;
  readonly minDeltaE: number;
  readonly layoutEntropyBits: number;
  readonly distinctLayouts: number;
  /** True when palette OR layout is below its threshold — i.e., converging. */
  readonly converged: boolean;
}

function shannonBits(keys: ReadonlyArray<string>): number {
  if (keys.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / keys.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Score a batch of design signatures. Color diversity = mean/min pairwise ΔE00
 *  over designs with a resolvable background color; layout diversity = Shannon
 *  entropy over the layout keys. `converged` flags either signal below threshold. */
export function diversityReport(
  signatures: ReadonlyArray<DesignSignature>,
  thresholds: DiversityThresholds = DEFAULT_THRESHOLDS,
): DiversityReport {
  const n = signatures.length;
  const bgColors = signatures
    .map((s) => s.bgColor)
    .filter((c): c is string => c !== null && parseColor(c) !== null);

  const deltas: number[] = [];
  for (let i = 0; i < bgColors.length; i += 1) {
    for (let j = i + 1; j < bgColors.length; j += 1) {
      const d = colorDeltaE(bgColors[i]!, bgColors[j]!);
      if (d !== null) deltas.push(d);
    }
  }
  const meanDeltaE = deltas.length > 0 ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
  const minDeltaE = deltas.length > 0 ? Math.min(...deltas) : 0;

  const layoutKeys = signatures.map((s) => s.layoutKey);
  const layoutEntropyBits = shannonBits(layoutKeys);
  const distinctLayouts = new Set(layoutKeys).size;

  // Only judge color convergence when there are enough resolvable pairs to mean
  // anything; otherwise lean on layout entropy alone.
  const colorConverged = deltas.length >= 1 && meanDeltaE < thresholds.minMeanDeltaE;
  const layoutConverged = n >= 2 && layoutEntropyBits < thresholds.minLayoutEntropyBits;

  return {
    n,
    colorSamples: bgColors.length,
    meanDeltaE,
    minDeltaE,
    layoutEntropyBits,
    distinctLayouts,
    converged: colorConverged || layoutConverged,
  };
}
