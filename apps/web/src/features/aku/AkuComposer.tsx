// Aku composer (WI-052 → WI-053) — multiline prompt (design-system `Textarea`,
// auto-growing) + image attach (file picker / paste / drag-drop) + send/stop +
// a slash-command menu. ⌘/Ctrl+Enter sends, plain Enter inserts a newline (so a
// multi-line prompt is the default); when the slash menu is open, Enter/↑/↓/Esc
// drive the menu instead. Images are read to
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
import type { AkuSettings } from "./agent/aku-settings.js";
import { STYLE_GROUPS } from "./agent/design-styles.js";
import { OPERATION_LABELS, type Operation } from "./agent/intent/types.js";
import { type SlashCommandItem, SlashCommandMenu } from "./SlashCommandMenu.js";
import type { AkuImage } from "./types.js";

/** Per-image cap; oversize files are skipped (a real backend would compress). */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** Auto-grow ceiling for the textarea (px) before it scrolls. Generous so a
 *  pasted long document stays editable; past this the textarea scrolls. */
const MAX_TEXTAREA_PX = 280;

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
  /** Explicit editing intent (WI-148) — tags the next send so the classifier is
   *  bypassed (target/tone are resolved from selection + the typed text). */
  readonly intentOp?: Operation;
}

const SLASH_COMMANDS: ReadonlyArray<SlashCommand> = [
  // ── Explicit intent (WI-148) — pick the operation, then type the request. ──
  { id: "i-edit", label: "수정", hint: "선택/지칭 항목만 수정", intentOp: "edit" },
  { id: "i-add", label: "추가", hint: "새 슬라이드/아이템 추가", intentOp: "add" },
  { id: "i-replace", label: "교체", hint: "항목을 같은 자리에 다른 것으로", intentOp: "replace" },
  { id: "i-delete", label: "삭제", hint: "선택/지칭 항목 삭제", intentOp: "delete" },
  { id: "i-recolor", label: "팔레트", hint: "색상만 변경", intentOp: "recolor" },
  { id: "i-retone", label: "톤 맞춤", hint: "선택 항목을 덱 톤에 맞춤", intentOp: "retone" },
  // ── Quick prompt fills ──
  { id: "bg", label: "배경 바꾸기", hint: "캔버스 배경색 변경", fill: "배경을 파란색으로 바꿔줘" },
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

/** A small toggle pill for the design-tone picker. */
function StyleChip({
  label,
  active,
  onClick,
  title,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onClick: () => void;
  readonly title?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
        active
          ? "bg-[color:var(--accent)] text-[color:var(--text-on-accent)] border-[color:var(--accent)]"
          : "bg-[color:var(--surface-1)] text-[color:var(--text-soft)] border-[color:var(--surface-2-border)] hover:text-[color:var(--text-strong)]"
      }`}
    >
      {label}
    </button>
  );
}

export function AkuComposer({
  onSend,
  settings,
  onStop,
  streaming,
  seed,
}: {
  readonly onSend: (
    text: string,
    images: ReadonlyArray<AkuImage>,
    opts?: {
      styleId?: string | null;
      styleRefImages?: ReadonlyArray<AkuImage>;
      intentOp?: Operation;
    },
  ) => void;
  readonly settings: AkuSettings;
  readonly onStop: () => void;
  readonly streaming: boolean;
  readonly seed: AkuComposerSeed | null;
}): JSX.Element {
  const [text, setText] = useState("");
  const [images, setImages] = useState<ReadonlyArray<AkuImage>>([]);
  // Design CATEGORY (STYLE_GROUPS id) — null = AUTO (the agent reads the content and
  // picks). A picked category hides the concrete style; the hook resolves a random
  // style within the category each generation.
  const [categoryId, setCategoryId] = useState<string | null>(null);
  // Style-reference images (mimic palette/tone) — separate from content images.
  const [styleRefImages, setStyleRefImages] = useState<ReadonlyArray<AkuImage>>([]);
  // Explicit editing intent picked via a slash command (WI-148) — tags the next
  // send and bypasses the heuristic classifier. null = auto-classify.
  const [pendingIntentOp, setPendingIntentOp] = useState<Operation | null>(null);
  const [dragging, setDragging] = useState(false);
  const [slashActive, setSlashActive] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const styleRefFileRef = useRef<HTMLInputElement>(null);
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate dependency array — omitted values are refs/stable handles or an intentional re-run trigger (see hook body); auto-expanding changes the effect's semantics
  useEffect(() => {
    setSlashActive(0);
  }, [slashQuery]);

  const runSlash = (index: number): void => {
    const cmd = slashItems[index];
    if (cmd === undefined) return;
    if (cmd.action === "image") {
      setText("");
      fileRef.current?.click();
    } else if (cmd.intentOp !== undefined) {
      // Tag the next send with this explicit intent; clear the "/…" so the user
      // types their request normally. The chip below shows + clears it.
      setPendingIntentOp(cmd.intentOp);
      setText("");
    } else if (cmd.fill !== undefined) {
      setText(cmd.fill);
    }
    taRef.current?.focus();
  };

  const submit = (): void => {
    if (!canSend || streaming) return;
    onSend(text, images, {
      styleId: settings.designTone ? categoryId : null,
      ...(settings.styleReference && styleRefImages.length > 0 ? { styleRefImages } : {}),
      ...(pendingIntentOp !== null ? { intentOp: pendingIntentOp } : {}),
    });
    setText("");
    setImages([]);
    setStyleRefImages([]);
    setPendingIntentOp(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    // Isolate the composer from the canvas hotkey registry. That registry listens
    // on `window` (bubble) and preventDefault()s EVERY matching binding (Cmd+V / C /
    // X, …) BEFORE it checks the focus target — which kills native paste / copy /
    // cut inside this textarea (so pasting a multi-line prompt did nothing). React's
    // delegated handler runs at the root (below window), so stopping the NATIVE
    // event here lets the composer keep its own keys (Enter, Shift+Enter, slash nav)
    // while the keystroke never reaches the canvas registry → native paste works.
    e.nativeEvent.stopPropagation();
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
    // Cmd/Ctrl+Enter sends; plain Enter (and Shift+Enter) insert a newline so a
    // multi-line prompt is the default. Composition (IME) is never a send.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
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

  const onPickStyleRef = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const read = await filesToImages(Array.from(e.target.files ?? []));
    if (read.length > 0) setStyleRefImages((prev) => [...prev, ...read]);
    e.target.value = "";
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>): void => {
    const dt = e.clipboardData;
    // Pasted images land in `.files` (file managers) OR only in `.items`
    // (images copied from a web page / screenshots) — check both.
    const fromFiles = Array.from(dt.files ?? []).filter((f) => f.type.startsWith("image/"));
    const fromItems =
      fromFiles.length > 0
        ? []
        : Array.from(dt.items ?? [])
            .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
            .map((it) => it.getAsFile())
            .filter((f): f is File => f !== null);
    const imageFiles = [...fromFiles, ...fromItems];
    if (imageFiles.length > 0) {
      e.preventDefault();
      void addImages(imageFiles);
    }
    // No image → let the textarea paste text natively (long documents included).
  };

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) void addImages(files);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: interaction surface (canvas/overlay/affordance), not a control — keyboard & focus handled by dedicated controls elsewhere
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

      {/* Design-category picker (DR-079) — the user picks a CATEGORY (미래지향 / SaaS
          / …); the concrete style within it (글래스모피즘 / 오로라 / …) is hidden and
          chosen randomly per generation by the hook. "자동" (null) lets the agent read
          the content and pick the best-fit style itself. Gated by settings. */}
      {settings.designTone ? (
        <div className="flex flex-wrap gap-1" data-testid="aku-style-picker">
          <StyleChip
            label="자동 (콘텐츠 분석)"
            active={categoryId === null}
            onClick={() => setCategoryId(null)}
            title="콘텐츠를 분석해 가장 잘 맞는 스타일을 자동 적용"
          />
          {STYLE_GROUPS.map((g) => (
            <StyleChip
              key={g.id}
              label={g.label}
              active={categoryId === g.id}
              onClick={() => setCategoryId((cur) => (cur === g.id ? null : g.id))}
              title={g.useCase}
            />
          ))}
        </div>
      ) : null}

      {/* Style-reference attach — images whose palette/tone/layout the agent
          mimics (not content). Gated by settings. */}
      {settings.styleReference ? (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="aku-style-ref">
          <input
            ref={styleRefFileRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => void onPickStyleRef(e)}
          />
          <button
            type="button"
            onClick={() => styleRefFileRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-[color:var(--surface-2-border)] px-2 py-0.5 text-[11px] text-[color:var(--text-soft)] hover:text-[color:var(--text-strong)]"
            data-testid="aku-style-ref-add"
          >
            <IconImage size={12} />
            스타일 참고
          </button>
          {styleRefImages.map((img, i) => (
            <div key={img.dataUrl} className="relative">
              <img
                src={img.dataUrl}
                alt={img.name ?? "스타일 참고 이미지"}
                className="w-9 h-9 rounded-[var(--radius-sm)] object-cover border border-[color:var(--accent)]"
              />
              <button
                type="button"
                aria-label="스타일 참고 제거"
                onClick={() => setStyleRefImages((prev) => prev.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 inline-flex items-center justify-center rounded-full bg-[color:var(--surface-1)] border border-[color:var(--surface-2-border)] text-[color:var(--text-soft)] hover:text-[color:var(--text-strong)]"
              >
                <IconClose size={10} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {pendingIntentOp !== null ? (
        <div className="flex items-center gap-1.5" data-testid="aku-pending-intent">
          <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--accent)] bg-[color:var(--surface-1)] px-2 py-0.5 text-[11px] text-[color:var(--accent)]">
            의도: {OPERATION_LABELS[pendingIntentOp]}
            <button
              type="button"
              aria-label="지정한 의도 제거"
              onClick={() => setPendingIntentOp(null)}
              className="inline-flex items-center"
            >
              <IconClose size={11} />
            </button>
          </span>
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
          placeholder="아쿠에게 메시지…  ( / 명령 · Enter 줄바꿈 · ⌘/Ctrl+Enter 전송)"
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
