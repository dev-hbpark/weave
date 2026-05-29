// DR-design-015 — video kind in Tier-2 layout.
//
// Quick: replace-src icon + mute toggle (volume icon doubles as the most
// common video setting — quiet by default, click to toggle).
// More: Fit · Loop · Volume slider.

import type { VideoAttrs, VideoFit } from "@agocraft/core";
import {
  ContextualToolbar as Bar,
  Button,
  IconButton,
  IconRefresh,
  IconVideo,
  IconVolume,
  NumberSlider,
  Select,
  Switch,
} from "@weave/design-system";
import { isMixed, MixedBadge, sharedValue, truncateUrl, updateAll } from "../multi-edit.js";
import { ShadowControls } from "./shadow-controls.js";
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
  const fit = sharedValue<VideoFit>(items, (it) => (it.attrs as unknown as VideoAttrs).fit);
  const loop = sharedValue<boolean>(items, (it) => (it.attrs as unknown as VideoAttrs).loop);
  const muted = sharedValue<boolean>(items, (it) => (it.attrs as unknown as VideoAttrs).muted);
  const volume = sharedValue<number>(items, (it) => (it.attrs as unknown as VideoAttrs).volume);
  const src = sharedValue<string>(items, (it) => (it.attrs as unknown as VideoAttrs).src);
  return (
    <>
      <Bar.Kind icon={<IconVideo size={18} />} label="Video" />
      <Bar.Quick>
        <IconButton
          aria-label="비디오 교체"
          data-tip={isMixed(src) ? "여러 소스" : src ? truncateUrl(src) : "URL 입력…"}
          size="sm"
          onClick={() => onEditMediaSrc?.("video", isMixed(src) ? "" : src)}
          data-testid="video-edit-src"
          disabled={multi && isMixed(src)}
        >
          <IconRefresh size={16} />
        </IconButton>
        <IconButton
          aria-label={isMixed(muted) ? "음소거 (여러 값)" : muted ? "음소거됨" : "음소거"}
          data-tip="음소거 토글"
          size="sm"
          aria-pressed={isMixed(muted) ? "mixed" : muted}
          onClick={() =>
            updateAll(editor, ids, (prev) => ({
              attrs: { ...prev.attrs, muted: !muted },
            }))
          }
          data-testid="video-mute-toggle"
        >
          <IconVolume size={16} />
        </IconButton>
      </Bar.Quick>
      <Bar.More>
        <Bar.Field label="Source">
          <Button
            variant="ghost"
            size="md"
            onClick={() => onEditMediaSrc?.("video", isMixed(src) ? "" : src)}
            disabled={multi && isMixed(src)}
            className="w-full justify-start"
          >
            {isMixed(src) ? "여러 소스" : src ? truncateUrl(src) : "URL 입력…"}
          </Button>
          <MixedBadge visible={isMixed(src)} />
        </Bar.Field>
        <Bar.Field label="Fit">
          <Select<VideoFit>
            value={isMixed(fit) ? "" : fit}
            onValueChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, fit: v },
              }))
            }
            options={
              FIT_OPTIONS as unknown as ReadonlyArray<{
                value: VideoFit;
                label: string;
              }>
            }
            aria-label="Video fit"
            placeholder="여러 맞춤"
            triggerClassName="w-full"
          />
          <MixedBadge visible={isMixed(fit)} />
        </Bar.Field>
        <Bar.Field label="Loop">
          <Switch
            checked={isMixed(loop) ? false : loop}
            onCheckedChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, loop: v },
              }))
            }
          />
          <MixedBadge visible={isMixed(loop)} />
        </Bar.Field>
        <Bar.Field label="Volume">
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
            className="w-full"
          />
          <MixedBadge visible={isMixed(volume)} />
        </Bar.Field>
        {/* DR-028 — shadow decoration unit (shared control). */}
        <Bar.Field label="Shadow">
          <ShadowControls editor={editor} ids={ids} />
        </Bar.Field>
      </Bar.More>
    </>
  );
};
