// WI-025 — single-resource endpoint.
//
// DELETE /api/resources/:id → remove from KV (+ index). The Blob behind
// `src` is intentionally left dangling — Vercel Blob has lifecycle rules
// and orphans cost ~free; gc is a follow-up.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { deviceScope, ensureDeviceId } from "../_lib/device-id.js";
import { apiError } from "../_lib/errors.js";
import { assertKvAvailable, kv } from "../_lib/kv.js";
import { isValidId } from "../_lib/validate.js";

function resourceKey(did: string, id: string): string {
  return `${deviceScope(did)}:resource:${id}`;
}

function indexKey(did: string): string {
  return `${deviceScope(did)}:resources`;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (!assertKvAvailable(res)) return;
  const did = ensureDeviceId(req, res);
  const idParam = req.query.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!isValidId(id)) {
    apiError(res, 400, "INVALID_FIELD", "id must match [A-Za-z0-9_-]{1,64}");
    return;
  }

  if (req.method === "DELETE") {
    await kv.del(resourceKey(did, id));
    const ids = (await kv.get<string[]>(indexKey(did))) ?? [];
    await kv.set(
      indexKey(did),
      ids.filter((x) => x !== id),
    );
    res.status(200).json({ ok: true });
    return;
  }

  res.setHeader("Allow", "DELETE");
  apiError(res, 405, "INVALID_METHOD", "Method not allowed");
}
