// WI-025 — single-design endpoint.
//
// GET    /api/designs/:id  → full Design JSON
// DELETE /api/designs/:id  → remove from KV + index

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { deviceScope, ensureDeviceId } from "../_lib/device-id.js";
import { kv } from "../_lib/kv.js";

function designKey(did: string, id: string): string {
  return `${deviceScope(did)}:design:${id}`;
}

function indexKey(did: string): string {
  return `${deviceScope(did)}:designs`;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const did = ensureDeviceId(req, res);
  const idParam = req.query.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  if (typeof id !== "string" || id.length === 0) {
    res.status(400).json({ error: "Missing design id" });
    return;
  }

  if (req.method === "GET") {
    const d = await kv.get(designKey(did, id));
    if (d === null) {
      res.status(404).json({ error: "Design not found" });
      return;
    }
    res.status(200).json({ design: d });
    return;
  }

  if (req.method === "DELETE") {
    await kv.del(designKey(did, id));
    const ids = (await kv.get<string[]>(indexKey(did))) ?? [];
    await kv.set(
      indexKey(did),
      ids.filter((x) => x !== id),
    );
    res.status(200).json({ ok: true });
    return;
  }

  res.setHeader("Allow", "GET, DELETE");
  res.status(405).json({ error: "Method not allowed" });
}
