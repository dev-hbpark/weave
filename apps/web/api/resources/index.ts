// WI-025 — resources collection endpoint.
//
// GET  /api/resources                 → list all resource metadata
// POST /api/resources (multipart/form) → upload a new resource. The blob
//      is written to Vercel Blob; the public URL + metadata are written
//      to KV under `did:<did>:resource:<id>`.
//
// To keep the bundle small we use Vercel Blob's client-direct upload only
// in production; in dev (no BLOB_READ_WRITE_TOKEN) we accept the body as
// a base-64 data URL and store it directly in KV (works for small files).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { put } from "@vercel/blob";
import { deviceScope, ensureDeviceId } from "../_lib/device-id.js";
import { kv } from "../_lib/kv.js";

interface ResourceRecord {
  readonly id: string;
  readonly kind: "image" | "video";
  readonly src: string; // Either a https://*.public.blob.vercel-storage.com URL or a data: URL
  readonly name: string;
  readonly addedAt: string;
  readonly sessionOnly: boolean;
}

function resourceKey(did: string, id: string): string {
  return `${deviceScope(did)}:resource:${id}`;
}

function indexKey(did: string): string {
  return `${deviceScope(did)}:resources`;
}

async function readIndex(did: string): Promise<string[]> {
  return ((await kv.get<string[]>(indexKey(did))) ?? []);
}

function generateId(kind: ResourceRecord["kind"]): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${kind}-${ts}-${rand}`;
}

const HAS_BLOB =
  typeof process !== "undefined" &&
  typeof process.env.BLOB_READ_WRITE_TOKEN === "string" &&
  process.env.BLOB_READ_WRITE_TOKEN.length > 0;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const did = ensureDeviceId(req, res);

  if (req.method === "GET") {
    const ids = await readIndex(did);
    const records: ResourceRecord[] = [];
    for (const id of ids) {
      const r = await kv.get<ResourceRecord>(resourceKey(did, id));
      if (r !== null) records.push(r);
    }
    records.sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
    res.status(200).json({ resources: records });
    return;
  }

  if (req.method === "POST") {
    // Body shape: { kind, name, dataUrl } or { kind, name, src }
    // dataUrl uploads through Blob (production) or stores the data URL
    // directly in KV (dev / no blob token).
    const body = req.body as
      | { kind?: unknown; name?: unknown; dataUrl?: unknown; src?: unknown }
      | undefined;
    if (
      body === undefined ||
      typeof body.kind !== "string" ||
      (body.kind !== "image" && body.kind !== "video") ||
      typeof body.name !== "string"
    ) {
      res.status(400).json({ error: "Invalid resource payload" });
      return;
    }
    const kind = body.kind;
    const name = body.name;
    let src: string;
    if (typeof body.src === "string" && body.src.length > 0) {
      // Caller provided an already-hosted URL (e.g., user pasted from
      // anywhere). Store as-is, mark session-only if it's a blob: URL.
      src = body.src;
    } else if (typeof body.dataUrl === "string" && body.dataUrl.startsWith("data:")) {
      if (HAS_BLOB) {
        // Convert data URL → Buffer → push to Blob.
        const match = body.dataUrl.match(/^data:([^;]+);base64,(.*)$/);
        if (match === null) {
          res.status(400).json({ error: "Malformed data URL" });
          return;
        }
        const mime = match[1]!;
        const buf = Buffer.from(match[2]!, "base64");
        const blob = await put(`${did}/${generateId(kind)}-${name}`, buf, {
          access: "public",
          contentType: mime,
        });
        src = blob.url;
      } else {
        // Dev — keep the data: URL in KV.
        src = body.dataUrl;
      }
    } else {
      res.status(400).json({ error: "Missing src or dataUrl" });
      return;
    }
    const record: ResourceRecord = {
      id: generateId(kind),
      kind,
      src,
      name,
      addedAt: new Date().toISOString(),
      sessionOnly: src.startsWith("blob:") || src.startsWith("data:") && !HAS_BLOB,
    };
    await kv.set(resourceKey(did, record.id), record);
    const ids = await readIndex(did);
    await kv.set(indexKey(did), [record.id, ...ids]);
    res.status(200).json({ resource: record });
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Method not allowed" });
}
