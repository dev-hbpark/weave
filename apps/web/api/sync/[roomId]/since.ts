// GET /api/sync/[roomId]/since?vector=<base64 state vector>
//   → { updates: <base64>[] }   updates the caller hasn't seen yet
//
// The server uses Yjs's `diffUpdate` helper on each stored update to
// compute the delta against the caller's state vector. In practice the
// stored updates are already small and we usually return them all —
// the diffing kicks in once snapshot compaction (Phase 5) folds older
// patches into the snapshot.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as Y from "yjs";
import { apiError } from "../../_lib/errors.js";
import { syncSnapshotKey, syncSnapshotVectorKey, syncUpdatesKey } from "../../_lib/keys.js";
import { assertKvAvailable, kv } from "../../_lib/kv.js";
import {
  base64ToU8,
  isValidRoomId,
  MAX_VECTOR_B64_BYTES,
  u8ToBase64,
} from "../../_lib/sync-base64.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!assertKvAvailable(res)) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    apiError(res, 405, "INVALID_METHOD", "Method not allowed");
    return;
  }
  const roomIdParam = req.query.roomId;
  const roomId = Array.isArray(roomIdParam) ? roomIdParam[0] : roomIdParam;
  if (!isValidRoomId(roomId)) {
    apiError(res, 400, "INVALID_FIELD", "roomId must match [A-Za-z0-9_-]{1,64}");
    return;
  }

  const vectorParam = req.query.vector;
  const vectorB64 = Array.isArray(vectorParam) ? vectorParam[0] : vectorParam;
  if (typeof vectorB64 !== "string" || vectorB64.length > MAX_VECTOR_B64_BYTES) {
    apiError(res, 400, "INVALID_FIELD", "vector must be base64 within bounds");
    return;
  }
  let remoteVector: Uint8Array;
  try {
    remoteVector = base64ToU8(vectorB64);
  } catch {
    apiError(res, 400, "INVALID_FIELD", "vector is not valid base64");
    return;
  }

  // Hydrate a transient Y.Doc from the snapshot + all stored updates,
  // then diff against the caller's vector. This is O(updates) per
  // request, but the array stays bounded between Phase-5 compactions.
  const yDoc = new Y.Doc();
  const snapshotB64 = await kv.get<string>(syncSnapshotKey(roomId));
  if (snapshotB64 !== null) {
    Y.applyUpdate(yDoc, base64ToU8(snapshotB64));
  }
  const updates = (await kv.get<string[]>(syncUpdatesKey(roomId))) ?? [];
  for (const b64 of updates) {
    Y.applyUpdate(yDoc, base64ToU8(b64));
  }

  const diff = Y.encodeStateAsUpdate(yDoc, remoteVector);
  // An empty diff is just the 2-byte "no missing updates" marker
  // (`[0,0]`) — skip the round-trip cost for the client.
  if (diff.length <= 2) {
    res.status(200).json({ updates: [] });
    return;
  }
  void syncSnapshotVectorKey; // imported for typing; unused here
  res.status(200).json({ updates: [u8ToBase64(diff)] });
}
