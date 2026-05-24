// WI-025 — designs collection endpoint.
//
// GET  /api/designs        → list all designs for this device.
// POST /api/designs        → upsert a design (body = full Design JSON).
//
// Storage: each design is one KV entry under
//   `did:<did>:design:<designId>` = stringified Design.
// An index key `did:<did>:designs` holds an array of design IDs newest-
// first so listing doesn't need a SCAN. List endpoint hydrates the
// summary (id/title/size/timestamps/background) directly from each blob.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { deviceScope, ensureDeviceId } from "../_lib/device-id.js";
import { apiError } from "../_lib/errors.js";
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

const INDEX_SUFFIX = ":designs";

function designKey(did: string, id: string): string {
  return `${deviceScope(did)}:design:${id}`;
}

function indexKey(did: string): string {
  return `${deviceScope(did)}${INDEX_SUFFIX}`;
}

async function readIndex(did: string): Promise<string[]> {
  const ids = await kv.get<string[]>(indexKey(did));
  return Array.isArray(ids) ? ids : [];
}

async function writeIndex(did: string, ids: ReadonlyArray<string>): Promise<void> {
  await kv.set(indexKey(did), [...ids]);
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
  const did = ensureDeviceId(req, res);

  if (req.method === "GET") {
    const ids = await readIndex(did);
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
      const d = await kv.get<StoredDesign>(designKey(did, id));
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
    await kv.set(designKey(did, design.id), design);
    const ids = await readIndex(did);
    const next = [design.id, ...ids.filter((x) => x !== design.id)];
    await writeIndex(did, next);
    res.status(200).json({ ok: true, id: design.id });
    return;
  }

  res.setHeader("Allow", "GET, POST");
  apiError(res, 405, "INVALID_METHOD", "Method not allowed");
}
