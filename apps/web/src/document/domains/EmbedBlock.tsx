// WI-139 — EmbedBlock renderer. An `embed` item stores only `attrs.url`; the
// iframe `src` is DERIVED here via the provider registry (resolveEmbed), so the
// renderer never trusts a stored src and only ever points the iframe at an
// allow-listed provider (YouTube → youtube-nocookie). Unrecognized / empty URL →
// MediaPlaceholder.
//
// Interactivity: in the EDITOR (`onUpdate` defined) the iframe is pointer-inert
// so the frame stays selectable / draggable; in PRESENT / read-only
// (`onUpdate` undefined) it is interactive so the viewer can play.

import type { JSX } from "react";
import { resolveEmbed } from "../embed/providers.js";
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
  // Editor → inert iframe (frame selectable); present/read-only → interactive.
  const interactive = onUpdate === undefined;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ opacity }}
      data-testid="block-embed-inner"
    >
      {resolved !== null ? (
        <iframe
          title={a.title ?? "Embedded video"}
          src={resolved.embedUrl}
          data-testid="embed-iframe"
          className="absolute inset-0 h-full w-full"
          style={{ border: 0, pointerEvents: interactive ? "auto" : "none" }}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen={a.allowFullscreen ?? true}
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <MediaPlaceholder
          testId="embed-placeholder"
          alt={
            (a.url ?? "").trim() !== ""
              ? "임베드할 수 없는 URL이에요"
              : "YouTube URL을 붙여넣으세요"
          }
          glyph={PLAY_GLYPH}
        />
      )}
    </div>
  );
}
