// WI-161 — design delta patch log endpoint (globally shared workspace).
//
// GET  /api/patches/:id  → { patches: string[], count }
// POST /api/patches/:id  → append a delta batch under an optimistic base-count
//                          guard.
//        body: { baseCount: number, patches: string[] }
//        200 { ok: true, count }              — appended; `count` = new length
//        409 { ok: false, reason, count }     — conflict/overflow; `count` =
//                                               server truth so the client
//                                               resyncs (full-snapshot fallback)
//
// At a top-level path (NOT under designs/[id]/) to avoid any file-vs-folder
// dynamic-route ambiguity with `api/designs/[id].ts`. Storage mirrors the sync
// endpoints: the log is one KV value (`string[]`) under `designPatchesKey(id)`.
// The server is agocraft-free — patches are opaque JSON strings it never parses.
// A full-snapshot save (POST /api/designs) clears this log (compaction). See
// DR-113.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { appendPatchLog, MAX_PATCH_LOG_ENTRIES } from "../../src/document/delta/patch-log.js";
import { apiError } from "../_lib/errors.js";
import { designPatchesKey } from "../_lib/keys.js";
import { assertKvAvailable, kv } from "../_lib/kv.js";
import {
  enforceContentLength,
  enforceJsonContentType,
  isFiniteNumber,
  isValidId,
  MAX_DESIGN_BYTES,
} from "../_lib/validate.js";

async function readLog(id: string): Promise<string[]> {
  const log = await kv.get<string[]>(designPatchesKey(id));
  return Array.isArray(log) ? log : [];
}

function validateBody(
  body: unknown,
): { ok: true; baseCount: number; patches: string[] } | { ok: false; message: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, message: "Body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  if (!isFiniteNumber(b.baseCount, 0, Number.MAX_SAFE_INTEGER)) {
    return { ok: false, message: "baseCount must be a non-negative integer" };
  }
  if (!Array.isArray(b.patches) || b.patches.some((p) => typeof p !== "string")) {
    return { ok: false, message: "patches must be an array of strings" };
  }
  if (b.patches.length === 0) {
    return { ok: false, message: "patches must be non-empty" };
  }
  if (b.patches.length > MAX_PATCH_LOG_ENTRIES) {
    return { ok: false, message: `patches batch exceeds ${MAX_PATCH_LOG_ENTRIES}` };
  }
  return { ok: true, baseCount: b.baseCount, patches: b.patches as string[] };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!assertKvAvailable(res)) return;
  const idParam = req.query.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!isValidId(id)) {
    apiError(res, 400, "INVALID_FIELD", "id must match [A-Za-z0-9_-]{1,64}");
    return;
  }

  if (req.method === "GET") {
    const patches = await readLog(id);
    res.status(200).json({ patches, count: patches.length });
    return;
  }

  if (req.method === "POST") {
    if (!enforceContentLength(req, res, MAX_DESIGN_BYTES)) return;
    if (!enforceJsonContentType(req, res)) return;
    const v = validateBody(req.body);
    if (!v.ok) {
      apiError(res, 400, "INVALID_FIELD", v.message);
      return;
    }
    const current = await readLog(id);
    const result = appendPatchLog(current, v.baseCount, v.patches);
    if (!result.ok) {
      // 409 — the client's base is stale (another writer) or the log is full.
      // Body carries the server's count so the client falls back cleanly.
      res.status(409).json({ ok: false, reason: result.reason, count: result.count });
      return;
    }
    try {
      await kv.set(designPatchesKey(id), [...result.next]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown storage error";
      const isSizeError =
        /size|too large|max-?value/i.test(message) ||
        (typeof (err as { status?: number }).status === "number" &&
          (err as { status: number }).status === 413);
      if (isSizeError) {
        // Tell the client to compact (full snapshot) — same shape as a conflict.
        res.status(409).json({ ok: false, reason: "overflow", count: current.length });
        return;
      }
      throw err;
    }
    res.status(200).json({ ok: true, count: result.count });
    return;
  }

  res.setHeader("Allow", "GET, POST");
  apiError(res, 405, "INVALID_METHOD", "Method not allowed");
}
