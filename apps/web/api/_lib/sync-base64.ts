// Shared base64 ⇄ Uint8Array helpers for /api/sync/* routes. Node-side
// (Vercel functions) so we use Buffer for performance; the same shape
// is read by the browser provider via globalThis.btoa / atob.

export function u8ToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function base64ToU8(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

const ROOM_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidRoomId(s: unknown): s is string {
  return typeof s === "string" && ROOM_ID_RE.test(s);
}

/** Compact bounded-size check on the base64 string. Each Yjs update is
 *  usually 20-200 bytes; pages typically aggregate to ~1 KB before
 *  push. Cap generously at 512 KB to keep KV per-key writes safe even
 *  if a host bundles many updates into one push. */
export const MAX_UPDATE_B64_BYTES = 512 * 1024;
/** Cap on the state-vector query string (always small in practice). */
export const MAX_VECTOR_B64_BYTES = 16 * 1024;
