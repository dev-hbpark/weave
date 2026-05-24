// WI-025 — Vercel KV client. Vercel's Storage tab no longer exposes "KV"
// as a direct option; the supported path is Marketplace → Upstash → Redis,
// which injects env vars named UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.
// Older projects with the legacy "Vercel KV" addon still have
// KV_REST_API_URL / KV_REST_API_TOKEN. Accept either pair, and build the
// client explicitly with createClient instead of relying on the env-driven
// default singleton. In preview / local-dev we fall back to an in-memory
// shim so missing env doesn't crash the API route.

import { createClient } from "@vercel/kv";
import type { VercelResponse } from "@vercel/node";
import { apiError } from "./errors.js";

interface KvClient {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  scan(cursor: number | string, opts?: { match?: string; count?: number }): Promise<[string, string[]]>;
}

const env = typeof process !== "undefined" ? process.env : ({} as Record<string, string | undefined>);
const remoteUrl = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL ?? "";
const remoteToken = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN ?? "";
const hasRemoteKv = remoteUrl.length > 0 && remoteToken.length > 0;

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

const remoteClient: KvClient | null = hasRemoteKv
  ? (createClient({ url: remoteUrl, token: remoteToken }) as unknown as KvClient)
  : null;

export const kv: KvClient = remoteClient ?? memoryClient;

export const kvIsRemote = hasRemoteKv;

const vercelEnv = env.VERCEL_ENV ?? env.NODE_ENV ?? "";
const isProduction = vercelEnv === "production";

if (isProduction && !hasRemoteKv) {
  // Surface the misconfiguration in cold-start logs even before the first
  // request lands — production deploys without remote KV would otherwise
  // silently lose every save on the next cold start.
  console.error(
    "[weave/api/kv] PRODUCTION DEPLOY DETECTED BUT REMOTE KV ENV VARS ARE MISSING. " +
      "Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN " +
      "(or legacy KV_REST_API_URL + KV_REST_API_TOKEN) and redeploy.",
  );
}

/** Refuse a request if production is missing remote KV. Returns true when
 *  the request may proceed; false when the response has already been
 *  written with 503. Handlers must call this before touching `kv`. */
export function assertKvAvailable(res: VercelResponse): boolean {
  if (isProduction && !hasRemoteKv) {
    apiError(
      res,
      503,
      "STORAGE_UNAVAILABLE",
      "Persistent storage is not configured for this deployment",
    );
    return false;
  }
  return true;
}
