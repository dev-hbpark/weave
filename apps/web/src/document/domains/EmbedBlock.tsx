// WI-139 — embed content View. An `embed` item stores only `attrs.url`; the
// iframe `src`, the interactive gate, the poster fallback, and the body status
// are all DERIVED in `embed-item-view-model.ts`. WI-243 / DR-160 — `EmbedView`
// renders from `{ vm }` ONLY (never reads `item.*`), switching on the VM's
// `placeholder | iframe | poster | fallback` status.
//
// Interactivity (WI-139): the iframe mounts only when interactive (present/read-
// only always; editor only while selected); otherwise a derived thumbnail poster
// (img + play badge) that is pointer-inert (first click selects) and is captured
// by export/static rendering (an <img>, not an iframe).

import type { JSX } from "react";
import type { AgoItem, EmbedAttrs } from "../types.js";
import { type EmbedItemVm, useEmbedItemViewModel } from "./embed-item-view-model.js";
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

/** Pure content View for an embed item — renders from `{ vm }` ONLY. */
export function EmbedView({ vm }: { readonly vm: EmbedItemVm }): JSX.Element {
  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ opacity: vm.opacity }}
      data-testid="block-embed-inner"
    >
      {vm.status === "placeholder" ? (
        <MediaPlaceholder testId="embed-placeholder" alt={vm.alt} glyph={PLAY_GLYPH} />
      ) : vm.status === "iframe" ? (
        <iframe
          title={vm.title}
          src={vm.src}
          data-testid="embed-iframe"
          className="absolute inset-0 h-full w-full"
          style={{ border: 0 }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen={vm.allowFullscreen}
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : vm.status === "poster" ? (
        // Decorative poster — pointer-inert so the first click selects the frame.
        <div
          className="absolute inset-0"
          style={{ pointerEvents: "none" }}
          data-testid="embed-poster"
        >
          <img
            src={vm.posterUrl}
            alt={vm.alt}
            draggable={false}
            onError={vm.onPosterError}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
              <svg viewBox="0 0 24 24" width={22} height={22} fill="#fff" aria-hidden role="img">
                <title>재생</title>
                <path d="M9 7.5l8 4.5-8 4.5z" />
              </svg>
            </span>
          </span>
        </div>
      ) : (
        <MediaPlaceholder testId="embed-placeholder" alt={vm.alt} glyph={PLAY_GLYPH} />
      )}
    </div>
  );
}

/** Registered renderer. Thin shim: resolve the ViewModel, render the pure View.
 *  WI-243 transitional — Phase-0 facet will register `useViewModel`/`view`. */
export function EmbedBlock({ item, onUpdate }: EmbedBlockProps): JSX.Element {
  const vm = useEmbedItemViewModel(item, onUpdate);
  return <EmbedView vm={vm} />;
}
