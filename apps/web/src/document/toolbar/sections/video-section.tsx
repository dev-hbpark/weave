import {
  Button,
  ContextualToolbar as Bar,
  NumberSlider,
  SegmentedControl,
  Switch,
} from "@weave/design-system";
import type { VideoAttrs, VideoFit } from "@agocraft/core";
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

export const VideoSection: ToolbarSectionComponent = ({
  editor,
  items,
  ids,
  multi,
  onEditMediaSrc,
}) => {
  const fit = sharedValue<VideoFit>(
    items,
    (it) => (it.attrs as unknown as VideoAttrs).fit,
  );
  const loop = sharedValue<boolean>(
    items,
    (it) => (it.attrs as unknown as VideoAttrs).loop,
  );
  const muted = sharedValue<boolean>(
    items,
    (it) => (it.attrs as unknown as VideoAttrs).muted,
  );
  const volume = sharedValue<number>(
    items,
    (it) => (it.attrs as unknown as VideoAttrs).volume,
  );
  const src = sharedValue<string>(
    items,
    (it) => (it.attrs as unknown as VideoAttrs).src,
  );
  return (
    <>
      <Bar.Section label="Source">
        <div className="inline-flex items-center">
          <Button
            variant="ghost"
            size="md"
            onClick={() =>
              onEditMediaSrc?.("video", isMixed(src) ? "" : src)
            }
            data-testid="video-edit-src"
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
      <Bar.Section label="Fit">
        <div className="inline-flex items-center">
          <SegmentedControl<VideoFit>
            value={isMixed(fit) ? ("cover" as VideoFit) : fit}
            onValueChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, fit: v },
              }))
            }
            options={FIT_OPTIONS as unknown as ReadonlyArray<{
              value: VideoFit;
              label: string;
            }>}
            aria-label="Video fit"
          />
          <MixedBadge visible={isMixed(fit)} />
        </div>
      </Bar.Section>
      <Bar.Divider />
      <Bar.Section label="Loop">
        <div className="inline-flex items-center">
          <Switch
            checked={isMixed(loop) ? false : loop}
            onCheckedChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, loop: v },
              }))
            }
          />
          <MixedBadge visible={isMixed(loop)} />
        </div>
      </Bar.Section>
      <Bar.Section label="Muted">
        <div className="inline-flex items-center">
          <Switch
            checked={isMixed(muted) ? false : muted}
            onCheckedChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, muted: v },
              }))
            }
          />
          <MixedBadge visible={isMixed(muted)} />
        </div>
      </Bar.Section>
      <Bar.Divider />
      <Bar.Section label="Volume">
        <div className="inline-flex items-center">
          <NumberSlider
            value={isMixed(volume) ? 1 : volume}
            onValueChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, volume: v },
              }))
            }
            min={0}
            max={1}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <MixedBadge visible={isMixed(volume)} />
        </div>
      </Bar.Section>
    </>
  );
};
