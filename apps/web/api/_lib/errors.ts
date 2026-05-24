import type { VercelResponse } from "@vercel/node";

export type ApiErrorCode =
  | "MISSING_FIELD"
  | "INVALID_FIELD"
  | "INVALID_METHOD"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_CONTENT_TYPE"
  | "INTERNAL_ERROR"
  | "NOT_FOUND"
  | "STORAGE_UNAVAILABLE";

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
