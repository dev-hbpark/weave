import { Card, CardEyebrow, EditableText } from "@weave/design-system";
import type { AgoItem, MediaAttrs } from "../types.js";

interface MediaBlockProps {
  readonly item: AgoItem<"media">;
  readonly onUpdate?: (patch: Partial<MediaAttrs>) => void;
}

export function MediaBlock({ item, onUpdate }: MediaBlockProps) {
  const isVideo = item.attrs.tone === "video";
  const editable = onUpdate !== undefined;
  return (
    <Card tone="default" className="border-l-4 border-l-[color:var(--domain-media-accent)]">
      <CardEyebrow>Media · {new Date(item.meta.createdAt).toLocaleTimeString()}</CardEyebrow>
      <div className="mt-3 relative rounded-[var(--radius-lg)] aspect-[16/9] bg-gradient-to-br from-[color:var(--surface-2)] to-[color:var(--surface-1)] border border-[color:var(--surface-2-border)] overflow-hidden flex items-center justify-center">
        <div
          aria-hidden
          className="absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(at 30% 30%, var(--domain-media-accent) 0%, transparent 55%), radial-gradient(at 70% 70%, var(--domain-canvas-accent) 0%, transparent 55%)",
            filter: "blur(40px)",
          }}
        />
        <div
          aria-hidden
          className="relative flex items-center justify-center w-16 h-16 rounded-full bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] backdrop-blur-[var(--surface-blur)]"
        >
          <span className="text-[color:var(--domain-media-accent)] text-[24px]">
            {isVideo ? "▶" : "▦"}
          </span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 text-[13px] text-[color:var(--text-soft)]">
        {editable ? (
          <EditableText
            as="span"
            value={item.attrs.caption}
            ariaLabel="Media caption"
            placeholder="Caption…"
            className="text-[13px] text-[color:var(--text-default)]"
            onCommit={(next) => onUpdate({ caption: next })}
          />
        ) : (
          <span>{item.attrs.caption}</span>
        )}
        <span aria-hidden>·</span>
        {editable ? (
          <button
            type="button"
            onClick={() => onUpdate({ tone: isVideo ? "image" : "video" })}
            className="text-[11px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] hover:bg-[color:var(--surface-1)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] transition-colors duration-[var(--motion-quick)]"
            aria-label={`Toggle to ${isVideo ? "image" : "video"}`}
          >
            {isVideo ? "video" : "image"}
          </button>
        ) : (
          <span>{isVideo ? "video" : "image"}</span>
        )}
      </div>
    </Card>
  );
}
