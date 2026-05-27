// WI-025 — single-design endpoint (globally shared workspace).
//
// GET    /api/designs/:id  → full Design JSON
// DELETE /api/designs/:id  → remove from KV + index

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { apiError } from "../_lib/errors.js";
import { designIndexKey, designKey } from "../_lib/keys.js";
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
    res.status(200).json({ design: d });
    return;
  }

  if (req.method === "DELETE") {
    await kv.del(designKey(id));
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
