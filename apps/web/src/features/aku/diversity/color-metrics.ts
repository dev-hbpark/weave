// Color math for the design-diversity metric (DR-077 D6).
//
// Parses the CSS color strings weave items carry (hex / rgb()), converts to
// CIE L*a*b*, and computes perceptual distance via CIEDE2000 (ΔE00). Theme
// tokens (`var(--…)`) and named colors are NOT resolvable offline → `parseColor`
// returns null for them and the caller excludes them from ΔE (DR-077: expressive
// areas should use concrete palettes, not tokens — so a converged set of real
// outputs still has resolvable background/title colors to measure).
//
// Pure & dependency-free; ΔE00 is unit-tested against Sharma et al. reference
// pairs.

export interface Rgb {
  readonly r: number; // 0..255
  readonly g: number;
  readonly b: number;
}

export interface Lab {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const RGB_FN = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i;

/** Parse a CSS color to RGB, or null when not resolvable offline (tokens, named
 *  colors, gradients-as-strings). */
export function parseColor(input: string): Rgb | null {
  const s = input.trim();
  const m3 = HEX3.exec(s);
  if (m3) {
    return {
      r: Number.parseInt(m3[1]! + m3[1]!, 16),
      g: Number.parseInt(m3[2]! + m3[2]!, 16),
      b: Number.parseInt(m3[3]! + m3[3]!, 16),
    };
  }
  const m6 = HEX6.exec(s);
  if (m6) {
    return {
      r: Number.parseInt(m6[1]!, 16),
      g: Number.parseInt(m6[2]!, 16),
      b: Number.parseInt(m6[3]!, 16),
    };
  }
  const mf = RGB_FN.exec(s);
  if (mf) {
    const clamp = (n: number) => (n < 0 ? 0 : n > 255 ? 255 : n);
    return { r: clamp(+mf[1]!), g: clamp(+mf[2]!), b: clamp(+mf[3]!) };
  }
  return null;
}

function srgbChannelToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4;
}

/** sRGB → CIE L*a*b* (D65). */
export function rgbToLab({ r, g, b }: Rgb): Lab {
  const lr = srgbChannelToLinear(r);
  const lg = srgbChannelToLinear(g);
  const lb = srgbChannelToLinear(b);
  // linear sRGB → XYZ (D65)
  const x = lr * 0.4124 + lg * 0.3576 + lb * 0.1805;
  const y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
  const z = lr * 0.0193 + lg * 0.1192 + lb * 0.9505;
  // normalize by D65 white
  const xn = x / 0.95047;
  const yn = y / 1.0;
  const zn = z / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(xn);
  const fy = f(yn);
  const fz = f(zn);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

function hueDeg(b: number, ap: number): number {
  if (b === 0 && ap === 0) return 0;
  const h = deg(Math.atan2(b, ap));
  return h >= 0 ? h : h + 360;
}

/** CIEDE2000 perceptual color difference (ΔE00) between two Lab colors. */
export function deltaE2000(l1: Lab, l2: Lab): number {
  const { L: L1, a: a1, b: b1 } = l1;
  const { L: L2, a: a2, b: b2 } = l2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const Cbar7 = Cbar ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = hueDeg(b1, a1p);
  const h2p = hueDeg(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp) / 2);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbarp = hbarp < 360 ? hbarp + 360 : hbarp - 360;
    hbarp /= 2;
  }

  const T =
    1 -
    0.17 * Math.cos(rad(hbarp - 30)) +
    0.24 * Math.cos(rad(2 * hbarp)) +
    0.32 * Math.cos(rad(3 * hbarp + 6)) -
    0.2 * Math.cos(rad(4 * hbarp - 63));

  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Cbarp7 = Cbarp ** 7;
  const Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;

  const termL = dLp / Sl;
  const termC = dCp / Sc;
  const termH = dHp / Sh;
  return Math.sqrt(termL ** 2 + termC ** 2 + termH ** 2 + Rt * termC * termH);
}

/** ΔE00 directly between two CSS color strings; null when either is unresolvable. */
export function colorDeltaE(c1: string, c2: string): number | null {
  const r1 = parseColor(c1);
  const r2 = parseColor(c2);
  if (r1 === null || r2 === null) return null;
  return deltaE2000(rgbToLab(r1), rgbToLab(r2));
}
