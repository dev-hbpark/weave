// DR-027 / WI-071 Phase 3 (AUDIT-006 F-1) — perceived-luminance probe extracted
// from FrameStage. Uses a canvas to parse arbitrary CSS colors; isolated here so
// FrameStage's render path doesn't carry the DOM-probe detail inline.

/** Perceived luminance for a CSS color. Returns 0..1 where ≥ 0.5 reads as
 *  "light" (dark ink on top is the right choice). Falls back to "light" (1) for
 *  inputs the canvas can't parse — the conservative bet since most designs use
 *  white anyway. */
export function perceivedLuminance(color: string): number {
  if (typeof document === "undefined") return 1;
  // A theme-token background (`var(--bg-page)`, etc.) can't be parsed by the
  // canvas — `var()` only resolves against the live cascade. Resolve it to a
  // concrete `rgb(...)` first via a connected probe so the tone is correct on
  // dark themes (weave's default Aurora is dark); otherwise this would fall
  // back to "light" and pick dark ink against a dark page.
  color = resolveCssColor(color);
  const probe = document.createElement("canvas").getContext("2d");
  if (probe === null) return 1;
  probe.fillStyle = "#000";
  probe.fillStyle = color;
  // Browser normalizes the parsed color back to rgb(...) / rgba(...).
  const m = probe.fillStyle.match(/rgba?\(([^)]+)\)/);
  if (m === null) {
    // Hex / named — read a pixel via a 1×1 paint to get rgba.
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext("2d");
    if (ctx === null) return 1;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    const r = (data[0] ?? 0) / 255;
    const g = (data[1] ?? 0) / 255;
    const b = (data[2] ?? 0) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const parts = (m[1] ?? "").split(",").map((s) => parseFloat(s.trim()));
  const r = (parts[0] ?? 0) / 255;
  const g = (parts[1] ?? 0) / 255;
  const b = (parts[2] ?? 0) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Resolve a CSS color that may contain `var(--*)` references into a concrete
 *  computed color string. A `var()` only resolves against the live cascade, so
 *  we paint it onto a connected, invisible probe and read back the browser's
 *  resolved `rgb(...)`. Colors without a `var()` (hex / rgb / named) and
 *  environments without a `document` (SSR / unit tests) are returned as-is. */
function resolveCssColor(color: string): string {
  if (!color.includes("var(")) return color;
  if (typeof document === "undefined" || document.body === null) return color;
  const probe = document.createElement("div");
  // `color` (not `background`) keeps the probe zero-size and reads back via
  // `getComputedStyle().color`, which the browser normalizes to rgb(...).
  probe.style.cssText = "position:absolute;width:0;height:0;visibility:hidden;pointer-events:none";
  probe.style.color = color;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved !== "" ? resolved : color;
}
