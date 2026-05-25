// WI-025 — designs collection endpoint (globally shared workspace).
//
// GET  /api/designs        → list every design in the shared workspace.
// POST /api/designs        → upsert a design (body = full Design JSON).
//
// Storage: each design is one KV entry under
//   `shared:design:<designId>` = stringified Design.
// An index key `shared:designs` holds an array of design IDs newest-first
// so listing doesn't need a SCAN. List endpoint hydrates the summary
// (id/title/size/timestamps/background) directly from each blob.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { apiError } from "../_lib/errors.js";
import { designIndexKey, designKey } from "../_lib/keys.js";
import { assertKvAvailable, kv } from "../_lib/kv.js";
import {
  MAX_DESIGN_BYTES,
  enforceContentLength,
  enforceJsonContentType,
  isBoundedString,
  isFiniteNumber,
  isIsoDateString,
  isValidId,
} from "../_lib/validate.js";

interface StoredDesign {
  readonly id: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly background: string;
  readonly meta: { readonly createdAt: string; readonly updatedAt: string };
  readonly [k: string]: unknown;
}

async function readIndex(): Promise<string[]> {
  const ids = await kv.get<string[]>(designIndexKey());
  return Array.isArray(ids) ? ids : [];
}

async function writeIndex(ids: ReadonlyArray<string>): Promise<void> {
  await kv.set(designIndexKey(), [...ids]);
}

function validateDesignBody(body: unknown):
  | { ok: true; value: StoredDesign }
  | { ok: false; code: "MISSING_FIELD" | "INVALID_FIELD"; message: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, code: "INVALID_FIELD", message: "Body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  if (!isValidId(b.id)) {
    return { ok: false, code: "INVALID_FIELD", message: "id must match [A-Za-z0-9_-]{1,64}" };
  }
  if (!isBoundedString(b.title, 256)) {
    return { ok: false, code: "INVALID_FIELD", message: "title must be string ≤ 256 chars" };
  }
  if (!isFiniteNumber(b.width, 1, 100_000)) {
    return { ok: false, code: "INVALID_FIELD", message: "width must be finite number in [1, 100000]" };
  }
  if (!isFiniteNumber(b.height, 1, 100_000)) {
    return { ok: false, code: "INVALID_FIELD", message: "height must be finite number in [1, 100000]" };
  }
  if (!isBoundedString(b.background, 64)) {
    return { ok: false, code: "INVALID_FIELD", message: "background must be string ≤ 64 chars" };
  }
  const meta = b.meta;
  if (meta === null || typeof meta !== "object") {
    return { ok: false, code: "MISSING_FIELD", message: "meta is required" };
  }
  const m = meta as Record<string, unknown>;
  if (!isIsoDateString(m.createdAt)) {
    return { ok: false, code: "INVALID_FIELD", message: "meta.createdAt must be ISO date string" };
  }
  if (!isIsoDateString(m.updatedAt)) {
    return { ok: false, code: "INVALID_FIELD", message: "meta.updatedAt must be ISO date string" };
  }
  return { ok: true, value: b as StoredDesign };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (!assertKvAvailable(res)) return;

  if (req.method === "GET") {
    const ids = await readIndex();
    const summaries: Array<{
      id: string;
      title: string;
      width: number;
      height: number;
      background: string;
      createdAt: string;
      updatedAt: string;
    }> = [];
    for (const id of ids) {
      const d = await kv.get<StoredDesign>(designKey(id));
      if (d === null) continue;
      summaries.push({
        id: d.id,
        title: d.title,
        width: d.width,
        height: d.height,
        background: d.background,
        createdAt: d.meta.createdAt,
        updatedAt: d.meta.updatedAt,
      });
    }
    summaries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    res.status(200).json({ designs: summaries });
    return;
  }

  if (req.method === "POST") {
    if (!enforceContentLength(req, res, MAX_DESIGN_BYTES)) return;
    if (!enforceJsonContentType(req, res)) return;
    const v = validateDesignBody(req.body);
    if (!v.ok) {
      apiError(res, 400, v.code, v.message);
      return;
    }
    const design = v.value;
    try {
      await kv.set(designKey(design.id), design);
    } catch (err) {
      // Upstash returns an error when a single value exceeds the per-key
      // cap (1 MB on the free tier, 10 MB on Pro). Surface this as a
      // separate stable code so the client can fall back to localStorage-
      // only mode for this design without disabling cloud sync entirely.
      const message =
        err instanceof Error ? err.message : "Unknown storage error";
      const isSizeError =
        /size|too large|max-?value/i.test(message)
        || (typeof (err as { status?: number }).status === "number"
          && (err as { status: number }).status === 413);
      if (isSizeError) {
        apiError(
          res,
          507,
          "STORAGE_LIMIT",
          `Design saved locally but the backing store rejected the value as too large. ${message}`,
        );
        return;
      }
      throw err;
    }
    const ids = await readIndex();
    const next = [design.id, ...ids.filter((x) => x !== design.id)];
    await writeIndex(next);
    res.status(200).json({ ok: true, id: design.id });
    return;
  }

  res.setHeader("Allow", "GET, POST");
  apiError(res, 405, "INVALID_METHOD", "Method not allowed");
}
