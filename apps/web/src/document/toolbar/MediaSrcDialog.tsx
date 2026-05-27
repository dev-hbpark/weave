// WI-020 — MediaSrcDialog.
//
// Lightweight modal that asks the user for an image / video source. Two
// input paths are first-class:
//   • Local file — drop or click to upload. Image → data: URL (round-trip
//     safe); video → blob: URL (session-scoped, no base64 explosion).
//   • Remote URL — typed / pasted. Anything `http(s)://`, `data:`, `blob:`,
//     or an absolute / relative path is accepted.
//
// Tone matches the surrounding menus (DropdownMenu / Popover): the
// overlay-glass surface via `tone="overlay"` on the design-system Dialog,
// not the heavier Panel surface.

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  Spinner,
  TextField,
} from "@weave/design-system";
import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from "react";
import { uploadResourceCloud } from "../cloud-sync.js";
import { addResource, listResources, type MediaResource } from "../resource-storage.js";

export interface MediaSrcDialogProps {
  readonly open: boolean;
  readonly kind: "image" | "video";
  readonly initialSrc?: string;
  readonly onConfirm: (src: string) => void;
  readonly onCancel: () => void;
}

const URL_PATTERN = /^(https?:|data:|blob:|\/|\.\/)/i;

const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6 MB — data-URL upper bound.
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB — blob can stream.

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function MediaSrcDialog(props: MediaSrcDialogProps): JSX.Element {
  const { open, kind, initialSrc, onConfirm, onCancel } = props;
  const [value, setValue] = useState(initialSrc ?? "");
  const [error, setError] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resources, setResources] = useState<ReadonlyArray<MediaResource>>([]);
  // Tri-state upload lifecycle. `uploading` disables Confirm and shows
  // a spinner inside the dropzone; `uploadWarning` is set when the
  // cloud round-trip fails AFTER the local read succeeded — Confirm
  // stays enabled in that case and the dialog falls back to inlining
  // the data URL (= the legacy pre-cloud-await behavior). Without the
  // fallback a transient network blip would block any insert until
  // the user retries the file pick.
  const [uploading, setUploading] = useState(false);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset state when reopening + (re)load resources for the picker.
  useEffect(() => {
    if (open) {
      setValue(initialSrc ?? "");
      setError(null);
      setUploadedName(null);
      setDragging(false);
      setUploading(false);
      setUploadWarning(null);
      setResources(listResources());
    }
  }, [open, initialSrc]);

  // Filter to the current kind only — picking a video while in an
  // image dialog wouldn't make sense.
  const pickerResources = resources.filter((r) => r.kind === kind);

  async function ingestFile(file: File): Promise<void> {
    setError(null);
    setUploadWarning(null);
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (kind === "image" && !isImage) {
      setError("이미지 파일만 업로드할 수 있어요");
      return;
    }
    if (kind === "video" && !isVideo) {
      setError("비디오 파일만 업로드할 수 있어요");
      return;
    }
    const limit = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (file.size > limit) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      setError(
        kind === "image"
          ? `이미지가 너무 큽니다 (${mb}MB). 6MB 이하로 업로드해주세요.`
          : `비디오가 너무 큽니다 (${mb}MB). 200MB 이하로 업로드해주세요.`,
      );
      return;
    }
    let localSrc: string;
    try {
      localSrc = kind === "image" ? await fileToDataUrl(file) : URL.createObjectURL(file);
    } catch {
      setError("파일을 읽지 못했습니다. 다시 시도해주세요.");
      return;
    }
    setValue(localSrc);
    setUploadedName(file.name);

    // For images, await the cloud upload so the dialog's `value` swaps
    // from the data URL to the canonical cloud URL BEFORE Confirm
    // fires. This is the root-cause fix for the legacy "design carries
    // inline base64 image bytes" problem — every new image now lands
    // on the server first and only its URL flows into the design's
    // item.attrs.src.
    //
    // For videos, `URL.createObjectURL` returns a session-scoped blob
    // URL whose bytes are not reachable from the server. There's no
    // meaningful cloud round-trip to await; we keep the fire-and-
    // forget addResource path for parity with the resource library.
    if (kind === "image") {
      setUploading(true);
      try {
        const cloud = await uploadResourceCloud(kind, localSrc, file.name);
        if (cloud === null) {
          setUploadWarning(
            "서버 업로드에 실패했어요. 이번에는 로컬 사본으로 추가됩니다.",
          );
          addResource(kind, localSrc, file.name); // existing fire-and-forget retry path
        } else {
          setValue(cloud.src);
          addResource(kind, cloud.src, file.name, {
            preuploaded: { id: cloud.id, src: cloud.src },
          });
        }
      } finally {
        setUploading(false);
        setResources(listResources());
      }
      return;
    }
    addResource(kind, localSrc, file.name);
    setResources(listResources());
  }

  function onPickFile(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.currentTarget.files?.[0];
    if (file) void ingestFile(file);
    // Reset so picking the same file twice still triggers `change`.
    e.currentTarget.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void ingestFile(file);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    if (!dragging) setDragging(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>): void {
    if (e.currentTarget === e.target) setDragging(false);
  }

  function submit(): void {
    if (uploading) return; // cloud-await guard — Confirm is also visually disabled
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setError("URL을 입력하거나 파일을 업로드해주세요");
      return;
    }
    if (!URL_PATTERN.test(trimmed)) {
      setError("http(s):// · data: · blob: · 절대 / 상대 경로만 허용됩니다");
      return;
    }
    onConfirm(trimmed);
  }

  function clearUpload(): void {
    setUploadedName(null);
    setValue("");
  }

  const accept = kind === "image" ? "image/*" : "video/*";
  const title = kind === "image" ? "이미지 추가" : "비디오 추가";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        tone="overlay"
        size="sm"
        data-testid="media-src-dialog"
        data-kind={kind}
        aria-label={title}
      >
        <DialogHeader compact headline={title} />

        {/* Resource picker — previously uploaded media of this kind.
            Clicking a thumbnail fills the URL field with the resource's
            src (a fresh upload isn't needed). Hidden when empty. */}
        {pickerResources.length > 0 ? (
          <div className="mb-3" data-testid="media-src-resource-picker">
            <div className="text-[11px] uppercase tracking-wider text-[color:var(--text-soft)] mb-1.5">
              기존 리소스
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {pickerResources.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  data-testid="media-src-resource"
                  data-resource-id={r.id}
                  onClick={() => {
                    setValue(r.src);
                    setUploadedName(r.name);
                    setError(null);
                  }}
                  className="relative shrink-0 w-14 h-14 rounded-[var(--radius-sm)] border border-[color:var(--surface-overlay-border)] overflow-hidden hover:ring-2 hover:ring-[color:var(--accent)] transition"
                  aria-label={`기존 ${kind === "image" ? "이미지" : "비디오"}: ${r.name}`}
                  title={r.name}
                >
                  {r.kind === "image" ? (
                    <img src={r.src} alt={r.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-black/40 text-white text-[16px]">
                      ▶
                    </div>
                  )}
                  {r.sessionOnly ? (
                    <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] text-center py-0.5">
                      세션
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Drop / pick zone */}
        <div
          data-testid="media-src-dropzone"
          role="button"
          tabIndex={0}
          aria-label={kind === "image" ? "이미지 파일 선택" : "비디오 파일 선택"}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={[
            "relative grid place-items-center text-center cursor-pointer",
            "rounded-[var(--radius-sm)] border border-dashed",
            "px-4 py-5 transition-colors",
            dragging
              ? "border-[color:var(--accent)] bg-[color:var(--surface-overlay-2)]"
              : "border-[color:var(--surface-overlay-border)] hover:bg-[color:var(--surface-overlay-2)]/60",
          ].join(" ")}
        >
          {uploadedName ? (
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-2">
                {uploading ? (
                  <Spinner size={16} className="text-[color:var(--text-soft)]" />
                ) : (
                  <span className="text-[18px]" aria-hidden>
                    {kind === "image" ? "🖼" : "▶"}
                  </span>
                )}
                <span
                  data-testid="media-src-uploaded-name"
                  className="text-[13px] text-[color:var(--text-strong)] max-w-[260px] truncate"
                  title={uploadedName}
                >
                  {uploadedName}
                </span>
                {!uploading && (
                  <button
                    type="button"
                    data-testid="media-src-upload-clear"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearUpload();
                    }}
                    className="ml-1 text-[12px] text-[color:var(--text-soft)] hover:text-[color:var(--text-strong)] underline-offset-2 hover:underline"
                    aria-label="업로드 비우기"
                  >
                    비우기
                  </button>
                )}
              </div>
              {uploading && (
                <span
                  data-testid="media-src-upload-status"
                  className="text-[11px] text-[color:var(--text-soft)]"
                >
                  서버에 업로드 중…
                </span>
              )}
              {uploadWarning !== null && !uploading && (
                <span
                  data-testid="media-src-upload-warning"
                  className="text-[11px] text-[color:var(--text-warn,#d97706)]"
                >
                  {uploadWarning}
                </span>
              )}
            </div>
          ) : (
            <>
              <span className="text-[20px] leading-none mb-1.5" aria-hidden>
                ⬆
              </span>
              <div className="text-[13px] text-[color:var(--text-strong)]">
                파일 선택 또는 끌어 놓기
              </div>
              <div className="text-[11.5px] text-[color:var(--text-soft)] mt-0.5">
                {kind === "image"
                  ? "PNG, JPG, GIF, WebP · 최대 6MB"
                  : "MP4, WebM, MOV · 최대 200MB"}
              </div>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            data-testid="media-src-file-input"
            onChange={onPickFile}
            className="sr-only"
            tabIndex={-1}
          />
        </div>

        {/* Divider */}
        <div className="my-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-[color:var(--surface-overlay-border)]" />
          <span className="text-[11px] tracking-wider uppercase text-[color:var(--text-soft)]">
            또는 URL
          </span>
          <div className="h-px flex-1 bg-[color:var(--surface-overlay-border)]" />
        </div>

        <TextField
          label={kind === "image" ? "이미지 URL" : "비디오 URL"}
          placeholder={
            kind === "image" ? "https://example.com/image.jpg" : "https://example.com/video.mp4"
          }
          value={uploadedName ? "" : value}
          disabled={uploadedName !== null}
          onChange={(e) => {
            setValue(e.currentTarget.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          errorText={error ?? undefined}
          data-testid="media-src-input"
        />

        <div className="mt-5 flex items-center justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost" size="md" data-testid="media-src-cancel">
              취소
            </Button>
          </DialogClose>
          <Button
            variant="primary"
            size="md"
            onClick={submit}
            disabled={uploading}
            data-testid="media-src-confirm"
          >
            {uploading
              ? "업로드 중…"
              : kind === "image"
                ? "이미지 추가"
                : "비디오 추가"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
