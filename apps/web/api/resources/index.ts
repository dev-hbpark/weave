// WI-025 — resources collection endpoint (globally shared workspace).
//
// GET  /api/resources                 → list all resource metadata
// POST /api/resources                 → upload a new resource. The blob is
//      written to Vercel Blob; the public URL + metadata are written to
//      KV under `shared:resource:<id>`.
//
// In production we transcode data: URLs to Blob; in dev (no
// BLOB_READ_WRITE_TOKEN) we accept the data URL as-is and store it
// directly in KV (works for small files).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { put } from "@vercel/blob";
import { apiError } from "../_lib/errors.js";
import { blobPath, resourceIndexKey, resourceKey } from "../_lib/keys.js";
import { assertKvAvailable, kv } from "../_lib/kv.js";
import {
  MAX_RESOURCE_BYTES,
  enforceContentLength,
  enforceJsonContentType,
  isAllowedSrc,
  isBoundedString,
} from "../_lib/validate.js";

interface ResourceRecord {
  readonly id: string;
  readonly kind: "image" | "video";
  readonly src: string;
  readonly name: string;
  readonly addedAt: string;
  readonly sessionOnly: boolean;
}

async function readIndex(): Promise<string[]> {
  return ((await kv.get<string[]>(resourceIndexKey())) ?? []);
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

interface ParsedBody {
  kind: ResourceRecord["kind"];
  name: string;
  src?: string;
  dataUrl?: string;
}

function validateResourceBody(body: unknown):
  | { ok: true; value: ParsedBody }
  | { ok: false; code: "MISSING_FIELD" | "INVALID_FIELD"; message: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, code: "INVALID_FIELD", message: "Body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  if (b.kind !== "image" && b.kind !== "video") {
    return { ok: false, code: "INVALID_FIELD", message: 'kind must be "image" or "video"' };
  }
  if (!isBoundedString(b.name, 256)) {
    return { ok: false, code: "INVALID_FIELD", message: "name must be string ≤ 256 chars" };
  }
  const parsed: ParsedBody = { kind: b.kind, name: b.name };
  if (typeof b.src === "string" && b.src.length > 0) {
    if (!isAllowedSrc(b.src)) {
      return { ok: false, code: "INVALID_FIELD", message: "src protocol not allowed" };
    }
    parsed.src = b.src;
  } else if (typeof b.dataUrl === "string" && b.dataUrl.length > 0) {
    if (!b.dataUrl.startsWith("data:")) {
      return { ok: false, code: "INVALID_FIELD", message: "dataUrl must start with data:" };
    }
    if (b.dataUrl.length > MAX_RESOURCE_BYTES * 2) {
      return { ok: false, code: "INVALID_FIELD", message: "dataUrl too large" };
    }
    parsed.dataUrl = b.dataUrl;
  } else {
    return { ok: false, code: "MISSING_FIELD", message: "Missing src or dataUrl" };
  }
  return { ok: true, value: parsed };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (!assertKvAvailable(res)) return;

  if (req.method === "GET") {
    const ids = await readIndex();
    const records: ResourceRecord[] = [];
    for (const id of ids) {
      const r = await kv.get<ResourceRecord>(resourceKey(id));
      if (r !== null) records.push(r);
    }
    records.sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
    res.status(200).json({ resources: records });
    return;
  }

  if (req.method === "POST") {
    if (!enforceContentLength(req, res, MAX_RESOURCE_BYTES)) return;
    if (!enforceJsonContentType(req, res)) return;
    const v = validateResourceBody(req.body);
    if (!v.ok) {
      apiError(res, 400, v.code, v.message);
      return;
    }
    const { kind, name } = v.value;
    let src: string;
    if (v.value.src !== undefined) {
      src = v.value.src;
    } else {
      const dataUrl = v.value.dataUrl as string;
      if (HAS_BLOB) {
        const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
        if (match === null) {
          apiError(res, 400, "INVALID_FIELD", "Malformed data URL");
          return;
        }
        const mime = match[1]!;
        const buf = Buffer.from(match[2]!, "base64");
        const blob = await put(blobPath(`${generateId(kind)}-${name}`), buf, {
          access: "public",
          contentType: mime,
        });
        src = blob.url;
      } else {
        src = dataUrl;
      }
    }
    const record: ResourceRecord = {
      id: generateId(kind),
      kind,
      src,
      name,
      addedAt: new Date().toISOString(),
      sessionOnly: src.startsWith("blob:") || (src.startsWith("data:") && !HAS_BLOB),
    };
    await kv.set(resourceKey(record.id), record);
    const ids = await readIndex();
    await kv.set(resourceIndexKey(), [record.id, ...ids]);
    res.status(200).json({ resource: record });
    return;
  }

  res.setHeader("Allow", "GET, POST");
  apiError(res, 405, "INVALID_METHOD", "Method not allowed");
}
