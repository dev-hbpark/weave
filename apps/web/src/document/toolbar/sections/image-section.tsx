// DR-design-015 — image kind in Tier-2 layout.
//
// Quick: replace-src icon (only one common action — open the URL dialog).
// More: Fit · Flip · Opacity · Border radius.

import type { ImageAttrs, ImageFit } from "@agocraft/core";
import {
  Accordion,
  AccordionItem,
  ContextualToolbar as Bar,
  Button,
  IconButton,
  IconImage,
  IconRefresh,
  NumberSlider,
  Select,
} from "@weave/design-system";
import { isMixed, MixedBadge, sharedValue, truncateUrl, updateAll } from "../multi-edit.js";
import { FlipControls } from "./flip-controls.js";
import { FilterControl, OpacityControl, ShadowControls } from "./shadow-controls.js";
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
  const borderRadius = sharedValue<number>(
    items,
    (it) => (it.attrs as unknown as ImageAttrs).borderRadius,
  );
  const src = sharedValue<string>(items, (it) => (it.attrs as unknown as ImageAttrs).src);
  // WI-076 — caption (alt): shown centered in the source-less placeholder and
  // used as the `<img>` alt text once a source is set.
  const alt = sharedValue<string>(items, (it) => (it.attrs as unknown as ImageAttrs).alt ?? "");
  return (
    <>
      <Bar.Kind icon={<IconImage size={18} />} label="이미지" />
      {/* DR-design-016 — surface the identifying image props in Quick: 원본
          (replace icon) · 맞춤 (Fit) · 뒤집기. The rest (설명 · 불투명도 ·
          모서리 · 그림자 · 필터) stay in More. */}
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
        <Select<ImageFit>
          value={isMixed(fit) ? "" : fit}
          onValueChange={(v) =>
            updateAll(editor, ids, (prev) => ({ attrs: { ...prev.attrs, fit: v } }))
          }
          options={FIT_OPTIONS as unknown as ReadonlyArray<{ value: ImageFit; label: string }>}
          aria-label="맞춤"
          placeholder="여러 맞춤"
          triggerClassName="w-[92px]"
        />
        <FlipControls editor={editor} ids={ids} />
      </Bar.Quick>
      <Bar.More>
        <Accordion>
          <AccordionItem label="이미지" defaultOpen data-testid="image-content-group">
            <Bar.Field label="원본">
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
            <Bar.Field label="설명">
              <input
                type="text"
                aria-label="이미지 설명"
                placeholder="소스 없을 때 중앙 표시"
                value={isMixed(alt) ? "" : alt}
                onChange={(e) =>
                  updateAll(editor, ids, (prev) => ({
                    attrs: { ...prev.attrs, alt: e.currentTarget.value },
                  }))
                }
                className="w-full px-2 py-1.5 rounded-[var(--radius-sm)] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] text-[12px] text-[color:var(--text-strong)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              />
              <MixedBadge visible={isMixed(alt)} />
            </Bar.Field>
          </AccordionItem>
          <AccordionItem label="스타일" data-testid="image-style-group">
            {/* DR-028 — opacity is a decoration unit (was attrs.opacity). */}
            <Bar.Field label="불투명도">
              <OpacityControl editor={editor} ids={ids} />
            </Bar.Field>
            <Bar.Field label="모서리 둥글기">
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
            {/* DR-028 — shadow decoration unit (shared control). */}
            <Bar.Field label="그림자">
              <ShadowControls editor={editor} ids={ids} />
            </Bar.Field>
            {/* DR-028 — filter (blur) decoration unit. */}
            <Bar.Field label="필터">
              <FilterControl editor={editor} ids={ids} />
            </Bar.Field>
          </AccordionItem>
        </Accordion>
      </Bar.More>
    </>
  );
};
