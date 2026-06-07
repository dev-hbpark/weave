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
  /** A poster/thumbnail image URL DERIVED from `url` (no network fetch), or
   *  null when the provider has none. Used as the editor poster (before the
   *  iframe mounts) and as the export/static-capture fallback. */
  toThumbnailUrl(url: string): string | null;
  /** The provider's oEmbed endpoint for `url` (CORS-enabled JSON: title +
   *  thumbnail), or null. Fetched lazily by `oembed.ts` for accessibility /
   *  a Vimeo poster — never required for the iframe to work. */
  oembedEndpoint(url: string): string | null;
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

/** Start offset in WHOLE SECONDS from a YouTube `t` / `start` param. Accepts a
 *  plain seconds count (`90`, `90s`) or the `1h2m3s` form. Null when absent. */
function youtubeStartSeconds(url: string): number | null {
  const m = url.match(/[?&](?:t|start)=([0-9hms]+)/i);
  const raw = m?.[1];
  if (raw === undefined) return null;
  if (/^\d+s?$/.test(raw)) {
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const hms = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (hms === null) return null;
  const total = Number(hms[1] ?? 0) * 3600 + Number(hms[2] ?? 0) * 60 + Number(hms[3] ?? 0);
  return total > 0 ? total : null;
}

const YOUTUBE: EmbedProvider = {
  id: "youtube",
  label: "YouTube",
  match(url) {
    return /(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/i.test(url);
  },
  toEmbedUrl(url) {
    const id = youtubeVideoId(url);
    if (id === null) return null;
    const start = youtubeStartSeconds(url);
    // Privacy-enhanced embed domain (no cookies until the user plays). Carry a
    // share-link start offset through as `?start=<sec>`.
    const base = `https://www.youtube-nocookie.com/embed/${id}`;
    return start !== null ? `${base}?start=${start}` : base;
  },
  toThumbnailUrl(url) {
    const id = youtubeVideoId(url);
    // Derived poster — `hqdefault` exists for every video (no API key/fetch).
    return id !== null ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
  },
  oembedEndpoint(url) {
    return youtubeVideoId(url) !== null
      ? `https://www.youtube.com/oembed?url=${encodeURIComponent(url.trim())}&format=json`
      : null;
  },
};

/** Numeric Vimeo id from `vimeo.com/<id>` or `player.vimeo.com/video/<id>`. */
function vimeoVideoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d{6,})(?:[?&#/]|$)/);
  return m?.[1] ?? null;
}

const VIMEO: EmbedProvider = {
  id: "vimeo",
  label: "Vimeo",
  match(url) {
    return /vimeo\.com/i.test(url);
  },
  toEmbedUrl(url) {
    const id = vimeoVideoId(url);
    return id !== null ? `https://player.vimeo.com/video/${id}` : null;
  },
  // Vimeo posters require an oEmbed/API call (no predictable URL) → none here;
  // the oEmbed fetch (oembed.ts) supplies the poster + title.
  toThumbnailUrl() {
    return null;
  },
  oembedEndpoint(url) {
    return vimeoVideoId(url) !== null
      ? `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url.trim())}`
      : null;
  },
};

/** Loom share id (32 hex chars) from `loom.com/share/<id>`. */
function loomVideoId(url: string): string | null {
  const m = url.match(/loom\.com\/(?:share|embed)\/([0-9a-f]{32})(?:[?&#/]|$)/i);
  return m?.[1] ?? null;
}

const LOOM: EmbedProvider = {
  id: "loom",
  label: "Loom",
  match(url) {
    return /loom\.com/i.test(url);
  },
  toEmbedUrl(url) {
    const id = loomVideoId(url);
    return id !== null ? `https://www.loom.com/embed/${id}` : null;
  },
  toThumbnailUrl() {
    return null; // oEmbed supplies the poster.
  },
  oembedEndpoint(url) {
    return loomVideoId(url) !== null
      ? `https://www.loom.com/v1/oembed?url=${encodeURIComponent(url.trim())}`
      : null;
  },
};

/** Provider SSOT — ordered; first `match` wins. Add a provider = one entry. */
export const EMBED_PROVIDERS: ReadonlyArray<EmbedProvider> = [YOUTUBE, VIMEO, LOOM];

export interface ResolvedEmbed {
  readonly provider: EmbedProvider;
  readonly embedUrl: string;
  /** Derived poster image, or null when the provider has none. */
  readonly thumbnailUrl: string | null;
}

/** Resolve a pasted URL to its provider + iframe src (+ poster), or null when
 *  no provider recognizes it or it can't be parsed into a concrete embed. */
export function resolveEmbed(url: string): ResolvedEmbed | null {
  if (url.trim() === "") return null;
  for (const provider of EMBED_PROVIDERS) {
    if (!provider.match(url)) continue;
    const embedUrl = provider.toEmbedUrl(url);
    if (embedUrl !== null) {
      return { provider, embedUrl, thumbnailUrl: provider.toThumbnailUrl(url) };
    }
  }
  return null;
}
