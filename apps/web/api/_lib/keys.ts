// Globally shared workspace — every client reads and writes the same KV
// prefix. There are no accounts, no devices, no per-user scoping. See
// `apps/web/CLAUDE.md` § "Security model" for the security implications.

export const GLOBAL_SCOPE = "shared";

export function designKey(id: string): string {
  return `${GLOBAL_SCOPE}:design:${id}`;
}

export function designIndexKey(): string {
  return `${GLOBAL_SCOPE}:designs`;
}

export function resourceKey(id: string): string {
  return `${GLOBAL_SCOPE}:resource:${id}`;
}

export function resourceIndexKey(): string {
  return `${GLOBAL_SCOPE}:resources`;
}

/** Blob storage path. All uploaded blobs share the same top-level
 *  prefix so they are listed under one folder in the Vercel Blob UI. */
export function blobPath(filename: string): string {
  return `${GLOBAL_SCOPE}/${filename}`;
}
