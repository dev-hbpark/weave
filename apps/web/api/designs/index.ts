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
import { kv } from "../_lib/kv.js";

interface StoredDesign {
  readonly id: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly background: string;
  readonly meta: { readonly createdAt: string; readonly updatedAt: string };
  // The rest of the agocraft document blob — opaque to this endpoint.
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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
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
    const body = req.body;
    if (!body || typeof body !== "object" || typeof (body as { id?: unknown }).id !== "string") {
      res.status(400).json({ error: "Invalid design payload (missing id)" });
      return;
    }
    const design = body as StoredDesign;
    await kv.set(designKey(did, design.id), design);
    // Maintain newest-first index.
    const ids = await readIndex(did);
    const next = [design.id, ...ids.filter((x) => x !== design.id)];
    await writeIndex(did, next);
    res.status(200).json({ ok: true, id: design.id });
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Method not allowed" });
}
