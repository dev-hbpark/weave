// POST /api/sync/[roomId]/push
//   body: { update: <base64 Yjs binary update> }
//
// Appends the update to the room's KV list. Other clients receive it
// via /api/sync/[roomId]/since on their next pull tick.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { apiError } from "../../_lib/errors.js";
import { syncUpdatesKey } from "../../_lib/keys.js";
import { assertKvAvailable, kv } from "../../_lib/kv.js";
import { isValidRoomId, MAX_UPDATE_B64_BYTES } from "../../_lib/sync-base64.js";
import {
  enforceContentLength,
  enforceJsonContentType,
} from "../../_lib/validate.js";

const MAX_PUSH_BODY = MAX_UPDATE_B64_BYTES + 1024; // small JSON overhead

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (!assertKvAvailable(res)) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    apiError(res, 405, "INVALID_METHOD", "Method not allowed");
    return;
  }
  if (!enforceContentLength(req, res, MAX_PUSH_BODY)) return;
  if (!enforceJsonContentType(req, res)) return;

  const roomIdParam = req.query.roomId;
  const roomId = Array.isArray(roomIdParam) ? roomIdParam[0] : roomIdParam;
  if (!isValidRoomId(roomId)) {
    apiError(res, 400, "INVALID_FIELD", "roomId must match [A-Za-z0-9_-]{1,64}");
    return;
  }

  const body = req.body as { update?: unknown } | undefined;
  if (
    body === undefined
    || typeof body.update !== "string"
    || body.update.length === 0
    || body.update.length > MAX_UPDATE_B64_BYTES
  ) {
    apiError(res, 400, "INVALID_FIELD", "body.update must be non-empty base64 within 512 KB");
    return;
  }

  // KV provider exposes Redis-style list ops via the lower-level
  // client; our kv wrapper currently typed for get/set/del/scan only.
  // Use set + an array — simple and bounded by snapshot compaction
  // (Phase 5). The list never exceeds the in-memory page count between
  // snapshots, so reading/writing the whole array is acceptable.
  const key = syncUpdatesKey(roomId);
  const existing = (await kv.get<string[]>(key)) ?? [];
  const next = [...existing, body.update];
  await kv.set(key, next);

  res.status(204).end();
}
