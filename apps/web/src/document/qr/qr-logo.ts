// WI-140 — QR center-logo pure helpers (no React). Encodes the two
// generation-time scannability defenses from DR-095: a logo-width clamp and an
// error-correction floor whenever a logo is present. Split from the icon
// registry (`qr-logo-icons.tsx`) so this stays unit-testable without pulling in
// the design-system / React.

import type { QrAttrs } from "../types.js";

export type QrEc = NonNullable<QrAttrs["ecLevel"]>;

const EC_RANK: Record<QrEc, number> = { L: 0, M: 1, Q: 2, H: 3 };

/** Raise `ec` up to at least `floor` (never lowers). */
export function raiseEc(ec: QrEc, floor: QrEc): QrEc {
  return EC_RANK[ec] >= EC_RANK[floor] ? ec : floor;
}

/** Recommended stored EC when the user turns a logo ON (DR-095: 권장 H). Keeps
 *  an already-high level; bumps L/M up to H. */
export function recommendedEcForLogo(ec: QrEc): QrEc {
  return raiseEc(ec, "Q") === ec ? ec : "H";
}

export const QR_LOGO_MAX_SCALE = 0.25;
export const QR_LOGO_DEFAULT_SCALE = 0.2;

/** Logo width as a fraction of the code area, clamped to a scannable ceiling
 *  (≤ 0.25). Non-finite / missing → the default. */
export function clampLogoScale(scale: number | undefined): number {
  const s = typeof scale === "number" && Number.isFinite(scale) ? scale : QR_LOGO_DEFAULT_SCALE;
  return Math.max(0, Math.min(QR_LOGO_MAX_SCALE, s));
}

/** Generation-time EC floor: any QR carrying a logo is encoded at ≥ Q so the
 *  covered centre modules stay recoverable. The UI raises the *stored* level to
 *  H (`recommendedEcForLogo`); this is the safety net for agent-created items
 *  that set a logo without bumping EC. */
export function effectiveQrEcLevel(attrs: QrAttrs): QrEc {
  const ec = attrs.ecLevel ?? "M";
  return attrs.logo?.iconId ? raiseEc(ec, "Q") : ec;
}
