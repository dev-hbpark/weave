import type { VercelRequest, VercelResponse } from "@vercel/node";
import { apiError } from "./errors.js";

// KV per-key limit on Upstash free is 1 MB; we leave headroom for the future
// addition of relations + behaviors per design.
export const MAX_DESIGN_BYTES = 800 * 1024;
// 10 MB matches Vercel Blob's documented client upload comfort zone.
export const MAX_RESOURCE_BYTES = 10 * 1024 * 1024;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidId(s: unknown): s is string {
  return typeof s === "string" && ID_RE.test(s);
}

export function isFiniteNumber(n: unknown, min: number, max: number): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
}

export function isBoundedString(s: unknown, max: number): s is string {
  return typeof s === "string" && s.length <= max;
}

export function isIsoDateString(s: unknown): s is string {
  if (typeof s !== "string" || s.length > 40) return false;
  const t = Date.parse(s);
  return Number.isFinite(t);
}

export function enforceContentLength(
  req: VercelRequest,
  res: VercelResponse,
  maxBytes: number,
): boolean {
  const raw = req.headers["content-length"];
  if (typeof raw === "string") {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > maxBytes) {
      apiError(res, 413, "PAYLOAD_TOO_LARGE", `Body exceeds ${maxBytes} bytes`);
      return false;
    }
  }
  return true;
}

export function enforceJsonContentType(
  req: VercelRequest,
  res: VercelResponse,
): boolean {
  const ctype = req.headers["content-type"];
  const value = typeof ctype === "string" ? ctype.toLowerCase() : "";
  if (!value.includes("application/json")) {
    apiError(res, 415, "INVALID_CONTENT_TYPE", "Content-Type must be application/json");
    return false;
  }
  return true;
}

const ALLOWED_SRC_PROTOCOLS = new Set(["http:", "https:", "data:", "blob:"]);

export function isAllowedSrc(s: unknown): s is string {
  if (typeof s !== "string" || s.length === 0 || s.length > 4096) return false;
  const lower = s.toLowerCase();
  // data: / blob: URLs don't parse as URL in all environments; check by prefix.
  if (lower.startsWith("data:") || lower.startsWith("blob:")) return true;
  try {
    const u = new URL(s);
    return ALLOWED_SRC_PROTOCOLS.has(u.protocol);
  } catch {
    return false;
  }
}
