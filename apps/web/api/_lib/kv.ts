// WI-025 — Vercel KV client. The `@vercel/kv` default export reads the
// `KV_REST_API_URL` / `KV_REST_API_TOKEN` env vars Vercel injects when a
// KV store is linked to the project. In preview / local-dev we fall back
// to an in-memory shim so missing env doesn't crash the API route.

import { kv as vercelKv } from "@vercel/kv";

interface KvClient {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  /** Pattern-scoped key listing — uses Redis SCAN cursor under the hood. */
  scan(cursor: number | string, opts?: { match?: string; count?: number }): Promise<[string, string[]]>;
}

const hasRemoteKv =
  typeof process !== "undefined" &&
  typeof process.env.KV_REST_API_URL === "string" &&
  process.env.KV_REST_API_URL.length > 0 &&
  typeof process.env.KV_REST_API_TOKEN === "string" &&
  process.env.KV_REST_API_TOKEN.length > 0;

const memory: Map<string, unknown> = new Map();

const memoryClient: KvClient = {
  async get<T>(key: string): Promise<T | null> {
    return (memory.get(key) as T | undefined) ?? null;
  },
  async set(key: string, value: unknown): Promise<unknown> {
    memory.set(key, value);
    return "OK";
  },
  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) if (memory.delete(k)) n++;
    return n;
  },
  async scan(
    _cursor: number | string,
    opts?: { match?: string; count?: number },
  ): Promise<[string, string[]]> {
    const matcher = opts?.match;
    const re =
      matcher !== undefined
        ? new RegExp(
            "^" + matcher.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
          )
        : null;
    const out: string[] = [];
    for (const k of memory.keys()) {
      if (re === null || re.test(k)) out.push(k);
    }
    return ["0", out];
  },
};

export const kv: KvClient = hasRemoteKv
  ? (vercelKv as unknown as KvClient)
  : memoryClient;

export const kvIsRemote = hasRemoteKv;
