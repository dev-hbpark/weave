// WI-056 — bridge between the design-system ColorPicker's canonical string
// emit and agocraft's structured `PaintSpec`.
//
// The ColorPicker speaks ONE string for both modes:
//   • solid    → `#rrggbb` / `#rrggbbaa` / `var(--token)`
//   • gradient → `linear-gradient(<deg>deg, #rrggbbaa <pct>%, …)`
//
// agocraft's `paintToCss(spec)` already does spec → string (used on read).
// This module supplies the REVERSE for the gradient case (string → spec) so a
// gradient the user builds in the picker is stored as a real
// `{ type: "linear-gradient", angle, stops }` PaintSpec instead of being
// flattened to solid. The grammar mirrors `ColorPicker.parseLinearGradient`
// exactly (hex stops only) so the round-trip is lossless.

import type { GradientStop, PaintSpec } from "@agocraft/core";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Parse the ColorPicker's canonical `linear-gradient(<n>deg, <hex> <p>%, …)`
 *  emit into a linear-gradient `PaintSpec`. Returns `null` when `value` is not
 *  a well-formed linear-gradient string (solid hex / `var(--token)` → the
 *  caller keeps its solid path). Requires ≥ 2 hex stops, matching the picker. */
export function parseLinearGradientPaint(value: string): PaintSpec | null {
  const m = value.trim().match(/^linear-gradient\(\s*(-?\d+(?:\.\d+)?)deg\s*,\s*(.+?)\s*\)\s*$/i);
  if (!m?.[1] || !m[2]) return null;
  const angle = ((Number.parseFloat(m[1]) % 360) + 360) % 360;
  const parts = m[2].split(/\s*,\s*/);
  const stops: GradientStop[] = [];
  for (const p of parts) {
    const sm = p.match(/^(#[0-9a-f]{3,8})\s+(-?\d+(?:\.\d+)?)%$/i);
    if (!sm?.[1] || sm[2] === undefined) return null;
    stops.push({ color: sm[1], offset: clamp(Number.parseFloat(sm[2]) / 100, 0, 1) });
  }
  if (stops.length < 2) return null;
  return { type: "linear-gradient", angle, stops };
}

/** True when a ColorPicker emit is a linear-gradient string (vs solid/token). */
export function isGradientEmit(value: string): boolean {
  return /^\s*linear-gradient\(/i.test(value);
}
