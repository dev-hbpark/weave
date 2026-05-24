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
import { apiError } from "../_lib/errors.js";
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
        const blob = await put(`${did}/${generateId(kind)}-${name}`, buf, {
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
    await kv.set(resourceKey(did, record.id), record);
    const ids = await readIndex(did);
    await kv.set(indexKey(did), [record.id, ...ids]);
    res.status(200).json({ resource: record });
    return;
  }

  res.setHeader("Allow", "GET, POST");
  apiError(res, 405, "INVALID_METHOD", "Method not allowed");
}
