// WI-139 — lazy oEmbed metadata (title + thumbnail).
//
// The iframe NEVER needs this — embed src + (YouTube) poster are derived offline
// from the url (providers.ts). oEmbed is a best-effort enhancement, fetched
// lazily: a real TITLE (iframe title / img alt → accessibility) and a poster for
// providers that have no derivable thumbnail (Vimeo / Loom). All failures
// degrade silently to the offline behavior.

import { useEffect, useState } from "react";
import { resolveEmbed } from "./providers.js";

export interface EmbedMeta {
  readonly title?: string;
  readonly thumbnailUrl?: string;
}

/** Fetch a url's oEmbed title + thumbnail, or null when the provider has no
 *  oEmbed endpoint / the request fails. Never throws. */
export async function fetchEmbedMeta(url: string, signal?: AbortSignal): Promise<EmbedMeta | null> {
  const resolved = resolveEmbed(url);
  const endpoint = resolved?.provider.oembedEndpoint(url) ?? null;
  if (endpoint === null) return null;
  try {
    const res = await fetch(endpoint, signal !== undefined ? { signal } : undefined);
    if (!res.ok) return null;
    const json = (await res.json()) as { title?: unknown; thumbnail_url?: unknown };
    const meta: EmbedMeta = {
      ...(typeof json.title === "string" ? { title: json.title } : {}),
      ...(typeof json.thumbnail_url === "string" ? { thumbnailUrl: json.thumbnail_url } : {}),
    };
    return meta.title !== undefined || meta.thumbnailUrl !== undefined ? meta : null;
  } catch {
    return null;
  }
}

/** Lazily fetch oEmbed metadata for `url`. Returns null until it resolves (or
 *  forever on failure). `enabled` gates the fetch so a provider that already has
 *  everything offline (YouTube title + poster) needn't hit the network. The
 *  request is aborted on url change / unmount. */
export function useEmbedMeta(url: string, enabled: boolean): EmbedMeta | null {
  const [meta, setMeta] = useState<EmbedMeta | null>(null);
  useEffect(() => {
    setMeta(null);
    if (!enabled || resolveEmbed(url) === null) return;
    const ctrl = new AbortController();
    void fetchEmbedMeta(url, ctrl.signal).then((m) => {
      if (m !== null && !ctrl.signal.aborted) setMeta(m);
    });
    return () => ctrl.abort();
  }, [url, enabled]);
  return meta;
}
