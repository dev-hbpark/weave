// WI-139 — convergent controller that persists oEmbed titles onto embed items.
//
// Mirrors useChartLabelSync: a DERIVED-state projection applied via
// `reconcileDerived` (no history entry, not a user action). For each recognized
// embed url that still lacks a title, fetch its oEmbed title ONCE and write it to
// every titleless embed with that url. Once written it persists (serialized) and
// is never refetched. Deduped by url across the session; aborted on unmount.

import type { Document as AgocraftDocument } from "@agocraft/core";
import { useEffect, useRef } from "react";
import { collectTitlelessEmbedUrls, setEmbedTitle } from "./embed-title-sync.js";
import { fetchEmbedMeta } from "./oembed.js";

export function useEmbedTitleSync(
  reconcileDerived: (transform: (doc: AgocraftDocument) => AgocraftDocument) => void,
  doc: AgocraftDocument,
): void {
  // Urls we've already kicked a fetch for (success OR failure) → never refetch.
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = collectTitlelessEmbedUrls(doc);
    if (urls.size === 0) return;
    const ctrl = new AbortController();
    for (const url of urls) {
      if (fetchedRef.current.has(url)) continue;
      fetchedRef.current.add(url);
      void fetchEmbedMeta(url, ctrl.signal).then((meta) => {
        const title = meta?.title;
        if (title === undefined || title === "" || ctrl.signal.aborted) return;
        reconcileDerived((d) => setEmbedTitle(d, url, title));
      });
    }
    return () => ctrl.abort();
  }, [doc, reconcileDerived]);
}
