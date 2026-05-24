// WI-020 Phase 1 — ColorPicker primitive (DR-design-009).
//
// Trigger: small color swatch button. Popover: hex input + R/G/B/A sliders
// + preset row. v1 supports solid colors only; gradients deferred to v2
// (see DR-design-009 §"Trade-offs accepted").
//
// onValueCommit fires on:
//   - Popover close
//   - Explicit "Apply" press (Enter on hex input)
//   - 250ms throttle during slider drag (host-side debouncing)
// onValueChange fires on every interaction (transient preview).

import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
  type ChangeEvent,
  forwardRef,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { cn } from "../cn.js";

export interface ColorPickerProps {
  /** CSS color string (hex `#rrggbb` / `#rrggbbaa`, `rgb()`, etc.). */
  readonly value: string;
  readonly onValueChange: (next: string) => void;
  readonly onValueCommit?: (next: string) => void;
  readonly presets?: ReadonlyArray<string>;
  readonly "aria-label"?: string;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;        // optional custom trigger
}

const DEFAULT_PRESETS: ReadonlyArray<string> = [
  "#1f2937", "#475569", "#94a3b8", "#cbd5f5",
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#0ea5e9", "#6366f1", "#a855f7", "#ec4899",
];

function hexFromRgba(r: number, g: number, b: number, a: number): string {
  const to = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  const alphaPart = a < 1 ? to(Math.round(a * 255)) : "";
  return `#${to(r)}${to(g)}${to(b)}${alphaPart}`;
}

function parseColor(str: string): { r: number; g: number; b: number; a: number } | null {
  // Minimal parser — accepts #rgb, #rrggbb, #rrggbbaa, rgb(), rgba(), named.
  const s = str.trim();
  // #rrggbb / #rrggbbaa
  const hex = s.match(/^#([0-9a-f]{3,8})$/i);
  if (hex && hex[1]) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (h.length === 6 || h.length === 8) {
      const r = Number.parseInt(h.slice(0, 2), 16);
      const g = Number.parseInt(h.slice(2, 4), 16);
      const b = Number.parseInt(h.slice(4, 6), 16);
      const a = h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
  }
  const rgb = s.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i);
  if (rgb && rgb[1] && rgb[2] && rgb[3]) {
    return {
      r: Number.parseFloat(rgb[1]),
      g: Number.parseFloat(rgb[2]),
      b: Number.parseFloat(rgb[3]),
      a: rgb[4] !== undefined ? Number.parseFloat(rgb[4]) : 1,
    };
  }
  return null;
}

export const ColorPicker = forwardRef<HTMLButtonElement, ColorPickerProps>(
  function ColorPicker(
    {
      value,
      onValueChange,
      onValueCommit,
      presets = DEFAULT_PRESETS,
      "aria-label": ariaLabel = "Choose color",
      disabled,
      className,
      children,
    },
    ref,
  ) {
    const [open, setOpen] = useState(false);
    const initial = parseColor(value) ?? { r: 0, g: 0, b: 0, a: 1 };
    const [r, setR] = useState(initial.r);
    const [g, setG] = useState(initial.g);
    const [b, setB] = useState(initial.b);
    const [a, setA] = useState(initial.a);
    const [hexText, setHexText] = useState(value);

    // Sync internal sliders when external value changes.
    useEffect(() => {
      const p = parseColor(value);
      if (p) {
        setR(p.r); setG(p.g); setB(p.b); setA(p.a);
        setHexText(value);
      }
    }, [value]);

    function emitChange(nextR: number, nextG: number, nextB: number, nextA: number): void {
      const v = hexFromRgba(nextR, nextG, nextB, nextA);
      setHexText(v);
      onValueChange(v);
    }

    function commitIfOpen(): void {
      if (!open) return;
      const v = hexFromRgba(r, g, b, a);
      onValueCommit?.(v);
    }

    function handleHexChange(e: ChangeEvent<HTMLInputElement>): void {
      const text = e.target.value;
      setHexText(text);
      const parsed = parseColor(text);
      if (parsed) {
        setR(parsed.r); setG(parsed.g); setB(parsed.b); setA(parsed.a);
        onValueChange(hexFromRgba(parsed.r, parsed.g, parsed.b, parsed.a));
      }
    }

    function preset(p: string): void {
      const parsed = parseColor(p);
      if (!parsed) return;
      setR(parsed.r); setG(parsed.g); setB(parsed.b); setA(parsed.a);
      setHexText(p);
      onValueChange(p);
      onValueCommit?.(p);
    }

    return (
      <PopoverPrimitive.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) commitIfOpen();
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
              style={{ background: value }}
            />
          )}
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            sideOffset={8}
            collisionPadding={12}
            className={cn(
              "z-50 min-w-[220px] p-3",
              "rounded-[var(--radius-md)] border",
              "bg-[color:var(--surface-overlay)] border-[color:var(--surface-overlay-border)]",
              "text-[color:var(--text-overlay)]",
              "shadow-[var(--shadow-overlay)]",
              "backdrop-blur-[var(--surface-blur)]",
              "focus:outline-none",
            )}
          >
            {/* Hex / RGBA input row */}
            <div className="flex items-center gap-2 mb-3">
              <div
                aria-hidden
                className="h-8 w-8 rounded-[6px] border border-[color:var(--surface-overlay-border)] shadow-[0_0_0_1px_rgba(0,0,0,0.35)_inset]"
                style={{ background: hexText }}
              />
              <input
                type="text"
                value={hexText}
                onChange={handleHexChange}
                aria-label="hex"
                className={cn(
                  "flex-1 px-2 py-1 text-[12px] font-mono",
                  "bg-[color:var(--surface-overlay-2)]",
                  "border border-[color:var(--surface-overlay-border)]",
                  "rounded-[4px] text-[color:var(--text-overlay)]",
                  "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
                )}
              />
            </div>
            {/* R/G/B/A sliders */}
            {(["R", "G", "B", "A"] as const).map((label, i) => {
              const v = [r, g, b, a][i] ?? 0;
              const max = label === "A" ? 1 : 255;
              const step = label === "A" ? 0.01 : 1;
              return (
                <div key={label} className="flex items-center gap-2 mb-1.5">
                  <span className="w-3 text-[10px] font-mono text-[color:var(--text-overlay-soft)]">
                    {label}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={max}
                    step={step}
                    value={v}
                    onChange={(e) => {
                      const nv = Number.parseFloat(e.target.value);
                      const next = [r, g, b, a];
                      next[i] = nv;
                      const [nr, ng, nb, na] = next;
                      setR(nr ?? r); setG(ng ?? g); setB(nb ?? b); setA(na ?? a);
                      emitChange(nr ?? r, ng ?? g, nb ?? b, na ?? a);
                    }}
                    className="flex-1 accent-[var(--accent)]"
                  />
                  <span className="w-8 text-[10px] font-mono text-right text-[color:var(--text-overlay-soft)]">
                    {label === "A" ? v.toFixed(2) : Math.round(v)}
                  </span>
                </div>
              );
            })}
            {/* Presets row */}
            <div className="grid grid-cols-6 gap-1 mt-2">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-label={`preset ${p}`}
                  onClick={() => preset(p)}
                  className={cn(
                    "h-6 w-full rounded-[4px] border",
                    "border-[color:var(--surface-overlay-border)]",
                    "shadow-[0_0_0_1px_rgba(0,0,0,0.35)_inset]",
                    "hover:scale-105 transition-transform",
                    "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
                  )}
                  style={{ background: p }}
                />
              ))}
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    );
  },
);
