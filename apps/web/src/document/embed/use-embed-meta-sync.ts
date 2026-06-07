// WI-139 — convergent controller that persists oEmbed metadata (title + poster)
// onto embed items.
//
// Mirrors useChartLabelSync: a DERIVED-state projection applied via
// `reconcileDerived` (no history entry, not a user action). For each recognized
// embed url that still needs metadata, fetch its oEmbed payload ONCE and write
// the title (everywhere) + the poster (only for providers with no derivable
// thumbnail — Vimeo / Loom). Once written it persists (serialized) and is never
// refetched. Deduped by url across the session; aborted on unmount.

import type { Document as AgocraftDocument } from "@agocraft/core";
import { useEffect, useRef } from "react";
import { collectEmbedUrlsNeedingMeta, setEmbedMeta } from "./embed-meta-sync.js";
import { fetchEmbedMeta } from "./oembed.js";
import { resolveEmbed } from "./providers.js";

export function useEmbedMetaSync(
  reconcileDerived: (transform: (doc: AgocraftDocument) => AgocraftDocument) => void,
  doc: AgocraftDocument,
): void {
  // Urls we've already kicked a fetch for (success OR failure) → never refetch.
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = collectEmbedUrlsNeedingMeta(doc);
    if (urls.size === 0) return;
    const ctrl = new AbortController();
    for (const url of urls) {
      if (fetchedRef.current.has(url)) continue;
      fetchedRef.current.add(url);
      void fetchEmbedMeta(url, ctrl.signal).then((meta) => {
        if (meta === null || ctrl.signal.aborted) return;
        // Persist the poster only when the provider can't derive one (Vimeo/Loom).
        const noDerivedPoster = resolveEmbed(url)?.thumbnailUrl === null;
        reconcileDerived((d) =>
          setEmbedMeta(d, url, {
            ...(meta.title !== undefined ? { title: meta.title } : {}),
            ...(noDerivedPoster && meta.thumbnailUrl !== undefined
              ? { posterUrl: meta.thumbnailUrl }
              : {}),
          }),
        );
      });
    }
    return () => ctrl.abort();
  }, [doc, reconcileDerived]);
}
