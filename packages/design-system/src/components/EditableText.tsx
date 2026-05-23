import { motion, useReducedMotion } from "motion/react";
import {
  type FocusEvent,
  forwardRef,
  type KeyboardEvent,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { cn } from "../cn.js";

// EditableText — DR-design-003.
//
// Contract:
//   - Uncontrolled. The DOM's textContent is the source of truth between edits;
//     React state stores only the *initial* value and the editing flag.
//   - onCommit fires on blur AND on Enter (when multiline=false). The committed
//     text is the trimmed final textContent.
//   - Esc reverts to the initial value and blurs.
//   - aria-label is required (callers pass a descriptive label so screen readers
//     announce what is being edited).

export interface EditableTextHandle {
  /** Focus this field and place caret at end. */
  focusEnd: () => void;
}

interface EditableTextProps {
  readonly value: string;
  readonly placeholder?: string;
  readonly multiline?: boolean;
  readonly className?: string;
  readonly ariaLabel: string;
  readonly onCommit: (next: string) => void;
  /** Fired when user presses Enter in a single-line field. Receives the *committed* text. */
  readonly onEnterCommit?: (next: string) => void;
  /** Fired when user presses Backspace on an empty field — useful for "remove this bullet". */
  readonly onBackspaceEmpty?: () => void;
  readonly onFocus?: (e: FocusEvent<HTMLDivElement>) => void;
  readonly onBlur?: (e: FocusEvent<HTMLDivElement>) => void;
  /** Render-as element. Default span; use "div" for multiline blocks. */
  readonly as?: "span" | "div";
}

export const EditableText = forwardRef<EditableTextHandle, EditableTextProps>(
  (
    {
      value,
      placeholder,
      multiline = false,
      className,
      ariaLabel,
      onCommit,
      onEnterCommit,
      onBackspaceEmpty,
      onFocus,
      onBlur,
      as = "span",
    },
    ref,
  ) => {
    const elRef = useRef<HTMLDivElement | HTMLSpanElement | null>(null);
    const reduce = useReducedMotion();
    const [flash, setFlash] = useState(false);

    // Sync the DOM textContent when the *external* value changes and the field
    // is not currently focused. Don't overwrite while the user is typing.
    useEffect(() => {
      const el = elRef.current;
      if (el === null) return;
      if (document.activeElement === el) return;
      if (el.textContent !== value) el.textContent = value;
    }, [value]);

    useImperativeHandle(
      ref,
      () => ({
        focusEnd: () => {
          const el = elRef.current;
          if (el === null) return;
          el.focus();
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          const sel = window.getSelection();
          if (sel !== null) {
            sel.removeAllRanges();
            sel.addRange(range);
          }
        },
      }),
      [],
    );

    function commit(): string {
      const el = elRef.current;
      const next = (el?.textContent ?? "").trim();
      if (next !== value) {
        onCommit(next);
        if (!reduce) {
          setFlash(true);
          window.setTimeout(() => setFlash(false), 220);
        }
      }
      return next;
    }

    function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
      if (e.key === "Escape") {
        e.preventDefault();
        const el = elRef.current;
        if (el !== null) el.textContent = value;
        el?.blur();
        return;
      }
      if (e.key === "Enter" && !multiline) {
        e.preventDefault();
        const committed = commit();
        onEnterCommit?.(committed);
        return;
      }
      if (e.key === "Backspace") {
        const el = elRef.current;
        if (el !== null && (el.textContent ?? "").length === 0) {
          e.preventDefault();
          onBackspaceEmpty?.();
        }
      }
    }

    function handleBlur(e: FocusEvent<HTMLDivElement>): void {
      commit();
      onBlur?.(e);
    }

    const Comp = (as === "div" ? motion.div : motion.span) as typeof motion.div;
    const flashProps = flash
      ? {
          animate: { opacity: [1, 0.55, 1] },
          transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
        }
      : {};

    return (
      <Comp
        // contentEditable plus suppressContentEditableWarning because we deliberately
        // sidestep React's reconciliation for the text node.
        contentEditable
        suppressContentEditableWarning
        ref={(el) => {
          elRef.current = el as HTMLDivElement | HTMLSpanElement | null;
        }}
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline={multiline}
        data-placeholder={placeholder}
        spellCheck={false}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={handleBlur}
        {...flashProps}
        className={cn(
          "outline-none rounded-[var(--radius-sm)] -mx-1 px-1",
          "hover:bg-[color:var(--surface-1)]",
          "focus-visible:bg-[color:var(--surface-1)]",
          "focus-visible:shadow-[var(--focus-ring)]",
          "transition-colors duration-[var(--motion-quick)]",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-[color:var(--text-muted)]",
          "cursor-text",
          className,
        )}
      >
        {value}
      </Comp>
    );
  },
);

EditableText.displayName = "EditableText";
