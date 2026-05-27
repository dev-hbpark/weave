import {
  Button,
  ContextualToolbar as Bar,
  NumberSlider,
  SegmentedControl,
} from "@weave/design-system";
import type { ImageAttrs, ImageFit } from "@agocraft/core";
import {
  isMixed,
  MixedBadge,
  sharedValue,
  truncateUrl,
  updateAll,
} from "../multi-edit.js";
import type { ToolbarSectionComponent } from "./types.js";

const FIT_OPTIONS = [
  { value: "cover", label: "Cover" },
  { value: "contain", label: "Contain" },
  { value: "fill", label: "Fill" },
  { value: "none", label: "None" },
] as const;

export const ImageSection: ToolbarSectionComponent = ({
  editor,
  items,
  ids,
  multi,
  onEditMediaSrc,
}) => {
  const fit = sharedValue<ImageFit>(
    items,
    (it) => (it.attrs as unknown as ImageAttrs).fit,
  );
  const opacity = sharedValue<number>(
    items,
    (it) => (it.attrs as unknown as ImageAttrs).opacity,
  );
  const borderRadius = sharedValue<number>(
    items,
    (it) => (it.attrs as unknown as ImageAttrs).borderRadius,
  );
  const src = sharedValue<string>(
    items,
    (it) => (it.attrs as unknown as ImageAttrs).src,
  );
  return (
    <>
      <Bar.Section label="Source" priority={100}>
        <div className="inline-flex items-center">
          <Button
            variant="ghost"
            size="md"
            onClick={() =>
              onEditMediaSrc?.("image", isMixed(src) ? "" : src)
            }
            data-testid="image-edit-src"
            disabled={multi && isMixed(src)}
          >
            {isMixed(src)
              ? "여러 소스"
              : src
                ? truncateUrl(src)
                : "URL 입력…"}
          </Button>
          <MixedBadge visible={isMixed(src)} />
        </div>
      </Bar.Section>
      <Bar.Divider />
      <Bar.Section label="Fit" priority={80}>
        <div className="inline-flex items-center">
          <SegmentedControl<ImageFit>
            value={isMixed(fit) ? ("cover" as ImageFit) : fit}
            onValueChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, fit: v },
              }))
            }
            options={FIT_OPTIONS as unknown as ReadonlyArray<{
              value: ImageFit;
              label: string;
            }>}
            aria-label="Image fit"
          />
          <MixedBadge visible={isMixed(fit)} />
        </div>
      </Bar.Section>
      <Bar.Divider />
      <Bar.Section label="Opacity" priority={50}>
        <div className="inline-flex items-center">
          <NumberSlider
            value={isMixed(opacity) ? 1 : opacity}
            onValueChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, opacity: v },
              }))
            }
            min={0}
            max={1}
            step={0.01}
            suffix=""
            format={(v) => `${Math.round(v * 100)}%`}
            aria-label="Image opacity"
          />
          <MixedBadge visible={isMixed(opacity)} />
        </div>
      </Bar.Section>
      <Bar.Divider />
      <Bar.Section label="Border radius" priority={40}>
        <div className="inline-flex items-center">
          <NumberSlider
            value={isMixed(borderRadius) ? 0 : borderRadius}
            onValueChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, borderRadius: v },
              }))
            }
            min={0}
            max={1}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}`}
            aria-label="Border radius"
          />
          <MixedBadge visible={isMixed(borderRadius)} />
        </div>
      </Bar.Section>
    </>
  );
};
