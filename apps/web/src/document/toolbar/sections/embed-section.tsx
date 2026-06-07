// WI-139 — embed contextual-toolbar section. Edits the `url` (primary) and the
// fullscreen toggle. The iframe src is derived from the url via the provider
// registry, so the section just shows whether the pasted URL was recognized.

import { ContextualToolbar as Bar, IconPlay, Switch } from "@weave/design-system";
import { resolveEmbed } from "../../embed/providers.js";
import type { EmbedAttrs } from "../../types.js";
import { isMixed, MixedBadge, sharedValue, updateAll } from "../multi-edit.js";
import type { ToolbarSectionComponent } from "./types.js";

export const EmbedSection: ToolbarSectionComponent = ({ editor, items, ids }) => {
  const url = sharedValue<string>(items, (it) => (it.attrs as unknown as EmbedAttrs).url ?? "");
  const allowFullscreen = sharedValue<boolean>(
    items,
    (it) => (it.attrs as unknown as EmbedAttrs).allowFullscreen ?? true,
  );
  const autoplay = sharedValue<boolean>(
    items,
    (it) => (it.attrs as unknown as EmbedAttrs).autoplay ?? false,
  );

  const setAttr = (patch: Partial<EmbedAttrs>) =>
    updateAll(editor, ids, (prev) => ({
      attrs: { ...prev.attrs, ...patch } as unknown as Readonly<Record<string, unknown>>,
    }));

  const urlValue = isMixed(url) ? "" : url;
  const resolved = urlValue.trim() !== "" ? resolveEmbed(urlValue) : null;
  // Recognition status: provider label, or a hint when the URL doesn't resolve.
  const status =
    urlValue.trim() === ""
      ? null
      : resolved !== null
        ? `${resolved.provider.label} ✓`
        : "인식할 수 없는 URL";

  return (
    <>
      <Bar.Kind icon={<IconPlay size={18} />} label="임베드" />
      <Bar.Quick>
        <input
          type="text"
          inputMode="url"
          aria-label="임베드 URL"
          placeholder="YouTube · Vimeo URL 붙여넣기"
          value={urlValue}
          // Store only the url; the renderer re-derives provider + iframe src.
          onChange={(e) => setAttr({ url: e.currentTarget.value })}
          data-testid="embed-url-input"
          className="w-[240px] px-2 py-1.5 rounded-[var(--radius-sm)] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] text-[12px] text-[color:var(--text-strong)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        />
        {status !== null ? (
          <span
            data-testid="embed-status"
            className={`text-[11px] ${
              resolved !== null
                ? "text-[color:var(--text-soft)]"
                : "text-[color:var(--accent-strong)]"
            }`}
          >
            {status}
          </span>
        ) : null}
        <MixedBadge visible={isMixed(url)} />
      </Bar.Quick>
      <Bar.More>
        <Bar.Field label="전체화면 허용">
          <Switch
            checked={isMixed(allowFullscreen) ? false : allowFullscreen}
            onCheckedChange={(v) => setAttr({ allowFullscreen: v })}
            aria-label="전체화면 허용"
          />
          <MixedBadge visible={isMixed(allowFullscreen)} />
        </Bar.Field>
        <Bar.Field label="자동재생 (프레젠트)">
          <Switch
            checked={isMixed(autoplay) ? false : autoplay}
            onCheckedChange={(v) => setAttr({ autoplay: v })}
            aria-label="프레젠트 모드 자동재생 (음소거)"
          />
          <MixedBadge visible={isMixed(autoplay)} />
        </Bar.Field>
      </Bar.More>
    </>
  );
};
