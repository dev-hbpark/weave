import { Card, EditableText } from "@weave/design-system";
import type { AgoItem, MediaAttrs } from "../types.js";

interface MediaBlockProps {
  readonly item: AgoItem<"media">;
  readonly onUpdate?: (patch: Partial<MediaAttrs>) => void;
}

export function MediaBlock({ item, onUpdate }: MediaBlockProps) {
  const isVideo = item.attrs.tone === "video";
  const editable = onUpdate !== undefined;
  return (
    <Card
      tone="transparent"
      className="h-full flex flex-col"
      {...(item.attrs.background !== undefined
        ? { style: { background: item.attrs.background } }
        : {})}
    >
      <div className="relative flex-1 rounded-[var(--radius-lg)] overflow-hidden flex items-center justify-center">
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
          className="relative flex items-center justify-center w-16 h-16 rounded-full bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)]"
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
            clickToEdit="double"
            value={item.attrs.caption}
            ariaLabel="Media caption"
            placeholder="Caption…"
            className="text-[13px] text-[color:var(--text-default)]"
            onCommit={(next) => onUpdate({ caption: next })}
            data-hover-context="미디어 캡션"
            data-hover-actions={JSON.stringify([
              { action: "편집 — 클릭" },
              { action: "확정 — Enter" },
            ])}
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
            data-hover-context={isVideo ? "동영상" : "이미지"}
            data-hover-actions={JSON.stringify([
              { action: `${isVideo ? "이미지" : "동영상"}로 전환 — 클릭` },
            ])}
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
