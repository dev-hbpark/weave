// WI-139 — EmbedBlock renderer. An `embed` item stores only `attrs.url`; the
// iframe `src` is DERIVED here via the provider registry (resolveEmbed), so the
// renderer never trusts a stored src and only ever points the iframe at an
// allow-listed provider (YouTube → youtube-nocookie). Unrecognized / empty URL →
// MediaPlaceholder.
//
// Interactivity (WI-139 — "play only after selecting"): the iframe mounts ONLY
// when interactive — in PRESENT / read-only (`onUpdate` undefined) always, and
// in the EDITOR only while the embed is SELECTED. Otherwise we show a derived
// THUMBNAIL poster (img + play badge), which (a) is lighter than loading the
// iframe for every unselected embed, (b) lets the first click reach the frame to
// select it, and (c) is the export / static-capture fallback (an <img> is
// captured; an iframe is not). First click selects → iframe mounts → next click
// plays.

import { type JSX, useState } from "react";
import { useEmbedMeta } from "../embed/oembed.js";
import { appendQuery, resolveEmbed } from "../embed/providers.js";
import { useSelection } from "../interactions/selection-context.js";
import type { AgoItem, EmbedAttrs } from "../types.js";
import { MediaPlaceholder } from "./MediaPlaceholder.js";

interface EmbedBlockProps {
  readonly item: AgoItem<"embed">;
  readonly onUpdate?: (patch: Partial<EmbedAttrs>) => void;
}

// Play-in-circle glyph (viewBox 0 0 24 24, stroke currentColor — MediaPlaceholder).
const PLAY_GLYPH = (
  <>
    <circle cx={12} cy={12} r={9} />
    <path d="M10.5 8.7l5 3.3-5 3.3z" />
  </>
);

export function EmbedBlock({ item, onUpdate }: EmbedBlockProps): JSX.Element {
  const a = item.attrs;
  const resolved = resolveEmbed(a.url ?? "");
  const opacity = a.opacity ?? 1;
  // Safe outside an editor session too (no-op vm fallback → empty selection).
  const { selectedIds } = useSelection();
  // Present/read-only → always playable. Editor → playable ONLY while selected,
  // so the first click selects (iframe inert) and the next click plays.
  const interactive = onUpdate === undefined || selectedIds.has(String(item.id));
  // oEmbed (title + poster) is fetched ONLY when the provider has no offline
  // poster (Vimeo / Loom) — YouTube already derives both, so it never fetches.
  const meta = useEmbedMeta(a.url ?? "", resolved !== null && resolved.thumbnailUrl === null);
  const title = a.title ?? meta?.title;
  // Holds the thumbnail URL that failed to load (404 / offline) → fall back to
  // the placeholder. Keyed by URL so a new video re-attempts its own poster.
  const [brokenPoster, setBrokenPoster] = useState<string | null>(null);
  // Poster: derived (YouTube) ?? oEmbed (Vimeo/Loom), dropped if it failed to load.
  const candidatePoster =
    resolved !== null ? (resolved.thumbnailUrl ?? meta?.thumbnailUrl ?? null) : null;
  const posterUrl =
    candidatePoster !== null && candidatePoster !== brokenPoster ? candidatePoster : null;
  // Auto-play (muted) only in PRESENT mode — never while editing. Provider owns
  // its param names (mute vs muted).
  const iframeSrc =
    resolved !== null && onUpdate === undefined && a.autoplay === true
      ? appendQuery(resolved.embedUrl, resolved.provider.autoplayParams())
      : (resolved?.embedUrl ?? "");

  // Three states: unrecognized URL → placeholder; recognized + interactive →
  // live iframe (plays); recognized + inert → thumbnail poster.
  const body =
    resolved === null ? (
      <MediaPlaceholder
        testId="embed-placeholder"
        alt={
          (a.url ?? "").trim() !== "" ? "임베드할 수 없는 URL이에요" : "YouTube URL을 붙여넣으세요"
        }
        glyph={PLAY_GLYPH}
      />
    ) : interactive ? (
      <iframe
        title={title ?? "Embedded video"}
        src={iframeSrc}
        data-testid="embed-iframe"
        className="absolute inset-0 h-full w-full"
        style={{ border: 0 }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen={a.allowFullscreen ?? true}
        referrerPolicy="strict-origin-when-cross-origin"
      />
    ) : posterUrl !== null ? (
      // Decorative poster — pointer-inert so the first click selects the frame.
      // An <img> (not an iframe) is captured by export / static rendering.
      <div
        className="absolute inset-0"
        style={{ pointerEvents: "none" }}
        data-testid="embed-poster"
      >
        <img
          src={posterUrl}
          alt={title ?? "동영상 미리보기"}
          draggable={false}
          onError={() => setBrokenPoster(posterUrl)}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
            <svg viewBox="0 0 24 24" width={22} height={22} fill="#fff" aria-hidden>
              <path d="M9 7.5l8 4.5-8 4.5z" />
            </svg>
          </span>
        </span>
      </div>
    ) : (
      <MediaPlaceholder testId="embed-placeholder" alt={title ?? "동영상"} glyph={PLAY_GLYPH} />
    );

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ opacity }}
      data-testid="block-embed-inner"
    >
      {body}
    </div>
  );
}
