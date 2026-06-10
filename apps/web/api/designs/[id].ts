// WI-025 — single-design endpoint (globally shared workspace).
//
// GET    /api/designs/:id  → { design, patches, patchCount }
//          WI-161 — the full snapshot PLUS the delta patch log (so the client
//          loads everything in one round trip and replays the log onto the
//          snapshot). `patches` is empty for designs saved before delta or
//          right after a compaction.
// DELETE /api/designs/:id  → remove the design + its patch log from KV + index

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { apiError } from "../_lib/errors.js";
import { designIndexKey, designKey, designPatchesKey } from "../_lib/keys.js";
import { assertKvAvailable, kv } from "../_lib/kv.js";
import { isValidId } from "../_lib/validate.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!assertKvAvailable(res)) return;
  const idParam = req.query.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!isValidId(id)) {
    apiError(res, 400, "INVALID_FIELD", "id must match [A-Za-z0-9_-]{1,64}");
    return;
  }

  if (req.method === "GET") {
    const d = await kv.get(designKey(id));
    if (d === null) {
      apiError(res, 404, "NOT_FOUND", "Design not found");
      return;
    }
    // WI-161 — return the delta tail alongside the snapshot so the client
    // reconstructs the live document in a single request.
    const patches = (await kv.get<string[]>(designPatchesKey(id))) ?? [];
    res.status(200).json({ design: d, patches, patchCount: patches.length });
    return;
  }

  if (req.method === "DELETE") {
    await kv.del(designKey(id), designPatchesKey(id));
    const ids = (await kv.get<string[]>(designIndexKey())) ?? [];
    await kv.set(
      designIndexKey(),
      ids.filter((x) => x !== id),
    );
    res.status(200).json({ ok: true });
    return;
  }

  res.setHeader("Allow", "GET, DELETE");
  apiError(res, 405, "INVALID_METHOD", "Method not allowed");
}
