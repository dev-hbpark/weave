// WI-020 Phase 1 (revised) — ColorPicker primitive.
//
// Two modes, switched via a tab at the top of the popover:
//
//   • Solid      — one color, emitted as `#rrggbb` (or `#rrggbbaa` when α<1).
//   • Gradient   — angle + ordered stops, emitted as a canonical
//                  `linear-gradient(<n>deg, #rrggbbaa <p>%, …)` string.
//
// Both modes share the same lower-half editor (SV pad / Hue / Alpha / Hex /
// R-G-B numerics / EyeDropper / preset row). In gradient mode the editor
// targets *the currently selected stop's color*. Selecting a different
// stop syncs the HSV state from that stop's hex.
//
// Internal color state is HSV — visual pickers map naturally onto HSV, and
// the hue is preserved across saturation=0 so dragging the SV pad to
// "white" and back doesn't lose the user's previous hue. RGB / hex are
// derived.
//
// EyeDropper button is only mounted when `window.EyeDropper` exists
// (Chromium 95+, Edge 95+ — Safari / Firefox don't ship the API).
//
// onValueChange fires on every transient interaction; onValueCommit fires
// when the user finishes a gesture or closes the popover.

import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
  type CSSProperties,
  forwardRef,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "../cn.js";

// ─── EyeDropper API typing (Chromium-only) ──────────────────────────────
interface ColorSelectionResult {
  readonly sRGBHex: string;
}
interface EyeDropperOpenOptions {
  readonly signal?: AbortSignal;
}
interface EyeDropperLike {
  open(options?: EyeDropperOpenOptions): Promise<ColorSelectionResult>;
}
type EyeDropperCtor = new () => EyeDropperLike;
function hasEyeDropper(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper === "function"
  );
}

/** Theme color reference exposed in the picker's theme swatch row.
 *
 *  Selecting one emits a `var(<varName>)` literal as the picker's value —
 *  CSS resolves it against the active `[data-theme]` so the chosen color
 *  follows theme switches automatically. Hosts that wire agocraft's
 *  `style.provider` Unit can additionally translate the var name into a
 *  token reference at command-dispatch time (see weave's WI-040). */
export interface ThemeColorRef {
  readonly label: string;
  /** CSS custom property name including the leading `--`. */
  readonly varName: string;
}

export interface ColorPickerProps {
  /** CSS color string (`#rrggbb` / `#rrggbbaa`, `rgb()`, `rgba()`) OR a
   *  canonical `linear-gradient(<n>deg, ...)` string OR a `var(--token)`
   *  CSS custom-property reference (theme-aware). */
  readonly value: string;
  readonly onValueChange: (next: string) => void;
  readonly onValueCommit?: (next: string) => void;
  readonly presets?: ReadonlyArray<string>;
  /** Theme color swatches — shown above the static preset row. Click emits
   *  a `var(--<varName>)` literal so CSS handles theme resolution. Pass
   *  `[]` to hide the theme row entirely. */
  readonly themeColors?: ReadonlyArray<ThemeColorRef>;
  readonly "aria-label"?: string;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
}

const DEFAULT_PRESETS: ReadonlyArray<string> = [
  "#000000",
  "#475569",
  "#94a3b8",
  "#e5e7eb",
  "#ffffff",
  "#0f172a",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#0ea5e9",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#f43f5e",
  "#14b8a6",
  "#3b82f6",
  "#84cc16",
];

/** Default theme color row — mirrors the design-system's published tokens
 *  (tokens.css). Hosts that maintain a richer style-token registry (e.g.,
 *  weave's agocraft style.provider Unit) may pass their own `themeColors`
 *  prop with token-aware labels and varNames. */
const DEFAULT_THEME_COLORS: ReadonlyArray<ThemeColorRef> = [
  { label: "Accent", varName: "--accent" },
  { label: "Accent Strong", varName: "--accent-strong" },
  { label: "Accent Soft", varName: "--accent-soft" },
  { label: "Slide", varName: "--domain-slide-accent" },
  { label: "Canvas", varName: "--domain-canvas-accent" },
  { label: "Block", varName: "--domain-block-accent" },
  { label: "Media", varName: "--domain-media-accent" },
  { label: "Text Strong", varName: "--text-strong" },
  { label: "Text", varName: "--text-default" },
  { label: "Text Soft", varName: "--text-soft" },
  { label: "Text Muted", varName: "--text-muted" },
  { label: "Surface 1", varName: "--surface-1" },
  { label: "Surface 2", varName: "--surface-2" },
  { label: "Page Bg", varName: "--bg-page" },
  { label: "Page Bg Soft", varName: "--bg-page-soft" },
];

/** Resolve a CSS custom-property name to its current computed color.
 *
 *  Several tokens (`--text-*`, `--surface-*`, …) are overridden inside
 *  `[data-canvas="document"]` to flip dark-ink ↔ light-ink based on the
 *  user's canvas background. The picker lives in the toolbar (outside
 *  that scope), so reading from `documentElement` here would surface the
 *  *chrome's* resolution — the white-on-dark variant — which doesn't
 *  match what the canvas actually paints with the same `var(--*)`. Prefer
 *  the canvas element when present so the picker's swatch + HSV state
 *  reflect the on-canvas color. Falls back to `documentElement` when no
 *  canvas is mounted (standalone embeds, tests). */
function resolveCssVarColor(varName: string): string | null {
  if (typeof window === "undefined") return null;
  const canvas = document.querySelector('[data-canvas="document"]');
  const el: Element = canvas ?? document.documentElement;
  const v = getComputedStyle(el).getPropertyValue(varName).trim();
  return v === "" ? null : v;
}

/** Match the `var(--<name>)` form used as the picker's theme-swatch emit. */
function extractVarName(str: string): string | null {
  const m = str.trim().match(/^var\(\s*(--[a-z0-9_-]+)\s*\)$/i);
  return m?.[1] ?? null;
}

/** Compute the swatch background a render uses for `value`. Concrete CSS
 *  strings (`#hex` / `rgb()` / `linear-gradient(...)`) pass through, but
 *  bare `var(--*)` references get resolved against the canvas context so
 *  the trigger / preview swatch matches what the user sees on canvas
 *  rather than what the chrome scope would compute. Returns the input
 *  verbatim when the var can't be resolved so CSS at least gets a chance
 *  to render the variable's "default" fallback. */
function displayBgFor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const varName = extractVarName(value);
  if (varName === null) return value;
  const resolved = resolveCssVarColor(varName);
  return resolved ?? value;
}

// ─── Color math ─────────────────────────────────────────────────────────

interface RGBA {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}
interface HSVA {
  readonly h: number;
  readonly s: number;
  readonly v: number;
  readonly a: number;
}
const DEFAULT_RGBA: RGBA = { r: 0, g: 0, b: 0, a: 1 };

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function rgbToHsv({ r, g, b, a }: RGBA): HSVA {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / d + 2);
    else h = 60 * ((rn - gn) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max, v: max, a };
}

function hsvToRgb({ h, s, v, a }: HSVA): RGBA {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) {
    rp = c;
    gp = x;
    bp = 0;
  } else if (h < 120) {
    rp = x;
    gp = c;
    bp = 0;
  } else if (h < 180) {
    rp = 0;
    gp = c;
    bp = x;
  } else if (h < 240) {
    rp = 0;
    gp = x;
    bp = c;
  } else if (h < 300) {
    rp = x;
    gp = 0;
    bp = c;
  } else {
    rp = c;
    gp = 0;
    bp = x;
  }
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
    a,
  };
}

function rgbToHex({ r, g, b, a }: RGBA): string {
  const to = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  const base = `#${to(r)}${to(g)}${to(b)}`;
  if (a >= 1) return base;
  const ah = clamp(Math.round(a * 255), 0, 255)
    .toString(16)
    .padStart(2, "0");
  return `${base}${ah}`;
}

function parseColor(str: unknown): RGBA | null {
  // Defensive — callers occasionally pass `undefined` (no attr set) or a
  // `StyleRef` object whose type cast lied about being a string. Returning
  // `null` lets the caller fall back to the default RGBA cleanly instead
  // of throwing on `.trim()`.
  if (typeof str !== "string") return null;
  const s = str.trim();
  // `var(--*)` — theme swatch emit. Resolve to the current theme's computed
  // value and re-parse so the SV pad / hex display reflect the live color.
  const varName = extractVarName(s);
  if (varName !== null) {
    const resolved = resolveCssVarColor(varName);
    return resolved !== null ? parseColor(resolved) : null;
  }
  const hex = s.match(/^#([0-9a-f]{3,8})$/i);
  if (hex?.[1]) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: Number.parseInt(h.slice(0, 2), 16),
        g: Number.parseInt(h.slice(2, 4), 16),
        b: Number.parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1,
      };
    }
  }
  const rgb = s.match(
    /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i,
  );
  if (rgb?.[1] && rgb[2] && rgb[3]) {
    return {
      r: Number.parseFloat(rgb[1]),
      g: Number.parseFloat(rgb[2]),
      b: Number.parseFloat(rgb[3]),
      a: rgb[4] !== undefined ? Number.parseFloat(rgb[4]) : 1,
    };
  }
  return null;
}

// ─── Gradient parsing / serialization ───────────────────────────────────

interface GradientStop {
  /** Stable identity for React reconciliation across drag / reorder.
   *  Not serialized — generated fresh on parse + each new stop. */
  readonly id: string;
  readonly color: string /* hex */;
  readonly pos: number /* 0..1 */;
}
interface Gradient {
  readonly angle: number /* deg, 0..360 */;
  readonly stops: ReadonlyArray<GradientStop>;
}

let stopIdCounter = 0;
function newStopId(): string {
  stopIdCounter += 1;
  return `s${stopIdCounter}`;
}

function parseLinearGradient(str: string): Gradient | null {
  const m = str.trim().match(/^linear-gradient\(\s*(-?\d+(?:\.\d+)?)deg\s*,\s*(.+?)\s*\)\s*$/i);
  if (!m?.[1] || !m[2]) return null;
  const angle = ((Number.parseFloat(m[1]) % 360) + 360) % 360;
  // Stops are simple "<hex> <pct>%" — we emit canonical form so this
  // round-trips. Defensive: tolerate missing pct (assigns evenly across
  // remaining stops would complicate, so reject for now).
  const parts = m[2].split(/\s*,\s*/);
  const stops: GradientStop[] = [];
  for (const p of parts) {
    const sm = p.match(/^(#[0-9a-f]{3,8})\s+(-?\d+(?:\.\d+)?)%$/i);
    if (!sm?.[1] || sm[2] === undefined) return null;
    stops.push({
      id: newStopId(),
      color: sm[1],
      pos: clamp(Number.parseFloat(sm[2]) / 100, 0, 1),
    });
  }
  if (stops.length < 2) return null;
  return { angle, stops };
}

function serializeLinearGradient(g: Gradient): string {
  const parts = g.stops.map((s) => `${s.color} ${Math.round(s.pos * 100)}%`);
  return `linear-gradient(${Math.round(g.angle)}deg, ${parts.join(", ")})`;
}

const DEFAULT_GRADIENT: Gradient = {
  angle: 90,
  stops: [
    { id: newStopId(), color: "#000000", pos: 0 },
    { id: newStopId(), color: "#ffffff", pos: 1 },
  ],
};

// ─── Drag helper ────────────────────────────────────────────────────────

// onMove receives `finalize`: false during transient pointerdown/move,
// true on pointerup/cancel. The caller is responsible for committing
// final values when `finalize === true` using the same x/y it just
// received — this avoids the stale-closure bug that arose when commit
// was a separate callback reading captured state. (React batches the
// drag's `setState` calls until the event handler returns, so a
// separate `onCommit` closure would always see pre-drag values.)
function useDrag(
  ref: React.RefObject<HTMLDivElement | null>,
  onMove: (xRatio: number, yRatio: number, finalize: boolean) => void,
) {
  return useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el) return;
      el.setPointerCapture(e.pointerId);
      const update = (ev: PointerEvent | ReactPointerEvent<HTMLDivElement>, finalize: boolean) => {
        const rect = el.getBoundingClientRect();
        const x = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
        const y = clamp((ev.clientY - rect.top) / rect.height, 0, 1);
        onMove(x, y, finalize);
      };
      update(e, false);
      const move = (ev: PointerEvent) => update(ev, false);
      const end = (ev: PointerEvent) => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", end);
        el.removeEventListener("pointercancel", end);
        try {
          el.releasePointerCapture(ev.pointerId);
        } catch {
          /* already released */
        }
        update(ev, true);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
    },
    [ref, onMove],
  );
}

// ─── Component ──────────────────────────────────────────────────────────

type Mode = "solid" | "gradient";

function detectMode(value: string): Mode {
  return /^\s*linear-gradient\(/i.test(value) ? "gradient" : "solid";
}

export const ColorPicker = forwardRef<HTMLButtonElement, ColorPickerProps>(function ColorPicker(
  {
    value,
    onValueChange,
    onValueCommit,
    presets = DEFAULT_PRESETS,
    themeColors = DEFAULT_THEME_COLORS,
    "aria-label": ariaLabel = "Choose color",
    disabled,
    className,
    children,
  },
  ref,
) {
  const [open, setOpen] = useState(false);

  // ── Mode + per-mode state ──
  // The mode is initialized once from the mount-time `value`. After that,
  // external value changes adopt their own mode (effect below, only while
  // closed), and the user can flip the tab freely.
  const [mode, setMode] = useState<Mode>(() => detectMode(value));

  // Solid-mode HSV. Gradient mode also uses these — they reflect the
  // currently selected stop's color so the SV / Hue / Alpha / Hex / RGB
  // editors share one code path across modes.
  const [h, setH] = useState(0);
  const [s, setS] = useState(0);
  const [v, setV] = useState(0);
  const [alpha, setAlpha] = useState(1);
  const [hexText, setHexText] = useState("#000000");

  // Gradient-mode state.
  const [gradient, setGradient] = useState<Gradient>(DEFAULT_GRADIENT);
  const [selectedStopIdx, setSelectedStopIdx] = useState(0);

  // Mount-time initialization — derive from `value`.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only intent
  useEffect(() => {
    const initialMode = detectMode(value);
    if (initialMode === "gradient") {
      const g = parseLinearGradient(value);
      if (g) {
        setGradient(g);
        setSelectedStopIdx(0);
        const rgb = parseColor(g.stops[0]?.color ?? "#000000") ?? DEFAULT_RGBA;
        const hsv = rgbToHsv(rgb);
        setH(hsv.h);
        setS(hsv.s);
        setV(hsv.v);
        setAlpha(hsv.a);
        setHexText(g.stops[0]?.color ?? "#000000");
        return;
      }
    }
    const rgb = parseColor(value) ?? DEFAULT_RGBA;
    const hsv = rgbToHsv(rgb);
    setH(hsv.h);
    setS(hsv.s);
    setV(hsv.v);
    setAlpha(hsv.a);
    setHexText(rgbToHex(rgb));
  }, []);

  // Adopt external `value` changes ONLY while the popover is closed. While
  // open we trust internal state so transient drags survive parent rerenders.
  useEffect(() => {
    if (open) return;
    const nextMode = detectMode(value);
    setMode(nextMode);
    if (nextMode === "gradient") {
      const g = parseLinearGradient(value);
      if (!g) return;
      setGradient(g);
      const idx = clamp(selectedStopIdx, 0, g.stops.length - 1);
      setSelectedStopIdx(idx);
      const rgb = parseColor(g.stops[idx]?.color ?? "#000000") ?? DEFAULT_RGBA;
      const hsv = rgbToHsv(rgb);
      if (hsv.s > 0) setH(hsv.h);
      setS(hsv.s);
      setV(hsv.v);
      setAlpha(hsv.a);
      setHexText(g.stops[idx]?.color ?? "#000000");
      return;
    }
    const rgb = parseColor(value);
    if (!rgb) return;
    const hsv = rgbToHsv(rgb);
    if (hsv.s > 0) setH(hsv.h);
    setS(hsv.s);
    setV(hsv.v);
    setAlpha(hsv.a);
    setHexText(rgbToHex(rgb));
  }, [value, open, selectedStopIdx]);

  // Derived RGB / hex for the live preview.
  const rgb = useMemo(() => hsvToRgb({ h, s, v, a: alpha }), [h, s, v, alpha]);
  const currentHex = useMemo(() => rgbToHex(rgb), [rgb]);
  const hueRgb = useMemo(() => hsvToRgb({ h, s: 1, v: 1, a: 1 }), [h]);
  const hueCss = `rgb(${hueRgb.r}, ${hueRgb.g}, ${hueRgb.b})`;
  const solidCss = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;

  // ── Emit / commit helpers ──
  // emit() = fire onValueChange with whichever mode we're in. In gradient
  // mode the *currently editing* hsv is folded into the selected stop and
  // the result re-serialized. In solid mode hsv is emitted as hex.
  const emit = useCallback(
    (nextHsv: HSVA, nextGradient?: Gradient) => {
      const nextHex = rgbToHex(hsvToRgb(nextHsv));
      setHexText(nextHex);
      if (mode === "solid") {
        onValueChange(nextHex);
        return;
      }
      const g = nextGradient ?? gradient;
      const stops = g.stops.map((stop, i) =>
        i === selectedStopIdx ? { ...stop, color: nextHex } : stop,
      );
      const next: Gradient = { ...g, stops };
      setGradient(next);
      onValueChange(serializeLinearGradient(next));
    },
    [mode, gradient, selectedStopIdx, onValueChange],
  );

  const commit = useCallback(() => {
    if (mode === "solid") {
      onValueCommit?.(rgbToHex(hsvToRgb({ h, s, v, a: alpha })));
    } else {
      onValueCommit?.(serializeLinearGradient(gradient));
    }
  }, [mode, h, s, v, alpha, gradient, onValueCommit]);

  // Explicit-value commit — bypasses stale state closures during pointer
  // drags. React batches `setState` calls inside an event handler until
  // the handler returns, so by the time `pointerup` fires the in-closure
  // `h, s, v, alpha` are still pre-drag values. Drag handlers pass the
  // next HSV they just computed into this helper instead of relying on
  // captured state. (Selecting / clicking outside the drags still uses
  // the `commit` above — those happen across renders so state is fresh.)
  const commitHsv = useCallback(
    (hsv: HSVA) => {
      const hex = rgbToHex(hsvToRgb(hsv));
      if (mode === "solid") {
        onValueCommit?.(hex);
        return;
      }
      const stops = gradient.stops.map((stop, i) =>
        i === selectedStopIdx ? { ...stop, color: hex } : stop,
      );
      onValueCommit?.(serializeLinearGradient({ ...gradient, stops }));
    },
    [mode, gradient, selectedStopIdx, onValueCommit],
  );

  // ── Mode flip ──
  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === "gradient") {
      // Seed gradient with current solid color at 0% and white at 100%
      // (or vice versa if user is on white). Two stops is the minimum
      // gradient; the user can add more.
      const baseHex = rgbToHex(hsvToRgb({ h, s, v, a: alpha }));
      const seeded: Gradient = {
        angle: gradient.angle,
        stops: [
          { id: newStopId(), color: baseHex, pos: 0 },
          {
            id: newStopId(),
            color: baseHex === "#ffffff" ? "#000000" : "#ffffff",
            pos: 1,
          },
        ],
      };
      setGradient(seeded);
      setSelectedStopIdx(0);
      setMode("gradient");
      onValueChange(serializeLinearGradient(seeded));
    } else {
      // Drop gradient; emit currently selected stop's color as the new solid.
      const stop = gradient.stops[selectedStopIdx];
      if (stop) {
        const rgb = parseColor(stop.color) ?? DEFAULT_RGBA;
        const hsv = rgbToHsv(rgb);
        if (hsv.s > 0) setH(hsv.h);
        setS(hsv.s);
        setV(hsv.v);
        setAlpha(hsv.a);
        setHexText(stop.color);
        onValueChange(stop.color);
      }
      setMode("solid");
    }
  };

  // ── Stop selection / mutation (gradient mode) ──
  const selectStop = (idx: number) => {
    setSelectedStopIdx(idx);
    const stop = gradient.stops[idx];
    if (!stop) return;
    const rgb = parseColor(stop.color) ?? DEFAULT_RGBA;
    const hsv = rgbToHsv(rgb);
    if (hsv.s > 0) setH(hsv.h);
    setS(hsv.s);
    setV(hsv.v);
    setAlpha(hsv.a);
    setHexText(stop.color);
  };

  const moveStopTo = (idx: number, pos: number, finalize: boolean) => {
    const next: Gradient = {
      ...gradient,
      stops: gradient.stops.map((stop, i) => (i === idx ? { ...stop, pos } : stop)),
    };
    setGradient(next);
    onValueChange(serializeLinearGradient(next));
    if (finalize) onValueCommit?.(serializeLinearGradient(next));
  };

  const addStopAt = (pos: number) => {
    // Insert a new stop at `pos` with the gradient's interpolated color.
    const sorted = [...gradient.stops].sort((a, b) => a.pos - b.pos);
    let lo: GradientStop | undefined;
    let hi: GradientStop | undefined;
    for (const stop of sorted) {
      if (stop.pos <= pos) lo = stop;
      if (stop.pos >= pos && hi === undefined) hi = stop;
    }
    const seedColor = (() => {
      if (lo && hi && lo !== hi) {
        const t = (pos - lo.pos) / (hi.pos - lo.pos || 1);
        const a = parseColor(lo.color) ?? DEFAULT_RGBA;
        const b = parseColor(hi.color) ?? DEFAULT_RGBA;
        return rgbToHex({
          r: a.r + (b.r - a.r) * t,
          g: a.g + (b.g - a.g) * t,
          b: a.b + (b.b - a.b) * t,
          a: a.a + (b.a - a.a) * t,
        });
      }
      return (lo ?? hi ?? { color: "#ffffff", pos: 0 }).color;
    })();
    const nextStops = [...gradient.stops, { id: newStopId(), color: seedColor, pos }];
    const next: Gradient = { ...gradient, stops: nextStops };
    setGradient(next);
    setSelectedStopIdx(nextStops.length - 1);
    onValueChange(serializeLinearGradient(next));
    onValueCommit?.(serializeLinearGradient(next));
  };

  const removeStop = (idx: number) => {
    if (gradient.stops.length <= 2) return; // keep at least 2
    const nextStops = gradient.stops.filter((_, i) => i !== idx);
    const next: Gradient = { ...gradient, stops: nextStops };
    setGradient(next);
    setSelectedStopIdx(clamp(idx, 0, nextStops.length - 1));
    onValueChange(serializeLinearGradient(next));
    onValueCommit?.(serializeLinearGradient(next));
  };

  const setAngle = (deg: number) => {
    const a = ((deg % 360) + 360) % 360;
    const next: Gradient = { ...gradient, angle: a };
    setGradient(next);
    onValueChange(serializeLinearGradient(next));
  };

  // ── Refs + drag bindings ──
  //
  // Each drag handler computes the next HSV explicitly from the pointer
  // ratio and passes that value to `commitHsv` when finalizing. Reading
  // h / s / v / alpha from the closure is safe for *the axis the user is
  // NOT dragging* (those don't change during this gesture), but the axis
  // being dragged must come from the just-computed value. Avoids the
  // stale-closure bug where pointerup's commit used pre-drag state and
  // produced the wrong color on the first click of a session.
  const svRef = useRef<HTMLDivElement | null>(null);
  const onSvDown = useDrag(svRef, (x, y, finalize) => {
    const ns = x;
    const nv = 1 - y;
    setS(ns);
    setV(nv);
    const nextHsv: HSVA = { h, s: ns, v: nv, a: alpha };
    emit(nextHsv);
    if (finalize) commitHsv(nextHsv);
  });

  const hueRef = useRef<HTMLDivElement | null>(null);
  const onHueDown = useDrag(hueRef, (x, _y, finalize) => {
    const nh = x * 360;
    setH(nh);
    const nextHsv: HSVA = { h: nh, s, v, a: alpha };
    emit(nextHsv);
    if (finalize) commitHsv(nextHsv);
  });

  const alphaRef = useRef<HTMLDivElement | null>(null);
  const onAlphaDown = useDrag(alphaRef, (x, _y, finalize) => {
    const na = x;
    setAlpha(na);
    const nextHsv: HSVA = { h, s, v, a: na };
    emit(nextHsv);
    if (finalize) commitHsv(nextHsv);
  });

  // Stops bar drag — drags the currently-pressed stop. Track the active
  // stop in a ref because useDrag's callback closures are stable.
  const stopsRef = useRef<HTMLDivElement | null>(null);
  const draggingStopRef = useRef<number | null>(null);

  // ── Hex / R-G-B inputs ──
  const handleHexInput = (text: string) => {
    setHexText(text);
    const parsed = parseColor(text);
    if (!parsed) return;
    const hsv = rgbToHsv(parsed);
    if (hsv.s > 0) setH(hsv.h);
    setS(hsv.s);
    setV(hsv.v);
    setAlpha(hsv.a);
    emit(hsv);
  };
  const handleHexCommit = () => {
    const parsed = parseColor(hexText);
    if (!parsed) {
      setHexText(currentHex);
      return;
    }
    // Use the parsed hsv directly — `commit()` would read stale closure
    // values if the typing→blur cadence batched without an intermediate
    // render.
    commitHsv(rgbToHsv(parsed));
  };

  const setChannel = (which: "r" | "g" | "b", raw: number) => {
    const next = clamp(Math.round(raw), 0, 255);
    const nextRgb: RGBA = { ...rgb, [which]: next } as RGBA;
    const hsv = rgbToHsv(nextRgb);
    if (hsv.s > 0) setH(hsv.h);
    setS(hsv.s);
    setV(hsv.v);
    emit({ h: hsv.s > 0 ? hsv.h : h, s: hsv.s, v: hsv.v, a: alpha });
  };
  // onBlur commit for R/G/B inputs — recompute from the input's current
  // value + the other channels' state-derived rgb. Bypasses the same
  // stale-closure pattern by feeding `commitHsv` an explicit hsv.
  const commitChannelFromInput = (which: "r" | "g" | "b", raw: string) => {
    const next = clamp(Math.round(Number.parseInt(raw || "0", 10)), 0, 255);
    const nextRgb: RGBA = { ...rgb, [which]: next } as RGBA;
    commitHsv(rgbToHsv(nextRgb));
  };

  const applyPreset = (p: string) => {
    const parsed = parseColor(p);
    if (!parsed) return;
    const hsv = rgbToHsv(parsed);
    if (hsv.s > 0) setH(hsv.h);
    setS(hsv.s);
    setV(hsv.v);
    setAlpha(hsv.a);
    setHexText(rgbToHex(parsed));
    emit(hsv);
    // Same stale-closure risk as the SV/Hue/Alpha drag callbacks — the
    // setS / setV / etc above are batched and not visible to `commit()`'s
    // closure within this event handler. Use the just-parsed hsv directly.
    commitHsv(hsv);
  };

  // Theme color swatch click — *solid* mode emits the literal `var(--*)`
  // so CSS resolves the color per active theme (host stores the var()
  // string verbatim). Gradient mode falls back to `applyPreset` against
  // the resolved hex because the gradient serializer's stop format is
  // hex-only; the chosen stop loses theme awareness as a trade-off.
  const applyThemeColor = (varName: string) => {
    const cssRef = `var(${varName})`;
    if (mode === "gradient") {
      applyPreset(cssRef);
      return;
    }
    const parsed = parseColor(cssRef);
    if (parsed) {
      const hsv = rgbToHsv(parsed);
      if (hsv.s > 0) setH(hsv.h);
      setS(hsv.s);
      setV(hsv.v);
      setAlpha(hsv.a);
    }
    setHexText(cssRef);
    onValueChange(cssRef);
    onValueCommit?.(cssRef);
  };

  // ── EyeDropper ──
  const [eyeBusy, setEyeBusy] = useState(false);
  const showEye = hasEyeDropper();
  const openEyeDropper = async () => {
    if (!showEye || eyeBusy) return;
    setEyeBusy(true);
    try {
      const Ctor = (window as unknown as { EyeDropper: EyeDropperCtor }).EyeDropper;
      const picker = new Ctor();
      const result = await picker.open();
      applyPreset(result.sRGBHex);
    } catch {
      // User cancelled or browser blocked.
    } finally {
      setEyeBusy(false);
    }
  };

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) commit();
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        {children ?? (
          <button
            ref={ref}
            type="button"
            aria-label={ariaLabel}
            disabled={disabled}
            className={cn(
              "h-6 w-6 rounded-[4px] border",
              "border-[color:var(--border-strong)]",
              "shadow-[0_0_0_1px_rgba(0,0,0,0.4)_inset]",
              "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
              "disabled:opacity-50",
              className,
            )}
            // Resolve `var(--*)` at the canvas context so the chrome-located
            // trigger swatch shows the same color the canvas paints, not the
            // chrome's own data-bg-tone resolution of the same token.
            style={{ background: displayBgFor(value) }}
          />
        )}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            "z-50 w-[268px] p-3",
            "rounded-[var(--radius-md)] border",
            "bg-[color:var(--surface-overlay)] border-[color:var(--surface-overlay-border)]",
            "text-[color:var(--text-overlay)]",
            "shadow-[var(--shadow-overlay)]",
            "backdrop-blur-[var(--surface-blur)]",
            "focus:outline-none",
          )}
        >
          {/* Mode tabs */}
          <div
            className="grid grid-cols-2 gap-1 mb-3 p-0.5 rounded-[6px] bg-[color:var(--surface-overlay-2)] border border-[color:var(--surface-overlay-border)]"
            role="tablist"
            aria-label="Color mode"
          >
            {(["solid", "gradient"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                data-testid={`cp-mode-${m}`}
                className={cn(
                  "text-[11px] font-medium py-1 rounded-[4px] transition-colors",
                  mode === m
                    ? "bg-[color:var(--surface-overlay)] text-[color:var(--text-overlay)] shadow-[0_0_0_1px_var(--surface-overlay-border)]"
                    : "text-[color:var(--text-overlay-soft)] hover:text-[color:var(--text-overlay)]",
                )}
              >
                {m === "solid" ? "단색" : "그라데이션"}
              </button>
            ))}
          </div>

          {/* Gradient-only: stops bar + angle */}
          {mode === "gradient" ? (
            <>
              <div
                ref={stopsRef}
                data-testid="cp-stops-bar"
                onPointerDown={(e) => {
                  // If pointer lands on a stop dot we let that dot handle
                  // its own pointerdown (added below). For empty bar
                  // pressing, add a new stop at the click position.
                  if (e.target instanceof HTMLElement && e.target.dataset.stopIndex !== undefined) {
                    return;
                  }
                  const el = stopsRef.current;
                  if (!el) return;
                  const rect = el.getBoundingClientRect();
                  const pos = clamp((e.clientX - rect.left) / rect.width, 0, 1);
                  addStopAt(pos);
                }}
                className="relative h-7 rounded-[6px] overflow-visible touch-none select-none cursor-copy border border-[color:var(--surface-overlay-border)]"
                style={
                  {
                    backgroundImage: `
                      linear-gradient(to right, ${gradient.stops
                        .slice()
                        .sort((a, b) => a.pos - b.pos)
                        .map((stop) => `${stop.color} ${Math.round(stop.pos * 100)}%`)
                        .join(", ")}),
                      conic-gradient(#3a3a40 0% 25%, #555 25% 50%, #3a3a40 50% 75%, #555 75% 100%)
                    `,
                    backgroundSize: "100% 100%, 8px 8px",
                  } as CSSProperties
                }
              >
                {gradient.stops.map((stop, idx) => (
                  <button
                    key={stop.id}
                    type="button"
                    data-stop-index={idx}
                    data-testid={`cp-stop-${idx}`}
                    aria-label={`Stop ${idx + 1}: ${stop.color} at ${Math.round(stop.pos * 100)}%`}
                    aria-pressed={idx === selectedStopIdx}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const el = stopsRef.current;
                      if (!el) return;
                      draggingStopRef.current = idx;
                      selectStop(idx);
                      const target = e.currentTarget;
                      target.setPointerCapture(e.pointerId);
                      const move = (ev: PointerEvent) => {
                        const rect = el.getBoundingClientRect();
                        const pos = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
                        moveStopTo(idx, pos, false);
                      };
                      const end = (ev: PointerEvent) => {
                        target.removeEventListener("pointermove", move);
                        target.removeEventListener("pointerup", end);
                        target.removeEventListener("pointercancel", end);
                        try {
                          target.releasePointerCapture(ev.pointerId);
                        } catch {
                          /* released */
                        }
                        const rect = el.getBoundingClientRect();
                        const pos = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
                        moveStopTo(idx, pos, true);
                        draggingStopRef.current = null;
                      };
                      target.addEventListener("pointermove", move);
                      target.addEventListener("pointerup", end);
                      target.addEventListener("pointercancel", end);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      removeStop(idx);
                    }}
                    className={cn(
                      "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full",
                      "border-2 cursor-grab active:cursor-grabbing",
                      "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
                      idx === selectedStopIdx
                        ? "border-[color:var(--accent)] ring-2 ring-[color:var(--accent-soft)]"
                        : "border-white",
                    )}
                    style={{
                      left: `${stop.pos * 100}%`,
                      background: stop.color,
                      boxShadow: "0 0 0 1px rgba(0,0,0,0.7), 0 1px 3px rgba(0,0,0,0.4)",
                    }}
                    title={`${stop.color} · ${Math.round(stop.pos * 100)}% (더블클릭으로 삭제)`}
                  />
                ))}
              </div>
              {/* Angle row */}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-[color:var(--text-overlay-soft)]">
                  angle
                </span>
                <input
                  type="range"
                  min={0}
                  max={360}
                  step={1}
                  value={gradient.angle}
                  onChange={(e) => setAngle(Number.parseFloat(e.target.value))}
                  // Commit using the input's *current* value, not the
                  // closure-bound `gradientCss` — at pointerup the closure
                  // still reflects the pre-drag render so `gradientCss`
                  // would emit a stale angle.
                  onPointerUp={(e) => {
                    const deg = Number.parseFloat(e.currentTarget.value);
                    const a = ((deg % 360) + 360) % 360;
                    onValueCommit?.(serializeLinearGradient({ ...gradient, angle: a }));
                  }}
                  className="flex-1 accent-[var(--accent)]"
                  data-testid="cp-angle"
                />
                <input
                  type="number"
                  min={0}
                  max={360}
                  step={1}
                  value={Math.round(gradient.angle)}
                  onChange={(e) => setAngle(Number.parseFloat(e.target.value || "0"))}
                  onBlur={(e) => {
                    const deg = Number.parseFloat(e.currentTarget.value || "0");
                    const a = ((deg % 360) + 360) % 360;
                    onValueCommit?.(serializeLinearGradient({ ...gradient, angle: a }));
                  }}
                  className={cn(
                    "w-12 px-1.5 py-1 text-[11px] font-mono text-right",
                    "bg-[color:var(--surface-overlay-2)] border border-[color:var(--surface-overlay-border)]",
                    "rounded-[4px] text-[color:var(--text-overlay)]",
                    "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
                    "appearance-none",
                  )}
                  aria-label="Angle (degrees)"
                  data-testid="cp-angle-input"
                />
                <span className="text-[10px] text-[color:var(--text-overlay-muted)]">°</span>
              </div>
              <div className="mt-1.5 text-[10px] text-[color:var(--text-overlay-muted)]">
                바 클릭 = 정지점 추가 · 더블클릭 = 삭제
              </div>
              <div className="my-3 h-px bg-[color:var(--surface-overlay-border)]" />
            </>
          ) : null}

          {/* SV pad — saturation × value of the currently-edited color */}
          <div
            ref={svRef}
            data-testid="cp-sv-pad"
            onPointerDown={onSvDown}
            className="relative w-full h-[140px] rounded-[6px] overflow-hidden touch-none select-none cursor-crosshair"
            style={{
              background: `
                linear-gradient(to top, #000, transparent),
                linear-gradient(to right, #fff, transparent),
                ${hueCss}
              `,
            }}
          >
            <div
              aria-hidden
              className="absolute w-3 h-3 rounded-full -translate-x-1/2 -translate-y-1/2 border-2 border-white pointer-events-none"
              style={{
                left: `${s * 100}%`,
                top: `${(1 - v) * 100}%`,
                boxShadow: "0 0 0 1px rgba(0,0,0,0.7)",
                background: solidCss,
              }}
            />
          </div>

          {/* Hue strip */}
          <div className="mt-3">
            <div
              ref={hueRef}
              data-testid="cp-hue-strip"
              onPointerDown={onHueDown}
              className="relative h-3 rounded-[6px] overflow-hidden touch-none select-none cursor-pointer"
              style={{
                background:
                  "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
              }}
            >
              <div
                aria-hidden
                className="absolute top-1/2 w-3 h-3 rounded-full -translate-x-1/2 -translate-y-1/2 border-2 border-white pointer-events-none"
                style={{
                  left: `${(h / 360) * 100}%`,
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.7)",
                  background: hueCss,
                }}
              />
            </div>
          </div>

          {/* Alpha strip */}
          <div className="mt-2">
            <div
              ref={alphaRef}
              data-testid="cp-alpha-strip"
              onPointerDown={onAlphaDown}
              className="relative h-3 rounded-[6px] overflow-hidden touch-none select-none cursor-pointer"
              style={
                {
                  backgroundImage: `
                    linear-gradient(to right, transparent, ${solidCss}),
                    conic-gradient(#3a3a40 0% 25%, #555 25% 50%, #3a3a40 50% 75%, #555 75% 100%)
                  `,
                  backgroundSize: "100% 100%, 8px 8px",
                } as CSSProperties
              }
            >
              <div
                aria-hidden
                className="absolute top-1/2 w-3 h-3 rounded-full -translate-x-1/2 -translate-y-1/2 border-2 border-white pointer-events-none"
                style={{
                  left: `${alpha * 100}%`,
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.7)",
                  background: solidCss,
                  opacity: alpha,
                }}
              />
            </div>
          </div>

          {/* Hex + EyeDropper */}
          <div className="mt-3 flex items-center gap-2">
            <div
              aria-hidden
              className="h-7 w-7 rounded-[6px] border border-[color:var(--surface-overlay-border)] shrink-0"
              style={{
                background: `
                  linear-gradient(${currentHex}, ${currentHex}),
                  conic-gradient(#3a3a40 0% 25%, #555 25% 50%, #3a3a40 50% 75%, #555 75% 100%)
                `,
                backgroundSize: "100% 100%, 8px 8px",
              }}
            />
            <input
              type="text"
              value={hexText}
              onChange={(e) => handleHexInput(e.target.value)}
              onBlur={handleHexCommit}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              spellCheck={false}
              aria-label="hex"
              data-testid="cp-hex"
              className={cn(
                "flex-1 min-w-0 px-2 py-1 text-[12px] font-mono",
                "bg-[color:var(--surface-overlay-2)] border border-[color:var(--surface-overlay-border)]",
                "rounded-[4px] text-[color:var(--text-overlay)]",
                "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
              )}
            />
            {showEye ? (
              <button
                type="button"
                onClick={openEyeDropper}
                disabled={eyeBusy}
                aria-label="Pick color from screen"
                data-testid="cp-eyedropper"
                className={cn(
                  "h-7 w-7 inline-flex items-center justify-center shrink-0",
                  "rounded-[6px] border border-[color:var(--surface-overlay-border)]",
                  "bg-[color:var(--surface-overlay-2)] text-[color:var(--text-overlay-soft)]",
                  "hover:text-[color:var(--text-overlay)]",
                  "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
                  "disabled:opacity-50",
                )}
                title="화면에서 색 추출 (스포이드)"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  role="img"
                  aria-label="Eyedropper"
                >
                  <title>Eyedropper</title>
                  <path d="m2 22 1-1h3l9-9" />
                  <path d="M3 21v-3l9-9" />
                  <path d="m15 6 3.4-3.4a2.121 2.121 0 1 1 3 3L18 9l.4.4a2.121 2.121 0 1 1-3 3l-3.8-3.8a2.121 2.121 0 1 1 3-3l.4.4Z" />
                </svg>
              </button>
            ) : null}
          </div>

          {/* R / G / B numeric inputs */}
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {(["r", "g", "b"] as const).map((ch) => (
              <label
                key={ch}
                className="flex items-center gap-1 text-[10px] font-mono text-[color:var(--text-overlay-soft)]"
              >
                <span className="w-3 uppercase">{ch}</span>
                <input
                  type="number"
                  min={0}
                  max={255}
                  step={1}
                  value={rgb[ch]}
                  onChange={(e) => setChannel(ch, Number.parseInt(e.target.value || "0", 10))}
                  onBlur={(e) => commitChannelFromInput(ch, e.currentTarget.value)}
                  aria-label={ch.toUpperCase()}
                  data-testid={`cp-${ch}`}
                  className={cn(
                    "w-full min-w-0 px-1.5 py-1 text-[11px] font-mono text-center",
                    "bg-[color:var(--surface-overlay-2)] border border-[color:var(--surface-overlay-border)]",
                    "rounded-[4px] text-[color:var(--text-overlay)]",
                    "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
                    "appearance-none",
                  )}
                />
              </label>
            ))}
          </div>

          {/* Theme color swatches — emit `var(--*)` literals so CSS
              resolves the picked color per the active `[data-theme]`
              attribute. Picking from this row makes the value follow
              theme switches automatically. */}
          {themeColors.length > 0 ? (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] font-mono uppercase tracking-[0.16em] text-[color:var(--text-overlay-muted)]">
                  테마
                </span>
                <span className="text-[9px] text-[color:var(--text-overlay-muted)]">
                  theme-aware
                </span>
              </div>
              <div className="grid grid-cols-9 gap-1">
                {themeColors.map((t) => (
                  <button
                    key={t.varName}
                    type="button"
                    aria-label={`theme color ${t.label}`}
                    onClick={() => applyThemeColor(t.varName)}
                    title={`${t.label} · var(${t.varName})`}
                    data-testid={`cp-theme-${t.varName}`}
                    className={cn(
                      "h-5 w-full rounded-[3px] border",
                      "border-[color:var(--surface-overlay-border)]",
                      "shadow-[0_0_0_1px_rgba(0,0,0,0.35)_inset]",
                      "hover:scale-110 transition-transform",
                      "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
                    )}
                    // Background uses the live var() so the swatch shows the
                    // theme's current value. A checker layer underneath
                    // surfaces translucent tokens (surface-1, accent-soft)
                    // as glass over the page color.
                    style={{
                      background: `
                        linear-gradient(var(${t.varName}), var(${t.varName})),
                        conic-gradient(#3a3a40 0% 25%, #555 25% 50%, #3a3a40 50% 75%, #555 75% 100%)
                      `,
                      backgroundSize: "100% 100%, 6px 6px",
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* Preset swatches — static colors that don't follow theme. */}
          {presets.length > 0 ? (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] font-mono uppercase tracking-[0.16em] text-[color:var(--text-overlay-muted)]">
                  팔레트
                </span>
              </div>
              <div className="grid grid-cols-9 gap-1">
                {presets.map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-label={`preset ${p}`}
                    onClick={() => applyPreset(p)}
                    className={cn(
                      "h-5 w-full rounded-[3px] border",
                      "border-[color:var(--surface-overlay-border)]",
                      "shadow-[0_0_0_1px_rgba(0,0,0,0.35)_inset]",
                      "hover:scale-110 transition-transform",
                      "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
                    )}
                    style={{ background: p }}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
});
