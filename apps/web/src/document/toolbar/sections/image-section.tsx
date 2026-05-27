// DR-design-015 — image kind in Tier-2 layout.
//
// Quick: replace-src icon (only one common action — open the URL dialog).
// More: Fit · Opacity · Border radius.

import type { ImageAttrs, ImageFit } from "@agocraft/core";
import {
  ContextualToolbar as Bar,
  Button,
  IconButton,
  IconImage,
  IconRefresh,
  NumberSlider,
  SegmentedControl,
} from "@weave/design-system";
import { isMixed, MixedBadge, sharedValue, truncateUrl, updateAll } from "../multi-edit.js";
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
  const fit = sharedValue<ImageFit>(items, (it) => (it.attrs as unknown as ImageAttrs).fit);
  const opacity = sharedValue<number>(items, (it) => (it.attrs as unknown as ImageAttrs).opacity);
  const borderRadius = sharedValue<number>(
    items,
    (it) => (it.attrs as unknown as ImageAttrs).borderRadius,
  );
  const src = sharedValue<string>(items, (it) => (it.attrs as unknown as ImageAttrs).src);
  return (
    <>
      <Bar.Kind icon={<IconImage size={18} />} label="Image" />
      <Bar.Quick>
        <IconButton
          aria-label="이미지 교체"
          data-tip={isMixed(src) ? "여러 소스" : src ? truncateUrl(src) : "URL 입력…"}
          size="sm"
          onClick={() => onEditMediaSrc?.("image", isMixed(src) ? "" : src)}
          data-testid="image-edit-src"
          disabled={multi && isMixed(src)}
        >
          <IconRefresh size={16} />
        </IconButton>
      </Bar.Quick>
      <Bar.More>
        <Bar.Field label="Source">
          <Button
            variant="ghost"
            size="md"
            onClick={() => onEditMediaSrc?.("image", isMixed(src) ? "" : src)}
            disabled={multi && isMixed(src)}
            className="w-full justify-start"
          >
            {isMixed(src) ? "여러 소스" : src ? truncateUrl(src) : "URL 입력…"}
          </Button>
          <MixedBadge visible={isMixed(src)} />
        </Bar.Field>
        <Bar.Field label="Fit">
          <SegmentedControl<ImageFit>
            value={isMixed(fit) ? ("cover" as ImageFit) : fit}
            onValueChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, fit: v },
              }))
            }
            options={
              FIT_OPTIONS as unknown as ReadonlyArray<{
                value: ImageFit;
                label: string;
              }>
            }
            aria-label="Image fit"
          />
          <MixedBadge visible={isMixed(fit)} />
        </Bar.Field>
        <Bar.Field label="Opacity">
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
            className="w-full"
          />
          <MixedBadge visible={isMixed(opacity)} />
        </Bar.Field>
        <Bar.Field label="Border radius">
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
            className="w-full"
          />
          <MixedBadge visible={isMixed(borderRadius)} />
        </Bar.Field>
      </Bar.More>
    </>
  );
};
