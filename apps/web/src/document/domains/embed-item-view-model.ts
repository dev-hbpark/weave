// WI-139 + WI-243 / DR-160 — embed content ViewModel (per-item, content surface).
//
// An `embed` stores only `attrs.url`; the iframe `src` is DERIVED via the
// provider registry (resolveEmbed) so the renderer never trusts a stored src.
// This VM owns ALL of that: provider resolution, the interactive gate (present/
// read-only always plays; editor plays only while selected), the live oEmbed
// poster fallback, the broken-poster transient state, and the 4-way body status
// (`placeholder | iframe | poster | fallback`). The View binds to `{ vm }` only.

import { useCallback, useState } from "react";
import { useEmbedMeta } from "../embed/oembed.js";
import { appendQuery, resolveEmbed } from "../embed/providers.js";
import { useSelection } from "../interactions/selection-context.js";
import type { AgoItem, EmbedAttrs } from "../types.js";

export type EmbedItemVm =
  | { readonly status: "placeholder"; readonly opacity: number; readonly alt: string }
  | {
      readonly status: "iframe";
      readonly opacity: number;
      readonly title: string;
      readonly src: string;
      readonly allowFullscreen: boolean;
    }
  | {
      readonly status: "poster";
      readonly opacity: number;
      readonly posterUrl: string;
      readonly alt: string;
      readonly onPosterError: () => void;
    }
  | { readonly status: "fallback"; readonly opacity: number; readonly alt: string };

export function useEmbedItemViewModel(
  item: AgoItem<"embed">,
  onUpdate?: (patch: Partial<EmbedAttrs>) => void,
): EmbedItemVm {
  const a = item.attrs;
  const resolved = resolveEmbed(a.url ?? "");
  const opacity = a.opacity ?? 1;
  // Safe outside an editor session too (no-op vm fallback → empty selection).
  const { selectedIds } = useSelection();
  // Present/read-only → always playable. Editor → playable ONLY while selected,
  // so the first click selects (iframe inert) and the next click plays.
  const interactive = onUpdate === undefined || selectedIds.has(String(item.id));
  // Live oEmbed fetch is a FALLBACK only — for a provider with no derived poster
  // (Vimeo / Loom) whose poster hasn't been persisted yet.
  const needsLiveMeta =
    resolved !== null && resolved.thumbnailUrl === null && a.posterUrl === undefined;
  const meta = useEmbedMeta(a.url ?? "", needsLiveMeta);
  const title = a.title ?? meta?.title;
  // Holds the thumbnail URL that failed to load (404 / offline) → fall back to
  // the placeholder. Keyed by URL so a new video re-attempts its own poster.
  const [brokenPoster, setBrokenPoster] = useState<string | null>(null);
  const candidatePoster =
    resolved !== null ? (resolved.thumbnailUrl ?? a.posterUrl ?? meta?.thumbnailUrl ?? null) : null;
  const posterUrl =
    candidatePoster !== null && candidatePoster !== brokenPoster ? candidatePoster : null;
  // Auto-play (muted) only in PRESENT mode — never while editing.
  const iframeSrc =
    resolved !== null && onUpdate === undefined && a.autoplay === true
      ? appendQuery(resolved.embedUrl, resolved.provider.autoplayParams())
      : (resolved?.embedUrl ?? "");
  const onPosterError = useCallback(() => {
    if (posterUrl !== null) setBrokenPoster(posterUrl);
  }, [posterUrl]);

  // Three+1 states: unrecognized URL → placeholder; recognized + interactive →
  // live iframe (plays); recognized + inert + poster → thumbnail; else fallback.
  if (resolved === null) {
    const alt =
      (a.url ?? "").trim() !== "" ? "임베드할 수 없는 URL이에요" : "YouTube URL을 붙여넣으세요";
    return { status: "placeholder", opacity, alt };
  }
  if (interactive) {
    return {
      status: "iframe",
      opacity,
      title: title ?? "Embedded video",
      src: iframeSrc,
      allowFullscreen: a.allowFullscreen ?? true,
    };
  }
  if (posterUrl !== null) {
    return { status: "poster", opacity, posterUrl, alt: title ?? "동영상 미리보기", onPosterError };
  }
  return { status: "fallback", opacity, alt: title ?? "동영상" };
}
