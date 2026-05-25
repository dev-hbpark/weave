import type { VercelResponse } from "@vercel/node";

export type ApiErrorCode =
  | "MISSING_FIELD"
  | "INVALID_FIELD"
  | "INVALID_METHOD"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_CONTENT_TYPE"
  | "INTERNAL_ERROR"
  | "NOT_FOUND"
  | "STORAGE_UNAVAILABLE"
  /** KV provider rejected the value as too large (Upstash per-key
   *  cap, etc.). Distinct from PAYLOAD_TOO_LARGE — the API accepted
   *  the request, but the backing store can't fit it. */
  | "STORAGE_LIMIT";

export interface ApiErrorBody {
  readonly error: { readonly code: ApiErrorCode; readonly message: string };
}

export function apiError(
  res: VercelResponse,
  status: number,
  code: ApiErrorCode,
  message: string,
): void {
  res.status(status).json({ error: { code, message } });
}
