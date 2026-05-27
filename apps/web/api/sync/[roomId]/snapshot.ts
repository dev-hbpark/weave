// GET  /api/sync/[roomId]/snapshot
//   → { snapshot: <base64> | null, vector: <base64> | null }
//
// POST /api/sync/[roomId]/snapshot
//   body { snapshot: <base64>, vector: <base64> }
//   → 204
//
// Hosts post a fresh snapshot once `pendingUpdates.length ≥ N`
// (Phase 5 compaction). On the next page load a client fetches GET
// /snapshot first, then GET /since?vector=<vector> for the tail —
// avoiding the cost of replaying every historical update.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { apiError } from "../../_lib/errors.js";
import { syncSnapshotKey, syncSnapshotVectorKey, syncUpdatesKey } from "../../_lib/keys.js";
import { assertKvAvailable, kv } from "../../_lib/kv.js";
import {
  isValidRoomId,
  MAX_UPDATE_B64_BYTES,
  MAX_VECTOR_B64_BYTES,
} from "../../_lib/sync-base64.js";
import { enforceContentLength, enforceJsonContentType } from "../../_lib/validate.js";

const MAX_BODY = MAX_UPDATE_B64_BYTES + MAX_VECTOR_B64_BYTES + 1024;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!assertKvAvailable(res)) return;
  const roomIdParam = req.query.roomId;
  const roomId = Array.isArray(roomIdParam) ? roomIdParam[0] : roomIdParam;
  if (!isValidRoomId(roomId)) {
    apiError(res, 400, "INVALID_FIELD", "roomId must match [A-Za-z0-9_-]{1,64}");
    return;
  }

  if (req.method === "GET") {
    const snapshot = await kv.get<string>(syncSnapshotKey(roomId));
    const vector = await kv.get<string>(syncSnapshotVectorKey(roomId));
    res.status(200).json({ snapshot, vector });
    return;
  }

  if (req.method === "POST") {
    if (!enforceContentLength(req, res, MAX_BODY)) return;
    if (!enforceJsonContentType(req, res)) return;
    const body = req.body as { snapshot?: unknown; vector?: unknown } | undefined;
    if (
      body === undefined ||
      typeof body.snapshot !== "string" ||
      typeof body.vector !== "string" ||
      body.snapshot.length === 0 ||
      body.snapshot.length > MAX_UPDATE_B64_BYTES ||
      body.vector.length === 0 ||
      body.vector.length > MAX_VECTOR_B64_BYTES
    ) {
      apiError(res, 400, "INVALID_FIELD", "body requires snapshot + vector base64");
      return;
    }
    await kv.set(syncSnapshotKey(roomId), body.snapshot);
    await kv.set(syncSnapshotVectorKey(roomId), body.vector);
    // After a successful snapshot the patch tail is folded in — clear
    // the list so future /since requests don't replay them.
    await kv.set(syncUpdatesKey(roomId), []);
    res.status(204).end();
    return;
  }

  res.setHeader("Allow", "GET, POST");
  apiError(res, 405, "INVALID_METHOD", "Method not allowed");
}
