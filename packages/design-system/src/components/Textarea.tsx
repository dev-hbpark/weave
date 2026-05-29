import { forwardRef, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "../cn.js";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Optional visible label. Omit for placeholder-only fields (e.g. a chat
   *  composer) — the host should then supply `aria-label` directly. */
  readonly label?: ReactNode;
  readonly hint?: ReactNode;
  readonly errorText?: ReactNode;
}

/** Multiline text input — the `<textarea>` companion to {@link TextField}.
 *  Native element for IME-correctness; the surface carries the same aurora-
 *  glass tokens as TextField. Height is host-controlled via `rows` (or an
 *  auto-grow wrapper); the field itself does not user-resize. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, errorText, className, id, ...rest },
  ref,
) {
  const fieldId = id ?? `ta-${Math.random().toString(36).slice(2, 9)}`;
  const hintId = hint !== undefined ? `${fieldId}-hint` : undefined;
  const errId = errorText !== undefined ? `${fieldId}-err` : undefined;
  return (
    <div className={cn("grid gap-1.5", className)}>
      {label !== undefined ? (
        <label
          htmlFor={fieldId}
          className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-soft)]"
        >
          {label}
        </label>
      ) : null}
      <textarea
        ref={ref}
        id={fieldId}
        aria-describedby={[hintId, errId].filter(Boolean).join(" ") || undefined}
        aria-invalid={errorText !== undefined ? true : undefined}
        className={cn(
          "px-3 py-2 rounded-[var(--radius-md)] resize-none",
          "bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)]",
          "text-[14px] leading-[1.5] text-[color:var(--text-strong)] placeholder:text-[color:var(--text-muted)]",
          "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
          "data-[invalid=true]:border-[color:var(--accent)]",
        )}
        {...rest}
      />
      {hint !== undefined ? (
        <div id={hintId} className="text-[12px] text-[color:var(--text-muted)]">
          {hint}
        </div>
      ) : null}
      {errorText !== undefined ? (
        <div id={errId} className="text-[12px] text-[color:var(--accent-strong)]">
          {errorText}
        </div>
      ) : null}
    </div>
  );
});
