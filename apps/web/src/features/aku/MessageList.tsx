// Aku transcript rendering (WI-052) — feature-local, token-styled (not a
// design-system primitive: chat bubbles are app-specific). User turns align
// right, assistant left; the streaming turn shows a caret; applied canvas edits
// render as action chips; attached images render as thumbnails.

import { IconCheck, IconClose, IconSparkle } from "@weave/design-system";
import type { AkuEditRecord, AkuImage, AkuMessage } from "./transport/types.js";

function EditChip({ edit }: { readonly edit: AkuEditRecord }): JSX.Element {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-0.5 text-[11px] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] text-[color:var(--text-soft)]"
      data-aku-edit={edit.tool}
      data-aku-edit-ok={edit.ok ? "true" : "false"}
    >
      {edit.ok ? (
        <IconCheck size={12} className="text-[color:var(--accent)]" />
      ) : (
        <IconClose size={12} className="text-[color:var(--accent-strong)]" />
      )}
      {edit.summary}
    </span>
  );
}

function ImageThumbs({ images }: { readonly images: ReadonlyArray<AkuImage> }): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5 mb-1.5">
      {images.map((img, i) => (
        <img
          // biome-ignore lint/suspicious/noArrayIndexKey: thumbnails are positional + immutable per turn
          key={i}
          src={img.dataUrl}
          alt={img.name ?? "첨부 이미지"}
          className="w-14 h-14 rounded-[var(--radius-sm)] object-cover border border-[color:var(--surface-2-border)]"
          data-aku-attachment
        />
      ))}
    </div>
  );
}

function MessageBubble({
  message,
  streaming,
}: {
  readonly message: AkuMessage;
  readonly streaming: boolean;
}): JSX.Element {
  const isUser = message.role === "user";
  return (
    <div
      className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}
      data-aku-message={message.role}
    >
      {!isUser ? (
        <span className="shrink-0 mt-0.5 text-[color:var(--accent)]" aria-hidden="true">
          <IconSparkle size={16} />
        </span>
      ) : null}
      <div
        className={`max-w-[78%] rounded-[var(--radius-md)] px-3 py-2 text-[13px] leading-[1.5] whitespace-pre-wrap break-words ${
          isUser
            ? "bg-[color:var(--surface-2)] text-[color:var(--text-strong)]"
            : "text-[color:var(--text-default)]"
        }`}
      >
        {isUser && message.images !== undefined && message.images.length > 0 ? (
          <ImageThumbs images={message.images} />
        ) : null}
        <span>{message.text}</span>
        {streaming ? (
          <span
            className="inline-block w-[2px] h-[1em] align-[-0.15em] ml-0.5 bg-[color:var(--accent)] motion-safe:animate-pulse"
            aria-hidden="true"
          />
        ) : null}
        {!isUser && message.edits !== undefined && message.edits.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {message.edits.map((e, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: edits are append-only per turn
              <EditChip key={i} edit={e} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function MessageList({
  messages,
  streaming,
}: {
  readonly messages: ReadonlyArray<AkuMessage>;
  readonly streaming: boolean;
}): JSX.Element {
  if (messages.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-6 text-[color:var(--text-soft)]">
        <IconSparkle size={28} className="text-[color:var(--accent)]" />
        <p className="text-[13px]">
          아쿠에게 무엇이든 물어보세요.
          <br />
          캔버스 편집도 도와드려요.
        </p>
      </div>
    );
  }
  const lastIdx = messages.length - 1;
  return (
    <div className="flex flex-col gap-3 py-1" data-aku-transcript>
      {messages.map((m, i) => (
        <MessageBubble
          // biome-ignore lint/suspicious/noArrayIndexKey: transcript is append-only; index is stable
          key={i}
          message={m}
          streaming={streaming && i === lastIdx && m.role === "assistant"}
        />
      ))}
    </div>
  );
}
