// WI-058 — thin, type-checked wrapper over the vendored Nayuki QR encoder.
// Turns `data` into a square boolean module matrix (true = dark), excluding the
// quiet zone (the renderer adds the configurable margin). Pure + deterministic.
//
// The vendored file is `@ts-nocheck` (verbatim third-party), so its TS namespace
// merge (`qrcodegen.QrCode.Ecc`) is not visible to importers. We bind the small
// surface we use through one explicit interface cast — the values exist at
// runtime (verified by qr-matrix.test.ts).

import { qrcodegen } from "./qrcodegen.js";

export type QrEcLevel = "L" | "M" | "Q" | "H";

interface QrCodeInstance {
  readonly size: number;
  getModule(x: number, y: number): boolean;
}
interface QrCodeStatic {
  encodeText(text: string, ecl: unknown): QrCodeInstance;
  readonly Ecc: {
    readonly LOW: unknown;
    readonly MEDIUM: unknown;
    readonly QUARTILE: unknown;
    readonly HIGH: unknown;
  };
}

const QrCode = qrcodegen.QrCode as unknown as QrCodeStatic;
const ECC: Readonly<Record<QrEcLevel, unknown>> = {
  L: QrCode.Ecc.LOW,
  M: QrCode.Ecc.MEDIUM,
  Q: QrCode.Ecc.QUARTILE,
  H: QrCode.Ecc.HIGH,
};

/** Encode `data` into a `size × size` boolean matrix (`true` = dark module),
 *  WITHOUT the quiet zone. Returns `null` for empty data or data too long to
 *  fit any QR version at the requested error-correction level. */
export function qrMatrix(
  data: string,
  ecLevel: QrEcLevel = "M",
): ReadonlyArray<ReadonlyArray<boolean>> | null {
  if (data.length === 0) return null;
  try {
    const qr = QrCode.encodeText(data, ECC[ecLevel]);
    const n = qr.size;
    const rows: boolean[][] = [];
    for (let y = 0; y < n; y++) {
      const row: boolean[] = new Array(n);
      for (let x = 0; x < n; x++) row[x] = qr.getModule(x, y);
      rows.push(row);
    }
    return rows;
  } catch {
    return null;
  }
}
