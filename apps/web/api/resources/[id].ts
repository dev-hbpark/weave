// WI-025 — single-resource endpoint (globally shared workspace).
//
// DELETE /api/resources/:id → remove from KV (+ index). The Blob behind
// `src` is intentionally left dangling — Vercel Blob has lifecycle rules
// and orphans cost ~free; gc is a follow-up.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { apiError } from "../_lib/errors.js";
import { resourceIndexKey, resourceKey } from "../_lib/keys.js";
import { assertKvAvailable, kv } from "../_lib/kv.js";
import { isValidId } from "../_lib/validate.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (!assertKvAvailable(res)) return;
  const idParam = req.query.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!isValidId(id)) {
    apiError(res, 400, "INVALID_FIELD", "id must match [A-Za-z0-9_-]{1,64}");
    return;
  }

  if (req.method === "DELETE") {
    await kv.del(resourceKey(id));
    const ids = (await kv.get<string[]>(resourceIndexKey())) ?? [];
    await kv.set(
      resourceIndexKey(),
      ids.filter((x) => x !== id),
    );
    res.status(200).json({ ok: true });
    return;
  }

  res.setHeader("Allow", "DELETE");
  apiError(res, 405, "INVALID_METHOD", "Method not allowed");
}
