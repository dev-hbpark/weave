// WI-020 Phase 3 — image content View.  WI-074 / DR-029 — interactive crop.
//
// WI-243 / DR-160 — ViewModel + pure View ({ vm } only). WI-244 / DR-161 — the
// crop UI (committed render + crop editor) is media-generic and lives in
// `media/crop-editor.tsx`; this View supplies an `<img>` via the media render-prop.
// The frame-box aspect (drives the rotation cover-zoom) is a DOM measurement the
// View owns and threads into the crop/image content.

import type { CSSProperties, JSX } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import type { AgoItem, ImageAttrs } from "../types.js";
import { type ImageItemVm, useImageItemViewModel } from "./image-item-view-model.js";
import { MediaPlaceholder } from "./MediaPlaceholder.js";
import { CropEditor, CroppedMedia } from "./media/crop-editor.js";

interface ImageBlockProps {
  readonly item: AgoItem<"image">;
  readonly onUpdate?: (patch: Partial<ImageAttrs>) => void;
}

/** Placeholder shown when an image item has no `src` (WI-076). */
function ImagePlaceholder({ alt }: { readonly alt: string }): JSX.Element {
  return (
    <MediaPlaceholder
      testId="image-placeholder"
      alt={alt}
      glyph={
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-4.5-4.5L5 21" />
        </>
      }
    />
  );
}

/** Pure content View for an image item — renders from `{ vm }` ONLY. Owns the
 *  DOM-measured frame-box aspect and supplies an `<img>` to the shared media-crop
 *  components. */
export function ImageView({ vm }: { readonly vm: ImageItemVm }): JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(1);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (el === null) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.height > 0) setAspect(r.width / r.height);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={boxRef}
      className={vm.wrapperClassName}
      style={vm.wrapperStyle}
      {...(vm.onEnterCrop !== undefined
        ? {
            onDoubleClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              vm.onEnterCrop?.();
            },
          }
        : {})}
    >
      {vm.status === "culled" ? null : vm.status === "placeholder" ? (
        <ImagePlaceholder alt={vm.alt} />
      ) : vm.status === "crop" ? (
        <CropEditor
          initial={vm.crop}
          aspect={aspect}
          objectFit={vm.objectFit}
          filterCss={vm.filterCss}
          media={(style: CSSProperties) => (
            <img src={vm.src} alt={vm.alt} draggable={false} decoding="async" style={style} />
          )}
        />
      ) : (
        <CroppedMedia
          crop={vm.crop}
          aspect={aspect}
          objectFit={vm.objectFit}
          filterCss={vm.filterCss}
          media={(style: CSSProperties) => (
            <img
              src={vm.src}
              alt={vm.alt}
              draggable={false}
              loading="lazy"
              decoding="async"
              style={style}
            />
          )}
        />
      )}
    </div>
  );
}

/** Registered renderer. Thin shim: resolve the ViewModel, render the pure View.
 *  WI-243 transitional — Phase-0 facet will register `useViewModel`/`view`. */
export function ImageBlock({ item, onUpdate }: ImageBlockProps): JSX.Element {
  const vm = useImageItemViewModel(item, onUpdate);
  return <ImageView vm={vm} />;
}
