import {
  forwardRef,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "../cn.js";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly errorText?: ReactNode;
}

/** Labelled text/number input. Uses native <input> for IME-correctness;
 *  the wrapper carries the aurora-glass surface tokens. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, errorText, className, id, ...rest },
  ref,
) {
  const inputId = id ?? `tf-${Math.random().toString(36).slice(2, 9)}`;
  const hintId = hint !== undefined ? `${inputId}-hint` : undefined;
  const errId = errorText !== undefined ? `${inputId}-err` : undefined;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label
        htmlFor={inputId}
        className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-soft)]"
      >
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-describedby={[hintId, errId].filter(Boolean).join(" ") || undefined}
        aria-invalid={errorText !== undefined ? true : undefined}
        className={cn(
          "h-10 px-3 rounded-[var(--radius-md)]",
          "bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)]",
          "text-[14px] text-[color:var(--text-strong)] placeholder:text-[color:var(--text-muted)]",
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

/** Field group — semantic <fieldset> with consistent spacing. */
export function FieldGroup({
  legend,
  description,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLFieldSetElement> & {
  readonly legend: ReactNode;
  readonly description?: ReactNode;
}) {
  return (
    <fieldset className={cn("grid gap-3", className)} {...rest}>
      <div>
        <legend className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-soft)] block">
          {legend}
        </legend>
        {description !== undefined ? (
          <div className="text-[12px] text-[color:var(--text-muted)] mt-1">{description}</div>
        ) : null}
      </div>
      {children}
    </fieldset>
  );
}
