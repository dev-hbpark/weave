// Aku transcript rendering (WI-052 → WI-053) — feature-local, token-styled (not
// a design-system primitive: chat bubbles are app-specific). User turns align
// right (plain text), assistant left (markdown via MarkdownMessage); the
// actively streaming turn shows a caret and stays plain text (cheaper than
// re-parsing markdown per token). Applied canvas edits render as chips with a
// turn-level "이 변경 되돌리기" (enabled while still on top of the undo stack);
// a hover action row offers copy / regenerate / edit; transport errors render a
// retry affordance.

import {
  IconCheck,
  IconClose,
  IconCopy,
  IconPencil,
  IconRefresh,
  IconSparkle,
  IconUndo,
} from "@weave/design-system";
import { lazy, Suspense, useState } from "react";
import { AkuMascot } from "./AkuMascot.js";
import { describeCostDetail, formatCostLine } from "./agent/cost-event.js";
import { withOperation } from "./agent/intent/classifier.js";
import {
  ALL_OPERATIONS,
  describeIntent,
  type IntentPlan,
  OPERATION_LABELS,
} from "./agent/intent/types.js";
import type { AkuEditRecord, AkuHistoryController, AkuImage, AkuMessage } from "./types.js";

function formatTime(at: number | undefined): string {
  if (at === undefined) return "";
  const d = new Date(at);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

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

/** The routed editing intent (WI-148), shown so the user can confirm or correct a
 *  misclassification. Editable (a dropdown of operations) only on the latest,
 *  settled turn — correcting re-runs that turn with the chosen operation. */
function IntentChip({
  plan,
  editable,
  onCorrect,
}: {
  readonly plan: IntentPlan;
  readonly editable: boolean;
  readonly onCorrect: (plan: IntentPlan) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-flex mb-1.5">
      <button
        type="button"
        data-testid="aku-intent-chip"
        data-aku-intent={plan.operation}
        aria-haspopup={editable ? "listbox" : undefined}
        aria-expanded={editable ? open : undefined}
        disabled={!editable}
        onClick={() => editable && setOpen((o) => !o)}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border border-[color:var(--accent)] text-[color:var(--accent)] bg-[color:var(--surface-1)] ${
          editable ? "hover:bg-[color:var(--surface-2)] cursor-pointer" : "opacity-80"
        }`}
        title={editable ? "감지된 의도 — 눌러서 교정" : "감지된 의도"}
      >
        <IconSparkle size={11} />
        {describeIntent(plan)}
        {editable ? <span aria-hidden="true">▾</span> : null}
      </button>
      {editable && open ? (
        <>
          <button
            type="button"
            aria-label="의도 선택 닫기"
            className="fixed inset-0 z-[60] cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="listbox"
            aria-label="의도 교정"
            data-testid="aku-intent-options"
            className="absolute top-full left-0 mt-1 z-[61] min-w-[140px] rounded-[var(--radius-md)] border border-[color:var(--surface-overlay-border)] bg-[color:var(--surface-overlay)] shadow-[var(--shadow-overlay)] p-1"
          >
            {ALL_OPERATIONS.map((op) => (
              <button
                key={op}
                type="button"
                role="option"
                aria-selected={op === plan.operation}
                data-aku-intent-option={op}
                onClick={() => {
                  setOpen(false);
                  if (op !== plan.operation) onCorrect(withOperation(plan, op));
                }}
                className={`w-full text-left rounded-[var(--radius-sm)] px-2 py-1 text-[12px] ${
                  op === plan.operation
                    ? "bg-[color:var(--surface-2)] text-[color:var(--text-strong)]"
                    : "text-[color:var(--text-default)] hover:bg-[color:var(--surface-overlay-2)]"
                }`}
              >
                {OPERATION_LABELS[op]}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
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

function ActionButton({
  label,
  onClick,
  children,
  testid,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: JSX.Element;
  readonly testid?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      {...(testid !== undefined ? { "data-testid": testid } : {})}
      className="inline-flex items-center justify-center w-6 h-6 rounded-[var(--radius-sm)] text-[color:var(--text-soft)] hover:text-[color:var(--text-strong)] hover:bg-[color:var(--surface-2)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
    >
      {children}
    </button>
  );
}

// react-markdown is heavy; load it lazily so it stays out of the canvas-critical
// bundle and only arrives when a transcript actually renders assistant prose.
const MarkdownMessage = lazy(() =>
  import("./MarkdownMessage.js").then((m) => ({ default: m.MarkdownMessage })),
);

function MessageBubble({
  message,
  index,
  streaming,
  isLast,
  onCopy,
  onRegenerate,
  onRetry,
  onEdit,
  onCorrectIntent,
  undo,
}: {
  readonly message: AkuMessage;
  readonly index: number;
  readonly streaming: boolean;
  readonly isLast: boolean;
  readonly onCopy: (text: string) => void;
  readonly onRegenerate: () => void;
  readonly onRetry: () => void;
  readonly onEdit: (index: number) => void;
  readonly onCorrectIntent: (plan: IntentPlan) => void;
  readonly undo: AkuHistoryController | undefined;
}): JSX.Element {
  const isUser = message.role === "user";
  const intent = message.role === "assistant" ? message.intent : undefined;
  const errored = message.role === "assistant" ? message.error === true : false;
  const edits = !isUser && message.role === "assistant" ? message.edits : undefined;
  const activity = !isUser && message.role === "assistant" ? message.activity : undefined;
  const cost = !isUser && message.role === "assistant" ? message.cost : undefined;
  const canUndoTurn =
    !isUser &&
    message.role === "assistant" &&
    undo !== undefined &&
    message.undoEntryCount !== undefined &&
    message.undoEntryCount > 0 &&
    message.historyDepthAfter !== undefined &&
    undo.depth() === message.historyDepthAfter;

  return (
    <div
      className={`group flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}
      data-aku-message={message.role}
    >
      <div className={`flex gap-2 max-w-full ${isUser ? "justify-end" : "justify-start"}`}>
        {!isUser ? (
          <span className="shrink-0 mt-0.5 text-[color:var(--accent)]" aria-hidden="true">
            <IconSparkle size={16} />
          </span>
        ) : null}
        <div
          className={`max-w-[78%] rounded-[var(--radius-md)] px-3 py-2 text-[13px] leading-[1.5] break-words ${
            isUser
              ? "bg-[color:var(--surface-2)] text-[color:var(--text-strong)] whitespace-pre-wrap"
              : message.role === "assistant" && message.error
                ? "text-[color:var(--accent-strong)] whitespace-pre-wrap"
                : "text-[color:var(--text-default)]"
          }`}
        >
          {intent !== undefined ? (
            <div className="block">
              <IntentChip
                plan={intent}
                editable={isLast && !streaming && !errored}
                onCorrect={onCorrectIntent}
              />
            </div>
          ) : null}

          {isUser && message.images !== undefined && message.images.length > 0 ? (
            <ImageThumbs images={message.images} />
          ) : null}

          {isUser || (streaming && isLast) || (message.role === "assistant" && message.error) ? (
            <span>{message.text}</span>
          ) : (
            <Suspense fallback={<span className="whitespace-pre-wrap">{message.text}</span>}>
              <MarkdownMessage text={message.text} />
            </Suspense>
          )}

          {streaming && isLast ? (
            message.text.trim() === "" ? (
              // Working, no reply text yet → show what the agent is doing now.
              <span
                className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-soft)]"
                data-aku-activity
                aria-live="polite"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent)] motion-safe:animate-pulse"
                  aria-hidden="true"
                />
                {activity ?? "생각 중…"}
              </span>
            ) : (
              // Reply text is arriving → blinking caret after it.
              <span
                className="inline-block w-[2px] h-[1em] align-[-0.15em] ml-0.5 bg-[color:var(--accent)] motion-safe:animate-pulse"
                aria-hidden="true"
              />
            )
          ) : null}

          {edits !== undefined && edits.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {edits.map((e, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: edits are append-only per turn
                <EditChip key={i} edit={e} />
              ))}
              {canUndoTurn ? (
                <button
                  type="button"
                  data-aku-undo-turn
                  onClick={() =>
                    undo?.undo(message.role === "assistant" ? (message.undoEntryCount ?? 0) : 0)
                  }
                  className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-0.5 text-[11px] text-[color:var(--text-soft)] hover:text-[color:var(--text-strong)] hover:bg-[color:var(--surface-2)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                >
                  <IconUndo size={12} />이 변경 되돌리기
                </button>
              ) : null}
            </div>
          ) : null}

          {/* per-task token/dollar footer (WI-176) — arrives once via the server's
              `cost` event right before the turn settles; hover shows the exact
              breakdown (cache reads/writes; api-mode dollars are an estimate). */}
          {cost !== undefined ? (
            <div
              className="mt-1.5 text-[10px] text-[color:var(--text-soft)] tabular-nums"
              data-aku-cost
              title={describeCostDetail(cost)}
            >
              {formatCostLine(cost)}
            </div>
          ) : null}
        </div>
      </div>

      {/* hover action row + timestamp */}
      <div
        className={`flex items-center gap-0.5 px-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ${
          isUser ? "flex-row-reverse" : ""
        }`}
      >
        {message.role === "assistant" && message.error && isLast ? (
          <ActionButton label="다시 시도" onClick={onRetry} testid="aku-retry">
            <IconRefresh size={13} />
          </ActionButton>
        ) : null}
        {message.role === "assistant" && !message.error && message.text.trim() !== "" ? (
          <>
            <ActionButton label="복사" onClick={() => onCopy(message.text)} testid="aku-copy">
              <IconCopy size={13} />
            </ActionButton>
            {isLast ? (
              <ActionButton label="다시 생성" onClick={onRegenerate} testid="aku-regenerate">
                <IconRefresh size={13} />
              </ActionButton>
            ) : null}
          </>
        ) : null}
        {isUser ? (
          <ActionButton label="수정" onClick={() => onEdit(index)} testid="aku-edit">
            <IconPencil size={13} />
          </ActionButton>
        ) : null}
        <span className="text-[10px] text-[color:var(--text-soft)] tabular-nums px-0.5">
          {formatTime(message.at)}
        </span>
      </div>
    </div>
  );
}

export function MessageList({
  messages,
  streaming,
  onRegenerate,
  onRetry,
  onEdit,
  onCorrectIntent,
  undo,
}: {
  readonly messages: ReadonlyArray<AkuMessage>;
  readonly streaming: boolean;
  readonly onRegenerate: () => void;
  readonly onRetry: () => void;
  readonly onEdit: (index: number) => void;
  readonly onCorrectIntent: (plan: IntentPlan) => void;
  readonly undo: AkuHistoryController | undefined;
}): JSX.Element {
  const [, force] = useState(0);
  const onCopy = (text: string): void => {
    void navigator.clipboard?.writeText(text);
  };
  if (messages.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-6 text-[color:var(--text-soft)]">
        <AkuMascot variant="full" className="w-16 h-16" />
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
    <div
      className="flex flex-col gap-3 py-1"
      data-aku-transcript
      // Re-evaluate turn-undo enabled-state when the panel is interacted with.
      onPointerEnter={() => force((n) => n + 1)}
    >
      {messages.map((m, i) => (
        <MessageBubble
          // biome-ignore lint/suspicious/noArrayIndexKey: transcript is append-only; index is stable + is the editFrom key
          key={i}
          message={m}
          index={i}
          streaming={streaming && i === lastIdx && m.role === "assistant"}
          isLast={i === lastIdx}
          onCopy={onCopy}
          onRegenerate={onRegenerate}
          onRetry={onRetry}
          onEdit={onEdit}
          onCorrectIntent={onCorrectIntent}
          undo={undo}
        />
      ))}
    </div>
  );
}
