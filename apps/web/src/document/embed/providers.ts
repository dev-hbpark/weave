// WI-139 — embed provider registry.
//
// An `embed` item stores only the user-pasted `url`. The iframe `src` is DERIVED
// here at render time. Rule 6: URL → embed is NOT a switch inside the renderer —
// it is a registry of provider adapters (one per source). Adding Vimeo / Loom /
// … = one entry, no renderer edit. Only allow-listed providers produce a src, so
// the iframe can never be pointed at an arbitrary script-bearing page.

export interface EmbedProvider {
  /** Stable id stored on `attrs.provider` (advisory) and used in tests. */
  readonly id: string;
  /** Human label for the toolbar badge. */
  readonly label: string;
  /** Does this provider handle `url`? */
  match(url: string): boolean;
  /** The iframe `src` for `url`, or null when it can't be parsed. */
  toEmbedUrl(url: string): string | null;
}

/** Parse an 11-char YouTube video id from any common URL form:
 *  watch?v= / youtu.be/ / embed/ / shorts/ / live/  (with optional query). */
function youtubeVideoId(url: string): string | null {
  const trimmed = url.trim();
  // `v=<id>` query param (watch URLs, and some embeds).
  const vParam = trimmed.match(/[?&]v=([A-Za-z0-9_-]{11})(?:[&#]|$)/);
  if (vParam?.[1]) return vParam[1];
  // Path forms: youtu.be/<id>, /embed/<id>, /shorts/<id>, /live/<id>.
  const path = trimmed.match(
    /(?:youtu\.be\/|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})(?:[?&#/]|$)/,
  );
  if (path?.[1]) return path[1];
  return null;
}

const YOUTUBE: EmbedProvider = {
  id: "youtube",
  label: "YouTube",
  match(url) {
    return /(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/i.test(url);
  },
  toEmbedUrl(url) {
    const id = youtubeVideoId(url);
    // Privacy-enhanced embed domain (no cookies until the user plays).
    return id !== null ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  },
};

/** Provider SSOT — ordered; first `match` wins. Add a provider = one entry. */
export const EMBED_PROVIDERS: ReadonlyArray<EmbedProvider> = [YOUTUBE];

export interface ResolvedEmbed {
  readonly provider: EmbedProvider;
  readonly embedUrl: string;
}

/** Resolve a pasted URL to its provider + iframe src, or null when no provider
 *  recognizes it or it can't be parsed into a concrete embed. */
export function resolveEmbed(url: string): ResolvedEmbed | null {
  if (url.trim() === "") return null;
  for (const provider of EMBED_PROVIDERS) {
    if (!provider.match(url)) continue;
    const embedUrl = provider.toEmbedUrl(url);
    if (embedUrl !== null) return { provider, embedUrl };
  }
  return null;
}
