// Aku composer (WI-052) — multiline prompt (design-system `Textarea`) + image
// attach + send/stop. Enter sends, Shift+Enter inserts a newline. Images are
// read to data URLs (capped) and previewed as removable thumbnails. The native
// <textarea> is auto-recognized by the editor hotkey registry as a text-editing
// target, so canvas hotkeys (Cmd+Z, Delete, …) don't fire while composing.

import { IconArrowUp, IconButton, IconClose, IconImage, Textarea } from "@weave/design-system";
import { type ChangeEvent, type KeyboardEvent, useId, useRef, useState } from "react";
import type { AkuImage } from "./transport/types.js";

/** Per-image cap; oversize files are skipped (a real backend would compress). */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export function AkuComposer({
  onSend,
  onStop,
  streaming,
}: {
  readonly onSend: (text: string, images: ReadonlyArray<AkuImage>) => void;
  readonly onStop: () => void;
  readonly streaming: boolean;
}): JSX.Element {
  const [text, setText] = useState("");
  const [images, setImages] = useState<ReadonlyArray<AkuImage>>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();

  const canSend = text.trim() !== "" || images.length > 0;

  const submit = (): void => {
    if (!canSend || streaming) return;
    onSend(text, images);
    setText("");
    setImages([]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const onPickFiles = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = Array.from(e.target.files ?? []).filter(
      (f) => f.type.startsWith("image/") && f.size <= MAX_IMAGE_BYTES,
    );
    const read = await Promise.all(
      files.map(
        async (f) => ({ dataUrl: await readAsDataUrl(f), name: f.name }) satisfies AkuImage,
      ),
    );
    if (read.length > 0) setImages((prev) => [...prev, ...read]);
    e.target.value = ""; // allow re-selecting the same file
  };

  return (
    <div className="grid gap-2">
      {images.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {images.map((img, i) => (
            <div key={img.dataUrl} className="relative">
              <img
                src={img.dataUrl}
                alt={img.name ?? "첨부 이미지"}
                className="w-12 h-12 rounded-[var(--radius-sm)] object-cover border border-[color:var(--surface-2-border)]"
              />
              <button
                type="button"
                aria-label="이미지 제거"
                onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 inline-flex items-center justify-center rounded-full bg-[color:var(--surface-1)] border border-[color:var(--surface-2-border)] text-[color:var(--text-soft)] hover:text-[color:var(--text-strong)]"
              >
                <IconClose size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-1.5">
        <input
          ref={fileRef}
          id={fileInputId}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => void onPickFiles(e)}
        />
        <IconButton
          aria-label="이미지 첨부"
          variant="ghost"
          size="sm"
          onClick={() => fileRef.current?.click()}
        >
          <IconImage size={16} />
        </IconButton>
        <Textarea
          className="flex-1"
          aria-label="아쿠에게 메시지"
          placeholder="아쿠에게 메시지…  (Shift+Enter 줄바꿈)"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {streaming ? (
          <IconButton aria-label="중지" variant="subtle" size="sm" onClick={onStop}>
            <span className="block w-2.5 h-2.5 rounded-[2px] bg-current" aria-hidden="true" />
          </IconButton>
        ) : (
          <IconButton
            aria-label="전송"
            variant="subtle"
            size="sm"
            disabled={!canSend}
            onClick={submit}
          >
            <IconArrowUp size={16} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
