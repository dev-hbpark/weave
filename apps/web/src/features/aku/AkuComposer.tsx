// Aku composer (WI-052 → WI-053) — multiline prompt (design-system `Textarea`,
// auto-growing) + image attach (file picker / paste / drag-drop) + send/stop +
// a slash-command menu. Enter sends, Shift+Enter inserts a newline; when the
// slash menu is open, Enter/↑/↓/Esc drive the menu instead. Images are read to
// data URLs (capped) and previewed as removable thumbnails. The native
// <textarea> is auto-recognized by the editor hotkey registry as a text-editing
// target, so canvas hotkeys (Cmd+Z, Delete, …) don't fire while composing.

import { IconArrowUp, IconButton, IconClose, IconImage, Textarea } from "@weave/design-system";
import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { type SlashCommandItem, SlashCommandMenu } from "./SlashCommandMenu.js";
import type { AkuImage } from "./types.js";

/** Per-image cap; oversize files are skipped (a real backend would compress). */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** Auto-grow ceiling for the textarea (px) before it scrolls. */
const MAX_TEXTAREA_PX = 160;

/** Content loaded into the composer by an external action (editFrom). The
 *  `nonce` lets us reload even when text/images are unchanged. */
export interface AkuComposerSeed {
  readonly text: string;
  readonly images: ReadonlyArray<AkuImage>;
  readonly nonce: number;
}

interface SlashCommand extends SlashCommandItem {
  /** Prompt text to load into the composer, OR an action keyword. */
  readonly fill?: string;
  readonly action?: "image";
}

const SLASH_COMMANDS: ReadonlyArray<SlashCommand> = [
  { id: "bg", label: "배경 바꾸기", hint: "캔버스 배경색 변경", fill: "배경을 파란색으로 바꿔줘" },
  { id: "text", label: "텍스트 추가", hint: "새 텍스트 아이템", fill: "텍스트 아이템을 추가해줘" },
  { id: "shape", label: "도형 추가", hint: "새 도형 아이템", fill: "도형을 추가해줘" },
  {
    id: "slide",
    label: "슬라이드 추가",
    hint: "커버 슬라이드 삽입",
    fill: "커버 슬라이드를 추가해줘",
  },
  { id: "image", label: "이미지 첨부", hint: "파일에서 이미지 선택", action: "image" },
];

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

async function filesToImages(files: ReadonlyArray<File>): Promise<AkuImage[]> {
  const usable = files.filter((f) => f.type.startsWith("image/") && f.size <= MAX_IMAGE_BYTES);
  return Promise.all(
    usable.map(async (f) => ({ dataUrl: await readAsDataUrl(f), name: f.name }) satisfies AkuImage),
  );
}

export function AkuComposer({
  onSend,
  onStop,
  streaming,
  seed,
}: {
  readonly onSend: (text: string, images: ReadonlyArray<AkuImage>) => void;
  readonly onStop: () => void;
  readonly streaming: boolean;
  readonly seed: AkuComposerSeed | null;
}): JSX.Element {
  const [text, setText] = useState("");
  const [images, setImages] = useState<ReadonlyArray<AkuImage>>([]);
  const [dragging, setDragging] = useState(false);
  const [slashActive, setSlashActive] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputId = useId();

  const canSend = text.trim() !== "" || images.length > 0;

  // ── auto-grow ──────────────────────────────────────────────────────────────
  const autosize = (): void => {
    const el = taRef.current;
    if (el === null) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: autosize reads the ref imperatively; text is the trigger
  useEffect(autosize, [text]);

  // ── editFrom seed ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (seed === null) return;
    setText(seed.text);
    setImages(seed.images);
    taRef.current?.focus();
  }, [seed]);

  // ── slash menu ───────────────────────────────────────────────────────────────
  const slashQuery = text.startsWith("/") && !text.includes("\n") ? text.slice(1) : null;
  const slashItems = useMemo<ReadonlyArray<SlashCommand>>(() => {
    if (slashQuery === null) return [];
    const q = slashQuery.trim().toLowerCase();
    return SLASH_COMMANDS.filter(
      (c) => q === "" || c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q),
    );
  }, [slashQuery]);
  const slashOpen = slashItems.length > 0;
  useEffect(() => {
    setSlashActive(0);
  }, [slashQuery]);

  const runSlash = (index: number): void => {
    const cmd = slashItems[index];
    if (cmd === undefined) return;
    if (cmd.action === "image") {
      setText("");
      fileRef.current?.click();
    } else if (cmd.fill !== undefined) {
      setText(cmd.fill);
    }
    taRef.current?.focus();
  };

  const submit = (): void => {
    if (!canSend || streaming) return;
    onSend(text, images);
    setText("");
    setImages([]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (slashOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashActive((i) => (i + 1) % slashItems.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashActive((i) => (i - 1 + slashItems.length) % slashItems.length);
        return;
      }
      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
        e.preventDefault();
        runSlash(slashActive);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setText("");
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const addImages = async (files: ReadonlyArray<File>): Promise<void> => {
    const read = await filesToImages(files);
    if (read.length > 0) setImages((prev) => [...prev, ...read]);
  };

  const onPickFiles = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    await addImages(Array.from(e.target.files ?? []));
    e.target.value = ""; // allow re-selecting the same file
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>): void => {
    const files = Array.from(e.clipboardData.files ?? []);
    if (files.some((f) => f.type.startsWith("image/"))) {
      e.preventDefault();
      void addImages(files);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) void addImages(files);
  };

  return (
    <div
      className="relative grid gap-2"
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      {dragging ? (
        <div
          className="pointer-events-none absolute inset-0 z-20 rounded-[var(--radius-md)] border-2 border-dashed border-[color:var(--accent)] bg-[color:var(--surface-overlay)] flex items-center justify-center text-[12px] text-[color:var(--text-soft)]"
          data-aku-drop-overlay
        >
          이미지를 여기에 놓으세요
        </div>
      ) : null}

      {slashOpen ? (
        <SlashCommandMenu
          items={slashItems}
          activeIndex={slashActive}
          onSelect={runSlash}
          onHover={setSlashActive}
        />
      ) : null}

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
          ref={taRef}
          className="flex-1"
          aria-label="아쿠에게 메시지"
          placeholder="아쿠에게 메시지…  ( / 명령 · Shift+Enter 줄바꿈)"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
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
