// WI-025 — anonymous device-ID cookie helpers.
//
// All API requests carry a `weave_did` cookie. Server reads it; if absent,
// mints a fresh UUID and writes it back via Set-Cookie. The ID is used as
// the scope key for KV / Blob so each browser gets its own workspace
// without an explicit login.

import type { VercelRequest, VercelResponse } from "@vercel/node";

const COOKIE_NAME = "weave_did";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 5; // 5 years

function readCookie(req: VercelRequest, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (typeof raw !== "string") return undefined;
  for (const part of raw.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === name && v !== undefined) return decodeURIComponent(v);
  }
  return undefined;
}

function generateId(): string {
  // Prefer crypto.randomUUID when available (Node 19+ has it native).
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === "function") return g.crypto.randomUUID();
  // Fallback — Math.random based v4-shaped string.
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      s += "-";
    } else if (i === 14) {
      s += "4";
    } else if (i === 19) {
      s += hex[(Math.random() * 4) | 8]!;
    } else {
      s += hex[(Math.random() * 16) | 0]!;
    }
  }
  return s;
}

/** Returns the device id from the request, minting + setting a cookie if
 *  the request is anonymous. Always sets the cookie (refresh max-age). */
export function ensureDeviceId(
  req: VercelRequest,
  res: VercelResponse,
): string {
  let did = readCookie(req, COOKIE_NAME);
  if (did === undefined || did.length < 8) {
    did = generateId();
  }
  const cookieValue = [
    `${COOKIE_NAME}=${encodeURIComponent(did)}`,
    "Path=/",
    `Max-Age=${COOKIE_MAX_AGE}`,
    "SameSite=Lax",
    // Secure flag is added by Vercel automatically on production; on
    // localhost/preview we leave it off so the cookie survives http://.
  ].join("; ");
  res.setHeader("Set-Cookie", cookieValue);
  return did;
}

/** KV key prefix for everything scoped to one device. */
export function deviceScope(did: string): string {
  return `did:${did}`;
}
